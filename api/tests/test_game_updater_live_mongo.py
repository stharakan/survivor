"""SUR-008: live-MongoDB verification for the DB-touching pieces of the
postponed/rescheduled-game fix, following the `test_live_mongo_smoke.py`
pattern -- there's no mongomock (or similar) in this codebase's test suite
(see the ticket's Architecture Notes item 6), so pure-function tests live in
test_game_updater_status_mapping.py / test_game_utils_parity.py and everything
that actually reads/writes Mongo lives here instead.

Skips cleanly (does not fail the suite) if MONGODB_URI isn't set.

Run against a local container:
    docker run -d --rm -p 27117:27017 mongo:7
    MONGODB_URI=mongodb://localhost:27117 MONGODB_DB_NAME=survivor-sur008-test \\
        python -m pytest tests/test_game_updater_live_mongo.py -q
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId

pytestmark = pytest.mark.skipif(
    not os.environ.get("MONGODB_URI"), reason="MONGODB_URI not set -- live-Mongo SUR-008 test skipped"
)


@pytest.fixture(autouse=True)
async def _fresh_database():
    """Same isolated-throwaway-database + Motor-client-reset pattern as
    test_live_mongo_smoke.py -- see that file's fixture docstring."""
    import app.db.mongodb as mongodb_module

    os.environ["MONGODB_DB_NAME"] = f"survivor-sur008-{uuid.uuid4().hex[:8]}"
    mongodb_module.close_client()

    yield

    db_name = mongodb_module.get_database().name
    await mongodb_module.get_client().drop_database(db_name)
    mongodb_module.close_client()


SPORTS_LEAGUE = "EPL"
SEASON = "2025/2026"
_next_game_id = iter(range(80000, 90000))
_next_team_id = iter(range(80000, 90000))


async def _insert_teams(db, n=2):
    ids = [next(_next_team_id) for _ in range(n)]
    await db["teams"].insert_many([
        {"id": i, "name": f"Team {i}", "abbreviation": f"T{i}", "logo": f"{i}.png"} for i in ids
    ])
    return ids


async def _insert_game(db, *, week, status, when, home_id, away_id, home_score=None, away_score=None, **extra):
    game_id = next(_next_game_id)
    doc = {
        "id": game_id,
        "week": week,
        "homeTeamId": home_id,
        "awayTeamId": away_id,
        "homeScore": home_score,
        "awayScore": away_score,
        "status": status,
        "date": when,
        "startTime": when,
        "sportsLeague": SPORTS_LEAGUE,
        "season": SEASON,
        **extra,
    }
    result = await db["games"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


async def _insert_pick(db, *, user_id, league_id, game_id, team_id, week, result=None):
    pick_doc = {
        "userId": ObjectId(user_id),
        "leagueId": ObjectId(league_id),
        "gameId": game_id,
        "teamId": team_id,
        "result": result,
        "week": week,
        "createdAt": datetime.now(timezone.utc),
    }
    insert_result = await db["picks"].insert_one(pick_doc)
    pick_doc["_id"] = insert_result.inserted_id
    return pick_doc


async def _set_league_weeks(db, league_id, *, current_game_week, current_pick_week):
    await db["leagues"].update_one(
        {"_id": ObjectId(league_id)},
        {"$set": {"current_game_week": current_game_week, "current_pick_week": current_pick_week}},
    )


@pytest.mark.asyncio
async def test_last_completed_week_excludes_postponed_games():
    from app.db.game_updater import _calculate_last_completed_week
    from app.db.mongodb import get_database

    db = get_database()
    home_id, away_id = await _insert_teams(db)
    now = datetime.now(timezone.utc)

    # Week 1: all completed -> should resolve as the last completed week.
    for _ in range(2):
        await _insert_game(db, week=1, status="completed", when=now, home_id=home_id, away_id=away_id,
                            home_score=1, away_score=0)
    assert await _calculate_last_completed_week(SPORTS_LEAGUE, SEASON) == 1

    # Week 2: one postponed + rest completed -> still resolves as complete
    # (the postponed game is excluded from the match entirely, not counted
    # against the week -- this is the fix, previously it would have read as
    # "completed" with null scores and NOT blocked week 2, but for the wrong,
    # zombie-state reason; this asserts the correct, intentional exclusion).
    await _insert_game(db, week=2, status="completed", when=now, home_id=home_id, away_id=away_id,
                        home_score=2, away_score=1)
    await _insert_game(db, week=2, status="postponed", when=now, home_id=home_id, away_id=away_id,
                        isPostponed=True, originalWeek=2)
    assert await _calculate_last_completed_week(SPORTS_LEAGUE, SEASON) == 2

    # Week 3: one not_started + rest completed -> must NOT be counted (regression check).
    await _insert_game(db, week=3, status="completed", when=now, home_id=home_id, away_id=away_id,
                        home_score=1, away_score=1)
    await _insert_game(db, week=3, status="not_started", when=now + timedelta(days=1), home_id=home_id, away_id=away_id)
    assert await _calculate_last_completed_week(SPORTS_LEAGUE, SEASON) == 2


@pytest.mark.asyncio
async def test_postponement_before_gameweek_start_deletes_picks():
    from app.db.auth import create_user
    from app.db.game_updater import _update_game_in_database
    from app.db.leagues import create_league
    from app.db.memberships import create_league_membership
    from app.db.mongodb import get_database

    db = get_database()
    home_id, away_id = await _insert_teams(db)
    now = datetime.now(timezone.utc)

    owner = await create_user(f"sur008-pre-{uuid.uuid4().hex[:8]}@example.com", "password123")
    league = await create_league("SUR-008 Pre League", "desc", SPORTS_LEAGUE, SEASON, True, False, owner.id)
    await create_league_membership(league.id, owner.id, "Owner Team")

    # Gameweek 2 has not started: current_game_week/current_pick_week both at 1.
    await _set_league_weeks(db, league.id, current_game_week=1, current_pick_week=1)

    game = await _insert_game(db, week=2, status="not_started", when=now + timedelta(days=7),
                               home_id=home_id, away_id=away_id)
    await _insert_pick(db, user_id=owner.id, league_id=league.id, game_id=game["id"], team_id=home_id, week=2)

    api_game = {"id": 999001, "status": "POSTPONED", "utcDate": (now + timedelta(days=35)).isoformat(),
                "score": {"fullTime": {"home": None, "away": None}}}
    outcome = await _update_game_in_database(game, api_game)

    assert outcome["statusChangedToPostponed"] is True
    assert outcome["picksDeleted"] == 1
    assert outcome["picksMarkedDnp"] == 0

    remaining_picks = await db["picks"].count_documents({"gameId": game["id"]})
    assert remaining_picks == 0

    updated_game = await db["games"].find_one({"id": game["id"]})
    assert updated_game["status"] == "postponed"
    assert updated_game["isPostponed"] is True
    assert updated_game["originalWeek"] == 2


@pytest.mark.asyncio
async def test_postponement_after_gameweek_start_marks_dnp():
    from app.db.auth import create_user
    from app.db.game_updater import _update_game_in_database
    from app.db.leagues import create_league
    from app.db.memberships import create_league_membership
    from app.db.mongodb import get_database

    db = get_database()
    home_id, away_id = await _insert_teams(db)
    now = datetime.now(timezone.utc)

    owner = await create_user(f"sur008-post-{uuid.uuid4().hex[:8]}@example.com", "password123")
    league = await create_league("SUR-008 Post League", "desc", SPORTS_LEAGUE, SEASON, True, False, owner.id)
    await create_league_membership(league.id, owner.id, "Owner Team")

    # Gameweek 2 HAS started: current_game_week == current_pick_week == 2.
    await _set_league_weeks(db, league.id, current_game_week=2, current_pick_week=2)

    game = await _insert_game(db, week=2, status="not_started", when=now - timedelta(hours=1),
                               home_id=home_id, away_id=away_id)
    await _insert_pick(db, user_id=owner.id, league_id=league.id, game_id=game["id"], team_id=home_id, week=2)

    api_game = {"id": 999002, "status": "POSTPONED", "utcDate": (now + timedelta(days=35)).isoformat(),
                "score": {"fullTime": {"home": None, "away": None}}}
    outcome = await _update_game_in_database(game, api_game)

    assert outcome["statusChangedToPostponed"] is True
    assert outcome["picksMarkedDnp"] == 1
    assert outcome["picksDeleted"] == 0

    pick = await db["picks"].find_one({"gameId": game["id"]})
    assert pick is not None and pick["result"] == "dnp"

    updated_game = await db["games"].find_one({"id": game["id"]})
    assert updated_game["isPostponed"] is True
    assert updated_game["originalWeek"] == 2


@pytest.mark.asyncio
async def test_unpostponement_preserves_is_postponed_and_original_week():
    """Step 3d: a previously-postponed game going back to not_started (API
    finally sends a confirmed new SCHEDULED date) keeps isPostponed/originalWeek."""
    from app.db.game_updater import _update_game_in_database
    from app.db.mongodb import get_database

    db = get_database()
    home_id, away_id = await _insert_teams(db)
    now = datetime.now(timezone.utc)

    game = await _insert_game(db, week=5, status="postponed", when=now, home_id=home_id, away_id=away_id,
                               isPostponed=True, originalWeek=5)

    api_game = {"id": 999003, "status": "SCHEDULED", "utcDate": (now + timedelta(days=2)).isoformat(),
                "score": {"fullTime": {"home": None, "away": None}}}
    outcome = await _update_game_in_database(game, api_game)

    assert outcome["statusChangedToPostponed"] is False

    updated_game = await db["games"].find_one({"id": game["id"]})
    assert updated_game["status"] == "not_started"
    assert updated_game["isPostponed"] is True  # preserved, not cleared
    assert updated_game["originalWeek"] == 5   # preserved
    assert updated_game["week"] == 5           # never moved


@pytest.mark.asyncio
async def test_dnp_backfill_in_update_pick_results():
    from app.db.auth import create_user
    from app.db.leagues import create_league
    from app.db.mongodb import get_database
    from app.db.scoring import update_pick_results

    db = get_database()
    home_id, away_id = await _insert_teams(db)
    now = datetime.now(timezone.utc)

    owner = await create_user(f"sur008-dnp-{uuid.uuid4().hex[:8]}@example.com", "password123")
    league = await create_league("SUR-008 DNP League", "desc", SPORTS_LEAGUE, SEASON, True, False, owner.id)

    still_postponed_game = await _insert_game(db, week=3, status="postponed", when=now, home_id=home_id,
                                               away_id=away_id, isPostponed=True, originalWeek=3)
    now_completed_game = await _insert_game(db, week=4, status="completed", when=now - timedelta(days=1),
                                             home_id=home_id, away_id=away_id, home_score=2, away_score=0)

    still_postponed_pick = await _insert_pick(db, user_id=owner.id, league_id=league.id,
                                               game_id=still_postponed_game["id"], team_id=home_id, week=3,
                                               result="dnp")
    replayed_pick = await _insert_pick(db, user_id=owner.id, league_id=league.id,
                                        game_id=now_completed_game["id"], team_id=home_id, week=4, result="dnp")

    await update_pick_results()

    unchanged = await db["picks"].find_one({"_id": still_postponed_pick["_id"]})
    assert unchanged["result"] == "dnp"  # still postponed -- left alone

    backfilled = await db["picks"].find_one({"_id": replayed_pick["_id"]})
    assert backfilled["result"] == "win"  # home team picked, home won 2-0


@pytest.mark.asyncio
async def test_calculate_scores_and_strikes_with_dnp_picks():
    from app.db.auth import create_user
    from app.db.leagues import create_league
    from app.db.memberships import create_league_membership
    from app.db.mongodb import get_database
    from app.db.scoring import calculate_scores_and_strikes

    db = get_database()
    home_id, away_id = await _insert_teams(db)

    owner = await create_user(f"sur008-score-{uuid.uuid4().hex[:8]}@example.com", "password123")
    league = await create_league("SUR-008 Score League", "desc", SPORTS_LEAGUE, SEASON, True, False, owner.id)
    membership = await create_league_membership(league.id, owner.id, "Owner Team")

    await db["leagues"].update_one({"_id": ObjectId(league.id)}, {"$set": {"last_completed_week": 3}})

    # Week 1: win, week 2: dnp, week 3: loss.
    await _insert_pick(db, user_id=owner.id, league_id=league.id, game_id=1, team_id=home_id, week=1, result="win")
    await _insert_pick(db, user_id=owner.id, league_id=league.id, game_id=2, team_id=home_id, week=2, result="dnp")
    await _insert_pick(db, user_id=owner.id, league_id=league.id, game_id=3, team_id=home_id, week=3, result="loss")

    await calculate_scores_and_strikes()

    updated = await db["league_memberships"].find_one({"_id": ObjectId(membership.id)})
    assert updated["points"] == 3          # only the win scores
    assert updated["lossStrikes"] == 1     # only the loss
    assert updated["missingPickStrikes"] == 0  # all 3 weeks have a pick (dnp counts)
    assert updated["strikes"] == 1


@pytest.mark.asyncio
async def test_date_drift_detection():
    from app.db.game_updater import _update_game_in_database
    from app.db.mongodb import get_database

    db = get_database()
    home_id, away_id = await _insert_teams(db)
    now = datetime.now(timezone.utc)
    week_median = now + timedelta(days=1)

    # Three sibling games in the same week clustered around `week_median`.
    for offset in (timedelta(hours=-2), timedelta(0), timedelta(hours=2)):
        await _insert_game(db, week=10, status="not_started", when=week_median + offset,
                            home_id=home_id, away_id=away_id)

    # Drifted target: API still says SCHEDULED, but the new date is >4 days off.
    drifted_game = await _insert_game(db, week=10, status="not_started", when=week_median,
                                       home_id=home_id, away_id=away_id)
    drifted_api_game = {"id": 999010, "status": "SCHEDULED",
                         "utcDate": (week_median + timedelta(days=30)).isoformat(),
                         "score": {"fullTime": {"home": None, "away": None}}}
    outcome = await _update_game_in_database(drifted_game, drifted_api_game)
    assert outcome["statusChangedToPostponed"] is True
    drifted_doc = await db["games"].find_one({"id": drifted_game["id"]})
    assert drifted_doc["status"] == "postponed"

    # Not drifted: new date is within 4 days of the sibling median -- not flagged.
    close_game = await _insert_game(db, week=10, status="not_started", when=week_median,
                                     home_id=home_id, away_id=away_id)
    close_api_game = {"id": 999011, "status": "SCHEDULED",
                       "utcDate": (week_median + timedelta(days=3)).isoformat(),
                       "score": {"fullTime": {"home": None, "away": None}}}
    close_outcome = await _update_game_in_database(close_game, close_api_game)
    assert close_outcome["statusChangedToPostponed"] is False
    close_doc = await db["games"].find_one({"id": close_game["id"]})
    assert close_doc["status"] == "not_started"

    # Already postponed + still drifted -> no duplicate detection/re-processing
    # (no second round of pick deletion/DNP-marking; statusChangedToPostponed
    # is False because the game was already postponed).
    already_postponed = await db["games"].find_one({"id": drifted_game["id"]})
    second_outcome = await _update_game_in_database(already_postponed, drifted_api_game)
    assert second_outcome["statusChangedToPostponed"] is False
    assert second_outcome["picksDeleted"] == 0
    assert second_outcome["picksMarkedDnp"] == 0
