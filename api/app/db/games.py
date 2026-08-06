"""Port of lib/db.ts Game read operations (Rank 4 -- CR-105-FINDINGS.md Table 1,
4.1-4.4).

`createGame` and `createGameIndexes` are on the CR-105 cut list (dev-seed only,
zero live-route importers, confirmed unchanged on re-grep) and are deliberately
NOT ported here.
"""
from typing import Optional

from bson import ObjectId

from app.db.leagues import get_league_by_id
from app.db.mongodb import get_database, Collections
from app.db._shape import game_from_doc, team_from_doc
from app.models.game import Game
from app.models.game import GameUserPick
from app.models.team import Team


async def get_games_by_week(week: int, league_id: str) -> list[Game]:
    """Port of lib/db.ts:707-759."""
    db = get_database()
    league = await get_league_by_id(league_id)
    if league is None:
        raise ValueError("League not found")

    docs = await db[Collections.GAMES].aggregate([
        {"$match": {"week": week, "sportsLeague": league.sportsLeague, "season": league.season}},
        {"$lookup": {"from": Collections.TEAMS, "localField": "homeTeamId", "foreignField": "id", "as": "homeTeam"}},
        {"$lookup": {"from": Collections.TEAMS, "localField": "awayTeamId", "foreignField": "id", "as": "awayTeam"}},
        {"$unwind": "$homeTeam"},
        {"$unwind": "$awayTeam"},
    ]).to_list(length=None)

    return [game_from_doc(doc) for doc in docs]


async def get_game_time_info_by_id(game_id: int) -> Optional[dict]:
    """Port of lib/db.ts:950-965. Returns the same partial `{startTime?, date?,
    status?}` shape the TS function does -- consumed by the future picks route's
    pick-lock validation (Phase 2, alongside the lib/game-utils.ts port). Kept as
    a plain dict rather than a Pydantic model since it's intentionally a partial
    projection, matching the TS return type (not a full Game)."""
    db = get_database()
    game = await db[Collections.GAMES].find_one({"id": game_id}, {"startTime": 1, "date": 1, "status": 1})
    if not game:
        return None
    return {"startTime": game.get("startTime"), "date": game.get("date"), "status": game.get("status")}


async def get_all_teams() -> list[Team]:
    """Port of lib/db.ts:1059-1069."""
    db = get_database()
    docs = await db[Collections.TEAMS].find().to_list(length=None)
    return [team_from_doc(doc) for doc in docs]


async def get_games_by_week_with_picks(week: int, user_id: str, league_id: str) -> list[Game]:
    """Port of lib/db.ts:1072-1165."""
    db = get_database()
    league = await get_league_by_id(league_id)
    if league is None:
        raise ValueError("League not found")

    docs = await db[Collections.GAMES].aggregate([
        {"$match": {"week": week, "sportsLeague": league.sportsLeague, "season": league.season}},
        {"$lookup": {"from": Collections.TEAMS, "localField": "homeTeamId", "foreignField": "id", "as": "homeTeam"}},
        {"$lookup": {"from": Collections.TEAMS, "localField": "awayTeamId", "foreignField": "id", "as": "awayTeam"}},
        {"$unwind": "$homeTeam"},
        {"$unwind": "$awayTeam"},
        {"$lookup": {
            "from": Collections.PICKS,
            "let": {"gameId": "$id"},
            "pipeline": [
                {"$match": {"$expr": {"$and": [
                    {"$eq": ["$gameId", "$$gameId"]},
                    {"$eq": ["$userId", ObjectId(user_id)]},
                    {"$eq": ["$leagueId", ObjectId(league_id)]},
                ]}}},
                {"$lookup": {"from": Collections.TEAMS, "localField": "teamId", "foreignField": "id", "as": "team"}},
                {"$unwind": "$team"},
            ],
            "as": "userPick",
        }},
    ]).to_list(length=None)

    games = []
    for doc in docs:
        user_pick = None
        if doc["userPick"]:
            up = doc["userPick"][0]
            user_pick = GameUserPick(
                id=str(up["_id"]),
                user=str(up["userId"]),
                team=team_from_doc(up["team"]),
                result=up["result"],
                week=up["week"],
            )
        games.append(game_from_doc(doc, user_pick=user_pick))
    return games
