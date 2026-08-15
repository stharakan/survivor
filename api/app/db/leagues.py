"""Port of lib/db.ts League operations (Rank 2 -- CR-105-FINDINGS.md Table 1,
2.1-2.5), plus `start_new_season`, a NEW capability with no TS equivalent to port
(see the Addendum's "season rollover" section).

SUR-010: `create_league` now creates BOTH a parent `leagues` doc AND a
`league_seasons` doc. `get_league_by_id`, `get_available_leagues`, and
`update_league_settings` are shims to `league_seasons.py` for backward
compatibility with routers that still import them (Task 6 will update those
imports). `start_new_season` is stubbed — replaced by `create_league_season` in
`league_seasons.py` (Stage D).

`DELETE /leagues/[leagueId]` (Table 3 item 9, cut-list) is a route-level 501 stub
with no lib/db.ts counterpart -- Phase 2 omits the route entirely per the CR-105
decision, so there's nothing to add here for it either.
"""
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from app.db.mongodb import get_database, Collections
from app.db._shape import flatten_league_season, league_parent_from_doc
from app.db.league_seasons import (
    get_league_season_by_id,
    get_available_league_seasons,
    update_league_season_settings,
)
from app.models.league import League, LeagueParent
from app.models.season_summary import SeasonSummary

_UNSET = object()


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


async def get_league_by_id(league_season_id: str) -> Optional[League]:
    """Backward-compat shim — delegates to get_league_season_by_id.

    Existing router imports (`from app.db.leagues import get_league_by_id`) keep
    working until Task 6 updates them to import from `league_seasons` directly.
    """
    return await get_league_season_by_id(league_season_id)


async def get_league_parent_by_id(league_id: str) -> Optional[LeagueParent]:
    """Fetch the parent-level League doc (year-agnostic identity), not a season.
    Used by parent-level admin endpoints."""
    db = get_database()
    doc = await db[Collections.LEAGUES].find_one({"_id": ObjectId(league_id)})
    if not doc:
        return None
    return league_parent_from_doc(doc)


async def update_league_settings(
    league_id: str,
    *,
    name=_UNSET,
    description=_UNSET,
    logo=_UNSET,
    sports_league=_UNSET,
    is_public=_UNSET,
    requires_approval=_UNSET,
    hide_scoreboard=_UNSET,
) -> Optional[League]:
    """Backward-compat shim — delegates to update_league_season_settings.

    Treats the incoming `league_id` as a `league_season_id` (since all callers
    that used to pass a `leagues._id` now pass a `league_seasons._id`).
    """
    kwargs = {}
    if name is not _UNSET:
        kwargs["name"] = name
    if description is not _UNSET:
        kwargs["description"] = description
    if logo is not _UNSET:
        kwargs["logo"] = logo
    if sports_league is not _UNSET:
        kwargs["sports_league"] = sports_league
    if is_public is not _UNSET:
        kwargs["is_public"] = is_public
    if requires_approval is not _UNSET:
        kwargs["requires_approval"] = requires_approval
    if hide_scoreboard is not _UNSET:
        kwargs["hide_scoreboard"] = hide_scoreboard
    return await update_league_season_settings(league_id, **kwargs)


async def get_all_leagues() -> list[League]:
    """Port of lib/db.ts:216-238.

    NOTE: This function still queries the old flat `leagues` collection and uses
    `league_from_doc`. It is only called by `GET /api/leagues` (admin listing).
    Task 6 will update this to query `league_seasons` instead. For now, left
    as-is to avoid breaking existing behaviour while the data migration is pending.
    """
    from app.db._shape import league_from_doc
    db = get_database()
    leagues = await db[Collections.LEAGUES].find({"isActive": True}).to_list(length=None)
    return [league_from_doc(doc) for doc in leagues]


async def get_available_leagues(user_id: str) -> list[League]:
    """Backward-compat shim — delegates to get_available_league_seasons."""
    return await get_available_league_seasons(user_id)


async def start_new_season(
    league_id: str,
    *,
    new_season: str,
    archive_summary: Optional[SeasonSummary] = None,
) -> League:
    """STUBBED (SUR-010 Stage D). Replaced by `create_league_season` in
    `league_seasons.py`. Kept here until Task 9 removes the stub entirely."""
    raise NotImplementedError(
        "Replaced by create_league_season in league_seasons.py — Stage D"
    )
