"""Rank 5 -- picks routes. Port of app/api/picks/route.ts and
app/api/picks/remaining/route.ts (CR-105-FINDINGS.md Table 1, 5.4-5.5), with
the CR-105-FINDINGS.md Addendum 2 PICKS PRIVACY BOUNDARY (non-negotiable item)
applied to all three routes below: **requester must equal the queried user**.
The TS originals trusted a client-supplied `user_id`/`userId` with zero
verification -- this is the real fix for that gap, enforced as an actual
authorization check on every request, not a convention the frontend happens
to follow (per the Addendum's explicit wording).
"""
from bson import ObjectId
from fastapi import APIRouter, Request

from app.core.auth_deps import require_league_paid, require_self, verify_auth_token
from app.core.responses import ApiError, ok
from app.db.games import get_all_teams, get_game_time_info_by_id
from app.db.leagues import get_league_by_id
from app.db.picks import create_pick, get_user_pick_for_week, get_user_picks_by_league
from app.models.requests import CreatePickRequest
from app.utils.game_utils import are_picks_locked, can_change_existing_pick, can_pick_from_game, has_gameweek_started

router = APIRouter(prefix="/api/picks", tags=["picks"])


def _require_valid_league_id(league_id: str) -> None:
    if not ObjectId.is_valid(league_id):
        raise ApiError("Invalid league ID format", 400)


@router.get("")
async def list_picks(user_id: str, league_id: str, request: Request) -> dict:
    """Port of app/api/picks/route.ts:7-41 GET. FIXED per Addendum 2: self-only."""
    auth_user = await verify_auth_token(request)
    await require_self(auth_user, user_id, "Unauthorized: you can only view your own picks")
    _require_valid_league_id(league_id)

    picks = await get_user_picks_by_league(user_id, league_id)
    return ok([p.model_dump() for p in picks])


@router.post("")
async def create_pick_route(body: CreatePickRequest, request: Request) -> dict:
    """Port of app/api/picks/route.ts:43-137 POST.

    FIXED per Addendum 2 / Table 1 5.4: the TS original read `userId` straight
    out of the request body with no auth check whatsoever -- anyone could
    submit a pick as any other user. The acting user is now always the
    JWT-verified caller; there is no `userId` field on `CreatePickRequest` at
    all (see app/models/requests.py), so there's nothing to spoof.

    The pick-lock validation sequence below (existing pick -> gameweek-started
    check -> game-time check -> change-vs-first-pick branching) is otherwise
    an unchanged port of the TS route's own logic, now calling the Python
    game_utils port (app/utils/game_utils.py) instead of lib/game-utils.ts.

    DEVIATION (no TS equivalent, not a bug carried forward): the TS original
    had no membership check on this route at all, paid or otherwise -- an
    authenticated user could POST a pick into a league they'd never joined.
    `require_league_paid` closes that gap and additionally blocks members an
    admin has marked unpaid (`isPaid` on `LeagueMembership`) from submitting
    picks.
    """
    _require_valid_league_id(body.leagueId)

    auth_user = await require_league_paid(request, body.leagueId)
    user_id = auth_user.user_id

    league = await get_league_by_id(body.leagueId)
    if not league:
        raise ApiError("League not found", 404)

    existing_pick = await get_user_pick_for_week(user_id, body.leagueId, body.week)

    gameweek_started = has_gameweek_started(league.model_dump(), body.week)
    picks_locked = are_picks_locked(bool(existing_pick), gameweek_started)

    if picks_locked:
        raise ApiError(
            "Picks are locked because the gameweek has started and you already have a pick for this week", 400
        )

    game_time_info = await get_game_time_info_by_id(body.gameId)
    if not game_time_info:
        raise ApiError("Game not found", 404)

    if existing_pick:
        if not can_change_existing_pick(existing_pick.game.model_dump()):
            raise ApiError("Cannot change pick because your selected game has already started", 400)

    if gameweek_started and not existing_pick:
        if not can_pick_from_game(game_time_info):
            raise ApiError(
                "Cannot pick from this game because it has already started. During an active gameweek, "
                "you can only pick from games that haven't started yet.",
                400,
            )
    else:
        if not can_pick_from_game(game_time_info):
            raise ApiError("Pick failed because game has already started", 400)

    try:
        pick = await create_pick(user_id, body.leagueId, body.gameId, body.teamId, body.week)
    except ValueError as e:
        # Covers the new CR-106 AC7 team-reuse-limit check as well as the
        # pre-existing "Game or team not found" case -- both used to fall
        # through to the generic 500 handler with no message; matches the
        # ValueError -> ApiError(400) convention used elsewhere in this file
        # (e.g. the pick-lock checks above) and in app/routers/members.py.
        raise ApiError(str(e), 400)
    return ok(pick.model_dump())


@router.get("/remaining")
async def picks_remaining(user_id: str, league_id: str, request: Request) -> dict:
    """Port of app/api/picks/remaining/route.ts:6-47. FIXED per Addendum 2: self-only."""
    auth_user = await verify_auth_token(request)
    await require_self(auth_user, user_id, "Unauthorized: you can only view your own picks remaining")

    teams = await get_all_teams()
    user_picks = await get_user_picks_by_league(user_id, league_id)

    picks_remaining_data = []
    for team in teams:
        pick_count = sum(1 for p in user_picks if p.team.id == team.id)
        # Survivor league rule: each team may be picked at most twice.
        picks_remaining_data.append({"team": team.model_dump(), "remaining": max(0, 2 - pick_count)})

    return ok(picks_remaining_data)
