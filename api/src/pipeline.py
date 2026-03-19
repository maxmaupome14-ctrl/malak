"""
Audit Pipeline — Orchestrates the full agent swarm for a product audit.

Flow:
    1. Scout scrapes the product URL
    2. Auditor analyzes the listing and generates scores
    3. Spy generates competitive intelligence (parallel-safe)
    4. Strategist creates an action plan from audit + spy data
    5. Copywriter generates optimized copy from audit data
    6. Results saved to database

Each step updates the audit status in DB so the frontend
can show real-time progress via polling.
"""

import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents.auditor import AuditorAgent
from src.agents.base import AgentContext
from src.agents.copywriter import CopywriterAgent
from src.agents.scout import ScoutAgent
from src.agents.spy import SpyAgent
from src.agents.strategist import StrategistAgent
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
            # ── Step 1: Scout — Scrape the product ─────────
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

            # Store scraped product data for frontend display
            audit.product_data = {
                "title": product_data.get("title", ""),
                "brand": product_data.get("brand", ""),
                "price": product_data.get("price"),
                "currency": product_data.get("currency", "USD"),
                "original_price": product_data.get("original_price"),
                "discount_percent": product_data.get("discount_percent"),
                "images": product_data.get("images", [])[:9],
                "video_urls": product_data.get("video_urls", []),
                "rating": product_data.get("rating"),
                "review_count": product_data.get("review_count", 0),
                "asin": product_data.get("platform_id", ""),
                "category": product_data.get("category", ""),
                "bullet_points": product_data.get("bullet_points", []),
                "in_stock": product_data.get("in_stock", True),
                "seller_name": product_data.get("seller_name", ""),
                "fulfillment": product_data.get("fulfillment", ""),
            }
            await session.commit()

            # ── Step 2: Auditor — Score the listing ────────
            await _update_status(session, audit, AuditStatus.ANALYZING)

            auditor = AuditorAgent()
            auditor_result = await auditor.run(agent_context, {"product": product_data})

            if not auditor_result.success:
                await _fail_audit(
                    session, audit,
                    f"Analysis failed: {', '.join(auditor_result.errors)}"
                )
                return

            audit_data = auditor_result.data

            # Save audit scores + fixit issues immediately
            audit.overall_score = audit_data.get("overall_score", 0)
            audit.dimension_scores = audit_data.get("dimension_scores", {})
            audit.strengths = audit_data.get("strengths", [])
            audit.weaknesses = audit_data.get("weaknesses", [])
            audit.recommendations = audit_data.get("recommendations", [])
            audit.category_issues = audit_data.get("category_issues", {})
            audit.fix_costs = audit_data.get("fix_costs", {})
            await session.commit()

            # ── Step 3: Spy + Copywriter — Run in parallel ─
            await _update_status(session, audit, AuditStatus.GENERATING)

            spy = SpyAgent()
            copywriter = CopywriterAgent()

            spy_task = asyncio.create_task(
                spy.run(agent_context, {"product": product_data})
            )
            copy_task = asyncio.create_task(
                copywriter.run(agent_context, {
                    "product": product_data,
                    "audit_data": audit_data,
                    "platform": product_data.get("platform", "amazon"),
                })
            )

            spy_result, copy_result = await asyncio.gather(
                spy_task, copy_task, return_exceptions=True
            )

            # Extract competitive intel (non-fatal if it fails)
            competitive_data = {}
            if isinstance(spy_result, Exception):
                logger.warning("Pipeline: Spy failed (non-fatal): %s", spy_result)
            elif spy_result.success:
                competitive_data = spy_result.data
                audit.competitive_data = competitive_data

            # Extract generated copy (non-fatal if it fails)
            if isinstance(copy_result, Exception):
                logger.warning("Pipeline: Copywriter failed (non-fatal): %s", copy_result)
            elif copy_result.success:
                audit.generated_copy = copy_result.data

            # ── Step 4: Strategist — Action plan ───────────
            strategist = StrategistAgent()
            strategist_result = await strategist.run(agent_context, {
                "audit_result": audit_data,
                "competitive_intel": competitive_data,
                "product": product_data,
            })

            # Merge strategy into recommendations if successful
            if not isinstance(strategist_result, Exception) and strategist_result.success:
                strategy = strategist_result.data
                # Add strategy data to generated_copy for frontend access
                existing_copy = audit.generated_copy or {}
                existing_copy["strategy"] = {
                    "summary": strategy.get("summary", ""),
                    "quick_wins": strategy.get("quick_wins", []),
                    "strategic_moves": strategy.get("strategic_moves", []),
                    "weekly_plan": strategy.get("weekly_plan", {}),
                    "estimated_score_improvement": strategy.get("estimated_score_improvement", {}),
                }
                audit.generated_copy = existing_copy

            # ── Done ───────────────────────────────────────
            audit.status = AuditStatus.COMPLETED
            audit.completed_at = datetime.now(timezone.utc)
            await session.commit()

            logger.info(
                "Pipeline: audit %s completed — score=%s/100, spy=%s, copy=%s, strategy=%s",
                audit_id,
                audit.overall_score,
                "ok" if competitive_data else "skipped",
                "ok" if audit.generated_copy.get("title") else "skipped",
                "ok" if audit.generated_copy.get("strategy") else "skipped",
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
