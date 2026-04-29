"""User model.

Spec:
- DATABASE_SCHEMA.md §USERS (mirror exacto del DDL)
- Orquestor.md §Modelo de dominio · User
- R3 hashed_password puede ser NULL (cuentas Google-only)
- R15 NO usar atributo `metadata` — Base lo reserva
- R16 PK UUID consistente con services
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDPKMixin


class AccountType(str, enum.Enum):
    """Tipo de cuenta. Aplicado server-side via CHECK constraint."""

    EMPRESA = "empresa"
    PARTICULAR = "particular"


class User(Base, UUIDPKMixin):
    """Usuario del sistema (cliente o admin).

    `hashed_password` es NULLABLE porque cuentas creadas vía Google OAuth
    no tienen password local hasta que el usuario lo configure.
    """

    __tablename__ = "users"

    # ── Auth ────────────────────────────────────────────────────────────────
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    # ── Perfil ──────────────────────────────────────────────────────────────
    account_type: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    rif_cedula: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # ── Dirección ───────────────────────────────────────────────────────────
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    zip_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # ── Multimedia / OAuth ──────────────────────────────────────────────────
    profile_photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    google_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )

    # ── Flags ───────────────────────────────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    # ── Timestamps ──────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # ── Constraints (mirror del DDL) ────────────────────────────────────────
    __table_args__ = (
        CheckConstraint(
            "account_type IN ('empresa', 'particular') OR account_type IS NULL",
            name="users_account_type_check",
        ),
    )

    # ── Helpers ─────────────────────────────────────────────────────────────
    @property
    def full_name(self) -> str:
        parts = [p for p in (self.first_name, self.last_name) if p]
        return " ".join(parts) if parts else self.email

    @property
    def has_completed_onboarding(self) -> bool:
        """True si el usuario tiene los campos mínimos para operar."""
        return bool(
            self.account_type
            and self.first_name
            and self.last_name
            and self.phone
        )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User id={self.id} email={self.email} admin={self.is_admin}>"
