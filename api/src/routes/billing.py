"""
Billing routes — Stripe Checkout, Portal, and Webhook handling.

Includes public pricing endpoint, authenticated checkout/portal,
and the Stripe webhook receiver (no auth — called by Stripe).
"""

import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.config import settings
from src.database import get_async_session
from src.integrations.stripe import create_checkout_session, create_portal_session

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────


class CheckoutRequest(BaseModel):
    """Request to start a checkout session."""

    plan: str  # "monthly" or "lifetime"


class CheckoutResponse(BaseModel):
    """Response with the Stripe Checkout URL."""

    url: str


class PortalResponse(BaseModel):
    """Response with the Stripe Billing Portal URL."""

    url: str


class PlansResponse(BaseModel):
    """Public pricing information."""

    publishable_key: str
    plans: list[dict]


# ── Public Routes ─────────────────────────────────────


@router.get("/plans", response_model=PlansResponse)
async def get_plans() -> PlansResponse:
    """Return available plans and the publishable key for the frontend."""
    return PlansResponse(
        publishable_key=settings.STRIPE_PUBLISHABLE_KEY,
        plans=[
            {
                "id": "monthly",
                "name": "Pro Monthly",
                "price_id": settings.STRIPE_PRICE_MONTHLY,
                "mode": "subscription",
            },
            {
                "id": "lifetime",
                "name": "Pro Lifetime",
                "price_id": settings.STRIPE_PRICE_LIFETIME,
                "mode": "payment",
            },
        ],
    )


# ── Authenticated Routes ─────────────────────────────


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    request: CheckoutRequest,
    user: User = Depends(current_active_user),
) -> CheckoutResponse:
    """
    Create a Stripe Checkout session for the given plan.

    - monthly -> subscription mode
    - lifetime -> one-time payment mode
    """
    if request.plan == "monthly":
        price_id = settings.STRIPE_PRICE_MONTHLY
        mode = "subscription"
    elif request.plan == "lifetime":
        price_id = settings.STRIPE_PRICE_LIFETIME
        mode = "payment"
    else:
        raise HTTPException(status_code=400, detail="Invalid plan. Use 'monthly' or 'lifetime'.")

    if not price_id:
        raise HTTPException(status_code=500, detail="Stripe pricing not configured.")

    url = create_checkout_session(
        user_id=str(user.id),
        email=user.email,
        price_id=price_id,
        mode=mode,
    )
    return CheckoutResponse(url=url)


@router.post("/portal", response_model=PortalResponse)
async def create_portal(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> PortalResponse:
    """
    Create a Stripe Billing Portal session for the current user.

    Requires the user to have a stripe_customer_id (i.e., has completed checkout before).
    """
    if not user.stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="No billing account found. Complete a checkout first.",
        )

    url = create_portal_session(user.stripe_customer_id)
    return PortalResponse(url=url)


# ── Webhook (NO auth — Stripe calls this) ────────────


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """
    Stripe webhook receiver.

    Verifies the signature using the raw body and processes billing events.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            settings.STRIPE_WEBHOOK_SECRET,
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(session, data)
    elif event_type == "customer.subscription.updated":
        await _handle_subscription_updated(session, data)
    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_deleted(session, data)
    elif event_type == "invoice.payment_failed":
        await _handle_payment_failed(session, data)
    else:
        logger.debug("Unhandled Stripe event: %s", event_type)

    return {"status": "ok"}


# ── Webhook Handlers ─────────────────────────────────


async def _handle_checkout_completed(session: AsyncSession, data: dict) -> None:
    """Handle checkout.session.completed — activate subscription or lifetime."""
    user_id = data.get("metadata", {}).get("user_id")
    if not user_id:
        logger.warning("checkout.session.completed without user_id in metadata")
        return

    result = await session.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("checkout.session.completed for unknown user_id=%s", user_id)
        return

    user.stripe_customer_id = data.get("customer")

    mode = data.get("mode")
    if mode == "subscription":
        user.subscription_status = "active"
        user.plan_type = "monthly"
        user.subscription_id = data.get("subscription")
    elif mode == "payment":
        # One-time payment = lifetime
        user.subscription_status = "lifetime"
        user.plan_type = "lifetime"
        user.subscription_id = None

    await session.commit()
    logger.info("Billing activated for user_id=%s plan=%s", user_id, user.plan_type)


async def _handle_subscription_updated(session: AsyncSession, data: dict) -> None:
    """Handle customer.subscription.updated — sync status."""
    subscription_id = data.get("id")
    status = data.get("status")  # active, past_due, canceled, etc.

    result = await session.execute(
        select(User).where(User.subscription_id == subscription_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("subscription.updated for unknown subscription_id=%s", subscription_id)
        return

    user.subscription_status = status
    await session.commit()
    logger.info("Subscription updated: user_id=%s status=%s", user.id, status)


async def _handle_subscription_deleted(session: AsyncSession, data: dict) -> None:
    """Handle customer.subscription.deleted — mark canceled."""
    subscription_id = data.get("id")

    result = await session.execute(
        select(User).where(User.subscription_id == subscription_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("subscription.deleted for unknown subscription_id=%s", subscription_id)
        return

    user.subscription_status = "canceled"
    await session.commit()
    logger.info("Subscription canceled: user_id=%s", user.id)


async def _handle_payment_failed(session: AsyncSession, data: dict) -> None:
    """Handle invoice.payment_failed — mark past_due."""
    subscription_id = data.get("subscription")
    if not subscription_id:
        return

    result = await session.execute(
        select(User).where(User.subscription_id == subscription_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("payment_failed for unknown subscription_id=%s", subscription_id)
        return

    user.subscription_status = "past_due"
    await session.commit()
    logger.info("Payment failed — past_due: user_id=%s", user.id)
