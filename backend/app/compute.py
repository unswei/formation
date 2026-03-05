from __future__ import annotations

from math import inf, isfinite
from typing import Any

VALID_PLAY_MODES = {
    "normal_play",
    "kickoff_us",
    "kickoff_them",
    "goal_kick_us",
    "goal_kick_them",
    "corner_us",
    "corner_them",
    "penalty_us",
    "penalty_them",
}


def compute_positions(
    *,
    play_mode: str,
    ball: dict[str, float],
    robot_ids: list[int],
    active_players: int,
    formation: dict[str, Any],
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    warnings: list[str] = []
    resolved_robot_ids = resolve_robot_ids(robot_ids, active_players, warnings)
    resolved_mode, resolved_mode_name = resolve_mode_config(
        formation,
        play_mode,
        warnings,
    )

    positions: dict[str, dict[str, Any]] = {}
    for robot_id in resolved_robot_ids:
        positions[str(robot_id)] = compute_robot_position(
            robot_id=robot_id,
            mode_name=resolved_mode_name,
            mode_config=resolved_mode,
            ball=ball,
            formation=formation,
        )

    return positions, warnings


def resolve_robot_ids(
    robot_ids: list[int], active_players: int, warnings: list[str]
) -> list[int]:
    if robot_ids:
        source_ids = robot_ids
    else:
        source_ids = list(range(1, active_players + 1))

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


def resolve_mode_config(
    formation: dict[str, Any],
    play_mode: str,
    warnings: list[str],
) -> tuple[dict[str, Any] | None, str]:
    modes = read_dict(formation.get("modes"))

    if modes is None:
        warnings.append('Formation config is missing "modes"; every robot is unknown.')
        return None, "normal_play"

    requested_mode = read_dict(modes.get(play_mode))
    if requested_mode is not None:
        return requested_mode, play_mode

    if play_mode not in VALID_PLAY_MODES:
        warnings.append(f'Play mode "{play_mode}" is not recognised.')

    fallback_mode = read_dict(modes.get("normal_play"))
    if fallback_mode is not None:
        if play_mode != "normal_play":
            warnings.append(
                f'Play mode "{play_mode}" is missing; falling back to "normal_play".'
            )
        return fallback_mode, "normal_play"

    return None, play_mode


def compute_robot_position(
    *,
    robot_id: int,
    mode_name: str,
    mode_config: dict[str, Any] | None,
    ball: dict[str, float],
    formation: dict[str, Any],
) -> dict[str, Any]:
    if mode_config is None:
        return unknown_position(f"missing config for robot {robot_id} in {mode_name}")

    robots = read_dict(mode_config.get("robots"))
    robot_config = read_dict(robots.get(str(robot_id)) if robots is not None else None)
    if robot_config is None:
        return unknown_position(f"missing config for robot {robot_id} in {mode_name}")

    offset = read_dict(robot_config.get("offset"))
    offset_x = read_finite_number(offset.get("x") if offset is not None else None)
    offset_y = read_finite_number(offset.get("y") if offset is not None else None)
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
    min_x = resolve_min_x(
        robot_config=robot_config,
        mode_defaults=mode_defaults,
        global_defaults=global_defaults,
    )

    position_x = max(min_x, ball["x"] * attraction_x + offset_x)
    position_y = ball["y"] * attraction_y + offset_y

    if not (isfinite(position_x) and isfinite(position_y)):
        return unknown_position(f"invalid result for robot {robot_id} in {mode_name}")

    return {
        "ok": True,
        "x": position_x,
        "y": position_y,
    }


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


def resolve_min_x(
    *,
    robot_config: dict[str, Any],
    mode_defaults: dict[str, Any] | None,
    global_defaults: dict[str, Any] | None,
) -> float:
    for candidate in (
        read_finite_number(robot_config.get("minX")),
        read_finite_number(mode_defaults.get("minX") if mode_defaults else None),
        read_finite_number(global_defaults.get("minX") if global_defaults else None),
    ):
        if candidate is not None:
            return candidate

    return -inf


def read_nested_number(
    mapping: dict[str, Any] | None, parent_key: str, key: str
) -> float | None:
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
    return {
        "ok": False,
        "reason": reason,
    }
