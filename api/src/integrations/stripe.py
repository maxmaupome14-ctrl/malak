"""
Stripe integration — Checkout and Billing Portal helpers.

Handles creating Checkout Sessions for subscriptions and one-time payments,
and Billing Portal sessions for subscription management.
"""

import stripe

from src.config import settings

stripe.api_key = settings.STRIPE_SECRET_KEY


def create_checkout_session(
    user_id: str,
    email: str,
    price_id: str,
    mode: str = "subscription",
    success_url: str | None = None,
    cancel_url: str | None = None,
) -> str:
    """
    Create a Stripe Checkout session.

    Args:
        user_id: Internal user ID to attach as metadata.
        email: Customer email for the checkout.
        price_id: Stripe Price ID to charge.
        mode: 'subscription' for recurring, 'payment' for one-time (lifetime).
        success_url: Redirect on success.
        cancel_url: Redirect on cancel.

    Returns:
        The Checkout session URL.
    """
    session = stripe.checkout.Session.create(
        customer_email=email,
        mode=mode,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url or f"{settings.WEB_URL}/dashboard?billing=success",
        cancel_url=cancel_url or f"{settings.WEB_URL}/dashboard?billing=canceled",
        metadata={"user_id": user_id},
    )
    return session.url


def create_portal_session(customer_id: str) -> str:
    """
    Create a Stripe Billing Portal session for managing subscriptions.

    Returns:
        The portal session URL.
    """
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{settings.WEB_URL}/dashboard",
    )
    return session.url
