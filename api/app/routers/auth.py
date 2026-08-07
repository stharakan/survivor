"""Rank 1 -- auth routes. Port of app/api/auth/{login,logout,register,verify}/
route.ts (CR-105-FINDINGS.md Table 1, 1.6-1.9)."""
from fastapi import APIRouter, Request, Response

from app.core.auth_deps import verify_auth_token
from app.core.config import AUTH_COOKIE_MAX_AGE, AUTH_COOKIE_NAME
from app.core.responses import ApiError, ok
from app.core.security import create_access_token
from app.db.auth import create_user, get_user_by_email, get_user_by_id, update_user, verify_password
from app.models.requests import LoginRequest, RegisterRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_auth_cookie(response: Response, token: str) -> None:
    """Port of the `Set-Cookie: auth-token=...; HttpOnly; Path=/; Max-Age=...;
    SameSite=Lax` header set identically in login/register
    (app/api/auth/login/route.ts:32-35)."""
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        path="/",
        max_age=AUTH_COOKIE_MAX_AGE,
        samesite="lax",
    )


@router.post("/login")
async def login(body: LoginRequest, response: Response) -> dict:
    """Port of app/api/auth/login/route.ts:6-40."""
    user = await verify_password(body.email, body.password)
    if not user:
        raise ApiError("Invalid email or password", 401)

    token = create_access_token(user.id, user.email)
    _set_auth_cookie(response, token)
    return ok({"user": user.model_dump(), "token": token}, message="Login successful")


@router.post("/logout")
async def logout(response: Response) -> dict:
    """Port of app/api/auth/logout/route.ts:1-22."""
    response.delete_cookie(key=AUTH_COOKIE_NAME, path="/", samesite="lax")
    return ok(message="Logout successful")


@router.post("/register")
async def register(body: RegisterRequest, response: Response) -> dict:
    """Port of app/api/auth/register/route.ts:6-49."""
    existing_user = await get_user_by_email(body.email)
    if existing_user:
        raise ApiError("An account with this email already exists", 400)

    user = await create_user(body.email, body.password)

    if body.displayName and body.displayName.strip():
        updated = await update_user(user.id, name=body.displayName.strip())
        if updated:
            user = updated

    token = create_access_token(user.id, user.email)
    _set_auth_cookie(response, token)
    return ok({"user": user.model_dump(), "token": token}, message="Registration successful")


@router.get("/verify")
async def verify(request: Request) -> dict:
    """Port of app/api/auth/verify/route.ts:6-45."""
    auth_user = await verify_auth_token(request)
    user = await get_user_by_id(auth_user.user_id)
    if not user:
        raise ApiError("User not found", 404)
    return ok({"user": user.model_dump()}, message="Token valid")
