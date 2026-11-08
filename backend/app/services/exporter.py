from datetime import UTC, datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.models.payment import Payment

HEADERS = ["Date", "Value", "Currency", "Name", "Description", "Month", "Source", "Type"]

DANGEROUS_PREFIXES = ("=", "+", "-", "@")


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


def build_payments_workbook(payments: list[Payment]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Payments"

    header_fill = PatternFill("solid", fgColor="0F766E")
    header_font = Font(bold=True, color="FFFFFF")

    for index, header in enumerate(HEADERS, start=1):
        cell = sheet.cell(row=1, column=index, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for row_index, payment in enumerate(payments, start=2):
        date_cell = sheet.cell(
            row=row_index,
            column=1,
            value=_excel_datetime(payment.message_date or payment.received_at),
        )
        date_cell.number_format = "yyyy-mm-dd hh:mm:ss"
        sheet.cell(row=row_index, column=2, value=float(payment.value)).number_format = "#,##0.00"
        sheet.cell(row=row_index, column=3, value=_safe_text(payment.currency or "SYP"))
        sheet.cell(row=row_index, column=4, value=_safe_text(payment.name))
        sheet.cell(row=row_index, column=5, value=_safe_text(payment.description))
        sheet.cell(row=row_index, column=6, value=int(payment.month)).number_format = "0"
        sheet.cell(row=row_index, column=7, value=_safe_text(payment.source))
        sheet.cell(
            row=row_index,
            column=8,
            value=_safe_text((payment.kind or "payment").capitalize()),
        )

    widths = [20, 14, 10, 30, 40, 8, 24, 10]
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width

    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = f"A1:H{max(sheet.max_row, 1)}"
    sheet.sheet_view.rightToLeft = False

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
