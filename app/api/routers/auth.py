from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import get_settings
from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookie(response: Response, user: User) -> None:
    settings = get_settings()
    token = create_access_token(user.id, user.token_version)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.access_token_expire_days * 24 * 60 * 60,
        path="/",
    )


@router.post("/login", response_model=UserOut)
async def login(payload: LoginRequest, response: Response, session: SessionDep):
    email = payload.email.lower()
    user = await session.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account is deactivated"
        )
    _set_auth_cookie(response, user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user
