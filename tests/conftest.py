import os
import uuid

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_app.db"
os.environ["JWT_SECRET"] = "test-secret-that-is-long-enough-for-tests"
os.environ["ENCRYPTION_KEY"] = "47K0MCKxl33MX_eRm1Fp_3Jec3tzcdeaYZc7sDL1nOA="
os.environ["ADMIN_SECRET"] = "test-admin-secret"
os.environ["LOG_RETENTION_DAYS"] = "7"

ADMIN_SECRET = os.environ["ADMIN_SECRET"]

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def clean_database():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client


async def create_user(
    client: AsyncClient, email: str | None = None, password: str = "strong-password"
) -> dict:
    email = email or f"user-{uuid.uuid4().hex[:8]}@example.com"
    response = await client.post(
        "/api/admin/users",
        json={"email": email, "password": password},
        headers={"X-Admin-Secret": ADMIN_SECRET},
    )
    assert response.status_code == 201, response.text
    login = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return response.json()


def bot_token(seed: str = "A") -> str:
    return f"123456789:{seed * 24}abcd"
