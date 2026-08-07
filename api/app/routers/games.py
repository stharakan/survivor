"""Rank 4 -- games route. Port of app/api/games/route.ts
(CR-105-FINDINGS.md Table 1, 4.7).

BUG FIX: the TS original has "no in-route auth at all (middleware-only)" --
Table 1 flags that resolving the SPLIT/UNCLEAR verdict "doesn't fix that gap,
it just relocates it" and directs fixing it during the port. Fixed here as
(1) authentication required, (2) league-membership required (consistent with
every other league-scoped GET route: members, results, scoreboard,
season-summary), and (3) the optional `user_id` query param -- which
determines whose picks get embedded in each `Game.userPick` -- is restricted
to the authenticated user only, same self-only policy as the picks endpoints
(Addendum 2). The TS route trusted a client-supplied `user_id` query param
with zero verification; that's the same class of gap named for
`app/api/picks/route.ts`, just less obviously so since it's embedded in a
`Game` response rather than a `Pick` response.
"""
from fastapi import APIRouter, Request

from app.core.auth_deps import require_league_membership, require_self
from app.core.responses import ok
from app.db.games import get_games_by_week, get_games_by_week_with_picks

router = APIRouter(prefix="/api/games", tags=["games"])


@router.get("")
async def list_games(week: int, league_id: str, request: Request, user_id: str | None = None) -> dict:
    """Port of app/api/games/route.ts:5-39."""
    auth_user = await require_league_membership(request, league_id)

    if user_id:
        await require_self(auth_user, user_id, "Unauthorized: can only view your own picks embedded in games")
        games = await get_games_by_week_with_picks(week, user_id, league_id)
    else:
        games = await get_games_by_week(week, league_id)

    return ok([g.model_dump() for g in games])
