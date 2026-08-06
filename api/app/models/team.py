"""Port of types/team.ts. Confirmed-accurate, no drift found
(CR-105-FINDINGS.md Table 4) -- ported as-is."""
from pydantic import BaseModel


class Team(BaseModel):
    id: int
    name: str
    abbreviation: str
    logo: str
