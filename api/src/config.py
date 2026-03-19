"""
Application configuration via pydantic-settings.

All values are read from environment variables or a .env file.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to the project root (api/), not cwd
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    """Kansa API configuration."""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── General ──────────────────────────────────────
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me-to-a-random-64-char-string"
    API_URL: str = "http://localhost:8000"
    WEB_URL: str = "http://localhost:3000"
    LOG_LEVEL: str = "INFO"

    # ── Database ─────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://malak:malak@localhost:5432/malak"

    # ── Valkey / Redis ───────────────────────────────
    VALKEY_URL: str = "redis://localhost:6379/0"

    # ── AI / LLM ────────────────────────────────────
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_BASE_URL: str | None = None
    ANTHROPIC_API_KEY: str | None = None

    # ── Google AI (Nano Banana / Gemini) ────────────
    GOOGLE_AI_API_KEY: str = ""

    # ── Shopify ─────────────────────────────────────
    SHOPIFY_CLIENT_ID: str = ""
    SHOPIFY_CLIENT_SECRET: str = ""

    # ── Scraping ─────────────────────────────────────
    BROWSER_TYPE: str = "chromium"
    BROWSER_HEADLESS: bool = True
    PROXY_URL: str | None = None
    SCRAPERAPI_KEY: str | None = None

    # ── Auth ─────────────────────────────────────────
    JWT_LIFETIME_SECONDS: int = 3600
    ALLOW_REGISTRATION: bool = True

    # ── Email (Optional) ────────────────────────────
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    FROM_EMAIL: str = "noreply@malak.ai"

    # ── Stripe Billing ─────────────────────────────────
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_MONTHLY: str = ""
    STRIPE_PRICE_LIFETIME: str = ""

    # ── Monitoring ───────────────────────────────────
    SENTRY_DSN: str | None = None

    @model_validator(mode="after")
    def _fixup(self) -> "Settings":
        # Railway gives postgresql:// but asyncpg needs postgresql+asyncpg://
        if self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = self.DATABASE_URL.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )
        if self.is_production and self.SECRET_KEY == "change-me-to-a-random-64-char-string":
            raise ValueError(
                "SECRET_KEY must be changed from its default value in production"
            )
        return self

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def cors_origins(self) -> list[str]:
        """Allowed CORS origins."""
        origins = [
            self.WEB_URL,
            "https://web-sandy-nine-59.vercel.app",
        ]
        if not self.is_production:
            origins.extend([
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
            ])
        return [o for o in origins if o]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
