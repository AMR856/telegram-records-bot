import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow


class ParserProfile(Base):
    __tablename__ = "parser_profiles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    listener_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("listeners.id", ondelete="CASCADE"), unique=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(16), default="telegram", server_default="telegram")
    name: Mapped[str] = mapped_column(String(100), default="Profile 1")
    patterns: Mapped[list] = mapped_column(JSON, default=list)
    export_columns: Mapped[list] = mapped_column(JSON, default=list)
    fallback_to_default: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
