"""
Product routes — sync, list, and retrieve products from connected stores.
"""

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.models import User
from src.auth.router import current_active_user
from src.database import get_async_session
from src.integrations.shopify import ShopifyClient
from src.models.product import Product
from src.models.store import Store

router = APIRouter()


# ── Schemas ───────────────────────────────────────────


class SyncResponse(BaseModel):
    """Response from a product sync operation."""

    imported: int
    updated: int


class ProductListItem(BaseModel):
    """Product summary for list endpoints."""

    id: uuid.UUID
    title: str
    brand: str | None = None
    price: float | None = None
    image: str | None = None
    platform: str
    overall_score: float | None = None

    model_config = {"from_attributes": True}


class ProductDetail(BaseModel):
    """Full product data."""

    id: uuid.UUID
    store_id: uuid.UUID | None = None
    url: str
    platform: str
    platform_id: str
    title: str
    brand: str | None = None
    description: str | None = None
    category: str | None = None
    price: float | None = None
    currency: str = "USD"
    original_price: float | None = None
    rating: float | None = None
    review_count: int = 0
    images: list = []
    bullet_points: list = []
    metadata_: dict = {}
    scraped_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# ── Helpers ──────────────────────────────────────────


def _strip_html(html: str | None) -> str:
    """Strip HTML tags from a string."""
    if not html:
        return ""
    return re.sub(r"<[^>]+>", "", html).strip()


def _extract_image_urls(images: list[dict]) -> list[str]:
    """Extract image src URLs from Shopify image objects."""
    return [img.get("src", "") for img in images if img.get("src")]


# ── Routes ────────────────────────────────────────────


@router.post("/sync/{store_id}", response_model=SyncResponse)
async def sync_products(
    store_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """
    Sync products from a connected Shopify store.

    Fetches all products from the Shopify Admin API and upserts
    them into the products table, matching on (store_id, platform_id).
    """
    # Load store and verify ownership
    result = await session.execute(
        select(Store).where(Store.id == store_id, Store.user_id == user.id)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    if not store.is_connected:
        raise HTTPException(status_code=400, detail="Store is not connected")

    # Extract credentials
    access_token = store.credentials.get("access_token")
    shop_domain = store.credentials.get("shop_domain", store.store_url)
    if not access_token or not shop_domain:
        raise HTTPException(
            status_code=400,
            detail="Store credentials are incomplete. Please reconnect.",
        )

    # Fetch products from Shopify
    client = ShopifyClient(shop_domain, access_token)
    try:
        shopify_products = await client.get_products()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch products from Shopify: {exc}",
        )

    imported = 0
    updated = 0

    for sp in shopify_products:
        platform_id = str(sp["id"])

        # Check if product already exists
        existing_result = await session.execute(
            select(Product).where(
                Product.store_id == store_id,
                Product.platform_id == platform_id,
            )
        )
        existing = existing_result.scalar_one_or_none()

        # Map Shopify fields
        title = sp.get("title", "")
        description = _strip_html(sp.get("body_html"))
        brand = sp.get("vendor")
        category = sp.get("product_type")
        images = _extract_image_urls(sp.get("images", []))
        tags = sp.get("tags", "")
        search_terms = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

        # Price from first variant
        variants = sp.get("variants", [])
        price = None
        if variants:
            try:
                price = float(variants[0].get("price", 0))
            except (ValueError, TypeError):
                price = None

        product_url = f"https://{shop_domain}/products/{sp.get('handle', '')}"
        now = datetime.now(timezone.utc)

        if existing:
            existing.title = title
            existing.description = description
            existing.brand = brand
            existing.category = category
            existing.images = images
            existing.price = price
            existing.url = product_url
            existing.metadata_ = {"search_terms": search_terms}
            existing.scraped_at = now
            updated += 1
        else:
            product = Product(
                user_id=user.id,
                store_id=store_id,
                url=product_url,
                platform="shopify",
                platform_id=platform_id,
                title=title,
                description=description,
                brand=brand,
                category=category,
                images=images,
                price=price,
                metadata_={"search_terms": search_terms},
                scraped_at=now,
            )
            session.add(product)
            imported += 1

    await session.commit()

    # Update store last_synced_at
    store.last_synced_at = datetime.now(timezone.utc)
    await session.commit()

    return {"imported": imported, "updated": updated}


@router.get("", response_model=list[ProductListItem])
async def list_products(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    store_id: uuid.UUID | None = Query(None, description="Filter by store"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    """
    List products for the current user.

    Optionally filter by store_id. Returns paginated results
    with the first image and latest audit score.
    """
    query = (
        select(Product)
        .where(Product.user_id == user.id)
        .options(selectinload(Product.audits))
    )

    if store_id:
        query = query.where(Product.store_id == store_id)

    query = query.order_by(Product.created_at.desc()).limit(limit).offset(offset)

    result = await session.execute(query)
    products = list(result.scalars().all())

    items = []
    for p in products:
        # Get latest audit score if any
        overall_score = None
        if p.audits:
            # Sort audits by created_at desc, take first completed one
            completed = [a for a in p.audits if a.overall_score is not None]
            if completed:
                completed.sort(key=lambda a: a.created_at, reverse=True)
                overall_score = completed[0].overall_score

        items.append(
            {
                "id": p.id,
                "title": p.title,
                "brand": p.brand,
                "price": p.price,
                "image": p.images[0] if p.images else None,
                "platform": p.platform,
                "overall_score": overall_score,
            }
        )

    return items


@router.get("/{product_id}", response_model=ProductDetail)
async def get_product(
    product_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> Product:
    """Get a single product by ID, verifying ownership."""
    result = await session.execute(
        select(Product).where(
            Product.id == product_id,
            Product.user_id == user.id,
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
