"""
Store routes — CRUD operations for user's connected ecommerce stores.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.database import get_async_session
from src.models.store import Store

router = APIRouter()


# ── Schemas ───────────────────────────────────────────

class StoreCreate(BaseModel):
    """Request to connect a new store."""

    name: str
    platform: str  # "amazon" | "shopify" | "walmart" | "mercadolibre"
    store_url: str | None = None
    marketplace: str | None = None


class StoreUpdate(BaseModel):
    """Request to update store settings."""

    name: str | None = None
    store_url: str | None = None
    sync_enabled: bool | None = None
    sync_interval_minutes: int | None = None
    settings: dict | None = None


class StoreResponse(BaseModel):
    """Store data in API responses."""

    id: uuid.UUID
    name: str
    platform: str
    store_url: str | None = None
    marketplace: str | None = None
    is_connected: bool
    sync_enabled: bool
    settings: dict = {}

    model_config = {"from_attributes": True}


# ── Routes ────────────────────────────────────────────

@router.post("", response_model=StoreResponse, status_code=201)
async def create_store(
    request: StoreCreate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> Store:
    """Connect a new ecommerce store."""
    valid_platforms = {"amazon", "shopify", "walmart", "mercadolibre"}
    if request.platform not in valid_platforms:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid platform. Must be one of: {', '.join(valid_platforms)}",
        )

    store = Store(
        user_id=user.id,
        name=request.name,
        platform=request.platform,
        store_url=request.store_url,
        marketplace=request.marketplace,
    )
    session.add(store)
    await session.flush()
    return store


@router.get("", response_model=list[StoreResponse])
async def list_stores(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[Store]:
    """List all connected stores for the current user."""
    result = await session.execute(
        select(Store)
        .where(Store.user_id == user.id)
        .order_by(Store.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{store_id}", response_model=StoreResponse)
async def get_store(
    store_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> Store:
    """Get a specific store by ID."""
    result = await session.execute(
        select(Store).where(Store.id == store_id, Store.user_id == user.id)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


@router.patch("/{store_id}", response_model=StoreResponse)
async def update_store(
    store_id: uuid.UUID,
    request: StoreUpdate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> Store:
    """Update a store's settings."""
    result = await session.execute(
        select(Store).where(Store.id == store_id, Store.user_id == user.id)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(store, field, value)

    await session.flush()
    return store


@router.delete("/{store_id}", status_code=204)
async def delete_store(
    store_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    """Disconnect and delete a store."""
    result = await session.execute(
        select(Store).where(Store.id == store_id, Store.user_id == user.id)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    await session.delete(store)
