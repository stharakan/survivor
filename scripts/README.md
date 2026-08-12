# Survivor League Scripts

Node/tsx ops scripts for seeding, importing fixtures, and prod maintenance.
These are explicitly **out of the CR-105/CR-106 migration scope** (see the
root `CLAUDE.md`'s "What's still TypeScript" section) — they talk to MongoDB
directly through the legacy `lib/db.ts` / `lib/mongodb.ts` data layer, or call
the FastAPI backend's admin endpoints over HTTP. Run them with `npx tsx
<script>.ts` (or `node <script>.js` for the plain-JS ones), from the repo
root.

## Direct-DB scripts

These import `lib/db.ts`/`lib/mongodb.ts` and talk to MongoDB directly, so
they need `MONGODB_URI`/`MONGODB_DB_NAME` set (`.env.local`, or
`--env-file=.env.local`).

### `init-db.ts`
Initializes/reinitializes sample data for local development. Safe to run
multiple times — clears and recreates games/picks data.
```bash
npx tsx scripts/init-db.ts
```

### `create-epl-league.ts`
Creates the EPL 2025/2026 survivor league and assigns the configured admin
user (by email, hardcoded in the script). Idempotent — safe to re-run.
```bash
npx tsx --env-file=.env.local scripts/create-epl-league.ts
```

### `import-epl-2025-fixtures.ts`
Imports all EPL 2025/2026 fixtures from the Football Data API. **Destructive**
on re-run: deletes existing EPL 2025/2026 games before repopulating. Requires
`FOOTBALLDATA_API_KEY` in addition to the Mongo vars; respects the Football
Data free-tier rate limit (10 req/min, 6s delay between requests).
```bash
export FOOTBALLDATA_API_KEY="your-football-data-api-key"
npx tsx scripts/import-epl-2025-fixtures.ts
```

### `backfill-external-ids.ts`
Backfills Football Data API external IDs onto existing EPL 2025/2026 games by
matching them against the API. Safe to re-run — only touches games missing an
external ID. Requires `FOOTBALLDATA_API_KEY`.
```bash
export FOOTBALLDATA_API_KEY="your-football-data-api-key"
npx tsx scripts/backfill-external-ids.ts
```

### `clone-prod-to-dev.ts`
Clones the production MongoDB database into a `survivor-league-dev` database
on the same Atlas cluster, sanitizing user emails and resetting all passwords
to a shared dev password. Reads `.env.local` for the prod connection string.
```bash
npm run clone-prod-to-dev
```

### `test-external-api.ts`
Smoke-tests the Football Data API using the same date-range/config logic as
the game updater — prints matches in the configured window without touching
the database.
```bash
npx dotenv-cli -e .env.local npx tsx scripts/test-external-api.ts
```

## HTTP client scripts

These don't touch MongoDB directly — they call the FastAPI backend's admin
endpoints (`api/app/routers/admin_scoring.py`), authenticated with
`SCORING_API_KEY` via the `X-API-Key` header. `API_BASE_URL` should point at
wherever `uvicorn` is serving `/api/*` — the local dev server, or the deployed
Heroku app (which serves both the API and the static frontend from the same
origin).

### `calculate-scores.js`
Triggers `POST /api/admin/recompute-scores` to recompute pick results and
membership points/strikes. Idempotent, cron-compatible, zero npm
dependencies (uses Node's built-in `fetch`).
```bash
export SCORING_API_KEY="your-api-key"
export API_BASE_URL="http://localhost:8000"   # or your Heroku app URL
node scripts/calculate-scores.js
```
Also runnable via `npm run calculate-scores`.

### `update-game-scores.js`
Triggers `POST /api/admin/update-game-scores`, which fetches the latest game
statuses/scores from the Football Data API (today → +1 week) and triggers
score recalculation for any newly-completed games. Cron-compatible.
```bash
export SCORING_API_KEY="your-api-key"
export API_BASE_URL="http://localhost:8000"   # or your Heroku app URL
node scripts/update-game-scores.js
```

### Example cron setup (production)
```bash
# Recompute scores every 15 minutes
*/15 * * * * SCORING_API_KEY="key" API_BASE_URL="https://your-app.herokuapp.com" node scripts/calculate-scores.js >> /var/log/survivor-scoring.log 2>&1

# Refresh game scores/statuses every 3 hours
0 */3 * * * SCORING_API_KEY="key" API_BASE_URL="https://your-app.herokuapp.com" node scripts/update-game-scores.js >> /var/log/game-updates.log 2>&1
```

## Scoring rules

- **Win**: 3 points
- **Draw/tie**: 1 point
- **Loss**: 0 points + 1 strike

(Applied by `api/app/db/scoring.py`, the sole live implementation since
`lib/scoring.ts` was retired in CR-108.)
