"""Port of lib/api-types.ts's response envelope (`ApiResponse<T>`,
`createApiResponse`, `ApiError`, `handleApiError`). Every route in this API
returns the same `{success, data, error, message}` shape the TS routes did, so
the frontend (or a parity-testing harness comparing both backends during the
migration) sees an identical contract.

Deviation from the TS implementation style, not from the contract: the TS
routes each wrap their body in try/except and call `handleApiError(error)` at
the bottom. FastAPI's own exception-handling model does this more idiomatically
via `HTTPException` + a registered handler (`register_exception_handlers`,
called once from main.py) -- routes just `raise ApiError(...)` and this module
formats the same envelope centrally. Observable HTTP behavior (status codes,
body shape) is unchanged; only where the try/except lives moved.
"""
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError


def envelope(success: bool, data: Any = None, error: Optional[str] = None, message: Optional[str] = None) -> dict:
    """Port of createApiResponse (lib/api-types.ts:94-101)."""
    return {"success": success, "data": data, "error": error, "message": message}


def ok(data: Any = None, message: Optional[str] = None) -> dict:
    return envelope(True, data=data, message=message)


class ApiError(Exception):
    """Port of lib/api-types.ts:12-21's `ApiError` class."""

    def __init__(self, message: str, status_code: int = 500, code: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


def register_exception_handlers(app: FastAPI) -> None:
    """Port of handleApiError (lib/api-types.ts:104-125), wired as FastAPI
    exception handlers instead of a per-route try/except -- see module
    docstring."""

    @app.exception_handler(ApiError)
    async def _api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=envelope(False, error=exc.message))

    @app.exception_handler(HTTPException)
    async def _http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        # Catches any plain `HTTPException` (FastAPI's own, or code that raises
        # one directly instead of `ApiError`) and puts it in the same envelope,
        # so no route accidentally leaks FastAPI's default `{"detail": ...}`
        # shape instead of `{success, data, error, message}`.
        return JSONResponse(status_code=exc.status_code, content=envelope(False, error=str(exc.detail)))

    @app.exception_handler(RequestValidationError)
    async def _validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        # Mirrors handleApiError's ZodError branch (lib/api-types.ts:114-119):
        # 400, first-error-message-first, joined by ", ".
        messages = [err["msg"] for err in exc.errors()]
        return JSONResponse(status_code=400, content=envelope(False, error="Validation error: " + ", ".join(messages)))

    @app.exception_handler(ValidationError)
    async def _pydantic_validation_error_handler(_request: Request, exc: ValidationError) -> JSONResponse:
        messages = [err["msg"] for err in exc.errors()]
        return JSONResponse(status_code=400, content=envelope(False, error="Validation error: " + ", ".join(messages)))

    @app.exception_handler(Exception)
    async def _unhandled_error_handler(_request: Request, exc: Exception) -> JSONResponse:
        # Mirrors handleApiError's fallback branch (lib/api-types.ts:121-124):
        # never leak internals, always "Internal server error", 500.
        return JSONResponse(status_code=500, content=envelope(False, error="Internal server error"))
