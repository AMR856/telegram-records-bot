import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthError, decode_access_token
from app.db.session import get_session
from app.models.listener import BotListener
from app.models.user import User

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(request: Request, session: SessionDep) -> User:
    token = request.cookies.get("access_token")
    if not token:
        header = request.headers.get("Authorization", "")
        if header.lower().startswith("bearer "):
            token = header[7:].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    try:
        user_id, token_version = decode_access_token(token)
    except AuthError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Account no longer exists"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is deactivated"
        )
    if user.token_version != token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is no longer valid"
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_owned_listener(
    listener_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
) -> BotListener:
    listener = await session.get(BotListener, listener_id)
    if listener is None or listener.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listener not found")
    return listener


OwnedListener = Annotated[BotListener, Depends(get_owned_listener)]
