"""
User model for authentication.
Uses fastapi-users SQLAlchemy integration.
"""

from datetime import datetime

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    """
    User account model.

    Inherits from SQLAlchemyBaseUserTableUUID which provides:
    - id (UUID)
    - email (str, unique, indexed)
    - hashed_password (str)
    - is_active (bool)
    - is_superuser (bool)
    - is_verified (bool)
    """

    __tablename__ = "users"

    # Additional fields beyond what fastapi-users provides
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"
