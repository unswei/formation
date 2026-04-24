# Soccer Field Formation Visualiser

Small React/Vite frontend plus a FastAPI backend for visualising RoboCup-style
soccer formations from a bird's-eye view.

The tool now selects formation modes from the same GameController-advertised
fields a player receives: `gamePhase`, `state`, `setPlay`, `kickingTeam`,
`firstHalf`, and `stopped`.

It also includes a recording mode for building formation JSON files from
dragged player targets and ball samples.

## Stack

- React 19 + Vite + TypeScript
- FastAPI + Uvicorn
- ESLint + Prettier
- Vitest for frontend unit tests

## Run locally

1. Install the frontend dependencies:

   ```bash
   npm install
   ```

2. Install the backend environment:

   ```bash
   uv sync --directory backend
   ```

3. Start the Python backend:

   ```bash
   npm run backend
   ```

4. In another terminal, start the frontend:

   ```bash
   npm run dev
   ```

The Vite dev server proxies `/api/*` requests to `http://127.0.0.1:8000`.

## Checks

```bash
npm run check
```

The standalone Python player template can be checked with:

```bash
python -m unittest discover player_template
```

## Project layout

- `src/` contains the React app, SVG field renderer, config validation, and API
  client.
- `backend/app/` contains the FastAPI service and formation computation logic.
- `src/config/field_sizes.json` holds the S/M/L field definitions used to derive
  all field geometry.
- `player_template/` contains a pure Python reference implementation that can
  read the same formation JSON and compute a single player's target position.
