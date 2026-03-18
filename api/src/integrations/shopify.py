"""
Shopify integration — OAuth helpers and Admin API client.

Handles the full OAuth flow (authorize URL, code exchange, HMAC verification)
and provides an async client for the Shopify Admin REST API.
"""

import hashlib
import hmac
import urllib.parse
from typing import Any

import httpx

from src.config import settings

# Shopify Admin API version
API_VERSION = "2026-01"

# Scopes requested during OAuth
SCOPES = (
    "read_products,write_products,"
    "read_orders,"
    "read_inventory,write_inventory,"
    "read_themes,write_themes,"
    "read_content,write_content"
)

def _make_client(timeout: int = 30) -> httpx.AsyncClient:
    """Create an httpx client with IPv4-forced transport for Windows compatibility."""
    transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0")
    return httpx.AsyncClient(transport=transport, timeout=timeout)


# ── Admin API Client ─────────────────────────────────────


class ShopifyClient:
    """Async client for the Shopify Admin REST API."""

    def __init__(self, shop_domain: str, access_token: str) -> None:
        self.shop_domain = shop_domain
        self.access_token = access_token
        self.base_url = f"https://{shop_domain}/admin/api/{API_VERSION}"

    def _headers(self) -> dict[str, str]:
        return {
            "X-Shopify-Access-Token": self.access_token,
            "Content-Type": "application/json",
        }

    async def get_products(self, limit: int = 50) -> list[dict[str, Any]]:
        """
        Fetch all products with Link-header pagination.

        Returns a flat list of product dicts.
        """
        products: list[dict[str, Any]] = []
        url: str | None = f"{self.base_url}/products.json?limit={limit}"

        async with _make_client() as client:
            while url:
                resp = await client.get(url, headers=self._headers())
                resp.raise_for_status()
                data = resp.json()
                products.extend(data.get("products", []))

                # Follow pagination via Link header
                url = _parse_next_link(resp.headers.get("link"))

        return products

    async def get_product(self, product_id: int) -> dict[str, Any]:
        """Fetch a single product by ID."""
        async with _make_client() as client:
            resp = await client.get(
                f"{self.base_url}/products/{product_id}.json",
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()["product"]

    async def update_product(self, product_id: int, updates: dict[str, Any]) -> dict[str, Any]:
        """
        Update a product. Only the fields present in *updates* are sent.
        """
        payload = {"product": {"id": product_id, **updates}}
        async with _make_client() as client:
            resp = await client.put(
                f"{self.base_url}/products/{product_id}.json",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()["product"]

    async def get_inventory_levels(self) -> list[dict[str, Any]]:
        """
        Fetch products with variant inventory quantities.

        Uses /products.json which includes variants with inventory_quantity.
        Returns a flat list of dicts with shopify_product_id, title, image,
        variants (with inventory info), and total_stock.
        """
        products = await self.get_products()
        items: list[dict[str, Any]] = []
        for p in products:
            variants = []
            for v in p.get("variants", []):
                variants.append({
                    "variant_id": v["id"],
                    "title": v.get("title", "Default"),
                    "inventory_quantity": v.get("inventory_quantity", 0),
                    "sku": v.get("sku", ""),
                })
            total = sum(v.get("inventory_quantity", 0) for v in p.get("variants", []))
            items.append({
                "shopify_product_id": str(p["id"]),
                "title": p.get("title", ""),
                "image": p["images"][0]["src"] if p.get("images") else None,
                "variants": variants,
                "total_stock": total,
            })
        return items

    async def graphql(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute a GraphQL query against the Shopify Admin API."""
        payload: dict[str, Any] = {"query": query}
        if variables:
            payload["variables"] = variables
        async with _make_client() as client:
            resp = await client.post(
                f"https://{self.shop_domain}/admin/api/{API_VERSION}/graphql.json",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def create_subscription(
        self,
        name: str,
        price: float,
        return_url: str,
        trial_days: int = 7,
        test: bool = False,
        interval: str = "EVERY_30_DAYS",
    ) -> dict[str, Any]:
        """
        Create a recurring app subscription via Shopify Billing API (GraphQL).

        Returns dict with 'confirmation_url' and 'subscription_id'.
        Merchant must visit confirmation_url to approve the charge.
        """
        mutation = """
        mutation AppSubscriptionCreate(
          $name: String!
          $lineItems: [AppSubscriptionLineItemInput!]!
          $returnUrl: URL!
          $test: Boolean
          $trialDays: Int
        ) {
          appSubscriptionCreate(
            name: $name
            lineItems: $lineItems
            returnUrl: $returnUrl
            test: $test
            trialDays: $trialDays
          ) {
            userErrors {
              field
              message
            }
            appSubscription {
              id
              status
            }
            confirmationUrl
          }
        }
        """
        variables = {
            "name": name,
            "returnUrl": return_url,
            "test": test,
            "trialDays": trial_days,
            "lineItems": [
                {
                    "plan": {
                        "appRecurringPricingDetails": {
                            "price": {"amount": price, "currencyCode": "USD"},
                            "interval": interval,
                        }
                    }
                }
            ],
        }
        result = await self.graphql(mutation, variables)
        data = result.get("data", {}).get("appSubscriptionCreate", {})
        errors = data.get("userErrors", [])
        if errors:
            raise ValueError(f"Shopify billing error: {errors}")
        return {
            "confirmation_url": data.get("confirmationUrl"),
            "subscription_id": data.get("appSubscription", {}).get("id"),
            "status": data.get("appSubscription", {}).get("status"),
        }

    async def get_subscription_status(self, subscription_id: str) -> dict[str, Any]:
        """Check the status of a Shopify app subscription."""
        query = """
        query {
          node(id: "%s") {
            ... on AppSubscription {
              id
              status
              name
              createdAt
              currentPeriodEnd
              lineItems {
                plan {
                  pricingDetails {
                    ... on AppRecurringPricing {
                      price {
                        amount
                        currencyCode
                      }
                      interval
                    }
                  }
                }
              }
            }
          }
        }
        """ % subscription_id
        result = await self.graphql(query)
        return result.get("data", {}).get("node", {})

    async def get_shop(self) -> dict[str, Any]:
        """Fetch store metadata from /shop.json."""
        async with _make_client() as client:
            resp = await client.get(
                f"{self.base_url}/shop.json",
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()["shop"]


# ── OAuth Helpers ────────────────────────────────────────


def normalize_shop_domain(raw: str) -> str:
    """
    Normalize a Shopify domain input to the canonical {store}.myshopify.com.

    Accepts:
      - "bach-9961.myshopify.com"           → "bach-9961.myshopify.com"
      - "https://bach-9961.myshopify.com/"  → "bach-9961.myshopify.com"
      - "bach-9961"                         → "bach-9961.myshopify.com"
    """
    domain = raw.strip().lower()
    # Strip protocol
    if domain.startswith("https://"):
        domain = domain[8:]
    elif domain.startswith("http://"):
        domain = domain[7:]
    # Strip trailing slash/path
    domain = domain.split("/")[0]
    # If it already ends with .myshopify.com, we're good
    if domain.endswith(".myshopify.com"):
        return domain
    # If there's no dots at all, treat as a bare handle
    if "." not in domain:
        return f"{domain}.myshopify.com"
    # Otherwise it's probably a custom domain — can't auto-convert
    # Return as-is and let Shopify reject it with a clear error
    return domain


def build_oauth_url(shop_domain: str, state: str) -> str:
    """
    Build the Shopify OAuth authorization URL.

    The merchant visits this URL to grant access to the app.
    shop_domain is normalized to .myshopify.com automatically.
    """
    shop = normalize_shop_domain(shop_domain)
    redirect_uri = f"{settings.API_URL}/oauth/shopify/callback"
    params = urllib.parse.urlencode({
        "client_id": settings.SHOPIFY_CLIENT_ID,
        "scope": SCOPES,
        "redirect_uri": redirect_uri,
        "state": state,
    })
    return f"https://{shop}/admin/oauth/authorize?{params}"


async def exchange_code(shop_domain: str, code: str) -> str:
    """
    Exchange the temporary authorization code for a permanent access token.

    Returns the access_token string.
    """
    shop = normalize_shop_domain(shop_domain)
    url = f"https://{shop}/admin/oauth/access_token"
    payload = {
        "client_id": settings.SHOPIFY_CLIENT_ID,
        "client_secret": settings.SHOPIFY_CLIENT_SECRET,
        "code": code,
    }
    async with _make_client() as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()["access_token"]


def verify_hmac(query_params: dict[str, str], secret: str) -> bool:
    """
    Verify the HMAC signature that Shopify appends to OAuth callback requests.

    Shopify signs all query parameters (except `hmac` itself) with the app's
    client secret using HMAC-SHA256.
    """
    received_hmac = query_params.get("hmac", "")
    if not received_hmac:
        return False

    # Build the message from sorted params, excluding hmac
    filtered = {k: v for k, v in query_params.items() if k != "hmac"}
    message = urllib.parse.urlencode(sorted(filtered.items()))

    computed = hmac.new(
        secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(computed, received_hmac)


# ── Internal helpers ─────────────────────────────────────


def _parse_next_link(link_header: str | None) -> str | None:
    """
    Parse the RFC 8288 Link header returned by Shopify for pagination.

    Returns the URL for rel="next", or None if there is no next page.
    """
    if not link_header:
        return None

    for part in link_header.split(","):
        part = part.strip()
        if 'rel="next"' in part:
            # Extract URL between < and >
            url_start = part.index("<") + 1
            url_end = part.index(">")
            return part[url_start:url_end]

    return None
