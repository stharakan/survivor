# jobs/

Cloud Run Job for the game-score updater. Calls `update_game_scores()` from
`api/app/db/game_updater.py` directly — no HTTP hop, no Heroku 30s timeout.

Triggered by Cloud Scheduler every 15 minutes.

## One-time setup

```bash
# Enable required APIs (idempotent).
gcloud services enable run.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com

# Create an Artifact Registry repo for the image.
gcloud artifacts repositories create survivor-jobs \
  --repository-format=docker \
  --location=us-central1

# Create secrets in Secret Manager.
echo -n "$MONGODB_URI"          | gcloud secrets create mongodb-uri --data-file=-
echo -n "$FOOTBALLDATA_API_KEY" | gcloud secrets create footballdata-api-key --data-file=-
```

## Per-deploy

Run from repo root so `pyproject.toml`, `uv.lock`, `.python-version`, `api/`,
and `jobs/` are all reachable as the Docker build context.

```bash
export PROJECT_ID=<your-gcp-project-id>

# Build and push.
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/$PROJECT_ID/survivor-jobs/game-updater:latest \
  --file jobs/Dockerfile \
  .

# Create the Job (first time) or update it.
gcloud run jobs deploy game-updater \
  --image us-central1-docker.pkg.dev/$PROJECT_ID/survivor-jobs/game-updater:latest \
  --region us-central1 \
  --task-timeout 10m \
  --max-retries 1 \
  --set-env-vars MONGODB_DB_NAME=survivor-league,CURRENT_SEASON=2026 \
  --set-secrets MONGODB_URI=mongodb-uri:latest,FOOTBALLDATA_API_KEY=footballdata-api-key:latest
```

## Cloud Scheduler wiring

Do this once, replacing the current HTTP-trigger schedule.

```bash
export SCHED_SA=<scheduler-service-account-email>

# Grant Scheduler permission to invoke the Job.
gcloud run jobs add-iam-policy-binding game-updater \
  --region us-central1 \
  --member=serviceAccount:$SCHED_SA \
  --role=roles/run.invoker

# Create the schedule (every 15 minutes).
gcloud scheduler jobs create http game-updater-schedule \
  --location us-central1 \
  --schedule "*/15 * * * *" \
  --uri "https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/game-updater:run" \
  --http-method POST \
  --oauth-service-account-email $SCHED_SA
```

## Manual one-off invocation

```bash
gcloud run jobs execute game-updater --region us-central1 --wait
```

## Local test (without Docker)

Use `scripts/update_game_scores.py` instead — same import pattern, supports
`--prod` to target the prod DB.

```bash
uv run --project . python scripts/update_game_scores.py        # dev
uv run --project . python scripts/update_game_scores.py --prod # prod
```

## Env vars

| Var | Source in Cloud Run | Required |
|---|---|---|
| `MONGODB_URI` | Secret Manager `mongodb-uri` | Yes |
| `MONGODB_DB_NAME` | `--set-env-vars` | Yes |
| `FOOTBALLDATA_API_KEY` | Secret Manager `footballdata-api-key` | Yes |
| `CURRENT_SEASON` | `--set-env-vars` | Yes |
| `FOOTBALLDATA_API_URL` | `--set-env-vars` (optional, default OK) | No |
| `FOOTBALLDATA_COMPETITION_CODE` | `--set-env-vars` (optional, default `PL`) | No |
| `FOOTBALLDATA_REQUEST_DELAY` | `--set-env-vars` (optional, default 6000ms) | No |
| `BULK_QUERY_DAYS_BACK` | `--set-env-vars` (optional, default 7) | No |
| `BULK_QUERY_DAYS_FORWARD` | `--set-env-vars` (optional, default 7) | No |
| `EXCLUDE_SEASONS` | `--set-env-vars` (optional, JSON string) | No |

Not needed (unlike the FastAPI app): `JWT_SECRET`, `SCORING_API_KEY`, `NEXTAUTH_URL`.

## Rollback

The FastAPI endpoint (`POST /api/admin/update-game-scores`) and the Node shim
(`scripts/update-game-scores.js`) remain live during the one-week bake-in.
To roll back: re-enable the old Cloud Scheduler → Cloud Run Service (Node shim)
schedule. Do not delete the FastAPI endpoint or Node shim until the Job has run
cleanly for at least one week.
