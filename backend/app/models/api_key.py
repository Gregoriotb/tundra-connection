"""ApiKey model — credenciales para integraciones externas (X-API-Key).

Spec:
- DATABASE_SCHEMA.md §API KEYS — mirror del DDL
- Orquestor.md §FASE 8 + R3 (auth dual JWT/API-Key)
- R5 ORM puro
- R16 PK UUID

Nota crítica de seguridad:
- `key_hash` es SHA-256 hex (64 chars) — la BD NUNCA tiene la clave en
  claro. El plain solo se devuelve UNA VEZ al crear (admin lo copia).
- Generación y hashing centralizados en `core.security.generate_api_key`.

Estructura `scopes` (JSONB array):
    ["read", "write", "admin"]   — granularidad por feature en futuro.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UUIDPKMixin
from app.models.user import User

API_KEY_VALID_SCOPES: tuple[str, ...] = ("read", "write", "admin")


class ApiKey(Base, UUIDPKMixin):
    """API key emitida por un admin para integraciones externas."""

    __tablename__ = "api_keys"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    key_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    scopes: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, server_default='["read"]'
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # ── Relaciones ──────────────────────────────────────────────────────────
    user: Mapped[User] = relationship("User", lazy="joined")

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        from datetime import timezone

        return datetime.now(timezone.utc) >= self.expires_at

    @property
    def is_usable(self) -> bool:
        return self.is_active and not self.is_expired

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<ApiKey id={self.id} user_id={self.user_id} "
            f"name={self.name!r} active={self.is_active}>"
        )
