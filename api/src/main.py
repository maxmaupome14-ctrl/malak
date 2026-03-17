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
from src.routes.reports import router as reports_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application startup and shutdown events."""
    # Startup
    # TODO: Initialize Playwright browser pool
    # TODO: Initialize arq worker connection
    yield
    # Shutdown
    # TODO: Close browser pool
    # TODO: Close arq connection


app = FastAPI(
    title="Malak AI",
    description="Open source AI CMO for ecommerce",
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
app.include_router(reports_router, prefix="/reports", tags=["reports"])


# ── Health Check ──────────────────────────────────────
@app.get("/health", tags=["system"])
async def health_check() -> dict[str, str]:
    """Health check endpoint for load balancers and monitoring."""
    return {"status": "healthy", "service": "malak-api", "version": "0.1.0"}


@app.get("/", tags=["system"])
async def root() -> dict[str, str]:
    """Root endpoint with API info."""
    return {
        "name": "Malak AI API",
        "version": "0.1.0",
        "docs": "/docs",
    }
