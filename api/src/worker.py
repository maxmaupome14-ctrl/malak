"""
arq Worker — processes background jobs from the task queue.

Jobs:
    - run_audit_pipeline: Full audit of a product listing

Run with:
    arq src.worker.WorkerSettings
"""

import logging

from arq.connections import RedisSettings

from src.config import settings
from src.pipeline import run_audit_pipeline

logger = logging.getLogger(__name__)


def parse_redis_url(url: str) -> RedisSettings:
    """Parse a redis:// URL into arq RedisSettings."""
    from urllib.parse import urlparse

    parsed = urlparse(url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        database=int(parsed.path.lstrip("/") or 0),
        password=parsed.password,
    )


class WorkerSettings:
    """arq worker configuration."""

    functions = [run_audit_pipeline]
    redis_settings = parse_redis_url(settings.VALKEY_URL)

    # Worker behavior
    max_jobs = 10
    job_timeout = 300  # 5 minutes max per audit
    keep_result = 3600  # Keep results for 1 hour
    retry_jobs = True
    max_tries = 3

    on_startup = None
    on_shutdown = None

    @staticmethod
    async def on_job_start(ctx: dict) -> None:
        logger.info("Job started: %s", ctx.get("job_id"))

    @staticmethod
    async def on_job_end(ctx: dict) -> None:
        logger.info("Job ended: %s", ctx.get("job_id"))
