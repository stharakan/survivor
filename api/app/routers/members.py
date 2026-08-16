"""Rank 3 -- league membership routes. Port of
app/api/leagues/[leagueId]/members/route.ts and
app/api/leagues/[leagueId]/members/[memberId]/route.ts
(CR-105-FINDINGS.md Table 1, 3.8-3.9)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Request

from app.core.auth_deps import (
    authorize_request,
    log_admin_privilege_change,
    require_league_membership,
    validate_admin_permission,
    verify_auth_token,
)
from app.core.responses import ApiError, ok
from app.db.memberships import (
    add_to_inner_circle,
    get_inner_circle,
    get_league_member,
    get_league_members_with_user_data,
    remove_from_inner_circle,
    remove_member_from_league,
    update_member_status,
)
from app.db.mongodb import get_database
from app.models.requests import AddInnerCircleMemberRequest, UpdateMemberRequest

router = APIRouter(prefix="/api/league-seasons/{league_season_id}/members", tags=["members"])


@router.get("")
async def list_members(league_season_id: str, request: Request) -> dict:
    """Port of app/api/leagues/[leagueId]/members/route.ts:6-32."""
    await require_league_membership(request, league_season_id)
    members = await get_league_members_with_user_data(league_season_id)
    return ok([m.model_dump() for m in members])


@router.get("/{member_id}")
async def get_member(league_season_id: str, member_id: str, request: Request) -> dict:
    """Port of app/api/leagues/[leagueId]/members/[memberId]/route.ts:7-48
    GET -- authenticated only (no membership-of-this-league check in the TS
    original either; preserved as-is, not one of Table 1's named gaps)."""
    await verify_auth_token(request)

    member = await get_league_member(league_season_id, member_id)
    if not member:
        raise ApiError("Member not found", 404)
    return ok(member.model_dump())


@router.patch("/{member_id}")
async def patch_member(league_season_id: str, member_id: str, body: UpdateMemberRequest, request: Request) -> dict:
    """Port of app/api/leagues/[leagueId]/members/[memberId]/route.ts:50-132 PATCH."""
    existing_member = await get_league_member(league_season_id, member_id)
    if not existing_member:
        raise ApiError("Member not found", 404)

    updates = body.model_dump(exclude_unset=True)
    await authorize_request(request, league_season_id, member_id, updates)

    original_admin_status = existing_member.isAdmin

    kwargs = {}
    if "isPaid" in updates:
        kwargs["is_paid"] = updates["isPaid"]
    if "isAdmin" in updates:
        kwargs["is_admin"] = updates["isAdmin"]
    if "teamName" in updates:
        kwargs["team_name"] = updates["teamName"]

    try:
        await update_member_status(league_season_id, member_id, **kwargs)
    except ValueError as e:
        raise ApiError(str(e), 400)

    if isinstance(updates.get("isAdmin"), bool) and updates["isAdmin"] != original_admin_status:
        auth_user = await verify_auth_token(request)
        await log_admin_privilege_change(
            auth_user.user_id,
            league_season_id,
            member_id,
            original_admin_status,
            updates["isAdmin"],
            {
                "requestIP": request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip") or "unknown",
                "userAgent": request.headers.get("user-agent") or "unknown",
            },
        )

    updated_member = await get_league_member(league_season_id, member_id)
    return ok(updated_member.model_dump() if updated_member else None, message="Member updated successfully")


@router.delete("/{member_id}")
async def delete_member(league_season_id: str, member_id: str, request: Request) -> dict:
    """Port of app/api/leagues/[leagueId]/members/[memberId]/route.ts:135-234 DELETE."""
    auth_user = await verify_auth_token(request)

    target_member = await get_league_member(league_season_id, member_id)
    if not target_member:
        raise ApiError("Member not found", 404)

    await validate_admin_permission(auth_user.user_id, league_season_id, member_id)

    if auth_user.user_id == target_member.user:
        raise ApiError("Cannot remove your own membership", 403)

    if target_member.league.createdBy == target_member.user:
        raise ApiError("Cannot remove league creator from league", 403)

    await remove_member_from_league(league_season_id, member_id, auth_user.user_id)

    try:
        db = get_database()
        await db["audit_logs"].insert_one({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": "member_removal",
            "requestingUserId": auth_user.user_id,
            "leagueSeasonId": league_season_id,
            "targetMemberId": member_id,
            "targetMemberTeamName": target_member.teamName,
            "context": {
                "requestIP": request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip") or "unknown",
                "userAgent": request.headers.get("user-agent") or "unknown",
            },
        })
    except Exception:  # noqa: BLE001 - audit logging failure shouldn't break the operation
        pass

    return ok(
        {
            "message": f"{target_member.teamName} has been removed from the league",
            "removedMember": {
                "id": target_member.id,
                "teamName": target_member.teamName,
                "removedAt": datetime.now(timezone.utc).isoformat(),
            },
        },
        message="Member removed successfully",
    )


async def _require_own_membership(league_season_id: str, member_id: str, request: Request):
    """NEW, no TS twin. Shared guard for the inner-circle routes below --
    unlike patch_member/delete_member (admin-editable fields), an inner
    circle is personal: only the member who owns it may ever read or edit
    it, admin or not."""
    auth_user = await verify_auth_token(request)
    existing_member = await get_league_member(league_season_id, member_id)
    if not existing_member:
        raise ApiError("Member not found", 404)
    if existing_member.user != auth_user.user_id:
        raise ApiError("You can only view or edit your own inner circle", 403)
    return existing_member


@router.get("/{member_id}/inner-circle")
async def get_member_inner_circle(league_season_id: str, member_id: str, request: Request) -> dict:
    """NEW, no TS twin. Self-scoped only -- see _require_own_membership."""
    await _require_own_membership(league_season_id, member_id, request)
    circle = await get_inner_circle(league_season_id, member_id)
    return ok([c.model_dump() for c in circle])


@router.post("/{member_id}/inner-circle")
async def add_member_inner_circle(
    league_season_id: str, member_id: str, body: AddInnerCircleMemberRequest, request: Request
) -> dict:
    """NEW, no TS twin. Self-scoped only -- see _require_own_membership."""
    await _require_own_membership(league_season_id, member_id, request)

    try:
        await add_to_inner_circle(league_season_id, member_id, body.userId)
    except ValueError as e:
        raise ApiError(str(e), 400)

    circle = await get_inner_circle(league_season_id, member_id)
    return ok([c.model_dump() for c in circle], message="Added to inner circle")


@router.delete("/{member_id}/inner-circle/{user_id}")
async def remove_member_inner_circle(
    league_season_id: str, member_id: str, user_id: str, request: Request
) -> dict:
    """NEW, no TS twin. Self-scoped only -- see _require_own_membership."""
    await _require_own_membership(league_season_id, member_id, request)

    await remove_from_inner_circle(league_season_id, member_id, user_id)

    circle = await get_inner_circle(league_season_id, member_id)
    return ok([c.model_dump() for c in circle], message="Removed from inner circle")
