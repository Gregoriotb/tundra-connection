"""Chat-cotizaciones endpoints — cliente + admin.

Spec:
- Orquestor.md §FASE 4 + mapa de endpoints §Chat-Cotizaciones
- Orquestor: chat SÓLO para servicios extras (slug='servicios_extras')
- R4 IDOR: ownership check en cada thread
- R5 ORM puro
- R9 Validación server-side
- R13 Logging eventos
- R17 Prefijos sin "/" final

Routers exportados:
    client_router  → /chat-quotations/...
    admin_router   → /admin/threads/...

Polling primero — WebSocket reemplaza polling en FASE 5.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_admin
from app.models.chat_message import ChatMessage
from app.models.quotation_thread import QuotationThread
from app.models.service import Service
from app.models.user import User
from app.schemas.chat import (
    AttachmentOut,
    MessageCreateIn,
    MessageOut,
    ThreadCreateIn,
    ThreadDetailOut,
    ThreadListOut,
    ThreadOut,
    ThreadUpdateStatusIn,
)
from app.services.email_service import send_new_chat_message
from app.services.notification_service import emit_thread_event, notify
from app.utils.sanitize import sanitize_user_text

logger = logging.getLogger("tundra.chat")

client_router = APIRouter()
admin_router = APIRouter()

QUOTE_SERVICE_SLUG = "servicios_extras"
PREVIEW_LEN = 80
MAX_ATTACHMENTS_PER_MESSAGE = 5


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _get_thread_or_404(
    db: Session, thread_id: UUID, requester: User
) -> QuotationThread:
    """Carga thread y verifica ownership (R4). 404 sobre ajeno (no leak)."""
    thread = db.scalar(
        select(QuotationThread).where(QuotationThread.id == thread_id)
    )
    if thread is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Thread not found")
    if thread.user_id != requester.id and not requester.is_admin:
        logger.warning(
            "chat.thread.idor user_id=%s thread_id=%s owner_id=%s",
            requester.id,
            thread.id,
            thread.user_id,
        )
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Thread not found")
    return thread


def _hydrate_thread_out(
    db: Session, thread: QuotationThread, viewer_id: UUID
) -> ThreadOut:
    """Construye ThreadOut con last_message_preview + unread_count.

    `viewer_id` se usa para contar mensajes recientes que no son del propio
    viewer (heurística de "no leído" hasta que tengamos read receipts).
    """
    last_msg = db.scalar(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread.id)
        .order_by(desc(ChatMessage.created_at))
        .limit(1)
    )
    preview: str | None = None
    if last_msg is not None:
        text = last_msg.content.strip()
        preview = text if len(text) <= PREVIEW_LEN else text[: PREVIEW_LEN - 1] + "…"

    unread = (
        db.scalar(
            select(func.count())
            .select_from(ChatMessage)
            .where(
                ChatMessage.thread_id == thread.id,
                ChatMessage.user_id != viewer_id,
            )
        )
        or 0
    )

    out = ThreadOut.model_validate(thread)
    out.last_message_preview = preview
    out.unread_count = int(unread)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# CLIENTE
# ─────────────────────────────────────────────────────────────────────────────


@client_router.post(
    "/threads",
    response_model=ThreadOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crea un hilo de cotización (solo para servicios extras).",
)
def create_thread(
    payload: ThreadCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ThreadOut:
    service = db.scalar(select(Service).where(Service.id == payload.service_id))
    if service is None or not service.is_active:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Service not available"
        )

    # Regla del Orquestor: chat SÓLO para servicios extras.
    if service.slug != QUOTE_SERVICE_SLUG:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Quotation chat is only available for '{QUOTE_SERVICE_SLUG}'",
        )

    requerimiento_clean = sanitize_user_text(payload.requerimiento_inicial)
    thread = QuotationThread(
        user_id=current_user.id,
        service_id=service.id,
        estado="pending",
        requerimiento_inicial=requerimiento_clean,
        direccion=payload.direccion,
        presupuesto_estimado=payload.presupuesto_estimado,
    )
    db.add(thread)
    db.flush()

    # Mensaje inicial del sistema con el requerimiento, para que el admin
    # vea el contexto en el timeline sin tener que abrir aparte.
    initial_msg = ChatMessage(
        thread_id=thread.id,
        user_id=current_user.id,
        content=requerimiento_clean,
        message_type="text",
    )
    db.add(initial_msg)
    db.commit()
    db.refresh(thread)

    logger.info(
        "chat.thread.create user_id=%s thread_id=%s service=%s",
        current_user.id,
        thread.id,
        service.slug,
    )
    return _hydrate_thread_out(db, thread, current_user.id)


@client_router.get(
    "/my-threads",
    response_model=ThreadListOut,
    summary="Hilos de cotización del usuario, ordenados por actividad reciente.",
)
def my_threads(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ThreadListOut:
    threads = list(
        db.scalars(
            select(QuotationThread)
            .where(QuotationThread.user_id == current_user.id)
            .order_by(desc(QuotationThread.updated_at))
        ).all()
    )
    items = [_hydrate_thread_out(db, t, current_user.id) for t in threads]
    return ThreadListOut(items=items, total=len(items))


@client_router.get(
    "/threads/{thread_id}",
    response_model=ThreadDetailOut,
    summary="Detalle del hilo + mensajes (orden cronológico ascendente).",
)
def get_thread(
    thread_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ThreadDetailOut:
    thread = _get_thread_or_404(db, thread_id, current_user)
    messages = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.thread_id == thread.id)
            .order_by(ChatMessage.created_at.asc())
        ).all()
    )

    base = _hydrate_thread_out(db, thread, current_user.id)
    return ThreadDetailOut(
        **base.model_dump(),
        messages=[MessageOut.model_validate(m) for m in messages],
    )


@client_router.post(
    "/threads/{thread_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
    summary="Envía un mensaje en el hilo (cliente o admin).",
)
def post_message(
    thread_id: UUID,
    payload: MessageCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageOut:
    thread = _get_thread_or_404(db, thread_id, current_user)
    if thread.estado in ("closed", "cancelled"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Thread is {thread.estado}; cannot post messages",
        )

    content_clean = sanitize_user_text(payload.content)
    msg = ChatMessage(
        thread_id=thread.id,
        user_id=current_user.id,
        content=content_clean,
        message_type="text",
    )
    db.add(msg)
    # Actualiza updated_at del thread para que suba en el listado.
    thread.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    # Push WS a los suscriptores del thread (excluye al emisor — su
    # cliente ya hizo append optimista).
    msg_serialized = MessageOut.model_validate(msg).model_dump(mode="json")
    emit_thread_event(
        thread_id=thread.id,
        type="chat_message",
        payload=msg_serialized,
        exclude_user_id=current_user.id,
    )

    # Notificación a la contraparte (si el emisor es el cliente, notifica
    # a admins; si es admin, notifica al dueño del hilo).
    if current_user.is_admin and thread.user_id != current_user.id:
        notify(
            db,
            user_id=thread.user_id,
            tipo="chat_message",
            payload={
                "thread_id": str(thread.id),
                "message_id": str(msg.id),
                "preview": content_clean[:120],
            },
            commit=True,
        )
        # Email best-effort (R6) — solo admin → cliente.
        send_new_chat_message(thread.user, preview=content_clean)

    logger.info(
        "chat.message.create user_id=%s thread_id=%s message_id=%s",
        current_user.id,
        thread.id,
        msg.id,
    )
    return MessageOut.model_validate(msg)


@client_router.post(
    "/threads/{thread_id}/attachments",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
    summary=(
        "Crea un mensaje de tipo 'attachment' con metadatos. "
        "El upload real (ImgBB) llega en FASE 7."
    ),
)
def post_attachment(
    thread_id: UUID,
    attachments: list[AttachmentOut] = Body(
        ...,
        embed=True,
        description=(
            "Lista de adjuntos ya subidos a almacenamiento. "
            "Body: {\"attachments\": [...], \"note\": \"...\"}"
        ),
    ),
    note: str | None = Body(default=None, embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageOut:
    """Guarda metadata de adjuntos en un mensaje del hilo.

    En FASE 7 este endpoint recibirá los archivos vía multipart/form-data,
    los subirá a ImgBB (con fallback local R6) y construirá los
    `attachments` aquí. Por ahora acepta los metadatos pre-armados.
    """
    thread = _get_thread_or_404(db, thread_id, current_user)
    if thread.estado in ("closed", "cancelled"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Thread is {thread.estado}; cannot post attachments",
        )
    if not attachments:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No attachments provided")
    if len(attachments) > MAX_ATTACHMENTS_PER_MESSAGE:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Too many attachments (max {MAX_ATTACHMENTS_PER_MESSAGE})",
        )

    snapshot: list[dict[str, Any]] = [a.model_dump() for a in attachments]
    msg = ChatMessage(
        thread_id=thread.id,
        user_id=current_user.id,
        content=sanitize_user_text(note or "Archivo adjunto", max_length=500),
        message_type="attachment",
        attachments=snapshot,
    )
    db.add(msg)
    thread.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    # Push WS y notificación (mismo patrón que post_message).
    msg_serialized = MessageOut.model_validate(msg).model_dump(mode="json")
    emit_thread_event(
        thread_id=thread.id,
        type="chat_message",
        payload=msg_serialized,
        exclude_user_id=current_user.id,
    )
    if current_user.is_admin and thread.user_id != current_user.id:
        notify(
            db,
            user_id=thread.user_id,
            tipo="chat_message",
            payload={
                "thread_id": str(thread.id),
                "message_id": str(msg.id),
                "preview": "Adjunto recibido",
            },
            commit=True,
        )

    logger.info(
        "chat.attachment.create user_id=%s thread_id=%s count=%s",
        current_user.id,
        thread.id,
        len(snapshot),
    )
    return MessageOut.model_validate(msg)


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN
# ─────────────────────────────────────────────────────────────────────────────


@admin_router.get(
    "",
    response_model=ThreadListOut,
    summary="Lista de TODOS los hilos (admin). Filtros opcionales.",
)
def list_all_threads(
    estado: str | None = Query(default=None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ThreadListOut:
    stmt = select(QuotationThread).order_by(desc(QuotationThread.updated_at))
    if estado:
        stmt = stmt.where(QuotationThread.estado == estado)

    threads = list(db.scalars(stmt).all())
    items = [_hydrate_thread_out(db, t, admin.id) for t in threads]
    return ThreadListOut(items=items, total=len(items))


@admin_router.patch(
    "/{thread_id}/status",
    response_model=ThreadOut,
    summary="Cambia estado del hilo. La nota se inserta como mensaje 'system'.",
)
def update_thread_status(
    thread_id: UUID,
    payload: ThreadUpdateStatusIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ThreadOut:
    thread = db.scalar(
        select(QuotationThread).where(QuotationThread.id == thread_id)
    )
    if thread is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Thread not found")

    previous = thread.estado
    thread.estado = payload.estado
    if payload.presupuesto_estimado is not None:
        thread.presupuesto_estimado = payload.presupuesto_estimado

    # System message para el timeline.
    note = payload.nota or f"Estado actualizado: {previous} → {payload.estado}"
    note_clean = sanitize_user_text(note, max_length=500)
    sys_msg = ChatMessage(
        thread_id=thread.id,
        user_id=admin.id,
        content=note_clean,
        message_type="system",
    )
    db.add(sys_msg)
    thread.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(thread)

    # Notifica al cliente del cambio + push thread_updated a suscriptores.
    notify(
        db,
        user_id=thread.user_id,
        tipo="quotation_status",
        payload={
            "thread_id": str(thread.id),
            "estado": payload.estado,
            "previous": previous,
            "preview": note_clean[:120],
        },
        commit=True,
    )
    sys_serialized = MessageOut.model_validate(sys_msg).model_dump(mode="json")
    emit_thread_event(
        thread_id=thread.id,
        type="chat_message",
        payload=sys_serialized,
    )
    emit_thread_event(
        thread_id=thread.id,
        type="thread_updated",
        payload={
            "thread_id": str(thread.id),
            "estado": payload.estado,
            "previous": previous,
        },
    )

    logger.warning(
        "chat.thread.status admin_id=%s thread_id=%s %s→%s",
        admin.id,
        thread.id,
        previous,
        payload.estado,
    )
    return _hydrate_thread_out(db, thread, admin.id)
