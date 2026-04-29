"""support tickets table + ticket number sequence

Revision ID: 0007_support_tickets
Revises: 0006_notifications
Create Date: 2026-04-27

Spec: DATABASE_SCHEMA.md §SUPPORT TICKETS — mirror del DDL.

Crea también la sequence `support_ticket_seq` que el endpoint usa para
generar `TICK-{YYYY}-{NNNN}` de forma atómica.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_support_tickets"
down_revision: Union[str, None] = "0006_notifications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Sequence atómica para ticket_number ────────────────────────────────
    # CYCLE NO → si llegamos al límite (improbable: 9223372036854775807)
    # falla en lugar de reiniciar y duplicar.
    op.execute(
        """
        CREATE SEQUENCE IF NOT EXISTS support_ticket_seq
        START WITH 1
        INCREMENT BY 1
        NO CYCLE
        """
    )

    # ── Tabla support_tickets ──────────────────────────────────────────────
    op.create_table(
        "support_tickets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "ticket_number",
            sa.String(length=20),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column(
            "servicio_relacionado", sa.String(length=50), nullable=False
        ),
        sa.Column(
            "estado",
            sa.String(length=50),
            nullable=False,
            server_default=sa.text("'abierto'"),
        ),
        sa.Column(
            "prioridad",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'media'"),
        ),
        sa.Column("titulo", sa.String(length=255), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=False),
        sa.Column(
            "adjuntos",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("notas_internas", sa.Text(), nullable=True),
        sa.Column(
            "historial_estados",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "assigned_to",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "closed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "tipo IN ('incidencia', 'requerimiento')",
            name="support_tickets_tipo_check",
        ),
        sa.CheckConstraint(
            "servicio_relacionado IN ("
            "'fibra_optica', 'satelital', 'servicios_extras', 'otro')",
            name="support_tickets_servicio_check",
        ),
        sa.CheckConstraint(
            "estado IN ('abierto', 'en_revision', 'remitido', "
            "'en_proceso', 'solucionado', 'cancelado')",
            name="support_tickets_estado_check",
        ),
        sa.CheckConstraint(
            "prioridad IN ('baja', 'media', 'alta', 'critica')",
            name="support_tickets_prioridad_check",
        ),
    )

    # ── Índices ─────────────────────────────────────────────────────────────
    op.create_index(
        "ix_support_tickets_ticket_number",
        "support_tickets",
        ["ticket_number"],
        unique=True,
    )
    op.create_index(
        "ix_support_tickets_user_id",
        "support_tickets",
        ["user_id"],
    )
    op.create_index(
        "ix_support_tickets_assigned_to",
        "support_tickets",
        ["assigned_to"],
    )
    op.create_index(
        "ix_support_tickets_estado",
        "support_tickets",
        ["estado"],
    )
    op.create_index(
        "ix_support_tickets_prioridad",
        "support_tickets",
        ["prioridad"],
    )
    op.create_index(
        "ix_support_tickets_updated_at",
        "support_tickets",
        ["updated_at"],
    )
    # Índice compuesto para queries de Kanban admin filtrando por estado
    # y ordenando por prioridad descendiente + fecha.
    op.create_index(
        "ix_support_tickets_estado_prioridad",
        "support_tickets",
        ["estado", "prioridad", "updated_at"],
    )
    # Partial index para tickets ABIERTOS (no terminales) — el caso más
    # consultado en el panel admin.
    op.execute(
        """
        CREATE INDEX ix_support_tickets_active
        ON support_tickets (updated_at DESC, prioridad)
        WHERE estado NOT IN ('solucionado', 'cancelado')
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_support_tickets_active")
    op.drop_index(
        "ix_support_tickets_estado_prioridad", table_name="support_tickets"
    )
    op.drop_index("ix_support_tickets_updated_at", table_name="support_tickets")
    op.drop_index("ix_support_tickets_prioridad", table_name="support_tickets")
    op.drop_index("ix_support_tickets_estado", table_name="support_tickets")
    op.drop_index("ix_support_tickets_assigned_to", table_name="support_tickets")
    op.drop_index("ix_support_tickets_user_id", table_name="support_tickets")
    op.drop_index(
        "ix_support_tickets_ticket_number", table_name="support_tickets"
    )
    op.drop_table("support_tickets")

    op.execute("DROP SEQUENCE IF EXISTS support_ticket_seq")
