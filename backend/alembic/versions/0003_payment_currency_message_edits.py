"""Add payment currency/kind, message ids and edit tracking

Revision ID: 0003_payment_currency_message_edits
Revises: 0002_user_is_active_token_version
Create Date: 2026-11-07

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_payment_currency_message_edits"
down_revision: Union[str, None] = "0002_user_is_active_token_version"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="SYP"),
    )
    op.add_column(
        "payments",
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="payment"),
    )
    op.create_index(
        "ix_payments_listener_message",
        "payments",
        ["listener_id", "message_id"],
    )

    op.add_column("listener_logs", sa.Column("message_id", sa.BigInteger(), nullable=True))
    op.add_column(
        "listener_logs",
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("listener_logs", sa.Column("parser_state", sa.JSON(), nullable=True))
    op.create_index(
        "uq_listener_logs_listener_message",
        "listener_logs",
        ["listener_id", "message_id"],
        unique=True,
        postgresql_where=sa.text("message_id IS NOT NULL"),
        sqlite_where=sa.text("message_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_listener_logs_listener_message", table_name="listener_logs")
    op.drop_column("listener_logs", "parser_state")
    op.drop_column("listener_logs", "edited_at")
    op.drop_column("listener_logs", "message_id")

    op.drop_index("ix_payments_listener_message", table_name="payments")
    op.drop_column("payments", "kind")
    op.drop_column("payments", "currency")
