"""
Pydantic schemas for user authentication and profile.
"""

import uuid
from datetime import datetime

from fastapi_users import schemas


class UserRead(schemas.BaseUser[uuid.UUID]):
    """Schema for reading user data (API responses)."""

    display_name: str | None = None
    company_name: str | None = None
    created_at: datetime | None = None


class UserCreate(schemas.BaseUserCreate):
    """Schema for creating a new user (registration)."""

    display_name: str | None = None
    company_name: str | None = None


class UserUpdate(schemas.BaseUserUpdate):
    """Schema for updating user profile."""

    display_name: str | None = None
    company_name: str | None = None
