from pydantic import BaseModel, EmailStr, Field


class AdminUserCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class AdminUserUpdateRequest(BaseModel):
    email: EmailStr | None = None
    is_active: bool | None = None


class AdminPasswordResetRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)
