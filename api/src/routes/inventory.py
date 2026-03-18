"""
Inventory routes — stock monitoring and low-inventory alerts for connected stores.

Reads inventory/stock data from Shopify and alerts when products are running low.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.database import get_async_session
from src.integrations.shopify import ShopifyClient
from src.models.product import Product
from src.models.store import Store

router = APIRouter()


# ── Schemas ───────────────────────────────────────────


class InventoryVariant(BaseModel):
    """A single product variant with stock info."""

    variant_id: int
    title: str
    inventory_quantity: int
    sku: str


class InventoryItem(BaseModel):
    """Product with aggregated stock status."""

    product_id: uuid.UUID | None  # local product ID, None if not synced yet
    platform_id: str
    title: str
    image: str | None
    variants: list[InventoryVariant]
    total_stock: int
    status: str  # "critical" (<critical_threshold), "low" (<low_threshold), "ok"


class InventorySettings(BaseModel):
    """Configurable alert thresholds for a store."""

    critical_threshold: int = 5
    low_threshold: int = 20
    alert_enabled: bool = True


class InventorySettingsResponse(BaseModel):
    """Response after saving inventory settings."""

    store_id: uuid.UUID
    settings: InventorySettings


# ── Helpers ──────────────────────────────────────────


def _get_stock_status(total: int, critical: int, low: int) -> str:
    """Determine stock status based on thresholds."""
    if total < critical:
        return "critical"
    if total < low:
        return "low"
    return "ok"


def _get_inventory_settings(store: Store) -> InventorySettings:
    """Extract inventory settings from store metadata, falling back to defaults."""
    raw = (store.settings or {}).get("inventory_settings", {})
    return InventorySettings(**raw) if raw else InventorySettings()


async def _load_store(
    store_id: uuid.UUID,
    user: User,
    session: AsyncSession,
) -> Store:
    """Load a store and verify ownership + connection status."""
    result = await session.execute(
        select(Store).where(Store.id == store_id, Store.user_id == user.id)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    if not store.is_connected:
        raise HTTPException(status_code=400, detail="Store is not connected")

    return store


def _get_shopify_client(store: Store) -> ShopifyClient:
    """Build a ShopifyClient from store credentials."""
    access_token = store.credentials.get("access_token")
    shop_domain = store.credentials.get("shop_domain", store.store_url)
    if not access_token or not shop_domain:
        raise HTTPException(
            status_code=400,
            detail="Store credentials are incomplete. Please reconnect.",
        )
    return ShopifyClient(shop_domain, access_token)


async def _fetch_inventory_items(
    store: Store,
    session: AsyncSession,
    critical_threshold: int,
    low_threshold: int,
) -> list[InventoryItem]:
    """
    Fetch inventory from Shopify and enrich with local product IDs.

    Returns a list of InventoryItem sorted by total_stock ascending (lowest first).
    """
    client = _get_shopify_client(store)

    try:
        shopify_items = await client.get_inventory_levels()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch inventory from Shopify: {exc}",
        )

    # Build a map of platform_id -> local product ID for matching
    result = await session.execute(
        select(Product.platform_id, Product.id).where(
            Product.store_id == store.id,
            Product.platform == "shopify",
        )
    )
    platform_to_local: dict[str, uuid.UUID] = {
        row.platform_id: row.id for row in result.all()
    }

    items: list[InventoryItem] = []
    for si in shopify_items:
        platform_id = si["shopify_product_id"]
        total = si["total_stock"]

        items.append(
            InventoryItem(
                product_id=platform_to_local.get(platform_id),
                platform_id=platform_id,
                title=si["title"],
                image=si["image"],
                variants=[InventoryVariant(**v) for v in si["variants"]],
                total_stock=total,
                status=_get_stock_status(total, critical_threshold, low_threshold),
            )
        )

    # Sort by stock level, lowest first
    items.sort(key=lambda item: item.total_stock)
    return items


# ── Routes ────────────────────────────────────────────


@router.get("/status/{store_id}", response_model=list[InventoryItem])
async def get_inventory_status(
    store_id: uuid.UUID,
    critical_threshold: int = Query(5, ge=0, description="Units below this = critical"),
    low_threshold: int = Query(20, ge=0, description="Units below this = low"),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[InventoryItem]:
    """
    Get inventory status for all products in a store.

    Returns every product with stock levels, sorted by lowest stock first.
    Thresholds can be overridden via query params; otherwise store-level
    settings (or defaults) are used.
    """
    store = await _load_store(store_id, user, session)

    # Use store-level settings as defaults if the caller didn't override
    saved = _get_inventory_settings(store)
    ct = critical_threshold if critical_threshold != 5 else saved.critical_threshold
    lt = low_threshold if low_threshold != 20 else saved.low_threshold

    return await _fetch_inventory_items(store, session, ct, lt)


@router.get("/alerts/{store_id}", response_model=list[InventoryItem])
async def get_inventory_alerts(
    store_id: uuid.UUID,
    critical_threshold: int = Query(5, ge=0, description="Units below this = critical"),
    low_threshold: int = Query(20, ge=0, description="Units below this = low"),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[InventoryItem]:
    """
    Get only low and critical stock items for a store.

    Same as /status but filtered to items with status != "ok".
    """
    store = await _load_store(store_id, user, session)

    saved = _get_inventory_settings(store)
    ct = critical_threshold if critical_threshold != 5 else saved.critical_threshold
    lt = low_threshold if low_threshold != 20 else saved.low_threshold

    all_items = await _fetch_inventory_items(store, session, ct, lt)
    return [item for item in all_items if item.status in ("critical", "low")]


@router.post("/settings/{store_id}", response_model=InventorySettingsResponse)
async def save_inventory_settings(
    store_id: uuid.UUID,
    body: InventorySettings,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """
    Configure inventory alert thresholds for a store.

    Persists settings in the store's settings JSONB column under
    the key "inventory_settings".
    """
    store = await _load_store(store_id, user, session)

    # Merge into existing settings dict
    current_settings = dict(store.settings or {})
    current_settings["inventory_settings"] = body.model_dump()
    store.settings = current_settings

    await session.commit()

    return {
        "store_id": store.id,
        "settings": body,
    }
