"""Tundra Connection — FastAPI application entrypoint.

Spec: Orquestor.md §FASE 1 + SECURITY_RULES.md
- R8  CORS estricto: allow_origins=[FRONTEND_URL], no "*" con credentials
- R11 Security headers en cada respuesta
- R12 Rate limiting (slowapi) montado a nivel de app
- R13 Logging estructurado
- R17 redirect_slashes=False — los prefijos NO llevan "/" final
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1 import auth as auth_router
from app.api.v1 import catalog as catalog_router
from app.api.v1 import invoices as invoices_router
from app.api.v1 import services as services_router
from app.core.config import settings
from app.core.limiter import limiter
from app.core.logging_config import configure_logging

configure_logging()
logger = logging.getLogger("tundra.app")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Startup/shutdown hooks. DB engine se gestiona en core.database."""
    logger.info(
        "tundra.startup environment=%s frontend=%s",
        settings.ENVIRONMENT,
        settings.FRONTEND_URL,
    )
    yield
    logger.info("tundra.shutdown")


app = FastAPI(
    title="Tundra Connection API",
    version="1.0.0",
    description="Plataforma B2B/B2C de telecomunicaciones — backend FastAPI.",
    redirect_slashes=False,  # R17
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None,
)

# ── Rate limiting (R12) ──────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── Security headers (R11) ───────────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inserta cabeceras de seguridad en TODAS las respuestas."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=()"
        )
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)

# ── CORS (R8) ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    expose_headers=["X-Request-Id"],
    max_age=600,
)


# ── Global error handler ─────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Captura cualquier excepción no controlada sin filtrar tracebacks al cliente."""
    logger.exception(
        "tundra.unhandled path=%s method=%s error=%s",
        request.url.path,
        request.method,
        type(exc).__name__,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "tundra-connection", "version": "1.0.0"}


# ── Routers v1 (R17: prefijos sin "/" final) ─────────────────────────────────
app.include_router(auth_router.router, prefix="/auth", tags=["auth"])
app.include_router(catalog_router.public_router, prefix="/catalog", tags=["catalog"])
app.include_router(
    catalog_router.admin_router,
    prefix="/admin/catalog",
    tags=["catalog-admin"],
)
app.include_router(
    services_router.public_router,
    prefix="/services",
    tags=["services"],
)
app.include_router(invoices_router.router, prefix="/invoices", tags=["invoices"])
