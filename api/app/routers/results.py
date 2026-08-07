"""Rank 7 -- scoreboard/results/season-summary routes. Port of
app/api/leagues/[leagueId]/{results,scoreboard,season-summary}/route.ts
(CR-105-FINDINGS.md Table 1, 7.10-7.12).

Also hosts the NEW player-profile route (Table 3 item 4, "build-for-real";
Addendum 2's PlayerProfile/picks split): `GET
/leagues/{leagueId}/players/{userId}/profile`. No TS route exists for this --
`getPlayerProfile` was a permanently-throwing stub (lib/api-client.ts:263-264)
that `app/player/[id]/page.tsx` calls on every load, so that page is broken
today. This is a genuinely new route, not a port.
"""
from fastapi import APIRouter, Request

from app.core.auth_deps import require_league_membership
from app.core.responses import ApiError, ok
from app.db.player_profile import get_player_profile
from app.db.results import get_league_results, get_scoreboard_with_picks, get_season_summary

router = APIRouter(prefix="/api/leagues/{league_id}", tags=["results"])


@router.get("/results")
async def league_results(league_id: str, request: Request) -> dict:
    """Port of app/api/leagues/[leagueId]/results/route.ts:6-32."""
    await require_league_membership(request, league_id)
    results_data = await get_league_results(league_id)
    return ok(results_data.model_dump())


@router.get("/scoreboard")
async def league_scoreboard(league_id: str, request: Request) -> dict:
    """Port of app/api/leagues/[leagueId]/scoreboard/route.ts:6-32."""
    await require_league_membership(request, league_id)
    scoreboard_data = await get_scoreboard_with_picks(league_id)
    return ok({
        "players": [p.model_dump() for p in scoreboard_data["players"]],
        "currentGameWeek": scoreboard_data["currentGameWeek"],
    })


@router.get("/season-summary")
async def league_season_summary(league_id: str, request: Request) -> dict:
    """Port of app/api/leagues/[leagueId]/season-summary/route.ts:6-32."""
    await require_league_membership(request, league_id)
    summary_data = await get_season_summary(league_id)
    return ok(summary_data.model_dump())


@router.get("/players/{user_id}/profile")
async def player_profile(league_id: str, user_id: str, request: Request) -> dict:
    """NEW route -- see module docstring. `PlayerProfile` is public within a
    league (Addendum 2): any active member may view any other member's
    profile. Pick HISTORY is explicitly NOT here -- see app/routers/picks.py's
    self-only `GET /picks`, the actual privacy boundary."""
    await require_league_membership(request, league_id)

    profile = await get_player_profile(league_id, user_id)
    if profile is None:
        raise ApiError("Player not found", 404)
    return ok(profile.model_dump())
