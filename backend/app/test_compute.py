from __future__ import annotations

import unittest

from app.compute import compute_positions


class ComputePositionsTests(unittest.TestCase):
    def test_exact_key_precedes_legacy_mode(self) -> None:
        positions, warnings = compute_positions(
            game_controller_state={
                "gamePhase": "normal",
                "state": "playing",
                "setPlay": "goal_kick",
                "firstHalf": True,
                "stopped": False,
                "ownTeamNumber": 7,
                "kickingTeam": 7,
            },
            advertised_state_mode="advertised__phase_normal__state_playing__set_play_goal_kick__kicking_us",
            legacy_mode="goal_kick_us",
            ball={"x": 0.0, "y": 0.0},
            robot_ids=[1],
            active_players=1,
            formation={
                "version": 1,
                "modes": {
                    "goal_kick_us": {
                        "robots": {"1": {"offset": {"x": 1.0, "y": 1.0}}}
                    },
                    "advertised__phase_normal__state_playing__set_play_goal_kick__kicking_us": {
                        "robots": {"1": {"offset": {"x": 2.0, "y": 2.0}}}
                    },
                },
            },
        )

        self.assertEqual(warnings, [])
        self.assertEqual(positions["1"], {"ok": True, "x": 2.0, "y": 2.0})

    def test_max_axis_limits_clamp_position(self) -> None:
        positions, _warnings = compute_positions(
            game_controller_state={
                "gamePhase": "normal",
                "state": "playing",
                "setPlay": "none",
                "firstHalf": True,
                "stopped": False,
                "ownTeamNumber": 7,
                "kickingTeam": None,
            },
            advertised_state_mode="advertised__phase_normal__state_playing__set_play_none__kicking_none",
            legacy_mode="normal_play",
            ball={"x": 10.0, "y": 2.0},
            robot_ids=[1],
            active_players=1,
            formation={
                "version": 1,
                "modes": {
                    "normal_play": {
                        "robots": {
                            "1": {
                                "offset": {"x": 0.0, "y": 0.0},
                                "attraction": {"x": 1.0, "y": 1.0},
                                "minX": -1.0,
                                "maxX": 1.0,
                                "minY": -0.5,
                                "maxY": 0.5,
                            }
                        }
                    }
                },
            },
        )

        self.assertEqual(positions["1"], {"ok": True, "x": 1.0, "y": 0.5})


if __name__ == "__main__":
    unittest.main()
