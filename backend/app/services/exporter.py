import re
from datetime import UTC, datetime
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from app.models.payment import Payment
from app.services.pattern_engine import default_export_columns, resolve_row_value

HEADERS = ["Date", "Value", "Currency", "Name", "Description", "Month", "Source", "Type"]

DANGEROUS_PREFIXES = ("=", "+", "-", "@")

DEFAULT_PATTERN_LABEL = "Default"

SHEET_TITLE_INVALID_RE = re.compile(r"[\\/*?:\[\]\x00-\x1f]")
SHEET_TITLE_WHITESPACE_RE = re.compile(r"\s+")
MAX_SHEET_TITLE_LENGTH = 31

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
        "pattern": payment.pattern_name,
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


def _sheet_title(name: str | None, used: set[str]) -> str:
    base = (name or DEFAULT_PATTERN_LABEL).strip()
    base = SHEET_TITLE_INVALID_RE.sub(" ", base)
    base = SHEET_TITLE_WHITESPACE_RE.sub(" ", base).strip(" '")
    base = base[:MAX_SHEET_TITLE_LENGTH] or DEFAULT_PATTERN_LABEL

    candidate = base
    counter = 2
    while candidate.casefold() in used:
        suffix = f" ({counter})"
        candidate = f"{base[: MAX_SHEET_TITLE_LENGTH - len(suffix)].rstrip()}{suffix}"
        counter += 1

    used.add(candidate.casefold())
    return candidate


def _pattern_buckets(rows: list[dict[str, Any]]) -> list[tuple[str | None, list[dict[str, Any]]]]:
    buckets: dict[str | None, list[dict[str, Any]]] = {}
    for row in rows:
        raw_pattern = row.get("pattern")
        pattern = str(raw_pattern).strip() if raw_pattern is not None else ""
        key = pattern or None
        buckets.setdefault(key, []).append(row)

    ordered: list[tuple[str | None, list[dict[str, Any]]]] = []
    if None in buckets:
        ordered.append((None, buckets.pop(None)))
    ordered.extend(buckets.items())
    return ordered


def _write_sheet(
    sheet: Worksheet,
    rows: list[dict[str, Any]],
    columns: list[dict[str, Any]],
    header_fill: PatternFill,
    header_font: Font,
) -> None:
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


def build_rows_workbook(
    rows: list[dict[str, Any]],
    columns: list[dict[str, Any]] | None = None,
    pattern_columns: dict[str, list[dict[str, Any]]] | None = None,
) -> bytes:
    columns = columns or default_export_columns()
    pattern_columns = pattern_columns or {}
    workbook = Workbook()

    header_fill = PatternFill("solid", fgColor="0F766E")
    header_font = Font(bold=True, color="FFFFFF")

    buckets = _pattern_buckets(rows) or [(None, [])]
    used_titles: set[str] = set()
    for index, (pattern, bucket_rows) in enumerate(buckets):
        title = _sheet_title(pattern, used_titles)
        sheet = workbook.active if index == 0 else workbook.create_sheet()
        sheet.title = title
        sheet_columns = (pattern_columns.get(pattern) if pattern else None) or columns
        _write_sheet(sheet, bucket_rows, sheet_columns, header_fill, header_font)

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def build_payments_workbook(
    payments: list[Payment],
    columns: list[dict[str, Any]] | None = None,
    pattern_columns: dict[str, list[dict[str, Any]]] | None = None,
) -> bytes:
    return build_rows_workbook(
        [payment_to_row(payment) for payment in payments],
        columns,
        pattern_columns,
    )
