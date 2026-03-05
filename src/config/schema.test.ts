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
})
