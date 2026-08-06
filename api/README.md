# Survivor League API (Python / FastAPI)

Phase 1 of the CR-105 full-migration path (see `../tickets/CR-105-FINDINGS.md` and
`../tickets/CR-105-PHASE1-REPORT.md`). This is the data-access layer + Pydantic
contracts -- **no HTTP routes are wired up yet**, that's Phase 2.

## Install

Requires Python 3.10+ (uses `X | Y` union syntax and `list[T]` generics in a few
places).

    cd api
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

## Configure

Reuses the same Mongo env vars as the Next.js app (see the root `CLAUDE.md`):

    MONGODB_URI=mongodb://localhost:27017
    MONGODB_DB_NAME=survivor-league

Optional -- only needed once `app/db/game_updater.py` is actually exercised
(Phase 2+), matching the env vars `lib/game-updater.ts` already reads:

    FOOTBALLDATA_API_KEY=...
    FOOTBALLDATA_API_URL=https://api.football-data.org/v4
    FOOTBALLDATA_COMPETITION_CODE=PL
    FOOTBALLDATA_REQUEST_DELAY=6000
    CURRENT_SEASON=2025/2026
    BULK_QUERY_DAYS_BACK=7
    BULK_QUERY_DAYS_FORWARD=7
    EXCLUDE_SEASONS=[{"sportsLeague":"EPL","season":"2024/2025"}]

Put these in `api/.env` (not committed) and load them however you prefer
(`python-dotenv`, shell export, etc.) -- no `.env` loader is wired into
`app/main.py` yet, since nothing reads env vars at import time except
`app/db/game_updater.py`'s module-level constants.

## Run

    uvicorn app.main:app --reload

`GET /health` is the only live route today -- it confirms the app boots and the
Mongo client was constructed. Everything else (`app/db/*.py`, `app/models/*.py`)
is a library of functions/models for Phase 2 to wire into real routes.

## Layout

    app/
      main.py            FastAPI app instance (no routes yet)
      db/
        mongodb.py        Motor client + Collections (port of lib/mongodb.ts)
        _shape.py          shared Mongo-doc -> Pydantic-model shaping helpers
        auth.py            Rank 1: users (lib/db.ts user operations)
        leagues.py         Rank 2: leagues + start_new_season (NEW capability,
                           no TS equivalent -- see CR-105-FINDINGS.md Addendum)
        memberships.py     Rank 3: league memberships
        games.py           Rank 4: games (read-only; createGame/createGameIndexes
                           dropped, see cut list)
        picks.py           Rank 5: picks (createPick's draw-handling bug fixed)
        invitations.py     Rank 6: league invitations
        scoring.py         Rank 7: port of lib/scoring.ts
        results.py         Rank 7: scoreboard/results/season-summary (lib/db.ts)
        game_updater.py    Rank 7: port of lib/game-updater.ts
      models/              one module per types/*.ts file, plus new models
                           (team_picks_remaining.py, player_profile.py,
                           results.py) not in the original types/ export list --
                           see ../tickets/CR-105-PHASE1-REPORT.md for what's new
                           and why.

Rank numbers match CR-105-FINDINGS.md Table 1's dependency order (auth -> leagues
-> memberships -> games -> picks -> invitations -> scoring/results); Phase 2
should build routes in the same order.

## Not in this phase

- **No routes** (`app/api/*` equivalents) -- Phase 2.
- **No JWT/auth verification** -- Phase 2. The auth boundary is already decided
  (FastAPI verifies JWTs directly for browser routes, no BFF proxy back to
  Next.js); `python-jose` is in `requirements.txt` ready for that work.
- **No `lib/game-utils.ts` port** (pick-lock/game-status rules) -- part of
  Phase 2's picks work, per the CR-105 scope split. Several functions here
  (`picks.py`, `games.py::get_game_time_info_by_id`) are written to be consumed
  by that future logic but don't implement it themselves.
- **No dev-seed script port** (`initializeDefaultData`, `createGame`,
  `createGameIndexes`, `createInvitationIndexes`) -- kept in Next.js/TS by the
  CR-105 cut-list decision; `scripts/init-db.ts` keeps talking to MongoDB
  directly and is unaffected by this migration.
- **No password-reset data-access functions** -- that logic lives inline in
  `app/api/admin/users/[userId]/generate-reset-link/route.ts` and
  `app/api/reset-password/[token]/route.ts` in the TS app, not in `lib/db.ts`,
  so it's out of this phase's "port lib/db.ts" scope. The Pydantic models
  (`app/models/password_reset.py`) are provided so Phase 2's routes have the
  contract ready when that logic is ported.
