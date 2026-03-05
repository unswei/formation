import type { Vec2 } from '../types'
import type { Bounds } from './field'

export interface ViewTransform {
  scale: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

export function createViewTransform(
  bounds: Bounds,
  width: number,
  height: number,
  padding = 24,
): ViewTransform {
  const safeWidth = Math.max(width, 1)
  const safeHeight = Math.max(height, 1)
  const availableWidth = Math.max(safeWidth - padding * 2, 1)
  const availableHeight = Math.max(safeHeight - padding * 2, 1)
  const worldWidth = bounds.maxX - bounds.minX
  const worldHeight = bounds.maxY - bounds.minY
  const scale = Math.min(
    availableWidth / worldWidth,
    availableHeight / worldHeight,
  )
  const offsetX = (safeWidth - worldWidth * scale) / 2 - bounds.minX * scale
  const offsetY = (safeHeight - worldHeight * scale) / 2 + bounds.maxY * scale

  return {
    scale,
    offsetX,
    offsetY,
    width: safeWidth,
    height: safeHeight,
  }
}

export function transformToSvgMatrix(transform: ViewTransform): string {
  return `matrix(${transform.scale} 0 0 ${-transform.scale} ${transform.offsetX} ${transform.offsetY})`
}

export function worldToScreen(point: Vec2, transform: ViewTransform): Vec2 {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: transform.offsetY - point.y * transform.scale,
  }
}

export function screenToWorld(point: Vec2, transform: ViewTransform): Vec2 {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (transform.offsetY - point.y) / transform.scale,
  }
}
