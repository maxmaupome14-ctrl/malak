"""
Shopify mandatory GDPR webhooks.

Required for all apps listed in the Shopify App Store:
- customers/data_request  — merchant requests customer data export
- customers/redact        — merchant requests customer data deletion
- shop/redact             — merchant uninstalls, requests shop data deletion
"""

import hashlib
import hmac
import logging

from fastapi import APIRouter, Request, HTTPException

from src.config import settings

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)


def _verify_shopify_webhook(body: bytes, hmac_header: str) -> bool:
    """Verify the webhook HMAC signature from Shopify."""
    if not hmac_header or not settings.SHOPIFY_CLIENT_SECRET:
        return False
    computed = hmac.new(
        settings.SHOPIFY_CLIENT_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, hmac_header)


async def _get_verified_body(request: Request) -> dict:
    """Read body, verify HMAC, parse JSON."""
    body = await request.body()
    hmac_header = request.headers.get("X-Shopify-Hmac-Sha256", "")

    if not _verify_shopify_webhook(body, hmac_header):
        raise HTTPException(status_code=401, detail="Invalid HMAC signature")

    import json
    return json.loads(body)


@router.post("/customers/data_request")
async def customers_data_request(request: Request):
    """
    Shopify sends this when a merchant requests customer data.
    We respond with 200 — Kansa stores minimal customer data (email only,
    tied to Kansa accounts, not Shopify customers directly).
    """
    payload = await _get_verified_body(request)
    shop_domain = payload.get("shop_domain", "unknown")
    logger.info("GDPR data request from %s", shop_domain)
    # Kansa doesn't store end-customer (shopper) data directly.
    # Merchant data is handled through normal account management.
    return {"status": "ok"}


@router.post("/customers/redact")
async def customers_redact(request: Request):
    """
    Shopify sends this when a merchant requests customer data deletion.
    We respond with 200 — Kansa doesn't store shopper PII.
    """
    payload = await _get_verified_body(request)
    shop_domain = payload.get("shop_domain", "unknown")
    logger.info("GDPR customer redact from %s", shop_domain)
    return {"status": "ok"}


@router.post("/shop/redact")
async def shop_redact(request: Request):
    """
    Shopify sends this 48 hours after a merchant uninstalls the app.
    We must delete all store data associated with this shop.
    """
    payload = await _get_verified_body(request)
    shop_domain = payload.get("shop_domain", "unknown")
    shop_id = payload.get("shop_id")
    logger.info("GDPR shop redact for %s (id=%s)", shop_domain, shop_id)

    # TODO: Delete store, products, optimizations, and audit data
    # for this shop_domain from our database.
    # For now, log and acknowledge — implement full cleanup before App Store submit.

    return {"status": "ok"}
