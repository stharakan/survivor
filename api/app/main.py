"""FastAPI application entrypoint.

Phase 1 (CR-105) shipped the project skeleton + Pydantic models +
lib/db.ts/scoring.ts/game-updater.ts port, with no routes wired up. Phase 2
adds the full route layer on top of that, in the same Rank 1-7 dependency
order as CR-105-FINDINGS.md Table 1 (auth -> leagues -> memberships -> games
-> picks -> invitations -> scoring/results) -- see tickets/CR-105-PHASE2-REPORT.md.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.responses import register_exception_handlers
from app.db.mongodb import close_client, get_client
from app.routers import (
    admin_scoring,
    auth,
    games,
    invitations,
    leagues,
    members,
    password_reset,
    picks,
    results,
    users,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Touch the client on startup so a bad/missing MONGODB_URI fails fast instead
    # of on the first request.
    get_client()
    yield
    close_client()


app = FastAPI(
    title="Survivor League API",
    version="0.2.0",
    lifespan=lifespan,
)

register_exception_handlers(app)

# Rank 1 -- auth
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(password_reset.router)
# Rank 2 -- leagues
app.include_router(leagues.router)
# Rank 3 -- memberships
app.include_router(members.router)
# Rank 4 -- games
app.include_router(games.router)
# Rank 5 -- picks
app.include_router(picks.router)
# Rank 6 -- invitations
app.include_router(invitations.router)
# Rank 7 -- scoring / results
app.include_router(results.router)
app.include_router(admin_scoring.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
