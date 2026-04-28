"""seed initial services

Revision ID: 0004_seed_services
Revises: 0003_services_invoices
Create Date: 2026-04-27

Spec:
- Orquestor.md §FASE 3: "Seed data de 3 servicios con planes JSONB"
- Productos del negocio:
    · Fibra Óptica   — instalación base $50,  planes 50Mbps→1Gbps
    · Satelital      — instalación base $120, planes 10Mbps→100Mbps
    · Servicios Extras — chat-cotización (sin planes fijos)

Los precios y planes son seed inicial. El admin podrá editarlos en FASE 8.
La migración es idempotente: usa ON CONFLICT (slug) DO NOTHING.
"""
from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_seed_services"
down_revision: Union[str, None] = "0003_services_invoices"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Datos de los 3 servicios ────────────────────────────────────────────────

FIBRA_PLANES = [
    {
        "id": "fibra_50",
        "nombre": "Fibra 50 Mbps",
        "velocidad": "50mb",
        "precio_mensual": 25.00,
        "tipo_plan": "residencial",
        "caracteristicas": ["Simétrico", "IP dinámica", "Soporte 24/7"],
    },
    {
        "id": "fibra_100",
        "nombre": "Fibra 100 Mbps",
        "velocidad": "100mb",
        "precio_mensual": 40.00,
        "tipo_plan": "residencial",
        "caracteristicas": ["Simétrico", "IP dinámica", "Soporte 24/7"],
    },
    {
        "id": "fibra_200",
        "nombre": "Fibra 200 Mbps",
        "velocidad": "200mb",
        "precio_mensual": 65.00,
        "tipo_plan": "residencial",
        "caracteristicas": ["Simétrico", "IP estática opcional", "Soporte 24/7"],
    },
    {
        "id": "fibra_500",
        "nombre": "Fibra 500 Mbps",
        "velocidad": "500mb",
        "precio_mensual": 110.00,
        "tipo_plan": "empresarial",
        "caracteristicas": [
            "Simétrico",
            "IP estática incluida",
            "SLA empresarial",
            "Soporte prioritario",
        ],
    },
    {
        "id": "fibra_1000",
        "nombre": "Fibra 1 Gbps",
        "velocidad": "1gb",
        "precio_mensual": 180.00,
        "tipo_plan": "empresarial",
        "caracteristicas": [
            "Simétrico",
            "IP estática incluida",
            "SLA empresarial",
            "Soporte 24/7 dedicado",
        ],
    },
]

SATELITAL_PLANES = [
    {
        "id": "sat_10",
        "nombre": "Satelital 10 Mbps",
        "velocidad": "10mb",
        "precio_mensual": 55.00,
        "tipo_plan": "residencial",
        "caracteristicas": ["Cobertura nacional", "Instalación incluida"],
    },
    {
        "id": "sat_25",
        "nombre": "Satelital 25 Mbps",
        "velocidad": "25mb",
        "precio_mensual": 90.00,
        "tipo_plan": "residencial",
        "caracteristicas": ["Cobertura nacional", "Instalación incluida"],
    },
    {
        "id": "sat_50",
        "nombre": "Satelital 50 Mbps",
        "velocidad": "50mb",
        "precio_mensual": 140.00,
        "tipo_plan": "empresarial",
        "caracteristicas": [
            "Cobertura nacional",
            "Soporte 24/7",
            "Equipo profesional",
        ],
    },
    {
        "id": "sat_100",
        "nombre": "Satelital 100 Mbps",
        "velocidad": "100mb",
        "precio_mensual": 220.00,
        "tipo_plan": "empresarial",
        "caracteristicas": [
            "Cobertura nacional",
            "SLA empresarial",
            "Soporte dedicado",
        ],
    },
]

SERVICES_SEED = [
    {
        "slug": "fibra_optica",
        "name": "Internet por Fibra Óptica",
        "subtitle": "Velocidad simétrica de hasta 1 Gbps",
        "description": (
            "Conexión directa por fibra hasta tu hogar o empresa. "
            "Velocidades simétricas, latencia mínima y estabilidad de nivel "
            "empresarial. Instalación profesional incluida."
        ),
        "icon_name": "Wifi",
        "precio_instalacion_base": 50.00,
        "planes": FIBRA_PLANES,
        "display_order": 1,
    },
    {
        "slug": "satelital",
        "name": "Internet Satelital",
        "subtitle": "Cobertura donde la fibra no llega",
        "description": (
            "Internet satelital para zonas rurales, industriales o de difícil "
            "acceso. Cobertura nacional y equipo profesional incluido."
        ),
        "icon_name": "Satellite",
        "precio_instalacion_base": 120.00,
        "planes": SATELITAL_PLANES,
        "display_order": 2,
    },
    {
        "slug": "servicios_extras",
        "name": "Servicios Técnicos",
        "subtitle": "Circuito cerrado, servidores, consultoría",
        "description": (
            "Soluciones a medida: cámaras de seguridad, servidores, "
            "redes empresariales, mantenimiento y consultoría. Cotización "
            "personalizada a través de chat directo con nuestro equipo."
        ),
        "icon_name": "Settings",
        "precio_instalacion_base": 0.00,
        "planes": [],
        "display_order": 3,
    },
]


# ── Operaciones ────────────────────────────────────────────────────────────


def upgrade() -> None:
    bind = op.get_bind()
    insert_sql = sa.text(
        """
        INSERT INTO services (
            id, slug, name, subtitle, description, icon_name,
            precio_instalacion_base, planes, is_active, display_order, created_at
        )
        VALUES (
            :id, :slug, :name, :subtitle, :description, :icon_name,
            :precio_instalacion_base, CAST(:planes AS jsonb),
            TRUE, :display_order, NOW()
        )
        ON CONFLICT (slug) DO NOTHING
        """
    )

    for entry in SERVICES_SEED:
        bind.execute(
            insert_sql,
            {
                "id": str(uuid.uuid4()),
                "slug": entry["slug"],
                "name": entry["name"],
                "subtitle": entry["subtitle"],
                "description": entry["description"],
                "icon_name": entry["icon_name"],
                "precio_instalacion_base": entry["precio_instalacion_base"],
                "planes": json.dumps(entry["planes"]),
                "display_order": entry["display_order"],
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM services WHERE slug IN "
            "('fibra_optica', 'satelital', 'servicios_extras')"
        )
    )
