"""Social Listening / Influencer Discovery endpoints.

POST /social-listening/discover        — trigger keyword search (background)
GET  /social-listening/influencers     — list discovered influencers
GET  /social-listening/keywords        — list searched keywords for a client
DELETE /social-listening/influencers/{id}  — soft-delete one record

Only Twitter/X and YouTube are scraped. HackerNews, Mastodon, and press/media
outlet handles are excluded so results contain genuine social influencers only.
"""
from __future__ import annotations

import json
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
from app.scrapers.social_discovery import (
    classify_stance,
    extract_keyword_clusters,
    fetch_twitter_followers,
    is_valid_social_url,
    search_twitter_keyword,
)

_ALLOWED_PLATFORMS = {"twitter", "youtube"}

router = APIRouter(prefix="/social-listening", tags=["social-listening"])
logger = logging.getLogger("orm.social_listening")


def _get_api_key() -> Optional[str]:
    key = getattr(settings, "ANTHROPIC_API_KEY", "")
    return key if (key and key.startswith("sk-ant")) else None


def _follower_tier(count: Optional[int]) -> str:
    """Categorise follower count into display tier."""
    if count is None:
        return "unknown"
    if count >= 1_000_000:
        return "mega"          # 10L+
    if count >= 100_000:
        return "macro"         # 1L–10L
    if count >= 10_000:
        return "mid"           # 10K–1L
    return "micro"             # < 10K


# ── Background discovery task ────────────────────────────────────────────────

async def _run_discovery(tenant_id: str, client_id: str, keyword: str, limit: int):
    """Search Twitter/X & YouTube for keyword, classify stance, upsert records.

    Media outlet handles and non-social URLs are excluded by social_discovery.py.
    """
    db = SessionLocal()
    try:
        tweets = await search_twitter_keyword(keyword, limit=limit)
        if not tweets:
            logger.info("social_listening: no posts found for '%s'", keyword)
            return

        api_key = _get_api_key()

        # Group posts by handle + platform (only allowed platforms)
        by_handle: dict[str, list[dict]] = {}
        for tw in tweets:
            if tw.get("platform") not in _ALLOWED_PLATFORMS:
                continue
            key = f"{tw['handle']}::{tw.get('platform', 'twitter')}"
            by_handle.setdefault(key, []).append(tw)

        for handle_key, handle_posts in by_handle.items():
            handle, platform = handle_key.split("::", 1)

            # Only process allowed platforms
            if platform not in _ALLOWED_PLATFORMS:
                continue

            pro = anti = neutral = 0
            classified_posts: list[dict] = []

            for tw in handle_posts[:5]:  # cap AI calls per handle
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

            # Build profile URL
            if platform == "youtube":
                profile_url = handle_posts[0].get("profile_url") or f"https://www.youtube.com/@{handle}"
            else:
                profile_url = handle_posts[0].get("profile_url") or f"https://x.com/{handle}"

            # Extract keyword clusters from post content
            clusters = extract_keyword_clusters(handle_posts, top_n=8)
            clusters_json = json.dumps(clusters)

            # Followers count — YouTube provides it; Twitter needs a Nitter profile fetch
            followers_count = handle_posts[0].get("followers_count")
            if followers_count is None and platform == "twitter":
                try:
                    followers_count = await fetch_twitter_followers(handle)
                except Exception:
                    pass

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
                inf.total_posts = len(handle_posts)
                inf.last_seen = datetime.now(timezone.utc)
                inf.keyword_clusters = clusters_json
                if followers_count is not None:
                    inf.followers_count = followers_count
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
                    total_posts=len(handle_posts),
                    followers_count=followers_count,
                    keyword_clusters=clusters_json,
                )
                db.add(inf)
                db.flush()

            # Insert new posts (deduped by URL)
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
    follower_tier: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = db.query(DiscoveredInfluencer).filter(
        DiscoveredInfluencer.tenant_id == current_user.tenant_id,
        DiscoveredInfluencer.client_id == client_id,
        DiscoveredInfluencer.is_deleted == False,
        DiscoveredInfluencer.platform.in_(list(_ALLOWED_PLATFORMS)),
    )
    if keyword:
        q = q.filter(DiscoveredInfluencer.keyword == keyword)
    if platform:
        q = q.filter(DiscoveredInfluencer.platform == platform)
    if stance:
        q = q.filter(DiscoveredInfluencer.stance == stance)

    influencers = q.order_by(DiscoveredInfluencer.total_posts.desc()).limit(200).all()

    result = []
    for inf in influencers:
        tier = _follower_tier(inf.followers_count)
        # Apply follower_tier filter (unknown tier passes all filters)
        if follower_tier and follower_tier != "all" and tier != "unknown" and tier != follower_tier:
            continue

        posts = (
            db.query(DiscoveredPost)
            .filter(DiscoveredPost.influencer_id == inf.id, DiscoveredPost.is_deleted == False)
            .order_by(DiscoveredPost.published_at.desc())
            .limit(10)
            .all()
        )

        try:
            clusters = json.loads(inf.keyword_clusters) if inf.keyword_clusters else []
        except Exception:
            clusters = []

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
            "followers_count": inf.followers_count,
            "follower_tier": tier,
            "keyword_clusters": clusters,
            "last_seen": inf.last_seen.isoformat() if inf.last_seen else None,
            "posts": [
                {
                    "url": p.post_url,
                    "content": p.content,
                    "sentiment": p.sentiment,
                    "published_at": p.published_at.isoformat() if p.published_at else None,
                }
                for p in posts
                if is_valid_social_url(p.post_url)  # exclude non-social URLs (HN, blogs, etc.)
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
