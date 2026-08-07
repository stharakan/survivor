"""NEW module, Phase 2 -- builds the `PlayerProfile` model (app/models/player_profile.py,
shipped in Phase 1) for real. Table 3 item 4 (CR-105-FINDINGS.md) named
`getPlayerProfile` (lib/api-client.ts:263-264) as a stub that always throws --
`app/player/[id]/page.tsx` calls it on every page load, so the player-profile
page is broken for every user today. Disposition was "build-for-real", not
drop; there is no TS `lib/db.ts` function to port (none exists), so this is a
genuinely new read, sized against the same page's actual rendering needs
Phase 1 sized the model against.

Privacy note (Addendum 2): this is the PUBLIC half of the profile/picks split.
Any active member of a league may look up any other active member's profile
here -- name, team name, points, strikes, rank, season length. Pick HISTORY is
NOT included (see app/models/player_profile.py's docstring) and must only ever
be served by the picks endpoints' self-only check (app/routers/picks.py).
"""
from typing import Optional

from app.db.auth import get_user_by_id
from app.db.memberships import get_membership_for_user
from app.db.mongodb import get_database, Collections
from app.models.player_profile import PlayerProfile


async def _total_weeks_in_season(sports_league: str, season: str) -> Optional[int]:
    """Season length isn't stored anywhere on `League` -- the TS page instead
    hardcoded `38` (app/player/[id]/page.tsx:135,138). Computed here from the
    actual fixture list instead of carrying the hardcode forward, per Phase 1's
    "build it for real" judgment call on this model (flagged in
    CR-105-PHASE1-REPORT.md, not yet reversed by Addendum 2). Returns None if
    no fixtures exist yet for the league's sport/season (matches the model's
    `Optional[int] = None`)."""
    db = get_database()
    result = await db[Collections.GAMES].aggregate([
        {"$match": {"sportsLeague": sports_league, "season": season}},
        {"$group": {"_id": None, "maxWeek": {"$max": "$week"}}},
    ]).to_list(length=1)
    return result[0]["maxWeek"] if result else None


async def get_player_profile(league_id: str, user_id: str) -> Optional[PlayerProfile]:
    """Returns None if the target user has no (any-status) membership in this
    league -- callers (routers/results.py) turn that into a 404, matching the
    TS page's own "player not found -> redirect" behavior
    (app/player/[id]/page.tsx:38-44)."""
    membership = await get_membership_for_user(league_id, user_id)
    if membership is None:
        return None

    user = await get_user_by_id(user_id)
    # Same "TeamName (UserName)" display convention as results.py's
    # _base_player, for consistency between the scoreboard and this profile
    # (the TS page instead hardcoded a literal "Tharakan Warriors" team-name
    # label -- app/player/[id]/page.tsx:111 -- which was never real data; not
    # carried forward).
    display_name = f"{membership.teamName} ({user.name})" if user and user.name else membership.teamName

    total_weeks = await _total_weeks_in_season(membership.league.sportsLeague, membership.league.season)

    return PlayerProfile(
        id=user_id,
        name=display_name,
        teamName=membership.teamName,
        points=membership.points,
        strikes=membership.strikes,
        rank=membership.rank,
        totalWeeksInSeason=total_weeks,
    )
