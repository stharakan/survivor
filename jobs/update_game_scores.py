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
