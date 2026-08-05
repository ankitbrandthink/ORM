"""Admin session management — view and revoke active login sessions."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, require_roles
from app.models import User, UserSession
from app.schemas import SessionOut

router = APIRouter()
log = logging.getLogger("orm.sessions")


def _fmt(dt) -> Optional[str]:
    """Return ISO-8601 string with explicit UTC suffix so JS Date() parses correctly."""
    if dt is None:
        return None
    if isinstance(dt, str):
        # Backfill Z if no timezone marker present (all DB timestamps are UTC)
        if dt and "+" not in dt[10:] and not dt.endswith("Z"):
            return dt + "Z"
        return dt
    # Naive datetime — stored as UTC, add Z
    if dt.tzinfo is None:
        return dt.isoformat() + "Z"
    return dt.isoformat()


def _session_to_out(s: UserSession, user: Optional[User]) -> dict:
    return {
        "id": s.id,
        "user_id": s.user_id,
        "user_email": user.email if user else None,
        "user_name": user.full_name if user else None,
        "ip_address": s.ip_address,
        "device_type": s.device_type,
        "device_name": s.device_name if hasattr(s, "device_name") else None,
        "browser": s.browser,
        "os": s.os,
        "country": s.country,
        "region": s.region,
        "city": s.city,
        "latitude": s.latitude,
        "longitude": s.longitude,
        "is_active": bool(s.is_active),
        "logged_in_at": _fmt(s.logged_in_at),
        "last_active_at": _fmt(s.last_active_at),
        "logged_out_at": _fmt(s.logged_out_at),
    }


@router.get("/")
def list_sessions(
    active_only: bool = Query(True),
    user_id: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
    db: Session = Depends(get_db),
):
    """List login sessions for this tenant. SuperAdmin/CROManager only."""
    q = db.query(UserSession).filter(UserSession.tenant_id == current.tenant_id)
    if active_only:
        q = q.filter(UserSession.is_active == True)
    if user_id:
        q = q.filter(UserSession.user_id == user_id)
    q = q.order_by(UserSession.logged_in_at.desc())
    total = q.count()
    sessions = q.offset(offset).limit(limit).all()

    # Bulk-load user info
    user_ids = list({s.user_id for s in sessions})
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}

    return {
        "total": total,
        "sessions": [_session_to_out(s, users.get(s.user_id)) for s in sessions],
    }


@router.get("/stats")
def session_stats(
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
    db: Session = Depends(get_db),
):
    """High-level stats: active sessions, total users, accounts connected."""
    from app.models import Client, SocialProfile

    active_sessions = db.query(UserSession).filter(
        UserSession.tenant_id == current.tenant_id,
        UserSession.is_active == True,
    ).count()

    total_users = db.query(User).filter(
        User.tenant_id == current.tenant_id,
        User.is_deleted == False,
    ).count()

    total_sessions_ever = db.query(UserSession).filter(
        UserSession.tenant_id == current.tenant_id,
    ).count()

    accounts_connected = db.query(SocialProfile).join(
        Client, Client.id == SocialProfile.client_id
    ).filter(
        Client.tenant_id == current.tenant_id,
        SocialProfile.is_deleted == False,
    ).count()

    # Unique countries from active sessions
    country_rows = db.query(UserSession.country).filter(
        UserSession.tenant_id == current.tenant_id,
        UserSession.is_active == True,
        UserSession.country != None,
    ).distinct().all()
    countries = [r[0] for r in country_rows if r[0]]

    # Device breakdown
    device_rows = db.query(UserSession.device_type, func.count(UserSession.id)).filter(
        UserSession.tenant_id == current.tenant_id,
        UserSession.is_active == True,
    ).group_by(UserSession.device_type).all()
    devices = {(r[0] or "unknown"): r[1] for r in device_rows}

    return {
        "active_sessions": active_sessions,
        "total_users": total_users,
        "total_sessions_ever": total_sessions_ever,
        "accounts_connected": accounts_connected,
        "countries": countries,
        "devices": devices,
    }


@router.delete("/{session_id}")
def revoke_session(
    session_id: str,
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
    db: Session = Depends(get_db),
):
    """Force-logout a specific session."""
    session = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.tenant_id == current.tenant_id,
    ).first()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    session.is_active = False
    session.logged_out_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "revoked"}


@router.delete("/user/{user_id}/all")
def revoke_all_user_sessions(
    user_id: str,
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
    db: Session = Depends(get_db),
):
    """Force-logout all active sessions for a specific user."""
    now = datetime.now(timezone.utc)
    updated = db.query(UserSession).filter(
        UserSession.user_id == user_id,
        UserSession.tenant_id == current.tenant_id,
        UserSession.is_active == True,
    ).all()
    for s in updated:
        s.is_active = False
        s.logged_out_at = now
    db.commit()
    return {"status": "revoked", "count": len(updated)}
