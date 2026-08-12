"""Port of lib/scoring.ts (Rank 7 -- CR-105-FINDINGS.md Table 1, 7.1-7.3).
`calculate_pick_result` is imported by app/db/picks.py's `create_pick` to fix the
known tie-handling bug there -- see picks.py's docstring.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from app.db.mongodb import get_database, Collections

logger = logging.getLogger("scoring")


def _log(message: str) -> None:
    logger.info("[%s] %s", datetime.now(timezone.utc).isoformat(), message)


def calculate_pick_result(game: dict, picked_team_id: int) -> Optional[str]:
    """"win" | "draw" | "loss" | None. Port of lib/scoring.ts:12-32
    calculatePickResult -- the correctly tie-aware implementation (unlike the
    old inline logic in lib/db.ts's createPick, fixed in picks.py by routing
    through this same function instead of re-implementing a narrower check).
    """
    if game.get("status") != "completed" or game.get("homeScore") is None or game.get("awayScore") is None:
        return None

    is_home_team = picked_team_id == game["homeTeamId"]
    home_score = game["homeScore"]
    away_score = game["awayScore"]

    if home_score == away_score:
        return "draw"

    if is_home_team:
        return "win" if home_score > away_score else "loss"
    else:
        return "win" if away_score > home_score else "loss"


async def update_pick_results() -> int:
    """Port of lib/scoring.ts:35-85."""
    db = get_database()
    updated_count = 0

    _log("Starting pick result updates...")

    picks_with_null_results = await db[Collections.PICKS].find({"result": None}).to_list(length=None)
    _log(f"Found {len(picks_with_null_results)} picks with null results")

    for pick in picks_with_null_results:
        try:
            game = await db[Collections.GAMES].find_one({"id": pick["gameId"]})
            if not game:
                _log(f"Warning: Game {pick['gameId']} not found for pick {pick['_id']}")
                continue

            result = calculate_pick_result(game, pick["teamId"])
            if result is not None:
                await db[Collections.PICKS].update_one({"_id": pick["_id"]}, {"$set": {"result": result}})
                updated_count += 1
                _log(f"Updated pick {pick['_id']}: {result} (Game {game['id']}, Week {game['week']})")
        except Exception as error:  # noqa: BLE001 - mirrors the TS per-pick try/catch that logs and continues
            _log(f"Error processing pick {pick['_id']}: {error}")

    # SUR-008: DNP backfill. A pick marked "dnp" (its game was postponed after
    # the gameweek started -- see app/db/game_updater.py) is never revisited by
    # the `result: None` query above, since its result is already non-null. If
    # the game has since been replayed and completed, recompute the pick's
    # real win/draw/loss result the same way a fresh completed-game pick would be.
    dnp_picks = await db[Collections.PICKS].find({"result": "dnp"}).to_list(length=None)
    _log(f"Found {len(dnp_picks)} DNP picks to check for backfill")

    for pick in dnp_picks:
        try:
            game = await db[Collections.GAMES].find_one({"id": pick["gameId"]})
            if not game or game.get("status") != "completed":
                continue  # still postponed (or otherwise unresolved) -- leave the DNP as-is

            result = calculate_pick_result(game, pick["teamId"])
            if result is not None:
                await db[Collections.PICKS].update_one({"_id": pick["_id"]}, {"$set": {"result": result}})
                updated_count += 1
                _log(f"Backfilled DNP pick {pick['_id']}: {result} (Game {game['id']}, Week {game['week']})")
        except Exception as error:  # noqa: BLE001 - same per-pick log-and-continue pattern as above
            _log(f"Error backfilling DNP pick {pick['_id']}: {error}")

    _log(f"Completed pick result updates: {updated_count} picks updated")
    return updated_count


async def calculate_scores_and_strikes() -> int:
    """Port of lib/scoring.ts:88-183."""
    db = get_database()
    processed_count = 0

    _log("Starting score and strikes calculation...")

    memberships = await db[Collections.LEAGUE_MEMBERSHIPS].find(
        {"isActive": True, "status": "active"}
    ).to_list(length=None)

    leagues = await db[Collections.LEAGUES].find(
        {"isActive": True}, {"last_completed_week": 1}
    ).to_list(length=None)
    league_week_map = {str(league["_id"]): league.get("last_completed_week") or 0 for league in leagues}

    _log(f"Found {len(memberships)} active league memberships to process")

    for membership in memberships:
        try:
            last_completed_week = league_week_map.get(str(membership["leagueId"]), 0)

            picks = await db[Collections.PICKS].find({
                "userId": membership["userId"],
                "leagueId": membership["leagueId"],
                "result": {"$ne": None},
                "week": {"$lte": last_completed_week},
            }).to_list(length=None)

            weeks_with_picks = len({p["week"] for p in picks})
            missing_pick_strikes = max(0, last_completed_week - weeks_with_picks)

            total_points = 0
            loss_strikes = 0
            for pick in picks:
                if pick["result"] == "win":
                    total_points += 3
                elif pick["result"] == "draw":
                    total_points += 1
                elif pick["result"] == "loss":
                    loss_strikes += 1
                elif pick["result"] == "dnp":
                    # SUR-008: a DNP pick (postponed game) is already counted
                    # toward weeks_with_picks above -- no missing-pick strike --
                    # but deliberately earns no points and no loss strike either.
                    # Explicit no-op so "0 points, 0 strikes" reads as a stated
                    # decision rather than an accident of the if/elif chain.
                    pass

            total_strikes = loss_strikes + missing_pick_strikes

            update_result = await db[Collections.LEAGUE_MEMBERSHIPS].update_one(
                {"_id": membership["_id"]},
                {"$set": {
                    "points": total_points,
                    "strikes": total_strikes,
                    "lossStrikes": loss_strikes,
                    "missingPickStrikes": missing_pick_strikes,
                }},
            )

            if update_result.modified_count > 0:
                processed_count += 1
                _log(
                    f"Updated {membership.get('teamName')}: {total_points} points, {total_strikes} strikes "
                    f"({loss_strikes} losses + {missing_pick_strikes} missed weeks, from {len(picks)} picks)"
                )
        except Exception as error:  # noqa: BLE001
            _log(f"Error processing membership {membership['_id']}: {error}")

    _log(f"Strike calculation complete. Updated {processed_count} players.")
    return processed_count


@dataclass
class ScoringResult:
    picksUpdated: int
    membershipsUpdated: int
    executionTime: int
    completedAt: str


async def run_scoring_calculation() -> ScoringResult:
    """Port of lib/scoring.ts:194-227 -- the main entrypoint, also called from
    game_updater.py after games move to completed."""
    start_time = datetime.now(timezone.utc)
    _log("=== Scoring Calculation Started ===")

    try:
        picks_updated = await update_pick_results()
        memberships_updated = await calculate_scores_and_strikes()

        end_time = datetime.now(timezone.utc)
        execution_time = round((end_time - start_time).total_seconds())

        _log("=== Scoring Calculation Completed Successfully ===")
        _log("Summary:")
        _log(f"  • {picks_updated} pick results updated")
        _log(f"  • {memberships_updated} league memberships updated")
        _log(f"  • Total execution time: {execution_time} seconds")
        _log(f"  • Completed at: {end_time.isoformat()}")

        return ScoringResult(
            picksUpdated=picks_updated,
            membershipsUpdated=memberships_updated,
            executionTime=execution_time,
            completedAt=end_time.isoformat(),
        )
    except Exception as error:
        _log("=== Scoring Calculation Failed ===")
        _log(f"Error: {error}")
        raise
