"""catalog items table

Revision ID: 0002_catalog_items
Revises: 0001_initial_users
Create Date: 2026-04-27

Spec: DATABASE_SCHEMA.md §CATALOG ITEMS — mirror del DDL.
Constraints extra de seguridad (price>=0, stock>=0) provienen del modelo.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_catalog_items"
down_revision: Union[str, None] = "0001_initial_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "catalog_items",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("tipo", sa.String(length=50), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "stock",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "tipo IN ('router', 'camara', 'equipo_red', 'accesorio')",
            name="catalog_items_tipo_check",
        ),
        sa.CheckConstraint("price >= 0", name="catalog_items_price_non_negative"),
        sa.CheckConstraint("stock >= 0", name="catalog_items_stock_non_negative"),
    )

    op.create_index(
        "ix_catalog_items_is_active",
        "catalog_items",
        ["is_active"],
    )


def downgrade() -> None:
    op.drop_index("ix_catalog_items_is_active", table_name="catalog_items")
    op.drop_table("catalog_items")
