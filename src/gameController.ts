import type {
  AdvertisedGameControllerState,
  FormationMode,
  KickingTeamRelation,
  SetPlay,
} from './types'

export type ModeResolution = {
  advertisedStateMode: string
  kickingTeamRelation: KickingTeamRelation
  legacyMode: FormationMode
}

export function resolveMode(state: AdvertisedGameControllerState): ModeResolution {
  const kickingTeamRelation = resolveKickingTeamRelation(state)

  return {
    advertisedStateMode: buildAdvertisedStateMode(state, kickingTeamRelation),
    kickingTeamRelation,
    legacyMode: resolveLegacyFormationMode(state, kickingTeamRelation),
  }
}

export function resolveKickingTeamRelation(
  state: AdvertisedGameControllerState,
): KickingTeamRelation {
  if (state.kickingTeam === null) {
    return 'none'
  }

  return state.kickingTeam === state.ownTeamNumber ? 'us' : 'them'
}

function buildAdvertisedStateMode(
  state: AdvertisedGameControllerState,
  kickingTeamRelation: KickingTeamRelation,
): string {
  return [
    'advertised',
    `phase_${state.gamePhase}`,
    `state_${state.state}`,
    `set_play_${state.setPlay}`,
    `kicking_${kickingTeamRelation}`,
  ].join('__')
}

function resolveLegacyFormationMode(
  state: AdvertisedGameControllerState,
  kickingTeamRelation: KickingTeamRelation,
): FormationMode {
  if (state.gamePhase === 'timeout') {
    return 'timeout'
  }

  if (state.gamePhase === 'penalty_shoot_out') {
    return kickingTeamRelation === 'them'
      ? 'penalty_kick_them'
      : 'penalty_kick_us'
  }

  const setPlayMode = resolveSetPlayMode(state.setPlay, kickingTeamRelation)
  if (setPlayMode) {
    return setPlayMode
  }

  if (
    state.setPlay === 'none' &&
    state.state !== 'playing' &&
    kickingTeamRelation !== 'none'
  ) {
    return kickingTeamRelation === 'us' ? 'kickoff_us' : 'kickoff_them'
  }

  return 'normal_play'
}

function resolveSetPlayMode(
  setPlay: SetPlay,
  kickingTeamRelation: KickingTeamRelation,
): FormationMode | null {
  if (setPlay === 'none' || kickingTeamRelation === 'none') {
    return null
  }

  const suffix = kickingTeamRelation === 'us' ? 'us' : 'them'

  switch (setPlay) {
    case 'direct_free_kick':
      return `direct_free_kick_${suffix}`
    case 'indirect_free_kick':
      return `indirect_free_kick_${suffix}`
    case 'penalty_kick':
      return `penalty_kick_${suffix}`
    case 'throw_in':
      return `throw_in_${suffix}`
    case 'goal_kick':
      return `goal_kick_${suffix}`
    case 'corner_kick':
      return `corner_kick_${suffix}`
  }
}
