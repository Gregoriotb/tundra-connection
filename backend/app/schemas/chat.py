"""Chat schemas — Pydantic v2.

Spec:
- Orquestor.md §FASE 4 + mapa de endpoints §Chat-Cotizaciones
- DATABASE_SCHEMA.md §QUOTATION THREADS + §CHAT MESSAGES
- R2 extra="forbid" en inputs
- R9 Validación server-side
- Sanitización HTML del `content` se hace al crear el mensaje
  (utils.sanitize en FASE 5 cuando lleguen WebSockets; por ahora trim).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal, Optional
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

ThreadEstado = Literal[
    "pending", "active", "quoted", "negotiating", "closed", "cancelled"
]
MessageType = Literal["text", "system", "attachment"]

PrecioField = Annotated[
    Decimal,
    Field(max_digits=10, decimal_places=2, ge=Decimal("0.00")),
]


# ─── Bases ────────────────────────────────────────────────────────────────


class _InputBase(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _OutputBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ─── Public user (mirror UserPublicOut) ───────────────────────────────────


class ChatAuthorOut(_OutputBase):
    """Vista mínima del autor de un mensaje. Espejo de UserPublicOut.

    NUNCA exponer email, is_admin, hashed_password, google_id.
    is_admin SÍ se expone aquí porque la UI necesita distinguir burbujas
    cliente vs admin. Es una decisión consciente.
    """

    id: UUID
    first_name: Optional[str]
    last_name: Optional[str]
    profile_photo_url: Optional[str]
    is_admin: bool


# ─── Inputs ───────────────────────────────────────────────────────────────


class ThreadCreateIn(_InputBase):
    """POST /chat-quotations/threads — crear hilo desde overlay extras."""

    service_id: UUID
    requerimiento_inicial: str = Field(..., min_length=10, max_length=2000)
    direccion: Optional[str] = Field(default=None, max_length=500)
    presupuesto_estimado: Optional[PrecioField] = None


class MessageCreateIn(_InputBase):
    """POST /chat-quotations/threads/{id}/messages."""

    content: str = Field(..., min_length=1, max_length=4000)
    # `attachment` solo se crea desde el endpoint /attachments;
    # `system` solo lo crea el backend. El cliente solo manda `text`.
    message_type: Literal["text"] = "text"

    @field_validator("content")
    @classmethod
    def _content_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message content cannot be blank")
        return v


class ThreadUpdateStatusIn(_InputBase):
    """PATCH /admin/threads/{id}/status — admin cambia estado."""

    estado: ThreadEstado
    presupuesto_estimado: Optional[PrecioField] = None
    nota: Optional[str] = Field(
        default=None,
        max_length=1000,
        description=(
            "Si viene, se inserta como ChatMessage de tipo 'system' "
            "con el cambio de estado."
        ),
    )


# ─── Outputs ──────────────────────────────────────────────────────────────


class AttachmentOut(BaseModel):
    """Item del JSONB attachments. Validación estricta del shape."""

    model_config = ConfigDict(extra="ignore")

    url: str = Field(..., min_length=1)
    filename: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=100)
    size_bytes: int = Field(..., ge=0, le=50_000_000)  # <50MB


class MessageOut(_OutputBase):
    id: UUID
    thread_id: UUID
    user_id: UUID
    content: str
    message_type: MessageType
    attachments: list[dict]  # parseado a AttachmentOut por el frontend si lo necesita
    created_at: datetime
    user: ChatAuthorOut


class ThreadOut(_OutputBase):
    """Vista de un hilo (sin mensajes — para listings)."""

    id: UUID
    user_id: UUID
    service_id: Optional[UUID]
    estado: ThreadEstado
    presupuesto_estimado: Optional[Decimal]
    requerimiento_inicial: Optional[str]
    direccion: Optional[str]
    created_at: datetime
    updated_at: datetime
    user: ChatAuthorOut
    last_message_preview: Optional[str] = None
    unread_count: int = 0


class ThreadDetailOut(ThreadOut):
    """Vista detallada con todos los mensajes ordenados por created_at asc."""

    messages: list[MessageOut]


class ThreadListOut(BaseModel):
    items: list[ThreadOut]
    total: int
