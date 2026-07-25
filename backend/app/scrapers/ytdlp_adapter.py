"""YouTube adapter using yt-dlp — no API key, no paid service required.

Fetches channel videos and per-video comments using YouTube's internal APIs
as reverse-engineered by yt-dlp. Works on any public YouTube channel.
"""
from __future__ import annotations

import asyncio
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional

from .base_adapter import BaseAdapter, NormalizedComment, NormalizedPost

logger = logging.getLogger("orm.ytdlp")

_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ytdlp")

_CHANNEL_HANDLE_PAT = re.compile(
    r"youtube\.com/@([\w\.\-]+)", re.IGNORECASE
)
_CHANNEL_ID_PAT = re.compile(
    r"youtube\.com/channel/([\w\-]+)", re.IGNORECASE
)


def _parse_upload_date(s: Optional[str]) -> Optional[datetime]:
    """Parse yt-dlp's YYYYMMDD upload_date string."""
    if not s:
        return None
    try:
        return datetime.strptime(str(s)[:8], "%Y%m%d").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _channel_url(profile_url: str, channel_id: Optional[str] = None) -> str:
    """Return the /videos playlist URL for a channel."""
    if channel_id:
        return f"https://www.youtube.com/channel/{channel_id}/videos"
    url = (profile_url or "").rstrip("/")
    # Already a full URL
    if "youtube.com" in url:
        if "/videos" not in url:
            url = url + "/videos"
        return url
    # Bare channel ID (UCxxx…)
    if url.startswith("UC") and len(url) > 10:
        return f"https://www.youtube.com/channel/{url}/videos"
    # Bare handle
    return f"https://www.youtube.com/@{url}/videos"


def _fetch_videos_sync(channel_url: str, max_results: int) -> list[NormalizedPost]:
    try:
        import yt_dlp  # noqa: PLC0415
    except ImportError:
        logger.error("yt-dlp not installed — run: pip install yt-dlp")
        return []

    # Flat extract — gets video IDs and titles quickly without bot-detection triggers.
    # Note: view_count/like_count are 0 in flat mode (YouTube doesn't include them in
    # the channel playlist response). Real stats require a YouTube Data API key — set it
    # in Admin → Sync Settings to unlock accurate engagement metrics.
    flat_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": "in_playlist",
        "playlistend": max_results,
        "skip_download": True,
        "ignoreerrors": True,
    }
    posts: list[NormalizedPost] = []
    try:
        with yt_dlp.YoutubeDL(flat_opts) as ydl:
            info = ydl.extract_info(channel_url, download=False)
        if not info:
            return []
        channel_name = info.get("channel") or info.get("uploader") or ""
        for entry in (info.get("entries") or [])[:max_results]:
            if not entry:
                continue
            vid_id = entry.get("id", "")
            if not vid_id:
                continue
            pub_at = _parse_upload_date(entry.get("upload_date"))
            if pub_at is None and entry.get("timestamp"):
                try:
                    pub_at = datetime.fromtimestamp(int(entry["timestamp"]), tz=timezone.utc)
                except Exception:
                    pass
            if pub_at is None:
                pub_at = datetime.now(timezone.utc)
            posts.append(NormalizedPost(
                external_id=vid_id,
                source_kind="youtube",
                content=entry.get("title", ""),
                author=channel_name or entry.get("channel", ""),
                url=f"https://www.youtube.com/watch?v={vid_id}",
                published_at=pub_at,
                metrics={
                    "views":    int(entry.get("view_count") or 0),
                    "likes":    int(entry.get("like_count") or 0),
                    "comments": int(entry.get("comment_count") or 0),
                    "real_comment_total": int(entry.get("comment_count") or 0),
                },
            ))
    except Exception:
        logger.exception("yt-dlp fetch_videos failed for %s", channel_url)
    return posts


def _fetch_comments_sync(video_id: str, max_count: int) -> list[NormalizedComment]:
    """Fetch comments via yt-dlp (uses YouTube internal comment API, no key)."""
    try:
        import yt_dlp  # noqa: PLC0415
    except ImportError:
        return []

    url = f"https://www.youtube.com/watch?v={video_id}"
    # yt-dlp comment extraction: max_comments param format is
    # [total, per_page, replies_total, replies_per_thread]
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "writecomments": True,
        "getcomments": True,
        "ignoreerrors": True,
        "extractor_args": {
            "youtube": {
                "max_comments": [str(max_count), str(max_count), "0", "0"],
                "comment_sort": ["top"],  # most relevant comments first
            }
        },
    }
    comments: list[NormalizedComment] = []
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if not info:
            return []
        for c in (info.get("comments") or [])[:max_count]:
            ts = c.get("timestamp")
            pub_at = (
                datetime.fromtimestamp(ts, tz=timezone.utc)
                if ts
                else None
            )
            comments.append(NormalizedComment(
                external_id=str(c.get("id", "")),
                content=c.get("text", ""),
                author=c.get("author", ""),
                author_url=c.get("author_url") or c.get("author_id") or None,
                published_at=pub_at,
            ))
    except Exception:
        logger.exception("yt-dlp fetch_comments failed for video %s", video_id)
    return comments


class YtDlpAdapter(BaseAdapter):
    """YouTube via yt-dlp — no API key required."""

    kind = "youtube"

    def __init__(self, channel_id: Optional[str] = None):
        self._channel_id = channel_id

    async def fetch_channel_videos(
        self, profile_url: str, max_results: int = 20
    ) -> list[NormalizedPost]:
        url = _channel_url(profile_url, self._channel_id)
        logger.info("yt-dlp fetching up to %d videos from %s", max_results, url)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_POOL, _fetch_videos_sync, url, max_results)

    async def fetch_post(self, url: str) -> NormalizedPost:
        raise NotImplementedError

    async def fetch_comments(
        self, post_id: str, max_count: int = 200
    ) -> list[NormalizedComment]:
        logger.info("yt-dlp fetching up to %d comments for video %s", max_count, post_id)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            _POOL, _fetch_comments_sync, post_id, max_count
        )
