"""NEW model, not in types/ (CR-105-FINDINGS.md Addendum, "Player profile" gap):
`getPlayerProfile` (lib/api-client.ts:263-264) is a stub typed to return `Player`,
but `Player` (player.py) is the thin scoreboard-row shape -- not enough for a
dedicated profile page. This is a genuinely new model (no working TS
implementation exists to diff against), sized against what
app/player/[id]/page.tsx:19-213 actually renders.

DECISION (2026-08-06, reversing the Phase 1 judgment call): `picks` was originally
folded into this response so the page could make one call instead of two. Reversed
-- `PlayerProfile` is a **public** shape any league member can request for any
other member (id/name/teamName/points/strikes/rank/season-progress); a user's pick
history is **private** and must stay behind the ownership check already flagged in
`app/db/picks.py` (`GET /picks` must require requester == queried user, per the
no-auth gap in CR-105-FINDINGS.md 5.4). Embedding `picks` here would have made
every other league member's full pick history visible via the profile endpoint --
exactly the gap that auth check exists to close. Phase 2 routes profile
(open-to-league) and picks (self-only) as two separate, separately-authorized
endpoints; `app/profile/page.tsx` (self) keeps calling both, `app/player/[id]/page.tsx`
(others) calls only the profile one.
"""
from typing import Optional

from pydantic import BaseModel


class PlayerProfile(BaseModel):
    id: str
    name: str
    teamName: str
    points: int
    strikes: int
    rank: int
    totalWeeksInSeason: Optional[int] = None
