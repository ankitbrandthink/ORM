"""Social Listening / Influencer Discovery endpoints.

POST /social-listening/discover        — trigger keyword search (background)
GET  /social-listening/influencers     — list discovered influencers
GET  /social-listening/keywords        — list searched keywords for a client
DELETE /social-listening/influencers/{id}  — soft-delete one record
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import DiscoveredInfluencer, DiscoveredPost
from app.scrapers.social_discovery import classify_stance, search_twitter_keyword

router = APIRouter(prefix="/social-listening", tags=["social-listening"])
logger = logging.getLogger("orm.social_listening")


def _get_api_key() -> Optional[str]:
    key = getattr(settings, "ANTHROPIC_API_KEY", "")
    return key if (key and key.startswith("sk-ant")) else None


# ── Background discovery task ────────────────────────────────────────────────

async def _run_discovery(tenant_id: str, client_id: str, keyword: str, limit: int):
    """Search Twitter/X for keyword, classify stance, upsert influencer records."""
    db = SessionLocal()
    try:
        tweets = await search_twitter_keyword(keyword, limit=limit)
        if not tweets:
            logger.info("social_listening: no tweets found for '%s'", keyword)
            return

        api_key = _get_api_key()

        # Group tweets by Twitter handle
        by_handle: dict[str, list[dict]] = {}
        for tw in tweets:
            by_handle.setdefault(tw["handle"], []).append(tw)

        for handle, handle_tweets in by_handle.items():
            pro = anti = neutral = 0
            classified_posts: list[dict] = []

            # Determine platform from first post (all tweets for a handle share platform)
            platform = handle_tweets[0].get("platform", "twitter") if handle_tweets else "twitter"
            if platform not in ("twitter", "reddit"):
                platform = "twitter"

            for tw in handle_tweets[:5]:  # cap AI calls per handle
                stance = await classify_stance(tw["content"], keyword, api_key)
                if stance == "Pro":
                    pro += 1
                elif stance == "Anti":
                    anti += 1
                else:
                    neutral += 1
                classified_posts.append({**tw, "stance": stance})

            if pro > anti and pro > neutral:
                overall = "Pro"
            elif anti > pro and anti > neutral:
                overall = "Anti"
            else:
                overall = "Mixed"

            # Build profile URL based on platform
            if platform == "reddit":
                profile_url = f"https://reddit.com/u/{handle}"
            else:
                profile_url = f"https://x.com/{handle}"

            # Upsert influencer
            inf = db.query(DiscoveredInfluencer).filter(
                DiscoveredInfluencer.tenant_id == tenant_id,
                DiscoveredInfluencer.client_id == client_id,
                DiscoveredInfluencer.handle == handle,
                DiscoveredInfluencer.keyword == keyword,
                DiscoveredInfluencer.platform == platform,
                DiscoveredInfluencer.is_deleted == False,
            ).first()

            if inf:
                inf.stance = overall
                inf.positive_count = pro
                inf.negative_count = anti
                inf.total_posts = len(handle_tweets)
                inf.last_seen = datetime.now(timezone.utc)
            else:
                inf = DiscoveredInfluencer(
                    tenant_id=tenant_id,
                    client_id=client_id,
                    platform=platform,
                    handle=handle,
                    profile_url=profile_url,
                    keyword=keyword,
                    stance=overall,
                    positive_count=pro,
                    negative_count=anti,
                    total_posts=len(handle_tweets),
                )
                db.add(inf)
                db.flush()

            # Insert new posts (skip duplicates by URL)
            existing_urls = {
                row[0]
                for row in db.query(DiscoveredPost.post_url)
                .filter(DiscoveredPost.influencer_id == inf.id)
                .all()
            }
            for tw in classified_posts:
                if tw["url"] in existing_urls:
                    continue
                try:
                    pub = datetime.fromisoformat(tw["published_at"]) if tw.get("published_at") else None
                except Exception:
                    pub = None
                db.add(DiscoveredPost(
                    influencer_id=inf.id,
                    post_url=tw["url"],
                    content=tw["content"],
                    sentiment=tw.get("stance"),
                    published_at=pub,
                    keyword=keyword,
                ))

        db.commit()
        logger.info("social_listening: stored %d handles for keyword '%s'", len(by_handle), keyword)

    except Exception as exc:
        logger.error("social_listening discovery error for '%s': %s", keyword, exc)
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


# ── Endpoints ────────────────────────────────────────────────────────────────

class DiscoverRequest(BaseModel):
    client_id: str
    keyword: str
    platform: str = "twitter"
    limit: int = 40


@router.post("/discover")
async def discover_influencers(
    req: DiscoverRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
):
    kw = req.keyword.strip()
    if not kw:
        raise HTTPException(status_code=400, detail="keyword is required")
    background_tasks.add_task(
        _run_discovery,
        tenant_id=current_user.tenant_id,
        client_id=req.client_id,
        keyword=kw,
        limit=min(req.limit, 60),
    )
    return {"status": "discovery_started", "keyword": kw, "platform": req.platform}


@router.get("/influencers")
async def get_discovered_influencers(
    client_id: str,
    keyword: Optional[str] = None,
    platform: Optional[str] = None,
    stance: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = db.query(DiscoveredInfluencer).filter(
        DiscoveredInfluencer.tenant_id == current_user.tenant_id,
        DiscoveredInfluencer.client_id == client_id,
        DiscoveredInfluencer.is_deleted == False,
    )
    if keyword:
        q = q.filter(DiscoveredInfluencer.keyword == keyword)
    if platform:
        q = q.filter(DiscoveredInfluencer.platform == platform)
    if stance:
        q = q.filter(DiscoveredInfluencer.stance == stance)

    influencers = q.order_by(DiscoveredInfluencer.total_posts.desc()).limit(100).all()

    result = []
    for inf in influencers:
        posts = (
            db.query(DiscoveredPost)
            .filter(DiscoveredPost.influencer_id == inf.id, DiscoveredPost.is_deleted == False)
            .order_by(DiscoveredPost.published_at.desc())
            .limit(5)
            .all()
        )
        result.append({
            "id": inf.id,
            "platform": inf.platform,
            "handle": inf.handle,
            "profile_url": inf.profile_url,
            "keyword": inf.keyword,
            "stance": inf.stance,
            "positive_count": inf.positive_count,
            "negative_count": inf.negative_count,
            "total_posts": inf.total_posts,
            "last_seen": inf.last_seen.isoformat() if inf.last_seen else None,
            "posts": [
                {
                    "url": p.post_url,
                    "content": p.content,
                    "sentiment": p.sentiment,
                    "published_at": p.published_at.isoformat() if p.published_at else None,
                }
                for p in posts
            ],
        })

    # Unique keywords searched for this client
    keywords = [
        row[0]
        for row in db.query(DiscoveredInfluencer.keyword)
        .filter(
            DiscoveredInfluencer.tenant_id == current_user.tenant_id,
            DiscoveredInfluencer.client_id == client_id,
            DiscoveredInfluencer.is_deleted == False,
        )
        .distinct()
        .all()
    ]

    return {
        "influencers": result,
        "keywords": keywords,
        "total": len(result),
    }


@router.get("/keywords")
async def get_keywords(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    rows = (
        db.query(DiscoveredInfluencer.keyword)
        .filter(
            DiscoveredInfluencer.tenant_id == current_user.tenant_id,
            DiscoveredInfluencer.client_id == client_id,
            DiscoveredInfluencer.is_deleted == False,
        )
        .distinct()
        .all()
    )
    return {"keywords": [r[0] for r in rows]}


@router.delete("/influencers/{influencer_id}")
async def delete_discovered_influencer(
    influencer_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    inf = db.query(DiscoveredInfluencer).filter(
        DiscoveredInfluencer.id == influencer_id,
        DiscoveredInfluencer.tenant_id == current_user.tenant_id,
    ).first()
    if not inf:
        raise HTTPException(status_code=404, detail="Influencer not found")
    inf.is_deleted = True
    db.commit()
    return {"status": "deleted"}
