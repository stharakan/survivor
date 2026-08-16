"""Port of lib/db.ts League membership operations (Rank 3 -- CR-105-FINDINGS.md
Table 1, 3.1-3.7).

SUR-010: renamed leagueId→leagueSeasonId in all DB queries/inserts; aggregation
pipeline now does a two-hop join (league_memberships → league_seasons → leagues)
to assemble the flat League shape. memberCount increments/decrements go to
league_seasons, not leagues.
"""
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from app.db.league_seasons import get_league_season_by_id
from app.db.mongodb import get_database, Collections
from app.db._shape import flatten_league_season, to_iso
from app.models.league import InnerCircleMember, LeagueMembership, LeagueMembershipWithUserDetails, UserSummary

_UNSET = object()

# Two-hop join: league_memberships → league_seasons → leagues parent.
_SEASON_JOIN = [
    {"$lookup": {
        "from": Collections.LEAGUE_SEASONS,
        "localField": "leagueSeasonId",
        "foreignField": "_id",
        "as": "league_season",
    }},
    {"$unwind": "$league_season"},
    {"$lookup": {
        "from": Collections.LEAGUES,
        "localField": "league_season.leagueId",
        "foreignField": "_id",
        "as": "league_parent",
    }},
    {"$unwind": "$league_parent"},
]


def _membership_from_agg(doc: dict) -> LeagueMembership:
    return LeagueMembership(
        id=str(doc["_id"]),
        league=flatten_league_season(doc["league_season"], doc["league_parent"]),
        user=str(doc["userId"]),
        teamName=doc["teamName"],
        points=doc["points"],
        strikes=doc["strikes"],
        lossStrikes=doc.get("lossStrikes"),
        missingPickStrikes=doc.get("missingPickStrikes"),
        rank=doc["rank"],
        isActive=doc["isActive"],
        isAdmin=doc["isAdmin"],
        isPaid=doc["isPaid"],
        status=doc["status"],
        joinedAt=to_iso(doc["joinedAt"]),
    )


async def create_league_membership(
    league_season_id: str, user_id: str, team_name: str, is_admin: bool = False
) -> LeagueMembership:
    """Port of lib/db.ts:294-338."""
    db = get_database()
    result = await db[Collections.LEAGUE_MEMBERSHIPS].insert_one({
        "leagueSeasonId": ObjectId(league_season_id),
        "userId": ObjectId(user_id),
        "teamName": team_name,
        "points": 0,
        "strikes": 0,
        "rank": 0,
        "isActive": True,
        "isAdmin": is_admin,
        "isPaid": False,
        "status": "active",
        "joinedAt": datetime.now(timezone.utc),
        "innerCircleUserIds": [],
    })

    await db[Collections.LEAGUE_SEASONS].update_one(
        {"_id": ObjectId(league_season_id)}, {"$inc": {"memberCount": 1}}
    )

    league = await get_league_season_by_id(league_season_id)
    if league is None:
        raise ValueError("League season not found immediately after membership creation")

    return LeagueMembership(
        id=str(result.inserted_id),
        league=league,
        user=user_id,
        teamName=team_name,
        points=0,
        strikes=0,
        rank=0,
        isActive=True,
        isAdmin=is_admin,
        isPaid=False,
        status="active",
        joinedAt=datetime.now(timezone.utc).isoformat(),
    )


async def get_user_league_memberships(user_id: str) -> list[LeagueMembership]:
    """Port of lib/db.ts:340-387."""
    db = get_database()
    docs = await db[Collections.LEAGUE_MEMBERSHIPS].aggregate([
        {"$match": {"userId": ObjectId(user_id)}},
        *_SEASON_JOIN,
    ]).to_list(length=None)
    return [_membership_from_agg(doc) for doc in docs]


async def get_league_members(league_season_id: str) -> list[LeagueMembership]:
    """Port of lib/db.ts:389-436."""
    db = get_database()
    docs = await db[Collections.LEAGUE_MEMBERSHIPS].aggregate([
        {"$match": {"leagueSeasonId": ObjectId(league_season_id)}},
        *_SEASON_JOIN,
    ]).to_list(length=None)
    return [_membership_from_agg(doc) for doc in docs]


async def get_league_members_with_user_data(league_season_id: str) -> list[LeagueMembershipWithUserDetails]:
    """Port of lib/db.ts:438-497."""
    db = get_database()
    docs = await db[Collections.LEAGUE_MEMBERSHIPS].aggregate([
        {"$match": {"leagueSeasonId": ObjectId(league_season_id)}},
        *_SEASON_JOIN,
        {"$lookup": {"from": Collections.USERS, "localField": "userId", "foreignField": "_id", "as": "userDetails"}},
        {"$unwind": "$userDetails"},
    ]).to_list(length=None)

    result = []
    for doc in docs:
        base = _membership_from_agg(doc)
        ud = doc["userDetails"]
        result.append(LeagueMembershipWithUserDetails(
            **base.model_dump(),
            userDetails=UserSummary(id=str(ud["_id"]), email=ud["email"], name=ud.get("name")),
        ))
    return result


async def get_league_member(league_season_id: str, member_id: str) -> Optional[LeagueMembership]:
    """Port of lib/db.ts:499-556."""
    db = get_database()
    docs = await db[Collections.LEAGUE_MEMBERSHIPS].aggregate([
        {"$match": {"_id": ObjectId(member_id), "leagueSeasonId": ObjectId(league_season_id)}},
        *_SEASON_JOIN,
    ]).to_list(length=1)
    if not docs:
        return None
    return _membership_from_agg(docs[0])


async def get_membership_for_user(league_season_id: str, user_id: str) -> Optional[LeagueMembership]:
    """NEW in Phase 2 -- port of lib/auth-utils.ts's private
    `getUserLeagueMembership` helper. Needed by auth_deps.py's authorization
    context. SUR-010: matches on leagueSeasonId."""
    db = get_database()
    docs = await db[Collections.LEAGUE_MEMBERSHIPS].aggregate([
        {"$match": {"userId": ObjectId(user_id), "leagueSeasonId": ObjectId(league_season_id)}},
        *_SEASON_JOIN,
        {"$limit": 1},
    ]).to_list(length=1)
    if not docs:
        return None
    return _membership_from_agg(docs[0])


async def update_member_status(
    league_season_id: str,
    member_id: str,
    *,
    is_paid=_UNSET,
    is_admin=_UNSET,
    team_name=_UNSET,
) -> None:
    """Port of lib/db.ts:558-599."""
    db = get_database()
    update_doc: dict = {}

    if is_paid is not _UNSET:
        update_doc["isPaid"] = is_paid
    if is_admin is not _UNSET:
        update_doc["isAdmin"] = is_admin
    if team_name is not _UNSET:
        trimmed = team_name.strip()
        if not trimmed:
            raise ValueError("Team name cannot be empty")

        existing = await db[Collections.LEAGUE_MEMBERSHIPS].find_one({
            "leagueSeasonId": ObjectId(league_season_id),
            "teamName": trimmed,
            "_id": {"$ne": ObjectId(member_id)},
        })
        if existing:
            raise ValueError("Team name is already taken in this league")

        update_doc["teamName"] = trimmed

    await db[Collections.LEAGUE_MEMBERSHIPS].update_one(
        {"_id": ObjectId(member_id), "leagueSeasonId": ObjectId(league_season_id)},
        {"$set": update_doc},
    )


async def remove_member_from_league(league_season_id: str, member_id: str, removed_by: str) -> None:
    """Port of lib/db.ts:601-643. Soft-deletes (marks inactive)."""
    db = get_database()
    existing_member = await db[Collections.LEAGUE_MEMBERSHIPS].find_one({
        "_id": ObjectId(member_id), "leagueSeasonId": ObjectId(league_season_id),
    })
    if not existing_member:
        raise ValueError("Member not found")
    if not existing_member["isActive"]:
        raise ValueError("Member is already inactive")

    await db[Collections.LEAGUE_MEMBERSHIPS].update_one(
        {"_id": ObjectId(member_id), "leagueSeasonId": ObjectId(league_season_id)},
        {"$set": {
            "isActive": False,
            "status": "removed",
            "removedAt": datetime.now(timezone.utc),
            "removedBy": ObjectId(removed_by),
        }},
    )

    await db[Collections.LEAGUE_SEASONS].update_one(
        {"_id": ObjectId(league_season_id)}, {"$inc": {"memberCount": -1}}
    )


async def get_inner_circle(league_season_id: str, member_id: str) -> list[InnerCircleMember]:
    """NEW, no TS twin. Resolves the caller's stored innerCircleUserIds
    against this season's currently-active members. A userId that's gone
    inactive since being added (removed mid-season) is silently dropped
    here rather than shown as a ghost entry -- the stored array itself is
    only pruned at season rollover (see create_league_season)."""
    db = get_database()
    own_doc = await db[Collections.LEAGUE_MEMBERSHIPS].find_one({
        "_id": ObjectId(member_id), "leagueSeasonId": ObjectId(league_season_id),
    })
    if not own_doc:
        return []

    circle_ids = {ObjectId(uid) for uid in own_doc.get("innerCircleUserIds", [])}
    if not circle_ids:
        return []

    members = await get_league_members_with_user_data(league_season_id)
    result = []
    for m in members:
        if m.status == "active" and ObjectId(m.user) in circle_ids:
            display_name = f"{m.teamName} ({m.userDetails.name})" if m.userDetails.name else m.teamName
            result.append(InnerCircleMember(userId=m.user, name=display_name))
    return result


async def add_to_inner_circle(league_season_id: str, member_id: str, target_user_id: str) -> None:
    """NEW, no TS twin. Caller-ownership of `member_id` is enforced by the
    router before this is called."""
    db = get_database()
    own_doc = await db[Collections.LEAGUE_MEMBERSHIPS].find_one({
        "_id": ObjectId(member_id), "leagueSeasonId": ObjectId(league_season_id),
    })
    if not own_doc:
        raise ValueError("Member not found")
    if str(own_doc["userId"]) == target_user_id:
        raise ValueError("You're always included in your own inner circle -- no need to add yourself")

    target_membership = await get_membership_for_user(league_season_id, target_user_id)
    if not target_membership or target_membership.status != "active":
        raise ValueError("That person isn't an active member of this league")

    await db[Collections.LEAGUE_MEMBERSHIPS].update_one(
        {"_id": ObjectId(member_id), "leagueSeasonId": ObjectId(league_season_id)},
        {"$addToSet": {"innerCircleUserIds": ObjectId(target_user_id)}},
    )


async def remove_from_inner_circle(league_season_id: str, member_id: str, target_user_id: str) -> None:
    """NEW, no TS twin. Caller-ownership of `member_id` is enforced by the
    router before this is called. Silently no-ops if target_user_id wasn't
    in the circle."""
    db = get_database()
    await db[Collections.LEAGUE_MEMBERSHIPS].update_one(
        {"_id": ObjectId(member_id), "leagueSeasonId": ObjectId(league_season_id)},
        {"$pull": {"innerCircleUserIds": ObjectId(target_user_id)}},
    )
