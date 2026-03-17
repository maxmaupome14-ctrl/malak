"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-17

Creates all initial tables: users, stores, products, audit_results.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Users (fastapi-users + custom fields) ──────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True, index=True),
        sa.Column("hashed_password", sa.String(1024), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("company_name", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── Stores ──────────────────────────────────────────
    op.create_table(
        "stores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(50), nullable=False, index=True),
        sa.Column("store_url", sa.Text(), nullable=True),
        sa.Column("marketplace", sa.String(50), nullable=True),
        sa.Column("is_connected", sa.Boolean(), server_default="false"),
        sa.Column("credentials", postgresql.JSONB(), server_default="{}"),
        sa.Column("sync_enabled", sa.Boolean(), server_default="true"),
        sa.Column("sync_interval_minutes", sa.Integer(), server_default="60"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("settings", postgresql.JSONB(), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Products ────────────────────────────────────────
    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("store_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("stores.id"), nullable=True, index=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("platform", sa.String(50), nullable=False, index=True),
        sa.Column("platform_id", sa.String(100), nullable=False, index=True),
        sa.Column("title", sa.Text(), nullable=False, server_default=""),
        sa.Column("brand", sa.String(255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(500), nullable=True),
        sa.Column("price", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(10), server_default="USD"),
        sa.Column("original_price", sa.Float(), nullable=True),
        sa.Column("rating", sa.Float(), nullable=True),
        sa.Column("review_count", sa.Integer(), server_default="0"),
        sa.Column("images", postgresql.JSONB(), server_default="[]"),
        sa.Column("bullet_points", postgresql.JSONB(), server_default="[]"),
        sa.Column("raw_data", postgresql.JSONB(), server_default="{}"),
        sa.Column("metadata", postgresql.JSONB(), server_default="{}"),
        sa.Column("scraped_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Audit Results ───────────────────────────────────
    op.create_table(
        "audit_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True, index=True),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=True, index=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "scraping", "analyzing", "generating", "completed", "failed", name="auditstatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("overall_score", sa.Float(), nullable=True),
        sa.Column("dimension_scores", postgresql.JSONB(), server_default="{}"),
        sa.Column("strengths", postgresql.JSONB(), server_default="[]"),
        sa.Column("weaknesses", postgresql.JSONB(), server_default="[]"),
        sa.Column("recommendations", postgresql.JSONB(), server_default="[]"),
        sa.Column("generated_copy", postgresql.JSONB(), server_default="{}"),
        sa.Column("competitive_data", postgresql.JSONB(), server_default="{}"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("audit_results")
    op.drop_table("products")
    op.drop_table("stores")
    op.drop_table("users")
