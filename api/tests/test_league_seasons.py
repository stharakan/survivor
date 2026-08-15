"""Live-MongoDB tests for the create_league_season() carryover logic (SUR-010 Stage E).

Skips cleanly if MONGODB_URI isn't set.

Run against a local container:
    docker run -d --rm -p 27117:27017 mongo:7
    MONGODB_URI=mongodb://localhost:27117 MONGODB_DB_NAME=survivor-sur010-smoke \\
        python -m pytest tests/test_league_seasons.py -v
"""
import os
import uuid

import pytest
from bson import ObjectId

pytestmark = pytest.mark.skipif(
    not os.environ.get("MONGODB_URI"),
    reason="MONGODB_URI not set -- live-Mongo SUR-010 test skipped",
)


@pytest.fixture(autouse=True)
async def _fresh_database():
    import app.db.mongodb as mongodb_module

    os.environ["MONGODB_DB_NAME"] = f"survivor-sur010-{uuid.uuid4().hex[:8]}"
    mongodb_module.close_client()

    yield

    db_name = mongodb_module.get_database().name
    await mongodb_module.get_client().drop_database(db_name)
    mongodb_module.close_client()


@pytest.mark.asyncio
async def test_create_league_season_carryover():
    """Verify: active memberships carry over with isPaid reset; admin flags preserved;
    outgoing season deactivated; League.currentSeasonId + pastSeasonIds updated."""
    from app.db.auth import create_user
    from app.db.leagues import create_league
    from app.db.memberships import create_league_membership
    from app.db.league_seasons import create_league_season
    from app.db.mongodb import get_database, Collections

    owner = await create_user(f"owner-{uuid.uuid4().hex[:8]}@test.com", "password")
    # league.id == LeagueSeason._id for 2025/2026
    league = await create_league("Rollover League", "desc", "EPL", "2025/2026", True, False, owner.id)

    db = get_database()
    season_doc = await db[Collections.LEAGUE_SEASONS].find_one({"_id": ObjectId(league.id)})
    parent_league_id = str(season_doc["leagueId"])

    await create_league_membership(league.id, owner.id, "Owner Team", is_admin=True)

    member1 = await create_user(f"m1-{uuid.uuid4().hex[:8]}@test.com", "password")
    await create_league_membership(league.id, member1.id, "Member One")
    # Mark member1 as paid in the old season
    await db[Collections.LEAGUE_MEMBERSHIPS].update_one(
        {"leagueSeasonId": ObjectId(league.id), "userId": ObjectId(member1.id)},
        {"$set": {"isPaid": True}},
    )

    new_season = await create_league_season(parent_league_id, "2026/2027")

    # Old season deactivated
    old_season = await db[Collections.LEAGUE_SEASONS].find_one({"_id": ObjectId(league.id)})
    assert old_season["isActive"] is False

    # New season active, memberCount correct
    new_doc = await db[Collections.LEAGUE_SEASONS].find_one({"_id": ObjectId(new_season.id)})
    assert new_doc["isActive"] is True
    assert new_doc["memberCount"] == 2  # owner + member1

    # Parent League pointers updated
    parent = await db[Collections.LEAGUES].find_one({"_id": ObjectId(parent_league_id)})
    assert str(parent["currentSeasonId"]) == new_season.id
    assert ObjectId(league.id) in parent["pastSeasonIds"]

    # New memberships: isPaid reset, isAdmin preserved
    new_memberships = await db[Collections.LEAGUE_MEMBERSHIPS].find(
        {"leagueSeasonId": ObjectId(new_season.id)}
    ).to_list(length=None)
    assert len(new_memberships) == 2

    owner_m = next(m for m in new_memberships if m["userId"] == ObjectId(owner.id))
    assert owner_m["isAdmin"] is True
    assert owner_m["isPaid"] is False  # reset

    member1_m = next(m for m in new_memberships if m["userId"] == ObjectId(member1.id))
    assert member1_m["isPaid"] is False  # reset despite being paid in old season
    assert member1_m["isAdmin"] is False


@pytest.mark.asyncio
async def test_old_season_still_queryable_after_rollover():
    """After creating a new season, picks/results on the old season remain readable."""
    from app.db.auth import create_user
    from app.db.leagues import create_league
    from app.db.league_seasons import create_league_season, get_league_season_by_id
    from app.db.mongodb import get_database, Collections

    owner = await create_user(f"owner2-{uuid.uuid4().hex[:8]}@test.com", "password")
    league = await create_league("History League", "desc", "EPL", "2025/2026", True, False, owner.id)

    db = get_database()
    season_doc = await db[Collections.LEAGUE_SEASONS].find_one({"_id": ObjectId(league.id)})
    parent_id = str(season_doc["leagueId"])

    new_season = await create_league_season(parent_id, "2026/2027")

    # Old season still fetchable
    old = await get_league_season_by_id(league.id)
    assert old is not None
    assert old.season == "2025/2026"
    assert old.isActive is False

    # New season fetchable
    new = await get_league_season_by_id(new_season.id)
    assert new is not None
    assert new.season == "2026/2027"
    assert new.isActive is True
