import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Union, Any
from jose import jwt
from passlib.context import CryptContext
from dotenv import load_dotenv
from jose import JWTError
from fastapi import HTTPException, status

# 1. โหลดค่า Config จากไฟล์ .env
load_dotenv()

# แบบบังคับ: ถ้าไม่มีใน .env ให้ Error ไปเลย (ปลอดภัยกว่า กันลืม)
_PLACEHOLDER_KEYS = {
    "your_secret_key_here",
    "change_me",
    "changeme",
    "secret",
    "supersecret",
}

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY is not set. Generate one with: openssl rand -hex 32")
if SECRET_KEY.lower() in _PLACEHOLDER_KEYS:
    raise ValueError(
        "SECRET_KEY is still the placeholder value. "
        "Generate a real key with: openssl rand -hex 32"
    )
if len(SECRET_KEY) < 32:
    raise ValueError(
        f"SECRET_KEY is too short ({len(SECRET_KEY)} chars). "
        "Use at least 32 characters. Generate one with: openssl rand -hex 32"
    )
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 15))

# 2. ตั้งค่า Password Hashing ด้วย Argon2
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# 🔒 Fixed dummy hash used when no real hash exists (e.g. login attempt for a
# nonexistent username). Verifying against this keeps the Argon2 computation
# on the same code path either way, so response time doesn't leak whether the
# username exists (timing oracle for user enumeration).
_DUMMY_HASH = pwd_context.hash("not-a-real-password-used-only-for-timing-safety")


def verify_password(plain_password: str, hashed_password: Union[str, None]) -> bool:
    """เช็คว่ารหัสผ่านที่กรอกมา ตรงกับ Hash ใน Database หรือไม่"""
    return pwd_context.verify(plain_password, hashed_password or _DUMMY_HASH)


def get_password_hash(password: str) -> str:
    """แปลงรหัสผ่านธรรมดา เป็น Hash ก่อนบันทึกลง Database"""
    return pwd_context.hash(password)


def create_access_token(
    subject: Union[str, Any],
    expires_delta: Union[timedelta, None] = None,
    uid: Union[int, None] = None,
) -> tuple[str, str, datetime]:
    """สร้าง JWT Token — returns (token, jti, expires_at)"""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    jti = str(uuid.uuid4())
    to_encode: dict = {"sub": str(subject), "exp": expire, "type": "access", "jti": jti}
    if uid is not None:
        to_encode["uid"] = uid

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt, jti, expire


REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 3))

# Short-lived token bridging the two halves of an MFA login. It is NOT a
# credential: it says only "this password was accepted, the second factor is
# still outstanding". Five minutes is long enough to fetch a phone and read a
# code, short enough that one left on screen is not much use to anyone.
MFA_CHALLENGE_EXPIRE_MINUTES = int(os.getenv("MFA_CHALLENGE_EXPIRE_MINUTES", 5))


# How long a step-up lasts. Short by design: it is meant to cover the action the
# user just asked for, not to open a window they forget is open.
STEP_UP_EXPIRE_MINUTES = int(os.getenv("STEP_UP_EXPIRE_MINUTES", 5))


def create_step_up_token(uid: int, access_jti: str) -> tuple[str, datetime]:
    """Prove a factor was re-checked just now, for one session only.

    Bound to the jti of the access token that requested it. Without that
    binding a step-up performed in one browser would authorise an irreversible
    action taken from another — which is exactly the situation a stolen session
    creates, and exactly what this is meant to catch.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=STEP_UP_EXPIRE_MINUTES)
    to_encode = {
        "uid": uid,
        "exp": expire,
        "type": "step_up",
        "ajti": access_jti,
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM), expire


def create_mfa_challenge_token(subject: Union[str, Any], uid: int) -> tuple[str, str, datetime]:
    """Issue the between-steps token — returns (token, jti, expires_at).

    type="mfa_challenge" keeps it out of every authenticated endpoint:
    get_current_user accepts type="access" only, so presenting this as the
    access_token cookie or a Bearer header authenticates nothing. The jti lets
    /auth/login/mfa revoke it once spent, so a captured token cannot be
    redeemed a second time.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=MFA_CHALLENGE_EXPIRE_MINUTES)
    jti = str(uuid.uuid4())
    to_encode = {
        "sub": str(subject),
        "uid": uid,
        "exp": expire,
        "type": "mfa_challenge",
        "jti": jti,
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM), jti, expire



def create_refresh_token(subject: Union[str, Any]) -> tuple[str, str, datetime]:
    """สร้าง Refresh Token ที่มีอายุการใช้งานนานกว่า Access Token — returns
    (token, jti, expires_at). The jti lets the refresh endpoint revoke this
    specific token on rotation/logout and detect reuse of an already-rotated
    token."""
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    jti = str(uuid.uuid4())
    to_encode = {
        "sub": str(subject),
        "exp": expire,
        "type": "refresh",  # ใส่ type เพื่อกันการสลับใช้
        "jti": jti,
    }
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt, jti, expire


def verify_refresh_token(token: str) -> str:
    """ตรวจสอบความถูกต้องของ Refresh Token และคืนค่า subject (user_id)"""
    try:
        # 1. Decode token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # 2. เช็ค Type ว่าเป็น 'refresh' จริงไหม (ป้องกันการเอา access token มาสวมรอย)
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )

        # 3. ดึง user_id (subject) ออกมา
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
            )
        return user_id

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate refresh token",
        )
