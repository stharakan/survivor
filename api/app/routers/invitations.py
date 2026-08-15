"""Rank 6 -- invitation routes. Port of
app/api/invitations/[invitationId]/route.ts,
app/api/invite/[token]/accept/route.ts, app/api/invite/[token]/route.ts, and
app/api/leagues/[leagueId]/invitations/route.ts
(CR-105-FINDINGS.md Table 1, 6.7-6.10)."""
from datetime import datetime

from fastapi import APIRouter, Request

from app.core.auth_deps import verify_auth_token
from app.core.responses import ApiError, ok
from app.db.invitations import (
    accept_invitation,
    create_league_invitation,
    get_invitation_by_token,
    get_invitation_league_season_id,
    get_league_invitations,
    revoke_invitation,
)
from app.db.memberships import get_membership_for_user
from app.models.requests import AcceptInvitationRequest, CreateInvitationRequestBody

router = APIRouter(tags=["invitations"])


@router.delete("/api/invitations/{invitation_id}")
async def delete_invitation(invitation_id: str, request: Request) -> dict:
    """Port of app/api/invitations/[invitationId]/route.ts:6-46 DELETE.

    BUG FIX (Table 1 6.7): the TS original's own code comment admits "For
    simplicity, we'll allow any authenticated user for now" -- any logged-in
    user could revoke ANY league's invitations. Fixed here to require the
    caller be an admin of the league that actually owns the invitation.
    """
    auth_user = await verify_auth_token(request)

    league_id = await get_invitation_league_season_id(invitation_id)
    if league_id is None:
        raise ApiError("Invitation not found", 404)

    membership = await get_membership_for_user(league_id, auth_user.user_id)
    if not membership or not membership.isAdmin:
        raise ApiError("Admin access required", 403)

    success = await revoke_invitation(invitation_id)
    if not success:
        raise ApiError("Invitation not found", 404)
    return ok(message="Invitation revoked successfully")


@router.post("/api/invite/{token}/accept")
async def accept_invitation_route(token: str, body: AcceptInvitationRequest, request: Request) -> dict:
    """Port of app/api/invite/[token]/accept/route.ts:6-56 POST."""
    auth_user = await verify_auth_token(request)

    result = await accept_invitation(token, auth_user.user_id, body.teamName)
    if not result["success"]:
        raise ApiError(result["error"], 400)

    membership = result["membership"]
    return ok(membership.model_dump(), message="Successfully joined league")


@router.get("/api/invite/{token}")
async def get_invite(token: str) -> dict:
    """Port of app/api/invite/[token]/route.ts:5-25 GET -- intentionally public."""
    invitation = await get_invitation_by_token(token)
    if not invitation:
        raise ApiError("Invitation not found", 404)
    return ok(invitation.model_dump())


@router.get("/api/leagues/{league_id}/invitations")
async def list_league_invitations(league_id: str, request: Request) -> dict:
    """Port of app/api/leagues/[leagueId]/invitations/route.ts:8-50 GET (admin only)."""
    auth_user = await verify_auth_token(request)

    membership = await get_membership_for_user(league_id, auth_user.user_id)
    if not membership or not membership.isAdmin:
        raise ApiError("Admin access required", 403)

    invitations = await get_league_invitations(league_id)
    return ok([i.model_dump() for i in invitations])


@router.post("/api/leagues/{league_id}/invitations")
async def create_league_invitation_route(league_id: str, body: CreateInvitationRequestBody, request: Request) -> dict:
    """Port of app/api/leagues/[leagueId]/invitations/route.ts:52-106 POST (admin only)."""
    auth_user = await verify_auth_token(request)

    membership = await get_membership_for_user(league_id, auth_user.user_id)
    if not membership or not membership.isAdmin:
        raise ApiError("Admin access required", 403)

    expires_at = datetime.fromisoformat(body.expiresAt.replace("Z", "+00:00")) if body.expiresAt else None
    invitation = await create_league_invitation(league_id, auth_user.user_id, body.maxUses, expires_at)
    return ok(invitation.model_dump(), message="Invitation created successfully")
