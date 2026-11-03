# Formation → behaviour

Open [index.html](index.html) in a browser. No server or installation required.

- **← / →**: change page. **All pages**: scroll through.
- **Try it**: drag the ball, change game state, animate targets.
- [graphics/](graphics/): nine standalone SVG pages for reuse in slides.
- [diamond.json](diamond.json): loadable teaching formation, not a match-tested tactic.

The football analogy is a goalkeeper plus a **1–2–1 diamond**: cover, two wide players and a forward. Width and depth create support options. Roles are configured by robot ID. The code does not infer football roles.

## What the code does

```text
game state → formation mode
ball × attraction + offset → clamp to limits → target (x, y)
```

The rule applies separately to x and y. Each setting resolves:
robot → mode defaults → global defaults → built-in fallback.

Mode lookup: exact advertised state → named mode → `normal_play`.

## Build behaviour on top

```text
                 select action
                /             \
        attack / receive      hold / recover
               |                   |
          task target       formation target
                \             /
                 navigation
                     |
                walk / kick
```

This behaviour layer is an extension idea. Current formation code only supplies targets. It does not choose an attacker, plan routes, avoid opponents or kick.

## Call it on each robot

From the repository root:

```python
import json
from player_template.formation_player import compute_player_position

with open("formation-explainer/diamond.json") as file:
    formation = json.load(file)

target = compute_player_position(
    formation=formation,
    player_number=3,
    game_phase="normal",
    state="playing",
    set_play="none",
    kicking_team=None,
    own_team_number=7,
    first_half=True,
    ball=(2.0, 1.2),
)
# target = (0.5, 2.13), in metres
# Pass to your behaviour/navigation layer when appropriate.
```

Recompute with updated observations. Handle `None` explicitly. Gate movement on the game state, including `stopped`.

Use a consistent coordinate frame: own goal at −x, attack at +x, top touchline at +y. Transform observations and targets in your integration. `first_half` does not mirror coordinates. Field boundaries require explicit limits.

## Edit the visuals

```bash
python3 formation-explainer/build_graphics.py
```

The generator calls the [actual Python calculator](../player_template/formation_player.py). The browser demo mirrors its numeric rule for this teaching JSON; it is not a replacement player implementation.

Football references: [FIFA five-player formations](https://www.fifatrainingcentre.com/media/native/beach-soccer-session-plans/formations_EN.pdf), [FAI width, depth and support](https://www.fai.ie/sessions/317/). These inform the illustration; they do not validate a robot tactic.
