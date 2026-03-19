"""Add category_issues and fix_costs columns to audit_results.

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers
revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("audit_results", sa.Column("category_issues", JSONB, server_default="{}"))
    op.add_column("audit_results", sa.Column("fix_costs", JSONB, server_default="{}"))


def downgrade() -> None:
    op.drop_column("audit_results", "fix_costs")
    op.drop_column("audit_results", "category_issues")
