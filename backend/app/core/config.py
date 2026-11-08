from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Management Bot"

    database_url: str = "postgresql+asyncpg://bot:bot@localhost:5432/management_bot"

    jwt_secret: str = "dev-only-change-me"

    encryption_key: str = ""

    access_token_expire_days: int = 7

    cookie_secure: bool = False

    admin_secret: str = ""

    log_retention_days: int = 7

    cors_origins: str = "http://localhost:3000"

    telegram_poll_timeout: int = 30

    telegram_poll_limit: int = Field(default=100, ge=1, le=100)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
