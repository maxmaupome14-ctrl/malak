"""
Audit routes — run and manage product listing audits.

Includes both public (free tier) and authenticated endpoints.
"""

import uuid
from datetime import datetime, timezone

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, HTTPException, Request
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
    generated_copy: dict = {}
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
    """Enqueue audit pipeline — falls back to sync if Redis unavailable."""
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
    await session.flush()

    await _enqueue_audit(str(audit.id))

    await session.commit()
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
    await session.flush()

    await _enqueue_audit(str(audit.id))

    await session.commit()
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
