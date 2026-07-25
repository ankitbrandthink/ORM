"""OpenSearch stub — not required for core sentiment dashboard."""
from functools import lru_cache


POSTS_INDEX = "posts"
COMMENTS_INDEX = "comments"


class _StubClient:
    class indices:
        @staticmethod
        def exists(**kw): return True
        @staticmethod
        def create(**kw): pass
    def index(self, **kw): pass
    def search(self, **kw): return {"hits": {"hits": []}}


@lru_cache
def get_client():
    return _StubClient()


def ensure_indices(): pass
