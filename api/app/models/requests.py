"""Request-body models for Phase 2's routes. Port of the relevant `zod`
schemas in lib/api-types.ts, as Pydantic models (FastAPI's native validation
layer) instead -- same validation rules, enforced the idiomatic way for this
stack rather than porting `zod` itself.
"""
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    """Port of loginSchema (lib/api-types.ts:24-27)."""

    email: EmailStr
    password: str = Field(min_length=6)


class RegisterRequest(BaseModel):
    """Port of registerSchema (lib/api-types.ts:29-37)."""

    email: EmailStr
    password: str = Field(min_length=6)
    confirmPassword: str = Field(min_length=6)
    displayName: Optional[str] = Field(default=None, max_length=12)

    @field_validator("confirmPassword")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Passwords don't match")
        return v


class CreateLeagueRequest(BaseModel):
    """Port of createLeagueSchema (lib/api-types.ts:39-46)."""

    name: str = Field(min_length=1)
    description: str = Field(min_length=1)
    sportsLeague: str = Field(min_length=1)
    season: str = Field(min_length=1)
    isPublic: bool = False
    requiresApproval: bool = True


class UpdateLeagueRequest(BaseModel):
    """Port of the ad hoc whitelist PATCH /leagues/[leagueId] applies
    (app/api/leagues/[leagueId]/route.ts:85-92) -- all fields optional, only
    provided ones are applied."""

    name: Optional[str] = None
    description: Optional[str] = None
    logo: Optional[str] = None
    sportsLeague: Optional[str] = None
    isPublic: Optional[bool] = None
    requiresApproval: Optional[bool] = None
    hideScoreboard: Optional[bool] = None


class UpdateUserRequest(BaseModel):
    """Port of the inline validation in PATCH /users/[userId]
    (app/api/users/[userId]/route.ts:57-74)."""

    name: Optional[str] = Field(default=None, max_length=12)


class UpdateMemberRequest(BaseModel):
    """Port of updateMemberSchema (lib/api-types.ts:58-62)."""

    isPaid: Optional[bool] = None
    isAdmin: Optional[bool] = None
    teamName: Optional[str] = Field(default=None, min_length=1, max_length=100)


class CreatePickRequest(BaseModel):
    """Port of the POST /picks body (app/api/picks/route.ts:46), MINUS `userId`
    -- the picks privacy/authz fix (CR-105-FINDINGS.md Addendum 2, non-negotiable)
    means the acting user always comes from the verified JWT, never a
    client-supplied field. See routers/picks.py."""

    leagueSeasonId: str  # was leagueId
    gameId: int
    teamId: int
    week: int


class GenerateResetLinkRequest(BaseModel):
    """Port of the `{ leagueId }` body read at
    app/api/admin/users/[userId]/generate-reset-link/route.ts:33."""

    leagueSeasonId: str  # was leagueId


class AddInnerCircleMemberRequest(BaseModel):
    """Body for POST .../members/{member_id}/inner-circle (NEW, no TS twin)."""

    userId: str


class CreateLeagueSeasonRequest(BaseModel):
    """Body for POST /api/admin/create-season (SUR-010 Stage D)."""

    leagueId: str
    newSeason: str = Field(min_length=1)


class AcceptInvitationRequest(BaseModel):
    """Port of acceptInvitationSchema (lib/api-types.ts:78-80)."""

    teamName: str = Field(min_length=1)


class CreateInvitationRequestBody(BaseModel):
    """Port of createInvitationSchema (lib/api-types.ts:73-76)."""

    maxUses: Optional[int] = Field(default=None, gt=0)
    expiresAt: Optional[str] = None


class CompletePasswordResetRequestBody(BaseModel):
    """Port of completePasswordResetSchema (app/api/reset-password/[token]/route.ts:10-16)."""

    newPassword: str = Field(min_length=6)
    confirmPassword: str = Field(min_length=1)

    @field_validator("confirmPassword")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if "newPassword" in info.data and v != info.data["newPassword"]:
            raise ValueError("Passwords don't match")
        return v
