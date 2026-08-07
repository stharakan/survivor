"""Rank 1 -- user profile routes. Port of app/api/users/[userId]/route.ts and
app/api/users/[userId]/leagues/route.ts (CR-105-FINDINGS.md Table 1, 1.10-1.11).

Both GET routes below add an authorization check that the TS originals did
NOT have (Table 1 flags both as bugs to fix during the port, not replicate):
1.10 -- GET /users/{userId} had no auth check at all (anyone could fetch any
user's email by guessing/enumerating an id). 1.11 -- GET /users/{userId}/leagues
had the same gap for a user's full league-membership list. Fixed here as
self-only (requester must equal the queried user), matching the same policy
the ticket already mandates for picks (Addendum 2) and that PATCH
/users/[userId] already enforced in the TS original.
"""
from fastapi import APIRouter, Request

from app.core.auth_deps import require_self, verify_auth_token
from app.core.responses import ApiError, ok
from app.db.auth import get_user_by_id, update_user
from app.db.memberships import get_user_league_memberships
from app.models.requests import UpdateUserRequest

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/{user_id}")
async def get_user(user_id: str, request: Request) -> dict:
    """Port of app/api/users/[userId]/route.ts:6-27 GET, WITH the Table 1 1.10
    bug fix: self-only, not public."""
    auth_user = await verify_auth_token(request)
    await require_self(auth_user, user_id, "Unauthorized: can only view your own profile")

    user = await get_user_by_id(user_id)
    if not user:
        raise ApiError("User not found", 404)
    return ok(user.model_dump())


@router.patch("/{user_id}")
async def patch_user(user_id: str, body: UpdateUserRequest, request: Request) -> dict:
    """Port of app/api/users/[userId]/route.ts:29-92 PATCH -- already
    self-only in the TS original, unchanged here.

    DEVIATION: the TS body allows an explicit `null` to clear the name
    (`updates.name = name` when `name !== undefined`, even if `name === null`).
    Pydantic's `Optional[str] = None` can't distinguish "field omitted" from
    "field explicitly null" the way the TS `!== undefined` check can -- both
    collapse to `None` here. Treated as "field omitted" (name left alone) in
    both cases; explicit null-to-clear isn't reachable from this route
    anymore. No known caller relies on clearing the name via `null` today.
    """
    auth_user = await verify_auth_token(request)
    await require_self(auth_user, user_id, "Unauthorized: can only modify your own profile")

    if body.name is not None:
        updated_user = await update_user(user_id, name=body.name)
    else:
        updated_user = await update_user(user_id)
    if not updated_user:
        raise ApiError("User not found", 404)
    return ok(updated_user.model_dump())


@router.get("/{user_id}/leagues")
async def get_user_leagues(user_id: str, request: Request) -> dict:
    """Port of app/api/users/[userId]/leagues/route.ts:6-18, WITH the Table 1
    1.11 bug fix: self-only, not public."""
    auth_user = await verify_auth_token(request)
    await require_self(auth_user, user_id, "Unauthorized: can only view your own league memberships")

    memberships = await get_user_league_memberships(user_id)
    return ok([m.model_dump() for m in memberships])
