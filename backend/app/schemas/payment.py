from datetime import datetime

from pydantic import BaseModel


# Define Pydantic models for payment output and pagination
class PaymentOut(BaseModel):
    id: int
    value: float
    currency: str
    kind: str
    name: str
    description: str | None
    month: int
    source: str
    received_at: datetime
    message_date: datetime | None


# Define a Pydantic model for paginated payment output with a list of PaymentOut
# items, total count, total value, current page, and page size
class PaymentPage(BaseModel):
    items: list[PaymentOut]
    total: int
    total_value: float
    total_usd: float = 0.0
    page: int
    page_size: int
