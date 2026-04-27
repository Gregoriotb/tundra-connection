"""SQLAlchemy models. Import here so Alembic los descubre por autogenerate."""

from app.models.user import AccountType, User

__all__ = ["User", "AccountType"]
