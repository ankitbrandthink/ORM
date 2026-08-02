"""Press & Web Intelligence ingestion service (Phase 1).

Loads active PressSource records, fetches content (RSS or YouTube channel),
deduplicates, runs existing sentiment pipeline, and stores as Post rows.

Hard limits:
- Max 25 sources per client (enforced at write time in API)
- Max 25 articles per RSS feed per run
- YouTube quota guard: skip channels when near 9,000 units/day
"""
import hashlib
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.ai.comment_analyzer import heuristic_comment
from app.ai.post_analyzer import heuristic_post
from app.models import Client, Comment, CommentAnalysis, Post, PostAnalysis, PressSource

log = logging.getLogger("orm.press_ingestion")


def _keyword_match(text: str, client_name: str) -> bool:
    """Return True if the article text mentions this client.

    Matches full name OR ≥2 significant words from a multi-word name.
    Ignores very short tokens so 'bjp' / 'cjp' match as full tokens.
    """
    if not text or not client_name:
        return False
    text_lower = text.lower()
    name_lower = client_name.lower().strip()
    if name_lower in text_lower:
        return True
    tokens = [w for w in re.split(r"[\s\-_/&,]+", name_lower) if len(w) >= 3]
    if not tokens:
        return False
    if len(tokens) == 1:
        return tokens[0] in text_lower
    # Multi-word: require at least 2 tokens to match
    hits = sum(1 for t in tokens if t in text_lower)
    return hits >= min(2, len(tokens))


def _content_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _store_article(
    db: Session,
    tenant_id: str,
    client_id: Optional[str],
    source: PressSource,
    title: str,
    content: str,
    url: str,
    published_at: Optional[datetime],
    extra_metrics: Optional[dict] = None,
) -> Optional[Post]:
    """Store one press article as a Post row with sentiment analysis.

    Deduplicates by URL. Returns existing Post if already stored.
    """
    if not url:
        return None

    # Dedup by (URL + client_id) so the same article can be stored once per matching client
    existing = db.query(Post).filter(
        Post.tenant_id == tenant_id,
        Post.url == url,
        Post.client_id == client_id,
        Post.is_deleted == False,
    ).first()
    if existing:
        return None

    full_text = content or title or ""
    metrics = {
        "press_source_name": source.name,
        "press_source_id": source.id,
        "article_type": source.article_type_default,
        "leaning": source.leaning,
        "source_type": source.source_type,
        "domestic": source.domestic,
        "circulation": source.circulation,
        "primary_region": source.primary_region,
    }
    if extra_metrics:
        metrics.update(extra_metrics)

    post = Post(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        client_id=client_id,
        press_source_id=source.id,
        source_kind="press_rss" if source.kind == "rss" else "youtube_channel_video",
        external_id=_content_hash(url),
        url=url,
        permalink=url,
        author=source.name,
        content=full_text[:4000],
        language="en",
        published_at=published_at or _now(),
        last_synced_at=_now(),
        metrics=metrics,
    )
    db.add(post)
    db.flush()

    # Run sentiment on the article content (same pipeline as social)
    sentiment_result = heuristic_comment(full_text[:1000])
    ca_comment = Comment(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        post_id=post.id,
        external_id=f"article-body-{post.id}",
        author=source.name,
        content=full_text[:1000],
        language="en",
        published_at=post.published_at,
    )
    db.add(ca_comment)
    db.flush()

    ca = CommentAnalysis(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        comment_id=ca_comment.id,
        sentiment=sentiment_result.get("sentiment", "Neutral"),
        stance=sentiment_result.get("stance", ""),
        emotion=sentiment_result.get("emotion", []),
        toxicity_score=sentiment_result.get("toxicity_score", 0.0),
        spam_score=sentiment_result.get("spam_score", 0.0),
        confidence=sentiment_result.get("confidence", 0.55),
        result=sentiment_result,
    )
    db.add(ca)

    # Also run post-level analysis for crisis/narrative signals
    post_result = heuristic_post(post.id, full_text[:500])
    pa = PostAnalysis(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        post_id=post.id,
        summary=post_result.get("summary", ""),
        main_narrative=post_result.get("main_narrative", ""),
        intent=post_result.get("intent", ""),
        political_angle=post_result.get("political_angle", "none"),
        crisis_probability=post_result.get("crisis_probability", 0.0),
        urgency_score=post_result.get("urgency_score", 0.0),
        virality_score=post_result.get("virality_score", 0.0),
        result={**post_result, "sentiment": sentiment_result.get("sentiment", "Neutral")},
    )
    db.add(pa)

    return post


async def ingest_rss_source(
    db: Session, source: PressSource, tenant_id: str,
    all_clients: Optional[list] = None,
) -> dict:
    """Fetch and store articles from one RSS source.

    When `all_clients` is provided, each article is keyword-matched against every
    client so the same article can appear under multiple accounts.
    """
    from app.scrapers.rss_adapter import RSSAdapter

    max_articles = source.config.get("max_articles", 25)

    try:
        adapter = RSSAdapter()
        articles = await adapter.fetch_articles(source.url, max_articles=max_articles)
    except Exception as e:
        log.warning(f"[press] RSS fetch failed for {source.name}: {e}")
        return {"source": source.name, "status": "error", "error": str(e), "new": 0}

    new_count = 0
    for art in articles:
        # Determine which clients get this article
        content = art.content or ""
        clients_for_article: list[Optional[str]] = []

        if all_clients:
            for c in all_clients:
                if _keyword_match(content, c.name):
                    clients_for_article.append(c.id)
            # Always include the source's own client even without a keyword match
            if source.client_id and source.client_id not in clients_for_article:
                clients_for_article.append(source.client_id)
        else:
            clients_for_article = [source.client_id]

        for cid in clients_for_article:
            try:
                post = _store_article(
                    db, tenant_id, cid, source,
                    title=content.split(" — ")[0] if " — " in content else content,
                    content=content,
                    url=art.url or "",
                    published_at=art.published_at,
                )
                if post is not None:
                    new_count += 1
            except Exception as e:
                log.warning(f"[press] article store error ({source.name}, client={cid}): {e}")
                db.rollback()

    try:
        source.last_ingested_at = _now()
        db.commit()
    except Exception as e:
        log.error(f"[press] commit error ({source.name}): {e}")
        db.rollback()

    return {"source": source.name, "status": "ok", "fetched": len(articles), "new": new_count}


async def ingest_youtube_channel_source(
    db: Session, source: PressSource, tenant_id: str,
    all_clients: Optional[list] = None,
) -> dict:
    """Fetch latest videos from a YouTube news/commentary channel."""
    from app.scrapers.youtube_adapter import YouTubeAdapter, get_youtube_quota, _QUOTA_WARN_AT

    quota = get_youtube_quota()
    if quota["near_cap"]:
        log.warning(f"[press] YouTube quota near cap ({quota['used']}/{quota['limit']}) — skipping {source.name}")
        return {"source": source.name, "status": "quota_skip", "new": 0}

    # Resolve API key: source config override or global env
    import os
    api_key = source.config.get("yt_api_key") or os.environ.get("YOUTUBE_API_KEY", "")
    if not api_key:
        return {"source": source.name, "status": "no_api_key", "new": 0}

    max_videos = source.config.get("max_articles", 10)
    client_id = source.client_id

    try:
        adapter = YouTubeAdapter(api_key=api_key)
        channel_stats = await adapter.fetch_channel_stats(source.url)
        videos = await adapter.fetch_channel_videos(source.url, max_results=max_videos)
    except Exception as e:
        log.warning(f"[press] YouTube channel fetch failed for {source.name}: {e}")
        return {"source": source.name, "status": "error", "error": str(e), "new": 0}

    new_count = 0
    for vid in videos:
        content = vid.content or ""
        extra = {
            **vid.metrics,
            "yt_subscribers": channel_stats.get("subscribers", 0),
            "yt_channel_id": channel_stats.get("channel_id", ""),
            "yt_channel_title": channel_stats.get("title", source.name),
        }

        clients_for_video: list[Optional[str]] = []
        if all_clients:
            for c in all_clients:
                if _keyword_match(content, c.name):
                    clients_for_video.append(c.id)
            if source.client_id and source.client_id not in clients_for_video:
                clients_for_video.append(source.client_id)
        else:
            clients_for_video = [source.client_id]

        for cid in clients_for_video:
            try:
                post = _store_article(
                    db, tenant_id, cid, source,
                    title=content,
                    content=content,
                    url=vid.url or "",
                    published_at=vid.published_at,
                    extra_metrics=extra,
                )
                if post:
                    new_count += 1
            except Exception as e:
                log.warning(f"[press] YT video store error ({source.name}, client={cid}): {e}")
                db.rollback()

    try:
        # Update channel subscriber count in source.config for display
        if channel_stats:
            cfg = dict(source.config or {})
            cfg["yt_subscribers"] = channel_stats.get("subscribers", 0)
            cfg["yt_title"] = channel_stats.get("title", "")
            source.config = cfg
        source.last_ingested_at = _now()
        db.commit()
    except Exception as e:
        log.error(f"[press] YT commit error ({source.name}): {e}")
        db.rollback()

    return {
        "source": source.name,
        "status": "ok",
        "fetched": len(videos),
        "new": new_count,
        "channel_stats": channel_stats,
    }


async def ingest_all_for_tenant(db: Session, tenant_id: str) -> list[dict]:
    """Run ingestion for every active PressSource, matching articles to ALL clients."""
    all_clients = db.query(Client).filter(Client.tenant_id == tenant_id).all()
    sources = db.query(PressSource).filter(
        PressSource.tenant_id == tenant_id,
        PressSource.is_active == True,
        PressSource.is_deleted == False,
    ).all()

    if not sources:
        return []

    results = []
    for source in sources:
        if source.kind == "rss":
            result = await ingest_rss_source(db, source, tenant_id, all_clients)
        elif source.kind == "youtube_channel":
            result = await ingest_youtube_channel_source(db, source, tenant_id, all_clients)
        else:
            result = {"source": source.name, "status": "unknown_kind", "new": 0}
        results.append(result)
        log.info(f"[press] {result}")

    return results


def rematch_existing_articles_for_client(
    db: Session, tenant_id: str, client_id: str, client_name: str,
) -> dict:
    """Scan all existing press articles and create Post entries for those
    mentioning this client (retroactive keyword matching for new accounts).
    """
    # All press posts NOT already linked to this client
    existing_press = (
        db.query(Post)
        .filter(
            Post.tenant_id == tenant_id,
            Post.source_kind.in_(["press_rss", "youtube_channel_video"]),
            Post.is_deleted == False,
            Post.client_id != client_id,
            Post.press_source_id.isnot(None),
        )
        .all()
    )

    # Index sources by id
    source_map: dict = {}

    created = 0
    for orig in existing_press:
        content = orig.content or ""
        if not _keyword_match(content, client_name):
            continue

        # Skip if we already have this URL for this client
        dup = db.query(Post).filter(
            Post.tenant_id == tenant_id,
            Post.url == orig.url,
            Post.client_id == client_id,
            Post.is_deleted == False,
        ).first()
        if dup:
            continue

        if orig.press_source_id not in source_map:
            src = db.query(PressSource).filter(PressSource.id == orig.press_source_id).first()
            source_map[orig.press_source_id] = src
        source = source_map.get(orig.press_source_id)
        if not source:
            continue

        new_post = Post(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            client_id=client_id,
            press_source_id=source.id,
            source_kind=orig.source_kind,
            external_id=_content_hash(orig.url + client_id),
            url=orig.url,
            permalink=orig.url,
            author=orig.author,
            content=orig.content,
            language=orig.language or "en",
            published_at=orig.published_at,
            last_synced_at=_now(),
            metrics=orig.metrics,
        )
        db.add(new_post)
        db.flush()

        sentiment_result = heuristic_comment(content[:1000])
        ca_comment = Comment(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            post_id=new_post.id,
            external_id=f"article-body-{new_post.id}",
            author=orig.author,
            content=content[:1000],
            language=orig.language or "en",
            published_at=new_post.published_at,
        )
        db.add(ca_comment)
        db.flush()

        ca = CommentAnalysis(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            comment_id=ca_comment.id,
            sentiment=sentiment_result.get("sentiment", "Neutral"),
            stance=sentiment_result.get("stance", ""),
            emotion=sentiment_result.get("emotion", []),
            toxicity_score=sentiment_result.get("toxicity_score", 0.0),
            spam_score=sentiment_result.get("spam_score", 0.0),
            confidence=sentiment_result.get("confidence", 0.55),
            result=sentiment_result,
        )
        db.add(ca)

        post_result = heuristic_post(new_post.id, content[:500])
        pa = PostAnalysis(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            post_id=new_post.id,
            summary=post_result.get("summary", ""),
            main_narrative=post_result.get("main_narrative", ""),
            intent=post_result.get("intent", ""),
            political_angle=post_result.get("political_angle", "none"),
            crisis_probability=post_result.get("crisis_probability", 0.0),
            urgency_score=post_result.get("urgency_score", 0.0),
            virality_score=post_result.get("virality_score", 0.0),
            result={**post_result, "sentiment": sentiment_result.get("sentiment", "Neutral")},
        )
        db.add(pa)
        created += 1

    try:
        db.commit()
        log.info(f"[press] rematch: {created} articles linked to client '{client_name}'")
    except Exception as e:
        db.rollback()
        log.error(f"[press] rematch commit error: {e}")
        return {"client_id": client_id, "created": 0, "error": str(e)}

    return {"client_id": client_id, "client_name": client_name, "created": created}
