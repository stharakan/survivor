"""Shared Mongo-doc -> Pydantic-model shaping helpers used across the db/ modules.

The TS original (lib/db.ts) repeats this exact object-literal shaping inline at
every call site (getUserPicksByLeague, getUserPickForWeek, getGamesByWeekWithPicks,
createPick, getLeagueById, getAllLeagues, getAvailableLeagues, ...) rather than
factoring it out. This port factors it into one place -- the underlying shape is
unchanged, this is a hygiene improvement, not a behavior change, EXCEPT where noted
inline (see memberships.py's use of league_from_doc for the one call site that was
inconsistent in the TS source).
"""
from datetime import datetime
from typing import Optional

from app.models.game import Game, GameUserPick
from app.models.league import League
from app.models.team import Team


def to_iso(value) -> Optional[str]:
    """Mirrors the TS pattern `x instanceof Date ? x.toISOString() : x` /
    `x.toISOString()` used throughout lib/db.ts -- Mongo can hand back either a
    native datetime or (rarely, for already-serialized fields) a string."""
    if value is None:
        return None
    return value.isoformat() if isinstance(value, datetime) else value


def team_from_doc(doc: dict) -> Team:
    return Team(id=doc["id"], name=doc["name"], abbreviation=doc["abbreviation"], logo=doc["logo"])


def game_from_doc(doc: dict, *, user_pick: Optional[GameUserPick] = None) -> Game:
    return Game(
        id=doc["id"],
        week=doc["week"],
        homeTeam=team_from_doc(doc["homeTeam"]),
        awayTeam=team_from_doc(doc["awayTeam"]),
        homeScore=doc.get("homeScore"),
        awayScore=doc.get("awayScore"),
        status=doc["status"],
        date=to_iso(doc.get("date")),
        startTime=doc.get("startTime"),
        sportsLeague=doc.get("sportsLeague", ""),
        season=doc.get("season", ""),
        userPick=user_pick,
    )


def league_from_doc(doc: dict) -> League:
    return League(
        id=str(doc["_id"]),
        name=doc["name"],
        description=doc["description"],
        sportsLeague=doc["sportsLeague"],
        logo=doc.get("logo"),
        season=doc["season"],
        isPublic=doc["isPublic"],
        requiresApproval=doc["requiresApproval"],
        hideScoreboard=doc.get("hideScoreboard", False),
        createdBy=str(doc["createdBy"]),
        isActive=doc["isActive"],
        memberCount=doc["memberCount"],
        createdAt=to_iso(doc["createdAt"]),
        current_game_week=doc.get("current_game_week"),
        current_pick_week=doc.get("current_pick_week"),
        last_completed_week=doc.get("last_completed_week"),
    )
