"""Deterministic mock adapter producing realistic English + Hinglish content."""
import hashlib
from datetime import datetime, timedelta, timezone

from app.scrapers.base_adapter import BaseAdapter, NormalizedComment, NormalizedPost

POST_SAMPLES = [
    "New product launch today! Pricing feels too high though. #brand",
    "Customer service ne aaj phir nirash kiya. Worst experience ever.",
    "Bahut badhiya update, loving the new features 🔥",
    "Why is the app crashing again? Fix it please.",
    "Masterstroke by the company raising prices 🙄",
    "Government ne naya scheme launch kiya for small businesses.",
    "Boycott trending after the latest controversy.",
    "Great support from the team, resolved my issue in minutes 🙏",
]

COMMENT_SAMPLES = [
    "Bahut badhiya!", "Worst service ever", "Masterstroke hai 😂", "Chal jhoothe",
    "Vah kya baat hai 🙏", "Pathetic experience", "Love this update 🔥",
    "Refund kab milega?", "Andhbhakt comment incoming", "Totally agree with this",
    "Scam company, beware", "Hope they fix it soon", "🤡🤡🤡", "Best in class!",
]


def _det(seed: str, n: int) -> int:
    return int(hashlib.md5(seed.encode()).hexdigest(), 16) % n


class MockAdapter(BaseAdapter):
    kind = "mock"

    async def fetch_post(self, url: str) -> NormalizedPost:
        idx = _det(url, len(POST_SAMPLES))
        return NormalizedPost(
            external_id=f"mock-{_det(url, 100000)}",
            source_kind="mock",
            content=POST_SAMPLES[idx],
            author=f"user_{_det(url, 999)}",
            url=url,
            language="hi-en",
            published_at=datetime.now(timezone.utc) - timedelta(hours=_det(url, 72)),
            metrics={"likes": _det(url, 5000), "shares": _det(url + "s", 500),
                     "views": _det(url + "v", 100000)},
        )

    async def fetch_comments(self, post_id: str, count: int = 200) -> list[NormalizedComment]:
        out = []
        for i in range(count):
            seed = f"{post_id}-{i}"
            out.append(NormalizedComment(
                external_id=f"c-{post_id}-{i}",
                content=COMMENT_SAMPLES[_det(seed, len(COMMENT_SAMPLES))],
                author=f"user_{_det(seed, 9999)}",
                language="hi-en",
                published_at=datetime.now(timezone.utc) - timedelta(minutes=_det(seed, 4320)),
            ))
        return out
