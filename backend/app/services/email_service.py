"""Email service — envío transaccional (FASE 10, MAQUETA).

Spec:
- Orquestor.md §FASE 10
- R6 Best-effort: errores de envío NO rompen el flujo principal
- R13 Logging estructurado de cada envío (auditable)

MAQUETA:
- Provider-agnostic: la función pública `send_email()` no asume Resend.
  Hoy resolvemos a un stub que loggea + escribe a `/uploads/_emails_outbox/`.
  En FASE 11 (sweep) basta cambiar el bloque marcado `TODO` para usar
  el provider que el cliente decida (Resend, SendGrid, AWS SES, SMTP propio).
- Templates Jinja-style minimalistas con `str.format_map` — sin dependencia
  extra. Si el cliente quiere Jinja2 real, se cambia en sweep.
- Hooks en endpoints (auth.register, invoices.checkout, etc.) llaman
  `send_*` helpers que internamente arman el payload y delegan en
  `send_email()`. Si el provider no está configurado, solo se loguea.

Uso:
    from app.services.email_service import (
        send_welcome,
        send_invoice_created,
        send_ticket_updated,
        send_new_chat_message,
    )
    send_welcome(user)   # nunca lanza — best-effort
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import settings
from app.models.user import User
from app.services.upload_service import get_uploads_dir

logger = logging.getLogger("tundra.email")

# Outbox local — útil en dev y en QA sin provider real. No se incluye en
# el repo (uploads/ está en .gitignore).
_OUTBOX_DIR = Path(get_uploads_dir()) / "_emails_outbox"


# ─────────────────────────────────────────────────────────────────────────────
# Templates  (Maqueta — strings con format_map; sweep FASE 11 → Jinja2 real)
# ─────────────────────────────────────────────────────────────────────────────


_TEMPLATES: dict[str, dict[str, str]] = {
    "welcome": {
        "subject": "Bienvenido a Tundra Connection, {name}",
        "html": """
        <h1 style="color:#C5A059">Hola {name}</h1>
        <p>Tu cuenta en <strong>Tundra Connection</strong> está activa.</p>
        <p>Desde tu panel puedes solicitar instalación de internet, comprar
        equipos del catálogo, o iniciar una cotización personalizada.</p>
        <p style="color:#888">Si no fuiste tú, ignora este mensaje.</p>
        """,
        "text": (
            "Hola {name},\n\n"
            "Tu cuenta en Tundra Connection está activa.\n"
            "Desde tu panel puedes solicitar internet, comprar equipos\n"
            "o iniciar una cotización."
        ),
    },
    "invoice_created": {
        "subject": "Factura #{invoice_short} — Tundra Connection",
        "html": """
        <h1 style="color:#C5A059">Factura recibida</h1>
        <p>Hola {name}, generamos tu factura por <strong>${total}</strong>.</p>
        <p>Tipo: {tipo}<br>Estado: {estado}</p>
        <p>Puedes ver el detalle en tu panel.</p>
        """,
        "text": (
            "Factura #{invoice_short} por ${total} ({tipo}). "
            "Estado actual: {estado}."
        ),
    },
    "ticket_updated": {
        "subject": "Ticket {ticket_number} — actualización",
        "html": """
        <h1 style="color:#C5A059">{ticket_number}</h1>
        <p>Hola {name}, tu ticket pasó a estado <strong>{estado}</strong>.</p>
        <p>{nota}</p>
        """,
        "text": (
            "Ticket {ticket_number} — nuevo estado: {estado}.\n{nota}"
        ),
    },
    "new_chat_message": {
        "subject": "Nuevo mensaje en tu cotización",
        "html": """
        <h1 style="color:#C5A059">Tienes un mensaje nuevo</h1>
        <p>Hola {name}, recibiste una respuesta en tu cotización.</p>
        <blockquote style="border-left:3px solid #C5A059;padding-left:12px">
        {preview}
        </blockquote>
        <p>Responde desde tu panel.</p>
        """,
        "text": (
            "Hola {name}, tienes un nuevo mensaje en tu cotización:\n"
            "{preview}"
        ),
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# Provider primitivo
# ─────────────────────────────────────────────────────────────────────────────


def send_email(
    *,
    to: str,
    template: str,
    context: dict[str, Any],
) -> bool:
    """Envía un email. Best-effort: nunca lanza.

    Args:
        to: dirección destino.
        template: una de las keys de `_TEMPLATES`.
        context: variables para el template.

    Returns:
        True si el envío "se hizo" (real o stubbed). False si falló.
    """
    tpl = _TEMPLATES.get(template)
    if tpl is None:
        logger.error("email.unknown_template template=%s", template)
        return False

    try:
        subject = tpl["subject"].format_map(_SafeDict(context))
        html_body = tpl["html"].format_map(_SafeDict(context))
        text_body = tpl["text"].format_map(_SafeDict(context))
    except Exception as exc:  # pragma: no cover
        logger.exception("email.render_failed template=%s err=%s", template, exc)
        return False

    payload = {
        "from": settings.EMAIL_FROM,
        "to": to,
        "subject": subject,
        "html": html_body,
        "text": text_body,
    }

    if settings.RESEND_API_KEY:
        # TODO (sweep FASE 11) — provider real (cliente aún por decidir):
        #
        #   import httpx
        #   httpx.post(
        #       "https://api.resend.com/emails",
        #       headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        #       json=payload, timeout=10.0,
        #   ).raise_for_status()
        #
        # Si el cliente prefiere SMTP propio: smtplib + EMAIL_HOST en config.
        # Si SES: boto3.client('ses').send_email(...).
        # La interfaz pública `send_email()` no cambia.
        logger.info(
            "email.send.stubbed_with_key to=%s template=%s subject=%r",
            to,
            template,
            subject,
        )
    else:
        logger.info(
            "email.send.no_provider to=%s template=%s subject=%r",
            to,
            template,
            subject,
        )

    # Outbox local — siempre se escribe en maqueta para QA visual.
    _write_outbox(payload, template)
    return True


def _write_outbox(payload: dict[str, Any], template: str) -> None:
    """Persiste el email en disco para inspección en dev/QA."""
    try:
        _OUTBOX_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        filename = f"{ts}_{template}_{uuid4().hex[:8]}.json"
        (_OUTBOX_DIR / filename).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("email.outbox.write_failed err=%s", exc)


class _SafeDict(dict):  # type: ignore[type-arg]
    """dict que devuelve `{key}` literal si la clave falta — no rompe render."""

    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers públicos por evento — los call-sites usan estas, no `send_email`.
# ─────────────────────────────────────────────────────────────────────────────


def send_welcome(user: User) -> bool:
    if not user.email:
        return False
    name = (user.first_name or "").strip() or "amigo/a"
    return send_email(
        to=user.email,
        template="welcome",
        context={"name": name},
    )


def send_invoice_created(
    user: User,
    *,
    invoice_id: str,
    total: str,
    tipo: str,
    estado: str,
) -> bool:
    if not user.email:
        return False
    name = (user.first_name or "").strip() or "cliente"
    return send_email(
        to=user.email,
        template="invoice_created",
        context={
            "name": name,
            "invoice_short": str(invoice_id)[:8],
            "total": total,
            "tipo": tipo,
            "estado": estado,
        },
    )


def send_ticket_updated(
    user: User,
    *,
    ticket_number: str,
    estado: str,
    nota: str = "",
) -> bool:
    if not user.email:
        return False
    name = (user.first_name or "").strip() or "cliente"
    return send_email(
        to=user.email,
        template="ticket_updated",
        context={
            "name": name,
            "ticket_number": ticket_number,
            "estado": estado,
            "nota": nota or "Revisa tu panel para más detalles.",
        },
    )


def send_new_chat_message(user: User, *, preview: str) -> bool:
    if not user.email:
        return False
    name = (user.first_name or "").strip() or "cliente"
    short = preview if len(preview) <= 160 else preview[:157] + "…"
    return send_email(
        to=user.email,
        template="new_chat_message",
        context={"name": name, "preview": short},
    )
