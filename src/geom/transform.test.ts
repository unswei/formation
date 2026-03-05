import { describe, expect, it } from 'vitest'

import type { Bounds } from './field'
import { createViewTransform, screenToWorld, worldToScreen } from './transform'

describe('view transforms', () => {
  it('round-trips between world and screen coordinates', () => {
    const bounds: Bounds = {
      minX: -8,
      maxX: 10,
      minY: -5,
      maxY: 5,
    }
    const transform = createViewTransform(bounds, 1200, 800)
    const point = { x: 2.4, y: -1.8 }
    const roundTrip = screenToWorld(worldToScreen(point, transform), transform)

    expect(roundTrip.x).toBeCloseTo(point.x)
    expect(roundTrip.y).toBeCloseTo(point.y)
  })
})
