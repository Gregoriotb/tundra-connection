"""Ticket schemas — Pydantic v2.

Spec:
- Orquestor.md §FASE 6
- DATABASE_SCHEMA.md §SUPPORT TICKETS
- R2 extra="forbid" en inputs
- R9 Validación server-side
- R14 Campos espejo del DDL

Schemas:
    Inputs cliente:    TicketCreateIn, TicketReplyIn, TicketAttachmentIn
    Inputs admin:      TicketStatusUpdateIn, TicketAssignIn, InternalNoteIn
    Outputs:           TicketAuthorOut, TicketAssigneeOut, TicketOut,
                       TicketDetailOut, TicketListOut

Visibilidad:
- `notas_internas` y `historial_estados` SOLO se exponen en endpoints
  /admin/* (los handlers usan modelos distintos: TicketOut vs TicketDetailOut).
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, Optional
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

# Mirror de los CHECK constraints.
TicketTipo = Literal["incidencia", "requerimiento"]
TicketServicio = Literal["fibra_optica", "satelital", "servicios_extras", "otro"]
TicketEstado = Literal[
    "abierto",
    "en_revision",
    "remitido",
    "en_proceso",
    "solucionado",
    "cancelado",
]
TicketPrioridad = Literal["baja", "media", "alta", "critica"]


# ─── Bases ────────────────────────────────────────────────────────────────


class _InputBase(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _OutputBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ─── Inputs cliente ───────────────────────────────────────────────────────


class TicketCreateIn(_InputBase):
    """POST /support-tickets — cliente crea un ticket nuevo."""

    tipo: TicketTipo
    servicio_relacionado: TicketServicio
    titulo: str = Field(..., min_length=5, max_length=255)
    descripcion: str = Field(..., min_length=20, max_length=5000)
    prioridad: TicketPrioridad = "media"

    @field_validator("titulo", "descripcion")
    @classmethod
    def _no_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Field cannot be blank")
        return v


class TicketReplyIn(_InputBase):
    """POST /support-tickets/{id}/reply — respuesta del cliente o admin.

    En esta fase guardamos la respuesta como append en `historial_estados`
    con `to_estado=<actual>` (sin cambio de estado) para preservar el
    timeline. Una tabla `ticket_messages` llegaría en una iteración futura
    si el negocio lo pide; el spec actual no la declara (R14).
    """

    content: str = Field(..., min_length=1, max_length=4000)


class TicketAttachmentIn(_InputBase):
    """POST /support-tickets/{id}/attachments — metadata de adjuntos.

    Igual que en chat: el upload real (ImgBB) llega en FASE 7.
    """

    attachments: list["AttachmentItem"] = Field(..., min_length=1, max_length=10)


class AttachmentItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    url: str = Field(..., min_length=1)
    filename: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=100)
    size_bytes: int = Field(..., ge=0, le=50_000_000)


# Resuelve referencia forward.
TicketAttachmentIn.model_rebuild()


# ─── Inputs admin ─────────────────────────────────────────────────────────


class TicketStatusUpdateIn(_InputBase):
    """PATCH /admin/support-tickets/{id}/status."""

    estado: TicketEstado
    nota: Optional[str] = Field(default=None, max_length=1000)


class TicketAssignIn(_InputBase):
    """PATCH /admin/support-tickets/{id}/assign."""

    assigned_to: Optional[UUID] = Field(
        default=None,
        description="UUID de un user con is_admin=True. None desasigna.",
    )


class InternalNoteIn(_InputBase):
    """POST /admin/support-tickets/{id}/internal-note — append a notas_internas."""

    nota: str = Field(..., min_length=1, max_length=2000)


# ─── Outputs ──────────────────────────────────────────────────────────────


class TicketAuthorOut(_OutputBase):
    """Vista mínima del autor de un ticket."""

    id: UUID
    first_name: Optional[str]
    last_name: Optional[str]
    email: Optional[str] = None  # admins lo necesitan para contactar
    profile_photo_url: Optional[str]
    is_admin: bool


class HistorialEntry(BaseModel):
    """Item del JSONB historial_estados."""

    model_config = ConfigDict(extra="ignore")

    from_estado: Optional[str] = None
    to_estado: str
    by_user_id: Optional[UUID] = None
    nota: Optional[str] = None
    at: datetime
    kind: Literal["status_change", "reply", "internal_note", "assign"] = (
        "status_change"
    )


class TicketOut(_OutputBase):
    """Vista del cliente o lista admin (sin notas_internas).

    Se usa cuando el visualizador es el dueño O cuando un admin la lista
    en modo overview.
    """

    id: UUID
    ticket_number: str
    user_id: UUID
    tipo: TicketTipo
    servicio_relacionado: TicketServicio
    estado: TicketEstado
    prioridad: TicketPrioridad
    titulo: str
    descripcion: str
    adjuntos: list[dict[str, Any]]
    assigned_to: Optional[UUID]
    closed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    user: TicketAuthorOut
    assignee: Optional[TicketAuthorOut] = None


class TicketDetailOut(TicketOut):
    """Vista completa del ticket — incluye notas_internas (solo admins).

    El handler decide qué shape devolver: TicketOut para clientes,
    TicketDetailOut para admins.
    """

    notas_internas: Optional[str] = None
    historial_estados: list[HistorialEntry] = Field(default_factory=list)


class TicketListOut(BaseModel):
    items: list[TicketOut]
    total: int
