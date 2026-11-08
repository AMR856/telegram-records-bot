import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utcnow


# Define an enumeration for the different kinds of logs that can be recorded
# for a listener, including messages and events
class LogKind(StrEnum):
    MESSAGE = "message"
    EVENT = "event"


# Define an enumeration for the different levels of logs that can be recorded
# for a listener, including info, warning, and error
class LogLevel(StrEnum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class ListenerLog(Base):
    __tablename__ = "listener_logs"
    __table_args__ = (
        Index(
            "uq_listener_logs_message_update",
            "listener_id",
            "update_id",
            unique=True,
            postgresql_where=text("update_id IS NOT NULL"),
            sqlite_where=text("update_id IS NOT NULL"),
        ),
        Index(
            "uq_listener_logs_listener_message",
            "listener_id",
            "message_id",
            unique=True,
            postgresql_where=text("message_id IS NOT NULL"),
            sqlite_where=text("message_id IS NOT NULL"),
        ),
        Index("ix_listener_logs_listener_created", "listener_id", "created_at"),
    )

    # Unique identifier for the log entry. Uses BigInteger for scalability,
    # but falls back to standard Integer in SQLite.
    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    
    # Foreign key referencing the 'listeners' table. Automatically deletes the log
    # if the associated listener is deleted.
    listener_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listeners.id", ondelete="CASCADE"), index=True
    )
    
    # The type of log entry (e.g., 'event' or 'message'). Defaults to LogKind.EVENT.
    kind: Mapped[str] = mapped_column(String(16), default=LogKind.EVENT)
    
    # The severity level of the log (e.g., 'info', 'warning', 'error'). Defaults to LogLevel.INFO.
    level: Mapped[str] = mapped_column(String(16), default=LogLevel.INFO)
    
    # The actual content or description of the log entry.
    text: Mapped[str] = mapped_column(Text)
    
    # An optional identifier for the specific update (e.g., webhook or polling
    # update) that triggered this log.
    update_id: Mapped[int | None] = mapped_column(BigInteger)
    
    # The Telegram message id, used to match later edits and deletions to the original message.
    message_id: Mapped[int | None] = mapped_column(BigInteger)
    
    # The timezone-aware timestamp of the last edit received for this message.
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    
    # Parser state captured just before the message was processed, so edits
    # can be re-parsed faithfully.
    parser_state: Mapped[dict | None] = mapped_column(JSON)
    
    # A counter tracking how many times this specific log or update has been parsed/processed.
    parsed_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # The timezone-aware timestamp of when the log was created, defaulting to the current UTC time.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # SQLAlchemy ORM relationship linking this log back to its parent BotListener instance.
    listener: Mapped["BotListener"] = relationship(back_populates="logs")  # noqa: F821