import fieldSizes from '../config/field_sizes.json'
import type { RobotId, Vec2 } from '../types'

export interface FieldDimensions {
  length: number
  width: number
  goalAreaLength: number
  goalAreaWidth: number
  penaltyAreaLength: number
  penaltyAreaWidth: number
  penaltyMarkDistance: number
  centreCircleDiameter: number
  cornerArcRadius: number
}

export type FieldSize = keyof typeof fieldSizes

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface Rect {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface LineSegment {
  start: Vec2
  end: Vec2
}

export interface CircleShape {
  centre: Vec2
  radius: number
}

export interface ArcShape {
  centre: Vec2
  radius: number
  startAngleDeg: number
  endAngleDeg: number
}

export interface FieldGeometry {
  fieldRect: Rect
  halfwayLine: LineSegment
  centreCircle: CircleShape
  centreMark: Vec2
  goalAreas: {
    left: Rect
    right: Rect
  }
  penaltyAreas: {
    left: Rect
    right: Rect
  }
  penaltyMarks: {
    left: Vec2
    right: Vec2
  }
  cornerArcs: ArcShape[]
}

export const FIELD_SIZE_OPTIONS = Object.keys(fieldSizes) as FieldSize[]

export const ROBOT_RADIUS_METRES = 0.18
export const BALL_RADIUS_METRES = 0.075
export const FIELD_POSITION_PADDING_METRES = 1
export const BENCH_MARGIN_METRES = 0.8
export const BENCH_ROW_SPACING_METRES = 0.4

const fieldSizeTable = fieldSizes as Record<FieldSize, FieldDimensions>

export function getFieldDimensions(field: FieldSize): FieldDimensions {
  return fieldSizeTable[field]
}

export function getFieldBounds(dimensions: FieldDimensions): Bounds {
  return {
    minX: -dimensions.length / 2,
    maxX: dimensions.length / 2,
    minY: -dimensions.width / 2,
    maxY: dimensions.width / 2,
  }
}

export function getPaddedPlayerBounds(
  dimensions: FieldDimensions,
  padding = FIELD_POSITION_PADDING_METRES,
): Bounds {
  const bounds = getFieldBounds(dimensions)

  return {
    minX: bounds.minX - padding,
    maxX: bounds.maxX + padding,
    minY: bounds.minY - padding,
    maxY: bounds.maxY + padding,
  }
}

export function clampPointToField(
  point: Vec2,
  dimensions: FieldDimensions,
): Vec2 {
  return clampPointToBounds(point, getFieldBounds(dimensions))
}

export function clampPointToBounds(point: Vec2, bounds: Bounds): Vec2 {
  return {
    x: clampNumber(point.x, bounds.minX, bounds.maxX),
    y: clampNumber(point.y, bounds.minY, bounds.maxY),
  }
}

export function getBenchPosition(
  dimensions: FieldDimensions,
  robotId: RobotId,
): Vec2 {
  const bounds = getFieldBounds(dimensions)

  return {
    x: bounds.maxX + BENCH_MARGIN_METRES,
    y: bounds.maxY - (robotId - 1) * BENCH_ROW_SPACING_METRES,
  }
}

export function getViewportBounds(dimensions: FieldDimensions): Bounds {
  const playerBounds = getPaddedPlayerBounds(dimensions)
  const furthestBenchRobot = getBenchPosition(dimensions, 11)

  return {
    minX: playerBounds.minX,
    maxX: Math.max(
      playerBounds.maxX,
      furthestBenchRobot.x + ROBOT_RADIUS_METRES + 0.4,
    ),
    minY: Math.min(
      playerBounds.minY,
      furthestBenchRobot.y - ROBOT_RADIUS_METRES,
    ),
    maxY: playerBounds.maxY,
  }
}

export function getFieldGeometry(dimensions: FieldDimensions): FieldGeometry {
  const bounds = getFieldBounds(dimensions)
  const goalAreaHalfWidth = dimensions.goalAreaWidth / 2
  const penaltyAreaHalfWidth = dimensions.penaltyAreaWidth / 2
  const centreCircleRadius = dimensions.centreCircleDiameter / 2

  return {
    fieldRect: {
      minX: bounds.minX,
      maxX: bounds.maxX,
      minY: bounds.minY,
      maxY: bounds.maxY,
    },
    halfwayLine: {
      start: { x: 0, y: bounds.minY },
      end: { x: 0, y: bounds.maxY },
    },
    centreCircle: {
      centre: { x: 0, y: 0 },
      radius: centreCircleRadius,
    },
    centreMark: { x: 0, y: 0 },
    goalAreas: {
      left: {
        minX: bounds.minX,
        maxX: bounds.minX + dimensions.goalAreaLength,
        minY: -goalAreaHalfWidth,
        maxY: goalAreaHalfWidth,
      },
      right: {
        minX: bounds.maxX - dimensions.goalAreaLength,
        maxX: bounds.maxX,
        minY: -goalAreaHalfWidth,
        maxY: goalAreaHalfWidth,
      },
    },
    penaltyAreas: {
      left: {
        minX: bounds.minX,
        maxX: bounds.minX + dimensions.penaltyAreaLength,
        minY: -penaltyAreaHalfWidth,
        maxY: penaltyAreaHalfWidth,
      },
      right: {
        minX: bounds.maxX - dimensions.penaltyAreaLength,
        maxX: bounds.maxX,
        minY: -penaltyAreaHalfWidth,
        maxY: penaltyAreaHalfWidth,
      },
    },
    penaltyMarks: {
      left: {
        x: bounds.minX + dimensions.penaltyMarkDistance,
        y: 0,
      },
      right: {
        x: bounds.maxX - dimensions.penaltyMarkDistance,
        y: 0,
      },
    },
    cornerArcs:
      dimensions.cornerArcRadius > 0
        ? [
            {
              centre: { x: bounds.minX, y: bounds.maxY },
              radius: dimensions.cornerArcRadius,
              startAngleDeg: 270,
              endAngleDeg: 360,
            },
            {
              centre: { x: bounds.maxX, y: bounds.maxY },
              radius: dimensions.cornerArcRadius,
              startAngleDeg: 180,
              endAngleDeg: 270,
            },
            {
              centre: { x: bounds.maxX, y: bounds.minY },
              radius: dimensions.cornerArcRadius,
              startAngleDeg: 90,
              endAngleDeg: 180,
            },
            {
              centre: { x: bounds.minX, y: bounds.minY },
              radius: dimensions.cornerArcRadius,
              startAngleDeg: 0,
              endAngleDeg: 90,
            },
          ]
        : [],
  }
}

export function getRectCentre(rect: Rect): Vec2 {
  return {
    x: (rect.minX + rect.maxX) / 2,
    y: (rect.minY + rect.maxY) / 2,
  }
}

export function sampleArc(arc: ArcShape, segments = 18): Vec2[] {
  const points: Vec2[] = []

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments
    const angleDeg =
      arc.startAngleDeg + (arc.endAngleDeg - arc.startAngleDeg) * progress
    const angleRad = (angleDeg * Math.PI) / 180

    points.push({
      x: arc.centre.x + Math.cos(angleRad) * arc.radius,
      y: arc.centre.y + Math.sin(angleRad) * arc.radius,
    })
  }

  return points
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
