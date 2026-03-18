"""
OAuth routes -- Shopify OAuth connection flow.

Handles initiating the OAuth handshake and processing the callback
from Shopify after the merchant grants access.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.config import settings
from src.database import get_async_session
from src.integrations.shopify import (
    build_oauth_url,
    exchange_code,
    normalize_shop_domain,
    verify_hmac,
)
from src.models.store import Store

router = APIRouter()

# In-memory state store for OAuth CSRF tokens.
# TODO: Replace with Valkey/Redis for multi-process deployments.
_pending_states: dict[str, dict] = {}


# -- Schemas ---------------------------------------------------

class ConnectRequest(BaseModel):
    """Request to start a Shopify OAuth connection."""

    shop_domain: str  # e.g. "my-store.myshopify.com"


class ConnectResponse(BaseModel):
    """Response containing the Shopify authorization URL."""

    authorize_url: str


# -- Routes ----------------------------------------------------

@router.post("/shopify/connect", response_model=ConnectResponse)
async def shopify_connect(
    request: ConnectRequest,
    user: User = Depends(current_active_user),
) -> dict:
    """
    Start the Shopify OAuth flow.

    Generates a CSRF state token, stores it alongside the user ID and
    shop domain, and returns the Shopify authorization URL for the
    frontend to redirect the merchant to.
    """
    raw_domain = request.shop_domain.strip().lower()
    if not raw_domain:
        raise HTTPException(status_code=400, detail="shop_domain is required")

    shop_domain = normalize_shop_domain(raw_domain)

    state = secrets.token_urlsafe(32)
    _pending_states[state] = {
        "user_id": str(user.id),
        "shop_domain": shop_domain,
    }

    authorize_url = build_oauth_url(shop_domain, state)
    return {"authorize_url": authorize_url}


@router.get("/shopify/callback")
async def shopify_callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
    shop: str = Query(...),
    hmac: str = Query(..., alias="hmac"),
    session: AsyncSession = Depends(get_async_session),
) -> RedirectResponse:
    """
    Handle the OAuth callback from Shopify.

    Validates the HMAC signature and CSRF state, exchanges the
    temporary code for a permanent access token, and upserts a
    Store record for the user. Redirects to the frontend on success.
    """
    # 1. Validate CSRF state
    pending = _pending_states.pop(state, None)
    if not pending:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

    # 2. Verify HMAC signature from Shopify
    query_params = dict(request.query_params)
    if not verify_hmac(query_params, settings.SHOPIFY_CLIENT_SECRET):
        raise HTTPException(status_code=400, detail="HMAC verification failed")

    # 3. Exchange code for permanent access token
    shop_domain = pending["shop_domain"]
    user_id = pending["user_id"]

    try:
        access_token = await exchange_code(shop_domain, code)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to exchange code with Shopify: {exc}",
        )

    # 4. Upsert store record -- update if shop already connected, create otherwise
    result = await session.execute(
        select(Store).where(
            Store.user_id == user_id,
            Store.platform == "shopify",
            Store.store_url == shop_domain,
        )
    )
    store = result.scalar_one_or_none()

    if store:
        store.credentials = {
            "shop_domain": shop_domain,
            "access_token": access_token,
        }
        store.is_connected = True
    else:
        store = Store(
            user_id=user_id,
            name=shop_domain.replace(".myshopify.com", "").title(),
            platform="shopify",
            store_url=shop_domain,
            is_connected=True,
            credentials={
                "shop_domain": shop_domain,
                "access_token": access_token,
            },
        )
        session.add(store)

    await session.commit()

    # 5. Redirect to frontend dashboard
    redirect_url = f"{settings.WEB_URL}/dashboard?connected=true"
    return RedirectResponse(url=redirect_url)


# -- Direct Token Connection (Custom Apps) -------------------------

class TokenConnectRequest(BaseModel):
    """Connect a store using a custom app's Admin API access token."""
    shop_domain: str
    access_token: str


@router.post("/shopify/connect-token")
async def shopify_connect_token(
    body: TokenConnectRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """
    Connect a Shopify store using a direct Admin API access token.

    For custom apps created in the store's admin panel.
    Validates the token by calling /shop.json before saving.
    """
    shop_domain = normalize_shop_domain(body.shop_domain.strip())
    token = body.access_token.strip()

    if not shop_domain or not token:
        raise HTTPException(status_code=400, detail="shop_domain and access_token are required")

    # Validate the token by calling Shopify
    from src.integrations.shopify import ShopifyClient
    client = ShopifyClient(shop_domain, token)
    try:
        shop_info = await client.get_shop()
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid token or domain — Shopify returned: {exc}",
        )

    store_name = shop_info.get("name", shop_domain.replace(".myshopify.com", "").title())

    # Upsert store record
    result = await session.execute(
        select(Store).where(
            Store.user_id == str(user.id),
            Store.platform == "shopify",
            Store.store_url == shop_domain,
        )
    )
    store = result.scalar_one_or_none()

    if store:
        store.credentials = {"shop_domain": shop_domain, "access_token": token}
        store.name = store_name
        store.is_connected = True
    else:
        store = Store(
            user_id=str(user.id),
            name=store_name,
            platform="shopify",
            store_url=shop_domain,
            is_connected=True,
            credentials={"shop_domain": shop_domain, "access_token": token},
        )
        session.add(store)

    await session.commit()

    return {"ok": True, "store_name": store_name, "store_id": str(store.id)}
