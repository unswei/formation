import type { FormationConfig } from '../config/schema'
import type { FieldSize } from '../geom/field'
import type { PlayMode, RobotId, Vec2 } from '../types'

export type ComputePositionsRequest = {
  version: 1
  field: FieldSize
  playMode: PlayMode
  ball: Vec2
  robotIds: RobotId[]
  activePlayers: number
  formation: FormationConfig
}

export type PositionResponse =
  | {
      ok: true
      x: number
      y: number
    }
  | {
      ok: false
      reason: string
    }

export type ComputePositionsResponse = {
  version: 1
  positions: Record<string, PositionResponse>
  warnings: string[]
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export async function computePositions(
  request: ComputePositionsRequest,
  signal: AbortSignal,
): Promise<ComputePositionsResponse> {
  const response = await fetch(`${API_BASE_URL}/compute_positions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal,
  })

  if (!response.ok) {
    const responseText = await response.text()
    throw new Error(
      responseText || `Backend request failed with ${response.status}.`,
    )
  }

  return (await response.json()) as ComputePositionsResponse
}
