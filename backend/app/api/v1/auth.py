import logging
import random
import string
import urllib.request
import urllib.parse
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models import User, UserRole, Role, UserSession
from app.schemas import LoginRequest, TokenResponse, RefreshRequest, RegisterRequest, UserOut, SignupRequest
from app.security import (
    create_access_token, create_refresh_token, decode_token,
    hash_password, verify_password,
    create_password_reset_token, verify_password_reset_token,
)
from app.utils.email import send_welcome_email, send_password_reset_email

router = APIRouter()
log = logging.getLogger("orm.auth")


# ── helpers ──────────────────────────────────────────────────────────────────

def _roles_for(db: Session, user: User) -> list[str]:
    rows = (
        db.query(Role.name)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user.id)
        .all()
    )
    return [r[0] for r in rows]


def _generate_password(length: int = 12) -> str:
    chars = string.ascii_letters + string.digits + "!@#$%"
    return "".join(random.choices(chars, k=length))


def _verify_recaptcha(token: str) -> bool:
    """Verify reCAPTCHA v2 token with Google. Returns True if valid."""
    if not token:
        return False
    try:
        data = urllib.parse.urlencode({
            "secret": settings.RECAPTCHA_SECRET,
            "response": token,
        }).encode()
        req = urllib.request.Request(
            "https://www.google.com/recaptcha/api/siteverify",
            data=data,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read().decode())
        return result.get("success", False)
    except Exception as e:
        log.warning("[recaptcha] Verification error: %s", e)
        return False


def _get_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For from nginx."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _parse_user_agent(ua: str) -> dict:
    """Simple user-agent parser — no extra deps needed."""
    import re
    ua_lower = ua.lower()

    # Device type
    if any(m in ua_lower for m in ("mobile", "android", "iphone", "ipod")):
        device_type = "mobile"
    elif any(m in ua_lower for m in ("tablet", "ipad")):
        device_type = "tablet"
    else:
        device_type = "desktop"

    # Browser
    if "edg/" in ua_lower or "edge/" in ua_lower:
        browser = "Edge"
    elif "opr/" in ua_lower or "opera" in ua_lower:
        browser = "Opera"
    elif "chrome/" in ua_lower and "chromium" not in ua_lower:
        browser = "Chrome"
    elif "firefox/" in ua_lower:
        browser = "Firefox"
    elif "safari/" in ua_lower and "chrome" not in ua_lower:
        browser = "Safari"
    else:
        browser = "Unknown"

    # OS
    if "windows" in ua_lower:
        os_name = "Windows"
    elif "mac os" in ua_lower or "macos" in ua_lower:
        os_name = "macOS"
    elif "iphone" in ua_lower or "ipad" in ua_lower:
        os_name = "iOS"
    elif "android" in ua_lower:
        os_name = "Android"
    elif "linux" in ua_lower:
        os_name = "Linux"
    else:
        os_name = "Unknown"

    # Device name — best-effort human-readable label
    device_name = None
    if "iphone" in ua_lower:
        device_name = "iPhone"
    elif "ipad" in ua_lower:
        device_name = "iPad"
    elif "android" in ua_lower:
        # Try to extract model: "Android X.X; <Model>) AppleWebKit"
        m = re.search(r'android[\s/][^;)]+;\s*([^;)]+?)\s*(?:build|[;)])', ua, re.IGNORECASE)
        if m:
            model = m.group(1).strip()
            # Skip generic tokens like "Mobile", "Tablet", "K"
            if model and len(model) > 1 and model.lower() not in ("mobile", "tablet", "k"):
                device_name = model
        if not device_name:
            device_name = "Android Device"
    elif "windows" in ua_lower:
        device_name = "Windows PC"
    elif "mac os" in ua_lower or "macos" in ua_lower:
        device_name = "Mac"
    elif "linux" in ua_lower:
        device_name = "Linux PC"

    return {"device_type": device_type, "browser": browser, "os": os_name, "device_name": device_name}


def _geolocate(ip: str) -> dict:
    """Free IP geolocation via ip-api.com (no key needed, 45 req/min)."""
    if not ip or ip in ("unknown", "127.0.0.1", "::1"):
        return {}
    try:
        url = f"http://ip-api.com/json/{ip}?fields=status,country,regionName,city,lat,lon"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode())
        if data.get("status") == "success":
            return {
                "country": data.get("country"),
                "region": data.get("regionName"),
                "city": data.get("city"),
                "latitude": data.get("lat"),
                "longitude": data.get("lon"),
            }
    except Exception as e:
        log.debug("[geo] Lookup failed for %s: %s", ip, e)
    return {}


def _create_session(db: Session, user: User, request: Request) -> UserSession:
    """Create and persist a UserSession record, deactivating stale sessions from same device."""
    ip = _get_ip(request)
    ua_str = request.headers.get("User-Agent", "")
    ua_info = _parse_user_agent(ua_str)
    geo = _geolocate(ip)

    # Deactivate any existing active sessions for this user from the same IP/device
    # to prevent session accumulation from repeated logins on the same device.
    now = datetime.now(timezone.utc)
    stale = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == user.id,
            UserSession.ip_address == ip,
            UserSession.is_active == True,
        )
        .all()
    )
    for s in stale:
        s.is_active = False
        s.logged_out_at = now

    session = UserSession(
        user_id=user.id,
        tenant_id=user.tenant_id,
        ip_address=ip,
        user_agent=ua_str[:1024],
        device_type=ua_info.get("device_type"),
        device_name=ua_info.get("device_name"),
        browser=ua_info.get("browser"),
        os=ua_info.get("os"),
        country=geo.get("country"),
        region=geo.get("region"),
        city=geo.get("city"),
        latitude=geo.get("latitude"),
        longitude=geo.get("longitude"),
        is_active=True,
        logged_in_at=now,
        last_active_at=now,
    )
    db.add(session)
    db.commit()
    return session


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("/signup")
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    """Public signup — creates account within the default tenant, emails password."""
    email = body.email.strip().lower()

    if db.query(User).filter(User.email == email, User.is_deleted == False).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    # Find the default (first) tenant
    from app.models import Tenant
    tenant = db.query(Tenant).filter(Tenant.is_deleted == False).order_by(Tenant.created_at).first()
    if not tenant:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "No tenant configured")

    password = _generate_password()
    user = User(
        tenant_id=tenant.id,
        email=email,
        full_name=body.full_name.strip(),
        hashed_password=hash_password(password),
        is_active=True,
    )
    db.add(user)
    db.flush()

    # Assign Viewer role by default
    viewer_role = db.query(Role).filter(Role.name == "Viewer").first()
    if viewer_role:
        db.add(UserRole(user_id=user.id, role_id=viewer_role.id))

    db.commit()

    # Send welcome email (logs password if SMTP not configured)
    sent = send_welcome_email(email, body.full_name, password)
    if not sent:
        log.info("[signup] Password for %s: %s", email, password)

    return {
        "message": "Account created. Check your email for your password.",
        "email_sent": sent,
    }


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # reCAPTCHA check
    if settings.RECAPTCHA_ENABLED and body.recaptcha_token:
        if not _verify_recaptcha(body.recaptcha_token):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "reCAPTCHA verification failed")

    user = db.query(User).filter(User.email == body.email, User.is_deleted == False).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User inactive")

    roles = _roles_for(db, user)

    # Track session (fire-and-forget style — don't fail login if session tracking errors)
    try:
        _create_session(db, user, request)
    except Exception as e:
        log.warning("[session] Failed to create session for %s: %s", user.email, e)

    return TokenResponse(
        access_token=create_access_token(user.id, user.tenant_id, roles),
        refresh_token=create_refresh_token(user.id, user.tenant_id),
    )


@router.get("/me", response_model=UserOut)
def get_me(current: CurrentUser = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return UserOut(
        id=current.id,
        email=current.email,
        full_name=current.user.full_name,
        is_active=current.user.is_active,
        roles=current.roles,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    roles = _roles_for(db, user)
    return TokenResponse(
        access_token=create_access_token(user.id, user.tenant_id, roles),
        refresh_token=create_refresh_token(user.id, user.tenant_id),
    )


@router.post("/logout")
def logout(request: Request, current: CurrentUser = Depends(require_roles()), db: Session = Depends(get_db)):
    """Mark the most recent active session for this user as logged out."""
    ip = _get_ip(request)
    try:
        session = (
            db.query(UserSession)
            .filter(
                UserSession.user_id == current.id,
                UserSession.ip_address == ip,
                UserSession.is_active == True,
            )
            .order_by(UserSession.logged_in_at.desc())
            .first()
        )
        if session:
            session.is_active = False
            session.logged_out_at = datetime.now(timezone.utc)
            db.commit()
    except Exception as e:
        log.warning("[session] Logout tracking error: %s", e)
    return {"status": "logged_out"}


@router.post("/register", response_model=UserOut)
def register(
    body: RegisterRequest,
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already exists")
    user = User(
        tenant_id=current.tenant_id,
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.flush()
    for rname in body.roles:
        role = db.query(Role).filter(Role.name == rname).first()
        if role:
            db.add(UserRole(user_id=user.id, role_id=role.id))
    db.commit()
    return UserOut(id=user.id, email=user.email, full_name=user.full_name,
                   is_active=user.is_active, roles=body.roles)


# ── Password reset (public) ───────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Send a password-reset link to the given email. Always returns 200 to avoid user enumeration."""
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email, User.is_deleted == False, User.is_active == True).first()
    if user:
        token = create_password_reset_token(str(user.id))
        # Detect origin from request for the reset link
        origin = request.headers.get("Origin") or request.headers.get("Referer", "").rstrip("/")
        if not origin:
            origin = "https://orm.itechexpand.com"
        reset_link = f"{origin}/reset-password?token={token}"
        sent = send_password_reset_email(user.email, user.full_name or user.email, reset_link)
        if not sent:
            log.info("[reset] Reset link for %s: %s", email, reset_link)
    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Validate reset token and set the new password."""
    user_id = verify_password_reset_token(body.token)
    if not user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset link. Please request a new one.")
    if len(body.new_password) < 8:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Password must be at least 8 characters.")
    user = db.query(User).filter(User.id == user_id, User.is_deleted == False).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    user.hashed_password = hash_password(body.new_password)
    db.commit()
    return {"message": "Password updated successfully. You can now sign in."}


# ── Admin: send reset link to any user ───────────────────────────────────────

@router.post("/send-reset-link/{user_id}")
def admin_send_reset_link(
    user_id: str,
    request: Request,
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
    db: Session = Depends(get_db),
):
    """Admin: generate and email a password-reset link for any user."""
    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == current.tenant_id,
        User.is_deleted == False,
    ).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    token = create_password_reset_token(str(user.id))
    origin = request.headers.get("Origin") or "https://orm.itechexpand.com"
    reset_link = f"{origin}/reset-password?token={token}"
    sent = send_password_reset_email(user.email, user.full_name or user.email, reset_link)
    if not sent:
        log.info("[reset] Admin-generated reset link for %s: %s", user.email, reset_link)
    return {"message": f"Reset link sent to {user.email}.", "email_sent": sent}
