"""
Auto-pilot optimization system — scheduled, hands-free product optimization.

Kansa automatically optimizes products on a schedule (daily, weekly, biweekly).
Uses the same AI optimization logic as the manual optimize flow, but runs
autonomously and only pushes changes when they're meaningfully different.
"""

import logging
import uuid
from datetime import datetime, timezone

from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.database import get_async_session
from src.integrations.shopify import ShopifyClient
from src.models.product import Product
from src.models.store import Store
from src.routes.optimize import (
    SYSTEM_PROMPT,
    _build_user_prompt,
    _call_anthropic,
    _call_openai,
    _parse_json_from_text,
)

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_PRODUCTS_PER_RUN = 50
MAX_RUN_HISTORY = 20
SIMILARITY_THRESHOLD = 0.85  # Only push if content similarity < 85%


# ── Schemas ───────────────────────────────────────────


class EnableRequest(BaseModel):
    store_id: uuid.UUID
    frequency: str = "weekly"  # "daily", "weekly", "biweekly"


class DisableRequest(BaseModel):
    store_id: uuid.UUID


class AutopilotStatus(BaseModel):
    enabled: bool
    frequency: str | None
    last_run: str | None  # ISO timestamp
    next_run: str | None  # ISO timestamp (estimated)
    products_optimized: int


class AutopilotRun(BaseModel):
    store_id: uuid.UUID
    ran_at: str  # ISO timestamp
    products_scanned: int
    products_optimized: int
    changes: list[dict]  # [{product_id, title_changed, description_changed, tags_changed}]
    status: str  # "completed", "partial", "failed"


# ── Helpers ──────────────────────────────────────────


def _is_significantly_different(original: str, optimized: str) -> bool:
    """Return True if the optimized text is meaningfully different from original."""
    if not original and optimized:
        return True
    if not optimized:
        return False
    ratio = SequenceMatcher(None, original.strip().lower(), optimized.strip().lower()).ratio()
    return ratio < SIMILARITY_THRESHOLD


def _get_autopilot_config(store: Store) -> dict:
    """Extract autopilot config from store settings."""
    settings = store.settings or {}
    return settings.get("autopilot", {})


def _set_autopilot_config(store: Store, config: dict) -> None:
    """Write autopilot config into store settings."""
    settings = dict(store.settings or {})
    settings["autopilot"] = config
    store.settings = settings


def _get_run_history(store: Store) -> list[dict]:
    """Extract autopilot run history from store settings."""
    settings = store.settings or {}
    return settings.get("autopilot_runs", [])


def _append_run_history(store: Store, run: dict) -> None:
    """Append a run to history, keeping only the last MAX_RUN_HISTORY entries."""
    settings = dict(store.settings or {})
    history = list(settings.get("autopilot_runs", []))
    history.append(run)
    # Keep only the most recent runs
    if len(history) > MAX_RUN_HISTORY:
        history = history[-MAX_RUN_HISTORY:]
    settings["autopilot_runs"] = history
    store.settings = settings


def _estimate_next_run(config: dict) -> str | None:
    """Estimate the next run time based on frequency and last run."""
    from datetime import timedelta

    last_run_str = config.get("last_run")
    frequency = config.get("frequency", "weekly")

    if not last_run_str:
        # Never run before — next run is now
        return datetime.now(timezone.utc).isoformat()

    try:
        last_run = datetime.fromisoformat(last_run_str)
    except (ValueError, TypeError):
        return datetime.now(timezone.utc).isoformat()

    freq_map = {
        "daily": timedelta(days=1),
        "weekly": timedelta(weeks=1),
        "biweekly": timedelta(weeks=2),
    }
    delta = freq_map.get(frequency, timedelta(weeks=1))
    next_run = last_run + delta
    return next_run.isoformat()


def _total_products_optimized(store: Store) -> int:
    """Count total products optimized across all runs."""
    history = _get_run_history(store)
    return sum(run.get("products_optimized", 0) for run in history)


async def _verify_store_ownership(
    store_id: uuid.UUID, user: User, session: AsyncSession
) -> Store:
    """Load store and verify the user owns it. Raises HTTPException if not."""
    result = await session.execute(
        select(Store).where(
            Store.id == store_id,
            Store.user_id == user.id,
        )
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


# ── Endpoints ────────────────────────────────────────


@router.post("/enable")
async def enable_autopilot(
    body: EnableRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """Enable auto-pilot optimization for a store."""
    if body.frequency not in ("daily", "weekly", "biweekly"):
        raise HTTPException(
            status_code=400,
            detail="frequency must be one of: daily, weekly, biweekly",
        )

    store = await _verify_store_ownership(body.store_id, user, session)

    # Preserve existing last_run if re-enabling
    existing_config = _get_autopilot_config(store)
    config = {
        "enabled": True,
        "frequency": body.frequency,
        "last_run": existing_config.get("last_run"),
    }
    _set_autopilot_config(store, config)

    await session.commit()
    logger.info(
        "Auto-pilot enabled for store %s (frequency=%s, user=%s)",
        store.id, body.frequency, user.id,
    )

    return {
        "ok": True,
        "message": f"Auto-pilot enabled with {body.frequency} frequency",
        "store_id": str(store.id),
        "frequency": body.frequency,
    }


@router.post("/disable")
async def disable_autopilot(
    body: DisableRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """Disable auto-pilot optimization for a store."""
    store = await _verify_store_ownership(body.store_id, user, session)

    config = _get_autopilot_config(store)
    config["enabled"] = False
    _set_autopilot_config(store, config)

    await session.commit()
    logger.info("Auto-pilot disabled for store %s (user=%s)", store.id, user.id)

    return {
        "ok": True,
        "message": "Auto-pilot disabled",
        "store_id": str(store.id),
    }


@router.get("/status/{store_id}", response_model=AutopilotStatus)
async def get_autopilot_status(
    store_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> AutopilotStatus:
    """Get the current auto-pilot status for a store."""
    store = await _verify_store_ownership(store_id, user, session)

    config = _get_autopilot_config(store)
    enabled = config.get("enabled", False)

    return AutopilotStatus(
        enabled=enabled,
        frequency=config.get("frequency") if enabled else None,
        last_run=config.get("last_run"),
        next_run=_estimate_next_run(config) if enabled else None,
        products_optimized=_total_products_optimized(store),
    )


@router.post("/run/{store_id}", response_model=AutopilotRun)
async def run_autopilot(
    store_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> AutopilotRun:
    """
    Manually trigger an auto-pilot optimization run.

    Also used by the scheduler. Loads all products for the store,
    generates AI optimizations, and pushes changes only when they're
    meaningfully different from the original.
    """
    store = await _verify_store_ownership(store_id, user, session)

    # Verify store is connected with valid credentials
    if not store.is_connected:
        raise HTTPException(status_code=400, detail="Store is not connected")

    access_token = (store.credentials or {}).get("access_token")
    shop_domain = (store.credentials or {}).get("shop_domain") or store.store_url
    if not access_token or not shop_domain:
        raise HTTPException(
            status_code=400, detail="Store missing credentials (access_token or shop_domain)"
        )

    # Verify user has an AI API key
    has_openai = bool(user.openai_api_key)
    has_anthropic = bool(user.anthropic_api_key)
    if not has_openai and not has_anthropic:
        raise HTTPException(
            status_code=400,
            detail="No API key configured. Add an OpenAI or Anthropic key in Settings.",
        )

    # Load products for this store (max MAX_PRODUCTS_PER_RUN)
    result = await session.execute(
        select(Product)
        .where(
            Product.store_id == store_id,
            Product.user_id == user.id,
        )
        .limit(MAX_PRODUCTS_PER_RUN)
    )
    products = result.scalars().all()

    if not products:
        raise HTTPException(status_code=404, detail="No products found for this store")

    ran_at = datetime.now(timezone.utc).isoformat()
    changes: list[dict] = []
    products_optimized = 0
    run_status = "completed"
    shopify_client = ShopifyClient(shop_domain, access_token)

    for product in products:
        try:
            # Build prompt (no custom instructions for autopilot)
            user_prompt = _build_user_prompt(product, None)

            # Call AI
            if has_openai:
                logger.info("Autopilot: calling OpenAI for product %s", product.id)
                ai_result = await _call_openai(
                    user.openai_api_key, SYSTEM_PROMPT, user_prompt
                )
            else:
                logger.info("Autopilot: calling Anthropic for product %s", product.id)
                ai_result = await _call_anthropic(
                    user.anthropic_api_key, SYSTEM_PROMPT, user_prompt
                )

            # Validate required keys
            missing = [
                k for k in ("title", "description", "tags")
                if k not in ai_result
            ]
            if missing:
                logger.warning(
                    "Autopilot: AI response missing fields %s for product %s",
                    missing, product.id,
                )
                changes.append({
                    "product_id": str(product.id),
                    "error": f"AI response missing fields: {', '.join(missing)}",
                    "title_changed": False,
                    "description_changed": False,
                    "tags_changed": False,
                })
                continue

            # Compare original vs optimized — only push if significantly different
            original_title = product.title or ""
            original_desc = product.description or ""
            existing_tags = (product.metadata_ or {}).get("tags", "")

            title_changed = _is_significantly_different(original_title, ai_result["title"])
            desc_changed = _is_significantly_different(original_desc, ai_result["description"])
            tags_changed = _is_significantly_different(existing_tags, ai_result["tags"])

            if not (title_changed or desc_changed or tags_changed):
                # No meaningful changes — skip this product
                logger.info(
                    "Autopilot: skipping product %s — no significant changes", product.id
                )
                changes.append({
                    "product_id": str(product.id),
                    "title_changed": False,
                    "description_changed": False,
                    "tags_changed": False,
                    "skipped": True,
                })
                continue

            # Build Shopify update payload — only include changed fields
            shopify_update: dict = {}
            if title_changed:
                shopify_update["title"] = ai_result["title"]
            if desc_changed:
                shopify_update["body_html"] = ai_result["description"]
            if tags_changed:
                shopify_update["tags"] = ai_result["tags"]

            # Push to Shopify
            shopify_product_id = int(product.platform_id)
            await shopify_client.update_product(shopify_product_id, shopify_update)

            # Update local product record
            if title_changed:
                product.title = ai_result["title"]
            if desc_changed:
                product.description = ai_result["description"]
            if tags_changed:
                if product.metadata_ is None:
                    product.metadata_ = {}
                product.metadata_ = {**product.metadata_, "tags": ai_result["tags"]}

            products_optimized += 1
            changes.append({
                "product_id": str(product.id),
                "title_changed": title_changed,
                "description_changed": desc_changed,
                "tags_changed": tags_changed,
            })

            logger.info(
                "Autopilot: optimized product %s (title=%s, desc=%s, tags=%s)",
                product.id, title_changed, desc_changed, tags_changed,
            )

        except Exception as exc:
            logger.error("Autopilot: failed on product %s: %s", product.id, exc)
            run_status = "partial"
            changes.append({
                "product_id": str(product.id),
                "error": str(exc),
                "title_changed": False,
                "description_changed": False,
                "tags_changed": False,
            })

    # If every single product failed, mark the whole run as failed
    if products_optimized == 0 and all(c.get("error") for c in changes):
        run_status = "failed"

    # Build the run report
    run_report = AutopilotRun(
        store_id=store_id,
        ran_at=ran_at,
        products_scanned=len(products),
        products_optimized=products_optimized,
        changes=changes,
        status=run_status,
    )

    # Persist run to history and update last_run timestamp
    _append_run_history(store, run_report.model_dump(mode="json"))

    config = _get_autopilot_config(store)
    config["last_run"] = ran_at
    _set_autopilot_config(store, config)

    await session.commit()

    logger.info(
        "Autopilot run completed for store %s: scanned=%d, optimized=%d, status=%s",
        store_id, len(products), products_optimized, run_status,
    )

    return run_report


@router.get("/history/{store_id}")
async def get_autopilot_history(
    store_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[dict]:
    """Get the history of auto-pilot runs for a store."""
    store = await _verify_store_ownership(store_id, user, session)
    history = _get_run_history(store)
    # Return most recent first
    return list(reversed(history))
