"""Port of lib/db.ts League invitation operations (Rank 6 -- CR-105-FINDINGS.md
Table 1, 6.1-6.5).

`createInvitationIndexes` is on the CR-105 cut list (identical zero-live-importer
profile to `createGameIndexes` -- a new finding of the CR-105 audit, previously
missing from the dead-code note) and is deliberately NOT ported.

SUR-010: renamed leagueId→leagueSeasonId in all DB queries/inserts; aggregation
pipelines now do a two-hop join (league_invitations → league_seasons → leagues) to
assemble InvitationLeagueSummary. `get_invitation_league_id` renamed to
`get_invitation_league_season_id`.
"""
import secrets
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from app.db.memberships import create_league_membership
from app.db.mongodb import get_database, Collections
from app.db._shape import to_iso
from app.models.invitation import (
    InvitationAcceptanceInfo,
    InvitationAcceptanceInfoCreator,
    InvitationAcceptanceInfoInvitation,
    InvitationCreatorSummary,
    InvitationLeagueSummary,
    InvitationWithLeague,
    LeagueInvitation,
)

# Two-hop join: league_invitations → league_seasons → leagues parent.
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


async def create_league_invitation(
    league_season_id: str, created_by: str, max_uses: Optional[int], expires_at: Optional[datetime]
) -> LeagueInvitation:
    """Port of lib/db.ts:1346-1379. `secrets.token_hex(32)` matches
    `crypto.randomBytes(32).toString('hex')` -- 32 random bytes -> 64 hex chars,
    same entropy and format."""
    db = get_database()
    token = secrets.token_hex(32)
    now = datetime.now(timezone.utc)

    result = await db[Collections.LEAGUE_INVITATIONS].insert_one({
        "leagueSeasonId": ObjectId(league_season_id),
        "token": token,
        "createdBy": ObjectId(created_by),
        "maxUses": max_uses,
        "currentUses": 0,
        "expiresAt": expires_at,
        "isActive": True,
        "createdAt": now,
        "updatedAt": now,
    })

    return LeagueInvitation(
        id=str(result.inserted_id),
        leagueSeasonId=league_season_id,
        token=token,
        createdBy=created_by,
        maxUses=max_uses,
        currentUses=0,
        expiresAt=expires_at.isoformat() if expires_at else None,
        isActive=True,
        createdAt=now.isoformat(),
        updatedAt=now.isoformat(),
    )


async def get_league_invitations(league_season_id: str) -> list[InvitationWithLeague]:
    """Port of lib/db.ts:1381-1431."""
    db = get_database()
    docs = await db[Collections.LEAGUE_INVITATIONS].aggregate([
        {"$match": {"leagueSeasonId": ObjectId(league_season_id)}},
        *_SEASON_JOIN,
        {"$lookup": {"from": Collections.USERS, "localField": "createdBy", "foreignField": "_id", "as": "creator"}},
        {"$unwind": "$creator"},
        {"$sort": {"createdAt": -1}},
    ]).to_list(length=None)

    result = []
    for inv in docs:
        result.append(InvitationWithLeague(
            id=str(inv["_id"]),
            leagueSeasonId=str(inv["leagueSeasonId"]),
            token=inv["token"],
            createdBy=str(inv["createdBy"]),
            maxUses=inv.get("maxUses"),
            currentUses=inv["currentUses"],
            expiresAt=to_iso(inv.get("expiresAt")),
            isActive=inv["isActive"],
            createdAt=to_iso(inv["createdAt"]),
            updatedAt=to_iso(inv["updatedAt"]),
            league=InvitationLeagueSummary(
                id=str(inv["league_season"]["_id"]),
                name=inv["league_parent"]["name"],
                description=inv["league_parent"]["description"],
                sportsLeague=inv["league_parent"]["sportsLeague"],
                memberCount=inv["league_season"]["memberCount"],
            ),
            # `creator.username` doesn't exist on the users collection (see
            # lib/db.ts:1428 -- same gap in the TS original, which reads
            # `inv.creator.username` even though createUser/updateUser never
            # write that field). Carried forward unfixed, per this phase's brief
            # (data-layer port only) -- `.get()` mirrors TS's `undefined` here.
            creator=InvitationCreatorSummary(id=str(inv["creator"]["_id"]), username=inv["creator"].get("username")),
        ))
    return result


async def get_invitation_by_token(token: str) -> Optional[InvitationAcceptanceInfo]:
    """Port of lib/db.ts:1433-1487."""
    db = get_database()
    docs = await db[Collections.LEAGUE_INVITATIONS].aggregate([
        {"$match": {"token": token}},
        *_SEASON_JOIN,
        {"$lookup": {"from": Collections.USERS, "localField": "createdBy", "foreignField": "_id", "as": "creator"}},
        {"$unwind": "$creator"},
        {"$limit": 1},
    ]).to_list(length=1)

    if not docs:
        return None

    inv = docs[0]
    now = datetime.now(timezone.utc)
    expires_at = inv.get("expiresAt")
    is_expired = bool(expires_at and expires_at < now)
    is_at_max_uses = bool(inv.get("maxUses") and inv["currentUses"] >= inv["maxUses"])

    return InvitationAcceptanceInfo(
        invitation=InvitationAcceptanceInfoInvitation(
            id=str(inv["_id"]),
            token=inv["token"],
            isValid=inv["isActive"] and not is_expired and not is_at_max_uses,
            isExpired=is_expired,
            isAtMaxUses=is_at_max_uses,
        ),
        league=InvitationLeagueSummary(
            id=str(inv["league_season"]["_id"]),
            name=inv["league_parent"]["name"],
            description=inv["league_parent"]["description"],
            sportsLeague=inv["league_parent"]["sportsLeague"],
            memberCount=inv["league_season"]["memberCount"],
        ),
        creator=InvitationAcceptanceInfoCreator(username=inv["creator"].get("username")),
    )


async def accept_invitation(token: str, user_id: str, team_name: str) -> dict:
    """Port of lib/db.ts:1489-1539. Returns `{success, membership?, error?}` like
    the TS original rather than raising, since the future Phase 2 route branches
    on `success` to pick an HTTP status/error message."""
    db = get_database()

    invitation = await get_invitation_by_token(token)
    if not invitation:
        return {"success": False, "error": "Invitation not found"}

    if not invitation.invitation.isValid:
        if invitation.invitation.isExpired:
            return {"success": False, "error": "Invitation has expired"}
        if invitation.invitation.isAtMaxUses:
            return {"success": False, "error": "Invitation has reached maximum uses"}
        return {"success": False, "error": "Invitation is no longer valid"}

    existing_membership = await db[Collections.LEAGUE_MEMBERSHIPS].find_one({
        "leagueSeasonId": ObjectId(invitation.league.id),
        "userId": ObjectId(user_id),
    })
    if existing_membership:
        return {"success": False, "error": "You are already a member of this league"}

    membership = await create_league_membership(invitation.league.id, user_id, team_name, False)

    await db[Collections.LEAGUE_INVITATIONS].update_one(
        {"token": token},
        {"$inc": {"currentUses": 1}, "$set": {"updatedAt": datetime.now(timezone.utc)}},
    )

    return {"success": True, "membership": membership}


async def get_invitation_league_season_id(invitation_id: str) -> Optional[str]:
    """NEW in Phase 2 -- needed to fix the Table 1 6.7 authorization gap on
    `DELETE /invitations/{invitationId}`. SUR-010: returns leagueSeasonId."""
    db = get_database()
    doc = await db[Collections.LEAGUE_INVITATIONS].find_one(
        {"_id": ObjectId(invitation_id)}, {"leagueSeasonId": 1}
    )
    if not doc:
        return None
    return str(doc["leagueSeasonId"])


async def revoke_invitation(invitation_id: str) -> bool:
    """Port of lib/db.ts:1541-1555."""
    db = get_database()
    result = await db[Collections.LEAGUE_INVITATIONS].update_one(
        {"_id": ObjectId(invitation_id)},
        {"$set": {"isActive": False, "updatedAt": datetime.now(timezone.utc)}},
    )
    return result.matched_count > 0
