import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import admin, auth, health, listeners, logs, payments
from app.core.config import get_settings
from app.db.session import SessionLocal, engine
from app.services.poller import PollerManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    manager = PollerManager(SessionLocal, settings)
    app.state.manager = manager
    app.state.settings = settings
    try:
        await manager.startup()
    except Exception:
        logger.exception("Failed to resume listeners on startup")
    try:
        yield
    finally:
        await manager.shutdown()
        await engine.dispose()


app = FastAPI(title="Management Bot API", version="1.0.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(listeners.router, prefix="/api")
app.include_router(logs.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(health.router, prefix="/api")


@app.get("/")
async def root():
    return {"name": settings.app_name, "docs": "/docs"}
