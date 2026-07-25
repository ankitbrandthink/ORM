"""Comment analysis: Ollama when available, deterministic heuristic fallback otherwise."""
import asyncio

from app.ai.model_router import model_chain
from app.ai.ollama_client import OllamaClient
from app.ai.prompt_templates import COMMENT_ANALYSIS_PROMPT, LEXICON_CONTEXT

_POS = {
    # generic praise (removed "bahut" — Hindi for "very", direction-neutral)
    "badhiya", "great", "love", "loving", "good", "best", "shandar", "nice", "support",
    "supporting", "amazing", "excellent", "wonderful", "fantastic", "brilliant", "awesome",
    "proud", "congrats", "congratulations", "well done", "respect", "salute", "blessing",
    "blessed", "thank you", "thanks", "grateful", "gratitude", "hope", "progress", "champion",
    "class", "pure class", "shine", "shining", "inspiring", "inspire", "leadership", "leader",
    "here for it", "keep it up", "keep going", "deserve", "deserved", "winning", "win", "gold",
    "forward", "unity", "development", "delivering", "delivered", "real class", "big up",
    "jai hind", "bharat mata", "proud of", "superb", "wah", "mast", "zabardast", "shukriya",
    # emoji
    "🔥", "👏", "🙏", "❤️", "💪", "🇬🇾", "🙌", "👍", "💯", "😍", "🤩", "🥰", "💙", "🫡",
}
_NEG = {
    "worst", "bad", "pathetic", "hate", "ghatiya", "bekar", "shame", "shameful", "jhooth",
    "fraud", "scam", "corrupt", "corruption", "failure", "fail", "failed", "empty promises",
    "liar", "lies", "lying", "disappoint", "disappointed", "disappointing", "useless",
    "nonsense", "propaganda", "suffering", "suffer", "poor", "broke", "nothing for",
    "forgotten", "forgot", "where is", "no proper", "demand", "accountability", "disgrace",
    "disgusting", "waste", "rubbish",
    # Hindi / Urdu negatives
    "bura", "burai", "galat", "ghalat", "chor", "chori", "loot", "loota", "dhoka",
    "kharab", "barbad", "bakwas", "faltu", "beizzati", "sharm karo", "ullu", "pagal",
    "bewakoof", "murdabad", "nafrat", "pheku", "jhootha", "cheat", "criminal", "murderer",
    "nahi chahiye", "desh barbad", "desh barbaad", "bhrasht", "bhrashta",
    "nikamma", "nacchiz", "bekaar", "atyachaar", "dhokhebaaz",
    # emoji
    "🤡", "🤬", "👎", "😡", "💩", "😤", "😒", "🤮", "🖕",
}
_SARCASM = {"masterstroke", "kya baat", "🙄", "yeah right", "sure sure", "as if", "lol ok", "wah kya baat"}
_EMO = {
    "Anger": {"angry", "gussa", "shame", "disgust", "nafrat", "murdabad"},
    "Joy": {"love", "happy", "khush", "🔥", "👏", "wah", "zabardast"},
    "Hope": {"hope", "umeed", "🙏"},
    "Fear": {"scared", "dar", "fear"},
    "Mockery": {"🤡", "lol", "haha", "😂", "pheku"},
    "Frustration": {"again", "still", "kab tak", "tired", "kharab", "bakwas"},
}


def heuristic_comment(content: str) -> dict:
    low = (content or "").lower()
    pos = sum(t in low for t in _POS)
    neg = sum(t in low for t in _NEG)
    sarcasm = any(t in low for t in _SARCASM)
    if sarcasm and pos >= neg:
        sentiment = "Negative"  # sarcastic praise reads negative
    elif neg > pos:
        sentiment = "Negative"
    elif pos > neg:
        sentiment = "Positive"
    else:
        sentiment = "Neutral"
    emotions = [e for e, kws in _EMO.items() if any(k in low for k in kws)]
    toxicity = min(1.0, neg * 0.25)
    return {
        "comment_text": content[:120],
        "sentiment": sentiment,
        "stance": "Attacks Subject" if sentiment == "Negative" else
                  "Defends Subject" if sentiment == "Positive" else "Irrelevant",
        "emotion": emotions or (["Mockery"] if sarcasm else []),
        "sarcasm": sarcasm,
        "toxicity_score": round(toxicity, 2),
        "spam_score": 0.8 if low.count("http") else 0.05,
        "bot_probability": 0.1,
        "confidence": 0.55,
        "_engine": "heuristic",
    }


async def analyze_comment(content: str) -> dict:
    client = OllamaClient()
    if await client.is_available():
        for model in model_chain("comment_analysis"):
            prompt = COMMENT_ANALYSIS_PROMPT.format(
                lexicon=LEXICON_CONTEXT, snippet=content[:120], content=content)
            res = await client.generate(model, prompt)
            if res["ok"]:
                parsed = OllamaClient.parse_json(res["text"])
                if parsed:
                    parsed["_engine"] = f"ollama:{model}"
                    return parsed
    return heuristic_comment(content)


def analyze_comment_sync(content: str) -> dict:
    return asyncio.run(analyze_comment(content))
