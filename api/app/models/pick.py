"""Port of types/pick.ts, WITH the known drift fixed (CR-105-FINDINGS.md Table 4,
Pick row): the TS type declares `result: "win" | "loss" | null`, omitting "draw",
even though lib/scoring.ts's calculatePickResult can and does write "draw" for a
tied completed game. Fixed here rather than ported as-is, per this ticket's own
scope item 4 ("diff each hand-written type against its actual runtime/DB shape").
See app/db/picks.py's create_pick for the matching logic-level fix (the TS
`createPick` never checked for a tie at all).
"""
from typing import Literal, Optional

from pydantic import BaseModel

from app.models.game import Game
from app.models.team import Team


class Pick(BaseModel):
    id: str
    user: str
    game: Game
    team: Team
    result: Optional[Literal["win", "draw", "loss"]] = None  # FIX: was missing "draw"
    week: int
