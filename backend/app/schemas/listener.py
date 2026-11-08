import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.security import normalize_channel_input, validate_bot_token


class ListenerCreate(BaseModel):
    label: str | None = Field(default=None, max_length=100)
    channel_input: str = Field(min_length=1, max_length=255)
    bot_token: str = Field(min_length=20, max_length=255)

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("channel_input")
    @classmethod
    def clean_channel(cls, value: str) -> str:
        return normalize_channel_input(value)

    @field_validator("bot_token")
    @classmethod
    def clean_token(cls, value: str) -> str:
        return validate_bot_token(value)


class ListenerUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=100)
    channel_input: str | None = Field(default=None, max_length=255)
    bot_token: str | None = Field(default=None, max_length=255)

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("channel_input")
    @classmethod
    def clean_channel(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_channel_input(value)

    @field_validator("bot_token")
    @classmethod
    def clean_token(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_bot_token(value)


class ListenerOut(BaseModel):
    id: uuid.UUID
    label: str | None
    channel_input: str
    resolved_chat_id: int | None
    chat_title: str | None
    bot_username: str | None
    status: str
    last_error: str | None
    last_error_at: datetime | None
    token_hint: str
    created_at: datetime
    updated_at: datetime
    payment_count: int = 0
    total_value: float = 0.0
    total_usd: float = 0.0
    last_activity_at: datetime | None = None


class MessageResponse(BaseModel):
    message: str
