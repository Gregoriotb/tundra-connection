"""Settings centralizadas (Pydantic v2).

Spec: Orquestor.md §FASE 1, plantilla de variables de entorno.md, R9 (validación server-side).

Toda variable de entorno del proyecto se declara aquí. Importar desde:
    from app.core.config import settings
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "staging", "production"]


class Settings(BaseSettings):
    """Variables de entorno tipadas. Cualquier valor faltante en prod = fail-fast."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Core ────────────────────────────────────────────────────────────────
    ENVIRONMENT: Environment = "development"
    SECRET_KEY: str = Field(..., min_length=64)
    FRONTEND_URL: str = "http://localhost:5173"

    # ── Database (R18: pool params se aplican en core/database.py) ──────────
    DATABASE_URL: str = Field(..., min_length=10)

    # ── JWT ─────────────────────────────────────────────────────────────────
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24h
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Google OAuth (FASE 7) ───────────────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"

    # ── ImgBB (R6: fallback local) ──────────────────────────────────────────
    IMGBB_API_KEY: str = ""
    UPLOAD_LOCAL_DIR: str = "/app/uploads"
    UPLOAD_MAX_SIZE_MB: int = 10

    # ── Grafana (FASE 9) ────────────────────────────────────────────────────
    GRAFANA_URL: str = ""
    GRAFANA_SERVICE_ACCOUNT_TOKEN: str = ""

    # ── Email / Resend (FASE 10) ────────────────────────────────────────────
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@tundraconnection.com"

    # ── Rate limiting (R12) ─────────────────────────────────────────────────
    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_REGISTER: str = "3/minute"
    RATE_LIMIT_DEFAULT: str = "60/minute"

    # ── Logging ─────────────────────────────────────────────────────────────
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # ── Validators ──────────────────────────────────────────────────────────
    @field_validator("SECRET_KEY")
    @classmethod
    def _secret_not_default(cls, v: str) -> str:
        if "change-me" in v.lower() or "tu-clave" in v.lower():
            # Permitido en development pero advertido — fail-hard solo en prod (validado abajo).
            return v
        return v

    @field_validator("FRONTEND_URL")
    @classmethod
    def _frontend_url_no_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/")

    def assert_production_safe(self) -> None:
        """Llamar al arrancar en prod. Lanza si hay configuración insegura."""
        if self.ENVIRONMENT != "production":
            return
        problems: list[str] = []
        if "change-me" in self.SECRET_KEY.lower() or "tu-clave" in self.SECRET_KEY.lower():
            problems.append("SECRET_KEY usa valor de ejemplo")
        if not self.GOOGLE_CLIENT_ID or not self.GOOGLE_CLIENT_SECRET:
            problems.append("Google OAuth credenciales vacías")
        if not self.RESEND_API_KEY:
            problems.append("RESEND_API_KEY vacío")
        if self.FRONTEND_URL.startswith("http://"):
            problems.append("FRONTEND_URL no usa HTTPS")
        if problems:
            raise RuntimeError(
                "Configuración insegura para producción: " + "; ".join(problems)
            )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Carga única (cacheada). Usar `settings` para uso normal."""
    s = Settings()  # type: ignore[call-arg]
    s.assert_production_safe()
    return s


settings: Settings = get_settings()
