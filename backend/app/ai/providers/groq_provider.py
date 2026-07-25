import json
import logging
from typing import Optional

import httpx

from .base import BaseProvider, SENTIMENT_SYSTEM, SENTIMENT_PROMPT, _defaults, _extract_json

logger = logging.getLogger(__name__)


class GroqProvider(BaseProvider):
    provider_id = "groq"
    name = "Groq"
    default_model = "llama-3.1-8b-instant"
    input_price_per_m = 0.05
    output_price_per_m = 0.08
    free_daily_requests = 14_400
    concurrency = 20   # Groq rate-limits more aggressively

    async def _call_one(self, session: httpx.AsyncClient, text: str, api_key: str, model: str) -> Optional[dict]:
        try:
            r = await session.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SENTIMENT_SYSTEM},
                        {"role": "user", "content": SENTIMENT_PROMPT.format(text=text[:400])},
                    ],
                    "max_tokens": 200,
                    "response_format": {"type": "json_object"},
                },
                timeout=15.0,
            )
            r.raise_for_status()
            data = r.json()
            parsed = _extract_json(data["choices"][0]["message"]["content"])
            usage = data.get("usage", {})
            parsed["_input_tokens"] = usage.get("prompt_tokens", 0)
            parsed["_output_tokens"] = usage.get("completion_tokens", 0)
            return _defaults(parsed, f"groq:{model}")
        except Exception as e:
            logger.warning("Groq error: %s", e)
            return None
