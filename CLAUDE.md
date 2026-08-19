# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tharakan Bros Survivor League: a multi-league Survivor-pool web app with a retro
pixel-art aesthetic. Users join one or more leagues (each tied to a sports league —
EPL, NFL, NBA), pick one team per week, and try to survive as long as possible; each
team can be picked at most twice per season per league.

## Architecture: two runtimes, one dyno

This app is mid-migration (CR-105/CR-106) from a Next.js-does-everything app to a
split architecture:

- **Frontend** — Next.js 15 (App Router), built with `output: 'export'`
  (`next.config.mjs`) into a static `out/` directory. There is **no Node server in
  production** — no Route Handlers, no middleware, no `next/image` optimization.
  `app/api/*` route handlers have been deleted entirely.
- **Backend** — a FastAPI app under `api/app/` is now the *only* backend. It owns
  all HTTP routes (`api/app/routers/`), MongoDB access (via Motor), JWT
  issuance/verification, and scoring. In production a single Heroku dyno runs
  `uvicorn`, which serves `/api/*` from the FastAPI routers and falls back to
  serving `out/`'s static files for everything else (`api/app/main.py`, mounted
  last so routers get first crack at `/api/*`).
- Locally you still run `npm run dev` (Next dev server, calls `/api/*` on
  whatever origin — proxy/CORS as needed) and `uvicorn` separately; only the
  production build collapses them onto one origin/dyno.

### Why two copies of some logic exist

`api/app/` is a deliberate line-by-line port of what used to be the Next.js
backend, kept in dependency-rank order (see `api/README.md` and
`tickets/done/CR-105-FINDINGS.md`): auth → leagues → memberships → games → picks →
invitations → scoring/results. Each `api/app/db/*.py`, `api/app/models/*.py`, and
`api/app/routers/*.py` module's docstring names the TS file/lines it ports and
calls out any intentional deviation (e.g. `api/app/core/auth_deps.py`'s status-code
fix). `api/app/db/scoring.py` and `api/app/db/game_updater.py` are now the sole
live implementations of scoring and game-score-updating — their TS twins
(`lib/scoring.ts`, `lib/game-updater.ts`) were deleted in CR-108 once nothing
still called them. When touching auth, scoring, or picks logic, check whether
an equivalent TS file still needs a matching change — see "What's still
TypeScript" below.

**Golden-fixture parity**: `lib/game-utils.ts` (pick-lock / game-status rules) and
`api/app/utils/game_utils.py` are two independent implementations of the same
rules, both tested against the same `test-fixtures/game-utils-golden.json` by
`lib/__tests__/game-utils-parity.test.ts` and `api/tests/test_game_utils_parity.py`.
If you change pick-lock or game-status logic in one language, update the fixture
and verify both test suites still pass — that's the only thing keeping them in
sync.

### What's still TypeScript

`lib/db.ts` and `lib/mongodb.ts` are **no longer used by the web app at
runtime** (no more `app/api/*` to call them) but are still live — they back the
Node ops scripts in `scripts/` (`init-db.ts`, `create-epl-league.ts`,
`backfill-external-ids.ts`, `clone-prod-to-dev.ts`), which were explicitly kept
out of the CR-105 migration scope. `lib/auth-utils.ts`, `lib/scoring.ts`, and
`lib/game-updater.ts` were retired in CR-108 — their only callers were dead
code or an orphaned direct-Mongo script (`scripts/update-games.ts`, superseded
by the HTTP client `scripts/update-game-scores.js`, same pattern as
`scripts/calculate-scores.js`). `lib/api.ts` is just a
re-export shim for `lib/api-client.ts`, which is what frontend code actually calls
— thin `fetch()` wrappers hitting `/api/*` with `credentials: 'include'` (auth is
an httpOnly `auth-token` cookie, now issued/verified directly by FastAPI, not
proxied through Next).

### Multi-league context switching

The whole frontend is built around league-scoped context:

1. **Flow**: Login → League Selection (`/leagues`) → league-scoped pages.
2. `AuthProvider` (`hooks/use-auth.tsx`) and `LeagueProvider` (`hooks/use-league.tsx`)
   wrap the app in `app/providers.tsx`; current league is persisted in
   localStorage.
3. `LeagueGuard` (`components/league-guard.tsx`) protects league-scoped routes —
   redirects to `/login` if unauthenticated, `/leagues` if no league selected.
   `AdminGuard` (`components/admin-guard.tsx`) additionally requires
   admin membership.
4. Nearly every FastAPI route and `lib/api-client.ts` call takes a `leagueId`;
   picks/points/strikes/team-usage are all scoped per league.

## Development Commands

### Frontend (Next.js)
- `npm run dev` — dev server
- `npm run build` — production build (static export to `out/`)
- `npm run lint` — ESLint (also `ignoreDuringBuilds: true` — doesn't block builds)
- `npm test` / `npm run test:watch` — Jest (`jest.config.js`; covers `lib/**`,
  tests live in `lib/__tests__/`)
  - single test: `npx jest lib/__tests__/game-utils.test.ts`, or `-t "<name>"`
    to filter by test name
- `npm run calculate-scores` — trigger scoring recomputation via HTTP client
- `npm run clone-prod-to-dev` — clone prod Mongo data into a dev DB (uses `.env.local`)

TypeScript build errors and ESLint are both ignored during `next build`
(`next.config.mjs`) — don't rely on `npm run build` to catch type errors; there is
no separate `tsc --noEmit` script wired up.

### Backend (FastAPI)
Dependency manifest (`pyproject.toml`, `uv.lock`, `.python-version`) lives at the
**repo root** (Heroku Python buildpack requirement), but all code is under `api/`.

```
cd api
uv sync --project ..                                      # install deps into repo-root .venv
uv run --project .. uvicorn app.main:app --reload          # run dev server
uv run --project .. pytest                                 # run all tests
uv run --project .. pytest tests/test_game_utils_parity.py # single file
uv run --project .. pytest tests/test_picks.py::test_name  # single test
```
`GET /health` confirms the app boots and the Mongo client constructed.
`api/pytest.ini` pins one asyncio event loop for the whole test session (the
Motor client is a module-level singleton bound to whatever loop first created
it — per-test loops orphan it).

Some tests (`test_game_updater_live_mongo.py`, `test_live_mongo_smoke.py`) hit a
real MongoDB and are part of the `dev` dependency group, not run by default in a
prod install (`uv sync --no-dev` — though note the Heroku build currently does
*not* pass `--no-dev`, see `pyproject.toml`'s comment).

## Directory Map

```
app/                    Next.js pages (App Router), all under output:'export'
  admin/, invite/, leagues/, login/, make-picks/, picks-remaining/,
  player/, profile/, register/, reset-password/, results/, rules/, scoreboard/
components/             Shared UI incl. league-guard.tsx, admin-guard.tsx, navbar.tsx
components/ui/          shadcn/ui, customized for the retro pixel theme
hooks/                  use-auth.tsx, use-league.tsx (context providers)
lib/                    api-client.ts (frontend->API), game-utils.ts
                        (parity-tested against Python), db.ts/mongodb.ts
                        (ops-script-only now)
types/                  Shared TS types — each has a Pydantic counterpart under api/app/models/
scripts/                Node/tsx ops scripts (seeding, backfills, prod->dev clone)
test-fixtures/          game-utils-golden.json — shared TS/Python parity fixture

api/app/
  main.py               FastAPI app, router registration, static-file fallback mount
  core/                 config.py (env vars), security.py (JWT), auth_deps.py
                        (auth/authorization helpers), responses.py (error handling),
                        security_headers.py (ported from next.config.mjs headers())
  db/                   Mongo access, one module per domain, in Rank 1-7 order
                        (auth, leagues, memberships, games, picks, invitations,
                        scoring, results) — see api/README.md's Layout section
  models/                Pydantic models, one module per types/*.ts file (plus a
                        few Python-only additions — see CR-105-PHASE1-REPORT.md)
  routers/               HTTP routes, mirrors db/'s domain split
  utils/game_utils.py    Parity-tested twin of lib/game-utils.ts

tickets/                Ticket-driven workflow; done tickets move to tickets/done/.
                        ID prefixes: SUR- (feature), CR- (code review/refactor
                        findings), PERF-, SEC- — each is its own ticket file.
```

## Environment Variables

Copy `.env.example` to `.env.local` for Next.js/scripts. Both runtimes read the
same Mongo vars:
```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=survivor-league
```
`api/app/core/config.py` and `api/app/db/mongodb.py` both call `load_dotenv()`
on import, loading `api/.env` then falling back to the repo-root `.env.local`
(each with `override=False`, so real env vars — Heroku config vars, CI
secrets, an inline `MONGODB_URI=... uv run ...` — always win). So the Mongo
vars above are picked up automatically from `.env.local`; no extra step
needed for those. FastAPI-specific vars (put these in `api/.env`, not
committed):
```
JWT_SECRET=...              # falls back to 'fallback-secret' if unset — flagged insecure default, kept for parity
SCORING_API_KEY=...         # X-API-Key for POST /admin/recompute-scores, /admin/update-game-scores
NEXTAUTH_URL=...            # used to build password-reset magic links
```
`app/db/game_updater.py` additionally reads
`FOOTBALLDATA_API_KEY`, `FOOTBALLDATA_API_URL`, `FOOTBALLDATA_COMPETITION_CODE`,
`FOOTBALLDATA_REQUEST_DELAY`, `CURRENT_SEASON`, `BULK_QUERY_DAYS_BACK`,
`BULK_QUERY_DAYS_FORWARD`, `EXCLUDE_SEASONS`.

## Ticket Workflow

Work is tracked as markdown ticket files in `tickets/` (moved to `tickets/done/`
on completion). Matching Claude Code slash commands exist for the lifecycle:
`create-ticket`, `implement-ticket`, `review-implementation`, `verify-done`,
`debug-implementation`, `write-tests`, `create-pr`. Read the relevant ticket file
fully before implementing — tickets here carry detailed root-cause analysis and
explicit scope-cut lists (see `tickets/done/CR-105-FINDINGS.md` for the depth
expected), not just a one-line description.
