"""Regenerate the guide's flat SVGs using the actual player-side calculator.

Run from anywhere: python3 formation-explainer/build_graphics.py
No third-party dependencies. All outputs stay in this folder.
"""

from __future__ import annotations

import importlib.util
import json
import math
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
spec = importlib.util.spec_from_file_location(
    "formation_player", ROOT / "player_template" / "formation_player.py"
)
player = importlib.util.module_from_spec(spec)
spec.loader.exec_module(player)
CONFIG = json.loads((HERE / "diamond.json").read_text())
BLUE, ORANGE, INK, MUTED = "#1768ad", "#c56330", "#203c3b", "#627572"
BG, TURF, LINE, ACCENT = "#f7f6ef", "#e8eee4", "#b8c9b8", "#14796c"
OPPONENTS = [(4.05, 0), (2.9, -0.65), (1.7, 1.9), (1.65, -1.85), (0.1, -0.8)]
META = []


def positions(ball=(0.0, 0.0), mode="normal_play"):
    state = "playing" if mode == "normal_play" else "ready"
    kicking_team = None if mode == "normal_play" else (7 if mode == "kickoff_us" else 8)
    return [
        player.compute_player_position(
            formation=CONFIG, player_number=i, game_phase="normal", state=state,
            set_play="none", kicking_team=kicking_team, own_team_number=7,
            first_half=True, ball=ball,
        )
        for i in range(1, 6)
    ]


def text(x, y, label, cls="label", fill=INK, anchor="start"):
    return f'<text x="{x:g}" y="{y:g}" class="{cls}" fill="{fill}" text-anchor="{anchor}">{escape(label)}</text>'


def lines(x, y, labels, cls="small", gap=31, fill=MUTED):
    return "".join(text(x, y + gap * i, label, cls, fill) for i, label in enumerate(labels))


def arrow(a, b, colour=BLUE, width=3, dash=False):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    if length < 4:
        return ""
    ux, uy = dx / length, dy / length
    tip = b
    base = (b[0] - ux * 10, b[1] - uy * 10)
    dash_attr = ' stroke-dasharray="7 7"' if dash else ""
    return (
        f'<path d="M{a[0]:.2f},{a[1]:.2f} L{base[0]:.2f},{base[1]:.2f}" fill="none" stroke="{colour}" stroke-width="{width}"{dash_attr}/>'
        f'<path d="M{tip[0]:.2f},{tip[1]:.2f} L{base[0] - uy * 4:.2f},{base[1] + ux * 4:.2f} L{base[0] + uy * 4:.2f},{base[1] - ux * 4:.2f} Z" fill="{colour}"/>'
    )


class Pitch:
    def __init__(self, x=104, y=226, w=900):
        self.x, self.y, self.w = x, y, w
        self.h, self.s = w * 2 / 3, w / 9

    def p(self, point):
        return (self.x + (point[0] + 4.5) * self.s, self.y + (3 - point[1]) * self.s)

    def base(self):
        x, y, w, h, s = self.x, self.y, self.w, self.h, self.s
        result = f'<g class="pitch"><rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{TURF}"/>'
        result += f'<g fill="none" stroke="{LINE}" stroke-width="2"><rect x="{x}" y="{y}" width="{w}" height="{h}"/>'
        result += f'<path d="M{x+w/2},{y}v{h}"/><circle cx="{x+w/2}" cy="{y+h/2}" r="{s*.75}"/>'
        for side in (0, 1):
            gx = x if side == 0 else x + w - s
            result += f'<rect x="{gx}" y="{y+h/2-s*1.5}" width="{s}" height="{s*3}"/>'
            gx = x - s * .25 if side == 0 else x + w
            result += f'<rect x="{gx}" y="{y+h/2-s*.8}" width="{s*.25}" height="{s*1.6}"/>'
        result += f'</g><circle cx="{x+w/2}" cy="{y+h/2}" r="3" fill="{LINE}"/></g>'
        return result

    def robot(self, point, number, team="us", ghost=False, halo=False):
        x, y = self.p(point)
        r = max(13, self.s * .175)
        colour = BLUE if team == "us" else ORANGE
        result = ""
        if halo:
            result += f'<circle cx="{x}" cy="{y}" r="{r+9}" fill="none" stroke="{colour}" stroke-width="2"/>'
        if ghost:
            return result + f'<circle cx="{x}" cy="{y}" r="{r}" fill="{TURF}" stroke="{colour}" stroke-width="2" stroke-dasharray="4 4" opacity=".6"/>'
        result += f'<g data-team="{team}" data-player="{number}"><circle cx="{x}" cy="{y}" r="{r}" fill="{colour}"/>'
        result += f'<text x="{x}" y="{y+6}" class="robot-id" fill="#fff" text-anchor="middle">{number}</text></g>'
        return result

    def ball(self, point, ghost=False):
        x, y = self.p(point)
        extra = ' fill="none" opacity=".4" stroke-dasharray="3 3"' if ghost else f' fill="{INK}"'
        return f'<circle cx="{x}" cy="{y}" r="8" stroke="{INK}" stroke-width="2"{extra}/>'

    def halo(self, point):
        x, y = self.p(point)
        r = max(13, self.s * .175) + 9
        return f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="{BLUE}" stroke-width="2"/>'

    def teams(self, ours, ball=(0, 0), opponents=OPPONENTS):
        return (
            "".join(self.robot(p, i, "them") for i, p in enumerate(opponents, 1))
            + "".join(self.robot(p, i) for i, p in enumerate(ours, 1))
            + self.ball(ball)
        )

    def shape(self, points):
        pts = [self.p(points[i - 1]) for i in (2, 3, 5, 4, 2)]
        return '<path d="' + " ".join(f'{"M" if i == 0 else "L"}{x},{y}' for i, (x, y) in enumerate(pts)) + f'" stroke="{BLUE}" stroke-width="2" stroke-dasharray="7 8" opacity=".3" fill="none"/>'


def save(slug, title, subtitle, drawing, note, number):
    style = '''
    text {font-family:Arial,Helvetica,sans-serif}
    .title {font-size:48px;font-weight:600;letter-spacing:-1.5px}
    .label {font-size:26px;font-weight:500}
    .small {font-size:22px;font-weight:400}
    .tiny {font-size:18px;font-weight:400}
    .eyebrow {font-size:17px;font-weight:600;letter-spacing:2px}
    .mono {font-family:ui-monospace,Menlo,monospace;font-size:23px}
    .equation {font-family:ui-monospace,Menlo,monospace;font-size:29px}
    .robot-id {font-size:19px;font-weight:600}
    @media (prefers-reduced-motion:reduce) { .motion {display:none} }
    '''
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 920" width="1440" height="920" role="img" aria-labelledby="title desc">
    <title id="title">{escape(title)}</title>
    <desc id="desc">{escape(subtitle + ' ' + note)}</desc>
    <style>{style}</style>
    <rect width="1440" height="920" fill="{BG}"/>
    {text(64, 45, 'FORMATION / 5 v 5', 'eyebrow', ACCENT)}
    {text(1376, 45, f'{number:02d}', 'eyebrow', MUTED, 'end')}
    {text(64, 111, title, 'title')}
    {text(64, 154, subtitle, 'small', MUTED)}
    {drawing}
    {text(64, 885, note, 'tiny', MUTED)}
    </svg>'''
    (HERE / "graphics" / f"{slug}.svg").write_text(svg)
    META.append({"slug": slug, "title": title, "description": subtitle + " " + note})


def make_graphics():
    p = Pitch()
    start = positions()

    # 1. Football roles. The diamond describes four outfield players + keeper.
    art = p.base() + p.shape(start) + p.teams(start)
    role_labels = [(1, "Keeper", -14, 47), (2, "Cover", 0, 48), (3, "Wide", 0, -36), (4, "Wide", 0, 50), (5, "Forward", 0, -36)]
    for i, label, dx, dy in role_labels:
        x, y = p.p(start[i - 1])
        art += text(x + dx, y + dy, label, "small", INK, "middle")
    art += text(1060, 300, "1 + 1–2–1", "equation", BLUE)
    art += lines(1060, 350, ["Keeper", "Cover behind", "Width outside", "Depth ahead"], gap=42)
    art += arrow((1064, 665), (1322, 665), ACCENT)
    art += text(1060, 704, "Attack →", "small")
    art += text(1060, 777, "● Us", "small", BLUE)
    art += text(1190, 777, "● Them", "small", ORANGE)
    save("01-diamond", "Start with a football diamond.", "Keeper + cover + two wide players + forward.", art,
         "Illustrative roles, fixed by robot ID. Robots shown at formation targets.", 1)

    # 2. Continuous animation of computed targets, including all clipping.
    moved_ball = (2.0, 1.2)
    moved = positions(moved_ball)
    art = p.base() + p.shape(moved)
    for i, (before, after) in enumerate(zip(start, moved), 1):
        art += p.robot(before, i, ghost=True)
        art += arrow(p.p(before), p.p(after), BLUE, 2)
    art += p.ball((0, 0), ghost=True) + arrow(p.p((0, 0)), p.p(moved_ball), INK, 2)
    art += p.teams(moved, moved_ball)
    art += text(1060, 300, "Shift together", "label")
    art += lines(1060, 349, ["Keep width", "Keep cover"], gap=40)
    art += text(1060, 493, "○ Previous target", "small", MUTED)
    art += text(1060, 537, "→ Target change", "small", MUTED)
    art += text(1060, 712, "Animate in Try it →", "small", ACCENT)
    save("02-follow", "Ball moves. Team shape follows.", "Same roles. New targets.", art,
         "Arrows show changes in targets. Opponents are context only; the formation does not read them.", 2)

    # 3. Offset is the intercept, not an always-fixed distance from the ball.
    art = p.base() + p.shape(start) + p.teams(start)
    origin, forward = p.p((0, 0)), p.p(start[4])
    art += arrow((origin[0], origin[1] - 55), (forward[0], forward[1] - 55), ACCENT)
    art += text((origin[0] + forward[0]) / 2, origin[1] - 80, "+1.0 m", "mono", INK, "middle")
    art += p.halo(start[4])
    art += text(1060, 300, "Ball at (0, 0)", "small")
    art += text(1060, 362, "Robot 5", "label", BLUE)
    art += lines(1060, 410, ["offset.x = +1.0", "offset.y = 0.0"], "mono", 39, INK)
    art += text(1060, 574, "Starting shape", "label")
    art += text(1060, 618, "offset per robot", "small", MUTED)
    save("03-offset", "Offset sets the starting shape.", "At the centre, target = offset (before limits).", art,
         "Coordinates in metres. Own goal: −x. Attack: +x. Top touchline: +y.", 3)

    # 4. A gain of 0.85 means 85% of ball movement on that axis, not speed.
    ball = (2.0, 0.0)
    targets = positions(ball)
    art = p.base()
    for i, (a, b) in enumerate(zip(start, targets), 1):
        art += p.robot(a, i, ghost=True)
        art += arrow(p.p(a), p.p(b), BLUE, 3)
    art += p.ball((0, 0), ghost=True) + p.teams(targets, ball)
    art += arrow((p.p((0, 0))[0], 780), (p.p(ball)[0], 780), INK)
    art += text(p.p((1, 0))[0], 813, "Ball: +2.0 m", "small", INK, "middle")
    art += text(1060, 290, "Robot 1 · keeper", "small", BLUE)
    art += text(1060, 333, "× 0.05 → +0.10 m", "mono")
    art += text(1060, 418, "Robot 5 · forward", "small", BLUE)
    art += text(1060, 461, "× 0.85 → +1.70 m", "mono")
    art += lines(1060, 589, ["Independent x / y", "Response, not speed"], gap=39)
    save("04-attraction", "Attraction controls the response.", "A forward follows more. A keeper holds back.", art,
         "Before clipping: target.x = ball.x × attraction.x + offset.x. Same rule for y.", 4)

    # 5. The forward's raw x is 4.4 and is clipped to maxX=4.0.
    ball = (4.0, 2.0)
    targets = positions(ball)
    raw = (4.4, 1.1)
    art = p.base()
    bx, by = p.p((4, 0))
    art += f'<rect x="{bx}" y="{p.y}" width="50" height="{p.h}" fill="{ORANGE}" opacity=".10"/>'
    art += f'<path d="M{bx},{p.y}v{p.h}" stroke="{ORANGE}" stroke-width="3" stroke-dasharray="8 8"/>'
    art += p.robot(raw, 5, ghost=True) + arrow(p.p(raw), p.p(targets[4]), BLUE, 3)
    art += p.teams(targets, ball)
    art += text(bx - 15, p.y - 24, "maxX = 4.0", "mono", INK, "end")
    art += text(1060, 310, "Robot 5 · x", "small", BLUE)
    art += text(1060, 364, "4 × 0.85 + 1", "mono")
    art += text(1060, 408, "= 4.40 m", "equation", MUTED)
    art += arrow((1080, 451), (1080, 495), ACCENT)
    art += text(1060, 550, "Target: 4.00 m", "label", BLUE)
    art += lines(1060, 674, ["minX / maxX", "minY / maxY"], "mono", 40, INK)
    save("05-limits", "Limits keep targets in their zones.", "Clip each axis after calculating the target.", art,
         "target = clamp(ball × attraction + offset, min, max). Field edges need explicit limits.", 5)

    # 6. Ready -> kickoff_us; playing -> normal_play. No invented possession mode.
    left, right = Pitch(78, 310, 590), Pitch(770, 310, 590)
    art = text(78, 235, "Ready · our kick-off", "label")
    art += text(78, 273, "kickoff_us", "mono", MUTED)
    art += left.base() + left.teams(positions(mode="kickoff_us"))
    art += text(770, 235, "Playing", "label") + text(770, 273, "normal_play", "mono", MUTED)
    art += right.base() + right.shape(start) + right.teams(start)
    art += arrow((693, 498), (743, 498), ACCENT)
    art += text(720, 781, "Exact game state  →  Named mode  →  normal_play", "label", INK, "middle")
    save("06-modes", "Game state selects the shape.", "Ball position adjusts the selected shape.", art,
         "Lookup order shown above. A missing mode falls back; a missing robot returns no target.", 6)

    # 7. Proposed upper layer: an active player can depart, then return.
    ball = (1.6, 0.7)
    targets = positions(ball)
    actual = list(targets)
    actual[4] = (1.2, 0.4)
    art = p.base() + p.shape(targets)
    art += p.robot(targets[4], 5, ghost=True, halo=True)
    art += p.teams(actual, ball)
    art += arrow(p.p(actual[4]), p.p((1.5, 0.63)), ACCENT, 4)
    art += arrow(p.p(ball), p.p((3.7, .1)), ACCENT, 3, True)
    art += text(1060, 275, "Possible behaviour", "small", MUTED)
    art += text(1060, 335, "5 → attack", "label", ACCENT)
    art += text(1060, 381, "Others → support", "label")
    art += text(1060, 446, "○ Formation target", "small", MUTED)
    art += arrow((1080, 481), (1080, 524), ACCENT)
    art += text(1060, 566, "Return when free", "small")
    art += f'<rect x="1050" y="636" width="325" height="70" rx="0" fill="#e1e9e4"/>'
    art += text(1212, 680, "Decide · navigate · kick", "small", INK, "middle")
    art += f'<rect x="1050" y="720" width="325" height="77" rx="0" fill="{BLUE}"/>'
    art += text(1212, 767, "FORMATION BASE", "small", "#fff", "middle")
    save("07-behaviour", "Formation is the base layer.", "Add behaviour above it: press, receive, shoot, recover.", art,
         "Proposed behaviour layer, not implemented here. Formation supplies default positions; behaviour chooses when to leave them.", 7)

    # 8. Current positions versus computed targets. Lines are not planned routes.
    p8 = Pitch(104, 225, 720)
    targets = positions((1, .5))
    actual = [(-4, -.2), (-2.7, -.5), (-1.3, 1.9), (-1.5, -1.9), (.6, -.2)]
    art = p8.base()
    for i, (a, b) in enumerate(zip(actual, targets), 1):
        art += p8.robot(b, i, ghost=True)
        art += arrow(p8.p(a), p8.p(b), BLUE, 2)
    art += p8.teams(actual, (1, .5))
    art += text(900, 280, "Each robot, each update", "label")
    art += lines(900, 337, ["Same formation JSON", "Shared ball estimate", "Game state + player ID"], gap=42)
    art += text(900, 514, "● Robot     ○ Target", "small")
    art += text(900, 562, "Navigation chooses the route.", "small", MUTED)
    art += text(104, 767, "Ball + state + JSON + ID", "small")
    art += arrow((378, 758), (425, 758), ACCENT)
    art += f'<rect x="443" y="720" width="488" height="78" fill="#e1e9e4"/>'
    art += text(687, 768, "compute_player_position(...) → (x, y)", "mono", INK, "middle")
    art += arrow((948, 758), (1003, 758), ACCENT)
    art += text(1020, 767, "Behaviour / navigation", "small")
    save("08-integrate", "Give each robot its own target.", "Recompute as the ball or game state changes.", art,
         "Caller handles coordinate transforms, stopped states and missing targets. first_half does not mirror coordinates.", 8)

    # 9. Recording workflow: two snapshots determine per-axis slopes/intercepts.
    a, b = Pitch(78, 295, 590), Pitch(770, 295, 590)
    art = text(78, 237, "A · place the team", "label")
    art += a.base() + a.teams(start)
    art += text(770, 237, "B · move ball + team", "label")
    art += b.base() + b.teams(positions((2, 1.5)), (2, 1.5))
    for pitch, point in [(a, start[4]), (b, positions((2, 1.5))[4])]:
        art += pitch.halo(point)
    art += text(720, 754, "Two samples → attraction + offset", "label", INK, "middle")
    art += text(720, 807, "Set limits → test → save JSON", "label", ACCENT, "middle")
    save("09-record", "Teach the shape with two snapshots.", "In the visualiser: Record new formation.", art,
         "Capture A and B for each player. Move ball ≥0.25 m in both axes; keep samples ≥0.05 m inside limits.", 9)


if __name__ == "__main__":
    (HERE / "graphics").mkdir(exist_ok=True)
    make_graphics()
    payload = {"formation": CONFIG, "slides": META, "opponents": OPPONENTS}
    (HERE / "guide-data.js").write_text("window.FORMATION_GUIDE = " + json.dumps(payload, indent=2) + ";\n")
    print(f"Wrote {len(META)} SVGs and guide-data.js")
