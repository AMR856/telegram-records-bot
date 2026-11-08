import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utcnow


class User(Base):
    __tablename__ = "users"

    # Unique identifier for the user. Automatically generates a UUID4 upon creation.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # The user's email address, used for authentication. It is unique and indexed for fast lookups.
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)

    # The securely hashed version of the user's password. Raw passwords should never be stored here.
    password_hash: Mapped[str] = mapped_column(String(255))

    # Whether the account can sign in. Deactivated accounts keep their data but lose access.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())

    # Incremented to revoke existing sessions after a password reset or deactivation.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Timezone-aware timestamp marking when the account was created. Defaults to current UTC time.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Relationship to all BotListeners owned by this user. Deleting the user also deletes them.
    listeners: Mapped[list["BotListener"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )
