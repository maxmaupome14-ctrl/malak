"""
Subscription gate — dependency that requires an active subscription.

Use as a FastAPI dependency on paid-only endpoints.
"""

from fastapi import Depends, HTTPException

from src.auth.models import User
from src.auth.router import current_active_user


async def require_subscription(
    user: User = Depends(current_active_user),
) -> User:
    """Require an active subscription or lifetime plan."""
    if user.subscription_status not in ("active", "lifetime"):
        raise HTTPException(
            status_code=402,
            detail="Subscription required. Upgrade to connect stores and push changes.",
        )
    return user
