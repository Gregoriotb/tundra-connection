"""services and invoices tables

Revision ID: 0003_services_invoices
Revises: 0002_catalog_items
Create Date: 2026-04-27

Spec: DATABASE_SCHEMA.md §SERVICES + §INVOICES — mirror del DDL.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_services_invoices"
down_revision: Union[str, None] = "0002_catalog_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── services ────────────────────────────────────────────────────────────
    op.create_table(
        "services",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("slug", sa.String(length=50), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("subtitle", sa.String(length=255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon_name", sa.String(length=50), nullable=True),
        sa.Column(
            "precio_instalacion_base",
            sa.Numeric(10, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "planes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "display_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "slug IN ('fibra_optica', 'satelital', 'servicios_extras')",
            name="services_slug_check",
        ),
        sa.CheckConstraint(
            "precio_instalacion_base >= 0",
            name="services_precio_instalacion_non_negative",
        ),
    )
    op.create_index("ix_services_slug", "services", ["slug"], unique=True)
    op.create_index(
        "ix_services_display_order",
        "services",
        ["display_order"],
    )

    # ── invoices ────────────────────────────────────────────────────────────
    op.create_table(
        "invoices",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tipo", sa.String(length=50), nullable=False),
        sa.Column(
            "estado",
            sa.String(length=50),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("subtotal", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "tax_amount",
            sa.Numeric(10, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("total", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "items",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("direccion_instalacion", sa.Text(), nullable=True),
        sa.Column(
            "plan_seleccionado",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        # R15: la columna se llama `metadata` en SQL aunque el ORM use extra_data.
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
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
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "tipo IN ('PRODUCT_SALE', 'INTERNET_SERVICE', 'SERVICE_QUOTATION')",
            name="invoices_tipo_check",
        ),
        sa.CheckConstraint(
            "estado IN ('pending', 'paid', 'cancelled', 'overdue', 'refunded')",
            name="invoices_estado_check",
        ),
        sa.CheckConstraint("subtotal >= 0", name="invoices_subtotal_non_negative"),
        sa.CheckConstraint("tax_amount >= 0", name="invoices_tax_non_negative"),
        sa.CheckConstraint("total >= 0", name="invoices_total_non_negative"),
    )
    op.create_index("ix_invoices_user_id", "invoices", ["user_id"])
    op.create_index("ix_invoices_estado", "invoices", ["estado"])
    op.create_index("ix_invoices_created_at", "invoices", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_invoices_created_at", table_name="invoices")
    op.drop_index("ix_invoices_estado", table_name="invoices")
    op.drop_index("ix_invoices_user_id", table_name="invoices")
    op.drop_table("invoices")

    op.drop_index("ix_services_display_order", table_name="services")
    op.drop_index("ix_services_slug", table_name="services")
    op.drop_table("services")
