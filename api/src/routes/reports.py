"""
Report routes — retrieve and manage audit reports.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.database import get_async_session
from src.models.audit import AuditResult, AuditStatus

router = APIRouter()


# ── Schemas ───────────────────────────────────────────

class ReportSummary(BaseModel):
    """Summary statistics across all audits."""

    total_audits: int
    completed_audits: int
    average_score: float | None
    best_score: float | None
    worst_score: float | None
    audits_this_week: int


class AuditReportItem(BaseModel):
    """Brief audit entry for report listings."""

    id: uuid.UUID
    url: str
    status: AuditStatus
    overall_score: float | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


# ── Routes ────────────────────────────────────────────

@router.get("/summary", response_model=ReportSummary)
async def get_report_summary(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ReportSummary:
    """Get summary statistics across all user's audits."""
    # Total and completed counts
    total_result = await session.execute(
        select(func.count(AuditResult.id)).where(AuditResult.user_id == user.id)
    )
    total_audits = total_result.scalar() or 0

    completed_result = await session.execute(
        select(func.count(AuditResult.id)).where(
            AuditResult.user_id == user.id,
            AuditResult.status == AuditStatus.COMPLETED,
        )
    )
    completed_audits = completed_result.scalar() or 0

    # Score statistics
    score_result = await session.execute(
        select(
            func.avg(AuditResult.overall_score),
            func.max(AuditResult.overall_score),
            func.min(AuditResult.overall_score),
        ).where(
            AuditResult.user_id == user.id,
            AuditResult.overall_score.isnot(None),
        )
    )
    score_row = score_result.one()
    avg_score = float(score_row[0]) if score_row[0] is not None else None
    best_score = float(score_row[1]) if score_row[1] is not None else None
    worst_score = float(score_row[2]) if score_row[2] is not None else None

    # Audits this week
    from datetime import timedelta, timezone

    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    week_result = await session.execute(
        select(func.count(AuditResult.id)).where(
            AuditResult.user_id == user.id,
            AuditResult.created_at >= week_ago,
        )
    )
    audits_this_week = week_result.scalar() or 0

    return ReportSummary(
        total_audits=total_audits,
        completed_audits=completed_audits,
        average_score=avg_score,
        best_score=best_score,
        worst_score=worst_score,
        audits_this_week=audits_this_week,
    )


@router.get("/history", response_model=list[AuditReportItem])
async def get_audit_history(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    limit: int = 50,
    offset: int = 0,
) -> list[AuditResult]:
    """Get paginated audit history for reports view."""
    result = await session.execute(
        select(AuditResult)
        .where(AuditResult.user_id == user.id)
        .order_by(AuditResult.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())
