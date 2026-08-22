# CR-109: Move Game Score Updater to a Cloud Run Job

**Ticket ID**: CR-109
**Title**: Replace HTTP-triggered game updater with a self-contained Cloud Run Job
**Status**: Done — implemented 2026-08-22
**Type**: Infrastructure / Reliability
**Priority**: High — the current updater has been silently broken in production;
weekly-state fields on the 2026/2027 `league_seasons` document are null and
completed games (e.g. Arsenal-Coventry 3-0 on 2026-08-21, football-data id
560542) are not being updated because the run never completes.

## Root cause the ticket resolves

The updater is currently invoked as an HTTP POST from a Node script running on
Google Cloud Run → `https://<heroku-app>/api/admin/update-game-scores` (FastAPI
route in `api/app/routers/admin_scoring.py:29-34`, delegating to
`update_game_scores()` in `api/app/db/game_updater.py:526`). A representative
local run of the exact same function completes in **79 seconds**
(observed 2026-08-22, dev DB, 15 bulk games + 12 overdue games + 6 individual
football-data.org calls, each spaced 6s apart by `REQUEST_DELAY_MS`). Heroku
web dynos enforce a hard **30-second router timeout (H12)** on requests that
don't return headers within the window; the request is killed and Heroku
returns an HTML error page. Symptoms observed:

- Cloud Run log: `Error: API request failed: 404 Not Found - Not found` — the
  Node shim's `fetch` was following a 301 (bare→www canonical redirect from
  `api/app/core/security_headers.py:34-58`) and downgrading POST→GET, hitting
  the `/api/{_path:path}` catch-all in `api/app/main.py:96-98`.
- After the API_BASE_URL was pointed at `https://www.tharakanbrossurvivor.com`
  to bypass the redirect, the shim next surfaced
  `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` — Heroku's H12
  HTML error page, produced because the FastAPI handler was still running
  past 30s when the router gave up.

The 30s timeout is **not configurable** on Heroku web dynos, so no amount of
patching the current path can make it work. The updater needs to run somewhere
without a request-timeout budget.

Related dependent bugs — **out of scope for this ticket**, tracked separately
so they don't bloat the scope:

- `_find_matching_database_game` in `api/app/db/game_updater.py:85-95` raises
  `RuntimeError` when a bulk-response game has no matching DB `externalId`,
  aborting the entire run. Documented in the module docstring as a
  pre-existing bug. Would benefit this ticket's reliability but is not
  required to unblock it.
- The `CanonicalRedirectMiddleware` uses `301` where `308` would be more
  correct for POST clients. Not on this ticket's critical path once the Node
  shim goes away.

## Solution

Package the existing `update_game_scores()` function into a **Cloud Run Job**
(not a Cloud Run Service — Jobs are designed for batch/no-HTTP workloads,
bill only for execution time, and have no request-timeout concept), triggered
by **Cloud Scheduler** every 15 minutes. The Job container runs the same
Python function that already runs in-process on Heroku, importing directly
from `api/app/db/game_updater.py` — **no code duplication, no HTTP hop, no
`SCORING_API_KEY`, no Heroku CPU, no 30s ceiling.**

Cloud Run Jobs' always-free tier (2M requests, 360k vCPU-sec, 180k GiB-sec /
month) covers this workload with room to spare (~230 vCPU-min/mo at the
observed 79s × 96 runs/day × 30 days).

## File layout — what gets added, what stays, what gets deleted

### Added

```
jobs/
  update_game_scores.py       # Cloud Run Job entrypoint (see contents below)
  Dockerfile                  # Job container build
  .dockerignore               # Keeps context small
  README.md                   # How to build, deploy, and manually trigger
```

Placed at the **repo root** in a new `jobs/` directory rather than inside
`api/` for two reasons:

1. Semantic separation — `api/app/` is the FastAPI HTTP surface. This is a
   batch job that happens to share code with it, not an API route.
2. Docker build context — `jobs/Dockerfile` needs the repo-root
   `pyproject.toml` + `uv.lock` + `.python-version` (see below), plus
   `api/app/` for the code it imports. Rooting the Docker context at the
   repo root and having `jobs/` as a sibling makes the `COPY` instructions
   straightforward. Placing the Job inside `api/` would either require a
   parent-directory Docker context (ugly) or duplicating the manifest files.

### Reused as-is (do not duplicate — this is the sync guarantee)

- `api/app/db/game_updater.py` — the Job imports `update_game_scores()` from
  here. Any behavior change made for the FastAPI endpoint automatically
  applies to the Job on next deploy.
- `api/app/db/mongodb.py` — the Job uses `close_client()` for graceful
  shutdown; the `AsyncIOMotorClient` lifecycle is otherwise identical.
- `api/app/core/config.py` — env loading (`api/.env` → repo-root `.env.local`
  with `override=False`) works identically inside the container; real env
  vars from Cloud Run's `--set-env-vars` / `--set-secrets` win via the
  `override=False` precedence.
- `pyproject.toml` + `uv.lock` + `.python-version` at the repo root — the
  Job uses the exact same lockfile as the Heroku FastAPI app, guaranteeing
  identical resolved versions of `motor`, `httpx`, `python-dotenv`, etc.
  This is the single most important sync-preservation choice in this ticket.
  **Do not add a separate `jobs/pyproject.toml`.**

### Deleted (after Cloud Run Job is verified healthy in prod for one week)

Deletion is a **separate follow-up**, not part of this ticket's implementation,
so the migration is reversible during the bake-in window:

- `scripts/update-game-scores.js` — the Node HTTP shim that runs on Cloud Run
  today.
- `api/app/routers/admin_scoring.py:29-34` (`update_game_scores_route`) — the
  FastAPI endpoint the shim hits. Also drop the `SCORING_API_KEY` check on
  this specific route; `recompute-scores` still uses it.
- `SCORING_API_KEY` from `api/app/core/config.py:39` and `.env.example`
  **only if** `recompute-scores` is also being retired; otherwise leave it.
- The Cloud Scheduler → Cloud Run Service HTTP invocation. Replaced by
  Cloud Scheduler → Cloud Run Job invocation.

`scripts/update_game_scores.py` (local dev runner added 2026-08-22) **stays** —
same import pattern as the Job entrypoint, useful for local one-off runs
against dev or prod (`--prod`) without needing Docker.

## The Job entrypoint — `jobs/update_game_scores.py`

Minimal, mirroring `scripts/update_game_scores.py` exactly but with no `--prod`
flag (Cloud Run env vars are set at deploy time, not via CLI). Contents:

```python
"""Cloud Run Job entrypoint: calls update_game_scores() and exits with
0 on success, non-zero on failure so Cloud Run marks the execution failed.

All env vars (MONGODB_URI, MONGODB_DB_NAME, FOOTBALLDATA_API_KEY, plus the
optional FOOTBALLDATA_* tuning knobs) come from Cloud Run Job configuration
via --set-env-vars / --set-secrets. api/.env and .env.local are not shipped
in the container; python-dotenv's load_dotenv is a no-op when the files
don't exist, so config.py's imports are harmless.
"""
import asyncio
import json
import sys
from datetime import datetime, timezone

from app.db.game_updater import update_game_scores
from app.db.mongodb import close_client


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).isoformat()}] {msg}", flush=True)


async def main() -> int:
    log("=== Game Score Update Started ===")
    try:
        result = await update_game_scores()
        log("=== Game Score Update Completed ===")
        log(json.dumps(result, default=str, indent=2))
        return 0
    except Exception as e:
        log(f"FAILED: {type(e).__name__}: {e}")
        return 1
    finally:
        try:
            close_client()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
```

Note the `from app.db.*` imports work because the Dockerfile installs the
`api/` directory on `sys.path` via `PYTHONPATH` (see Dockerfile below) —
this matches how `api/pytest.ini` puts `api/` on the path, and how
`scripts/update_game_scores.py` does it with a `sys.path.insert`.

## Dockerfile — `jobs/Dockerfile`

```dockerfile
# Use the same Python minor version pinned in .python-version so the Job's
# runtime matches Heroku's. Keep in sync manually if .python-version bumps
# (see CI check proposed below).
FROM python:3.13-slim

# uv for lockfile-fidelity installs (same tool used locally and on Heroku's
# uv-enabled Python buildpack).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency manifest first for layer caching.
COPY pyproject.toml uv.lock .python-version ./

# --frozen: fail if uv.lock is out of date, guaranteeing the container
# resolves to the exact same versions as the Heroku app.
# --no-dev: skip test-only deps (pytest, motor-with-mock, etc.).
RUN uv sync --frozen --no-dev --no-install-project

# Copy application code. api/ provides the app.* package; jobs/ provides
# the entrypoint.
COPY api/ ./api/
COPY jobs/ ./jobs/

# Put api/ on sys.path so `from app.db.game_updater import ...` works.
ENV PYTHONPATH=/app/api

# uv creates .venv/; put its bin on PATH so `python` resolves to it.
ENV PATH="/app/.venv/bin:$PATH"

# Jobs have no port and no HTTP server; just run the script.
CMD ["python", "jobs/update_game_scores.py"]
```

## `jobs/.dockerignore`

```
# Everything by default; the Dockerfile explicitly opts in.
*
!pyproject.toml
!uv.lock
!.python-version
!api/
!jobs/
# Exclude test/dev-only paths that would bloat the image or leak secrets.
**/__pycache__/
**/*.pyc
api/tests/
.env
.env.local
.env.prod
```

## Deployment — `jobs/README.md` sketches these commands

**One-time setup** (do once, per project):

```bash
# Enable APIs (idempotent).
gcloud services enable run.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com

# Create an Artifact Registry repo for the image.
gcloud artifacts repositories create survivor-jobs \
  --repository-format=docker \
  --location=us-central1

# Create the two secrets in Secret Manager.
echo -n "$MONGODB_URI"          | gcloud secrets create mongodb-uri --data-file=-
echo -n "$FOOTBALLDATA_API_KEY" | gcloud secrets create footballdata-api-key --data-file=-
```

**Per-deploy** (this is what a CI job would eventually do; run manually for
the first few weeks):

```bash
# From repo root. Build with the repo root as context so pyproject.toml,
# uv.lock, .python-version, api/, and jobs/ are all reachable.
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/$PROJECT_ID/survivor-jobs/game-updater:latest \
  --file jobs/Dockerfile \
  .

# Create the Job (first time only) or update it.
gcloud run jobs deploy game-updater \
  --image us-central1-docker.pkg.dev/$PROJECT_ID/survivor-jobs/game-updater:latest \
  --region us-central1 \
  --task-timeout 10m \
  --max-retries 1 \
  --set-env-vars MONGODB_DB_NAME=survivor-league,CURRENT_SEASON=2026 \
  --set-secrets MONGODB_URI=mongodb-uri:latest,FOOTBALLDATA_API_KEY=footballdata-api-key:latest
```

**Cloud Scheduler wiring** (once, replacing the current HTTP-trigger schedule):

```bash
# Grant Scheduler permission to invoke the Job.
gcloud run jobs add-iam-policy-binding game-updater \
  --region us-central1 \
  --member=serviceAccount:$SCHED_SA \
  --role=roles/run.invoker

gcloud scheduler jobs create http game-updater-schedule \
  --location us-central1 \
  --schedule "*/15 * * * *" \
  --uri "https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/game-updater:run" \
  --http-method POST \
  --oauth-service-account-email $SCHED_SA
```

**Manual one-off invocation** (useful for debugging or ad-hoc re-runs):

```bash
gcloud run jobs execute game-updater --region us-central1 --wait
```

## Sync/drift-prevention strategy

The single-source-of-truth is `api/app/db/game_updater.py`. Ways this ticket
defends against drift:

1. **No code duplication.** The Job's `main()` is 20 lines and does nothing
   but call `update_game_scores()` and log the result. If someone changes
   the updater's signature or return shape, the Job breaks loudly on the
   next execution and the failure is visible in Cloud Run's execution log.
2. **Single lockfile.** `jobs/Dockerfile` `COPY`s the repo-root
   `pyproject.toml`/`uv.lock`/`.python-version` — no separate manifest to
   drift. If Heroku upgrades a dependency, the next Job build gets the same
   upgrade automatically.
3. **`uv sync --frozen`** in the Dockerfile fails the build if `uv.lock`
   is stale relative to `pyproject.toml`, forcing the developer to
   regenerate it before merging.
4. **Add a CI guard** (small follow-up, worth doing at the same time): a
   GitHub Action that runs `docker build -f jobs/Dockerfile .` on any PR
   that touches `pyproject.toml`, `uv.lock`, `.python-version`, `api/app/`,
   or `jobs/`. Doesn't push, just proves the container still builds. Catches
   accidental removal of a transitive dep, Python version bumps that break
   the base image, etc.
5. **Retire the FastAPI endpoint after the bake-in.** Once
   `admin_scoring.py:29-34` is deleted (follow-up ticket), there is no
   second path for the updater to be invoked from, so nothing to drift *to*.

## Configuration checklist

Env vars the Job needs (all present in the current Heroku dyno config; copy
values across):

| Var | Source in Cloud Run | Consumer |
|---|---|---|
| `MONGODB_URI`             | Secret Manager `mongodb-uri`          | `api/app/db/mongodb.py:30` |
| `MONGODB_DB_NAME`         | `--set-env-vars` (plain, non-secret)  | `api/app/db/mongodb.py` |
| `FOOTBALLDATA_API_KEY`    | Secret Manager `footballdata-api-key` | `api/app/db/game_updater.py:36` |
| `FOOTBALLDATA_API_URL`    | (optional, default OK)                | `game_updater.py:37` |
| `FOOTBALLDATA_COMPETITION_CODE` | (optional, default `PL`)        | `game_updater.py` |
| `FOOTBALLDATA_REQUEST_DELAY`    | (optional, default 6000ms)      | `game_updater.py:39` |
| `CURRENT_SEASON`          | `--set-env-vars` (`2026`)             | `game_updater.py` |
| `BULK_QUERY_DAYS_BACK`    | (optional, default 7)                 | `game_updater.py:534` |
| `BULK_QUERY_DAYS_FORWARD` | (optional, default 7)                 | `game_updater.py:535` |
| `EXCLUDE_SEASONS`         | (optional, JSON string)               | `game_updater.py:542` |

Env vars the Job **does not** need (unlike the FastAPI app):

- `JWT_SECRET` — no auth surface.
- `SCORING_API_KEY` — no HTTP endpoint to gate.
- `NEXTAUTH_URL` — no password-reset links generated by this code path.

## Acceptance criteria

1. `jobs/update_game_scores.py`, `jobs/Dockerfile`, `jobs/.dockerignore`,
   and `jobs/README.md` exist and are checked into the repo.
2. `docker build -f jobs/Dockerfile .` succeeds locally, producing an image
   under ~200 MB.
3. `docker run --rm --env-file .env.local <image>` runs successfully against
   the dev DB and prints the same JSON summary shape as
   `scripts/update_game_scores.py`.
4. The image, pushed to Artifact Registry and deployed as a Cloud Run Job,
   runs successfully against prod when triggered manually via
   `gcloud run jobs execute game-updater --wait`, and produces log output
   including a non-null `leaguesUpdated` count.
5. Cloud Scheduler is configured to invoke the Job every 15 minutes and the
   first three scheduled executions all complete with exit code 0.
6. After 24 hours of Job runs, the `league_seasons` doc for the 2026/2027
   EPL season has non-null `current_game_week` / `current_pick_week` /
   `last_completed_week` fields.
7. The Node-shim Cloud Run Service and its Cloud Scheduler HTTP job are
   disabled (not deleted yet — kept for one-week rollback window).

## Rollback

If the Job misbehaves, the FastAPI endpoint is still live (this ticket does
not touch it). Re-enable the old Cloud Scheduler → Cloud Run Service
(Node shim) → Heroku POST path — which fails at the Heroku 30s timeout, so
"rollback" here really means "accept broken updates for the few hours it
takes to diagnose the Job." A real rollback plan requires the FastAPI
endpoint to actually work, which is the whole reason for this ticket. So:
**do not delete the FastAPI endpoint or Node shim until the Job has been
running clean for at least one week.**

## Out of scope (explicitly)

- Fixing `_find_matching_database_game`'s raise-on-miss behavior — separate
  ticket. The Job inherits the bug but so does every other invocation path.
- Migrating other Heroku responsibilities (the FastAPI HTTP app itself, the
  static frontend) to alternative hosting — separate discussion.
- Deleting `SCORING_API_KEY` / the FastAPI endpoint / the Node shim — those
  are follow-up cleanup after the one-week bake-in period.
- Adding a CI job that builds the Dockerfile on PR — recommended as a
  follow-up to close the drift-prevention loop, but not required to land
  this ticket.
