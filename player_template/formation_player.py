from __future__ import annotations

from math import inf, isfinite
from typing import Any


LEGACY_FORMATION_MODE_ALIASES = {
    "corner_us": "corner_kick_us",
    "corner_them": "corner_kick_them",
    "penalty_us": "penalty_kick_us",
    "penalty_them": "penalty_kick_them",
}


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
) -> tuple[float, float] | None:
    del first_half

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

    robot_config = read_dict(read_dict(mode.get("robots")).get(str(player_number)))
    if robot_config is None:
        return None

    offset = read_dict(robot_config.get("offset"))
    if offset is None:
        return None

    offset_x = read_finite_number(offset.get("x"))
    offset_y = read_finite_number(offset.get("y"))
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
    min_x = resolve_number(robot_config, mode_defaults, defaults, "minX", -inf)
    max_x = resolve_number(robot_config, mode_defaults, defaults, "maxX", inf)
    min_y = resolve_number(robot_config, mode_defaults, defaults, "minY", -inf)
    max_y = resolve_number(robot_config, mode_defaults, defaults, "maxY", inf)

    position_x = min(max_x, max(min_x, ball_x * attraction_x + offset_x))
    position_y = min(max_y, max(min_y, ball_y * attraction_y + offset_y))
    if not (isfinite(position_x) and isfinite(position_y)):
        return None

    return position_x, position_y


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


def resolve_kicking_relation(
    kicking_team: int | None, own_team_number: int
) -> str:
    if kicking_team is None:
        return "none"
    if kicking_team == own_team_number:
        return "us"
    return "them"


def resolve_legacy_mode(
    game_phase: str, state: str, set_play: str, relation: str
) -> str:
    if game_phase == "timeout":
        return "timeout"

    if game_phase == "penalty_shoot_out":
        return "penalty_kick_them" if relation == "them" else "penalty_kick_us"

    if set_play != "none" and relation != "none":
        return f"{set_play}_{'us' if relation == 'us' else 'them'}"

    if set_play == "none" and state != "playing" and relation != "none":
        return "kickoff_us" if relation == "us" else "kickoff_them"

    return "normal_play"


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


def resolve_number(
    robot_config: dict[str, Any],
    mode_defaults: dict[str, Any] | None,
    defaults: dict[str, Any] | None,
    key: str,
    fallback: float,
) -> float:
    for source in (robot_config, mode_defaults, defaults):
        candidate = read_finite_number(source.get(key) if source else None)
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
