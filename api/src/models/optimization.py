"""
Optimization model — stores proposed changes to product listings.

Each optimization is a single field change (title, description, tags, etc.)
with a diff between current and proposed values. Users approve or reject
before changes are pushed to the store.
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class OptimizationStatus(str, PyEnum):
    PENDING = "pending"
    APPROVED = "approved"
    PUSHED = "pushed"
    REJECTED = "rejected"
    FAILED = "failed"


class Optimization(Base):
    """A proposed change to a single field of a product listing."""

    __tablename__ = "optimizations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stores.id"), nullable=False, index=True
    )

    # What field is being changed
    field: Mapped[str] = mapped_column(Text, nullable=False)
    # "title", "description", "tags", "seo_title", "seo_description"

    # The diff
    current_value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    proposed_value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    reasoning: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Metadata
    status: Mapped[OptimizationStatus] = mapped_column(
        Enum(OptimizationStatus, values_callable=lambda e: [m.value for m in e]),
        default=OptimizationStatus.PENDING,
        nullable=False,
    )
    impact_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    pushed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<Optimization {self.id} field={self.field} status={self.status}>"
