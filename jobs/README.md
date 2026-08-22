# jobs/

Cloud Run Job for the game-score updater. Calls `update_game_scores()` from
`api/app/db/game_updater.py` directly — no HTTP hop, no Heroku 30s timeout.
Triggered by Cloud Scheduler (`game-updater-schedule`) every 15 minutes.
GCP project: `survivor-473803`, region: `us-central1`.

## Per-deploy (rebuild + redeploy)

Run from repo root.

```bash
# Build and push via cloudbuild.yaml (handles non-root Dockerfile path).
gcloud builds submit --config jobs/cloudbuild.yaml .

# Update the Job image.
gcloud run jobs deploy game-updater \
  --image us-central1-docker.pkg.dev/survivor-473803/survivor-jobs/game-updater:latest \
  --region us-central1 \
  --task-timeout 10m \
  --max-retries 1 \
  --set-env-vars MONGODB_DB_NAME=survivor-league,CURRENT_SEASON=2026 \
  --set-secrets MONGODB_URI=mongodb-uri:latest,FOOTBALLDATA_API_KEY=footballdata-api-key:latest
```

## Manual one-off invocation

```bash
gcloud run jobs execute game-updater --region us-central1 --wait
```

## Local test (without Docker)

```bash
uv run --project . python scripts/update_game_scores.py        # dev
uv run --project . python scripts/update_game_scores.py --prod # prod
```

## Env vars

| Var | Source | Required |
|---|---|---|
| `MONGODB_URI` | Secret Manager `mongodb-uri` | Yes |
| `MONGODB_DB_NAME` | `--set-env-vars` | Yes |
| `FOOTBALLDATA_API_KEY` | Secret Manager `footballdata-api-key` | Yes |
| `CURRENT_SEASON` | `--set-env-vars` | Yes |
| `FOOTBALLDATA_API_URL` | optional, default OK | No |
| `FOOTBALLDATA_COMPETITION_CODE` | optional, default `PL` | No |
| `FOOTBALLDATA_REQUEST_DELAY` | optional, default 6000ms | No |
| `BULK_QUERY_DAYS_BACK` | optional, default 7 | No |
| `BULK_QUERY_DAYS_FORWARD` | optional, default 7 | No |
| `EXCLUDE_SEASONS` | optional, JSON string | No |

Secrets (`MONGODB_URI`, `FOOTBALLDATA_API_KEY`) are sourced from `.env.prod` via
`source .env.prod` before running `gcloud secrets create`.

## Rollback

The old Cloud Scheduler job (Node shim → Heroku) is paused, not deleted.
The FastAPI endpoint (`POST /api/admin/update-game-scores`) is still live.
To roll back: `gcloud scheduler jobs resume <old-job-name> --location us-central1`.
Do not delete the Node shim or FastAPI endpoint until the Job has run cleanly
for at least one week.

## One-time setup (already done — for reference)

```bash
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com artifactregistry.googleapis.com

gcloud artifacts repositories create survivor-jobs --repository-format=docker --location=us-central1

source .env.prod
echo -n "$MONGODB_URI"          | gcloud secrets create mongodb-uri --data-file=-
echo -n "$FOOTBALLDATA_API_KEY" | gcloud secrets create footballdata-api-key --data-file=-

export SCHED_SA=cloud-scheduler-sa@survivor-473803.iam.gserviceaccount.com
gcloud iam service-accounts create cloud-scheduler-sa --display-name "Cloud Scheduler SA"
gcloud run jobs add-iam-policy-binding game-updater \
  --region us-central1 \
  --member=serviceAccount:$SCHED_SA \
  --role=roles/run.invoker
gcloud scheduler jobs create http game-updater-schedule \
  --location us-central1 \
  --schedule "*/15 * * * *" \
  --uri "https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/survivor-473803/jobs/game-updater:run" \
  --http-method POST \
  --oauth-service-account-email $SCHED_SA
```
