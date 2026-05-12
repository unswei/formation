from __future__ import annotations

import json
from math import inf, isfinite
from pathlib import Path
from typing import Any, Literal, TypedDict

FormationMode = Literal[
    "normal_play",
    "kickoff_us",
    "kickoff_them",
    "direct_free_kick_us",
    "direct_free_kick_them",
    "indirect_free_kick_us",
    "indirect_free_kick_them",
    "throw_in_us",
    "throw_in_them",
    "goal_kick_us",
    "goal_kick_them",
    "corner_kick_us",
    "corner_kick_them",
    "penalty_kick_us",
    "penalty_kick_them",
    "timeout",
]

TeamPerspective = Literal["us", "them", "unknown"]
FieldDimensions = dict[str, float]

LEGACY_FORMATION_MODE_ALIASES: dict[str, FormationMode] = {
    "corner_us": "corner_kick_us",
    "corner_them": "corner_kick_them",
    "penalty_us": "penalty_kick_us",
    "penalty_them": "penalty_kick_them",
}

VALID_FORMATION_MODES: set[str] = {
    "normal_play",
    "kickoff_us",
    "kickoff_them",
    "direct_free_kick_us",
    "direct_free_kick_them",
    "indirect_free_kick_us",
    "indirect_free_kick_them",
    "throw_in_us",
    "throw_in_them",
    "goal_kick_us",
    "goal_kick_them",
    "corner_kick_us",
    "corner_kick_them",
    "penalty_kick_us",
    "penalty_kick_them",
    "timeout",
}


class AdvertisedGameControllerState(TypedDict):
    gamePhase: str
    state: str
    setPlay: str
    firstHalf: bool
    stopped: bool
    ownTeamNumber: int
    kickingTeam: int | None


def compute_positions(
    *,
    game_controller_state: AdvertisedGameControllerState,
    advertised_state_mode: str,
    legacy_mode: str,
    ball: dict[str, float],
    robot_ids: list[int],
    active_players: int,
    formation: dict[str, Any],
    field_dimensions: FieldDimensions | None = None,
    field_size: str | None = None,
    field_sizes_path: str | Path | None = None,
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    warnings: list[str] = []

    resolved_field_dimensions = load_field_dimensions(
        field_dimensions=field_dimensions,
        field_size=field_size,
        field_sizes_path=field_sizes_path,
        warnings=warnings,
    )

    resolved_robot_ids = resolve_robot_ids(robot_ids, active_players, warnings)
    resolved_mode, resolved_mode_name = resolve_mode_config(
        formation,
        advertised_state_mode=advertised_state_mode,
        legacy_mode=legacy_mode,
        warnings=warnings,
    )

    positions: dict[str, dict[str, Any]] = {}
    for robot_id in resolved_robot_ids:
        positions[str(robot_id)] = compute_robot_position(
            robot_id=robot_id,
            mode_name=resolved_mode_name,
            mode_config=resolved_mode,
            ball=ball,
            formation=formation,
            field_dimensions=resolved_field_dimensions,
        )

    warn_set_play_spacing_violations(
        positions=positions,
        ball=ball,
        field_dimensions=resolved_field_dimensions,
        legacy_mode=legacy_mode,
        warnings=warnings,
    )

    return positions, warnings


def warn_set_play_spacing_violations(
    *,
    positions: dict[str, dict[str, Any]],
    ball: dict[str, float],
    field_dimensions: FieldDimensions | None,
    legacy_mode: str,
    warnings: list[str],
) -> None:
    if legacy_mode != "throw_in_them":
        return

    if field_dimensions is None:
        return

    centre_circle_diameter = read_finite_number(
        field_dimensions.get("centreCircleDiameter")
    )

    if centre_circle_diameter is None:
        return

    minimum_distance = centre_circle_diameter / 2.0

    for robot_id, position in positions.items():
        if not position.get("ok"):
            continue

        x = read_finite_number(position.get("x"))
        y = read_finite_number(position.get("y"))

        if x is None or y is None:
            continue

        dx = x - ball["x"]
        dy = y - ball["y"]

        distance = (dx * dx + dy * dy) ** 0.5

        if distance < minimum_distance:
            warnings.append(
                f'Robot {robot_id} is only {distance:.2f}m from the ball during '
                f'"throw_in_them"; recommended minimum is {minimum_distance:.2f}m.'
            )


def load_field_dimensions(
    *,
    field_dimensions: FieldDimensions | None = None,
    field_size: str | None = None,
    field_sizes_path: str | Path | None = None,
    warnings: list[str] | None = None,
) -> FieldDimensions | None:
    if field_dimensions is not None:
        return normalise_field_dimensions(field_dimensions)

    if field_size is None and field_sizes_path is None:
        return None

    if field_size is None:
        append_warning(warnings, "field_sizes_path was provided but field_size was missing.")
        return None

    if field_sizes_path is None:
        append_warning(warnings, "field_size was provided but field_sizes_path was missing.")
        return None

    try:
        with Path(field_sizes_path).open("r", encoding="utf-8") as file:
            table = json.load(file)
    except OSError as exc:
        append_warning(warnings, f'Could not read field sizes file "{field_sizes_path}": {exc}')
        return None
    except json.JSONDecodeError as exc:
        append_warning(warnings, f'Could not parse field sizes file "{field_sizes_path}": {exc}')
        return None

    if not isinstance(table, dict):
        append_warning(warnings, "Field sizes file must contain a JSON object.")
        return None

    selected = table.get(field_size)
    if not isinstance(selected, dict):
        append_warning(warnings, f'Field size "{field_size}" was not found.')
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


def resolve_robot_ids(robot_ids: list[int], active_players: int, warnings: list[str]) -> list[int]:
    source_ids = robot_ids if robot_ids else list(range(1, active_players + 1))

    seen: set[int] = set()
    resolved: list[int] = []

    for robot_id in source_ids:
        if robot_id in seen:
            continue
        if 1 <= robot_id <= 11:
            seen.add(robot_id)
            resolved.append(robot_id)
        else:
            warnings.append(f"Ignoring invalid robot ID {robot_id}.")

    return sorted(resolved)


def resolve_formation_mode(
    game_controller_state: AdvertisedGameControllerState,
) -> tuple[str, FormationMode]:
    game_phase = game_controller_state["gamePhase"]
    state = game_controller_state["state"]
    set_play = game_controller_state["setPlay"]
    perspective = resolve_team_perspective(game_controller_state)

    if game_phase == "timeout":
        return build_advertised_state_mode(game_controller_state, perspective), "timeout"

    if game_phase == "penalty_shoot_out":
        return (
            build_advertised_state_mode(game_controller_state, perspective),
            "penalty_kick_them" if perspective == "them" else "penalty_kick_us",
        )

    set_play_mode = resolve_set_play_mode(set_play, perspective)
    if set_play_mode is not None:
        return build_advertised_state_mode(game_controller_state, perspective), set_play_mode

    if set_play == "none" and state != "playing" and perspective != "unknown":
        return (
            build_advertised_state_mode(game_controller_state, perspective),
            "kickoff_us" if perspective == "us" else "kickoff_them",
        )

    return build_advertised_state_mode(game_controller_state, perspective), "normal_play"


def resolve_team_perspective(game_controller_state: AdvertisedGameControllerState) -> TeamPerspective:
    kicking_team = game_controller_state["kickingTeam"]
    if kicking_team is None:
        return "unknown"

    return "us" if kicking_team == game_controller_state["ownTeamNumber"] else "them"


def resolve_set_play_mode(set_play: str, perspective: TeamPerspective) -> FormationMode | None:
    if set_play == "none" or perspective == "unknown":
        return None

    suffix = "us" if perspective == "us" else "them"

    mapping: dict[str, FormationMode] = {
        "direct_free_kick": f"direct_free_kick_{suffix}",  # type: ignore[dict-item]
        "indirect_free_kick": f"indirect_free_kick_{suffix}",  # type: ignore[dict-item]
        "penalty_kick": f"penalty_kick_{suffix}",  # type: ignore[dict-item]
        "throw_in": f"throw_in_{suffix}",  # type: ignore[dict-item]
        "goal_kick": f"goal_kick_{suffix}",  # type: ignore[dict-item]
        "corner_kick": f"corner_kick_{suffix}",  # type: ignore[dict-item]
    }

    return mapping.get(set_play)


def resolve_mode_config(
    formation: dict[str, Any],
    *,
    advertised_state_mode: str,
    legacy_mode: str,
    warnings: list[str],
) -> tuple[dict[str, Any] | None, str]:
    modes = read_dict(formation.get("modes"))

    if modes is None:
        warnings.append('Formation config is missing "modes"; every robot is unknown.')
        return None, "normal_play"

    requested_mode = read_dict(modes.get(advertised_state_mode))
    if requested_mode is not None:
        return requested_mode, advertised_state_mode

    requested_mode = read_dict(modes.get(legacy_mode))
    if requested_mode is not None:
        return requested_mode, legacy_mode

    alias = LEGACY_FORMATION_MODE_ALIASES.get(legacy_mode)
    if alias is not None:
        requested_mode = read_dict(modes.get(alias))
        if requested_mode is not None:
            return requested_mode, alias

    if legacy_mode not in VALID_FORMATION_MODES:
        warnings.append(f'Play mode "{legacy_mode}" is not recognised.')

    fallback_mode = read_dict(modes.get("normal_play"))
    if fallback_mode is not None:
        if legacy_mode != "normal_play":
            warnings.append(
                f'Modes "{advertised_state_mode}" and "{legacy_mode}" are missing; falling back to "normal_play".'
            )
        return fallback_mode, "normal_play"

    return None, advertised_state_mode


def build_advertised_state_mode(
    game_controller_state: AdvertisedGameControllerState,
    perspective: TeamPerspective,
) -> str:
    return "__".join(
        [
            "advertised",
            f'phase_{game_controller_state["gamePhase"]}',
            f'state_{game_controller_state["state"]}',
            f'set_play_{game_controller_state["setPlay"]}',
            f"kicking_{perspective}",
        ]
    )


def compute_robot_position(
    *,
    robot_id: int,
    mode_name: str,
    mode_config: dict[str, Any] | None,
    ball: dict[str, float],
    formation: dict[str, Any],
    field_dimensions: FieldDimensions | None,
) -> dict[str, Any]:
    if mode_config is None:
        return unknown_position(f"missing config for robot {robot_id} in {mode_name}")

    robots = read_dict(mode_config.get("robots"))
    robot_config = read_dict(robots.get(str(robot_id)) if robots is not None else None)
    if robot_config is None:
        return unknown_position(f"missing config for robot {robot_id} in {mode_name}")

    offset = read_dict(robot_config.get("offset"))
    offset_x = compute_field_position(offset.get("x") if offset is not None else None, field_dimensions)
    offset_y = compute_field_position(offset.get("y") if offset is not None else None, field_dimensions)

    if offset_x is None or offset_y is None:
        return unknown_position(f"invalid offset for robot {robot_id} in {mode_name}")

    global_defaults = read_dict(formation.get("defaults"))
    mode_defaults = read_dict(mode_config.get("defaults"))

    attraction_x = resolve_attraction_value(
        axis="x",
        robot_config=robot_config,
        mode_defaults=mode_defaults,
        global_defaults=global_defaults,
    )
    attraction_y = resolve_attraction_value(
        axis="y",
        robot_config=robot_config,
        mode_defaults=mode_defaults,
        global_defaults=global_defaults,
    )

    min_x = resolve_position_limit(robot_config, mode_defaults, global_defaults, "minX", -inf, field_dimensions)
    max_x = resolve_position_limit(robot_config, mode_defaults, global_defaults, "maxX", inf, field_dimensions)
    min_y = resolve_position_limit(robot_config, mode_defaults, global_defaults, "minY", -inf, field_dimensions)
    max_y = resolve_position_limit(robot_config, mode_defaults, global_defaults, "maxY", inf, field_dimensions)

    position_x = min(max_x, max(min_x, ball["x"] * attraction_x + offset_x))
    position_y = min(max_y, max(min_y, ball["y"] * attraction_y + offset_y))

    if not (isfinite(position_x) and isfinite(position_y)):
        return unknown_position(f"invalid result for robot {robot_id} in {mode_name}")

    return {"ok": True, "x": position_x, "y": position_y}


def resolve_attraction_value(
    *,
    axis: str,
    robot_config: dict[str, Any],
    mode_defaults: dict[str, Any] | None,
    global_defaults: dict[str, Any] | None,
) -> float:
    for candidate in (
        read_nested_number(robot_config, "attraction", axis),
        read_nested_number(mode_defaults, "attraction", axis),
        read_nested_number(global_defaults, "attraction", axis),
    ):
        if candidate is not None:
            return candidate

    return 1.0


def resolve_position_limit(
    robot_config: dict[str, Any],
    mode_defaults: dict[str, Any] | None,
    global_defaults: dict[str, Any] | None,
    key: str,
    fallback: float,
    field_dimensions: FieldDimensions | None,
) -> float:
    for source in (robot_config, mode_defaults, global_defaults):
        if source is None:
            continue
        candidate = compute_field_position(source.get(key), field_dimensions)
        if candidate is not None:
            return candidate

    return fallback


def read_nested_number(mapping: dict[str, Any] | None, parent_key: str, key: str) -> float | None:
    parent = read_dict(mapping.get(parent_key) if mapping else None)
    return read_finite_number(parent.get(key) if parent else None)


def read_dict(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def read_finite_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and isfinite(value):
        return float(value)
    return None


def unknown_position(reason: str) -> dict[str, Any]:
    return {"ok": False, "reason": reason}


def append_warning(warnings: list[str] | None, message: str) -> None:
    if warnings is not None:
        warnings.append(message)