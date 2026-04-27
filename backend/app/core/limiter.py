"""Rate limiter compartido (slowapi).

Spec: Orquestor.md R12 + SECURITY_RULES.md.
Se importa desde main.py (montaje global) y desde routers que aplican
@limiter.limit("...") en endpoints sensibles (auth, uploads, etc.).
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.RATE_LIMIT_DEFAULT],
    headers_enabled=True,
)
