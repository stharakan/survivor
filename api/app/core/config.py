"""Phase 2 config -- mirrors the env vars the TS routes read directly
(`process.env.JWT_SECRET`, `process.env.SCORING_API_KEY`,
`process.env.NEXTAUTH_URL`), centralized instead of re-reading `os.environ` at
every call site.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load env files into the process environment. Resolved via __file__ (not
# cwd) so this works whether uvicorn is launched from `api/` (the
# Procfile/README's documented cwd) or elsewhere -- same reasoning as
# main.py's FRONTEND_DIR. override=False on both calls, and api/.env loaded
# first, so precedence is: real env vars (Heroku config vars, CI secrets, an
# inline `MONGODB_URI=... uv run ...`) > api/.env > repo-root .env.local.
# .env.local is loaded too because MONGODB_URI/MONGODB_DB_NAME are shared
# with the Next.js app and documented as living there (root CLAUDE.md) --
# without this a dev needs the same values pasted into both files. Both
# calls are no-ops if their file doesn't exist (e.g. prod).
_API_DIR = Path(__file__).resolve().parents[2]
load_dotenv(_API_DIR / ".env", override=False)
load_dotenv(_API_DIR.parent / ".env.local", override=False)

# Matches every TS route's `process.env.JWT_SECRET || 'fallback-secret'`
# fallback exactly (app/api/auth/login/route.ts:23`, etc.) -- same insecure
# default preserved for parity with the app already running in production on
# it. Flagged, not silently fixed: a real deployment must set JWT_SECRET.
JWT_SECRET = os.environ.get("JWT_SECRET", "fallback-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_DAYS = 7

AUTH_COOKIE_NAME = "auth-token"
AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # seconds, matches login/register routes

# Used by POST /admin/recompute-scores and /admin/update-game-scores
# (X-API-Key header check), matching app/api/admin/*/route.ts's
# validateApiKey().
SCORING_API_KEY = os.environ.get("SCORING_API_KEY")

# Used to build the password-reset magic link, matching
# app/api/admin/users/[userId]/generate-reset-link/route.ts:120.
NEXTAUTH_URL = os.environ.get("NEXTAUTH_URL", "http://localhost:3000")
