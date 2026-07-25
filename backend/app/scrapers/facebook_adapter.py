"""Facebook public page scraper.

Two modes (first that works wins):
  1. Cookie-based  — facebook-scraper library using admin-saved c_user + xs cookies
                     from a logged-in Facebook account. Gets real posts + metrics.
  2. Graph API     — Meta Graph API with a long-lived User Access Token saved in admin.
                     Reliable for public pages, token valid ~60 days.
  3. mbasic fallback — mbasic.facebook.com HTML scraping (no auth, very limited).

Configure via Admin -> Scraping Settings -> Facebook tab.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Optional

from .base_adapter import BaseAdapter, NormalizedComment, NormalizedPost

logger = logging.getLogger("orm.facebook")

_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="fb")

_CONFIG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data", "facebook_config.json",
)


def load_fb_config() -> dict:
    try:
        with open(_CONFIG_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def save_fb_config(cfg: dict) -> None:
    os.makedirs(os.path.dirname(_CONFIG_FILE), exist_ok=True)
    with open(_CONFIG_FILE, "w") as f:
        json.dump(cfg, f)


def _extract_handle(url: str) -> str:
    url = (url or "").rstrip("/")
    m = re.search(r"facebook\.com/([^/?#]+)", url)
    return m.group(1) if m else url


def _parse_relative_time(text: str) -> Optional[datetime]:
    now = datetime.now(timezone.utc)
    m = re.search(r"(\d+)\s*(second|minute|hour|day|week|month|year)", (text or "").lower())
    if not m:
        return now
    n, unit = int(m.group(1)), m.group(2)
    deltas = {
        "second": timedelta(seconds=n), "minute": timedelta(minutes=n),
        "hour": timedelta(hours=n), "day": timedelta(days=n),
        "week": timedelta(weeks=n), "month": timedelta(days=n * 30),
        "year": timedelta(days=n * 365),
    }
    return now - deltas.get(unit, timedelta(0))


# ── Mode 1: facebook-scraper with cookies ────────────────────────────────────

def _scrape_with_cookies(handle: str, cookies: dict, max_posts: int, days: int) -> list[NormalizedPost]:
    try:
        from facebook_scraper import get_posts  # noqa: PLC0415
    except ImportError:
        logger.warning("facebook-scraper not installed")
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    posts: list[NormalizedPost] = []
    options = {"posts_per_page": 10, "allow_extra_requests": False, "comments": False}
    try:
        pages_needed = max(4, (max_posts // 10) + 2)
        for raw in get_posts(handle, pages=pages_needed, cookies=cookies, options=options):
            pub_at = raw.get("time")
            if pub_at is None:
                pub_at = datetime.now(timezone.utc)
            elif not pub_at.tzinfo:
                pub_at = pub_at.replace(tzinfo=timezone.utc)
            if pub_at < cutoff:
                break
            posts.append(NormalizedPost(
                external_id=str(raw.get("post_id") or uuid.uuid4().hex[:12]),
                source_kind="facebook",
                content=(raw.get("text") or raw.get("post_text") or "")[:2000],
                author=handle,
                url=raw.get("post_url") or ("https://www.facebook.com/" + handle),
                published_at=pub_at,
                metrics={
                    "likes": int(raw.get("likes") or 0),
                    "comments": int(raw.get("comments") or 0),
                    "shares": int(raw.get("shares") or 0),
                    "real_comment_total": int(raw.get("comments") or 0),
                },
            ))
            if len(posts) >= max_posts:
                break
    except Exception as e:
        logger.warning("facebook-scraper cookie mode failed for %s: %s", handle, e)
    logger.info("fb-scraper cookies: %d posts for %s", len(posts), handle)
    return posts


# ── Mode 2: Meta Graph API ────────────────────────────────────────────────────

def _scrape_via_graph_api(handle: str, token: str, max_posts: int, days: int) -> list[NormalizedPost]:
    try:
        import httpx  # noqa: PLC0415
    except ImportError:
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    posts: list[NormalizedPost] = []
    fields = "id,message,story,created_time,likes.summary(true),comments.summary(true),shares"
    url: Optional[str] = "https://graph.facebook.com/v19.0/" + handle + "/posts"
    params: dict = {"fields": fields, "access_token": token, "limit": 25}

    with httpx.Client(timeout=20, follow_redirects=True) as client:
        while url and len(posts) < max_posts:
            try:
                r = client.get(url, params=params)
                data = r.json()
            except Exception as e:
                logger.warning("Graph API request failed: %s", e)
                break
            if "error" in data:
                logger.warning("Graph API error for %s: %s", handle, data["error"].get("message"))
                break
            for item in data.get("data", []):
                try:
                    raw_time = item.get("created_time", "")
                    pub_at = datetime.fromisoformat(raw_time.replace("Z", "+00:00")) if raw_time else datetime.now(timezone.utc)
                    if pub_at < cutoff:
                        url = None
                        break
                    content = item.get("message") or item.get("story") or ""
                    posts.append(NormalizedPost(
                        external_id=item.get("id", uuid.uuid4().hex[:12]),
                        source_kind="facebook",
                        content=content[:2000],
                        author=handle,
                        url="https://www.facebook.com/" + item.get("id", ""),
                        published_at=pub_at,
                        metrics={
                            "likes": int((item.get("likes") or {}).get("summary", {}).get("total_count", 0)),
                            "comments": int((item.get("comments") or {}).get("summary", {}).get("total_count", 0)),
                            "shares": int((item.get("shares") or {}).get("count", 0)),
                            "real_comment_total": int((item.get("comments") or {}).get("summary", {}).get("total_count", 0)),
                        },
                    ))
                except Exception:
                    pass
                if len(posts) >= max_posts:
                    break
            paging = data.get("paging", {})
            next_url = paging.get("next")
            if next_url and len(posts) < max_posts and url is not None:
                url = next_url
                params = {}
            else:
                url = None

    logger.info("Graph API: %d posts for %s", len(posts), handle)
    return posts


# ── Mode 3: mbasic fallback ───────────────────────────────────────────────────

_MBASIC = "https://mbasic.facebook.com"
_MBASIC_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/121 Mobile Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


def _scrape_mbasic(handle: str, max_posts: int, days: int) -> list[NormalizedPost]:
    try:
        import httpx  # noqa: PLC0415
        from bs4 import BeautifulSoup  # noqa: PLC0415
    except ImportError:
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    posts: list[NormalizedPost] = []
    next_url: Optional[str] = _MBASIC + "/" + handle

    with httpx.Client(headers=_MBASIC_HEADERS, timeout=20, follow_redirects=True) as client:
        while next_url and len(posts) < max_posts:
            try:
                r = client.get(next_url)
                r.raise_for_status()
            except Exception as e:
                logger.warning("mbasic fetch failed: %s", e)
                break
            soup = BeautifulSoup(r.text, "html.parser")
            articles = soup.find_all("div", attrs={"data-ft": True}) or soup.find_all("article")
            found_any = False
            for art in articles:
                if len(posts) >= max_posts:
                    break
                content = art.get_text(" ", strip=True)
                if not content or len(content) < 10:
                    continue
                ext_id = "fb_" + handle + "_" + uuid.uuid4().hex[:8]
                pub_at = datetime.now(timezone.utc)
                for tag in art.find_all(["abbr", "span"]):
                    txt = tag.get_text(strip=True)
                    if re.search(r"\d+\s*(hour|minute|day|week|month)", txt, re.I):
                        pub_at = _parse_relative_time(txt) or pub_at
                        break
                if pub_at < cutoff:
                    next_url = None
                    break
                found_any = True
                posts.append(NormalizedPost(
                    external_id=ext_id,
                    source_kind="facebook",
                    content=content[:2000],
                    author=handle,
                    url="https://www.facebook.com/" + handle,
                    published_at=pub_at,
                    metrics={"likes": 0, "comments": 0, "real_comment_total": 0},
                ))
            if not found_any:
                break
            if next_url:
                next_url = None
                for a in soup.find_all("a", href=True):
                    if (a.get_text() or "").lower().strip() in ("more posts", "older posts", "see more"):
                        h = a["href"]
                        next_url = (_MBASIC + h) if h.startswith("/") else h
                        break

    logger.info("mbasic: %d posts for %s", len(posts), handle)
    return posts


# ── Adapter ──────────────────────────────────────────────────────────────────

class FacebookPublicAdapter(BaseAdapter):
    kind = "facebook"

    async def fetch_post(self, url: str) -> NormalizedPost:
        raise NotImplementedError

    async def fetch_profile_posts(
        self, page_url: str, max_posts: int = 30, days: int = 90
    ) -> list[NormalizedPost]:
        handle = _extract_handle(page_url)
        cfg = load_fb_config()
        loop = asyncio.get_event_loop()

        # Mode 1: cookie-based facebook-scraper
        cookies_dict: dict = {}
        if cfg.get("c_user") and cfg.get("xs"):
            cookies_dict = {"c_user": cfg["c_user"], "xs": cfg["xs"]}
        if cookies_dict:
            posts = await loop.run_in_executor(_POOL, _scrape_with_cookies, handle, cookies_dict, max_posts, days)
            if posts:
                return posts
            logger.warning("Cookie scraping got 0 posts, trying Graph API")

        # Mode 2: Graph API access token
        token = (
            os.environ.get("FACEBOOK_ACCESS_TOKEN", "").strip()
            or cfg.get("access_token", "").strip()
        )
        if token:
            posts = await loop.run_in_executor(_POOL, _scrape_via_graph_api, handle, token, max_posts, days)
            if posts:
                return posts
            logger.warning("Graph API got 0 posts, trying mbasic fallback")

        # Mode 3: mbasic fallback
        return await loop.run_in_executor(_POOL, _scrape_mbasic, handle, max_posts, days)

    async def fetch_comments(self, post_id: str, max_count: int = 200) -> list[NormalizedComment]:
        cfg = load_fb_config()
        token = (
            os.environ.get("FACEBOOK_ACCESS_TOKEN", "").strip()
            or cfg.get("access_token", "").strip()
        )
        if not token or not post_id:
            return []
        try:
            import httpx  # noqa: PLC0415
            comments: list[NormalizedComment] = []
            url: Optional[str] = "https://graph.facebook.com/v19.0/" + post_id + "/comments"
            params: dict = {
                "fields": "id,message,created_time,from",
                "access_token": token,
                "limit": min(max_count, 100),
            }
            with httpx.Client(timeout=20) as client:
                while url and len(comments) < max_count:
                    r = client.get(url, params=params)
                    data = r.json()
                    if "error" in data:
                        break
                    for c in data.get("data", []):
                        from_data = c.get("from") or {}
                        fb_id = from_data.get("id")
                        fb_name = from_data.get("name", "")
                        profile_url = f"https://www.facebook.com/profile.php?id={fb_id}" if fb_id else None
                        comments.append(NormalizedComment(
                            external_id=c.get("id", uuid.uuid4().hex),
                            content=c.get("message", "")[:1000],
                            author=fb_name,
                            author_url=profile_url,
                            published_at=datetime.fromisoformat(c["created_time"].replace("Z", "+00:00")) if c.get("created_time") else None,
                        ))
                    nxt = (data.get("paging") or {}).get("next")
                    url = nxt if nxt and len(comments) < max_count else None
                    params = {}
            return comments
        except Exception as e:
            logger.warning("Graph API comments failed: %s", e)
            return []
