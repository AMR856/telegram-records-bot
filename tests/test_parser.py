import unittest
from datetime import datetime

from app.services.parser import MessageParser


class ParserTestCase(unittest.TestCase):
    def parse(self, message, parser=None):
        return (parser or MessageParser()).parse(message)

    def assert_payment(self, payment, value, name, description, month, source="كاش"):
        self.assertAlmostEqual(payment.value, value)
        self.assertEqual(payment.name, name)
        self.assertEqual(payment.description, description)
        self.assertEqual(payment.month, month)
        self.assertEqual(payment.source, source)

    def assert_single(self, message, value, name, description, month, source="كاش"):
        payments = self.parse(message)
        self.assertEqual(len(payments), 1, payments)
        self.assert_payment(payments[0], value, name, description, month, source)


class BasicParsingTests(ParserTestCase):
    def test_name_first(self):
        self.assert_single(
            "فضيل محمد هدلة 1850 فاتورة شهر 10", 1850, "فضيل محمد هدلة", "فاتورة", 10
        )

    def test_value_first(self):
        self.assert_single(
            "1850 فضيل محمد هدلة فاتورة شهر 10", 1850, "فضيل محمد هدلة", "فاتورة", 10
        )

    def test_value_first_without_description(self):
        self.assert_single("1000 علي محمد شهر 10", 1000, "علي محمد", "", 10)

    def test_tasdeed_description_dropped(self):
        self.assert_single(
            "1850 عمرو محمد مهدي النص تسديد شهر 11", 1850, "عمرو محمد مهدي النص", "", 11
        )

    def test_attached_digit_in_name_is_kept(self):
        self.assert_single(
            "رامي غرز الدين2 2400 فاتورة شهر 10", 2400, "رامي غرز الدين2", "فاتورة", 10
        )

    def test_name_contains_digit_before_amount(self):
        self.assert_single(
            '\u0631\u0627\u0645\u064a\u0020\u063a\u0631\u0632\u0020\u0627\u0644\u062f\u064a\u0646\u00202\u00202400\u0020\u0641\u0627\u062a\u0648\u0631\u0629\u0020\u0634\u0647\u0631\u002010',
            2400,
            '\u0631\u0627\u0645\u064a\u0020\u063a\u0631\u0632\u0020\u0627\u0644\u062f\u064a\u0646\u00202',
            '\u0641\u0627\u062a\u0648\u0631\u0629',
            10,
        )

    def test_name_contains_three_before_amount(self):
        self.assert_single(
            '\u0631\u0627\u0645\u064a\u0020\u063a\u0631\u0632\u0020\u0627\u0644\u062f\u064a\u0646\u00203\u00201500\u0020\u0641\u0627\u062a\u0648\u0631\u0629\u0020\u0634\u0647\u0631\u002010',
            1500,
            '\u0631\u0627\u0645\u064a\u0020\u063a\u0631\u0632\u0020\u0627\u0644\u062f\u064a\u0646\u00203',
            '\u0641\u0627\u062a\u0648\u0631\u0629',
            10,
        )

    def test_thousands_separator(self):
        self.assert_single(
            "O�OU.US O�O�O� OU,O_USU+ 1,850 U?OO�U^O�Oc O'U�O� 10", 1850, "O�OU.US O�O�O� OU,O_USU+", "U?OO�U^O�Oc", 10
        )

    def test_large_thousands_separator(self):
        self.assert_single("علي 1,000,500 فاتورة شهر 10", 1000500, "علي", "فاتورة", 10)

    def test_arabic_indic_digits(self):
        self.assert_single(
            "فضيل محمد هدلة ١٨٥٠ فاتورة شهر ١٠", 1850, "فضيل محمد هدلة", "فاتورة", 10
        )

    def test_month_without_space(self):
        self.assert_single("فضيل محمد هدلة 1850 فاتورة شهر10", 1850, "فضيل محمد هدلة", "فاتورة", 10)

    def test_multi_word_description(self):
        self.assert_single(
            "فضيل محمد هدلة 1850 حساب التركيب شهر 10", 1850, "فضيل محمد هدلة", "حساب التركيب", 10
        )

    def test_plus_description(self):
        self.assert_single("علي 1000 فاتورة + باقة شهر 10", 1000, "علي", "فاتورة + باقة", 10)

    def test_parentheses_breakdown(self):
        self.assert_single(
            "عمار محمود غرز الدين 2850 (1850 فاتورة شهر 10 + 1000 حساب التركيب )",
            2850,
            "عمار محمود غرز الدين",
            "فاتورة + حساب التركيب",
            10,
        )

    def test_tight_parentheses_breakdown(self):
        self.assert_single(
            "عمار محمود غرز الدين 2850(1850 فاتورة شهر 10+1000 حساب التركيب)",
            2850,
            "عمار محمود غرز الدين",
            "فاتورة + حساب التركيب",
            10,
        )

    def test_decimal_amount(self):
        self.assert_single("علي 1000.5 فاتورة شهر 10", 1000.5, "علي", "فاتورة", 10)

    def test_two_months_uses_first_month(self):
        self.assert_single("علي 1000 فاتورة شهر 10 + باقة شهر 11", 1000, "علي", "فاتورة + باقة", 10)

    def test_sham_cash_source(self):
        self.assert_single("علي 1000 شام كاش فاتورة شهر 10", 1000, "علي", "فاتورة", 10, "شام كاش")

    def test_sham_cash_source_at_end(self):
        self.assert_single("علي 1000 فاتورة شهر 10 شام كاش", 1000, "علي", "فاتورة", 10, "شام كاش")

    def test_sham_cash_without_space(self):
        self.assert_single("علي 1000 شامكاش فاتورة شهر 10", 1000, "علي", "فاتورة", 10, "شام كاش")

    def test_sham_cash_on_next_line(self):
        self.assert_single(
            "فضيل محمد هدلة 1850 فاتورة شهر10\nشام كاش",
            1850,
            "فضيل محمد هدلة",
            "فاتورة",
            10,
            "شام كاش",
        )

    def test_sham_cash_on_next_line_with_multiple_payments(self):
        message = """علي 1000 فاتورة شهر 10
شام كاش
محمد 2000 فاتورة شهر 10
كاش"""
        payments = self.parse(message)
        self.assertEqual(len(payments), 2)
        self.assert_payment(payments[0], 1000, "علي", "فاتورة", 10, "شام كاش")
        self.assert_payment(payments[1], 2000, "محمد", "فاتورة", 10, "كاش")

    def test_missing_source_defaults_to_cash(self):
        self.assert_single(
            "فضيل محمد هدلة 1850 فاتورة شهر 10", 1850, "فضيل محمد هدلة", "فاتورة", 10, "كاش"
        )

    def test_name_first_without_month_uses_current_month(self):
        self.assert_single(
            "فضيل محمد هدلة 1850 فاتورة",
            1850,
            "فضيل محمد هدلة",
            "فاتورة",
            datetime.now().month,
        )

    def test_value_first_without_month_uses_current_month(self):
        self.assert_single(
            "1850 فضيل محمد هدلة فاتورة",
            1850,
            "فضيل محمد هدلة",
            "فاتورة",
            datetime.now().month,
        )

    def test_tasdeed_without_month_uses_current_month(self):
        self.assert_single(
            "1850 عمرو محمد مهدي النص تسديد",
            1850,
            "عمرو محمد مهدي النص",
            "",
            datetime.now().month,
        )

    def test_normal_cash_source(self):
        self.assert_single("علي 1000 كاش فاتورة شهر 10", 1000, "علي", "فاتورة", 10, "كاش")

    def test_nakdi_source(self):
        self.assert_single("علي 1000 نقدي فاتورة شهر 10", 1000, "علي", "فاتورة", 10, "كاش")

    def test_by_person_source(self):
        self.assert_single(
            "علي 1000 بيد علاء فاتورة شهر 10",
            1000,
            "علي",
            "فاتورة + بيد علاء",
            10,
        )

    def test_by_person_source_at_end(self):
        self.assert_single(
            "علي 1000 فاتورة شهر 10 بيد علاء",
            1000,
            "علي",
            "فاتورة + بيد علاء",
            10,
        )

    def test_by_person_source_with_multiple_names(self):
        self.assert_single(
            "علي 1000 بيد ابو النور نايلة فاتورة شهر 10",
            1000,
            "علي",
            "فاتورة + بيد ابو النور نايلة",
            10,
        )

    def test_by_person_source_with_inda(self):
        self.assert_single(
            "علي 1000 عند علاء فاتورة شهر 10",
            1000,
            "علي",
            "فاتورة + بيد علاء",
            10,
        )

    def test_by_person_source_with_ala_yd(self):
        self.assert_single(
            "علي 1000 على يد علاء فاتورة شهر 10",
            1000,
            "علي",
            "فاتورة + بيد علاء",
            10,
        )

    def test_sham_cash_and_by_person_sources(self):
        self.assert_single(
            "علي 1000 شام كاش بيد علاء فاتورة شهر 10",
            1000,
            "علي",
            "فاتورة + بيد علاء",
            10,
            "شام كاش",
        )

    def test_tab_separated(self):
        self.assert_single(
            "فضيل محمد هدلة\t1850\tفاتورة\tشهر 10", 1850, "فضيل محمد هدلة", "فاتورة", 10
        )

    def test_rtl_marks(self):
        self.assert_single(
            "\u200fفضيل محمد هدلة 1850 فاتورة شهر 10\u200f", 1850, "فضيل محمد هدلة", "فاتورة", 10
        )

    def test_leading_glued_number(self):
        self.assert_single("1850علي فاتورة شهر 10", 1850, "علي", "فاتورة", 10)


class SkippedLinesTests(ParserTestCase):
    def test_header_with_colon_skipped(self):
        self.assertEqual(self.parse("تم التسديد عند ابو النور :"), [])

    def test_header_without_colon_skipped(self):
        self.assertEqual(self.parse("تم التسديد عند ابو النور"), [])

    def test_wael_total_skipped(self):
        self.assertEqual(self.parse("واصل 9800 شام كاش +200 بيد علاء"), [])

    def test_wael_total_with_name_skipped(self):
        self.assertEqual(self.parse("واصل 37950 من ابو النور نايلة"), [])

    def test_majmoo_total_skipped(self):
        self.assertEqual(self.parse("المجموع 9800"), [])

    def test_orphan_breakdown_ignored(self):
        self.assertEqual(self.parse("1000 فاتورة شهر 10 + 250 باقة"), [])

    def test_month_only_ignored(self):
        self.assertEqual(self.parse("شهر 10"), [])

    def test_no_value_ignored(self):
        self.assertEqual(self.parse("علي فاتورة شهر 10"), [])

    def test_trailing_colon_ignored(self):
        self.assertEqual(self.parse("علي 1000 فاتورة شهر 10:"), [])

    def test_midline_glued_number_ignored(self):
        self.assertEqual(self.parse("علي1000 فاتورة شهر 10"), [])

    def test_value_first_without_month_and_description_ignored(self):
        self.assertEqual(self.parse("1000 علي"), [])

    def test_bare_name_value_is_pending(self):
        self.assertEqual(self.parse("علي 1000"), [])


class ValidationTests(ParserTestCase):
    def test_zero_rejected(self):
        parser = MessageParser()
        payment = parser.parse("علي 0 فاتورة شهر 10")[0]
        valid, _ = parser.validate(payment)
        self.assertFalse(valid)

    def test_negative_rejected(self):
        parser = MessageParser()
        payment = parser.parse("علي -500 فاتورة شهر 10")[0]
        valid, _ = parser.validate(payment)
        self.assertFalse(valid)

    def test_month_above_twelve_rejected(self):
        parser = MessageParser()
        payment = parser.parse("علي 1000 فاتورة شهر 13")[0]
        valid, _ = parser.validate(payment)
        self.assertFalse(valid)


class MultiPaymentMessageTests(ParserTestCase):
    def test_multi_payment_message_with_total(self):
        message = """رامي غرز الدين 2900 فاتورة شهر 10
رامي غرز الدين2 2400 فاتورة شهر 10
داني غرز الدين 1850 فاتورة شهر 10
عمار محمود غرز الدين 2850 (1850 فاتورة شهر 10 + 1000 حساب التركيب )
واصل 9800 شام كاش +200 بيد علاء"""
        payments = self.parse(message)
        self.assertEqual(len(payments), 4)
        self.assert_payment(payments[0], 2900, "رامي غرز الدين", "فاتورة", 10)
        self.assert_payment(payments[1], 2400, "رامي غرز الدين2", "فاتورة", 10)
        self.assert_payment(payments[2], 1850, "داني غرز الدين", "فاتورة", 10)
        self.assert_payment(payments[3], 2850, "عمار محمود غرز الدين", "فاتورة + حساب التركيب", 10)

    def test_header_with_two_payments(self):
        message = """تم التسديد عند ابو النور :
محمد عمار يازجي 1000 فاتورة شهر 10
ابو النور نايلة 1300 فاتورة شهر 10"""
        payments = self.parse(message)
        self.assertEqual(len(payments), 2)
        self.assert_payment(
            payments[0], 1000, "محمد عمار يازجي", "فاتورة + بيد ابو النور", 10
        )
        self.assert_payment(
            payments[1], 1300, "ابو النور نايلة", "فاتورة + بيد ابو النور", 10
        )

    def test_header_source_applies_to_next_message(self):
        parser = MessageParser()
        self.assertEqual(parser.parse("تم التسديد عند ابو النور :"), [])
        payments = parser.parse("محمد عمار يازجي 1000 فاتورة شهر 10")
        self.assertEqual(len(payments), 1)
        self.assert_payment(
            payments[0], 1000, "محمد عمار يازجي", "فاتورة + بيد ابو النور", 10
        )

    def test_line_source_overrides_header_source(self):
        message = """تم التسديد عند ابو النور :
محمد عمار يازجي 1000 شام كاش فاتورة شهر 10"""
        payments = self.parse(message)
        self.assertEqual(len(payments), 1)
        self.assert_payment(payments[0], 1000, "محمد عمار يازجي", "فاتورة", 10, "شام كاش")

    def test_total_only_message(self):
        self.assertEqual(self.parse("واصل 37950 من ابو النور نايلة"), [])


class SplitMessageTests(ParserTestCase):
    def test_split_payment_across_messages(self):
        parser = MessageParser()
        self.assertEqual(parser.parse("عمار محمد مرداش 1250"), [])
        payments = parser.parse("1000 فاتورة شهر 10 + 250 باقة")
        self.assertEqual(len(payments), 1)
        self.assert_payment(payments[0], 1250, "عمار محمد مرداش", "فاتورة + باقة", 10)

    def test_second_split_payment_across_messages(self):
        parser = MessageParser()
        self.assertEqual(parser.parse("اسامة نور الدين طعمة مراد 800"), [])
        payments = parser.parse("550 فاتورة شهر 10 + 250 باقة")
        self.assertEqual(len(payments), 1)
        self.assert_payment(payments[0], 800, "اسامة نور الدين طعمة مراد", "فاتورة + باقة", 10)

    def test_split_payment_in_one_message(self):
        parser = MessageParser()
        payments = parser.parse("عمار محمد مرداش 1250\n1000 فاتورة شهر 10 + 250 باقة")
        self.assertEqual(len(payments), 1)
        self.assert_payment(payments[0], 1250, "عمار محمد مرداش", "فاتورة + باقة", 10)

    def test_pending_survives_non_payment_text(self):
        parser = MessageParser()
        self.assertEqual(parser.parse("عمار محمد مرداش 1250"), [])
        self.assertEqual(parser.parse("تم"), [])
        payments = parser.parse("1000 فاتورة شهر 10 + 250 باقة")
        self.assertEqual(len(payments), 1)
        self.assert_payment(payments[0], 1250, "عمار محمد مرداش", "فاتورة + باقة", 10)

    def test_pending_flushed_before_unrelated_payment(self):
        parser = MessageParser()
        self.assertEqual(parser.parse("عمار محمد مرداش 1250"), [])
        payments = parser.parse("داني غرز الدين 1850 فاتورة شهر 10")
        self.assertEqual(len(payments), 2)
        self.assert_payment(payments[0], 1250, "عمار محمد مرداش", "", datetime.now().month)
        self.assert_payment(payments[1], 1850, "داني غرز الدين", "فاتورة", 10)

    def test_split_payment_keeps_source_from_first_message(self):
        parser = MessageParser()
        self.assertEqual(parser.parse("عمار محمد مرداش 1250 بيد علاء"), [])
        payments = parser.parse("1000 فاتورة شهر 10 + 250 باقة")
        self.assertEqual(len(payments), 1)
        self.assert_payment(
            payments[0], 1250, "عمار محمد مرداش", "فاتورة + باقة + بيد علاء", 10
        )

    def test_split_payment_takes_source_from_breakdown(self):
        parser = MessageParser()
        self.assertEqual(parser.parse("عمار محمد مرداش 1250"), [])
        payments = parser.parse("1000 فاتورة شهر 10 + 250 باقة شام كاش")
        self.assertEqual(len(payments), 1)
        self.assert_payment(payments[0], 1250, "عمار محمد مرداش", "فاتورة + باقة", 10, "شام كاش")

    def test_pending_takes_source_from_next_line(self):
        parser = MessageParser()
        self.assertEqual(parser.parse("عمار محمد مرداش 1250\nشام كاش"), [])
        payments = parser.parse("1000 فاتورة شهر 10 + 250 باقة")
        self.assertEqual(len(payments), 1)
        self.assert_payment(payments[0], 1250, "عمار محمد مرداش", "فاتورة + باقة", 10, "شام كاش")

    def test_split_payment_merges_sources(self):
        parser = MessageParser()
        self.assertEqual(parser.parse("عمار محمد مرداش 1250 بيد علاء"), [])
        payments = parser.parse("1000 فاتورة شهر 10 + 250 باقة شام كاش")
        self.assertEqual(len(payments), 1)
        self.assert_payment(
            payments[0],
            1250,
            "عمار محمد مرداش",
            "فاتورة + باقة + بيد علاء",
            10,
            "شام كاش",
        )


class CurrencyAndRefundTests(ParserTestCase):
    def test_usd_and_thousand_word(self):
        payments = self.parse(
            "10 $ +500 الف / احمد نور الدين شرارة ترصيد شهر 11 + رصيد / تم ترجيع 50"
        )
        self.assertEqual(len(payments), 3, payments)
        usd, syp, refund = payments
        self.assertEqual(usd.value, 10)
        self.assertEqual(usd.currency, "USD")
        self.assertEqual(usd.kind, "payment")
        self.assertEqual(syp.value, 500000)
        self.assertEqual(syp.currency, "SYP")
        self.assertEqual(refund.value, -50)
        self.assertEqual(refund.currency, "SYP")
        self.assertEqual(refund.kind, "refund")
        self.assertEqual(usd.name, "احمد نور الدين شرارة")
        self.assertIn("ترصيد", syp.description)

    def test_usd_variants(self):
        for message in (
            "علي 30 $ فاتورة شهر 10",
            "علي $30 فاتورة شهر 10",
            "علي 30 دولار فاتورة شهر 10",
            "علي 30 USD فاتورة شهر 10",
        ):
            payments = self.parse(message)
            self.assertEqual(len(payments), 1, message)
            self.assertEqual(payments[0].value, 30)
            self.assertEqual(payments[0].currency, "USD")

    def test_usd_refund(self):
        payments = self.parse("جهاد طالب 50 $ / تم ترجيع 5 $")
        self.assertEqual(len(payments), 2, payments)
        self.assertEqual(payments[0].value, 50)
        self.assertEqual(payments[0].currency, "USD")
        self.assertEqual(payments[1].value, -5)
        self.assertEqual(payments[1].currency, "USD")
        self.assertEqual(payments[1].kind, "refund")

    def test_bundles_keyword(self):
        self.assert_single(
            "2550 بشير صلاح الدين التقي ترصيد شهر 11+ باقات",
            2550,
            "بشير صلاح الدين التقي",
            "ترصيد + باقات",
            11,
        )

    def test_header_and_payment_same_line_with_source(self):
        self.assert_single(
            "تم التسديد عند ماهر للاتصالات: 2500 مجد هاني قصار ترصيد شهر 11",
            2500,
            "مجد هاني قصار",
            "ترصيد + بيد ماهر للاتصالات",
            11,
        )

    def test_days_difference(self):
        self.assert_single(
            "1150 سامر حسان الحكيم فرق ايام",
            1150,
            "سامر حسان الحكيم",
            "فرق ايام",
            datetime.now().month,
        )

    def test_refund_keyword_arabic_variants(self):
        payments = self.parse("ياسر محمد 1000 تم ارجاع 100")
        self.assertEqual(len(payments), 2, payments)
        self.assertEqual(payments[1].value, -100)
        self.assertEqual(payments[1].kind, "refund")


if __name__ == "__main__":
    unittest.main(verbosity=2)
