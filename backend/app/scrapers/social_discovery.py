"""Social Discovery — keyword-based influencer search via nitter RSS (no API key needed).

Searches Twitter/X for accounts talking about a keyword and classifies
their stance as Pro, Anti, or Mixed toward the entity.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

logger = logging.getLogger("orm.social_discovery")

_NITTER_INSTANCES = [
    "https://nitter.privacydev.net",
    "https://nitter.net",
    "https://nitter.cz",
    "https://nitter.unixfox.eu",
]

_RSS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-US,en;q=0.9",
}

# Handles to skip — platform noise, not real accounts
_SKIP_HANDLES = {"search", "hashtag", "i", "intent", "home", "explore", "notifications", "messages"}


async def search_twitter_keyword(keyword: str, limit: int = 40) -> list[dict]:
    """Search nitter RSS for tweets about keyword.

    Returns list of dicts: {handle, content, url, published_at (ISO str)}
    """
    try:
        import httpx
        import xml.etree.ElementTree as ET
    except ImportError:
        return []

    encoded = keyword.replace(" ", "+").replace("#", "%23").replace("@", "%40")
    results: list[dict] = []

    for base in _NITTER_INSTANCES:
        if len(results) >= limit:
            break
        try:
            url = f"{base}/search/rss?q={encoded}&f=tweets"
            async with httpx.AsyncClient(headers=_RSS_HEADERS, timeout=15, follow_redirects=True) as client:
                r = await client.get(url)
                if r.status_code != 200:
                    logger.debug("Nitter %s returned %s for keyword '%s'", base, r.status_code, keyword)
                    continue

                try:
                    root = ET.fromstring(r.text)
                except ET.ParseError:
                    continue

                for item in root.findall(".//item"):
                    if len(results) >= limit:
                        break
                    try:
                        title = (item.findtext("title") or "").strip()
                        link = (item.findtext("link") or "").strip()
                        pub_raw = item.findtext("pubDate") or ""
                        desc = (item.findtext("description") or "").strip()

                        # Nitter title format: "Handle: tweet content"
                        content = re.sub(r"^[^:]+:\s*", "", title, count=1).strip()
                        if not content and desc:
                            # strip HTML from description
                            content = re.sub(r"<[^>]+>", " ", desc).strip()[:500]
                        if not content or len(content) < 5:
                            continue

                        # Extract handle + tweet_id from nitter link:
                        # https://nitter.xyz/handle/status/12345#m
                        m = re.search(r"/([^/]+)/status/(\d+)", link)
                        if not m:
                            continue
                        handle = m.group(1)
                        tweet_id = m.group(2)

                        if handle.lower() in _SKIP_HANDLES:
                            continue

                        pub_at = datetime.now(timezone.utc)
                        if pub_raw:
                            try:
                                pub_at = parsedate_to_datetime(pub_raw).astimezone(timezone.utc)
                            except Exception:
                                pass

                        results.append({
                            "handle": handle,
                            "tweet_id": tweet_id,
                            "content": content[:500],
                            "url": f"https://x.com/{handle}/status/{tweet_id}",
                            "published_at": pub_at.isoformat(),
                        })
                    except Exception:
                        continue

                if results:
                    logger.info("social_discovery: found %d tweets for '%s' via %s", len(results), keyword, base)
                    break  # first working instance wins

        except Exception as e:
            logger.debug("Nitter %s search failed for '%s': %s", base, keyword, e)
            continue

    return results


# ── Lexicon-based stance detection (fast, no AI needed) ─────────────────────

_PRO_WORDS = {
    "support", "great", "love", "best", "excellent", "jai", "proud", "zindabad",
    "winner", "develop", "progress", "forward", "trust", "good", "strong", "right",
    "correct", "well done", "badhiya", "shandar", "mubarak", "bharat mata",
    "vote for", "choose", "elect", "back", "stand with", "with you", "amazing",
    "fantastic", "brilliant", "awesome", "respect", "salute", "leader", "vision",
}
_ANTI_WORDS = {
    "against", "oppose", "hate", "corrupt", "fraud", "bad", "worst", "anti",
    "murder", "criminal", "shame", "disaster", "fail", "liar", "bhrasht",
    "murdabad", "down with", "boycott", "nikamma", "gaddaar", "thief", "scam",
    "chor", "chori", "loot", "loota", "dhoka", "bakwas", "resign", "vote out",
    "remove", "out", "failed", "useless", "pathetic", "disgrace", "exposed",
    "arrest", "jail", "fake", "propaganda", "lies", "lying", "deceptive",
}


def _lexicon_stance(text: str, keyword: str) -> str:
    t = text.lower()
    pro = sum(1 for w in _PRO_WORDS if w in t)
    anti = sum(1 for w in _ANTI_WORDS if w in t)
    if anti > pro:
        return "Anti"
    if pro > anti:
        return "Pro"
    return "Mixed"


async def classify_stance(tweet_content: str, keyword: str, api_key: Optional[str] = None) -> str:
    """Classify a tweet's stance toward keyword as Pro, Anti, or Mixed.

    Uses Claude API (haiku) when api_key is available, otherwise lexicon fallback.
    """
    if api_key and api_key.startswith("sk-ant"):
        try:
            import httpx

            prompt = (
                f'A user posted this tweet about "{keyword}":\n\n'
                f'"{tweet_content[:300]}"\n\n'
                f'Is the author Pro (supportive/positive), Anti (critical/negative), '
                f'or Neutral toward "{keyword}"?\n'
                f'Reply with exactly one word: Pro, Anti, or Neutral.'
            )
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-haiku-4-5-20251001",
                        "max_tokens": 10,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                    timeout=10.0,
                )
                if r.status_code == 200:
                    word = r.json()["content"][0]["text"].strip().lower()
                    if "anti" in word:
                        return "Anti"
                    if "pro" in word or "support" in word or "posit" in word:
                        return "Pro"
                    return "Mixed"
        except Exception as e:
            logger.debug("Claude stance classification error: %s", e)

    return _lexicon_stance(tweet_content, keyword)
