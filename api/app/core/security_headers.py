"""CR-106 AC6 -- port of next.config.mjs's removed `async headers()` block.

Static export (`output: 'export'`, CR-106 AC1) dropped `headers()` entirely --
it needs a Node server to run on and there isn't one in production anymore.
Same three header values, same wildcard scope (every response), just applied
here instead: this runs as ASGI middleware so it wraps both `/api/*` routes
and the static file mount (`app.mount("/", StaticFiles(...))` in main.py),
matching `source: '/(.*)'`'s original blanket coverage.

Values are unchanged from the pre-AC1 config (verified against git history,
commit 5d2725e):
    X-Frame-Options: DENY
    X-Content-Type-Options: nosniff
    Referrer-Policy: origin-when-cross-origin

Also houses CanonicalRedirectMiddleware, which enforces HTTPS and the www
canonical domain in production. Heroku terminates SSL at its edge and sets
X-Forwarded-Proto on every request; that header's presence is used to detect
production (no header = local dev = no redirect).
"""
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response

SECURITY_HEADERS = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "origin-when-cross-origin",
}

CANONICAL_HOST = "www.tharakanbrossurvivor.com"


class CanonicalRedirectMiddleware(BaseHTTPMiddleware):
    """301-redirect HTTP→HTTPS and apex→www in production.

    Only activates when X-Forwarded-Proto is present (i.e. behind Heroku's
    router). Skips /health so Heroku's health checks are never redirected.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        proto = request.headers.get("x-forwarded-proto")
        if proto is None:
            return await call_next(request)

        host = request.headers.get("host", "").split(":")[0]
        needs_https = proto != "https"
        needs_www = host != CANONICAL_HOST

        if (needs_https or needs_www) and request.url.path != "/health":
            url = str(request.url)
            if needs_https:
                url = url.replace("http://", "https://", 1)
            if needs_www:
                url = url.replace(f"://{host}", f"://{CANONICAL_HOST}", 1)
            return RedirectResponse(url, status_code=301)

        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for key, value in SECURITY_HEADERS.items():
            response.headers[key] = value
        return response


__all__ = ["CanonicalRedirectMiddleware", "SecurityHeadersMiddleware", "SECURITY_HEADERS"]
