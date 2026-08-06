"""NEW model, not in types/ (CR-105-FINDINGS.md Addendum, "Picks-remaining" gap):
`GET /api/picks/remaining` (app/api/picks/remaining/route.ts:26-33) returns an
anonymous inline `{ team: Team, remaining: number }[]` today, with no name
anywhere in types/. Named here so Phase 2 has a real contract instead of porting
an untyped shape.
"""
from pydantic import BaseModel

from app.models.team import Team


class TeamPicksRemaining(BaseModel):
    team: Team
    remaining: int
