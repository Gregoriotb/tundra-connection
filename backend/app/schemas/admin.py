"""Admin schemas — Pydantic v2.

Spec:
- Orquestor.md §FASE 8 + mapa endpoints §Admin + API Keys
- R2 extra="forbid" en inputs
- R9 Validación server-side

Schemas:
    ApiKey:        ApiKeyCreateIn, ApiKeyOut, ApiKeyCreatedOut, ApiKeyListOut
    Export:        ExportAllOut (resumen agregado)
    Stats:         AdminStatsOut (KPIs del dashboard)
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.api_key import API_KEY_VALID_SCOPES

ApiKeyScope = Literal["read", "write", "admin"]


# ─── Bases ────────────────────────────────────────────────────────────────


class _InputBase(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _OutputBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ─── ApiKey Inputs ────────────────────────────────────────────────────────


class ApiKeyCreateIn(_InputBase):
    """POST /admin/api-keys — crea API key nueva.

    El `user_id` por default es el admin que la crea (más común para
    integraciones internas). Si se pasa explícito, debe corresponder a
    un user existente (admin o no — un cliente puede tener su propia
    key para integraciones).
    """

    name: str = Field(..., min_length=3, max_length=100)
    user_id: Optional[UUID] = None
    scopes: list[ApiKeyScope] = Field(
        default_factory=lambda: ["read"],
        min_length=1,
        max_length=3,
    )
    expires_at: Optional[datetime] = Field(
        default=None,
        description="ISO 8601. None = never expires.",
    )

    @field_validator("scopes")
    @classmethod
    def _scopes_unique_and_valid(cls, v: list[str]) -> list[str]:
        if len(v) != len(set(v)):
            raise ValueError("scopes must be unique")
        for s in v:
            if s not in API_KEY_VALID_SCOPES:
                raise ValueError(f"Invalid scope: {s}")
        return v


# ─── ApiKey Outputs ───────────────────────────────────────────────────────


class ApiKeyOut(_OutputBase):
    """Vista pública de una API key (sin la clave en claro)."""

    id: UUID
    user_id: UUID
    name: str
    scopes: list[str]
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    is_active: bool
    created_at: datetime
    # Convenience flag computed por el endpoint:
    is_usable: bool = True


class ApiKeyCreatedOut(BaseModel):
    """Respuesta de POST /admin/api-keys.

    Incluye el `plain_key` que SOLO se muestra UNA VEZ — el frontend
    debe forzar al admin a copiarla porque después solo se ve el hash.
    """

    api_key: ApiKeyOut
    plain_key: str = Field(
        ...,
        description=(
            "Clave en claro. Se muestra UNA SOLA VEZ. "
            "Tras cerrar este modal NO se podrá recuperar."
        ),
    )


class ApiKeyListOut(BaseModel):
    items: list[ApiKeyOut]
    total: int


# ─── Export ───────────────────────────────────────────────────────────────


class ExportAllOut(BaseModel):
    """Respuesta agregada de GET /admin/export-all.

    Resumen de TODAS las entidades del sistema. Útil para backups
    manuales y auditorías rápidas. Para exportes grandes (CSV) se
    implementa endpoint específico en iteración futura.
    """

    generated_at: datetime
    counts: dict[str, int]   # users, catalog_items, services, invoices, etc.
    invoices_total_amount: Decimal
    open_tickets: int
    pending_quotations: int
    active_api_keys: int


# ─── Admin Stats ──────────────────────────────────────────────────────────


class StatsCardOut(BaseModel):
    """Tarjeta de KPI individual (para el dashboard admin)."""

    key: str
    label: str
    value: int | str
    delta_pct: Optional[float] = None  # variación vs período previo
    tone: Literal["neutral", "good", "warn", "danger"] = "neutral"


class AdminStatsOut(BaseModel):
    """Respuesta de GET /admin/stats — para el dashboard inicial."""

    cards: list[StatsCardOut]
    generated_at: datetime
