"""
Audit Pipeline — Orchestrates the agent swarm for a full product audit.

Flow:
    1. Scout scrapes the product URL
    2. Auditor analyzes the listing and generates scores
    3. (Future) Spy finds competitors
    4. (Future) Strategist creates action plan
    5. (Future) Copywriter generates optimized copy
    6. Results saved to database

Each step updates the audit status in DB so the frontend
can show real-time progress.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents.auditor import AuditorAgent
from src.agents.base import AgentContext
from src.agents.scout import ScoutAgent
from src.database import async_session_factory
from src.models.audit import AuditResult, AuditStatus

logger = logging.getLogger(__name__)


async def run_audit_pipeline(ctx: dict, audit_id: str) -> None:
    """
    Full audit pipeline — runs as an arq background job.

    Args:
        ctx: arq worker context (contains Redis pool, etc.)
        audit_id: UUID of the AuditResult to process.
    """
    audit_uuid = UUID(audit_id)

    async with async_session_factory() as session:
        # Load audit record
        result = await session.execute(
            select(AuditResult).where(AuditResult.id == audit_uuid)
        )
        audit = result.scalar_one_or_none()
        if not audit:
            logger.error("Pipeline: audit %s not found", audit_id)
            return

        agent_context = AgentContext(user_id=audit.user_id)

        try:
            # ── Step 1: Scout ─────────────────────────────
            await _update_status(session, audit, AuditStatus.SCRAPING)

            scout = ScoutAgent()
            scout_result = await scout.run(agent_context, {"url": audit.url})

            if not scout_result.success:
                await _fail_audit(
                    session, audit,
                    f"Scraping failed: {', '.join(scout_result.errors)}"
                )
                return

            product_data = scout_result.data.get("product", {})

            # ── Step 2: Auditor ───────────────────────────
            await _update_status(session, audit, AuditStatus.ANALYZING)

            auditor = AuditorAgent()
            auditor_result = await auditor.run(agent_context, {"product": product_data})

            if not auditor_result.success:
                await _fail_audit(
                    session, audit,
                    f"Analysis failed: {', '.join(auditor_result.errors)}"
                )
                return

            # ── Save results ──────────────────────────────
            audit_data = auditor_result.data
            audit.overall_score = audit_data.get("overall_score", 0)
            audit.dimension_scores = audit_data.get("dimension_scores", {})
            audit.strengths = audit_data.get("strengths", [])
            audit.weaknesses = audit_data.get("weaknesses", [])
            audit.recommendations = audit_data.get("recommendations", [])
            audit.status = AuditStatus.COMPLETED
            audit.completed_at = datetime.now(timezone.utc)

            await session.commit()

            logger.info(
                "Pipeline: audit %s completed — score=%s/100",
                audit_id,
                audit.overall_score,
            )

        except Exception as e:
            logger.error("Pipeline: audit %s crashed: %s", audit_id, e, exc_info=True)
            await _fail_audit(session, audit, f"Internal error: {e}")


async def _update_status(session: AsyncSession, audit: AuditResult, status: AuditStatus) -> None:
    """Update audit status and commit."""
    audit.status = status
    await session.commit()
    logger.info("Pipeline: audit %s → %s", audit.id, status.value)


async def _fail_audit(session: AsyncSession, audit: AuditResult, error: str) -> None:
    """Mark audit as failed with error message."""
    audit.status = AuditStatus.FAILED
    audit.error_message = error
    audit.completed_at = datetime.now(timezone.utc)
    await session.commit()
    logger.error("Pipeline: audit %s FAILED — %s", audit.id, error)
