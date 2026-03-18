"""add optimizations table and billing fields

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-17

Adds:
- optimizations table for storing proposed product changes
- stripe/billing columns on users table
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- Optimizations table --
    op.create_table(
        "optimizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("store_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("field", sa.Text(), nullable=False),
        sa.Column("current_value", sa.Text(), nullable=False, server_default=""),
        sa.Column("proposed_value", sa.Text(), nullable=False, server_default=""),
        sa.Column("reasoning", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "status",
            sa.Enum("pending", "approved", "pushed", "rejected", "failed", name="optimizationstatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("impact_score", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("pushed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_optimizations_user_id", "optimizations", ["user_id"])
    op.create_index("ix_optimizations_product_id", "optimizations", ["product_id"])
    op.create_index("ix_optimizations_store_id", "optimizations", ["store_id"])

    # -- Billing fields on users --
    op.add_column("users", sa.Column("stripe_customer_id", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("subscription_status", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("subscription_id", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("plan_type", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "plan_type")
    op.drop_column("users", "subscription_id")
    op.drop_column("users", "subscription_status")
    op.drop_column("users", "stripe_customer_id")

    op.drop_index("ix_optimizations_store_id", table_name="optimizations")
    op.drop_index("ix_optimizations_product_id", table_name="optimizations")
    op.drop_index("ix_optimizations_user_id", table_name="optimizations")
    op.drop_table("optimizations")
    op.execute("DROP TYPE IF EXISTS optimizationstatus")
