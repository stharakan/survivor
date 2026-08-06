"""Port of lib/game-updater.ts (Rank 7 -- CR-105-FINDINGS.md Table 1, 7.4). Only
the exported function `update_game_scores` (TS: `updateGameScores`) is meant to be
called from outside this module; its private helpers move with it, matching the
findings' note that none of them are used anywhere else in the TS codebase.

Known pre-existing bug INTENTIONALLY NOT FIXED here (out of this phase's scope,
per the epic's "Latent Bugs Surfaced During Review" list): `_find_matching_database_game`
raises hard on any API game with a missing/unmatched external ID, same as the TS
original -- a malformed external-API response can still crash the whole scheduled
update job. Preserved as-is; not one of the two fixes this ticket authorized
(Pick draw-handling in picks.py, League id/createdBy typing in models/league.py).
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from app.db.mongodb import get_database, Collections
from app.db.scoring import run_scoring_calculation

logger = logging.getLogger("game_updater")

FOOTBALLDATA_API_KEY = os.environ.get("FOOTBALLDATA_API_KEY")
API_BASE_URL = os.environ.get("FOOTBALLDATA_API_URL", "https://api.football-data.org/v4")
DEFAULT_COMPETITION_CODE = os.environ.get("FOOTBALLDATA_COMPETITION_CODE", "PL")
REQUEST_DELAY_MS = int(os.environ.get("FOOTBALLDATA_REQUEST_DELAY", "6000"))


def _log(message: str) -> None:
    logger.info("[%s] %s", datetime.now(timezone.utc).isoformat(), message)


def _map_api_season_to_database(api_season: str, competition_type: str = "EPL") -> str:
    """Port of lib/game-updater.ts:24-31. NOTE: unused in the TS original too
    (defined, never called anywhere in that file) -- ported for fidelity, not
    because anything here calls it either."""
    if competition_type == "EPL":
        year = int(api_season)
        return f"{year}/{year + 1}"
    return api_season


def _get_current_season() -> str:
    """Port of lib/game-updater.ts:34-54."""
    if os.environ.get("CURRENT_SEASON"):
        return os.environ["CURRENT_SEASON"]

    now = datetime.now(timezone.utc)
    year = now.year
    month = now.month

    if month >= 8:
        return f"{year}/{year + 1}"
    elif month <= 5:
        return f"{year - 1}/{year}"
    else:
        return f"{year}/{year + 1}"


async def _find_matching_database_game(api_game: dict, api_season: str) -> dict:
    """Port of lib/game-updater.ts:58-77. Raises on any missing/unmatched
    external ID -- see module docstring (intentionally preserved, not fixed)."""
    db = get_database()

    if not api_game.get("id"):
        raise RuntimeError(
            "CRITICAL: API game missing external ID - cannot process game: "
            f"{api_game['homeTeam']['shortName']} vs {api_game['awayTeam']['shortName']} "
            f"on {api_game['utcDate']}"
        )

    db_game = await db[Collections.GAMES].find_one({"externalId": str(api_game["id"])})
    if db_game:
        _log(f"Game matched by external ID: {api_game['id']}")
        return db_game

    raise RuntimeError(
        f"CRITICAL: No database game found with external ID {api_game['id']} for API game: "
        f"{api_game['homeTeam']['shortName']} vs {api_game['awayTeam']['shortName']} on "
        f"{api_game['utcDate']}. Run backfill script to add missing external IDs."
    )


def _map_api_status_to_internal(api_status: str) -> str:
    """Port of lib/game-updater.ts:80-99."""
    if api_status in ("SCHEDULED", "TIMED"):
        return "not_started"
    if api_status in ("LIVE", "IN_PLAY", "PAUSED", "HALFTIME"):
        return "in_progress"
    if api_status in ("FINISHED", "AWARDED", "POSTPONED", "CANCELLED", "SUSPENDED"):
        return "completed"
    return "not_started"


async def _fetch_bulk_games(date_from: str, date_to: str, competition_code: Optional[str] = None) -> list[dict]:
    """Port of lib/game-updater.ts:102-133."""
    if not FOOTBALLDATA_API_KEY:
        raise RuntimeError("FOOTBALLDATA_API_KEY environment variable is required")

    competition = competition_code or DEFAULT_COMPETITION_CODE
    _log(f"Fetching bulk games from Football Data API: {date_from} to {date_to} for competition {competition}")

    url = f"{API_BASE_URL}/competitions/{competition}/matches?dateFrom={date_from}&dateTo={date_to}"

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers={"X-Auth-Token": FOOTBALLDATA_API_KEY})

    if response.status_code != 200:
        raise RuntimeError(f"Football Data API request failed: {response.status_code} {response.reason_phrase}")

    data = response.json()
    matches = data.get("matches", [])
    _log(f"Successfully fetched {len(matches)} games from Football Data API")
    return matches


async def _fetch_individual_game(external_id: str) -> Optional[dict]:
    """Port of lib/game-updater.ts:136-170."""
    if not FOOTBALLDATA_API_KEY:
        raise RuntimeError("FOOTBALLDATA_API_KEY environment variable is required")

    _log(f"Fetching individual game from Football Data API: {external_id}")
    url = f"{API_BASE_URL}/matches/{external_id}"

    await asyncio.sleep(REQUEST_DELAY_MS / 1000)  # rate limiting delay

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers={"X-Auth-Token": FOOTBALLDATA_API_KEY})

    if response.status_code == 404:
        _log(f"Game not found in Football Data API: {external_id}")
        return None
    if response.status_code != 200:
        raise RuntimeError(f"Football Data API request failed: {response.status_code} {response.reason_phrase}")

    game = response.json()
    _log(f"Successfully fetched individual game: {external_id}")
    return game


async def _find_overdue_games(exclude_seasons: Optional[list[dict]] = None) -> list[dict]:
    """Port of lib/game-updater.ts:173-209."""
    db = get_database()
    now = datetime.now(timezone.utc)

    _log("Scanning database for overdue games...")

    query: dict[str, Any] = {
        "$and": [
            {"$or": [{"startTime": {"$lt": now}}, {"date": {"$lt": now}}]},
            {"status": "not_started"},
        ]
    }

    if exclude_seasons:
        query["$and"].append({
            "$nor": [
                {"$and": [{"sportsLeague": ex["sportsLeague"]}, {"season": ex["season"]}]}
                for ex in exclude_seasons
            ]
        })

    overdue_games = await db[Collections.GAMES].find(query).to_list(length=None)
    _log(f"Found {len(overdue_games)} overdue games" + (" (with exclusions)" if exclude_seasons else ""))
    return overdue_games


def _find_game_in_bulk_response(db_game: dict, api_games: list[dict]) -> Optional[dict]:
    """Port of lib/game-updater.ts:212-242.

    NOTE: the TS original formats dates via date-fns `format()`, which uses the
    server's LOCAL timezone by default (not UTC). This port always compares in
    UTC (matching mongodb.py's `tz_aware=True` client config). For a server
    actually running in UTC this is identical; for a server running in a
    non-UTC local timezone it is NOT guaranteed identical to the TS behavior at
    day boundaries. Flagged for Phase 2 to confirm against the actual deploy
    target's timezone rather than assumed equivalent.
    """
    if db_game.get("externalId"):
        for api_game in api_games:
            if str(api_game["id"]) == str(db_game["externalId"]):
                return api_game

    game_date = db_game.get("startTime") or db_game.get("date")
    if isinstance(game_date, str):
        game_date = datetime.fromisoformat(game_date.replace("Z", "+00:00"))
    game_date_str = game_date.strftime("%Y-%m-%d")

    for api_game in api_games:
        api_date = datetime.fromisoformat(api_game["utcDate"].replace("Z", "+00:00"))
        api_date_str = api_date.strftime("%Y-%m-%d")

        date_match = abs(
            (datetime.strptime(game_date_str, "%Y-%m-%d") - datetime.strptime(api_date_str, "%Y-%m-%d")).total_seconds()
        ) <= 24 * 60 * 60

        if date_match:
            home_team = db_game.get("homeTeam") or {}
            away_team = db_game.get("awayTeam") or {}
            home_match = (
                api_game["homeTeam"]["name"] == home_team.get("name")
                or api_game["homeTeam"]["shortName"] == home_team.get("name")
            )
            away_match = (
                api_game["awayTeam"]["name"] == away_team.get("name")
                or api_game["awayTeam"]["shortName"] == away_team.get("name")
            )
            if home_match and away_match:
                return api_game

    return None


async def _update_game_in_database(db_game: dict, api_game: dict) -> dict:
    """Returns `{statusChangedToCompleted, picksReset}`. Port of
    lib/game-updater.ts:246-294."""
    db = get_database()

    new_status = _map_api_status_to_internal(api_game["status"])
    new_start_time = api_game["utcDate"]
    new_home_score = ((api_game.get("score") or {}).get("fullTime") or {}).get("home")
    new_away_score = ((api_game.get("score") or {}).get("fullTime") or {}).get("away")

    status_changed_to_completed = db_game["status"] != "completed" and new_status == "completed"

    scores_changed_on_completed_game = (
        db_game["status"] == "completed"
        and (db_game.get("homeScore") != new_home_score or db_game.get("awayScore") != new_away_score)
    )

    picks_reset = 0
    if scores_changed_on_completed_game:
        reset_result = await db[Collections.PICKS].update_many(
            {"gameId": db_game["id"], "result": {"$ne": None}},
            {"$set": {"result": None}},
        )
        picks_reset = reset_result.modified_count
        _log(
            f"SCORE CORRECTION: Game {db_game['id']} "
            f"({(db_game.get('homeTeam') or {}).get('name')} vs {(db_game.get('awayTeam') or {}).get('name')}) "
            f"scores changed from {db_game.get('homeScore')}-{db_game.get('awayScore')} to "
            f"{new_home_score}-{new_away_score}. Reset {picks_reset} pick(s) for re-scoring."
        )

    await db[Collections.GAMES].update_one(
        {"_id": db_game["_id"]},
        {"$set": {
            "status": new_status,
            "startTime": new_start_time,
            "date": new_start_time,  # keep date field synchronized with startTime
            "homeScore": new_home_score,
            "awayScore": new_away_score,
            "externalId": str(api_game["id"]),  # store for future individual lookups
            "lastUpdated": datetime.now(timezone.utc),
        }},
    )

    _log(f"Updated game {db_game['id']}: {db_game['status']} → {new_status}")

    return {"statusChangedToCompleted": status_changed_to_completed, "picksReset": picks_reset}


async def _check_and_trigger_scoring(games_moved_to_completed: list[dict]) -> int:
    """Port of lib/game-updater.ts:297-321."""
    if not games_moved_to_completed:
        return 0

    db = get_database()
    game_ids = [g["id"] for g in games_moved_to_completed]
    picks_count = await db[Collections.PICKS].count_documents({"gameId": {"$in": game_ids}})

    if picks_count > 0:
        _log(
            f"Found {picks_count} user picks for {len(games_moved_to_completed)} newly completed games. "
            f"Triggering score recalculation..."
        )
        await run_scoring_calculation()
        _log("Score recalculation completed")
        return picks_count

    _log("No user picks found for newly completed games. Skipping score recalculation.")
    return 0


async def _calculate_current_game_week(sports_league: str, season: str) -> Optional[int]:
    """Port of lib/game-updater.ts:324-346."""
    db = get_database()
    result = await db[Collections.GAMES].aggregate([
        {"$match": {"sportsLeague": sports_league, "season": season, "status": {"$in": ["in_progress", "completed"]}}},
        {"$group": {"_id": None, "maxWeek": {"$max": "$week"}}},
    ]).to_list(length=1)
    return result[0]["maxWeek"] if result else None


async def _calculate_current_pick_week(sports_league: str, season: str) -> Optional[int]:
    """Port of lib/game-updater.ts:349-371."""
    db = get_database()
    result = await db[Collections.GAMES].aggregate([
        {"$match": {"sportsLeague": sports_league, "season": season, "status": "not_started"}},
        {"$group": {"_id": None, "minWeek": {"$min": "$week"}}},
    ]).to_list(length=1)
    return result[0]["minWeek"] if result else None


async def _calculate_last_completed_week(sports_league: str, season: str) -> Optional[int]:
    """Port of lib/game-updater.ts:374-405."""
    db = get_database()
    result = await db[Collections.GAMES].aggregate([
        {"$match": {"sportsLeague": sports_league, "season": season}},
        {"$group": {
            "_id": "$week",
            "completedCount": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "totalCount": {"$sum": 1},
        }},
        {"$match": {"$expr": {"$eq": ["$completedCount", "$totalCount"]}}},
        {"$group": {"_id": None, "maxCompletedWeek": {"$max": "$_id"}}},
    ]).to_list(length=1)
    return result[0]["maxCompletedWeek"] if result else None


async def _update_league_week_tracking() -> int:
    """Port of lib/game-updater.ts:408-450."""
    db = get_database()
    _log("Updating league week tracking...")

    leagues = await db[Collections.LEAGUES].find({"isActive": True}).to_list(length=None)
    leagues_updated = 0

    for league in leagues:
        try:
            current_game_week = await _calculate_current_game_week(league["sportsLeague"], league["season"])
            current_pick_week = await _calculate_current_pick_week(league["sportsLeague"], league["season"])
            last_completed_week = await _calculate_last_completed_week(league["sportsLeague"], league["season"])

            await db[Collections.LEAGUES].update_one(
                {"_id": league["_id"]},
                {"$set": {
                    "current_game_week": current_game_week,
                    "current_pick_week": current_pick_week,
                    "last_completed_week": last_completed_week,
                    "lastWeekUpdate": datetime.now(timezone.utc),
                }},
            )
            leagues_updated += 1
            _log(
                f"Updated league {league['name']}: game_week={current_game_week}, "
                f"pick_week={current_pick_week}, last_completed_week={last_completed_week}"
            )
        except Exception as error:  # noqa: BLE001
            _log(f"Error updating week tracking for league {league['name']}: {error}")

    _log(f"League week tracking completed: {leagues_updated} leagues updated")
    return leagues_updated


async def update_game_scores() -> dict:
    """Port of lib/game-updater.ts:453-577 -- the hybrid bulk + individual-lookup
    game score updater. Invoked on a cadence by the scheduled GCP job (Phase 2/
    CR-004 territory, not wired up here)."""
    start_time = datetime.now(timezone.utc)
    _log("=== Game Score Update Started (Hybrid Approach) ===")

    try:
        days_back = int(os.environ.get("BULK_QUERY_DAYS_BACK", "7"))
        days_forward = int(os.environ.get("BULK_QUERY_DAYS_FORWARD", "7"))
        date_from = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")
        date_to = (datetime.now(timezone.utc) + timedelta(days=days_forward)).strftime("%Y-%m-%d")

        competition_code = os.environ.get("FOOTBALLDATA_COMPETITION_CODE")
        bulk_games = await _fetch_bulk_games(date_from, date_to, competition_code)

        exclude_seasons_raw = os.environ.get("EXCLUDE_SEASONS")
        exclude_seasons = json.loads(exclude_seasons_raw) if exclude_seasons_raw else None
        overdue_games = await _find_overdue_games(exclude_seasons)

        individual_api_calls = 0
        games_updated = 0
        total_picks_reset = 0
        games_moved_to_completed: list[dict] = []

        # Process bulk games first with enhanced matching.
        for api_game in bulk_games:
            current_season_year = _get_current_season().split("/")[0]
            api_season = str((api_game.get("season") or {}).get("id") or current_season_year)

            # _find_matching_database_game raises if no match is found.
            db_game = await _find_matching_database_game(api_game, api_season)
            update_outcome = await _update_game_in_database(db_game, api_game)
            games_updated += 1
            total_picks_reset += update_outcome["picksReset"]

            if update_outcome["statusChangedToCompleted"]:
                games_moved_to_completed.append(db_game)

        # Process overdue games not found in the bulk response.
        for overdue_game in overdue_games:
            found_in_bulk = _find_game_in_bulk_response(overdue_game, bulk_games)

            if not found_in_bulk and overdue_game.get("externalId"):
                individual_game = await _fetch_individual_game(overdue_game["externalId"])
                individual_api_calls += 1

                if individual_game:
                    update_outcome = await _update_game_in_database(overdue_game, individual_game)
                    games_updated += 1
                    total_picks_reset += update_outcome["picksReset"]

                    if update_outcome["statusChangedToCompleted"]:
                        games_moved_to_completed.append(overdue_game)
            elif not found_in_bulk:
                _log(f"Overdue game {overdue_game['id']} has no external ID for individual lookup")

        # Trigger scoring if games completed with user picks OR picks were reset for re-scoring.
        picks_updated = await _check_and_trigger_scoring(games_moved_to_completed)

        if total_picks_reset > 0 and not games_moved_to_completed:
            _log(f"{total_picks_reset} pick(s) were reset due to score corrections. Triggering re-scoring...")
            await run_scoring_calculation()

        leagues_updated = await _update_league_week_tracking()

        end_time = datetime.now(timezone.utc)
        execution_time = round((end_time - start_time).total_seconds())

        _log("=== Game Score Update Completed Successfully ===")
        _log("Summary:")
        _log(f"  • {len(bulk_games)} games processed from bulk API")
        _log(f"  • {len(overdue_games)} overdue games found in database")
        _log(f"  • {individual_api_calls} individual API calls made")
        _log(f"  • {games_updated} games updated in database")
        _log(f"  • {len(games_moved_to_completed)} games moved to completed status")
        _log(f"  • {picks_updated} user picks affected by completed games")
        _log(f"  • {total_picks_reset} pick(s) reset due to score corrections")
        _log(f"  • {leagues_updated} leagues updated with week tracking")
        _log(f"  • Total execution time: {execution_time} seconds")
        _log(f"  • Completed at: {end_time.isoformat()}")

        return {
            "bulkGamesProcessed": len(bulk_games),
            "overdueGamesFound": len(overdue_games),
            "individualApiCalls": individual_api_calls,
            "gamesUpdated": games_updated,
            "gamesCompletedWithPicks": picks_updated,
            "leaguesUpdated": leagues_updated,
            "executionTime": execution_time,
            "completedAt": end_time.isoformat(),
        }

    except Exception as error:
        end_time = datetime.now(timezone.utc)
        execution_time = round((end_time - start_time).total_seconds())

        _log("=== Game Score Update Failed ===")
        _log(f"Error: {error}")
        _log(f"Total execution time: {execution_time} seconds")
        _log(f"Failed at: {end_time.isoformat()}")

        raise
