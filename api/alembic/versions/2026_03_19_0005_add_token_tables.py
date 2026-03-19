"""Add token_wallets and token_transactions tables.

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "token_wallets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), unique=True, nullable=False, index=True),
        sa.Column("balance", sa.Integer, default=0, nullable=False),
        sa.Column("total_purchased", sa.Integer, default=0, nullable=False),
        sa.Column("total_spent", sa.Integer, default=0, nullable=False),
        sa.Column("total_bonus", sa.Integer, default=0, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "token_transactions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("wallet_id", UUID(as_uuid=True), sa.ForeignKey("token_wallets.id"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("type", sa.Enum("purchase", "bonus", "fix", "refund", name="transactiontype"), nullable=False),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("balance_after", sa.Integer, nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("stripe_payment_id", sa.Text, nullable=True),
        sa.Column("audit_id", UUID(as_uuid=True), sa.ForeignKey("audit_results.id"), nullable=True),
        sa.Column("fix_category", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("token_transactions")
    op.drop_table("token_wallets")
    op.execute("DROP TYPE IF EXISTS transactiontype")
