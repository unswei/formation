export type Vec2 = {
  x: number
  y: number
}

export const FORMATION_MODE_OPTIONS = [
  'normal_play',
  'kickoff_us',
  'kickoff_them',
  'direct_free_kick_us',
  'direct_free_kick_them',
  'indirect_free_kick_us',
  'indirect_free_kick_them',
  'throw_in_us',
  'throw_in_them',
  'goal_kick_us',
  'goal_kick_them',
  'corner_kick_us',
  'corner_kick_them',
  'penalty_kick_us',
  'penalty_kick_them',
  'timeout',
] as const

export type FormationMode = (typeof FORMATION_MODE_OPTIONS)[number]

export const LEGACY_FORMATION_MODE_ALIASES = {
  corner_us: 'corner_kick_us',
  corner_them: 'corner_kick_them',
  penalty_us: 'penalty_kick_us',
  penalty_them: 'penalty_kick_them',
} as const satisfies Record<string, FormationMode>

export type LegacyFormationMode = keyof typeof LEGACY_FORMATION_MODE_ALIASES

export const FORMATION_MODE_LABELS: Record<FormationMode, string> = {
  normal_play: 'Normal play',
  kickoff_us: 'Kick-off us',
  kickoff_them: 'Kick-off them',
  direct_free_kick_us: 'Direct free kick us',
  direct_free_kick_them: 'Direct free kick them',
  indirect_free_kick_us: 'Indirect free kick us',
  indirect_free_kick_them: 'Indirect free kick them',
  throw_in_us: 'Throw-in us',
  throw_in_them: 'Throw-in them',
  goal_kick_us: 'Goal kick us',
  goal_kick_them: 'Goal kick them',
  corner_kick_us: 'Corner kick us',
  corner_kick_them: 'Corner kick them',
  penalty_kick_us: 'Penalty kick us',
  penalty_kick_them: 'Penalty kick them',
  timeout: 'Timeout',
}

export const GAME_PHASE_OPTIONS = [
  'normal',
  'penalty_shoot_out',
  'extra_time',
  'timeout',
] as const

export type GamePhase = (typeof GAME_PHASE_OPTIONS)[number]

export const GAME_PHASE_LABELS: Record<GamePhase, string> = {
  normal: 'Normal time',
  penalty_shoot_out: 'Penalty shoot-out',
  extra_time: 'Extra time',
  timeout: 'Timeout',
}

export const GAME_STATE_OPTIONS = [
  'initial',
  'ready',
  'set',
  'playing',
  'finished',
] as const

export type GameState = (typeof GAME_STATE_OPTIONS)[number]

export const GAME_STATE_LABELS: Record<GameState, string> = {
  initial: 'Initial',
  ready: 'Ready',
  set: 'Set',
  playing: 'Playing',
  finished: 'Finished',
}

export const SET_PLAY_OPTIONS = [
  'none',
  'direct_free_kick',
  'indirect_free_kick',
  'penalty_kick',
  'throw_in',
  'goal_kick',
  'corner_kick',
] as const

export type SetPlay = (typeof SET_PLAY_OPTIONS)[number]

export const SET_PLAY_LABELS: Record<SetPlay, string> = {
  none: 'None',
  direct_free_kick: 'Direct free kick',
  indirect_free_kick: 'Indirect free kick',
  penalty_kick: 'Penalty kick',
  throw_in: 'Throw-in',
  goal_kick: 'Goal kick',
  corner_kick: 'Corner kick',
}

export type AdvertisedGameControllerState = {
  gamePhase: GamePhase
  state: GameState
  setPlay: SetPlay
  firstHalf: boolean
  stopped: boolean
  ownTeamNumber: number
  kickingTeam: number | null
}

export const KICKING_TEAM_RELATION_OPTIONS = ['none', 'us', 'them'] as const

export type KickingTeamRelation =
  (typeof KICKING_TEAM_RELATION_OPTIONS)[number]

export const KICKING_TEAM_RELATION_LABELS: Record<KickingTeamRelation, string> =
  {
    none: 'None advertised',
    us: 'Our team',
    them: 'Other team',
  }

export const DEFAULT_ADVERTISED_STATE: AdvertisedGameControllerState = {
  gamePhase: 'normal',
  state: 'playing',
  setPlay: 'none',
  firstHalf: true,
  stopped: false,
  ownTeamNumber: 0,
  kickingTeam: null,
}

export const ROBOT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const

export type RobotId = (typeof ROBOT_IDS)[number]
