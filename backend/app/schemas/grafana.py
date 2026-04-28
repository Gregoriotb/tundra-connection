"""Grafana schemas — Pydantic v2 (FASE 9).

Spec:
- Orquestor.md §FASE 9
- R2 extra="forbid" en inputs
- R9 Validación server-side de URL y UID
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


# ─── Bases ────────────────────────────────────────────────────────────────


class _InputBase(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _OutputBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ─── Inputs ───────────────────────────────────────────────────────────────


class GrafanaDashboardCreateIn(_InputBase):
    """POST /admin/grafana — registra un dashboard."""

    name: str = Field(..., min_length=2, max_length=255)
    uid: str = Field(..., min_length=1, max_length=100)
    url_embed: HttpUrl
    variables: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    display_order: int = Field(default=0, ge=0, le=999)

    @field_validator("uid")
    @classmethod
    def _uid_charset(cls, v: str) -> str:
        # Grafana UIDs son alfanuméricos + guiones/underscores.
        if not all(c.isalnum() or c in "-_" for c in v):
            raise ValueError("UID must be alphanumeric (with -/_ allowed)")
        return v


class GrafanaDashboardUpdateIn(_InputBase):
    """PATCH /admin/grafana/{id} — campos parciales."""

    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    url_embed: Optional[HttpUrl] = None
    variables: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = Field(default=None, ge=0, le=999)


# ─── Outputs ──────────────────────────────────────────────────────────────


class GrafanaDashboardOut(_OutputBase):
    id: UUID
    name: str
    uid: str
    url_embed: str
    variables: dict[str, Any]
    is_active: bool
    display_order: int
    created_at: datetime


class GrafanaDashboardListOut(BaseModel):
    items: list[GrafanaDashboardOut]
    total: int
