"""Primitivas de seguridad: hashing, JWT, API keys.

Spec: Orquestor.md §FASE 1 + R3 (auth dual JWT/API-Key) + SECURITY_RULES.md.

Funciones expuestas:
    hash_password / verify_password         — bcrypt
    create_access_token / decode_token      — JWT HS256
    generate_api_key / hash_api_key         — X-API-Key SHA-256
    constant_time_compare                   — comparación segura
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import bcrypt
import jwt
from jwt.exceptions import InvalidTokenError

from app.core.config import settings

# ── Password hashing (bcrypt) ────────────────────────────────────────────────

_BCRYPT_ROUNDS = 12


def hash_password(plain: str) -> str:
    """Hashea con bcrypt (12 rounds). Retorna string utf-8."""
    if not plain:
        raise ValueError("Password cannot be empty")
    salt = bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verifica password en tiempo constante. Retorna False ante cualquier error."""
    if not plain or not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── JWT (HS256) ──────────────────────────────────────────────────────────────


class TokenError(Exception):
    """Token inválido, expirado, revocado o malformado."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(
    *,
    user_id: UUID | str,
    is_admin: bool,
    expires_minutes: int | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Genera un JWT firmado HS256.

    Claims estándar: sub (user_id como str), exp, iat, type="access".
    NUNCA incluir password, hash, o secrets en `extra_claims` (anti-patrón #4).
    """
    now = _now()
    minutes = expires_minutes or settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "is_admin": bool(is_admin),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
        "type": "access",
    }
    if extra_claims:
        forbidden = {"sub", "exp", "iat", "type", "is_admin"}
        for key in forbidden & extra_claims.keys():
            raise ValueError(f"extra_claims no puede sobrescribir '{key}'")
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(*, user_id: UUID | str) -> str:
    """JWT de refresh (días, no minutos). Se rota en /auth/refresh."""
    now = _now()
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int(
            (now + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)).timestamp()
        ),
        "type": "refresh",
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str, *, expected_type: str = "access") -> dict[str, Any]:
    """Decodifica y valida firma + expiración. Lanza TokenError si inválido."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "iat", "sub", "type"]},
        )
    except InvalidTokenError as exc:
        raise TokenError(f"Invalid token: {exc}") from exc

    if payload.get("type") != expected_type:
        raise TokenError(
            f"Token type mismatch: expected {expected_type}, got {payload.get('type')}"
        )
    return payload


# ── API keys (X-API-Key, R3) ─────────────────────────────────────────────────

API_KEY_PREFIX = "tdr_"  # tundra
_API_KEY_RANDOM_BYTES = 32  # 256 bits


def generate_api_key() -> tuple[str, str]:
    """Genera (plain, hash). El plain se muestra UNA SOLA VEZ al usuario.

    Formato: tdr_<43-char base64url>. Hash SHA-256 hex (64 chars).
    """
    raw = secrets.token_urlsafe(_API_KEY_RANDOM_BYTES)
    plain = f"{API_KEY_PREFIX}{raw}"
    return plain, hash_api_key(plain)


def hash_api_key(plain: str) -> str:
    """SHA-256 hex de la clave en claro. Determinístico → permite lookup por hash."""
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


def constant_time_compare(a: str, b: str) -> bool:
    """Comparación en tiempo constante para secretos no hasheados."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
