from datetime import datetime

from pydantic import BaseModel


# Define Pydantic models for log output and pagination
class LogOut(BaseModel):
    id: int
    kind: str
    level: str
    text: str
    update_id: int | None
    message_id: int | None = None
    edited_at: datetime | None = None
    parsed_count: int
    created_at: datetime


# Define a Pydantic model for paginated log output with a list of LogOut items
# and an optional next_before_id for pagination
class LogPage(BaseModel):
    items: list[LogOut]
    next_before_id: int | None
