"""
Optimization routes — generate, review, approve, and push listing changes.

This is the core of Kansa: agents generate optimizations, users approve them,
and approved changes get pushed directly to the store.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.database import get_async_session
from src.integrations.shopify import ShopifyClient
from src.models.optimization import Optimization, OptimizationStatus
from src.models.product import Product
from src.models.store import Store
from src.agents.auditor import AuditorAgent
from src.agents.copywriter import CopywriterAgent
from src.agents.base import AgentContext

router = APIRouter()


# ── Schemas ───────────────────────────────────────────

class OptimizationResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    store_id: uuid.UUID
    field: str
    current_value: str
    proposed_value: str
    reasoning: str
    status: OptimizationStatus
    impact_score: float | None = None
    created_at: datetime | None = None
    pushed_at: datetime | None = None

    model_config = {"from_attributes": True}


class GenerateResponse(BaseModel):
    product_id: uuid.UUID
    optimizations_created: int


class PushResponse(BaseModel):
    pushed: int
    failed: int
    products_updated: int


# ── Generate Optimizations ────────────────────────────

@router.post("/generate/{product_id}", response_model=GenerateResponse)
async def generate_optimizations(
    product_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> GenerateResponse:
    """
    Run Auditor + Copywriter on a product and create optimization proposals.
    """
    # Load product
    result = await session.execute(
        select(Product).where(Product.id == product_id, Product.user_id == user.id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if not product.store_id:
        raise HTTPException(status_code=400, detail="Product must be linked to a store")

    # Build product data dict for agents
    product_data = {
        "title": product.title or "",
        "brand": product.brand or "",
        "description": product.description or "",
        "price": product.price,
        "currency": product.currency or "USD",
        "images": product.images or [],
        "rating": product.rating,
        "review_count": product.review_count,
        "bullet_points": product.bullet_points or [],
        "search_terms": product.metadata_.get("search_terms", []) if product.metadata_ else [],
        "category": product.category or "",
        "platform": product.platform or "shopify",
    }

    context = AgentContext(user_id=user.id)
    created = 0

    # Run Auditor for analysis
    auditor = AuditorAgent()
    audit_result = await auditor.run(context, {"product": product_data})

    # Run Copywriter for optimized copy
    copy_result = None
    try:
        copywriter = CopywriterAgent()
        copy_result = await copywriter.run(context, {
            "product": product_data,
            "audit_data": audit_result.data if audit_result.success else {},
            "platform": product.platform or "shopify",
        })
    except Exception:
        pass  # Copywriter is non-fatal (needs LLM key)

    # Generate title optimization
    if copy_result and copy_result.success and copy_result.data.get("title", {}).get("optimized"):
        opt_title = copy_result.data["title"]["optimized"]
        if opt_title != product.title:
            session.add(Optimization(
                user_id=user.id,
                product_id=product.id,
                store_id=product.store_id,
                field="title",
                current_value=product.title or "",
                proposed_value=opt_title,
                reasoning="AI-optimized title with better keywords, length, and structure for higher search visibility and click-through rate.",
                impact_score=8.0,
            ))
            created += 1

    # Generate description optimization
    if copy_result and copy_result.success and copy_result.data.get("description", {}).get("optimized"):
        opt_desc = copy_result.data["description"]["optimized"]
        if opt_desc != product.description:
            session.add(Optimization(
                user_id=user.id,
                product_id=product.id,
                store_id=product.store_id,
                field="description",
                current_value=product.description or "",
                proposed_value=opt_desc,
                reasoning="Enhanced description with better formatting, benefit-driven copy, and SEO keywords.",
                impact_score=7.0,
            ))
            created += 1

    # Generate tag optimization from audit recommendations
    if audit_result.success:
        weaknesses = audit_result.data.get("weaknesses", [])
        recommendations = audit_result.data.get("recommendations", [])

        # If title is weak and copywriter didn't generate one, use audit insight
        if not created and any("title" in str(w).lower() for w in weaknesses):
            session.add(Optimization(
                user_id=user.id,
                product_id=product.id,
                store_id=product.store_id,
                field="title",
                current_value=product.title or "",
                proposed_value=f"{product.brand + ' ' if product.brand else ''}{product.title or 'Product'} — Premium Quality | Fast Shipping",
                reasoning="Title is too short. Added brand name and benefit keywords for better search visibility.",
                impact_score=7.0,
            ))
            created += 1

    if created:
        await session.commit()

    return GenerateResponse(product_id=product_id, optimizations_created=created)


@router.post("/generate-bulk/{store_id}")
async def generate_bulk_optimizations(
    store_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """Generate optimizations for all products in a store."""
    # Verify store ownership
    result = await session.execute(
        select(Store).where(Store.id == store_id, Store.user_id == user.id)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Get all products for this store
    result = await session.execute(
        select(Product).where(Product.store_id == store_id).limit(50)
    )
    products = list(result.scalars().all())

    total_created = 0
    for product in products:
        try:
            gen = await generate_optimizations(product.id, user, session)
            total_created += gen.optimizations_created
        except Exception:
            continue

    return {"products_processed": len(products), "optimizations_created": total_created}


# ── List / Review ─────────────────────────────────────

@router.get("", response_model=list[OptimizationResponse])
async def list_optimizations(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    status: str | None = None,
    store_id: uuid.UUID | None = None,
    product_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Optimization]:
    """List optimization proposals, filterable by status, store, or product."""
    query = select(Optimization).where(Optimization.user_id == user.id)

    if status:
        query = query.where(Optimization.status == status)
    if store_id:
        query = query.where(Optimization.store_id == store_id)
    if product_id:
        query = query.where(Optimization.product_id == product_id)

    query = query.order_by(Optimization.created_at.desc()).limit(limit).offset(offset)
    result = await session.execute(query)
    return list(result.scalars().all())


# ── Approve / Reject ──────────────────────────────────

@router.post("/{optimization_id}/approve", response_model=OptimizationResponse)
async def approve_optimization(
    optimization_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> Optimization:
    """Approve a single optimization."""
    result = await session.execute(
        select(Optimization).where(
            Optimization.id == optimization_id,
            Optimization.user_id == user.id,
        )
    )
    opt = result.scalar_one_or_none()
    if not opt:
        raise HTTPException(status_code=404, detail="Optimization not found")

    opt.status = OptimizationStatus.APPROVED
    await session.commit()
    return opt


@router.post("/{optimization_id}/reject", response_model=OptimizationResponse)
async def reject_optimization(
    optimization_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> Optimization:
    """Reject an optimization."""
    result = await session.execute(
        select(Optimization).where(
            Optimization.id == optimization_id,
            Optimization.user_id == user.id,
        )
    )
    opt = result.scalar_one_or_none()
    if not opt:
        raise HTTPException(status_code=404, detail="Optimization not found")

    opt.status = OptimizationStatus.REJECTED
    await session.commit()
    return opt


@router.post("/approve-all/{store_id}")
async def approve_all(
    store_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """Approve all pending optimizations for a store."""
    result = await session.execute(
        select(Optimization).where(
            Optimization.store_id == store_id,
            Optimization.user_id == user.id,
            Optimization.status == OptimizationStatus.PENDING,
        )
    )
    opts = list(result.scalars().all())
    for opt in opts:
        opt.status = OptimizationStatus.APPROVED
    await session.commit()
    return {"approved": len(opts)}


# ── Push to Store ─────────────────────────────────────

@router.post("/push/{store_id}", response_model=PushResponse)
async def push_approved(
    store_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> PushResponse:
    """Push all approved optimizations to the Shopify store."""
    # Load store
    result = await session.execute(
        select(Store).where(
            Store.id == store_id,
            Store.user_id == user.id,
            Store.is_connected == True,
        )
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Connected store not found")

    # Create Shopify client
    access_token = (store.credentials or {}).get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Store missing access token")

    client = ShopifyClient(store.store_url, access_token)

    # Load approved optimizations
    result = await session.execute(
        select(Optimization).where(
            Optimization.store_id == store_id,
            Optimization.user_id == user.id,
            Optimization.status == OptimizationStatus.APPROVED,
        )
    )
    opts = list(result.scalars().all())

    if not opts:
        return PushResponse(pushed=0, failed=0, products_updated=0)

    # Group by product
    by_product: dict[uuid.UUID, list[Optimization]] = {}
    for opt in opts:
        by_product.setdefault(opt.product_id, []).append(opt)

    pushed = 0
    failed = 0
    products_updated = 0

    for product_id, product_opts in by_product.items():
        # Get the Shopify product ID
        result = await session.execute(
            select(Product).where(Product.id == product_id)
        )
        product = result.scalar_one_or_none()
        if not product or not product.platform_id:
            for opt in product_opts:
                opt.status = OptimizationStatus.FAILED
            failed += len(product_opts)
            continue

        # Build update payload
        updates: dict = {}
        field_map = {
            "title": "title",
            "description": "body_html",
            "tags": "tags",
        }

        for opt in product_opts:
            shopify_field = field_map.get(opt.field)
            if shopify_field:
                updates[shopify_field] = opt.proposed_value

        if not updates:
            continue

        # Push to Shopify
        try:
            await client.update_product(int(product.platform_id), updates)
            now = datetime.now(timezone.utc)
            for opt in product_opts:
                if opt.field in field_map:
                    opt.status = OptimizationStatus.PUSHED
                    opt.pushed_at = now
                    pushed += 1
            products_updated += 1
        except Exception:
            for opt in product_opts:
                opt.status = OptimizationStatus.FAILED
            failed += len(product_opts)

    await session.commit()
    return PushResponse(pushed=pushed, failed=failed, products_updated=products_updated)
