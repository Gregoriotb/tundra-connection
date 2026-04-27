"""SQLAlchemy 2.0 — engine, session, Base declarativa.

Spec:
- Orquestor.md §FASE 1
- R5  SQL injection proof: ORM obligatorio, nunca f-strings
- R15 `metadata` es palabra reservada de Base — usar message_metadata / extra_data
- R18 Pool para Neon serverless: QueuePool + pool_pre_ping=True + pool_recycle=300

Uso típico:
    from app.core.database import Base, get_db
    Base = declarative_base()  # NO — ya está exportada aquí
"""

from __future__ import annotations

from typing import Generator
from uuid import UUID, uuid4

from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    sessionmaker,
)
from sqlalchemy.pool import QueuePool

from app.core.config import settings

# ── Engine (R18) ─────────────────────────────────────────────────────────────

engine = create_engine(
    settings.DATABASE_URL,
    poolclass=QueuePool,
    pool_pre_ping=True,       # R18: verifica liveness antes de servir conexión
    pool_recycle=300,         # R18: recicla cada 5 min (Neon cierra idle)
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    echo=settings.ENVIRONMENT == "development" and False,  # toggleable
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
)


# ── Base declarativa (SQLAlchemy 2.0) ────────────────────────────────────────


class Base(DeclarativeBase):
    """Base declarativa común. Todos los modelos heredan de aquí.

    R15: NO definir un atributo `metadata` en modelos hijos — está reservado.
         Para columnas tipo metadata usar `message_metadata` o `extra_data`.
    """


# ── Mixin de PK UUID (R16) ───────────────────────────────────────────────────


class UUIDPKMixin:
    """PK UUID v4. Compartido por todos los modelos (incluido service_catalog → R16)."""

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        nullable=False,
    )


# ── Dependency injection (FastAPI) ───────────────────────────────────────────


def get_db() -> Generator[Session, None, None]:
    """Dependency que abre/cierra una sesión por request.

    Uso:
        @router.get("/...")
        def handler(db: Session = Depends(get_db)): ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


__all__ = ["Base", "UUIDPKMixin", "SessionLocal", "engine", "get_db"]
