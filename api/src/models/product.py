"""
Product model — stores scraped product data.

Uses JSONB columns for flexible, platform-specific data
that doesn't fit neatly into a fixed schema.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class Product(Base):
    """
    A product scraped from an ecommerce platform.

    Core fields are typed columns for indexing and querying.
    Platform-specific data goes into JSONB fields for flexibility.
    """

    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    store_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stores.id"), nullable=True, index=True
    )

    # ── Identity ─────────────────────────────────────
    url: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    platform_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # ── Core product info ────────────────────────────
    title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    brand: Mapped[str] = mapped_column(String(255), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(500), nullable=True)

    # ── Pricing ──────────────────────────────────────
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    original_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ── Reviews ──────────────────────────────────────
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    review_count: Mapped[int] = mapped_column(Integer, default=0)

    # ── Flexible data (JSONB) ────────────────────────
    images: Mapped[dict] = mapped_column(JSONB, default=list)
    bullet_points: Mapped[dict] = mapped_column(JSONB, default=list)
    raw_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    # ── Timestamps ───────────────────────────────────
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # ── Relationships ────────────────────────────────
    audits: Mapped[list["AuditResult"]] = relationship(  # noqa: F821
        back_populates="product", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Product {self.platform}:{self.platform_id} '{self.title[:50]}'>"
