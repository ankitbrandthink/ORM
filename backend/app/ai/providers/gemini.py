import json
import logging
from typing import Optional

import httpx

from .base import BaseProvider, SENTIMENT_SYSTEM, SENTIMENT_PROMPT, _defaults, _extract_json

logger = logging.getLogger(__name__)

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiProvider(BaseProvider):
    provider_id = "gemini"
    name = "Google Gemini"
    default_model = "gemini-2.0-flash-lite"
    input_price_per_m = 0.075
    output_price_per_m = 0.30
    free_daily_requests = 1_500
    concurrency = 30

    async def validate_key(self, api_key: str, model: str) -> bool:
        """Treat HTTP 429 (quota exceeded) as valid — the key authenticated, just rate-limited."""
        try:
            async with httpx.AsyncClient(timeout=12.0) as sess:
                r = await sess.post(
                    f"{_BASE}/{model}:generateContent?key={api_key}",
                    json={"contents": [{"parts": [{"text": "Say OK"}]}]},
                    timeout=12.0,
                )
                if r.status_code == 200:
                    return True
                if r.status_code == 429:
                    return True  # quota exceeded = key is valid
                return False
        except Exception:
            return False

    async def _call_one(self, session: httpx.AsyncClient, text: str, api_key: str, model: str) -> Optional[dict]:
        try:
            prompt = f"{SENTIMENT_SYSTEM}\n\n{SENTIMENT_PROMPT.format(text=text[:400])}"
            r = await session.post(
                f"{_BASE}/{model}:generateContent?key={api_key}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"responseMimeType": "application/json", "maxOutputTokens": 200},
                },
                timeout=15.0,
            )
            r.raise_for_status()
            data = r.json()
            raw = data["candidates"][0]["content"]["parts"][0]["text"]
            parsed = _extract_json(raw)
            meta = data.get("usageMetadata", {})
            parsed["_input_tokens"] = meta.get("promptTokenCount", 0)
            parsed["_output_tokens"] = meta.get("candidatesTokenCount", 0)
            return _defaults(parsed, f"gemini:{model}")
        except Exception as e:
            logger.warning("Gemini error: %s", e)
            return None
