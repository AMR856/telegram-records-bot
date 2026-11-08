import hashlib
import re
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

PASSWORD_HASHER = PasswordHasher()

BOT_TOKEN_RE = re.compile(r"^\d+:[A-Za-z0-9_-]{20,}$")
NUMERIC_CHANNEL_RE = re.compile(r"^-?\d+$")
USERNAME_CHANNEL_RE = re.compile(r"^@[A-Za-z][A-Za-z0-9_]{4,}$")
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


class AuthError(Exception):
    pass


def hash_password(password: str) -> str:
    return PASSWORD_HASHER.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return PASSWORD_HASHER.verify(password_hash, password)
    except (VerifyMismatchError, ValueError):
        return False


def create_access_token(user_id: uuid.UUID, token_version: int = 0) -> str:
    settings = get_settings()
    expires = datetime.now(UTC) + timedelta(days=settings.access_token_expire_days)
    payload = {
        "sub": str(user_id),
        "ver": token_version,
        "exp": expires,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> tuple[uuid.UUID, int]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return uuid.UUID(payload["sub"]), int(payload.get("ver", 0))
    except (jwt.PyJWTError, KeyError, ValueError) as error:
        raise AuthError("Invalid or expired session") from error


def _fernet() -> Fernet:
    key = get_settings().encryption_key
    if not key:
        raise RuntimeError("ENCRYPTION_KEY is not configured")
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError) as error:
        raise RuntimeError("ENCRYPTION_KEY is not a valid Fernet key") from error


def encrypt_token(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    try:
        return _fernet().decrypt(encrypted.encode()).decode()
    except InvalidToken as error:
        raise RuntimeError("Stored bot token could not be decrypted") from error


def token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def token_hint(token: str) -> str:
    prefix = token.split(":", 1)[0]
    return f"{prefix}:\u2022\u2022\u2022\u2022{token[-4:]}"


def validate_bot_token(token: str) -> str:
    token = token.strip()
    if not BOT_TOKEN_RE.match(token):
        raise ValueError("Bot token format looks invalid")
    return token


def normalize_channel_input(value: str) -> str:
    value = value.translate(ARABIC_DIGITS).strip()
    if not value:
        raise ValueError("Channel id is required")
    if NUMERIC_CHANNEL_RE.match(value):
        return value
    if not value.startswith("@"):
        value = f"@{value}"
    if not USERNAME_CHANNEL_RE.match(value):
        raise ValueError("Channel must be a numeric id (e.g. -1001234567890) or @username")
    return value
