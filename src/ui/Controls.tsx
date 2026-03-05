import type { ChangeEvent } from 'react'

import type { FieldSize } from '../geom/field'
import { PLAY_MODE_LABELS, PLAY_MODE_OPTIONS } from '../types'
import type { PlayMode, Vec2 } from '../types'

type LoadedConfigInfo = {
  fileName: string
  displayName?: string
  warnings: string[]
}

type ControlsProps = {
  fieldOptions: FieldSize[]
  field: FieldSize
  playMode: PlayMode
  robotCount: number
  ball: Vec2
  minBallX: number
  maxBallX: number
  minBallY: number
  maxBallY: number
  loadedConfig: LoadedConfigInfo | null
  configError: string | null
  showPlayerIds: boolean
  onFieldChange: (field: FieldSize) => void
  onPlayModeChange: (playMode: PlayMode) => void
  onRobotCountChange: (robotCount: number) => void
  onBallAxisChange: (axis: keyof Vec2, value: number) => void
  onConfigFileSelected: (file: File | null) => void
  onClearConfig: () => void
  onShowPlayerIdsChange: (value: boolean) => void
}

export function Controls({
  fieldOptions,
  field,
  playMode,
  robotCount,
  ball,
  minBallX,
  maxBallX,
  minBallY,
  maxBallY,
  loadedConfig,
  configError,
  showPlayerIds,
  onFieldChange,
  onPlayModeChange,
  onRobotCountChange,
  onBallAxisChange,
  onConfigFileSelected,
  onClearConfig,
  onShowPlayerIdsChange,
}: ControlsProps) {
  return (
    <aside className="panel">
      <div className="panel__section">
        <h1 className="panel__title">Soccer field formation visualiser</h1>
        <p className="panel__copy">
          Load a formation JSON file, choose the play mode, then place the ball
          to see the backend-computed robot layout.
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

        <label className="control">
          <span className="control__label">Play mode</span>
          <select
            value={playMode}
            onChange={(event) =>
              onPlayModeChange(event.target.value as PlayMode)
            }
          >
            {PLAY_MODE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {PLAY_MODE_LABELS[option]}
              </option>
            ))}
          </select>
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
    </aside>
  )
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
