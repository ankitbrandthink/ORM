"""Post analysis: Ollama when available, heuristic fallback otherwise."""
import asyncio

from app.ai.model_router import model_chain
from app.ai.ollama_client import OllamaClient
from app.ai.prompt_templates import LEXICON_CONTEXT, POST_ANALYSIS_PROMPT

_CRISIS_TERMS = {"boycott", "scam", "fraud", "fire", "death", "protest", "ban", "lawsuit", "danga", "andolan"}
_POLITICAL = {"election", "party", "minister", "govt", "modi", "rahul", "vote", "neta"}


def heuristic_post(post_id: str, content: str) -> dict:
    low = (content or "").lower()
    crisis = min(1.0, sum(t in low for t in _CRISIS_TERMS) * 0.3)
    political_hits = sum(t in low for t in _POLITICAL)
    angle = "none" if political_hits == 0 else "low" if political_hits == 1 else \
            "medium" if political_hits == 2 else "high"
    topics = [w for w in {"product", "service", "price", "politics", "support"} if w in low]
    return {
        "post_id": post_id,
        "summary": (content or "")[:160],
        "main_narrative": topics[0] if topics else "general discussion",
        "topics": topics or ["general"],
        "intent": "complaint" if crisis > 0 else "discussion",
        "brand_mentions": [],
        "political_angle": angle,
        "crisis_probability": round(crisis, 2),
        "urgency_score": round(min(1.0, crisis + 0.1), 2),
        "language": "hi-en" if any(ord(c) > 127 for c in (content or "")) else "en",
        "virality_score": 0.3,
        "_engine": "heuristic",
    }


async def analyze_post(post_id: str, content: str) -> dict:
    client = OllamaClient()
    if await client.is_available():
        for model in model_chain("post_analysis"):
            prompt = POST_ANALYSIS_PROMPT.format(
                lexicon=LEXICON_CONTEXT, post_id=post_id, content=content)
            res = await client.generate(model, prompt)
            if res["ok"]:
                parsed = OllamaClient.parse_json(res["text"])
                if parsed:
                    parsed["_engine"] = f"ollama:{model}"
                    return parsed
    return heuristic_post(post_id, content)


def analyze_post_sync(post_id: str, content: str) -> dict:
    return asyncio.run(analyze_post(post_id, content))
