"""Live-MongoDB verification, required by CR-105-FINDINGS.md Addendum 2
("Live MongoDB verification... Phase 1 was never run against a real Mongo
instance... get a Mongo instance up... and actually exercise the data-access
functions against real data"). Phase 1's own verification was `py_compile`
and import-only (api/README.md, CR-105-PHASE1-REPORT.md's "Verification
performed" section) -- this suite is the actual exercise-against-real-data
step, run during Phase 2 against a local `mongo:7` Docker container and left
here so it can be re-run (CI, a future contributor with Docker/Atlas) instead
of being a one-off manual session.

Skips cleanly (does not fail the suite) if MONGODB_URI isn't set -- this
suite needs a real, reachable, and disposable MongoDB instance (it writes
real documents), unlike test_game_utils_parity.py which is pure computation
and always runs.

Run against a local container:
    docker run -d --rm -p 27117:27017 mongo:7
    MONGODB_URI=mongodb://localhost:27117 MONGODB_DB_NAME=survivor-cr105-smoke \\
        python -m pytest tests/test_live_mongo_smoke.py -q
"""
import os
import uuid

import pytest
from bson import ObjectId

pytestmark = pytest.mark.skipif(
    not os.environ.get("MONGODB_URI"), reason="MONGODB_URI not set -- live-Mongo smoke test skipped"
)


@pytest.fixture(autouse=True)
async def _fresh_database():
    """Points at an isolated, throwaway database name for this test run (does
    not touch a real survivor-league database), and drops it afterward.

    Also resets app/db/mongodb.py's module-level Motor client before each
    test: that client is bound to whatever asyncio event loop was running
    when it was first constructed, and pytest-asyncio gives each test
    function its own fresh loop by default -- reusing a client across loops
    raises "Event loop is closed" on the second test. A real long-lived
    FastAPI process only ever has one loop, so this is a test-harness-only
    concern, not a production code issue.
    """
    import app.db.mongodb as mongodb_module

    os.environ["MONGODB_DB_NAME"] = f"survivor-cr105-smoke-{uuid.uuid4().hex[:8]}"
    mongodb_module.close_client()

    yield

    db_name = mongodb_module.get_database().name
    await mongodb_module.get_client().drop_database(db_name)
    mongodb_module.close_client()


@pytest.mark.asyncio
async def test_user_crud_round_trip():
    from app.db.auth import create_user, get_user_by_id, verify_password

    user = await create_user(f"live-{uuid.uuid4().hex[:8]}@example.com", "correct-password")
    fetched = await get_user_by_id(user.id)
    assert fetched is not None
    assert fetched.email == user.email

    verified = await verify_password(user.email, "correct-password")
    assert verified is not None and verified.id == user.id

    wrong = await verify_password(user.email, "wrong-password")
    assert wrong is None


@pytest.mark.asyncio
async def test_league_and_membership_round_trip():
    from app.db.auth import create_user
    from app.db.leagues import get_league_by_id
    from app.db.leagues import create_league
    from app.db.memberships import get_membership_for_user, create_league_membership

    owner = await create_user(f"live-owner-{uuid.uuid4().hex[:8]}@example.com", "password123")
    league = await create_league("Live Smoke League", "desc", "EPL", "2025/2026", True, False, owner.id)

    # DRIFT FIX verification (CR-105-FINDINGS.md Table 4, League row): id and
    # createdBy really are strings coming back off a live Mongo ObjectId, not
    # the `number` the old TS type declared.
    assert isinstance(league.id, str)
    assert isinstance(league.createdBy, str)

    fetched = await get_league_by_id(league.id)
    assert fetched is not None and fetched.name == "Live Smoke League"

    membership = await create_league_membership(league.id, owner.id, "Owner Team", is_admin=True)
    assert membership.isAdmin is True

    looked_up = await get_membership_for_user(league.id, owner.id)
    assert looked_up is not None and looked_up.id == membership.id


@pytest.mark.asyncio
async def test_create_pick_draw_bug_fix_against_live_data():
    """The specific bug CR-105-FINDINGS.md Table 4 named: createPick's own
    inline result computation never checked for a tie. Exercised here against
    a real, already-completed, drawn game inserted straight into Mongo (not a
    mock), for both the home- and away-team picker."""
    from datetime import datetime, timedelta, timezone

    from app.db.auth import create_user
    from app.db.leagues import create_league
    from app.db.mongodb import Collections, get_database
    from app.db.picks import create_pick

    db = get_database()
    owner = await create_user(f"live-drawpick-{uuid.uuid4().hex[:8]}@example.com", "password123")
    league = await create_league("Draw Bug League", "desc", "EPL", "2025/2026", True, False, owner.id)

    home_id, away_id = 9001, 9002
    await db[Collections.TEAMS].insert_many([
        {"id": home_id, "name": "Home FC", "abbreviation": "HFC", "logo": "home.png"},
        {"id": away_id, "name": "Away FC", "abbreviation": "AFC", "logo": "away.png"},
    ])
    game_id = 9100
    past = datetime.now(timezone.utc) - timedelta(hours=5)
    await db[Collections.GAMES].insert_one({
        "id": game_id, "week": 1, "homeTeamId": home_id, "awayTeamId": away_id,
        "homeScore": 1, "awayScore": 1, "status": "completed",
        "date": past, "startTime": past,
        "sportsLeague": "EPL", "season": "2025/2026",
    })

    home_picker = await create_user(f"live-home-{uuid.uuid4().hex[:8]}@example.com", "password123")
    away_picker = await create_user(f"live-away-{uuid.uuid4().hex[:8]}@example.com", "password123")

    home_pick = await create_pick(home_picker.id, league.id, game_id, home_id, 1)
    away_pick = await create_pick(away_picker.id, league.id, game_id, away_id, 1)

    assert home_pick.result == "draw", f"expected draw, got {home_pick.result!r} -- bug fix regressed"
    assert away_pick.result == "draw", f"expected draw, got {away_pick.result!r} -- bug fix regressed"


@pytest.mark.asyncio
async def test_removed_member_status_does_not_break_reads():
    """CR-107 regression: `LeagueMembership.status`'s Literal used to omit
    "removed", the exact value `remove_member_from_league` writes -- every read
    path that shapes *all* members into `LeagueMembership` Pydantic models
    (get_league_members_with_user_data, and by extension the scoreboard/results
    functions that call it) 400'd the instant a league had one removed member.
    """
    from app.db.auth import create_user
    from app.db.leagues import create_league
    from app.db.memberships import (
        create_league_membership,
        get_league_members_with_user_data,
        remove_member_from_league,
    )
    from app.db.results import get_league_results, get_scoreboard_with_picks
    from app.db.mongodb import Collections, get_database

    owner = await create_user(f"live-owner-{uuid.uuid4().hex[:8]}@example.com", "password123")
    league = await create_league("Removed Member League", "desc", "EPL", "2025/2026", True, False, owner.id)
    await create_league_membership(league.id, owner.id, "Owner Team", is_admin=True)

    kept_user = await create_user(f"live-kept-{uuid.uuid4().hex[:8]}@example.com", "password123")
    kept_membership = await create_league_membership(league.id, kept_user.id, "Kept Team")

    removed_user = await create_user(f"live-removed-{uuid.uuid4().hex[:8]}@example.com", "password123")
    removed_membership = await create_league_membership(league.id, removed_user.id, "Removed Team")
    await remove_member_from_league(league.id, removed_membership.id, owner.id)

    # AC2 -- reading all members (including the "removed" one) must not 400
    # with a Pydantic validation error.
    members = await get_league_members_with_user_data(league.id)
    statuses = {m.id: m.status for m in members}
    assert statuses[removed_membership.id] == "removed"
    assert statuses[kept_membership.id] == "active"

    # AC3 -- "removed" being a valid enum value now must not surface removed
    # members as active anywhere that already filters on status == "active".
    scoreboard = await get_scoreboard_with_picks(league.id)
    scoreboard_ids = {p.id for p in scoreboard["players"]}
    assert removed_user.id not in scoreboard_ids
    assert kept_user.id in scoreboard_ids

    # get_league_results only returns data once last_completed_week > 0.
    await get_database()[Collections.LEAGUES].update_one(
        {"_id": ObjectId(league.id)}, {"$set": {"last_completed_week": 1}},
    )
    results = await get_league_results(league.id)
    result_ids = {u.id for u in results.users}
    assert removed_user.id not in result_ids
    assert kept_user.id in result_ids
