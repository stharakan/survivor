"""Port of lib/db.ts League operations (Rank 2 -- CR-105-FINDINGS.md Table 1,
2.1-2.5), plus `start_new_season`, a NEW capability with no TS equivalent to port
(see the Addendum's "season rollover" section).

`DELETE /leagues/[leagueId]` (Table 3 item 9, cut-list) is a route-level 501 stub
with no lib/db.ts counterpart -- Phase 2 omits the route entirely per the CR-105
decision, so there's nothing to add here for it either.
"""
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from pymongo import ReturnDocument

from app.db.mongodb import get_database, Collections
from app.db._shape import league_from_doc
from app.models.league import League
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
    """Port of lib/db.ts:97-139."""
    db = get_database()
    result = await db[Collections.LEAGUES].insert_one({
        "name": name,
        "description": description,
        "sportsLeague": sports_league,
        "season": season,
        "isPublic": is_public,
        "requiresApproval": requires_approval,
        "hideScoreboard": False,  # default to false (visible)
        "createdBy": ObjectId(created_by),
        "isActive": True,
        "memberCount": 0,
        "createdAt": datetime.now(timezone.utc),
    })

    return League(
        id=str(result.inserted_id),
        name=name,
        description=description,
        sportsLeague=sports_league,
        season=season,
        isPublic=is_public,
        requiresApproval=requires_approval,
        hideScoreboard=False,
        createdBy=created_by,
        isActive=True,
        memberCount=0,
        createdAt=datetime.now(timezone.utc).isoformat(),
        current_game_week=None,
        current_pick_week=None,
        last_completed_week=None,
    )


async def get_league_by_id(league_id: str) -> Optional[League]:
    """Port of lib/db.ts:141-164."""
    db = get_database()
    league = await db[Collections.LEAGUES].find_one({"_id": ObjectId(league_id)})
    if not league:
        return None
    return league_from_doc(league)


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
    """Port of lib/db.ts:166-214. Uses the same UNSET-sentinel pattern as
    auth.update_user: an omitted kwarg means "leave alone" (matching TS's
    `updates.x !== undefined` checks), not "set to None"."""
    db = get_database()
    update_data: dict = {}
    if name is not _UNSET:
        update_data["name"] = name
    if description is not _UNSET:
        update_data["description"] = description
    if logo is not _UNSET:
        update_data["logo"] = logo
    if sports_league is not _UNSET:
        update_data["sportsLeague"] = sports_league
    if is_public is not _UNSET:
        update_data["isPublic"] = is_public
    if requires_approval is not _UNSET:
        update_data["requiresApproval"] = requires_approval
    if hide_scoreboard is not _UNSET:
        update_data["hideScoreboard"] = hide_scoreboard

    result = await db[Collections.LEAGUES].find_one_and_update(
        {"_id": ObjectId(league_id)},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        return None
    return league_from_doc(result)


async def get_all_leagues() -> list[League]:
    """Port of lib/db.ts:216-238."""
    db = get_database()
    leagues = await db[Collections.LEAGUES].find({"isActive": True}).to_list(length=None)
    return [league_from_doc(doc) for doc in leagues]


async def get_available_leagues(user_id: str) -> list[League]:
    """Port of lib/db.ts:239-291."""
    db = get_database()
    memberships = await db[Collections.LEAGUE_MEMBERSHIPS].find({"userId": ObjectId(user_id)}).to_list(length=None)
    member_league_ids = [m["leagueId"] for m in memberships]

    leagues = await db[Collections.LEAGUES].aggregate([
        {"$match": {"isActive": True, "$or": [{"isPublic": True}, {"_id": {"$in": member_league_ids}}]}},
        {"$lookup": {
            "from": Collections.LEAGUE_MEMBERSHIPS,
            "localField": "_id",
            "foreignField": "leagueId",
            "as": "memberships",
        }},
        {"$addFields": {"memberCount": {"$size": "$memberships"}}},
    ]).to_list(length=None)

    return [league_from_doc(doc) for doc in leagues]


async def start_new_season(
    league_id: str,
    *,
    new_season: str,
    archive_summary: Optional[SeasonSummary] = None,
) -> League:
    """NEW capability, no TS equivalent to port -- see CR-105-FINDINGS.md Addendum
    ("season rollover"). Decision recorded there: **in-place rollover**, not a
    League/Season entity split.

    Archives current standings (caller-supplied -- typically the output of
    get_season_summary/results.get_season_summary), resets
    League.season/current_*_week, and resets every active LeagueMembership's
    points/strikes/rank in place. Keeps the same `League._id`, so invites and
    membership history stay linked.

    Design choices flagged for review (see tickets/CR-105-PHASE1-REPORT.md):
    - `archive_summary` is caller-supplied rather than computed here. The
      Addendum's "archive if not already done" is an idempotency policy that
      belongs to the caller/route (Phase 2), not something this data-access
      function should silently decide on its own.
    - The archive is stored in a new `seasonArchive` array field on the League
      document -- there is no existing schema precedent for this, since no
      rollover has ever happened. Phase 2 should confirm this shape before
      relying on it for a "past seasons" UI.
    - Does NOT repopulate Team/Game fixtures for the new season -- that's the
      existing scripts/import-epl-2025-fixtures.ts import pattern's job,
      explicitly out of scope per the Addendum. Left for Phase 2/3 to wire up as
      an admin action, adapted to target an existing league.
    """
    db = get_database()

    league_doc = await db[Collections.LEAGUES].find_one({"_id": ObjectId(league_id)})
    if not league_doc:
        raise ValueError("League not found")

    if archive_summary is not None:
        await db[Collections.LEAGUES].update_one(
            {"_id": ObjectId(league_id)},
            {"$push": {"seasonArchive": {
                "season": league_doc["season"],
                "archivedAt": datetime.now(timezone.utc),
                "summary": archive_summary.model_dump(),
            }}},
        )

    updated = await db[Collections.LEAGUES].find_one_and_update(
        {"_id": ObjectId(league_id)},
        {"$set": {
            "season": new_season,
            "current_game_week": None,
            "current_pick_week": None,
            "last_completed_week": None,
        }},
        return_document=ReturnDocument.AFTER,
    )

    await db[Collections.LEAGUE_MEMBERSHIPS].update_many(
        {"leagueId": ObjectId(league_id), "isActive": True},
        {"$set": {
            "points": 0,
            "strikes": 0,
            "rank": 0,
            "lossStrikes": 0,
            "missingPickStrikes": 0,
        }},
    )

    return league_from_doc(updated)
