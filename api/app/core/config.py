"""Phase 2 config -- mirrors the env vars the TS routes read directly
(`process.env.JWT_SECRET`, `process.env.SCORING_API_KEY`,
`process.env.NEXTAUTH_URL`), centralized instead of re-reading `os.environ` at
every call site.
"""
import os

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
