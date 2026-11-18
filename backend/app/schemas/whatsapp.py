import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.pattern import ExportColumn, PatternProfileUpdate


class WhatsAppProfileCreate(PatternProfileUpdate):
    name: str = Field(default="Profile 1", min_length=1, max_length=100)


class WhatsAppProfileUpdate(PatternProfileUpdate):
    pass


class CopyFromListenerRequest(BaseModel):
    name: str | None = Field(default=None, max_length=100)


class WhatsAppRow(BaseModel):
    date: datetime | None = None
    sender: str = Field(default="", max_length=255)
    raw: str = Field(default="", max_length=20000)
    value: float | None = None
    name: str = Field(default="", max_length=255)
    description: str = Field(default="", max_length=20000)
    month: int | None = Field(default=None, ge=1, le=12)
    source: str = Field(default="", max_length=255)
    currency: str = Field(default="SYP", max_length=8)
    kind: str = Field(default="payment", max_length=16)
    extra: dict[str, str] = Field(default_factory=dict)
    cells: list[str] = Field(default_factory=list)


class WhatsAppParseResponse(BaseModel):
    rows: list[WhatsAppRow]
    columns: list[ExportColumn]
    message_count: int
    row_count: int
    unmatched_messages: int
    date_order: Literal["dmy", "mdy"]
    date_order_ambiguous: bool
    total_syp: float
    total_usd: float
    senders: list[str]
    errors: list[str]


class WhatsAppExportRequest(BaseModel):
    profile_id: uuid.UUID
    rows: list[WhatsAppRow] = Field(default_factory=list)
