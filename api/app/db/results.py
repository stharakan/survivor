"""Port of the scoreboard/results/season-summary read functions from lib/db.ts
(Rank 7 -- CR-105-FINDINGS.md Table 1, 7.5-7.7). These flipped from "read stays in
Next, write moves" under the pilot to full MOVE-TO-PYTHON once the pilot scope was
dropped -- there's no reason to keep the read half in a deprecated backend under
the full-migration decision.

SUR-010: all LEAGUES queries for week tracking replaced with LEAGUE_SEASONS;
picks $match uses leagueSeasonId instead of leagueId.
"""
from typing import Optional

from bson import ObjectId

from app.db.memberships import get_league_members_with_user_data
from app.db.mongodb import get_database, Collections
from app.models.player import Player
from app.models.results import ResultsData, UserResults, UserWeekPick
from app.models.season_summary import FinalStanding, PrizeWinner, SeasonSummary


def _base_player(member, weekly_pick: Optional[str] = None) -> Player:
    display_name = f"{member.teamName} ({member.userDetails.name})" if member.userDetails.name else member.teamName
    return Player(
        id=member.user, name=display_name, points=member.points, strikes=member.strikes,
        rank=member.rank, weeklyPick=weekly_pick, isAI=member.userDetails.isAI,
    )


def _rank_players(players: list[Player]) -> list[Player]:
    ordered = sorted(players, key=lambda p: (-p.points, p.strikes))
    return [p.model_copy(update={"rank": i + 1}) for i, p in enumerate(ordered)]


async def get_scoreboard_with_picks(league_season_id: str) -> dict:
    """Port of lib/db.ts:1195-1300. Returns `{players: list[Player],
    currentGameWeek: int | None}`."""
    db = get_database()

    season_doc = await db[Collections.LEAGUE_SEASONS].find_one({"_id": ObjectId(league_season_id)})
    current_game_week = (season_doc or {}).get("current_game_week")

    members = await get_league_members_with_user_data(league_season_id)

    if not current_game_week:
        players = _rank_players([_base_player(m) for m in members if m.status == "active"])
        return {"players": players, "currentGameWeek": current_game_week}

    member_user_ids = [ObjectId(m.user) for m in members]

    weekly_picks = await db[Collections.PICKS].aggregate([
        {"$match": {
            "userId": {"$in": member_user_ids},
            "leagueSeasonId": ObjectId(league_season_id),
            "week": current_game_week,
        }},
        {"$lookup": {"from": Collections.TEAMS, "localField": "teamId", "foreignField": "id", "as": "team"}},
        {"$unwind": "$team"},
        {"$project": {"userId": 1, "teamName": "$team.name"}},
    ]).to_list(length=None)

    picks_by_user = {str(p["userId"]): p["teamName"] for p in weekly_picks}

    players = _rank_players([
        _base_player(m, weekly_pick=picks_by_user.get(m.user)) for m in members if m.status == "active"
    ])
    return {"players": players, "currentGameWeek": current_game_week}


async def get_league_results(league_season_id: str) -> ResultsData:
    """Port of lib/db.ts:1595-1706."""
    db = get_database()

    season_doc = await db[Collections.LEAGUE_SEASONS].find_one({"_id": ObjectId(league_season_id)})
    last_completed_week = (season_doc or {}).get("last_completed_week") or 0

    if last_completed_week == 0:
        return ResultsData(users=[], completedWeeks=[])

    completed_weeks = list(range(1, last_completed_week + 1))

    members = await get_league_members_with_user_data(league_season_id)
    active_members = [m for m in members if m.status == "active"]

    if not active_members:
        return ResultsData(users=[], completedWeeks=completed_weeks)

    member_user_ids = [ObjectId(m.user) for m in active_members]

    all_picks = await db[Collections.PICKS].aggregate([
        {"$match": {
            "userId": {"$in": member_user_ids},
            "leagueSeasonId": ObjectId(league_season_id),
            "week": {"$in": completed_weeks},
        }},
        {"$lookup": {"from": Collections.TEAMS, "localField": "teamId", "foreignField": "id", "as": "team"}},
        {"$unwind": "$team"},
        {"$project": {"userId": 1, "week": 1, "teamName": "$team.name", "result": 1}},
    ]).to_list(length=None)

    picks_by_user: dict[str, list[dict]] = {}
    for pick in all_picks:
        picks_by_user.setdefault(str(pick["userId"]), []).append(pick)

    users = []
    for member in active_members:
        display_name = f"{member.teamName} ({member.userDetails.name})" if member.userDetails.name else member.teamName
        user_picks = picks_by_user.get(member.user, [])

        picks = []
        for week in completed_weeks:
            week_pick = next((p for p in user_picks if p["week"] == week), None)
            if week_pick:
                picks.append(UserWeekPick(week=week, teamName=week_pick["teamName"], result=week_pick["result"]))
            else:
                picks.append(UserWeekPick(week=week, teamName="—", result=None))

        users.append(UserResults(id=member.user, name=display_name, picks=picks))

    users.sort(key=lambda u: u.name)

    return ResultsData(users=users, completedWeeks=completed_weeks)


async def get_season_summary(league_season_id: str) -> SeasonSummary:
    """Port of lib/db.ts:1709-1888."""
    db = get_database()

    season_doc = await db[Collections.LEAGUE_SEASONS].find_one({"_id": ObjectId(league_season_id)})
    if not season_doc:
        raise ValueError("League season not found")

    last_completed_week = season_doc.get("last_completed_week") or 0

    members = await get_league_members_with_user_data(league_season_id)
    active_members = [m for m in members if m.status == "active"]

    # League is ended if all active members have 2+ strikes.
    is_league_ended = len(active_members) > 0 and all(m.strikes >= 2 for m in active_members)

    if not active_members or last_completed_week == 0:
        return SeasonSummary(isLeagueEnded=is_league_ended, prizes=[], standings=[])

    member_user_ids = [ObjectId(m.user) for m in active_members]
    all_picks = await db[Collections.PICKS].find({
        "userId": {"$in": member_user_ids},
        "leagueSeasonId": ObjectId(league_season_id),
        "week": {"$lte": last_completed_week},
    }).to_list(length=None)

    picks_by_user: dict[str, dict[int, dict]] = {}
    for pick in all_picks:
        uid = str(pick["userId"])
        picks_by_user.setdefault(uid, {})[pick["week"]] = pick

    # For each member, walk through weeks chronologically to compute elimination data.
    player_data = []
    for member in active_members:
        user_id = member.user
        display_name = f"{member.teamName} ({member.userDetails.name})" if member.userDetails.name else member.teamName
        user_picks_by_week = picks_by_user.get(user_id, {})

        points = 0
        strikes = 0
        week_eliminated: Optional[int] = None
        points_at_elimination = 0
        first_strike_week: Optional[int] = None

        for week in range(1, last_completed_week + 1):
            pick = user_picks_by_week.get(week)

            if not pick:
                strikes += 1
                if first_strike_week is None:
                    first_strike_week = week
            elif pick["result"] == "win":
                points += 3
            elif pick["result"] == "draw":
                points += 1
            elif pick["result"] == "loss":
                strikes += 1
                if first_strike_week is None:
                    first_strike_week = week
            elif pick["result"] == "dnp":
                # SUR-008: a DNP pick (postponed game) is a real pick, so it
                # doesn't hit the `if not pick` missing-pick-strike branch
                # above, but it's explicitly worth 0 points and 0 strikes --
                # same "stated decision, not accidental" reasoning as
                # app/db/scoring.py's calculate_scores_and_strikes.
                pass

            if strikes >= 2 and week_eliminated is None:
                week_eliminated = week
                points_at_elimination = points

        if week_eliminated is None:
            points_at_elimination = points

        weeks_before_first_strike = (first_strike_week - 1) if first_strike_week else last_completed_week

        player_data.append({
            "userId": user_id,
            "playerName": display_name,
            "totalPoints": member.points,
            "pointsAtElimination": points_at_elimination,
            "strikes": member.strikes,
            "weekEliminated": week_eliminated,
            "firstStrikeWeek": first_strike_week,
            "weeksBeforeFirstStrike": weeks_before_first_strike,
        })

    # Sort for 1st/2nd place: by points at elimination (desc), then fewer strikes.
    sorted_by_elim_points = sorted(player_data, key=lambda p: (-p["pointsAtElimination"], p["strikes"]))
    # Sort for Longest Survivor: most weeks before first strike.
    sorted_by_longest_survivor = sorted(
        player_data, key=lambda p: (-p["weeksBeforeFirstStrike"], -p["pointsAtElimination"])
    )
    # Sort for Highest Total Points.
    sorted_by_total_points = sorted(player_data, key=lambda p: (-p["totalPoints"], p["strikes"]))

    prizes: list[PrizeWinner] = []
    if sorted_by_elim_points:
        p = sorted_by_elim_points[0]
        prizes.append(PrizeWinner(
            prize="first_place", prizeName="1st Place", icon="trophy",
            userId=p["userId"], playerName=p["playerName"],
            stat=f"{p['pointsAtElimination']} pts at elimination",
        ))
    if len(sorted_by_elim_points) > 1:
        p = sorted_by_elim_points[1]
        prizes.append(PrizeWinner(
            prize="second_place", prizeName="2nd Place", icon="medal",
            userId=p["userId"], playerName=p["playerName"],
            stat=f"{p['pointsAtElimination']} pts at elimination",
        ))
    if sorted_by_longest_survivor:
        p = sorted_by_longest_survivor[0]
        prizes.append(PrizeWinner(
            prize="longest_survivor", prizeName="Longest Survivor", icon="shield",
            userId=p["userId"], playerName=p["playerName"],
            stat=f"{p['weeksBeforeFirstStrike']} weeks without a strike",
        ))
    if sorted_by_total_points:
        p = sorted_by_total_points[0]
        prizes.append(PrizeWinner(
            prize="highest_total_points", prizeName="Highest Total Points", icon="star",
            userId=p["userId"], playerName=p["playerName"],
            stat=f"{p['totalPoints']} total points",
        ))

    standings = [
        FinalStanding(
            rank=i + 1, userId=p["userId"], playerName=p["playerName"],
            pointsAtElimination=p["pointsAtElimination"], totalPoints=p["totalPoints"],
            strikes=p["strikes"], weekEliminated=p["weekEliminated"],
        )
        for i, p in enumerate(sorted_by_elim_points)
    ]

    return SeasonSummary(isLeagueEnded=is_league_ended, prizes=prizes, standings=standings)
