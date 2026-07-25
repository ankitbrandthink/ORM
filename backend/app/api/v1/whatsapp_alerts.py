"""
WhatsApp alert endpoints — supports OpenWA (local service) and Twilio.

Alert trigger: negative comments >= positive comments (and volume >= min_volume).
"""

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import (
    AlertLog, Client, Comment, CommentAnalysis, Post, PostAnalysis, SocialProfile, WhatsAppConfig,
)

router = APIRouter()

WA_SERVICE_URL = os.getenv("WA_SERVICE_URL", "http://localhost:3002")
WA_SECRET      = os.getenv("WA_SECRET", "orm-wa-secret-change-me")


# ── DB helpers ────────────────────────────────────────────────────────────────

def _wa_headers():
    return {"Authorization": f"Bearer {WA_SECRET}"} if WA_SECRET else {}


def _get_or_create_config(db: Session, tenant_id: str) -> WhatsAppConfig:
    cfg = db.query(WhatsAppConfig).filter(WhatsAppConfig.tenant_id == tenant_id).first()
    if not cfg:
        cfg = WhatsAppConfig(tenant_id=tenant_id)
        db.add(cfg)
        db.flush()
    return cfg


def _get_alert_phones(cfg: WhatsAppConfig) -> list[str]:
    """Return deduplicated list of all recipient phones."""
    phones: list[str] = []
    try:
        phones = json.loads(cfg.alert_phones or "[]")
    except Exception:
        phones = []
    # Always include manager_phone as fallback if list is empty
    if not phones and cfg.manager_phone:
        phones = [cfg.manager_phone]
    return [p for p in phones if p]


# ── Sending ───────────────────────────────────────────────────────────────────

def _send_via_openwa(to: str, message: str) -> tuple[bool, str]:
    try:
        r = httpx.post(f"{WA_SERVICE_URL}/send",
                       json={"to": to, "message": message},
                       headers=_wa_headers(), timeout=30.0)
        if r.status_code == 200:
            return True, ""
        return False, r.json().get("error", r.text)
    except Exception as e:
        return False, str(e)


def _send_via_twilio(to: str, message: str, cfg: WhatsAppConfig) -> tuple[bool, str]:
    """Legacy Twilio support — kept for existing tenants."""
    try:
        from twilio.rest import Client  # lazy import
    except ImportError:
        return False, "twilio package not installed"

    if not cfg.twilio_account_sid or not cfg.twilio_auth_token:
        return False, "Twilio credentials not configured"

    from_num = cfg.twilio_sandbox_number if cfg.test_mode else (cfg.twilio_from_number or "")
    if not from_num:
        return False, "No Twilio from-number configured"

    to_wa  = f"whatsapp:{to}"  if not to.startswith("whatsapp:") else to
    frm_wa = f"whatsapp:{from_num}" if not from_num.startswith("whatsapp:") else from_num
    try:
        client = Client(cfg.twilio_account_sid, cfg.twilio_auth_token)
        msg = client.messages.create(from_=frm_wa, to=to_wa, body=message)
        return True, msg.sid
    except Exception as e:
        return False, str(e)


MC_BASE_URL = "https://whatsapp.messagecentral.com/whatsapp"

# Template "orm_alert" in MessageCentral must have these 6 body variables:
#   {{1}} = Risk level  (e.g. "HIGH RISK")
#   {{2}} = Account name
#   {{3}} = Platform    (e.g. "Instagram")
#   {{4}} = Negative count + pct  (e.g. "245 (65%)")
#   {{5}} = Total comments
#   {{6}} = Post URL / permalink

def _build_template_vars(neg: int, pos: int, neu: int, total: int,
                          account: str, platform: str, permalink: str) -> dict:
    neg_pct = round(neg * 100 / max(total, 1), 1)
    p_label = {"facebook": "Facebook", "instagram": "Instagram",
               "twitter": "Twitter/X", "youtube": "YouTube"}.get((platform or "").lower(), "Social")
    risk = ("HIGH RISK" if neg_pct > 40 else "MEDIUM RISK" if neg_pct > 25 else "WATCH")
    return {
        "body_1": risk,
        "body_2": account or "Unknown",
        "body_3": p_label,
        "body_4": f"{neg} ({neg_pct}%)",
        "body_5": str(total),
        "body_6": (permalink or "—")[:200],
    }

def _extract_phone_parts(phone: str) -> tuple[str, str]:
    """Split +91XXXXXXXXXX into (91, XXXXXXXXXX). Falls back to (91, raw)."""
    p = phone.strip().lstrip("+")
    if len(p) > 10 and p[:2] in ("91", "44", "1"):
        return p[:2], p[2:]
    if len(p) > 10 and p[:3] in ("971", "966", "974", "973"):
        return p[:3], p[3:]
    if len(p) == 10:
        return "91", p
    return "91", p


def _send_via_messagecentral(to: str, message: str, cfg: WhatsAppConfig,
                              template_vars: dict | None = None) -> tuple[bool, str]:
    mc_key = getattr(cfg, "mc_api_key", None)
    mc_pid = getattr(cfg, "mc_project_id", None)
    mc_tid = getattr(cfg, "mc_template_id", None) or "orm_alert"
    mc_cc  = getattr(cfg, "mc_country_code", None) or "91"

    if not mc_key:
        return False, "MessageCentral API key not configured"
    if not mc_pid:
        return False, ("MessageCentral Project ID not configured. "
                       "Connect your WhatsApp Business number at whatsapp.messagecentral.com "
                       "and paste the WA-XXXXXX project ID here.")

    cc, phone_num = _extract_phone_parts(to)

    # Build form data: template_id + country_code + phone_number + body variables
    form: dict[str, str] = {
        "template_id": mc_tid,
        "country_code": cc,
        "phone_number": phone_num,
    }

    if template_vars:
        for k, v in template_vars.items():
            form[k] = str(v)
    else:
        # Fallback: single-variable template — pass full message as body_1
        form["body_1"] = message[:1024]

    try:
        r = httpx.post(
            f"{MC_BASE_URL}/client/v1/broadcasts/single",
            headers={"X-Project-Id": mc_pid, "x-api-key": mc_key},
            data=form,
            timeout=30.0,
        )
        resp = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if r.status_code == 200 and resp.get("responseCode") in (2000, "2000"):
            msg_id = resp.get("data", {}).get("messageId", "")
            return True, msg_id
        err = resp.get("message") or resp.get("error") or r.text[:200]
        return False, f"MC error {r.status_code}: {err}"
    except Exception as e:
        return False, str(e)


def _send_whatsapp(to: str, message: str, cfg: WhatsAppConfig,
                   template_vars: dict | None = None) -> tuple[bool, str]:
    if cfg.channel == "messagecentral":
        return _send_via_messagecentral(to, message, cfg, template_vars)
    if cfg.channel == "twilio":
        return _send_via_twilio(to, message, cfg)
    return _send_via_openwa(to, message)


# ── Message builder ───────────────────────────────────────────────────────────

def _build_alert_message(post: Post, neg: int, pos: int, neu: int, total: int,
                          crisis_pct: float, reason: str = "auto",
                          client_name: str = "", platform: str = "") -> str:
    neg_pct = round(neg * 100 / max(total, 1), 1)
    pos_pct = round(pos * 100 / max(total, 1), 1)
    neu_pct = round(neu * 100 / max(total, 1), 1)
    content = (post.content or "").strip()
    # Derive a short post "name" from first sentence / line (max 70 chars)
    first_line = content.split("\n")[0].split(". ")[0]
    post_name  = (first_line[:67] + "…") if len(first_line) > 70 else first_line
    narrative  = content[:200].replace("\n", " ")
    link  = post.permalink or post.url or "—"
    ts    = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    risk  = ("🔴 *HIGH RISK*" if neg_pct > 40 else "🟡 *MEDIUM RISK*" if neg_pct > 25 else "🟢 *WATCH*")
    label = "⚠️ ORM ALERT — URGENT ACTION" if neg_pct > 40 else "⚠️ ORM ALERT — MONITOR CLOSELY"
    p_icon = {"facebook": "📘 Facebook", "instagram": "📸 Instagram",
              "twitter": "🐦 Twitter/X", "youtube": "▶️ YouTube"}.get((platform or "").lower(), "🌐 Social")
    account = client_name or post.author or "Unknown"

    return (
        f"*{label}*\n"
        f"{'━' * 30}\n\n"
        f"📌 *Account:* {account}\n"
        f"🌐 *Platform:* {p_icon}\n"
        f"📝 *Post:* {post_name}\n"
        f"🔗 *Link:* {link}\n"
        f"📅 *Date:* {post.published_at.strftime('%d %b %Y') if post.published_at else '—'}\n\n"
        f"💬 *COMMENT SENTIMENT — LIVE SCAN*\n"
        f"  🟢 Positive : {pos:>5}  ({pos_pct:.1f}%)\n"
        f"  🔴 Negative : {neg:>5}  ({neg_pct:.1f}%)\n"
        f"  ⚪ Neutral  : {neu:>5}  ({neu_pct:.1f}%)\n"
        f"  📊 Total    : {total:>5}  comments\n\n"
        f"⚡ *Risk Status:* {risk}\n"
        f"🎯 *Crisis Score:* {crisis_pct:.0f}%\n\n"
        f"⚠️ *Why this alert:* Negative comments ({neg}) are {'higher than' if neg > pos else 'equal to'} "
        f"positive comments ({pos}) — audience sentiment is turning negative. Immediate review recommended.\n\n"
        f"📄 *Post Preview:*\n"
        f"_{narrative}_\n\n"
        f"🕐 {ts}\n"
        f"👉 orm.brandthink.in/listening"
    )


# ── Alert check engine ────────────────────────────────────────────────────────

def _run_alert_check(db: Session, tenant_id: str, cfg: WhatsAppConfig,
                     batch_limit: int = 10) -> dict:
    """
    Scan all posts. Alert when negative comments >= positive comments
    AND total >= min_volume AND cooldown has passed.
    Sends at most `batch_limit` alerts per run (sorted worst neg_pct first).
    """
    if not cfg.enabled or not cfg.manager_phone:
        return {"checked": 0, "alerted": 0, "skipped": 0}

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=cfg.cooldown_minutes)
    try:
        watch_ids = json.loads(getattr(cfg, "alert_client_ids", None) or "[]")
    except Exception:
        watch_ids = []
    q = db.query(Post).filter(Post.tenant_id == tenant_id, Post.is_deleted == False)
    if watch_ids:
        q = q.filter(Post.client_id.in_(watch_ids))
    posts = q.all()

    # ── First pass: score all qualifying posts ────────────────────────────────
    candidates: list[dict] = []
    checked = skipped = 0
    for p in posts:
        rows = (db.query(CommentAnalysis.sentiment, func.count())
                .join(Comment, Comment.id == CommentAnalysis.comment_id)
                .filter(Comment.post_id == p.id)
                .group_by(CommentAnalysis.sentiment).all())
        counts = {s or "Unknown": c for s, c in rows}
        total = sum(counts.values())
        checked += 1

        if total < cfg.min_volume:
            continue

        neg = counts.get("Negative", 0)
        pos = counts.get("Positive", 0)
        neu = counts.get("Neutral", 0)

        if neg < pos:
            continue

        # Cooldown: skip if ANY alert (sent OR failed) was logged recently for this post
        # This prevents flooding when Twilio rate-limits: failed logs still block re-alerts
        recent = (db.query(AlertLog)
                  .filter(AlertLog.post_id == p.id,
                          AlertLog.tenant_id == tenant_id,
                          AlertLog.status.in_(["sent", "failed", "test"]),
                          AlertLog.sent_at >= cutoff)
                  .first())
        if recent:
            skipped += 1
            continue

        neg_pct = round(neg * 100 / max(total, 1), 2)
        candidates.append({"post": p, "neg": neg, "pos": pos, "neu": neu,
                           "total": total, "neg_pct": neg_pct})

    # Sort by neg_pct descending (worst first), cap at batch_limit
    candidates.sort(key=lambda x: x["neg_pct"], reverse=True)
    to_send = candidates[:batch_limit]

    # ── Second pass: send alerts for top candidates ───────────────────────────
    alerted = 0
    phones = _get_alert_phones(cfg)
    for c in to_send:
        p, neg, pos, neu, total = c["post"], c["neg"], c["pos"], c["neu"], c["total"]
        pa = db.query(PostAnalysis).filter(PostAnalysis.post_id == p.id).first()
        crisis_pct = float(pa.crisis_probability or 0) * 100 if pa else 5.0

        client_obj = db.query(Client).filter(Client.id == p.client_id).first() if p.client_id else None
        prof_obj   = db.query(SocialProfile).filter(SocialProfile.id == p.social_profile_id).first() if p.social_profile_id else None
        c_name     = client_obj.name if client_obj else (p.author or "")
        c_platform = prof_obj.platform if prof_obj else (p.source_kind or "")

        msg = _build_alert_message(p, neg, pos, neu, total, crisis_pct,
                                   client_name=c_name, platform=c_platform)
        tvars = _build_template_vars(neg, pos, neu, total, c_name, c_platform,
                                     p.permalink or p.url or "")
        any_ok = False
        for phone in phones:
            ok, err = _send_whatsapp(phone, msg, cfg, template_vars=tvars)
            log = AlertLog(
                tenant_id=tenant_id,
                post_id=p.id,
                alert_type="negative_gte_positive",
                neg_pct=c["neg_pct"],
                total_comments=total,
                message=msg,
                whatsapp_number=phone,
                status="sent" if ok else "failed",
                error=err if not ok else None,
                sent_at=datetime.now(timezone.utc),
            )
            db.add(log)
            if ok:
                any_ok = True
        if any_ok:
            alerted += 1

    db.commit()
    return {
        "checked": checked, "alerted": alerted, "skipped": skipped,
        "candidates": len(candidates), "batch_limit": batch_limit,
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConfigIn(BaseModel):
    manager_phone: str
    alert_phones: list[str] = []
    min_volume: int = 10
    cooldown_minutes: int = 60
    enabled: bool = True
    channel: str = "messagecentral"
    test_mode: bool = True
    # MessageCentral credentials
    mc_api_key: Optional[str] = None
    mc_project_id: Optional[str] = None
    mc_template_id: Optional[str] = "orm_alert"
    mc_country_code: Optional[str] = "91"
    # Twilio (legacy)
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_from_number: Optional[str] = None
    twilio_sandbox_number: Optional[str] = "+14155238886"
    sandbox_join_keyword: Optional[str] = None
    alert_client_ids: list[str] = []


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/config")
def get_config(current: CurrentUser = Depends(get_current_user),
               db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db, current.tenant_id)
    db.commit()
    try:
        alert_phones = json.loads(cfg.alert_phones or "[]")
    except Exception:
        alert_phones = []
    try:
        alert_client_ids = json.loads(getattr(cfg, "alert_client_ids", None) or "[]")
    except Exception:
        alert_client_ids = []
    return {
        "manager_phone": cfg.manager_phone,
        "alert_phones": alert_phones,
        "min_volume": cfg.min_volume,
        "cooldown_minutes": cfg.cooldown_minutes,
        "enabled": cfg.enabled,
        "channel": cfg.channel or "messagecentral",
        "test_mode": cfg.test_mode if cfg.test_mode is not None else True,
        # MessageCentral
        "mc_api_key": getattr(cfg, "mc_api_key", None) or "",
        "mc_project_id": getattr(cfg, "mc_project_id", None) or "",
        "mc_template_id": getattr(cfg, "mc_template_id", None) or "orm_alert",
        "mc_country_code": getattr(cfg, "mc_country_code", None) or "91",
        # Twilio (legacy)
        "twilio_account_sid": cfg.twilio_account_sid or "",
        "twilio_auth_token": cfg.twilio_auth_token or "",
        "twilio_from_number": cfg.twilio_from_number or "",
        "twilio_sandbox_number": cfg.twilio_sandbox_number or "+14155238886",
        "sandbox_join_keyword": cfg.sandbox_join_keyword or "",
        "alert_client_ids": alert_client_ids,
    }


@router.put("/config")
def update_config(body: ConfigIn,
                  current: CurrentUser = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db, current.tenant_id)
    cfg.manager_phone       = body.manager_phone
    cfg.alert_phones        = json.dumps([p for p in body.alert_phones if p])
    cfg.min_volume          = body.min_volume
    cfg.cooldown_minutes    = body.cooldown_minutes
    cfg.enabled             = body.enabled
    cfg.channel             = body.channel
    cfg.test_mode           = body.test_mode
    # MessageCentral
    if hasattr(cfg, "mc_api_key"):
        if body.mc_api_key is not None:
            cfg.mc_api_key = body.mc_api_key or None
        cfg.mc_project_id  = body.mc_project_id or None
        cfg.mc_template_id = body.mc_template_id or "orm_alert"
        cfg.mc_country_code = body.mc_country_code or "91"
    # Twilio (legacy)
    cfg.twilio_account_sid  = body.twilio_account_sid
    cfg.twilio_auth_token   = body.twilio_auth_token
    cfg.twilio_from_number  = body.twilio_from_number
    cfg.twilio_sandbox_number = body.twilio_sandbox_number or "+14155238886"
    if body.sandbox_join_keyword is not None:
        cfg.sandbox_join_keyword = body.sandbox_join_keyword.strip() or None
    if hasattr(cfg, "alert_client_ids"):
        cfg.alert_client_ids = json.dumps([i for i in body.alert_client_ids if i])
    db.commit()
    return {"ok": True}


@router.get("/wa-status")
def wa_status(current: CurrentUser = Depends(get_current_user)):  # noqa: ARG001
    try:
        r = httpx.get(f"{WA_SERVICE_URL}/status", headers=_wa_headers(), timeout=5.0)
        return r.json()
    except Exception as e:
        return {"status": "unreachable", "error": str(e), "connected": False}


@router.get("/twilio-status")
def twilio_status(current: CurrentUser = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    """Validate Twilio credentials and return live account info."""
    cfg = _get_or_create_config(db, current.tenant_id)
    if not cfg.twilio_account_sid or not cfg.twilio_auth_token:
        return {
            "ok": False, "error": "Credentials not configured",
            "account_status": None, "account_type": None, "friendly_name": None,
            "sandbox_active": False, "sandbox_join_code": None,
        }
    try:
        from twilio.rest import Client as TwilioClient
        client = TwilioClient(cfg.twilio_account_sid, cfg.twilio_auth_token)
        acct = client.api.accounts(cfg.twilio_account_sid).fetch()

        # Sandbox is considered active if Twilio credentials are valid and
        # the user has completed the sandbox wizard (stored join keyword).
        # Twilio doesn't expose a REST API to check sandbox activation status.
        sandbox_keyword = cfg.sandbox_join_keyword or None
        sandbox_active = acct.status == "active" and bool(cfg.test_mode)

        return {
            "ok": True,
            "account_status": acct.status,
            "account_type": acct.type,
            "friendly_name": acct.friendly_name,
            "sandbox_active": sandbox_active,
            "sandbox_join_code": sandbox_keyword,
            "sandbox_number": cfg.twilio_sandbox_number or "+14155238886",
            "test_mode": bool(cfg.test_mode),
        }
    except Exception as e:
        return {
            "ok": False, "error": str(e),
            "account_status": None, "account_type": None, "friendly_name": None,
            "sandbox_active": False, "sandbox_join_code": None,
        }


@router.get("/mc-status")
def mc_status(current: CurrentUser = Depends(get_current_user),
              db: Session = Depends(get_db)):
    """Validate MessageCentral API key by calling a lightweight endpoint."""
    cfg = _get_or_create_config(db, current.tenant_id)
    mc_key = getattr(cfg, "mc_api_key", None)
    mc_pid = getattr(cfg, "mc_project_id", None)

    if not mc_key:
        return {"ok": False, "error": "API key not configured", "has_project": False}

    # Validate key: if we have a project ID, list templates; otherwise just ping the API
    try:
        if mc_pid:
            r = httpx.get(
                f"{MC_BASE_URL}/client/v1/templates",
                headers={"x-api-key": mc_key, "X-Project-Id": mc_pid},
                timeout=8.0,
            )
        else:
            # Without a project ID, we ping a lightweight endpoint.
            # 401 means "authenticated but needs project" → key IS valid.
            r = httpx.get(
                f"{MC_BASE_URL}/client/v1/templates",
                headers={"x-api-key": mc_key},
                timeout=8.0,
            )

        # 200/404 = key good; 401 without project = key good (project needed)
        key_ok = r.status_code in (200, 404) or (r.status_code == 401 and not mc_pid)

        if key_ok:
            return {
                "ok": True,
                "has_project": bool(mc_pid),
                "project_id": mc_pid or "",
                "template_id": getattr(cfg, "mc_template_id", None) or "orm_alert",
            }
        return {"ok": False, "error": f"HTTP {r.status_code}: invalid API key", "has_project": bool(mc_pid)}
    except Exception as e:
        return {"ok": False, "error": str(e), "has_project": bool(mc_pid)}


@router.get("/qr")
def wa_qr(current: CurrentUser = Depends(get_current_user)):  # noqa: ARG001
    try:
        r = httpx.get(f"{WA_SERVICE_URL}/qr", headers=_wa_headers(), timeout=5.0)
        return r.json()
    except Exception as e:
        return {"qr": None, "status": "unreachable", "error": str(e)}


@router.post("/test")
def send_test(current: CurrentUser = Depends(get_current_user),
              db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db, current.tenant_id)
    if not cfg.manager_phone:
        raise HTTPException(400, "No manager phone configured")

    env_label = "TEST (Sandbox)" if cfg.test_mode else "LIVE (Production)"
    msg = (
        f"✅ *ORM Alert System — Test Message*\n"
        f"Environment: *{env_label}*  •  Channel: *{cfg.channel.upper()}*\n\n"
        "Your WhatsApp notifications are configured correctly.\n"
        "You will receive alerts when *negative comments ≥ positive comments*.\n\n"
        f"🕐 Sent: {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}"
    )
    phones = _get_alert_phones(cfg)
    if not phones:
        raise HTTPException(400, "No recipient phones configured")
    results = []
    for phone in phones:
        ok, err = _send_whatsapp(phone, msg, cfg)
        log = AlertLog(
            tenant_id=current.tenant_id,
            alert_type="test",
            message=msg,
            whatsapp_number=phone,
            status="test" if ok else "failed",
            error=err if not ok else None,
            sent_at=datetime.now(timezone.utc) if ok else None,
        )
        db.add(log)
        results.append({"phone": phone, "ok": ok, "err": err})
    db.commit()
    failed = [r for r in results if not r["ok"]]
    if len(failed) == len(results):
        err_msg = failed[0]["err"] or ""
        if "429" in err_msg or "daily messages limit" in err_msg.lower() or "exceeded" in err_msg.lower():
            raise HTTPException(429, f"Twilio daily limit reached (50 msg/day on trial). "
                                     f"Wait 24 hours or upgrade your Twilio plan.")
        if "Project ID not configured" in err_msg:
            raise HTTPException(422, err_msg)
        if "API key not configured" in err_msg:
            raise HTTPException(422, "MessageCentral API key not configured. Add it in WA Alerts settings.")
        raise HTTPException(503, f"Failed to send: {err_msg}")
    return {"ok": True, "message": f"Test sent to {len(results)} number(s)", "results": results}


@router.post("/restart-wa")
def restart_wa(current: CurrentUser = Depends(get_current_user)):  # noqa: ARG001
    """Tell the local WhatsApp service to clean session and reboot."""
    try:
        r = httpx.post(f"{WA_SERVICE_URL}/restart", headers=_wa_headers(), timeout=10.0)
        return r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/check")
def trigger_check(current: CurrentUser = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db, current.tenant_id)
    result = _run_alert_check(db, current.tenant_id, cfg)
    return result


@router.post("/send-post-alert/{post_id}")
def send_post_alert(post_id: str,
                    current: CurrentUser = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """Manually send a WhatsApp alert for a specific post."""
    cfg = _get_or_create_config(db, current.tenant_id)
    if not cfg.manager_phone:
        raise HTTPException(400, "No manager phone configured in WA Alerts settings")

    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Post not found")

    rows = (db.query(CommentAnalysis.sentiment, func.count())
            .join(Comment, Comment.id == CommentAnalysis.comment_id)
            .filter(Comment.post_id == post_id)
            .group_by(CommentAnalysis.sentiment).all())
    counts = {s or "Unknown": c for s, c in rows}
    total = sum(counts.values())
    neg   = counts.get("Negative", 0)
    pos   = counts.get("Positive", 0)
    neu   = counts.get("Neutral", 0)

    pa = db.query(PostAnalysis).filter(PostAnalysis.post_id == post_id).first()
    crisis_pct = float(pa.crisis_probability or 0) * 100 if pa else 5.0

    c_obj  = db.query(Client).filter(Client.id == p.client_id).first() if p.client_id else None
    pr_obj = db.query(SocialProfile).filter(SocialProfile.id == p.social_profile_id).first() if p.social_profile_id else None
    c_name = c_obj.name if c_obj else ""
    c_platform = pr_obj.platform if pr_obj else (p.source_kind or "")
    msg = _build_alert_message(p, neg, pos, neu, total, crisis_pct, reason="manual",
                               client_name=c_name, platform=c_platform)
    tvars = _build_template_vars(neg, pos, neu, total, c_name, c_platform,
                                 p.permalink or p.url or "")
    phones = _get_alert_phones(cfg)
    if not phones:
        phones = [cfg.manager_phone]
    neg_pct_val = round(neg * 100 / max(total, 1), 2)
    any_ok = False
    last_err = ""
    for phone in phones:
        ok, err = _send_whatsapp(phone, msg, cfg, template_vars=tvars)
        log = AlertLog(
            tenant_id=current.tenant_id,
            post_id=post_id,
            alert_type="manual",
            neg_pct=neg_pct_val,
            total_comments=total,
            message=msg,
            whatsapp_number=phone,
            status="sent" if ok else "failed",
            error=err if not ok else None,
            sent_at=datetime.now(timezone.utc) if ok else None,
        )
        db.add(log)
        if ok:
            any_ok = True
        else:
            last_err = err
    db.commit()

    if not any_ok:
        raise HTTPException(503, f"Failed to send: {last_err}")
    return {"ok": True, "neg": neg, "pos": pos, "total": total}


class DeleteLogsRequest(BaseModel):
    ids: list[str]


@router.delete("/logs")
def delete_logs(body: DeleteLogsRequest,
                current: CurrentUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    if not body.ids:
        return {"deleted": 0}
    deleted = (db.query(AlertLog)
               .filter(AlertLog.id.in_(body.ids),
                       AlertLog.tenant_id == current.tenant_id)
               .delete(synchronize_session=False))
    db.commit()
    return {"deleted": deleted}


@router.delete("/logs/all")
def delete_all_logs(current: CurrentUser = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    deleted = (db.query(AlertLog)
               .filter(AlertLog.tenant_id == current.tenant_id)
               .delete(synchronize_session=False))
    db.commit()
    return {"deleted": deleted}


@router.get("/logs")
def alert_logs(current: CurrentUser = Depends(get_current_user),
               db: Session = Depends(get_db),
               page: int = Query(1, ge=1),
               page_size: int = Query(20, ge=1, le=100)):
    q = (db.query(AlertLog)
         .filter(AlertLog.tenant_id == current.tenant_id,
                 AlertLog.is_deleted == False)
         .order_by(AlertLog.created_at.desc()))
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [{
            "id": i.id, "post_id": i.post_id, "alert_type": i.alert_type,
            "neg_pct": i.neg_pct, "total_comments": i.total_comments,
            "whatsapp_number": i.whatsapp_number, "status": i.status,
            "error": i.error, "sent_at": i.sent_at,
            "created_at": i.created_at, "message": i.message,
        } for i in items],
    }
