"""Port of lib/db.ts League membership operations (Rank 3 -- CR-105-FINDINGS.md
Table 1, 3.1-3.7)."""
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from app.db.leagues import get_league_by_id
from app.db.mongodb import get_database, Collections
from app.db._shape import league_from_doc, to_iso
from app.models.league import LeagueMembership, LeagueMembershipWithUserDetails, UserSummary

_UNSET = object()


def _membership_from_agg(doc: dict) -> LeagueMembership:
    return LeagueMembership(
        id=str(doc["_id"]),
        league=league_from_doc(doc["league"]),
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
    league_id: str, user_id: str, team_name: str, is_admin: bool = False
) -> LeagueMembership:
    """Port of lib/db.ts:294-338."""
    db = get_database()
    result = await db[Collections.LEAGUE_MEMBERSHIPS].insert_one({
        "leagueId": ObjectId(league_id),
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
    })

    await db[Collections.LEAGUES].update_one({"_id": ObjectId(league_id)}, {"$inc": {"memberCount": 1}})

    league = await get_league_by_id(league_id)
    if league is None:
        # Mirrors the TS original's blind `league!` non-null assertion -- if the
        # league vanished between the $inc above and this read, that's a real
        # data-integrity problem worth a loud failure, not a silent None.
        raise ValueError("League not found immediately after membership creation")

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
        {"$lookup": {"from": Collections.LEAGUES, "localField": "leagueId", "foreignField": "_id", "as": "league"}},
        {"$unwind": "$league"},
    ]).to_list(length=None)
    return [_membership_from_agg(doc) for doc in docs]


async def get_league_members(league_id: str) -> list[LeagueMembership]:
    """Port of lib/db.ts:389-436."""
    db = get_database()
    docs = await db[Collections.LEAGUE_MEMBERSHIPS].aggregate([
        {"$match": {"leagueId": ObjectId(league_id)}},
        {"$lookup": {"from": Collections.LEAGUES, "localField": "leagueId", "foreignField": "_id", "as": "league"}},
        {"$unwind": "$league"},
    ]).to_list(length=None)
    return [_membership_from_agg(doc) for doc in docs]


async def get_league_members_with_user_data(league_id: str) -> list[LeagueMembershipWithUserDetails]:
    """Port of lib/db.ts:438-497.

    NOTE: the TS original's inline `league` sub-shape here (lib/db.ts:466-478)
    omits `hideScoreboard`/`current_game_week`/`current_pick_week`/
    `last_completed_week` -- every OTHER League-returning function in lib/db.ts
    includes them. That's an existing inconsistency in the TS source, not a
    deliberate difference this port preserves: it reuses the same shared
    `league_from_doc` helper as everywhere else, so the League here is always
    fully populated. No caller was relying on those fields being absent
    specifically from this one call site (they'd just read as `undefined` in TS
    vs. `None`/`False` here).
    """
    db = get_database()
    docs = await db[Collections.LEAGUE_MEMBERSHIPS].aggregate([
        {"$match": {"leagueId": ObjectId(league_id)}},
        {"$lookup": {"from": Collections.LEAGUES, "localField": "leagueId", "foreignField": "_id", "as": "league"}},
        {"$lookup": {"from": Collections.USERS, "localField": "userId", "foreignField": "_id", "as": "userDetails"}},
        {"$unwind": "$league"},
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


async def get_league_member(league_id: str, member_id: str) -> Optional[LeagueMembership]:
    """Port of lib/db.ts:499-556."""
    db = get_database()
    docs = await db[Collections.LEAGUE_MEMBERSHIPS].aggregate([
        {"$match": {"_id": ObjectId(member_id), "leagueId": ObjectId(league_id)}},
        {"$lookup": {"from": Collections.LEAGUES, "localField": "leagueId", "foreignField": "_id", "as": "league"}},
        {"$unwind": "$league"},
    ]).to_list(length=1)
    if not docs:
        return None
    return _membership_from_agg(docs[0])


async def get_membership_for_user(league_id: str, user_id: str) -> Optional[LeagueMembership]:
    """NEW in Phase 2 -- port of lib/auth-utils.ts's private
    `getUserLeagueMembership` helper (lib/auth-utils.ts:62-122), which the TS
    app inlines its own raw aggregation + manual object-shaping for rather than
    reusing lib/db.ts's `getLeagueMember` (that one looks up by membership
    `_id`, not by `userId`+`leagueId`). Needed by Phase 2's authorization
    context (`app/core/auth_deps.py::get_authorization_context`) -- the Python
    equivalent of `verifyAuthToken`+`getAuthorizationContext`'s membership
    lookup. Reuses the shared `_membership_from_agg`/`league_from_doc` shaping
    instead of re-duplicating the TS original's second, slightly different
    inline object literal (lib/auth-utils.ts:92-117) -- same underlying shape,
    factored through the one helper already used everywhere else in this
    module, not a behavior change.
    """
    db = get_database()
    docs = await db[Collections.LEAGUE_MEMBERSHIPS].aggregate([
        {"$match": {"userId": ObjectId(user_id), "leagueId": ObjectId(league_id)}},
        {"$lookup": {"from": Collections.LEAGUES, "localField": "leagueId", "foreignField": "_id", "as": "league"}},
        {"$unwind": "$league"},
        {"$limit": 1},
    ]).to_list(length=1)
    if not docs:
        return None
    return _membership_from_agg(docs[0])


async def update_member_status(
    league_id: str,
    member_id: str,
    *,
    is_paid=_UNSET,
    is_admin=_UNSET,
    team_name=_UNSET,
) -> None:
    """Port of lib/db.ts:558-599. Raises ValueError on the same validation
    failures the TS throws on (empty/duplicate team name) -- callers (Phase 2
    routes) should catch and translate to an HTTP 400, same as today."""
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
            "leagueId": ObjectId(league_id),
            "teamName": trimmed,
            "_id": {"$ne": ObjectId(member_id)},
        })
        if existing:
            raise ValueError("Team name is already taken in this league")

        update_doc["teamName"] = trimmed

    await db[Collections.LEAGUE_MEMBERSHIPS].update_one(
        {"_id": ObjectId(member_id), "leagueId": ObjectId(league_id)},
        {"$set": update_doc},
    )


async def remove_member_from_league(league_id: str, member_id: str, removed_by: str) -> None:
    """Port of lib/db.ts:601-643. Soft-deletes (marks inactive) rather than
    actually deleting, matching the TS original."""
    db = get_database()
    existing_member = await db[Collections.LEAGUE_MEMBERSHIPS].find_one({
        "_id": ObjectId(member_id), "leagueId": ObjectId(league_id),
    })
    if not existing_member:
        raise ValueError("Member not found")
    if not existing_member["isActive"]:
        raise ValueError("Member is already inactive")

    await db[Collections.LEAGUE_MEMBERSHIPS].update_one(
        {"_id": ObjectId(member_id), "leagueId": ObjectId(league_id)},
        {"$set": {
            "isActive": False,
            "status": "removed",
            "removedAt": datetime.now(timezone.utc),
            "removedBy": ObjectId(removed_by),
        }},
    )

    await db[Collections.LEAGUES].update_one({"_id": ObjectId(league_id)}, {"$inc": {"memberCount": -1}})
