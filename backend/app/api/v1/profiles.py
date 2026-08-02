import asyncio
import hashlib
import logging
import random
import re as _re_clean


def _clean_text(text: str) -> str:
    """Strip lone Unicode surrogate characters that PostgreSQL's UTF-8 rejects."""
    if not text:
        return ""
    return _re_clean.sub(r"[\ud800-\udfff]", "", text)

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models import CommentAnalysis, Comment, Post, PostAnalysis, SocialProfile
from sqlalchemy import text as _sql_text
from app.schemas import ProfileIn, ProfileOut

logger = logging.getLogger("orm.ig_scrape")

router = APIRouter()


@router.get("", response_model=list[ProfileOut])
def list_profiles(current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db),
                  client_id: str | None = None, is_competitor: bool | None = None):
    q = db.query(SocialProfile).filter(SocialProfile.tenant_id == current.tenant_id,
                                       SocialProfile.is_deleted == False)
    if client_id:
        q = q.filter(SocialProfile.client_id == client_id)
    if is_competitor is not None:
        q = q.filter(SocialProfile.is_competitor == is_competitor)
    # Newest first so newly connected accounts appear at the top
    return q.order_by(SocialProfile.created_at.desc()).all()


@router.post("", response_model=ProfileOut)
def create_profile(body: ProfileIn,
                   current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
                   db: Session = Depends(get_db)):
    # Connecting an account just REGISTERS it. No auto-scrape / no fabricated data —
    # posts + comments are added per-link (extracted on request) or via sheet import.
    p = SocialProfile(tenant_id=current.tenant_id, **body.model_dump())
    db.add(p); db.commit(); db.refresh(p)
    return p


import logging as _logging
_sync_logger = _logging.getLogger("orm.sync")


def _sync_worker(profile_id: str):
    """Runs in a DEDICATED daemon thread (not Starlette's anyio threadpool).
    A fresh, fully-owned thread is the only reliable place to call asyncio.run():
    inside Starlette's managed threadpool, creating a new event loop conflicts
    with anyio and the coroutine silently never runs. Every step writes its state
    to the DB (profile.meta) so the multi-worker status endpoint can read it."""
    import asyncio
    from datetime import datetime, timezone
    from app.api.v1.sync import _run_sync, _job_id, _status
    from app.database import SessionLocal

    jid = _job_id()
    _status(jid, "queued")
    _sync_logger.info("SYNC THREAD spawned job=%s profile=%s", jid, profile_id)

    # Mark "running" in the DB before the heavy work starts.
    found = False
    db = SessionLocal()
    try:
        profile = db.query(SocialProfile).filter(SocialProfile.id == profile_id).first()
        if not profile:
            _sync_logger.error("SYNC job=%s: profile %s not found", jid, profile_id)
            return
        found = True
        profile.meta = {**(profile.meta or {}), "sync_job_id": jid, "sync_status": "running",
                        "sync_updated": datetime.now(timezone.utc).isoformat(),
                        "sync_error": None}
        db.commit()
    except Exception:
        _sync_logger.exception("SYNC job=%s: failed to mark running", jid)
        db.rollback()
    finally:
        db.close()

    if not found:
        return

    # Run the async sync engine in this thread's own event loop.
    # Pass the ID (a plain string) — never a detached ORM object across sessions.
    try:
        asyncio.run(_run_sync(jid, profile_id, None, 200, SessionLocal, days=90))
    except Exception as exc:
        _sync_logger.exception("SYNC job=%s: _run_sync crashed", jid)
        # Persist the failure so the UI shows it and offers Retry.
        db2 = SessionLocal()
        try:
            p = db2.query(SocialProfile).filter(SocialProfile.id == profile_id).first()
            if p:
                p.meta = {**(p.meta or {}), "sync_status": "error",
                          "sync_error": str(exc)[:200],
                          "sync_updated": datetime.now(timezone.utc).isoformat()}
                db2.commit()
        except Exception:
            db2.rollback()
        finally:
            db2.close()


def _trigger_sync(profile_id: str):
    """Spawn the sync in a dedicated daemon thread and return immediately."""
    import threading
    t = threading.Thread(target=_sync_worker, args=(profile_id,),
                         daemon=True, name=f"sync-{profile_id[:8]}")
    t.start()


@router.post("/{profile_id}/resync", status_code=202)
def resync_profile(profile_id: str,
                   background_tasks: BackgroundTasks,
                   current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
                   db: Session = Depends(get_db)):
    """Re-trigger the 90-day sync for a profile that failed or needs refreshing."""
    p = db.query(SocialProfile).filter(SocialProfile.id == profile_id,
                                       SocialProfile.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    if p.platform not in ("instagram", "youtube"):
        raise HTTPException(400, "Resync only available for Instagram and YouTube profiles")
    p.meta = {**(p.meta or {}), "sync_status": "pending", "sync_error": None}
    db.commit()
    background_tasks.add_task(_trigger_sync, p.id)
    return {"status": "queued", "profile_id": profile_id}


@router.get("/to-discover")
def profiles_to_discover(current: CurrentUser = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    """Work-list for the browser extension: Instagram/Facebook profiles that do NOT
    yet have real (live-scraped) data. The extension polls this, scrapes each one
    from the user's logged-in browser, then POSTs back via /ingest-scrape — which
    flips data_source to 'live' so the profile drops off this list.
    Defined BEFORE GET /{profile_id} so the literal path isn't captured as an id."""
    profs = (db.query(SocialProfile)
             .filter(SocialProfile.tenant_id == current.tenant_id,
                     SocialProfile.is_deleted == False,
                     SocialProfile.platform.in_(["instagram", "facebook"]))
             .order_by(SocialProfile.created_at.desc()).all())
    items = []
    for p in profs:
        meta = p.meta or {}
        if meta.get("data_source") != "live":
            items.append({"id": p.id, "handle": (p.handle or "").lstrip("@"),
                          "platform": p.platform, "profile_url": p.profile_url})
    return {"count": len(items), "items": items}


@router.get("/lookup")
def lookup_profile(handle: str, platform: str = "instagram",
                   current: CurrentUser = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    """Resolve a social handle to its profile id (used by the bookmarklet receiver).
    Defined BEFORE GET /{profile_id} so the literal path isn't captured as an id."""
    h = (handle or "").lstrip("@").lower()
    for p in (db.query(SocialProfile)
              .filter(SocialProfile.tenant_id == current.tenant_id,
                      SocialProfile.is_deleted == False,
                      SocialProfile.platform == platform).all()):
        if (p.handle or "").lstrip("@").lower() == h:
            return {"id": p.id, "handle": p.handle, "client_id": p.client_id}
    raise HTTPException(404, f"No {platform} profile connected for @{h}. Connect it first in Clients & Accounts.")


@router.get("/{profile_id}", response_model=ProfileOut)
def get_profile(profile_id: str, current: CurrentUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    p = db.query(SocialProfile).filter(SocialProfile.id == profile_id,
                                       SocialProfile.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    return p


@router.put("/{profile_id}", response_model=ProfileOut)
def update_profile(profile_id: str, body: ProfileIn,
                   current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
                   db: Session = Depends(get_db)):
    p = db.query(SocialProfile).filter(SocialProfile.id == profile_id,
                                       SocialProfile.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.commit(); db.refresh(p)
    return p


@router.delete("/{profile_id}")
def delete_profile(profile_id: str,
                   current: CurrentUser = Depends(require_roles("CROManager")),
                   db: Session = Depends(get_db)):
    p = db.query(SocialProfile).filter(SocialProfile.id == profile_id,
                                       SocialProfile.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    # Hard-delete: all child records first, then the profile row
    post_ids = [r[0] for r in db.query(Post.id).filter(Post.social_profile_id == profile_id).all()]
    if post_ids:
        ph = "('" + "','".join(post_ids) + "')"
        comment_ids = [r[0] for r in db.query(Comment.id).filter(Comment.post_id.in_(post_ids)).all()]
        if comment_ids:
            db.query(CommentAnalysis).filter(CommentAnalysis.comment_id.in_(comment_ids)).delete(synchronize_session=False)
        db.query(Comment).filter(Comment.post_id.in_(post_ids)).delete(synchronize_session=False)
        db.execute(_sql_text(f"DELETE FROM post_analysis WHERE post_id IN {ph}"))
        db.execute(_sql_text(f"DELETE FROM post_topics WHERE post_id IN {ph}"))
        db.execute(_sql_text(f"DELETE FROM tickets WHERE post_id IN {ph}"))
        db.execute(_sql_text(f"DELETE FROM alert_logs WHERE post_id IN {ph}"))
        db.query(Post).filter(Post.social_profile_id == profile_id).delete(synchronize_session=False)
    db.delete(p)
    db.commit()
    return {"status": "deleted"}


@router.get("/{profile_id}/sync-status")
def profile_sync_status(profile_id: str,
                         current: CurrentUser = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    """Return current sync status for a profile.

    Reads from profile.meta (the DB) as the SOURCE OF TRUTH — this is
    worker-independent. The server runs multiple uvicorn workers, so the
    in-memory _sync_jobs dict (which lives in only one worker) cannot be
    relied on. The sync engine persists every milestone to meta.
    """
    from datetime import datetime, timezone

    p = db.query(SocialProfile).filter(SocialProfile.id == profile_id,
                                        SocialProfile.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    meta = p.meta or {}
    db_status = meta.get("sync_status", "none")

    ACTIVE = {"pending", "running", "queued", "starting", "fallback", "storing", "syncing"}

    # Stale detection — worker-independent, based on the persisted timestamp.
    # If the sync claims to be active but hasn't written progress in 3+ minutes,
    # the background task died (worker restart, crash, etc.) → mark it failed.
    if db_status in ACTIVE:
        last_beat = meta.get("sync_updated")
        ref_time = None
        if last_beat:
            try:
                ref_time = datetime.fromisoformat(last_beat)
                if ref_time.tzinfo is None:
                    ref_time = ref_time.replace(tzinfo=timezone.utc)
            except Exception:
                ref_time = None
        if ref_time is None:
            # No heartbeat yet — fall back to profile creation time
            ref_time = p.created_at.replace(tzinfo=timezone.utc) if p.created_at else None
        if ref_time is not None:
            age = (datetime.now(timezone.utc) - ref_time).total_seconds()
            if age > 180:  # 3 minutes with no progress = dead task
                db_status = "error"
                p.meta = {**meta, "sync_status": "error",
                          "sync_error": "Sync stopped unexpectedly — click Retry to try again."}
                db.commit()
                meta = p.meta

    return {
        "profile_id": profile_id,
        "sync_status": db_status,
        "sync_job_id": meta.get("sync_job_id"),
        "posts_done": meta.get("sync_posts_done", 0),
        "total_posts": meta.get("sync_total_posts", 0),
        "comments_done": meta.get("sync_comments_done", 0),
        "error": meta.get("sync_error"),
    }


@router.get("/{profile_id}/summary")
def profile_summary(profile_id: str, current: CurrentUser = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """Post count + aggregate comment sentiment for one mapped account.

    Sentiment is scaled per post to each post's REAL comment total
    (metrics.real_comment_total) — the scraper only analyses a representative
    sample of each post's (often thousands of) comments, so the totals shown
    reflect the true live comment volume, not just the sampled subset."""
    posts = db.query(Post.id, Post.metrics).filter(
        Post.tenant_id == current.tenant_id,
        Post.social_profile_id == profile_id,
        Post.is_deleted == False).all()
    post_ids = [p[0] for p in posts]
    # Sample sentiment counts grouped per post
    sample: dict[str, dict] = {}
    if post_ids:
        rows = (db.query(Comment.post_id, CommentAnalysis.sentiment, func.count())
                .join(Comment, Comment.id == CommentAnalysis.comment_id)
                .filter(Comment.post_id.in_(post_ids))
                .group_by(Comment.post_id, CommentAnalysis.sentiment).all())
        for pid_, sent, cnt in rows:
            sample.setdefault(pid_, {})[sent or "Neutral"] = cnt

    # Global sentiment ratio across ALL sampled comments — used as the fallback for
    # posts where we have a real comment total but no sampled comments, so their
    # volume follows the observed sentiment mix instead of skewing everything Neutral.
    gp = gn = gu = 0
    for a in sample.values():
        gp += a.get("Positive", 0); gn += a.get("Negative", 0); gu += a.get("Neutral", 0)
    gtot = gp + gn + gu
    gratio = ({"Positive": gp / gtot, "Negative": gn / gtot, "Neutral": gu / gtot}
              if gtot else {"Positive": 0, "Negative": 0, "Neutral": 1})

    counts = {"Positive": 0, "Negative": 0, "Neutral": 0}
    for pid_, metrics in posts:
        actual = sample.get(pid_, {})
        at = sum(actual.values())
        m = metrics or {}
        # Accept both key names written by different ingestion paths
        rt = int(m.get("real_comment_total") or m.get("comments") or 0)
        if rt and rt > at:
            # Use actual sample ratio; fall back to global ratio only when we
            # have ZERO analyzed comments for this post (true unknown).
            ratio = ({k: actual.get(k, 0) / at for k in counts} if at else gratio)
            for k in counts:
                counts[k] += int(round(ratio[k] * rt))
        else:
            for k in counts:
                counts[k] += actual.get(k, 0)
    total = sum(counts.values()) or 1
    return {"profile_id": profile_id, "posts": len(post_ids),
            "counts": counts,
            "percentages": {k: round(v * 100 / total, 1) for k, v in counts.items()},
            "total_comments": sum(counts.values())}


# ── Browser-extension real-data ingest ──────────────────────────────────────

from pydantic import BaseModel
from datetime import datetime as _dt


class _ScrapedComment(BaseModel):
    author: str | None = None
    text: str
    published_at: _dt | None = None


class _ScrapedPost(BaseModel):
    external_id: str                       # Instagram shortcode / FB post id
    url: str
    caption: str | None = ""
    published_at: _dt | None = None
    comment_count: int | None = 0          # REAL live comment count on the post
    likes: int | None = 0
    comments: list[_ScrapedComment] = []   # a sampled subset for sentiment


class _IngestScrapeIn(BaseModel):
    posts: list[_ScrapedPost] = []
    replace: bool = True                   # wipe estimated data first


@router.post("/{profile_id}/ingest-scrape")
def ingest_scrape(profile_id: str, body: _IngestScrapeIn,
                  current: CurrentUser = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    """Receive REAL posts + sampled comments scraped by the browser extension from
    the user's own logged-in session, and replace the profile's estimated data with
    them. Flips meta.data_source to 'live'."""
    import uuid as _uuid
    from datetime import timezone as _tz
    from app.ai.comment_analyzer import heuristic_comment
    from app.ai.post_analyzer import heuristic_post

    p = db.query(SocialProfile).filter(SocialProfile.id == profile_id,
                                       SocialProfile.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Profile not found")

    # ── wipe existing (estimated) posts + children for a clean real set ──────────
    if body.replace:
        old_post_ids = [r[0] for r in db.query(Post.id)
                        .filter(Post.social_profile_id == profile_id).all()]
        if old_post_ids:
            old_comment_ids = [r[0] for r in db.query(Comment.id)
                               .filter(Comment.post_id.in_(old_post_ids)).all()]
            if old_comment_ids:
                db.query(CommentAnalysis).filter(
                    CommentAnalysis.comment_id.in_(old_comment_ids)).delete(synchronize_session=False)
            db.query(Comment).filter(Comment.post_id.in_(old_post_ids)).delete(synchronize_session=False)
            ph = "('" + "','".join(old_post_ids) + "')"
            db.execute(_sql_text(f"DELETE FROM post_analysis WHERE post_id IN {ph}"))
            db.execute(_sql_text(f"DELETE FROM post_topics WHERE post_id IN {ph}"))
            db.query(Post).filter(Post.social_profile_id == profile_id).delete(synchronize_session=False)
        db.commit()

    posts_added = 0
    comments_added = 0
    for sp in body.posts:
        pub = sp.published_at
        if pub is not None and pub.tzinfo is None:
            pub = pub.replace(tzinfo=_tz.utc)
        real_total = sp.comment_count or len(sp.comments)

        # Upsert by (profile, external_id) — re-sending the same post UPDATES it
        # instead of creating a duplicate (safe for replace:false single-post adds).
        post = (db.query(Post)
                .filter(Post.social_profile_id == p.id, Post.external_id == sp.external_id)
                .first())
        if post:
            post.content = sp.caption or post.content
            post.url = sp.url; post.permalink = sp.url; post.published_at = pub
            post.metrics = {"likes": sp.likes or 0, "comments": real_total,
                            "real_comment_total": real_total, "scraped": True}
            # wipe this post's existing comments so we re-store the fresh set
            ex_cids = [r[0] for r in db.query(Comment.id).filter(Comment.post_id == post.id).all()]
            if ex_cids:
                db.query(CommentAnalysis).filter(CommentAnalysis.comment_id.in_(ex_cids)).delete(synchronize_session=False)
                db.query(Comment).filter(Comment.id.in_(ex_cids)).delete(synchronize_session=False)
            db.flush()
        else:
            post = Post(
                id=str(_uuid.uuid4()), tenant_id=p.tenant_id, client_id=p.client_id,
                social_profile_id=p.id, external_id=sp.external_id, source_kind=p.platform,
                content=sp.caption or "", author=(p.handle or "").lstrip("@"),
                url=sp.url, permalink=sp.url, published_at=pub,
                metrics={"likes": sp.likes or 0, "comments": real_total,
                         "real_comment_total": real_total, "scraped": True},
            )
            db.add(post); db.flush()
            pa = heuristic_post(post.id, sp.caption or "")
            db.add(PostAnalysis(id=str(_uuid.uuid4()), tenant_id=p.tenant_id, post_id=post.id,
                                crisis_probability=pa.get("crisis_probability", 0.0),
                                summary=pa.get("summary", ""), result=pa))
        for i, c in enumerate(sp.comments):
            if not (c.text or "").strip():
                continue
            cpub = c.published_at
            if cpub is not None and cpub.tzinfo is None:
                cpub = cpub.replace(tzinfo=_tz.utc)
            clean = _clean_text(c.text or "")
            if not clean:
                continue
            cm = Comment(id=str(_uuid.uuid4()), tenant_id=p.tenant_id, post_id=post.id,
                         external_id=f"{sp.external_id}-real-{i}",
                         author=_clean_text(c.author or f"user_{i}"), content=clean,
                         published_at=cpub or pub)
            db.add(cm); db.flush()
            ca = heuristic_comment(clean)
            db.add(CommentAnalysis(id=str(_uuid.uuid4()), tenant_id=p.tenant_id, comment_id=cm.id,
                                   sentiment=ca["sentiment"], stance=ca["stance"],
                                   emotion=ca.get("emotion", []), sarcasm=ca.get("sarcasm", False),
                                   toxicity_score=ca.get("toxicity_score", 0.05),
                                   spam_score=ca.get("spam_score", 0.02),
                                   bot_probability=ca.get("bot_probability", 0.05),
                                   confidence=ca.get("confidence", 0.9),
                                   result={**ca, "source": "scraped"}))
            comments_added += 1
        posts_added += 1
        db.commit()

    # mark profile as having LIVE data
    p.meta = {**(p.meta or {}), "sync_status": "done", "data_source": "live",
              "sync_total_posts": posts_added, "sync_posts_done": posts_added,
              "last_synced": _dt.utcnow().isoformat()}
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(p, "meta")
    db.commit()
    return {"ok": True, "posts": posts_added, "comments": comments_added, "data_source": "live"}


# ─── Server-side Instagram comment scraper ────────────────────────────────────

_IG_HEADERS = {
    "X-IG-App-ID": "936619743392459",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    ),
}

# In-memory job progress (keyed by job_id); DB meta is the fallback.
_ig_jobs: dict[str, dict] = {}


class _IgPostUrlRequest(BaseModel):
    url: str          # instagram.com/p/CODE/ or /reel/CODE/
    # session_id removed — server reads from admin-configured file/env


@router.post("/{profile_id}/sync-ig-post-url")
def sync_ig_post_url(
    profile_id: str,
    body: _IgPostUrlRequest,
    background_tasks: BackgroundTasks,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch ALL comments for a single Instagram post by URL.
    Session credential is read from the admin-configured server session — no user input needed."""
    import re, uuid as _uuid
    from app.scrapers.instagram_adapter import _load_ig_config
    import os as _os

    m = re.search(r"instagram\.com/(?:p|reel)/([A-Za-z0-9_-]+)", body.url)
    if not m:
        raise HTTPException(400, "Not a valid Instagram post URL (expected instagram.com/p/CODE/)")
    shortcode = m.group(1)

    # Read session from server config — never from the request body
    cfg = _load_ig_config()
    session_id = cfg.get("session_id") or _os.environ.get("INSTAGRAM_SESSION_ID", "")
    if not session_id:
        raise HTTPException(
            400,
            "No Instagram session configured on this server. "
            "Go to Admin → Instagram Session and save your sessionid cookie.",
        )

    post = db.query(Post).filter(
        Post.social_profile_id == profile_id,
        Post.tenant_id == current.tenant_id,
        Post.external_id == shortcode,
    ).first()
    if not post:
        raise HTTPException(404, f"Post /{shortcode}/ is not in ORM yet. Use Analyze URL first.")

    real_total = (post.metrics or {}).get("real_comment_total", 0)
    job_id = _uuid.uuid4().hex[:10]
    _ig_jobs[job_id] = {
        "job_id": job_id, "stage": "queued",
        "posts_done": 0, "total_posts": 1,
        "comments_added": 0, "error": None,
        "updated_at": _dt.utcnow().isoformat(),
    }
    background_tasks.add_task(
        _run_ig_scrape,
        job_id=job_id, tenant_id=current.tenant_id,
        post_info=[(post.id, shortcode, real_total)],
        session_id=session_id, max_per_post=0,
    )
    return {"job_id": job_id, "shortcode": shortcode, "real_total": real_total}


def _run_ig_scrape(
    job_id: str, tenant_id: str,
    post_info: list[tuple[str, str, int]],
    session_id: str, max_per_post: int,
):
    """Synchronous background function — runs in a FastAPI thread-pool worker."""
    import asyncio as _asyncio
    _asyncio.run(_async_ig_scrape(job_id, tenant_id, post_info, session_id, max_per_post))


def _get_stored_count(post_id: str) -> int:
    db = SessionLocal()
    try:
        return db.query(func.count(Comment.id)).filter(Comment.post_id == post_id).scalar() or 0
    finally:
        db.close()


async def _async_ig_scrape(
    job_id: str, tenant_id: str,
    post_info: list[tuple[str, str, int]],
    session_id: str, max_per_post: int,
):
    from app.ai.comment_analyzer import heuristic_comment

    # Highest real comment count first — immediate visible progress on big posts
    post_info = sorted(post_info, key=lambda x: x[2], reverse=True)

    cookies = {"sessionid": session_id}
    total_added = 0

    async with httpx.AsyncClient(headers=_IG_HEADERS, cookies=cookies,
                                 timeout=30.0, follow_redirects=True) as client:
        for idx, (post_id, shortcode, real_total) in enumerate(post_info):
            _ig_jobs[job_id].update({
                "stage": f"post {idx+1}/{len(post_info)}: @{shortcode}",
                "posts_done": idx,
                "comments_added": total_added,
                "updated_at": _dt.utcnow().isoformat(),
            })

            # Skip posts we already have fully scraped
            already = _get_stored_count(post_id)
            if real_total > 0 and already >= real_total:
                _ig_jobs[job_id]["posts_done"] = idx + 1
                continue

            try:
                # Get media PK from shortcode
                info_r = await client.get(
                    f"https://www.instagram.com/api/v1/media/shortcode/{shortcode}/info/"
                )
                if info_r.status_code in (401, 403):
                    _ig_jobs[job_id].update({
                        "stage": "error",
                        "error": "Session expired or invalid. Get a fresh sessionid cookie from instagram.com and try again.",
                    })
                    return
                if not info_r.is_success:
                    await asyncio.sleep(2)
                    continue

                items = info_r.json().get("items") or []
                if not items:
                    continue
                pk = str(items[0].get("pk") or "")
                if not pk:
                    continue

                # Paginate comments and store EACH PAGE immediately
                # so the dashboard shows live counts without waiting for post to finish.
                min_id = ""
                retries = 0
                page_num = 0
                post_added = 0

                while True:
                    url = (
                        f"https://www.instagram.com/api/v1/media/{pk}/comments/"
                        f"?can_support_threading=true&permalink_enabled=false"
                        + (f"&min_id={min_id}" if min_id else "")
                    )
                    try:
                        cr = await client.get(url)
                    except Exception:
                        await asyncio.sleep(5)
                        continue

                    if cr.status_code == 429:
                        retries += 1
                        if retries >= 5:
                            break
                        wait = 90 * retries
                        logger.info(f"IG 429 on {shortcode}, waiting {wait}s (retry {retries})")
                        _ig_jobs[job_id]["stage"] = (
                            f"rate-limited — waiting {wait}s (post {idx+1}/{len(post_info)})"
                        )
                        await asyncio.sleep(wait)
                        continue
                    if cr.status_code in (401, 403):
                        _ig_jobs[job_id].update({
                            "stage": "error",
                            "error": "Session cookie expired mid-run. Re-enter a fresh cookie.",
                        })
                        return
                    if not cr.is_success:
                        break

                    data = cr.json()
                    page_comments = [
                        {
                            "author": (c.get("user") or {}).get("username") or "instagram_user",
                            "text": (c.get("text") or "")[:500],
                            "published_at": c.get("created_at"),
                        }
                        for c in (data.get("comments") or []) if c.get("text")
                    ]

                    if not page_comments:
                        break

                    # Store this page right away — visible in dashboard immediately
                    added = _store_comments(
                        tenant_id=tenant_id,
                        post_id=post_id,
                        post_external_id=shortcode,
                        raw_comments=page_comments,
                        real_total=real_total,
                        heuristic_fn=heuristic_comment,
                    )
                    post_added += added
                    total_added += added

                    retries = 0
                    page_num += 1
                    min_id = data.get("next_min_id") or ""

                    # Live progress update every page
                    _ig_jobs[job_id].update({
                        "stage": f"post {idx+1}/{len(post_info)}: @{shortcode} (page {page_num})",
                        "comments_added": total_added,
                        "updated_at": _dt.utcnow().isoformat(),
                    })

                    if not min_id:
                        break
                    if max_per_post and (already + post_added) >= max_per_post:
                        break

                    # Faster between pages — 0.3-0.6s
                    await asyncio.sleep(random.uniform(0.3, 0.6))

                _ig_jobs[job_id].update({
                    "posts_done": idx + 1,
                    "comments_added": total_added,
                    "updated_at": _dt.utcnow().isoformat(),
                })

            except Exception as e:
                logger.warning(f"IG scrape error on {shortcode}: {e}")
                await asyncio.sleep(2)
                continue

            # Short pause between posts — 1-2s
            await asyncio.sleep(random.uniform(1.0, 2.0))

    _ig_jobs[job_id].update({
        "stage": "done",
        "posts_done": len(post_info),
        "comments_added": total_added,
        "updated_at": _dt.utcnow().isoformat(),
    })


def _store_comments(
    tenant_id: str, post_id: str, post_external_id: str,
    raw_comments: list[dict], real_total: int, heuristic_fn,
) -> int:
    """Insert new comments (deduped by content hash) into the DB. Returns count added."""
    import uuid as _uuid
    from datetime import timezone as _tz
    db = SessionLocal()
    try:
        existing = {
            c.external_id
            for c in db.query(Comment.external_id)
              .filter(Comment.post_id == post_id).all()
        }
        added = 0
        for c in raw_comments:
            text = (c.get("text") or "").strip()
            if not text:
                continue
            raw = ((c.get("author") or "") + text[:80]).encode()
            ext_id = f"{post_external_id}-srv-{hashlib.sha256(raw).hexdigest()[:16]}"
            if ext_id in existing:
                continue
            existing.add(ext_id)

            pub_raw = c.get("published_at")
            pub = None
            if pub_raw:
                try:
                    pub = _dt.fromtimestamp(float(pub_raw), tz=_tz.utc)
                except Exception:
                    pass

            cm = Comment(
                id=str(_uuid.uuid4()), tenant_id=tenant_id, post_id=post_id,
                external_id=ext_id, author=c.get("author") or "instagram_user",
                content=text, language="en", published_at=pub,
            )
            db.add(cm)
            db.flush()

            ca = heuristic_fn(text)
            db.add(CommentAnalysis(
                id=str(_uuid.uuid4()), tenant_id=tenant_id, comment_id=cm.id,
                sentiment=ca["sentiment"], stance=ca["stance"],
                emotion=ca.get("emotion", []), sarcasm=ca.get("sarcasm", False),
                toxicity_score=ca.get("toxicity_score", 0.05),
                spam_score=ca.get("spam_score", 0.02),
                bot_probability=ca.get("bot_probability", 0.05),
                confidence=ca.get("confidence", 0.9),
                result={**ca, "source": "server-scraped"},
            ))
            added += 1
            if added % 100 == 0:
                db.commit()

        # Update real total on post
        if real_total:
            post = db.query(Post).filter(Post.id == post_id).first()
            if post:
                m = dict(post.metrics or {})
                m["real_comment_total"] = max(real_total, m.get("real_comment_total", 0))
                m["scraped"] = True
                post.metrics = m
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(post, "metrics")

        db.commit()
        return added
    except Exception as e:
        db.rollback()
        logger.error(f"DB error storing comments: {e}")
        return 0
    finally:
        db.close()
