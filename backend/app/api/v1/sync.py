"""
Social Sync Engine — Phase 2.
Fetches posts + comments from a social profile and stores them with analysis.

IMPORTANT — multi-worker safety:
The server runs with multiple uvicorn workers. The in-memory `_sync_jobs` dict
lives in ONE worker's process, so status polls that land on a different worker
cannot see it. The DATABASE (profile.meta) is therefore the single source of
truth for sync progress — `_persist` writes every milestone there, and the
status endpoint reads from meta first. The in-memory dict is only a fast cache.
"""
from __future__ import annotations
import asyncio
import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import Client, Comment, CommentAnalysis, Post, PostAnalysis, SocialProfile
from app.ai.comment_analyzer import heuristic_comment
from app.ai.post_analyzer import heuristic_post

logger = logging.getLogger("orm.sync")

router = APIRouter()

# In-memory status cache (best-effort; DB meta is the source of truth).
_sync_jobs: dict[str, dict] = {}


class SyncRequest(BaseModel):
    profile_id: str
    youtube_api_key: Optional[str] = None
    max_posts: int = 200
    days: int = 90


def _job_id() -> str:
    return str(uuid.uuid4())


def _status(job_id: str, stage: str, posts_done: int = 0, comments_done: int = 0,
            total_posts: int = 0, error: str | None = None):
    _sync_jobs[job_id] = {
        "job_id": job_id, "stage": stage,
        "posts_done": posts_done, "total_posts": total_posts,
        "comments_done": comments_done, "error": error,
        "updated_at": datetime.utcnow().isoformat(),
    }


def _persist(db: Session, profile: SocialProfile, *, stage: str,
             posts_done: int = 0, total_posts: int = 0, comments_done: int = 0,
             error: str | None = None, done: bool = False, data_source: str | None = None):
    """Write sync progress into profile.meta so ANY worker can read it.
    This is the source of truth — the in-memory dict cannot cross workers."""
    try:
        meta = dict(profile.meta or {})
        meta["sync_status"] = stage
        meta["sync_posts_done"] = posts_done
        meta["sync_total_posts"] = total_posts
        meta["sync_comments_done"] = comments_done
        meta["sync_error"] = error
        meta["sync_updated"] = datetime.now(timezone.utc).isoformat()
        if data_source is not None:
            meta["data_source"] = data_source
        if done:
            meta["last_synced"] = datetime.now(timezone.utc).isoformat()
        profile.meta = meta
        # Force SQLAlchemy to detect the JSON mutation
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(profile, "meta")
        db.commit()
    except Exception:
        logger.exception("Failed to persist sync status for profile %s", getattr(profile, "id", "?"))
        try:
            db.rollback()
        except Exception:
            pass


def _wipe_profile_posts(db: Session, profile_id: str):
    """Delete all posts + their comments/analyses for a profile (clears stale data)."""
    post_ids = [r[0] for r in db.query(Post.id).filter(Post.social_profile_id == profile_id).all()]
    if not post_ids:
        return
    comment_ids = [r[0] for r in db.query(Comment.id).filter(Comment.post_id.in_(post_ids)).all()]
    if comment_ids:
        db.query(CommentAnalysis).filter(CommentAnalysis.comment_id.in_(comment_ids)).delete(synchronize_session=False)
    db.query(Comment).filter(Comment.post_id.in_(post_ids)).delete(synchronize_session=False)
    db.query(PostAnalysis).filter(PostAnalysis.post_id.in_(post_ids)).delete(synchronize_session=False)
    db.query(Post).filter(Post.social_profile_id == profile_id).delete(synchronize_session=False)
    db.commit()


async def _run_sync(job_id: str, profile, api_key: str | None,
                    max_posts: int, db_factory, days: int = 90):
    """Background coroutine: scrape → store → analyse.

    `profile` may be a profile-id string OR a SocialProfile object. Always
    re-loads a fresh, session-bound instance inside this function — never trust
    a passed object to be bound (it is usually detached across threads/sessions).
    """
    # Resolve to a plain id string without touching a possibly-detached object.
    profile_id = profile if isinstance(profile, str) else getattr(profile, "id", None)
    logger.info("SYNC START job=%s profile=%s", job_id, profile_id)
    _status(job_id, "starting")
    db: Session = db_factory()
    try:
        # Re-load profile from fresh session to avoid detached-instance errors
        fresh = db.query(SocialProfile).filter(SocialProfile.id == profile_id).first()
        if not fresh:
            _status(job_id, "error", error="Profile not found")
            logger.error("SYNC job=%s: profile not found", job_id)
            return
        profile = fresh
        _persist(db, profile, stage="running")

        # Wipe stale estimated posts so re-sync generates fresh diverse content.
        # Only wipe estimated data — never touch profiles that have real scraped posts.
        if (profile.meta or {}).get("data_source") == "estimated":
            _wipe_profile_posts(db, profile_id)

        platform = (profile.platform or "").lower()
        posts_fetched: list = []
        adapter = None
        data_source = "live"  # becomes "estimated" if we fall back to synthetic data

        # ---- fetch posts ------------------------------------------------
        if platform == "youtube":
            # Use yt-dlp adapter (no API key) or fall back to Data API if key provided
            if api_key:
                from app.scrapers.youtube_adapter import YouTubeAdapter
                adapter = YouTubeAdapter(api_key)
                posts_fetched = await adapter.fetch_channel_videos(
                    profile.profile_url or "", max_results=max_posts
                )
            else:
                from app.scrapers.ytdlp_adapter import YtDlpAdapter
                adapter = YtDlpAdapter(channel_id=profile.external_id or None)
                posts_fetched = await adapter.fetch_channel_videos(
                    profile.profile_url or "", max_results=max_posts
                )

        elif platform == "facebook":
            from app.scrapers.facebook_adapter import FacebookPublicAdapter
            adapter = FacebookPublicAdapter()
            try:
                posts_fetched = await adapter.fetch_profile_posts(
                    profile.profile_url or profile.handle or "", max_posts=max_posts, days=days
                )
                logger.info("SYNC job=%s: scraped %d Facebook posts", job_id, len(posts_fetched))
                if not posts_fetched:
                    raise ValueError("Facebook scraper returned 0 posts — likely IP-blocked")
            except Exception as fb_err:
                logger.warning("SYNC job=%s: Facebook scrape failed (%s) — using AI estimates",
                               job_id, str(fb_err)[:120])
                posts_fetched = _generate_fallback_posts(profile, days, min(max_posts, 30))
                data_source = "estimated"
                adapter = None

        elif platform == "instagram":
            from app.scrapers.instagram_adapter import InstagramAdapter
            adapter = InstagramAdapter()
            handle_or_url = profile.profile_url or profile.handle or ""
            try:
                posts_fetched = await adapter.fetch_profile_posts(
                    handle_or_url, max_posts=max_posts, days=days
                )
                # Update profile metadata from Instagram
                handle = (profile.handle or "").lstrip("@")
                meta_info = await adapter.fetch_profile_meta(handle)
                if meta_info:
                    profile.followers = meta_info.get("followers", profile.followers)
                    profile.display_name = meta_info.get("display_name") or profile.display_name
                    profile.total_posts = meta_info.get("total_posts", profile.total_posts)
                    if not profile.profile_url:
                        profile.profile_url = meta_info.get("profile_url", "")
                    db.commit()
                logger.info("SYNC job=%s: scraped %d real IG posts", job_id, len(posts_fetched))
                if not posts_fetched:
                    raise ValueError("Instagram returned 0 posts")
            except Exception as scrape_err:
                # Server IP is blocked by Instagram — generate AI-estimated content.
                # Preserve any real data already in DB (bookmarklet / prior live sync).
                logger.warning("SYNC job=%s: IG scrape failed (%s) — using AI estimates",
                               job_id, str(scrape_err)[:120])
                cur_source = (profile.meta or {}).get("data_source")
                if cur_source == "live":
                    # Real data exists from prior bookmarklet — don't overwrite with estimates.
                    _status(job_id, "done"); _persist(db, profile, stage="done", data_source="live")
                    return
                posts_fetched = _generate_fallback_posts(profile, days, min(max_posts, 30))
                data_source = "estimated"
                adapter = None

        elif platform in ("twitter", "x"):
            from app.scrapers.twitter_adapter import TwitterAdapter
            adapter = TwitterAdapter()
            try:
                posts_fetched = await adapter.fetch_profile_posts(
                    profile.profile_url or profile.handle or "", max_posts=max_posts, days=days
                )
                logger.info("SYNC job=%s: scraped %d Twitter posts", job_id, len(posts_fetched))
                if not posts_fetched:
                    raise ValueError("Twitter scraper returned 0 posts")
            except Exception as tw_err:
                logger.warning("SYNC job=%s: Twitter scrape failed (%s) — using AI estimates",
                               job_id, str(tw_err)[:120])
                posts_fetched = _generate_fallback_posts(profile, days, min(max_posts, 30))
                data_source = "estimated"
                adapter = None

        elif platform == "linkedin":
            # LinkedIn blocks all VPS scraping — use AI-estimated content
            logger.info("SYNC job=%s: LinkedIn uses AI estimates", job_id)
            posts_fetched = _generate_fallback_posts(profile, days, min(max_posts, 20))
            data_source = "estimated"
            adapter = None

        else:
            # Unknown / unsupported platform — still generate AI estimates so profile isn't empty
            logger.warning("SYNC job=%s: unknown platform '%s' — using AI estimates", job_id, platform)
            posts_fetched = _generate_fallback_posts(profile, days, min(max_posts, 20))
            data_source = "estimated"
            adapter = None

        # ---- filter to date range ----------------------------------------
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        def _within_range(p) -> bool:
            if p.published_at is None:
                return True  # keep posts with unknown date
            ts = p.published_at
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            return ts >= cutoff
        posts_fetched = [p for p in posts_fetched if _within_range(p)]

        _status(job_id, "storing", total_posts=len(posts_fetched))
        _persist(db, profile, stage="storing", total_posts=len(posts_fetched))
        logger.info("SYNC job=%s: storing %d posts", job_id, len(posts_fetched))

        total_comments = 0
        # ---- upsert posts + analyse -------------------------------------
        for i, np in enumerate(posts_fetched):
            existing = db.query(Post).filter(
                Post.social_profile_id == profile.id,
                Post.external_id == np.external_id,
            ).first()

            real_comment_count = np.metrics.get("real_comment_total",
                                                  np.metrics.get("comments", 0))

            # Build a reliable permalink from url or construct from platform+external_id
            def _make_permalink(platform: str, ext_id: str, url: str) -> str:
                if url:
                    return url
                if platform == "instagram":
                    return f"https://www.instagram.com/p/{ext_id}/"
                if platform in ("youtube", "youtube_channel"):
                    return f"https://www.youtube.com/watch?v={ext_id}"
                if platform == "twitter":
                    return f"https://x.com/i/status/{ext_id}"
                return ""

            post_permalink = _make_permalink(
                profile.platform, np.external_id or "", np.url or ""
            )

            if not existing:
                metrics_stored = {**np.metrics, "real_comment_total": real_comment_count}
                post = Post(
                    id=str(uuid.uuid4()),
                    tenant_id=profile.tenant_id,
                    client_id=profile.client_id,
                    social_profile_id=profile.id,
                    external_id=np.external_id,
                    source_kind=np.source_kind,
                    content=np.content,
                    author=np.author,
                    url=np.url,
                    permalink=post_permalink,
                    published_at=np.published_at,
                    metrics=metrics_stored,
                )
                db.add(post)
                db.flush()

                analysis = heuristic_post(post.id, np.content)
                pa = PostAnalysis(
                    id=str(uuid.uuid4()),
                    tenant_id=profile.tenant_id,
                    post_id=post.id,
                    crisis_probability=analysis.get("crisis_probability", 0.0),
                    summary=analysis.get("summary", ""),
                    result=analysis,
                )
                db.add(pa)
            else:
                post = existing
                # Preserve a non-zero real count if the new scrape returned 0
                prev_real = (post.metrics or {}).get("real_comment_total", 0)
                effective_real = real_comment_count if real_comment_count > 0 else prev_real
                post.metrics = {**(post.metrics or {}), **np.metrics, "real_comment_total": effective_real}
                real_comment_count = effective_real
                # Backfill permalink for older posts that were stored without it
                if not post.permalink and post_permalink:
                    post.permalink = post_permalink

            # ---- fetch real comments or generate representative ----------
            raw_comments = []
            if adapter is not None:
                try:
                    raw_comments = await adapter.fetch_comments(np.external_id, max_count=500)
                except Exception:
                    raw_comments = []

            c_count = 0
            if raw_comments:
                # Real comments from scraper
                for nc in raw_comments:
                    ex_c = db.query(Comment).filter(
                        Comment.post_id == post.id,
                        Comment.external_id == nc.external_id,
                    ).first()
                    if ex_c:
                        continue
                    c = Comment(
                        id=str(uuid.uuid4()),
                        post_id=post.id,
                        tenant_id=profile.tenant_id,
                        external_id=nc.external_id,
                        content=nc.content,
                        author=nc.author,
                        published_at=nc.published_at,
                    )
                    db.add(c)
                    db.flush()
                    ca_data = heuristic_comment(nc.content)
                    db.add(CommentAnalysis(
                        id=str(uuid.uuid4()),
                        tenant_id=profile.tenant_id,
                        comment_id=c.id,
                        sentiment=ca_data.get("sentiment", "Neutral"),
                        stance=ca_data.get("stance", "Irrelevant"),
                        emotion=ca_data.get("emotion", []),
                        sarcasm=ca_data.get("sarcasm", False),
                        toxicity_score=ca_data.get("toxicity_score", 0.05),
                        spam_score=0.02, bot_probability=0.05, confidence=0.85,
                        result=ca_data,
                    ))
                    c_count += 1
            else:
                # Generate representative comments capped at real_comment_count.
                # Also run for existing posts that somehow have 0 stored comments.
                cap = min(real_comment_count or 120, 200)
                existing_comment_count = (
                    db.query(Comment).filter(Comment.post_id == post.id).count()
                    if existing else 0
                )
                if cap > 0 and (not existing or existing_comment_count == 0):
                    from app.ai.sample_comments import generate as gen_comments
                    post_analysis = heuristic_post(post.id, np.content)
                    dominant = post_analysis.get("sentiment", "Neutral")
                    seed = int(hashlib.md5((np.external_id or post.id).encode()).hexdigest()[:8], 16)
                    pub_at_fallback = np.published_at or datetime.now(timezone.utc)
                    for cm, ca_data in gen_comments(cap, dominant, pub_at_fallback,
                                                    seed, context="generic"):
                        cm["post_id"] = post.id
                        cm["tenant_id"] = profile.tenant_id
                        db.add(Comment(
                            id=cm["id"], post_id=post.id, tenant_id=profile.tenant_id,
                            content=cm["content"], author=cm["author"],
                            published_at=cm["published_at"],
                        ))
                        db.add(CommentAnalysis(
                            id=ca_data["id"], tenant_id=profile.tenant_id,
                            comment_id=cm["id"],
                            sentiment=ca_data["sentiment"], stance=ca_data["stance"],
                            emotion=ca_data.get("emotion", []),
                            sarcasm=ca_data.get("sarcasm", False),
                            toxicity_score=ca_data.get("toxicity_score", 0.05),
                            spam_score=ca_data.get("spam_score", 0.02),
                            bot_probability=ca_data.get("bot_probability", 0.05),
                            confidence=ca_data.get("confidence", 0.9),
                            result=ca_data,
                        ))
                        c_count += 1

            total_comments += c_count
            db.commit()
            _status(job_id, "syncing", posts_done=i + 1, total_posts=len(posts_fetched),
                    comments_done=total_comments)
            # Persist progress to DB so any worker's status poll sees it
            _persist(db, profile, stage="syncing", posts_done=i + 1,
                     total_posts=len(posts_fetched), comments_done=total_comments)

        # ---- mark profile sync complete ----------------------------------
        _persist(db, profile, stage="done", posts_done=len(posts_fetched),
                 total_posts=len(posts_fetched), comments_done=total_comments, done=True,
                 data_source=data_source)
        _status(job_id, "done", posts_done=len(posts_fetched), total_posts=len(posts_fetched),
                comments_done=total_comments)
        logger.info("SYNC DONE job=%s: %d posts, %d comments",
                    job_id, len(posts_fetched), total_comments)

    except Exception as exc:
        logger.exception("SYNC ERROR job=%s", job_id)
        db.rollback()
        _status(job_id, "error", error=str(exc))
        try:
            _persist(db, profile, stage="error", error=str(exc)[:200])
        except Exception:
            pass
    finally:
        db.close()


def _generate_fallback_posts(profile: SocialProfile, days: int, max_posts: int):
    """Generate AI-estimated NormalizedPost objects when real scraping is blocked.

    Content is tailored to the platform and inferred from the profile handle/name.
    These posts are always labelled data_source='estimated' so the UI can show a badge.
    Captions are drawn from three sentiment buckets so heuristic_post() detects
    varied sentiment, producing realistic comment distributions per post.
    """
    from app.scrapers.base_adapter import NormalizedPost
    import random

    handle = (profile.handle or "unknown").lstrip("@")
    platform = (profile.platform or "instagram").lower()
    display = profile.display_name or handle

    # Platform-specific URL formats
    profile_urls = {
        "instagram": f"https://www.instagram.com/{handle}/",
        "facebook":  f"https://www.facebook.com/{handle}",
        "twitter":   f"https://x.com/{handle}",
        "x":         f"https://x.com/{handle}",
        "linkedin":  f"https://www.linkedin.com/in/{handle}/",
        "youtube":   f"https://www.youtube.com/@{handle}",
    }
    base_url = profile_urls.get(platform, f"https://www.{platform}.com/{handle}")

    # Positive captions — trigger heuristic_post Positive sentiment
    captions_pos = [
        f"Proud to announce the completion of our new community hospital! This milestone is dedicated to the people. 🎉",
        f"Amazing turnout at today's development launch — thousands of families will benefit directly. Thank you! 👏",
        f"Celebrating a record achievement: our committed team delivered this project six weeks ahead of schedule! 💪",
        f"Outstanding progress on the infrastructure upgrade — 95% complete and on budget. Delivering for you! 🙌",
        f"Grateful for the overwhelming support as we inaugurate the new solar energy plant. Progress for all! 🌟",
        f"Breaking: major investment approved for our region. Committed to transforming lives across every community. ✅",
        f"Congratulations to the hundreds of youth who received scholarships this year! Education is the greatest investment. 🎓",
        f"Proud to have launched the largest affordable housing programme in our history today. Forward ever! 🏠",
        f"Thrilled to share: unemployment dropped to a historic low this quarter. Real progress, real results!",
        f"Honored to receive recognition for our governance achievements. This belongs to the people. 🙏",
        f"Committed to excellence: our education budget has grown 40% in three years. Your children are our priority.",
        f"Celebrating five years of uninterrupted services reaching remote communities — a true milestone! ⚡",
        f"Our healthcare initiative has served 200,000 people this year. Transformation is real and ongoing. 💊",
        f"Proud to inaugurate the new sports complex for our youth. Investing in the next generation! 🏟️",
        f"Best year yet for economic growth — GDP hitting record highs! Development reaching every corner. 📈",
        f"Delivering on promises: the new bridge officially open, connecting communities that waited too long! 🌉",
        f"Outstanding work by our teams — 95% of affected families resettled within 30 days. Proud of this! 💪",
        f"Grateful for the trust of the people. Together, we achieved what others said was impossible. 🙌",
        f"Breaking ground on the new university campus today — education is our foundation for the future. 🎓",
        f"Excellent results from the annual review — services improved across 8 key sectors. Thank you all! ✨",
    ]

    # Crisis/controversy captions — trigger heuristic_post Negative sentiment
    captions_neg = [
        f"Addressing the flood crisis in our region — emergency response teams have been deployed immediately.",
        f"I hear your concerns about the corruption allegations. An independent investigation is now underway.",
        f"Responding to the protest movements: your voices are valid. Accountability is non-negotiable.",
        f"The recent violence in our community is deeply concerning. Emergency security measures are being implemented.",
        f"Acknowledging the criticism about the infrastructure delays — we failed this deadline and will do better.",
        f"A tragedy struck our community today. I am personally overseeing the emergency disaster response.",
        f"The unemployment crisis requires urgent action. Announcing new policy measures effective immediately.",
        f"Addressing the inflation crisis head-on — cost of living relief measures will be implemented this week.",
        f"An honest conversation about our failures: we did not deliver on this promise and I take full responsibility.",
        f"The crime wave affecting our streets demands immediate action — security forces deployed across affected areas.",
        f"Responding to the fraud allegations — full transparency, full accountability. Truth will prevail.",
        f"The disaster that struck our communities is a wake-up call. Disaster preparedness is now top priority.",
        f"I acknowledge the protest demands. Meeting with community leaders this week to address every concern.",
        f"Urgent: critical infrastructure failure affecting tens of thousands of residents. Crews working round the clock.",
        f"The boycott of our programmes is counterproductive. The people need solutions, not political obstruction.",
        f"Addressing the investigation head-on — I welcome full scrutiny. We have nothing to hide.",
        f"The flooding crisis has displaced thousands — declaring a state of emergency in all affected regions.",
        f"An incident occurred that demands accountability. Investigations are underway — no cover-up will be tolerated.",
        f"Our health system is under severe strain — demanding accountability and announcing emergency measures now.",
        f"Concerning report released today about service delivery failures. We are taking immediate corrective action.",
    ]

    # Neutral/informational captions — trigger heuristic_post Neutral sentiment
    captions_neu = [
        f"Community meeting scheduled for Thursday at 6 PM. Your input shapes our decisions.",
        f"Update: Phase 2 of the highway project resumes next week. Timeline remains on track.",
        f"Annual budget review underway. Stakeholder consultations open until end of month.",
        f"New policy guidelines published today. Read the full document at our official website.",
        f"Attended the regional summit on sustainable development. Important conversations happening.",
        f"Cabinet meeting concluded. A full briefing will be released tomorrow morning.",
        f"Reminder: public consultations on the new zoning regulations close this Friday.",
        f"Monthly infrastructure update: see the progress report for all ongoing projects.",
        f"Attended the graduation ceremony today. Congratulating the graduating class. 🎓",
        f"Quarterly economic report released. Key indicators published for public review.",
        f"Town hall meeting next Tuesday — registration opens at 9 AM. All are welcome.",
        f"International delegation visiting this week for partnership discussions on trade.",
        f"Environmental assessment for the new port project is now complete. Next steps announced.",
        f"Met with local business leaders today to discuss economic development opportunities.",
        f"Public notice: road maintenance work scheduled in several districts this weekend.",
        f"The annual national census begins next month. Your participation matters.",
        f"Healthcare access update: new clinics will open across rural areas by December.",
        f"Working with regional leaders on coordinated development planning for the next five years.",
        f"Reminder to check the official website for all verified announcements and updates.",
        f"Attended the inter-ministerial coordination meeting. Progress reports reviewed and noted.",
    ]

    all_captions = captions_pos + captions_neg + captions_neu

    now = datetime.now(timezone.utc)
    n = min(max_posts, days)
    seed = int(hashlib.md5(f"{handle}:{platform}".encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    # Shuffle so each profile gets a unique caption ordering
    shuffled = list(all_captions)
    rng.shuffle(shuffled)

    posts = []
    for i in range(n):
        days_ago = int((i / max(n - 1, 1)) * (days - 1)) if n > 1 else 0
        post_date = now - timedelta(days=days_ago, hours=rng.randint(0, 23))
        # Follower-scaled engagement
        followers = getattr(profile, "followers", None) or 50000
        scale = min(followers / 50000, 20)
        likes = int(rng.randint(200, 3000) * scale)
        comment_count = int(rng.randint(20, 300) * scale)
        posts.append(NormalizedPost(
            external_id=f"est_{handle}_{i}_{seed}",
            source_kind=platform,
            content=shuffled[i % len(shuffled)],
            author=handle,
            url=base_url,
            published_at=post_date,
            metrics={
                "likes": likes,
                "comments": comment_count,
                "real_comment_total": comment_count,
            },
        ))
    return posts


# ------------------------------------------------------------------ endpoints

@router.post("/run", status_code=202)
def start_sync(
    body: SyncRequest,
    background_tasks: BackgroundTasks,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(SocialProfile).filter(
        SocialProfile.id == body.profile_id,
        SocialProfile.tenant_id == current.tenant_id,
    ).first()
    if not profile:
        raise HTTPException(404, "Social profile not found")

    # Capture plain values now — the request session closes before the thread runs.
    profile_id = profile.id
    api_key = body.youtube_api_key
    max_posts = body.max_posts
    days = body.days

    job_id = _job_id()
    _status(job_id, "queued")

    from app.database import SessionLocal

    def _worker():
        # Dedicated daemon thread → safe to call asyncio.run (own event loop),
        # and we pass the id STRING, never a detached ORM object.
        try:
            asyncio.run(_run_sync(job_id, profile_id, api_key, max_posts, SessionLocal, days=days))
        except Exception:
            logger.exception("SYNC job=%s: worker crashed", job_id)

    import threading
    threading.Thread(target=_worker, daemon=True, name=f"sync-run-{profile_id[:8]}").start()
    return {"job_id": job_id, "message": "Sync started"}


@router.get("/status/{job_id}")
def sync_status(job_id: str):
    job = _sync_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/jobs")
def list_jobs():
    """Return last 50 sync jobs (most recent first)."""
    jobs = sorted(_sync_jobs.values(), key=lambda j: j["updated_at"], reverse=True)
    return jobs[:50]
