"""Rank 7 -- admin scoring/game-update trigger routes. Port of
app/api/admin/recompute-scores/route.ts and
app/api/admin/update-game-scores/route.ts (CR-105-FINDINGS.md Table 1,
7.8-7.9). API-key gated (X-API-Key header), not JWT -- these are cron/remote
triggers, not browser-session routes.
"""
from dataclasses import asdict

from fastapi import APIRouter, Request

from app.core.auth_deps import require_scoring_api_key
from app.core.responses import ok
from app.db.game_updater import update_game_scores
from app.db.scoring import run_scoring_calculation

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/recompute-scores")
async def recompute_scores(request: Request) -> dict:
    """Port of app/api/admin/recompute-scores/route.ts:37-64."""
    await require_scoring_api_key(request)
    result = await run_scoring_calculation()
    return ok(asdict(result), message="Scoring calculation completed successfully")


@router.post("/update-game-scores")
async def update_game_scores_route(request: Request) -> dict:
    """Port of app/api/admin/update-game-scores/route.ts:36-63."""
    await require_scoring_api_key(request)
    result = await update_game_scores()
    return ok(result, message="Game score update completed successfully")
