"""
Malak AI — FastAPI application entry point.

Run with: uvicorn src.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.auth.router import auth_router, users_router
from src.routes.audit import router as audit_router
from src.routes.stores import router as stores_router
from src.routes.oauth import router as oauth_router
from src.routes.products import router as products_router
from src.routes.reports import router as reports_router
from src.routes.billing import router as billing_router
from src.routes.optimizations import router as optimizations_router
from src.routes.settings import router as settings_router
from src.routes.chat import router as chat_router
from src.routes.optimize import router as optimize_router
from src.routes.autopilot import router as autopilot_router
from src.routes.inventory import router as inventory_router
from src.routes.translate import router as translate_router
from src.routes.competitors import router as competitors_router
from src.routes.reviews import router as reviews_router
from src.routes.marketing import router as marketing_router
from src.routes.webhooks import router as webhooks_router
from src.routes.shopify_billing import router as shopify_billing_router
from src.routes.media import router as media_router
from src.routes.tokens import router as tokens_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application startup and shutdown events."""
    # Create all tables on startup (needed for Render free tier with no shell)
    if settings.is_production:
        from src.database import engine, Base
        # Import all models so they register with Base.metadata
        from src.auth.models import User  # noqa: F401
        from src.models.store import Store  # noqa: F401
        from src.models.product import Product  # noqa: F401
        from src.models.audit import AuditResult  # noqa: F401
        from src.models.optimization import Optimization  # noqa: F401
        from src.models.media import GeneratedMedia  # noqa: F401
        from src.models.token import TokenWallet, TokenTransaction  # noqa: F401

        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            print("[BOOT] Database tables created/verified successfully")

            # Add new columns to existing tables (create_all doesn't do ALTER)
            from sqlalchemy import text
            async with engine.begin() as conn:
                migrations = [
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_ai_api_key TEXT",
                    "ALTER TABLE audit_results ADD COLUMN IF NOT EXISTS category_issues JSONB DEFAULT '{}'",
                    "ALTER TABLE audit_results ADD COLUMN IF NOT EXISTS fix_costs JSONB DEFAULT '{}'",
                ]
                for sql in migrations:
                    try:
                        await conn.execute(text(sql))
                    except Exception:
                        pass  # Column already exists or other non-critical error
            print("[BOOT] Schema migrations applied")
        except Exception as e:
            print(f"[BOOT] Database setup warning: {str(e)[:200]}")
    print(f"[BOOT] Shopify OAuth configured: {'YES' if settings.SHOPIFY_CLIENT_ID else 'NO'}")
    yield


app = FastAPI(
    title="Kansa",
    description="AI-powered ecommerce operating system",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

# ── CORS ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(users_router, prefix="/users", tags=["users"])
app.include_router(audit_router, prefix="/audit", tags=["audit"])
app.include_router(stores_router, prefix="/stores", tags=["stores"])
app.include_router(oauth_router, prefix="/oauth", tags=["oauth"])
app.include_router(products_router, prefix="/products", tags=["products"])
app.include_router(reports_router, prefix="/reports", tags=["reports"])
app.include_router(billing_router, prefix="/billing", tags=["billing"])
app.include_router(optimizations_router, prefix="/optimizations", tags=["optimizations"])
app.include_router(settings_router, prefix="/settings", tags=["settings"])
app.include_router(chat_router, prefix="/chat", tags=["chat"])
app.include_router(optimize_router, prefix="/optimize", tags=["optimize"])
app.include_router(autopilot_router, prefix="/autopilot", tags=["autopilot"])
app.include_router(inventory_router, prefix="/inventory", tags=["inventory"])
app.include_router(translate_router, prefix="/translate", tags=["translate"])
app.include_router(competitors_router, prefix="/competitors", tags=["competitors"])
app.include_router(reviews_router, prefix="/reviews", tags=["reviews"])
app.include_router(marketing_router, prefix="/marketing", tags=["marketing"])
app.include_router(webhooks_router, tags=["webhooks"])
app.include_router(shopify_billing_router, prefix="/billing", tags=["shopify-billing"])
app.include_router(media_router, prefix="/media", tags=["media"])
app.include_router(tokens_router, prefix="/tokens", tags=["tokens"])


# ── Health Check ──────────────────────────────────────
@app.get("/health", tags=["system"])
async def health_check() -> dict[str, str]:
    """Health check endpoint for load balancers and monitoring."""
    return {"status": "healthy", "service": "kansa-api", "version": "0.1.0"}



@app.get("/", tags=["system"])
async def root() -> dict[str, str]:
    """Root endpoint with API info."""
    return {
        "name": "Kansa API",
        "version": "0.1.0",
        "docs": "/docs",
    }
