# Tharakan Bros Survivor League

A retro-styled multi-league Survivor Pool web application, with a pixel art
aesthetic and comprehensive league management functionality.

## Overview

Users pick one team each week from the sports league associated with their
Survivor League (EPL, NFL, NBA, ...). If their chosen team wins, they survive
to the next week; the goal is to survive as long as possible through the
season. Each team can be picked at most twice per season per league, adding
strategic depth to the game.

## Key Features

### Multi-League Support
- **Multiple Survivor Leagues**: users can participate in multiple leagues simultaneously
- **League-Specific Data**: each league maintains separate picks, points, strikes, and team usage
- **Sports League Integration**: each Survivor League is tied to a specific sports league (EPL, NFL, NBA)
- **Unique Team Names**: users can have different team names in each league
- **Invitations**: league admins invite new members via magic link

### User Experience
- **League Selection**: after login, users choose which league to enter
- **League Switching**: click the logo to return to league selection
- **Scoped Experience**: all functionality (Profile, Scoreboard, Make Picks, Results) is league-specific
- **Retro Gaming Aesthetic**: pixel art styling with retro colors and fonts

### Core Functionality
- **Authentication**: email/password login, JWT session (httpOnly cookie), password reset
- **Weekly Picks**: select one team per week from that week's games, with pick-lock rules around game start times and postponements
- **Team Tracking**: visual indicators for which teams have been used, and how many uses remain
- **League Standings**: scoreboard with player rankings, points, and strikes
- **Player Profiles**: individual player statistics and pick history
- **Admin Tools**: league membership management, score recomputation, game score updates
- **Responsive Design**: works on desktop and mobile
- **Dark/Light Mode**: theme switching

## Architecture: two runtimes, one dyno — plus a Cloud Run Job

This app is mid-migration (see `tickets/done/CR-105*.md`, `tickets/done/CR-106*.md`)
from a Next.js-does-everything app to a split architecture:

- **Frontend** — Next.js 15 (App Router), built with `output: 'export'`
  (`next.config.mjs`) into a static `out/` directory. There is **no Node
  server in production** — no Route Handlers, no middleware, no `next/image`
  optimization. `app/api/*` route handlers have been removed entirely.
- **Backend** — a FastAPI app under `api/app/` is the *only* HTTP backend. It
  owns all HTTP routes (`api/app/routers/`), MongoDB access (via Motor), JWT
  issuance/verification, and scoring recomputation.
- **Production (Heroku)**: a single dyno runs `uvicorn` (see `Procfile`), which
  serves `/api/*` from the FastAPI routers and falls back to serving `out/`'s
  static files for everything else (`api/app/main.py`).
- **Game-score updating (GCP)**: a Google Cloud Run Job (`jobs/`) runs
  `api/app/db/game_updater.py` directly, triggered by Cloud Scheduler every
  15 minutes. **Heroku is not involved in fetching game scores or computing
  picks** — that runs entirely on GCP (project `survivor-473803`,
  region `us-central1`). See `jobs/README.md`.
- **Local development**: run the Next.js dev server and `uvicorn` separately
  (see below) — they aren't collapsed onto one origin/dyno until the
  production build.

A handful of Node scripts under `scripts/` (seeding, backfills, prod→dev
clone) still talk to MongoDB directly via the legacy TypeScript data layer
(`lib/db.ts`, `lib/mongodb.ts`) — see `CLAUDE.md`'s "What's still TypeScript"
section for details.

For the full architectural rundown (why two copies of some logic exist,
golden-fixture parity testing, directory map, ticket workflow) see
[`CLAUDE.md`](./CLAUDE.md) — it's the canonical reference kept up to date
alongside the code.

## Tech Stack

- **Frontend**: Next.js 15 (App Router, static export), React, TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui with custom retro modifications
- **Icons**: Lucide React
- **Fonts**: Press Start 2P (headings), VT323 (body text)
- **State Management**: React Context for auth and league (`hooks/use-auth.tsx`, `hooks/use-league.tsx`)
- **Backend**: FastAPI (Python), Motor (async MongoDB driver), Pydantic, `python-jose` (JWT)
- **Database**: MongoDB (Atlas in production)
- **Hosting**: single Heroku dyno running `uvicorn`, serving both the API and the static frontend build; game-score updating runs as a Google Cloud Run Job (GCP project `survivor-473803`)

## Application Flow

1. **Authentication** — user logs in; the API issues a JWT in an httpOnly `auth-token` cookie.
2. **League Selection** (`/leagues`) — user picks which league to enter; the choice is persisted in localStorage.
3. **League-Scoped Experience** — all subsequent pages (`/profile`, `/scoreboard`, `/make-picks`, `/results`, `/player/[id]`, `/admin/*`) are scoped to the selected league; nearly every API call takes a `leagueId`. `LeagueGuard` redirects to `/login` if unauthenticated or `/leagues` if no league is selected; `AdminGuard` additionally requires admin membership.

## Directory Map

```
app/                    Next.js pages (App Router), all under output: 'export'
  admin/, invite/, leagues/, login/, make-picks/,
  player/, profile/, register/, reset-password/, results/, rules/, scoreboard/
components/             Shared UI incl. league-guard.tsx, admin-guard.tsx, navbar.tsx
components/ui/          shadcn/ui, customized for the retro pixel theme
hooks/                  use-auth.tsx, use-league.tsx (context providers)
lib/                    api-client.ts (frontend -> API), game-utils.ts
                        (parity-tested against Python); db.ts/mongodb.ts
                        (ops-script-only now)
types/                  Shared TS types -- each has a Pydantic counterpart under api/app/models/
scripts/                Node/tsx ops scripts (seeding, backfills, prod->dev clone)
test-fixtures/          game-utils-golden.json -- shared TS/Python parity fixture
jobs/                   Google Cloud Run Job (game-score updater). See jobs/README.md.

api/app/
  main.py               FastAPI app, router registration, static-file fallback mount
  core/                 config.py (env vars), security.py (JWT), auth_deps.py,
                        responses.py, security_headers.py
  db/                   Mongo access, one module per domain (auth, leagues,
                        memberships, games, picks, invitations, scoring, results)
  models/               Pydantic models, one module per types/*.ts file
  routers/               HTTP routes: auth, leagues, members, games, picks,
                        invitations, results, users, password_reset, admin_scoring
  utils/game_utils.py    Parity-tested twin of lib/game-utils.ts

tickets/                Ticket-driven workflow; done tickets move to tickets/done/.
                        ID prefixes: SUR- (feature), CR- (code review/refactor
                        findings), PERF-, SEC- -- each is its own ticket file.
```

## Environment Variables

Copy `.env.example` to `.env.local` for the Next.js app and Node scripts. Both
runtimes read the same Mongo vars:

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=survivor-league
```

These are picked up automatically: `api/app/core/config.py` and
`api/app/db/mongodb.py` both call `load_dotenv()` on import (`api/.env` first,
then the repo-root `.env.local` as a fallback for the shared Mongo vars
above — real env vars always take precedence over both files). No manual
`export`/sourcing needed, regardless of which shell you use.

FastAPI-specific vars go in `api/.env` (not committed):

```env
JWT_SECRET=...              # falls back to an insecure default if unset, kept for TS parity
SCORING_API_KEY=...         # X-API-Key for POST /api/admin/recompute-scores, /api/admin/update-game-scores
NEXTAUTH_URL=...            # used to build password-reset magic links
```

The Cloud Run Job (`jobs/`) additionally needs `FOOTBALLDATA_API_KEY`,
`FOOTBALLDATA_API_URL`, `FOOTBALLDATA_COMPETITION_CODE`,
`FOOTBALLDATA_REQUEST_DELAY`, `CURRENT_SEASON`, `BULK_QUERY_DAYS_BACK`,
`BULK_QUERY_DAYS_FORWARD`, `EXCLUDE_SEASONS`. These are set via
`--set-env-vars` / `--set-secrets` on the Cloud Run Job — not on Heroku.
See `jobs/README.md` for the full table.

## Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd survivor
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install backend dependencies** (requires [uv](https://docs.astral.sh/uv/))
   ```bash
   cd api
   uv sync --project ..
   cd ..
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local; also create api/.env with the FastAPI-specific vars above
   ```

5. **Set up MongoDB** — install and run locally, or use MongoDB Atlas.

6. **Run the two dev servers** (separate terminals)
   ```bash
   npm run dev                                                # Next.js dev server
   cd api && uv run --project .. uvicorn app.main:app --reload  # FastAPI dev server
   ```

`GET /health` confirms the FastAPI app boots and the Mongo client constructed.

## Testing

```bash
# Frontend (Jest) -- covers lib/**, tests live in lib/__tests__/
npm test
npm run test:watch
npx jest lib/__tests__/game-utils.test.ts      # single file
npx jest -t "some test name"                   # filter by name

# Backend (pytest)
cd api
uv run --project .. pytest
uv run --project .. pytest tests/test_game_utils_parity.py   # single file
uv run --project .. pytest tests/test_picks.py::test_name    # single test
```

Note: `lib/game-utils.ts` and `api/app/utils/game_utils.py` are independent
implementations of the same pick-lock/game-status rules, both tested against
`test-fixtures/game-utils-golden.json`. If you change that logic in one
language, update the fixture and verify both suites still pass.

## Production Deployment

### Heroku (web + API)

A single dyno runs `uvicorn` (see `Procfile`), which serves `/api/*` from
FastAPI and falls back to the static `out/` build for everything else — there
is no separate Node server in production.

1. **Create the Heroku app** and provision MongoDB (Atlas, since Heroku
   doesn't host MongoDB itself).
2. **Set config vars** — at minimum `MONGODB_URI`, `MONGODB_DB_NAME`,
   `JWT_SECRET`, `SCORING_API_KEY`, `NEXTAUTH_URL` (see Environment Variables
   above; Heroku config vars are read by both the Next.js build step and the
   FastAPI process).
3. **Deploy**: `git push heroku main`. The build compiles the Next.js app to
   `out/` and installs the Python dependencies from the root
   `pyproject.toml`/`uv.lock` via the buildpack.
4. **Verify**: `heroku logs --tail`, then `heroku open` and exercise login,
   league selection, and making a pick.

Useful commands: `heroku config`, `heroku config:set KEY=value`,
`heroku logs --tail`, `heroku restart`, `heroku run <command>`.

### Google Cloud Run Job (game-score updater)

Game scores are fetched and picks are scored by a Cloud Run Job — **not by
Heroku**. The job runs `jobs/update_game_scores.py`, which calls
`api/app/db/game_updater.py` directly. Cloud Scheduler triggers it every
15 minutes (GCP project `survivor-473803`, region `us-central1`).

To rebuild and redeploy the job after changing `api/app/db/game_updater.py`
or anything it imports:

```bash
gcloud builds submit --config jobs/cloudbuild.yaml .
gcloud run jobs deploy game-updater \
  --image us-central1-docker.pkg.dev/survivor-473803/survivor-jobs/game-updater:latest \
  --region us-central1 \
  --task-timeout 10m --max-retries 1 \
  --set-env-vars MONGODB_DB_NAME=survivor-league,CURRENT_SEASON=2026 \
  --set-secrets MONGODB_URI=mongodb-uri:latest,FOOTBALLDATA_API_KEY=footballdata-api-key:latest
```

For full env-var details, rollback instructions, and one-time setup see
`jobs/README.md`.

## Ops Scripts

Utility scripts for seeding, importing fixtures, and prod maintenance live
under `scripts/` and still talk to MongoDB directly through the legacy
TypeScript data layer. See `scripts/README.md` for script-by-script details;
notable ones:

- `npm run calculate-scores` — trigger scoring recomputation
- `npm run clone-prod-to-dev` — clone prod Mongo data into a dev DB (uses `.env.local`)
- `npx tsx scripts/init-db.ts` — initialize the database with sample data

## Ticket Workflow

Work is tracked as markdown ticket files under `tickets/` (moved to
`tickets/done/` on completion). Matching Claude Code slash commands cover the
lifecycle: `create-ticket`, `implement-ticket`, `review-implementation`,
`verify-done`, `debug-implementation`, `write-tests`, `create-pr`. See
`CLAUDE.md` for details.

## Future Enhancements

- Real-time updates via WebSockets
- Push notifications for game results
- Advanced statistics and analytics
- Mobile app version
- Social features (comments, trash talk)
- Cross-league tournaments
