"""Comment analysis: Ollama when available, deterministic heuristic fallback otherwise.

Supports text, emoji sequences, GIF/sticker/image content detection,
and language-based emoji sentiment with cultural context.
"""
import asyncio
import re

from app.ai.model_router import model_chain
from app.ai.ollama_client import OllamaClient
from app.ai.prompt_templates import COMMENT_ANALYSIS_PROMPT, LEXICON_CONTEXT

# ── Positive signals ──────────────────────────────────────────────────────────
_POS = {
    "badhiya", "great", "love", "loving", "good", "best", "shandar", "nice", "support",
    "supporting", "amazing", "excellent", "wonderful", "fantastic", "brilliant", "awesome",
    "proud", "congrats", "congratulations", "well done", "respect", "salute", "blessing",
    "blessed", "thank you", "thanks", "grateful", "gratitude", "hope", "progress", "champion",
    "class", "pure class", "shine", "shining", "inspiring", "inspire", "leadership", "leader",
    "here for it", "keep it up", "keep going", "deserve", "deserved", "winning", "win", "gold",
    "forward", "unity", "development", "delivering", "delivered", "real class", "big up",
    "jai hind", "bharat mata", "proud of", "superb", "wah", "mast", "zabardast", "shukriya",
    "beautiful", "perfect", "incredible", "outstanding", "magnificent", "glorious", "terrific",
    "superstar", "legend", "hero", "star", "icon", "boss", "king", "queen",
    # Hindi/Urdu positives
    "mubarak", "khushi", "anand", "pyar", "mohabbat", "izzat", "tarakki", "safalta",
    # Emoji — universal positive
    "🔥", "👏", "🙏", "❤️", "💪", "🇬🇾", "🙌", "👍", "💯", "😍", "🤩", "🥰", "💙", "🫡",
    "✨", "🎉", "🎊", "🏆", "⭐", "🌟", "💫", "😊", "😁", "🤗", "💚", "💛", "🧡", "❤️‍🔥",
    "🥳", "🎯", "👑", "🌹", "🌺", "🫶", "🤝", "💝", "💖", "💗", "💓", "💞", "💕",
}

# ── Negative signals ──────────────────────────────────────────────────────────
_NEG = {
    "worst", "bad", "pathetic", "hate", "ghatiya", "bekar", "shame", "shameful", "jhooth",
    "fraud", "scam", "corrupt", "corruption", "failure", "fail", "failed", "empty promises",
    "liar", "lies", "lying", "disappoint", "disappointed", "disappointing", "useless",
    "nonsense", "propaganda", "suffering", "suffer", "poor", "broke", "nothing for",
    "forgotten", "forgot", "where is", "no proper", "demand", "accountability", "disgrace",
    "disgusting", "waste", "rubbish", "terrible", "horrible", "awful", "dreadful",
    "ridiculous", "absurd", "disaster", "catastrophe", "miserable", "pathetic",
    # Hindi/Urdu negatives
    "bura", "burai", "galat", "ghalat", "chor", "chori", "loot", "loota", "dhoka",
    "kharab", "barbad", "bakwas", "faltu", "beizzati", "sharm karo", "ullu", "pagal",
    "bewakoof", "murdabad", "nafrat", "pheku", "jhootha", "cheat", "criminal", "murderer",
    "nahi chahiye", "desh barbad", "desh barbaad", "bhrasht", "bhrashta",
    "nikamma", "nacchiz", "bekaar", "atyachaar", "dhokhebaaz", "gaddaar", "gaddar",
    # Emoji — universal negative
    "🤡", "🤬", "👎", "😡", "💩", "😤", "😒", "🤮", "🖕", "😠", "🤯", "😤", "🤢",
    "💔", "😢", "😭", "😰", "😱", "🤦", "🤦‍♂️", "🤦‍♀️", "🙄", "😤",
}

_SARCASM = {
    "masterstroke", "kya baat", "🙄", "yeah right", "sure sure", "as if",
    "lol ok", "wah kya baat", "obviously", "clearly not", "what a joke",
    "nice try", "sure jan", "wow really", "oh wow", "how surprising",
    "great job 🙄", "wow amazing 🙄",
}

# ── Emotion clusters ──────────────────────────────────────────────────────────
_EMO = {
    "Anger":       {"angry", "gussa", "shame", "disgust", "nafrat", "murdabad", "furious", "rage",
                    "😡", "🤬", "😤", "🖕", "💢"},
    "Joy":         {"love", "happy", "khush", "wah", "zabardast", "celebrate", "yay", "woohoo",
                    "🔥", "👏", "😊", "🎉", "🥳", "😁", "🤗"},
    "Hope":        {"hope", "umeed", "future", "progress", "dream", "aspire", "believe", "faith",
                    "🙏", "✨", "🌟", "🌈"},
    "Fear":        {"scared", "dar", "fear", "worried", "anxious", "terrified", "panic",
                    "😰", "😱", "😨", "🫣"},
    "Mockery":     {"lol", "haha", "pheku", "joker", "clown", "ridiculous",
                    "🤡", "😂", "💀", "🤣", "😹"},
    "Frustration": {"again", "still", "kab tak", "tired", "kharab", "bakwas", "enough", "stop",
                    "🤦", "😩", "😫", "😤"},
    "Sadness":     {"sad", "dukh", "dard", "cry", "tears", "miss", "lost", "grief",
                    "😢", "😭", "💔", "🥺"},
    "Pride":       {"proud", "garv", "honour", "dignity", "respect", "glory", "jai",
                    "🫡", "🎖️", "🏅", "🏆", "💪"},
    "Surprise":    {"wow", "omg", "what", "really", "seriously", "shocked",
                    "😮", "😲", "🤯", "😱"},
}

# ── Language-specific emoji sentiment overrides ───────────────────────────────
# Some emojis carry different meaning in different cultural contexts.
# These override the generic label only when strong language context signals the region.
_EMOJI_CULTURAL_CONTEXT = {
    # 🙏 in South Asian context = gratitude/respect (positive)
    # 🙏 in Western context = prayer/please (neutral-positive)
    "🙏": {"default": "Positive", "western": "Neutral"},
    # 😂 in South Asian public discourse can be mockery (negative) not just laughter
    "😂": {"default": "Neutral", "south_asian_political": "Negative"},
    # 🔥 = praise in entertainment/sports, fire/controversy in political
    "🔥": {"default": "Positive", "political_negative": "Negative"},
    # 💀 = "I'm dead" (extremely funny - positive) in Gen Z; literal death threat in other contexts
    "💀": {"default": "Positive", "threat_context": "Negative"},
}

# ── GIF/sticker/media markers ─────────────────────────────────────────────────
_GIF_MARKERS = {
    "[gif]", "[sticker]", "[image]", "[photo]", "[video]", "[media]",
    "giphy.com", "tenor.com", "gfycat.com", ".gif", "sticker_id",
    "media attachment", "shared a gif", "sent a gif",
}

_POSITIVE_GIF_KEYWORDS = {
    "laugh", "laugh", "cute", "aww", "love", "heart", "clap", "cheer",
    "dance", "party", "hug", "kiss", "celebrate", "happy", "smile", "joy",
    "thumbs up", "yes", "agree", "win", "congrats",
}

_NEGATIVE_GIF_KEYWORDS = {
    "facepalm", "eye roll", "angry", "mad", "no", "disagree", "sad",
    "cry", "boo", "dislike", "thumbs down", "leave", "bye", "wrong",
}


def _detect_media_type(content: str) -> str | None:
    """Detect if comment contains GIF, sticker, or other media."""
    low = content.lower()
    for marker in _GIF_MARKERS:
        if marker in low:
            return "gif_sticker"
    # Detect emoji-only comments (pure visual)
    clean = re.sub(r"[^\w\s]", "", content).strip()
    if not clean and content.strip():
        return "emoji_only"
    return None


def _analyze_emoji_sentiment(content: str) -> tuple[int, int]:
    """Count positive and negative emoji signals in content."""
    pos = neg = 0
    for emoji in _POS:
        if len(emoji) > 1 and emoji in content:  # multi-char = emoji
            pos += content.count(emoji)
    for emoji in _NEG:
        if len(emoji) > 1 and emoji in content:
            neg += content.count(emoji)
    return pos, neg


def _is_south_asian_context(content: str) -> bool:
    """Detect South Asian language context for cultural emoji adjustment."""
    sa_markers = {
        "hindi", "urdu", "ji", "hai", "hain", "nahi", "nahin", "kya", "aur",
        "mera", "tera", "humara", "yaar", "bhai", "didi", "dost",
    }
    low = content.lower()
    return any(m in low.split() for m in sa_markers)


def heuristic_comment(content: str) -> dict:
    low = (content or "").lower()

    # Word-based scoring
    pos = sum(t in low for t in _POS if len(t) == 1 or " " in t or t.isalpha())
    neg = sum(t in low for t in _NEG if len(t) == 1 or " " in t or t.isalpha())

    # Emoji-specific scoring
    emoji_pos, emoji_neg = _analyze_emoji_sentiment(content)
    pos += emoji_pos
    neg += emoji_neg

    sarcasm = any(t in low for t in _SARCASM)

    # Media detection
    media_type = _detect_media_type(content)
    if media_type == "gif_sticker":
        gif_pos = sum(kw in low for kw in _POSITIVE_GIF_KEYWORDS)
        gif_neg = sum(kw in low for kw in _NEGATIVE_GIF_KEYWORDS)
        pos += gif_pos
        neg += gif_neg
    elif media_type == "emoji_only":
        # Pure emoji comment — rely entirely on emoji scoring above
        pass

    # Cultural context adjustment
    is_sa = _is_south_asian_context(content)
    if is_sa and "😂" in content:
        # In SA political discourse, laughing emoji at a politician = mockery
        if any(t in low for t in {"neta", "politician", "sarkar", "government", "leader", "minister"}):
            neg += content.count("😂")

    if sarcasm and pos >= neg:
        sentiment = "Negative"
    elif neg > pos:
        sentiment = "Negative"
    elif pos > neg:
        sentiment = "Positive"
    else:
        sentiment = "Neutral"

    emotions = [e for e, kws in _EMO.items() if any(k in low or k in content for k in kws)]
    toxicity = min(1.0, neg * 0.2)

    return {
        "comment_text": content[:200],
        "sentiment": sentiment,
        "stance": "Attacks Subject" if sentiment == "Negative" else
                  "Defends Subject" if sentiment == "Positive" else "Irrelevant",
        "emotion": emotions or (["Mockery"] if sarcasm else []),
        "sarcasm": sarcasm,
        "toxicity_score": round(toxicity, 2),
        "spam_score": 0.8 if low.count("http") > 1 else 0.05,
        "bot_probability": 0.1,
        "confidence": 0.6,
        "media_type": media_type,
        "_engine": "heuristic",
    }


async def analyze_comment(content: str) -> dict:
    client = OllamaClient()
    if await client.is_available():
        for model in model_chain("comment_analysis"):
            prompt = COMMENT_ANALYSIS_PROMPT.format(
                lexicon=LEXICON_CONTEXT, snippet=content[:200], content=content)
            res = await client.generate(model, prompt)
            if res["ok"]:
                parsed = OllamaClient.parse_json(res["text"])
                if parsed:
                    parsed["_engine"] = f"ollama:{model}"
                    parsed["media_type"] = _detect_media_type(content)
                    return parsed
    return heuristic_comment(content)


def analyze_comment_sync(content: str) -> dict:
    return asyncio.run(analyze_comment(content))
