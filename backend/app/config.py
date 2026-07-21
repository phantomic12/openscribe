"""Application settings from environment variables."""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///app.db"
    storage_path: str = "data/documents"
    models_path: str = "models"
    secret_key: str = "change-me-in-production"
    debug: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def resolve_db_url(self) -> str:
        """Resolve the database URL to an absolute path."""
        url = self.database_url
        if url.startswith("sqlite+aiosqlite:///") and not url.startswith("sqlite+aiosqlite:////"):
            # Relative path — make absolute relative to cwd
            rel_path = url[len("sqlite+aiosqlite:///"):]
            abs_path = os.path.abspath(rel_path)
            url = f"sqlite+aiosqlite:///{abs_path}"
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
