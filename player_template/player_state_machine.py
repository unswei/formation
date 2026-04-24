from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable


class KickingRelation(str, Enum):
    NONE = "none"
    US = "us"
    THEM = "them"


class PlayerGameEvent(str, Enum):
    FIRST_PACKET = "first_packet"
    PACKET_ADVANCED = "packet_advanced"
    PACKET_REPEATED_OR_REWOUND = "packet_repeated_or_rewound"
    PHASE_CHANGED = "phase_changed"
    HALF_CHANGED = "half_changed"
    STATE_CHANGED = "state_changed"
    SET_PLAY_STARTED = "set_play_started"
    SET_PLAY_CHANGED = "set_play_changed"
    SET_PLAY_FINISHED = "set_play_finished"
    KICKING_TEAM_CHANGED = "kicking_team_changed"
    STOPPED = "stopped"
    UNSTOPPED = "unstopped"
    ENTERED_INITIAL = "entered_initial"
    ENTERED_READY = "entered_ready"
    ENTERED_SET = "entered_set"
    ENTERED_PLAYING = "entered_playing"
    ENTERED_FINISHED = "entered_finished"
    ENTERED_TIMEOUT = "entered_timeout"
    KICKOFF_CONTEXT_STARTED = "kickoff_context_started"
    KICKOFF_CONTEXT_FINISHED = "kickoff_context_finished"


@dataclass(frozen=True)
class PlayerGameSnapshot:
    """Player-facing subset of RoboCupGameControlData.

    Field values use the string names already used by the formation tool:
    game_phase: "normal", "extra_time", "penalty_shoot_out", "timeout"
    state: "initial", "ready", "set", "playing", "finished"
    set_play: "none", "direct_free_kick", "indirect_free_kick",
      "penalty_kick", "throw_in", "goal_kick", "corner_kick"
    kicking_team: own/team number, opponent team number, or None for
      KICKING_TEAM_NONE.
    """

    game_phase: str
    state: str
    set_play: str
    kicking_team: int | None
    own_team_number: int
    first_half: bool
    stopped: bool = False
    packet_number: int | None = None
    secs_remaining: int | None = None
    secondary_time: int | None = None

    @property
    def kicking_relation(self) -> KickingRelation:
        if self.kicking_team is None:
            return KickingRelation.NONE
        if self.kicking_team == self.own_team_number:
            return KickingRelation.US
        return KickingRelation.THEM

    @property
    def is_kickoff_context(self) -> bool:
        """Kick-off is not advertised as a distinct setPlay.

        The GameController internally has SetPlay::KickOff, but players see
        setPlay=none and must infer the context from state plus kickingTeam.
        """

        return (
            self.set_play == "none"
            and self.kicking_relation is not KickingRelation.NONE
            and self.state in {"initial", "ready", "set"}
            and self.game_phase != "penalty_shoot_out"
        )

    @property
    def exact_formation_key(self) -> str:
        return "__".join(
            [
                "advertised",
                f"phase_{self.game_phase}",
                f"state_{self.state}",
                f"set_play_{self.set_play}",
                f"kicking_{self.kicking_relation.value}",
            ]
        )


@dataclass(frozen=True)
class PlayerGameTransition:
    previous: PlayerGameSnapshot | None
    current: PlayerGameSnapshot
    events: tuple[PlayerGameEvent, ...]

    def has(self, event: PlayerGameEvent) -> bool:
        return event in self.events


@dataclass
class PlayerGameStateMachine:
    """Observable state machine for player-side GameController packets.

    This intentionally models what a player can observe, not the controller's
    complete internal action history. In particular, GameController may delay
    advertised transitions to playing, so treat ENTERED_PLAYING as "the player
    first observed playing", not necessarily the exact referee action time.
    """

    current: PlayerGameSnapshot | None = None
    history: list[PlayerGameTransition] = field(default_factory=list)

    def update(self, snapshot: PlayerGameSnapshot) -> PlayerGameTransition:
        transition = PlayerGameTransition(
            previous=self.current,
            current=snapshot,
            events=tuple(classify_events(self.current, snapshot)),
        )
        self.current = snapshot
        self.history.append(transition)
        return transition

    def reset(self) -> None:
        self.current = None
        self.history.clear()


def classify_events(
    previous: PlayerGameSnapshot | None,
    current: PlayerGameSnapshot,
) -> Iterable[PlayerGameEvent]:
    if previous is None:
        yield PlayerGameEvent.FIRST_PACKET
        yield from entered_state_events(current)
        if current.is_kickoff_context:
            yield PlayerGameEvent.KICKOFF_CONTEXT_STARTED
        return

    if packet_advanced(previous.packet_number, current.packet_number):
        yield PlayerGameEvent.PACKET_ADVANCED
    elif current.packet_number is not None and previous.packet_number is not None:
        yield PlayerGameEvent.PACKET_REPEATED_OR_REWOUND

    if previous.game_phase != current.game_phase:
        yield PlayerGameEvent.PHASE_CHANGED

    if previous.first_half != current.first_half:
        yield PlayerGameEvent.HALF_CHANGED

    if previous.state != current.state:
        yield PlayerGameEvent.STATE_CHANGED
        yield from entered_state_events(current)

    if previous.set_play == "none" and current.set_play != "none":
        yield PlayerGameEvent.SET_PLAY_STARTED
    elif previous.set_play != "none" and current.set_play == "none":
        yield PlayerGameEvent.SET_PLAY_FINISHED
    elif previous.set_play != current.set_play:
        yield PlayerGameEvent.SET_PLAY_CHANGED

    if previous.kicking_team != current.kicking_team:
        yield PlayerGameEvent.KICKING_TEAM_CHANGED

    if not previous.stopped and current.stopped:
        yield PlayerGameEvent.STOPPED
    elif previous.stopped and not current.stopped:
        yield PlayerGameEvent.UNSTOPPED

    if not previous.is_kickoff_context and current.is_kickoff_context:
        yield PlayerGameEvent.KICKOFF_CONTEXT_STARTED
    elif previous.is_kickoff_context and not current.is_kickoff_context:
        yield PlayerGameEvent.KICKOFF_CONTEXT_FINISHED


def entered_state_events(snapshot: PlayerGameSnapshot) -> Iterable[PlayerGameEvent]:
    match snapshot.state:
        case "initial":
            yield PlayerGameEvent.ENTERED_INITIAL
        case "ready":
            yield PlayerGameEvent.ENTERED_READY
        case "set":
            yield PlayerGameEvent.ENTERED_SET
        case "playing":
            yield PlayerGameEvent.ENTERED_PLAYING
        case "finished":
            yield PlayerGameEvent.ENTERED_FINISHED

    if snapshot.game_phase == "timeout":
        yield PlayerGameEvent.ENTERED_TIMEOUT


def packet_advanced(previous: int | None, current: int | None) -> bool:
    if previous is None or current is None:
        return False

    return current != previous and (current - previous) % 256 < 128
