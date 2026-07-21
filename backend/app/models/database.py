"""Database initialization — async SQLAlchemy with aiosqlite."""

import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.models.models import Base

_settings = get_settings()

# Ensure data directories exist
_abs_storage = os.path.abspath(_settings.storage_path)
os.makedirs(_abs_storage, exist_ok=True)

engine = create_async_engine(_settings.resolve_db_url(), echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db() -> None:
    """Create all tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session for dependency injection."""
    async with async_session() as session:
        yield session
