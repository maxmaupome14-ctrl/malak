"""
Store model — represents a user's connected ecommerce store.

Users can connect multiple stores (Amazon seller account,
Shopify store, etc.) and track all their products centrally.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class Store(Base):
    """
    A user's connected ecommerce store.

    Stores API credentials (encrypted) and configuration for
    syncing product data.
    """

    __tablename__ = "stores"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )

    # ── Store Identity ───────────────────────────────
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    platform: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Platform options: "amazon", "shopify", "walmart", "mercadolibre"

    store_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    marketplace: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Marketplace: "US", "MX", "UK", etc.

    # ── Connection ───────────────────────────────────
    is_connected: Mapped[bool] = mapped_column(Boolean, default=False)

    # API credentials (encrypted at rest)
    # TODO: Encrypt these fields with application-level encryption
    credentials: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Example for Amazon:
    # {
    #     "seller_id": "...",
    #     "mws_auth_token": "...",
    #     "sp_api_refresh_token": "..."
    # }
    # Example for Shopify:
    # {
    #     "shop_domain": "...",
    #     "access_token": "..."
    # }

    # ── Sync Configuration ───────────────────────────
    sync_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    sync_interval_minutes: Mapped[int] = mapped_column(default=60)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Settings ─────────────────────────────────────
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    # {
    #     "auto_audit": true,
    #     "monitor_competitors": true,
    #     "alert_on_price_change": true,
    #     "alert_threshold_percent": 5
    # }

    # ── Timestamps ───────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<Store {self.name} ({self.platform})>"
