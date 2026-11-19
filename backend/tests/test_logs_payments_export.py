from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO

from httpx import AsyncClient
from openpyxl import load_workbook

from app.db.session import SessionLocal
from app.models.log import ListenerLog, LogLevel
from app.models.payment import Payment
from tests.conftest import bot_token, create_user
from tests.test_listeners import create_listener


async def seed_data(listener_id: str) -> None:
    import uuid

    listener_uuid = uuid.UUID(listener_id)
    async with SessionLocal() as session:
        for index in range(3):
            is_usd = index == 2
            session.add(
                Payment(
                    listener_id=listener_uuid,
                    update_id=index + 1,
                    message_id=index + 1,
                    item_index=0,
                    received_at=datetime.now(UTC),
                    value=Decimal("50") if is_usd else Decimal("1000.50"),
                    currency="USD" if is_usd else "SYP",
                    kind="refund" if is_usd else "payment",
                    name="=SUM(A1:A2)" if index == 2 else f"Person {index}",
                    description="invoice",
                    month=10,
                    source="cash",
                )
            )
        session.add(
            ListenerLog(
                listener_id=listener_uuid,
                kind="message",
                level=LogLevel.INFO,
                text="Person 0 1000.50 invoice",
                update_id=1,
                message_id=1,
                parsed_count=1,
            )
        )
        await session.commit()


async def test_logs_payments_and_export(client: AsyncClient):
    await create_user(client)
    listener = await create_listener(client, bot_token("E"))
    await seed_data(listener["id"])

    logs = await client.get(f"/api/listeners/{listener['id']}/logs")
    assert logs.status_code == 200
    assert len(logs.json()["items"]) >= 2

    payments = await client.get(f"/api/listeners/{listener['id']}/payments")
    assert payments.status_code == 200
    body = payments.json()
    assert body["total"] == 3
    assert body["total_value"] == 2001.0
    assert body["total_usd"] == 50.0
    assert len(body["items"]) == 3
    currencies = {item["currency"] for item in body["items"]}
    kinds = {item["kind"] for item in body["items"]}
    assert currencies == {"SYP", "USD"}
    assert kinds == {"payment", "refund"}

    filtered = await client.get(f"/api/listeners/{listener['id']}/payments", params={"month": 11})
    assert filtered.json()["total"] == 0

    detail = await client.get(f"/api/listeners/{listener['id']}")
    assert detail.json()["payment_count"] == 3
    assert detail.json()["total_value"] == 2001.0
    assert detail.json()["total_usd"] == 50.0

    export = await client.get(f"/api/listeners/{listener['id']}/payments/export.xlsx")
    assert export.status_code == 200
    workbook = load_workbook(BytesIO(export.content))
    sheet = workbook.active
    assert [cell.value for cell in sheet[1]] == [
        "Date",
        "Value",
        "Currency",
        "Name",
        "Description",
        "Month",
        "Source",
        "Type",
    ]
    assert sheet.max_row == 4
    names = [sheet.cell(row=row, column=4).value for row in range(2, 5)]
    assert "'=SUM(A1:A2)" in names
    assert [sheet.cell(row=row, column=3).value for row in range(2, 5)] == [
        "SYP",
        "SYP",
        "USD",
    ]


async def test_export_splits_payments_by_pattern(client: AsyncClient):
    import uuid

    await create_user(client)
    listener = await create_listener(client, bot_token("S"))

    async with SessionLocal() as session:
        for index, pattern in enumerate((None, "Pattern 1", "Pattern 2"), start=1):
            session.add(
                Payment(
                    listener_id=uuid.UUID(listener["id"]),
                    update_id=index,
                    message_id=index,
                    item_index=0,
                    received_at=datetime.now(UTC),
                    value=Decimal("100"),
                    currency="SYP",
                    kind="payment",
                    name=f"Row {index}",
                    description="invoice",
                    month=10,
                    source="cash",
                    pattern_name=pattern,
                )
            )
        await session.commit()

    export = await client.get(f"/api/listeners/{listener['id']}/payments/export.xlsx")
    assert export.status_code == 200
    workbook = load_workbook(BytesIO(export.content))
    assert workbook.sheetnames == ["Default", "Pattern 1", "Pattern 2"]
    assert [workbook[name].max_row for name in workbook.sheetnames] == [2, 2, 2]
    assert [
        workbook[name].cell(row=2, column=4).value for name in workbook.sheetnames
    ] == ["Row 1", "Row 2", "Row 3"]


async def test_export_uses_each_patterns_columns(client: AsyncClient):
    import uuid

    await create_user(client)
    listener = await create_listener(client, bot_token("T"))

    saved = await client.put(
        f"/api/listeners/{listener['id']}/parser-profile",
        json={
            "name": "Per-pattern exports",
            "patterns": [
                {
                    "name": "invoice",
                    "template": "{value} {description}",
                    "fields": [
                        {
                            "placeholder": "value",
                            "target": "value",
                            "type": "number",
                        },
                        {
                            "placeholder": "description",
                            "target": "description",
                            "type": "text",
                        },
                    ],
                    "export_columns": [
                        {
                            "key": "value",
                            "header": "Amount",
                            "source": "field",
                            "field": "value",
                            "default": None,
                        },
                        {
                            "key": "name",
                            "header": "Customer",
                            "source": "field",
                            "field": "name",
                            "default": None,
                        },
                    ],
                }
            ],
            "export_columns": [
                {
                    "key": "value",
                    "header": "Value",
                    "source": "field",
                    "field": "value",
                    "default": None,
                },
                {
                    "key": "name",
                    "header": "Name",
                    "source": "field",
                    "field": "name",
                    "default": None,
                },
            ],
            "fallback_to_default": True,
        },
    )
    assert saved.status_code == 200, saved.text

    async with SessionLocal() as session:
        for index, pattern in enumerate((None, "invoice"), start=1):
            session.add(
                Payment(
                    listener_id=uuid.UUID(listener["id"]),
                    update_id=index,
                    message_id=index,
                    item_index=0,
                    received_at=datetime.now(UTC),
                    value=Decimal("100"),
                    currency="SYP",
                    kind="payment",
                    name=f"Row {index}",
                    description="invoice",
                    month=10,
                    source="cash",
                    pattern_name=pattern,
                )
            )
        await session.commit()

    export = await client.get(f"/api/listeners/{listener['id']}/payments/export.xlsx")
    assert export.status_code == 200
    workbook = load_workbook(BytesIO(export.content))
    assert workbook.sheetnames == ["Default", "invoice"]
    assert [cell.value for cell in workbook["Default"][1]] == ["Value", "Name"]
    assert [cell.value for cell in workbook["invoice"][1]] == ["Amount", "Customer"]


async def test_delete_log_removes_its_payments(client: AsyncClient):
    await create_user(client)
    listener = await create_listener(client, bot_token("G"))
    await seed_data(listener["id"])

    logs = await client.get(f"/api/listeners/{listener['id']}/logs", params={"kind": "message"})
    item = logs.json()["items"][0]

    deleted = await client.delete(f"/api/listeners/{listener['id']}/logs/{item['id']}")
    assert deleted.status_code == 204

    logs_after = await client.get(
        f"/api/listeners/{listener['id']}/logs", params={"kind": "message"}
    )
    assert logs_after.json()["items"] == []

    payments = await client.get(f"/api/listeners/{listener['id']}/payments")
    body = payments.json()
    assert body["total"] == 2
    assert body["total_value"] == 1000.5
    assert body["total_usd"] == 50.0


async def test_log_cursor_pagination(client: AsyncClient):
    await create_user(client)
    listener = await create_listener(client, bot_token("F"))
    await seed_data(listener["id"])
    first = await client.get(f"/api/listeners/{listener['id']}/logs", params={"limit": 1})
    assert first.status_code == 200
    body = first.json()
    assert len(body["items"]) == 1
    assert body["next_before_id"] is not None
    second = await client.get(
        f"/api/listeners/{listener['id']}/logs",
        params={"limit": 1, "before_id": body["next_before_id"]},
    )
    assert second.json()["items"][0]["id"] < body["items"][0]["id"]
