# Formation JSON notes

This folder contains example formation files for the visualiser.

If you want a good starting point, use
[normal_play_5_players.json](normal_play_5_players.json).

## What the app expects

The formation file is JSON with a small top-level structure:

```json
{
  "version": 1,
  "meta": {
    "name": "Example formation"
  },
  "defaults": {
    "attraction": { "x": 0.7, "y": 0.5 },
    "minX": -4.0
  },
  "modes": {
    "normal_play": {
      "defaults": {
        "attraction": { "x": 0.8 }
      },
      "robots": {
        "1": {
          "offset": { "x": -4.2, "y": 0.0 },
          "attraction": { "x": 0.2, "y": 0.1 },
          "minX": -4.5
        }
      }
    }
  }
}
```

## More details

- `version` must be `1`.
- `meta` is optional and is just for human-friendly details like a name or notes.
- `defaults` sets shared values for every robot unless something more specific overrides them.
- `modes` is where the actual formation layouts live.
- Each mode contains a `robots` object keyed by robot ID as strings: `"1"` to `"11"`.
- Each robot needs an `offset` with `x` and `y`.

## Supported play modes

These are the mode names the frontend understands:

- `normal_play`
- `kickoff_us`
- `kickoff_them`
- `goal_kick_us`
- `goal_kick_them`
- `corner_us`
- `corner_them`
- `penalty_us`
- `penalty_them`

If a requested mode is missing, the backend falls back to `normal_play`.

Unknown mode names in the JSON are ignored with a warning.

## How positions are worked out in v0

For now the backend uses this simple rule:

```text
base.x = max(minX, ball.x * attraction.x + offset.x)
base.y =           ball.y * attraction.y + offset.y
```

So:

- `offset` is the robot's basic shape relative to the ball.
- `attraction.x` and `attraction.y` control how strongly the robot follows the ball.
- `minX` acts as a left-side clipping limit, so the robot cannot be pulled further left than that value.

There is no `maxX` clipping in the config for v0.

## Override order

Values are resolved from most specific to least specific:

1. Robot override inside the active mode
2. Mode `defaults`
3. Top-level `defaults`
4. Built-in fallback values

Built-in fallback values are:

- `attraction.x = 1`
- `attraction.y = 1`
- `minX = -Infinity`

## What the fields mean

### `offset`

This is required per robot.

- `x`: how far behind or ahead of the ball the robot sits
- `y`: how far above or below the ball the robot sits

Negative `x` means deeper towards your own goal. Positive `y` means towards the
top touchline.

### `attraction`

This is optional and can be set globally, per mode, or per robot.

- `1.0` means the robot follows the ball directly on that axis
- less than `1.0` means softer movement
- greater than `1.0` means more aggressive movement

### `minX`

Optional, main "clipping" value in the formation file.

Examples:

- `minY: -4.5` keeps a player from drifting too far left
- `minX: -1.5` keeps a player from dropping back too deep

## Missing or partial configs

- If no config is loaded, all active robots stay on the bench.
- If a robot is missing from the active mode, that robot goes to the bench.
- If a mode is missing, the backend tries `normal_play`.
- If a robot position comes back invalid, the frontend treats it as unknown and benches it.

## About visibility in the UI

The config can place robots off the field. For v0 the frontend clamps computed
positions to a padded visible region around the field so they do not disappear
entirely, and unknown robots are shown on the bench to the right.
