import { describe, expect, it } from 'vitest'

import { parseFormationConfig } from './schema'

describe('formation config parsing', () => {
  it('keeps valid robot configs and warns for ignored entries', () => {
    const result = parseFormationConfig(
      JSON.stringify({
        version: 1,
        defaults: {
          attraction: { x: 1.2 },
        },
        modes: {
          normal_play: {
            robots: {
              '1': { offset: { x: -0.4, y: 0.2 } },
              '12': { offset: { x: 0, y: 0 } },
            },
          },
          unsupported_mode: {
            robots: {},
          },
        },
      }),
    )

    expect(result.config.modes.normal_play?.robots['1']).toEqual({
      offset: { x: -0.4, y: 0.2 },
    })
    expect(result.config.modes.normal_play?.robots['12']).toBeUndefined()
    expect(result.warnings).toContain(
      'Ignoring robot key "12" at modes.normal_play.robots.',
    )
    expect(result.warnings).toContain(
      'Ignoring unknown play mode "unsupported_mode".',
    )
  })

  it('rejects non-version-1 configs', () => {
    expect(() =>
      parseFormationConfig(JSON.stringify({ version: 2, modes: {} })),
    ).toThrow('must declare "version": 1')
  })

  it('normalises legacy mode aliases to canonical names', () => {
    const result = parseFormationConfig(
      JSON.stringify({
        version: 1,
        modes: {
          penalty_us: {
            robots: {
              '1': { offset: { x: 0, y: 0 } },
            },
          },
        },
      }),
    )

    expect(result.config.modes.penalty_kick_us?.robots['1']).toEqual({
      offset: { x: 0, y: 0 },
    })
    expect(result.warnings).toContain(
      'Normalising legacy play mode "penalty_us" to "penalty_kick_us".',
    )
  })

  it('accepts exact advertised-state mode keys', () => {
    const result = parseFormationConfig(
      JSON.stringify({
        version: 1,
        modes: {
          advertised__phase_normal__state_ready__set_play_none__kicking_none:
            {
              robots: {
                '1': { offset: { x: -1, y: 0 } },
              },
            },
        },
      }),
    )

    expect(
      result.config.modes[
        'advertised__phase_normal__state_ready__set_play_none__kicking_none'
      ]?.robots['1'],
    ).toEqual({
      offset: { x: -1, y: 0 },
    })
  })

  it('parses min/max axis limits wherever minX is accepted', () => {
    const result = parseFormationConfig(
      JSON.stringify({
        version: 1,
        defaults: { minX: -4, maxX: 5, minY: -3, maxY: 3 },
        modes: {
          normal_play: {
            defaults: { minX: -3, maxX: 4, minY: -2, maxY: 2 },
            robots: {
              '1': {
                offset: { x: 0, y: 0 },
                minX: -2,
                maxX: 3,
                minY: -1,
                maxY: 1,
              },
            },
          },
        },
      }),
    )

    expect(result.config.defaults).toMatchObject({
      minX: -4,
      maxX: 5,
      minY: -3,
      maxY: 3,
    })
    expect(result.config.modes.normal_play?.defaults).toMatchObject({
      minX: -3,
      maxX: 4,
      minY: -2,
      maxY: 2,
    })
    expect(result.config.modes.normal_play?.robots['1']).toMatchObject({
      minX: -2,
      maxX: 3,
      minY: -1,
      maxY: 1,
    })
  })
})
