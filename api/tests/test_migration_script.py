"""Integration test for scripts/migrate-league-to-leagueseason.ts (SUR-010 Stage E).

Seeds a disposable Docker Mongo with old-shape League fixture data, runs the
migration script with --execute, then asserts Phase 3 invariants.

Skips cleanly if MONGODB_URI isn't set.

Run against a local container:
    docker run -d --rm -p 27117:27017 mongo:7
    MONGODB_URI=mongodb://localhost:27117 \\
        python -m pytest tests/test_migration_script.py -v
"""
import os
import subprocess
import uuid

import pytest
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

pytestmark = pytest.mark.skipif(
    not os.environ.get("MONGODB_URI"),
    reason="MONGODB_URI not set -- migration script integration test skipped",
)

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEPENDENT_COLLECTIONS = ["league_memberships", "picks", "league_invitations", "audit_logs"]


@pytest.fixture
async def migr_db():
    """Disposable database for one migration test run."""
    uri = os.environ["MONGODB_URI"]
    db_name = f"survivor-migr-test-{uuid.uuid4().hex[:8]}"
    client = AsyncIOMotorClient(uri)
    db = client[db_name]
    yield db, db_name
    await client.drop_database(db_name)
    client.close()


async def _seed_old_shape(db):
    """Insert two old-shape League docs + dependents into db, return ids."""
    real_league_id = ObjectId()
    demo_league_id = ObjectId()
    admin_user_id = ObjectId()
    member_user_id = ObjectId()

    await db["leagues"].insert_many([
        {
            "_id": real_league_id,
            "name": "Tharakan Bros Survivor League",
            "description": "The real one",
            "sportsLeague": "EPL",
            "season": "2025/2026",
            "isActive": True,
            "memberCount": 2,
            "isPublic": True,
            "requiresApproval": False,
            "hideScoreboard": None,  # null — tests the ?? false coercion
            "current_game_week": 26,
            "current_pick_week": 27,
            "last_completed_week": 26,
            "createdBy": str(admin_user_id),
            "createdAt": "2025-08-12T00:00:00Z",
            "logo": None,
            "seasonArchive": [],
        },
        {
            "_id": demo_league_id,
            "name": "Demo League",
            "description": "Seed data",
            "sportsLeague": "EPL",
            "season": "2024/2025",
            "isActive": True,
            "memberCount": 3,
            "isPublic": True,
            "requiresApproval": False,
            "hideScoreboard": False,
            "current_game_week": None,
            "current_pick_week": None,
            "last_completed_week": None,
            "createdBy": str(admin_user_id),
            "createdAt": "2025-08-08T00:00:00Z",
            "logo": None,
            "seasonArchive": [],
        },
    ])

    await db["league_memberships"].insert_many([
        {
            "leagueId": real_league_id,
            "userId": admin_user_id,
            "teamName": "Admin Team",
            "isAdmin": True,
            "isPaid": True,
            "status": "active",
            "joinedAt": "2025-08-12T00:00:00Z",
        },
        {
            "leagueId": real_league_id,
            "userId": member_user_id,
            "teamName": "Member Team",
            "isAdmin": False,
            "isPaid": False,
            "status": "active",
            "joinedAt": "2025-08-13T00:00:00Z",
        },
        {
            "leagueId": demo_league_id,
            "userId": member_user_id,
            "teamName": "Demo Member",
            "isAdmin": False,
            "isPaid": False,
            "status": "active",
            "joinedAt": "2025-08-08T00:00:00Z",
        },
    ])

    await db["picks"].insert_many([
        {"leagueId": real_league_id, "userId": admin_user_id, "week": 1, "teamId": "arsenal"},
        {"leagueId": demo_league_id, "userId": member_user_id, "week": 1, "teamId": "chelsea"},
    ])

    await db["league_invitations"].insert_one({
        "leagueId": real_league_id,
        "token": "invite-token-123",
        "isActive": True,
        "createdAt": "2025-08-12T00:00:00Z",
    })

    await db["audit_logs"].insert_one({
        "leagueId": real_league_id,
        "action": "member_added",
        "userId": str(member_user_id),
        "createdAt": "2025-08-13T00:00:00Z",
    })

    return {
        "real_league_id": real_league_id,
        "demo_league_id": demo_league_id,
        "admin_user_id": admin_user_id,
        "member_user_id": member_user_id,
    }


def _run_script(db_name: str, *extra_args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["npx", "tsx", "scripts/migrate-league-to-leagueseason.ts", "--allow-prod", *extra_args],
        cwd=REPO_ROOT,
        env={**os.environ, "MONGODB_URI": os.environ["MONGODB_URI"], "MONGODB_DB_NAME": db_name},
        capture_output=True,
        text=True,
        timeout=60,
    )


async def _assert_phase3_invariants(db, ids: dict):
    """Assert all Phase 3 invariants from the ticket spec."""
    seasons = await db["league_seasons"].find({}).to_list(length=None)
    assert len(seasons) == 1, f"Expected 1 league_seasons doc (Demo deleted), got {len(seasons)}"

    for s in seasons:
        assert s.get("leagueId") is not None, f"league_seasons {s['_id']} has null leagueId"
        parent = await db["leagues"].find_one({"_id": s["leagueId"]})
        assert parent is not None, f"leagueId {s['leagueId']} has no matching leagues doc"

    parents = await db["leagues"].find({}).to_list(length=None)
    assert len(parents) == 1, f"Expected 1 parent leagues doc, got {len(parents)}"
    for p in parents:
        assert p.get("currentSeasonId") is not None, f"leagues {p['_id']} has no currentSeasonId"
        season = await db["league_seasons"].find_one({"_id": p["currentSeasonId"]})
        assert season is not None, f"currentSeasonId {p['currentSeasonId']} has no matching league_seasons doc"
        assert season["leagueId"] == p["_id"], (
            f"Round-trip failed: league_seasons.leagueId={season['leagueId']} != leagues._id={p['_id']}"
        )

    for coll in DEPENDENT_COLLECTIONS:
        old_count = await db[coll].count_documents({"leagueId": {"$exists": True}})
        assert old_count == 0, f"{coll} still has {old_count} docs with old leagueId field"

    # Demo League dependents deleted
    demo_members = await db["league_memberships"].count_documents(
        {"leagueSeasonId": ids["demo_league_id"]}
    )
    assert demo_members == 0, "Demo League memberships should have been deleted"

    # Real league: memberships + picks queryable under leagueSeasonId (same ObjectId, renamed)
    real_members = await db["league_memberships"].find(
        {"leagueSeasonId": ids["real_league_id"]}
    ).to_list(length=None)
    assert len(real_members) == 2, f"Expected 2 memberships under real league, got {len(real_members)}"

    real_picks = await db["picks"].find(
        {"leagueSeasonId": ids["real_league_id"]}
    ).to_list(length=None)
    assert len(real_picks) == 1, f"Expected 1 pick under real league, got {len(real_picks)}"

    # hideScoreboard null coerced to False
    season_doc = seasons[0]
    assert season_doc.get("hideScoreboard") is False, (
        f"hideScoreboard should be False (coerced from null), got {season_doc.get('hideScoreboard')!r}"
    )


@pytest.mark.asyncio
async def test_execute_and_verify(migr_db):
    """Full migration: seed old-shape, run --execute, assert all Phase 3 invariants."""
    db, db_name = migr_db
    ids = await _seed_old_shape(db)

    result = _run_script(db_name, "--execute")
    assert result.returncode == 0, (
        f"Migration script exited {result.returncode}:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    )

    await _assert_phase3_invariants(db, ids)


@pytest.mark.asyncio
async def test_dry_run_no_writes(migr_db):
    """Default (dry-run) mode must not modify any documents."""
    db, db_name = migr_db
    await _seed_old_shape(db)

    pre_league_count = await db["leagues"].count_documents({})

    result = _run_script(db_name)  # no --execute → dry-run
    assert result.returncode == 0, (
        f"Dry-run exited {result.returncode}:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    )

    assert await db["leagues"].count_documents({}) == pre_league_count
    assert await db["league_seasons"].count_documents({}) == 0

    for coll in DEPENDENT_COLLECTIONS:
        old_count = await db[coll].count_documents({"leagueId": {"$exists": True}})
        assert old_count > 0, f"{coll} should still have leagueId after dry-run"


@pytest.mark.asyncio
async def test_idempotent(migr_db):
    """Running --execute twice must not fail or corrupt data."""
    db, db_name = migr_db
    ids = await _seed_old_shape(db)

    r1 = _run_script(db_name, "--execute")
    assert r1.returncode == 0, f"First run failed:\n{r1.stdout}\n{r1.stderr}"

    r2 = _run_script(db_name, "--execute")
    assert r2.returncode == 0, f"Second run failed:\n{r2.stdout}\n{r2.stderr}"

    r3 = _run_script(db_name, "--verify-only")
    assert r3.returncode == 0, f"Verify-only after double-run failed:\n{r3.stdout}\n{r3.stderr}"

    await _assert_phase3_invariants(db, ids)
