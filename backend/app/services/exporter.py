from datetime import UTC, datetime
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.models.payment import Payment
from app.services.pattern_engine import default_export_columns, resolve_row_value

HEADERS = ["Date", "Value", "Currency", "Name", "Description", "Month", "Source", "Type"]

DANGEROUS_PREFIXES = ("=", "+", "-", "@")

COLUMN_WIDTHS = {
    "date": 20,
    "value": 14,
    "currency": 10,
    "name": 30,
    "description": 40,
    "month": 8,
    "source": 24,
    "kind": 10,
    "sender": 24,
    "raw": 40,
}


def _safe_text(value) -> str:
    if value is None:
        return ""
    text = str(value)
    if text.startswith(DANGEROUS_PREFIXES):
        return f"'{text}"
    return text


def _excel_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(UTC).replace(tzinfo=None)
    return value


def payment_to_row(payment: Payment) -> dict[str, Any]:
    return {
        "date": payment.message_date or payment.received_at,
        "value": float(payment.value),
        "currency": payment.currency or "SYP",
        "name": payment.name,
        "description": payment.description,
        "month": int(payment.month),
        "source": payment.source,
        "kind": payment.kind or "payment",
        "extra": payment.extra or {},
    }


def _column_width(column: dict[str, Any]) -> int:
    field = str(column.get("field") or column.get("key") or "")
    if field in COLUMN_WIDTHS:
        return COLUMN_WIDTHS[field]
    return 24


def build_rows_workbook(
    rows: list[dict[str, Any]],
    columns: list[dict[str, Any]] | None = None,
) -> bytes:
    columns = columns or default_export_columns()
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Payments"

    header_fill = PatternFill("solid", fgColor="0F766E")
    header_font = Font(bold=True, color="FFFFFF")

    for index, column in enumerate(columns, start=1):
        cell = sheet.cell(row=1, column=index, value=column.get("header") or column["key"])
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for row_index, row in enumerate(rows, start=2):
        for column_index, column in enumerate(columns, start=1):
            value = resolve_row_value(row, column)
            cell = sheet.cell(row=row_index, column=column_index)
            if isinstance(value, datetime):
                cell.value = _excel_datetime(value)
                cell.number_format = "yyyy-mm-dd hh:mm:ss"
            elif column.get("field") == "value" and isinstance(value, (int, float)):
                cell.value = float(value)
                cell.number_format = "#,##0.00"
            elif column.get("field") == "month" and isinstance(value, (int, float)):
                cell.value = int(value)
                cell.number_format = "0"
            elif column.get("field") == "kind" and value is not None:
                cell.value = _safe_text(str(value).capitalize())
            else:
                cell.value = _safe_text(value)

    for index, column in enumerate(columns, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = _column_width(column)

    last_column = get_column_letter(max(len(columns), 1))
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = f"A1:{last_column}{max(sheet.max_row, 1)}"
    sheet.sheet_view.rightToLeft = False

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def build_payments_workbook(
    payments: list[Payment],
    columns: list[dict[str, Any]] | None = None,
) -> bytes:
    return build_rows_workbook([payment_to_row(payment) for payment in payments], columns)
