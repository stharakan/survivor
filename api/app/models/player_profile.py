"""NEW model, not in types/ (CR-105-FINDINGS.md Addendum, "Player profile" gap):
`getPlayerProfile` (lib/api-client.ts:263-264) is a stub typed to return `Player`,
but `Player` (player.py) is the thin scoreboard-row shape -- not enough for a
dedicated profile page. This is a genuinely new model (no working TS
implementation exists to diff against), sized against what
app/player/[id]/page.tsx:19-213 actually renders.

JUDGMENT CALL (flagged for review -- see tickets/CR-105-PHASE1-REPORT.md): the
page today makes two separate calls (`getPlayerProfile` + `getUserPicks`) and
hardcodes a 38-week season length for a progress bar. This model folds the picks
list into one response (`picks: List[Pick]`) instead of requiring two round-trips,
and adds `totalWeeksInSeason` as a real field instead of a hardcoded `38` -- both
in the spirit of the CR-105 cut-list decision to "build it for real," not just
type the existing (currently broken) two-call shape as-is. Phase 2's route author
should confirm this consolidation before wiring the endpoint.
"""
from typing import List, Optional

from pydantic import BaseModel

from app.models.pick import Pick


class PlayerProfile(BaseModel):
    id: str
    name: str
    teamName: str
    points: int
    strikes: int
    rank: int
    picks: List[Pick] = []
    totalWeeksInSeason: Optional[int] = None
