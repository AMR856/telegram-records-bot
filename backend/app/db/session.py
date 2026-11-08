from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

settings = get_settings()

# Default engine configuration. 'pool_pre_ping' ensures the connection is still alive before using it, preventing "MySQL server has gone away" or similar dropped-connection errors.
engine_options = {"pool_pre_ping": True}

# SQLite does not support standard connection pooling well, especially in async contexts. 
# NullPool disables pooling, ensuring a new connection is opened and closed for every request.
if settings.database_url.startswith("sqlite"):
    engine_options["poolclass"] = NullPool

# The main asynchronous database engine responsible for communicating with the database using the provided URL and options.
engine = create_async_engine(settings.database_url, **engine_options)

# A factory for creating new asynchronous database sessions. 'expire_on_commit=False' ensures that object attributes remain accessible even after the transaction is committed, without requiring a fresh database query.
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


# A dependency generator that provides a database session for a single request or task, automatically closing the session when done. Commonly used with FastAPI's Depends().
async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session