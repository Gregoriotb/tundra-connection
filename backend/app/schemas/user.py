"""User schemas — Pydantic v2.

Spec:
- Orquestor.md §FASE 1, §FASE 7
- R2 Type safety total: extra="forbid" en TODOS los inputs
- R9 Validación server-side
- R14 No inventar — schemas reflejan el modelo User exactamente

Inputs (forbid extra):  UserRegisterIn, UserLoginIn, UserUpdateIn, PasswordChangeIn
Outputs (allow ignore): UserOut, UserPublicOut, AuthTokensOut
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    SecretStr,
    field_validator,
    model_validator,
)
from pydantic import TypeAdapter

# Identifier reservado para la cuenta administradora (bootstrap special).
# Ver auth.py /auth/login: primer login con este identifier fija el password.
ADMIN_IDENTIFIER = "admin"
_email_adapter = TypeAdapter(EmailStr)

# ── Config bases ─────────────────────────────────────────────────────────────


class _InputBase(BaseModel):
    """Schema de entrada: rechaza campos no declarados (R2)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _OutputBase(BaseModel):
    """Schema de salida: permite construirse desde modelos ORM."""

    model_config = ConfigDict(from_attributes=True)


# ── Validadores reutilizables ────────────────────────────────────────────────

_PHONE_RE = re.compile(r"^\+?[0-9\s\-()]{7,20}$")
_PASSWORD_MIN = 8


def _validate_password_strength(v: str) -> str:
    """Política mínima: ≥8 chars, ≥1 letra, ≥1 dígito."""
    if len(v) < _PASSWORD_MIN:
        raise ValueError(f"Password must be at least {_PASSWORD_MIN} characters")
    if not re.search(r"[A-Za-z]", v):
        raise ValueError("Password must contain at least one letter")
    if not re.search(r"\d", v):
        raise ValueError("Password must contain at least one digit")
    return v


# ── Inputs ───────────────────────────────────────────────────────────────────


class UserRegisterIn(_InputBase):
    """POST /auth/register — registro local con email + password."""

    email: EmailStr
    password: SecretStr = Field(..., min_length=_PASSWORD_MIN, max_length=128)
    first_name: Optional[str] = Field(default=None, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    account_type: Optional[Literal["empresa", "particular"]] = None

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v: SecretStr) -> SecretStr:
        _validate_password_strength(v.get_secret_value())
        return v


class UserLoginIn(_InputBase):
    """POST /auth/login — login local.

    `email` acepta:
      - un email válido (caso normal)
      - el literal "admin" (bootstrap del administrador, ver auth.py)
    """

    email: str = Field(..., min_length=1, max_length=255)
    password: SecretStr = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _email_or_admin(cls, v: str) -> str:
        v = v.strip().lower()
        if v == ADMIN_IDENTIFIER:
            return v
        # Reusa la validación RFC de EmailStr para todo lo demás.
        _email_adapter.validate_python(v)
        return v


class UserUpdateIn(_InputBase):
    """PUT /users/profile — campos opcionales de perfil.

    Email NO se actualiza desde aquí (requiere verificación aparte).
    is_admin NUNCA es asignable por el cliente.
    """

    first_name: Optional[str] = Field(default=None, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=20)
    rif_cedula: Optional[str] = Field(default=None, max_length=20)
    account_type: Optional[Literal["empresa", "particular"]] = None
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    zip_code: Optional[str] = Field(default=None, max_length=20)

    @field_validator("phone")
    @classmethod
    def _phone_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not _PHONE_RE.match(v):
            raise ValueError("Invalid phone format")
        return v

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "UserUpdateIn":
        if not any(
            v is not None for v in self.model_dump(exclude_none=False).values()
        ):
            raise ValueError("At least one field must be provided")
        return self


class PasswordChangeIn(_InputBase):
    """POST /auth/password — cambio de contraseña autenticado."""

    current_password: SecretStr = Field(..., min_length=1, max_length=128)
    new_password: SecretStr = Field(..., min_length=_PASSWORD_MIN, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _new_password_strength(cls, v: SecretStr) -> SecretStr:
        _validate_password_strength(v.get_secret_value())
        return v

    @model_validator(mode="after")
    def _new_differs_from_current(self) -> "PasswordChangeIn":
        if (
            self.current_password.get_secret_value()
            == self.new_password.get_secret_value()
        ):
            raise ValueError("New password must differ from current password")
        return self


# ── Outputs ──────────────────────────────────────────────────────────────────


class UserOut(_OutputBase):
    """Respuesta /users/profile y /auth/verify — vista privada (mismo user).

    Nota: `email` es `str` (no `EmailStr`) porque el identifier admin
    bootstrap ("admin") no es un email válido pero sí es un usuario real
    del sistema. La validación de email se aplica solo en inputs de
    register, no al serializar al cliente.
    """

    id: UUID
    email: str
    is_admin: bool
    account_type: Optional[Literal["empresa", "particular"]]
    first_name: Optional[str]
    last_name: Optional[str]
    phone: Optional[str]
    rif_cedula: Optional[str]
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    zip_code: Optional[str]
    profile_photo_url: Optional[str]
    is_active: bool
    email_verified: bool
    has_completed_onboarding: bool
    created_at: datetime
    updated_at: datetime


class UserPublicOut(_OutputBase):
    """Vista pública minimal (otros usuarios, mensajes de chat, etc.).

    NUNCA incluye: hashed_password, google_id, is_admin, dirección, RIF.
    """

    id: UUID
    first_name: Optional[str]
    last_name: Optional[str]
    profile_photo_url: Optional[str]


class AuthTokensOut(BaseModel):
    """Respuesta de /auth/login y /auth/register."""

    model_config = ConfigDict(from_attributes=False)

    access_token: str
    refresh_token: Optional[str] = None
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(..., description="Access token TTL en segundos")
    user: UserOut
