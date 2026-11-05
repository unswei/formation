import { useEffect, useState } from 'react'

import './App.css'
import { computePositions } from './api/client'
import type { ComputePositionsResponse, PositionResponse } from './api/client'
import { parseFormationConfig } from './config/schema'
import type { FormationConfig, RobotConfig } from './config/schema'
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
import {
  copyModeConfig,
  createRecordingDraft,
  ensureMode,
  getModeCompletion,
  getPlayerLimits,
  getRecordedPlayerPosition,
  inferRobotConfig,
  mirrorRobotConfigY,
  normaliseFileName,
  serialiseFormation,
  setPlayerLimits,
  updateRecordedPlayer,
} from './recording'
import type { PlayerLimits, RecordingSampleMap } from './recording'
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
type AppMode = 'view' | 'record'
type RecordingInteractionMode = 'position' | 'test'
type EditableRobotConfigField =
  | 'offsetX'
  | 'offsetY'
  | 'attractionX'
  | 'attractionY'
  | keyof PlayerLimits

const DEFAULT_FIELD =
  FIELD_SIZE_OPTIONS[Math.floor(FIELD_SIZE_OPTIONS.length / 2)] ??
  FIELD_SIZE_OPTIONS[0]

function App() {
  const [appMode, setAppMode] = useState<AppMode>('view')
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
  const [visualScale, setVisualScale] = useState(1)
  const [recordingInteractionMode, setRecordingInteractionMode] =
    useState<RecordingInteractionMode>('position')
  const [recordingName, setRecordingName] = useState('Recorded formation')
  const [recordingDraft, setRecordingDraft] = useState<FormationConfig | null>(
    null,
  )
  const [selectedRobotId, setSelectedRobotId] = useState<RobotId>(ROBOT_IDS[0])
  const [recordedPositions, setRecordedPositions] = useState<
    Record<string, Partial<Record<RobotId, Vec2>>>
  >({})
  const [recordingSamples, setRecordingSamples] = useState<RecordingSampleMap>(
    {},
  )
  const [visitedModeKeys, setVisitedModeKeys] = useState<string[]>([])
  const [mirrorSourceRobotId, setMirrorSourceRobotId] =
    useState<RobotId>(ROBOT_IDS[1])
  const [copySourceModeKey, setCopySourceModeKey] = useState('')

  const dimensions = getFieldDimensions(field)
  const fieldBounds = getFieldBounds(dimensions)
  const activeRobotIds = ROBOT_IDS.slice(0, robotCount)
  const debouncedBall = useDebouncedValue(ball, 80)
  const resolvedMode = resolveMode(gameControllerState)
  const activeModeKey = resolvedMode.advertisedStateMode
  const canRenderComputedRobots = loadedFormation !== null && robotCount > 0
  const visiblePositions = canRenderComputedRobots ? positions : {}
  const visibleBackendWarnings = canRenderComputedRobots ? backendWarnings : []
  const visibleBackendError = canRenderComputedRobots ? backendError : null

  useEffect(() => {
    if (appMode === 'record' || !canRenderComputedRobots) {
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
    appMode,
    debouncedBall,
    dimensions,
    field,
    gameControllerState,
    loadedFormation,
    robotCount,
    resolvedMode.advertisedStateMode,
    resolvedMode.legacyMode,
  ])

  useEffect(() => {
    let socket: WebSocket | null = null
    let reconnectTimeoutId: number | null = null
    let isCleanup = false

    function connect() {
      if (isCleanup) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const url = `${protocol}//${host}/api/gamecontroller/ws`

      socket = new WebSocket(url)

      socket.onmessage = (event) => {
        try {
          const received = JSON.parse(event.data)
          if (received && typeof received === 'object') {
            setGameControllerState((prev) => {
              const teamNumbers = Array.isArray(received.teamNumbers) ? received.teamNumbers : []
              const ownTeamNumber =
                prev.ownTeamNumber === 0 || !teamNumbers.includes(prev.ownTeamNumber)
                  ? (teamNumbers[0] ?? prev.ownTeamNumber)
                  : prev.ownTeamNumber

              return {
                ...prev,
                gamePhase: received.gamePhase ?? prev.gamePhase,
                state: received.state ?? prev.state,
                setPlay: received.setPlay ?? prev.setPlay,
                firstHalf: typeof received.firstHalf === 'boolean' ? received.firstHalf : prev.firstHalf,
                stopped: typeof received.stopped === 'boolean' ? received.stopped : prev.stopped,
                kickingTeam: received.kickingTeam !== undefined ? received.kickingTeam : prev.kickingTeam,
                ownTeamNumber,
              }
            })
          }
        } catch (err) {
          console.error('Failed to parse GameController websocket message:', err)
        }
      }

      socket.onclose = () => {
        if (!isCleanup) {
          reconnectTimeoutId = window.setTimeout(connect, 3000)
        }
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      isCleanup = true
      if (socket) {
        socket.close()
      }
      if (reconnectTimeoutId !== null) {
        window.clearTimeout(reconnectTimeoutId)
      }
    }
  }, [])


  const selectedRobotLimits =
    appMode === 'record'
      ? getPlayerLimits(recordingDraft, activeModeKey, selectedRobotId, dimensions)
      : null
  const selectedRobotConfig =
    appMode === 'record'
      ? recordingDraft?.modes[activeModeKey]?.robots[String(selectedRobotId)]
      : undefined

  const selectedRobotSamples =
    recordingSamples[activeModeKey]?.[selectedRobotId] ?? {}
  const selectedRobotPosition =
    appMode === 'record'
      ? getRecordingRobotPosition(
          robotIdToNumber(selectedRobotId),
          activeModeKey,
          recordingDraft,
          recordedPositions,
          debouncedBall,
          dimensions,
        )
      : undefined
  const inferenceResult =
    appMode === 'record' && selectedRobotLimits
      ? inferRobotConfig(selectedRobotSamples, selectedRobotLimits)
      : null
  const canTestRecordedParameters =
    inferenceResult?.ok === true || selectedRobotConfig !== undefined
  const effectiveRecordingInteractionMode =
    recordingInteractionMode === 'test' && canTestRecordedParameters
      ? 'test'
      : 'position'
  const completion =
    appMode === 'record'
      ? getModeCompletion(recordingDraft, activeModeKey, activeRobotIds)
      : null

  const renderedRobots = activeRobotIds.map((robotId) => {
    const recordingManualPositions =
      effectiveRecordingInteractionMode === 'position' &&
      robotId === selectedRobotId
        ? recordedPositions
        : {}
    const knownPosition =
      appMode === 'record'
        ? getRecordingRobotPosition(
            robotId,
            activeModeKey,
            recordingDraft,
            recordingManualPositions,
            debouncedBall,
            dimensions,
          )
        : visiblePositions[robotId]

    return {
      id: robotId,
      known: appMode === 'record' || knownPosition !== undefined,
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

  const handleGameControllerStateChange = (
    nextState: AdvertisedGameControllerState,
  ) => {
    const nextModeKey = resolveMode(nextState).advertisedStateMode

    setGameControllerState(nextState)
    if (appMode === 'record') {
      setVisitedModeKeys((currentKeys) =>
        currentKeys.includes(nextModeKey)
          ? currentKeys
          : [...currentKeys, nextModeKey],
      )
      setRecordingDraft((currentDraft) =>
        currentDraft ? ensureMode(currentDraft, nextModeKey) : currentDraft,
      )
    }
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

  const startRecording = () => {
    const name = loadedFormation?.displayName ?? loadedFormation?.fileName ?? recordingName
    const draft = ensureMode(
      createRecordingDraft(loadedFormation?.config ?? null, name),
      activeModeKey,
    )

    setRecordingName(draft.meta?.name ?? name)
    setRecordingDraft(draft)
    setRecordedPositions({})
    setRecordingSamples({})
    setVisitedModeKeys([activeModeKey])
    setRecordingInteractionMode('position')
    setCopySourceModeKey('')
    setAppMode('record')
  }

  const stopRecording = () => {
    setRecordingInteractionMode('position')
    setAppMode('view')
  }

  const updateRecordedRobotPosition = (robotId: RobotId, position: Vec2) => {
    setSelectedRobotId(robotId)
    setRecordedPositions((currentPositions) => ({
      ...currentPositions,
      [activeModeKey]: {
        ...currentPositions[activeModeKey],
        [robotId]: position,
      },
    }))
  }

  const updateSelectedLimit = (limit: keyof PlayerLimits, value: number) => {
    if (!recordingDraft || !selectedRobotLimits) {
      return
    }

    const nextLimits: PlayerLimits = {
      ...selectedRobotLimits,
      [limit]: value,
    }

    setRecordingDraft(
      setPlayerLimits(recordingDraft, activeModeKey, selectedRobotId, nextLimits),
    )
  }

  const captureSample = (sampleKey: 'a' | 'b') => {
    if (!selectedRobotPosition) {
      return
    }

    const sample = {
      ball,
      player: selectedRobotPosition,
    }
    const nextSamples = {
      ...selectedRobotSamples,
      [sampleKey]: sample,
    }

    setRecordingSamples((currentSamples) => ({
      ...currentSamples,
      [activeModeKey]: {
        ...currentSamples[activeModeKey],
        [selectedRobotId]: nextSamples,
      },
    }))

    if (!recordingDraft || !selectedRobotLimits) {
      return
    }

    const result = inferRobotConfig(nextSamples, selectedRobotLimits)
    if (result.ok) {
      setRecordingDraft(
        updateRecordedPlayer(
          recordingDraft,
          activeModeKey,
          selectedRobotId,
          result.robot,
        ),
      )
    }
  }

  const updateSelectedRobotConfig = (
    field: EditableRobotConfigField,
    value: number,
  ) => {
    if (!recordingDraft || !selectedRobotLimits) {
      return
    }

    const currentRobot = selectedRobotConfig ?? {
      offset: { x: 0, y: 0 },
      attraction: { x: 1, y: 1 },
      minX: selectedRobotLimits.minX,
      maxX: selectedRobotLimits.maxX,
      minY: selectedRobotLimits.minY,
      maxY: selectedRobotLimits.maxY,
    }
    const nextRobot = updateRobotConfigField(currentRobot, field, value)

    setRecordingDraft(
      updateRecordedPlayer(
        recordingDraft,
        activeModeKey,
        selectedRobotId,
        nextRobot,
      ),
    )
  }

  const mirrorSelectedRobotFromSource = () => {
    if (!recordingDraft || mirrorSourceRobotId === selectedRobotId) {
      return
    }

    const sourceRobot =
      recordingDraft.modes[activeModeKey]?.robots[String(mirrorSourceRobotId)]
    if (!sourceRobot) {
      return
    }

    const sourceLimits = getPlayerLimits(
      recordingDraft,
      activeModeKey,
      mirrorSourceRobotId,
      dimensions,
    )

    setRecordingDraft(
      updateRecordedPlayer(
        recordingDraft,
        activeModeKey,
        selectedRobotId,
        mirrorRobotConfigY(sourceRobot, sourceLimits),
      ),
    )
  }

  const copyActiveModeFromSource = () => {
    if (!recordingDraft || !copySourceModeKey) {
      return
    }

    setRecordingDraft(
      copyModeConfig(recordingDraft, copySourceModeKey, activeModeKey),
    )
    setRecordedPositions((currentPositions) =>
      omitRecordKey(currentPositions, activeModeKey),
    )
    setRecordingSamples((currentSamples) =>
      omitRecordKey(currentSamples, activeModeKey),
    )
  }

  const saveRecording = () => {
    if (!recordingDraft) {
      return
    }

    const draft = {
      ...recordingDraft,
      meta: {
        ...(recordingDraft.meta ?? {}),
        name: recordingName.trim() || 'Recorded formation',
      },
    }
    const blob = new Blob([serialiseFormation(draft)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = normaliseFileName(draft.meta.name ?? recordingName)
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <Controls
        appMode={appMode}
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
          appMode === 'record' && recordingDraft
            ? {
                fileName: normaliseFileName(recordingName),
                displayName: recordingName,
                warnings: [],
              }
            : loadedFormation
            ? {
                fileName: loadedFormation.fileName,
                displayName: loadedFormation.displayName,
                warnings: loadedFormation.warnings,
              }
            : null
        }
        configError={configError}
        showPlayerIds={showPlayerIds}
        recordingName={recordingName}
        onFieldChange={handleFieldChange}
        onGameControllerStateChange={handleGameControllerStateChange}
        onRobotCountChange={setRobotCount}
        onBallAxisChange={handleBallAxisChange}
        onConfigFileSelected={handleConfigFileSelected}
        onClearConfig={clearConfig}
        onShowPlayerIdsChange={setShowPlayerIds}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onSaveRecording={saveRecording}
        onRecordingNameChange={setRecordingName}
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

        <VisualScaleControl
          visualScale={visualScale}
          onVisualScaleChange={setVisualScale}
        />

        <FieldView
          dimensions={dimensions}
          ball={ball}
          robots={renderedRobots}
          showPlayerIds={showPlayerIds}
          selectedRobotId={appMode === 'record' ? selectedRobotId : null}
          recording={
            appMode === 'record' &&
            effectiveRecordingInteractionMode === 'position'
          }
          selectedRobotLimits={
            effectiveRecordingInteractionMode === 'position'
              ? selectedRobotLimits
              : null
          }
          visualScale={visualScale}
          onBallChange={setBall}
          onRobotSelect={setSelectedRobotId}
          onRobotPositionChange={updateRecordedRobotPosition}
          onRobotLimitChange={updateSelectedLimit}
        />
        {appMode === 'record' && selectedRobotLimits && completion ? (
          <RecordingPanel
            activeModeKey={activeModeKey}
            canTestRecordedParameters={canTestRecordedParameters}
            completion={completion}
            copySourceModeKey={copySourceModeKey}
            inferenceResult={inferenceResult}
            limits={selectedRobotLimits}
            mirrorSourceRobotId={mirrorSourceRobotId}
            modeOptions={Object.keys(recordingDraft?.modes ?? {}).sort()}
            recordingInteractionMode={effectiveRecordingInteractionMode}
            robotConfig={selectedRobotConfig}
            robotId={selectedRobotId}
            robotOptions={activeRobotIds}
            samples={selectedRobotSamples}
            visitedModeKeys={visitedModeKeys}
            onCopySourceModeChange={setCopySourceModeKey}
            onCopyActiveModeFromSource={copyActiveModeFromSource}
            onCaptureSample={captureSample}
            onMirrorSourceRobotChange={setMirrorSourceRobotId}
            onMirrorSelectedRobotFromSource={mirrorSelectedRobotFromSource}
            onRobotConfigFieldChange={updateSelectedRobotConfig}
            onRecordingInteractionModeChange={setRecordingInteractionMode}
          />
        ) : null}
      </main>
    </div>
  )
}

function RecordingPanel({
  activeModeKey,
  canTestRecordedParameters,
  completion,
  copySourceModeKey,
  inferenceResult,
  limits,
  mirrorSourceRobotId,
  modeOptions,
  recordingInteractionMode,
  robotConfig,
  robotId,
  robotOptions,
  samples,
  visitedModeKeys,
  onCopySourceModeChange,
  onCopyActiveModeFromSource,
  onCaptureSample,
  onMirrorSourceRobotChange,
  onMirrorSelectedRobotFromSource,
  onRobotConfigFieldChange,
  onRecordingInteractionModeChange,
}: {
  activeModeKey: string
  canTestRecordedParameters: boolean
  completion: { complete: number; total: number; missing: RobotId[] }
  copySourceModeKey: string
  inferenceResult: ReturnType<typeof inferRobotConfig> | null
  limits: PlayerLimits
  mirrorSourceRobotId: RobotId
  modeOptions: string[]
  recordingInteractionMode: RecordingInteractionMode
  robotConfig: RobotConfig | undefined
  robotId: RobotId
  robotOptions: RobotId[]
  samples: NonNullable<RecordingSampleMap[string][RobotId]>
  visitedModeKeys: string[]
  onCopySourceModeChange: (modeKey: string) => void
  onCopyActiveModeFromSource: () => void
  onCaptureSample: (sampleKey: 'a' | 'b') => void
  onMirrorSourceRobotChange: (robotId: RobotId) => void
  onMirrorSelectedRobotFromSource: () => void
  onRobotConfigFieldChange: (
    field: EditableRobotConfigField,
    value: number,
  ) => void
  onRecordingInteractionModeChange: (mode: RecordingInteractionMode) => void
}) {
  const editableConfig = robotConfig ?? {
    offset: { x: 0, y: 0 },
    attraction: { x: 1, y: 1 },
    minX: limits.minX,
    maxX: limits.maxX,
    minY: limits.minY,
    maxY: limits.maxY,
  }
  const availableMirrorRobotIds = robotOptions.filter(
    (option) => option !== robotId,
  )
  const availableSourceModes = modeOptions.filter(
    (modeKey) => modeKey !== activeModeKey,
  )

  return (
    <section className="recording-panel">
      <div className="recording-panel__header">
        <div>
          <h2>Recording player {robotId}</h2>
          <p>{activeModeKey}</p>
        </div>
        <div className="recording-panel__status">
          {completion.complete}/{completion.total} complete
        </div>
      </div>

      <div className="segmented-control" aria-label="Recording interaction mode">
        <button
          className={
            recordingInteractionMode === 'position'
              ? 'segmented-control__button segmented-control__button--active'
              : 'segmented-control__button'
          }
          type="button"
          onClick={() => onRecordingInteractionModeChange('position')}
        >
          Position objects
        </button>
        <button
          className={
            recordingInteractionMode === 'test'
              ? 'segmented-control__button segmented-control__button--active'
              : 'segmented-control__button'
          }
          type="button"
          disabled={!canTestRecordedParameters}
          onClick={() => onRecordingInteractionModeChange('test')}
        >
          Test parameters
        </button>
      </div>

      <div className="recording-grid">
        <button type="button" onClick={() => onCaptureSample('a')}>
          Capture sample A
        </button>
        <button type="button" onClick={() => onCaptureSample('b')}>
          Capture sample B
        </button>
        <ParameterValue label="Sample A" value={formatSample(samples.a)} />
        <ParameterValue label="Sample B" value={formatSample(samples.b)} />
        <ParameterValue label="minX" value={limits.minX.toFixed(2)} />
        <ParameterValue label="maxX" value={limits.maxX.toFixed(2)} />
        <ParameterValue label="minY" value={limits.minY.toFixed(2)} />
        <ParameterValue label="maxY" value={limits.maxY.toFixed(2)} />
        {inferenceResult?.ok ? (
          <>
            <ParameterValue
              label="attraction.x"
              value={inferenceResult.robot.attraction?.x?.toFixed(4) ?? '-'}
            />
            <ParameterValue
              label="attraction.y"
              value={inferenceResult.robot.attraction?.y?.toFixed(4) ?? '-'}
            />
            <ParameterValue
              label="offset.x"
              value={inferenceResult.robot.offset.x.toFixed(4)}
            />
            <ParameterValue
              label="offset.y"
              value={inferenceResult.robot.offset.y.toFixed(4)}
            />
          </>
        ) : null}
      </div>

      <div className="recording-tools">
        <label className="control">
          <span className="control__label">Mirror y from player</span>
          <select
            value={mirrorSourceRobotId}
            onChange={(event) =>
              onMirrorSourceRobotChange(Number(event.target.value) as RobotId)
            }
          >
            {availableMirrorRobotIds.map((option) => (
              <option key={option} value={option}>
                Player {option}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={availableMirrorRobotIds.length === 0}
          onClick={onMirrorSelectedRobotFromSource}
        >
          Mirror into player {robotId}
        </button>
        <label className="control">
          <span className="control__label">Copy current mode from</span>
          <select
            value={copySourceModeKey}
            onChange={(event) => onCopySourceModeChange(event.target.value)}
          >
            <option value="">Choose mode</option>
            {availableSourceModes.map((modeKey) => (
              <option key={modeKey} value={modeKey}>
                {modeKey}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={!copySourceModeKey}
          onClick={onCopyActiveModeFromSource}
        >
          Copy into current mode
        </button>
      </div>

      <div className="recording-parameters">
        <EditableParameter
          label="offset.x"
          value={editableConfig.offset.x}
          onChange={(value) => onRobotConfigFieldChange('offsetX', value)}
        />
        <EditableParameter
          label="offset.y"
          value={editableConfig.offset.y}
          onChange={(value) => onRobotConfigFieldChange('offsetY', value)}
        />
        <EditableParameter
          label="attraction.x"
          value={editableConfig.attraction?.x ?? 1}
          onChange={(value) => onRobotConfigFieldChange('attractionX', value)}
        />
        <EditableParameter
          label="attraction.y"
          value={editableConfig.attraction?.y ?? 1}
          onChange={(value) => onRobotConfigFieldChange('attractionY', value)}
        />
        <EditableParameter
          label="minX"
          value={editableConfig.minX ?? limits.minX}
          onChange={(value) => onRobotConfigFieldChange('minX', value)}
        />
        <EditableParameter
          label="maxX"
          value={editableConfig.maxX ?? limits.maxX}
          onChange={(value) => onRobotConfigFieldChange('maxX', value)}
        />
        <EditableParameter
          label="minY"
          value={editableConfig.minY ?? limits.minY}
          onChange={(value) => onRobotConfigFieldChange('minY', value)}
        />
        <EditableParameter
          label="maxY"
          value={editableConfig.maxY ?? limits.maxY}
          onChange={(value) => onRobotConfigFieldChange('maxY', value)}
        />
      </div>

      {inferenceResult && !inferenceResult.ok ? (
        <ul className="recording-warnings">
          {inferenceResult.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <p className="recording-panel__summary">
        Visited modes: {visitedModeKeys.length}. Missing active players:{' '}
        {completion.missing.length > 0 ? completion.missing.join(', ') : 'none'}.
      </p>
    </section>
  )
}

function EditableParameter({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="editable-parameter">
      <span>{label}</span>
      <input
        type="number"
        step="0.05"
        value={Number(value.toFixed(4))}
        onChange={(event) => {
          const nextValue = Number(event.target.value)
          if (Number.isFinite(nextValue)) {
            onChange(nextValue)
          }
        }}
      />
    </label>
  )
}

function VisualScaleControl({
  visualScale,
  onVisualScaleChange,
}: {
  visualScale: number
  onVisualScaleChange: (scale: number) => void
}) {
  return (
    <div className="visual-scale-control">
      <label>
        Field scale
        <input
          type="range"
          min="0.6"
          max="1.8"
          step="0.05"
          value={visualScale}
          onChange={(event) => onVisualScaleChange(Number(event.target.value))}
        />
      </label>
      <span>{visualScale.toFixed(2)}x</span>
    </div>
  )
}

function ParameterValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="parameter-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatSample(sample: { ball: Vec2; player: Vec2 } | undefined): string {
  if (!sample) {
    return 'not captured'
  }

  return `ball (${sample.ball.x.toFixed(2)}, ${sample.ball.y.toFixed(2)}), player (${sample.player.x.toFixed(2)}, ${sample.player.y.toFixed(2)})`
}

function getRecordingRobotPosition(
  robotId: RobotId,
  activeModeKey: string,
  recordingDraft: FormationConfig | null,
  recordedPositions: Record<string, Partial<Record<RobotId, Vec2>>>,
  ball: Vec2,
  dimensions: ReturnType<typeof getFieldDimensions>,
): Vec2 | undefined {
  return (
    recordedPositions[activeModeKey]?.[robotId] ??
    getRecordedPlayerPosition(
      recordingDraft,
      activeModeKey,
      robotId,
      ball,
      getBenchPosition(dimensions, robotId),
    )
  )
}

function robotIdToNumber(robotId: RobotId): RobotId {
  return robotId
}

function updateRobotConfigField(
  robotConfig: RobotConfig,
  field: EditableRobotConfigField,
  value: number,
): RobotConfig {
  const roundedValue = Number(value.toFixed(4))

  switch (field) {
    case 'offsetX':
      return {
        ...robotConfig,
        offset: { ...robotConfig.offset, x: roundedValue },
      }
    case 'offsetY':
      return {
        ...robotConfig,
        offset: { ...robotConfig.offset, y: roundedValue },
      }
    case 'attractionX':
      return {
        ...robotConfig,
        attraction: {
          ...robotConfig.attraction,
          x: roundedValue,
        },
      }
    case 'attractionY':
      return {
        ...robotConfig,
        attraction: {
          ...robotConfig.attraction,
          y: roundedValue,
        },
      }
    case 'minX':
    case 'maxX':
    case 'minY':
    case 'maxY':
      return {
        ...robotConfig,
        [field]: roundedValue,
      }
  }
}

function omitRecordKey<T>(
  record: Record<string, T>,
  keyToOmit: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== keyToOmit),
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
