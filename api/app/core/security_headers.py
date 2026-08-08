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
"""
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

SECURITY_HEADERS = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "origin-when-cross-origin",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for key, value in SECURITY_HEADERS.items():
            response.headers[key] = value
        return response


__all__ = ["SecurityHeadersMiddleware", "SECURITY_HEADERS"]
