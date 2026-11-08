import uuid

from httpx import AsyncClient

from app.db.session import SessionLocal
from app.models.listener import BotListener
from tests.conftest import ADMIN_SECRET, bot_token, create_user
from tests.test_listeners import create_listener

HEADERS = {"X-Admin-Secret": ADMIN_SECRET}


async def test_admin_can_reset_password_and_revoke_sessions(client: AsyncClient):
    user = await create_user(client, "reset@example.com")
    assert (await client.get("/api/auth/me")).status_code == 200

    response = await client.post(
        f"/api/admin/users/{user['id']}/password",
        json={"password": "brand-new-password"},
        headers=HEADERS,
    )
    assert response.status_code == 204

    assert (await client.get("/api/auth/me")).status_code == 401

    old_login = await client.post(
        "/api/auth/login",
        json={"email": "reset@example.com", "password": "strong-password"},
    )
    assert old_login.status_code == 401

    new_login = await client.post(
        "/api/auth/login",
        json={"email": "reset@example.com", "password": "brand-new-password"},
    )
    assert new_login.status_code == 200
    assert (await client.get("/api/auth/me")).status_code == 200


async def test_admin_can_deactivate_and_reactivate_user(client: AsyncClient):
    user = await create_user(client, "toggle@example.com")
    assert (await client.get("/api/auth/me")).status_code == 200

    deactivate = await client.patch(
        f"/api/admin/users/{user['id']}",
        json={"is_active": False},
        headers=HEADERS,
    )
    assert deactivate.status_code == 200
    assert deactivate.json()["is_active"] is False

    assert (await client.get("/api/auth/me")).status_code == 401
    blocked_login = await client.post(
        "/api/auth/login",
        json={"email": "toggle@example.com", "password": "strong-password"},
    )
    assert blocked_login.status_code == 403

    activate = await client.patch(
        f"/api/admin/users/{user['id']}",
        json={"is_active": True},
        headers=HEADERS,
    )
    assert activate.status_code == 200
    assert activate.json()["is_active"] is True

    # The cookie issued before deactivation stays revoked after reactivation.
    assert (await client.get("/api/auth/me")).status_code == 401

    login = await client.post(
        "/api/auth/login",
        json={"email": "toggle@example.com", "password": "strong-password"},
    )
    assert login.status_code == 200


async def test_admin_can_change_email(client: AsyncClient):
    user = await create_user(client, "old@example.com")
    await create_user(client, "taken@example.com")

    response = await client.patch(
        f"/api/admin/users/{user['id']}",
        json={"email": "new@example.com"},
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["email"] == "new@example.com"

    duplicate = await client.patch(
        f"/api/admin/users/{user['id']}",
        json={"email": "taken@example.com"},
        headers=HEADERS,
    )
    assert duplicate.status_code == 409


async def test_admin_can_delete_user_and_owned_listeners(client: AsyncClient):
    user = await create_user(client, "delete@example.com")
    listener = await create_listener(client, bot_token("Z"))

    response = await client.delete(f"/api/admin/users/{user['id']}", headers=HEADERS)
    assert response.status_code == 204

    assert (await client.get("/api/auth/me")).status_code == 401
    login = await client.post(
        "/api/auth/login",
        json={"email": "delete@example.com", "password": "strong-password"},
    )
    assert login.status_code == 401

    users = await client.get("/api/admin/users", headers=HEADERS)
    assert all(item["id"] != user["id"] for item in users.json())

    async with SessionLocal() as session:
        assert await session.get(BotListener, uuid.UUID(listener["id"])) is None
