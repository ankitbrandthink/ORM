from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole, Role
from app.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


class CurrentUser:
    def __init__(self, user: User, roles: list[str]):
        self.user = user
        self.id = user.id
        self.tenant_id = user.tenant_id
        self.email = user.email
        self.roles = roles


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> CurrentUser:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.query(User).filter(User.id == payload["sub"], User.is_deleted == False).first()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    roles = payload.get("roles", [])
    return CurrentUser(user, roles)


def require_roles(*allowed: str):
    def checker(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if "SuperAdmin" in current.roles:
            return current
        if not set(allowed) & set(current.roles):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return current
    return checker
