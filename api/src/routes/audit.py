"""
Audit routes — run and manage product listing audits.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
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
    created_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


# ── Routes ────────────────────────────────────────────

@router.post("", response_model=AuditResponse, status_code=201)
async def create_audit(
    request: AuditRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> AuditResult:
    """
    Start a new product listing audit.

    The audit runs asynchronously through the agent pipeline:
    1. Scout scrapes the product URL
    2. Auditor analyzes the listing
    3. Spy gathers competitive intel (optional)
    4. Strategist generates action plan
    5. Copywriter generates optimized copy

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

    # TODO: Enqueue the audit pipeline as a background task
    # await arq_pool.enqueue_job("run_audit_pipeline", audit.id)

    return audit


@router.get("/{audit_id}", response_model=AuditResponse)
async def get_audit(
    audit_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> AuditResult:
    """Get the results of a specific audit."""
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
