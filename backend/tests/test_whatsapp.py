from datetime import datetime

from app.services.whatsapp import (
    parse_whatsapp_export,
    process_whatsapp_export,
)


def test_parse_ios_export_and_infer_date_order():
    text = (
        "[17/11/2026, 9:05:00 PM] Ahmed: 550 علي فاتورة نجارة\n"
        "[18/11/2026, 10:00 AM] Sara: 1350 عمرو محمد مهدي النص تسديد شهر 11\n"
    )

    parsed = parse_whatsapp_export(text)

    assert parsed.date_order == "dmy"
    assert parsed.date_order_ambiguous is False
    assert len(parsed.messages) == 2
    assert parsed.messages[0].sender == "Ahmed"
    assert parsed.messages[0].date == datetime(2026, 11, 17, 21, 5)
    assert parsed.senders == ["Ahmed", "Sara"]


def test_parse_android_export_with_arabic_digits():
    text = "١٧/١١/٢٠٢٦، ٩:٠٥ م - أحمد: ٥٥٠ علي فاتورة نجارة\n"

    parsed = parse_whatsapp_export(text, date_order="dmy")

    assert len(parsed.messages) == 1
    assert parsed.messages[0].sender == "أحمد"
    assert parsed.messages[0].date == datetime(2026, 11, 17, 21, 5)
    assert "550" in parsed.messages[0].body


def test_process_with_custom_pattern():
    text = "[17/11/2026, 9:05:00 PM] Ahmed: 550 فاتورة نجارة\n"
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

    result = process_whatsapp_export(
        text,
        patterns=patterns,
        fallback_to_default=False,
        date_order="dmy",
    )

    assert result.errors == []
    assert result.message_count == 1
    assert result.row_count == 1
    row = result.rows[0]
    assert row["value"] == 550
    assert row["date"] == datetime(2026, 11, 17, 21, 5)
    assert row["sender"] == "Ahmed"
    assert row["month"] == 11
    assert row["cells"][0] == "2026-11-17 21:05:00"
    assert row["cells"][1] == "Ahmed"
    assert row["cells"][2] == "550.0"


def test_process_falls_back_to_builtin_parser():
    text = "[17/11/2026, 9:05:00 PM] Ahmed: 550 علي فاتورة نجارة\n"

    result = process_whatsapp_export(text, fallback_to_default=True, date_order="dmy")

    assert result.errors == []
    assert result.row_count == 1
    assert result.rows[0]["name"] == "علي"
    assert result.rows[0]["description"] == "فاتورة نجارة"


def test_unmatched_message_is_counted():
    text = "[17/11/2026, 9:05:00 PM] Ahmed: hello there\n"

    result = process_whatsapp_export(text, fallback_to_default=True, date_order="dmy")

    assert result.row_count == 0
    assert result.unmatched_messages == 1


def test_multiline_message_keeps_continuation_lines():
    text = (
        "[17/11/2026, 9:05:00 PM] Ahmed: 550 فاتورة نجارة\n"
        "ملاحظة إضافية\n"
        "[18/11/2026, 10:00 AM] Sara: 1350 علي فاتورة\n"
    )
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

    result = process_whatsapp_export(
        text,
        patterns=patterns,
        fallback_to_default=False,
        date_order="dmy",
    )

    assert result.message_count == 2
    assert result.row_count == 2
    assert "ملاحظة إضافية" in result.rows[0]["raw"]
