"""SQLAlchemy models. Import here so Alembic los descubre por autogenerate."""

from app.models.api_key import API_KEY_VALID_SCOPES, ApiKey
from app.models.catalog_item import CATALOG_TIPOS, CatalogItem
from app.models.chat_message import CHAT_MESSAGE_TYPES, ChatMessage
from app.models.invoice import INVOICE_ESTADOS, INVOICE_TIPOS, Invoice
from app.models.notification import NOTIFICATION_TIPOS, Notification
from app.models.quotation_thread import QUOTATION_ESTADOS, QuotationThread
from app.models.service import SERVICE_SLUGS, Service
from app.models.support_ticket import (
    TICKET_ESTADOS,
    TICKET_PRIORIDADES,
    TICKET_SERVICIOS,
    TICKET_TIPOS,
    SupportTicket,
)
from app.models.user import AccountType, User

__all__ = [
    "User",
    "AccountType",
    "CatalogItem",
    "CATALOG_TIPOS",
    "Service",
    "SERVICE_SLUGS",
    "Invoice",
    "INVOICE_TIPOS",
    "INVOICE_ESTADOS",
    "QuotationThread",
    "QUOTATION_ESTADOS",
    "ChatMessage",
    "CHAT_MESSAGE_TYPES",
    "Notification",
    "NOTIFICATION_TIPOS",
    "SupportTicket",
    "TICKET_TIPOS",
    "TICKET_SERVICIOS",
    "TICKET_ESTADOS",
    "TICKET_PRIORIDADES",
    "ApiKey",
    "API_KEY_VALID_SCOPES",
]
