"""Social Discovery — keyword search via nitter (Twitter/X) + HackerNews + Mastodon.

Searches multiple social platforms for accounts discussing a keyword, then
classifies their stance as Pro, Anti, or Mixed toward the entity.

Data sources (no API keys required, VPS-accessible):
  • Nitter  — Twitter/X RSS (best effort; instances sometimes down)
  • HackerNews — Algolia search API (reliable, no auth)
  • Mastodon — mastodon.social accounts search (no auth needed)
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

_HN_HEADERS = {
    "User-Agent": "ORM-CMS/1.0 (keyword monitoring bot)",
    "Accept": "application/json",
}

_MASTODON_HEADERS = {
    "User-Agent": "ORM-CMS/1.0 (social discovery bot)",
    "Accept": "application/json",
}

# Handles/usernames to skip — noise accounts
_SKIP_HANDLES = {
    "search", "hashtag", "i", "intent", "home", "explore",
    "notifications", "messages", "twitter", "x", "AutoModerator",
    "[deleted]", "deleted", "dang", "pg", "hn",
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


# ── HackerNews via Algolia API ────────────────────────────────────────────────

def _parse_hn_json(json_text: str) -> list[dict]:
    """Parse HackerNews Algolia search response into post dicts."""
    results = []
    try:
        data = json.loads(json_text)
        hits = data.get("hits", [])
        for hit in hits:
            author = (hit.get("author") or "").strip()
            if not author or author.lower() in _SKIP_HANDLES:
                continue
            title = (hit.get("title") or "").strip()
            story_url = (hit.get("url") or "").strip()
            content = title
            if story_url:
                content = f"{title} — {story_url}"[:500]
            if not content or len(content) < 5:
                continue
            obj_id = hit.get("objectID", "")
            if not obj_id:
                continue
            created = hit.get("created_at", "")
            pub_at = datetime.now(timezone.utc)
            if created:
                try:
                    pub_at = datetime.fromisoformat(created.replace("Z", "+00:00"))
                except Exception:
                    pass
            results.append({
                "handle": author,
                "tweet_id": f"hn_{obj_id}",
                "content": content,
                "url": f"https://news.ycombinator.com/item?id={obj_id}",
                "published_at": pub_at.isoformat(),
                "platform": "hackernews",
                "score": hit.get("points", 0) or 0,
            })
    except Exception as e:
        logger.debug("HackerNews JSON parse error: %s", e)
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
                "score": followers,
            })
    except Exception as e:
        logger.debug("Mastodon accounts parse error: %s", e)
    return results


# ── Combined search ───────────────────────────────────────────────────────────

async def search_twitter_keyword(keyword: str, limit: int = 40) -> list[dict]:
    """Search Twitter/X (via nitter) + HackerNews + Mastodon for posts about keyword.

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

    async def fetch_hackernews(session: "httpx.AsyncClient", kw: str, recent: bool = False) -> list[dict]:
        """Search HackerNews via Algolia API (reliable, no IP blocking)."""
        try:
            enc = kw.replace(" ", "+").replace('"', "%22")
            endpoint = "search_by_date" if recent else "search"
            url = f"https://hn.algolia.com/api/v1/{endpoint}?query={enc}&tags=story&hitsPerPage=25"
            r = await session.get(url, timeout=10, headers=_HN_HEADERS)
            if r.status_code == 200:
                return _parse_hn_json(r.text)
        except Exception as e:
            logger.debug("HackerNews fetch error for '%s': %s", kw, e)
        return []

    async def fetch_hackernews_comments(session: "httpx.AsyncClient", kw: str) -> list[dict]:
        """Search HackerNews comments — surfaces more authors."""
        try:
            enc = kw.replace(" ", "+").replace('"', "%22")
            url = f"https://hn.algolia.com/api/v1/search?query={enc}&tags=comment&hitsPerPage=20"
            r = await session.get(url, timeout=10, headers=_HN_HEADERS)
            if r.status_code == 200:
                data = json.loads(r.text)
                hits = data.get("hits", [])
                out = []
                for hit in hits:
                    author = (hit.get("author") or "").strip()
                    if not author or author.lower() in _SKIP_HANDLES:
                        continue
                    comment_text = re.sub(r"<[^>]+>", " ", hit.get("comment_text") or "").strip()[:500]
                    if not comment_text or len(comment_text) < 10:
                        continue
                    obj_id = hit.get("objectID", "")
                    if not obj_id:
                        continue
                    created = hit.get("created_at", "")
                    pub_at = datetime.now(timezone.utc)
                    if created:
                        try:
                            pub_at = datetime.fromisoformat(created.replace("Z", "+00:00"))
                        except Exception:
                            pass
                    out.append({
                        "handle": author,
                        "tweet_id": f"hn_c_{obj_id}",
                        "content": comment_text,
                        "url": f"https://news.ycombinator.com/item?id={obj_id}",
                        "published_at": pub_at.isoformat(),
                        "platform": "hackernews",
                        "score": hit.get("points", 0) or 0,
                    })
                return out
        except Exception as e:
            logger.debug("HackerNews comments error for '%s': %s", kw, e)
        return []

    async def fetch_mastodon_accounts(session: "httpx.AsyncClient", kw: str) -> list[dict]:
        """Search Mastodon.social accounts — no auth required for basic account search."""
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

        # HackerNews — top stories + recent + comments
        tasks.append(fetch_hackernews(session, kw_clean, recent=False))
        tasks.append(fetch_hackernews(session, kw_clean, recent=True))
        tasks.append(fetch_hackernews_comments(session, kw_clean))
        # Also try slug variant if different
        if slug and slug.lower() != kw_clean.lower():
            tasks.append(fetch_hackernews(session, slug, recent=False))

        # Mastodon accounts
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

    # Sort each platform's results by score/recency
    twitter_results = [r for r in results if r.get("platform") == "twitter"]
    hn_results = sorted(
        [r for r in results if r.get("platform") == "hackernews"],
        key=lambda x: x.get("score", 0),
        reverse=True,
    )
    mastodon_results = sorted(
        [r for r in results if r.get("platform") == "mastodon"],
        key=lambda x: x.get("score", 0),
        reverse=True,
    )

    tw_count = len(twitter_results)
    hn_count = len(hn_results)
    ms_count = len(mastodon_results)
    if results:
        logger.info(
            "social_discovery: %d posts for '%s' (twitter=%d, hackernews=%d, mastodon=%d)",
            len(results), kw_clean, tw_count, hn_count, ms_count,
        )
    else:
        logger.info("social_discovery: no posts found for '%s'", kw_clean)

    # Interleave: Twitter first, then HN, then Mastodon
    merged: list[dict] = []
    ti, hi, mi = 0, 0, 0
    while len(merged) < limit and (
        ti < len(twitter_results) or hi < len(hn_results) or mi < len(mastodon_results)
    ):
        if ti < len(twitter_results):
            merged.append(twitter_results[ti]); ti += 1
        if hi < len(hn_results) and len(merged) < limit:
            merged.append(hn_results[hi]); hi += 1
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
    "refused", "ruthless", "hate speech", "surveillance", "authoritarian",
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
