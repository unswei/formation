import type { ChangeEvent } from 'react'

import type { FieldSize } from '../geom/field'
import {
  FORMATION_MODE_LABELS,
  GAME_PHASE_LABELS,
  GAME_PHASE_OPTIONS,
  GAME_STATE_LABELS,
  GAME_STATE_OPTIONS,
  KICKING_TEAM_RELATION_LABELS,
  KICKING_TEAM_RELATION_OPTIONS,
  SET_PLAY_LABELS,
  SET_PLAY_OPTIONS,
} from '../types'
import type {
  AdvertisedGameControllerState,
  FormationMode,
  KickingTeamRelation,
  Vec2,
} from '../types'

type LoadedConfigInfo = {
  fileName: string
  displayName?: string
  warnings: string[]
}

type ControlsProps = {
  appMode: 'view' | 'record'
  fieldOptions: FieldSize[]
  field: FieldSize
  gameControllerState: AdvertisedGameControllerState
  resolvedAdvertisedStateMode: string
  resolvedLegacyMode: FormationMode
  kickingTeamRelation: KickingTeamRelation
  robotCount: number
  ball: Vec2
  minBallX: number
  maxBallX: number
  minBallY: number
  maxBallY: number
  loadedConfig: LoadedConfigInfo | null
  configError: string | null
  showPlayerIds: boolean
  recordingName: string
  onFieldChange: (field: FieldSize) => void
  onGameControllerStateChange: (
    state: AdvertisedGameControllerState,
  ) => void
  onRobotCountChange: (robotCount: number) => void
  onBallAxisChange: (axis: keyof Vec2, value: number) => void
  onConfigFileSelected: (file: File | null) => void
  onClearConfig: () => void
  onShowPlayerIdsChange: (value: boolean) => void
  onStartRecording: () => void
  onStopRecording: () => void
  onSaveRecording: () => void
  onRecordingNameChange: (name: string) => void
}

export function Controls({
  appMode,
  fieldOptions,
  field,
  gameControllerState,
  resolvedAdvertisedStateMode,
  resolvedLegacyMode,
  kickingTeamRelation,
  robotCount,
  ball,
  minBallX,
  maxBallX,
  minBallY,
  maxBallY,
  loadedConfig,
  configError,
  showPlayerIds,
  recordingName,
  onFieldChange,
  onGameControllerStateChange,
  onRobotCountChange,
  onBallAxisChange,
  onConfigFileSelected,
  onClearConfig,
  onShowPlayerIdsChange,
  onStartRecording,
  onStopRecording,
  onSaveRecording,
  onRecordingNameChange,
}: ControlsProps) {
  return (
    <aside className="panel">
      <div className="panel__section">
        <h1 className="panel__title">rUNSWift formation</h1>
        <p className="panel__copy">
          Load a formation JSON file, enter the GameController fields a player
          actually receives, then place the ball to see the computed robot
          layout.
        </p>
      </div>

      <div className="panel__section">
        <label className="control">
          <span className="control__label">Field size</span>
          <select
            value={field}
            onChange={(event) => onFieldChange(event.target.value as FieldSize)}
          >
            {fieldOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="control">
          <span className="control__label">Active players</span>
          <select
            value={robotCount}
            onChange={(event) => onRobotCountChange(Number(event.target.value))}
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index} value={index}>
                {index}
              </option>
            ))}
          </select>
        </label>

        <div className="status-card">
          <p>
            <strong>Resolved advertised-state mode:</strong>{' '}
            {resolvedAdvertisedStateMode}
          </p>
          <p>
            <strong>Legacy fallback mode:</strong>{' '}
            {FORMATION_MODE_LABELS[resolvedLegacyMode]}
          </p>
          <p>
            <strong>Kicking team relation:</strong>{' '}
            {KICKING_TEAM_RELATION_LABELS[kickingTeamRelation]}
          </p>
        </div>
      </div>

      <div className="panel__section">
        <h2 className="panel__section-title">Advertised Game State</h2>

        <label className="control">
          <span className="control__label">Game phase</span>
          <select
            value={gameControllerState.gamePhase}
            onChange={(event) =>
              onGameControllerStateChange({
                ...gameControllerState,
                gamePhase: event.target.value as AdvertisedGameControllerState['gamePhase'],
              })
            }
          >
            {GAME_PHASE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {GAME_PHASE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="control">
          <span className="control__label">State</span>
          <select
            value={gameControllerState.state}
            onChange={(event) =>
              onGameControllerStateChange({
                ...gameControllerState,
                state: event.target.value as AdvertisedGameControllerState['state'],
              })
            }
          >
            {GAME_STATE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {GAME_STATE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="control">
          <span className="control__label">Set play</span>
          <select
            value={gameControllerState.setPlay}
            onChange={(event) =>
              onGameControllerStateChange({
                ...gameControllerState,
                setPlay: event.target.value as AdvertisedGameControllerState['setPlay'],
              })
            }
          >
            {SET_PLAY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {SET_PLAY_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="control">
          <span className="control__label">Own team number</span>
          <input
            type="number"
            min={0}
            max={254}
            step={1}
            value={gameControllerState.ownTeamNumber}
            onChange={(event) => {
              const nextValue = parseIntegerInput(event.target.value)
              if (nextValue !== undefined) {
                const currentRelation = kickingTeamRelation
                onGameControllerStateChange({
                  ...gameControllerState,
                  ownTeamNumber: nextValue,
                  kickingTeam: resolveKickingTeamFromRelation(
                    nextValue,
                    currentRelation,
                  ),
                })
              }
            }}
          />
        </label>

        <label className="control">
          <span className="control__label">Kicking team</span>
          <select
            value={kickingTeamRelation}
            onChange={(event) => {
              const nextRelation =
                event.target.value as KickingTeamRelation
              onGameControllerStateChange({
                ...gameControllerState,
                kickingTeam: resolveKickingTeamFromRelation(
                  gameControllerState.ownTeamNumber,
                  nextRelation,
                ),
              })
            }}
          >
            {KICKING_TEAM_RELATION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {KICKING_TEAM_RELATION_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={gameControllerState.firstHalf}
            onChange={(event) =>
              onGameControllerStateChange({
                ...gameControllerState,
                firstHalf: event.target.checked,
              })
            }
          />
          <span>First half</span>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={gameControllerState.stopped}
            onChange={(event) =>
              onGameControllerStateChange({
                ...gameControllerState,
                stopped: event.target.checked,
              })
            }
          />
          <span>Stopped</span>
        </label>
      </div>

      <div className="panel__section">
        <h2 className="panel__section-title">Ball position</h2>
        <div className="ball-grid">
          <label className="control">
            <span className="control__label">X (m)</span>
            <input
              type="number"
              step="0.1"
              min={minBallX}
              max={maxBallX}
              value={Number(ball.x.toFixed(2))}
              onChange={(event) =>
                handleBallInputChange(event, 'x', onBallAxisChange)
              }
            />
          </label>
          <label className="control">
            <span className="control__label">Y (m)</span>
            <input
              type="number"
              step="0.1"
              min={minBallY}
              max={maxBallY}
              value={Number(ball.y.toFixed(2))}
              onChange={(event) =>
                handleBallInputChange(event, 'y', onBallAxisChange)
              }
            />
          </label>
        </div>
      </div>

      <div className="panel__section">
        <div className="panel__section-header">
          <h2 className="panel__section-title">Formation config</h2>
          {loadedConfig ? (
            <button
              className="secondary-button"
              type="button"
              onClick={onClearConfig}
            >
              Clear
            </button>
          ) : null}
        </div>

        <label className="file-picker">
          <span>Load JSON file</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              onConfigFileSelected(event.target.files?.[0] ?? null)
              event.target.value = ''
            }}
          />
        </label>

        {loadedConfig ? (
          <div className="status-card">
            <p>
              <strong>File:</strong> {loadedConfig.fileName}
            </p>
            {loadedConfig.displayName ? (
              <p>
                <strong>Name:</strong> {loadedConfig.displayName}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="status-card status-card--muted">
            No formation loaded. Active robots stay on the bench until a config
            is available.
          </div>
        )}

        {configError ? (
          <div className="status-card status-card--error" role="alert">
            {configError}
          </div>
        ) : null}

        {loadedConfig && loadedConfig.warnings.length > 0 ? (
          <div className="status-card status-card--warning">
            <strong>Validation warnings</strong>
            <ul className="status-list">
              {loadedConfig.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="panel__section">
        <h2 className="panel__section-title">Display</h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showPlayerIds}
            onChange={(event) => onShowPlayerIdsChange(event.target.checked)}
          />
          <span>Show player IDs</span>
        </label>
      </div>

      <div className="panel__section panel__section--mode-controls">
        <div className="panel__section-header">
          <h2 className="panel__section-title">Recording / view</h2>
          {appMode === 'record' ? (
            <button
              className="secondary-button"
              type="button"
              onClick={onStopRecording}
            >
              View
            </button>
          ) : null}
        </div>
        {appMode === 'record' ? (
          <>
            <label className="control">
              <span className="control__label">Formation name</span>
              <input
                type="text"
                value={recordingName}
                onChange={(event) => onRecordingNameChange(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              type="button"
              onClick={onSaveRecording}
            >
              Save formation
            </button>
          </>
        ) : (
          <button
            className="secondary-button"
            type="button"
            onClick={onStartRecording}
          >
            Record new formation
          </button>
        )}
      </div>
    </aside>
  )
}

function parseIntegerInput(value: string): number | undefined {
  const parsedValue = Number(value)

  if (Number.isInteger(parsedValue) && parsedValue >= 0 && parsedValue <= 254) {
    return parsedValue
  }

  return undefined
}

function resolveKickingTeamFromRelation(
  ownTeamNumber: number,
  relation: KickingTeamRelation,
): number | null {
  switch (relation) {
    case 'none':
      return null
    case 'us':
      return ownTeamNumber
    case 'them':
      return ownTeamNumber === 254 ? 0 : ownTeamNumber + 1
  }
}

function handleBallInputChange(
  event: ChangeEvent<HTMLInputElement>,
  axis: keyof Vec2,
  onBallAxisChange: (axis: keyof Vec2, value: number) => void,
) {
  const parsedValue = Number(event.target.value)

  if (Number.isFinite(parsedValue)) {
    onBallAxisChange(axis, parsedValue)
  }
}
