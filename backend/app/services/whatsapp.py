import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Literal

from app.services.parser import ARABIC_DIGITS, MessageParser, PaymentData
from app.services.pattern_engine import (
    compile_patterns,
    merge_export_columns,
    normalize_text,
    parse_compiled_lines,
    pattern_export_columns,
    resolve_row_cells,
)

DateOrder = Literal["dmy", "mdy"]

INVISIBLE_RE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\u061c\u00ad\ufeff]")
SPACE_RE = re.compile(r"[\u00a0\u202f\u2009]")

IOS_HEADER_RE = re.compile(
    r"^\[(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})[,\u060c]?\s+"
    r"(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm]|ص|م)?\]\s*"
    r"([^:]{1,120}?):\s?([\s\S]*)$"
)
ANDROID_HEADER_RE = re.compile(
    r"^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})[,\u060c]?\s+"
    r"(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm]|ص|م)?\s+"
    r"[-–—]\s+([^:]{1,120}?):\s?([\s\S]*)$"
)
DATED_LINE_RE = re.compile(r"^(?:\[)?\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}[,\u060c]?")

WHATSAPP_DEFAULT_COLUMNS: list[dict[str, Any]] = [
    {"key": "date", "header": "Date", "source": "field", "field": "date", "default": None},
    {"key": "sender", "header": "Sender", "source": "field", "field": "sender", "default": None},
    {"key": "value", "header": "Value", "source": "field", "field": "value", "default": None},
    {
        "key": "currency",
        "header": "Currency",
        "source": "field",
        "field": "currency",
        "default": "SYP",
    },
    {"key": "name", "header": "Name", "source": "field", "field": "name", "default": None},
    {
        "key": "description",
        "header": "Description",
        "source": "field",
        "field": "description",
        "default": None,
    },
    {"key": "month", "header": "Month", "source": "field", "field": "month", "default": None},
    {"key": "source", "header": "Source", "source": "field", "field": "source", "default": "كاش"},
    {"key": "kind", "header": "Type", "source": "field", "field": "kind", "default": "payment"},
]


@dataclass
class MessageDate:
    tokens: tuple[int, int, int]
    year_first: bool
    hour: int
    minute: int
    second: int


@dataclass
class ParsedMessage:
    date: MessageDate
    sender: str
    body: str


@dataclass
class WhatsAppMessage:
    date: datetime
    sender: str
    body: str


@dataclass
class WhatsAppExport:
    messages: list[WhatsAppMessage]
    date_order: DateOrder
    date_order_ambiguous: bool
    senders: list[str]
    errors: list[str] = field(default_factory=list)


@dataclass
class WhatsAppProcessingResult:
    rows: list[dict[str, Any]]
    columns: list[dict[str, Any]]
    message_count: int
    row_count: int
    unmatched_messages: int
    date_order: DateOrder
    date_order_ambiguous: bool
    total_syp: float
    total_usd: float
    senders: list[str]
    errors: list[str]


def clean_text(value: str) -> str:
    return SPACE_RE.sub(" ", INVISIBLE_RE.sub("", value)).strip()


def normalize_digits(value: str) -> str:
    return value.replace("\u066c", ",").replace("\u066b", ".").translate(ARABIC_DIGITS)


def whatsapp_default_columns() -> list[dict[str, Any]]:
    return [dict(column) for column in WHATSAPP_DEFAULT_COLUMNS]


def _parse_header(match: re.Match[str], unknown_sender: str) -> ParsedMessage | None:
    first = int(match.group(1))
    second = int(match.group(2))
    third = int(match.group(3))
    first_is_year = len(match.group(1)) == 4 or first > 31

    if first_is_year:
        tokens = (first, second, third)
    else:
        year = 2000 + third if len(match.group(3)) <= 2 else third
        tokens = (first, second, year)

    hour = int(match.group(4))
    marker = clean_text(match.group(7) or "").lower()
    if marker in ("pm", "م"):
        if hour < 12:
            hour += 12
    elif marker in ("am", "ص"):
        if hour == 12:
            hour = 0

    minute = int(match.group(5))
    second_of_minute = int(match.group(6) or 0)
    if hour > 23 or minute > 59 or second_of_minute > 59:
        return None

    return ParsedMessage(
        date=MessageDate(
            tokens=tokens,
            year_first=first_is_year,
            hour=hour,
            minute=minute,
            second=second_of_minute,
        ),
        sender=clean_text(match.group(8)) or unknown_sender,
        body=match.group(9) or "",
    )


def _resolve_ymd(parts: MessageDate, order: DateOrder) -> tuple[int, int, int]:
    if parts.year_first:
        return parts.tokens[0], parts.tokens[1], parts.tokens[2]
    first, second, year = parts.tokens
    if order == "dmy":
        return year, second, first
    return year, first, second


def _resolve_date(parts: MessageDate, order: DateOrder) -> datetime:
    year, month, day = _resolve_ymd(parts, order)
    return datetime(
        year,
        month,
        day,
        parts.hour,
        parts.minute,
        parts.second,
    )


def _is_valid_date(parts: MessageDate, order: DateOrder | None = None) -> bool:
    orders = (order,) if order else ("dmy", "mdy")
    for candidate in orders:
        try:
            resolved = _resolve_date(parts, candidate)
        except ValueError:
            continue
        year, month, day = _resolve_ymd(parts, candidate)
        if resolved.year == year and resolved.month == month and resolved.day == day:
            return True
    return False


def _infer_date_order(dates: list[MessageDate]) -> tuple[DateOrder, bool]:
    day_first = 0
    month_first = 0
    ambiguous_dates: list[MessageDate] = []

    for parts in dates:
        if parts.year_first:
            continue
        first, second, _ = parts.tokens
        if first > 31 or second > 31:
            continue
        if first > 12 and second <= 12:
            day_first += 1
        elif second > 12 and first <= 12:
            month_first += 1
        elif first <= 12 and second <= 12:
            ambiguous_dates.append(parts)

    if day_first != month_first:
        return ("dmy" if day_first > month_first else "mdy"), False
    if day_first > 0:
        return "dmy", True

    if ambiguous_dates:
        cutoff = datetime.now() + timedelta(days=1)
        dmy_future = 0
        mdy_future = 0
        for parts in ambiguous_dates:
            try:
                if _resolve_date(parts, "dmy") > cutoff:
                    dmy_future += 1
            except ValueError:
                pass
            try:
                if _resolve_date(parts, "mdy") > cutoff:
                    mdy_future += 1
            except ValueError:
                pass
        if dmy_future != mdy_future:
            return ("dmy" if dmy_future < mdy_future else "mdy"), True
        return "dmy", True

    return "dmy", False


def parse_whatsapp_export(
    text: str,
    *,
    date_order: DateOrder | None = None,
) -> WhatsAppExport:
    unknown_sender = "Unknown"
    lines = normalize_text(text).replace("\r\n", "\n").split("\n")
    candidates: list[ParsedMessage] = []
    current: ParsedMessage | None = None
    errors: list[str] = []

    for raw_line in lines:
        line = clean_text(normalize_digits(raw_line))

        if not line:
            if current is not None:
                current.body += "\n"
            continue

        match = IOS_HEADER_RE.match(line) or ANDROID_HEADER_RE.match(line)
        if match:
            parsed = _parse_header(match, unknown_sender)
            if parsed is not None:
                candidates.append(parsed)
                current = parsed
            else:
                current = None
            continue

        if DATED_LINE_RE.match(line):
            current = None
            continue

        if current is not None:
            current.body += (current.body and "\n" or "") + line

    valid_candidates = [item for item in candidates if _is_valid_date(item.date)]
    if date_order is not None:
        order: DateOrder = date_order
        ambiguous = False
    else:
        order, ambiguous = _infer_date_order([item.date for item in valid_candidates])

    messages: list[WhatsAppMessage] = []
    for item in valid_candidates:
        try:
            resolved = _resolve_date(item.date, order)
        except ValueError:
            errors.append("Skipped a message with an invalid date")
            continue
        messages.append(
            WhatsAppMessage(
                date=resolved,
                sender=item.sender,
                body=item.body.strip(),
            )
        )

    senders = sorted({message.sender for message in messages if message.sender})
    return WhatsAppExport(
        messages=messages,
        date_order=order,
        date_order_ambiguous=ambiguous,
        senders=senders,
        errors=errors,
    )


def _add_error(errors: list[str], message: str) -> None:
    if len(errors) < 50 and message not in errors:
        errors.append(message)


def process_whatsapp_export(
    text: str,
    *,
    patterns: list[dict[str, Any]] | None = None,
    export_columns: list[dict[str, Any]] | None = None,
    fallback_to_default: bool = True,
    date_order: DateOrder | None = None,
) -> WhatsAppProcessingResult:
    exported = parse_whatsapp_export(text, date_order=date_order)
    columns = export_columns or whatsapp_default_columns()
    pattern_columns = pattern_export_columns(patterns)
    display_columns = merge_export_columns(columns, list(pattern_columns.values()))
    errors = list(exported.errors)

    try:
        compiled_patterns = compile_patterns(patterns or [])
    except ValueError as error:
        _add_error(errors, str(error))
        compiled_patterns = []
        fallback_to_default = True

    rows: list[dict[str, Any]] = []
    unmatched_messages = 0

    for message in exported.messages:
        custom_payments: list[PaymentData] = []
        if compiled_patterns:
            custom_result = parse_compiled_lines(
                message.body,
                compiled_patterns,
                default_month=message.date.month,
                export_columns=columns,
            )
            custom_payments = custom_result.payments
            for error in custom_result.errors:
                _add_error(errors, error)

        payments = custom_payments
        if not payments and fallback_to_default and message.body.strip():
            parser = MessageParser()
            try:
                parsed = parser.parse(message.body, default_month=message.date.month)
            except Exception as error:
                _add_error(errors, f"Built-in parser failed: {error}")
                parsed = []
            payments = [payment for payment in parsed if parser.validate(payment)[0]]

        if not payments:
            if message.body.strip():
                unmatched_messages += 1
            continue

        for payment in payments:
            row = {
                "date": message.date,
                "sender": message.sender,
                "raw": message.body,
                "pattern": payment.pattern_name,
                "value": payment.value,
                "name": payment.name,
                "description": payment.description,
                "month": payment.month or message.date.month,
                "source": payment.source,
                "currency": payment.currency,
                "kind": payment.kind,
                "extra": payment.extra,
            }
            row["cells"] = resolve_row_cells(row, display_columns)
            rows.append(row)

    total_syp = sum(float(row["value"]) for row in rows if row["currency"] == "SYP")
    total_usd = sum(float(row["value"]) for row in rows if row["currency"] == "USD")

    return WhatsAppProcessingResult(
        rows=rows,
        columns=display_columns,
        message_count=len(exported.messages),
        row_count=len(rows),
        unmatched_messages=unmatched_messages,
        date_order=exported.date_order,
        date_order_ambiguous=exported.date_order_ambiguous,
        total_syp=total_syp,
        total_usd=total_usd,
        senders=exported.senders,
        errors=errors,
    )
