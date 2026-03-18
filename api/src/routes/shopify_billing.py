"""
Shopify Billing routes — subscription management through Shopify's Billing API.

For merchants who install Kansa from the Shopify App Store, billing goes through
Shopify (added to their Shopify invoice). Non-Shopify merchants use Stripe instead.

Flow:
  1. POST /billing/shopify/subscribe → creates charge → returns confirmation_url
  2. Merchant approves on Shopify → redirected to callback
  3. GET /billing/shopify/callback → verify status → activate plan
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.config import settings
from src.database import get_async_session
from src.models.store import Store
from src.integrations.shopify import ShopifyClient

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Plans ─────────────────────────────────────────────

SHOPIFY_PLANS = {
    "pro_monthly": {
        "name": "Kansa Pro",
        "price": 99.00,
        "interval": "EVERY_30_DAYS",
        "trial_days": 7,
    },
    "pro_annual": {
        "name": "Kansa Pro (Annual)",
        "price": 799.00,
        "interval": "ANNUAL",
        "trial_days": 14,
    },
}


# ── Schemas ───────────────────────────────────────────


class ShopifySubscribeRequest(BaseModel):
    store_id: str
    plan: str = "pro_monthly"


class ShopifySubscribeResponse(BaseModel):
    confirmation_url: str


class ShopifyBillingStatus(BaseModel):
    has_shopify_subscription: bool
    status: str | None = None
    plan: str | None = None


# ── Routes ────────────────────────────────────────────


@router.get("/shopify/plans")
async def get_shopify_plans():
    """Return available Shopify billing plans."""
    return {
        "plans": [
            {"id": k, "name": v["name"], "price": v["price"], "interval": v["interval"]}
            for k, v in SHOPIFY_PLANS.items()
        ]
    }


@router.post("/shopify/subscribe", response_model=ShopifySubscribeResponse)
async def shopify_subscribe(
    request: ShopifySubscribeRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Start a Shopify billing subscription.

    Creates a RecurringApplicationCharge on Shopify and returns the
    confirmation URL where the merchant approves the charge.
    """
    plan = SHOPIFY_PLANS.get(request.plan)
    if not plan:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {request.plan}")

    # Get the store to find access token
    result = await session.execute(
        select(Store).where(Store.id == request.store_id, Store.user_id == user.id)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    if not store.access_token:
        raise HTTPException(status_code=400, detail="Store not connected (no access token)")

    client = ShopifyClient(store.platform_domain, store.access_token)

    is_test = not settings.is_production
    return_url = f"{settings.API_URL}/billing/shopify/callback?store_id={store.id}&user_id={user.id}"

    try:
        result = await client.create_subscription(
            name=plan["name"],
            price=plan["price"],
            return_url=return_url,
            trial_days=plan["trial_days"],
            test=is_test,
            interval=plan["interval"],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Shopify billing error: %s", e)
        raise HTTPException(status_code=502, detail="Failed to create Shopify subscription")

    # Store the subscription ID on the store for later verification
    store_settings = store.settings or {}
    store_settings["shopify_subscription_id"] = result["subscription_id"]
    store.settings = store_settings
    await session.commit()

    return ShopifySubscribeResponse(confirmation_url=result["confirmation_url"])


@router.get("/shopify/callback")
async def shopify_billing_callback(
    store_id: str = Query(...),
    user_id: str = Query(...),
    charge_id: str = Query(None),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Shopify redirects the merchant here after they approve/decline the charge.

    We verify the subscription status and activate the plan if approved.
    """
    result = await session.execute(
        select(Store).where(Store.id == store_id)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Get subscription ID from store settings
    subscription_id = (store.settings or {}).get("shopify_subscription_id")
    if not subscription_id:
        raise HTTPException(status_code=400, detail="No pending subscription found")

    # Verify with Shopify
    client = ShopifyClient(store.platform_domain, store.access_token)
    try:
        sub_data = await client.get_subscription_status(subscription_id)
    except Exception as e:
        logger.error("Failed to verify Shopify subscription: %s", e)
        return {"status": "error", "redirect": f"{settings.WEB_URL}/dashboard?billing=error"}

    status = sub_data.get("status", "UNKNOWN")

    if status == "ACTIVE":
        # Activate the user's plan
        user_result = await session.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalar_one_or_none()
        if user:
            user.subscription_status = "active"
            user.plan_type = "shopify_pro"

        store_settings = store.settings or {}
        store_settings["shopify_billing_status"] = "active"
        store_settings["shopify_subscription_status"] = status
        store.settings = store_settings

        await session.commit()
        logger.info("Shopify billing activated for store=%s user=%s", store_id, user_id)

        # Redirect to dashboard with success
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=f"{settings.WEB_URL}/dashboard?billing=success")

    # Not approved — redirect with status
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=f"{settings.WEB_URL}/dashboard?billing={status.lower()}")


@router.get("/shopify/status", response_model=ShopifyBillingStatus)
async def shopify_billing_status(
    store_id: str = Query(...),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Check the current Shopify billing status for a store."""
    result = await session.execute(
        select(Store).where(Store.id == store_id, Store.user_id == user.id)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    store_settings = store.settings or {}
    sub_id = store_settings.get("shopify_subscription_id")

    if not sub_id:
        return ShopifyBillingStatus(has_shopify_subscription=False)

    # Check live status from Shopify
    try:
        client = ShopifyClient(store.platform_domain, store.access_token)
        sub_data = await client.get_subscription_status(sub_id)
        return ShopifyBillingStatus(
            has_shopify_subscription=True,
            status=sub_data.get("status"),
            plan=sub_data.get("name"),
        )
    except Exception:
        return ShopifyBillingStatus(
            has_shopify_subscription=True,
            status=store_settings.get("shopify_billing_status", "unknown"),
            plan=store_settings.get("shopify_plan"),
        )
