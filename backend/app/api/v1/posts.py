import hashlib
import re as _re_clean
import uuid as _uuid
from datetime import datetime, timezone, datetime as _dt


def _clean_text(text: str) -> str:
    """Strip lone Unicode surrogate characters that PostgreSQL's UTF-8 rejects."""
    if not text:
        return ""
    return _re_clean.sub(r"[\ud800-\udfff]", "", text)

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.ai.comment_analyzer import heuristic_comment
from app.ai.post_analyzer import heuristic_post
from app.ai.bot_detector import bot_score, authenticity_label
from app.database import get_db, SessionLocal
from app.dependencies import CurrentUser, get_current_user
from app.models import Client, Comment, CommentAnalysis, Post, PostAnalysis, RawDocument, SocialProfile
from app.schemas import IngestLinkRequest, Paginated, PostOut, PostSentiment

router = APIRouter()


def _parse_dt_from(s: str) -> datetime:
    return datetime.fromisoformat(s)


def _parse_dt_to(s: str) -> datetime:
    return datetime.fromisoformat(s if "T" in s else f"{s}T23:59:59")


@router.get("", response_model=Paginated)
def list_posts(
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    client_id: str | None = None,
    social_profile_id: str | None = None,
    source_kind: str | None = None,
    language: str | None = None,
    search: str | None = None,
    url_search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    q = db.query(Post).filter(Post.tenant_id == current.tenant_id, Post.is_deleted == False)
    if client_id:
        q = q.filter(Post.client_id == client_id)
    if social_profile_id:
        q = q.filter(Post.social_profile_id == social_profile_id)
    if source_kind:
        q = q.filter(Post.source_kind == source_kind)
    if language:
        q = q.filter(Post.language == language)
    if search:
        q = q.filter(Post.content.ilike(f"%{search}%"))
    if url_search:
        from sqlalchemy import or_
        q = q.filter(or_(
            Post.url.ilike(f"%{url_search}%"),
            Post.permalink.ilike(f"%{url_search}%"),
        ))
    if date_from:
        q = q.filter(Post.published_at >= _parse_dt_from(date_from))
    if date_to:
        q = q.filter(Post.published_at <= _parse_dt_to(date_to))
    total = q.count()
    items = (q.order_by(Post.published_at.desc().nullslast())
             .offset((page - 1) * page_size).limit(page_size).all())
    return Paginated(total=total, page=page, page_size=page_size,
                     items=[_post_with_sentiment(db, p) for p in items])


def _real_comment_total(m: dict) -> int:
    """Return the real comment total stored in post metrics.
    Handles both key names used across versions of the ingestion code."""
    return int(m.get("real_comment_total") or m.get("comments") or 0)


def _scale_counts(p: Post, actual: dict, is_filtered: bool = False) -> tuple[dict, int]:
    """Return EXACT analyzed comment counts — never scale/project to platform total.
    Scaling produced fake data (e.g. 15 comments → 17,900 all-Positive). Show real numbers only.
    """
    return actual, sum(actual.values())


def _post_with_sentiment(db: Session, p: Post) -> dict:
    d = PostOut.model_validate(p).model_dump()
    rows = (db.query(CommentAnalysis.sentiment, func.count())
            .join(Comment, Comment.id == CommentAnalysis.comment_id)
            .filter(Comment.post_id == p.id)
            .group_by(CommentAnalysis.sentiment).all())
    actual = {s or "Unknown": c for s, c in rows}
    sampled_total = sum(actual.values())
    counts, total = _scale_counts(p, actual)
    d["sentiment_counts"] = counts
    d["comment_count"] = total
    d["sampled_count"] = sampled_total   # actual # of comments analyzed
    pa = db.query(PostAnalysis).filter(PostAnalysis.post_id == p.id).first()
    d["ai_narrative"] = pa.main_narrative if pa and pa.main_narrative else None
    return d


@router.get("/scrape-progress")
def scrape_progress(current: CurrentUser = Depends(get_current_user),
                    db: Session = Depends(get_db),
                    social_profile_id: str | None = None):
    """Counter for the scraper extension: how many posts have real scraped comments."""
    base = db.query(Post).filter(
        Post.tenant_id == current.tenant_id, Post.is_deleted == False)
    if social_profile_id:
        base = base.filter(Post.social_profile_id == social_profile_id)
    total = base.count()
    scraped = base.filter(Post.metrics["scraped"].as_string() == "true").count()
    return {"total": total, "scraped": scraped, "remaining": max(0, total - scraped)}


@router.get("/to-scrape")
def to_scrape(current: CurrentUser = Depends(get_current_user),
              db: Session = Depends(get_db),
              limit: int = Query(500, ge=1, le=5000),
              social_profile_id: str | None = None,
              include_done: bool = False):
    """Work-list for the scraper extension: posts (id + permalink) still needing scrape."""
    q = db.query(Post).filter(Post.tenant_id == current.tenant_id, Post.is_deleted == False,
                              Post.permalink.isnot(None))
    if social_profile_id:
        q = q.filter(Post.social_profile_id == social_profile_id)
    if not include_done:
        scraped_flag = Post.metrics["scraped"].as_string()
        q = q.filter((scraped_flag != "true") | (scraped_flag.is_(None)))
    rows = q.order_by(Post.published_at.desc().nullslast()).limit(limit).all()
    return {"count": len(rows),
            "items": [{"id": p.id, "permalink": p.permalink, "url": p.url,
                       "author": p.author} for p in rows]}


@router.get("/by-external-id")
def post_by_external_id(
    external_id: str, platform: str = "instagram",
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Look up a post by its platform external ID (e.g. Instagram shortcode)."""
    p = (db.query(Post)
         .filter(Post.tenant_id == current.tenant_id,
                 Post.external_id == external_id,
                 Post.source_kind == platform)
         .first())
    if not p:
        raise HTTPException(404, f"No {platform} post found with external_id={external_id!r}")
    return {
        "id": p.id,
        "external_id": p.external_id,
        "url": p.url,
        "real_comment_total": _real_comment_total(p.metrics or {}),
    }


@router.get("/{post_id}", response_model=PostOut)
def get_post(post_id: str, current: CurrentUser = Depends(get_current_user),
             db: Session = Depends(get_db)):
    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    return p


class UpdateTotalIn(BaseModel):
    total_count: int


@router.patch("/{post_id}/update-total")
def update_post_total(post_id: str, body: UpdateTotalIn,
                      current: CurrentUser = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    """Update the real comment total for a post (e.g. to match the live Facebook count)."""
    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    metrics = dict(p.metrics or {})
    metrics["real_comment_total"] = body.total_count
    p.metrics = metrics
    p.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    return {"post_id": post_id, "real_comment_total": body.total_count}


@router.get("/{post_id}/sentiment", response_model=PostSentiment)
def post_sentiment(post_id: str, current: CurrentUser = Depends(get_current_user),
                   db: Session = Depends(get_db),
                   date_from: str | None = None,
                   date_to: str | None = None):
    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")

    q = (db.query(CommentAnalysis.sentiment, func.count())
         .join(Comment, Comment.id == CommentAnalysis.comment_id)
         .filter(Comment.post_id == post_id))

    if date_from:
        q = q.filter(Comment.published_at >= _parse_dt_from(date_from))
    if date_to:
        q = q.filter(Comment.published_at <= _parse_dt_to(date_to))

    rows = q.group_by(CommentAnalysis.sentiment).all()
    actual = {s or "Unknown": c for s, c in rows}
    sampled_count = sum(actual.values())   # actual analyzed rows before scaling
    is_filtered = bool(date_from or date_to)
    counts, real_total = _scale_counts(p, actual, is_filtered=is_filtered)
    total = sum(counts.values()) or 1

    q_tox = (db.query(func.avg(CommentAnalysis.toxicity_score))
             .join(Comment, Comment.id == CommentAnalysis.comment_id)
             .filter(Comment.post_id == post_id))
    if date_from:
        q_tox = q_tox.filter(Comment.published_at >= _parse_dt_from(date_from))
    if date_to:
        q_tox = q_tox.filter(Comment.published_at <= _parse_dt_to(date_to))

    avg_tox = q_tox.scalar() or 0.0
    pa = db.query(PostAnalysis).filter(PostAnalysis.post_id == post_id).first()
    return PostSentiment(
        post_id=post_id, total_comments=real_total, sampled_count=sampled_count,
        counts=counts,
        percentages={k: round(v * 100 / total, 1) for k, v in counts.items()},
        avg_toxicity=round(float(avg_tox), 3),
        crisis_probability=round(float(pa.crisis_probability), 3) if pa else 0.0,
    )


@router.post("/{post_id}/reanalyze-sentiment")
def reanalyze_sentiment(post_id: str, current: CurrentUser = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    """Re-run heuristic_comment on ALL stored comments for this post and update their analysis."""
    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    rows = (db.query(Comment, CommentAnalysis)
            .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
            .filter(Comment.post_id == post_id).all())
    updated = 0
    for comment, analysis in rows:
        result = heuristic_comment(comment.content)
        analysis.sentiment = result["sentiment"]
        analysis.stance = result["stance"]
        analysis.emotion = result.get("emotion", [])
        analysis.sarcasm = result.get("sarcasm", False)
        analysis.toxicity_score = result.get("toxicity_score", 0.05)
        analysis.confidence = result.get("confidence", 0.55)
        analysis.result = {**result, "source": "reanalyzed"}
        updated += 1
        if updated % 500 == 0:
            db.commit()
    db.commit()
    return {"post_id": post_id, "updated": updated}


@router.post("/bulk-analyze-heuristic")
def bulk_analyze_heuristic(
    client_id: str = Query(..., description="Client ID to analyze"),
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Run heuristic sentiment analysis on ALL comments across ALL posts for a client
    that do not yet have a CommentAnalysis record. Also fills missing post-level analysis.
    Returns: { analyzed, already_done, posts_processed }
    """
    profile_ids = [r for (r,) in
        db.query(SocialProfile.id)
        .filter(SocialProfile.client_id == client_id, SocialProfile.is_deleted == False)
        .all()]

    posts = db.query(Post).filter(
        Post.tenant_id == current.tenant_id,
        Post.is_deleted == False,
        Post.client_id == client_id,
    ).all()

    analyzed = 0
    already_done = 0
    posts_processed = 0

    for post in posts:
        posts_processed += 1

        # Run heuristic on comments that have no CommentAnalysis
        unanalyzed_comments = (
            db.query(Comment)
            .outerjoin(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
            .filter(Comment.post_id == post.id, Comment.is_deleted == False,
                    CommentAnalysis.id == None)
            .all()
        )

        for comment in unanalyzed_comments:
            result = heuristic_comment(comment.content or "")
            ca = CommentAnalysis(
                comment_id=comment.id,
                sentiment=result["sentiment"],
                stance=result.get("stance", "Unknown"),
                emotion=result.get("emotion", []),
                sarcasm=result.get("sarcasm", False),
                toxicity_score=result.get("toxicity_score", 0.05),
                confidence=result.get("confidence", 0.55),
                result={**result, "source": "bulk_heuristic"},
            )
            db.add(ca)
            analyzed += 1
            if analyzed % 500 == 0:
                db.commit()
        else:
            if not unanalyzed_comments:
                already_done += 1

        # Also run post-level analysis if missing
        has_post_analysis = db.query(PostAnalysis).filter(PostAnalysis.post_id == post.id).first()
        if not has_post_analysis and post.content:
            try:
                pa_result = heuristic_post(post.id, post.content)
                db.add(pa_result)
            except Exception:
                pass

    db.commit()
    return {"analyzed": analyzed, "already_done": already_done, "posts_processed": posts_processed}


@router.get("/{post_id}/comments")
def post_comments(post_id: str, current: CurrentUser = Depends(get_current_user),
                  db: Session = Depends(get_db),
                  sentiment: str | None = None, sort: str = "new",
                  page: int = Query(1, ge=1),
                  page_size: int = Query(50, ge=1, le=2000),
                  date_from: str | None = None,
                  date_to: str | None = None):
    """Paged comment feed for a post, each with its AI sentiment/emotion."""
    q = (db.query(Comment, CommentAnalysis)
         .outerjoin(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
         .filter(Comment.tenant_id == current.tenant_id, Comment.post_id == post_id,
                 Comment.is_deleted == False))
    if sentiment:
        q = q.filter(CommentAnalysis.sentiment == sentiment)
    if date_from:
        q = q.filter(Comment.published_at >= _parse_dt_from(date_from))
    if date_to:
        q = q.filter(Comment.published_at <= _parse_dt_to(date_to))
    total = q.count()
    # Server-side sort so Load-more paginates a stable, fully-ordered set.
    sent_rank = case(
        (CommentAnalysis.sentiment == "Positive", 0),
        (CommentAnalysis.sentiment == "Neutral", 1),
        (CommentAnalysis.sentiment == "Negative", 2),
        else_=3)
    if sort == "old":
        order = [Comment.published_at.asc().nullslast()]
    elif sort == "pos":
        order = [sent_rank.asc(), Comment.published_at.desc().nullslast()]
    elif sort == "neg":
        order = [sent_rank.desc(), Comment.published_at.desc().nullslast()]
    else:  # new
        order = [Comment.published_at.desc().nullslast()]
    rows = (q.order_by(*order)
            .offset((page - 1) * page_size).limit(page_size).all())

    # Bot detection: count per-author frequency on this post (for repeat-commenter signal)
    author_names = [c.author or "" for c, _ in rows]
    author_freq: dict[str, int] = {}
    if author_names:
        freq_rows = (
            db.query(Comment.author, func.count(Comment.id))
            .filter(Comment.post_id == post_id, Comment.is_deleted == False)
            .group_by(Comment.author)
            .all()
        )
        author_freq = {a: n for a, n in freq_rows}

    # Duplicate-content detection (same text from different authors)
    content_counts: dict[str, int] = {}
    for c, _ in rows:
        txt = (c.content or "")[:200]
        content_counts[txt] = content_counts.get(txt, 0) + 1

    # Lookup post platform for fallback profile URL construction
    post_obj = db.query(Post).filter(Post.id == post_id).first()
    post_url = (post_obj.url or "") if post_obj else ""
    def _build_author_url(comment_author_url: str | None, author: str | None) -> str | None:
        if comment_author_url:
            return comment_author_url
        if not author:
            return None
        a = (author or "").strip()
        # Construct fallback profile URL based on post platform
        if "facebook.com" in post_url or "fb.com" in post_url:
            return f"https://www.facebook.com/search/people/?q={a}"
        if "instagram.com" in post_url:
            return f"https://www.instagram.com/{a}/" if not a.startswith("http") else None
        if "twitter.com" in post_url or "x.com" in post_url:
            handle = a.lstrip("@")
            return f"https://x.com/{handle}" if handle else None
        if "youtube.com" in post_url or "youtu.be" in post_url:
            return f"https://www.youtube.com/@{a}" if not a.startswith("http") else None
        return None

    items = []
    for c, a in rows:
        freq = author_freq.get(c.author or "", 1)
        txt = (c.content or "")[:200]
        is_dup = content_counts.get(txt, 1) > 1
        bscore = bot_score(c.author or "", c.content or "", freq, is_dup)
        items.append({
            "id": c.id, "author": c.author,
            "author_url": _build_author_url(c.author_url, c.author),
            "content": c.content,
            "published_at": c.published_at,
            "sentiment": a.sentiment if a else None,
            "emotion": a.emotion if a else [],
            "sarcasm": a.sarcasm if a else False,
            "toxicity_score": a.toxicity_score if a else 0.0,
            "authenticity_score": bscore,
            "authenticity_label": authenticity_label(bscore),
        })
    return {"total": total, "page": page, "page_size": page_size, "items": items}


class _AppendComment(BaseModel):
    author: str | None = None
    text: str
    published_at: datetime | None = None


class AppendCommentsIn(BaseModel):
    comments: list[_AppendComment] = []
    total_count: int | None = None   # real platform total if known


@router.post("/{post_id}/append-comments")
def append_comments(
    post_id: str, body: AppendCommentsIn,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Append real scraped comments to a post WITHOUT wiping existing ones.
    Safe to call multiple times — deduplicates by content hash so re-runs
    only add comments not yet stored."""
    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")

    existing = {c.external_id for c in
                db.query(Comment.external_id).filter(Comment.post_id == post_id).all()}
    added = 0
    for sc in body.comments:
        if not (sc.text or "").strip():
            continue
        # Stable external_id from author + content so re-runs don't duplicate
        raw = ((sc.author or "") + (sc.text or "")[:80]).encode()
        ext_id = f"{p.external_id}-r-{hashlib.sha256(raw).hexdigest()[:16]}"
        if ext_id in existing:
            continue
        existing.add(ext_id)
        cpub = sc.published_at
        if cpub is not None and cpub.tzinfo is None:
            cpub = cpub.replace(tzinfo=timezone.utc)
        cm = Comment(
            tenant_id=current.tenant_id, post_id=post_id, external_id=ext_id,
            author=sc.author or "instagram_user", author_url=getattr(sc, "author_url", None),
            content=sc.text, language="en", published_at=cpub or p.published_at,
        )
        db.add(cm); db.flush()
        ca = heuristic_comment(cm.content)
        db.add(CommentAnalysis(
            tenant_id=current.tenant_id, comment_id=cm.id,
            sentiment=ca["sentiment"], stance=ca["stance"],
            emotion=ca["emotion"], sarcasm=ca["sarcasm"],
            toxicity_score=ca["toxicity_score"], spam_score=ca["spam_score"],
            bot_probability=ca["bot_probability"], confidence=ca["confidence"],
            result={**ca, "source": "scraped"},
        ))
        added += 1

    if body.total_count is not None:
        metrics = dict(p.metrics or {})
        metrics["real_comment_total"] = body.total_count
        metrics["scraped"] = True
        p.metrics = metrics

    p.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    stored = (db.query(func.count(Comment.id))
              .filter(Comment.post_id == post_id, Comment.is_deleted == False).scalar() or 0)
    return {"added": added, "total_stored": stored}


def _hash(text: str) -> str:
    return hashlib.sha256((text or "").encode()).hexdigest()


def _ingest_from_link(db: Session, tenant_id: str, url: str, client_id: str | None,
                      profile_id: str | None, n_comments: int,
                      narrative: str | None = None) -> Post:
    """Fetch a post + its comments from a URL, route to the correct platform adapter."""
    import asyncio

    platform = _platform_of(url)
    np = None
    raw_comments: list = []

    # ── Try real Instagram adapter first ─────────────────────────────────────
    if platform == "instagram":
        try:
            from app.scrapers.instagram_adapter import InstagramAdapter
            adapter = InstagramAdapter()
            np = asyncio.run(adapter.fetch_post(url))
            raw_comments = asyncio.run(adapter.fetch_comments(np.external_id))
        except HTTPException:
            raise
        except Exception as ig_err:
            raise HTTPException(422, str(ig_err))

    else:
        # Facebook / Twitter / other — mock until real scrapers are built
        from app.scrapers.mock_adapter import MockAdapter
        adapter = MockAdapter()
        np = asyncio.run(adapter.fetch_post(url))
        raw_comments = asyncio.run(adapter.fetch_comments(np.external_id, n_comments))

    # ── Auto-detect matching SocialProfile by post author ────────────────────
    use_profile_id = profile_id
    use_client_id  = client_id

    if np.author and np.source_kind != "mock":
        author_q = np.author.lstrip("@").lower()
        for sp in db.query(SocialProfile).filter(
            SocialProfile.tenant_id == tenant_id,
            SocialProfile.platform == platform,
        ).all():
            handle_q = (sp.handle or "").lstrip("@").lower()
            if handle_q and handle_q == author_q:
                use_profile_id = sp.id
                if sp.client_id:
                    use_client_id = sp.client_id
                break

    # ── Upsert post ───────────────────────────────────────────────────────────
    post = db.query(Post).filter(Post.tenant_id == tenant_id, Post.url == url).first()
    if not post:
        post = Post(
            tenant_id=tenant_id, client_id=use_client_id, social_profile_id=use_profile_id,
            source_kind=np.source_kind, external_id=np.external_id, url=url,
            permalink=url, author=np.author, content=np.content,
            language=np.language, published_at=np.published_at, metrics=np.metrics,
        )
        db.add(post); db.flush()
        pa = heuristic_post(post.id, (narrative or "") + "\n" + (post.content or "") if narrative else post.content)
        db.add(PostAnalysis(
            tenant_id=tenant_id, post_id=post.id, summary=pa["summary"],
            main_narrative=narrative or pa["main_narrative"], intent=pa["intent"],
            political_angle=pa["political_angle"], crisis_probability=pa["crisis_probability"],
            urgency_score=pa["urgency_score"], virality_score=pa["virality_score"], result=pa,
        ))
    else:
        # Re-assign to correct profile/client if we detected a better match
        post.client_id        = use_client_id or post.client_id
        post.social_profile_id = use_profile_id or post.social_profile_id
        # Always refresh real_comment_total + clear any stale sentiment_ratio
        # (stale ratios cause wrong scaling when the post had previously been
        # ingested by older code that stored a global-ratio in metrics)
        fresh_metrics = dict(post.metrics or {})
        fresh_metrics.update({
            k: v for k, v in (np.metrics or {}).items()
            if v is not None
        })
        fresh_metrics.pop("sentiment_ratio", None)   # remove stale ratio
        post.metrics = fresh_metrics

    # ── Upsert comments ───────────────────────────────────────────────────────
    existing = {c.external_id for c in
                db.query(Comment.external_id).filter(Comment.post_id == post.id).all()}
    for nc in raw_comments:
        if nc.external_id in existing:
            continue
        cm = Comment(
            tenant_id=tenant_id, post_id=post.id, external_id=nc.external_id,
            author=nc.author, author_url=getattr(nc, "author_url", None),
            content=nc.content, language=nc.language, published_at=nc.published_at,
        )
        db.add(cm); db.flush()
        ca = heuristic_comment(cm.content)
        db.add(CommentAnalysis(
            tenant_id=tenant_id, comment_id=cm.id, sentiment=ca["sentiment"],
            stance=ca["stance"], emotion=ca["emotion"], sarcasm=ca["sarcasm"],
            toxicity_score=ca["toxicity_score"], spam_score=ca["spam_score"],
            bot_probability=ca["bot_probability"], confidence=ca["confidence"], result=ca,
        ))

    post.last_synced_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(post)
    return post


def _platform_of(url: str) -> str:
    u = (url or "").lower()
    if "instagram.com" in u:
        return "instagram"
    if "facebook.com" in u or "fb.com" in u or "fb.watch" in u:
        return "facebook"
    if "twitter.com" in u or "x.com" in u:
        return "twitter"
    if "youtube.com" in u or "youtu.be" in u:
        return "youtube"
    return "web"


@router.post("/ingest-link", response_model=PostOut)
def ingest_link(body: IngestLinkRequest, current: CurrentUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Paste a post URL → extract & AI-analyze its comments live → return the linked post.

    Gated: requires an active social login for the link's platform (the UI shows a
    login popup on 428) so comment scraping runs under a real session.
    """
    from app.api.v1.connections import require_connected
    require_connected(db, current.tenant_id, _platform_of(body.url))
    post = _ingest_from_link(db, current.tenant_id, body.url, body.client_id,
                             body.social_profile_id, body.comments,
                             narrative=body.narrative)
    return post


# ── Unified URL analysis — no credentials required from the user ──────────────

class AnalyzeUrlIn(BaseModel):
    url: str
    social_profile_id: str | None = None   # optional hint from the UI (must match the URL's platform)


def _match_profile(
    db: Session, tenant_id: str, platform: str,
    author: str | None = None,
    explicit_id: str | None = None,
) -> tuple[str | None, str | None]:
    """Return (social_profile_id, client_id).
    Prefers explicit_id if it belongs to the right platform, then falls back to author-name match.
    Normalises spaces so "Narendra Modi" matches handle "narendramodi".
    """
    if explicit_id:
        sp = db.query(SocialProfile).filter(
            SocialProfile.id == explicit_id,
            SocialProfile.tenant_id == tenant_id,
            SocialProfile.platform == platform,
        ).first()
        if sp:
            return sp.id, sp.client_id
    if author:
        author_q = author.lstrip("@").lower().replace(" ", "")
        for sp in db.query(SocialProfile).filter(
            SocialProfile.tenant_id == tenant_id,
            SocialProfile.platform == platform,
        ).all():
            handle_q = (sp.handle or "").lstrip("@").lower().replace(" ", "")
            display_q = (sp.display_name or "").lstrip("@").lower().replace(" ", "")
            if handle_q and (handle_q == author_q or author_q.startswith(handle_q)):
                return sp.id, sp.client_id
            if display_q and (display_q == author_q or author_q.startswith(display_q)):
                return sp.id, sp.client_id
    return None, None


def _shortcode_to_pk(shortcode: str) -> str:
    """Convert Instagram shortcode to numeric post PK (pure math, no API call)."""
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    n = 0
    for c in shortcode:
        n = n * 64 + alphabet.index(c)
    return str(n)


def _get_or_create_post_stub(
    db: Session, tenant_id: str, url: str, platform: str,
    external_id: str, job_id: str,
    content: str | None = None, author: str | None = None,
    social_profile_id: str | None = None, client_id: str | None = None,
) -> Post:
    """Create/find a minimal post from URL (no platform API calls). Safe to call repeatedly."""
    job_stub = {
        "id": job_id, "status": "queued", "comments_added": 0,
        "updated_at": datetime.utcnow().isoformat(), "error": None,
    }
    post = db.query(Post).filter(Post.tenant_id == tenant_id, Post.url == url).first()
    if not post:
        post = Post(
            tenant_id=tenant_id, source_kind=platform, external_id=external_id,
            url=url, permalink=url, author=author, content=content,
            language="en", published_at=datetime.now(timezone.utc),
            metrics={"fetch_job": job_stub},
            social_profile_id=social_profile_id,
            client_id=client_id,
        )
        db.add(post); db.flush()
        db.add(PostAnalysis(
            tenant_id=tenant_id, post_id=post.id,
            summary=content or "", main_narrative="", intent="",
            political_angle="", crisis_probability=0.0,
            urgency_score=0.0, virality_score=0.0, result={},
        ))
    else:
        m = dict(post.metrics or {})
        m["fetch_job"] = job_stub
        post.metrics = m
        if author and not post.author:
            post.author = author
        if content and not post.content:
            post.content = content
        if social_profile_id and not post.social_profile_id:
            post.social_profile_id = social_profile_id
        if client_id and not post.client_id:
            post.client_id = client_id
    db.commit(); db.refresh(post)
    return post


def _update_job(
    post_id: str, job_id: str, status: str, added: int = 0, error: str | None = None
):
    """Persist fetch-job progress into post.metrics (owns its own DB session)."""
    db2 = SessionLocal()
    try:
        p = db2.query(Post).filter(Post.id == post_id).first()
        if p:
            from sqlalchemy.orm.attributes import flag_modified
            m = dict(p.metrics or {})
            job = m.get("fetch_job", {})
            job.update({"id": job_id, "status": status, "comments_added": added,
                        "updated_at": datetime.utcnow().isoformat()})
            if error:
                job["error"] = error
            m["fetch_job"] = job
            p.metrics = m
            flag_modified(p, "metrics")
            db2.commit()
    except Exception:
        db2.rollback()
    finally:
        db2.close()


def _store_comments_batch(
    post_id: str, tenant_id: str, prefix: str, raw: list[dict],
) -> int:
    """Deduplicate and store comments, running heuristic sentiment on each."""
    db2 = SessionLocal()
    try:
        existing = {c.external_id for c in
                    db2.query(Comment.external_id).filter(Comment.post_id == post_id).all()}
        added = 0
        for c in raw:
            text = _clean_text((c.get("text") or "").strip())
            if not text:
                continue
            raw_bytes = ((c.get("author") or "") + text[:80]).encode()
            ext_id = f"{prefix}-{hashlib.sha256(raw_bytes).hexdigest()[:16]}"
            if ext_id in existing:
                continue
            existing.add(ext_id)
            import datetime as _dtmod
            pub = None
            ts = c.get("published_at")
            if ts:
                try:
                    pub = _dtmod.datetime.fromtimestamp(float(ts), tz=_dtmod.timezone.utc)
                except Exception:
                    try:
                        pub = _dtmod.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                    except Exception:
                        pass
            cm = Comment(
                id=str(_uuid.uuid4()), tenant_id=tenant_id, post_id=post_id,
                external_id=ext_id, author=_clean_text(c.get("author") or "user"),
                author_url=c.get("author_url") or None,
                content=text, language="en", published_at=pub,
            )
            db2.add(cm); db2.flush()
            ca = heuristic_comment(text)
            db2.add(CommentAnalysis(
                id=str(_uuid.uuid4()), tenant_id=tenant_id, comment_id=cm.id,
                sentiment=ca["sentiment"], stance=ca["stance"],
                emotion=ca.get("emotion", []), sarcasm=ca.get("sarcasm", False),
                toxicity_score=ca.get("toxicity_score", 0.05),
                spam_score=ca.get("spam_score", 0.02),
                bot_probability=ca.get("bot_probability", 0.05),
                confidence=ca.get("confidence", 0.9),
                result={**ca, "source": "scraped"},
            ))
            added += 1
            if added % 100 == 0:
                db2.commit()
        db2.commit()
        return added
    except Exception:
        db2.rollback()
        return 0
    finally:
        db2.close()


# ── Instagram background comment fetch ─────────────────────────────────────────

def _fetch_all_ig_comments_bg(
    post_id: str, shortcode: str, tenant_id: str, job_id: str,
    session_id: str,
):
    """Background: paginate ALL Instagram comments via the private API and store them."""
    import asyncio as _asyncio
    _asyncio.run(_fetch_all_ig_comments_async(post_id, shortcode, tenant_id, job_id, session_id))


async def _fetch_all_ig_comments_async(
    post_id: str, shortcode: str, tenant_id: str, job_id: str, session_id: str,
):
    import asyncio, random
    import httpx

    _IG_HEADERS = {
        "X-IG-App-ID": "936619743392459",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        ),
    }

    total_added = 0
    _update_job(post_id, job_id, "running")

    if not session_id:
        _update_job(post_id, job_id, "error", 0,
                    "Instagram session not configured on this server. Contact your administrator.")
        return

    try:
        pk = _shortcode_to_pk(shortcode)
    except Exception:
        _update_job(post_id, job_id, "error", 0, f"Could not decode Instagram shortcode: {shortcode}")
        return

    import os as _os
    _proxy_url = _os.environ.get("INSTAGRAM_PROXY_URL", "").strip()

    _client_kwargs: dict = {
        "headers": _IG_HEADERS,
        "cookies": {"sessionid": session_id},
        "timeout": 30.0 if _proxy_url else 15.0,
        "follow_redirects": True,
    }
    if _proxy_url:
        _client_kwargs["proxy"] = _proxy_url  # httpx >= 0.28 uses proxy= not proxies=

    try:
        async with httpx.AsyncClient(**_client_kwargs) as client:
            min_id = ""
            conn_errors = 0
            while True:
                url_c = (
                    f"https://www.instagram.com/api/v1/media/{pk}/comments/"
                    f"?can_support_threading=true&permalink_enabled=false"
                    + (f"&min_id={min_id}" if min_id else "")
                )
                try:
                    cr = await client.get(url_c)
                except Exception as conn_err:
                    conn_errors += 1
                    if conn_errors >= 2:
                        _update_job(post_id, job_id, "error", total_added,
                                    "Instagram connection failed — server IP is likely blocked by Instagram.")
                        return
                    await asyncio.sleep(3)
                    continue

                if cr.status_code == 429:
                    _update_job(post_id, job_id, "error", total_added,
                                "Instagram is blocking requests from this server. "
                                "Datacenter/VPS IPs are restricted by Instagram — comments cannot be fetched server-side.")
                    return

                if cr.status_code in (401, 403):
                    _update_job(post_id, job_id, "error", total_added,
                                "Instagram session expired. Contact your administrator.")
                    return

                if not cr.is_success:
                    _update_job(post_id, job_id, "error", total_added,
                                f"Instagram returned HTTP {cr.status_code}. Server IP may be blocked.")
                    return

                # Instagram returns HTML (checkpoint/login page) when IP is blocked even on 200
                ct = cr.headers.get("content-type", "")
                if "text/html" in ct or not cr.text.strip().startswith("{"):
                    _update_job(post_id, job_id, "error", total_added,
                                "Instagram returned an HTML page instead of JSON — server IP is blocked by Instagram.")
                    return

                data = cr.json()
                batch = [
                    {"author": (c.get("user") or {}).get("username") or "ig_user",
                     "text": (c.get("text") or "")[:500],
                     "published_at": c.get("created_at")}
                    for c in (data.get("comments") or []) if c.get("text")
                ]
                if not batch:
                    break

                added = _store_comments_batch(post_id, tenant_id, f"ig-{shortcode}", batch)
                total_added += added
                min_id = data.get("next_min_id") or ""
                _update_job(post_id, job_id, "running", total_added)

                if not min_id:
                    break
                await asyncio.sleep(random.uniform(0.3, 0.6))

        _update_job(post_id, job_id, "done", total_added)

    except Exception as e:
        _update_job(post_id, job_id, "error", total_added, str(e)[:200])


# ── Facebook background comment fetch (via yt-dlp) ───────────────────────────

def _update_post_meta(post_id: str, author: str | None, content: str | None):
    """Backfill author and content on a post stub if still empty."""
    if not (author or content):
        return
    db2 = SessionLocal()
    try:
        p = db2.query(Post).filter(Post.id == post_id).first()
        if p:
            if author and not p.author:
                p.author = author
            if content and not p.content:
                p.content = content
            db2.commit()
    except Exception:
        db2.rollback()
    finally:
        db2.close()


def _fetch_all_fb_comments_bg(post_id: str, post_url: str, tenant_id: str, job_id: str):
    """Background: download Facebook post/reel comments using yt-dlp (no API key)."""
    total_added = 0
    _update_job(post_id, job_id, "running")

    try:
        import yt_dlp
    except ImportError:
        _update_job(post_id, job_id, "error", 0,
                    "Facebook scraper (yt-dlp) not installed. Contact your administrator.")
        return

    info = None
    try:
        import os as _os
        _FB_COOKIE_FILE = _os.path.join(
            _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))),
            "data", "facebook_cookies.txt",
        )
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "getcomments": True,
            "skip_download": True,
            "extractor_args": {"facebook": {"max_comments": ["500"]}},
        }
        if _os.path.exists(_FB_COOKIE_FILE):
            ydl_opts["cookiefile"] = _FB_COOKIE_FILE
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(post_url, download=False)
    except Exception as e:
        err = str(e)[:200]
        auth_error = any(k in err.lower() for k in [
            "login", "registered users", "cookies-from-browser",
            "available for", "authentication", "log in",
        ]) or "401" in err or "403" in err or "private" in err.lower()
        if auth_error:
            _update_job(post_id, job_id, "error", total_added,
                        "Facebook requires a logged-in session to fetch comments. "
                        "This post requires authentication — provide your Facebook session cookies "
                        "in Settings → Facebook to enable server-side scraping.")
        else:
            _update_job(post_id, job_id, "error", total_added,
                        f"Facebook fetch failed: {err}")
        return

    # Backfill post title/author from yt-dlp metadata
    if info:
        uploader = info.get("uploader") or info.get("channel")
        title = info.get("title") or info.get("description")
        _update_post_meta(post_id, author=uploader, content=title)

    comments = (info.get("comments") or []) if info else []

    if not comments:
        _update_job(post_id, job_id, "error", 0,
                    "Facebook returned 0 comments — a logged-in Facebook session is required to read comments from the server. "
                    "Provide your Facebook cookies (c_user + xs) in Settings → Facebook to enable scraping.")
        return

    batch: list[dict] = []
    fb_prefix = f"fb-{post_id[:8]}"
    for c in comments:
        text = (c.get("text") or "").strip()
        if not text:
            continue
        batch.append({
            "author": c.get("author") or "fb_user",
            "text": text[:500],
            "published_at": c.get("timestamp"),
        })
        if len(batch) >= 100:
            added = _store_comments_batch(post_id, tenant_id, fb_prefix, batch)
            total_added += added
            batch = []
            _update_job(post_id, job_id, "running", total_added)

    if batch:
        added = _store_comments_batch(post_id, tenant_id, fb_prefix, batch)
        total_added += added

    _update_job(post_id, job_id, "done", total_added)


# ── YouTube background comment fetch (no API key needed) ─────────────────────

def _fetch_all_yt_comments_bg(post_id: str, video_id: str, tenant_id: str, job_id: str):
    """Background: download all YouTube comments using youtube-comment-downloader (no API key)."""
    total_added = 0
    _update_job(post_id, job_id, "running")

    try:
        from youtube_comment_downloader import YoutubeCommentDownloader, SORT_BY_RECENT
    except ImportError:
        _update_job(post_id, job_id, "error", 0,
                    "YouTube scraper not installed. Contact your administrator.")
        return

    try:
        downloader = YoutubeCommentDownloader()
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        batch: list[dict] = []

        for comment in downloader.get_comments_from_url(video_url, sort_by=SORT_BY_RECENT):
            batch.append({
                "author": comment.get("author") or "yt_user",
                "text": comment.get("text") or "",
                "published_at": comment.get("time_parsed"),
            })
            if len(batch) >= 100:
                added = _store_comments_batch(post_id, tenant_id, f"yt-{video_id}", batch)
                total_added += added
                batch = []
                _update_job(post_id, job_id, "running", total_added)

        if batch:
            added = _store_comments_batch(post_id, tenant_id, f"yt-{video_id}", batch)
            total_added += added

        _update_job(post_id, job_id, "done", total_added)

    except Exception as e:
        _update_job(post_id, job_id, "error", total_added, str(e)[:200])


@router.post("/analyze-url")
def analyze_url(
    body: AnalyzeUrlIn,
    background_tasks: BackgroundTasks,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Paste any post URL → auto-detect platform → create post → scrape ALL comments.
    No browser extensions, cookies, or API keys required from the user.
    Returns { post_id, job_id, platform } immediately. Poll /{post_id}/fetch-progress.
    """
    import re as _re
    url = body.url.strip()
    if not url:
        raise HTTPException(400, "URL is required.")

    platform = _platform_of(url)
    job_id = _uuid.uuid4().hex[:12]

    if platform == "instagram":
        # Match shortcode from /p/CODE, /reel/CODE, /tv/CODE (with or without leading handle)
        sc_m = _re.search(r"instagram\.com/(?:[A-Za-z0-9._]+/)?(?:p|reel|tv)/([A-Za-z0-9_-]+)", url)
        if not sc_m:
            raise HTTPException(
                400,
                "Could not find an Instagram shortcode in this URL. "
                "Use a post link like instagram.com/p/…, /reel/…, or /tv/…"
            )
        shortcode = sc_m.group(1)
        # Try to pull handle from URL: instagram.com/{handle}/p/{sc}
        ig_handle_m = _re.search(r"instagram\.com/([A-Za-z0-9._]+)/(?:p|reel|tv)/", url)
        ig_author = ig_handle_m.group(1) if ig_handle_m else None
        sp_id, cl_id = _match_profile(
            db, current.tenant_id, "instagram",
            author=ig_author,
            explicit_id=body.social_profile_id,
        )
        post = _get_or_create_post_stub(
            db, current.tenant_id, url, "instagram", shortcode, job_id,
            author=ig_author,
            social_profile_id=sp_id, client_id=cl_id,
        )
        from app.scrapers.instagram_adapter import _load_ig_config
        import os as _os
        cfg = _load_ig_config()
        session_id = cfg.get("session_id") or _os.environ.get("INSTAGRAM_SESSION_ID", "")
        background_tasks.add_task(
            _fetch_all_ig_comments_bg,
            post_id=post.id, shortcode=shortcode,
            tenant_id=current.tenant_id, job_id=job_id,
            session_id=session_id,
        )

    elif platform == "youtube":
        vid_m = _re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url)
        if not vid_m:
            raise HTTPException(400, "Could not find a YouTube video ID in this URL.")
        video_id = vid_m.group(1)
        content = None
        author = None
        try:
            import httpx as _hx
            oe = _hx.get(
                f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json",
                timeout=6,
            )
            if oe.is_success:
                oe_data = oe.json()
                content = oe_data.get("title")
                author = oe_data.get("author_name")
        except Exception:
            pass
        sp_id, cl_id = _match_profile(
            db, current.tenant_id, "youtube",
            author=author,
            explicit_id=body.social_profile_id,
        )
        post = _get_or_create_post_stub(
            db, current.tenant_id, url, "youtube", video_id, job_id,
            content=content, author=author,
            social_profile_id=sp_id, client_id=cl_id,
        )
        background_tasks.add_task(
            _fetch_all_yt_comments_bg,
            post_id=post.id, video_id=video_id,
            tenant_id=current.tenant_id, job_id=job_id,
        )

    elif platform == "facebook":
        # Extract numeric ID from reel/video/post URLs
        fb_id_m = _re.search(r"(?:reel|video|videos|posts)[/=](\d+)", url)
        if not fb_id_m:
            fb_id_m = _re.search(r"fbid=(\d+)", url)
        fb_external_id = fb_id_m.group(1) if fb_id_m else hashlib.md5(url.encode()).hexdigest()[:12]

        # Try oEmbed to resolve page/author name (helps auto-link the account)
        fb_author = None
        fb_content = None
        try:
            import httpx as _hx
            oe = _hx.get(
                "https://www.facebook.com/plugins/oembed.json/",
                params={"url": url, "format": "json"},
                timeout=5,
            )
            if oe.is_success:
                oe_data = oe.json()
                fb_author = oe_data.get("author_name")
                fb_content = oe_data.get("title")
        except Exception:
            pass

        # If oEmbed gave nothing, try to extract page handle from URL
        # (works for page-post URLs like facebook.com/narendramodi/posts/…
        #  but not reel URLs — those have no handle)
        if not fb_author:
            handle_m = _re.search(
                r"facebook\.com/(?!reel|video|watch|groups|events|pages)([A-Za-z0-9._]+)[/?]",
                url,
            )
            if handle_m:
                fb_author = handle_m.group(1)

        sp_id, cl_id = _match_profile(
            db, current.tenant_id, "facebook",
            author=fb_author,
            explicit_id=body.social_profile_id,
        )
        post = _get_or_create_post_stub(
            db, current.tenant_id, url, "facebook", fb_external_id, job_id,
            content=fb_content, author=fb_author,
            social_profile_id=sp_id, client_id=cl_id,
        )
        background_tasks.add_task(
            _fetch_all_fb_comments_bg,
            post_id=post.id, post_url=url,
            tenant_id=current.tenant_id, job_id=job_id,
        )

    else:
        raise HTTPException(
            400,
            "Unsupported URL. Paste a Facebook, Instagram, or YouTube post link.",
        )

    return {"post_id": post.id, "job_id": job_id, "platform": platform}


class _IngestCommentsIn(BaseModel):
    comments: list[dict] = []
    total_count: int | None = None  # real platform comment count if known (sent on final batch)


@router.post("/{post_id}/ingest-comments")
def ingest_post_comments(
    post_id: str,
    body: _IngestCommentsIn,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept comments pushed from the browser extension for a specific post (no VPS needed)."""
    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Post not found")

    stored = 0
    if body.comments:
        stored = _store_comments_batch(post_id, current.tenant_id, "ext", body.comments)

    # Update metrics + last_synced_at so the UI reflects fresh data
    from sqlalchemy.orm.attributes import flag_modified
    total = db.query(func.count(Comment.id)).filter(Comment.post_id == post_id).scalar() or 0
    m = dict(p.metrics or {})
    m["scraped"] = True
    # Use platform count sent by extension when available; otherwise use actual DB count.
    # Never use max() — that prevents the count from going down when posts lose comments.
    m["real_comment_total"] = body.total_count if body.total_count is not None else total
    p.metrics = m
    flag_modified(p, "metrics")
    p.last_synced_at = datetime.now(timezone.utc)
    db.commit()

    return {"stored": stored, "total": total}


@router.get("/{post_id}/fetch-progress")
def post_fetch_progress(
    post_id: str,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Poll comment fetch progress for a post. Returns status, counts, errors."""
    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    m = p.metrics or {}
    job = m.get("fetch_job") or {}
    comments_in_db = (
        db.query(func.count(Comment.id))
        .filter(Comment.post_id == post_id, Comment.is_deleted == False)
        .scalar() or 0
    )
    return {
        "post_id": post_id,
        "status": job.get("status", "none"),
        "comments_added": job.get("comments_added", 0),
        "comments_in_db": comments_in_db,
        "real_total": _real_comment_total(m),
        "updated_at": job.get("updated_at"),
        "error": job.get("error"),
    }


class ScrapedComment(BaseModel):
    author: str | None = None
    text: str
    published_at: datetime | None = None
    like_count: int | None = 0


class ScrapedCommentsIn(BaseModel):
    total_count: int | None = None          # real comment count shown on the post
    replace: bool = True                    # wipe synthetic samples first
    comments: list[ScrapedComment] = []


@router.post("/{post_id}/ingest-comments", response_model=PostSentiment)
def ingest_scraped_comments(post_id: str, body: ScrapedCommentsIn,
                            current: CurrentUser = Depends(get_current_user),
                            db: Session = Depends(get_db)):
    """Store REAL comments scraped from the live post (via a logged-in browser) and
    run sentiment on each. `total_count` updates the post's real comment total even
    when only a subset of comment text could be scraped."""
    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")

    if body.replace:
        # remove prior (synthetic) comments + their analyses for a clean real set
        ids = [c.id for c in db.query(Comment.id).filter(Comment.post_id == post_id).all()]
        if ids:
            db.query(CommentAnalysis).filter(CommentAnalysis.comment_id.in_(ids)).delete(
                synchronize_session=False)
            db.query(Comment).filter(Comment.id.in_(ids)).delete(synchronize_session=False)

    for i, sc in enumerate(body.comments):
        if not (sc.text or "").strip():
            continue
        cm = Comment(tenant_id=current.tenant_id, post_id=post_id,
                     external_id=f"{p.external_id}-real-{i}",
                     author=sc.author or f"user_{i}", content=sc.text,
                     language="en", published_at=sc.published_at or p.published_at)
        db.add(cm); db.flush()
        ca = heuristic_comment(cm.content)
        db.add(CommentAnalysis(tenant_id=current.tenant_id, comment_id=cm.id,
                               sentiment=ca["sentiment"], stance=ca["stance"],
                               emotion=ca["emotion"], sarcasm=ca["sarcasm"],
                               toxicity_score=ca["toxicity_score"], spam_score=ca["spam_score"],
                               bot_probability=ca["bot_probability"], confidence=ca["confidence"],
                               result={**ca, "source": "scraped"}))

    metrics = dict(p.metrics or {})
    if body.total_count is not None:
        metrics["real_comment_total"] = body.total_count
        metrics["scraped"] = True
    p.metrics = metrics
    p.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    return post_sentiment(post_id, current, db)


SYNC_CAP = 1500  # max comments materialised for a single post on demand


@router.post("/{post_id}/refresh", response_model=PostSentiment)
def refresh_post(post_id: str, current: CurrentUser = Depends(get_current_user),
                 db: Session = Depends(get_db), comments: int = 0):
    """Sync this post's full comment set.

    Tops the stored comments up to the post's real total (from the researcher
    sheet) using on-topic campaign comments weighted to the post's comment
    sentiment — NOT the generic mock adapter. Idempotent: only adds the
    shortfall, so repeated clicks don't inflate the count.
    """
    from app.ai.sample_comments import generate
    from app.models import Comment as CommentModel, CommentAnalysis as CAModel

    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")

    metrics = p.metrics or {}
    # Posts whose comments were scraped from the live platform must NOT be padded
    # with synthetic samples — keep the real set intact.
    if metrics.get("scraped"):
        p.last_synced_at = datetime.now(timezone.utc)
        db.commit()
        return post_sentiment(post_id, current, db)

    pa = db.query(PostAnalysis).filter(PostAnalysis.post_id == post_id).first()
    result = (pa.result if pa else {}) or {}
    dominant = result.get("comment_sentiment") or result.get("post_sentiment") or "Positive"

    target = comments or int(metrics.get("real_comment_total") or 0) or 200
    target = min(target, SYNC_CAP)

    have = db.query(func.count(Comment.id)).filter(
        Comment.post_id == post_id, Comment.is_deleted == False).scalar() or 0
    shortfall = target - have
    if shortfall > 0:
        base_time = p.published_at or datetime.now(timezone.utc)
        seed = abs(hash(post_id)) % 100000
        crows, arows = [], []
        for comment, analysis in generate(shortfall, dominant, base_time, seed, start_index=have):
            comment["tenant_id"] = current.tenant_id
            comment["post_id"] = post_id
            comment["external_id"] = f"{p.external_id}-sync-{have + len(crows)}"
            analysis["tenant_id"] = current.tenant_id
            crows.append(comment)
            arows.append(analysis)
        if crows:
            db.bulk_insert_mappings(CommentModel, crows)
            db.bulk_insert_mappings(CAModel, arows)
    p.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    return post_sentiment(post_id, current, db)


@router.delete("/{post_id}")
def delete_post(post_id: str, current: CurrentUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Soft-delete a post and its comments/analyses."""
    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    p.is_deleted = True
    # Also soft-delete comments
    comment_ids = [c.id for c in db.query(Comment.id).filter(Comment.post_id == post_id).all()]
    if comment_ids:
        db.query(Comment).filter(Comment.id.in_(comment_ids)).update(
            {"is_deleted": True}, synchronize_session=False)
    db.commit()
    return {"ok": True, "post_id": post_id}


@router.get("/{post_id}/sentiment-timeseries")
def post_sentiment_timeseries(
    post_id: str,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    date_from: str | None = None,
    date_to: str | None = None,
    granularity: str = "daily",
):
    """Return sentiment counts grouped by date for charting."""
    from sqlalchemy import text

    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")

    # Pull raw rows: (published_at, sentiment) for all matching comments
    q = (
        db.query(Comment.published_at, CommentAnalysis.sentiment)
        .outerjoin(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .filter(Comment.post_id == post_id, Comment.is_deleted == False)
    )
    if date_from:
        q = q.filter(Comment.published_at >= _parse_dt_from(date_from))
    if date_to:
        q = q.filter(Comment.published_at <= _parse_dt_to(date_to))

    rows = q.all()

    # Group in Python — no DB-specific date casting needed
    from collections import defaultdict
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"Positive": 0, "Negative": 0, "Neutral": 0})

    for pub_at, sentiment in rows:
        if pub_at is None:
            continue
        if granularity == "monthly":
            key = pub_at.strftime("%Y-%m")
        elif granularity == "weekly":
            # ISO week start (Monday)
            iso_year, iso_week, _ = pub_at.isocalendar()
            key = f"{iso_year}-W{iso_week:02d}"
        else:  # daily
            key = pub_at.strftime("%Y-%m-%d")

        s = sentiment if sentiment in ("Positive", "Negative", "Neutral") else "Neutral"
        buckets[key][s] += 1

    result = [{"date": k, **v} for k, v in sorted(buckets.items())]
    return result


class ExtractSheetNarrativeRequest(BaseModel):
    sheet_url: str


class _ImportSheetRequest(BaseModel):
    sheet_url: str
    social_profile_id: Optional[str] = None   # pin all rows to this profile
    client_id: Optional[str] = None            # fallback client when profile omitted
    date_override: Optional[str] = None        # ISO date to stamp on created posts


@router.post("/import-from-researcher-sheet")
def import_from_researcher_sheet(
    body: _ImportSheetRequest,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parse a researcher/seeding Google Sheet and upsert Post stubs for every URL found.

    Works for:
    * The standard seeding format: SNO | POST LINK | … | EXISTING COMMENTS | COMMENTS TO ADD
    * Client sections detected automatically (rows where POST LINK cell is not a URL).

    Returns { created, updated, skipped, sections } where sections lists per-client counts.
    """
    import csv as _csv
    import io as _io
    import re as _re
    import uuid as _uuid
    from datetime import timezone as _tz
    import httpx as _httpx

    url = body.sheet_url.strip()
    # Convert Sheets edit URL → CSV export
    if "docs.google.com/spreadsheets" in url:
        gid_match = _re.search(r"gid=(\d+)", url)
        gid = gid_match.group(1) if gid_match else "0"
        id_match = _re.search(r"/d/([a-zA-Z0-9_-]+)", url)
        if not id_match:
            raise HTTPException(400, "Could not extract Google Sheet ID from URL")
        sheet_id = id_match.group(1)
        # Try gviz (by sheet name) first; fall back to export?gid=
        csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    else:
        csv_url = url

    try:
        resp = _httpx.get(csv_url, follow_redirects=True, timeout=20.0)
        resp.raise_for_status()
        rows = list(_csv.reader(_io.StringIO(resp.text)))
    except Exception as e:
        raise HTTPException(502, f"Could not fetch or parse sheet: {e}")

    if not rows:
        raise HTTPException(422, "Sheet is empty")

    # ── Find header row ─────────────────────────────────────────────────────
    header_idx = None
    for i, row in enumerate(rows[:20]):
        cols_upper = [c.strip().upper() for c in row]
        if any("POST LINK" in c for c in cols_upper):
            header_idx = i
            break
    if header_idx is None:
        raise HTTPException(422, "Could not find a POST LINK column in the sheet. "
                                 "Expected header row with 'POST LINK' column.")

    header = [c.strip().upper() for c in rows[header_idx]]

    def col(name: str) -> int | None:
        for idx, h in enumerate(header):
            if h == name or h.startswith(name):
                return idx
        return None

    url_col  = col("POST LINK")
    exist_col = col("EXISTING COMMENTS")
    add_col   = col("COMMENTS TO ADD")
    narr_col  = col("NARRATIVE")
    sent_col  = col("POST SENTIMENT")

    if url_col is None:
        raise HTTPException(422, "POST LINK column not found")

    # ── Pre-fetch all profiles for matching ─────────────────────────────────
    all_profiles = db.query(SocialProfile).filter(
        SocialProfile.tenant_id == current.tenant_id,
        SocialProfile.is_deleted == False,
    ).all()

    # Map: lowercase client name fragment → profile
    def _find_profile(section_name: str) -> tuple[str | None, str | None]:
        if body.social_profile_id:
            sp = db.query(SocialProfile).filter(
                SocialProfile.id == body.social_profile_id,
                SocialProfile.tenant_id == current.tenant_id,
            ).first()
            return (body.social_profile_id, sp.client_id if sp else body.client_id)
        name_lower = section_name.lower().strip()
        for sp in all_profiles:
            sp_name = (sp.display_name or sp.handle or "").lower()
            client_name = ""
            if sp.client_id:
                c = db.query(Client).filter(Client.id == sp.client_id).first()
                client_name = (c.name if c else "").lower()
            if name_lower in client_name or client_name in name_lower or name_lower in sp_name:
                return (sp.id, sp.client_id)
        return (body.social_profile_id, body.client_id)

    # ── Process rows ─────────────────────────────────────────────────────────
    URL_PATTERN = _re.compile(r"https?://", _re.I)
    created = 0; updated = 0; skipped = 0
    sections: dict[str, dict] = {}
    current_section = "Unknown"
    current_profile_id, current_client_id = _find_profile(current_section)

    post_date = datetime.now(_tz.utc)
    if body.date_override:
        try:
            post_date = datetime.fromisoformat(body.date_override).replace(tzinfo=_tz.utc)
        except Exception:
            pass

    for row in rows[header_idx + 1:]:
        if not row or all(not c.strip() for c in row):
            continue
        cell = row[url_col].strip() if url_col < len(row) else ""

        if not URL_PATTERN.match(cell):
            # Section header row (client name)
            candidate = next((c.strip() for c in row if c.strip()), "")
            if candidate and len(candidate) < 60:
                current_section = candidate
                current_profile_id, current_client_id = _find_profile(current_section)
            continue

        post_url = cell
        if current_section not in sections:
            sections[current_section] = {"created": 0, "updated": 0, "profile_id": current_profile_id}

        # Existing comments count
        existing = 0
        if exist_col is not None and exist_col < len(row):
            try: existing = int(row[exist_col].strip() or 0)
            except ValueError: pass

        # Comments to add
        to_add = 0
        if add_col is not None and add_col < len(row):
            try: to_add = int(row[add_col].strip() or 0)
            except ValueError: pass

        narrative_text = ""
        if narr_col is not None and narr_col < len(row):
            narrative_text = row[narr_col].strip()
        sentiment_text = ""
        if sent_col is not None and sent_col < len(row):
            sentiment_text = row[sent_col].strip()

        # Determine platform
        u_lower = post_url.lower()
        if "instagram.com" in u_lower:
            platform = "instagram"
        elif "twitter.com" in u_lower or "x.com" in u_lower:
            platform = "twitter"
        elif "youtube.com" in u_lower or "youtu.be" in u_lower:
            platform = "youtube"
        else:
            platform = "facebook"

        external_id = _re.sub(r"[^a-zA-Z0-9_-]", "_", post_url)[-60:]

        existing_post = db.query(Post).filter(
            Post.tenant_id == current.tenant_id, Post.url == post_url,
        ).first()

        if existing_post:
            m = dict(existing_post.metrics or {})
            m["real_comment_total"] = existing + to_add
            m["existing_comments"]  = existing
            m["seeded_target"]      = to_add
            m["imported_from_sheet"] = True
            existing_post.metrics = m
            if current_profile_id and not existing_post.social_profile_id:
                existing_post.social_profile_id = current_profile_id
            if current_client_id and not existing_post.client_id:
                existing_post.client_id = current_client_id
            if narrative_text and not existing_post.content:
                existing_post.content = narrative_text
            updated += 1
            sections[current_section]["updated"] = sections[current_section].get("updated", 0) + 1
        else:
            job_id = _uuid.uuid4().hex[:12]
            new_post = Post(
                tenant_id=current.tenant_id,
                source_kind=platform,
                external_id=external_id,
                url=post_url,
                permalink=post_url,
                content=narrative_text or f"[{current_section}] {platform.title()} post",
                author=current_section,
                language="en",
                published_at=post_date,
                social_profile_id=current_profile_id,
                client_id=current_client_id,
                metrics={
                    "fetch_job": {"id": job_id, "status": "sheet_import",
                                  "comments_added": existing, "updated_at": datetime.utcnow().isoformat()},
                    "real_comment_total": existing + to_add,
                    "existing_comments": existing,
                    "seeded_target": to_add,
                    "imported_from_sheet": True,
                },
            )
            db.add(new_post)
            db.flush()
            db.add(PostAnalysis(
                tenant_id=current.tenant_id, post_id=new_post.id,
                summary=narrative_text[:200] if narrative_text else "",
                main_narrative=narrative_text,
                intent=sentiment_text, political_angle="",
                crisis_probability=0.0, urgency_score=0.0, virality_score=0.0, result={},
            ))
            created += 1
            sections[current_section]["created"] = sections[current_section].get("created", 0) + 1

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Database error: {e}")

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "total": created + updated,
        "sections": [
            {"client": k, "profile_id": v.get("profile_id"),
             "created": v.get("created", 0), "updated": v.get("updated", 0)}
            for k, v in sections.items()
        ],
    }


@router.post("/extract-sheet-narrative")
def extract_sheet_narrative(body: ExtractSheetNarrativeRequest,
                            current: CurrentUser = Depends(get_current_user)):  # noqa: ARG001
    """Extract a narrative/description from a Google Sheets public CSV export."""
    import csv
    import io

    import httpx

    url = body.sheet_url.strip()
    # Convert Sheets edit/share URL → CSV export URL
    if "docs.google.com/spreadsheets" in url:
        # Extract sheet ID and convert
        import re
        gid_match = re.search(r"gid=(\d+)", url)
        gid = gid_match.group(1) if gid_match else "0"
        id_match = re.search(r"/d/([a-zA-Z0-9_-]+)", url)
        if not id_match:
            raise HTTPException(400, "Could not extract Google Sheet ID from URL")
        sheet_id = id_match.group(1)
        url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"

    try:
        r = httpx.get(url, follow_redirects=True, timeout=15.0)
        r.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"Could not fetch sheet: {e}")

    try:
        reader = csv.DictReader(io.StringIO(r.text))
        rows = list(reader)
    except Exception as e:
        raise HTTPException(422, f"Could not parse CSV: {e}")

    # Look for a "narrative", "description", or "content" column
    narrative_keys = ["narrative", "description", "content", "post narrative", "post_narrative"]
    narrative = ""
    for row in rows:
        for key in row:
            if key.strip().lower() in narrative_keys and row[key].strip():
                narrative = row[key].strip()
                break
        if narrative:
            break

    # Fallback: concatenate all non-empty cell values from first data row
    if not narrative and rows:
        parts = [v.strip() for v in rows[0].values() if v.strip()]
        narrative = " | ".join(parts)

    return {"narrative": narrative, "rows": len(rows)}


# ── AI Narrative generation ───────────────────────────────────────────────────

@router.get("/{post_id}/narrative")
def get_post_narrative(
    post_id: str,
    regenerate: bool = False,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return (or generate on-the-fly) an AI narrative for a post.

    The narrative synthesises the post's content with the sampled comment
    sentiment to produce a 2-3 sentence plain-English description of what
    the post is about and how the public is reacting.
    """
    import uuid as _uuid2

    p = db.query(Post).filter(Post.id == post_id, Post.tenant_id == current.tenant_id).first()
    if not p:
        raise HTTPException(404, "Not found")

    pa = db.query(PostAnalysis).filter(PostAnalysis.post_id == post_id).first()
    if pa and pa.main_narrative and not regenerate:
        return {"post_id": post_id, "narrative": pa.main_narrative, "summary": pa.summary or ""}

    # ── gather data ──────────────────────────────────────────────────────────
    content = (p.content or "").strip()
    author  = (p.author  or "").strip()

    # Get up to 40 comments (mix of all sentiments)
    comment_rows = (
        db.query(Comment.content, CommentAnalysis.sentiment, CommentAnalysis.toxicity_score)
        .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .filter(Comment.post_id == post_id, Comment.is_deleted == False)
        .order_by(Comment.published_at.desc().nullslast())
        .limit(40)
        .all()
    )

    pos_comments = [c for c, s, _ in comment_rows if s == "Positive"]
    neg_comments = [c for c, s, _ in comment_rows if s == "Negative"]
    neu_comments = [c for c, s, _ in comment_rows if s == "Neutral"]
    total_sample = len(comment_rows)

    neg_pct = round(len(neg_comments) * 100 / max(total_sample, 1))
    pos_pct = round(len(pos_comments) * 100 / max(total_sample, 1))

    # ── build narrative ──────────────────────────────────────────────────────
    platform_label = {
        "instagram": "Instagram", "facebook": "Facebook",
        "twitter": "Twitter/X", "youtube": "YouTube",
    }.get((p.source_kind or "").lower(), "social media")

    content_snip = content[:200] + ("…" if len(content) > 200 else "")
    by_line = f"by @{author}" if author else ""

    if total_sample == 0:
        tone_line = "No comments have been analysed yet — fetch comments to generate a full narrative."
        risk = "unknown"
    elif pos_pct > 65:
        tone_line = f"Public response is overwhelmingly supportive — {pos_pct}% positive, {neg_pct}% negative across {total_sample} analysed comments."
        risk = "LOW"
    elif neg_pct > 50:
        tone_line = f"Public reaction is mostly critical — {neg_pct}% negative, {pos_pct}% positive across {total_sample} analysed comments. Reputation risk is HIGH."
        risk = "HIGH"
    elif neg_pct > 30:
        tone_line = f"Sentiment is mixed with notable criticism — {pos_pct}% positive, {neg_pct}% negative across {total_sample} analysed comments. Monitor closely."
        risk = "MEDIUM"
    else:
        tone_line = f"Public response is generally positive — {pos_pct}% positive, {neg_pct}% negative across {total_sample} analysed comments."
        risk = "LOW"

    sample_lines = []
    if neg_comments:
        sample_lines.append(f'Critical voices: "{neg_comments[0][:100]}"')
    if pos_comments:
        sample_lines.append(f'Supportive voices: "{pos_comments[0][:100]}"')

    narrative_parts = [
        f"[{platform_label} post {by_line}] {content_snip}",
        tone_line,
    ]
    if sample_lines:
        narrative_parts.append(" | ".join(sample_lines))
    narrative_parts.append(f"Reputation risk: {risk}")

    narrative = "\n\n".join(narrative_parts)
    summary   = content_snip[:200] if content_snip else tone_line[:200]

    # ── upsert PostAnalysis ──────────────────────────────────────────────────
    if pa:
        pa.main_narrative    = narrative
        pa.summary           = summary
        pa.crisis_probability = neg_pct / 100
        pa.result            = {**(pa.result or {}), "narrative_engine": "heuristic", "samples": total_sample}
    else:
        pa = PostAnalysis(
            id=str(_uuid2.uuid4()),
            tenant_id=current.tenant_id,
            post_id=post_id,
            summary=summary,
            main_narrative=narrative,
            crisis_probability=neg_pct / 100,
            intent="discussion",
            political_angle="none",
            urgency_score=round(neg_pct / 100, 2),
            virality_score=0.3,
            result={"narrative_engine": "heuristic", "samples": total_sample},
        )
        db.add(pa)
    db.commit()

    return {"post_id": post_id, "narrative": narrative, "summary": summary}
