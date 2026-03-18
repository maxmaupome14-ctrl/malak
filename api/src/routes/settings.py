"""
Settings routes — manage user API keys (BYOK).

Users bring their own OpenAI/Anthropic keys. Keys are stored in the DB
and used by agents when processing that user's requests.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.database import get_async_session

router = APIRouter()


class ApiKeysResponse(BaseModel):
    """Returns masked keys so the frontend can show if they're set."""
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    google_ai_api_key: str | None = None
    has_openai: bool = False
    has_anthropic: bool = False
    has_google_ai: bool = False


class ApiKeysUpdate(BaseModel):
    """Update API keys. Send empty string to clear a key."""
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    google_ai_api_key: str | None = None


def _mask_key(key: str | None) -> str | None:
    """Show first 8 and last 4 chars, mask the rest."""
    if not key:
        return None
    if len(key) <= 12:
        return "****"
    return key[:8] + "****" + key[-4:]


@router.get("/api-keys", response_model=ApiKeysResponse)
async def get_api_keys(
    user: User = Depends(current_active_user),
) -> ApiKeysResponse:
    """Get current API key status (masked)."""
    return ApiKeysResponse(
        openai_api_key=_mask_key(user.openai_api_key),
        anthropic_api_key=_mask_key(user.anthropic_api_key),
        google_ai_api_key=_mask_key(user.google_ai_api_key),
        has_openai=bool(user.openai_api_key),
        has_anthropic=bool(user.anthropic_api_key),
        has_google_ai=bool(user.google_ai_api_key),
    )


@router.put("/api-keys", response_model=ApiKeysResponse)
async def update_api_keys(
    body: ApiKeysUpdate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ApiKeysResponse:
    """Update API keys. Only updates fields that are provided."""
    if body.openai_api_key is not None:
        user.openai_api_key = body.openai_api_key if body.openai_api_key else None
    if body.anthropic_api_key is not None:
        user.anthropic_api_key = body.anthropic_api_key if body.anthropic_api_key else None
    if body.google_ai_api_key is not None:
        user.google_ai_api_key = body.google_ai_api_key if body.google_ai_api_key else None

    await session.commit()

    return ApiKeysResponse(
        openai_api_key=_mask_key(user.openai_api_key),
        anthropic_api_key=_mask_key(user.anthropic_api_key),
        google_ai_api_key=_mask_key(user.google_ai_api_key),
        has_openai=bool(user.openai_api_key),
        has_anthropic=bool(user.anthropic_api_key),
        has_google_ai=bool(user.google_ai_api_key),
    )
