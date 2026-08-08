"""CR-106 AC6 -- verifies the ASGI middleware (app/core/security_headers.py)
applies the same three headers next.config.mjs's removed `headers()` block
used to set, on both an API response and a response that falls through to
the catch-all/404 path (i.e. the middleware wraps the whole app, not just
the routers).

Uses a bare `TestClient(app)` (no `with` context manager) so the app's
`lifespan` never runs -- `get_client()` requires `MONGODB_URI`, which these
tests have no need for since nothing here touches the database.
"""
from fastapi.testclient import TestClient

from app.core.security_headers import SECURITY_HEADERS
from app.main import app

client = TestClient(app)


def test_health_route_has_security_headers():
    response = client.get("/health")
    assert response.status_code == 200
    for key, value in SECURITY_HEADERS.items():
        assert response.headers[key] == value


def test_unmatched_route_still_has_security_headers():
    # No /out directory in this environment, so this 404s via FastAPI's
    # default handler rather than the static mount/catch-all -- either way,
    # the middleware wraps it since it's registered on the app, not a router.
    response = client.get("/some-nonexistent-path")
    assert response.status_code == 404
    for key, value in SECURITY_HEADERS.items():
        assert response.headers[key] == value
