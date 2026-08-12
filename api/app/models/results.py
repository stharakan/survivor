"""Not one of the 23 `types/` exports (CR-105-FINDINGS.md Table 4) -- lib/db.ts's
`getLeagueResults` (lib/db.ts:1582-1594) types its own return shape inline
(`ResultsData`) rather than exporting it from `types/`. Modeled here for parity
since this port needs a typed return value; an addition beyond the official
Table 4 list, not a contradiction of it.

SUR-008: added `"dnp"` to `UserWeekPick.result`. Not called out by SUR-008's own
file list, but required for the same reason as `GameUserPick.result` (see
app/models/game.py) -- `get_league_results` (app/db/results.py) reads a pick's
raw `result` field straight into this model for every week up to
`last_completed_week`, and a postponed game's week can now legitimately be
`<= last_completed_week` (see game_updater.py's `_calculate_last_completed_week`
exclusion) while a pick within it holds `"dnp"`. Without this, that pick would
raise a `ValidationError` the first time a DNP week is queried.
"""
from typing import List, Literal, Optional

from pydantic import BaseModel


class UserWeekPick(BaseModel):
    week: int
    teamName: str
    result: Optional[Literal["win", "loss", "draw", "dnp"]] = None


class UserResults(BaseModel):
    id: str
    name: str
    picks: List[UserWeekPick]


class ResultsData(BaseModel):
    users: List[UserResults]
    completedWeeks: List[int]
