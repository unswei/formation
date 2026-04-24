from __future__ import annotations

import unittest

from formation_player import compute_player_position


class FormationPlayerTests(unittest.TestCase):
    def test_exact_key_precedes_legacy_mode(self) -> None:
        formation = {
            "version": 1,
            "modes": {
                "normal_play": {
                    "robots": {"1": {"offset": {"x": 0.0, "y": 0.0}}}
                },
                "goal_kick_us": {
                    "robots": {"1": {"offset": {"x": 1.0, "y": 1.0}}}
                },
                "advertised__phase_normal__state_playing__set_play_goal_kick__kicking_us": {
                    "robots": {"1": {"offset": {"x": 2.0, "y": 2.0}}}
                },
            },
        }

        self.assertEqual(
            compute_player_position(
                formation,
                1,
                "normal",
                "playing",
                "goal_kick",
                7,
                7,
                True,
                (0.0, 0.0),
            ),
            (2.0, 2.0),
        )

    def test_kicking_none_exact_key(self) -> None:
        formation = {
            "version": 1,
            "modes": {
                "advertised__phase_normal__state_ready__set_play_none__kicking_none": {
                    "robots": {"1": {"offset": {"x": -1.0, "y": 0.5}}}
                }
            },
        }

        self.assertEqual(
            compute_player_position(
                formation,
                1,
                "normal",
                "ready",
                "none",
                None,
                7,
                True,
                (0.0, 0.0),
            ),
            (-1.0, 0.5),
        )

    def test_returns_none_for_missing_player(self) -> None:
        formation = {
            "version": 1,
            "modes": {"normal_play": {"robots": {}}},
        }

        self.assertIsNone(
            compute_player_position(
                formation,
                1,
                "normal",
                "playing",
                "none",
                None,
                7,
                True,
                (0.0, 0.0),
            )
        )

    def test_clamps_position_to_limits(self) -> None:
        formation = {
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
        }

        self.assertEqual(
            compute_player_position(
                formation,
                1,
                "normal",
                "playing",
                "none",
                None,
                7,
                True,
                (5.0, 2.0),
            ),
            (1.0, 0.5),
        )


if __name__ == "__main__":
    unittest.main()
