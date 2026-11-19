"""Add pattern attribution to payments

Revision ID: 0005_payment_pattern_name
Revises: 0004_parser_profiles_whatsapp
Create Date: 2026-11-19

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_payment_pattern_name"
down_revision: str | None = "0004_parser_profiles_whatsapp"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("pattern_name", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("payments", "pattern_name")
