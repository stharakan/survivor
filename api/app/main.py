"""FastAPI application entrypoint.

Phase 1 (CR-105) scope: project skeleton + Pydantic models + lib/db.ts/scoring.ts/
game-updater.ts port only. No routes are wired up yet -- that's Phase 2
(CR-105-FINDINGS.md's "Blocks" list). This file exists so `uvicorn app.main:app`
runs something, and so Phase 2 has a place to `app.include_router(...)` into, in
the same Rank 1-7 order as CR-105-FINDINGS.md Table 1 (auth -> leagues ->
memberships -> games -> picks -> invitations -> scoring/results).
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db.mongodb import close_client, get_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Touch the client on startup so a bad/missing MONGODB_URI fails fast instead
    # of on the first request.
    get_client()
    yield
    close_client()


app = FastAPI(
    title="Survivor League API",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
