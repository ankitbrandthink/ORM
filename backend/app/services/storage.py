"""Local filesystem storage — drop-in for dev/VPS without MinIO."""
import os
from functools import lru_cache

_BASE = os.getenv("STORAGE_DIR", "/var/www/orm/uploads")


class Storage:
    def __init__(self):
        self.bucket = "orm-files"
        os.makedirs(_BASE, exist_ok=True)

    def _path(self, key: str) -> str:
        p = os.path.join(_BASE, key.lstrip("/").replace("/", os.sep))
        os.makedirs(os.path.dirname(p), exist_ok=True)
        return p

    def put(self, key: str, data: bytes, content_type: str = "") -> None:
        with open(self._path(key), "wb") as f:
            f.write(data)

    def get(self, key: str) -> bytes:
        p = self._path(key)
        if not os.path.exists(p):
            return b""
        with open(p, "rb") as f:
            return f.read()

    def delete(self, key: str) -> None:
        p = self._path(key)
        if os.path.exists(p):
            os.remove(p)

    # Legacy aliases kept for any callers using old names
    def upload(self, key: str, data: bytes, content_type: str = "") -> None:
        self.put(key, data, content_type)

    def download(self, key: str) -> bytes:
        return self.get(key)

    def url(self, key: str) -> str:
        return ""


@lru_cache
def get_storage() -> Storage:
    return Storage()
