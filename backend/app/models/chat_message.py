"""ChatMessage model — mensajes dentro de un QuotationThread.

Spec:
- DATABASE_SCHEMA.md §CHAT MESSAGES — mirror del DDL
- Orquestor.md §FASE 4
- R5 ORM puro
- R16 PK UUID

Tipos de mensaje (`message_type`):
  - 'text'       → mensaje normal del usuario o admin
  - 'system'     → mensaje generado por el sistema (cambio de estado, etc.)
  - 'attachment' → mensaje con archivo adjunto en `attachments` JSONB

Estructura de `attachments` JSONB:
[
  {
    "url": "https://imgbb.com/...",
    "filename": "propuesta.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 142000
  }
]
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UUIDPKMixin
from app.models.user import User

CHAT_MESSAGE_TYPES: tuple[str, ...] = ("text", "system", "attachment")


class ChatMessage(Base, UUIDPKMixin):
    """Mensaje individual dentro de un hilo de cotización."""

    __tablename__ = "chat_messages"

    thread_id: Mapped[UUID] = mapped_column(
        ForeignKey("quotation_threads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    message_type: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="text"
    )
    attachments: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,  # ordenar mensajes por timestamp es la query principal
    )

    # ── Relaciones ──────────────────────────────────────────────────────────
    user: Mapped[User] = relationship("User", lazy="joined")
    # NO relationship con `thread` para evitar carga circular accidental.

    __table_args__ = (
        CheckConstraint(
            "message_type IN ('text', 'system', 'attachment')",
            name="chat_messages_message_type_check",
        ),
        CheckConstraint(
            "char_length(content) > 0",
            name="chat_messages_content_non_empty",
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<ChatMessage id={self.id} thread_id={self.thread_id} "
            f"type={self.message_type}>"
        )
