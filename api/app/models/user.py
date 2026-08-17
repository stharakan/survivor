"""Port of types/user.ts. Confirmed-accurate per CR-105-FINDINGS.md Table 4:
`leagues?: LeagueMembership[]` is correctly optional -- never populated by
lib/db.ts itself (assembled by callers), matches actual usage."""
from typing import List, Optional

from pydantic import BaseModel

from app.models.league import LeagueMembership


class User(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    leagues: Optional[List[LeagueMembership]] = None
    # NEW, no TS twin -- flags an account as an AI-driven team (see
    # api/app/db/ai_teams.py). Defaults False for every normal registration;
    # only ever set True by a deliberate one-off ops update, never via the
    # public register endpoint.
    isAI: bool = False
