"""NewsAPI.org adapter. Requires NEWS_API_KEY in source config."""
from datetime import datetime, timezone

import httpx

from app.scrapers.base_adapter import BaseAdapter, NormalizedComment, NormalizedPost


class NewsAPIAdapter(BaseAdapter):
    kind = "news_api"

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key

    async def fetch_post(self, url: str) -> NormalizedPost:
        # `url` here is treated as a search query.
        params = {"q": url, "apiKey": self.api_key, "pageSize": 1, "sortBy": "publishedAt"}
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get("https://newsapi.org/v2/everything", params=params)
            r.raise_for_status()
            data = r.json()
        art = (data.get("articles") or [{}])[0]
        return NormalizedPost(
            external_id=art.get("url", url),
            source_kind="news_api",
            content=f"{art.get('title','')} — {art.get('description','')}",
            author=art.get("author"),
            url=art.get("url", url),
            language="en",
            published_at=datetime.now(timezone.utc),
            metrics={},
        )

    async def fetch_comments(self, post_id: str) -> list[NormalizedComment]:
        return []

# PHASE-2-TODO: FacebookAdapter, YouTubeAdapter, TwitterAdapter, InstagramAdapter
