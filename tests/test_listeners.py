from httpx import AsyncClient

from tests.conftest import bot_token, create_user


async def create_listener(client: AsyncClient, token: str | None = None) -> dict:
    response = await client.post(
        "/api/listeners",
        json={
            "label": "Main channel",
            "channel_input": "-1001234567890",
            "bot_token": token or bot_token(),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_listener_crud_and_masking(client: AsyncClient):
    await create_user(client)
    listener = await create_listener(client)
    assert listener["status"] == "stopped"
    assert listener["token_hint"].startswith("123456789:")
    assert bot_token() not in listener["token_hint"]

    listing = await client.get("/api/listeners")
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    detail = await client.get(f"/api/listeners/{listener['id']}")
    assert detail.status_code == 200
    assert detail.json()["payment_count"] == 0

    patched = await client.patch(f"/api/listeners/{listener['id']}", json={"label": "Renamed"})
    assert patched.status_code == 200
    assert patched.json()["label"] == "Renamed"

    deleted = await client.delete(f"/api/listeners/{listener['id']}")
    assert deleted.status_code == 204
    assert (await client.get("/api/listeners")).json() == []


async def test_duplicate_bot_token_rejected(client: AsyncClient):
    await create_user(client)
    token = bot_token("B")
    await create_listener(client, token)
    response = await client.post(
        "/api/listeners",
        json={"channel_input": "-1009999999999", "bot_token": token},
    )
    assert response.status_code == 409


async def test_invalid_token_and_channel_rejected(client: AsyncClient):
    await create_user(client)
    bad_token = await client.post(
        "/api/listeners",
        json={"channel_input": "-1001234567890", "bot_token": "not-a-token"},
    )
    assert bad_token.status_code == 422
    bad_channel = await client.post(
        "/api/listeners",
        json={"channel_input": "bad channel!", "bot_token": bot_token("C")},
    )
    assert bad_channel.status_code == 422


async def test_users_are_isolated(client: AsyncClient):
    await create_user(client, "owner@example.com")
    listener = await create_listener(client, bot_token("D"))

    await create_user(client, "other@example.com")
    assert (await client.get("/api/listeners")).json() == []
    assert (await client.get(f"/api/listeners/{listener['id']}")).status_code == 404
    assert (await client.delete(f"/api/listeners/{listener['id']}")).status_code == 404
