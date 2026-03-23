# example-convex

Convex reference app for Veil.

## Setup

- Install deps from repo root: `bun install`
- Run Convex backend (in this app): `bun run dev:convex`
- Run Vite frontend (in this app): `bun run dev:web`

## Env vars

Set these in your Convex project settings:

- `GEMINI_KEY` (required)

Set this for the Vite dev server in `apps/example-convex/.env.local`:

- `VITE_CONVEX_URL` (required)
- `VITE_VEIL_DEVTOOLS_API_KEY` (optional, only when `VEIL_DEVTOOLS_AUTH_ENABLED=true`)

## What to run

- `internal.veil.seedDemo()` to insert demo items
- `internal.veil.runCycle()` to compute snapshots
- `internal.veil.getRecommendations({ region, budget, userId })` to serve from cache

## Notes

- Veil is installed as a Convex Component via `convex/convex.config.ts`.
- Devtools talks to the Convex deployment URL over HTTP actions, so `apiBaseUrl` should be the same value as `VITE_CONVEX_URL`.
