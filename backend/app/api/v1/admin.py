from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, require_roles
from app.models import AuditLog, FeatureFlag, IngestionJob, User

router = APIRouter()


@router.get("/users")
def admin_users(current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
                db: Session = Depends(get_db)):
    users = db.query(User).filter(User.tenant_id == current.tenant_id).all()
    return [{"id": u.id, "email": u.email, "full_name": u.full_name,
             "is_active": u.is_active, "is_deleted": u.is_deleted} for u in users]


@router.get("/audit-logs")
def audit_logs(current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
               db: Session = Depends(get_db), limit: int = 100):
    logs = (db.query(AuditLog).filter(AuditLog.tenant_id == current.tenant_id)
            .order_by(AuditLog.created_at.desc()).limit(limit).all())
    return [{"id": l.id, "action": l.action, "actor_id": l.actor_id,
             "target_type": l.target_type, "target_id": l.target_id,
             "detail": l.detail, "at": l.created_at} for l in logs]


@router.get("/feature-flags")
def feature_flags(current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
                  db: Session = Depends(get_db)):
    flags = db.query(FeatureFlag).filter(FeatureFlag.tenant_id == current.tenant_id).all()
    return [{"id": f.id, "key": f.key, "enabled": f.enabled} for f in flags]


@router.get("/jobs")
def jobs(current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
         db: Session = Depends(get_db), limit: int = 50):
    rows = (db.query(IngestionJob).filter(IngestionJob.tenant_id == current.tenant_id)
            .order_by(IngestionJob.created_at.desc()).limit(limit).all())
    return [{"id": j.id, "status": j.status, "stats": j.stats,
             "at": j.created_at} for j in rows]


# ── Instagram session config ──────────────────────────────────────────────────

class InstagramSessionIn(BaseModel):
    username: str
    session_id: str
    csrf_token: str = ""


@router.get("/instagram-session")
def get_instagram_session(
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
):
    """Return whether an Instagram session is configured (never returns the raw token)."""
    from app.scrapers.instagram_adapter import _load_ig_config
    import os
    cfg = _load_ig_config()
    env_user = os.environ.get("INSTAGRAM_USER", "")
    env_set  = bool(os.environ.get("INSTAGRAM_SESSION_ID", ""))
    return {
        "configured": bool(cfg.get("session_id") or env_set),
        "username": cfg.get("username") or env_user or None,
        "source": "env" if env_set else ("file" if cfg.get("session_id") else "none"),
    }


@router.put("/instagram-session")
def set_instagram_session(
    body: InstagramSessionIn,
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
):
    """Save Instagram session credentials to the config file on disk."""
    from app.scrapers.instagram_adapter import save_ig_config
    save_ig_config(body.username.strip(), body.session_id.strip(), body.csrf_token.strip())
    return {"ok": True, "username": body.username.strip()}


@router.delete("/instagram-session")
def delete_instagram_session(
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
):
    """Remove the saved Instagram session config."""
    from app.scrapers.instagram_adapter import _CONFIG_FILE
    import os
    if os.path.exists(_CONFIG_FILE):
        os.remove(_CONFIG_FILE)
    return {"ok": True}


@router.post("/fix-post-metrics")
def fix_post_metrics(
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
    db: Session = Depends(get_db),
):
    """One-time cleanup: remove stale sentiment_ratio from post metrics and
    backfill real_comment_total from metrics.comments where missing.
    Run once after upgrading to fix existing posts with wrong scaled counts."""
    from app.models import Post
    posts = db.query(Post).filter(
        Post.tenant_id == current.tenant_id,
        Post.is_deleted == False,
    ).all()
    fixed = 0
    for p in posts:
        m = dict(p.metrics or {})
        changed = False
        if "sentiment_ratio" in m:
            del m["sentiment_ratio"]
            changed = True
        if not m.get("real_comment_total") and m.get("comments"):
            m["real_comment_total"] = m["comments"]
            changed = True
        if changed:
            p.metrics = m
            fixed += 1
    db.commit()
    return {"ok": True, "fixed": fixed, "total": len(posts)}


# ── Proxy / scraping-mode config ─────────────────────────────────────────────

_PROXY_CONFIG_FILE = None

def _proxy_config_path() -> str:
    global _PROXY_CONFIG_FILE
    if _PROXY_CONFIG_FILE is None:
        import os as _os
        _PROXY_CONFIG_FILE = _os.path.join(
            _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))),
            "data", "proxy_config.json",
        )
    return _PROXY_CONFIG_FILE


def _load_proxy_config() -> dict:
    import json as _json
    try:
        with open(_proxy_config_path()) as f:
            return _json.load(f)
    except Exception:
        return {}


def _save_proxy_config(cfg: dict) -> None:
    import json as _json, os as _os
    path = _proxy_config_path()
    _os.makedirs(_os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        _json.dump(cfg, f)


class ProxyConfigIn(BaseModel):
    proxy_url: str = ""
    active: bool = False


@router.get("/proxy-settings")
def get_proxy_settings(
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
):
    import os
    cfg = _load_proxy_config()
    env_url = os.environ.get("INSTAGRAM_PROXY_URL", "").strip()
    return {
        "proxy_url": cfg.get("proxy_url") or "",
        "active": cfg.get("active", False),
        "env_override": bool(env_url),
        "effective_url": env_url or (cfg.get("proxy_url") if cfg.get("active") else ""),
    }


@router.put("/proxy-settings")
def set_proxy_settings(
    body: ProxyConfigIn,
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
):
    import os
    cfg = {"proxy_url": body.proxy_url.strip(), "active": body.active}
    _save_proxy_config(cfg)
    if body.active and body.proxy_url.strip():
        os.environ["INSTAGRAM_PROXY_URL"] = body.proxy_url.strip()
    elif not body.active:
        os.environ.pop("INSTAGRAM_PROXY_URL", None)
    return {"ok": True, "active": body.active}


@router.post("/instagram-session/test")
def test_instagram_session(
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
):
    """Verify the saved Instagram session with a lightweight authenticated check.
    Gives a precise diagnosis: valid / expired-cookie / IP-rate-limited."""
    from app.scrapers.instagram_adapter import InstagramAdapter
    adapter = InstagramAdapter()
    ok, message = adapter.verify()
    return {"ok": ok, "message": message} if ok else {"ok": False, "error": message}


# ── YouTube Data API key config ───────────────────────────────────────────────

_YT_KEY_CONFIG_FILE = None

def _yt_key_path() -> str:
    global _YT_KEY_CONFIG_FILE
    if _YT_KEY_CONFIG_FILE is None:
        import os as _os
        _YT_KEY_CONFIG_FILE = _os.path.join(
            _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))),
            "data", "youtube_api_config.json",
        )
    return _YT_KEY_CONFIG_FILE


def _load_yt_key() -> str:
    import json as _json, os as _os
    env_key = _os.environ.get("YOUTUBE_API_KEY", "").strip()
    if env_key:
        return env_key
    try:
        with open(_yt_key_path()) as f:
            return _json.load(f).get("api_key", "")
    except Exception:
        return ""


class YoutubeKeyIn(BaseModel):
    api_key: str


@router.get("/youtube-api-key")
def get_youtube_api_key(
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
):
    import os
    env_key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    file_key = ""
    try:
        import json as _json
        with open(_yt_key_path()) as f:
            file_key = _json.load(f).get("api_key", "")
    except Exception:
        pass
    active_key = env_key or file_key
    return {
        "configured": bool(active_key),
        "env_override": bool(env_key),
        "masked_key": f"{active_key[:6]}…{active_key[-4:]}" if len(active_key) > 10 else "",
    }


@router.put("/youtube-api-key")
def set_youtube_api_key(
    body: YoutubeKeyIn,
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
):
    import json as _json, os as _os
    key = body.api_key.strip()
    if not key:
        raise HTTPException(400, "api_key is required")
    path = _yt_key_path()
    _os.makedirs(_os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        _json.dump({"api_key": key}, f)
    _os.environ["YOUTUBE_API_KEY"] = key
    return {"ok": True}


# ── Facebook session / access-token config ────────────────────────────────────

class FacebookConfigIn(BaseModel):
    c_user: str = ""
    xs: str = ""
    access_token: str = ""


def _write_fb_netscape_cookies(c_user: str, xs: str, path: str) -> None:
    """Write a Netscape-format cookies.txt so yt-dlp can authenticate to Facebook."""
    import os as _os
    _os.makedirs(_os.path.dirname(path), exist_ok=True)
    lines = ["# Netscape HTTP Cookie File\n"]
    if c_user:
        lines.append(f".facebook.com\tTRUE\t/\tTRUE\t0\tc_user\t{c_user}\n")
    if xs:
        lines.append(f".facebook.com\tTRUE\t/\tTRUE\t0\txs\t{xs}\n")
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)


@router.get("/facebook-config")
def get_facebook_config(
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
):
    from app.scrapers.facebook_adapter import load_fb_config
    import os
    cfg = load_fb_config()
    env_token = os.environ.get("FACEBOOK_ACCESS_TOKEN", "").strip()
    raw_token = cfg.get("access_token", "").strip() or env_token
    return {
        "has_cookies": bool(cfg.get("c_user") and cfg.get("xs")),
        "has_token": bool(raw_token),
        "env_override": bool(env_token),
        "masked_token": f"{raw_token[:6]}…{raw_token[-4:]}" if len(raw_token) > 10 else "",
        "c_user": cfg.get("c_user", ""),
    }


@router.put("/facebook-config")
def set_facebook_config(
    body: FacebookConfigIn,
    current: CurrentUser = Depends(require_roles("SuperAdmin", "CROManager")),
):
    from app.scrapers.facebook_adapter import load_fb_config, save_fb_config
    import os as _os

    cfg = load_fb_config()
    if body.c_user.strip():
        cfg["c_user"] = body.c_user.strip()
    if body.xs.strip():
        cfg["xs"] = body.xs.strip()
    if body.access_token.strip():
        cfg["access_token"] = body.access_token.strip()
        _os.environ["FACEBOOK_ACCESS_TOKEN"] = body.access_token.strip()
    save_fb_config(cfg)

    # Also write Netscape cookies.txt for yt-dlp comment fetching
    c_user = cfg.get("c_user", "")
    xs = cfg.get("xs", "")
    if c_user or xs:
        cookies_path = _os.path.join(
            _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))),
            "data", "facebook_cookies.txt",
        )
        _write_fb_netscape_cookies(c_user, xs, cookies_path)

    return {"ok": True}
