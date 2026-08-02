"""
Sentiment analysis — Claude Haiku (primary) with heuristic fallback.
Replaces Ollama: 100ms/call, 50 parallel, <$1/day at 10k comments/day.
"""
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ai.comment_analyzer import heuristic_comment
from app.ai.providers.catalog import PROVIDERS
from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import AIProviderConfig, ApiUsageLog, Client, Comment, CommentAnalysis, Post, SocialProfile
from app.utils.crypto import decrypt_key

router = APIRouter(prefix="/sentiment", tags=["sentiment"])

# Haiku pricing (per million tokens, as of 2025)
_INPUT_PRICE_PER_M  = 0.80   # $0.80 / 1M input tokens
_OUTPUT_PRICE_PER_M = 4.00   # $4.00 / 1M output tokens


def _estimate_cost(input_tok: int, output_tok: int) -> float:
    return (input_tok * _INPUT_PRICE_PER_M + output_tok * _OUTPUT_PRICE_PER_M) / 1_000_000


def _log_usage(
    db: Session,
    tenant_id: str,
    user_id: Optional[str],
    results: list[Optional[dict]],
    operation: str = "sentiment_batch",
):
    """Write a single ApiUsageLog row summarising the batch."""
    total_in = sum(r.get("_input_tokens", 0) for r in results if r)
    total_out = sum(r.get("_output_tokens", 0) for r in results if r)
    if total_in + total_out == 0:
        return
    row = ApiUsageLog(
        tenant_id=tenant_id,
        user_id=user_id,
        model=settings.CLAUDE_SENTIMENT_MODEL,
        operation=operation,
        input_tokens=total_in,
        output_tokens=total_out,
        total_tokens=total_in + total_out,
        cost_usd=_estimate_cost(total_in, total_out),
        item_count=len([r for r in results if r]),
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    )
    db.add(row)
    db.commit()


# ── Models ───────────────────────────────────────────────────────────────────

class AnalysisRequest(BaseModel):
    post_id: str
    comments: list[dict]  # [{"id": "...", "text": "..."}, ...]


class GenerateMissingRequest(BaseModel):
    client_id: str


# ── Background worker ────────────────────────────────────────────────────────

async def _analyze_comments_background(
    db: Session,
    post: Post,
    comments: list[dict],
    user_id: Optional[str],
):
    """
    Batch-analyze comments using the tenant's configured AI provider.
    Priority: DB config → env ANTHROPIC_API_KEY → heuristic fallback.
    """
    texts = [c.get("text", "") for c in comments]

    # Resolve provider: DB config first, then env fallback
    provider = None
    api_key = None
    model = None
    provider_id = "heuristic"

    db_cfg = (
        db.query(AIProviderConfig)
        .filter(
            AIProviderConfig.tenant_id == post.tenant_id,
            AIProviderConfig.is_active == True,
            AIProviderConfig.is_validated == True,
        )
        .first()
    )
    if db_cfg and db_cfg.provider in PROVIDERS:
        provider = PROVIDERS[db_cfg.provider]
        api_key = decrypt_key(db_cfg.api_key_enc)
        model = db_cfg.model
        provider_id = db_cfg.provider
    elif settings.ANTHROPIC_API_KEY and settings.ANTHROPIC_API_KEY.startswith("sk-ant"):
        provider = PROVIDERS["claude"]
        api_key = settings.ANTHROPIC_API_KEY
        model = settings.CLAUDE_SENTIMENT_MODEL
        provider_id = "claude"

    if provider and api_key and model:
        claude_results = await provider.analyze_batch(texts, api_key, model)
        _log_usage(db, post.tenant_id, user_id, claude_results, f"sentiment_batch:{provider_id}")
    else:
        claude_results = [None] * len(comments)

    for cm, claude_res in zip(comments, claude_results):
        # Skip already-analyzed
        exists = (
            db.query(CommentAnalysis.id)
            .join(Comment, Comment.id == CommentAnalysis.comment_id)
            .filter(Comment.id == cm.get("id"))
            .first()
        )
        if exists:
            continue

        # Use Claude result or fall back to heuristic
        result = claude_res or heuristic_comment(cm.get("text", ""))

        ca = CommentAnalysis(
            tenant_id=post.tenant_id,
            comment_id=cm.get("id"),
            sentiment=result.get("sentiment", "Neutral"),
            stance=result.get("stance", "Irrelevant"),
            emotion=result.get("emotion", []),
            sarcasm=result.get("sarcasm", False),
            toxicity_score=result.get("toxicity_score", 0.05),
            confidence=result.get("confidence", 0.8),
            result=result,
        )
        db.add(ca)

    db.commit()


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/analyze-batch")
async def analyze_batch_endpoint(
    req: AnalysisRequest,
    bg: BackgroundTasks,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Queue a batch of comments for parallel Claude Haiku sentiment analysis."""
    post = db.query(Post).filter(Post.id == req.post_id).first()
    if not post:
        raise HTTPException(404, "Post not found")

    bg.add_task(
        _analyze_comments_background,
        db, post, req.comments, current.id
    )
    # Detect active engine for response metadata
    db_cfg = db.query(AIProviderConfig).filter(
        AIProviderConfig.tenant_id == current.tenant_id,
        AIProviderConfig.is_active == True,
        AIProviderConfig.is_validated == True,
    ).first()
    if db_cfg:
        engine = f"{db_cfg.provider}:{db_cfg.model}"
    elif settings.ANTHROPIC_API_KEY and settings.ANTHROPIC_API_KEY.startswith("sk-ant"):
        engine = f"claude:{settings.CLAUDE_SENTIMENT_MODEL}"
    else:
        engine = "heuristic"

    return {
        "ok": True,
        "queued": len(req.comments),
        "post_id": req.post_id,
        "engine": engine,
    }


@router.get("/progress/{post_id}")
def progress(
    post_id: str,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Poll for analysis completion — returns {done, total, percent}."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(404, "Post not found")

    total = db.query(Comment).filter(Comment.post_id == post_id).count()
    if total == 0:
        return {"done": 0, "total": 0, "percent": 100}

    done = (
        db.query(CommentAnalysis)
        .join(Comment)
        .filter(Comment.post_id == post_id)
        .count()
    )
    return {"done": done, "total": total, "percent": int(done * 100 / total) if total else 0}


@router.post("/generate-missing")
def generate_missing(
    req: GenerateMissingRequest,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    For all posts in a client that have 0 Comment records, generate synthetic
    comments with heuristic sentiment (used for demo/seeded data accounts).
    """
    import hashlib
    from app.ai.comment_analyzer import heuristic_comment
    from app.ai.post_analyzer import heuristic_post
    from app.ai.sample_comments import generate as gen_comments
    from sqlalchemy import or_

    profile_ids = [r for (r,) in
        db.query(SocialProfile.id)
        .filter(SocialProfile.client_id == req.client_id, SocialProfile.is_deleted == False)
        .all()]

    posts = db.query(Post).filter(
        Post.tenant_id == current.tenant_id,
        Post.is_deleted == False,
        or_(Post.client_id == req.client_id,
            Post.social_profile_id.in_(profile_ids)) if profile_ids
        else Post.client_id == req.client_id,
    ).all()

    generated = skipped = posts_processed = 0

    for post in posts:
        existing = db.query(func.count(Comment.id)).filter(Comment.post_id == post.id).scalar() or 0
        if existing > 0:
            skipped += 1
            continue

        posts_processed += 1
        real_count = (post.metrics or {}).get("real_comment_total", 0) or \
                     (post.metrics or {}).get("comment_count", 0) or 0
        cap = min(int(real_count) if real_count else 80, 200) or 80

        pa = heuristic_post(post.id, post.content or "")
        dominant = pa.get("sentiment", "Neutral") if isinstance(pa, dict) else "Neutral"
        seed = int(hashlib.md5((post.external_id or post.id).encode()).hexdigest()[:8], 16)
        pub_at = post.published_at or datetime.now(timezone.utc)

        for cm, ca_data in gen_comments(cap, dominant, pub_at, seed, context="generic"):
            db.add(Comment(
                id=cm["id"], post_id=post.id, tenant_id=post.tenant_id,
                content=cm["content"], author=cm["author"],
                published_at=cm["published_at"],
            ))
            db.add(CommentAnalysis(
                id=ca_data["id"], tenant_id=post.tenant_id,
                comment_id=cm["id"],
                sentiment=ca_data["sentiment"],
                stance=ca_data.get("stance", "Irrelevant"),
                emotion=ca_data.get("emotion", []),
                sarcasm=ca_data.get("sarcasm", False),
                toxicity_score=ca_data.get("toxicity_score", 0.05),
                spam_score=ca_data.get("spam_score", 0.02),
                bot_probability=ca_data.get("bot_probability", 0.05),
                confidence=ca_data.get("confidence", 0.9),
                result=ca_data,
            ))
            generated += 1

        if posts_processed % 10 == 0:
            db.commit()

    db.commit()
    return {"generated": generated, "skipped": skipped, "posts_processed": posts_processed}
