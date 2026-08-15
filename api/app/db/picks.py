"""Port of lib/db.ts Pick operations (Rank 5 -- CR-105-FINDINGS.md Table 1,
5.1-5.3).

SUR-010: renamed leagueId→leagueSeasonId in all DB queries/inserts/filters.
"""
from datetime import datetime, timezone

from bson import ObjectId

from app.db.mongodb import get_database, Collections
from app.db.scoring import calculate_pick_result
from app.db._shape import game_from_doc, team_from_doc, to_iso
from app.models.pick import Pick


async def create_pick(user_id: str, league_season_id: str, game_id: int, team_id: int, week: int) -> Pick:
    """Port of lib/db.ts:762-870 createPick.

    BUG FIX (CR-105-FINDINGS.md Table 4, Pick row, sub-bullet b -- a genuine
    scoring bug, not just the type-level "draw" omission): the original TS inline
    result computation (lib/db.ts:801-809) was win/loss-only --
    `result = homeScore > awayScore ? "win" : "loss"` -- with no draw branch. If a
    user picked into an ALREADY-COMPLETED, drawn game, they were permanently
    mis-scored "loss": `updatePickResults` (lib/scoring.ts:44) only ever revisits
    picks with `result: null`, so a pick born with a wrong non-null result is never
    corrected by the periodic scoring job. This port routes pick-creation through
    the same `calculate_pick_result` helper the scoring job itself uses
    (app/db/scoring.py), so draws are handled identically at creation time and at
    scoring time -- one source of truth for the win/draw/loss rule, not two
    independently-maintained comparisons.

    NOTE for Phase 2 (routes): this function does not authorize the caller -- the
    future POST /picks route must verify the JWT-derived user matches `user_id`
    and must NOT trust a client-supplied user id, per the auth gap carried forward
    in CR-105-FINDINGS.md 5.4 (today's app/api/picks/route.ts has no auth check at
    all).

    CR-106 AC7: server-side team-reuse check. The survivor rule is each team may
    be picked at most twice a season (already enforced on *read* by
    `/picks/remaining`'s `max(0, 2 - pickCount)`), but nothing ever enforced it on
    *write* -- `isTeamUsed` (app/make-picks/page.tsx) is a UI-only guard, trivially
    bypassed with a direct POST. This carries forward from the original TS
    `createPick` (lib/db.ts:762-870), which had the same gap; fixed here rather
    than ported as-is, per the ticket.
    """
    db = get_database()

    # Exclude the pick being replaced for `week` itself -- this is an upsert
    # keyed on (user, league_season, week) below, so switching *away from* this team
    # for `week`, or re-submitting the same team for `week`, must not count as
    # an extra use.
    existing_uses = await db[Collections.PICKS].count_documents({
        "userId": ObjectId(user_id),
        "leagueSeasonId": ObjectId(league_season_id),
        "teamId": team_id,
        "week": {"$ne": week},
    })
    if existing_uses >= 2:
        raise ValueError("This team has already been picked twice this season")

    game_docs = await db[Collections.GAMES].aggregate([
        {"$match": {"id": game_id}},
        {"$lookup": {"from": Collections.TEAMS, "localField": "homeTeamId", "foreignField": "id", "as": "homeTeam"}},
        {"$lookup": {"from": Collections.TEAMS, "localField": "awayTeamId", "foreignField": "id", "as": "awayTeam"}},
        {"$unwind": "$homeTeam"},
        {"$unwind": "$awayTeam"},
        {"$limit": 1},
    ]).to_list(length=1)

    team = await db[Collections.TEAMS].find_one({"id": team_id})

    if not game_docs or not team:
        raise ValueError("Game or team not found")

    game = game_docs[0]

    # FIX applied here -- see docstring above.
    result = calculate_pick_result(game, team_id)

    now = datetime.now(timezone.utc)
    await db[Collections.PICKS].replace_one(
        {"userId": ObjectId(user_id), "leagueSeasonId": ObjectId(league_season_id), "week": week},
        {
            "userId": ObjectId(user_id),
            "leagueSeasonId": ObjectId(league_season_id),
            "gameId": game_id,
            "teamId": team_id,
            "result": result,
            "week": week,
            "createdAt": now,
        },
        upsert=True,
    )

    pick_doc = await db[Collections.PICKS].find_one({
        "userId": ObjectId(user_id), "leagueSeasonId": ObjectId(league_season_id), "week": week,
    })
    pick_id = str(pick_doc["_id"])

    return Pick(
        id=pick_id,
        user=user_id,
        game=game_from_doc(game),
        team=team_from_doc(team),
        result=result,
        week=week,
    )


async def get_user_picks_by_league(user_id: str, league_season_id: str) -> list[Pick]:
    """Port of lib/db.ts:872-948."""
    db = get_database()
    docs = await db[Collections.PICKS].aggregate([
        {"$match": {"userId": ObjectId(user_id), "leagueSeasonId": ObjectId(league_season_id)}},
        {"$lookup": {"from": Collections.GAMES, "localField": "gameId", "foreignField": "id", "as": "game"}},
        {"$lookup": {"from": Collections.TEAMS, "localField": "teamId", "foreignField": "id", "as": "team"}},
        {"$unwind": "$game"},
        {"$unwind": "$team"},
        {"$lookup": {"from": Collections.TEAMS, "localField": "game.homeTeamId", "foreignField": "id", "as": "game.homeTeam"}},
        {"$lookup": {"from": Collections.TEAMS, "localField": "game.awayTeamId", "foreignField": "id", "as": "game.awayTeam"}},
        {"$unwind": "$game.homeTeam"},
        {"$unwind": "$game.awayTeam"},
    ]).to_list(length=None)

    picks = []
    for pick in docs:
        picks.append(Pick(
            id=str(pick["_id"]),
            user=str(pick["userId"]),
            game=game_from_doc(pick["game"]),
            team=team_from_doc(pick["team"]),
            result=pick["result"],
            week=pick["week"],
        ))
    return picks


async def get_user_pick_for_week(user_id: str, league_season_id: str, week: int) -> Pick | None:
    """Port of lib/db.ts:968-1056."""
    db = get_database()
    docs = await db[Collections.PICKS].aggregate([
        {"$match": {"userId": ObjectId(user_id), "leagueSeasonId": ObjectId(league_season_id), "week": week}},
        {"$lookup": {"from": Collections.GAMES, "localField": "gameId", "foreignField": "id", "as": "game"}},
        {"$lookup": {"from": Collections.TEAMS, "localField": "teamId", "foreignField": "id", "as": "team"}},
        {"$unwind": "$game"},
        {"$unwind": "$team"},
        {"$lookup": {"from": Collections.TEAMS, "localField": "game.homeTeamId", "foreignField": "id", "as": "game.homeTeam"}},
        {"$lookup": {"from": Collections.TEAMS, "localField": "game.awayTeamId", "foreignField": "id", "as": "game.awayTeam"}},
        {"$unwind": "$game.homeTeam"},
        {"$unwind": "$game.awayTeam"},
        {"$limit": 1},
    ]).to_list(length=1)

    if not docs:
        return None

    pick_data = docs[0]
    return Pick(
        id=str(pick_data["_id"]),
        user=user_id,
        game=game_from_doc(pick_data["game"]),
        team=team_from_doc(pick_data["team"]),
        result=pick_data["result"],
        week=pick_data["week"],
    )
