"""Port of types/player.ts. Confirmed-accurate per CR-105-FINDINGS.md Table 4 --
matches the object literal assembled at lib/db.ts:1220-1227 / :1284-1291 exactly."""
from typing import Optional

from pydantic import BaseModel


class Player(BaseModel):
    id: str
    name: str
    points: int
    strikes: int
    rank: int
    weeklyPick: Optional[str] = None
    isAI: bool = False  # NEW, no TS twin -- see User.isAI; drives the scoreboard's Bot badge
