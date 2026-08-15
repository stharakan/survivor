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
from app.utils.game_utils import has_gameweek_started

# SUR-008: a game whose new date drifts more than this many days from the
# median date of the other games in the same week+sportsLeague+season is
# treated as silently postponed, even if the API still reports SCHEDULED/TIMED.
# 4 days, not a larger buffer: a week's games normally span at most ~4 days
# peak-to-peak, so anything drifting further than that is already at the
# point of overlapping into a neighboring week's normal date range.
_DATE_DRIFT_THRESHOLD = timedelta(days=4)

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
    """Port of lib/game-updater.ts:80-99.

    SUR-008 fix: POSTPONED/CANCELLED/SUSPENDED used to fall into the same
    branch as FINISHED/AWARDED, producing a "completed" game with null scores
    that could never resolve (see the ticket for the full zombie-state
    analysis). They now map to a distinct "postponed" status instead.
    """
    if api_status in ("SCHEDULED", "TIMED"):
        return "not_started"
    if api_status in ("LIVE", "IN_PLAY", "PAUSED", "HALFTIME"):
        return "in_progress"
    if api_status in ("FINISHED", "AWARDED"):
        return "completed"
    if api_status in ("POSTPONED", "CANCELLED", "SUSPENDED"):
        return "postponed"
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


def _parse_game_datetime(value) -> datetime:
    """Accepts either a Mongo-driver `datetime` or an ISO-8601 string (the
    Football Data API's `utcDate` shape). Assumes UTC for a naive value."""
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    text = value.replace("Z", "+00:00") if value.endswith("Z") else value
    parsed = datetime.fromisoformat(text)
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def _median_datetime(values: list[datetime]) -> datetime:
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[mid]
    return ordered[mid - 1] + (ordered[mid] - ordered[mid - 1]) / 2


async def _is_date_drifted(db, db_game: dict, new_start_time: str) -> bool:
    """SUR-008 step 3b: detect a game silently rescheduled far outside its
    week's normal date range without the API ever reporting POSTPONED --
    e.g. a fixture list quietly moved 3+ weeks later while still coming back
    as SCHEDULED/TIMED. Compares against the median date of the other games
    in the same week+sportsLeague+season; >14 days off is treated as a
    postponement.

    Excludes already-`"postponed"` siblings from the median: once a game is
    marked postponed its `startTime` gets rewritten to its (possibly far-future
    or still-unknown) new date, which would otherwise pollute the "normal date
    range" baseline used to judge every other game in the same week.
    """
    sibling_games = await db[Collections.GAMES].find({
        "week": db_game["week"],
        "sportsLeague": db_game.get("sportsLeague"),
        "season": db_game.get("season"),
        "status": {"$ne": "postponed"},
        "_id": {"$ne": db_game["_id"]},
    }).to_list(length=None)

    sibling_dates = [
        _parse_game_datetime(raw)
        for raw in (g.get("startTime") or g.get("date") for g in sibling_games)
        if raw is not None
    ]
    if not sibling_dates:
        return False

    median_date = _median_datetime(sibling_dates)
    new_date = _parse_game_datetime(new_start_time)
    return abs(new_date - median_date) > _DATE_DRIFT_THRESHOLD


async def _handle_postponement(db, db_game: dict) -> dict:
    """SUR-008 step 3c: a game just transitioned TO "postponed". Marks it as
    such and either deletes or DNP-marks any existing picks for it, per the
    published rules (app/rules/page.tsx): unpickable before the gameweek
    starts (so existing picks are voided and users must re-pick), DNP after
    (so existing picks are preserved but score/strike-neutral).

    Returns `{isPostponed, originalWeek, picksDeleted, picksMarkedDnp}` for
    the caller to fold into the game document's `$set`.

    SUR-010: sportsLeague is on the parent leagues doc; query via
    league_seasons + parent join to find the active season for this game."""
    seasons = await db[Collections.LEAGUE_SEASONS].aggregate([
        {"$match": {"season": db_game.get("season"), "isActive": True}},
        {"$lookup": {
            "from": Collections.LEAGUES,
            "localField": "leagueId",
            "foreignField": "_id",
            "as": "parent",
        }},
        {"$unwind": "$parent"},
        {"$match": {"parent.sportsLeague": db_game.get("sportsLeague")}},
        {"$limit": 1},
    ]).to_list(1)
    league = seasons[0] if seasons else None
    gameweek_started = has_gameweek_started(league or {}, db_game["week"])

    picks_deleted = 0
    picks_marked_dnp = 0
    if gameweek_started:
        dnp_result = await db[Collections.PICKS].update_many(
            {"gameId": db_game["id"]},
            {"$set": {"result": "dnp"}},
        )
        picks_marked_dnp = dnp_result.modified_count
        _log(f"Game {db_game['id']} postponed after gameweek start: marked {picks_marked_dnp} pick(s) as DNP.")
    else:
        delete_result = await db[Collections.PICKS].delete_many({"gameId": db_game["id"]})
        picks_deleted = delete_result.deleted_count
        _log(f"Game {db_game['id']} postponed before gameweek start: deleted {picks_deleted} pick(s).")

    return {
        # Preserve an already-set originalWeek across repeated postponements
        # (e.g. postponed -> re-scheduled -> postponed again).
        "originalWeek": db_game.get("originalWeek") or db_game["week"],
        "picksDeleted": picks_deleted,
        "picksMarkedDnp": picks_marked_dnp,
    }


async def _update_game_in_database(db_game: dict, api_game: dict) -> dict:
    """Returns `{statusChangedToCompleted, statusChangedToPostponed, picksReset,
    picksDeleted, picksMarkedDnp}`. Port of lib/game-updater.ts:246-294, extended
    per SUR-008."""
    db = get_database()

    new_status = _map_api_status_to_internal(api_game["status"])
    new_start_time = api_game["utcDate"]
    new_home_score = ((api_game.get("score") or {}).get("fullTime") or {}).get("home")
    new_away_score = ((api_game.get("score") or {}).get("fullTime") or {}).get("away")

    # SUR-008 step 3b: the API can silently move a fixture's date without ever
    # reporting POSTPONED. Only relevant when the API-reported status would
    # otherwise leave the game "not_started" -- an already-postponed game
    # re-detected here just stays postponed (no duplicate pick handling,
    # since statusChangedToPostponed below only fires on an actual transition).
    if new_status == "not_started" and await _is_date_drifted(db, db_game, new_start_time):
        new_status = "postponed"

    status_changed_to_completed = db_game["status"] != "completed" and new_status == "completed"
    status_changed_to_postponed = db_game["status"] != "postponed" and new_status == "postponed"

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

    set_fields: dict[str, Any] = {
        "status": new_status,
        "startTime": new_start_time,
        "date": new_start_time,  # keep date field synchronized with startTime
        "homeScore": new_home_score,
        "awayScore": new_away_score,
        "externalId": str(api_game["id"]),  # store for future individual lookups
        "lastUpdated": datetime.now(timezone.utc),
    }

    picks_deleted = 0
    picks_marked_dnp = 0
    if status_changed_to_postponed:
        postponement_outcome = await _handle_postponement(db, db_game)
        set_fields["isPostponed"] = True
        set_fields["originalWeek"] = postponement_outcome["originalWeek"]
        picks_deleted = postponement_outcome["picksDeleted"]
        picks_marked_dnp = postponement_outcome["picksMarkedDnp"]
    # SUR-008 step 3d (un-postponement): when a previously-postponed game goes
    # back to "not_started", `isPostponed`/`originalWeek` are deliberately left
    # out of `set_fields` above -- $set only touches the keys present, so the
    # existing values on the document are preserved as-is (it's still a
    # rescheduled match, and `week` never moved).

    await db[Collections.GAMES].update_one({"_id": db_game["_id"]}, {"$set": set_fields})

    _log(f"Updated game {db_game['id']}: {db_game['status']} → {new_status}")

    return {
        "statusChangedToCompleted": status_changed_to_completed,
        "statusChangedToPostponed": status_changed_to_postponed,
        "picksReset": picks_reset,
        "picksDeleted": picks_deleted,
        "picksMarkedDnp": picks_marked_dnp,
    }


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
    """Port of lib/game-updater.ts:374-405.

    SUR-008: excludes "postponed" games from the match entirely, so a
    postponed game no longer prevents its week from ever being counted as
    fully completed (previously it read as "completed" with null scores,
    which is what made it a zombie -- see the ticket)."""
    db = get_database()
    result = await db[Collections.GAMES].aggregate([
        {"$match": {"sportsLeague": sports_league, "season": season, "status": {"$ne": "postponed"}}},
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
    """Port of lib/game-updater.ts:408-450. SUR-010: queries league_seasons with
    parent join instead of leagues; updates league_seasons week fields."""
    db = get_database()
    _log("Updating league week tracking...")

    seasons = await db[Collections.LEAGUE_SEASONS].aggregate([
        {"$match": {"isActive": True}},
        {"$lookup": {
            "from": Collections.LEAGUES,
            "localField": "leagueId",
            "foreignField": "_id",
            "as": "parent",
        }},
        {"$unwind": "$parent"},
    ]).to_list(length=None)
    seasons_updated = 0

    for season in seasons:
        try:
            sports_league = season["parent"]["sportsLeague"]
            season_str = season["season"]
            current_game_week = await _calculate_current_game_week(sports_league, season_str)
            current_pick_week = await _calculate_current_pick_week(sports_league, season_str)
            last_completed_week = await _calculate_last_completed_week(sports_league, season_str)

            await db[Collections.LEAGUE_SEASONS].update_one(
                {"_id": season["_id"]},
                {"$set": {
                    "current_game_week": current_game_week,
                    "current_pick_week": current_pick_week,
                    "last_completed_week": last_completed_week,
                    "lastWeekUpdate": datetime.now(timezone.utc),
                }},
            )
            seasons_updated += 1
            _log(
                f"Updated season {season['parent']['name']} {season['season']}: "
                f"game_week={current_game_week}, pick_week={current_pick_week}, "
                f"last_completed_week={last_completed_week}"
            )
        except Exception as error:  # noqa: BLE001
            _log(f"Error updating week tracking for season {season.get('season')}: {error}")

    _log(f"League week tracking completed: {seasons_updated} seasons updated")
    return seasons_updated


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
        games_moved_to_postponed = 0
        total_picks_deleted = 0
        total_picks_marked_dnp = 0

        # Process bulk games first with enhanced matching.
        for api_game in bulk_games:
            current_season_year = _get_current_season().split("/")[0]
            api_season = str((api_game.get("season") or {}).get("id") or current_season_year)

            # _find_matching_database_game raises if no match is found.
            db_game = await _find_matching_database_game(api_game, api_season)
            update_outcome = await _update_game_in_database(db_game, api_game)
            games_updated += 1
            total_picks_reset += update_outcome["picksReset"]
            total_picks_deleted += update_outcome["picksDeleted"]
            total_picks_marked_dnp += update_outcome["picksMarkedDnp"]

            if update_outcome["statusChangedToCompleted"]:
                games_moved_to_completed.append(db_game)
            if update_outcome["statusChangedToPostponed"]:
                games_moved_to_postponed += 1

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
                    total_picks_deleted += update_outcome["picksDeleted"]
                    total_picks_marked_dnp += update_outcome["picksMarkedDnp"]

                    if update_outcome["statusChangedToCompleted"]:
                        games_moved_to_completed.append(overdue_game)
                    if update_outcome["statusChangedToPostponed"]:
                        games_moved_to_postponed += 1
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
        _log(f"  • {games_moved_to_postponed} games moved to postponed status")
        _log(f"  • {total_picks_deleted} pick(s) deleted (postponed before gameweek start)")
        _log(f"  • {total_picks_marked_dnp} pick(s) marked DNP (postponed after gameweek start)")
        _log(f"  • {leagues_updated} league seasons updated with week tracking")
        _log(f"  • Total execution time: {execution_time} seconds")
        _log(f"  • Completed at: {end_time.isoformat()}")

        return {
            "bulkGamesProcessed": len(bulk_games),
            "overdueGamesFound": len(overdue_games),
            "individualApiCalls": individual_api_calls,
            "gamesUpdated": games_updated,
            "gamesCompletedWithPicks": picks_updated,
            "gamesMovedToPostponed": games_moved_to_postponed,
            "picksDeletedForPostponement": total_picks_deleted,
            "picksMarkedDnp": total_picks_marked_dnp,
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
