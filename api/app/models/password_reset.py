"""Port of types/password-reset.ts. Confirmed-accurate per CR-105-FINDINGS.md
Table 4 -- `PasswordResetToken`/`CreatePasswordResetRequest`/
`CompletePasswordResetRequest` are the best-typed write sites in the codebase
(the route already type-checks its insert against `Omit<PasswordResetToken, 'id'>`).
`PasswordResetTokenWithUser`/`PasswordResetValidationInfo` were flagged as
not-independently-re-verified; same `username` caveat as invitation.py applies to
their nested user/creator summaries, applied here for the same reason.

NOTE: this whole family is a route-level concern (app/api/admin/users/[userId]/
generate-reset-link and app/api/reset-password/[token]), not a lib/db.ts function.
There is no data-access-layer port for it in Phase 1 (see api/README.md) --
these models exist so Phase 2's routes have the contract ready.
"""
from typing import Optional

from pydantic import BaseModel


class PasswordResetToken(BaseModel):
    id: str
    token: str
    userId: str
    createdBy: str
    leagueId: str
    expiresAt: str
    usedAt: Optional[str] = None
    isActive: bool
    createdAt: str
    updatedAt: str


class PasswordResetUserSummary(BaseModel):
    id: str
    username: Optional[str] = None  # DEVIATION: see invitation.py's identical note
    email: str


class PasswordResetCreatorSummary(BaseModel):
    id: str
    username: Optional[str] = None  # DEVIATION: see invitation.py's identical note


class PasswordResetLeagueSummary(BaseModel):
    id: str
    name: str


class PasswordResetTokenWithUser(PasswordResetToken):
    user: PasswordResetUserSummary
    creator: PasswordResetCreatorSummary
    league: PasswordResetLeagueSummary


class CreatePasswordResetRequest(BaseModel):
    userId: str
    leagueId: str


class PasswordResetValidationInfoToken(BaseModel):
    id: str
    token: str
    isValid: bool
    isExpired: bool
    isUsed: bool


class PasswordResetValidationInfo(BaseModel):
    token: PasswordResetValidationInfoToken
    user: PasswordResetUserSummary
    league: PasswordResetLeagueSummary


class CompletePasswordResetRequest(BaseModel):
    newPassword: str
    confirmPassword: str
