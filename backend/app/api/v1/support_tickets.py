"""Support tickets endpoints — cliente + admin (Alloy-style).

Spec:
- Orquestor.md §FASE 6 + mapa de endpoints §Reportes de Fallas
- R4 IDOR: GET/POST sobre tickets ajenos → 404
- R5 ORM puro
- R9 Validación server-side
- R13 Logging eventos auditable (cambios de estado, asignaciones)
- R14 Solo los 10 endpoints del spec

Routers:
    client_router  → /support-tickets/...
    admin_router   → /admin/support-tickets/...

Ticket number: TICK-{YYYY}-{NNNN} con sequence Postgres atómico.
Notificaciones WS: emite ticket_updated a admin + dueño.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import desc, select, text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_admin
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.schemas.ticket import (
    AttachmentItem,
    InternalNoteIn,
    TicketAssignIn,
    TicketAttachmentIn,
    TicketAuthorOut,
    TicketCreateIn,
    TicketDetailOut,
    TicketListOut,
    TicketOut,
    TicketReplyIn,
    TicketStatusUpdateIn,
)
from app.services.email_service import send_ticket_updated
from app.services.notification_service import notify
from app.utils.sanitize import sanitize_user_text
from app.websocket.manager import manager as ws_manager

logger = logging.getLogger("tundra.tickets")

client_router = APIRouter()
admin_router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _next_ticket_number(db: Session) -> str:
    """Genera TICK-{YYYY}-{NNNN} usando sequence Postgres atómica.

    La sequence se crea en la migración 0007. Si por algún motivo no
    existiera, fallamos limpiamente con 500 para que se note en deploy.
    """
    try:
        seq_value = db.scalar(text("SELECT nextval('support_ticket_seq')"))
    except Exception as exc:  # noqa: BLE001
        logger.error("ticket.seq.unavailable err=%s", type(exc).__name__)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Ticket sequence unavailable",
        ) from None
    if seq_value is None:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Ticket sequence returned NULL",
        )
    year = datetime.now(timezone.utc).year
    return f"TICK-{year}-{int(seq_value):04d}"


def _author_out(user: User, *, include_email: bool) -> TicketAuthorOut:
    """Construye TicketAuthorOut respetando visibilidad."""
    return TicketAuthorOut(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email if include_email else None,
        profile_photo_url=user.profile_photo_url,
        is_admin=user.is_admin,
    )


def _ticket_out(ticket: SupportTicket, *, viewer_is_admin: bool) -> TicketOut:
    """Vista para cliente o listado admin — sin notas_internas."""
    base = TicketOut.model_validate(ticket)
    base.user = _author_out(ticket.user, include_email=viewer_is_admin)
    if ticket.assignee is not None:
        base.assignee = _author_out(ticket.assignee, include_email=viewer_is_admin)
    return base


def _ticket_detail(ticket: SupportTicket) -> TicketDetailOut:
    """Vista admin completa — incluye notas_internas + historial."""
    detail = TicketDetailOut.model_validate(ticket)
    detail.user = _author_out(ticket.user, include_email=True)
    if ticket.assignee is not None:
        detail.assignee = _author_out(ticket.assignee, include_email=True)
    return detail


def _append_history(
    ticket: SupportTicket,
    *,
    by_user_id: UUID,
    kind: str,
    from_estado: str | None = None,
    to_estado: str | None = None,
    nota: str | None = None,
) -> None:
    """Append-only al JSONB historial_estados."""
    entry: dict[str, Any] = {
        "kind": kind,
        "by_user_id": str(by_user_id),
        "at": datetime.now(timezone.utc).isoformat(),
    }
    if from_estado is not None:
        entry["from_estado"] = from_estado
    if to_estado is not None:
        entry["to_estado"] = to_estado
    if nota is not None:
        entry["nota"] = nota
    # Trabajamos sobre lista nueva para que SQLA detecte el cambio del JSONB.
    ticket.historial_estados = [*ticket.historial_estados, entry]


def _emit_ticket_event(
    ticket: SupportTicket, *, type: str, payload: dict[str, Any]
) -> None:
    """Push WS a admins + dueño + assignee si están conectados."""

    async def _broadcast() -> None:
        # 1. Suscriptores del ticket (admins en su Kanban, dueño en su detalle).
        await ws_manager.broadcast_to_ticket_subscribers(
            ticket.id, type=type, payload=payload
        )
        # 2. Dueño SIEMPRE recibe el push aunque no esté suscrito explícitamente
        # (puede estar en otra parte del sitio y aún querer ver el cambio).
        await ws_manager.send_to_user(
            ticket.user_id, type=type, payload=payload
        )

    ws_manager.emit_event_sync(_broadcast)


# ─────────────────────────────────────────────────────────────────────────────
# CLIENTE — POST /support-tickets
# ─────────────────────────────────────────────────────────────────────────────


@client_router.post(
    "",
    response_model=TicketOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crea un ticket de soporte. ticket_number se genera server-side.",
)
def create_ticket(
    payload: TicketCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketOut:
    titulo = sanitize_user_text(payload.titulo, max_length=255)
    descripcion = sanitize_user_text(payload.descripcion)

    ticket_number = _next_ticket_number(db)
    ticket = SupportTicket(
        ticket_number=ticket_number,
        user_id=current_user.id,
        tipo=payload.tipo,
        servicio_relacionado=payload.servicio_relacionado,
        estado="abierto",
        prioridad=payload.prioridad,
        titulo=titulo,
        descripcion=descripcion,
    )
    _append_history(
        ticket,
        by_user_id=current_user.id,
        kind="status_change",
        to_estado="abierto",
        nota="Ticket creado",
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    # Notifica a admins en tiempo real.
    summary_payload = {
        "ticket_id": str(ticket.id),
        "ticket_number": ticket.ticket_number,
        "titulo": ticket.titulo,
        "prioridad": ticket.prioridad,
        "tipo": ticket.tipo,
    }
    ws_manager.emit_event_sync(
        lambda: ws_manager.broadcast_to_admins(
            type="ticket_created", payload=summary_payload
        )
    )

    logger.info(
        "ticket.create user_id=%s ticket=%s prioridad=%s",
        current_user.id,
        ticket.ticket_number,
        ticket.prioridad,
    )
    return _ticket_out(ticket, viewer_is_admin=False)


# ─────────────────────────────────────────────────────────────────────────────
# CLIENTE — GET /support-tickets/my-tickets
# ─────────────────────────────────────────────────────────────────────────────


@client_router.get(
    "/my-tickets",
    response_model=TicketListOut,
    summary="Tickets del usuario actual.",
)
def my_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketListOut:
    tickets = list(
        db.scalars(
            select(SupportTicket)
            .where(SupportTicket.user_id == current_user.id)
            .order_by(desc(SupportTicket.updated_at))
        ).all()
    )
    return TicketListOut(
        items=[_ticket_out(t, viewer_is_admin=False) for t in tickets],
        total=len(tickets),
    )


# ─────────────────────────────────────────────────────────────────────────────
# CLIENTE — GET /support-tickets/{id}
# ─────────────────────────────────────────────────────────────────────────────


@client_router.get(
    "/{ticket_id}",
    response_model=TicketOut,
    summary="Detalle del ticket. Sólo el dueño (o admin via /admin) puede verlo.",
)
def get_ticket(
    ticket_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketOut:
    ticket = db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id))
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    # R4: IDOR. Si admin quiere ver detalle completo, usa /admin/...
    if ticket.user_id != current_user.id:
        logger.warning(
            "tickets.idor user_id=%s ticket_id=%s",
            current_user.id,
            ticket.id,
        )
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return _ticket_out(ticket, viewer_is_admin=False)


# ─────────────────────────────────────────────────────────────────────────────
# CLIENTE — POST /support-tickets/{id}/attachments
# ─────────────────────────────────────────────────────────────────────────────


@client_router.post(
    "/{ticket_id}/attachments",
    response_model=TicketOut,
    summary="Agrega adjuntos al ticket (stub — ImgBB en FASE 7).",
)
def add_attachments(
    ticket_id: UUID,
    payload: TicketAttachmentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketOut:
    ticket = _get_ticket_for_participant(db, ticket_id, current_user)
    if ticket.is_terminal:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Ticket is {ticket.estado}; cannot modify",
        )

    new_attachments: list[dict[str, Any]] = [
        a.model_dump() for a in payload.attachments
    ]
    ticket.adjuntos = [*ticket.adjuntos, *new_attachments]
    _append_history(
        ticket,
        by_user_id=current_user.id,
        kind="reply",
        nota=f"Agregó {len(new_attachments)} adjunto(s)",
    )
    db.commit()
    db.refresh(ticket)

    _emit_ticket_event(
        ticket,
        type="ticket_updated",
        payload={
            "ticket_id": str(ticket.id),
            "ticket_number": ticket.ticket_number,
            "kind": "attachments_added",
            "count": len(new_attachments),
        },
    )
    return _ticket_out(ticket, viewer_is_admin=current_user.is_admin)


# ─────────────────────────────────────────────────────────────────────────────
# CLIENTE / ADMIN — POST /support-tickets/{id}/reply
# ─────────────────────────────────────────────────────────────────────────────


@client_router.post(
    "/{ticket_id}/reply",
    response_model=TicketOut,
    summary="Reply en el ticket (timeline). Cliente o admin.",
)
def reply_to_ticket(
    ticket_id: UUID,
    payload: TicketReplyIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketOut:
    ticket = _get_ticket_for_participant(db, ticket_id, current_user)
    if ticket.is_terminal:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Ticket is {ticket.estado}; cannot reply",
        )

    content_clean = sanitize_user_text(payload.content)
    _append_history(
        ticket,
        by_user_id=current_user.id,
        kind="reply",
        nota=content_clean,
    )
    db.commit()
    db.refresh(ticket)

    # Notifica a la contraparte.
    if current_user.is_admin and ticket.user_id != current_user.id:
        notify(
            db,
            user_id=ticket.user_id,
            tipo="ticket_updated",
            payload={
                "ticket_id": str(ticket.id),
                "ticket_number": ticket.ticket_number,
                "preview": content_clean[:120],
                "kind": "reply",
            },
        )

    _emit_ticket_event(
        ticket,
        type="ticket_updated",
        payload={
            "ticket_id": str(ticket.id),
            "ticket_number": ticket.ticket_number,
            "kind": "reply",
            "by_user_id": str(current_user.id),
            "preview": content_clean[:120],
        },
    )
    return _ticket_out(ticket, viewer_is_admin=current_user.is_admin)


# ─── Helper compartido ────────────────────────────────────────────────────


def _get_ticket_for_participant(
    db: Session, ticket_id: UUID, user: User
) -> SupportTicket:
    """Carga ticket validando que el caller sea dueño o admin (404 si no)."""
    ticket = db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id))
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    if ticket.user_id != user.id and not user.is_admin:
        logger.warning(
            "tickets.idor user_id=%s ticket_id=%s",
            user.id,
            ticket.id,
        )
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return ticket


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN — GET /admin/support-tickets
# ─────────────────────────────────────────────────────────────────────────────


@admin_router.get(
    "",
    response_model=TicketListOut,
    summary="Lista TODOS los tickets para panel admin (Kanban / tabla).",
)
def admin_list_tickets(
    estado: str | None = Query(default=None),
    prioridad: str | None = Query(default=None),
    assigned_to_me: bool = Query(default=False),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> TicketListOut:
    stmt = select(SupportTicket).order_by(desc(SupportTicket.updated_at))
    if estado:
        stmt = stmt.where(SupportTicket.estado == estado)
    if prioridad:
        stmt = stmt.where(SupportTicket.prioridad == prioridad)
    if assigned_to_me:
        stmt = stmt.where(SupportTicket.assigned_to == admin.id)

    tickets = list(db.scalars(stmt).all())
    return TicketListOut(
        items=[_ticket_out(t, viewer_is_admin=True) for t in tickets],
        total=len(tickets),
    )


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN — GET /admin/support-tickets/{id}
# ─────────────────────────────────────────────────────────────────────────────


@admin_router.get(
    "/{ticket_id}",
    response_model=TicketDetailOut,
    summary="Detalle completo (incluye notas_internas + historial).",
)
def admin_get_ticket(
    ticket_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> TicketDetailOut:
    ticket = db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id))
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return _ticket_detail(ticket)


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN — PATCH /admin/support-tickets/{id}/status
# ─────────────────────────────────────────────────────────────────────────────


@admin_router.patch(
    "/{ticket_id}/status",
    response_model=TicketDetailOut,
    summary="Cambia estado del ticket (admin). Notifica al cliente.",
)
def admin_update_status(
    ticket_id: UUID,
    payload: TicketStatusUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> TicketDetailOut:
    ticket = db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id))
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    previous = ticket.estado
    if previous == payload.estado:
        return _ticket_detail(ticket)

    ticket.estado = payload.estado
    nota_clean = (
        sanitize_user_text(payload.nota, max_length=1000) if payload.nota else None
    )
    _append_history(
        ticket,
        by_user_id=admin.id,
        kind="status_change",
        from_estado=previous,
        to_estado=payload.estado,
        nota=nota_clean,
    )
    if payload.estado in ("solucionado", "cancelado") and ticket.closed_at is None:
        ticket.closed_at = datetime.now(timezone.utc)
    elif payload.estado not in ("solucionado", "cancelado"):
        # Se reabre — limpiamos closed_at.
        ticket.closed_at = None

    db.commit()
    db.refresh(ticket)

    notify(
        db,
        user_id=ticket.user_id,
        tipo="ticket_updated",
        payload={
            "ticket_id": str(ticket.id),
            "ticket_number": ticket.ticket_number,
            "estado": payload.estado,
            "previous": previous,
            "preview": nota_clean[:120] if nota_clean else None,
        },
    )
    # Email best-effort (R6) — solo si el cliente tiene email.
    send_ticket_updated(
        ticket.user,
        ticket_number=ticket.ticket_number,
        estado=payload.estado,
        nota=nota_clean or "",
    )
    _emit_ticket_event(
        ticket,
        type="ticket_updated",
        payload={
            "ticket_id": str(ticket.id),
            "ticket_number": ticket.ticket_number,
            "kind": "status_change",
            "estado": payload.estado,
            "previous": previous,
        },
    )

    logger.warning(
        "ticket.status admin_id=%s ticket=%s %s→%s",
        admin.id,
        ticket.ticket_number,
        previous,
        payload.estado,
    )
    return _ticket_detail(ticket)


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN — PATCH /admin/support-tickets/{id}/assign
# ─────────────────────────────────────────────────────────────────────────────


@admin_router.patch(
    "/{ticket_id}/assign",
    response_model=TicketDetailOut,
    summary="Asigna o desasigna el ticket. assigned_to debe ser admin.",
)
def admin_assign(
    ticket_id: UUID,
    payload: TicketAssignIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> TicketDetailOut:
    ticket = db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id))
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    target_user: User | None = None
    if payload.assigned_to is not None:
        target_user = db.scalar(
            select(User).where(User.id == payload.assigned_to)
        )
        if target_user is None or not target_user.is_admin:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Assigned user must be an admin",
            )

    previous_assignee = ticket.assigned_to
    ticket.assigned_to = payload.assigned_to
    _append_history(
        ticket,
        by_user_id=admin.id,
        kind="assign",
        nota=(
            f"Asignado a {target_user.email}"
            if target_user is not None
            else "Desasignado"
        ),
    )
    db.commit()
    db.refresh(ticket)

    if target_user is not None and target_user.id != admin.id:
        notify(
            db,
            user_id=target_user.id,
            tipo="ticket_assigned",
            payload={
                "ticket_id": str(ticket.id),
                "ticket_number": ticket.ticket_number,
                "titulo": ticket.titulo,
                "prioridad": ticket.prioridad,
            },
        )

    _emit_ticket_event(
        ticket,
        type="ticket_updated",
        payload={
            "ticket_id": str(ticket.id),
            "ticket_number": ticket.ticket_number,
            "kind": "assign",
            "assigned_to": str(target_user.id) if target_user else None,
            "previous_assignee": str(previous_assignee) if previous_assignee else None,
        },
    )
    logger.info(
        "ticket.assign admin_id=%s ticket=%s to=%s",
        admin.id,
        ticket.ticket_number,
        target_user.id if target_user else None,
    )
    return _ticket_detail(ticket)


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN — POST /admin/support-tickets/{id}/internal-note
# ─────────────────────────────────────────────────────────────────────────────


@admin_router.post(
    "/{ticket_id}/internal-note",
    response_model=TicketDetailOut,
    summary="Agrega una nota interna (NO visible al cliente).",
)
def admin_internal_note(
    ticket_id: UUID,
    payload: InternalNoteIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> TicketDetailOut:
    ticket = db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id))
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    nota_clean = sanitize_user_text(payload.nota, max_length=2000)
    timestamp = datetime.now(timezone.utc).isoformat()
    block = f"\n[{timestamp} · {admin.email}]\n{nota_clean}\n"
    ticket.notas_internas = (ticket.notas_internas or "") + block
    _append_history(
        ticket,
        by_user_id=admin.id,
        kind="internal_note",
        nota="(privada)",
    )
    db.commit()
    db.refresh(ticket)

    # No notificación al cliente (es interna). Sí push a admins.
    _emit_ticket_event(
        ticket,
        type="ticket_updated",
        payload={
            "ticket_id": str(ticket.id),
            "ticket_number": ticket.ticket_number,
            "kind": "internal_note",
        },
    )
    logger.info(
        "ticket.internal_note admin_id=%s ticket=%s",
        admin.id,
        ticket.ticket_number,
    )
    return _ticket_detail(ticket)


# Re-export para que main.py lo monte.
__all__ = ["client_router", "admin_router", "AttachmentItem"]
