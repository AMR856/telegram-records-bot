from datetime import UTC, datetime

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Defines a standard naming convention for database constraints (indexes, unique constraints, check constraints, foreign keys, and primary keys). This is critical for generating reliable and predictable Alembic migrations.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


# A helper function that returns the current UTC time as a timezone-aware datetime object. Used as a default for timestamp columns.
def utcnow() -> datetime:
    return datetime.now(UTC)


# The foundational base class for all SQLAlchemy ORM models in the application. It applies the custom MetaData with the strict naming convention to all tables inheriting from it.
class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)