import { useEffect, useState } from 'react'

import './App.css'
import { computePositions } from './api/client'
import type { ComputePositionsResponse, PositionResponse } from './api/client'
import { parseFormationConfig } from './config/schema'
import type { FormationConfig } from './config/schema'
import { resolveMode } from './gameController'
import {
  FIELD_POSITION_PADDING_METRES,
  FIELD_SIZE_OPTIONS,
  clampPointToBounds,
  clampPointToField,
  getBenchPosition,
  getFieldBounds,
  getFieldDimensions,
  getPaddedPlayerBounds,
} from './geom/field'
import type { FieldSize } from './geom/field'
import { useDebouncedValue } from './hooks/useDebouncedValue'
import { Controls } from './ui/Controls'
import { FieldView } from './ui/FieldView'
import { DEFAULT_ADVERTISED_STATE, ROBOT_IDS } from './types'
import type { AdvertisedGameControllerState, RobotId, Vec2 } from './types'

type LoadedFormationState = {
  config: FormationConfig
  fileName: string
  displayName?: string
  warnings: string[]
}

type RobotPositionMap = Partial<Record<RobotId, Vec2>>

const DEFAULT_FIELD =
  FIELD_SIZE_OPTIONS[Math.floor(FIELD_SIZE_OPTIONS.length / 2)] ??
  FIELD_SIZE_OPTIONS[0]

function App() {
  const [field, setField] = useState<FieldSize>(DEFAULT_FIELD)
  const [gameControllerState, setGameControllerState] =
    useState<AdvertisedGameControllerState>(DEFAULT_ADVERTISED_STATE)
  const [robotCount, setRobotCount] = useState(5)
  const [ball, setBall] = useState<Vec2>({ x: 0, y: 0 })
  const [loadedFormation, setLoadedFormation] =
    useState<LoadedFormationState | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [backendWarnings, setBackendWarnings] = useState<string[]>([])
  const [backendError, setBackendError] = useState<string | null>(null)
  const [positions, setPositions] = useState<RobotPositionMap>({})
  const [showPlayerIds, setShowPlayerIds] = useState(false)

  const dimensions = getFieldDimensions(field)
  const fieldBounds = getFieldBounds(dimensions)
  const activeRobotIds = ROBOT_IDS.slice(0, robotCount)
  const debouncedBall = useDebouncedValue(ball, 80)
  const resolvedMode = resolveMode(gameControllerState)
  const canRenderComputedRobots = loadedFormation !== null && robotCount > 0
  const visiblePositions = canRenderComputedRobots ? positions : {}
  const visibleBackendWarnings = canRenderComputedRobots ? backendWarnings : []
  const visibleBackendError = canRenderComputedRobots ? backendError : null

  useEffect(() => {
    if (!canRenderComputedRobots) {
      return
    }

    let didTimeout = false
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, 3000)

    computePositions(
      {
        version: 1,
        field,
        gameControllerState,
        advertisedStateMode: resolvedMode.advertisedStateMode,
        legacyMode: resolvedMode.legacyMode,
        ball: debouncedBall,
        robotIds: ROBOT_IDS.slice(0, robotCount),
        activePlayers: robotCount,
        formation: loadedFormation.config,
      },
      controller.signal,
    )
      .then((response) => {
        window.clearTimeout(timeoutId)
        setPositions(normalisePositions(response, robotCount, dimensions))
        setBackendWarnings(response.warnings)
        setBackendError(null)
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeoutId)

        if (controller.signal.aborted && !didTimeout) {
          return
        }

        setBackendWarnings([])
        setBackendError(
          didTimeout
            ? 'The Python backend timed out. Showing the last known good positions.'
            : `Backend error: ${
                error instanceof Error ? error.message : 'request failed'
              } Showing the last known good positions.`,
        )
      })

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [
    canRenderComputedRobots,
    debouncedBall,
    dimensions,
    field,
    gameControllerState,
    loadedFormation,
    robotCount,
    resolvedMode.advertisedStateMode,
    resolvedMode.legacyMode,
  ])

  const renderedRobots = activeRobotIds.map((robotId) => {
    const knownPosition = visiblePositions[robotId]

    return {
      id: robotId,
      known: knownPosition !== undefined,
      position: knownPosition ?? getBenchPosition(dimensions, robotId),
    }
  })

  const handleBallAxisChange = (axis: keyof Vec2, value: number) => {
    setBall((currentBall) =>
      clampPointToField({ ...currentBall, [axis]: value }, dimensions),
    )
  }

  const handleFieldChange = (nextField: FieldSize) => {
    const nextDimensions = getFieldDimensions(nextField)

    setField(nextField)
    setBall((currentBall) => clampPointToField(currentBall, nextDimensions))
  }

  const handleConfigFileSelected = async (file: File | null) => {
    if (!file) {
      return
    }

    try {
      const fileContents = await file.text()
      const parsed = parseFormationConfig(fileContents, file.name)

      setLoadedFormation({
        config: parsed.config,
        fileName: file.name,
        displayName: parsed.config.meta?.name,
        warnings: parsed.warnings,
      })
      setConfigError(null)
    } catch (error) {
      setConfigError(
        error instanceof Error ? error.message : 'Could not load config.',
      )
    }
  }

  const clearConfig = () => {
    setLoadedFormation(null)
    setConfigError(null)
    setBackendWarnings([])
    setBackendError(null)
    setPositions({})
  }

  return (
    <div className="app-shell">
      <Controls
        fieldOptions={FIELD_SIZE_OPTIONS}
        field={field}
        gameControllerState={gameControllerState}
        resolvedAdvertisedStateMode={resolvedMode.advertisedStateMode}
        resolvedLegacyMode={resolvedMode.legacyMode}
        kickingTeamRelation={resolvedMode.kickingTeamRelation}
        robotCount={robotCount}
        ball={ball}
        minBallX={fieldBounds.minX}
        maxBallX={fieldBounds.maxX}
        minBallY={fieldBounds.minY}
        maxBallY={fieldBounds.maxY}
        loadedConfig={
          loadedFormation
            ? {
                fileName: loadedFormation.fileName,
                displayName: loadedFormation.displayName,
                warnings: loadedFormation.warnings,
              }
            : null
        }
        configError={configError}
        showPlayerIds={showPlayerIds}
        onFieldChange={handleFieldChange}
        onGameControllerStateChange={setGameControllerState}
        onRobotCountChange={setRobotCount}
        onBallAxisChange={handleBallAxisChange}
        onConfigFileSelected={handleConfigFileSelected}
        onClearConfig={clearConfig}
        onShowPlayerIdsChange={setShowPlayerIds}
      />

      <main className="visualiser">
        {visibleBackendError ? (
          <div className="banner banner--error" role="alert">
            {visibleBackendError}
          </div>
        ) : null}

        {visibleBackendWarnings.length > 0 ? (
          <div className="banner banner--warning">
            <strong>Backend warnings</strong>
            <ul className="status-list">
              {visibleBackendWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <FieldView
          dimensions={dimensions}
          ball={ball}
          robots={renderedRobots}
          showPlayerIds={showPlayerIds}
          onBallChange={setBall}
        />
      </main>
    </div>
  )
}

function normalisePositions(
  response: ComputePositionsResponse,
  robotCount: number,
  dimensions: ReturnType<typeof getFieldDimensions>,
): RobotPositionMap {
  const nextPositions: RobotPositionMap = {}
  const paddedPlayerBounds = getPaddedPlayerBounds(
    dimensions,
    FIELD_POSITION_PADDING_METRES,
  )

  for (const robotId of ROBOT_IDS.slice(0, robotCount)) {
    const rawPosition = response.positions[String(robotId)]

    if (!isValidPositionResponse(rawPosition)) {
      continue
    }

    nextPositions[robotId] = clampPointToBounds(
      {
        x: rawPosition.x,
        y: rawPosition.y,
      },
      paddedPlayerBounds,
    )
  }

  return nextPositions
}

function isValidPositionResponse(
  position: PositionResponse | undefined,
): position is Extract<PositionResponse, { ok: true }> {
  return (
    position?.ok === true &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y)
  )
}

export default App
