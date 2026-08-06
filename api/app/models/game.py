"""Port of types/game.ts. Confirmed-accurate per CR-105-FINDINGS.md Table 4: the
inline `userPick.result` union already correctly included "draw" in the
hand-written TS type -- only `Pick.result` (see pick.py) needed the drift fix.
"""
from typing import Literal, Optional

from pydantic import BaseModel

from app.models.team import Team

GameStatus = Literal["not_started", "in_progress", "completed"]


class GameUserPick(BaseModel):
    """The inline `userPick` shape on types/game.ts:18-24."""

    id: str
    user: str
    team: Team
    result: Optional[Literal["win", "loss", "draw"]] = None
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
    userPick: Optional[GameUserPick] = None
