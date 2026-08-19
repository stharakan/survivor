# Survivor League API (Python / FastAPI)

This is the full backend for the Survivor League app: a line-by-line port of
what used to be the Next.js backend (CR-105), now with the complete HTTP
route layer wired up (CR-105 Phase 2) and serving the static frontend export
from the same process (CR-106). See `../tickets/done/CR-105-FINDINGS.md`,
`../tickets/done/CR-105-PHASE2-REPORT.md`, and
`../tickets/done/CR-106-frontend-static-export-cutover.md` for the migration
history, and the root `CLAUDE.md` for the overall two-runtime architecture.

## Install

Requires [uv](https://docs.astral.sh/uv/) (Python 3.10+ under the hood -- the
app uses `X | Y` union syntax and `list[T]` generics in a few places). The
dependency manifest (`pyproject.toml`, `uv.lock`, `.python-version`) lives at
the **repo root**, not here -- that's a Heroku buildpack requirement (see the
root `pyproject.toml`'s comment), even though all the actual code stays under
`api/`.

    cd api
    uv sync --project ..

This creates a `.venv` at the repo root pinned to the `.python-version` there,
with every dependency resolved exactly per `uv.lock`.

## Configure

Reuses the same Mongo env vars as the Next.js app (see the root `CLAUDE.md`):

    MONGODB_URI=mongodb://localhost:27017
    MONGODB_DB_NAME=survivor-league

These are picked up automatically -- `app/core/config.py` and
`app/db/mongodb.py` both call `load_dotenv()` on import, loading `api/.env`
first and then falling back to the repo-root `.env.local` (each with
`override=False`, so real env vars -- Heroku config vars, CI secrets, an
inline `MONGODB_URI=... uv run ...` -- always win over either file). No
`export`/sourcing step needed, in bash or PowerShell.

Plus FastAPI-specific vars (put these in `api/.env`, not committed):

    JWT_SECRET=...             # falls back to 'fallback-secret' if unset -- flagged
                                # insecure default, kept for parity with the TS routes
    SCORING_API_KEY=...        # X-API-Key for POST /api/admin/recompute-scores,
                                # /api/admin/update-game-scores
    NEXTAUTH_URL=...           # used to build password-reset magic links

Optional -- only needed if `app/db/game_updater.py` is exercised, the same env
vars its retired TS twin (`lib/game-updater.ts`, deleted in CR-108) used to
read:

    FOOTBALLDATA_API_KEY=...
    FOOTBALLDATA_API_URL=https://api.football-data.org/v4
    FOOTBALLDATA_COMPETITION_CODE=PL
    FOOTBALLDATA_REQUEST_DELAY=6000
    CURRENT_SEASON=2025/2026
    BULK_QUERY_DAYS_BACK=7
    BULK_QUERY_DAYS_FORWARD=7
    EXCLUDE_SEASONS=[{"sportsLeague":"EPL","season":"2024/2025"}]

## Run

    uv run --project .. uvicorn app.main:app --reload

(`--project ..` points uv at the root `pyproject.toml`/`uv.lock` for
dependency resolution; the command itself still runs with `api/` as its cwd,
same as the `Procfile`, so `app.main:app` resolves the same way in dev and in
prod.)

`GET /health` confirms the app boots and the Mongo client was constructed.

If a Next.js static export exists at `../out` (i.e. you've run `npm run
build` from the repo root), `app/main.py` also mounts it and serves the whole
frontend from this same process at `http://localhost:8000/` -- useful for
testing the production topology locally. In everyday frontend development you
still run `npm run dev` separately (see the root README) and just point it at
this server's `/api/*`.

## Test

    uv run --project .. pytest                                 # all tests
    uv run --project .. pytest tests/test_game_utils_parity.py  # single file
    uv run --project .. pytest tests/test_picks.py::test_name   # single test

`pytest.ini` pins one asyncio event loop for the whole test session (the
Motor client is a module-level singleton bound to whatever loop first created
it -- per-test loops orphan it). `test_game_updater_live_mongo.py` and
`test_live_mongo_smoke.py` hit a real MongoDB and are part of the `dev`
dependency group only (`uv sync --no-dev` excludes them from a prod install --
though note the Heroku build currently does *not* pass `--no-dev`, see
`pyproject.toml`'s comment).

## Layout

    app/
      main.py               FastAPI app instance: router registration, security
                            headers middleware, /health, and the static-file
                            fallback mount that serves ../out (CR-106 AC5)
      core/
        config.py            env vars (JWT_SECRET, SCORING_API_KEY, NEXTAUTH_URL, ...)
        security.py          JWT issuance/verification (originally ported from
                            lib/auth-utils.ts, which CR-108 later deleted)
        auth_deps.py          FastAPI dependencies for auth/authorization
        responses.py          exception handlers -> consistent error JSON
        security_headers.py   ASGI middleware, port of next.config.mjs's headers()
      db/                    Mongo access, one module per domain, in Rank 1-7 order
                            (see "Layout" below and api's routers/ for how they're used):
        mongodb.py            Motor client + Collections (port of lib/mongodb.ts)
        _shape.py              shared Mongo-doc -> Pydantic-model shaping helpers
        auth.py                Rank 1: users (lib/db.ts user operations)
        leagues.py             Rank 2: leagues + start_new_season (no TS equivalent)
        memberships.py         Rank 3: league memberships
        games.py               Rank 4: games (read-only)
        picks.py               Rank 5: picks
        invitations.py         Rank 6: league invitations
        scoring.py             Rank 7: originally ported from lib/scoring.ts
                            (deleted in CR-108), now the sole live implementation
        results.py             Rank 7: scoreboard/results/season-summary
        player_profile.py      Rank 7: player profile aggregation
        game_updater.py        Rank 7: originally ported from lib/game-updater.ts
                            (deleted in CR-108), now the sole live implementation
      models/                 Pydantic models, one module per types/*.ts file, plus
                            a few Python-only additions (team_picks_remaining.py,
                            player_profile.py, results.py, requests.py) -- see
                            ../tickets/done/CR-105-PHASE1-REPORT.md for what's new.
      routers/                HTTP routes, mirrors db/'s domain split:
        auth.py               POST /api/auth/{login,logout,register}, GET /api/auth/verify
        users.py               GET/PATCH /api/users/{user_id}, GET /api/users/{user_id}/leagues
        password_reset.py      POST /api/admin/users/{user_id}/generate-reset-link,
                              GET/POST /api/reset-password/{token}
        leagues.py              GET/POST /api/leagues, GET/PATCH /api/leagues/{league_id}
        members.py              GET/PATCH/DELETE /api/leagues/{league_id}/members[/{member_id}]
        games.py                GET /api/games
        picks.py                 GET/POST /api/picks, GET /api/picks/remaining
        invitations.py           GET/POST /api/leagues/{league_id}/invitations,
                                GET /api/invite/{token}, POST /api/invite/{token}/accept,
                                DELETE /api/invitations/{invitation_id}
        results.py                GET /api/leagues/{league_id}/{results,scoreboard,
                                season-summary,players/{user_id}/profile}
        admin_scoring.py           POST /api/admin/{recompute-scores,update-game-scores}
                                (X-API-Key protected)
      utils/game_utils.py      Parity-tested twin of lib/game-utils.ts (pick-lock /
                            game-status rules) -- see the root CLAUDE.md's
                            "Golden-fixture parity" section.

Rank numbers match `CR-105-FINDINGS.md` Table 1's dependency order (auth ->
leagues -> memberships -> games -> picks -> invitations -> scoring/results);
the router layer was built in the same order.

## Auth

FastAPI issues and verifies JWTs directly (`app/core/security.py`) -- no BFF
proxy back to Next.js. `POST /api/auth/login` and `/register` set the JWT in
an httpOnly `auth-token` cookie (7-day expiry, see `app/core/config.py`);
`app/core/auth_deps.py` provides the FastAPI dependencies that decode that
cookie and enforce league membership / admin checks on protected routes.

## Notes

- **No dev-seed script port** (`initializeDefaultData`, `createGame`,
  `createGameIndexes`, `createInvitationIndexes`) -- kept in Next.js/TS by the
  CR-105 cut-list decision; `scripts/init-db.ts` keeps talking to MongoDB
  directly and is unaffected by this migration.
- **Static frontend fallback**: `app/main.py` mounts `../out` (the Next.js
  static export) last, after all `/api/*` routers, so any unmatched
  `/api/*` path returns a genuine JSON 404 instead of falling through to the
  SPA's `out/404.html`.
- `lib/game-utils.ts` and `app/utils/game_utils.py` are independent
  implementations of the same pick-lock/game-status rules, both tested
  against `../test-fixtures/game-utils-golden.json`. Change one, update the
  fixture, and verify both suites (`npm test` and `pytest`) still pass.
