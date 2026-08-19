"""Season-scoped DB operations for the `league_seasons` collection (SUR-010).

Each LeagueSeason doc is a single year of play within a parent League. All
season-facing queries join against `leagues` via `leagueId` and return the flat
`League` shape the frontend already consumes.
"""
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from app.db.mongodb import get_database, Collections
from app.db._shape import flatten_league_season
from app.models.league import League

_UNSET = object()

# Reusable $lookup stages: join league_seasons → leagues parent.
_PARENT_LOOKUP = [
    {"$lookup": {
        "from": Collections.LEAGUES,
        "localField": "leagueId",
        "foreignField": "_id",
        "as": "parent",
    }},
    {"$unwind": "$parent"},
]


async def get_league_season_by_id(league_season_id: str) -> Optional[League]:
    """Primary league lookup — queries `league_seasons`, joins `leagues` parent,
    returns flat League with `id = LeagueSeason._id`."""
    db = get_database()
    docs = await db[Collections.LEAGUE_SEASONS].aggregate([
        {"$match": {"_id": ObjectId(league_season_id)}},
        *_PARENT_LOOKUP,
        {"$limit": 1},
    ]).to_list(length=1)
    if not docs:
        return None
    return flatten_league_season(docs[0], docs[0]["parent"])


async def get_league_season_sports_and_season(
    league_season_id: str,
) -> Optional[tuple[str, str]]:
    """Returns (sportsLeague, season) for game lookups that only need these two
    fields — avoids a full join when the router just needs to pass them to
    `games.get_games_by_week`."""
    db = get_database()
    docs = await db[Collections.LEAGUE_SEASONS].aggregate([
        {"$match": {"_id": ObjectId(league_season_id)}},
        *_PARENT_LOOKUP,
        {"$limit": 1},
        {"$project": {"season": 1, "parent.sportsLeague": 1}},
    ]).to_list(length=1)
    if not docs:
        return None
    return (docs[0]["parent"]["sportsLeague"], docs[0]["season"])


async def get_all_active_league_seasons() -> list[League]:
    """All currently active league seasons across all leagues."""
    db = get_database()
    docs = await db[Collections.LEAGUE_SEASONS].aggregate([
        {"$match": {"isActive": True}},
        *_PARENT_LOOKUP,
    ]).to_list(length=None)
    return [flatten_league_season(d, d["parent"]) for d in docs]


async def get_available_league_seasons(user_id: str) -> list[League]:
    """All active seasons the user belongs to, plus all public active seasons.

    Replaces `get_available_leagues` in `leagues.py`; memberships now carry
    `leagueSeasonId` instead of `leagueId` (SUR-010 Stage B).
    """
    db = get_database()
    memberships = await db[Collections.LEAGUE_MEMBERSHIPS].find(
        {"userId": ObjectId(user_id)}
    ).to_list(length=None)
    member_season_ids = [m["leagueSeasonId"] for m in memberships if "leagueSeasonId" in m]

    docs = await db[Collections.LEAGUE_SEASONS].aggregate([
        {"$match": {
            "isActive": True,
            "$or": [{"isPublic": True}, {"_id": {"$in": member_season_ids}}],
        }},
        *_PARENT_LOOKUP,
        {"$lookup": {
            "from": Collections.LEAGUE_MEMBERSHIPS,
            "localField": "_id",
            "foreignField": "leagueSeasonId",
            "as": "memberships",
        }},
        # memberCount reflects active players only -- a removed member
        # (isActive: False, see memberships.py's remove_member_from_league)
        # still has a membership doc for history/stats, so an unfiltered
        # $size here would double-count them back in after removal.
        {"$addFields": {
            "memberCount": {
                "$size": {
                    "$filter": {
                        "input": "$memberships",
                        "as": "m",
                        "cond": {"$eq": ["$$m.isActive", True]},
                    }
                }
            }
        }},
    ]).to_list(length=None)
    return [flatten_league_season(d, d["parent"]) for d in docs]


async def update_league_season_settings(
    league_season_id: str,
    *,
    name=_UNSET,
    description=_UNSET,
    logo=_UNSET,
    sports_league=_UNSET,
    is_public=_UNSET,
    requires_approval=_UNSET,
    hide_scoreboard=_UNSET,
) -> Optional[League]:
    """Routes parent-identity fields (name/description/logo/sportsLeague) to the
    `leagues` collection and season-policy fields (isPublic/requiresApproval/
    hideScoreboard) to `league_seasons`.

    Replaces `update_league_settings` in `leagues.py`.
    """
    db = get_database()

    season_doc = await db[Collections.LEAGUE_SEASONS].find_one(
        {"_id": ObjectId(league_season_id)}
    )
    if not season_doc:
        return None
    parent_id = season_doc["leagueId"]

    parent_updates: dict = {}
    if name is not _UNSET:
        parent_updates["name"] = name
    if description is not _UNSET:
        parent_updates["description"] = description
    if logo is not _UNSET:
        parent_updates["logo"] = logo
    if sports_league is not _UNSET:
        parent_updates["sportsLeague"] = sports_league

    season_updates: dict = {}
    if is_public is not _UNSET:
        season_updates["isPublic"] = is_public
    if requires_approval is not _UNSET:
        season_updates["requiresApproval"] = requires_approval
    if hide_scoreboard is not _UNSET:
        season_updates["hideScoreboard"] = hide_scoreboard

    if parent_updates:
        await db[Collections.LEAGUES].update_one(
            {"_id": parent_id}, {"$set": parent_updates}
        )
    if season_updates:
        await db[Collections.LEAGUE_SEASONS].update_one(
            {"_id": ObjectId(league_season_id)}, {"$set": season_updates}
        )

    return await get_league_season_by_id(league_season_id)


async def create_league_season(league_id: str, new_season: str) -> League:
    """Create a new LeagueSeason under an existing parent League (SUR-010 Stage D).

    Carries over active memberships: isAdmin preserved, isPaid reset to False.
    Marks the outgoing season inactive and updates League.currentSeasonId +
    pastSeasonIds.
    """
    db = get_database()
    now = datetime.now(timezone.utc)

    parent = await db[Collections.LEAGUES].find_one({"_id": ObjectId(league_id)})
    if not parent:
        raise ValueError(f"League {league_id} not found")

    outgoing_season_id = parent.get("currentSeasonId")
    outgoing_season = None
    if outgoing_season_id:
        outgoing_season = await db[Collections.LEAGUE_SEASONS].find_one(
            {"_id": outgoing_season_id}
        )

    is_public = (outgoing_season or {}).get("isPublic", False)
    requires_approval = (outgoing_season or {}).get("requiresApproval", True)
    hide_scoreboard = (outgoing_season or {}).get("hideScoreboard") or False

    season_result = await db[Collections.LEAGUE_SEASONS].insert_one({
        "leagueId": ObjectId(league_id),
        "season": new_season,
        "isActive": True,
        "isPublic": is_public,
        "requiresApproval": requires_approval,
        "hideScoreboard": hide_scoreboard,
        "memberCount": 0,
        "createdAt": now,
        "current_game_week": None,
        "current_pick_week": None,
        "last_completed_week": None,
    })
    new_season_id = season_result.inserted_id

    if outgoing_season_id:
        await db[Collections.LEAGUE_SEASONS].update_one(
            {"_id": outgoing_season_id}, {"$set": {"isActive": False}}
        )

    active_members = await db[Collections.LEAGUE_MEMBERSHIPS].find(
        {"leagueSeasonId": outgoing_season_id, "status": "active"}
    ).to_list(length=None) if outgoing_season_id else []

    # Renewing members only -- used to prune innerCircleUserIds below so a
    # circle never carries a reference to someone who didn't renew.
    renewing_user_ids = {m["userId"] for m in active_members}

    if active_members:
        await db[Collections.LEAGUE_MEMBERSHIPS].insert_many([
            {
                "leagueSeasonId": new_season_id,
                "userId": m["userId"],
                "teamName": m["teamName"],
                "isAdmin": m["isAdmin"],
                "isPaid": False,
                "points": 0,
                "strikes": 0,
                "lossStrikes": 0,
                "missingPickStrikes": 0,
                "rank": 0,
                "isActive": True,
                "status": "active",
                "joinedAt": now,
                # Carry the inner circle forward, but drop anyone who didn't
                # renew -- otherwise a stale reference to a departed member
                # would sit in the array with nothing left to ever prune it
                # (mid-season removals are only hidden from display, not
                # pruned from the array itself; see get_inner_circle).
                "innerCircleUserIds": [
                    uid for uid in m.get("innerCircleUserIds", []) if uid in renewing_user_ids
                ],
            }
            for m in active_members
        ])

    member_count = len(active_members)
    await db[Collections.LEAGUE_SEASONS].update_one(
        {"_id": new_season_id}, {"$set": {"memberCount": member_count}}
    )

    update_op: dict = {"$set": {"currentSeasonId": new_season_id}}
    if outgoing_season_id:
        update_op["$push"] = {"pastSeasonIds": outgoing_season_id}
    await db[Collections.LEAGUES].update_one({"_id": ObjectId(league_id)}, update_op)

    return await get_league_season_by_id(str(new_season_id))
