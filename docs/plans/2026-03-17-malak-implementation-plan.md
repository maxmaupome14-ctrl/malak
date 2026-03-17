# Malak AI — Master Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Take Malak from professional scaffolding to a working, sellable AI CMO product that audits ecommerce listings across Amazon, Shopify, Walmart, and MercadoLibre.

**Architecture:** Agent-based pipeline where Scout scrapes product data, Auditor analyzes it via LLM, Spy finds competitors, Strategist creates action plans, Copywriter generates optimized copy, Sentinel monitors 24/7, and Logistics evaluates fulfillment. All coordinated by an Orchestrator through an arq task queue.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + PostgreSQL 16 + Valkey (Redis) + arq (task queue) + Crawlee + Patchright (stealth browser) + httpx + selectolax + OpenAI/Anthropic API + Next.js 15 + Tailwind CSS

---

## Phase 0: Fix Foundations (Critical Bugs & Security)

**Goal:** Make the existing scaffolding actually bootable and secure. Nothing works until this is done.

**Acceptance Criteria:**
- [ ] `docker compose up` starts all 4 services without errors
- [ ] Alembic migration creates all tables
- [ ] Auth flow works (register, login, get JWT)
- [ ] No secrets leak to stdout
- [ ] SECRET_KEY validated on startup
- [ ] CI pipeline runs linting + tests on every push

---

### Task 0.1: Fix Dockerfile Build Order

**Files:**
- Modify: `api/Dockerfile`

**Problem:** Line 15 runs `pip install -e "."` before source code is copied (line 21). This fails because `pyproject.toml` alone can't resolve the install.

**Step 1: Rewrite Dockerfile with correct layer order**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for Playwright and PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency definition first (layer cache)
COPY pyproject.toml ./

# Install Python dependencies (non-editable for production)
RUN pip install --no-cache-dir .

# Install Playwright browsers
RUN playwright install --with-deps chromium

# Copy source code
COPY . .

# Re-install in editable mode so source is linked
RUN pip install --no-cache-dir -e "."

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:8000/health'); r.raise_for_status()"

# Run with uvicorn
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 2: Verify build**

Run: `docker build -t malak-api ./api`
Expected: Build completes without errors

**Step 3: Commit**
```bash
git add api/Dockerfile
git commit -m "fix: correct Dockerfile build order — copy source before install"
```

---

### Task 0.2: Fix Security Vulnerabilities

**Files:**
- Modify: `api/src/auth/manager.py` (remove print of tokens)
- Modify: `api/src/config.py` (validate SECRET_KEY on startup)
- Modify: `api/src/database.py` (fix auto-commit on reads)

**Step 1: Write test for SECRET_KEY validation**

```python
# tests/test_config.py
import pytest
from unittest.mock import patch
import os

def test_default_secret_key_raises_in_production():
    """Deploying with default SECRET_KEY in production must fail."""
    with patch.dict(os.environ, {
        "APP_ENV": "production",
        "SECRET_KEY": "change-me-to-a-random-64-char-string"
    }):
        from importlib import reload
        import src.config
        with pytest.raises(ValueError, match="SECRET_KEY"):
            reload(src.config)
```

**Step 2: Add SECRET_KEY validation to config.py**

Add to `Settings` class:
```python
from pydantic import model_validator

@model_validator(mode="after")
def validate_secrets(self) -> "Settings":
    if self.is_production and self.SECRET_KEY == "change-me-to-a-random-64-char-string":
        raise ValueError(
            "SECRET_KEY must be changed from default in production. "
            "Generate one: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
        )
    return self
```

**Step 3: Replace print() with proper logging in auth/manager.py**

```python
import logging

logger = logging.getLogger(__name__)

# Replace ALL print statements:
# BEFORE: print(f"User {user.id} ({user.email}) has registered.")
# AFTER:
logger.info("New user registered: %s", user.id)

# BEFORE: print(f"User {user.id} requested password reset. Token: {token}")
# AFTER (NO token in log):
logger.info("Password reset requested for user: %s", user.id)

# BEFORE: print(f"Verification requested for user {user.id}. Token: {token}")
# AFTER (NO token in log):
logger.info("Email verification requested for user: %s", user.id)
```

**Step 4: Fix database session auto-commit on reads**

In `database.py`, change `get_async_session` to not auto-commit:
```python
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
```

Create a separate `get_write_session` for mutations, or commit explicitly in routes.

**Step 5: Fix type annotations in models**

In `api/src/models/product.py`:
```python
# BEFORE:
images: Mapped[dict] = mapped_column(JSONB, default=list)
bullet_points: Mapped[dict] = mapped_column(JSONB, default=list)

# AFTER:
images: Mapped[list] = mapped_column(JSONB, default=list)
bullet_points: Mapped[list] = mapped_column(JSONB, default=list)
```

In `api/src/models/audit.py`:
```python
# BEFORE:
strengths: Mapped[dict] = mapped_column(JSONB, default=list)
weaknesses: Mapped[dict] = mapped_column(JSONB, default=list)
recommendations: Mapped[dict] = mapped_column(JSONB, default=list)

# AFTER:
strengths: Mapped[list] = mapped_column(JSONB, default=list)
weaknesses: Mapped[list] = mapped_column(JSONB, default=list)
recommendations: Mapped[list] = mapped_column(JSONB, default=list)
```

**Step 6: Commit**
```bash
git add api/src/auth/manager.py api/src/config.py api/src/database.py api/src/models/
git commit -m "fix: patch security vulnerabilities — no token logging, validate SECRET_KEY, fix types"
```

---

### Task 0.3: Create Initial Alembic Migration

**Files:**
- Modify: `api/alembic/env.py` (ensure it imports all models)
- Create: `api/alembic/versions/001_initial_schema.py`

**Step 1: Verify alembic/env.py imports all models**

The `env.py` must import `Base` and all models so Alembic knows about them:
```python
from src.database import Base
from src.auth.models import User  # noqa: F401
from src.models.product import Product  # noqa: F401
from src.models.audit import AuditResult  # noqa: F401
from src.models.store import Store  # noqa: F401

target_metadata = Base.metadata
```

**Step 2: Generate migration**

Run: `cd api && alembic revision --autogenerate -m "initial schema"`
Verify the generated migration creates tables: `users`, `products`, `stores`, `audit_results`

**Step 3: Test migration runs**

Run: `alembic upgrade head` (requires running PostgreSQL)
Expected: All tables created successfully

**Step 4: Add migration to docker-compose startup**

In `docker-compose.yml`, change API command:
```yaml
api:
  command: >
    sh -c "alembic upgrade head && uvicorn src.main:app --host 0.0.0.0 --port 8000"
```

**Step 5: Commit**
```bash
git add api/alembic/ docker-compose.yml
git commit -m "feat: add initial database migration — creates all tables on startup"
```

---

### Task 0.4: Update Dependencies

**Files:**
- Modify: `api/pyproject.toml`
- Modify: `web/package.json`

**Step 1: Add missing Python dependencies**

```toml
dependencies = [
    # ... existing deps ...

    # Scraping (upgraded)
    "crawlee[playwright]>=0.5.0",
    "selectolax>=0.3.0",
    "tenacity>=9.0.0",  # Retry with backoff

    # Logging
    "structlog>=24.0.0",

    # AI / LLM (add Anthropic support)
    "openai>=1.58.0",
    "anthropic>=0.40.0",
]
```

**Step 2: Add missing frontend dependencies**

```bash
cd web
npm install swr zod sonner recharts
npm install -D @types/recharts
```

**Step 3: Generate package-lock.json**

```bash
cd web && npm install
```

This ensures `npm ci` works in Docker.

**Step 4: Commit**
```bash
git add api/pyproject.toml web/package.json web/package-lock.json
git commit -m "feat: add missing dependencies — crawlee, selectolax, structlog, swr, recharts"
```

---

### Task 0.5: Add CI/CD Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create GitHub Actions workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: malak
          POSTGRES_PASSWORD: malak
          POSTGRES_DB: malak_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Install dependencies
        working-directory: api
        run: pip install -e ".[dev]"
      - name: Lint
        working-directory: api
        run: ruff check src/ tests/
      - name: Type check
        working-directory: api
        run: mypy src/ --ignore-missing-imports
      - name: Test
        working-directory: api
        env:
          DATABASE_URL: postgresql+asyncpg://malak:malak@localhost:5432/malak_test
          SECRET_KEY: test-secret-key-not-for-production-use
          APP_ENV: testing
        run: pytest -v

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        working-directory: web
        run: npm ci
      - name: Lint
        working-directory: web
        run: npm run lint
      - name: Type check
        working-directory: web
        run: npm run type-check
      - name: Build
        working-directory: web
        run: npm run build
```

**Step 2: Commit**
```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions pipeline — lint, type check, test for backend + frontend"
```

---

## Phase 1: Shopify Scraper (Easiest Win)

**Goal:** Build a working scraper that takes a Shopify URL and returns real product data. This is the fastest path to a demo because Shopify exposes `/products/{handle}.json` — no browser needed, no anti-bot, pure HTTP.

**Acceptance Criteria:**
- [ ] Given a Shopify product URL, returns complete ScrapedProduct with title, price, images, description, variants
- [ ] Handles both `*.myshopify.com` and custom domains
- [ ] Detects non-Shopify URLs and returns appropriate error
- [ ] 95%+ success rate on test URLs
- [ ] Cached responses (don't re-scrape within 6 hours)

---

### Task 1.1: Implement Shopify Scraper

**Files:**
- Modify: `api/src/scrapers/shopify.py`
- Create: `api/tests/test_shopify_scraper.py`

**Step 1: Write integration test**

```python
# api/tests/test_shopify_scraper.py
import pytest
from src.scrapers.shopify import ShopifyScraper
from src.scrapers.base import ScrapedProduct

scraper = ShopifyScraper()

def test_can_handle_myshopify():
    assert scraper.can_handle("https://store.myshopify.com/products/test")

def test_can_handle_custom_domain():
    """Custom domains need HTTP check — skip for unit tests."""
    assert not scraper.can_handle("https://random-site.com/page")

def test_cannot_handle_amazon():
    assert not scraper.can_handle("https://www.amazon.com/dp/B0TEST")

@pytest.mark.asyncio
async def test_scrape_real_shopify_product():
    """Integration test against a known Shopify store."""
    # allbirds.com is a well-known Shopify store
    result = await scraper.scrape("https://allbirds.com/products/mens-tree-runners")
    assert isinstance(result, ScrapedProduct)
    assert result.platform == "shopify"
    assert result.title != ""
    assert result.price is not None
    assert len(result.images) > 0

def test_extract_handle():
    assert scraper.extract_handle("https://store.com/products/cool-shirt") == "cool-shirt"
    assert scraper.extract_handle("https://store.com/products/cool-shirt?variant=123") == "cool-shirt"
    assert scraper.extract_handle("https://store.com/collections/all/products/cool-shirt") == "cool-shirt"
```

**Step 2: Run test to verify it fails**

Run: `cd api && pytest tests/test_shopify_scraper.py -v`
Expected: FAIL (methods not implemented)

**Step 3: Implement ShopifyScraper**

```python
"""
Shopify Scraper — extracts product data from Shopify storefronts.

Strategy:
1. Extract product handle from URL
2. Fetch {base_url}/products/{handle}.json (Shopify's public JSON API)
3. Parse structured JSON into ScrapedProduct
4. Fallback: if JSON API is restricted, parse HTML with selectolax
"""

import re
from urllib.parse import urlparse

import httpx
from selectolax.parser import HTMLParser

from src.scrapers.base import BaseScraper, ScrapedProduct, ScrapingError


class ShopifyScraper(BaseScraper):
    """Scrapes Shopify product pages using their JSON API."""

    @property
    def platform_name(self) -> str:
        return "shopify"

    def can_handle(self, url: str) -> bool:
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        if "myshopify.com" in hostname:
            return True
        if "/products/" in parsed.path:
            # Heuristic: could be Shopify. Confirm via JSON endpoint later.
            return True
        return False

    def extract_handle(self, url: str) -> str:
        """Extract product handle from URL path."""
        match = re.search(r"/products/([^/?#]+)", url)
        if not match:
            raise ScrapingError("Could not extract product handle from URL", url=url)
        return match.group(1)

    def _get_base_url(self, url: str) -> str:
        """Extract base URL (scheme + host) from a product URL."""
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}"

    async def scrape(self, url: str) -> ScrapedProduct:
        handle = self.extract_handle(url)
        base_url = self._get_base_url(url)
        json_url = f"{base_url}/products/{handle}.json"

        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; MalakBot/1.0)"},
        ) as client:
            response = await client.get(json_url)

            if response.status_code == 200:
                return self._parse_json(url, response.json()["product"])

            # Fallback: try HTML parsing
            html_response = await client.get(url)
            if html_response.status_code != 200:
                raise ScrapingError(
                    f"Failed to fetch Shopify product: HTTP {html_response.status_code}",
                    url=url,
                    status_code=html_response.status_code,
                )
            return self._parse_html(url, html_response.text)

    def _parse_json(self, url: str, data: dict) -> ScrapedProduct:
        """Parse Shopify JSON API response into ScrapedProduct."""
        variants = data.get("variants", [])
        price = float(variants[0]["price"]) if variants else None
        original_price = float(variants[0].get("compare_at_price") or 0) if variants else None

        images = [img["src"] for img in data.get("images", [])]

        # Strip HTML tags from body_html
        description = data.get("body_html", "") or ""
        if description:
            tree = HTMLParser(description)
            description = tree.text(separator=" ").strip()

        return ScrapedProduct(
            url=url,
            platform="shopify",
            platform_id=str(data.get("id", "")),
            title=data.get("title", ""),
            brand=data.get("vendor", ""),
            description=description,
            category=data.get("product_type", ""),
            price=price,
            currency="USD",  # Shopify JSON doesn't include currency, resolve later
            original_price=original_price if original_price and original_price > 0 else None,
            images=images,
            in_stock=any(v.get("available", False) for v in variants),
            raw_data=data,
        )

    def _parse_html(self, url: str, html: str) -> ScrapedProduct:
        """Fallback HTML parser when JSON API is restricted."""
        tree = HTMLParser(html)

        title_node = tree.css_first("h1")
        title = title_node.text(strip=True) if title_node else ""

        # Try meta tags for structured data
        og_image = tree.css_first('meta[property="og:image"]')
        image = og_image.attributes.get("content", "") if og_image else ""

        return ScrapedProduct(
            url=url,
            platform="shopify",
            title=title,
            images=[image] if image else [],
        )
```

**Step 4: Run tests**

Run: `cd api && pytest tests/test_shopify_scraper.py -v`
Expected: All pass

**Step 5: Commit**
```bash
git add api/src/scrapers/shopify.py api/tests/test_shopify_scraper.py
git commit -m "feat: implement Shopify scraper — JSON API with HTML fallback"
```

---

### Task 1.2: Implement MercadoLibre Scraper

**Files:**
- Modify: `api/src/scrapers/mercadolibre.py`
- Create: `api/tests/test_mercadolibre_scraper.py`

**Strategy:** MercadoLibre has a public REST API. Use `https://api.mercadolibre.com/items/{ITEM_ID}` — no auth needed, 1500 req/min rate limit.

**Step 1: Write test**

```python
# api/tests/test_mercadolibre_scraper.py
import pytest
from src.scrapers.mercadolibre import MercadoLibreScraper

scraper = MercadoLibreScraper()

def test_can_handle():
    assert scraper.can_handle("https://www.mercadolibre.com.mx/something/MLM-12345")
    assert scraper.can_handle("https://articulo.mercadolibre.com.mx/MLM-12345")
    assert not scraper.can_handle("https://amazon.com/dp/B0TEST")

def test_extract_item_id():
    assert scraper.extract_item_id("https://articulo.mercadolibre.com.mx/MLM-1234567890") == "MLM1234567890"

@pytest.mark.asyncio
async def test_scrape_real_product():
    # Use a known active MercadoLibre listing
    result = await scraper.scrape("https://articulo.mercadolibre.com.mx/MLM-1234567890")
    assert result.platform == "mercadolibre"
    # May fail if listing is removed — that's OK for integration test
```

**Step 2: Implement using MercadoLibre API**

Key: Use `httpx.AsyncClient` to call `api.mercadolibre.com/items/{id}`. Parse response into ScrapedProduct. Detect currency from API response (not hardcoded).

**Step 3: Commit**
```bash
git commit -m "feat: implement MercadoLibre scraper — public API integration"
```

---

### Task 1.3: Wire Scout Agent to Scrapers

**Files:**
- Modify: `api/src/agents/scout.py`
- Modify: `api/src/scrapers/__init__.py`
- Create: `api/tests/test_scout_agent.py`

**Step 1: Create scraper registry in `scrapers/__init__.py`**

```python
from src.scrapers.base import BaseScraper, ScrapedProduct, ScrapingError
from src.scrapers.shopify import ShopifyScraper
from src.scrapers.amazon import AmazonScraper
from src.scrapers.walmart import WalmartScraper
from src.scrapers.mercadolibre import MercadoLibreScraper

# Registry of all available scrapers — order matters (first match wins)
SCRAPERS: list[BaseScraper] = [
    AmazonScraper(),
    ShopifyScraper(),
    WalmartScraper(),
    MercadoLibreScraper(),
]

def detect_scraper(url: str) -> BaseScraper | None:
    """Find the first scraper that can handle this URL."""
    for scraper in SCRAPERS:
        if scraper.can_handle(url):
            return scraper
    return None
```

**Step 2: Implement Scout agent execute()**

```python
from src.scrapers import detect_scraper
from dataclasses import asdict

async def execute(self, context, input_data):
    url = input_data["url"]
    scraper = detect_scraper(url)
    if not scraper:
        return AgentResult(
            agent_name=self.name,
            status=AgentStatus.FAILED,
            errors=[f"No scraper available for URL: {url}"],
        )

    try:
        product = await scraper.scrape(url)
        return AgentResult(
            agent_name=self.name,
            status=AgentStatus.COMPLETED,
            data={
                "url": url,
                "platform": product.platform,
                "product": asdict(product),
            },
        )
    except Exception as e:
        return AgentResult(
            agent_name=self.name,
            status=AgentStatus.FAILED,
            errors=[str(e)],
        )
```

**Step 3: Test Scout → Shopify pipeline**

```python
@pytest.mark.asyncio
async def test_scout_scrapes_shopify():
    scout = ScoutAgent()
    ctx = AgentContext(user_id=uuid4())
    result = await scout.run(ctx, {"url": "https://allbirds.com/products/mens-tree-runners"})
    assert result.success
    assert result.data["platform"] == "shopify"
    assert result.data["product"]["title"] != ""
```

**Step 4: Commit**
```bash
git commit -m "feat: wire Scout agent to scraper registry — URL detection and routing"
```

---

## Phase 2: LLM Integration + Auditor Agent

**Goal:** Given scraped product data, use an LLM to produce a comprehensive audit with scores, strengths, weaknesses, and recommendations.

**Acceptance Criteria:**
- [ ] Auditor takes ScrapedProduct and returns a scored audit (0-100)
- [ ] Scores broken down by dimension: title, images, pricing, reviews, SEO, content
- [ ] Each weakness has a specific, actionable recommendation
- [ ] Works with OpenAI, Anthropic, or any OpenAI-compatible endpoint
- [ ] Total LLM cost per audit < $0.05

---

### Task 2.1: Create LLM Client Abstraction

**Files:**
- Create: `api/src/llm/__init__.py`
- Create: `api/src/llm/client.py`
- Create: `api/tests/test_llm_client.py`

**Key design:** Single interface that works with OpenAI, Anthropic, or any OpenAI-compatible endpoint (Ollama, vLLM). The user's API key is used — we don't hardcode ours.

```python
# api/src/llm/client.py
from openai import AsyncOpenAI
from src.config import settings

async def complete(
    prompt: str,
    system: str = "",
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> str:
    """Send a completion request to the configured LLM."""
    client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL,
    )
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = await client.chat.completions.create(
        model=model or settings.OPENAI_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content or ""


async def complete_json(
    prompt: str,
    system: str = "",
    model: str | None = None,
) -> dict:
    """Send a completion request and parse the response as JSON."""
    import json
    text = await complete(
        prompt=prompt,
        system=system + "\n\nRespond ONLY with valid JSON. No markdown, no explanation.",
        model=model,
        temperature=0.2,
    )
    # Strip markdown code fences if present
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    return json.loads(text.strip())
```

---

### Task 2.2: Implement Auditor Agent

**Files:**
- Modify: `api/src/agents/auditor.py`
- Create: `api/tests/test_auditor_agent.py`

**Key design:** The Auditor uses scoring heuristics (rule-based) for measurable things (title length, image count, price present) and LLM for qualitative analysis (SEO quality, copy effectiveness, competitive positioning).

**Scoring dimensions:**
- **Title** (0-100): Length, keyword presence, readability, compliance
- **Images** (0-100): Count, variety (lifestyle vs product), resolution signals
- **Pricing** (0-100): Price present, discount shown, competitive range
- **Reviews** (0-100): Rating, count, velocity signals
- **SEO** (0-100): Keyword density in title/bullets, backend keywords
- **Content** (0-100): Bullet point quality, description length, A+ presence

**Overall score** = weighted average (Title 20%, Images 20%, Pricing 15%, Reviews 15%, SEO 15%, Content 15%)

The LLM prompt should receive the scored product data and generate:
1. Top 3 strengths
2. Top 5 weaknesses (prioritized by impact)
3. Specific recommendation for each weakness with estimated impact (high/medium/low)

**Step 1: Implement rule-based scoring functions**
**Step 2: Implement LLM-powered recommendation generation**
**Step 3: Wire scoring + LLM into Auditor.execute()**
**Step 4: Test with real Shopify product data**
**Step 5: Commit**

---

## Phase 3: Orchestrator + Task Queue

**Goal:** Wire the full pipeline: POST /audit → arq enqueues job → Scout scrapes → Auditor analyzes → results saved to DB → frontend polls and gets results.

**Acceptance Criteria:**
- [ ] POST /audit returns immediately with status=pending
- [ ] Background worker runs Scout → Auditor pipeline
- [ ] Audit status updates in DB (pending → scraping → analyzing → completed)
- [ ] GET /audit/{id} returns real results when complete
- [ ] Failed audits have error messages

---

### Task 3.1: Configure arq Worker

**Files:**
- Create: `api/src/worker.py`
- Modify: `docker-compose.yml` (add worker service)
- Create: `api/src/pipeline.py` (orchestrator)

**Key design:** The orchestrator is a simple sequential pipeline for MVP. No need for complex DAG scheduling yet.

```python
# api/src/pipeline.py
async def run_audit_pipeline(ctx: dict, audit_id: UUID):
    """
    Full audit pipeline:
    1. Scout: scrape the URL
    2. Auditor: analyze the product
    3. Save results to DB
    """
    # 1. Load audit from DB, update status to SCRAPING
    # 2. Run Scout agent
    # 3. Update status to ANALYZING
    # 4. Run Auditor agent
    # 5. Save scores, recommendations, generated copy
    # 6. Update status to COMPLETED
    # On error: update status to FAILED with error message
```

Add worker service to `docker-compose.yml`:
```yaml
worker:
  build:
    context: ./api
  command: arq src.worker.WorkerSettings
  env_file:
    - .env
  environment:
    DATABASE_URL: postgresql+asyncpg://malak:malak@postgres:5432/malak
    VALKEY_URL: redis://valkey:6379/0
  depends_on:
    postgres:
      condition: service_healthy
    valkey:
      condition: service_healthy
```

---

### Task 3.2: Connect Audit Route to Pipeline

**Files:**
- Modify: `api/src/routes/audit.py`

Replace the TODO with actual arq enqueue:
```python
from arq import ArqRedis

# In create_audit():
redis = ArqRedis(await aioredis.from_url(settings.VALKEY_URL))
await redis.enqueue_job("run_audit_pipeline", str(audit.id))
```

---

## Phase 4: Frontend — Working Audit Flow

**Goal:** User pastes URL → clicks Audit → sees real-time status → gets actual results with scores and recommendations.

**Acceptance Criteria:**
- [ ] Audit page submits URL to real API
- [ ] Shows real-time status (scraping → analyzing → complete)
- [ ] Displays audit results: overall score, dimension breakdown, recommendations
- [ ] Score visualizations (radar chart for dimensions, progress bars)
- [ ] Generated copy is displayed and copyable
- [ ] Auth flow works (register, login, protected routes)

---

### Task 4.1: Implement Auth Flow
### Task 4.2: Build Audit Submission → Polling → Results Display
### Task 4.3: Build Score Visualization Components
### Task 4.4: Build Recommendations & Copy Display

---

## Phase 5: Amazon + Walmart Scrapers (Hard Mode)

**Goal:** Add scraping for the two hardest platforms using Patchright (stealth Playwright) + Crawlee for orchestration.

**Acceptance Criteria:**
- [ ] Amazon scraper extracts title, price, images, bullets, reviews, BSR, seller info
- [ ] Walmart scraper extracts equivalent data
- [ ] 70%+ success rate without proxies (dev), 95%+ with proxies (production)
- [ ] Captcha detection with graceful failure + retry

**Key tools:**
- Patchright (undetected Playwright fork) for browser automation
- Crawlee for queue management, retries, adaptive concurrency
- selectolax for fast HTML parsing (10-20x faster than BeautifulSoup)

---

### Task 5.1: Set Up Patchright Browser Pool
### Task 5.2: Implement Amazon Scraper
### Task 5.3: Implement Walmart Scraper
### Task 5.4: Add Proxy Rotation Support

---

## Phase 6: Spy + Strategist + Copywriter Agents

**Goal:** Complete the agent swarm — competitive intelligence, strategy generation, and copy optimization.

---

### Task 6.1: Implement Spy Agent
- Given a product, search the same marketplace for competitors
- Use Scout to scrape top 5-10 competitors
- Compare pricing, ratings, review counts, images, title keywords
- Output: competitor list with comparison matrix

### Task 6.2: Implement Strategist Agent
- Takes Auditor output + Spy output
- LLM generates a prioritized weekly action plan
- Each action has: title, description, estimated impact, effort level, priority rank

### Task 6.3: Implement Copywriter Agent
- Takes product data + Auditor analysis + keyword data
- LLM generates optimized: title (3 variants), bullet points (3 sets), description
- Each variant includes keyword integration strategy

---

## Phase 7: Sentinel + Logistics Agents

### Task 7.1: Implement Sentinel (Monitoring)
- Scheduled scraping of saved products (via arq cron)
- Detect changes: price, rating, stock status, new competitors
- Store change events in DB
- Alert system (email/webhook)

### Task 7.2: Implement Logistics Agent
- Analyze fulfillment signals from scraped data
- FBA/FBM/WFS detection
- Shipping speed comparison vs competitors
- Recommendations for fulfillment optimization

---

## Phase 8: Production Hardening

### Task 8.1: Rate Limiting
- Add rate limiting to API routes (slowapi or custom middleware)
- Tier-based: Starter (3 audits/mo), Pro (unlimited)

### Task 8.2: Error Handling
- Global exception handler middleware
- Structured error responses
- Sentry integration

### Task 8.3: Logging
- Replace all print() with structlog
- Request ID tracing
- JSON log format for production

### Task 8.4: Security Hardening
- Move JWT to HttpOnly cookies
- Add CSRF protection
- Encrypt store credentials in DB (application-level encryption)
- Add refresh token flow

### Task 8.5: Performance
- Add Redis caching for scraped products (TTL: 6h for prices, 24h for titles)
- Connection pooling optimization
- Frontend: add loading skeletons, error boundaries, optimistic updates

### Task 8.6: Stripe Integration
- Stripe Checkout for $99/month Pro plan
- Webhook handler for subscription events
- Usage tracking (audit count per user per month)
- Tier enforcement in API middleware

---

## Phase 9: Launch Preparation

### Task 9.1: Landing Page Polish
- Add Logistics agent to landing page agent cards
- Add pricing section
- Add demo video / GIF
- Add social proof section (placeholder)

### Task 9.2: Documentation
- API docs (FastAPI auto-generates via /docs)
- Self-hosting guide (README is mostly done)
- Contributing guide

### Task 9.3: Open Source Launch Checklist
- [ ] README is compelling and complete
- [ ] .env.example has every variable documented
- [ ] Docker Compose works out of the box
- [ ] LICENSE is MIT
- [ ] CONTRIBUTING.md exists
- [ ] Issue templates created
- [ ] GitHub Topics: `ai`, `ecommerce`, `amazon`, `shopify`, `marketing`, `open-source`
- [ ] Product Hunt / HackerNews launch post drafted

---

## Priority Execution Order

| Phase | What | Timeline | Demo-able? |
|-------|------|----------|-----------|
| 0 | Fix Foundations | Week 1 | No |
| 1 | Shopify Scraper | Week 1-2 | YES — first real scrape |
| 2 | LLM + Auditor | Week 2-3 | YES — first real audit |
| 3 | Orchestrator + Queue | Week 3 | YES — end-to-end flow |
| 4 | Frontend UI | Week 3-4 | YES — full demo |
| 5 | Amazon + Walmart | Week 5-7 | YES — multi-platform |
| 6 | Spy + Strategist + Copywriter | Week 7-9 | YES — full agent swarm |
| 7 | Sentinel + Logistics | Week 9-10 | YES — monitoring |
| 8 | Production Hardening | Week 10-11 | Production-ready |
| 9 | Launch | Week 12 | LAUNCH |

**First sellable demo: Week 4** (Shopify audit with real scores + recommendations)
**Full MVP: Week 9** (All agents, Amazon + Shopify + Walmart + ML)
**Production launch: Week 12**
