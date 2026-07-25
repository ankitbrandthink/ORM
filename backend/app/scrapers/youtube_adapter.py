"""YouTube Data API v3 adapter — fetches posts (videos), comments, and channel stats.

Quota guard: YouTube Data API v3 is limited to 10,000 units/day.
Each call tracks estimated units. Jobs degrade gracefully when near cap.
"""
import re
from datetime import date, datetime, timezone
from typing import Optional

import httpx

from .base_adapter import BaseAdapter, NormalizedComment, NormalizedPost

_API = "https://www.googleapis.com/youtube/v3"

# Simple in-memory quota tracker (resets at midnight UTC)
_quota_state: dict = {"date": None, "used": 0}
_QUOTA_DAILY_LIMIT = 10_000
_QUOTA_WARN_AT = 9_000   # stop fetching press-source channels when within 1000 units of cap

_UNIT_COSTS = {
    "search.list": 100,
    "channels.list": 1,
    "playlistItems.list": 1,
    "videos.list": 1,
    "commentThreads.list": 1,
}


def _quota_add(endpoint: str) -> int:
    """Record quota usage. Returns total units used today."""
    today = date.today().isoformat()
    if _quota_state["date"] != today:
        _quota_state["date"] = today
        _quota_state["used"] = 0
    _quota_state["used"] += _UNIT_COSTS.get(endpoint, 1)
    return _quota_state["used"]


def get_youtube_quota() -> dict:
    """Return current quota state for monitoring."""
    today = date.today().isoformat()
    if _quota_state["date"] != today:
        return {"date": today, "used": 0, "limit": _QUOTA_DAILY_LIMIT, "near_cap": False}
    used = _quota_state["used"]
    return {
        "date": today,
        "used": used,
        "limit": _QUOTA_DAILY_LIMIT,
        "near_cap": used >= _QUOTA_WARN_AT,
        "remaining": max(0, _QUOTA_DAILY_LIMIT - used),
    }

_CHANNEL_PAT = re.compile(
    r"(?:youtube\.com/(?:@|channel/|c/|user/))([\w\-]+)",
    re.IGNORECASE,
)
_VIDEO_PAT = re.compile(r"(?:v=|youtu\.be/)([\w\-]{11})")


def _ts(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


class YouTubeAdapter(BaseAdapter):
    kind = "youtube"

    def __init__(self, api_key: str):
        self.key = api_key

    # ------------------------------------------------------------------ helpers
    async def _get(self, path: str, **params) -> dict:
        _quota_add(f"{path}.list" if "." not in path else path)
        params["key"] = self.key
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{_API}/{path}", params=params)
            r.raise_for_status()
            return r.json()

    async def _channel_to_uploads(self, channel_id: str) -> str:
        """Return the uploads playlist ID for a channel."""
        data = await self._get("channels", id=channel_id, part="contentDetails")
        return data["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

    async def _handle_to_channel_id(self, handle: str) -> str:
        """Resolve @handle or channel name to channel ID."""
        _quota_add("search.list")  # search.list costs 100 units
        data = await self._get("search", q=handle, type="channel", part="snippet", maxResults=1)
        return data["items"][0]["id"]["channelId"]

    async def fetch_channel_stats(self, channel_url: str) -> dict:
        """Return public channel stats (no OAuth needed).

        Returns: {channel_id, title, subscribers, total_views, video_count, description}
        """
        handle_m = _CHANNEL_PAT.search(channel_url)
        if not handle_m:
            return {}
        handle = handle_m.group(1)
        try:
            channel_id = await self._handle_to_channel_id(handle)
            data = await self._get(
                "channels",
                id=channel_id,
                part="snippet,statistics",
            )
            if not data.get("items"):
                return {}
            item = data["items"][0]
            sn, st = item.get("snippet", {}), item.get("statistics", {})
            return {
                "channel_id": channel_id,
                "title": sn.get("title", ""),
                "description": sn.get("description", "")[:500],
                "subscribers": int(st.get("subscriberCount", 0)),
                "total_views": int(st.get("viewCount", 0)),
                "video_count": int(st.get("videoCount", 0)),
                "country": sn.get("country", ""),
            }
        except Exception:
            return {}

    # ------------------------------------------------------------------ public API
    async def fetch_channel_videos(
        self, channel_url: str, max_results: int = 10
    ) -> list[NormalizedPost]:
        """Return latest `max_results` videos for a channel URL."""
        handle_m = _CHANNEL_PAT.search(channel_url)
        if not handle_m:
            return []
        handle = handle_m.group(1)

        # Resolve handle → channel ID
        channel_id = await self._handle_to_channel_id(handle)
        playlist_id = await self._channel_to_uploads(channel_id)

        data = await self._get(
            "playlistItems",
            playlistId=playlist_id,
            part="snippet",
            maxResults=min(max_results, 50),
        )
        # First pass: collect video IDs and basic info
        raw: list[dict] = []
        for item in data.get("items", []):
            sn = item["snippet"]
            vid_id = sn.get("resourceId", {}).get("videoId", "")
            if vid_id:
                raw.append({
                    "id": vid_id,
                    "title": sn.get("title", ""),
                    "author": sn.get("channelTitle"),
                    "published_at": _ts(sn.get("publishedAt")),
                })

        # Second pass: batch-fetch statistics (up to 50 IDs per call)
        stats_map: dict = {}
        ids = [r["id"] for r in raw]
        for chunk_start in range(0, len(ids), 50):
            chunk = ids[chunk_start:chunk_start + 50]
            try:
                stats_data = await self._get(
                    "videos",
                    id=",".join(chunk),
                    part="statistics",
                )
                for vi in stats_data.get("items", []):
                    st = vi.get("statistics", {})
                    stats_map[vi["id"]] = {
                        "views":    int(st.get("viewCount", 0)),
                        "likes":    int(st.get("likeCount", 0)),
                        "comments": int(st.get("commentCount", 0)),
                    }
            except Exception:
                pass  # stats unavailable — proceed with zeros

        posts = []
        for r in raw:
            posts.append(NormalizedPost(
                external_id=r["id"],
                source_kind="youtube",
                content=r["title"],
                author=r["author"],
                url=f"https://www.youtube.com/watch?v={r['id']}",
                published_at=r["published_at"],
                metrics=stats_map.get(r["id"], {"views": 0, "likes": 0, "comments": 0}),
            ))
        return posts

    async def fetch_post(self, url: str) -> NormalizedPost:
        m = _VIDEO_PAT.search(url)
        if not m:
            raise ValueError(f"Cannot extract video ID from URL: {url}")
        vid = m.group(1)
        data = await self._get("videos", id=vid, part="snippet,statistics")
        item = data["items"][0]
        sn, st = item["snippet"], item.get("statistics", {})
        return NormalizedPost(
            external_id=vid,
            source_kind="youtube",
            content=sn.get("title", ""),
            author=sn.get("channelTitle"),
            url=url,
            published_at=_ts(sn.get("publishedAt")),
            metrics={
                "views":    int(st.get("viewCount", 0)),
                "likes":    int(st.get("likeCount", 0)),
                "comments": int(st.get("commentCount", 0)),
            },
        )

    async def fetch_comments(self, post_id: str) -> list[NormalizedComment]:
        """Fetch top-level comments for a video ID."""
        try:
            data = await self._get(
                "commentThreads",
                videoId=post_id,
                part="snippet",
                maxResults=100,
                order="time",
            )
        except httpx.HTTPStatusError:
            return []
        comments = []
        for item in data.get("items", []):
            top = item["snippet"]["topLevelComment"]["snippet"]
            comments.append(NormalizedComment(
                external_id=item["id"],
                content=top.get("textOriginal", ""),
                author=top.get("authorDisplayName"),
                published_at=_ts(top.get("publishedAt")),
            ))
        return comments
