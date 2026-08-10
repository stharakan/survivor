"""Port of types/game.ts. Confirmed-accurate per CR-105-FINDINGS.md Table 4: the
inline `userPick.result` union already correctly included "draw" in the
hand-written TS type -- only `Pick.result` (see pick.py) needed the drift fix.

SUR-008: added `"postponed"` to `GameStatus` and `isPostponed`/`originalWeek` to
`Game`. Also added `"dnp"` to `GameUserPick.result` -- not called out by SUR-008's
own file list, but required for correctness: `get_games_by_week_with_picks`
(app/db/games.py) constructs `GameUserPick` straight from a pick document's
`result` field, and postponed-game picks can legitimately hold `"dnp"` once this
ticket lands (see app/db/game_updater.py's postponement handling). Leaving this
Literal unchanged would make that read path raise a `ValidationError` the first
time a user with a DNP pick loads a week containing it -- the exact class of bug
this ticket exists to fix, just relocated.
"""
from typing import Literal, Optional

from pydantic import BaseModel

from app.models.team import Team

GameStatus = Literal["not_started", "in_progress", "completed", "postponed"]


class GameUserPick(BaseModel):
    """The inline `userPick` shape on types/game.ts:18-24."""

    id: str
    user: str
    team: Team
    result: Optional[Literal["win", "loss", "draw", "dnp"]] = None
    week: int


class Game(BaseModel):
    id: int
    week: int
    homeTeam: Team
    awayTeam: Team
    homeScore: Optional[int] = None
    awayScore: Optional[int] = None
    status: GameStatus
    date: str
    startTime: Optional[str] = None  # ISO datetime string for precise game timing
    sportsLeague: str  # e.g. "EPL", "NFL", "NBA"
    season: str  # e.g. "2024/2025", "2025/2026"
    isPostponed: Optional[bool] = None
    originalWeek: Optional[int] = None
    userPick: Optional[GameUserPick] = None
