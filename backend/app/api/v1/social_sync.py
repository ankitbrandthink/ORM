"""Social Sync management API — lists profiles, triggers sync, returns per-post stats.

All data comes from the existing DB tables (social_profiles, posts, comments, etc.)
No external API keys required — uses yt-dlp for YouTube, mbasic scraper for Facebook.
"""
from __future__ import annotations

import asyncio
import logging
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import Client, Comment, CommentAnalysis, Post, PostAnalysis, SocialProfile

logger = logging.getLogger("orm.social_sync")
router = APIRouter()


# ── helpers ─────────────────────────────────────────────────────────────────

def _profile_status(profile: SocialProfile) -> dict:
    meta = profile.meta or {}
    return {
        "id": profile.id,
        "client_id": profile.client_id,
        "platform": profile.platform,
        "handle": profile.handle,
        "display_name": profile.display_name,
        "profile_url": profile.profile_url,
        "external_id": profile.external_id,
        "followers": profile.followers,
        "sync_status": meta.get("sync_status", "idle"),
        "sync_stage": meta.get("sync_status", "idle"),
        "sync_posts_done": meta.get("sync_posts_done", 0),
        "sync_total_posts": meta.get("sync_total_posts", 0),
        "sync_comments_done": meta.get("sync_comments_done", 0),
        "sync_error": meta.get("sync_error"),
        "last_synced": meta.get("last_synced"),
        "data_source": meta.get("data_source", "pending"),
    }


# ── endpoints ────────────────────────────────────────────────────────────────

@router.get("/profiles")
def list_sync_profiles(
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all social profiles with their sync status and post/comment counts."""
    profiles = (
        db.query(SocialProfile)
        .filter(SocialProfile.tenant_id == current.tenant_id,
                SocialProfile.is_deleted == False)
        .order_by(SocialProfile.platform, SocialProfile.display_name)
        .all()
    )

    result = []
    for p in profiles:
        row = _profile_status(p)
        # Post + comment counts
        row["post_count"] = (
            db.query(func.count(Post.id))
            .filter(Post.social_profile_id == p.id)
            .scalar() or 0
        )
        row["comment_count"] = (
            db.query(func.count(Comment.id))
            .join(Post, Post.id == Comment.post_id)
            .filter(Post.social_profile_id == p.id)
            .scalar() or 0
        )
        # Client name
        if p.client_id:
            c = db.query(Client).filter(Client.id == p.client_id).first()
            row["client_name"] = c.name if c else None
        else:
            row["client_name"] = None
        result.append(row)
    return result


@router.get("/profiles/{profile_id}/status")
def profile_sync_status(
    profile_id: str,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.query(SocialProfile).filter(
        SocialProfile.id == profile_id,
        SocialProfile.tenant_id == current.tenant_id,
    ).first()
    if not p:
        raise HTTPException(404, "Profile not found")
    row = _profile_status(p)
    row["post_count"] = (
        db.query(func.count(Post.id))
        .filter(Post.social_profile_id == profile_id)
        .scalar() or 0
    )
    row["comment_count"] = (
        db.query(func.count(Comment.id))
        .join(Post, Post.id == Comment.post_id)
        .filter(Post.social_profile_id == profile_id)
        .scalar() or 0
    )
    return row


class TriggerRequest(BaseModel):
    max_posts: int = 30
    days: int = 90
    youtube_api_key: Optional[str] = None


@router.post("/profiles/{profile_id}/sync")
def trigger_sync(
    profile_id: str,
    body: TriggerRequest,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger a background sync for a social profile."""
    p = db.query(SocialProfile).filter(
        SocialProfile.id == profile_id,
        SocialProfile.tenant_id == current.tenant_id,
    ).first()
    if not p:
        raise HTTPException(404, "Profile not found")

    # Import the core sync runner from sync.py
    from app.api.v1.sync import _run_sync, _job_id, _status
    from app.database import SessionLocal

    job_id = _job_id()
    _status(job_id, "queued")

    def _worker():
        try:
            asyncio.run(_run_sync(
                job_id, profile_id,
                body.youtube_api_key, body.max_posts, SessionLocal, days=body.days
            ))
        except Exception:
            logger.exception("social_sync worker crash job=%s", job_id)

    threading.Thread(target=_worker, daemon=True, name=f"ssync-{profile_id[:8]}").start()
    return {"job_id": job_id, "profile_id": profile_id, "status": "started"}


@router.get("/profiles/{profile_id}/posts")
def profile_posts(
    profile_id: str,
    limit: int = 20,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return posts for a profile with per-post comment analysis summary."""
    p = db.query(SocialProfile).filter(
        SocialProfile.id == profile_id,
        SocialProfile.tenant_id == current.tenant_id,
    ).first()
    if not p:
        raise HTTPException(404, "Profile not found")

    posts = (
        db.query(Post)
        .filter(Post.social_profile_id == profile_id)
        .order_by(Post.published_at.desc())
        .limit(limit)
        .all()
    )

    result = []
    for post in posts:
        # Comment sentiment breakdown for this post
        ca_rows = (
            db.query(CommentAnalysis.sentiment, func.count())
            .join(Comment, Comment.id == CommentAnalysis.comment_id)
            .filter(Comment.post_id == post.id)
            .group_by(CommentAnalysis.sentiment)
            .all()
        )
        sentiment_map = {s or "Neutral": c for s, c in ca_rows}
        total_analyzed = sum(sentiment_map.values())
        real_total = (post.metrics or {}).get("real_comment_total", 0)

        # Dominant sentiment
        dominant = "Neutral"
        if sentiment_map:
            dominant = max(sentiment_map, key=lambda k: sentiment_map[k])

        # Post analysis summary
        pa = db.query(PostAnalysis).filter(PostAnalysis.post_id == post.id).first()

        result.append({
            "id": post.id,
            "external_id": post.external_id,
            "url": post.url,
            "content": post.content,
            "published_at": post.published_at.isoformat() if post.published_at else None,
            "metrics": post.metrics or {},
            "real_comment_total": real_total,
            "comments_analyzed": total_analyzed,
            "sentiment_breakdown": sentiment_map,
            "dominant_sentiment": dominant,
            "summary": pa.summary if pa else "",
            "crisis_probability": pa.crisis_probability if pa else 0,
        })
    return result


@router.get("/profiles/{profile_id}/posts/{post_id}/comments")
def post_comments(
    profile_id: str,
    post_id: str,
    limit: int = 100,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return analyzed comments for a specific post."""
    # Verify the post belongs to this profile/tenant
    post = db.query(Post).filter(
        Post.id == post_id,
        Post.social_profile_id == profile_id,
        Post.tenant_id == current.tenant_id,
    ).first()
    if not post:
        raise HTTPException(404, "Post not found")

    rows = (
        db.query(Comment, CommentAnalysis)
        .outerjoin(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .filter(Comment.post_id == post_id)
        .order_by(Comment.published_at.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": c.id,
            "content": c.content,
            "author": c.author,
            "published_at": c.published_at.isoformat() if c.published_at else None,
            "sentiment": ca.sentiment if ca else "Neutral",
            "emotion": ca.emotion if ca else [],
            "sarcasm": ca.sarcasm if ca else False,
            "toxicity_score": ca.toxicity_score if ca else 0,
            "stance": ca.stance if ca else "Irrelevant",
        }
        for c, ca in rows
    ]


@router.get("/summary")
def sync_summary(
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Overall stats across all synced profiles for the dashboard header."""
    profiles = (
        db.query(SocialProfile)
        .filter(SocialProfile.tenant_id == current.tenant_id,
                SocialProfile.is_deleted == False)
        .all()
    )
    total_posts = db.query(func.count(Post.id)).filter(Post.tenant_id == current.tenant_id).scalar() or 0
    total_comments = db.query(func.count(Comment.id)).filter(Comment.tenant_id == current.tenant_id).scalar() or 0
    analyzed = db.query(func.count(CommentAnalysis.id)).filter(CommentAnalysis.tenant_id == current.tenant_id).scalar() or 0

    return {
        "profile_count": len(profiles),
        "total_posts": total_posts,
        "total_comments": total_comments,
        "comments_analyzed": analyzed,
        "platforms": list({p.platform for p in profiles}),
    }
