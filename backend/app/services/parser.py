import re
import time
from dataclasses import dataclass
from datetime import datetime

CONTEXT_TTL_SECONDS = 10 * 60

ARABIC_DIGITS = str.maketrans(
    "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹",
    "01234567890123456789",
)

NUMBER_RE = re.compile(r"(?<![\w])(-?\d[\d,]*(?:\.\d+)?)(?![\w])")
AMOUNT_RE = re.compile(
    r"(?<![\w])(-?\d[\d,]*(?:\.\d+)?)(?:\s*(?P<multiplier>الف|ألف|آلاف|ألاف))?(?![\w])"
)
MONTH_RE = re.compile(r"شهر\s*(\d{1,2})")
USD_RE = re.compile(
    r"(?<![\w])(?:"
    r"(?:\$|دولار|USD)\s*(?P<leading>\d[\d,]*(?:\.\d+)?)"
    r"|(?P<trailing>\d[\d,]*(?:\.\d+)?)\s*(?:\$|دولار|USD)"
    r")(?![\w])",
    re.IGNORECASE,
)
REFUND_RE = re.compile(
    r"(?:تم\s+)?(?:ترجيع|إرجاع|ارجاع|مرتجع)\s*"
    r"(?P<currency>\$|دولار|USD)?\s*"
    r"(?P<number>\d[\d,]*(?:\.\d+)?)"
    r"(?:\s*(?P<multiplier>الف|ألف|آلاف|ألاف))?"
    r"(?P<suffix>\s*(?:\$|دولار|USD))?",
    re.IGNORECASE,
)

TOTAL_PREFIXES = (
    "واصل",
    "الواصل",
    "المجموع",
    "مجموع",
    "الإجمالي",
    "الاجمالي",
    "إجمالي",
    "اجمالي",
)

DESCRIPTION_KEYWORDS = (
    "حساب التركيب",
    "فرق ايام",
    "فرق أيام",
    "باقات",
    "باقة",
    "فاتورة",
    "اشتراك",
    "صيانة",
    "تركيب",
    "تسديد",
    "ترصيد",
    "رصيد",
    "مرتجع",
    "ترجيع",
    "رسوم",
    "قسط",
    "دفعة",
    "مبلغ",
)

SOURCE_STOP_WORDS = "|".join(
    (
        "حساب",
        "فاتورة",
        "باقات",
        "باقة",
        "اشتراك",
        "صيانة",
        "تركيب",
        "تسديد",
        "ترصيد",
        "رصيد",
        "مرتجع",
        "ترجيع",
        "إرجاع",
        "ارجاع",
        "فرق",
        "ايام",
        "أيام",
        "رسوم",
        "قسط",
        "دفعة",
        "مبلغ",
        "شهر",
        "شام",
        "كاش",
        "دولار",
        "الف",
        "ألف",
        "آلاف",
        "تم",
    )
)

SHAM_CASH_RE = re.compile(r"شام\s*[-ـ]?\s*كاش")
CASH_RE = re.compile(r"(?<![\w])(?:كاش|نقدي|نقدا|نقداً|عادي|نورمال)(?![\w])")
PERSON_SOURCE_RE = re.compile(
    rf"(?<![\w])(?:بيد|بإيد|بأيد|بايد|على\s+يد|على\s+إيد|عند)\s+(.+?)"
    rf"(?=\s*(?:\+|$|،|,|:|：|/|(?:{SOURCE_STOP_WORDS})(?![\w])))"
)


@dataclass
class PaymentData:
    value: float
    name: str
    description: str
    month: int | None = None
    source: str = ""
    currency: str = "SYP"
    kind: str = "payment"


class MessageParser:
    def __init__(self):
        self._pending: PaymentData | None = None
        self._context_source = ""
        self._context_time = 0.0

    def snapshot(self) -> dict:
        pending = None
        if self._pending is not None:
            pending = {
                "value": self._pending.value,
                "name": self._pending.name,
                "description": self._pending.description,
                "month": self._pending.month,
                "source": self._pending.source,
                "currency": self._pending.currency,
                "kind": self._pending.kind,
            }
        return {
            "pending": pending,
            "context_source": self._context_source,
            "context_time": self._context_time,
        }

    def restore(self, state: dict | None) -> None:
        if not isinstance(state, dict):
            return
        pending = state.get("pending")
        self._pending = None
        if isinstance(pending, dict):
            try:
                self._pending = PaymentData(
                    value=float(pending["value"]),
                    name=str(pending["name"]),
                    description=str(pending.get("description") or ""),
                    month=pending.get("month"),
                    source=str(pending.get("source") or ""),
                    currency=str(pending.get("currency") or "SYP"),
                    kind=str(pending.get("kind") or "payment"),
                )
            except (KeyError, TypeError, ValueError):
                self._pending = None
        self._context_source = str(state.get("context_source") or "")
        try:
            self._context_time = float(state.get("context_time") or 0.0)
        except (TypeError, ValueError):
            self._context_time = 0.0

    def parse(self, message: str) -> list[PaymentData]:
        text = self._normalize(message)
        payments = []
        context_source = self._current_context_source()
        for raw_line in text.splitlines():
            line = self._split_leading_number(raw_line.strip())
            if not line:
                continue
            if self._is_source_header(line):
                source, _ = self._extract_source(line)
                if source:
                    self._context_source = source
                    self._context_time = time.time()
                    context_source = source
                continue
            line_source, cleaned = self._extract_source(line)
            if not cleaned.strip():
                if line_source:
                    self._apply_source(payments, line_source)
                continue
            if self._skip(cleaned):
                continue
            payments.extend(self._parse_line(cleaned, line_source or context_source))
        current_month = datetime.now().month
        for payment in payments:
            self._move_person_to_description(payment)
            if not payment.source:
                payment.source = "كاش"
            if payment.month is None:
                payment.month = current_month
        return payments

    @staticmethod
    def _move_person_to_description(payment: PaymentData) -> None:
        parts = [part.strip() for part in (payment.source or "").split(" + ") if part.strip()]
        persons = [part for part in parts if part.startswith("بيد ")]
        if not persons:
            return
        payment.source = " + ".join(part for part in parts if part not in persons)
        extra = " + ".join(persons)
        if not payment.description:
            payment.description = extra
        elif extra not in payment.description:
            payment.description = f"{payment.description} + {extra}"

    def validate(self, data: PaymentData) -> tuple[bool, str]:
        if data.kind == "refund":
            if data.value >= 0:
                return False, "Refund value must be negative"
        elif data.value <= 0:
            return False, "Value must be positive"
        if not data.name:
            return False, "Name cannot be empty"
        if data.month is not None and not 1 <= data.month <= 12:
            return False, "Month must be between 1 and 12"
        return True, "Valid"

    def _normalize(self, message: str) -> str:
        text = message.translate(ARABIC_DIGITS)
        return text.replace("\u200f", "").replace("\u200e", "")

    def _split_leading_number(self, line: str) -> str:
        return re.sub(r"^(-?\d[\d,]*(?:\.\d+)?)(?=[^\s\d])", r"\1 ", line)

    def _is_source_header(self, line: str) -> bool:
        if line.endswith(":") or line.endswith("："):
            return True
        return "تم التسديد" in line and not NUMBER_RE.search(line)

    def _current_context_source(self) -> str:
        if not self._context_source:
            return ""
        if time.time() - self._context_time > CONTEXT_TTL_SECONDS:
            self._context_source = ""
            self._context_time = 0.0
            return ""
        return self._context_source

    def _extract_source(self, text: str) -> tuple[str, str]:
        sources = []
        cleaned = text.replace("تم التسديد", " ")

        if SHAM_CASH_RE.search(cleaned):
            sources.append("شام كاش")
            cleaned = SHAM_CASH_RE.sub(" ", cleaned)

        for match in PERSON_SOURCE_RE.finditer(cleaned):
            person = match.group(1).strip(" .-:؛;،,:：")
            if person:
                label = f"بيد {person}"
                if label not in sources:
                    sources.append(label)
        cleaned = PERSON_SOURCE_RE.sub(" ", cleaned)

        if CASH_RE.search(cleaned):
            if "كاش" not in sources:
                sources.append("كاش")
            cleaned = CASH_RE.sub(" ", cleaned)

        return " + ".join(sources), cleaned

    def _apply_source(self, payments: list[PaymentData], source: str) -> None:
        if payments:
            payments[-1].source = self._merge_sources(payments[-1].source, source)
        elif self._pending is not None:
            self._pending.source = self._merge_sources(self._pending.source, source)

    @staticmethod
    def _merge_sources(*sources: str) -> str:
        merged = []
        for source in sources:
            if not source:
                continue
            for part in source.split(" + "):
                part = part.strip()
                if part and part not in merged:
                    merged.append(part)
        return " + ".join(merged)

    def _skip(self, line: str) -> bool:
        if line.endswith(":") or line.endswith("："):
            return True
        if line.startswith(TOTAL_PREFIXES):
            return True
        return not NUMBER_RE.search(line)

    def _parse_line(self, line: str, source: str = "") -> list[PaymentData]:
        refunds = self._extract_refunds(line)
        usd_values = self._extract_usd_values(line)
        if not refunds and not usd_values:
            return self._parse_regular_line(line, source)

        cleaned = REFUND_RE.sub(" ", line)
        cleaned = USD_RE.sub(" ", cleaned)
        template = self._parse_template(cleaned, source)
        if template is None:
            return []

        results = []
        for value in usd_values:
            results.append(
                PaymentData(
                    value=value,
                    name=template.name,
                    description=template.description,
                    month=template.month,
                    source=template.source,
                    currency="USD",
                )
            )
        if template.value > 0:
            results.append(template)
        for value, currency in refunds:
            results.append(
                PaymentData(
                    value=-value,
                    name=template.name,
                    description=template.description,
                    month=template.month,
                    source=template.source,
                    currency=currency,
                    kind="refund",
                )
            )
        return results

    def _parse_template(self, line: str, source: str) -> PaymentData | None:
        regular = self._parse_regular_line(line, source, allow_pending=False)
        if regular:
            return regular[0]
        name, description, month = self._metadata_without_amount(line)
        if not name:
            return None
        return PaymentData(0.0, name, description, month, source)

    def _metadata_without_amount(self, text: str) -> tuple[str, str, int | None]:
        month_match = MONTH_RE.search(text)
        month = int(month_match.group(1)) if month_match else None
        cleaned = MONTH_RE.sub(" ", text)
        cleaned = REFUND_RE.sub(" ", cleaned)
        cleaned = USD_RE.sub(" ", cleaned)
        cleaned = AMOUNT_RE.sub(" ", cleaned)
        cleaned = cleaned.strip(" \t/+,:-،؛;")
        name, description = self._split_name_description(cleaned)
        name = name.strip(" \t/+,:-،؛;")
        description = self._extract_description(description) if description else ""
        return name, description, month

    def _extract_refunds(self, text: str) -> list[tuple[float, str]]:
        refunds = []
        for match in REFUND_RE.finditer(text):
            value = float(match.group("number").replace(",", ""))
            if match.group("multiplier"):
                value *= 1000
            currency = "USD" if match.group("currency") or match.group("suffix") else "SYP"
            refunds.append((value, currency))
        return refunds

    def _extract_usd_values(self, text: str) -> list[float]:
        values = []
        for match in USD_RE.finditer(REFUND_RE.sub(" ", text)):
            raw = match.group("leading") or match.group("trailing")
            if raw:
                values.append(float(raw.replace(",", "")))
        return values

    def _parse_regular_line(
        self, line: str, source: str = "", *, allow_pending: bool = True
    ) -> list[PaymentData]:
        month_match = MONTH_RE.search(line)
        month = int(month_match.group(1)) if month_match else None
        numbers = [
            match
            for match in AMOUNT_RE.finditer(line)
            if month_match is None
            or match.start() < month_match.start()
            or match.end() > month_match.end()
        ]
        if not numbers:
            return []
        before_first = line[: numbers[0].start()].strip(" \t(،,:-/+")
        starts_with_number = not before_first

        results = []
        if allow_pending and self._pending is not None:
            if starts_with_number and self._is_breakdown(line):
                pending = self._pending
                self._pending = None
                description = self._extract_description(line) or pending.description
                merged_source = self._merge_sources(pending.source, source)
                results.append(
                    PaymentData(
                        pending.value,
                        pending.name,
                        description,
                        month,
                        merged_source,
                        pending.currency,
                        pending.kind,
                    )
                )
                return results
            results.append(self._pending)
            self._pending = None

        if starts_with_number:
            payment = self._parse_value_first(line, numbers, month, source)
            if payment is not None:
                results.append(payment)
            return results

        payment = self._parse_name_first(line, numbers, month, source)
        if payment is not None:
            rest = line[numbers[0].end() :].strip(" \t(،,:-/+")
            if allow_pending and payment.month is None and not rest:
                self._pending = payment
            else:
                results.append(payment)
        return results

    def _parse_name_first(self, line, numbers, month, source=""):
        value_match = None
        name_end = None
        for match in numbers:
            if self._to_number(match) >= 100:
                value_match = match
                name_end = match.start()
                break
        if value_match is None:
            value_match = numbers[0]
            name_end = numbers[0].start()
        value = self._to_number(value_match)
        name = line[:name_end].strip(" \t(OO,:-/+")
        if not name:
            return None
        rest = line[value_match.end():]
        description = self._extract_description(rest)
        return PaymentData(value, name, description, month, source)

    def _parse_value_first(self, line, numbers, month, source=""):
        value = self._to_number(numbers[0])
        rest = line[numbers[0].end() :]
        rest = MONTH_RE.sub(" ", rest).strip(" ()")
        name, description = self._split_name_description(rest)
        name = name.strip(" \t/+,:-")
        if not name:
            return None
        if month is None and not description:
            return None
        return PaymentData(value, name, self._extract_description(description), month, source)

    def _split_name_description(self, text):
        indexes = [text.find(keyword) for keyword in DESCRIPTION_KEYWORDS if keyword in text]
        if indexes:
            index = min(indexes)
            return text[:index].strip(), text[index:].strip()
        return text, ""

    def _is_breakdown(self, line):
        match = AMOUNT_RE.search(line)
        if not match or MONTH_RE.search(line) is None:
            return False
        rest = line[match.end() :].lstrip(" \t(،,+:-/")
        return rest.startswith(DESCRIPTION_KEYWORDS)

    def _extract_description(self, text):
        text = MONTH_RE.sub(" ", text)
        text = AMOUNT_RE.sub(" ", text)
        text = text.replace("تسديد", " ")
        text = text.replace("(", " ").replace(")", " ")
        parts = re.split(r"\s*\+\s*|[،,]", text)
        labels = []
        for part in parts:
            part = re.sub(r"\s+", " ", part).strip(" .-:؛;/")
            if part and part not in labels:
                labels.append(part)
        return " + ".join(labels)

    @staticmethod
    def _to_number(match):
        value = float(match.group(1).replace(",", ""))
        if match.groupdict().get("multiplier"):
            value *= 1000
        return value
