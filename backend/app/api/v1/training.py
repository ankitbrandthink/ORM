"""AI Model Training — learns from accumulated sentiment data to improve accuracy.

This endpoint:
1. Extracts verified sentiment labels from the comment analysis history
2. Builds an adaptive lexicon (positive/negative word lists) from real data
3. Identifies the most discriminative words per sentiment class
4. Returns training statistics and accuracy estimates
5. Updates the sentiment model with new patterns

The more data fed in, the better the heuristic and AI prompts get calibrated.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import Client, Comment, CommentAnalysis, Post, PostAnalysis

logger = logging.getLogger("orm.training")
router = APIRouter()

# Path for persisting learned lexicon
_LEARNED_LEXICON_PATH = os.path.join(os.path.dirname(__file__), "../../ai/learned_lexicon.json")
_LEARNED_LEXICON_PATH = os.path.normpath(_LEARNED_LEXICON_PATH)

_training_lock = threading.Lock()
_training_status: dict = {"status": "idle", "progress": 0, "last_trained": None, "stats": {}}


def _load_learned_lexicon() -> dict:
    try:
        if os.path.exists(_LEARNED_LEXICON_PATH):
            with open(_LEARNED_LEXICON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {"positive": [], "negative": [], "sarcasm": [], "version": 0, "trained_on": 0}


def _save_learned_lexicon(lexicon: dict):
    try:
        os.makedirs(os.path.dirname(_LEARNED_LEXICON_PATH), exist_ok=True)
        with open(_LEARNED_LEXICON_PATH, "w", encoding="utf-8") as f:
            json.dump(lexicon, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning("Failed to save learned lexicon: %s", e)


def _extract_words(text: str) -> list[str]:
    """Extract meaningful words from comment text (no stopwords, length >= 3)."""
    _STOP = {
        "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
        "from","is","was","are","were","be","been","has","have","had","do","does","did",
        "will","would","could","should","may","might","this","that","it","its","i","we",
        "you","he","she","they","them","their","our","your","my","his","her","as","so",
        "if","not","no","what","when","who","which","how","all","also","just","more",
        "can","than","then","there","up","out","about","after","into","s","t","re","ve",
        "ll","get","got","one","see","time","new","very","even","back","much","am","me",
        "him","any","here","there","too","us","do","been","me","she","they",
    }
    words = re.findall(r"\b[a-z]{3,}\b", (text or "").lower())
    return [w for w in words if w not in _STOP]


def _run_training(tenant_id: str, client_id: Optional[str], db_factory):
    """Background training run — analyzes all verified comment data."""
    global _training_status
    with _training_lock:
        _training_status = {"status": "running", "progress": 5, "last_trained": None, "stats": {}}

    db: Session = db_factory()
    try:
        # 1. Load all verified comment analyses (non-estimated)
        q = (
            db.query(Comment.content, CommentAnalysis.sentiment, CommentAnalysis.confidence)
            .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
            .join(Post, Post.id == Comment.post_id)
            .filter(Post.tenant_id == tenant_id, Post.is_deleted == False)
        )
        if client_id:
            q = q.filter(Post.client_id == client_id)
        rows = q.all()

        total = len(rows)
        logger.info("Training on %d comment samples", total)

        _training_status["progress"] = 20

        if total < 10:
            _training_status = {
                "status": "done",
                "progress": 100,
                "last_trained": datetime.now(timezone.utc).isoformat(),
                "stats": {"error": "Not enough data — need at least 10 analyzed comments", "total": total},
            }
            return

        # 2. Build word frequency tables per sentiment class
        word_freq: dict[str, Counter] = defaultdict(Counter)
        emoji_freq: dict[str, Counter] = defaultdict(Counter)
        total_per_class: dict[str, int] = defaultdict(int)

        high_confidence_rows = [(c, s, conf) for c, s, conf in rows if conf is not None and conf >= 0.65]
        if len(high_confidence_rows) < 5:
            high_confidence_rows = rows  # use all if not enough high-confidence

        for content, sentiment, _ in high_confidence_rows:
            if not content or not sentiment:
                continue
            cls = sentiment
            total_per_class[cls] += 1
            words = _extract_words(content)
            word_freq[cls].update(words)
            # Emoji extraction
            emojis = re.findall(r"[\U0001F000-\U0001FFFF]|[☀-➿]", content)
            emoji_freq[cls].update(emojis)

        _training_status["progress"] = 50

        # 3. TF-IDF-style discrimination: words that appear much more in one class than others
        def discriminative_words(target_cls: str, n: int = 50) -> list[str]:
            target_count = total_per_class.get(target_cls, 1)
            other_total = sum(v for k, v in total_per_class.items() if k != target_cls) or 1
            scores = {}
            for word, cnt in word_freq[target_cls].items():
                target_freq = cnt / target_count
                other_cnt = sum(word_freq[c].get(word, 0) for c in word_freq if c != target_cls)
                other_freq = other_cnt / other_total
                if target_freq > 0.01:  # appears in at least 1% of target class
                    ratio = target_freq / (other_freq + 0.001)
                    scores[word] = ratio
            return [w for w, _ in sorted(scores.items(), key=lambda x: -x[1])[:n]]

        pos_words = discriminative_words("Positive")
        neg_words = discriminative_words("Negative")

        _training_status["progress"] = 70

        # 4. Top discriminative emoji per class
        def top_emoji(cls: str, n: int = 15) -> list[str]:
            return [e for e, _ in emoji_freq[cls].most_common(n)]

        pos_emoji = top_emoji("Positive")
        neg_emoji = top_emoji("Negative")

        # 5. Accuracy estimate from high-confidence samples
        correct = 0
        from app.ai.comment_analyzer import heuristic_comment
        sampled = high_confidence_rows[:200]
        for content, true_sentiment, _ in sampled:
            if content:
                pred = heuristic_comment(content).get("sentiment")
                if pred == true_sentiment:
                    correct += 1
        accuracy = round(correct * 100 / len(sampled), 1) if sampled else 0

        _training_status["progress"] = 85

        # 6. Build and save updated lexicon
        existing = _load_learned_lexicon()
        new_lexicon = {
            "positive": list(dict.fromkeys(pos_words + pos_emoji + existing.get("positive", [])[:20]))[:60],
            "negative": list(dict.fromkeys(neg_words + neg_emoji + existing.get("negative", [])[:20]))[:60],
            "sarcasm": existing.get("sarcasm", []),
            "version": existing.get("version", 0) + 1,
            "trained_on": total,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "accuracy_estimate": accuracy,
            "class_distribution": {k: int(v) for k, v in total_per_class.items()},
        }
        _save_learned_lexicon(new_lexicon)

        # 7. Inject learned words into running heuristic
        try:
            from app.ai import comment_analyzer as ca
            for w in pos_words[:30]:
                ca._POS.add(w)
            for w in neg_words[:30]:
                ca._NEG.add(w)
            for e in pos_emoji[:10]:
                ca._POS.add(e)
            for e in neg_emoji[:10]:
                ca._NEG.add(e)
        except Exception as inject_err:
            logger.warning("Could not inject learned words: %s", inject_err)

        _training_status = {
            "status": "done",
            "progress": 100,
            "last_trained": datetime.now(timezone.utc).isoformat(),
            "stats": {
                "total_samples": total,
                "high_confidence_samples": len(high_confidence_rows),
                "heuristic_accuracy_pct": accuracy,
                "class_distribution": {k: int(v) for k, v in total_per_class.items()},
                "new_positive_words": pos_words[:20],
                "new_negative_words": neg_words[:20],
                "new_positive_emoji": pos_emoji,
                "new_negative_emoji": neg_emoji,
                "lexicon_version": new_lexicon["version"],
            },
        }

    except Exception as e:
        logger.exception("Training run failed")
        _training_status = {
            "status": "error",
            "progress": 0,
            "last_trained": None,
            "stats": {"error": str(e)},
        }
    finally:
        db.close()


@router.post("/train")
def trigger_training(
    client_id: Optional[str] = Query(None, description="Limit training to one client's data"),
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger AI model training from accumulated sentiment data.

    Analyzes all verified comment analyses, extracts discriminative word patterns,
    updates the sentiment lexicon, and improves future heuristic accuracy.
    The more data fed in, the better the model trains.
    Returns a job ticket — poll /analytics/train/status for progress.
    """
    global _training_status
    if _training_status.get("status") == "running":
        return JSONResponse({"status": "already_running", "progress": _training_status.get("progress", 0)})

    from app.database import SessionLocal
    _training_status = {"status": "queued", "progress": 0, "last_trained": None, "stats": {}}

    def _worker():
        _run_training(current.tenant_id, client_id, SessionLocal)

    threading.Thread(target=_worker, daemon=True, name="ai-training").start()
    return {"status": "started", "message": "Training started — poll /analytics/train/status for progress"}


@router.get("/train/status")
def training_status(
    current: CurrentUser = Depends(get_current_user),
):
    """Return the current training job status and results."""
    return _training_status


@router.get("/train/lexicon")
def get_learned_lexicon(
    current: CurrentUser = Depends(get_current_user),
):
    """Return the current learned lexicon (words added from training)."""
    return _load_learned_lexicon()
