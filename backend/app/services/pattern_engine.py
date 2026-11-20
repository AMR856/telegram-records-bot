import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.services.parser import ARABIC_DIGITS, PaymentData

PLACEHOLDER_RE = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")
INVISIBLE_RE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\u061c\u00ad\ufeff]")
SPACE_RE = re.compile(r"[\u00a0\u202f\u2009]")
WHITESPACE_RE = re.compile(r"\s+")

STORAGE_FIELDS = {
    "value",
    "name",
    "description",
    "month",
    "source",
    "currency",
    "kind",
}
DERIVED_FIELDS = {"date", "sender", "raw"}
EXPORT_FIELDS = STORAGE_FIELDS | DERIVED_FIELDS
PATTERN_TYPES = {"number", "text", "word", "month"}
MONTH_DEFAULT_CURRENT = "@current"
MONTH_DEFAULT_MESSAGE = "@message"

THOUSAND_WORDS = ("الف", "ألف", "آلاف", "ألاف")
AMOUNT_PATTERN = r"-?\d[\d,]*(?:\.\d+)?(?:\s*(?:الف|ألف|آلاف|ألاف))?"
NUMBER_GROUP = rf"({AMOUNT_PATTERN})"
TEXT_GROUP = r"(.+?)"
WORD_GROUP = r"(\S+)"
MONTH_GROUP = r"(\d{1,2})"
CURRENCY_PATTERN = (
    r"(?:\$|USD|SYP|دولار|ل\.?\s?س|ليرة\s+سوري(?:ة|ه)?|ليرة(?!\s+سوري))"
)
CURRENCY_GROUP = rf"({CURRENCY_PATTERN})"

DEFAULT_EXPORT_COLUMNS: list[dict[str, Any]] = [
    {"key": "date", "header": "Date", "source": "field", "field": "date", "default": None},
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


class PatternError(ValueError):
    pass


@dataclass
class CompiledPattern:
    name: str
    template: str
    fields: list[dict[str, Any]]
    defaults: dict[str, str]
    enabled: bool
    regex: re.Pattern[str]
    group_map: dict[str, dict[str, Any]]
    export_columns: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class PatternParseResult:
    payments: list[PaymentData] = field(default_factory=list)
    unmatched_lines: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def default_export_columns() -> list[dict[str, Any]]:
    return [dict(column) for column in DEFAULT_EXPORT_COLUMNS]


def normalize_text(value: str) -> str:
    text = value.replace("\u066c", ",").replace("\u066b", ".")
    text = text.translate(ARABIC_DIGITS)
    text = INVISIBLE_RE.sub("", text)
    text = SPACE_RE.sub(" ", text)
    return text.replace("\r\n", "\n").replace("\r", "\n")


def normalize_line(value: str) -> str:
    return WHITESPACE_RE.sub(" ", normalize_text(value)).strip()


def parse_amount(raw: str) -> float:
    text = normalize_line(raw).replace(",", "")
    multiplier = 1
    for word in THOUSAND_WORDS:
        if text.endswith(word):
            text = text[: -len(word)].strip()
            multiplier = 1000
            break
    value = float(text)
    return value * multiplier


def _literal_regex(value: str) -> str:
    text = WHITESPACE_RE.sub(" ", normalize_text(value))
    if not text:
        return ""
    return r"\s+".join(re.escape(part) for part in text.split(" "))


def _compile_pattern(pattern: dict[str, Any]) -> CompiledPattern:
    name = str(pattern.get("name") or "").strip() or "Pattern"
    template = str(pattern.get("template") or "")
    fields = pattern.get("fields") or []
    defaults = pattern.get("defaults") or {}
    enabled = bool(pattern.get("enabled", True))
    raw_columns = pattern.get("export_columns") or []

    if not template.strip():
        raise PatternError(f"{name}: template is empty")
    if not isinstance(fields, list) or not fields:
        raise PatternError(f"{name}: at least one placeholder is required")
    if not isinstance(defaults, dict):
        raise PatternError(f"{name}: defaults must be an object")
    if not isinstance(raw_columns, list):
        raise PatternError(f"{name}: export columns must be a list")

    field_by_placeholder: dict[str, dict[str, Any]] = {}
    for raw_field in fields:
        if not isinstance(raw_field, dict):
            raise PatternError(f"{name}: invalid field definition")
        placeholder = str(raw_field.get("placeholder") or "").strip()
        target = str(raw_field.get("target") or "").strip()
        field_type = str(raw_field.get("type") or "text").strip().lower()
        if not PLACEHOLDER_RE.fullmatch("{" + placeholder + "}"):
            raise PatternError(f"{name}: invalid placeholder name '{placeholder}'")
        if not target:
            raise PatternError(f"{name}: placeholder '{placeholder}' has no target column")
        if field_type not in PATTERN_TYPES:
            raise PatternError(f"{name}: unsupported placeholder type '{field_type}'")
        if placeholder in field_by_placeholder:
            raise PatternError(f"{name}: duplicate placeholder '{placeholder}'")
        field_by_placeholder[placeholder] = {
            "placeholder": placeholder,
            "target": target,
            "type": field_type,
        }

    matches = list(PLACEHOLDER_RE.finditer(template))
    template_placeholders = [match.group(1) for match in matches]
    stripped = PLACEHOLDER_RE.sub("", template)
    if "{" in stripped or "}" in stripped:
        raise PatternError(f"{name}: invalid braces in template")
    if not template_placeholders:
        raise PatternError(f"{name}: template has no placeholders")
    if len(set(template_placeholders)) != len(template_placeholders):
        raise PatternError(f"{name}: each placeholder may appear only once")
    if set(template_placeholders) != set(field_by_placeholder):
        missing = set(field_by_placeholder) - set(template_placeholders)
        extra = set(template_placeholders) - set(field_by_placeholder)
        details = []
        if missing:
            details.append(f"missing from template: {', '.join(sorted(missing))}")
        if extra:
            details.append(f"missing field mapping: {', '.join(sorted(extra))}")
        raise PatternError(f"{name}: {'; '.join(details)}")

    literals: list[str] = []
    cursor = 0
    for match in matches:
        literals.append(template[cursor : match.start()])
        cursor = match.end()
    literals.append(template[cursor:])

    parts: list[str] = []
    group_map: dict[str, dict[str, Any]] = {}
    for group_index, match in enumerate(matches):
        placeholder = match.group(1)
        spec = field_by_placeholder[placeholder]
        separator = _literal_regex(literals[group_index])
        if group_index > 0 and not separator:
            raise PatternError(
                f"{name}: placeholders '{placeholder}' and the previous one "
                "need literal text between them"
            )
        if spec["target"] == "currency":
            group = CURRENCY_GROUP
        elif spec["type"] == "number":
            group = NUMBER_GROUP
        elif spec["type"] == "month":
            group = MONTH_GROUP
        elif spec["type"] == "word":
            group = WORD_GROUP
        else:
            is_last = match.end() == len(template)
            group = r"(.+)" if is_last else TEXT_GROUP
        group_name = f"g{group_index}"
        capture = f"(?P<{group_name}>{group[1:-1]})"
        parts.append(separator)
        parts.append(capture)
        group_map[group_name] = dict(spec)
    parts.append(_literal_regex(literals[-1]))

    regex = re.compile("^" + "".join(parts) + "$", re.IGNORECASE)
    return CompiledPattern(
        name=name,
        template=template,
        fields=list(field_by_placeholder.values()),
        defaults={str(key): str(value) for key, value in defaults.items()},
        enabled=enabled,
        regex=regex,
        group_map=group_map,
        export_columns=[
            dict(column) for column in raw_columns if isinstance(column, dict)
        ],
    )


def compile_patterns(patterns: list[dict[str, Any]]) -> list[CompiledPattern]:
    compiled = []
    for pattern in patterns:
        if not isinstance(pattern, dict):
            raise PatternError("Invalid pattern definition")
        if not pattern.get("enabled", True):
            continue
        compiled.append(_compile_pattern(pattern))
    return compiled


def _target_map(export_columns: list[dict[str, Any]] | None) -> dict[str, tuple[str, str]]:
    mapping = {name: ("field", name) for name in STORAGE_FIELDS}
    for column in export_columns or []:
        if not isinstance(column, dict):
            continue
        key = str(column.get("key") or "").strip()
        source = str(column.get("source") or "").strip()
        if not key:
            continue
        if source == "field":
            field_name = str(column.get("field") or "").strip()
            if field_name in STORAGE_FIELDS:
                mapping[key] = ("field", field_name)
        elif source == "custom":
            mapping[key] = ("custom", key)
    return mapping


def _clean_value(value: str) -> str:
    return value.strip(" \t/+,:-،؛;.|")


def _resolve_month(raw: str | None, context_month: int) -> int:
    if raw is None or not str(raw).strip():
        return context_month
    text = str(raw).strip().lower()
    if text in (MONTH_DEFAULT_CURRENT, "current"):
        return datetime.now().month
    if text in (MONTH_DEFAULT_MESSAGE, "message"):
        return context_month
    try:
        month = int(float(text))
    except ValueError as error:
        raise PatternError(f"Invalid month value '{raw}'") from error
    if not 1 <= month <= 12:
        raise PatternError(f"Month must be between 1 and 12, got '{raw}'")
    return month


def _normalize_currency(raw: str | None) -> str:
    if not raw:
        return "SYP"
    text = normalize_line(raw).upper()
    if "$" in text or "USD" in text or "دولار" in text:
        return "USD"
    return "SYP"


def _payment_from_match(
    compiled: CompiledPattern,
    match: re.Match[str],
    *,
    context_month: int,
    target_map: dict[str, tuple[str, str]],
) -> PaymentData:
    captured: dict[str, str] = {}
    for group_name, spec in compiled.group_map.items():
        raw = match.group(group_name)
        if raw is None:
            continue
        raw = raw.strip()
        if not raw:
            continue
        if spec["type"] == "number":
            try:
                captured[spec["target"]] = str(parse_amount(raw))
            except ValueError as error:
                raise PatternError(
                    f"{compiled.name}: invalid number '{raw}' for {spec['placeholder']}"
                ) from error
        elif spec["type"] == "month":
            try:
                month = int(raw)
            except ValueError as error:
                raise PatternError(f"{compiled.name}: invalid month '{raw}'") from error
            if not 1 <= month <= 12:
                raise PatternError(f"{compiled.name}: month must be between 1 and 12")
            captured[spec["target"]] = str(month)
        else:
            captured[spec["target"]] = _clean_value(raw)

    for key, value in compiled.defaults.items():
        captured.setdefault(key, value)

    canonical: dict[str, str] = {}
    extra: dict[str, str] = {}
    for key, value in captured.items():
        kind, resolved = target_map.get(key, ("custom", key))
        if kind == "field":
            canonical[resolved] = value
        else:
            if str(value).strip():
                extra[resolved] = str(value).strip()

    value_raw = canonical.get("value")
    if value_raw is None or not str(value_raw).strip():
        raise PatternError(f"{compiled.name}: no value was captured")
    try:
        value = float(value_raw)
    except ValueError as error:
        raise PatternError(f"{compiled.name}: invalid payment value") from error

    month = _resolve_month(canonical.get("month"), context_month)
    kind = (canonical.get("kind") or "payment").strip().lower()
    if kind not in ("payment", "refund"):
        kind = "payment"
    if value < 0:
        kind = "refund"
    elif kind == "refund":
        value = -value

    description = (canonical.get("description") or "").strip()
    name = (canonical.get("name") or "").strip() or description or "—"
    source = (canonical.get("source") or "").strip() or "كاش"
    currency = _normalize_currency(canonical.get("currency"))

    return PaymentData(
        value=value,
        name=name[:255],
        description=description,
        month=month,
        source=source[:255],
        currency=currency,
        kind=kind,
        extra=extra,
        pattern_name=compiled.name[:100],
    )


def parse_pattern_lines(
    text: str,
    patterns: list[dict[str, Any]],
    *,
    default_month: int | None = None,
    export_columns: list[dict[str, Any]] | None = None,
) -> PatternParseResult:
    result = PatternParseResult()
    try:
        compiled_patterns = compile_patterns(patterns)
    except PatternError as error:
        result.errors.append(str(error))
        return result
    return parse_compiled_lines(
        text,
        compiled_patterns,
        default_month=default_month,
        export_columns=export_columns,
    )


def parse_compiled_lines(
    text: str,
    compiled_patterns: list[CompiledPattern],
    *,
    default_month: int | None = None,
    export_columns: list[dict[str, Any]] | None = None,
) -> PatternParseResult:
    result = PatternParseResult()
    context_month = default_month or datetime.now().month

    if not compiled_patterns:
        result.unmatched_lines = [line for line in normalize_text(text).split("\n") if line.strip()]
        return result

    ordered_patterns = sorted(
        compiled_patterns,
        key=lambda compiled: len(compiled.template),
        reverse=True,
    )
    target_maps = [
        _target_map(compiled.export_columns or export_columns)
        for compiled in ordered_patterns
    ]
    for raw_line in normalize_text(text).split("\n"):
        line = normalize_line(raw_line)
        if not line:
            continue
        matched = False
        for compiled, targets in zip(ordered_patterns, target_maps, strict=True):
            match = compiled.regex.fullmatch(line)
            if match is None:
                continue
            matched = True
            try:
                result.payments.append(
                    _payment_from_match(
                        compiled,
                        match,
                        context_month=context_month,
                        target_map=targets,
                    )
                )
            except PatternError as error:
                result.errors.append(str(error))
            break
        if not matched:
            result.unmatched_lines.append(line)
    return result


def pattern_export_columns(
    patterns: list[dict[str, Any]] | None,
) -> dict[str, list[dict[str, Any]]]:
    """Map each pattern name to its own export columns.

    Patterns without explicit columns are omitted so callers can fall back to the
    profile-level (built-in parser) columns.
    """
    mapping: dict[str, list[dict[str, Any]]] = {}
    for pattern in patterns or []:
        if not isinstance(pattern, dict):
            continue
        name = str(pattern.get("name") or "").strip()
        columns = pattern.get("export_columns") or []
        if not name or not isinstance(columns, list):
            continue
        cleaned = [dict(column) for column in columns if isinstance(column, dict)]
        if cleaned:
            mapping[name] = cleaned
    return mapping


def merge_export_columns(
    base: list[dict[str, Any]] | None,
    extras: list[list[dict[str, Any]]] | None,
) -> list[dict[str, Any]]:
    """Build a stable union of columns, keeping the first definition per key."""
    merged = [dict(column) for column in base or [] if isinstance(column, dict)]
    seen = {str(column.get("key") or "").strip() for column in merged}
    for columns in extras or []:
        for column in columns or []:
            if not isinstance(column, dict):
                continue
            key = str(column.get("key") or "").strip()
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(dict(column))
    return merged


def resolve_row_value(row: dict[str, Any], column: dict[str, Any]) -> Any:
    source = str(column.get("source") or "field")
    key = str(column.get("key") or "")
    default = column.get("default")
    value: Any = None
    if source == "constant":
        value = default
    elif source == "custom":
        extra = row.get("extra")
        if isinstance(extra, dict):
            value = extra.get(key)
        if value in (None, ""):
            value = default
    else:
        field_name = str(column.get("field") or key)
        value = row.get(field_name)
        if value in (None, ""):
            value = default
    return value


def resolve_row_cells(row: dict[str, Any], columns: list[dict[str, Any]]) -> list[str]:
    cells = []
    for column in columns:
        value = resolve_row_value(row, column)
        if value is None:
            cells.append("")
        elif isinstance(value, datetime):
            cells.append(value.strftime("%Y-%m-%d %H:%M:%S"))
        else:
            cells.append(str(value))
    return cells


def build_target_map(export_columns: list[dict[str, Any]] | None) -> dict[str, tuple[str, str]]:
    return _target_map(export_columns)
