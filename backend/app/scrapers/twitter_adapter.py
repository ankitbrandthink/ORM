"""Twitter/X public scraper — no API key, no login required.

Strategy 1: Nitter RSS (multiple instances — best data quality)
Strategy 2: Twitter Syndication API (public embed endpoint)
Both return NormalizedPost objects; comments return empty (AI gen in sync.py).
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

from .base_adapter import BaseAdapter, NormalizedComment, NormalizedPost

logger = logging.getLogger("orm.twitter")

_NITTER_INSTANCES = [
    "https://nitter.privacydev.net",
    "https://nitter.net",
    "https://nitter.cz",
    "https://nitter.unixfox.eu",
]

_RSS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-US,en;q=0.9",
}


def _extract_handle(url: str) -> str:
    url = (url or "").rstrip("/")
    m = re.search(r"(?:twitter\.com|x\.com)/([^/?#@]+)", url)
    if m:
        h = m.group(1)
        if h.lower() not in ("home", "explore", "notifications", "messages", "search"):
            return h
    # bare handle
    bare = url.lstrip("@").split("?")[0].split("/")[0]
    return bare or url


class TwitterAdapter(BaseAdapter):
    kind = "twitter"

    async def fetch_post(self, url: str) -> NormalizedPost:
        raise NotImplementedError

    async def fetch_comments(self, post_id: str, max_count: int = 200) -> list[NormalizedComment]:
        # X/Twitter doesn't expose reply threads via any free public API.
        # sync.py will generate AI-estimated comments instead.
        return []

    async def fetch_profile_posts(
        self, profile_url: str, max_posts: int = 20, days: int = 90
    ) -> list[NormalizedPost]:
        handle = _extract_handle(profile_url)
        if not handle:
            return []
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        posts = await self._fetch_nitter_rss(handle, max_posts, cutoff)
        if posts:
            logger.info("TwitterAdapter: %d tweets from nitter for @%s", len(posts), handle)
            return posts

        posts = await self._fetch_syndication(handle, max_posts, cutoff)
        if posts:
            logger.info("TwitterAdapter: %d tweets from syndication for @%s", len(posts), handle)
            return posts

        logger.warning("TwitterAdapter: all strategies failed for @%s", handle)
        return []

    # ── Strategy 1: Nitter RSS ──────────────────────────────────────────────

    async def _fetch_nitter_rss(self, handle: str, max_posts: int, cutoff: datetime) -> list[NormalizedPost]:
        try:
            import httpx
            import xml.etree.ElementTree as ET
        except ImportError:
            return []

        for base in _NITTER_INSTANCES:
            try:
                async with httpx.AsyncClient(headers=_RSS_HEADERS, timeout=12, follow_redirects=True) as client:
                    r = await client.get(f"{base}/{handle}/rss")
                    if r.status_code != 200:
                        continue
                    try:
                        root = ET.fromstring(r.text)
                    except ET.ParseError:
                        continue

                    posts: list[NormalizedPost] = []
                    for item in root.findall(".//item"):
                        if len(posts) >= max_posts:
                            break
                        try:
                            title = (item.findtext("title") or "").strip()
                            link  = (item.findtext("link")  or "").strip()
                            pub_raw = item.findtext("pubDate") or ""

                            # Strip "handle: " prefix from nitter title
                            content = re.sub(r"^[^:]+:\s*", "", title, count=1).strip()
                            if not content:
                                continue

                            pub_at = datetime.now(timezone.utc)
                            if pub_raw:
                                try:
                                    pub_at = parsedate_to_datetime(pub_raw).astimezone(timezone.utc)
                                except Exception:
                                    pass

                            if pub_at < cutoff:
                                continue

                            # Extract tweet ID from nitter link: /{handle}/status/{id}#m
                            tweet_id = ""
                            m = re.search(r"/status/(\d+)", link)
                            if m:
                                tweet_id = m.group(1)
                            if not tweet_id:
                                tweet_id = f"tw_{handle}_{uuid.uuid4().hex[:10]}"

                            posts.append(NormalizedPost(
                                external_id=tweet_id,
                                source_kind="twitter",
                                content=content[:1000],
                                author=handle,
                                url=f"https://x.com/{handle}/status/{tweet_id}",
                                published_at=pub_at,
                                metrics={"likes": 0, "retweets": 0, "comments": 0, "real_comment_total": 0},
                            ))
                        except Exception:
                            continue

                    if posts:
                        return posts  # first successful instance wins

            except Exception as e:
                logger.debug("Nitter %s failed: %s", base, e)
                continue

        return []

    # ── Strategy 2: Twitter Syndication API ─────────────────────────────────

    async def _fetch_syndication(self, handle: str, max_posts: int, cutoff: datetime) -> list[NormalizedPost]:
        """Public API powering embedded Twitter timelines — no auth needed."""
        try:
            import httpx
        except ImportError:
            return []
        try:
            url = (
                f"https://cdn.syndication.twimg.com/timeline/profile"
                f"?screen_name={handle}&count={min(max_posts, 20)}&dnt=true&lang=en"
            )
            async with httpx.AsyncClient(
                timeout=12,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Referer": "https://platform.twitter.com/",
                },
            ) as client:
                r = await client.get(url)
                if r.status_code != 200:
                    return []
                data = r.json()

            # Response shape varies — try both known formats
            entries = (
                data.get("timeline", {}).get("entries")
                or data.get("entries")
                or []
            )

            posts: list[NormalizedPost] = []
            for entry in entries[:max_posts]:
                try:
                    tweet = (
                        entry.get("content", {}).get("tweet")
                        or entry.get("tweet")
                        or {}
                    )
                    content = tweet.get("full_text") or tweet.get("text", "")
                    if not content:
                        continue
                    tweet_id = str(tweet.get("id", "") or tweet.get("id_str", ""))
                    created_raw = tweet.get("created_at", "")
                    pub_at = datetime.now(timezone.utc)
                    if created_raw:
                        try:
                            pub_at = parsedate_to_datetime(created_raw).astimezone(timezone.utc)
                        except Exception:
                            pass
                    if pub_at < cutoff:
                        continue

                    posts.append(NormalizedPost(
                        external_id=tweet_id or f"tw_{handle}_{len(posts)}",
                        source_kind="twitter",
                        content=content[:1000],
                        author=handle,
                        url=f"https://x.com/{handle}/status/{tweet_id}" if tweet_id else f"https://x.com/{handle}",
                        published_at=pub_at,
                        metrics={
                            "likes":     tweet.get("favorite_count", 0),
                            "retweets":  tweet.get("retweet_count", 0),
                            "comments":  tweet.get("reply_count", 0),
                            "real_comment_total": tweet.get("reply_count", 0),
                        },
                    ))
                except Exception:
                    continue
            return posts
        except Exception as e:
            logger.debug("Syndication API failed for %s: %s", handle, e)
            return []
