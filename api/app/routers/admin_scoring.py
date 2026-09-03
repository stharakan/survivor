"""Rank 7 -- admin scoring/game-update trigger routes. Port of
app/api/admin/recompute-scores/route.ts and
app/api/admin/update-game-scores/route.ts (CR-105-FINDINGS.md Table 1,
7.8-7.9). API-key gated (X-API-Key header), not JWT -- these are cron/remote
triggers, not browser-session routes.
"""
from fastapi import APIRouter, Request

from app.core.auth_deps import require_scoring_api_key
from app.core.responses import ok
from app.db.league_seasons import create_league_season
from app.models.requests import CreateLeagueSeasonRequest

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/create-season")
async def create_season_route(body: CreateLeagueSeasonRequest, request: Request) -> dict:
    """SUR-010 Stage D: create a new LeagueSeason under an existing parent League.
    Carries over active memberships with isPaid reset to False."""
    await require_scoring_api_key(request)
    season = await create_league_season(body.leagueId, body.newSeason)
    return ok(season.model_dump(), message="League season created successfully")
