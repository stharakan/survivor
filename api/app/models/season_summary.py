"""Port of types/season-summary.ts. Confirmed-accurate per CR-105-FINDINGS.md
Table 4 -- all four PrizeType literals and both PrizeWinner/FinalStanding shapes
match lib/db.ts:1830-1885 (getSeasonSummary) field-for-field."""
from typing import List, Literal, Optional

from pydantic import BaseModel

PrizeType = Literal["first_place", "second_place", "longest_survivor", "highest_total_points"]


class PrizeWinner(BaseModel):
    prize: PrizeType
    prizeName: str
    icon: str
    userId: str
    playerName: str
    stat: str
    payout: Optional[str] = None


class FinalStanding(BaseModel):
    rank: int
    userId: str
    playerName: str
    pointsAtElimination: int
    totalPoints: int
    strikes: int
    weekEliminated: Optional[int] = None


class SeasonSummary(BaseModel):
    isLeagueEnded: bool
    prizes: List[PrizeWinner]
    standings: List[FinalStanding]
