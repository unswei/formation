import { PLAY_MODE_OPTIONS } from '../types'
import type { PlayMode } from '../types'

export type FormationConfig = {
  version: 1
  meta?: { name?: string; notes?: string }
  defaults?: {
    attraction?: { x?: number; y?: number }
    minX?: number
  }
  modes: Partial<Record<PlayMode, ModeConfig>>
}

export type ModeConfig = {
  defaults?: {
    attraction?: { x?: number; y?: number }
    minX?: number
  }
  robots: Partial<Record<string, RobotConfig>>
}

export type RobotConfig = {
  offset: { x: number; y: number }
  attraction?: { x?: number; y?: number }
  minX?: number
}

type DefaultsConfig = NonNullable<FormationConfig['defaults']>

export type ParsedFormationConfig = {
  config: FormationConfig
  warnings: string[]
}

const PLAY_MODE_SET = new Set<string>(PLAY_MODE_OPTIONS)

export function parseFormationConfig(
  input: string,
  sourceName = 'formation config',
): ParsedFormationConfig {
  const warnings: string[] = []
  let parsed: unknown

  try {
    parsed = JSON.parse(input)
  } catch (error) {
    throw new Error(
      `Could not parse ${sourceName}: ${
        error instanceof Error ? error.message : 'invalid JSON'
      }.`,
    )
  }

  if (!isRecord(parsed)) {
    throw new Error(`${sourceName} must contain a top-level JSON object.`)
  }

  if (parsed.version !== 1) {
    throw new Error(`${sourceName} must declare "version": 1.`)
  }

  const modesValue = parsed.modes
  if (!isRecord(modesValue)) {
    throw new Error(`${sourceName} must include a "modes" object.`)
  }

  const config: FormationConfig = {
    version: 1,
    modes: {},
  }

  const meta = parseMeta(parsed.meta)
  if (meta) {
    config.meta = meta
  }

  const defaults = parseDefaults(parsed.defaults, 'defaults', warnings)
  if (defaults) {
    config.defaults = defaults
  }

  for (const [modeKey, modeValue] of Object.entries(modesValue)) {
    if (!isPlayMode(modeKey)) {
      warnings.push(`Ignoring unknown play mode "${modeKey}".`)
      continue
    }

    const modeConfig = parseModeConfig(modeValue, `modes.${modeKey}`, warnings)
    if (modeConfig) {
      config.modes[modeKey] = modeConfig
    }
  }

  return { config, warnings }
}

function parseMeta(value: unknown): FormationConfig['meta'] | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const meta: NonNullable<FormationConfig['meta']> = {}

  if (typeof value.name === 'string' && value.name.trim().length > 0) {
    meta.name = value.name
  }

  if (typeof value.notes === 'string' && value.notes.trim().length > 0) {
    meta.notes = value.notes
  }

  return Object.keys(meta).length > 0 ? meta : undefined
}

function parseModeConfig(
  value: unknown,
  path: string,
  warnings: string[],
): ModeConfig | undefined {
  if (!isRecord(value)) {
    warnings.push(`Ignoring ${path} because it is not an object.`)
    return undefined
  }

  const modeConfig: ModeConfig = {
    robots: {},
  }

  const defaults = parseDefaults(value.defaults, `${path}.defaults`, warnings)
  if (defaults) {
    modeConfig.defaults = defaults
  }

  if (!isRecord(value.robots)) {
    warnings.push(
      `Treating ${path}.robots as empty because it is not an object.`,
    )
    return modeConfig
  }

  for (const [robotKey, robotValue] of Object.entries(value.robots)) {
    if (!/^(?:[1-9]|10|11)$/.test(robotKey)) {
      warnings.push(`Ignoring robot key "${robotKey}" at ${path}.robots.`)
      continue
    }

    const robotConfig = parseRobotConfig(
      robotValue,
      `${path}.robots.${robotKey}`,
      warnings,
    )
    if (robotConfig) {
      modeConfig.robots[robotKey] = robotConfig
    }
  }

  return modeConfig
}

function parseRobotConfig(
  value: unknown,
  path: string,
  warnings: string[],
): RobotConfig | undefined {
  if (!isRecord(value)) {
    warnings.push(`Ignoring ${path} because it is not an object.`)
    return undefined
  }

  if (!isRecord(value.offset)) {
    warnings.push(`Ignoring ${path} because "offset" is missing or invalid.`)
    return undefined
  }

  const offsetX = parseFiniteNumber(value.offset.x)
  const offsetY = parseFiniteNumber(value.offset.y)
  if (offsetX === undefined || offsetY === undefined) {
    warnings.push(
      `Ignoring ${path} because offset.x and offset.y must be finite.`,
    )
    return undefined
  }

  const robotConfig: RobotConfig = {
    offset: { x: offsetX, y: offsetY },
  }

  const attraction = parseAttraction(
    value.attraction,
    `${path}.attraction`,
    warnings,
  )
  if (attraction) {
    robotConfig.attraction = attraction
  }

  const minX = parseOptionalFiniteNumber(value.minX)
  if (value.minX !== undefined && minX === undefined) {
    warnings.push(`Ignoring ${path}.minX because it is not finite.`)
  } else if (minX !== undefined) {
    robotConfig.minX = minX
  }

  return robotConfig
}

function parseDefaults(
  value: unknown,
  path: string,
  warnings: string[],
): DefaultsConfig | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    warnings.push(`Ignoring ${path} because it is not an object.`)
    return undefined
  }

  const defaults: DefaultsConfig = {}
  const attraction = parseAttraction(
    value.attraction,
    `${path}.attraction`,
    warnings,
  )
  if (attraction) {
    defaults.attraction = attraction
  }

  const minX = parseOptionalFiniteNumber(value.minX)
  if (value.minX !== undefined && minX === undefined) {
    warnings.push(`Ignoring ${path}.minX because it is not finite.`)
  } else if (minX !== undefined) {
    defaults.minX = minX
  }

  return Object.keys(defaults).length > 0 ? defaults : undefined
}

function parseAttraction(
  value: unknown,
  path: string,
  warnings: string[],
): { x?: number; y?: number } | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    warnings.push(`Ignoring ${path} because it is not an object.`)
    return undefined
  }

  const attraction: { x?: number; y?: number } = {}

  for (const axis of ['x', 'y'] as const) {
    if (!(axis in value)) {
      continue
    }

    const parsedValue = parseFiniteNumber(value[axis])
    if (parsedValue === undefined) {
      warnings.push(`Ignoring ${path}.${axis} because it is not finite.`)
      continue
    }

    if (parsedValue < 0 || parsedValue > 2) {
      warnings.push(`${path}.${axis} is outside the suggested 0..2 range.`)
    }

    attraction[axis] = parsedValue
  }

  return Object.keys(attraction).length > 0 ? attraction : undefined
}

function parseFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseOptionalFiniteNumber(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined
  }

  return parseFiniteNumber(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlayMode(value: string): value is PlayMode {
  return PLAY_MODE_SET.has(value)
}
