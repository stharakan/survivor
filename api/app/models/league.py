"""Port of types/league.ts. Two fixes applied (CR-105-FINDINGS.md Table 4, League
row -- flagged there as a bigger, more systemic drift than the known Pick.result
case): `id` and `createdBy` are declared `number` in the TS source, but every
actual write/read site in lib/db.ts (`.toString()` on a Mongo ObjectId) produces a
`string`. Fixed here rather than ported as-is.

`JoinRequest` and `SportsLeagueOption` (types/league.ts:37-58) are deliberately NOT
ported -- both dropped per the CR-105 cut-list decision (2026-08-06): registration
is invite-only (no request-to-join flow) and product direction is EPL-only (no
multi-sport picker).
"""
from typing import Literal, Optional

from pydantic import BaseModel


class League(BaseModel):
    id: str  # FIX: types/league.ts:2 declares `number`; actual runtime type is str
    name: str
    description: str
    # NOTE: product direction is EPL-only (CR-105-FINDINGS.md Addendum) -- this
    # field likely collapses to a fixed constant in a later phase. Kept as a plain
    # str for now since that's explicitly a "confirm in Phase 1" open question in
    # the findings, not something this port should preempt.
    sportsLeague: str  # e.g. "EPL"
    logo: Optional[str] = None
    season: str
    isActive: bool
    memberCount: int
    isPublic: bool
    requiresApproval: bool
    hideScoreboard: bool
    createdBy: str  # FIX: types/league.ts:13 declares `number`; actual runtime type is str
    createdAt: str
    current_game_week: Optional[int] = None
    current_pick_week: Optional[int] = None
    last_completed_week: Optional[int] = None


class LeagueParent(BaseModel):
    """Internal model for the `leagues` collection — year-agnostic group identity."""
    id: str
    name: str
    description: str
    sportsLeague: str
    logo: Optional[str] = None
    createdBy: str
    createdAt: str
    currentSeasonId: Optional[str] = None
    pastSeasonIds: list[str] = []


class LeagueSeason(BaseModel):
    """Internal model for the `league_seasons` collection — one year of play."""
    id: str
    leagueId: str
    season: str
    isActive: bool
    memberCount: int
    isPublic: bool
    requiresApproval: bool
    hideScoreboard: bool
    createdAt: str
    current_game_week: Optional[int] = None
    current_pick_week: Optional[int] = None
    last_completed_week: Optional[int] = None


class LeagueMembership(BaseModel):
    id: str
    league: League
    user: str
    teamName: str
    points: int
    strikes: int
    lossStrikes: Optional[int] = None
    missingPickStrikes: Optional[int] = None
    rank: int
    joinedAt: str
    isActive: bool
    isAdmin: bool
    isPaid: bool
    status: Literal["active", "pending", "rejected", "removed"]


class UserSummary(BaseModel):
    """The `{id, email, name}` shape lib/db.ts:491-495 inlines for
    `getLeagueMembersWithUserData`'s `userDetails` field -- deliberately not the
    full `User` model (users.py), which also carries an optional `leagues` list
    that this call site never populates.
    """

    id: str
    email: str
    name: Optional[str] = None


class LeagueMembershipWithUserDetails(LeagueMembership):
    """Port of lib/db.ts's inline `Array<LeagueMembership & { userDetails: User }>`
    return type for `getLeagueMembersWithUserData` -- not one of the 23 named
    `types/` exports (it's an ad hoc TS intersection type), but needed here to
    type this port's return value.
    """

    userDetails: UserSummary


class InnerCircleMember(BaseModel):
    """One entry in a member's personal 'Inner Circle' scoreboard filter
    (NEW, no TS/lib.db.ts twin -- self-service, added post-CR-105). Deliberately
    not merged into LeagueMembership/LeagueMembershipWithUserDetails: those
    are broadcast to every league member via GET .../members, and a user's
    circle is personal, not something to leak to other members via that
    endpoint. Only exposed via the self-scoped .../inner-circle routes."""

    userId: str
    name: str
