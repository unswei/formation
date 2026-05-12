from __future__ import annotations

import json
from math import inf, isfinite
from pathlib import Path
from typing import Any

LEGACY_FORMATION_MODE_ALIASES = {
    "corner_us": "corner_kick_us",
    "corner_them": "corner_kick_them",
    "penalty_us": "penalty_kick_us",
    "penalty_them": "penalty_kick_them",
}

FieldDimensions = dict[str, float]


def compute_player_position(
    formation: dict[str, Any],
    player_number: int,
    game_phase: str,
    state: str,
    set_play: str,
    kicking_team: int | None,
    own_team_number: int,
    first_half: bool,
    ball: tuple[float, float],
    field_dimensions: FieldDimensions | None = None,
    field_size: str | None = None,
    field_sizes_path: str | Path | None = None,
) -> tuple[float, float] | None:
    del first_half

    resolved_field_dimensions = load_field_dimensions(
        field_dimensions=field_dimensions,
        field_size=field_size,
        field_sizes_path=field_sizes_path,
    )

    mode = resolve_mode(
        formation=formation,
        game_phase=game_phase,
        state=state,
        set_play=set_play,
        kicking_team=kicking_team,
        own_team_number=own_team_number,
    )
    if mode is None:
        return None

    robots = read_dict(mode.get("robots"))
    robot_config = read_dict(robots.get(str(player_number)) if robots is not None else None)
    if robot_config is None:
        return None

    offset = read_dict(robot_config.get("offset"))
    if offset is None:
        return None

    offset_x = compute_field_position(offset.get("x"), resolved_field_dimensions)
    offset_y = compute_field_position(offset.get("y"), resolved_field_dimensions)
    if offset_x is None or offset_y is None:
        return None

    defaults = read_dict(formation.get("defaults"))
    mode_defaults = read_dict(mode.get("defaults"))

    ball_x, ball_y = ball

    attraction_x = resolve_nested_number(
        robot_config, mode_defaults, defaults, "attraction", "x", 1.0
    )
    attraction_y = resolve_nested_number(
        robot_config, mode_defaults, defaults, "attraction", "y", 1.0
    )

    min_x = resolve_position_limit(
        robot_config, mode_defaults, defaults, "minX", -inf, resolved_field_dimensions
    )
    max_x = resolve_position_limit(
        robot_config, mode_defaults, defaults, "maxX", inf, resolved_field_dimensions
    )
    min_y = resolve_position_limit(
        robot_config, mode_defaults, defaults, "minY", -inf, resolved_field_dimensions
    )
    max_y = resolve_position_limit(
        robot_config, mode_defaults, defaults, "maxY", inf, resolved_field_dimensions
    )

    position_x = min(max_x, max(min_x, ball_x * attraction_x + offset_x))
    position_y = min(max_y, max(min_y, ball_y * attraction_y + offset_y))

    if not (isfinite(position_x) and isfinite(position_y)):
        return None

    return position_x, position_y


def load_field_dimensions(
    *,
    field_dimensions: FieldDimensions | None = None,
    field_size: str | None = None,
    field_sizes_path: str | Path | None = None,
) -> FieldDimensions | None:
    if field_dimensions is not None:
        return normalise_field_dimensions(field_dimensions)

    if field_size is None or field_sizes_path is None:
        return None

    try:
        with Path(field_sizes_path).open("r", encoding="utf-8") as file:
            table = json.load(file)
    except (OSError, json.JSONDecodeError):
        return None

    if not isinstance(table, dict):
        return None

    selected = table.get(field_size)
    if not isinstance(selected, dict):
        return None

    return normalise_field_dimensions(selected)


def normalise_field_dimensions(value: dict[str, Any]) -> FieldDimensions | None:
    result: FieldDimensions = {}
    for key, raw in value.items():
        number = read_finite_number(raw)
        if number is not None:
            result[key] = number
    return result


def compute_field_position(
    value: Any,
    field_dimensions: FieldDimensions | None,
    *,
    fallback: float | None = None,
) -> float | None:
    resolved = resolve_measure(value, field_dimensions)
    return resolved if resolved is not None else fallback


def resolve_measure(value: Any, field_dimensions: FieldDimensions | None) -> float | None:
    number = read_finite_number(value)
    if number is not None:
        return number

    spec = read_dict(value)
    if spec is None:
        return None

    position_name = spec.get("position")
    if isinstance(position_name, str):
        base = resolve_named_position(position_name, field_dimensions)
        if base is None:
            return None
        offset = read_finite_number(spec.get("offset"))
        return base + (offset if offset is not None else 0.0)

    op = spec.get("op")
    if isinstance(op, str):
        terms = spec.get("terms")
        if not isinstance(terms, list):
            return None

        resolved_terms = [resolve_measure(term, field_dimensions) for term in terms]
        if any(term is None for term in resolved_terms):
            return None

        numbers = [term for term in resolved_terms if term is not None]

        if op == "add":
            return sum(numbers)

        if op == "subtract" and numbers:
            result = numbers[0]
            for number in numbers[1:]:
                result -= number
            return result

        if op == "multiply":
            result = 1.0
            for number in numbers:
                result *= number
            return result

        if op == "negate" and len(numbers) == 1:
            return -numbers[0]

        return None

    if field_dimensions is None:
        return None

    key = spec.get("field")
    if not isinstance(key, str):
        key = spec.get("feature")

    if not isinstance(key, str):
        return None

    base = read_finite_number(field_dimensions.get(key))
    if base is None:
        return None

    scale = read_finite_number(spec.get("scale"))
    offset = read_finite_number(spec.get("offset"))

    result = base * (scale if scale is not None else 1.0) + (offset if offset is not None else 0.0)
    return result if isfinite(result) else None


def resolve_named_position(name: str, field_dimensions: FieldDimensions | None) -> float | None:
    if field_dimensions is None:
        return None

    length = read_finite_number(field_dimensions.get("length"))
    width = read_finite_number(field_dimensions.get("width"))
    goal_area_length = read_finite_number(field_dimensions.get("goalAreaLength"))
    goal_area_width = read_finite_number(field_dimensions.get("goalAreaWidth"))
    penalty_area_length = read_finite_number(field_dimensions.get("penaltyAreaLength"))
    penalty_area_width = read_finite_number(field_dimensions.get("penaltyAreaWidth"))
    penalty_mark_distance = read_finite_number(field_dimensions.get("penaltyMarkDistance"))

    if length is None or width is None:
        return None

    min_x = -length / 2
    max_x = length / 2
    min_y = -width / 2
    max_y = width / 2

    positions: dict[str, float] = {
        "centre_x": 0.0,
        "center_x": 0.0,
        "centre_y": 0.0,
        "center_y": 0.0,
        "field_min_x": min_x,
        "field_max_x": max_x,
        "field_min_y": min_y,
        "field_max_y": max_y,
    }

    if goal_area_length is not None:
        positions.update(
            {
                "left_goal_area_min_x": min_x,
                "left_goal_area_max_x": min_x + goal_area_length,
                "right_goal_area_min_x": max_x - goal_area_length,
                "right_goal_area_max_x": max_x,
            }
        )

    if goal_area_width is not None:
        positions.update(
            {
                "goal_area_min_y": -goal_area_width / 2,
                "goal_area_max_y": goal_area_width / 2,
            }
        )

    if penalty_area_length is not None:
        positions.update(
            {
                "left_penalty_area_min_x": min_x,
                "left_penalty_area_max_x": min_x + penalty_area_length,
                "right_penalty_area_min_x": max_x - penalty_area_length,
                "right_penalty_area_max_x": max_x,
            }
        )

    if penalty_area_width is not None:
        positions.update(
            {
                "penalty_area_min_y": -penalty_area_width / 2,
                "penalty_area_max_y": penalty_area_width / 2,
            }
        )

    if penalty_mark_distance is not None:
        positions.update(
            {
                "left_penalty_mark_x": min_x + penalty_mark_distance,
                "right_penalty_mark_x": max_x - penalty_mark_distance,
            }
        )

    return positions.get(name)


def resolve_mode(
    *,
    formation: dict[str, Any],
    game_phase: str,
    state: str,
    set_play: str,
    kicking_team: int | None,
    own_team_number: int,
) -> dict[str, Any] | None:
    modes = read_dict(formation.get("modes"))
    if modes is None:
        return None

    relation = resolve_kicking_relation(kicking_team, own_team_number)
    advertised_mode = "__".join(
        [
            "advertised",
            f"phase_{game_phase}",
            f"state_{state}",
            f"set_play_{set_play}",
            f"kicking_{relation}",
        ]
    )
    legacy_mode = resolve_legacy_mode(game_phase, state, set_play, relation)

    for mode_name in (advertised_mode, legacy_mode, "normal_play"):
        mode = read_dict(modes.get(mode_name))
        if mode is not None:
            return mode

        alias = LEGACY_FORMATION_MODE_ALIASES.get(mode_name)
        if alias is not None:
            mode = read_dict(modes.get(alias))
            if mode is not None:
                return mode

    return None


def resolve_kicking_relation(kicking_team: int | None, own_team_number: int) -> str:
    if kicking_team is None:
        return "none"
    if kicking_team == own_team_number:
        return "us"
    return "them"


def resolve_legacy_mode(game_phase: str, state: str, set_play: str, relation: str) -> str:
    if game_phase == "timeout":
        return "timeout"

    if game_phase == "penalty_shoot_out":
        return "penalty_kick_them" if relation == "them" else "penalty_kick_us"

    if set_play != "none" and relation != "none":
        return f"{set_play}_{'us' if relation == 'us' else 'them'}"

    if set_play == "none" and state != "playing" and relation != "none":
        return "kickoff_us" if relation == "us" else "kickoff_them"

    return "normal_play"


def resolve_position_limit(
    robot_config: dict[str, Any],
    mode_defaults: dict[str, Any] | None,
    defaults: dict[str, Any] | None,
    key: str,
    fallback: float,
    field_dimensions: FieldDimensions | None,
) -> float:
    for source in (robot_config, mode_defaults, defaults):
        if source is None:
            continue
        candidate = compute_field_position(source.get(key), field_dimensions)
        if candidate is not None:
            return candidate

    return fallback


def resolve_nested_number(
    robot_config: dict[str, Any],
    mode_defaults: dict[str, Any] | None,
    defaults: dict[str, Any] | None,
    parent_key: str,
    key: str,
    fallback: float,
) -> float:
    for source in (robot_config, mode_defaults, defaults):
        nested = read_dict(source.get(parent_key) if source else None)
        candidate = read_finite_number(nested.get(key) if nested else None)
        if candidate is not None:
            return candidate

    return fallback


def read_dict(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def read_finite_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and isfinite(value):
        return float(value)
    return None