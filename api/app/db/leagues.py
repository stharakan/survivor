"""Port of lib/db.ts League operations (Rank 2 -- CR-105-FINDINGS.md Table 1,
2.1-2.5).

SUR-010: `create_league` creates BOTH a parent `leagues` doc AND a `league_seasons`
doc and returns the flat League with `id = LeagueSeason._id`. All season-scoped
reads are now in `league_seasons.py`; season rollover is `create_league_season`.

`DELETE /leagues/[leagueId]` (Table 3 item 9, cut-list) is a route-level 501 stub
with no lib/db.ts counterpart -- Phase 2 omits the route entirely per the CR-105
decision, so there's nothing to add here for it either.
"""
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from app.db.mongodb import get_database, Collections
from app.db._shape import flatten_league_season, league_parent_from_doc
from app.models.league import League, LeagueParent


async def create_league(
    name: str,
    description: str,
    sports_league: str,
    season: str,
    is_public: bool,
    requires_approval: bool,
    created_by: str,
) -> League:
    """Port of lib/db.ts:97-139. SUR-010: now creates BOTH a parent `leagues` doc
    AND a `league_seasons` doc, then returns flat League with `id = LeagueSeason._id`.
    This preserves backward compatibility for all existing callers."""
    db = get_database()
    now = datetime.now(timezone.utc)

    parent_result = await db[Collections.LEAGUES].insert_one({
        "name": name,
        "description": description,
        "sportsLeague": sports_league,
        "createdBy": ObjectId(created_by),
        "createdAt": now,
        "currentSeasonId": None,
        "pastSeasonIds": [],
    })
    parent_id = parent_result.inserted_id

    season_result = await db[Collections.LEAGUE_SEASONS].insert_one({
        "leagueId": parent_id,
        "season": season,
        "isPublic": is_public,
        "requiresApproval": requires_approval,
        "hideScoreboard": False,
        "isActive": True,
        "memberCount": 0,
        "createdAt": now,
        "current_game_week": None,
        "current_pick_week": None,
        "last_completed_week": None,
    })
    season_id = season_result.inserted_id

    await db[Collections.LEAGUES].update_one(
        {"_id": parent_id}, {"$set": {"currentSeasonId": season_id}}
    )

    parent_doc = await db[Collections.LEAGUES].find_one({"_id": parent_id})
    season_doc = await db[Collections.LEAGUE_SEASONS].find_one({"_id": season_id})
    return flatten_league_season(season_doc, parent_doc)


async def get_league_parent_by_id(league_id: str) -> Optional[LeagueParent]:
    """Fetch the parent-level League doc (year-agnostic identity), not a season.
    Used by parent-level admin endpoints."""
    db = get_database()
    doc = await db[Collections.LEAGUES].find_one({"_id": ObjectId(league_id)})
    if not doc:
        return None
    return league_parent_from_doc(doc)


