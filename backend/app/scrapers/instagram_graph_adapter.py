"""Instagram Graph API adapter.

Uses the Meta Graph API (same token as Facebook) to fetch Instagram
Business/Creator account posts via the Business Discovery API.

Requirements:
  - Instagram account must be Business or Creator type
  - Account must be linked to a Facebook Page
  - A valid Facebook User/Page Access Token saved in facebook_config.json

Free, no App Review needed for accounts you manage. Token persists 60 days
(User token) or indefinitely (Page token).
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Optional

from .base_adapter import BaseAdapter, NormalizedComment, NormalizedPost
from .facebook_adapter import load_fb_config

logger = logging.getLogger("orm.instagram_graph")

_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ig_graph")
_GRAPH = "https://graph.facebook.com/v19.0"

# Cached own IG business account ID (shared per process — cheap to re-derive)
_own_ig_id_cache: dict[str, str] = {}  # token_prefix -> ig_user_id


def _token() -> str:
    cfg = load_fb_config()
    return (
        os.environ.get("FACEBOOK_ACCESS_TOKEN", "").strip()
        or cfg.get("access_token", "").strip()
    )


def _extract_handle(url: str) -> str:
    url = (url or "").rstrip("/")
    m = re.search(r"instagram\.com/([^/?#]+)", url)
    if m:
        h = m.group(1).lstrip("@")
        return h
    return url.lstrip("@")


def _get_own_ig_account_id(tok: str) -> Optional[str]:
    """Walk /me/accounts → pages → instagram_business_account to find own IG id."""
    cache_key = tok[:20]
    if cache_key in _own_ig_id_cache:
        return _own_ig_id_cache[cache_key]
    try:
        import httpx
        with httpx.Client(timeout=15) as c:
            r = c.get(f"{_GRAPH}/me/accounts",
                      params={"fields": "id,instagram_business_account", "access_token": tok})
            data = r.json()
            if "error" in data:
                logger.warning("IG Graph: /me/accounts error: %s", data["error"].get("message"))
                return None
            for page in data.get("data", []):
                iba = page.get("instagram_business_account")
                if iba and iba.get("id"):
                    ig_id = iba["id"]
                    _own_ig_id_cache[cache_key] = ig_id
                    logger.info("IG Graph: own IG business account id = %s", ig_id)
                    return ig_id
    except Exception as e:
        logger.warning("IG Graph: failed to get own IG account id: %s", e)
    return None


def _lookup_ig_user_id(username: str, own_ig_id: str, tok: str) -> Optional[str]:
    """Use Business Discovery API to find target IG user id by username."""
    try:
        import httpx
        fields = f"business_discovery.fields(id,username,media_count,followers_count)"
        with httpx.Client(timeout=15) as c:
            r = c.get(
                f"{_GRAPH}/{own_ig_id}",
                params={"fields": fields, "username": username, "access_token": tok},
            )
            data = r.json()
            if "error" in data:
                logger.warning("IG Graph Business Discovery error for @%s: %s",
                               username, data["error"].get("message"))
                return None
            bd = data.get("business_discovery", {})
            ig_id = bd.get("id")
            if ig_id:
                logger.info("IG Graph: @%s → id=%s", username, ig_id)
            return ig_id
    except Exception as e:
        logger.warning("IG Graph: lookup failed for @%s: %s", username, e)
        return None


def _fetch_posts_sync(ig_user_id: str, tok: str, max_posts: int, days: int) -> list[NormalizedPost]:
    try:
        import httpx
    except ImportError:
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    posts: list[NormalizedPost] = []
    fields = "id,caption,timestamp,like_count,comments_count,media_type,permalink"
    url: Optional[str] = f"{_GRAPH}/{ig_user_id}/media"
    params: dict = {"fields": fields, "access_token": tok, "limit": 25}

    with httpx.Client(timeout=20, follow_redirects=True) as client:
        while url and len(posts) < max_posts:
            try:
                r = client.get(url, params=params)
                data = r.json()
            except Exception as e:
                logger.warning("IG Graph media fetch error: %s", e)
                break
            if "error" in data:
                logger.warning("IG Graph media error: %s", data["error"].get("message"))
                break
            for item in data.get("data", []):
                try:
                    raw_time = item.get("timestamp", "")
                    pub_at = (
                        datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
                        if raw_time else datetime.now(timezone.utc)
                    )
                    if pub_at < cutoff:
                        url = None
                        break
                    posts.append(NormalizedPost(
                        external_id=item.get("id", uuid.uuid4().hex[:12]),
                        source_kind="instagram",
                        content=(item.get("caption") or "")[:2000],
                        author=ig_user_id,
                        url=item.get("permalink") or f"https://www.instagram.com/p/{item.get('id', '')}",
                        published_at=pub_at,
                        metrics={
                            "likes": int(item.get("like_count") or 0),
                            "comments": int(item.get("comments_count") or 0),
                            "real_comment_total": int(item.get("comments_count") or 0),
                        },
                    ))
                except Exception:
                    pass
                if len(posts) >= max_posts:
                    break
            paging = data.get("paging", {})
            nxt = paging.get("next")
            url = (nxt if nxt and len(posts) < max_posts and url is not None else None)
            params = {}

    logger.info("IG Graph: fetched %d posts for ig_id=%s", len(posts), ig_user_id)
    return posts


def _fetch_comments_sync(media_id: str, tok: str, max_count: int) -> list[NormalizedComment]:
    try:
        import httpx
        comments: list[NormalizedComment] = []
        url: Optional[str] = f"{_GRAPH}/{media_id}/comments"
        params: dict = {
            "fields": "id,text,timestamp,username",
            "access_token": tok,
            "limit": min(max_count, 50),
        }
        with httpx.Client(timeout=20) as client:
            while url and len(comments) < max_count:
                r = client.get(url, params=params)
                data = r.json()
                if "error" in data:
                    break
                for c in data.get("data", []):
                    comments.append(NormalizedComment(
                        external_id=c.get("id", uuid.uuid4().hex),
                        content=c.get("text", "")[:1000],
                        author=c.get("username", ""),
                        published_at=(
                            datetime.fromisoformat(c["timestamp"].replace("Z", "+00:00"))
                            if c.get("timestamp") else None
                        ),
                    ))
                nxt = (data.get("paging") or {}).get("next")
                url = nxt if nxt and len(comments) < max_count else None
                params = {}
        return comments
    except Exception as e:
        logger.warning("IG Graph comments failed for %s: %s", media_id, e)
        return []


class InstagramGraphAdapter(BaseAdapter):
    """Instagram via Meta Graph API — same token as Facebook config."""

    kind = "instagram"

    async def fetch_post(self, url: str) -> NormalizedPost:
        raise NotImplementedError

    async def fetch_profile_posts(
        self,
        page_url: str,
        max_posts: int = 30,
        days: int = 90,
        token: Optional[str] = None,
    ) -> list[NormalizedPost]:
        tok = token or _token()
        if not tok:
            logger.warning("IG Graph: no Facebook token configured")
            return []

        username = _extract_handle(page_url)
        loop = asyncio.get_event_loop()

        # Step 1: get own IG business account id (needed for Business Discovery)
        own_ig_id = await loop.run_in_executor(_POOL, _get_own_ig_account_id, tok)
        if not own_ig_id:
            logger.warning("IG Graph: no linked IG Business account found on this token")
            return []

        # Step 2: look up target account id via Business Discovery
        ig_user_id = await loop.run_in_executor(
            _POOL, _lookup_ig_user_id, username, own_ig_id, tok
        )
        if not ig_user_id:
            logger.warning("IG Graph: could not resolve @%s via Business Discovery "
                           "(target must be a Business/Creator IG account)", username)
            return []

        # Step 3: fetch posts
        return await loop.run_in_executor(
            _POOL, _fetch_posts_sync, ig_user_id, tok, max_posts, days
        )

    async def fetch_comments(
        self, post_id: str, max_count: int = 200
    ) -> list[NormalizedComment]:
        tok = _token()
        if not tok or not post_id:
            return []
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            _POOL, _fetch_comments_sync, post_id, tok, max_count
        )
