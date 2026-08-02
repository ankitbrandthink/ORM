"""Social-account connection gating.

Scraping real comments from a post (per-link or per-sheet) requires an active,
logged-in social session. This module tracks a lightweight per-tenant
"connected" flag per platform. It deliberately stores NO credentials — the
actual login happens on the official facebook.com / instagram.com login page in
a popup; we only record that the user completed it and when.

The flag is the gate the scraper checks: if a platform isn't connected, the
ingest endpoints return 428 so the UI can prompt the login popup first.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import Tenant

router = APIRouter()

SUPPORTED = {"facebook", "instagram", "twitter", "youtube"}
# A session is considered fresh for this many hours before re-login is prompted.
SESSION_TTL_HOURS = 12

LOGIN_URLS = {
    "facebook": "https://www.facebook.com/login.php",
    "instagram": "https://www.instagram.com/accounts/login/",
    "twitter": "https://twitter.com/login",
    "youtube": "https://accounts.google.com/ServiceLogin?service=youtube",
}


def _conns(tenant: Tenant) -> dict:
    meta = tenant.meta or {}
    return meta.get("connections", {})


def _is_fresh(entry: dict) -> bool:
    if not entry or not entry.get("connected"):
        return False
    ts = entry.get("connected_at")
    if not ts:
        return False
    try:
        when = datetime.fromisoformat(ts)
    except ValueError:
        return False
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    age_h = (datetime.now(timezone.utc) - when).total_seconds() / 3600
    return age_h < SESSION_TTL_HOURS


def require_connected(db: Session, tenant_id: str, platform: str):
    """Raise 428 if the platform isn't connected — the UI turns this into a login popup."""
    platform = (platform or "").lower()
    if platform not in SUPPORTED:
        return  # unknown platform → no gate
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not _is_fresh(_conns(tenant).get(platform)):
        raise HTTPException(
            status_code=428,
            detail={"error": "social_login_required", "platform": platform,
                    "login_url": LOGIN_URLS.get(platform),
                    "message": f"Connect your {platform.title()} account to scrape comments."})


@router.get("")
def list_connections(current: CurrentUser = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == current.tenant_id).first()
    conns = _conns(tenant)
    return {
        "platforms": [
            {"platform": p, "login_url": LOGIN_URLS[p],
             "connected": _is_fresh(conns.get(p)),
             "connected_at": (conns.get(p) or {}).get("connected_at")}
            for p in sorted(SUPPORTED)
        ],
        "session_ttl_hours": SESSION_TTL_HOURS,
    }


@router.post("/{platform}/connect")
def connect(platform: str, current: CurrentUser = Depends(get_current_user),
            db: Session = Depends(get_db)):
    """Mark a platform connected after the user completed login in the popup."""
    platform = platform.lower()
    if platform not in SUPPORTED:
        raise HTTPException(400, f"Unsupported platform. Use one of {sorted(SUPPORTED)}")
    tenant = db.query(Tenant).filter(Tenant.id == current.tenant_id).first()
    meta = dict(tenant.meta or {})
    conns = dict(meta.get("connections", {}))
    conns[platform] = {"connected": True,
                       "connected_at": datetime.now(timezone.utc).isoformat(),
                       "by": current.email}
    meta["connections"] = conns
    tenant.meta = meta
    flag_modified(tenant, "meta")
    db.commit()
    return {"platform": platform, "connected": True}


@router.post("/{platform}/disconnect")
def disconnect(platform: str, current: CurrentUser = Depends(get_current_user),
               db: Session = Depends(get_db)):
    platform = platform.lower()
    tenant = db.query(Tenant).filter(Tenant.id == current.tenant_id).first()
    meta = dict(tenant.meta or {})
    conns = dict(meta.get("connections", {}))
    conns.pop(platform, None)
    meta["connections"] = conns
    tenant.meta = meta
    flag_modified(tenant, "meta")
    db.commit()
    return {"platform": platform, "connected": False}
