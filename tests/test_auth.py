from httpx import AsyncClient

from tests.conftest import ADMIN_SECRET, create_user


async def test_admin_created_user_can_login_and_logout(client: AsyncClient):
    user = await create_user(client, "first@example.com")
    assert user["email"] == "first@example.com"

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == user["id"]

    logout = await client.post("/api/auth/logout")
    assert logout.status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401

    login = await client.post(
        "/api/auth/login", json={"email": "first@example.com", "password": "strong-password"}
    )
    assert login.status_code == 200


async def test_admin_can_list_users(client: AsyncClient):
    await create_user(client, "first@example.com")
    response = await client.get("/api/admin/users", headers={"X-Admin-Secret": ADMIN_SECRET})
    assert response.status_code == 200
    assert [user["email"] for user in response.json()] == ["first@example.com"]


async def test_admin_endpoints_require_secret(client: AsyncClient):
    payload = {"email": "blocked@example.com", "password": "strong-password"}
    assert (await client.post("/api/admin/users", json=payload)).status_code == 401
    assert (
        await client.post(
            "/api/admin/users",
            json=payload,
            headers={"X-Admin-Secret": "wrong-secret"},
        )
    ).status_code == 401
    assert (await client.get("/api/admin/users")).status_code == 401


async def test_duplicate_email_rejected(client: AsyncClient):
    await create_user(client, "duplicate@example.com")
    response = await client.post(
        "/api/admin/users",
        json={"email": "duplicate@example.com", "password": "strong-password"},
        headers={"X-Admin-Secret": ADMIN_SECRET},
    )
    assert response.status_code == 409


async def test_public_registration_is_gone(client: AsyncClient):
    response = await client.post(
        "/api/auth/register",
        json={"email": "public@example.com", "password": "strong-password"},
    )
    assert response.status_code == 404


async def test_bad_login_rejected(client: AsyncClient):
    await create_user(client, "bad-login@example.com")
    response = await client.post(
        "/api/auth/login",
        json={"email": "bad-login@example.com", "password": "wrong-password"},
    )
    assert response.status_code == 401
