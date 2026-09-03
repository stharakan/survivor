"""Local runner for the game-score updater. Cron this instead of hitting the Heroku endpoint.

Defaults to dev (.env.local, auto-loaded by app.core.config). Pass --prod to
load .env.prod first with override=True so its MONGODB_URI wins.

Usage:
    uv run --project . python scripts/update_game_scores.py           # dev
    uv run --project . python scripts/update_game_scores.py --prod    # prod
"""
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent

if "--prod" in sys.argv:
    from dotenv import load_dotenv
    prod_env = _REPO_ROOT / ".env.prod"
    if not prod_env.exists():
        print(f"ERROR: --prod passed but {prod_env} does not exist", file=sys.stderr)
        sys.exit(2)
    load_dotenv(prod_env, override=True)

sys.path.insert(0, str(_REPO_ROOT / "api"))

from app.db.game_updater import update_game_scores  # noqa: E402
from app.db.mongodb import close_client  # noqa: E402


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).isoformat()}] {msg}", flush=True)


async def main() -> int:
    env_label = "PROD" if "--prod" in sys.argv else "DEV"
    log(f"=== Game Score Update Started ({env_label}) ===")
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
