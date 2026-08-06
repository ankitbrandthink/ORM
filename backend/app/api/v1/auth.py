import logging
import random
import secrets
import string
import urllib.request
import urllib.parse
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, require_roles
from app.models import AuditLog, User, UserRole, Role, UserSession
from app.schemas import (
    ForgotPasswordRequest, LoginRequest, RefreshRequest, RegisterRequest,
    ResetPasswordRequest, TokenResponse, UserOut, SignupRequest,
)
from app.security import (
    create_access_token, create_refresh_token, decode_token,
    hash_password, verify_password,
)
from app.utils.email import send_password_reset_email, send_welcome_email

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
    """Parse user-agent string into device info with descriptive device_name."""
    import re
    ua_lower = ua.lower()

    # Device type
    if any(m in ua_lower for m in ("mobile", "android", "iphone", "ipod")):
        device_type = "mobile"
    elif any(m in ua_lower for m in ("tablet", "ipad")):
        device_type = "tablet"
    else:
        device_type = "desktop"

    # Browser + major version
    browser = "Unknown"
    browser_ver = ""
    if "edg/" in ua_lower or "edge/" in ua_lower:
        browser = "Edge"
        m = re.search(r"(?:edg|edge)/(\d+)", ua, re.IGNORECASE)
        if m:
            browser_ver = m.group(1)
    elif "opr/" in ua_lower or "opera" in ua_lower:
        browser = "Opera"
        m = re.search(r"opr/(\d+)", ua, re.IGNORECASE)
        if m:
            browser_ver = m.group(1)
    elif "chrome/" in ua_lower and "chromium" not in ua_lower:
        browser = "Chrome"
        m = re.search(r"chrome/(\d+)", ua, re.IGNORECASE)
        if m:
            browser_ver = m.group(1)
    elif "firefox/" in ua_lower:
        browser = "Firefox"
        m = re.search(r"firefox/(\d+)", ua, re.IGNORECASE)
        if m:
            browser_ver = m.group(1)
    elif "safari/" in ua_lower and "chrome" not in ua_lower:
        browser = "Safari"
        m = re.search(r"version/(\d+)", ua, re.IGNORECASE)
        if m:
            browser_ver = m.group(1)

    browser_label = f"{browser} {browser_ver}" if browser_ver else browser

    # OS + version
    os_name = "Unknown"
    os_ver = ""
    if "windows" in ua_lower:
        os_name = "Windows"
        m = re.search(r"windows nt (\d+\.\d+)", ua, re.IGNORECASE)
        if m:
            nt_map = {"10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7", "6.0": "Vista"}
            os_ver = nt_map.get(m.group(1), m.group(1))
    elif "mac os x" in ua_lower or "macos" in ua_lower:
        os_name = "macOS"
        m = re.search(r"mac os x (\d+[._]\d+)", ua, re.IGNORECASE)
        if m:
            os_ver = m.group(1).replace("_", ".")
    elif "iphone" in ua_lower:
        os_name = "iOS"
        m = re.search(r"cpu iphone os (\d+[._]\d+)", ua, re.IGNORECASE)
        if m:
            os_ver = m.group(1).replace("_", ".")
    elif "ipad" in ua_lower:
        os_name = "iPadOS"
        m = re.search(r"cpu os (\d+[._]\d+)", ua, re.IGNORECASE)
        if m:
            os_ver = m.group(1).replace("_", ".")
    elif "android" in ua_lower:
        os_name = "Android"
        m = re.search(r"android (\d+(?:\.\d+)?)", ua, re.IGNORECASE)
        if m:
            os_ver = m.group(1)
    elif "linux" in ua_lower:
        os_name = "Linux"

    os_label = f"{os_name} {os_ver}".strip() if os_ver else os_name

    # Descriptive device name: "<Browser> <Ver> on <OS> <Ver>"
    device_name = None
    if "iphone" in ua_lower:
        device_name = f"iPhone · {browser_label}"
    elif "ipad" in ua_lower:
        device_name = f"iPad · {browser_label}"
    elif "android" in ua_lower:
        m = re.search(r"android[\s/][^;)]+;\s*([^;)]+?)\s*(?:build|[;)])", ua, re.IGNORECASE)
        model = ""
        if m:
            candidate = m.group(1).strip()
            if candidate and len(candidate) > 1 and candidate.lower() not in ("mobile", "tablet", "k"):
                model = candidate
        device_name = f"{model or 'Android'} · {browser_label}"
    elif "windows" in ua_lower:
        device_name = f"{browser_label} on Windows {os_ver}".strip() if os_ver else f"{browser_label} on Windows"
    elif "mac os" in ua_lower or "macos" in ua_lower:
        device_name = f"{browser_label} on macOS {os_ver}".strip() if os_ver else f"{browser_label} on macOS"
    elif "linux" in ua_lower:
        device_name = f"{browser_label} on Linux"

    return {
        "device_type": device_type,
        "browser": browser_label,
        "os": os_label,
        "device_name": device_name,
    }


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
    """Create and persist a UserSession record."""
    ip = _get_ip(request)
    ua_str = request.headers.get("User-Agent", "")
    ua_info = _parse_user_agent(ua_str)
    geo = _geolocate(ip)

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
        logged_in_at=datetime.now(timezone.utc),
        last_active_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.commit()
    return session


def _log_activity(
    db: Session,
    tenant_id: str,
    actor_id: str | None,
    action: str,
    target_type: str = "",
    target_id: str = "",
    detail: dict | None = None,
) -> None:
    """Write an AuditLog record. Never raises — audit failures must not break the caller."""
    try:
        entry = AuditLog(
            tenant_id=tenant_id,
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id or "",
            detail=detail or {},
        )
        db.add(entry)
        db.commit()
    except Exception as exc:
        log.warning("[audit] Failed to write activity log for action=%s: %s", action, exc)
        try:
            db.rollback()
        except Exception:
            pass


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("/signup")
def signup(body: SignupRequest, request: Request, db: Session = Depends(get_db)):
    """Public signup — creates account within the default tenant, emails password."""
    email = body.email.strip().lower()

    if db.query(User).filter(User.email == email, User.is_deleted == False).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

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

    viewer_role = db.query(Role).filter(Role.name == "Viewer").first()
    if viewer_role:
        db.add(UserRole(user_id=user.id, role_id=viewer_role.id))

    db.commit()

    sent = send_welcome_email(email, body.full_name, password)
    if not sent:
        log.info("[signup] Password for %s: %s", email, password)

    ip = _get_ip(request)
    ua = request.headers.get("User-Agent", "")
    _log_activity(db, tenant.id, user.id, "user.signup", "user", user.id,
                  {"description": f"{email} created an account", "email": email, "ip": ip, "ua": ua[:200]})

    return {
        "message": "Account created. Check your email for your password.",
        "email_sent": sent,
    }


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    if settings.RECAPTCHA_ENABLED and body.recaptcha_token:
        if not _verify_recaptcha(body.recaptcha_token):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "reCAPTCHA verification failed")

    user = db.query(User).filter(User.email == body.email, User.is_deleted == False).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User inactive")

    roles = _roles_for(db, user)

    session_id = None
    ua_info = {}
    try:
        session = _create_session(db, user, request)
        session_id = session.id
        ua_info = _parse_user_agent(request.headers.get("User-Agent", ""))
    except Exception as e:
        log.warning("[session] Failed to create session for %s: %s", user.email, e)

    ip = _get_ip(request)
    device_label = ua_info.get("device_name") or ua_info.get("os", "")
    _log_activity(db, user.tenant_id, user.id, "user.login", "user", user.id, {
        "description": f"Signed in from {device_label}" if device_label else "Signed in",
        "ip": ip,
        "device": device_label,
        "browser": ua_info.get("browser", ""),
        "session_id": session_id,
    })

    return TokenResponse(
        access_token=create_access_token(user.id, user.tenant_id, roles, session_id=session_id),
        refresh_token=create_refresh_token(user.id, user.tenant_id, session_id=session_id),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")

    session_id = payload.get("session_id")
    if session_id:
        session = db.query(UserSession).filter(
            UserSession.id == session_id,
            UserSession.is_active == True,
        ).first()
        if not session:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session has been revoked")

    roles = _roles_for(db, user)
    return TokenResponse(
        access_token=create_access_token(user.id, user.tenant_id, roles, session_id=session_id),
        refresh_token=create_refresh_token(user.id, user.tenant_id, session_id=session_id),
    )


@router.post("/logout")
def logout(request: Request, current: CurrentUser = Depends(require_roles()), db: Session = Depends(get_db)):
    """Mark the session from the JWT as logged out (uses session_id, not IP)."""
    token_str = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    session_id = None
    if token_str:
        payload = decode_token(token_str)
        if payload:
            session_id = payload.get("session_id")

    try:
        if session_id:
            session = db.query(UserSession).filter(
                UserSession.id == session_id,
                UserSession.user_id == current.id,
                UserSession.is_active == True,
            ).first()
        else:
            # Fallback: find most-recent active session for this user
            session = (
                db.query(UserSession)
                .filter(
                    UserSession.user_id == current.id,
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

    ip = _get_ip(request)
    _log_activity(db, current.tenant_id, current.id, "user.logout", "user", current.id, {
        "description": "Signed out",
        "ip": ip,
        "session_id": session_id,
    })

    return {"status": "logged_out"}


@router.get("/me")
def me(current: CurrentUser = Depends(require_roles())):
    return {"id": current.id, "email": current.email}


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Send a password-reset email. Always returns 200 to prevent user enumeration."""
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email, User.is_deleted == False, User.is_active == True).first()

    if user:
        raw_token = secrets.token_urlsafe(32)
        user.password_reset_token = raw_token
        user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()

        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
        sent = send_password_reset_email(email, user.full_name or email, reset_link)
        if not sent:
            log.info("[forgot-password] Reset link for %s: %s", email, reset_link)

        ip = _get_ip(request)
        _log_activity(db, user.tenant_id, user.id, "user.forgot_password", "user", user.id, {
            "description": f"Requested password reset for {email}",
            "ip": ip,
            "email_sent": sent,
        })

    return {"message": "If an account with that email exists, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Validate reset token and set a new password."""
    if not body.new_password or len(body.new_password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password must be at least 8 characters")

    user = db.query(User).filter(
        User.password_reset_token == body.token,
        User.is_deleted == False,
    ).first()

    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset token")

    # Check expiry
    if user.password_reset_expires_at:
        expires = user.password_reset_expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reset token has expired. Request a new one.")

    user.hashed_password = hash_password(body.new_password)
    user.password_reset_token = None
    user.password_reset_expires_at = None
    db.commit()

    ip = _get_ip(request)
    _log_activity(db, user.tenant_id, user.id, "user.password_reset", "user", user.id,
                  {"description": "Password was reset successfully", "ip": ip})

    return {"message": "Password updated successfully. You can now sign in."}


@router.post("/register", response_model=UserOut)
def register(
    body: RegisterRequest,
    request: Request,
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

    ip = _get_ip(request)
    _log_activity(db, current.tenant_id, current.id, "user.register", "user", user.id, {
        "description": f"Created new user account for {body.email}",
        "new_user_email": body.email,
        "roles": body.roles,
        "ip": ip,
    })

    return UserOut(id=user.id, email=user.email, full_name=user.full_name,
                   is_active=user.is_active, roles=body.roles)
