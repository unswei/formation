# Formation Player Template

This folder contains a pure Python reference implementation for selecting a
formation mode and computing one player's target position from a formation JSON
file.

It is intended as a template for player-side code. It has no FastAPI, browser,
or project runtime dependencies.

## Function

```python
from formation_player import compute_player_position

position = compute_player_position(
    formation=formation_json,
    player_number=1,
    game_phase="normal",
    state="playing",
    set_play="none",
    kicking_team=None,
    own_team_number=7,
    first_half=True,
    ball=(0.2, -0.4),
)
```

The function returns `(x, y)` in field metres, or `None` when the selected mode
or player cannot be resolved.

## Mode Lookup

The lookup order matches the web/backend tool:

1. Exact advertised-state key:
   `advertised__phase_<phase>__state_<state>__set_play_<set_play>__kicking_<none|us|them>`
2. Legacy semantic mode, such as `normal_play`, `kickoff_us`, or `goal_kick_them`
3. `normal_play`

## Position Formula

```text
x = clamp(ball.x * attraction.x + offset.x, minX, maxX)
y = clamp(ball.y * attraction.y + offset.y, minY, maxY)
```

`minX`, `maxX`, `minY`, and `maxY` can be set globally, per mode, or per
player. Missing limits are treated as unbounded.

## Tests

```bash
python -m unittest discover player_template
```
