import type { FormationConfig, RobotConfig } from './config/schema'
import type { FieldDimensions } from './geom/field'
import { getFieldBounds } from './geom/field'
import type { RobotId, Vec2 } from './types'

export type RecordingSample = {
  ball: Vec2
  player: Vec2
}

export type RecordingSamples = {
  a?: RecordingSample
  b?: RecordingSample
}

export type RecordingSampleMap = Record<string, Partial<Record<RobotId, RecordingSamples>>>

export type PlayerLimits = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type InferenceResult =
  | {
      ok: true
      robot: RobotConfig
    }
  | {
      ok: false
      warnings: string[]
    }

const MIN_BALL_DELTA = 0.25
const LIMIT_MARGIN = 0.05

export function createRecordingDraft(
  sourceConfig: FormationConfig | null,
  name: string,
): FormationConfig {
  return {
    version: 1,
    meta: {
      ...(sourceConfig?.meta ?? {}),
      name: name.trim() || sourceConfig?.meta?.name || 'Recorded formation',
    },
    defaults: sourceConfig?.defaults ? { ...sourceConfig.defaults } : {},
    modes: cloneModes(sourceConfig?.modes ?? {}),
  }
}

export function ensureMode(config: FormationConfig, modeKey: string): FormationConfig {
  if (config.modes[modeKey]) {
    return config
  }

  return {
    ...config,
    modes: {
      ...config.modes,
      [modeKey]: { robots: {} },
    },
  }
}

export function updateRecordedPlayer(
  config: FormationConfig,
  modeKey: string,
  robotId: RobotId,
  robotConfig: RobotConfig,
): FormationConfig {
  const currentMode = config.modes[modeKey] ?? { robots: {} }

  return {
    ...config,
    modes: {
      ...config.modes,
      [modeKey]: {
        ...currentMode,
        robots: {
          ...currentMode.robots,
          [String(robotId)]: robotConfig,
        },
      },
    },
  }
}

export function copyModeConfig(
  config: FormationConfig,
  sourceModeKey: string,
  targetModeKey: string,
): FormationConfig {
  const sourceMode = config.modes[sourceModeKey]
  if (!sourceMode) {
    return config
  }

  return {
    ...config,
    modes: {
      ...config.modes,
      [targetModeKey]: cloneMode(sourceMode),
    },
  }
}

export function mirrorRobotConfigY(
  sourceRobot: RobotConfig,
  sourceLimits: PlayerLimits,
): RobotConfig {
  return {
    ...sourceRobot,
    offset: {
      ...sourceRobot.offset,
      y: roundNumber(-sourceRobot.offset.y),
    },
    ...(sourceRobot.attraction
      ? { attraction: { ...sourceRobot.attraction } }
      : {}),
    minX: roundNumber(sourceLimits.minX),
    maxX: roundNumber(sourceLimits.maxX),
    minY: roundNumber(-sourceLimits.maxY),
    maxY: roundNumber(-sourceLimits.minY),
  }
}

export function inferRobotConfig(
  samples: RecordingSamples,
  limits: PlayerLimits,
): InferenceResult {
  const warnings: string[] = []

  if (!samples.a || !samples.b) {
    return { ok: false, warnings: ['Capture samples A and B.'] }
  }

  const ballDeltaX = samples.b.ball.x - samples.a.ball.x
  const ballDeltaY = samples.b.ball.y - samples.a.ball.y

  if (Math.abs(ballDeltaX) < MIN_BALL_DELTA) {
    warnings.push('Move the ball at least 0.25 m in x between samples.')
  }
  if (Math.abs(ballDeltaY) < MIN_BALL_DELTA) {
    warnings.push('Move the ball at least 0.25 m in y between samples.')
  }

  for (const [label, sample] of [
    ['A', samples.a],
    ['B', samples.b],
  ] as const) {
    if (
      sample.player.x <= limits.minX + LIMIT_MARGIN ||
      sample.player.x >= limits.maxX - LIMIT_MARGIN
    ) {
      warnings.push(
        `Sample ${label} player x must be at least 0.05 m inside the x limits.`,
      )
    }
    if (
      sample.player.y <= limits.minY + LIMIT_MARGIN ||
      sample.player.y >= limits.maxY - LIMIT_MARGIN
    ) {
      warnings.push(
        `Sample ${label} player y must be at least 0.05 m inside the y limits.`,
      )
    }
  }

  if (warnings.length > 0) {
    return { ok: false, warnings }
  }

  const attractionX = (samples.b.player.x - samples.a.player.x) / ballDeltaX
  const attractionY = (samples.b.player.y - samples.a.player.y) / ballDeltaY
  const offsetX = samples.a.player.x - samples.a.ball.x * attractionX
  const offsetY = samples.a.player.y - samples.a.ball.y * attractionY

  return {
    ok: true,
    robot: {
      offset: roundPoint({ x: offsetX, y: offsetY }),
      attraction: roundPoint({ x: attractionX, y: attractionY }),
      minX: roundNumber(limits.minX),
      maxX: roundNumber(limits.maxX),
      minY: roundNumber(limits.minY),
      maxY: roundNumber(limits.maxY),
    },
  }
}

export function getRecordedPlayerPosition(
  config: FormationConfig | null,
  modeKey: string,
  robotId: RobotId,
  ball: Vec2,
  fallback: Vec2,
): Vec2 {
  const robot = config?.modes[modeKey]?.robots[String(robotId)]
  if (!robot) {
    return fallback
  }

  const attractionX = robot.attraction?.x ?? config?.modes[modeKey]?.defaults?.attraction?.x ?? config?.defaults?.attraction?.x ?? 1
  const attractionY = robot.attraction?.y ?? config?.modes[modeKey]?.defaults?.attraction?.y ?? config?.defaults?.attraction?.y ?? 1
  const minX = robot.minX ?? config?.modes[modeKey]?.defaults?.minX ?? config?.defaults?.minX ?? -Infinity
  const maxX = robot.maxX ?? config?.modes[modeKey]?.defaults?.maxX ?? config?.defaults?.maxX ?? Infinity
  const minY = robot.minY ?? config?.modes[modeKey]?.defaults?.minY ?? config?.defaults?.minY ?? -Infinity
  const maxY = robot.maxY ?? config?.modes[modeKey]?.defaults?.maxY ?? config?.defaults?.maxY ?? Infinity

  return {
    x: Math.min(maxX, Math.max(minX, ball.x * attractionX + robot.offset.x)),
    y: Math.min(maxY, Math.max(minY, ball.y * attractionY + robot.offset.y)),
  }
}

export function getPlayerLimits(
  config: FormationConfig | null,
  modeKey: string,
  robotId: RobotId,
  dimensions: FieldDimensions,
): PlayerLimits {
  const bounds = getFieldBounds(dimensions)
  const mode = config?.modes[modeKey]
  const robot = mode?.robots[String(robotId)]

  return {
    minX: robot?.minX ?? mode?.defaults?.minX ?? config?.defaults?.minX ?? bounds.minX,
    maxX: robot?.maxX ?? mode?.defaults?.maxX ?? config?.defaults?.maxX ?? bounds.maxX,
    minY: robot?.minY ?? mode?.defaults?.minY ?? config?.defaults?.minY ?? bounds.minY,
    maxY: robot?.maxY ?? mode?.defaults?.maxY ?? config?.defaults?.maxY ?? bounds.maxY,
  }
}

export function setPlayerLimits(
  config: FormationConfig,
  modeKey: string,
  robotId: RobotId,
  limits: PlayerLimits,
): FormationConfig {
  const currentMode = config.modes[modeKey] ?? { robots: {} }
  const currentRobot = currentMode.robots[String(robotId)] ?? {
    offset: { x: 0, y: 0 },
  }

  return updateRecordedPlayer(config, modeKey, robotId, {
    ...currentRobot,
    minX: roundNumber(Math.min(limits.minX, limits.maxX)),
    maxX: roundNumber(Math.max(limits.minX, limits.maxX)),
    minY: roundNumber(Math.min(limits.minY, limits.maxY)),
    maxY: roundNumber(Math.max(limits.minY, limits.maxY)),
  })
}

export function getModeCompletion(
  config: FormationConfig | null,
  modeKey: string,
  activeRobotIds: RobotId[],
): { complete: number; total: number; missing: RobotId[] } {
  const robots = config?.modes[modeKey]?.robots ?? {}
  const missing = activeRobotIds.filter((robotId) => !robots[String(robotId)])

  return {
    complete: activeRobotIds.length - missing.length,
    total: activeRobotIds.length,
    missing,
  }
}

export function serialiseFormation(config: FormationConfig): string {
  return `${JSON.stringify(sortValue(config), null, 2)}\n`
}

export function normaliseFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${slug || 'recorded-formation'}.json`
}

function cloneModes(modes: FormationConfig['modes']): FormationConfig['modes'] {
  return Object.fromEntries(
    Object.entries(modes).map(([modeKey, mode]) => [modeKey, cloneMode(mode)]),
  )
}

function cloneMode(mode: FormationConfig['modes'][string]): FormationConfig['modes'][string] {
  return {
    ...(mode.defaults ? { defaults: { ...mode.defaults } } : {}),
    robots: Object.fromEntries(
      Object.entries(mode.robots)
        .filter((entry): entry is [string, RobotConfig] => entry[1] !== undefined)
        .map(([robotId, robot]) => [
          robotId,
          {
            ...robot,
            offset: { ...robot.offset },
            ...(robot.attraction ? { attraction: { ...robot.attraction } } : {}),
          },
        ]),
    ),
  }
}

function roundPoint(point: Vec2): Vec2 {
  return {
    x: roundNumber(point.x),
    y: roundNumber(point.y),
  }
}

function roundNumber(value: number): number {
  return Number(value.toFixed(4))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortValue(entryValue)]),
    )
  }
  return value
}
