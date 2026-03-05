import { describe, expect, it } from 'vitest'

import { getBenchPosition, getFieldDimensions, getFieldGeometry } from './field'

describe('field geometry', () => {
  it('derives penalty marks and areas for the medium field', () => {
    const geometry = getFieldGeometry(getFieldDimensions('M'))

    expect(geometry.penaltyMarks.left).toEqual({ x: -5, y: 0 })
    expect(geometry.penaltyMarks.right).toEqual({ x: 5, y: 0 })
    expect(geometry.goalAreas.left).toEqual({
      minX: -7,
      maxX: -6,
      minY: -2,
      maxY: 2,
    })
    expect(geometry.cornerArcs).toHaveLength(4)
  })

  it('places bench robots outside the field boundary', () => {
    const dimensions = getFieldDimensions('S')
    const benchRobot = getBenchPosition(dimensions, 3)

    expect(benchRobot.x).toBeGreaterThan(dimensions.length / 2)
    expect(benchRobot.y).toBeLessThanOrEqual(dimensions.width / 2)
  })
})
