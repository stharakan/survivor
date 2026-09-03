"""Unit tests for calculate_scores_and_strikes() in app/db/scoring.py.

Requires a live MongoDB. Skips cleanly if MONGODB_URI is unset.

Run:
    MONGODB_URI=mongodb://localhost:27017 uv run --project .. pytest tests/test_scoring.py -v
"""
import os
import uuid

import pytest
from bson import ObjectId

pytestmark = pytest.mark.skipif(
    not os.environ.get("MONGODB_URI"),
    reason="MONGODB_URI not set -- live-Mongo scoring test skipped",
)


@pytest.fixture(autouse=True)
async def _fresh_database():
    import app.db.mongodb as mongodb_module

    os.environ["MONGODB_DB_NAME"] = f"survivor-scoring-{uuid.uuid4().hex[:8]}"
    mongodb_module.close_client()

    yield

    db_name = mongodb_module.get_database().name
    await mongodb_module.get_client().drop_database(db_name)
    mongodb_module.close_client()


@pytest.mark.asyncio
async def test_points_update_before_gameweek_completes():
    """A win pick in week 1 earns 3 points even when last_completed_week is still 0
    (i.e. the gameweek isn't fully over yet). This was the live bug on 2026-08-21
    where Arsenal won but all memberships stayed at 0 points until every GW1 game
    finished."""
    from app.db.mongodb import get_database, Collections
    from app.db.scoring import calculate_scores_and_strikes

    db = get_database()
    user_id = ObjectId()
    season_id = ObjectId()

    # Season where week 1 is not yet complete
    await db[Collections.LEAGUE_SEASONS].insert_one({
        "_id": season_id,
        "isActive": True,
        "last_completed_week": 0,
    })

    membership_doc = {
        "userId": user_id,
        "leagueSeasonId": season_id,
        "isActive": True,
        "status": "active",
        "teamName": "Test Team",
        "points": 0,
        "strikes": 0,
        "lossStrikes": 0,
        "missingPickStrikes": 0,
    }
    await db[Collections.LEAGUE_MEMBERSHIPS].insert_one(membership_doc)

    # Pick with result already written (game completed) but week 1 not fully done
    await db[Collections.PICKS].insert_one({
        "userId": user_id,
        "leagueSeasonId": season_id,
        "gameId": 999,
        "teamId": 1,
        "week": 1,
        "result": "win",
    })

    await calculate_scores_and_strikes()

    updated = await db[Collections.LEAGUE_MEMBERSHIPS].find_one({"userId": user_id})
    assert updated["points"] == 3, (
        f"Expected 3 points for a win in an incomplete gameweek, got {updated['points']}"
    )
    assert updated["lossStrikes"] == 0
    # Week 1 isn't complete yet, so no missing-pick strike either
    assert updated["missingPickStrikes"] == 0
    assert updated["strikes"] == 0


@pytest.mark.asyncio
async def test_missing_pick_strikes_still_gated_on_completed_week():
    """Missing-pick strikes must not fire for in-progress weeks. A user who hasn't
    picked week 1 yet (week 1 not complete) should have 0 missing-pick strikes."""
    from app.db.mongodb import get_database, Collections
    from app.db.scoring import calculate_scores_and_strikes

    db = get_database()
    user_id = ObjectId()
    season_id = ObjectId()

    await db[Collections.LEAGUE_SEASONS].insert_one({
        "_id": season_id,
        "isActive": True,
        "last_completed_week": 0,
    })

    await db[Collections.LEAGUE_MEMBERSHIPS].insert_one({
        "userId": user_id,
        "leagueSeasonId": season_id,
        "isActive": True,
        "status": "active",
        "teamName": "No Pick Team",
        "points": 0,
        "strikes": 0,
        "lossStrikes": 0,
        "missingPickStrikes": 0,
    })

    # No picks at all — week 1 is in progress

    await calculate_scores_and_strikes()

    updated = await db[Collections.LEAGUE_MEMBERSHIPS].find_one({"userId": user_id})
    assert updated["missingPickStrikes"] == 0
    assert updated["strikes"] == 0


@pytest.mark.asyncio
async def test_missing_pick_strike_fires_after_week_completes():
    """Once last_completed_week advances to 1, a user with no pick that week gets
    a missing-pick strike."""
    from app.db.mongodb import get_database, Collections
    from app.db.scoring import calculate_scores_and_strikes

    db = get_database()
    user_id = ObjectId()
    season_id = ObjectId()

    await db[Collections.LEAGUE_SEASONS].insert_one({
        "_id": season_id,
        "isActive": True,
        "last_completed_week": 1,
    })

    await db[Collections.LEAGUE_MEMBERSHIPS].insert_one({
        "userId": user_id,
        "leagueSeasonId": season_id,
        "isActive": True,
        "status": "active",
        "teamName": "No Pick Team",
        "points": 0,
        "strikes": 0,
        "lossStrikes": 0,
        "missingPickStrikes": 0,
    })

    # No picks at all, but week 1 is now fully complete

    await calculate_scores_and_strikes()

    updated = await db[Collections.LEAGUE_MEMBERSHIPS].find_one({"userId": user_id})
    assert updated["missingPickStrikes"] == 1
    assert updated["strikes"] == 1


@pytest.mark.asyncio
async def test_in_progress_week_win_does_not_generate_missing_pick_strike():
    """A pick in week 2 (in-progress) earns points immediately. weeks_with_picks
    for missing-pick math only counts week 1 (completed), so no spurious extra
    strike from the week-2 pick being excluded from the completed-weeks set."""
    from app.db.mongodb import get_database, Collections
    from app.db.scoring import calculate_scores_and_strikes

    db = get_database()
    user_id = ObjectId()
    season_id = ObjectId()

    # Week 1 complete, week 2 in progress
    await db[Collections.LEAGUE_SEASONS].insert_one({
        "_id": season_id,
        "isActive": True,
        "last_completed_week": 1,
    })

    await db[Collections.LEAGUE_MEMBERSHIPS].insert_one({
        "userId": user_id,
        "leagueSeasonId": season_id,
        "isActive": True,
        "status": "active",
        "teamName": "Early Bird",
        "points": 0,
        "strikes": 0,
        "lossStrikes": 0,
        "missingPickStrikes": 0,
    })

    # Pick for week 1 (completed week) — win
    await db[Collections.PICKS].insert_one({
        "userId": user_id,
        "leagueSeasonId": season_id,
        "gameId": 1,
        "teamId": 1,
        "week": 1,
        "result": "win",
    })
    # Pick for week 2 (in-progress week) — also already has result
    await db[Collections.PICKS].insert_one({
        "userId": user_id,
        "leagueSeasonId": season_id,
        "gameId": 2,
        "teamId": 2,
        "week": 2,
        "result": "win",
    })

    await calculate_scores_and_strikes()

    updated = await db[Collections.LEAGUE_MEMBERSHIPS].find_one({"userId": user_id})
    assert updated["points"] == 6  # both wins count
    assert updated["missingPickStrikes"] == 0  # week 1 pick present; week 2 not counted
    assert updated["strikes"] == 0
