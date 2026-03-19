"""
AuditResult model — stores the output of product listing audits.

Each audit is a point-in-time snapshot of a product's quality
assessment, including scores, recommendations, and generated copy.
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class AuditStatus(str, PyEnum):
    """Status of an audit run."""

    PENDING = "pending"
    SCRAPING = "scraping"
    ANALYZING = "analyzing"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class AuditResult(Base):
    """
    A complete audit of a product listing.

    Stores scores, recommendations, and generated copy.
    JSONB fields hold the detailed breakdown.
    """

    __tablename__ = "audit_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=True, index=True
    )

    # ── Input ────────────────────────────────────────
    url: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[AuditStatus] = mapped_column(
        Enum(AuditStatus, values_callable=lambda e: [m.value for m in e]),
        default=AuditStatus.PENDING,
        nullable=False,
    )

    # ── Scores ───────────────────────────────────────
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    dimension_scores: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Example dimension_scores:
    # {
    #     "title": 85,
    #     "images": 60,
    #     "pricing": 90,
    #     "reviews": 75,
    #     "seo": 55,
    #     "content": 70
    # }

    # ── Analysis ─────────────────────────────────────
    strengths: Mapped[list] = mapped_column(JSONB, default=list)
    weaknesses: Mapped[list] = mapped_column(JSONB, default=list)
    recommendations: Mapped[list] = mapped_column(JSONB, default=list)

    # ── Fixit Issues (per-category) ───────────────
    category_issues: Mapped[dict] = mapped_column(JSONB, default=dict)
    # {
    #     "title": [{"issue": "...", "impact": "high", "detail": "...",
    #                 "fix_cost": 5, "fix_action": "Rewrite Title"}],
    #     "bullets": [...], "description": [...],
    #     "images": [...], "keywords": [...], "competitive": [...]
    # }
    fix_costs: Mapped[dict] = mapped_column(JSONB, default=dict)
    # {"title": 5, "bullets": 8, "description": 8, "images": 3, "keywords": 5, "competitive": 10}

    # ── Generated Copy ───────────────────────────────
    generated_copy: Mapped[dict] = mapped_column(JSONB, default=dict)
    # {
    #     "title": {"optimized": "...", "variants": [...]},
    #     "bullets": {"optimized": [...], "variants": [...]},
    #     "description": {"optimized": "...", "variants": [...]}
    # }

    # ── Product Data (scraped) ─────────────────────
    product_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    # {
    #     "title": "...", "brand": "...", "price": 29.99, "currency": "USD",
    #     "images": ["url1", "url2", ...], "video_urls": ["url1", ...],
    #     "rating": 4.5, "review_count": 1234, "asin": "B0...",
    #     "category": "...", "bullet_points": [...]
    # }

    # ── Competitive Intel ────────────────────────────
    competitive_data: Mapped[dict] = mapped_column(JSONB, default=dict)

    # ── Error tracking ───────────────────────────────
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Timestamps ───────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Relationships ────────────────────────────────
    product: Mapped["Product"] = relationship(back_populates="audits")  # noqa: F821

    def __repr__(self) -> str:
        return f"<AuditResult {self.id} status={self.status} score={self.overall_score}>"
