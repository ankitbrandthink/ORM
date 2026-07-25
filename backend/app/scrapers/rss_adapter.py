"""RSS/Atom feed ingestion adapter.

Handles both RSS 2.0 and Atom 1.0 formats.
Returns up to max_articles items per feed (default 25).
"""
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

import httpx

from app.scrapers.base_adapter import BaseAdapter, NormalizedComment, NormalizedPost

_ATOM_NS = "http://www.w3.org/2005/Atom"
_CONTENT_NS = "http://purl.org/rss/1.0/modules/content/"

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _strip_html(text: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    text = _HTML_TAG_RE.sub(" ", text or "")
    return _WS_RE.sub(" ", text).strip()


def _parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse RSS pubDate (RFC-2822) or Atom published (ISO-8601)."""
    if not date_str:
        return None
    date_str = date_str.strip()
    # Try RFC-2822 (RSS pubDate: "Mon, 07 Jul 2026 10:00:00 +0530")
    try:
        return parsedate_to_datetime(date_str).astimezone(timezone.utc)
    except Exception:
        pass
    # Try ISO-8601 / Atom (2026-07-07T10:00:00Z)
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        pass
    return None


def _text(el, tag: str, ns: Optional[str] = None) -> str:
    """Get text of first matching child element, stripping HTML."""
    full_tag = f"{{{ns}}}{tag}" if ns else tag
    child = el.find(full_tag)
    if child is None:
        return ""
    # <content:encoded> may have CDATA
    text = child.text or ""
    return _strip_html(text)


class RSSAdapter(BaseAdapter):
    kind = "rss"

    async def _fetch_raw(self, url: str) -> str:
        async with httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={"User-Agent": "ORM-CMS/1.0 Feed-Reader"},
        ) as c:
            r = await c.get(url)
            r.raise_for_status()
            return r.text

    def _parse_rss(self, xml_text: str, max_articles: int = 25) -> list[dict]:
        """Parse RSS 2.0 or Atom 1.0; returns list of article dicts."""
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            # Strip invalid XML characters and retry
            xml_text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", xml_text)
            root = ET.fromstring(xml_text)

        articles: list[dict] = []

        # ── Atom 1.0 ─────────────────────────────────────────────────────────
        ns_root_tag = root.tag
        is_atom = _ATOM_NS in ns_root_tag or root.findall(f"{{{_ATOM_NS}}}entry")

        if is_atom:
            entries = root.findall(f"{{{_ATOM_NS}}}entry")
            for entry in entries[:max_articles]:
                title = _text(entry, "title", _ATOM_NS)
                summary = _text(entry, "summary", _ATOM_NS) or _text(entry, "content", _ATOM_NS)
                published_el = entry.find(f"{{{_ATOM_NS}}}published") or entry.find(f"{{{_ATOM_NS}}}updated")
                published = _parse_date(published_el.text if published_el is not None else None)
                link_el = entry.find(f"{{{_ATOM_NS}}}link")
                link = (link_el.get("href") or "") if link_el is not None else ""
                guid_el = entry.find(f"{{{_ATOM_NS}}}id")
                guid = (guid_el.text or link) if guid_el is not None else link
                author_el = entry.find(f"{{{_ATOM_NS}}}author/{{{_ATOM_NS}}}name")
                author = (author_el.text or "") if author_el is not None else ""
                articles.append({
                    "title": title,
                    "summary": summary,
                    "link": link,
                    "guid": guid,
                    "published_at": published,
                    "author": author,
                })
        else:
            # ── RSS 2.0 ──────────────────────────────────────────────────────
            channel = root.find("channel") or root
            items = channel.findall("item")
            for item in items[:max_articles]:
                title = _text(item, "title")
                desc = _text(item, "description") or _text(item, "content", _CONTENT_NS)
                pub_el = item.find("pubDate")
                published = _parse_date(pub_el.text if pub_el is not None else None)
                link_el = item.find("link")
                link = (link_el.text or "").strip() if link_el is not None else ""
                guid_el = item.find("guid")
                guid = (guid_el.text or link) if guid_el is not None else link
                author_el = item.find("author") or item.find("dc:creator")
                author = (author_el.text or "") if author_el is not None else ""
                articles.append({
                    "title": title,
                    "summary": desc,
                    "link": link,
                    "guid": guid or link,
                    "published_at": published,
                    "author": author,
                })

        return articles

    async def fetch_articles(self, url: str, max_articles: int = 25) -> list[NormalizedPost]:
        """Fetch and parse an RSS/Atom feed; return up to max_articles NormalizedPosts."""
        xml_text = await self._fetch_raw(url)
        raw = self._parse_rss(xml_text, max_articles)
        posts = []
        for item in raw:
            content = f"{item['title']} — {item['summary']}" if item["summary"] else item["title"]
            posts.append(NormalizedPost(
                external_id=item["guid"] or item["link"],
                source_kind="press_rss",
                content=content[:2000],
                author=item["author"] or "",
                url=item["link"],
                published_at=item["published_at"] or datetime.now(timezone.utc),
                metrics={},
            ))
        return posts

    # BaseAdapter interface (kept for backwards-compat — fetches single item)
    async def fetch_post(self, url: str) -> NormalizedPost:
        posts = await self.fetch_articles(url, max_articles=1)
        if posts:
            return posts[0]
        return NormalizedPost(
            external_id=url,
            source_kind="press_rss",
            content="",
            url=url,
            published_at=datetime.now(timezone.utc),
            metrics={},
        )

    async def fetch_comments(self, post_id: str) -> list[NormalizedComment]:
        return []  # RSS has no comments stream
