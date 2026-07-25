"""
Claude API client for sentiment analysis.
Replaces Ollama — 100ms per call, fully parallel, ~$0.50/day at 1k comments.
Uses claude-haiku-4-5-20251001 (fastest + cheapest Anthropic model).
"""
import asyncio
import json
import logging
from typing import Optional

import httpx

from app.config import settings

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


async def _call_claude(session: httpx.AsyncClient, text: str) -> dict:
    """Single Claude Haiku call — returns parsed sentiment dict."""
    payload = {
        "model": settings.CLAUDE_SENTIMENT_MODEL,
        "max_tokens": 150,
        "system": SENTIMENT_SYSTEM,
        "messages": [{"role": "user", "content": SENTIMENT_PROMPT.format(text=text[:400])}],
    }
    try:
        r = await session.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            content=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            timeout=15.0,
        )
        r.raise_for_status()
        data = r.json()
        from app.ai.providers.base import _extract_json
        raw = data["content"][0]["text"].strip()
        parsed = _extract_json(raw)
        # Normalise fields
        parsed.setdefault("sentiment", "Neutral")
        parsed.setdefault("confidence", 0.8)
        parsed.setdefault("emotion", [])
        parsed.setdefault("sarcasm", False)
        parsed.setdefault("toxicity_score", 0.0)
        parsed.setdefault("stance", "Irrelevant")
        parsed["_engine"] = f"claude:{settings.CLAUDE_SENTIMENT_MODEL}"
        # Track token usage
        usage = data.get("usage", {})
        parsed["_input_tokens"] = usage.get("input_tokens", 0)
        parsed["_output_tokens"] = usage.get("output_tokens", 0)
        return parsed
    except Exception as e:
        logger.warning("Claude API error for text snippet: %s", e)
        return None


async def analyze_batch(texts: list[str], concurrency: int = 50) -> list[Optional[dict]]:
    """
    Analyze a list of comment texts in parallel using Claude Haiku.
    Returns one result dict per text (None on failure — caller should fall back to heuristic).
    concurrency=50 → ~50 simultaneous HTTP requests → processes 1k comments in ~3 seconds.
    """
    if not settings.ANTHROPIC_API_KEY:
        return [None] * len(texts)

    semaphore = asyncio.Semaphore(concurrency)

    async def bounded(text: str, session: httpx.AsyncClient) -> Optional[dict]:
        async with semaphore:
            return await _call_claude(session, text)

    async with httpx.AsyncClient(timeout=20.0) as session:
        tasks = [bounded(t, session) for t in texts]
        return await asyncio.gather(*tasks)


async def analyze_single(text: str) -> Optional[dict]:
    """Convenience wrapper for a single comment."""
    results = await analyze_batch([text])
    return results[0] if results else None


def is_available() -> bool:
    """True if an Anthropic API key is configured."""
    return bool(settings.ANTHROPIC_API_KEY and settings.ANTHROPIC_API_KEY.startswith("sk-ant"))
