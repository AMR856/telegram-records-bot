"""Initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "listeners",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=True),
        sa.Column("channel_input", sa.String(length=255), nullable=False),
        sa.Column("resolved_chat_id", sa.BigInteger(), nullable=True),
        sa.Column("chat_title", sa.String(length=255), nullable=True),
        sa.Column("bot_username", sa.String(length=64), nullable=True),
        sa.Column("token_encrypted", sa.Text(), nullable=False),
        sa.Column("token_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("token_hint", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_update_id", sa.BigInteger(), nullable=True),
        sa.Column("parser_state", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_listeners_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_listeners"),
    )
    op.create_index("ix_listeners_user_id", "listeners", ["user_id"], unique=False)
    op.create_index(
        "ix_listeners_token_fingerprint", "listeners", ["token_fingerprint"], unique=True
    )

    op.create_table(
        "payments",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("listener_id", sa.Uuid(), nullable=False),
        sa.Column("update_id", sa.BigInteger(), nullable=False),
        sa.Column("message_id", sa.BigInteger(), nullable=True),
        sa.Column("item_index", sa.Integer(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("message_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("value", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("month", sa.SmallInteger(), nullable=False),
        sa.Column("source", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(
            ["listener_id"],
            ["listeners.id"],
            name="fk_payments_listener_id_listeners",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_payments"),
        sa.UniqueConstraint(
            "listener_id",
            "update_id",
            "item_index",
            name="uq_payments_listener_update_item",
        ),
    )
    op.create_index("ix_payments_listener_id", "payments", ["listener_id"], unique=False)
    op.create_index(
        "ix_payments_listener_received",
        "payments",
        ["listener_id", "received_at"],
        unique=False,
    )
    op.create_index(
        "ix_payments_listener_month", "payments", ["listener_id", "month"], unique=False
    )

    op.create_table(
        "listener_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("listener_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("update_id", sa.BigInteger(), nullable=True),
        sa.Column("parsed_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["listener_id"],
            ["listeners.id"],
            name="fk_listener_logs_listener_id_listeners",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_listener_logs"),
    )
    op.create_index(
        "ix_listener_logs_listener_id", "listener_logs", ["listener_id"], unique=False
    )
    op.create_index(
        "ix_listener_logs_listener_created",
        "listener_logs",
        ["listener_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "uq_listener_logs_message_update",
        "listener_logs",
        ["listener_id", "update_id"],
        unique=True,
        postgresql_where=sa.text("update_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_listener_logs_message_update", table_name="listener_logs")
    op.drop_index("ix_listener_logs_listener_created", table_name="listener_logs")
    op.drop_index("ix_listener_logs_listener_id", table_name="listener_logs")
    op.drop_table("listener_logs")
    op.drop_index("ix_payments_listener_month", table_name="payments")
    op.drop_index("ix_payments_listener_received", table_name="payments")
    op.drop_index("ix_payments_listener_id", table_name="payments")
    op.drop_table("payments")
    op.drop_index("ix_listeners_token_fingerprint", table_name="listeners")
    op.drop_index("ix_listeners_user_id", table_name="listeners")
    op.drop_table("listeners")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
