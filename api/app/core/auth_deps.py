"""Port of lib/auth-utils.ts (CR-105-FINDINGS.md Table 1, Rank 3's "heaviest
auth file in the surface", 3.9) plus the cookie/JWT extraction every TS route
inlines directly at its own call site (e.g. app/api/leagues/route.ts:10-20).

STATUS-CODE POLICY DEVIATION (flagged, not silent): the TS routes each
re-derive an HTTP status from the *message text* of a thrown `Error`, via ad
hoc `.includes(...)` checks repeated (slightly differently) at every call
site -- e.g. app/api/leagues/[leagueId]/members/[memberId]/route.ts:77-82
(PATCH) vs. :159-160 (DELETE) match different substrings for the same
`validateAdminPermission` failures. One concrete bug this produces: DELETE's
`verifyAuthToken` call (route.ts:144) is *not* wrapped in its own try/catch,
so an unauthenticated DELETE falls through to the outer `handleApiError`,
which doesn't recognize a plain `Error` and returns 500 -- an unauthenticated
request gets treated as a server error instead of 401. This port does not
replicate that: every raise site below carries its own correct status code at
the moment it's raised (`ApiError(message, status_code)`), so 401/403/400/404
are consistent across every route that reuses these helpers, and the
DELETE-route masking bug specifically cannot recur. Not one of the two bugs
this ticket named for the port (Pick draw-handling, League id/createdBy
typing) -- flagged here as an additional judgment call, per the working
agreement.
"""
from dataclasses import dataclass
from typing import Optional

from fastapi import Request

from app.core.config import AUTH_COOKIE_NAME, SCORING_API_KEY
from app.core.responses import ApiError
from app.core.security import JWTError, decode_access_token
from app.db.auth import get_user_by_id
from app.db.memberships import get_league_member, get_membership_for_user
from app.db.mongodb import get_database
from app.models.league import LeagueMembership
from app.models.user import User


@dataclass
class AuthUser:
    """Port of lib/auth-utils.ts:8-11's `AuthUser` type."""

    user_id: str
    email: str


@dataclass
class AuthorizationContext:
    """Port of lib/auth-utils.ts:13-17's `AuthorizationContext` type."""

    user: User
    membership: Optional[LeagueMembership]
    is_admin: bool


def _extract_token(request: Request) -> Optional[str]:
    """Port of `request.cookies.get('auth-token')?.value`, the pattern
    repeated at every TS auth call site (lib/auth-utils.ts:23 and every route
    that inlines its own cookie read instead of importing verifyAuthToken).

    DEVIATION (additive, does not change the cookie path): also accepts
    `Authorization: Bearer <token>` as a fallback, since a non-browser client
    (tests, curl, a future mobile client) has no cookie jar the way a browser
    does. The frontend continues to rely solely on the cookie, exactly as
    before.
    """
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if token:
        return token
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:]
    return None


async def verify_auth_token(request: Request) -> AuthUser:
    """Port of lib/auth-utils.ts:22-35 `verifyAuthToken`. Always raises 401 on
    any failure -- see module docstring for why that's a deliberate
    consistency fix over the TS call sites' varied handling."""
    token = _extract_token(request)
    if not token:
        raise ApiError("Authentication required", 401)
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise ApiError("Invalid authentication token", 401)
    return AuthUser(user_id=payload["userId"], email=payload["email"])


async def get_authorization_context(user_id: str, league_id: str) -> AuthorizationContext:
    """Port of lib/auth-utils.ts:40-57 `getAuthorizationContext`."""
    user = await get_user_by_id(user_id)
    if user is None:
        raise ApiError("User not found", 404)
    membership = await get_membership_for_user(league_id, user_id)
    return AuthorizationContext(
        user=user, membership=membership, is_admin=bool(membership and membership.isAdmin)
    )


async def validate_admin_permission(
    requesting_user_id: str,
    league_id: str,
    target_member_id: str,
    new_admin_status: Optional[bool] = None,
) -> None:
    """Port of lib/auth-utils.ts:127-163 `validateAdminPermission`."""
    requesting_auth = await get_authorization_context(requesting_user_id, league_id)

    if not requesting_auth.membership:
        raise ApiError("You are not a member of this league", 403)
    if not requesting_auth.is_admin:
        raise ApiError("Only league administrators can modify member admin status", 403)

    if new_admin_status is not None:
        target_member = await get_league_member(league_id, target_member_id)
        if not target_member:
            raise ApiError("Target member not found", 404)

        if requesting_auth.membership.id == target_member_id and not new_admin_status:
            raise ApiError("You cannot remove your own admin privileges", 403)

        if target_member.league.createdBy == target_member.user and not new_admin_status:
            raise ApiError("Cannot remove admin privileges from league creator", 403)


async def log_admin_privilege_change(
    requesting_user_id: str,
    league_id: str,
    target_member_id: str,
    old_admin_status: bool,
    new_admin_status: bool,
    additional_context: Optional[dict] = None,
) -> None:
    """Port of lib/auth-utils.ts:168-209 `logAdminPrivilegeChange`. Best-effort:
    a logging failure must never break the caller's real operation, same as
    the TS original's own try/except around the `audit_logs` insert."""
    if old_admin_status == new_admin_status:
        return

    from datetime import datetime, timezone

    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": "admin_privilege_change",
        "requestingUserId": requesting_user_id,
        "leagueId": league_id,
        "targetMemberId": target_member_id,
        "changes": {"isAdmin": {"from": old_admin_status, "to": new_admin_status}},
        "context": additional_context,
    }
    try:
        db = get_database()
        await db["audit_logs"].insert_one(log_entry)
    except Exception:  # noqa: BLE001 - audit logging failure shouldn't break the main operation
        pass


async def authorize_request(
    request: Request, league_id: str, member_id: str, updates: dict
) -> AuthorizationContext:
    """Port of lib/auth-utils.ts:214-232 `authorizeRequest` -- the complete
    authorization check for `PATCH /leagues/{leagueId}/members/{memberId}`."""
    auth_user = await verify_auth_token(request)
    auth_context = await get_authorization_context(auth_user.user_id, league_id)

    if isinstance(updates.get("isAdmin"), bool):
        await validate_admin_permission(auth_user.user_id, league_id, member_id, updates["isAdmin"])

    return auth_context


async def require_league_membership(request: Request, league_id: str) -> AuthUser:
    """Port of lib/auth-utils.ts:238-259 `verifyLeagueMembership` -- used by
    every league-scoped GET route (members, results, scoreboard,
    season-summary, the league detail route itself)."""
    auth_user = await verify_auth_token(request)
    auth_context = await get_authorization_context(auth_user.user_id, league_id)

    if not auth_context.membership:
        raise ApiError("You are not a member of this league", 403)

    if auth_context.membership.status and auth_context.membership.status != "active":
        raise ApiError("Your membership in this league is not active", 403)

    return auth_user


async def require_scoring_api_key(request: Request) -> None:
    """Port of validateApiKey(), duplicated identically in
    app/api/admin/recompute-scores/route.ts:9-22 and
    app/api/admin/update-game-scores/route.ts:8-21 -- factored into one place
    here rather than copy-pasted twice, same underlying check."""
    api_key = request.headers.get("x-api-key")
    if not SCORING_API_KEY or not api_key or api_key != SCORING_API_KEY:
        raise ApiError("Invalid or missing API key", 401)


async def require_self(auth_user: AuthUser, target_user_id: str, message: str) -> None:
    """Shared helper for the self-only ownership checks this phase adds --
    both the PICKS PRIVACY BOUNDARY (CR-105-FINDINGS.md Addendum 2, the
    non-negotiable item) and the two Table 1 "no ownership check" bugs (1.10's
    GET /users/[userId], 1.11's GET /users/[userId]/leagues). PATCH
    /users/[userId] already had this exact check in TS
    (app/api/users/[userId]/route.ts:50-55); the others are new, per the
    Addendum's "not a convention the frontend happens to follow" directive.
    """
    if auth_user.user_id != target_user_id:
        raise ApiError(message, 403)
