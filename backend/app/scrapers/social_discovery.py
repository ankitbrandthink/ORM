"""Social Discovery — keyword search via nitter (Twitter/X) + Reddit RSS (no API key needed).

Searches Twitter/X and Reddit for accounts talking about a keyword, classifies
their stance as Pro, Anti, or Mixed toward the entity.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

logger = logging.getLogger("orm.social_discovery")

# Twitter frontends — tried in parallel; more instances = better coverage
_NITTER_INSTANCES = [
    "https://nitter.net",
    "https://nitter.privacydev.net",
    "https://nitter.cz",
    "https://nitter.poast.org",
    "https://nitter.1d4.us",
    "https://nitter.kavin.rocks",
    "https://xcancel.com",
    "https://nitter.tiekoetter.com",
    "https://nitter.moomoo.me",
    "https://nitter.rawbit.ninja",
]

_TWITTER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-US,en;q=0.9",
}

_REDDIT_HEADERS = {
    "User-Agent": "ORM-CMS/1.0 (social discovery bot; contact admin)",
    "Accept": "application/json",
}

# Handles to skip — platform noise
_SKIP_HANDLES = {
    "search", "hashtag", "i", "intent", "home", "explore",
    "notifications", "messages", "twitter", "x", "AutoModerator",
    "[deleted]", "deleted",
}


# ── Twitter/X via nitter ─────────────────────────────────────────────────────

def _parse_nitter_rss(xml_text: str, seen_ids: set) -> list[dict]:
    """Parse nitter RSS XML and return tweet dicts (skips seen_ids)."""
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
            })
        except Exception:
            continue
    return results


# ── Reddit ───────────────────────────────────────────────────────────────────

def _parse_reddit_json(json_text: str) -> list[dict]:
    """Parse Reddit search JSON API response into post dicts."""
    results = []
    try:
        data = json.loads(json_text)
        posts = data.get("data", {}).get("children", [])
        for post in posts:
            d = post.get("data", {})
            author = (d.get("author") or "").strip()
            if not author or author.lower() in _SKIP_HANDLES:
                continue
            title = (d.get("title") or "").strip()
            selftext = (d.get("selftext") or "").strip()
            content = (title + (" — " + selftext if selftext else "")).strip()[:500]
            if not content or len(content) < 5:
                continue
            post_id = d.get("id", "")
            if not post_id:
                continue
            subreddit = d.get("subreddit", "")
            permalink = d.get("permalink", "")
            url = (
                f"https://reddit.com{permalink}"
                if permalink
                else f"https://reddit.com/r/{subreddit}/comments/{post_id}"
            )
            created = d.get("created_utc", 0)
            pub_at = (
                datetime.fromtimestamp(float(created), tz=timezone.utc)
                if created
                else datetime.now(timezone.utc)
            )
            results.append({
                "handle": author,
                "tweet_id": f"reddit_{post_id}",
                "content": content,
                "url": url,
                "published_at": pub_at.isoformat(),
                "platform": "reddit",
                "subreddit": subreddit,
                "score": d.get("score", 0),
            })
    except Exception as e:
        logger.debug("Reddit JSON parse error: %s", e)
    return results


# ── Combined search ───────────────────────────────────────────────────────────

async def search_twitter_keyword(keyword: str, limit: int = 40) -> list[dict]:
    """Search Twitter/X (via nitter) + Reddit for posts about keyword.

    All sources are queried in parallel for speed.
    Returns list of dicts: {handle, content, url, published_at, platform}
    """
    try:
        import asyncio
        import httpx
    except ImportError:
        return []

    kw_clean = keyword.strip()
    slug = re.sub(r"[^a-zA-Z0-9]", "", kw_clean)

    # Build keyword variants for Twitter
    tw_variants = [kw_clean]
    if slug and not kw_clean.startswith("#") and slug.lower() != kw_clean.lower():
        tw_variants.append(f"#{slug}")
    if " " in kw_clean and len(kw_clean) <= 25:
        tw_variants.append(f'"{kw_clean}"')

    seen_ids: set = set()
    results: list[dict] = []

    async def fetch_nitter(session: "httpx.AsyncClient", base: str, kw: str) -> list[dict]:
        enc = kw.replace(" ", "+").replace("#", "%23").replace("@", "%40").replace('"', "%22")
        url = f"{base}/search/rss?q={enc}&f=tweets"
        try:
            r = await session.get(url, timeout=8)
            if r.status_code == 200 and "<item>" in r.text:
                return _parse_nitter_rss(r.text, set())
        except Exception as e:
            logger.debug("Nitter %s error for '%s': %s", base, kw, e)
        return []

    async def fetch_reddit(
        session: "httpx.AsyncClient", kw: str, subreddit: str = ""
    ) -> list[dict]:
        try:
            enc = kw.replace(" ", "+").replace('"', "%22")
            if subreddit:
                url = (
                    f"https://www.reddit.com/r/{subreddit}/search.json"
                    f"?q={enc}&sort=new&restrict_sr=on&limit=25&t=month"
                )
            else:
                url = f"https://www.reddit.com/search.json?q={enc}&sort=new&limit=25&t=month"
            r = await session.get(url, timeout=12, headers=_REDDIT_HEADERS)
            if r.status_code == 200:
                return _parse_reddit_json(r.text)
        except Exception as e:
            logger.debug("Reddit fetch error for '%s' (r/%s): %s", kw, subreddit or "*", e)
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

        # Reddit — general + India-focused + world subreddits
        tasks.append(fetch_reddit(session, kw_clean))
        tasks.append(fetch_reddit(session, kw_clean, "india"))
        tasks.append(fetch_reddit(session, kw_clean, "worldnews"))
        tasks.append(fetch_reddit(session, kw_clean, "IndiaSpeaks"))
        tasks.append(fetch_reddit(session, kw_clean, "IndiaOpen"))
        # Also try slug (no spaces) if different from keyword
        if slug and slug.lower() != kw_clean.lower():
            tasks.append(fetch_reddit(session, slug))
            tasks.append(fetch_reddit(session, slug, "india"))

        batch = await asyncio.gather(*tasks, return_exceptions=True)

    for res in batch:
        if not isinstance(res, list):
            continue
        for item in res:
            tid = item.get("tweet_id", "")
            if tid and tid not in seen_ids:
                seen_ids.add(tid)
                results.append(item)

    # Sort Reddit by score desc, Twitter by recency (already ordered by nitter)
    twitter_results = [r for r in results if r.get("platform") == "twitter"]
    reddit_results = sorted(
        [r for r in results if r.get("platform") == "reddit"],
        key=lambda x: x.get("score", 0),
        reverse=True,
    )

    tw_count, rd_count = len(twitter_results), len(reddit_results)
    if results:
        logger.info(
            "social_discovery: %d posts for '%s' (twitter=%d, reddit=%d)",
            len(results), kw_clean, tw_count, rd_count,
        )
    else:
        logger.info("social_discovery: no posts found for '%s'", kw_clean)

    # Interleave: prefer Twitter, pad with Reddit
    merged: list[dict] = []
    ti, ri = 0, 0
    while len(merged) < limit and (ti < len(twitter_results) or ri < len(reddit_results)):
        if ti < len(twitter_results):
            merged.append(twitter_results[ti]); ti += 1
        if ri < len(reddit_results) and len(merged) < limit:
            merged.append(reddit_results[ri]); ri += 1
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
