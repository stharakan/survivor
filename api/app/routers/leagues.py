"""Rank 2 -- league routes. Port of app/api/leagues/route.ts and
app/api/leagues/[leagueId]/route.ts (CR-105-FINDINGS.md Table 1, 2.6-2.7).

`DELETE /leagues/{leagueId}` is on the cut list (Table 3 item 9 -- a 501 stub
with zero callers anywhere in lib/api-client.ts) and is deliberately omitted,
not ported as a stub, per the CR-105 decision.
"""
from fastapi import APIRouter, Request

from app.core.auth_deps import require_league_membership, verify_auth_token
from app.core.responses import ApiError, ok
from app.db.league_seasons import get_available_league_seasons, get_league_season_by_id, update_league_season_settings
from app.db.leagues import create_league
from app.db.memberships import get_membership_for_user
from app.models.requests import CreateLeagueRequest, UpdateLeagueRequest

router = APIRouter(prefix="/api/leagues", tags=["leagues"])

# update_league_settings uses snake_case kwargs; the request body (matching
# the TS JSON field names) is camelCase. Small translation table rather than
# a comprehension inlined at the call site.
_LEAGUE_UPDATE_KWARG_NAMES = {
    "sportsLeague": "sports_league",
    "isPublic": "is_public",
    "requiresApproval": "requires_approval",
    "hideScoreboard": "hide_scoreboard",
}


@router.get("")
async def list_leagues(request: Request) -> dict:
    """Port of app/api/leagues/route.ts:7-36 GET."""
    auth_user = await verify_auth_token(request)
    leagues = await get_available_league_seasons(auth_user.user_id)
    return ok([l.model_dump() for l in leagues])


@router.post("")
async def create_league_route(body: CreateLeagueRequest, request: Request) -> dict:
    """Port of app/api/leagues/route.ts:38-85 POST."""
    auth_user = await verify_auth_token(request)
    league = await create_league(
        body.name,
        body.description,
        body.sportsLeague,
        body.season,
        body.isPublic,
        body.requiresApproval,
        auth_user.user_id,
    )
    return ok(league.model_dump(), message="League created successfully")


@router.get("/{league_id}")
async def get_league(league_id: str, request: Request) -> dict:
    """Port of app/api/leagues/[leagueId]/route.ts:10-42 GET."""
    await require_league_membership(request, league_id)

    league = await get_league_season_by_id(league_id)
    if not league:
        raise ApiError("League not found", 404)
    return ok(league.model_dump())


@router.patch("/{league_id}")
async def patch_league(league_id: str, body: UpdateLeagueRequest, request: Request) -> dict:
    """Port of app/api/leagues/[leagueId]/route.ts:45-114 PATCH."""
    auth_user = await verify_auth_token(request)

    membership = await get_membership_for_user(league_id, auth_user.user_id)
    if not membership or not membership.isAdmin:
        raise ApiError("Admin access required", 403)

    updates = body.model_dump(exclude_unset=True)
    kwargs = {_LEAGUE_UPDATE_KWARG_NAMES.get(k, k): v for k, v in updates.items()}
    updated_league = await update_league_season_settings(league_id, **kwargs)
    if not updated_league:
        raise ApiError("League not found", 404)
    return ok(updated_league.model_dump())
