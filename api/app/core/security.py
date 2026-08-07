"""JWT issuance/verification -- Phase 2's first piece of genuinely new code
(Phase 1 shipped no auth at all, per api/README.md). Port of the
`jsonwebtoken`-based logic inlined in every TS auth route
(app/api/auth/login/route.ts:21-25, .../register/route.ts:29-33,
.../verify/route.ts:19-22) plus lib/auth-utils.ts:22-35's `verifyAuthToken`.

Per CR-105-FINDINGS.md's already-decided auth boundary: FastAPI verifies (and
now issues) JWTs directly for browser routes -- no BFF proxy back to Next.js.
"""
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.core.config import JWT_ALGORITHM, JWT_EXPIRES_DAYS, JWT_SECRET


def create_access_token(user_id: str, email: str) -> str:
    """Port of the `jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' })`
    call repeated in login/register (app/api/auth/login/route.ts:21-25)."""
    expire = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRES_DAYS)
    payload = {"userId": user_id, "email": email, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Port of `jwt.verify(token, JWT_SECRET)`. Raises `jose.JWTError` on any
    invalid/expired/malformed token -- callers (app/core/auth_deps.py) catch
    this and translate to the same 'Invalid authentication token' message
    lib/auth-utils.ts:33 uses."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


__all__ = ["create_access_token", "decode_access_token", "JWTError"]
