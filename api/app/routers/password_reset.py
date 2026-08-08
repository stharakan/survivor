"""Rank 1 -- admin-controlled password reset. Port of
app/api/admin/users/[userId]/generate-reset-link/route.ts and
app/api/reset-password/[token]/route.ts (CR-105-FINDINGS.md Table 1,
1.12-1.13).

Per api/README.md, this logic lives inline in the TS routes rather than in
lib/db.ts -- there's no data-access-layer module to port from (Phase 1 shipped
only the Pydantic models, app/models/password_reset.py). Ported inline here
too, for the same reason: it's route-level orchestration (token generation,
admin authz, audit logging), not a reusable data-access primitive.
"""
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from bson import ObjectId
from fastapi import APIRouter, Request

from app.core.auth_deps import get_authorization_context, verify_auth_token
from app.core.config import NEXTAUTH_URL
from app.core.responses import ApiError, ok
from app.db.auth import get_user_by_id
from app.db.mongodb import Collections, get_database
from app.models.requests import CompletePasswordResetRequestBody, GenerateResetLinkRequest

router = APIRouter(tags=["password-reset"])


@router.post("/api/admin/users/{user_id}/generate-reset-link")
async def generate_reset_link(user_id: str, body: GenerateResetLinkRequest, request: Request) -> dict:
    """Port of generate-reset-link/route.ts:21-168 POST."""
    auth_user = await verify_auth_token(request)

    if auth_user.user_id == user_id:
        raise ApiError(
            "Cannot generate reset link for your own account. Use account settings instead.", 400
        )

    admin_auth = await get_authorization_context(auth_user.user_id, body.leagueId)
    if not admin_auth.membership:
        raise ApiError("You are not a member of this league", 403)
    if not admin_auth.is_admin:
        raise ApiError("Only league administrators can generate password reset links", 403)

    target_user = await get_user_by_id(user_id)
    if not target_user:
        raise ApiError("Target user not found", 404)

    target_auth = await get_authorization_context(user_id, body.leagueId)
    if not target_auth.membership:
        raise ApiError("Target user is not a member of this league", 403)

    token = secrets.token_hex(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    now = datetime.now(timezone.utc)

    db = get_database()
    result = await db[Collections.PASSWORD_RESET_TOKENS].insert_one({
        "token": token,
        "userId": user_id,
        "createdBy": auth_user.user_id,
        "leagueId": body.leagueId,
        "expiresAt": expires_at,
        "usedAt": None,
        "isActive": True,
        "createdAt": now,
        "updatedAt": now,
    })

    if not result.inserted_id:
        raise ApiError("Failed to create password reset token", 500)

    # CR-106 AC4: query-string route, not a path segment -- static export
    # can't pre-resolve a dynamic path segment for a token that doesn't
    # exist until runtime. See app/reset-password/page.tsx.
    reset_link = f"{NEXTAUTH_URL}/reset-password?token={token}"

    try:
        await db["audit_logs"].insert_one({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": "admin_generate_password_reset_link",
            "userId": auth_user.user_id,
            "targetUserId": user_id,
            "leagueId": body.leagueId,
            "tokenId": str(result.inserted_id),
            "context": {
                "adminEmail": auth_user.email,
                "targetUserEmail": target_user.email,
                "leagueName": admin_auth.membership.league.name,
                "expiresAt": expires_at.isoformat(),
            },
        })
    except Exception:  # noqa: BLE001 - audit logging failure shouldn't break the main operation
        pass

    return ok(
        {"resetLink": reset_link, "userEmail": target_user.email, "expiresAt": expires_at.isoformat()},
        message="Password reset link generated successfully. Share this link with the user.",
    )


@router.get("/api/reset-password/{token}")
async def validate_reset_token(token: str) -> dict:
    """Port of reset-password/[token]/route.ts:24-103 GET -- public."""
    db = get_database()

    reset_token = await db[Collections.PASSWORD_RESET_TOKENS].find_one({"token": token, "isActive": True})
    if not reset_token:
        raise ApiError("Password reset token not found", 404)

    now = datetime.now(timezone.utc)
    is_expired = now > reset_token["expiresAt"]
    is_used = reset_token.get("usedAt") is not None

    user = await db[Collections.USERS].find_one({"_id": ObjectId(reset_token["userId"])})
    if not user:
        raise ApiError("User not found", 404)

    league = await db[Collections.LEAGUES].find_one({"_id": ObjectId(reset_token["leagueId"])})
    if not league:
        raise ApiError("League not found", 404)

    return ok({
        "token": {
            "id": str(reset_token["_id"]),
            "token": reset_token["token"],
            "isValid": not is_expired and not is_used,
            "isExpired": is_expired,
            "isUsed": is_used,
        },
        # NOTE: matches the TS original's own bug -- it reads `user.username`
        # (reset-password/[token]/route.ts:88), a field the `users` collection
        # never has (see app/models/invitation.py's identical, already-flagged
        # `username` deviation). Not fixed here: same class of issue, already
        # recorded once in CR-105-PHASE1-REPORT.md/Addendum 2 as a confirmed
        # drift rather than something to silently patch per-callsite.
        "user": {"id": str(user["_id"]), "username": user.get("username"), "email": user["email"]},
        "league": {"id": str(league["_id"]), "name": league["name"]},
    })


@router.post("/api/reset-password/{token}")
async def complete_reset(token: str, body: CompletePasswordResetRequestBody) -> dict:
    """Port of reset-password/[token]/route.ts:111-246 POST -- public (the
    token itself is the credential)."""
    db = get_database()

    reset_token = await db[Collections.PASSWORD_RESET_TOKENS].find_one({"token": token, "isActive": True})
    if not reset_token:
        raise ApiError("Password reset token not found", 404)

    now = datetime.now(timezone.utc)
    if now > reset_token["expiresAt"]:
        raise ApiError("Password reset token has expired", 400)
    if reset_token.get("usedAt"):
        raise ApiError("Password reset token has already been used", 400)

    user = await db[Collections.USERS].find_one({"_id": ObjectId(reset_token["userId"])})
    if not user:
        raise ApiError("User not found", 404)

    hashed_password = bcrypt.hashpw(body.newPassword.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

    update_result = await db[Collections.USERS].update_one(
        {"_id": ObjectId(reset_token["userId"])},
        {"$set": {"password": hashed_password, "passwordChangedAt": now}},
    )
    if update_result.modified_count == 0:
        raise ApiError("Failed to update password", 500)

    await db[Collections.PASSWORD_RESET_TOKENS].update_one(
        {"_id": reset_token["_id"]},
        {"$set": {"usedAt": now.isoformat(), "isActive": False, "updatedAt": now.isoformat()}},
    )

    try:
        await db["audit_logs"].insert_one({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": "user_password_reset_completed",
            "userId": reset_token["userId"],
            "tokenId": str(reset_token["_id"]),
            "leagueId": reset_token["leagueId"],
            "context": {
                "userEmail": user["email"],
                "resetTokenCreatedBy": reset_token["createdBy"],
            },
        })
    except Exception:  # noqa: BLE001 - audit logging failure shouldn't break the main operation
        pass

    return ok(
        {"message": "Password reset successful"},
        message="Your password has been reset successfully. You can now log in with your new password.",
    )
