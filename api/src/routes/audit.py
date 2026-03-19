"""
Audit routes — run and manage product listing audits.

Includes both public (free tier) and authenticated endpoints.
"""

import uuid
from datetime import datetime

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.config import settings
from src.database import get_async_session
from src.models.audit import AuditResult, AuditStatus

router = APIRouter()


# ── Schemas ───────────────────────────────────────────

class AuditRequest(BaseModel):
    """Request to run a new product audit."""

    url: HttpUrl


class AuditResponse(BaseModel):
    """Response from an audit request."""

    id: uuid.UUID
    url: str
    status: AuditStatus
    overall_score: float | None = None
    dimension_scores: dict = {}
    strengths: list = []
    weaknesses: list = []
    recommendations: list = []
    category_issues: dict = {}
    fix_costs: dict = {}
    generated_copy: dict = {}
    competitive_data: dict = {}
    error_message: str | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


# ── Helpers ──────────────────────────────────────────

def _parse_redis_url(url: str) -> RedisSettings:
    from urllib.parse import urlparse

    parsed = urlparse(url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        database=int(parsed.path.lstrip("/") or 0),
        password=parsed.password,
    )


async def _enqueue_audit(audit_id: str) -> None:
    """Enqueue audit pipeline — runs sync in dev, queues via Redis in prod."""
    if settings.APP_ENV == "development":
        # No arq worker in dev — run pipeline directly
        from src.pipeline import run_audit_pipeline
        await run_audit_pipeline({}, audit_id)
        return

    try:
        redis = await create_pool(_parse_redis_url(settings.VALKEY_URL))
        await redis.enqueue_job("run_audit_pipeline", audit_id)
        await redis.close()
    except Exception:
        from src.pipeline import run_audit_pipeline
        await run_audit_pipeline({}, audit_id)


# ── Public Routes (Free Tier — No Auth) ──────────────

@router.post("/free", response_model=AuditResponse, status_code=201)
async def create_free_audit(
    request: AuditRequest,
    session: AsyncSession = Depends(get_async_session),
) -> AuditResult:
    """
    Start a free product audit — no account required.

    This is the Malak demo: paste a URL, get a full AI audit.
    Anonymous audits have no user_id attached.
    """
    audit = AuditResult(
        user_id=None,
        url=str(request.url),
        status=AuditStatus.PENDING,
    )
    session.add(audit)
    await session.commit()

    await _enqueue_audit(str(audit.id))

    # Refresh — pipeline may have updated the record via its own session
    await session.refresh(audit)
    return audit


@router.get("/status/{audit_id}", response_model=AuditResponse)
async def get_audit_status(
    audit_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
) -> AuditResult:
    """
    Get audit results — public endpoint, works for both free and authenticated audits.

    Used by the frontend to poll for results.
    """
    result = await session.execute(
        select(AuditResult).where(AuditResult.id == audit_id)
    )
    audit = result.scalar_one_or_none()
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    return audit


# ── Authenticated Routes ─────────────────────────────

@router.post("", response_model=AuditResponse, status_code=201)
async def create_audit(
    request: AuditRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> AuditResult:
    """
    Start an audit linked to your account.

    Returns the audit record immediately with status=pending.
    Poll GET /audit/{id} for results.
    """
    audit = AuditResult(
        user_id=user.id,
        url=str(request.url),
        status=AuditStatus.PENDING,
    )
    session.add(audit)
    await session.commit()

    await _enqueue_audit(str(audit.id))

    # Refresh — pipeline may have updated the record via its own session
    await session.refresh(audit)
    return audit


@router.get("/{audit_id}", response_model=AuditResponse)
async def get_audit(
    audit_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> AuditResult:
    """Get the results of a specific audit (owned by current user)."""
    result = await session.execute(
        select(AuditResult).where(
            AuditResult.id == audit_id,
            AuditResult.user_id == user.id,
        )
    )
    audit = result.scalar_one_or_none()
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    return audit


@router.post("/all", response_model=list[dict])
async def audit_all_products(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[dict]:
    """
    Audit all synced products for the current user.

    Runs the rule-based scoring (no LLM call, instant) on every product
    and updates their overall_score. Returns scores for all products.
    """
    from src.agents.auditor import (
        score_title, score_images, score_pricing,
        score_reviews, score_seo, score_content, WEIGHTS,
    )
    from src.models.product import Product

    result = await session.execute(
        select(Product).where(Product.user_id == user.id)
    )
    products = list(result.scalars().all())

    if not products:
        return []

    results = []
    for product in products:
        # Build product dict in the format the auditor expects
        product_data = {
            "title": product.title or "",
            "brand": product.brand or "",
            "price": product.price,
            "images": product.images or [],
            "bullet_points": product.bullet_points or [],
            "description": product.description or "",
            "category": product.category or "",
            "rating": None,
            "review_count": 0,
        }

        # Run all scoring functions
        title_score, title_s, title_w = score_title(product_data)
        image_score, image_s, image_w = score_images(product_data)
        price_score, price_s, price_w = score_pricing(product_data)
        review_score, review_s, review_w = score_reviews(product_data)
        seo_score, seo_s, seo_w = score_seo(product_data)
        content_score, content_s, content_w = score_content(product_data)

        dimension_scores = {
            "title": title_score,
            "images": image_score,
            "pricing": price_score,
            "reviews": review_score,
            "seo": seo_score,
            "content": content_score,
        }

        overall = round(
            sum(dimension_scores[dim] * weight for dim, weight in WEIGHTS.items())
        )

        # Update product score in DB
        product.overall_score = overall
        product.metadata_ = {
            **(product.metadata_ or {}),
            "dimension_scores": dimension_scores,
            "strengths": (title_s + image_s + price_s + review_s + seo_s + content_s)[:5],
            "weaknesses": (title_w + image_w + price_w + review_w + seo_w + content_w)[:5],
        }

        results.append({
            "product_id": str(product.id),
            "title": product.title,
            "overall_score": overall,
            "dimension_scores": dimension_scores,
            "strengths": (title_s + image_s + price_s + review_s + seo_s + content_s)[:5],
            "weaknesses": (title_w + image_w + price_w + review_w + seo_w + content_w)[:5],
        })

    await session.commit()
    return results


@router.get("", response_model=list[AuditResponse])
async def list_audits(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    limit: int = 20,
    offset: int = 0,
) -> list[AuditResult]:
    """List all audits for the current user, newest first."""
    result = await session.execute(
        select(AuditResult)
        .where(AuditResult.user_id == user.id)
        .order_by(AuditResult.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())
