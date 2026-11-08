import hmac
import uuid
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.security import hash_password
from app.models.listener import BotListener, ListenerStatus
from app.models.user import User
from app.schemas.admin import (
    AdminPasswordResetRequest,
    AdminUserCreateRequest,
    AdminUserUpdateRequest,
)
from app.schemas.auth import UserOut

router = APIRouter(prefix="/admin", tags=["admin"])

AdminSecret = Annotated[str | None, Header(alias="X-Admin-Secret")]


def _verify_admin_secret(secret: str | None) -> None:
    expected = get_settings().admin_secret
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin access is not configured",
        )
    if not secret or not hmac.compare_digest(secret, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin secret",
        )


async def _get_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


async def _stop_user_listeners(request: Request, session: AsyncSession, user_id: uuid.UUID) -> None:
    manager = getattr(request.app.state, "manager", None)
    if manager is None:
        return
    listener_ids = await session.scalars(
        select(BotListener.id).where(
            BotListener.user_id == user_id,
            BotListener.status == ListenerStatus.RUNNING,
        )
    )
    for listener_id in listener_ids.all():
        await manager.stop_listener(listener_id)


@router.get("/users", response_model=list[UserOut])
async def list_users(session: SessionDep, x_admin_secret: AdminSecret = None):
    _verify_admin_secret(x_admin_secret)
    users = await session.scalars(select(User).order_by(User.created_at.desc()))
    return list(users)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminUserCreateRequest,
    session: SessionDep,
    x_admin_secret: AdminSecret = None,
):
    _verify_admin_secret(x_admin_secret)
    email = payload.email.lower()
    exists = await session.scalar(select(User.id).where(User.email == email))
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email exists",
        )
    user = User(email=email, password_hash=hash_password(payload.password))
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    payload: AdminUserUpdateRequest,
    request: Request,
    session: SessionDep,
    x_admin_secret: AdminSecret = None,
):
    _verify_admin_secret(x_admin_secret)
    user = await _get_user(session, user_id)

    if payload.email is not None:
        email = payload.email.lower()
        if email != user.email:
            exists = await session.scalar(
                select(User.id).where(User.email == email, User.id != user.id)
            )
            if exists:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email exists",
                )
            user.email = email

    if payload.is_active is not None and payload.is_active != user.is_active:
        user.is_active = payload.is_active
        if not payload.is_active:
            user.token_version += 1
            await _stop_user_listeners(request, session, user.id)

    await session.commit()
    await session.refresh(user)
    return user


@router.post("/users/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_user_password(
    user_id: uuid.UUID,
    payload: AdminPasswordResetRequest,
    session: SessionDep,
    x_admin_secret: AdminSecret = None,
):
    _verify_admin_secret(x_admin_secret)
    user = await _get_user(session, user_id)
    user.password_hash = hash_password(payload.password)
    user.token_version += 1
    await session.commit()


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    request: Request,
    session: SessionDep,
    x_admin_secret: AdminSecret = None,
):
    _verify_admin_secret(x_admin_secret)
    user = await _get_user(session, user_id)
    await _stop_user_listeners(request, session, user.id)
    await session.delete(user)
    await session.commit()
