"""Tiny in-process TTL cache for hot read endpoints.

Per-worker (no cross-process invalidation) — acceptable for short TTLs
on data that changes rarely, like the client/account list.
"""
import time
from threading import Lock
from typing import Any, Optional


class TTLCache:
    def __init__(self, ttl: float = 60.0, max_entries: int = 512):
        self.ttl = ttl
        self.max_entries = max_entries
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            hit = self._store.get(key)
            if not hit:
                return None
            expires, value = hit
            if time.monotonic() > expires:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            if len(self._store) >= self.max_entries:
                self._store.clear()
            self._store[key] = (time.monotonic() + self.ttl, value)

    def invalidate(self, prefix: str = "") -> None:
        with self._lock:
            if not prefix:
                self._store.clear()
            else:
                for k in [k for k in self._store if k.startswith(prefix)]:
                    del self._store[k]
