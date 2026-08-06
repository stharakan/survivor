"""Not one of the 23 `types/` exports (CR-105-FINDINGS.md Table 4) -- lib/db.ts's
`getLeagueResults` (lib/db.ts:1582-1594) types its own return shape inline
(`ResultsData`) rather than exporting it from `types/`. Modeled here for parity
since this port needs a typed return value; an addition beyond the official
Table 4 list, not a contradiction of it.
"""
from typing import List, Literal, Optional

from pydantic import BaseModel


class UserWeekPick(BaseModel):
    week: int
    teamName: str
    result: Optional[Literal["win", "loss", "draw"]] = None


class UserResults(BaseModel):
    id: str
    name: str
    picks: List[UserWeekPick]


class ResultsData(BaseModel):
    users: List[UserResults]
    completedWeeks: List[int]
