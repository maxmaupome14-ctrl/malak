"""
Application configuration via pydantic-settings.

All values are read from environment variables or a .env file.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Malak API configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
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

    # ── Monitoring ───────────────────────────────────
    SENTRY_DSN: str | None = None

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def cors_origins(self) -> list[str]:
        """Allowed CORS origins."""
        origins = [self.WEB_URL]
        if not self.is_production:
            origins.extend([
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
            ])
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
