"""Social Discovery — keyword search via Claude AI + web search + yt-dlp.

Instagram/Facebook chain:
  1. Claude Haiku — generates known handles with stance (primary, no IP blocking)
  2. Brave HTML search — extracts IG/FB handles from Brave results
  3. Startpage (Google proxy) — additional web fallback
  4. Bing/DDG — kept as last resort but often blocked from datacenter IPs

Twitter/X search chain: Bing HTML → Nitter keyword search → DuckDuckGo HTML.
YouTube: yt-dlp ytsearch with relaxed channel-name filtering.

Media/news outlet handles are filtered automatically.
"""
from __future__ import annotations

import json
import logging
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote_plus

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

_BING_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}

# ── Handle-level filters ──────────────────────────────────────────────────────

_SKIP_HANDLES = {
    "search", "hashtag", "i", "intent", "home", "explore",
    "notifications", "messages", "twitter", "x", "AutoModerator",
    "[deleted]", "deleted", "dang", "pg", "hn",
}

# Substrings in a Twitter *handle* (short slug) that signal media/news accounts.
# NOTE: do NOT apply this to YouTube channel display names — they legitimately
# contain words like "channel", "live", "daily", "update".
_MEDIA_HANDLE_KEYWORDS = {
    "news", "media", "press", "channel", "tv", "fm", "radio", "live",
    "breaking", "alert", "update", "daily", "weekly", "times", "post",
    "report", "reporter", "journal", "gazette", "herald", "tribune",
    "review", "digest", "bulletin", "wire", "agency", "bureau", "official",
    "govt", "gov", "pib", "ministry", "spokesperson", "handle",
}

# Explicitly known media outlet handles / display-names to block on all platforms
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
    "france24", "dw", "dworldnews", "voanews", "rferl", "abc", "nbc", "cbs",
    "foxnews", "skynews", "euronews", "rt", "xinhua", "cgtn", "nhk",
    "abcnews", "nbcnews", "cbsnews", "msnbc",
    # Indian regional & Hindi news
    "lallantop", "navjivanindia", "newsncr", "newsnation", "thenewsminute",
    "thelogicalindian", "storypick", "swarajyamag", "opindia",
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


# ── yt-dlp binary detection (lazy + module-level) ────────────────────────────

def _find_ytdlp() -> Optional[str]:
    """Locate yt-dlp binary, trying common paths. Returns path or None."""
    for candidate in [
        "/usr/local/bin/yt-dlp",
        "/usr/bin/yt-dlp",
        "yt-dlp",
        "/home/www-data/.local/bin/yt-dlp",
        "/root/.local/bin/yt-dlp",
    ]:
        try:
            r = subprocess.run(
                [candidate, "--version"],
                capture_output=True, timeout=8,
            )
            if r.returncode == 0:
                logger.info("social_discovery: yt-dlp found at %s", candidate)
                return candidate
        except Exception:
            continue
    return None


# Module-level probe (best-effort; falls back to per-call detection in search_youtube_keyword)
_YTDLP_PATH: Optional[str] = _find_ytdlp()
_YTDLP_AVAILABLE = _YTDLP_PATH is not None


# ── Utility functions ─────────────────────────────────────────────────────────

def _is_media_handle(handle: str, strict: bool = False) -> bool:
    """Return True if the handle/name appears to be a media/news/official outlet.

    strict=True  — only check against the explicit _KNOWN_MEDIA_HANDLES set.
                   Use for YouTube channel *display names* which legitimately
                   contain words like 'channel', 'live', 'daily', 'update'.
    strict=False — also check _MEDIA_HANDLE_KEYWORDS substrings (for Twitter
                   short-handles where those words are reliable signals).
    """
    h_lower = handle.lower().strip("@")
    # Exact match
    if h_lower in _KNOWN_MEDIA_HANDLES:
        return True
    # Strip non-alpha chars for normalised check
    h_clean = re.sub(r"[^a-z0-9]", "", h_lower)
    if h_clean in _KNOWN_MEDIA_HANDLES:
        return True
    if strict:
        return False
    # Substring keyword check (Twitter handles only)
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


# ── Bing HTML search for Twitter/X (primary) ─────────────────────────────────

async def _search_bing_twitter(keyword: str, limit: int, session) -> list[dict]:
    """Search Bing for Twitter/X handles/posts about keyword.

    Bing is less aggressive about blocking datacenter IPs than DuckDuckGo.
    Extracts tweet URLs and profile handles from Bing search result HTML.
    """
    from html import unescape

    results: list[dict] = []
    seen_ids: set = set()

    queries = [
        f'site:twitter.com "{keyword}"',
        f'site:x.com "{keyword}"',
        f'site:twitter.com {keyword}',
    ]

    tweet_pattern = re.compile(
        r'https?://(?:twitter\.com|x\.com)/([A-Za-z0-9_]{1,50})/status/(\d{5,25})'
    )

    for query in queries:
        if len(results) >= limit:
            break
        try:
            url = f"https://www.bing.com/search?q={quote_plus(query)}&count=50&setlang=en-US"
            r = await session.get(url, headers=_BING_HEADERS, timeout=15)
            if r.status_code not in (200, 202):
                logger.debug("Bing returned %d for '%s'", r.status_code, query)
                continue

            html = r.text
            for handle, tweet_id in tweet_pattern.findall(html):
                if len(results) >= limit:
                    break
                if handle.lower() in _SKIP_HANDLES:
                    continue
                if _is_media_handle(handle):
                    continue
                if tweet_id in seen_ids:
                    continue
                seen_ids.add(tweet_id)

                snippet = ""
                url_pos = html.find(f"/{handle}/status/{tweet_id}")
                if url_pos >= 0:
                    nearby = html[max(0, url_pos - 300):url_pos + 600]
                    snippet = re.sub(r"<[^>]+>", " ", nearby)
                    snippet = re.sub(r"\s+", " ", snippet).strip()
                    snippet = unescape(snippet)[:400]
                if not snippet or len(snippet) < 15:
                    snippet = f"Post about {keyword}"

                results.append({
                    "handle": handle,
                    "tweet_id": tweet_id,
                    "content": snippet,
                    "url": f"https://x.com/{handle}/status/{tweet_id}",
                    "published_at": datetime.now(timezone.utc).isoformat(),
                    "platform": "twitter",
                    "followers_count": None,
                    "profile_url": f"https://x.com/{handle}",
                })

        except Exception as e:
            logger.debug("Bing search error for '%s': %s", query, e)
            continue

    logger.info("Bing: %d results for '%s'", len(results), keyword)
    return results


# ── Nitter keyword search (secondary Twitter source) ─────────────────────────

async def _search_nitter_keyword(keyword: str, limit: int, session) -> list[dict]:
    """Search Nitter instances for tweets about keyword.

    Tries multiple Nitter instances and search paths. Returns as soon as one
    instance yields results.
    """
    results: list[dict] = []
    seen_ids: set = set()

    tweet_url_pattern = re.compile(
        r'href="/([A-Za-z0-9_]{1,50})/status/(\d{5,25})"'
    )
    content_pattern = re.compile(
        r'<div[^>]*class="[^"]*tweet-content[^"]*"[^>]*>(.*?)</div>',
        re.DOTALL,
    )

    search_paths = [
        f"/search?q={quote_plus(keyword)}&f=tweets",
        f"/search?q={quote_plus(keyword)}",
    ]

    for base in _NITTER_INSTANCES:
        if len(results) >= limit:
            break
        for path in search_paths:
            try:
                r = await session.get(
                    f"{base}{path}",
                    headers=_TWITTER_HEADERS,
                    timeout=12,
                )
                if r.status_code != 200:
                    continue

                html = r.text
                if "tweet-content" not in html and "timeline-item" not in html:
                    continue

                handles_ids = tweet_url_pattern.findall(html)
                contents = content_pattern.findall(html)

                for i, (handle, tweet_id) in enumerate(handles_ids):
                    if len(results) >= limit:
                        break
                    if handle.lower() in _SKIP_HANDLES:
                        continue
                    if _is_media_handle(handle):
                        continue
                    if tweet_id in seen_ids:
                        continue
                    seen_ids.add(tweet_id)

                    content = ""
                    if i < len(contents):
                        content = re.sub(r"<[^>]+>", " ", contents[i])
                        content = re.sub(r"\s+", " ", content).strip()[:400]
                    if not content:
                        content = f"Tweet about {keyword}"

                    results.append({
                        "handle": handle,
                        "tweet_id": tweet_id,
                        "content": content,
                        "url": f"https://x.com/{handle}/status/{tweet_id}",
                        "published_at": datetime.now(timezone.utc).isoformat(),
                        "platform": "twitter",
                        "followers_count": None,
                        "profile_url": f"https://x.com/{handle}",
                    })

                if results:
                    logger.info(
                        "Nitter (%s): %d results for '%s'", base, len(results), keyword
                    )
                    break

            except Exception as e:
                logger.debug("Nitter (%s%s) error for '%s': %s", base, path, keyword, e)
                continue

        if results:
            break

    return results


# ── DuckDuckGo HTML search (fallback, often blocked from datacenter IPs) ─────

async def _search_duckduckgo_twitter(keyword: str, limit: int, session) -> list[dict]:
    """Search DuckDuckGo HTML for Twitter/X posts about keyword (fallback)."""
    from html import unescape

    results: list[dict] = []
    seen_ids: set = set()

    queries = [
        f'site:twitter.com "{keyword}"',
        f'site:x.com "{keyword}"',
        f'site:twitter.com {keyword}',
    ]

    ddg_headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        "DNT": "1",
    }

    url_pattern = r'https?://(?:twitter\.com|x\.com)/([A-Za-z0-9_]{1,50})/status/(\d{5,25})'

    for query in queries:
        if len(results) >= limit:
            break
        try:
            enc_q = query.replace(" ", "+").replace('"', "%22")
            r = await session.get(
                f"https://html.duckduckgo.com/html/?q={enc_q}&kl=us-en",
                headers=ddg_headers, timeout=12,
            )
            if r.status_code != 200:
                continue

            html = r.text
            for handle, tweet_id in re.findall(url_pattern, html):
                if len(results) >= limit:
                    break
                if handle.lower() in _SKIP_HANDLES:
                    continue
                if _is_media_handle(handle):
                    continue
                if tweet_id in seen_ids:
                    continue
                seen_ids.add(tweet_id)

                snippet = ""
                url_pos = html.find(f"/{handle}/status/{tweet_id}")
                if url_pos >= 0:
                    nearby = html[max(0, url_pos - 300):url_pos + 600]
                    snippet = re.sub(r"<[^>]+>", " ", nearby)
                    snippet = re.sub(r"\s+", " ", snippet).strip()
                    snippet = unescape(snippet)[:400]
                if not snippet or len(snippet) < 15:
                    snippet = f"Post about {keyword}"

                results.append({
                    "handle": handle,
                    "tweet_id": tweet_id,
                    "content": snippet,
                    "url": f"https://x.com/{handle}/status/{tweet_id}",
                    "published_at": datetime.now(timezone.utc).isoformat(),
                    "platform": "twitter",
                    "followers_count": None,
                    "profile_url": f"https://x.com/{handle}",
                })

        except Exception as e:
            logger.debug("DuckDuckGo Twitter search error for '%s': %s", query, e)
            continue

    logger.info("DuckDuckGo: %d tweets found for '%s'", len(results), keyword)
    return results


# ── Nitter profile follower count ─────────────────────────────────────────────

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
    """Search YouTube for videos about keyword using yt-dlp.

    Channel display names are filtered against _KNOWN_MEDIA_HANDLES only
    (strict mode) — keyword substrings like 'channel', 'live', 'daily' are
    intentionally NOT used for YouTube because many legitimate political
    commentary channels contain these words in their display name.
    """
    # Lazy detection: if module-level probe failed, retry here
    ytdlp_path = _YTDLP_PATH or _find_ytdlp()
    if not ytdlp_path:
        logger.info("yt-dlp not available; YouTube search skipped")
        return []

    try:
        import asyncio

        def _run() -> subprocess.CompletedProcess:
            return subprocess.run(
                [
                    ytdlp_path,
                    f"ytsearch{limit}:{keyword}",
                    "--dump-json",
                    "--no-download",
                    "--flat-playlist",
                    "--no-warnings",
                    "--quiet",
                ],
                capture_output=True,
                text=True,
                timeout=60,
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

                # strict=True: only block explicitly known media outlets,
                # not keyword matches on display names
                if _is_media_handle(uploader, strict=True):
                    logger.debug("YouTube: skipping known media '%s'", uploader)
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


# ── Combined search: Bing → Nitter → DDG (Twitter) + yt-dlp (YouTube) ────────

async def search_twitter_keyword(keyword: str, limit: int = 40) -> list[dict]:
    """Search Twitter/X + YouTube for influencer posts about keyword.

    Twitter/X source chain (stops when enough results found):
      1. Bing HTML search  — least blocked from datacenter IPs
      2. Nitter keyword search — direct Twitter frontend scrape
      3. DuckDuckGo HTML  — often blocked but kept as last resort

    YouTube:
      yt-dlp ytsearch with strict (known-list-only) media filtering so
      legitimate political commentary channels are not excluded.

    Returns list of dicts with keys:
      handle, content, url, published_at, platform, followers_count, profile_url
    """
    try:
        import asyncio
        import httpx
    except ImportError:
        return []

    kw_clean = keyword.strip()
    tw_limit = max(20, limit * 2 // 3)
    yt_limit = max(10, limit // 3)

    async with httpx.AsyncClient(
        headers=_TWITTER_HEADERS, timeout=15, follow_redirects=True
    ) as session:
        # Run YouTube in parallel with the first Twitter search attempt
        bing_task = _search_bing_twitter(kw_clean, tw_limit, session)
        yt_task = search_youtube_keyword(kw_clean, limit=yt_limit)
        twitter_results, youtube_results = await asyncio.gather(bing_task, yt_task)

        # Fallback 1: Nitter — if Bing gave fewer than half the needed results
        if len(twitter_results) < tw_limit // 2:
            remaining = tw_limit - len(twitter_results)
            logger.info(
                "Bing gave %d/%d results; trying Nitter for '%s'",
                len(twitter_results), tw_limit, kw_clean,
            )
            nitter_results = await _search_nitter_keyword(kw_clean, remaining, session)
            twitter_results.extend(nitter_results)

        # Fallback 2: DuckDuckGo — last resort
        if len(twitter_results) < 5:
            remaining = tw_limit - len(twitter_results)
            logger.info(
                "Nitter gave insufficient results; trying DuckDuckGo for '%s'", kw_clean
            )
            ddg_results = await _search_duckduckgo_twitter(kw_clean, remaining, session)
            twitter_results.extend(ddg_results)

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


# ── Instagram / Facebook discovery ────────────────────────────────────────────

# URL path segments that are NOT Instagram usernames
_INSTAGRAM_SKIP_PATHS = {
    "p", "reel", "tv", "reels", "explore", "accounts", "stories", "direct",
    "directory", "about", "help", "privacy", "terms", "legal", "api",
    "static", "cdn-cgi", "images", "video", "safety", "challenge", "embed",
    "s", "ar", "en", "hi", "web", "graphql", "ajax", "music", "audio",
    "hashtag", "location", "tags",
}

# URL path segments that are NOT Facebook page names
_FACEBOOK_SKIP_PATHS = {
    "pages", "groups", "events", "marketplace", "watch", "gaming", "stories",
    "fundraisers", "help", "privacy", "terms", "legal", "business", "ads",
    "developer", "media", "dialog", "photo", "video", "share", "sharer",
    "plugins", "permalink", "login", "logout", "register", "settings",
    "notifications", "home", "people", "search", "about", "hashtag", "pg",
    "photos", "videos", "posts", "profile.php", "story.php",
}

_WEB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
    "Cache-Control": "no-cache",
}


async def _discover_handles_via_claude(
    keyword: str, platform: str, api_key: str, limit: int = 15
) -> list[dict]:
    """Use Claude Haiku to discover known IG/FB influencer handles for keyword.

    Claude has trained knowledge of prominent Indian political social media
    accounts, making it reliable where datacenter-IP-blocked web search fails.
    Returns handles pre-annotated with stance and a content description that
    the existing classify_stance() function can re-verify.
    """
    import httpx

    plat_label = "Instagram" if platform == "instagram" else "Facebook"
    prompt = (
        f"You are an Indian political social media analyst.\n"
        f"List {limit} real, currently active {plat_label} accounts that are "
        f"known to discuss \"{keyword}\" in Indian politics.\n\n"
        f"Return ONLY a JSON array (no other text) where each object has:\n"
        f'  "handle": username without @ (letters, digits, dots, underscores)\n'
        f'  "platform": "{platform}"\n'
        f'  "stance": "Pro" or "Anti" toward "{keyword}"\n'
        f'  "content": 1-sentence description of what they post about "{keyword}"\n\n'
        f"Rules:\n"
        f"- Include political commentators, activists, party workers, influencers\n"
        f"- Exclude official news orgs (NDTV, ABP, Zee, etc.)\n"
        f"- Mix of Pro and Anti voices\n"
        f"- Handles must be real alphanumeric usernames, no spaces\n"
        f"- Return ONLY the JSON array, nothing else"
    )

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 2000,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            if r.status_code != 200:
                logger.warning("Claude discovery: HTTP %d", r.status_code)
                return []

            text = r.json()["content"][0]["text"].strip()
            json_match = re.search(r"\[.*\]", text, re.DOTALL)
            if not json_match:
                logger.warning("Claude discovery: no JSON array in response")
                return []

            items = json.loads(json_match.group(0))
            results: list[dict] = []
            seen: set = set()

            for item in items:
                handle = str(item.get("handle", "")).strip().lstrip("@")
                plat = str(item.get("platform", platform)).lower()
                if not handle or plat not in ("instagram", "facebook"):
                    continue
                if not re.match(r"^[A-Za-z0-9_.]{3,50}$", handle):
                    continue
                if handle.lower() in seen:
                    continue
                seen.add(handle.lower())

                content = str(item.get("content", f"Account discussing {keyword}"))
                stance_hint = str(item.get("stance", "Mixed"))
                # Embed stance hint in content so classify_stance() picks it up
                full_content = f"[{stance_hint} toward {keyword}] {content}"

                if plat == "instagram":
                    profile_url = f"https://www.instagram.com/{handle}/"
                else:
                    profile_url = f"https://www.facebook.com/{handle}/"

                results.append({
                    "handle": handle,
                    "tweet_id": f"ai_{plat}_{handle}",
                    "content": full_content,
                    "url": profile_url,
                    "published_at": datetime.now(timezone.utc).isoformat(),
                    "platform": plat,
                    "followers_count": None,
                    "profile_url": profile_url,
                })

            logger.info(
                "Claude discovery: %d %s handles for '%s'",
                len(results), platform, keyword,
            )
            return results[:limit]

    except Exception as e:
        logger.error("Claude handle discovery error: %s", e)
        return []


def _extract_ig_fb_handles_from_html(html: str, keyword: str) -> list[dict]:
    """Extract Instagram and Facebook handles from any search engine HTML response."""
    from html import unescape

    results: list[dict] = []
    seen: set = set()

    ig_pat = re.compile(r'instagram\.com/([A-Za-z0-9_.]{3,50})(?:[/?"\'\s>&#]|$)', re.IGNORECASE)
    fb_pat = re.compile(r'facebook\.com/([A-Za-z0-9_.]{3,100})(?:[/?"\'\s>&#]|$)', re.IGNORECASE)
    ig_post_pat = re.compile(r'https?://(?:www\.)?instagram\.com/(?:p|reel|tv)/([A-Za-z0-9_-]{5,})', re.IGNORECASE)

    for handle in ig_pat.findall(html):
        if handle.lower() in _INSTAGRAM_SKIP_PATHS:
            continue
        if _is_media_handle(handle, strict=True):
            continue
        key = f"instagram:{handle.lower()}"
        if key in seen:
            continue
        seen.add(key)

        pos = html.find(f"instagram.com/{handle}")
        snippet = ""
        if pos >= 0:
            raw = html[max(0, pos - 100):pos + 300]
            stripped = re.sub(r"<[^>]+>", " ", raw)
            stripped = re.sub(r"^[^<]*?>", " ", stripped)  # remove partial-tag remnant at start
            chunk = unescape(stripped)
            snippet = re.sub(r"\s+", " ", chunk).strip()[:250]
        snippet = snippet or f"Instagram account posting about {keyword}"

        results.append({
            "handle": handle,
            "tweet_id": f"ig_{handle}",
            "content": snippet,
            "url": f"https://www.instagram.com/{handle}/",
            "published_at": datetime.now(timezone.utc).isoformat(),
            "platform": "instagram",
            "followers_count": None,
            "profile_url": f"https://www.instagram.com/{handle}/",
        })

    for handle in fb_pat.findall(html):
        h_lower = handle.lower()
        if h_lower in _FACEBOOK_SKIP_PATHS:
            continue
        if h_lower.startswith(("profile.php", "sharer", "dialog", "story.php")):
            continue
        if _is_media_handle(handle, strict=True):
            continue
        key = f"facebook:{h_lower}"
        if key in seen:
            continue
        seen.add(key)

        pos = html.find(f"facebook.com/{handle}")
        snippet = ""
        if pos >= 0:
            raw = html[max(0, pos - 100):pos + 300]
            stripped = re.sub(r"<[^>]+>", " ", raw)
            stripped = re.sub(r"^[^<]*?>", " ", stripped)  # remove partial-tag remnant at start
            chunk = unescape(stripped)
            snippet = re.sub(r"\s+", " ", chunk).strip()[:250]
        snippet = snippet or f"Facebook page posting about {keyword}"

        results.append({
            "handle": handle,
            "tweet_id": f"fb_{handle}",
            "content": snippet,
            "url": f"https://www.facebook.com/{handle}/",
            "published_at": datetime.now(timezone.utc).isoformat(),
            "platform": "facebook",
            "followers_count": None,
            "profile_url": f"https://www.facebook.com/{handle}/",
        })

    return results


async def _search_web_ig_fb(keyword: str, limit: int, session) -> list[dict]:
    """Try multiple search engines for IG/FB handles — falls back gracefully.

    Tries (in order): Brave HTML, Startpage, Yandex, DuckDuckGo HTML, Bing.
    Most block datacenter IPs with site: operators; we try without site: too.
    """
    results: list[dict] = []
    seen_handles: set = set()

    def _merge(new_items: list[dict]) -> None:
        for item in new_items:
            k = f"{item['platform']}:{item['handle'].lower()}"
            if k not in seen_handles:
                seen_handles.add(k)
                results.append(item)

    # Build search queries — both site: restricted and plain
    engines = [
        # Brave HTML (works better from datacenter IPs than Bing/DDG)
        (
            f"https://search.brave.com/search?q={quote_plus('instagram OR facebook ' + keyword + ' India influencer')}&source=web",
            {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "Accept": "text/html"},
        ),
        # Startpage (Google proxy — often works)
        (
            f"https://www.startpage.com/search?q={quote_plus('instagram.com OR facebook.com ' + keyword + ' India')}&language=english",
            {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0", "Accept": "text/html"},
        ),
        # Yandex (often less aggressive about datacenter IPs)
        (
            f"https://yandex.com/search/?text={quote_plus('site:instagram.com ' + keyword)}&lr=213",
            {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36", "Accept": "text/html"},
        ),
        # Bing without site: operator
        (
            f"https://www.bing.com/search?q={quote_plus('instagram.com ' + keyword + ' India influencer')}&count=30",
            _BING_HEADERS,
        ),
        # DuckDuckGo HTML
        (
            f"https://html.duckduckgo.com/html/?q={quote_plus('instagram ' + keyword + ' India site:instagram.com')}&kl=in-en",
            {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36", "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9"},
        ),
    ]

    for url, hdrs in engines:
        if len(results) >= limit:
            break
        try:
            r = await session.get(url, headers=hdrs, timeout=12)
            if r.status_code in (200, 202) and len(r.text) > 5000:
                found = _extract_ig_fb_handles_from_html(r.text, keyword)
                if found:
                    logger.info("Web search (%s): %d handles", url[:40], len(found))
                    _merge(found)
        except Exception as e:
            logger.debug("Web search error (%s): %s", url[:40], e)
            continue

    return results[:limit]


async def search_instagram_facebook_keyword(keyword: str, limit: int = 30) -> list[dict]:
    """Discover Instagram & Facebook handles discussing keyword.

    Strategy:
    1. Claude Haiku (primary) — reliable, no IP blocking, trained knowledge of
       Indian political social media landscape. Returns handles with stance hints.
    2. Web search fallback — Brave, Startpage, Yandex, DDG, Bing (in order).
       These often work when the `site:` operator is not used.

    Results are deduplicated and merged; Claude results come first.
    """
    try:
        import asyncio
        import httpx
    except ImportError:
        return []

    kw_clean = keyword.strip()
    per = max(10, limit // 2)

    # ── Step 1: Claude AI discovery (primary) ────────────────────────────────
    api_key: Optional[str] = None
    try:
        from app.config import settings
        key = getattr(settings, "ANTHROPIC_API_KEY", "")
        if key and key.startswith("sk-ant"):
            api_key = key
    except Exception:
        pass

    claude_ig: list[dict] = []
    claude_fb: list[dict] = []
    if api_key:
        claude_ig, claude_fb = await asyncio.gather(
            _discover_handles_via_claude(kw_clean, "instagram", api_key, per),
            _discover_handles_via_claude(kw_clean, "facebook", api_key, per),
        )
        logger.info(
            "Claude discovery: %d ig + %d fb for '%s'",
            len(claude_ig), len(claude_fb), kw_clean,
        )
    else:
        logger.warning("No Anthropic API key — Claude discovery skipped for '%s'", kw_clean)

    # ── Step 2: Web search fallback (supplementary) ──────────────────────────
    web_results: list[dict] = []
    try:
        async with httpx.AsyncClient(
            headers=_WEB_HEADERS, timeout=15, follow_redirects=True
        ) as session:
            web_results = await _search_web_ig_fb(kw_clean, per, session)
    except Exception as e:
        logger.debug("Web fallback error for '%s': %s", kw_clean, e)

    # ── Merge: Claude first, then web extras not already found ───────────────
    seen: set = set()
    merged: list[dict] = []

    # Interleave ig/fb from Claude
    for ig, fb in zip(claude_ig, claude_fb):
        for item in (ig, fb):
            k = f"{item['platform']}:{item['handle'].lower()}"
            if k not in seen:
                seen.add(k)
                merged.append(item)
    for item in claude_ig[len(claude_fb):] + claude_fb[len(claude_ig):]:
        k = f"{item['platform']}:{item['handle'].lower()}"
        if k not in seen:
            seen.add(k)
            merged.append(item)

    # Append web-found handles not already in Claude results
    for item in web_results:
        k = f"{item['platform']}:{item['handle'].lower()}"
        if k not in seen:
            seen.add(k)
            merged.append(item)

    logger.info(
        "social_discovery: %d ig+fb total for '%s' (claude=%d, web=%d)",
        len(merged), kw_clean,
        len(claude_ig) + len(claude_fb), len(web_results),
    )
    return merged[:limit]


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
    # Honour the [Pro/Anti toward X] hint embedded by Claude discovery
    hint = re.search(r'\[(pro|anti|mixed)\s+toward\s+', t)
    if hint:
        h = hint.group(1)
        if h == "pro":
            return "Pro"
        if h == "anti":
            return "Anti"
        return "Mixed"
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
