"""Social Discovery — keyword search via nitter (Twitter/X) + Mastodon.

Searches social platforms for influencer accounts discussing a keyword, then
classifies their stance as Pro, Anti, or Mixed toward the entity.

HackerNews intentionally excluded — it is a tech forum, not a social influencer
platform. Media/news outlet handles are also filtered out so only genuine social
media voices appear in results.

Data sources (no API keys required):
  • Nitter  — Twitter/X RSS (best effort; instances sometimes down)
  • Mastodon — mastodon.social accounts search (no auth needed)
"""
from __future__ import annotations

import json
import logging
import re
from collections import Counter
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

logger = logging.getLogger("orm.social_discovery")

# Twitter frontends — tried in parallel
_NITTER_INSTANCES = [
    "https://nitter.net",
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
    "https://nitter.1d4.us",
    "https://nitter.kavin.rocks",
    "https://xcancel.com",
    "https://nitter.tiekoetter.com",
    "https://nitter.moomoo.me",
    "https://nitter.cz",
    "https://nitter.rawbit.ninja",
]

_TWITTER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-US,en;q=0.9",
}

_MASTODON_HEADERS = {
    "User-Agent": "ORM-CMS/1.0 (social discovery bot)",
    "Accept": "application/json",
}

# Handles/usernames to always skip
_SKIP_HANDLES = {
    "search", "hashtag", "i", "intent", "home", "explore",
    "notifications", "messages", "twitter", "x", "AutoModerator",
    "[deleted]", "deleted", "dang", "pg", "hn",
}

# Keywords in a handle that indicate a media/news outlet — exclude these
_MEDIA_HANDLE_KEYWORDS = {
    "news", "media", "press", "channel", "tv", "fm", "radio", "live",
    "breaking", "alert", "update", "daily", "weekly", "times", "post",
    "report", "reporter", "journal", "gazette", "herald", "tribune",
    "review", "digest", "bulletin", "wire", "agency", "bureau",
}

# Known media outlet handles to exclude explicitly
_KNOWN_MEDIA_HANDLES = {
    "ndtv", "bbc", "bbcnews", "bbcbreaking", "cnn", "cnni", "cnnbrk",
    "aajtak", "abpnews", "intoday", "news18", "zeenews", "zeebusiness",
    "republicworld", "timesnow", "indiatoday", "thehindu", "hindustantimes",
    "livemint", "economictimes", "theprint", "scroll_in", "thewire_in",
    "firstpost", "newslaundry", "quint", "thequint", "navbharattimes",
    "punjabkesari", "amarujala", "jagran", "dainikbhaskar", "jansatta",
    "moneycontrol", "businesstoday", "businessstandard", "mint", "reuters",
    "afp", "apnews", "ians", "ani", "pti", "tnm", "outlookindia",
    "outlook", "downtoearth", "frontline", "indianexpress", "bloomberg",
    "guardian", "nytimes", "cnbc", "aljazeera", "wionews", "republic",
    "deccanherald", "deccanchronicle", "telegraphindia", "theweek",
    "mathrubhumi", "manorama", "asianetnews", "sbnation", "espn",
}

# Stop words for keyword cluster extraction
_STOP_WORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "will", "would", "could", "should", "may", "might",
    "this", "that", "these", "those", "i", "me", "my", "we", "our", "you",
    "your", "he", "she", "it", "they", "their", "what", "which", "who",
    "with", "from", "not", "no", "by", "so", "if", "as", "of", "than",
    "then", "just", "also", "more", "about", "up", "out", "all", "one",
    "can", "get", "got", "its", "new", "like", "via", "how", "when", "why",
    "her", "him", "his", "them", "https", "http", "www", "rt", "amp",
    "co", "pic", "twitter", "com", "that", "this", "very", "been", "into",
    "over", "after", "said", "here", "there", "now", "only", "too", "even",
    "well", "back", "any", "good", "want", "look", "think", "know", "time",
    "year", "people", "way", "day", "man", "old", "great", "big",
}


def _is_media_handle(handle: str) -> bool:
    """Return True if the handle appears to be a media/news outlet."""
    h = handle.lower().strip("@")
    if h in _KNOWN_MEDIA_HANDLES:
        return True
    # Check for media keywords embedded in the handle
    return any(kw in h for kw in _MEDIA_HANDLE_KEYWORDS)


def extract_keyword_clusters(posts: list[dict], top_n: int = 8) -> list[str]:
    """Extract top recurring keywords from a list of posts' content."""
    all_text = " ".join(p.get("content", "") for p in posts).lower()
    all_text = re.sub(r"https?://\S+", " ", all_text)
    all_text = re.sub(r"[^a-zA-Z0-9#@\s]", " ", all_text)
    words = [
        w.strip("#@")
        for w in all_text.split()
        if len(w) > 2 and w.strip("#@") not in _STOP_WORDS and w.strip("#@").isalpha()
    ]
    counts = Counter(words)
    return [w for w, _ in counts.most_common(top_n)]


# ── Twitter/X via nitter ─────────────────────────────────────────────────────

def _parse_nitter_rss(xml_text: str, seen_ids: set) -> list[dict]:
    """Parse nitter RSS XML and return tweet dicts (filters media handles)."""
    import xml.etree.ElementTree as ET
    results = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    for item in root.findall(".//item"):
        try:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub_raw = item.findtext("pubDate") or ""
            desc = (item.findtext("description") or "").strip()

            content = re.sub(r"^[^:]+:\s*", "", title, count=1).strip()
            if not content and desc:
                content = re.sub(r"<[^>]+>", " ", desc).strip()[:500]
            if not content or len(content) < 5:
                continue

            m = re.search(r"/([^/]+)/status/(\d+)", link)
            if not m:
                continue
            handle = m.group(1)
            tweet_id = m.group(2)

            if handle.lower() in _SKIP_HANDLES:
                continue
            if _is_media_handle(handle):
                continue
            if tweet_id in seen_ids:
                continue
            seen_ids.add(tweet_id)

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
                "platform": "twitter",
                "followers_count": None,
            })
        except Exception:
            continue
    return results


# ── Mastodon via mastodon.social accounts API ─────────────────────────────────

def _parse_mastodon_accounts(json_text: str, keyword: str) -> list[dict]:
    """Parse Mastodon accounts search response into pseudo-post dicts."""
    results = []
    try:
        accounts = json.loads(json_text)
        if not isinstance(accounts, list):
            return []
        for acc in accounts:
            username = (acc.get("username") or "").strip()
            if not username or username.lower() in _SKIP_HANDLES:
                continue
            if _is_media_handle(username):
                continue
            display_name = (acc.get("display_name") or username).strip()
            note = re.sub(r"<[^>]+>", " ", acc.get("note") or "").strip()[:300]
            content = f"{display_name}: {note}" if note else display_name
            acc_url = acc.get("url") or f"https://mastodon.social/@{username}"
            followers = acc.get("followers_count", 0) or 0
            results.append({
                "handle": username,
                "tweet_id": f"masto_{username}",
                "content": content or f"Mastodon account discussing {keyword}",
                "url": acc_url,
                "published_at": datetime.now(timezone.utc).isoformat(),
                "platform": "mastodon",
                "followers_count": followers,
            })
    except Exception as e:
        logger.debug("Mastodon accounts parse error: %s", e)
    return results


async def _fetch_twitter_followers(handle: str, session) -> Optional[int]:
    """Try to get Twitter follower count from a Nitter profile page."""
    for base in _NITTER_INSTANCES[:3]:
        try:
            r = await session.get(f"{base}/{handle}", timeout=6)
            if r.status_code == 200:
                m = re.search(r'(\d[\d,.]+[KMk]?)\s*[Ff]ollowers', r.text)
                if not m:
                    m = re.search(r'followers[^>]*>\s*([0-9,.]+[KMk]?)', r.text)
                if m:
                    raw = m.group(1).replace(",", "").strip()
                    if raw.upper().endswith("K"):
                        return int(float(raw[:-1]) * 1_000)
                    if raw.upper().endswith("M"):
                        return int(float(raw[:-1]) * 1_000_000)
                    if raw.isdigit():
                        return int(raw)
        except Exception:
            continue
    return None


# ── Combined search ───────────────────────────────────────────────────────────

async def search_twitter_keyword(keyword: str, limit: int = 40) -> list[dict]:
    """Search Twitter/X (via nitter) + Mastodon for influencer posts about keyword.

    Returns list of dicts: {handle, content, url, published_at, platform, followers_count}
    Media/news outlet handles are automatically excluded.
    """
    try:
        import asyncio
        import httpx
    except ImportError:
        return []

    kw_clean = keyword.strip()
    slug = re.sub(r"[^a-zA-Z0-9]", "", kw_clean)

    tw_variants = [kw_clean]
    if slug and not kw_clean.startswith("#") and slug.lower() != kw_clean.lower():
        tw_variants.append(f"#{slug}")
    if " " in kw_clean and len(kw_clean) <= 25:
        tw_variants.append(f'"{kw_clean}"')

    seen_ids: set = set()
    results: list[dict] = []

    async def fetch_nitter(session, base: str, kw: str) -> list[dict]:
        enc = kw.replace(" ", "+").replace("#", "%23").replace("@", "%40").replace('"', "%22")
        url = f"{base}/search/rss?q={enc}&f=tweets"
        try:
            r = await session.get(url, timeout=8)
            if r.status_code == 200 and "<item>" in r.text:
                return _parse_nitter_rss(r.text, set())
        except Exception as e:
            logger.debug("Nitter %s error for '%s': %s", base, kw, e)
        return []

    async def fetch_mastodon_accounts(session, kw: str) -> list[dict]:
        try:
            enc = kw.replace(" ", "+")
            url = f"https://mastodon.social/api/v2/search?q={enc}&type=accounts&limit=20&resolve=false"
            r = await session.get(url, timeout=10, headers=_MASTODON_HEADERS)
            if r.status_code == 200:
                data = json.loads(r.text)
                accounts = data.get("accounts", [])
                return _parse_mastodon_accounts(json.dumps(accounts), kw)
        except Exception as e:
            logger.debug("Mastodon accounts error for '%s': %s", kw, e)
        return []

    async with httpx.AsyncClient(
        headers=_TWITTER_HEADERS, timeout=12, follow_redirects=True
    ) as session:
        tasks: list = []

        # All nitter instances × primary keyword
        tasks += [fetch_nitter(session, base, kw_clean) for base in _NITTER_INSTANCES]

        # Hashtag + quoted variants on first 3 nitter instances
        for variant in tw_variants[1:]:
            tasks += [
                fetch_nitter(session, _NITTER_INSTANCES[i], variant)
                for i in range(min(3, len(_NITTER_INSTANCES)))
            ]

        # Mastodon
        tasks.append(fetch_mastodon_accounts(session, kw_clean))
        if slug and slug.lower() != kw_clean.lower():
            tasks.append(fetch_mastodon_accounts(session, slug))

        batch = await asyncio.gather(*tasks, return_exceptions=True)

    for res in batch:
        if not isinstance(res, list):
            continue
        for item in res:
            tid = item.get("tweet_id", "")
            if tid and tid not in seen_ids:
                seen_ids.add(tid)
                results.append(item)

    twitter_results = [r for r in results if r.get("platform") == "twitter"]
    mastodon_results = sorted(
        [r for r in results if r.get("platform") == "mastodon"],
        key=lambda x: x.get("followers_count") or 0,
        reverse=True,
    )

    logger.info(
        "social_discovery: %d posts for '%s' (twitter=%d, mastodon=%d)",
        len(results), kw_clean, len(twitter_results), len(mastodon_results),
    )

    # Interleave Twitter first, then Mastodon
    merged: list[dict] = []
    ti, mi = 0, 0
    while len(merged) < limit and (ti < len(twitter_results) or mi < len(mastodon_results)):
        if ti < len(twitter_results):
            merged.append(twitter_results[ti]); ti += 1
        if mi < len(mastodon_results) and len(merged) < limit:
            merged.append(mastodon_results[mi]); mi += 1
    return merged


# ── Lexicon-based stance detection ───────────────────────────────────────────

_PRO_WORDS = {
    "support", "great", "love", "best", "excellent", "jai", "proud", "zindabad",
    "winner", "develop", "progress", "forward", "trust", "good", "strong", "right",
    "correct", "well done", "badhiya", "shandar", "mubarak", "bharat mata",
    "vote for", "choose", "elect", "back", "stand with", "with you", "amazing",
    "fantastic", "brilliant", "awesome", "respect", "salute", "leader", "vision",
    "growth", "achievement", "success", "win", "victory", "praise", "approve",
}
_ANTI_WORDS = {
    "against", "oppose", "hate", "corrupt", "fraud", "bad", "worst", "anti",
    "murder", "criminal", "shame", "disaster", "fail", "liar", "bhrasht",
    "murdabad", "down with", "boycott", "nikamma", "gaddaar", "thief", "scam",
    "chor", "chori", "loot", "loota", "dhoka", "bakwas", "resign", "vote out",
    "remove", "out", "failed", "useless", "pathetic", "disgrace", "exposed",
    "arrest", "jail", "fake", "propaganda", "lies", "lying", "deceptive",
    "incompetent", "terrible", "horrible", "outrage", "protest", "demand",
    "refused", "ruthless", "authoritarian", "corrupt", "corruption",
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
    """Classify content's stance toward keyword as Pro, Anti, or Mixed.

    Uses Claude Haiku when api_key is set, otherwise lexicon fallback.
    """
    if api_key and api_key.startswith("sk-ant"):
        try:
            import httpx

            prompt = (
                f'A user posted this content about "{keyword}":\n\n'
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
