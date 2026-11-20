from app.services.pattern_engine import (
    PatternError,
    compile_patterns,
    merge_export_columns,
    parse_pattern_lines,
    pattern_export_columns,
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
    assert payment.pattern_name == "invoice"


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


def test_longest_pattern_is_tried_first():
    patterns = [
        {
            "name": "generic",
            "template": "{amount} {name}",
            "fields": [
                {"placeholder": "amount", "target": "value", "type": "number"},
                {"placeholder": "name", "target": "name", "type": "text"},
            ],
        },
        {
            "name": "default invoice",
            "template": "{amount} {name} النص تسديد شهر {month}",
            "fields": [
                {"placeholder": "amount", "target": "value", "type": "number"},
                {"placeholder": "name", "target": "name", "type": "text"},
                {"placeholder": "month", "target": "month", "type": "month"},
            ],
        },
    ]

    result = parse_pattern_lines("1350 عمرو محمد مهدي النص تسديد شهر 11", patterns)

    assert result.errors == []
    assert len(result.payments) == 1
    assert result.payments[0].pattern_name == "default invoice"
    assert result.payments[0].name == "عمرو محمد مهدي"
    assert result.payments[0].month == 11


def test_currency_placeholder_is_required_when_in_template():
    patterns = [
        {
            "name": "with currency",
            "template": "{amount} {currency} {description}",
            "fields": [
                {"placeholder": "amount", "target": "value", "type": "number"},
                {"placeholder": "currency", "target": "currency", "type": "text"},
                {"placeholder": "description", "target": "description", "type": "text"},
            ],
        }
    ]

    result = parse_pattern_lines(
        "1350 محمد عصام تسديد شهر 11\n1350 عمرو محمد مهدي النص تسديد شهر 11",
        patterns,
    )

    assert result.payments == []
    assert result.unmatched_lines == [
        "1350 محمد عصام تسديد شهر 11",
        "1350 عمرو محمد مهدي النص تسديد شهر 11",
    ]
    assert result.errors == []


def test_currency_placeholder_accepts_currency_markers():
    patterns = [
        {
            "name": "with currency",
            "template": "{amount} {currency} {description}",
            "fields": [
                {"placeholder": "amount", "target": "value", "type": "number"},
                {"placeholder": "currency", "target": "currency", "type": "text"},
                {"placeholder": "description", "target": "description", "type": "text"},
            ],
        }
    ]

    result = parse_pattern_lines(
        "1350 $ محمد عصام\n1350 ل.س محمد عصام\n1350 ليرة سوري محمد عصام",
        patterns,
    )

    assert result.errors == []
    assert [payment.currency for payment in result.payments] == ["USD", "SYP", "SYP"]
    assert [payment.description for payment in result.payments] == [
        "محمد عصام",
        "محمد عصام",
        "محمد عصام",
    ]


def test_compiled_pattern_keeps_its_own_export_columns():
    columns = [
        {"key": "value", "header": "Amount", "source": "field", "field": "value"},
        {"key": "wood", "header": "Wood", "source": "custom"},
    ]
    patterns = [
        {
            "name": "wood invoice",
            "template": "{amount} {wood}",
            "fields": [
                {"placeholder": "amount", "target": "value", "type": "number"},
                {"placeholder": "wood", "target": "wood", "type": "text"},
            ],
            "export_columns": columns,
        }
    ]

    compiled = compile_patterns(patterns)

    assert compiled[0].export_columns == columns


def test_pattern_own_columns_are_used_when_mapping_targets():
    profile_columns = [
        {"key": "total", "header": "Total", "source": "field", "field": "value"},
        {"key": "name", "header": "Name", "source": "field", "field": "name"},
    ]
    patterns = [
        {
            "name": "profile targets",
            "template": "{total} to {name}",
            "fields": [
                {"placeholder": "total", "target": "total", "type": "number"},
                {"placeholder": "name", "target": "name", "type": "text"},
            ],
        },
        {
            "name": "own targets",
            "template": "{total} paid",
            "fields": [
                {"placeholder": "total", "target": "total", "type": "number"},
            ],
            "export_columns": [
                {
                    "key": "value",
                    "header": "Value",
                    "source": "field",
                    "field": "value",
                }
            ],
        },
    ]

    result = parse_pattern_lines(
        "100 to Ali\n200 paid",
        patterns,
        export_columns=profile_columns,
    )

    assert len(result.payments) == 1
    assert result.payments[0].pattern_name == "profile targets"
    assert result.payments[0].value == 100
    assert result.errors == ["own targets: no value was captured"]


def test_pattern_export_columns_helper_only_returns_own_columns():
    patterns = [
        {"name": "with columns", "export_columns": [{"key": "wood"}]},
        {"name": "without columns", "export_columns": []},
    ]

    assert pattern_export_columns(patterns) == {
        "with columns": [{"key": "wood"}]
    }


def test_merge_export_columns_appends_only_new_keys():
    base = [{"key": "value", "header": "Value"}]
    extras = [
        [{"key": "value", "header": "Amount"}, {"key": "wood", "header": "Wood"}],
        [{"key": "wood", "header": "Wood 2"}, {"key": "phone", "header": "Phone"}],
    ]

    merged = merge_export_columns(base, extras)

    assert [column["key"] for column in merged] == ["value", "wood", "phone"]
    assert merged[0]["header"] == "Value"


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
