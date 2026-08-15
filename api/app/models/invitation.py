"""Port of types/invitation.ts. Confirmed-accurate per CR-105-FINDINGS.md Table 4;
`InvitationWithLeague` and `InvitationAcceptanceInfo` were flagged there as
lower-confidence / "recommend a spot-check" rather than fully re-verified --
spot-checked here against the actual assembly sites (lib/db.ts:1408-1430,
lib/db.ts:1468-1486) during this port.

DEVIATION found during that spot-check: `creator.username` is declared as a
required `string` in both TS shapes, but the `users` collection never actually has
a `username` field -- `createUser`/`updateUser` (lib/db.ts) only ever write
`email`/`name`. A strict required-string model would raise a ValidationError on
every real invitation row. Modeled as `Optional[str] = None` here instead of
porting the (currently silently-`undefined`, uncaught-by-`ignoreBuildErrors`) TS
type as-is.
"""
from typing import Optional

from pydantic import BaseModel


class LeagueInvitation(BaseModel):
    id: str
    leagueSeasonId: str  # was leagueId
    token: str
    createdBy: str
    maxUses: Optional[int] = None
    currentUses: int
    expiresAt: Optional[str] = None
    isActive: bool
    createdAt: str
    updatedAt: str


class InvitationLeagueSummary(BaseModel):
    id: str
    name: str
    description: str
    sportsLeague: str
    memberCount: int


class InvitationCreatorSummary(BaseModel):
    id: str
    username: Optional[str] = None  # DEVIATION: see module docstring


class InvitationWithLeague(LeagueInvitation):
    league: InvitationLeagueSummary
    creator: InvitationCreatorSummary


class CreateInvitationRequest(BaseModel):
    maxUses: Optional[int] = None
    expiresAt: Optional[str] = None


class InvitationAcceptanceInfoInvitation(BaseModel):
    id: str
    token: str
    isValid: bool
    isExpired: bool
    isAtMaxUses: bool


class InvitationAcceptanceInfoCreator(BaseModel):
    username: Optional[str] = None  # DEVIATION: see module docstring


class InvitationAcceptanceInfo(BaseModel):
    invitation: InvitationAcceptanceInfoInvitation
    league: InvitationLeagueSummary
    creator: InvitationAcceptanceInfoCreator
