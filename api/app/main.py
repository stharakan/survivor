"""FastAPI application entrypoint.

Phase 1 (CR-105) shipped the project skeleton + Pydantic models +
lib/db.ts/scoring.ts/game-updater.ts port, with no routes wired up. Phase 2
adds the full route layer on top of that, in the same Rank 1-7 dependency
order as CR-105-FINDINGS.md Table 1 (auth -> leagues -> memberships -> games
-> picks -> invitations -> scoring/results) -- see tickets/CR-105-PHASE2-REPORT.md.
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

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

# CR-106 AC5 -- the Next.js static export (`npm run build` with
# output:'export' in next.config.mjs) lands in `out/` at the repo root.
# Located relative to this file (not cwd) so it resolves the same whether
# uvicorn is launched from `api/` (the Procfile's cwd) or the repo root.
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "out"


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


# CR-106 AC5 -- serve the static frontend export from the same dyno/origin.
# Must be registered last: FastAPI/Starlette tries routes and mounts in
# registration order, so every `/api/*` router above still gets first crack
# at a request before it can fall through to the catch-all mount below.
if FRONTEND_DIR.is_dir():
    # Any /api/* path that didn't match a router above is a genuine API
    # 404 -- without this, it would otherwise fall through to the static
    # mount and come back as the SPA's out/404.html (an HTML page) instead
    # of a JSON error.
    @app.api_route("/api/{_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    async def api_not_found(_path: str) -> None:
        raise HTTPException(status_code=404, detail="Not found")

    # `html=True` gives Starlette's built-in static-file directory
    # resolution: a request for "/scoreboard" (no trailing slash, e.g. an
    # old bookmark or someone typing the URL) or "/scoreboard/" (how
    # trailingSlash:true makes Next generate every link) both resolve to
    # `out/scoreboard/index.html`, since Next exports each route as its own
    # directory with an index.html (verified against a local `out/` build,
    # not assumed). Anything matching no file/directory falls back to
    # `out/404.html`. No separate SPA-style catch-all needed -- this is a
    # multi-page static export, not a single-shell SPA, so serving every
    # unmatched path the *same* index.html (the classic SPA fallback
    # pattern) would be wrong here.
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
