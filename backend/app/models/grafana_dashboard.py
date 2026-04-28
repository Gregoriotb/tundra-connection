"""GrafanaDashboard model — registro de dashboards embebibles (FASE 9).

Spec:
- DATABASE_SCHEMA.md §GRAFANA_DASHBOARDS — mirror del DDL
- Orquestor.md §FASE 9 (Grafana Integration)
- R5 ORM puro · R14 Migración por cambios de esquema · R16 PK UUID

Modelo:
- Cada fila representa un dashboard de Grafana que el admin registra
  en el panel para mostrarlo embebido en `MonitoringView`.
- `uid` es el identificador estable del dashboard en Grafana — único
  porque el mismo UID no debería registrarse dos veces.
- `url_embed` es la URL completa al endpoint `/d-solo/<uid>` o
  `/d/<uid>` que se inyecta en un `<iframe>`. El admin pega aquí la
  URL ya parametrizada.
- `variables` (JSONB) permite override de template variables por fila
  sin modificar la URL — útil para multi-tenant en el futuro.
- `display_order` determina el orden en `MonitoringView` (asc).

MAQUETA — el campo `url_embed` se renderiza directamente en `<iframe>`
sin proxy. En FASE 11 (sweep final) se cambia a un endpoint
`/admin/grafana/{id}/proxy` que añade el header `Authorization` con
`GRAFANA_API_KEY` y reescribe el HTML antes de devolverlo, para que
el token nunca llegue al navegador.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDPKMixin


class GrafanaDashboard(Base, UUIDPKMixin):
    """Dashboard de Grafana registrado para mostrarse en el panel admin."""

    __tablename__ = "grafana_dashboards"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    uid: Mapped[str] = mapped_column(
        String(100), nullable=False, unique=True, index=True
    )
    url_embed: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default="'{}'::jsonb"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<GrafanaDashboard id={self.id} uid={self.uid!r} "
            f"name={self.name!r} active={self.is_active}>"
        )
