from app.services.pattern_engine import (
    PatternError,
    compile_patterns,
    parse_pattern_lines,
    resolve_row_cells,
)


def test_simple_pattern_parses_arabic_digits_and_description():
    patterns = [
        {
            "name": "invoice",
            "template": "{amount} {description}",
            "fields": [
                {"placeholder": "amount", "target": "value", "type": "number"},
                {"placeholder": "description", "target": "description", "type": "text"},
            ],
        }
    ]

    result = parse_pattern_lines("٥٥٠ فاتورة نجارة", patterns)

    assert result.errors == []
    assert result.unmatched_lines == []
    assert len(result.payments) == 1
    payment = result.payments[0]
    assert payment.value == 550
    assert payment.name == "فاتورة نجارة"
    assert payment.description == "فاتورة نجارة"
    assert payment.currency == "SYP"


def test_custom_column_targets_and_defaults():
    patterns = [
        {
            "name": "phone payment",
            "template": "{phone} {amount}",
            "fields": [
                {"placeholder": "phone", "target": "phone", "type": "word"},
                {"placeholder": "amount", "target": "amount", "type": "number"},
            ],
            "defaults": {"currency": "USD", "month": "@message"},
        }
    ]
    columns = [
        {"key": "phone", "header": "Phone", "source": "custom"},
        {"key": "amount", "header": "Amount", "source": "field", "field": "value"},
    ]

    result = parse_pattern_lines(
        "0991234567 1,250",
        patterns,
        default_month=7,
        export_columns=columns,
    )

    assert result.errors == []
    payment = result.payments[0]
    assert payment.value == 1250
    assert payment.currency == "USD"
    assert payment.month == 7
    assert payment.extra == {"phone": "0991234567"}
    assert resolve_row_cells(
        {
            "date": None,
            "value": payment.value,
            "currency": payment.currency,
            "month": payment.month,
            "extra": payment.extra,
        },
        columns,
    ) == ["0991234567", "1250.0"]


def test_literal_anchor_captures_multi_word_name():
    patterns = [
        {
            "name": "named payment",
            "template": "{amount} {name} النص تسديد شهر {month}",
            "fields": [
                {"placeholder": "amount", "target": "value", "type": "number"},
                {"placeholder": "name", "target": "name", "type": "text"},
                {"placeholder": "month", "target": "month", "type": "month"},
            ],
        }
    ]

    result = parse_pattern_lines("1350 عمرو محمد مهدي النص تسديد شهر 11", patterns)

    assert result.errors == []
    assert len(result.payments) == 1
    assert result.payments[0].name == "عمرو محمد مهدي"
    assert result.payments[0].month == 11


def test_first_matching_pattern_wins_and_unmatched_lines_are_reported():
    patterns = [
        {
            "name": "first",
            "template": "{amount} {name}",
            "fields": [
                {"placeholder": "amount", "target": "value", "type": "number"},
                {"placeholder": "name", "target": "name", "type": "text"},
            ],
        },
        {
            "name": "second",
            "template": "{amount} {name}",
            "fields": [
                {"placeholder": "amount", "target": "value", "type": "number"},
                {"placeholder": "name", "target": "name", "type": "text"},
            ],
            "defaults": {"description": "second pattern"},
        },
    ]

    result = parse_pattern_lines("100 علي\nnot a payment", patterns)

    assert len(result.payments) == 1
    assert result.payments[0].description == ""
    assert result.unmatched_lines == ["not a payment"]


def test_invalid_template_reports_error():
    try:
        compile_patterns(
            [
                {
                    "name": "broken",
                    "template": "{amount",
                    "fields": [{"placeholder": "amount", "target": "value", "type": "number"}],
                }
            ]
        )
    except PatternError as error:
        assert "invalid braces" in str(error)
    else:
        raise AssertionError("PatternError was not raised")


def test_default_month_current_keyword():
    patterns = [
        {
            "name": "current month",
            "template": "{amount} {name}",
            "fields": [
                {"placeholder": "amount", "target": "value", "type": "number"},
                {"placeholder": "name", "target": "name", "type": "word"},
            ],
            "defaults": {"month": "@current"},
        }
    ]

    result = parse_pattern_lines("100 علي", patterns, default_month=3)

    assert len(result.payments) == 1
    assert 1 <= result.payments[0].month <= 12
