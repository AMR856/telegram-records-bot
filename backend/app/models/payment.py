import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utcnow


class Payment(Base):
    __tablename__ = "payments"

    __table_args__ = (
        UniqueConstraint(
            "listener_id", "update_id", "item_index", name="uq_payments_listener_update_item"
        ),
        Index("ix_payments_listener_received", "listener_id", "received_at"),
        Index("ix_payments_listener_month", "listener_id", "month"),
        Index("ix_payments_listener_message", "listener_id", "message_id"),
    )

    # Unique identifier for the payment record. Uses BigInteger for scalability,
    # with a fallback to Integer for SQLite.
    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )

    # Foreign key linking this payment to the specific BotListener that captured it.
    # Deletes the payment if the listener is removed.
    listener_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listeners.id", ondelete="CASCADE"), index=True
    )

    # The ID of the update (e.g., from a Telegram webhook or polling event)
    # that contained this payment information.
    update_id: Mapped[int] = mapped_column(BigInteger)

    # The optional ID of the specific message within the chat or channel
    # that triggered this payment record.
    message_id: Mapped[int | None] = mapped_column(BigInteger)

    # An index used to differentiate multiple distinct payments extracted
    # from the single update or message. Defaults to 0.
    item_index: Mapped[int] = mapped_column(Integer, default=0)

    # The timezone-aware timestamp of when the payment was processed and saved
    # in the database. Defaults to current UTC time.
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # The timezone-aware timestamp of when the original message containing
    # the payment was actually sent in the chat.
    message_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # The monetary amount of the payment, stored as a precise decimal
    # with up to 14 total digits and 2 decimal places.
    value: Mapped[Decimal] = mapped_column(Numeric(14, 2))

    # The name or title associated with the payment, such as the payer's name
    # or the transaction subject.
    name: Mapped[str] = mapped_column(String(255))

    # An optional text field for any additional details, notes, or raw text
    # context about the payment.
    description: Mapped[str | None] = mapped_column(Text)

    # An integer representing the specific month this payment is associated with
    # (e.g., for monthly accounting or subscriptions).
    month: Mapped[int] = mapped_column(SmallInteger)
    
    # The method, origin, or source of the payment. Defaults to "كاش" (Cash).
    source: Mapped[str] = mapped_column(String(255), default="\u0643\u0627\u0634")

    # Currency of the amount. Most entries are Syrian pounds, but some messages use USD.
    currency: Mapped[str] = mapped_column(String(8), default="SYP", server_default="SYP")

    # Distinguishes regular payments from money returned to the customer (refunds).
    kind: Mapped[str] = mapped_column(String(16), default="payment", server_default="payment")

    # SQLAlchemy ORM relationship linking this payment back to its parent BotListener instance.
    listener: Mapped["BotListener"] = relationship(back_populates="payments")  # noqa: F821