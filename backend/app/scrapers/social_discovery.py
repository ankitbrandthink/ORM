"""Social Discovery — keyword search via Twitter/X (Nitter) + YouTube (yt-dlp).

Searches social platforms for influencer accounts discussing a keyword, then
classifies their stance as Pro, Anti, or Mixed.

Supported platforms: Twitter/X, YouTube.
(Facebook/Instagram require official Meta API access with approved apps.)

Media/news outlet handles and non-social URLs are filtered automatically so
only genuine social-media voices appear in results.
"""
from __future__ import annotations

import json
import logging
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

logger = logging.getLogger("orm.social_discovery")

# ── Nitter instances (Twitter/X frontends) ────────────────────────────────────
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

# ── Handle-level filters ──────────────────────────────────────────────────────

_SKIP_HANDLES = {
    "search", "hashtag", "i", "intent", "home", "explore",
    "notifications", "messages", "twitter", "x", "AutoModerator",
    "[deleted]", "deleted", "dang", "pg", "hn",
}

# Substrings in a handle that signal a media/news/official account
_MEDIA_HANDLE_KEYWORDS = {
    "news", "media", "press", "channel", "tv", "fm", "radio", "live",
    "breaking", "alert", "update", "daily", "weekly", "times", "post",
    "report", "reporter", "journal", "gazette", "herald", "tribune",
    "review", "digest", "bulletin", "wire", "agency", "bureau", "official",
    "govt", "gov", "pib", "ministry", "spokesperson", "handle",
}

# Explicitly known media outlet handles to block
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
    # Tech/forum sites (not social influencers)
    "ycombinator", "hackernews", "hn_frontpage", "producthunt",
    "techcrunch", "theverge", "engadget", "arstechnica", "wired",
    "medium", "substack",
}

# ── URL-level filters (whitelist social platform domains) ─────────────────────

_ALLOWED_SOCIAL_DOMAINS = {
    "twitter.com", "x.com", "t.co",
    "youtube.com", "youtu.be",
    "facebook.com", "fb.com", "m.facebook.com",
    "instagram.com",
}


def is_valid_social_url(url: str) -> bool:
    """Return True if URL belongs to a known social platform (or is empty)."""
    if not url:
        return True
    try:
        from urllib.parse import urlparse
        netloc = urlparse(url).netloc.lower().lstrip("www.").lstrip("m.")
        return any(netloc == d or netloc.endswith("." + d) for d in _ALLOWED_SOCIAL_DOMAINS)
    except Exception:
        return True


# ── Stop words for keyword cluster extraction ─────────────────────────────────

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
    "co", "pic", "twitter", "com", "very", "been", "into", "over", "after",
    "said", "here", "there", "now", "only", "too", "even", "well", "back",
    "any", "good", "want", "look", "think", "know", "time", "year", "people",
    "way", "day", "man", "old", "great", "big", "video", "watch", "subscribe",
    "like", "share", "comment", "channel", "youtube", "instagram", "facebook",
}

# ── Check yt-dlp availability once at import ──────────────────────────────────
try:
    _ytdlp_check = subprocess.run(
        ["yt-dlp", "--version"], capture_output=True, timeout=5
    )
    _YTDLP_AVAILABLE = _ytdlp_check.returncode == 0
except Exception:
    _YTDLP_AVAILABLE = False


# ── Utility functions ─────────────────────────────────────────────────────────

def _is_media_handle(handle: str) -> bool:
    """Return True if the handle appears to be a media/news/official outlet."""
    h_lower = handle.lower().strip("@")
    # Exact match against known list
    if h_lower in _KNOWN_MEDIA_HANDLES:
        return True
    # Strip non-alpha chars for keyword matching
    h_clean = re.sub(r"[^a-z0-9]", "", h_lower)
    if h_clean in _KNOWN_MEDIA_HANDLES:
        return True
    # Keyword substring check on original (preserving underscores)
    return any(kw in h_lower for kw in _MEDIA_HANDLE_KEYWORDS)


def extract_keyword_clusters(posts: list[dict], top_n: int = 8) -> list[str]:
    """Extract top recurring keywords from posts' content."""
    all_text = " ".join(p.get("content", "") for p in posts).lower()
    all_text = re.sub(r"https?://\S+", " ", all_text)
    all_text = re.sub(r"[^a-zA-Z0-9#@\s]", " ", all_text)
    words = [
        w.strip("#@")
        for w in all_text.split()
        if len(w) > 2 and w.strip("#@") not in _STOP_WORDS and w.strip("#@").isalpha()
    ]
    return [w for w, _ in Counter(words).most_common(top_n)]


# ── Twitter/X via Nitter ──────────────────────────────────────────────────────

def _parse_nitter_rss(xml_text: str, seen_ids: set) -> list[dict]:
    """Parse Nitter RSS XML into tweet dicts; filters media handles."""
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
            handle, tweet_id = m.group(1), m.group(2)

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
                "profile_url": f"https://x.com/{handle}",
            })
        except Exception:
            continue
    return results


async def _fetch_twitter_followers_with_session(handle: str, session) -> Optional[int]:
    """Fetch Twitter follower count from a Nitter profile page (internal)."""
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


async def fetch_twitter_followers(handle: str) -> Optional[int]:
    """Public: fetch Twitter follower count for a handle via Nitter."""
    try:
        import httpx
        async with httpx.AsyncClient(
            headers=_TWITTER_HEADERS, timeout=12, follow_redirects=True
        ) as s:
            return await _fetch_twitter_followers_with_session(handle, s)
    except Exception:
        return None


# ── YouTube via yt-dlp ────────────────────────────────────────────────────────

async def search_youtube_keyword(keyword: str, limit: int = 15) -> list[dict]:
    """Search YouTube for videos about keyword using yt-dlp."""
    if not _YTDLP_AVAILABLE:
        logger.info("yt-dlp not available; YouTube search skipped")
        return []

    try:
        import asyncio

        def _run() -> subprocess.CompletedProcess:
            return subprocess.run(
                [
                    "yt-dlp",
                    f"ytsearch{limit}:{keyword}",
                    "--dump-json",
                    "--no-download",
                    "--flat-playlist",
                    "--no-warnings",
                    "--quiet",
                ],
                capture_output=True,
                text=True,
                timeout=45,
            )

        result = await asyncio.get_event_loop().run_in_executor(None, _run)

        posts: list[dict] = []
        seen_channels: set[str] = set()

        for line in result.stdout.strip().split("\n"):
            if not line.strip():
                continue
            try:
                video = json.loads(line)
                uploader = (video.get("uploader") or video.get("channel") or "").strip()
                channel_id = video.get("channel_id") or video.get("uploader_id") or ""
                vid_id = video.get("id") or ""
                title = (video.get("title") or "").strip()

                if not uploader or not vid_id or not title:
                    continue
                if _is_media_handle(uploader):
                    continue

                channel_key = channel_id or uploader
                if channel_key in seen_channels:
                    continue
                seen_channels.add(channel_key)

                handle = re.sub(r"[^a-zA-Z0-9_]", "", uploader.replace(" ", "_"))[:50] or f"yt_{vid_id[:8]}"
                channel_url = (
                    f"https://www.youtube.com/channel/{channel_id}"
                    if channel_id else f"https://www.youtube.com/@{handle}"
                )
                followers = video.get("channel_follower_count") or None

                posts.append({
                    "handle": handle,
                    "tweet_id": f"yt_{vid_id}",
                    "content": title[:500],
                    "url": f"https://www.youtube.com/watch?v={vid_id}",
                    "published_at": datetime.now(timezone.utc).isoformat(),
                    "platform": "youtube",
                    "followers_count": followers,
                    "profile_url": channel_url,
                })
            except Exception:
                continue

        logger.info("YouTube search: %d channels for '%s'", len(posts), keyword)
        return posts

    except Exception as e:
        logger.debug("YouTube search error: %s", e)
        return []


# ── Combined search (Twitter/X + YouTube) ────────────────────────────────────

async def search_twitter_keyword(keyword: str, limit: int = 40) -> list[dict]:
    """Search Twitter/X (via Nitter) + YouTube for influencer posts about keyword.

    Returns: list of dicts with keys:
      handle, content, url, published_at, platform, followers_count, profile_url
    Platforms returned: 'twitter', 'youtube'
    Media/news handles and non-social URLs are excluded automatically.
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

    async def fetch_nitter(session, base: str, kw: str) -> list[dict]:
        enc = kw.replace(" ", "+").replace("#", "%23").replace("@", "%40").replace('"', "%22")
        try:
            r = await session.get(f"{base}/search/rss?q={enc}&f=tweets", timeout=8)
            if r.status_code == 200 and "<item>" in r.text:
                return _parse_nitter_rss(r.text, set())
        except Exception as e:
            logger.debug("Nitter %s error for '%s': %s", base, kw, e)
        return []

    async with httpx.AsyncClient(
        headers=_TWITTER_HEADERS, timeout=12, follow_redirects=True
    ) as session:
        tasks: list = []
        tasks += [fetch_nitter(session, base, kw_clean) for base in _NITTER_INSTANCES]
        for variant in tw_variants[1:]:
            tasks += [fetch_nitter(session, _NITTER_INSTANCES[i], variant) for i in range(min(3, len(_NITTER_INSTANCES)))]
        batch = await asyncio.gather(*tasks, return_exceptions=True)

    twitter_results: list[dict] = []
    for res in batch:
        if not isinstance(res, list):
            continue
        for item in res:
            tid = item.get("tweet_id", "")
            if tid and tid not in seen_ids:
                seen_ids.add(tid)
                twitter_results.append(item)

    # YouTube search (up to 1/3 of limit)
    yt_limit = max(10, limit // 3)
    youtube_results = await search_youtube_keyword(kw_clean, limit=yt_limit)

    logger.info(
        "social_discovery: %d twitter + %d youtube posts for '%s'",
        len(twitter_results), len(youtube_results), kw_clean,
    )

    # Interleave: 2 twitter per 1 youtube
    merged: list[dict] = []
    ti, yi = 0, 0
    while len(merged) < limit and (ti < len(twitter_results) or yi < len(youtube_results)):
        for _ in range(2):
            if ti < len(twitter_results) and len(merged) < limit:
                merged.append(twitter_results[ti]); ti += 1
        if yi < len(youtube_results) and len(merged) < limit:
            merged.append(youtube_results[yi]); yi += 1

    return merged


# ── Stance classification ─────────────────────────────────────────────────────

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
    "refused", "ruthless", "authoritarian", "corruption",
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

    Uses Claude Haiku when api_key is set, falls back to lexicon otherwise.
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
