from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from jose import jwt, JWTError
from app.context import current_user_id, current_ip
from app.core.security import SECRET_KEY, ALGORITHM


class AuditContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Capture client IP (ProxyHeadersMiddleware runs before us, so X-Forwarded-For is resolved)
        ip = request.client.host if request.client else None
        ip_token = current_ip.set(ip)

        # Extract user_id from token claim "uid" (falls back to None if absent)
        uid: int | None = None
        token = request.cookies.get("access_token")
        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
        if token:
            try:
                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                raw_uid = payload.get("uid")
                if raw_uid is not None:
                    uid = int(raw_uid)
            except (JWTError, ValueError):
                pass

        uid_token = current_user_id.set(uid)
        try:
            return await call_next(request)
        finally:
            current_user_id.reset(uid_token)
            current_ip.reset(ip_token)
