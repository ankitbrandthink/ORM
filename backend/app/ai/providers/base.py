"""Base class for all AI sentiment providers."""
import asyncio
import json
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

SENTIMENT_SYSTEM = (
    "You are a sentiment classifier. Respond ONLY with valid JSON. "
    "No explanation, no markdown, just the JSON object."
)

SENTIMENT_PROMPT = """Classify the sentiment of the following social media comment.

Comment: {text}

Respond with exactly this JSON structure:
{{
  "sentiment": "Positive" | "Negative" | "Neutral",
  "confidence": 0.0-1.0,
  "emotion": ["Joy"|"Anger"|"Fear"|"Hope"|"Mockery"|"Frustration"|"Disgust"],
  "sarcasm": true|false,
  "toxicity_score": 0.0-1.0,
  "stance": "Defends Subject"|"Attacks Subject"|"Irrelevant"
}}"""


def _extract_json(raw: str) -> dict:
    """Parse a JSON object from model output, tolerating markdown fences and prose."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            return json.loads(raw[start:end + 1])
        raise


def _defaults(parsed: dict, engine: str) -> dict:
    parsed.setdefault("sentiment", "Neutral")
    parsed.setdefault("confidence", 0.8)
    parsed.setdefault("emotion", [])
    parsed.setdefault("sarcasm", False)
    parsed.setdefault("toxicity_score", 0.0)
    parsed.setdefault("stance", "Irrelevant")
    parsed.setdefault("_engine", engine)
    parsed.setdefault("_input_tokens", 0)
    parsed.setdefault("_output_tokens", 0)
    return parsed


class BaseProvider:
    provider_id: str = ""
    name: str = ""
    default_model: str = ""
    input_price_per_m: float = 0.0
    output_price_per_m: float = 0.0
    free_daily_requests: int = 0
    concurrency: int = 50

    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        return (input_tokens * self.input_price_per_m + output_tokens * self.output_price_per_m) / 1_000_000

    async def _call_one(self, session: httpx.AsyncClient, text: str, api_key: str, model: str) -> Optional[dict]:
        raise NotImplementedError

    async def analyze_batch(self, texts: list[str], api_key: str, model: str, concurrency: int = 0) -> list[Optional[dict]]:
        limit = concurrency or self.concurrency
        semaphore = asyncio.Semaphore(limit)

        async def bounded(text: str, sess: httpx.AsyncClient) -> Optional[dict]:
            async with semaphore:
                return await self._call_one(sess, text, api_key, model)

        async with httpx.AsyncClient(timeout=20.0) as sess:
            return await asyncio.gather(*[bounded(t, sess) for t in texts])

    async def validate_key(self, api_key: str, model: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=12.0) as sess:
                result = await self._call_one(sess, "This is a great policy decision.", api_key, model)
                return result is not None and "sentiment" in result
        except Exception:
            return False
