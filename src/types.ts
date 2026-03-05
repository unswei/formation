export type Vec2 = {
  x: number
  y: number
}

export const PLAY_MODE_OPTIONS = [
  'normal_play',
  'kickoff_us',
  'kickoff_them',
  'goal_kick_us',
  'goal_kick_them',
  'corner_us',
  'corner_them',
  'penalty_us',
  'penalty_them',
] as const

export type PlayMode = (typeof PLAY_MODE_OPTIONS)[number]

export const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  normal_play: 'Normal play',
  kickoff_us: 'Kick-off us',
  kickoff_them: 'Kick-off them',
  goal_kick_us: 'Goal kick us',
  goal_kick_them: 'Goal kick them',
  corner_us: 'Corner us',
  corner_them: 'Corner them',
  penalty_us: 'Penalty us',
  penalty_them: 'Penalty them',
}

export const ROBOT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const

export type RobotId = (typeof ROBOT_IDS)[number]
