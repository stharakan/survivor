"""Port of lib/mongodb.ts. Single Motor (async Mongo driver) client, matching the
Next.js app's collection layout exactly so both backends can run against the same
database during the parallel-run/parity-validation phase described in
CR-105-FINDINGS.md's Context section.
"""
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

# Load env files so MONGODB_URI/MONGODB_DB_NAME are present even when this
# module is imported/used without going through app.main (e.g. a script or a
# test that calls get_client() directly) -- same loading as
# app/core/config.py, duplicated here rather than imported to keep db/ from
# depending on core/. override=False + api/.env before .env.local: real env
# vars always win, then api/.env, then the repo-root .env.local shared with
# the Next.js app (see root CLAUDE.md). No-op if neither file exists.
_API_DIR = Path(__file__).resolve().parents[2]
load_dotenv(_API_DIR / ".env", override=False)
load_dotenv(_API_DIR.parent / ".env.local", override=False)

_client: Optional[AsyncIOMotorClient] = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        uri = os.environ.get("MONGODB_URI")
        if not uri:
            raise RuntimeError('Invalid/Missing environment variable: "MONGODB_URI"')
        # tz_aware=True: Motor otherwise returns naive UTC datetimes, which can't
        # be compared against `datetime.now(timezone.utc)` -- several ported
        # functions (invitations.py's expiry check, game_updater.py's overdue-game
        # scan) do exactly that comparison.
        _client = AsyncIOMotorClient(uri, tz_aware=True)
    return _client


def get_database() -> AsyncIOMotorDatabase:
    db_name = os.environ.get("MONGODB_DB_NAME", "survivor-league")
    return get_client()[db_name]


def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


class Collections:
    """Port of lib/mongodb.ts:48-57."""

    USERS = "users"
    LEAGUES = "leagues"
    LEAGUE_SEASONS = "league_seasons"
    LEAGUE_MEMBERSHIPS = "league_memberships"
    TEAMS = "teams"
    GAMES = "games"
    PICKS = "picks"
    # Dead collection: the JoinRequest feature (approveJoinRequest/
    # rejectJoinRequest/requestToJoinLeague/getJoinRequests) is dropped per the
    # CR-105 cut-list decision (2026-08-06). Kept here only for name parity with
    # lib/mongodb.ts; nothing in app/db/ reads or writes it.
    JOIN_REQUESTS = "join_requests"
    LEAGUE_INVITATIONS = "league_invitations"
    PASSWORD_RESET_TOKENS = "password_reset_tokens"
