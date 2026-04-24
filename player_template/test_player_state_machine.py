from __future__ import annotations

import unittest

from player_state_machine import (
    KickingRelation,
    PlayerGameEvent,
    PlayerGameSnapshot,
    PlayerGameStateMachine,
)


class PlayerGameStateMachineTests(unittest.TestCase):
    def test_first_packet_reports_state_and_kickoff_context(self) -> None:
        transition = PlayerGameStateMachine().update(
            PlayerGameSnapshot(
                game_phase="normal",
                state="ready",
                set_play="none",
                kicking_team=7,
                own_team_number=7,
                first_half=True,
                packet_number=1,
            )
        )

        self.assertEqual(transition.current.kicking_relation, KickingRelation.US)
        self.assertTrue(transition.current.is_kickoff_context)
        self.assertIn(PlayerGameEvent.FIRST_PACKET, transition.events)
        self.assertIn(PlayerGameEvent.ENTERED_READY, transition.events)
        self.assertIn(PlayerGameEvent.KICKOFF_CONTEXT_STARTED, transition.events)

    def test_set_play_lifecycle_is_observable(self) -> None:
        machine = PlayerGameStateMachine()
        machine.update(
            PlayerGameSnapshot(
                game_phase="normal",
                state="playing",
                set_play="none",
                kicking_team=None,
                own_team_number=7,
                first_half=True,
                packet_number=1,
            )
        )
        started = machine.update(
            PlayerGameSnapshot(
                game_phase="normal",
                state="playing",
                set_play="goal_kick",
                kicking_team=8,
                own_team_number=7,
                first_half=True,
                packet_number=2,
            )
        )
        finished = machine.update(
            PlayerGameSnapshot(
                game_phase="normal",
                state="playing",
                set_play="none",
                kicking_team=None,
                own_team_number=7,
                first_half=True,
                packet_number=3,
            )
        )

        self.assertIn(PlayerGameEvent.SET_PLAY_STARTED, started.events)
        self.assertEqual(started.current.kicking_relation, KickingRelation.THEM)
        self.assertIn(PlayerGameEvent.SET_PLAY_FINISHED, finished.events)

    def test_exact_formation_key_matches_tool_convention(self) -> None:
        snapshot = PlayerGameSnapshot(
            game_phase="normal",
            state="playing",
            set_play="corner_kick",
            kicking_team=None,
            own_team_number=7,
            first_half=False,
        )

        self.assertEqual(
            snapshot.exact_formation_key,
            "advertised__phase_normal__state_playing__set_play_corner_kick__kicking_none",
        )


if __name__ == "__main__":
    unittest.main()
