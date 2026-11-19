from io import BytesIO

from httpx import AsyncClient
from openpyxl import load_workbook

from tests.conftest import bot_token, create_user
from tests.test_listeners import create_listener

PATTERN = {
    "name": "invoice",
    "template": "{amount} {description}",
    "fields": [
        {"placeholder": "amount", "target": "value", "type": "number"},
        {"placeholder": "description", "target": "description", "type": "text"},
    ],
}


async def test_listener_parser_profile_crud_and_preview(client: AsyncClient):
    await create_user(client)
    listener = await create_listener(client, bot_token("H"))
    url = f"/api/listeners/{listener['id']}/parser-profile"

    empty = await client.get(url)
    assert empty.status_code == 200
    assert empty.json() is None

    saved = await client.put(
        url,
        json={
            "name": "Invoices",
            "patterns": [PATTERN],
            "export_columns": [],
            "fallback_to_default": False,
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["patterns"][0]["name"] == "invoice"
    assert saved.json()["fallback_to_default"] is False

    preview = await client.post(
        "/api/patterns/preview",
        json={
            "text": "550 فاتورة نجارة",
            "patterns": [PATTERN],
            "export_columns": [],
        },
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert len(body["rows"]) == 1
    assert body["rows"][0]["value"] == 550
    assert body["rows"][0]["cells"][3] == "فاتورة نجارة"
    assert len(body["columns"]) == 8

    deleted = await client.delete(url)
    assert deleted.status_code == 204
    assert (await client.get(url)).json() is None


async def test_copy_parser_profile_between_listeners(client: AsyncClient):
    await create_user(client)
    source = await create_listener(client, bot_token("J"))
    target = await create_listener(client, bot_token("K"))

    saved = await client.put(
        f"/api/listeners/{source['id']}/parser-profile",
        json={
            "name": "Shared profile",
            "patterns": [PATTERN],
            "export_columns": [],
            "fallback_to_default": False,
        },
    )
    assert saved.status_code == 200, saved.text
    profile = saved.json()

    listing = await client.get("/api/patterns/profiles")
    assert listing.status_code == 200, listing.text
    assert any(item["id"] == profile["id"] for item in listing.json())

    copied = await client.post(
        f"/api/listeners/{target['id']}/parser-profile/copy",
        json={"profile_id": profile["id"]},
    )
    assert copied.status_code == 200, copied.text
    assert copied.json()["name"] == "Shared profile"
    assert copied.json()["patterns"] == profile["patterns"]
    assert copied.json()["fallback_to_default"] is False

    current = await client.get(f"/api/listeners/{target['id']}/parser-profile")
    assert current.json()["patterns"][0]["name"] == "invoice"

    same_listener = await client.post(
        f"/api/listeners/{source['id']}/parser-profile/copy",
        json={"profile_id": profile["id"]},
    )
    assert same_listener.status_code == 400


async def test_whatsapp_profile_copy_parse_and_export(client: AsyncClient):
    await create_user(client)
    listener = await create_listener(client, bot_token("I"))
    await client.put(
        f"/api/listeners/{listener['id']}/parser-profile",
        json={
            "name": "Telegram Invoices",
            "patterns": [PATTERN],
            "export_columns": [],
            "fallback_to_default": False,
        },
    )

    created = await client.post(
        "/api/whatsapp/profiles",
        json={
            "name": "WhatsApp imports",
            "patterns": [],
            "export_columns": [],
            "fallback_to_default": False,
        },
    )
    assert created.status_code == 201, created.text
    profile = created.json()

    listing = await client.get("/api/whatsapp/profiles")
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    copied = await client.post(
        f"/api/whatsapp/profiles/{profile['id']}/copy-from-listener/{listener['id']}",
        json={"name": "WhatsApp invoices"},
    )
    assert copied.status_code == 200, copied.text
    assert copied.json()["name"] == "WhatsApp invoices"
    assert copied.json()["patterns"][0]["name"] == "invoice"

    text = "17/11/2026, 9:05 PM - Ahmed: 550 فاتورة نجارة\n"
    parsed = await client.post(
        "/api/whatsapp/parse",
        data={"profile_id": profile["id"], "date_order": "dmy"},
        files={"file": ("chat.txt", text.encode("utf-8"), "text/plain")},
    )
    assert parsed.status_code == 200, parsed.text
    body = parsed.json()
    assert body["row_count"] == 1
    assert body["rows"][0]["value"] == 550
    assert body["rows"][0]["pattern"] == "invoice"
    assert body["rows"][0]["sender"] == "Ahmed"
    assert body["columns"][0]["key"] == "date"

    exported = await client.post(
        "/api/whatsapp/export.xlsx",
        json={"profile_id": profile["id"], "rows": body["rows"]},
    )
    assert exported.status_code == 200, exported.text
    assert exported.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert len(exported.content) > 1000
    workbook = load_workbook(BytesIO(exported.content))
    assert workbook.sheetnames == ["invoice"]


async def test_whatsapp_export_uses_pattern_columns(client: AsyncClient):
    await create_user(client)
    created = await client.post(
        "/api/whatsapp/profiles",
        json={
            "name": "Own columns",
            "patterns": [
                {
                    "name": "wood",
                    "template": "{amount} {wood}",
                    "fields": [
                        {
                            "placeholder": "amount",
                            "target": "value",
                            "type": "number",
                        },
                        {"placeholder": "wood", "target": "wood", "type": "text"},
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
                            "key": "wood",
                            "header": "Wood",
                            "source": "custom",
                            "field": None,
                            "default": None,
                        },
                    ],
                }
            ],
            "export_columns": [],
            "fallback_to_default": False,
        },
    )
    assert created.status_code == 201, created.text
    profile = created.json()

    text = "17/11/2026, 9:05 PM - Ahmed: 550 oak\n"
    parsed = await client.post(
        "/api/whatsapp/parse",
        data={"profile_id": profile["id"], "date_order": "dmy"},
        files={"file": ("chat.txt", text.encode("utf-8"), "text/plain")},
    )
    assert parsed.status_code == 200, parsed.text
    body = parsed.json()
    assert body["row_count"] == 1
    assert body["rows"][0]["pattern"] == "wood"
    keys = [column["key"] for column in body["columns"]]
    assert body["rows"][0]["cells"][keys.index("wood")] == "oak"

    exported = await client.post(
        "/api/whatsapp/export.xlsx",
        json={"profile_id": profile["id"], "rows": body["rows"]},
    )
    assert exported.status_code == 200, exported.text
    workbook = load_workbook(BytesIO(exported.content))
    assert workbook.sheetnames == ["wood"]
    assert [cell.value for cell in workbook["wood"][1]] == ["Amount", "Wood"]
    assert workbook["wood"].cell(row=2, column=2).value == "oak"


async def test_pattern_targets_validate_against_own_columns(client: AsyncClient):
    await create_user(client)
    created = await client.post(
        "/api/whatsapp/profiles",
        json={
            "name": "Pattern columns",
            "patterns": [
                {
                    "name": "custom",
                    "template": "{amount} {wood}",
                    "fields": [
                        {
                            "placeholder": "amount",
                            "target": "value",
                            "type": "number",
                        },
                        {"placeholder": "wood", "target": "wood", "type": "text"},
                    ],
                    "export_columns": [
                        {
                            "key": "wood",
                            "header": "Wood",
                            "source": "custom",
                            "field": None,
                            "default": None,
                        },
                    ],
                }
            ],
            "export_columns": [],
            "fallback_to_default": False,
        },
    )
    assert created.status_code == 201, created.text
