"""grafana_dashboards table

Revision ID: 0009_grafana_dashboards
Revises: 0008_api_keys
Create Date: 2026-04-28

Spec: DATABASE_SCHEMA.md §GRAFANA_DASHBOARDS — mirror del DDL.
Nota: la instancia de Grafana es self-hosted (no Grafana Cloud).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_grafana_dashboards"
down_revision: Union[str, None] = "0008_api_keys"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "grafana_dashboards",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "uid",
            sa.String(length=100),
            nullable=False,
            unique=True,
        ),
        sa.Column("url_embed", sa.Text(), nullable=False),
        sa.Column(
            "variables",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
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
    )
    op.create_index(
        "ix_grafana_dashboards_uid",
        "grafana_dashboards",
        ["uid"],
        unique=True,
    )
    # Partial index para el path de listado público — el query típico es
    # WHERE is_active=TRUE ORDER BY display_order. Las inactivas no inflan
    # el árbol de ordenamiento, igual patrón que api_keys / notifications.
    op.execute(
        """
        CREATE INDEX ix_grafana_dashboards_active_order
        ON grafana_dashboards (display_order, created_at)
        WHERE is_active = TRUE
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_grafana_dashboards_active_order")
    op.drop_index("ix_grafana_dashboards_uid", table_name="grafana_dashboards")
    op.drop_table("grafana_dashboards")
