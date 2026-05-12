import {
  FORMATION_MODE_OPTIONS,
  LEGACY_FORMATION_MODE_ALIASES,
} from '../types'
import type { FormationMode, LegacyFormationMode } from '../types'

export type FieldMeasure =
  | number
  | {
      field?: string
      feature?: string
      scale?: number
      offset?: number
    }
  | {
      position: string
      offset?: number
    }
  | {
      op: 'add' | 'subtract' | 'multiply' | 'negate'
      terms: FieldMeasure[]
    }

export type FormationConfig = {
  version: 1
  meta?: { name?: string; notes?: string }
  defaults?: {
    attraction?: { x?: number; y?: number }
    minX?: FieldMeasure
    maxX?: FieldMeasure
    minY?: FieldMeasure
    maxY?: FieldMeasure
  }
  modes: Record<string, ModeConfig>
}

export type ModeConfig = {
  defaults?: {
    attraction?: { x?: number; y?: number }
    minX?: FieldMeasure
    maxX?: FieldMeasure
    minY?: FieldMeasure
    maxY?: FieldMeasure
  }
  robots: Partial<Record<string, RobotConfig>>
}

export type RobotConfig = {
  offset: { x: FieldMeasure; y: FieldMeasure }
  attraction?: { x?: number; y?: number }
  minX?: FieldMeasure
  maxX?: FieldMeasure
  minY?: FieldMeasure
  maxY?: FieldMeasure
}

type DefaultsConfig = NonNullable<FormationConfig['defaults']>

export type ParsedFormationConfig = {
  config: FormationConfig
  warnings: string[]
}

const FORMATION_MODE_SET = new Set<string>(FORMATION_MODE_OPTIONS)
const ADVERTISED_STATE_MODE_PATTERN =
  /^advertised__phase_[a-z_]+__state_[a-z_]+__set_play_[a-z_]+__kicking_(?:none|us|them)$/

const FIELD_DIMENSION_KEYS = new Set([
  'length',
  'width',
  'goalAreaLength',
  'goalAreaWidth',
  'penaltyAreaLength',
  'penaltyAreaWidth',
  'penaltyMarkDistance',
  'centreCircleDiameter',
  'cornerArcRadius',
])

const FIELD_POSITION_KEYS = new Set([
  'centre_x',
  'center_x',
  'centre_y',
  'center_y',
  'field_min_x',
  'field_max_x',
  'field_min_y',
  'field_max_y',
  'left_goal_area_min_x',
  'left_goal_area_max_x',
  'right_goal_area_min_x',
  'right_goal_area_max_x',
  'goal_area_min_y',
  'goal_area_max_y',
  'left_penalty_area_min_x',
  'left_penalty_area_max_x',
  'right_penalty_area_min_x',
  'right_penalty_area_max_x',
  'penalty_area_min_y',
  'penalty_area_max_y',
  'left_penalty_mark_x',
  'right_penalty_mark_x',
])

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

  for (const [rawModeKey, modeValue] of Object.entries(modesValue)) {
    const modeKey = normaliseFormationMode(rawModeKey, warnings)
    if (!modeKey) {
      warnings.push(`Ignoring unknown play mode "${rawModeKey}".`)
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

  const offsetX = parseFieldMeasure(value.offset.x, `${path}.offset.x`, warnings)
  const offsetY = parseFieldMeasure(value.offset.y, `${path}.offset.y`, warnings)

  if (offsetX === undefined || offsetY === undefined) {
    warnings.push(
      `Ignoring ${path} because offset.x and offset.y must be valid field measures.`,
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

  parseLimitOnto(robotConfig, value, 'minX', path, warnings)
  parseLimitOnto(robotConfig, value, 'maxX', path, warnings)
  parseLimitOnto(robotConfig, value, 'minY', path, warnings)
  parseLimitOnto(robotConfig, value, 'maxY', path, warnings)

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

  parseLimitOnto(defaults, value, 'minX', path, warnings)
  parseLimitOnto(defaults, value, 'maxX', path, warnings)
  parseLimitOnto(defaults, value, 'minY', path, warnings)
  parseLimitOnto(defaults, value, 'maxY', path, warnings)

  return Object.keys(defaults).length > 0 ? defaults : undefined
}

function parseLimitOnto<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
  key: 'minX' | 'maxX' | 'minY' | 'maxY',
  path: string,
  warnings: string[],
): void {
  if (source[key] === undefined) {
    return
  }

  const parsed = parseFieldMeasure(source[key], `${path}.${key}`, warnings)
  if (parsed === undefined) {
    warnings.push(`Ignoring ${path}.${key} because it is not a valid field measure.`)
    return
  }

  target[key] = parsed
}

function parseFieldMeasure(
  value: unknown,
  path: string,
  warnings: string[],
): FieldMeasure | undefined {
  if (parseFiniteNumber(value) !== undefined) {
    return value
  }

  if (!isRecord(value)) {
    return undefined
  }

  if ('position' in value) {
    if (typeof value.position !== 'string') {
      warnings.push(`Ignoring ${path}.position because it is not a string.`)
      return undefined
    }

    if (!FIELD_POSITION_KEYS.has(value.position)) {
      warnings.push(`${path}.position "${value.position}" is not a known position key.`)
    }

    const result: FieldMeasure = { position: value.position }

    if (value.offset !== undefined) {
      const offset = parseFiniteNumber(value.offset)
      if (offset === undefined) {
        warnings.push(`Ignoring ${path}.offset because it is not finite.`)
      } else {
        result.offset = offset
      }
    }

    return result
  }

  if ('op' in value) {
    if (
      value.op !== 'add' &&
      value.op !== 'subtract' &&
      value.op !== 'multiply' &&
      value.op !== 'negate'
    ) {
      warnings.push(`Ignoring ${path}.op because it is not supported.`)
      return undefined
    }

    if (!Array.isArray(value.terms)) {
      warnings.push(`Ignoring ${path}.terms because it is not an array.`)
      return undefined
    }

    const terms: FieldMeasure[] = []

    for (const [index, term] of value.terms.entries()) {
      const parsedTerm = parseFieldMeasure(term, `${path}.terms.${index}`, warnings)
      if (parsedTerm === undefined) {
        return undefined
      }
      terms.push(parsedTerm)
    }

    return { op: value.op, terms }
  }

  const fieldKey = typeof value.field === 'string' ? value.field : undefined
  const featureKey = typeof value.feature === 'string' ? value.feature : undefined
  const selectedKey = fieldKey ?? featureKey

  if (!selectedKey) {
    return undefined
  }

  if (!FIELD_DIMENSION_KEYS.has(selectedKey)) {
    warnings.push(`${path} references unknown field dimension "${selectedKey}".`)
  }

  const result: {
    field?: string
    feature?: string
    scale?: number
    offset?: number
  } = {}

  if (fieldKey) {
    result.field = fieldKey
  } else if (featureKey) {
    result.feature = featureKey
  }

  if (value.scale !== undefined) {
    const scale = parseFiniteNumber(value.scale)
    if (scale === undefined) {
      warnings.push(`Ignoring ${path}.scale because it is not finite.`)
    } else {
      result.scale = scale
    }
  }

  if (value.offset !== undefined) {
    const offset = parseFiniteNumber(value.offset)
    if (offset === undefined) {
      warnings.push(`Ignoring ${path}.offset because it is not finite.`)
    } else {
      result.offset = offset
    }
  }

  return result
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normaliseFormationMode(
  value: string,
  warnings: string[],
): string | undefined {
  if (isAdvertisedStateMode(value)) {
    return value
  }

  if (isFormationMode(value)) {
    return value
  }

  if (isLegacyFormationMode(value)) {
    const canonicalMode = LEGACY_FORMATION_MODE_ALIASES[value]
    warnings.push(
      `Normalising legacy play mode "${value}" to "${canonicalMode}".`,
    )
    return canonicalMode
  }

  return undefined
}

function isFormationMode(value: string): value is FormationMode {
  return FORMATION_MODE_SET.has(value)
}

function isLegacyFormationMode(value: string): value is LegacyFormationMode {
  return value in LEGACY_FORMATION_MODE_ALIASES
}

function isAdvertisedStateMode(value: string): boolean {
  return ADVERTISED_STATE_MODE_PATTERN.test(value)
}