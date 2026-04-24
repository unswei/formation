import { describe, expect, it } from 'vitest'

import { resolveMode } from './gameController'
import { DEFAULT_ADVERTISED_STATE } from './types'

describe('resolveMode', () => {
  it('maps set plays by kicking team ownership', () => {
    expect(
      resolveMode({
        ...DEFAULT_ADVERTISED_STATE,
        setPlay: 'goal_kick',
        kickingTeam: DEFAULT_ADVERTISED_STATE.ownTeamNumber,
      }).legacyMode,
    ).toBe('goal_kick_us')

    expect(
      resolveMode({
        ...DEFAULT_ADVERTISED_STATE,
        setPlay: 'corner_kick',
        kickingTeam: DEFAULT_ADVERTISED_STATE.ownTeamNumber + 1,
      }).legacyMode,
    ).toBe('corner_kick_them')
  })

  it('treats non-playing no-set-play states as kick-off shapes', () => {
    expect(
      resolveMode({
        ...DEFAULT_ADVERTISED_STATE,
        state: 'ready',
        setPlay: 'none',
        kickingTeam: DEFAULT_ADVERTISED_STATE.ownTeamNumber,
      }).legacyMode,
    ).toBe('kickoff_us')

    expect(
      resolveMode({
        ...DEFAULT_ADVERTISED_STATE,
        state: 'set',
        setPlay: 'none',
        kickingTeam: DEFAULT_ADVERTISED_STATE.ownTeamNumber + 1,
      }).legacyMode,
    ).toBe('kickoff_them')
  })

  it('maps timeout and penalty shoot-out from gamePhase first', () => {
    expect(
      resolveMode({
        ...DEFAULT_ADVERTISED_STATE,
        gamePhase: 'timeout',
        state: 'initial',
      }).legacyMode,
    ).toBe('timeout')

    expect(
      resolveMode({
        ...DEFAULT_ADVERTISED_STATE,
        gamePhase: 'penalty_shoot_out',
        kickingTeam: DEFAULT_ADVERTISED_STATE.ownTeamNumber + 1,
      }).legacyMode,
    ).toBe('penalty_kick_them')
  })

  it('falls back to normal play when no richer signal is advertised', () => {
    expect(resolveMode(DEFAULT_ADVERTISED_STATE).legacyMode).toBe(
      'normal_play',
    )
  })

  it('keeps kicking-team-none distinct in the advertised state mode', () => {
    expect(
      resolveMode({
        ...DEFAULT_ADVERTISED_STATE,
        state: 'ready',
        kickingTeam: null,
      }).advertisedStateMode,
    ).toBe('advertised__phase_normal__state_ready__set_play_none__kicking_none')

    expect(
      resolveMode({
        ...DEFAULT_ADVERTISED_STATE,
        state: 'ready',
        kickingTeam: DEFAULT_ADVERTISED_STATE.ownTeamNumber,
      }).advertisedStateMode,
    ).toBe('advertised__phase_normal__state_ready__set_play_none__kicking_us')
  })
})
