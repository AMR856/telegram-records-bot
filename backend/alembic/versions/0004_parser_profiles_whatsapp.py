"""Add parser profiles and custom payment fields

Revision ID: 0004_parser_profiles_whatsapp
Revises: 0003_payment_currency_message_edits
Create Date: 2026-11-17

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_parser_profiles_whatsapp"
down_revision: str | None = "0003_payment_currency_message_edits"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "parser_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("listener_id", sa.Uuid(), nullable=True),
        sa.Column(
            "kind",
            sa.String(length=16),
            nullable=False,
            server_default="telegram",
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("patterns", sa.JSON(), nullable=False),
        sa.Column("export_columns", sa.JSON(), nullable=False),
        sa.Column(
            "fallback_to_default",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["listener_id"],
            ["listeners.id"],
            name="fk_parser_profiles_listener_id_listeners",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_parser_profiles_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_parser_profiles"),
    )
    op.create_index(
        "ix_parser_profiles_user_id",
        "parser_profiles",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_parser_profiles_listener_id",
        "parser_profiles",
        ["listener_id"],
        unique=True,
    )

    op.add_column("payments", sa.Column("extra", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "extra")
    op.drop_index("ix_parser_profiles_listener_id", table_name="parser_profiles")
    op.drop_index("ix_parser_profiles_user_id", table_name="parser_profiles")
    op.drop_table("parser_profiles")
