from io import BytesIO

from openpyxl import load_workbook

from app.services.exporter import build_rows_workbook


def column(
    key,
    header,
    *,
    source="field",
    field=None,
    default=None,
):
    return {
        "key": key,
        "header": header,
        "source": source,
        "field": field,
        "default": default,
    }


def test_workbook_splits_rows_into_one_sheet_per_pattern():
    rows = [
        {"pattern": None, "value": 10, "name": "Default row"},
        {"pattern": "Pattern 1", "value": 20, "name": "First pattern"},
        {"pattern": "Pattern 2", "value": 30, "name": "Second pattern"},
        {"pattern": "Pattern 1", "value": 40, "name": "First pattern again"},
    ]

    workbook = load_workbook(BytesIO(build_rows_workbook(rows)))

    assert workbook.sheetnames == ["Default", "Pattern 1", "Pattern 2"]
    assert workbook["Default"].max_row == 2
    assert workbook["Pattern 1"].max_row == 3
    assert workbook["Pattern 2"].max_row == 2
    assert [
        workbook["Pattern 1"].cell(row=row, column=4).value for row in range(2, 4)
    ] == ["First pattern", "First pattern again"]


def test_workbook_sanitizes_and_deduplicates_pattern_sheet_titles():
    rows = [
        {"pattern": "a/b", "value": 1, "name": "One"},
        {"pattern": "a:b", "value": 2, "name": "Two"},
        {"pattern": "a?b", "value": 3, "name": "Three"},
    ]

    workbook = load_workbook(BytesIO(build_rows_workbook(rows)))

    assert workbook.sheetnames == ["a b", "a b (2)", "a b (3)"]


def test_each_pattern_sheet_uses_its_own_columns():
    rows = [
        {"pattern": None, "value": 10, "name": "Default row"},
        {
            "pattern": "invoice",
            "value": 20,
            "name": "Invoice row",
            "extra": {"wood": "oak"},
        },
    ]
    default_columns = [
        column("value", "Value", field="value"),
        column("name", "Name", field="name"),
    ]
    pattern_columns = {
        "invoice": [
            column("value", "Amount", field="value"),
            column("name", "Customer", field="name"),
            column("wood", "Wood", source="custom"),
        ]
    }

    workbook = load_workbook(
        BytesIO(build_rows_workbook(rows, default_columns, pattern_columns))
    )

    assert [cell.value for cell in workbook["Default"][1]] == ["Value", "Name"]
    assert [cell.value for cell in workbook["invoice"][1]] == [
        "Amount",
        "Customer",
        "Wood",
    ]
    assert workbook["invoice"].cell(row=2, column=3).value == "oak"


def test_pattern_without_own_columns_uses_profile_columns():
    rows = [{"pattern": "legacy", "value": 5, "name": "Legacy"}]
    columns = [column("value", "Value", field="value")]

    workbook = load_workbook(BytesIO(build_rows_workbook(rows, columns, {})))

    assert [cell.value for cell in workbook["legacy"][1]] == ["Value"]
