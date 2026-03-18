# Malak AI v2 — Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Malak from an audit-only tool into an AI employee that connects to your Shopify store and pushes optimized changes — with Stripe payments ($99/mo or $1K lifetime).

**Architecture:** Shopify OAuth connects the store, agents generate optimized copy, the Listing Manager shows diffs for approval, and the Shopify Admin API pushes approved changes. Stripe handles billing. The free audit remains as the acquisition hook.

**Tech Stack:** FastAPI, SQLAlchemy (async), Next.js 15, Shopify Admin API (REST), Stripe Checkout + Webhooks, PostgreSQL, arq/Redis

**Current State:** Working audit pipeline (Scout→Auditor), Shopify JSON scraper, 4-tab results UI, JWT auth (backend complete, frontend not wired), PostgreSQL + Redis running locally.

---

## Task Overview

| # | Task | Est. | Depends On |
|---|------|------|------------|
| 1 | Wire up frontend auth (login/register) | 30min | — |
| 2 | Shopify OAuth backend | 45min | — |
| 3 | Shopify OAuth frontend (Connect Store flow) | 30min | T2 |
| 4 | Shopify bulk product import | 30min | T2 |
| 5 | Stripe integration (subscriptions + lifetime) | 45min | — |
| 6 | Subscription gate middleware | 20min | T5 |
| 7 | Listing Manager — generate optimization proposals | 40min | T4 |
| 8 | Listing Manager — UI (approve/reject diffs) | 45min | T7 |
| 9 | Shopify Admin API — push approved changes | 30min | T2, T8 |
| 10 | Dashboard — real data + agent activity | 30min | T1, T4 |
| 11 | Frontend polish + landing page CTA update | 30min | T5 |
| 12 | End-to-end testing + commit | 20min | All |

---

## Task 1: Wire Up Frontend Auth (Login/Register)

**Files:**
- Modify: `web/src/app/login/page.tsx`
- Modify: `web/src/lib/api.ts`
- Create: `web/src/lib/auth.ts`
- Create: `web/src/components/auth-guard.tsx`
- Modify: `web/src/app/dashboard/page.tsx`

**What exists:** Login page UI with email/password toggle between Sign In and Sign Up. Backend auth is complete (fastapi-users JWT at `/auth/jwt/login` and `/auth/register`). API client exists with JWT token in localStorage.

**Step 1: Create auth helper module**

Create `web/src/lib/auth.ts`:
```typescript
const API = process.env.NEXT_PUBLIC_API_URL || "";

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  company_name: string | null;
  is_active: boolean;
}

export async function login(email: string, password: string): Promise<string> {
  // fastapi-users expects form-urlencoded for login
  const res = await fetch(`${API}/auth/jwt/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Login failed");
  }
  const data = await res.json();
  const token = data.access_token;
  localStorage.setItem("malak_token", token);
  return token;
}

export async function register(email: string, password: string): Promise<void> {
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Registration failed");
  }
}

export async function getMe(): Promise<User | null> {
  const token = localStorage.getItem("malak_token");
  if (!token) return null;
  const res = await fetch(`${API}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    localStorage.removeItem("malak_token");
    return null;
  }
  return res.json();
}

export function logout(): void {
  localStorage.removeItem("malak_token");
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem("malak_token");
}
```

**Step 2: Update login page to call real API**

Replace the placeholder setTimeout in `web/src/app/login/page.tsx` with real API calls:
- Sign In: call `login(email, password)`, on success redirect to `/dashboard`
- Sign Up: call `register(email, password)`, then auto-login, redirect to `/dashboard`
- Show error messages from API
- Add loading state on submit button

**Step 3: Create AuthGuard component**

Create `web/src/components/auth-guard.tsx`:
```typescript
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, User } from "@/lib/auth";

export function AuthGuard({ children }: { children: (user: User) => React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then((u) => {
      if (!u) router.push("/login");
      else setUser(u);
      setLoading(false);
    });
  }, [router]);

  if (loading) return <div style={{ /* spinner */ }} />;
  if (!user) return null;
  return <>{children(user)}</>;
}
```

**Step 4: Wrap dashboard with AuthGuard**

Update `web/src/app/dashboard/page.tsx` to use `<AuthGuard>` — redirects to login if not authenticated.

**Step 5: Commit**
```bash
git add web/src/lib/auth.ts web/src/components/auth-guard.tsx web/src/app/login/page.tsx web/src/app/dashboard/page.tsx
git commit -m "feat: wire frontend auth — login, register, auth guard"
```

---

## Task 2: Shopify OAuth Backend

**Files:**
- Create: `api/src/integrations/shopify.py`
- Create: `api/src/routes/oauth.py`
- Modify: `api/src/models/store.py` (add OAuth fields)
- Modify: `api/src/main.py` (mount oauth router)
- Create: `api/alembic/versions/2026_03_17_0002_add_store_oauth_fields.py`

**What exists:** Store model with `credentials: JSONB` and `is_connected: bool`. Stores CRUD routes at `/stores`.

**Context:** Shopify OAuth flow:
1. User clicks "Connect Store" → we redirect to `https://{shop}.myshopify.com/admin/oauth/authorize?client_id=...&scope=...&redirect_uri=...`
2. Shopify redirects back to our callback with `?code=...&shop=...`
3. We exchange the code for a permanent access token
4. We store the token and mark the store as connected

**Step 1: Create Shopify integration module**

Create `api/src/integrations/shopify.py`:
```python
"""
Shopify integration — OAuth and Admin API client.

Handles:
- OAuth authorization flow (install → callback → token exchange)
- Admin API calls (read/write products)
"""

import hashlib
import hmac
import logging
from urllib.parse import urlencode

import httpx

from src.config import settings

logger = logging.getLogger(__name__)

# Scopes needed: read and write products, read orders (for analytics)
SHOPIFY_SCOPES = "read_products,write_products,read_orders"


class ShopifyClient:
    """Client for Shopify Admin API (REST)."""

    def __init__(self, shop_domain: str, access_token: str):
        self.shop_domain = shop_domain
        self.access_token = access_token
        self.base_url = f"https://{shop_domain}/admin/api/2024-10"

    def _headers(self) -> dict:
        return {
            "X-Shopify-Access-Token": self.access_token,
            "Content-Type": "application/json",
        }

    async def get_products(self, limit: int = 50) -> list[dict]:
        """Fetch products from the store."""
        async with httpx.AsyncClient(
            transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"),
            timeout=30.0,
        ) as client:
            products = []
            url = f"{self.base_url}/products.json?limit={limit}"
            while url:
                resp = await client.get(url, headers=self._headers())
                resp.raise_for_status()
                data = resp.json()
                products.extend(data.get("products", []))
                # Pagination via Link header
                link = resp.headers.get("Link", "")
                url = None
                if 'rel="next"' in link:
                    for part in link.split(","):
                        if 'rel="next"' in part:
                            url = part.split("<")[1].split(">")[0]
            return products

    async def get_product(self, product_id: int) -> dict:
        """Fetch a single product."""
        async with httpx.AsyncClient(
            transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"),
            timeout=15.0,
        ) as client:
            resp = await client.get(
                f"{self.base_url}/products/{product_id}.json",
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json().get("product", {})

    async def update_product(self, product_id: int, updates: dict) -> dict:
        """Update a product. Only sends changed fields."""
        async with httpx.AsyncClient(
            transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"),
            timeout=15.0,
        ) as client:
            resp = await client.put(
                f"{self.base_url}/products/{product_id}.json",
                headers=self._headers(),
                json={"product": {"id": product_id, **updates}},
            )
            resp.raise_for_status()
            return resp.json().get("product", {})

    async def get_shop(self) -> dict:
        """Get shop info (name, domain, plan, etc.)."""
        async with httpx.AsyncClient(
            transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"),
            timeout=15.0,
        ) as client:
            resp = await client.get(
                f"{self.base_url}/shop.json",
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json().get("shop", {})


def build_oauth_url(shop_domain: str, state: str) -> str:
    """Build the Shopify OAuth authorization URL."""
    params = {
        "client_id": settings.SHOPIFY_CLIENT_ID,
        "scope": SHOPIFY_SCOPES,
        "redirect_uri": f"{settings.API_URL}/oauth/shopify/callback",
        "state": state,
    }
    return f"https://{shop_domain}/admin/oauth/authorize?{urlencode(params)}"


async def exchange_code(shop_domain: str, code: str) -> str:
    """Exchange authorization code for permanent access token."""
    async with httpx.AsyncClient(
        transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0"),
        timeout=15.0,
    ) as client:
        resp = await client.post(
            f"https://{shop_domain}/admin/oauth/access_token",
            json={
                "client_id": settings.SHOPIFY_CLIENT_ID,
                "client_secret": settings.SHOPIFY_CLIENT_SECRET,
                "code": code,
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


def verify_hmac(query_params: dict, secret: str) -> bool:
    """Verify Shopify's HMAC signature on callback."""
    hmac_value = query_params.pop("hmac", "")
    sorted_params = "&".join(f"{k}={v}" for k, v in sorted(query_params.items()))
    digest = hmac.new(secret.encode(), sorted_params.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, hmac_value)
```

**Step 2: Create OAuth routes**

Create `api/src/routes/oauth.py`:
```python
"""
OAuth routes — handle Shopify (and later MercadoLibre, Walmart) store connections.
"""

import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.config import settings
from src.database import get_async_session
from src.integrations.shopify import ShopifyClient, build_oauth_url, exchange_code
from src.models.store import Store

router = APIRouter()

# In-memory state store (use Redis in production)
_oauth_states: dict[str, dict] = {}


class ConnectShopifyRequest(BaseModel):
    shop_domain: str  # e.g. "my-store.myshopify.com"


@router.post("/shopify/connect")
async def start_shopify_oauth(
    req: ConnectShopifyRequest,
    user: User = Depends(current_active_user),
):
    """Start Shopify OAuth flow — returns URL to redirect the user to."""
    shop = req.shop_domain.strip().lower()
    if not shop.endswith(".myshopify.com"):
        shop = f"{shop}.myshopify.com"

    state = secrets.token_urlsafe(32)
    _oauth_states[state] = {"user_id": str(user.id), "shop": shop}

    return {"authorize_url": build_oauth_url(shop, state)}


@router.get("/shopify/callback")
async def shopify_callback(
    code: str,
    shop: str,
    state: str,
    session: AsyncSession = Depends(get_async_session),
):
    """Handle Shopify OAuth callback — exchange code for token, save store."""
    stored = _oauth_states.pop(state, None)
    if not stored:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

    user_id = uuid.UUID(stored["user_id"])

    # Exchange code for access token
    try:
        access_token = await exchange_code(shop, code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {e}")

    # Get shop info
    client = ShopifyClient(shop, access_token)
    try:
        shop_info = await client.get_shop()
    except Exception:
        shop_info = {}

    # Create or update store record
    result = await session.execute(
        select(Store).where(Store.user_id == user_id, Store.store_url == shop)
    )
    store = result.scalar_one_or_none()

    if store:
        store.credentials = {"access_token": access_token}
        store.is_connected = True
        store.name = shop_info.get("name", store.name)
    else:
        store = Store(
            user_id=user_id,
            name=shop_info.get("name", shop),
            platform="shopify",
            store_url=shop,
            is_connected=True,
            credentials={"access_token": access_token},
        )
        session.add(store)

    await session.commit()

    # Redirect back to frontend dashboard
    return RedirectResponse(f"{settings.WEB_URL}/dashboard?connected=shopify")
```

**Step 3: Add Shopify config to settings**

Add to `api/src/config.py`:
```python
# Shopify OAuth
SHOPIFY_CLIENT_ID: str = ""
SHOPIFY_CLIENT_SECRET: str = ""
```

**Step 4: Mount OAuth router in main.py**

Add to `api/src/main.py`:
```python
from src.routes.oauth import router as oauth_router
app.include_router(oauth_router, prefix="/oauth", tags=["oauth"])
```

**Step 5: Commit**
```bash
git add api/src/integrations/shopify.py api/src/routes/oauth.py api/src/config.py api/src/main.py
git commit -m "feat: Shopify OAuth — connect store, exchange token, save credentials"
```

---

## Task 3: Shopify OAuth Frontend (Connect Store Flow)

**Files:**
- Create: `web/src/app/connect/page.tsx`
- Modify: `web/src/app/dashboard/page.tsx`

**Step 1: Create Connect Store page**

Create `web/src/app/connect/page.tsx`:
- Input field for Shopify store domain (e.g. "my-store" or "my-store.myshopify.com")
- "Connect with Shopify" button
- Calls `POST /oauth/shopify/connect` with the domain
- Redirects browser to the returned `authorize_url`
- After Shopify approves, user lands back at `/dashboard?connected=shopify`

**Step 2: Add "Connect Store" button to dashboard**

Update `web/src/app/dashboard/page.tsx`:
- Check for `?connected=shopify` query param → show success toast
- Add "Connect Store" card that links to `/connect`
- If user has connected stores, show them with status

**Step 3: Commit**
```bash
git add web/src/app/connect/page.tsx web/src/app/dashboard/page.tsx
git commit -m "feat: connect store UI — Shopify OAuth flow from dashboard"
```

---

## Task 4: Shopify Bulk Product Import

**Files:**
- Create: `api/src/routes/products.py`
- Modify: `api/src/main.py` (mount products router)
- Modify: `api/src/models/product.py` (ensure all fields match Shopify data)

**What this does:** After connecting a Shopify store, import all products into our database so we can score them and generate optimization proposals.

**Step 1: Create products route with sync endpoint**

Create `api/src/routes/products.py`:
```python
@router.post("/sync/{store_id}")
async def sync_store_products(store_id: uuid.UUID, user, session):
    """Pull all products from connected Shopify store into our DB."""
    # 1. Load store, verify ownership and connected
    # 2. Create ShopifyClient with stored access_token
    # 3. Fetch all products via paginated API
    # 4. For each product: upsert into products table
    #    - Match on (store_id, platform_id) to avoid duplicates
    #    - Map Shopify fields → Product model fields
    # 5. Return count of imported/updated products

@router.get("")
async def list_products(user, session, store_id=None, limit=50, offset=0):
    """List user's products, optionally filtered by store."""

@router.get("/{product_id}")
async def get_product(product_id: uuid.UUID, user, session):
    """Get a single product with its latest audit score."""
```

**Step 2: Mount in main.py**

```python
from src.routes.products import router as products_router
app.include_router(products_router, prefix="/products", tags=["products"])
```

**Step 3: Commit**
```bash
git add api/src/routes/products.py api/src/main.py
git commit -m "feat: product sync — import all Shopify products into DB"
```

---

## Task 5: Stripe Integration (Subscriptions + Lifetime)

**Files:**
- Create: `api/src/integrations/stripe.py`
- Create: `api/src/routes/billing.py`
- Modify: `api/src/auth/models.py` (add subscription fields to User)
- Modify: `api/src/config.py` (add Stripe settings)
- Modify: `api/src/main.py` (mount billing router)
- Create: `api/alembic/versions/2026_03_17_0003_add_billing_fields.py`

**Step 1: Add Stripe config**

Add to `api/src/config.py`:
```python
# Stripe
STRIPE_SECRET_KEY: str = ""
STRIPE_PUBLISHABLE_KEY: str = ""
STRIPE_WEBHOOK_SECRET: str = ""
STRIPE_PRICE_MONTHLY: str = ""  # price_xxx for $99/mo
STRIPE_PRICE_LIFETIME: str = ""  # price_xxx for $1,000 one-time
```

**Step 2: Add billing fields to User model**

Add to User in `api/src/auth/models.py`:
```python
# Billing
stripe_customer_id: Mapped[str | None] = mapped_column(Text, nullable=True)
subscription_status: Mapped[str | None] = mapped_column(Text, nullable=True)
# "active", "past_due", "canceled", "lifetime", None (free)
subscription_id: Mapped[str | None] = mapped_column(Text, nullable=True)
plan_type: Mapped[str | None] = mapped_column(Text, nullable=True)
# "monthly", "lifetime", None
```

**Step 3: Create Stripe helper module**

Create `api/src/integrations/stripe.py`:
```python
import stripe
from src.config import settings

stripe.api_key = settings.STRIPE_SECRET_KEY

async def create_checkout_session(
    user_id: str,
    email: str,
    price_id: str,
    mode: str = "subscription",  # or "payment" for lifetime
    success_url: str = "",
    cancel_url: str = "",
) -> str:
    """Create a Stripe Checkout session and return the URL."""
    session = stripe.checkout.Session.create(
        customer_email=email,
        mode=mode,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url or f"{settings.WEB_URL}/dashboard?billing=success",
        cancel_url=cancel_url or f"{settings.WEB_URL}/dashboard?billing=canceled",
        metadata={"user_id": user_id},
    )
    return session.url

async def create_portal_session(customer_id: str) -> str:
    """Create a Stripe Customer Portal session for managing subscription."""
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{settings.WEB_URL}/dashboard",
    )
    return session.url
```

**Step 4: Create billing routes**

Create `api/src/routes/billing.py`:
```python
@router.get("/plans")
async def get_plans():
    """Return available plans (public endpoint)."""
    return {
        "monthly": {
            "price": 99,
            "price_id": settings.STRIPE_PRICE_MONTHLY,
            "interval": "month",
        },
        "lifetime": {
            "price": 1000,
            "price_id": settings.STRIPE_PRICE_LIFETIME,
            "interval": "one_time",
        },
        "publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
    }

@router.post("/checkout")
async def create_checkout(plan: str, user, session):
    """Create Stripe Checkout session. plan = 'monthly' | 'lifetime'"""
    # Select price_id and mode based on plan
    # Create checkout session
    # Return { url: "https://checkout.stripe.com/..." }

@router.post("/portal")
async def billing_portal(user, session):
    """Create Stripe Customer Portal session."""
    # Return { url: "https://billing.stripe.com/..." }

@router.post("/webhook")
async def stripe_webhook(request: Request, session):
    """Handle Stripe webhooks — NO AUTH (Stripe calls this)."""
    # Verify webhook signature
    # Handle events:
    #   checkout.session.completed → set subscription_status="active"
    #   customer.subscription.updated → update status
    #   customer.subscription.deleted → set status="canceled"
    #   invoice.payment_failed → set status="past_due"
```

**Step 5: Mount billing router**

Add to `api/src/main.py`:
```python
from src.routes.billing import router as billing_router
app.include_router(billing_router, prefix="/billing", tags=["billing"])
```

**Step 6: Create migration for billing fields**

```bash
cd api && alembic revision --autogenerate -m "add billing fields to users"
alembic upgrade head
```

**Step 7: Commit**
```bash
git add api/src/integrations/stripe.py api/src/routes/billing.py api/src/auth/models.py api/src/config.py api/src/main.py api/alembic/
git commit -m "feat: Stripe billing — monthly subscription + lifetime deal + webhooks"
```

---

## Task 6: Subscription Gate Middleware

**Files:**
- Create: `api/src/auth/subscription.py`
- Modify: `api/src/routes/oauth.py` (gate store connection)
- Modify: `api/src/routes/products.py` (gate product sync)

**Step 1: Create subscription check dependency**

Create `api/src/auth/subscription.py`:
```python
from fastapi import Depends, HTTPException
from src.auth.models import User
from src.auth.router import current_active_user

async def require_subscription(
    user: User = Depends(current_active_user),
) -> User:
    """Dependency that requires an active subscription or lifetime plan."""
    if user.subscription_status not in ("active", "lifetime"):
        raise HTTPException(
            status_code=402,
            detail="Subscription required. Upgrade to connect stores and push changes.",
        )
    return user
```

**Step 2: Gate paid features**

Add `Depends(require_subscription)` to:
- `POST /oauth/shopify/connect` — connecting a store requires a subscription
- `POST /products/sync/{store_id}` — syncing products requires a subscription
- Future: any "push changes" endpoint

The free audit (`POST /audit/free`) remains ungated.

**Step 3: Commit**
```bash
git add api/src/auth/subscription.py api/src/routes/oauth.py api/src/routes/products.py
git commit -m "feat: subscription gate — paid features require active plan"
```

---

## Task 7: Listing Manager — Generate Optimization Proposals

**Files:**
- Create: `api/src/models/optimization.py`
- Create: `api/src/routes/optimizations.py`
- Modify: `api/src/main.py` (mount route)
- Create migration

**What this does:** For each product in the database, the Auditor + Copywriter agents generate proposed changes. These are stored as "optimization proposals" that the user can approve or reject.

**Step 1: Create Optimization model**

Create `api/src/models/optimization.py`:
```python
class OptimizationStatus(str, PyEnum):
    PENDING = "pending"      # Generated, waiting for user review
    APPROVED = "approved"    # User approved, ready to push
    PUSHED = "pushed"        # Successfully pushed to store
    REJECTED = "rejected"    # User rejected
    FAILED = "failed"        # Push to store failed

class Optimization(Base):
    __tablename__ = "optimizations"

    id: UUID pk
    user_id: FK → users
    product_id: FK → products
    store_id: FK → stores

    # What field is being changed
    field: str  # "title", "description", "tags", "seo_title", "seo_description"

    # The diff
    current_value: Text  # What's in the store now
    proposed_value: Text  # What Malak suggests
    reasoning: Text       # Why this change helps

    # Metadata
    status: OptimizationStatus = PENDING
    impact_score: Float  # Estimated impact 1-10
    pushed_at: DateTime | None
    created_at: DateTime (server_default)
```

**Step 2: Create optimization generation endpoint**

Create `api/src/routes/optimizations.py`:
```python
@router.post("/generate/{product_id}")
async def generate_optimizations(product_id, user, session):
    """Run Auditor + Copywriter on a product and create optimization proposals."""
    # 1. Load product from DB (verify user owns it)
    # 2. Run Auditor agent → get recommendations
    # 3. Run Copywriter agent → get optimized copy
    # 4. Create Optimization records for each proposed change:
    #    - Title: current vs optimized
    #    - Description: current vs optimized
    #    - Tags: current vs suggested
    # 5. Return list of proposals

@router.post("/generate-bulk/{store_id}")
async def generate_bulk_optimizations(store_id, user, session):
    """Generate optimizations for all products in a store (sorted by worst score first)."""

@router.get("")
async def list_optimizations(user, session, status=None, store_id=None):
    """List optimization proposals, filterable by status and store."""

@router.post("/{optimization_id}/approve")
async def approve_optimization(optimization_id, user, session):
    """Approve a single optimization — marks it ready to push."""

@router.post("/{optimization_id}/reject")
async def reject_optimization(optimization_id, user, session):
    """Reject an optimization."""

@router.post("/approve-all/{store_id}")
async def approve_all(store_id, user, session):
    """Approve all pending optimizations for a store."""

@router.post("/push/{store_id}")
async def push_approved(store_id, user, session):
    """Push all approved optimizations to the store via Shopify Admin API."""
    # See Task 9
```

**Step 3: Commit**
```bash
git add api/src/models/optimization.py api/src/routes/optimizations.py api/src/main.py api/alembic/
git commit -m "feat: optimization proposals — generate, approve, reject"
```

---

## Task 8: Listing Manager UI (Approve/Reject Diffs)

**Files:**
- Create: `web/src/app/listings/page.tsx`
- Create: `web/src/app/listings/[productId]/page.tsx`
- Modify: `web/src/app/dashboard/page.tsx` (add navigation)

**Step 1: Create Listings page**

`web/src/app/listings/page.tsx`:
- Fetch `GET /products?store_id=...` → show all products in a table/grid
- Each product shows: title, image thumbnail, score, # pending optimizations
- Sort by score (worst first — those need the most help)
- Click a product → goes to `/listings/{productId}`

**Step 2: Create Product Detail / Optimization Review page**

`web/src/app/listings/[productId]/page.tsx`:
- Fetch product data + `GET /optimizations?product_id=...`
- For each optimization, show a **diff view**:
  ```
  TITLE
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Current:  "Milk & Egg Protein Signature Collection"
  Proposed: "NSP Nutrition Milk & Egg Protein Powder — 2lb Premium Blend for Muscle Recovery & Growth"

  Why: Title is too short (39 chars). Added brand name, product type keywords,
       and benefit-driven copy for better search visibility and CTR.

  Impact: 8/10

  [✓ Approve]  [✗ Reject]
  ```
- "Approve All" button at the top
- "Push to Store" button (calls `POST /optimizations/push/{store_id}`)
- Status indicators: pending (yellow), approved (green), pushed (blue), rejected (gray)

**Step 3: Commit**
```bash
git add web/src/app/listings/
git commit -m "feat: listing manager UI — product grid, optimization diffs, approve/reject"
```

---

## Task 9: Shopify Admin API — Push Approved Changes

**Files:**
- Modify: `api/src/routes/optimizations.py` (implement push endpoint)
- Modify: `api/src/integrations/shopify.py` (add field mapping)

**Step 1: Implement the push endpoint**

In `api/src/routes/optimizations.py`, the `push_approved` endpoint:
```python
@router.post("/push/{store_id}")
async def push_approved(store_id, user, session):
    """Push all approved optimizations to Shopify."""
    # 1. Load store, verify ownership + connected
    # 2. Create ShopifyClient with stored token
    # 3. Load all APPROVED optimizations for this store
    # 4. Group by product_id
    # 5. For each product, build the update payload:
    #    field_map = {
    #        "title": "title",
    #        "description": "body_html",
    #        "tags": "tags",
    #        "seo_title": {"metafields_global_title_tag": value},
    #        "seo_description": {"metafields_global_description_tag": value},
    #    }
    # 6. Call shopify_client.update_product(platform_id, updates)
    # 7. Mark optimizations as "pushed" with timestamp
    # 8. Log the change for audit trail
    # 9. Return summary: { pushed: 5, failed: 0, products_updated: 2 }
```

**Step 2: Add change logging**

Each push creates a record so the user can see what changed and when. Store the before/after in the optimization record (already has `current_value` and `proposed_value`).

**Step 3: Commit**
```bash
git add api/src/routes/optimizations.py api/src/integrations/shopify.py
git commit -m "feat: push optimizations to Shopify — Admin API integration"
```

---

## Task 10: Dashboard — Real Data + Agent Activity

**Files:**
- Modify: `web/src/app/dashboard/page.tsx`
- Modify: `api/src/routes/reports.py` (flesh out summary endpoint)

**Step 1: Backend — flesh out reports/summary**

Update `GET /reports/summary` to return real data:
```json
{
  "total_audits": 12,
  "total_products": 47,
  "connected_stores": 1,
  "pending_optimizations": 23,
  "pushed_this_month": 15,
  "average_score": 62,
  "worst_products": [...],   // Bottom 5 by score
  "recent_activity": [...]   // Last 10 agent actions
}
```

**Step 2: Frontend — wire dashboard to API**

Update `web/src/app/dashboard/page.tsx`:
- Fetch `/reports/summary` on mount
- Display real stats in the cards
- Show connected stores with status
- Show "worst products" list (link to listing manager)
- Show recent agent activity feed
- "Run Full Store Audit" button → triggers bulk optimization generation
- Navigation: Listings, Connect Store, Billing

**Step 3: Commit**
```bash
git add web/src/app/dashboard/page.tsx api/src/routes/reports.py
git commit -m "feat: dashboard with real data — stats, activity feed, navigation"
```

---

## Task 11: Frontend Polish + Landing Page CTA Update

**Files:**
- Modify: `web/src/app/page.tsx` (update CTAs, pricing section)
- Create: `web/src/app/pricing/page.tsx`
- Modify: `web/src/app/layout.tsx` (add nav bar)

**Step 1: Update landing page**

- Keep the free audit URL input (the hook)
- Update hero copy: "Your AI employee that runs your ecommerce store"
- Add pricing section: $99/mo or $1,000 lifetime (links to Stripe Checkout)
- Update agent cards to emphasize DOING not REPORTING
- Add "Connect Your Store" CTA after the audit results

**Step 2: Create pricing page**

`web/src/app/pricing/page.tsx`:
- Two cards: Monthly ($99) and Lifetime ($1,000)
- Feature list: Store connection, auto-optimization, competitive monitoring, etc.
- "Get Started" buttons → if logged in, create Stripe Checkout; if not, redirect to register
- "Free" column: Audit only, no account

**Step 3: Add navigation bar**

Update `web/src/app/layout.tsx`:
- Sticky nav: Logo | Pricing | Audit | Dashboard (if logged in) | Login/Logout
- Responsive (hamburger on mobile)

**Step 4: Commit**
```bash
git add web/src/app/page.tsx web/src/app/pricing/page.tsx web/src/app/layout.tsx
git commit -m "feat: frontend polish — landing CTAs, pricing page, navigation"
```

---

## Task 12: End-to-End Testing + Final Commit

**Step 1: Test the full flow manually**

1. Open http://localhost:3000 → landing page loads
2. Paste a Shopify URL → free audit completes with scores
3. Click "Get Started" → go to register
4. Register → auto-login → redirect to dashboard
5. Dashboard shows empty state with "Connect Store" CTA
6. Click "Connect Store" → enter Shopify domain → OAuth flow
7. After connecting → products sync → listing manager shows products
8. Click a product → see optimization proposals with diffs
9. Approve optimizations → push to store
10. Dashboard shows real stats

**Step 2: Test Stripe flow**

1. Go to pricing → click "$99/mo" → Stripe Checkout opens
2. Use test card `4242424242424242` → success
3. Redirect back to dashboard → subscription_status = "active"
4. "Connect Store" is now available (was gated before)

**Step 3: Fix any issues found**

**Step 4: Final commit**
```bash
git add -A
git commit -m "feat: Malak v2 Phase 1 — store connection, auto-optimization, Stripe billing"
```

---

## Acceptance Criteria (Phase 1 Complete When...)

- [ ] User can register, login, and see their dashboard
- [ ] User can connect a Shopify store via OAuth
- [ ] All products are imported from connected store
- [ ] Each product gets scored and optimization proposals generated
- [ ] User can review diffs (current vs proposed) for each field
- [ ] User can approve/reject individual optimizations
- [ ] Approved optimizations are pushed to Shopify via Admin API
- [ ] Stripe subscription ($99/mo) and lifetime ($1K) work
- [ ] Paid features are gated (store connection, push changes)
- [ ] Free audit still works without account
- [ ] Dashboard shows real data (stats, products, activity)
- [ ] Landing page has updated copy + pricing section

## Environment Variables Needed

Add to `.env`:
```
SHOPIFY_CLIENT_ID=        # From Shopify Partners dashboard
SHOPIFY_CLIENT_SECRET=    # From Shopify Partners dashboard
STRIPE_SECRET_KEY=        # From Stripe dashboard (sk_test_...)
STRIPE_PUBLISHABLE_KEY=   # From Stripe dashboard (pk_test_...)
STRIPE_WEBHOOK_SECRET=    # From Stripe CLI or dashboard (whsec_...)
STRIPE_PRICE_MONTHLY=     # Create in Stripe: $99/mo recurring
STRIPE_PRICE_LIFETIME=    # Create in Stripe: $1,000 one-time
```

## Dependencies to Add

```bash
# Backend
pip install stripe

# pyproject.toml
"stripe>=8.0.0",
```
