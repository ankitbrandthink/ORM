"""Async client for a local Ollama server with graceful offline fallback."""
import json
import time

import httpx

from app.config import settings


class OllamaClient:
    def __init__(self, base_url: str | None = None):
        self.base_url = base_url or settings.OLLAMA_BASE_URL

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2) as c:
                r = await c.get(f"{self.base_url}/api/tags")
                return r.status_code == 200
        except Exception:  # noqa: BLE001
            return False

    async def generate(self, model: str, prompt: str, system: str | None = None,
                       json_mode: bool = True, timeout: float = 60.0) -> dict:
        """Return {text, latency_ms, model, ok, error}."""
        payload = {"model": model, "prompt": prompt, "stream": False}
        if system:
            payload["system"] = system
        if json_mode:
            payload["format"] = "json"
        started = time.time()
        try:
            async with httpx.AsyncClient(timeout=timeout) as c:
                r = await c.post(f"{self.base_url}/api/generate", json=payload)
                r.raise_for_status()
                data = r.json()
            return {"text": data.get("response", ""),
                    "latency_ms": int((time.time() - started) * 1000),
                    "model": model, "ok": True, "error": None}
        except Exception as e:  # noqa: BLE001
            return {"text": "", "latency_ms": int((time.time() - started) * 1000),
                    "model": model, "ok": False, "error": str(e)}

    @staticmethod
    def parse_json(text: str) -> dict | None:
        try:
            return json.loads(text)
        except Exception:  # noqa: BLE001
            # try to extract first {...} block
            start, end = text.find("{"), text.rfind("}")
            if start >= 0 and end > start:
                try:
                    return json.loads(text[start:end + 1])
                except Exception:  # noqa: BLE001
                    return None
            return None
