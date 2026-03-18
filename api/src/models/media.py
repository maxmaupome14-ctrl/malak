"""
GeneratedMedia model — persists AI-generated images/videos in the media vault.

Stores base64-encoded image data so generated media survives across sessions.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class GeneratedMedia(Base):
    """An AI-generated or edited media item saved to the user's vault."""

    __tablename__ = "generated_media"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=True, index=True
    )

    # ── Media metadata ────────────────────────────────
    media_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="image"
    )  # "image" or "video"
    prompt_used: Mapped[str] = mapped_column(Text, nullable=False)
    style: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # ── Stored data ───────────────────────────────────
    image_data: Mapped[str] = mapped_column(Text, nullable=False)  # base64 encoded
    thumbnail_data: Mapped[str | None] = mapped_column(Text, nullable=True)  # smaller base64

    # ── Provenance ────────────────────────────────────
    source: Mapped[str] = mapped_column(
        String(20), nullable=False, default="generated"
    )  # "generated", "edited", "uploaded"
    shopify_image_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # ── Timestamps ────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<GeneratedMedia {self.id} type={self.media_type} source={self.source}>"
