import json
import logging
from typing import Optional

import httpx

from .base import BaseProvider, SENTIMENT_SYSTEM, SENTIMENT_PROMPT, _defaults, _extract_json

logger = logging.getLogger(__name__)


class ClaudeProvider(BaseProvider):
    provider_id = "claude"
    name = "Anthropic Claude"
    default_model = "claude-haiku-4-5-20251001"
    input_price_per_m = 0.80
    output_price_per_m = 4.00
    concurrency = 50

    async def _call_one(self, session: httpx.AsyncClient, text: str, api_key: str, model: str) -> Optional[dict]:
        try:
            body = json.dumps({
                "model": model,
                "max_tokens": 200,
                "system": SENTIMENT_SYSTEM,
                "messages": [{"role": "user", "content": SENTIMENT_PROMPT.format(text=text[:400])}],
            }, ensure_ascii=False).encode("utf-8")
            r = await session.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                content=body,
                timeout=15.0,
            )
            r.raise_for_status()
            data = r.json()
            parsed = _extract_json(data["content"][0]["text"])
            usage = data.get("usage", {})
            parsed["_input_tokens"] = usage.get("input_tokens", 0)
            parsed["_output_tokens"] = usage.get("output_tokens", 0)
            return _defaults(parsed, f"claude:{model}")
        except Exception as e:
            logger.warning("Claude error: %s", e)
            return None
