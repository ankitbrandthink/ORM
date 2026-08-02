"""Common normalized schema + adapter interface."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import AsyncGenerator


@dataclass
class NormalizedPost:
    external_id: str
    source_kind: str
    content: str
    author: str | None = None
    url: str | None = None
    language: str | None = None
    published_at: datetime | None = None
    metrics: dict = field(default_factory=dict)


@dataclass
class NormalizedComment:
    external_id: str
    content: str
    author: str | None = None
    author_url: str | None = None
    language: str | None = None
    published_at: datetime | None = None


class BaseAdapter(ABC):
    kind: str = "base"

    @abstractmethod
    async def fetch_post(self, url: str) -> NormalizedPost: ...

    @abstractmethod
    async def fetch_comments(self, post_id: str) -> list[NormalizedComment]: ...

    async def stream_new_comments(self, post_id: str) -> AsyncGenerator[NormalizedComment, None]:
        for c in await self.fetch_comments(post_id):
            yield c
