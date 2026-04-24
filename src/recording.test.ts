import { describe, expect, it } from 'vitest'

import {
  copyModeConfig,
  createRecordingDraft,
  inferRobotConfig,
  mirrorRobotConfigY,
  normaliseFileName,
  serialiseFormation,
} from './recording'

describe('recording helpers', () => {
  it('infers attraction and offset from two samples', () => {
    const result = inferRobotConfig(
      {
        a: {
          ball: { x: 0, y: 0 },
          player: { x: -1, y: 1 },
        },
        b: {
          ball: { x: 2, y: 1 },
          player: { x: 0, y: 3 },
        },
      },
      { minX: -4, maxX: 4, minY: -3, maxY: 4 },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.robot).toMatchObject({
        attraction: { x: 0.5, y: 2 },
        offset: { x: -1, y: 1 },
        minX: -4,
        maxX: 4,
        minY: -3,
        maxY: 4,
      })
    }
  })

  it('rejects samples when ball movement is too small', () => {
    const result = inferRobotConfig(
      {
        a: {
          ball: { x: 0, y: 0 },
          player: { x: -1, y: 1 },
        },
        b: {
          ball: { x: 0.1, y: 0.1 },
          player: { x: 0, y: 3 },
        },
      },
      { minX: -4, maxX: 4, minY: -3, maxY: 3 },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.warnings).toContain(
        'Move the ball at least 0.25 m in x between samples.',
      )
      expect(result.warnings).toContain(
        'Move the ball at least 0.25 m in y between samples.',
      )
    }
  })

  it('creates a draft from an existing formation', () => {
    const draft = createRecordingDraft(
      {
        version: 1,
        meta: { name: 'Existing' },
        defaults: { minX: -2, maxX: 3, minY: -4, maxY: 4 },
        modes: {
          normal_play: {
            robots: {
              '1': { offset: { x: 0, y: 0 } },
            },
          },
        },
      },
      'New name',
    )

    expect(draft.meta?.name).toBe('New name')
    expect(draft.defaults).toEqual({ minX: -2, maxX: 3, minY: -4, maxY: 4 })
    expect(draft.modes.normal_play.robots['1']).toEqual({
      offset: { x: 0, y: 0 },
    })
  })

  it('serialises stable JSON and normalises filenames', () => {
    const json = serialiseFormation({
      version: 1,
      meta: { name: 'Recorded Shape' },
      modes: {
        normal_play: {
          robots: {
            '1': {
              offset: { x: 1, y: 2 },
              maxX: 4,
              minY: -3,
              maxY: 3,
            },
          },
        },
      },
    })

    expect(JSON.parse(json)).toEqual({
      version: 1,
      meta: { name: 'Recorded Shape' },
      modes: {
        normal_play: {
          robots: {
            '1': {
              offset: { x: 1, y: 2 },
              maxX: 4,
              minY: -3,
              maxY: 3,
            },
          },
        },
      },
    })
    expect(normaliseFileName('Recorded Shape')).toBe('recorded-shape.json')
  })

  it('mirrors another robot config across y', () => {
    expect(
      mirrorRobotConfigY(
        {
          offset: { x: -1.2, y: 0.4 },
          attraction: { x: 0.5, y: 0.25 },
          minX: -4,
          maxX: 2,
          minY: -1,
          maxY: 3,
        },
        { minX: -4, maxX: 2, minY: -1, maxY: 3 },
      ),
    ).toEqual({
      offset: { x: -1.2, y: -0.4 },
      attraction: { x: 0.5, y: 0.25 },
      minX: -4,
      maxX: 2,
      minY: -3,
      maxY: 1,
    })
  })

  it('copies an existing mode into a new advertised mode', () => {
    const copied = copyModeConfig(
      {
        version: 1,
        modes: {
          normal_play: {
            robots: {
              '1': {
                offset: { x: -1, y: 0 },
                attraction: { x: 0.5, y: 1 },
              },
            },
          },
          'advertised__phase_normal__state_ready__set_play_none__kicking_none':
            {
              robots: {},
            },
        },
      },
      'normal_play',
      'advertised__phase_normal__state_ready__set_play_none__kicking_none',
    )

    expect(
      copied.modes[
        'advertised__phase_normal__state_ready__set_play_none__kicking_none'
      ]?.robots['1'],
    ).toEqual({
      offset: { x: -1, y: 0 },
      attraction: { x: 0.5, y: 1 },
    })
  })
})
