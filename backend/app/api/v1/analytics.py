import json
import logging
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

from app.ai.bot_detector import bot_score, authenticity_label

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import Client, Comment, CommentAnalysis, Post, PostAnalysis, PressSource, SocialProfile

_STOP_WORDS = {
    "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
    "from","is","was","are","were","be","been","has","have","had","do","does","did",
    "will","would","could","should","may","might","this","that","these","those","it",
    "its","i","we","you","he","she","they","them","their","our","your","my","his",
    "her","as","so","if","not","no","what","when","who","which","how","all","also",
    "just","more","can","than","then","there","up","out","about","after","before",
    "into","s","t","re","ve","ll","don","won","can","get","got","like","go","went",
    "said","say","one","two","know","see","make","time","way","good","new","first",
    "last","long","great","little","own","right","big","high","need","years","come",
    "people","us","very","over","even","back","same","much","am","me","him","any",
    "only","him","her","him","them","some","such","each","most","other","many",
    "because","while","through","during","between","against","without","already",
    "very","well","still","again","off","down","because","those","where","here",
    "being","having","doing","going","coming","getting","making","taking","giving",
    "every","under","over","above","below","within","without","between","among",
    "though","although","however","therefore","furthermore","moreover","perhaps",
    "always","never","often","sometimes","usually","generally","especially",
    "things","thing","make","take","give","keep","let","put","seem","turn",
    "show","try","ask","mean","become","leave","feel","call","help","start",
    "these","those","here","there","where","when","while","since","until","upon",
}

router = APIRouter()


def _group_by_date(rows, key_fn=None):
    """Group (published_at, sentiment, count) rows by date string, returning sorted list."""
    series: dict = {}
    for row in rows:
        if key_fn:
            date_key, sentiment, count = key_fn(row)
        else:
            pub, sentiment, count = row
            date_key = str(pub)[:10] if pub else "unknown"
        series.setdefault(date_key, {"Positive": 0, "Negative": 0, "Neutral": 0})
        series[date_key][sentiment or "Neutral"] += count
    return [{"date": k, **v} for k, v in sorted(series.items())]


def _client_post_filter(db: Session, client_id: str):
    """Return a SQLAlchemy WHERE clause for filtering Posts by client (subquery, no Python list).

    Uses a correlated subquery for social_profile_id so all filtering stays in SQL —
    avoids the expensive Python-list IN() pattern that caused 35-49 second queries.
    """
    from sqlalchemy import or_
    profile_subq = db.query(SocialProfile.id).filter(SocialProfile.client_id == client_id)
    return or_(
        Post.client_id == client_id,
        Post.social_profile_id.in_(profile_subq),
    )


def _apply_client_filter(q, client_id: str | None, db: Session | None = None):
    """Filter by client_id using both direct Post.client_id and social-profile path."""
    if not client_id or db is None:
        return q
    return q.join(Post, Post.id == Comment.post_id).filter(
        Post.is_deleted == False,
        _client_post_filter(db, client_id),
    )


@router.get("/sentiment-overview")
def sentiment_overview(current: CurrentUser = Depends(get_current_user),
                       db: Session = Depends(get_db),
                       client_id: str | None = None):
    q = (db.query(CommentAnalysis.sentiment, func.count())
         .join(Comment, Comment.id == CommentAnalysis.comment_id)
         .filter(CommentAnalysis.tenant_id == current.tenant_id))
    if client_id:
        q = q.join(Post, Post.id == Comment.post_id).filter(
            Post.is_deleted == False,
            _client_post_filter(db, client_id),
        )
    rows = q.group_by(CommentAnalysis.sentiment).all()
    data = {s or "Unknown": c for s, c in rows}
    total = sum(data.values()) or 1
    return {
        "counts": data,
        "percentages": {k: round(v * 100 / total, 1) for k, v in data.items()},
        "total": sum(data.values()),
    }


@router.get("/emotion-breakdown")
def emotion_breakdown(current: CurrentUser = Depends(get_current_user),
                      db: Session = Depends(get_db),
                      client_id: str | None = None):
    q = (db.query(CommentAnalysis.emotion)
         .join(Comment, Comment.id == CommentAnalysis.comment_id)
         .filter(CommentAnalysis.tenant_id == current.tenant_id))
    if client_id:
        q = q.join(Post, Post.id == Comment.post_id).filter(
            Post.is_deleted == False,
            _client_post_filter(db, client_id),
        )
    counter: Counter = Counter()
    for (emotions,) in q.all():
        for e in (emotions or []):
            counter[e] += 1
    return {"emotions": dict(counter)}


@router.get("/trend")
def trend(current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db),
          date_from: str | None = None, date_to: str | None = None,
          client_id: str | None = None):
    """Sentiment trend — daily comment counts, strictly scoped to the requested client."""
    from app.api.v1.posts import _parse_dt_from, _parse_dt_to
    q = (db.query(Comment.published_at, CommentAnalysis.sentiment, func.count())
         .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
         .filter(Comment.tenant_id == current.tenant_id))
    if client_id:
        q = q.join(Post, Post.id == Comment.post_id).filter(
            Post.is_deleted == False,
            _client_post_filter(db, client_id),
        )
    if date_from:
        q = q.filter(Comment.published_at >= _parse_dt_from(date_from))
    if date_to:
        q = q.filter(Comment.published_at <= _parse_dt_to(date_to))
    rows = q.group_by(Comment.published_at, CommentAnalysis.sentiment).all()
    return {"trend": _group_by_date(rows)}


@router.get("/profile-trend/{profile_id}")
def profile_trend(profile_id: str, current: CurrentUser = Depends(get_current_user),
                  db: Session = Depends(get_db),
                  date_from: str | None = None, date_to: str | None = None):
    """Sentiment trend for one social profile — daily comment counts."""
    from app.api.v1.posts import _parse_dt_from, _parse_dt_to
    q = (db.query(Comment.published_at, CommentAnalysis.sentiment, func.count())
         .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
         .join(Post, Post.id == Comment.post_id)
         .filter(Comment.tenant_id == current.tenant_id,
                 Post.social_profile_id == profile_id))
    if date_from:
        q = q.filter(Comment.published_at >= _parse_dt_from(date_from))
    if date_to:
        q = q.filter(Comment.published_at <= _parse_dt_to(date_to))
    rows = q.group_by(Comment.published_at, CommentAnalysis.sentiment).all()
    return {"profile_id": profile_id, "trend": _group_by_date(rows)}


def _zero_slots(date_from: str | None, date_to: str | None, granularity: str) -> list[str]:
    """Generate every time-slot key in [date_from, date_to] for zero-padding."""
    from datetime import date as D, datetime as DT, timedelta
    if not date_from or not date_to:
        return []
    try:
        d0 = DT.fromisoformat(date_from).date()
        d1 = DT.fromisoformat(date_to).date()
    except Exception:
        return []

    slots: list[str] = []
    if granularity == "hourly":
        cur = d0
        while cur <= d1:
            for h in range(24):
                slots.append(f"{cur.isoformat()} {h:02d}:00")
            cur += timedelta(days=1)
    elif granularity == "daily":
        cur = d0
        while cur <= d1:
            slots.append(cur.isoformat())
            cur += timedelta(days=1)
    elif granularity == "weekly":
        seen: set = set()
        cur = d0
        while cur <= d1:
            ws = (cur - timedelta(days=cur.weekday())).isoformat()
            if ws not in seen:
                seen.add(ws)
                slots.append(ws)
            cur += timedelta(days=1)
    elif granularity == "monthly":
        y, m = d0.year, d0.month
        ey, em = d1.year, d1.month
        while (y, m) <= (ey, em):
            slots.append(f"{y:04d}-{m:02d}")
            m += 1
            if m > 12:
                m, y = 1, y + 1
    return slots


def _pad_trend(trend_dict: dict, slots: list[str]) -> list[dict]:
    """Return trend list with zero-filled entries for every slot in range."""
    empty = {"Positive": 0, "Negative": 0, "Neutral": 0}
    return [{"date": s, **(trend_dict.get(s) or empty)} for s in slots]


@router.get("/volume-by-client")
def volume_by_client(current: CurrentUser = Depends(get_current_user),
                     db: Session = Depends(get_db),
                     date_from: str | None = None,
                     date_to: str | None = None,
                     client_id: str | None = None,
                     granularity: str = Query("daily", regex="^(hourly|daily|weekly|monthly)$")):
    """
    Returns hourly/daily/weekly/monthly comment volumes with zero-padding for empty slots.
    Response: { clients: [{id, name, trend: [{date, Positive, Negative, Neutral}]}] }
    """
    from app.api.v1.posts import _parse_dt_from, _parse_dt_to
    from sqlalchemy import or_

    def bucket(dt):
        if not dt:
            return "unknown"
        s = str(dt)
        if granularity == "hourly":
            return s[:13] + ":00"  # "2026-07-04 14:00"
        if granularity == "monthly":
            return s[:7]
        if granularity == "weekly":
            from datetime import datetime as DT2, timedelta
            d = DT2.fromisoformat(s[:10])
            return (d - timedelta(days=d.weekday())).strftime('%Y-%m-%d')
        return s[:10]

    slots = _zero_slots(date_from, date_to, granularity)

    # ── Single-client fast path (dual-path post filter) ───────────────────────
    if client_id:
        c_obj = db.query(Client).filter(
            Client.id == client_id,
            Client.tenant_id == current.tenant_id,
        ).first()
        if not c_obj:
            return {"clients": []}
        client_filter = _client_post_filter(db, client_id)

        q = (db.query(Comment.published_at, CommentAnalysis.sentiment)
             .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
             .join(Post, Post.id == Comment.post_id)
             .filter(Comment.tenant_id == current.tenant_id,
                     Post.is_deleted == False,
                     client_filter))
        if date_from:
            q = q.filter(Comment.published_at >= _parse_dt_from(date_from))
        if date_to:
            q = q.filter(Comment.published_at <= _parse_dt_to(date_to))

        raw: dict = defaultdict(lambda: {"Positive": 0, "Negative": 0, "Neutral": 0})
        for pub, sent in q.all():
            raw[bucket(pub)][sent or "Neutral"] += 1

        trend = _pad_trend(raw, slots) if slots else [
            {"date": dt, **v} for dt, v in sorted(raw.items())
        ]
        post_count = db.query(func.count(Post.id)).filter(
            Post.is_deleted == False, client_filter,
        ).scalar() or 0

        return {"clients": [{"id": client_id, "name": c_obj.name, "trend": trend, "post_count": post_count}]}

    # ── All-clients path (direct client_id only, legacy) ─────────────────────
    q = (db.query(
            Client.id.label("client_id"),
            Client.name.label("client_name"),
            Comment.published_at,
            CommentAnalysis.sentiment,
        )
        .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .join(Post, Post.id == Comment.post_id)
        .join(Client, Client.id == Post.client_id)
        .filter(Comment.tenant_id == current.tenant_id,
                Post.client_id.isnot(None)))
    if date_from:
        q = q.filter(Comment.published_at >= _parse_dt_from(date_from))
    if date_to:
        q = q.filter(Comment.published_at <= _parse_dt_to(date_to))

    rows = q.all()
    client_names: dict = {}
    client_data: dict = defaultdict(lambda: defaultdict(lambda: {"Positive": 0, "Negative": 0, "Neutral": 0}))
    for cid, cname, pub, sent in rows:
        client_names[cid] = cname
        b = bucket(pub)
        client_data[cid][b][sent or "Neutral"] += 1

    # Count posts per client (direct + via social profile)
    client_ids = list(client_names.keys())
    pc_rows = (db.query(Post.client_id, func.count(Post.id))
               .filter(Post.is_deleted == False, Post.client_id.in_(client_ids))
               .group_by(Post.client_id).all())
    post_counts: dict = dict(pc_rows)
    # Also count posts linked via social profiles
    prof_rows = (db.query(SocialProfile.client_id, func.count(Post.id))
                 .join(Post, Post.social_profile_id == SocialProfile.id)
                 .filter(Post.is_deleted == False, SocialProfile.client_id.in_(client_ids))
                 .group_by(SocialProfile.client_id).all())
    for cid, cnt in prof_rows:
        post_counts[cid] = post_counts.get(cid, 0) + cnt

    result = []
    for cid, name in client_names.items():
        raw = dict(client_data[cid])
        trend = _pad_trend(raw, slots) if slots else [
            {"date": dt, **counts} for dt, counts in sorted(raw.items())
        ]
        result.append({"id": cid, "name": name, "trend": trend, "post_count": post_counts.get(cid, 0)})
    result.sort(key=lambda x: sum(
        p["Positive"] + p["Negative"] + p["Neutral"] for p in x["trend"]
    ), reverse=True)
    return {"clients": result}


@router.get("/post-trend/{post_id}")
def post_trend(post_id: str, current: CurrentUser = Depends(get_current_user),
               db: Session = Depends(get_db)):
    """Sentiment trend for a single post — daily comment counts."""
    rows = (db.query(Comment.published_at, CommentAnalysis.sentiment, func.count())
            .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
            .filter(Comment.tenant_id == current.tenant_id,
                    Comment.post_id == post_id)
            .group_by(Comment.published_at, CommentAnalysis.sentiment).all())
    return {"post_id": post_id, "trend": _group_by_date(rows)}


@router.get("/word-frequency")
def word_frequency(current: CurrentUser = Depends(get_current_user),
                   db: Session = Depends(get_db),
                   limit: int = Query(60, ge=10, le=200),
                   client_id: str | None = None):
    """Top words from comment text, strictly scoped to the requested client."""
    q = (db.query(Comment.content)
         .filter(Comment.tenant_id == current.tenant_id,
                 Comment.content.isnot(None),
                 Comment.is_deleted == False))
    if client_id:
        q = q.join(Post, Post.id == Comment.post_id).filter(
            Post.is_deleted == False,
            _client_post_filter(db, client_id),
        )
    rows = q.order_by(Comment.id.desc()).limit(5000).all()

    counter: Counter = Counter()
    for (text,) in rows:
        words = re.findall(r"[a-zA-Z]{3,}", (text or "").lower())
        for w in words:
            if w not in _STOP_WORDS:
                counter[w] += 1

    top = counter.most_common(limit)
    if not top:
        return {"words": []}

    max_val = top[0][1] or 1
    words = [{"text": w, "value": round(v * 40 / max_val)} for w, v in top]
    return {"words": words}


@router.get("/topic-clusters")
def topic_clusters(current: CurrentUser = Depends(get_current_user),
                   db: Session = Depends(get_db),
                   limit: int = Query(20, ge=5, le=50),
                   client_id: str | None = None):
    """Topic clusters, strictly scoped to the requested client."""
    clusters: Counter = Counter()

    # 1. Stance labels from comment analysis
    sq = (db.query(CommentAnalysis.stance, func.count())
          .join(Comment, Comment.id == CommentAnalysis.comment_id)
          .filter(CommentAnalysis.tenant_id == current.tenant_id,
                  CommentAnalysis.stance.isnot(None),
                  CommentAnalysis.is_deleted == False))
    if client_id:
        sq = sq.join(Post, Post.id == Comment.post_id).filter(
            Post.is_deleted == False,
            _client_post_filter(db, client_id),
        )
    for stance, cnt in sq.group_by(CommentAnalysis.stance).all():
        if stance:
            clusters[stance] += cnt

    # 2. Extract meaningful topics from post_analysis narratives
    _SKIP_LABELS = {"sentiment_management", "neutral", "unknown", "none", "n/a", ""}
    pq = (db.query(PostAnalysis.main_narrative, PostAnalysis.intent, PostAnalysis.political_angle)
          .join(Post, Post.id == PostAnalysis.post_id)
          .filter(PostAnalysis.tenant_id == current.tenant_id,
                  PostAnalysis.is_deleted == False))
    if client_id:
        pq = pq.filter(
            Post.is_deleted == False,
            _client_post_filter(db, client_id),
        )
    pa_rows = pq.limit(3000).all()

    narrative_words: Counter = Counter()

    for narrative, intent, angle in pa_rows:
        # Only add intent/angle if they are meaningful (not the default fallbacks)
        if intent and intent.strip().lower() not in _SKIP_LABELS:
            clusters[intent.strip().title()] += 3
        if angle and angle.strip().lower() not in _SKIP_LABELS:
            clusters[angle.strip().title()] += 2
        if narrative:
            words = re.findall(r"[a-zA-Z]{4,}", narrative.lower())
            for w in words:
                if w not in _STOP_WORDS:
                    narrative_words[w] += 1

    # Add top narrative keywords as named entity / keyword clusters
    for word, cnt in narrative_words.most_common(15):
        label = word.title()
        if label.lower() not in {k.lower() for k in clusters}:
            clusters[label] = cnt

    top = clusters.most_common(limit)
    if not top:
        return {"clusters": []}

    max_w = top[0][1] or 1
    result = [{"topic": t, "weight": cnt, "size": round(cnt * 100 / max_w)} for t, cnt in top]
    return {"clusters": result}


@router.get("/crisis-score")
def crisis_score(current: CurrentUser = Depends(get_current_user),
                 db: Session = Depends(get_db),
                 client_id: str | None = None):
    """Aggregate crisis probability across recent posts, strictly scoped to the client."""
    q = db.query(func.avg(PostAnalysis.crisis_probability)).join(
        Post, Post.id == PostAnalysis.post_id).filter(
        PostAnalysis.tenant_id == current.tenant_id,
        PostAnalysis.is_deleted == False)
    if client_id:
        q = q.filter(
            Post.is_deleted == False,
            _client_post_filter(db, client_id),
        )
    avg = q.scalar() or 0.0
    score = round(float(avg) * 100, 1)
    level = "High" if score >= 60 else "Medium" if score >= 35 else "Low"
    return {"crisis_score": score, "level": level}


@router.get("/source-breakdown")
def source_breakdown(
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    client_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """Post/article count and sentiment split grouped by source_kind.

    Returns: { breakdown: [{source_kind, label, post_count, sentiment: {Positive,Negative,Neutral}}] }
    Social source_kinds: facebook, instagram, twitter, youtube
    Press source_kinds: press_rss, youtube_channel_video
    """
    from app.api.v1.posts import _parse_dt_from, _parse_dt_to

    # Build base post query scoped to client
    pq = db.query(Post.id, Post.source_kind).filter(
        Post.tenant_id == current.tenant_id,
        Post.is_deleted == False,
    )
    if client_id:
        pq = pq.filter(_client_post_filter(db, client_id))
    if date_from:
        pq = pq.filter(Post.published_at >= _parse_dt_from(date_from))
    if date_to:
        pq = pq.filter(Post.published_at <= _parse_dt_to(date_to))

    post_rows = pq.all()
    post_source_map: dict[str, str] = {row[0]: (row[1] or "unknown") for row in post_rows}
    all_post_ids = list(post_source_map.keys())

    if not all_post_ids:
        return {"breakdown": []}

    # Get sentiment from CommentAnalysis joined to Comment → Post
    sent_rows = (
        db.query(Post.source_kind, CommentAnalysis.sentiment, func.count())
        .join(Comment, Comment.post_id == Post.id)
        .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .filter(Post.id.in_(all_post_ids))
        .group_by(Post.source_kind, CommentAnalysis.sentiment)
        .all()
    )

    # Aggregate by source_kind
    from collections import defaultdict as _dd
    counts: dict = _dd(lambda: {"Positive": 0, "Negative": 0, "Neutral": 0, "post_count": 0})

    for kind, sentiment, cnt in sent_rows:
        k = kind or "unknown"
        counts[k][sentiment or "Neutral"] += cnt

    # Count posts per source_kind (including those with no comments yet)
    for sk in post_source_map.values():
        counts[sk]["post_count"] += 1

    _LABELS = {
        "facebook": "Facebook",
        "instagram": "Instagram",
        "twitter": "Twitter / X",
        "youtube": "YouTube (own channel)",
        "press_rss": "Press / Web (RSS)",
        "youtube_channel_video": "YouTube (News Channels)",
        "rss": "RSS",
        "unknown": "Unknown",
    }

    social_kinds = {"facebook", "instagram", "twitter", "youtube"}
    press_kinds = {"press_rss", "youtube_channel_video", "rss"}

    breakdown = []
    for kind, data in sorted(counts.items()):
        total_c = data["Positive"] + data["Negative"] + data["Neutral"]
        breakdown.append({
            "source_kind": kind,
            "label": _LABELS.get(kind, kind.replace("_", " ").title()),
            "category": "social" if kind in social_kinds else "press" if kind in press_kinds else "other",
            "post_count": data["post_count"],
            "comment_count": total_c,
            "sentiment": {
                "Positive": data["Positive"],
                "Negative": data["Negative"],
                "Neutral": data["Neutral"],
            },
        })

    # Sort: social first, then press, then other
    _cat_order = {"social": 0, "press": 1, "other": 2}
    breakdown.sort(key=lambda x: (_cat_order.get(x["category"], 2), x["label"]))

    return {"breakdown": breakdown}


@router.get("/client-summary")
def client_summary(current: CurrentUser = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    """Per-client totals: posts, comments, sentiment breakdown, press source count."""
    clients = db.query(Client).filter(
        Client.tenant_id == current.tenant_id, Client.is_deleted == False).all()
    # Press source counts per client
    ps_rows = (
        db.query(PressSource.client_id, func.count(PressSource.id))
        .filter(PressSource.tenant_id == current.tenant_id, PressSource.is_deleted == False, PressSource.is_active == True)
        .group_by(PressSource.client_id)
        .all()
    )
    press_counts: dict = {str(cid): cnt for cid, cnt in ps_rows}
    result = []
    for c in clients:
        post_ids = [r[0] for r in db.query(Post.id).filter(
            Post.client_id == c.id, Post.is_deleted == False).all()]
        post_count = len(post_ids)
        rows = (db.query(CommentAnalysis.sentiment, func.count())
                .join(Comment, Comment.id == CommentAnalysis.comment_id)
                .filter(Comment.post_id.in_(post_ids))
                .group_by(CommentAnalysis.sentiment).all()) if post_ids else []
        counts = {s or "Unknown": cnt for s, cnt in rows}
        total = sum(counts.values()) or 1
        result.append({
            "id": c.id, "name": c.name, "industry": c.industry,
            "posts": post_count,
            "comments": sum(counts.values()),
            "counts": counts,
            "percentages": {k: round(v * 100 / total, 1) for k, v in counts.items()},
            "press_source_count": press_counts.get(str(c.id), 0),
        })
    return result


# ── Press Feed ────────────────────────────────────────────────────────────────

@router.get("/press-feed")
def press_feed(
    client_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    press_source_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return press articles (RSS + YouTube channel) for a client, paginated."""
    press_kinds = ("press_rss", "youtube_channel_video")

    q = db.query(Post).filter(
        Post.tenant_id == current.tenant_id,
        Post.source_kind.in_(press_kinds),
        Post.is_deleted == False,
    )
    if client_id:
        q = q.filter(Post.client_id == client_id)
    if press_source_id:
        q = q.filter(Post.press_source_id == press_source_id)
    if date_from:
        try:
            q = q.filter(Post.published_at >= datetime.fromisoformat(date_from.replace("Z", "+00:00")))
        except ValueError:
            pass
    if date_to:
        try:
            q = q.filter(Post.published_at <= datetime.fromisoformat(date_to.replace("Z", "+00:00")))
        except ValueError:
            pass

    total = q.count()
    posts = q.order_by(Post.published_at.desc()).offset(offset).limit(limit).all()

    post_ids = [p.id for p in posts]

    # Sentiment: majority vote across comments on each article
    sent_map: dict[str, dict] = {}
    if post_ids:
        rows = (
            db.query(Comment.post_id, CommentAnalysis.sentiment, func.count())
            .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
            .filter(Comment.post_id.in_(post_ids))
            .group_by(Comment.post_id, CommentAnalysis.sentiment)
            .all()
        )
        for pid, sentiment, cnt in rows:
            if pid not in sent_map:
                sent_map[pid] = {}
            sent_map[pid][sentiment or "Neutral"] = cnt

    def _majority_sentiment(sid: str) -> str:
        d = sent_map.get(sid)
        if not d:
            return "Neutral"
        return max(d, key=d.__getitem__)

    def _sentiment_counts(sid: str) -> dict:
        d = sent_map.get(sid, {})
        return {"Positive": d.get("Positive", 0), "Negative": d.get("Negative", 0), "Neutral": d.get("Neutral", 0)}

    # PostAnalysis: crisis, narrative, urgency, virality, political_angle, summary
    pa_map: dict = {}
    if post_ids:
        for pa in db.query(PostAnalysis).filter(PostAnalysis.post_id.in_(post_ids)).all():
            pa_map[pa.post_id] = pa

    # Comment language breakdown per post
    lang_map: dict[str, dict] = {}
    if post_ids:
        lang_rows = (
            db.query(Comment.post_id, Comment.language, func.count())
            .filter(Comment.post_id.in_(post_ids), Comment.language.isnot(None))
            .group_by(Comment.post_id, Comment.language)
            .all()
        )
        for pid, lang, cnt in lang_rows:
            if pid not in lang_map:
                lang_map[pid] = {}
            lang_map[pid][lang or "unknown"] = cnt

    # PressSource metadata: primary_region, domestic, leaning per source
    ps_ids = list({p.press_source_id for p in posts if p.press_source_id})
    ps_map: dict = {}
    if ps_ids:
        for ps in db.query(PressSource).filter(PressSource.id.in_(ps_ids)).all():
            ps_map[ps.id] = ps

    articles = []
    for p in posts:
        meta = p.metrics or {}
        raw = p.content or ""
        title = raw.split(" — ")[0][:120] if " — " in raw else raw[:120]
        pa = pa_map.get(p.id)
        ps = ps_map.get(p.press_source_id) if p.press_source_id else None
        articles.append({
            "id": p.id,
            "title": title,
            "content": raw[:800],
            "url": p.url or p.permalink or "",
            "author": p.author or "",
            "source_kind": p.source_kind,
            "source_name": (ps.name if ps else None) or meta.get("press_source_name", p.author or ""),
            "leaning": (ps.leaning if ps else None) or meta.get("leaning", "independent"),
            "domestic": bool(ps.domestic) if ps else meta.get("domestic", True),
            "primary_region": (ps.primary_region if ps else None) or meta.get("primary_region"),
            "published_at": p.published_at.isoformat() if p.published_at else None,
            "language": p.language or "en",
            "comment_languages": lang_map.get(p.id, {}),
            "comment_sentiment_counts": _sentiment_counts(p.id),
            "sentiment": _majority_sentiment(p.id),
            "crisis_probability": (pa.crisis_probability or 0.0) if pa else 0.0,
            "urgency_score": (pa.urgency_score or 0.0) if pa else 0.0,
            "virality_score": (pa.virality_score or 0.0) if pa else 0.0,
            "political_angle": (pa.political_angle or "") if pa else "",
            "main_narrative": (pa.main_narrative or "") if pa else "",
            "summary": (pa.summary or "") if pa else "",
        })

    return {"total": total, "offset": offset, "limit": limit, "articles": articles}


@router.get("/press-insights")
def press_insights(
    client_id: Optional[str] = Query(None),
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregate press intelligence: per-source stats, language breakdown, regional sentiment."""
    press_kinds = ("press_rss", "youtube_channel_video")

    posts = db.query(Post).filter(
        Post.tenant_id == current.tenant_id,
        Post.source_kind.in_(press_kinds),
        Post.is_deleted == False,
        *([Post.client_id == client_id] if client_id else []),
    ).all()

    if not posts:
        return {"total": 0, "sources": [], "languages": {}, "comment_languages": {}, "regions": {}}

    post_ids = [p.id for p in posts]

    # Sentiment per post
    sent_rows = (
        db.query(Comment.post_id, CommentAnalysis.sentiment, func.count())
        .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .filter(Comment.post_id.in_(post_ids))
        .group_by(Comment.post_id, CommentAnalysis.sentiment)
        .all()
    )
    sent_map: dict[str, dict] = {}
    for pid, s, cnt in sent_rows:
        if pid not in sent_map:
            sent_map[pid] = {}
        sent_map[pid][s or "Neutral"] = cnt

    def _maj(pid):
        d = sent_map.get(pid, {})
        return max(d, key=d.__getitem__) if d else "Neutral"

    # PostAnalysis
    pa_map = {pa.post_id: pa for pa in db.query(PostAnalysis).filter(PostAnalysis.post_id.in_(post_ids)).all()}

    # PressSource info
    ps_ids = list({p.press_source_id for p in posts if p.press_source_id})
    ps_map = {}
    if ps_ids:
        for ps in db.query(PressSource).filter(PressSource.id.in_(ps_ids)).all():
            ps_map[ps.id] = ps

    # Comment languages overall
    lang_rows = (
        db.query(Comment.language, func.count())
        .filter(Comment.post_id.in_(post_ids), Comment.language.isnot(None))
        .group_by(Comment.language)
        .all()
    )
    comment_languages = {lang: cnt for lang, cnt in lang_rows if lang}

    # Article languages (Post.language)
    article_langs: Counter = Counter()
    for p in posts:
        article_langs[p.language or "en"] += 1

    # Per-source aggregates
    source_stats: dict = {}
    for p in posts:
        meta = p.metrics or {}
        ps = ps_map.get(p.press_source_id) if p.press_source_id else None
        sname = (ps.name if ps else None) or meta.get("press_source_name", p.author or "Unknown")
        if sname not in source_stats:
            source_stats[sname] = {
                "name": sname,
                "leaning": (ps.leaning if ps else None) or meta.get("leaning", "independent"),
                "domestic": bool(ps.domestic) if ps else meta.get("domestic", True),
                "primary_region": (ps.primary_region if ps else None) or meta.get("primary_region"),
                "total": 0, "Positive": 0, "Negative": 0, "Neutral": 0,
                "crisis_count": 0, "avg_urgency": 0.0,
            }
        ss = source_stats[sname]
        ss["total"] += 1
        ss[_maj(p.id)] = ss.get(_maj(p.id), 0) + 1
        pa = pa_map.get(p.id)
        if pa and (pa.crisis_probability or 0) > 0.4:
            ss["crisis_count"] += 1
        if pa:
            ss["avg_urgency"] = (ss["avg_urgency"] * (ss["total"] - 1) + (pa.urgency_score or 0)) / ss["total"]

    # Regional aggregates
    region_stats: dict = {}
    for p in posts:
        meta = p.metrics or {}
        ps = ps_map.get(p.press_source_id) if p.press_source_id else None
        region = (ps.primary_region if ps else None) or meta.get("primary_region") or "Unknown"
        domestic = bool(ps.domestic) if ps else meta.get("domestic", True)
        if region not in region_stats:
            region_stats[region] = {"total": 0, "Positive": 0, "Negative": 0, "Neutral": 0, "domestic": domestic}
        rs = region_stats[region]
        rs["total"] += 1
        rs[_maj(p.id)] = rs.get(_maj(p.id), 0) + 1

    return {
        "total": len(posts),
        "sources": sorted(source_stats.values(), key=lambda s: -s["total"]),
        "languages": dict(article_langs),
        "comment_languages": comment_languages,
        "regions": region_stats,
    }


@router.get("/press-source-stats")
def press_source_stats(
    client_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Article count + sentiment per press source for a client + optional date range."""
    press_kinds = ("press_rss", "youtube_channel_video")

    base_filters = [
        Post.tenant_id == current.tenant_id,
        Post.source_kind.in_(press_kinds),
        Post.is_deleted == False,
        Post.press_source_id.isnot(None),
    ]
    if client_id:
        base_filters.append(Post.client_id == client_id)
    if date_from:
        try:
            base_filters.append(Post.published_at >= datetime.fromisoformat(date_from.replace("Z", "+00:00")))
        except ValueError:
            pass
    if date_to:
        try:
            base_filters.append(Post.published_at <= datetime.fromisoformat(date_to.replace("Z", "+00:00")))
        except ValueError:
            pass

    count_rows = (
        db.query(Post.press_source_id, func.count(Post.id))
        .filter(*base_filters)
        .group_by(Post.press_source_id)
        .all()
    )
    stats: dict = {src_id: {"count": cnt, "Positive": 0, "Negative": 0, "Neutral": 0}
                   for src_id, cnt in count_rows}

    if stats:
        sent_rows = (
            db.query(Post.press_source_id, CommentAnalysis.sentiment, func.count())
            .join(Comment, Comment.post_id == Post.id)
            .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
            .filter(*base_filters)
            .group_by(Post.press_source_id, CommentAnalysis.sentiment)
            .all()
        )
        for src_id, sentiment, cnt in sent_rows:
            if src_id in stats:
                stats[src_id][sentiment or "Neutral"] = cnt

    return {"stats": stats}


@router.get("/press-report-full")
def press_report_full(
    client_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full press report: per-source deep-dive with summaries, keywords, stances, topics, circulation."""
    press_kinds = ("press_rss", "youtube_channel_video")

    q = db.query(Post).filter(
        Post.tenant_id == current.tenant_id,
        Post.source_kind.in_(press_kinds),
        Post.is_deleted == False,
    )
    if client_id:
        q = q.filter(Post.client_id == client_id)
    if date_from:
        try:
            q = q.filter(Post.published_at >= datetime.fromisoformat(date_from.replace("Z", "+00:00")))
        except ValueError:
            pass
    if date_to:
        try:
            q = q.filter(Post.published_at <= datetime.fromisoformat(date_to.replace("Z", "+00:00")))
        except ValueError:
            pass
    posts = q.order_by(Post.published_at.desc()).all()

    if not posts:
        return {
            "total": 0, "sources": [], "keywords": {"positive": [], "negative": [], "all": []},
            "top_positive_articles": [], "top_negative_articles": [], "crisis_articles": [],
            "stances": {}, "topics": [], "regions": {},
        }

    post_ids = [p.id for p in posts]

    # PostAnalysis map
    pa_map = {pa.post_id: pa for pa in db.query(PostAnalysis).filter(PostAnalysis.post_id.in_(post_ids)).all()}

    # CommentAnalysis map (1 comment per press article — the article content itself)
    ca_rows = (
        db.query(Comment.post_id, CommentAnalysis.sentiment, CommentAnalysis.toxicity_score, CommentAnalysis.stance)
        .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .filter(Comment.post_id.in_(post_ids))
        .all()
    )
    ca_map: dict[str, dict] = {}
    for pid, sentiment, toxicity, stance in ca_rows:
        ca_map[pid] = {"sentiment": sentiment or "Neutral", "toxicity": toxicity or 0.0, "stance": stance or "Irrelevant"}

    # PressSource map (with last_ingested_at, circulation)
    ps_ids = list({p.press_source_id for p in posts if p.press_source_id})
    ps_map: dict = {}
    if ps_ids:
        for ps in db.query(PressSource).filter(PressSource.id.in_(ps_ids)).all():
            ps_map[ps.id] = ps

    _SKIP_NARRATIVE = {"general discussion", "none", "n/a", "unknown", ""}

    def _title(content: str) -> str:
        raw = content or ""
        return (raw.split(" — ")[0][:160] if " — " in raw else raw[:160]).strip()

    def _sentiment(pid: str) -> str:
        ca = ca_map.get(pid)
        return ca["sentiment"] if ca else "Neutral"

    # --- Per-source aggregation ---
    source_data: dict[str, dict] = {}
    pos_texts: list[str] = []
    neg_texts: list[str] = []
    all_texts: list[str] = []
    overall_stances: Counter = Counter()
    overall_topics: Counter = Counter()

    for p in posts:
        meta = p.metrics or {}
        ps = ps_map.get(p.press_source_id) if p.press_source_id else None
        sname = (ps.name if ps else None) or meta.get("press_source_name", p.author or "Unknown")
        pa = pa_map.get(p.id)
        ca = ca_map.get(p.id, {})
        sentiment = _sentiment(p.id)
        stance = ca.get("stance", "Irrelevant") or "Irrelevant"
        overall_stances[stance] += 1
        title = _title(p.content or "")
        summary = (pa.summary or "") if pa else ""
        topics: list[str] = []
        if pa and pa.result:
            topics = [t for t in (pa.result.get("topics") or []) if isinstance(t, str) and len(t) > 2]
        for t in topics:
            overall_topics[t] += 1

        content_text = p.content or ""
        all_texts.append(content_text)
        if sentiment == "Positive":
            pos_texts.append(content_text)
        elif sentiment == "Negative":
            neg_texts.append(content_text)

        if sname not in source_data:
            source_data[sname] = {
                "name": sname,
                "region": (ps.primary_region if ps else None) or meta.get("primary_region"),
                "circulation": (ps.circulation if ps else None),
                "last_ingested": (ps.last_ingested_at.strftime("%d %b %Y %H:%M") if ps and ps.last_ingested_at else None),
                "leaning": (ps.leaning if ps else None) or meta.get("leaning", "independent"),
                "domestic": bool(ps.domestic) if ps else meta.get("domestic", True),
                "total": 0, "Positive": 0, "Negative": 0, "Neutral": 0,
                "stances": Counter(), "topic_counter": Counter(),
                "pos_articles": [], "neg_articles": [], "content_parts": [],
                "crisis_count": 0,
            }

        sd = source_data[sname]
        sd["total"] += 1
        sd[sentiment] = sd.get(sentiment, 0) + 1
        sd["stances"][stance] += 1
        for t in topics:
            sd["topic_counter"][t] += 1
        sd["content_parts"].append(content_text)
        pa_crisis = (pa.crisis_probability or 0.0) if pa else 0.0
        if pa_crisis > 0.4:
            sd["crisis_count"] += 1

        article_info = {
            "title": title,
            "summary": summary[:250] if summary else "",
            "url": p.url or p.permalink or "",
            "published_at": p.published_at.strftime("%d %b %Y") if p.published_at else None,
            "source_name": sname,
            "sentiment": sentiment,
            "crisis_probability": pa_crisis,
            "urgency_score": (pa.urgency_score or 0.0) if pa else 0.0,
            "topics": topics[:4],
            "political_angle": (pa.political_angle or "") if pa else "",
            "stance": stance,
        }

        if sentiment == "Positive" and len(sd["pos_articles"]) < 5:
            sd["pos_articles"].append(article_info)
        elif sentiment == "Negative" and len(sd["neg_articles"]) < 5:
            sd["neg_articles"].append(article_info)

    # --- Keyword extraction helpers ---
    def _keywords(texts: list[str], limit: int = 25) -> list[dict]:
        c: Counter = Counter()
        for t in texts:
            for w in re.findall(r"\b[a-zA-Z]{4,}\b", t.lower()):
                if w not in _STOP_WORDS:
                    c[w] += 1
        return [{"word": w, "count": cnt} for w, cnt in c.most_common(limit)]

    # --- Top articles overall ---
    all_articles_info = []
    for p in posts[:600]:
        pa = pa_map.get(p.id)
        sentiment = _sentiment(p.id)
        meta = p.metrics or {}
        ps = ps_map.get(p.press_source_id) if p.press_source_id else None
        sname = (ps.name if ps else None) or meta.get("press_source_name", p.author or "Unknown")
        ca = ca_map.get(p.id, {})
        pa_crisis = (pa.crisis_probability or 0.0) if pa else 0.0
        summary = (pa.summary or "") if pa else ""
        topics2 = []
        if pa and pa.result:
            topics2 = [t for t in (pa.result.get("topics") or []) if isinstance(t, str) and len(t) > 2]
        all_articles_info.append({
            "title": _title(p.content or ""),
            "summary": summary[:280] if summary else "",
            "url": p.url or p.permalink or "",
            "published_at": p.published_at.strftime("%d %b %Y") if p.published_at else None,
            "source_name": sname,
            "sentiment": sentiment,
            "crisis_probability": pa_crisis,
            "urgency_score": (pa.urgency_score or 0.0) if pa else 0.0,
            "topics": topics2[:4],
            "stance": ca.get("stance", "Irrelevant"),
        })

    top_positive = [a for a in all_articles_info if a["sentiment"] == "Positive"][:8]
    top_negative = [a for a in all_articles_info if a["sentiment"] == "Negative"][:8]
    crisis_articles = sorted([a for a in all_articles_info if a["crisis_probability"] > 0.3],
                             key=lambda x: -x["crisis_probability"])[:6]

    # --- Finalize sources ---
    final_sources = []
    for sname, sd in source_data.items():
        top_topics = [{"topic": t, "count": c} for t, c in sd["topic_counter"].most_common(10)]
        src_kw = _keywords(sd["content_parts"], 20)
        total = sd["total"] or 1
        final_sources.append({
            "name": sd["name"],
            "region": sd["region"],
            "circulation": sd["circulation"],
            "last_ingested": sd["last_ingested"],
            "leaning": sd["leaning"],
            "domestic": sd["domestic"],
            "total": sd["total"],
            "Positive": sd["Positive"],
            "Negative": sd["Negative"],
            "Neutral": sd["Neutral"],
            "pos_pct": round(sd["Positive"] * 100 / total),
            "neg_pct": round(sd["Negative"] * 100 / total),
            "neu_pct": round(sd["Neutral"] * 100 / total),
            "stances": dict(sd["stances"]),
            "top_topics": top_topics,
            "keywords": src_kw,
            "top_positive": sd["pos_articles"],
            "top_negative": sd["neg_articles"],
            "crisis_count": sd["crisis_count"],
        })
    final_sources.sort(key=lambda s: -s["total"])

    # Regional stats
    region_stats: dict = {}
    for p in posts:
        meta = p.metrics or {}
        ps = ps_map.get(p.press_source_id) if p.press_source_id else None
        region = (ps.primary_region if ps else None) or meta.get("primary_region") or "Unknown"
        if region not in region_stats:
            region_stats[region] = {"total": 0, "Positive": 0, "Negative": 0, "Neutral": 0}
        region_stats[region]["total"] += 1
        sent = _sentiment(p.id)
        region_stats[region][sent] = region_stats[region].get(sent, 0) + 1

    return {
        "total": len(posts),
        "sources": final_sources,
        "keywords": {
            "positive": _keywords(pos_texts, 25),
            "negative": _keywords(neg_texts, 25),
            "all": _keywords(all_texts, 35),
        },
        "top_positive_articles": top_positive,
        "top_negative_articles": top_negative,
        "crisis_articles": crisis_articles,
        "stances": dict(overall_stances),
        "topics": [{"topic": t, "count": c} for t, c in overall_topics.most_common(20)],
        "regions": region_stats,
    }


# ── Counter-Narrative Strategy Engine ────────────────────────────────────────

_PIVOT_MAP: dict = {
    "corruption": ["transparency", "accountability", "reform", "integrity"],
    "scam": ["verified", "authentic", "certified", "trusted"],
    "fake": ["genuine", "real", "factual", "truth"],
    "liar": ["honest", "transparent", "credible", "factual"],
    "failed": ["achieved", "delivered", "accomplished", "successful"],
    "useless": ["impactful", "effective", "proven", "results"],
    "bad": ["positive", "constructive", "improving", "progressive"],
    "wrong": ["correct", "accurate", "verified", "right"],
    "hate": ["support", "solidarity", "community", "together"],
    "attack": ["defend", "protect", "safeguard", "stand"],
    "blame": ["responsibility", "solution", "action", "initiative"],
    "problem": ["solution", "resolve", "fix", "address"],
    "crisis": ["recovery", "resilience", "response", "stability"],
    "poor": ["improved", "better", "enhanced", "upgraded"],
    "waste": ["investment", "efficient", "value", "impact"],
    "corrupt": ["transparent", "accountable", "reformed", "clean"],
    "lies": ["facts", "evidence", "truth", "data"],
    "failure": ["achievement", "progress", "milestone", "success"],
    "against": ["supporting", "standing", "defending", "advocating"],
    "dirty": ["clean", "clear", "honest", "straightforward"],
    "steal": ["protect", "serve", "safeguard", "invest"],
    "useless": ["effective", "impactful", "proven", "results-driven"],
    "incompetent": ["skilled", "experienced", "capable", "qualified"],
}


def _empty_counter_narrative() -> dict:
    return {
        "urgency": "low",
        "stats": {
            "negative_comments": 0, "positive_comments": 0,
            "total_analysed": 0, "negative_ratio": 0.0, "avg_crisis_probability": 0.0,
        },
        "negative_clusters": [],
        "amplification_keywords": [],
        "top_topics": [],
        "counter_keywords": [],
        "comment_templates": [],
        "content_angles": [],
        "overall_strategy": "No data available. Add social profiles and collect comments to generate counter-narrative strategy.",
        "narratives_found": [],
    }


@router.get("/counter-narrative")
def counter_narrative(
    client_id: Optional[str] = Query(None),
    post_id: Optional[str] = Query(None),
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Counter-Narrative Strategy Engine.

    Analyses negative comment patterns, extracts keyword clusters,
    and generates counter-keywords + narrative pivot suggestions.
    Works at client level (all posts) or single-post level.
    """
    if not client_id and not post_id:
        return {"error": "client_id or post_id required"}

    # 1. Resolve target post IDs
    if post_id:
        post_ids = [post_id]
    else:
        post_ids = _client_post_ids(db, client_id)

    if not post_ids:
        return _empty_counter_narrative()

    # 2. Negative comments
    neg_rows = (
        db.query(Comment.content, CommentAnalysis.toxicity_score)
        .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .filter(
            Comment.post_id.in_(post_ids),
            CommentAnalysis.sentiment == "Negative",
        )
        .order_by(CommentAnalysis.toxicity_score.desc())
        .limit(500)
        .all()
    )

    # 3. Positive comments
    pos_rows = (
        db.query(Comment.content)
        .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .filter(
            Comment.post_id.in_(post_ids),
            CommentAnalysis.sentiment == "Positive",
        )
        .limit(300)
        .all()
    )

    neg_total = len(neg_rows)
    pos_total = len(pos_rows)
    all_total = neg_total + pos_total
    neg_ratio = neg_total / max(all_total, 1)

    # 4. Word frequency on negative corpus
    neg_text = " ".join(r.content or "" for r in neg_rows).lower()
    tokens = re.findall(r"\b[a-z]{3,}\b", neg_text)
    neg_freq = Counter(t for t in tokens if t not in _STOP_WORDS)

    # Deduplicate near-similar words
    clusters = []
    seen: set = set()
    for word, count in neg_freq.most_common(40):
        skip = any(word in sw or sw in word for sw in seen)
        if not skip:
            clusters.append({"keyword": word, "frequency": count})
            seen.add(word)
        if len(clusters) >= 20:
            break

    # 5. Positive amplification keywords
    pos_text = " ".join(r.content or "" for r in pos_rows).lower()
    pos_tokens = re.findall(r"\b[a-z]{3,}\b", pos_text)
    pos_freq = Counter(t for t in pos_tokens if t not in _STOP_WORDS)
    neg_words = {c["keyword"] for c in clusters}
    amp_keywords = [
        {"keyword": w, "frequency": f}
        for w, f in pos_freq.most_common(30)
        if w not in neg_words
    ][:12]

    # 6. PostAnalysis narratives + crisis scores
    pa_rows = (
        db.query(PostAnalysis.main_narrative, PostAnalysis.crisis_probability, PostAnalysis.result)
        .filter(PostAnalysis.post_id.in_(post_ids))
        .all()
    )
    narratives = [r.main_narrative for r in pa_rows if r.main_narrative]
    avg_crisis = sum(r.crisis_probability or 0.0 for r in pa_rows) / max(len(pa_rows), 1)

    # 7. Topic clusters from PostAnalysis.result
    topic_counter: Counter = Counter()
    for row in pa_rows:
        res = row.result or {}
        for t in res.get("topics", []):
            if isinstance(t, str) and len(t) > 2:
                topic_counter[t.lower()] += 1
    top_topics = [{"topic": t, "count": c} for t, c in topic_counter.most_common(10)]

    # 8. Urgency
    if avg_crisis >= 0.7 or neg_ratio >= 0.6:
        urgency = "critical"
    elif avg_crisis >= 0.5 or neg_ratio >= 0.4:
        urgency = "high"
    elif avg_crisis >= 0.3 or neg_ratio >= 0.25:
        urgency = "medium"
    else:
        urgency = "low"

    # 9. Counter-keywords with pivot map
    counter_keywords = []
    for cluster in clusters[:10]:
        kw = cluster["keyword"]
        pivots = _PIVOT_MAP.get(kw, [])
        if not pivots:
            pivots = [f"real-{kw[:8]}", f"pro-{kw[:8]}", "transparency", "evidence"]
        counter_keywords.append({
            "against": kw,
            "counter_terms": pivots[:4],
            "strategy": f"Replace '{kw}' narrative with factual {pivots[0]} messaging",
        })

    # 10. Template placeholders
    kw1 = clusters[0]["keyword"] if clusters else "criticism"
    kw2 = clusters[1]["keyword"] if len(clusters) > 1 else "concern"
    amp1 = amp_keywords[0]["keyword"] if amp_keywords else "progress"
    amp2 = amp_keywords[1]["keyword"] if len(amp_keywords) > 1 else "work"

    comment_templates = [
        {
            "type": "Acknowledge & Redirect",
            "template": f"I understand your concern about {kw1}. Let me share what's actually happening — [insert factual update]. The focus remains on {amp1} for everyone.",
            "use_when": "Responding to the highest-frequency negative keyword cluster",
        },
        {
            "type": "Evidence-Based Counter",
            "template": f"The data tells a different story. [Insert specific metric or achievement]. This is why {amp1} and {amp2} remain our core priorities.",
            "use_when": "When misinformation is driving the negative cluster",
        },
        {
            "type": "Community Bridge",
            "template": f"Disagreements about {kw2} are valid — we're listening. Our commitment to [core value] means every voice matters. Here's what we're doing: [action point].",
            "use_when": "When sentiment is polarised but not toxic",
        },
        {
            "type": "Positive Amplifier",
            "template": f"Thank you for your {amp1}! This is exactly the kind of {amp2} that drives real change. [Share a win or milestone here].",
            "use_when": "Reply to positive comments to amplify and shift overall sentiment",
        },
        {
            "type": "Defuse & Invite",
            "template": f"We hear the {kw1} narrative. Rather than debate, let's focus on solutions. We'd love your ideas — [CTA link]. Real {amp1} starts with dialogue.",
            "use_when": "Turning detractors into participants",
        },
    ]

    # 11. Content strategy angles
    content_angles = [
        {
            "angle": "Transparency Offensive",
            "description": f"Proactively publish data and reports that directly address the '{kw1}' narrative. Show, don't tell — facts beat assertions.",
            "content_types": ["Infographic", "Data thread", "Short explainer video"],
            "priority": "high" if urgency in ("critical", "high") else "medium",
        },
        {
            "angle": "Success Story Cascade",
            "description": f"Flood the feed with real outcomes around '{amp1}' and '{amp2}' — testimonials, before/after, measurable results.",
            "content_types": ["Carousel post", "Testimonial video", "Case study thread"],
            "priority": "high",
        },
        {
            "angle": "Community Voice Amplification",
            "description": "Feature positive community members. Third-party validation outperforms direct messaging. Let supporters speak.",
            "content_types": ["Quote graphics", "Repost supporter content", "Live Q&A"],
            "priority": "medium",
        },
        {
            "angle": "Narrative Pivot Content",
            "description": f"Create content that pivots conversation from '{kw2}' to positive agenda items. Use polls and open questions to reframe.",
            "content_types": ["Poll", "Open question post", "Behind-the-scenes"],
            "priority": "medium" if urgency == "low" else "high",
        },
        {
            "angle": "Rapid Response Protocol",
            "description": f"For {urgency}-level situations: 1-hour response window, designated spokesperson, factual correction posts pinned.",
            "content_types": ["Statement post", "Story clarification", "Press note"],
            "priority": "critical" if urgency == "critical" else ("high" if urgency == "high" else "low"),
        },
    ]

    # 12. Overall strategy summary
    neg_pct = round(neg_ratio * 100)
    if urgency == "critical":
        overall = f"CRISIS MODE — {neg_pct}% of {all_total} comments are negative. Activate rapid response now. Address '{kw1}' and '{kw2}' immediately with factual evidence and pinned statements."
    elif urgency == "high":
        overall = f"HIGH ALERT — {neg_pct}% negative sentiment across {all_total} comments. Prioritise transparency content and amplify '{amp1}' stories. Counter the '{kw1}' narrative within 24–48 hours."
    elif urgency == "medium":
        overall = f"MONITOR — Elevated negativity ({neg_pct}%) centred on '{kw1}'. Maintain a steady positive content cadence. Use community bridge templates for high-engagement negative comments."
    else:
        overall = f"STABLE — Sentiment is manageable ({neg_pct}% negative across {all_total} comments). Focus on amplifying '{amp1}' narrative. Positive engagement templates will reinforce your brand position."

    return {
        "urgency": urgency,
        "stats": {
            "negative_comments": neg_total,
            "positive_comments": pos_total,
            "total_analysed": all_total,
            "negative_ratio": round(neg_ratio * 100, 1),
            "avg_crisis_probability": round(avg_crisis, 3),
        },
        "negative_clusters": clusters,
        "amplification_keywords": amp_keywords,
        "top_topics": top_topics,
        "counter_keywords": counter_keywords,
        "comment_templates": comment_templates,
        "content_angles": content_angles,
        "overall_strategy": overall,
        "narratives_found": narratives[:5],
    }


# ── Bot / Fake-Account Analysis ───────────────────────────────────────────────

@router.get("/bot-analysis")
def bot_analysis(
    post_id: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Heuristic bot/fake-account analysis for a post or all posts of a client.

    Returns per-comment authenticity scores + aggregate real/bot breakdown.
    """
    if not post_id and not client_id:
        return {"error": "post_id or client_id required"}

    # Resolve target post IDs
    if post_id:
        target_ids = [post_id]
    else:
        target_ids = _client_post_ids(db, client_id)

    if not target_ids:
        return {
            "total_comments": 0, "estimated_real": 0, "estimated_bots": 0,
            "estimated_suspicious": 0, "real_pct": 0, "bot_pct": 0,
            "suspicious_pct": 0, "comment_scores": [],
        }

    # Fetch up to 1000 comments (for performance)
    comments = (
        db.query(Comment.id, Comment.author, Comment.content, Comment.post_id, Comment.published_at)
        .filter(
            Comment.post_id.in_(target_ids),
            Comment.is_deleted == False,
        )
        .order_by(Comment.published_at.desc())
        .limit(1000)
        .all()
    )

    if not comments:
        return {
            "total_comments": 0, "estimated_real": 0, "estimated_bots": 0,
            "estimated_suspicious": 0, "real_pct": 0, "bot_pct": 0,
            "suspicious_pct": 0, "comment_scores": [],
        }

    # Per-post author frequency (to detect repeat commenters)
    author_freq_by_post: dict[str, dict[str, int]] = {}
    for row in (
        db.query(Comment.post_id, Comment.author, func.count(Comment.id).label("cnt"))
        .filter(Comment.post_id.in_(target_ids), Comment.is_deleted == False)
        .group_by(Comment.post_id, Comment.author)
        .all()
    ):
        author_freq_by_post.setdefault(row.post_id, {})[row.author or ""] = row.cnt

    # Duplicate content detection (same text across different authors)
    content_freq: Counter = Counter((c.content or "")[:200] for c in comments)

    total = len(comments)
    real_n = susp_n = bot_n = 0
    scores = []

    for c in comments:
        freq = author_freq_by_post.get(c.post_id, {}).get(c.author or "", 1)
        is_dup = content_freq.get((c.content or "")[:200], 1) > 1
        bscore = bot_score(c.author or "", c.content or "", freq, is_dup)
        label = authenticity_label(bscore)

        if label == "real":
            real_n += 1
        elif label == "suspicious":
            susp_n += 1
        else:
            bot_n += 1

        scores.append({
            "comment_id": c.id,
            "author": c.author,
            "content_preview": (c.content or "")[:120],
            "authenticity_score": bscore,
            "authenticity_label": label,
            "is_bot_suspect": label in ("bot", "suspicious"),
        })

    return {
        "total_comments": total,
        "estimated_real": real_n,
        "estimated_bots": bot_n,
        "estimated_suspicious": susp_n,
        "real_pct": round(real_n * 100 / total, 1),
        "bot_pct": round(bot_n * 100 / total, 1),
        "suspicious_pct": round(susp_n * 100 / total, 1),
        "comment_scores": scores,
    }


# ── Daily Narrative Briefing ──────────────────────────────────────────────────

def _empty_briefing(client_id: str) -> dict:
    return {
        "client_id": client_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "days_analysed": 30,
        "stats": {"total_comments": 0, "positive_comments": 0, "negative_comments": 0},
        "health": "stable",
        "health_score": 50,
        "address_these": [],
        "avoid_these": [],
    }


@router.get("/narrative-briefing")
def narrative_briefing(
    client_id: str = Query(...),
    days: int = Query(30, ge=1, le=90),
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Daily Narrative Briefing — what to address (green) vs what to avoid (red).

    Synthesises signals from comment sentiment, AI narratives, topic clusters,
    and press coverage into two actionable lists for the client's comms team.
    """
    # 1. All post IDs for this client
    all_post_ids = _client_post_ids(db, client_id)
    if not all_post_ids:
        return _empty_briefing(client_id)

    # 2. Prefer recent data; fall back to all-time if thin
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    recent_ids = [
        r[0] for r in db.query(Post.id).filter(
            Post.id.in_(all_post_ids),
            Post.published_at >= cutoff,
            Post.is_deleted == False,
        ).all()
    ]
    work_ids = recent_ids if len(recent_ids) >= 3 else all_post_ids

    # 3. Positive comment corpus
    pos_rows = (
        db.query(Comment.content)
        .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .filter(Comment.post_id.in_(work_ids), CommentAnalysis.sentiment == "Positive")
        .limit(600).all()
    )
    # 4. Negative comment corpus
    neg_rows = (
        db.query(Comment.content)
        .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .filter(Comment.post_id.in_(work_ids), CommentAnalysis.sentiment == "Negative")
        .limit(600).all()
    )

    pos_text = " ".join(r.content or "" for r in pos_rows).lower()
    neg_text = " ".join(r.content or "" for r in neg_rows).lower()

    pos_freq = Counter(
        t for t in re.findall(r"\b[a-z]{4,}\b", pos_text) if t not in _STOP_WORDS
    )
    neg_freq = Counter(
        t for t in re.findall(r"\b[a-z]{4,}\b", neg_text) if t not in _STOP_WORDS
    )

    # Words that are exclusive to positive / negative (not in the top of the other)
    neg_top_words = {w for w, _ in neg_freq.most_common(35)}
    pos_top_words = {w for w, _ in pos_freq.most_common(35)}
    pos_exclusive = [(w, f) for w, f in pos_freq.most_common(50) if w not in neg_top_words][:12]
    neg_exclusive = [(w, f) for w, f in neg_freq.most_common(50) if w not in pos_top_words][:12]

    # 5. PostAnalysis — narratives + topic clusters + crisis scores
    pa_rows = (
        db.query(
            PostAnalysis.post_id, PostAnalysis.main_narrative,
            PostAnalysis.crisis_probability, PostAnalysis.result,
        )
        .filter(PostAnalysis.post_id.in_(work_ids))
        .all()
    )

    topic_pos: Counter = Counter()
    topic_neg: Counter = Counter()
    pos_narratives: list[str] = []
    neg_narratives: list[str] = []

    for row in pa_rows:
        crisis = row.crisis_probability or 0.0
        res = row.result or {}
        sentiment = res.get("sentiment", "Neutral")
        is_positive = sentiment == "Positive" or crisis < 0.30
        is_negative = sentiment == "Negative" or crisis > 0.55

        for t in res.get("topics", []):
            if isinstance(t, str) and len(t) > 2:
                if is_positive:
                    topic_pos[t.lower()] += 1
                if is_negative:
                    topic_neg[t.lower()] += 1

        if row.main_narrative:
            if is_positive:
                pos_narratives.append(row.main_narrative)
            if is_negative:
                neg_narratives.append(row.main_narrative)

    # 6. Press coverage sentiment for this client
    press_ids = [
        r[0] for r in db.query(Post.id).filter(
            Post.tenant_id == current.tenant_id,
            Post.client_id == client_id,
            Post.source_kind.in_(("press_rss", "youtube_channel_video")),
            Post.is_deleted == False,
        ).order_by(Post.published_at.desc()).limit(30).all()
    ]
    press_sent_map: dict[str, str] = {}
    press_info_map: dict[str, dict] = {}
    if press_ids:
        for pid, sent in (
            db.query(Comment.post_id, CommentAnalysis.sentiment)
            .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
            .filter(Comment.post_id.in_(press_ids)).all()
        ):
            press_sent_map[pid] = sent
        for p in db.query(Post.id, Post.content, Post.author, Post.url).filter(Post.id.in_(press_ids)).all():
            raw = p.content or ""
            title = raw.split(" — ")[0][:100] if " — " in raw else raw[:100]
            press_info_map[p.id] = {"title": title, "source": p.author or "", "url": p.url or ""}

    pos_press = [press_info_map[pid] for pid in press_ids if press_sent_map.get(pid) == "Positive" and pid in press_info_map]
    neg_press = [press_info_map[pid] for pid in press_ids if press_sent_map.get(pid) == "Negative" and pid in press_info_map]

    # ── Build ADDRESS THESE (green) ────────────────────────────────────────────
    address: list[dict] = []

    if pos_exclusive:
        kws = [w for w, _ in pos_exclusive[:8]]
        top_n = pos_exclusive[0][1] if pos_exclusive else 0
        address.append({
            "id": "pos_kw_cluster",
            "topic": "Amplify these audience-positive themes",
            "reason": f"These keywords appear in {len(pos_rows)} positive comments ({top_n} peak mentions). Your audience responds warmly to content around these topics.",
            "keywords": kws,
            "source_tag": "Social Listening",
            "source_kind": "comment",
            "weight": top_n,
        })

    for topic, count in topic_pos.most_common(5):
        if count < 2:
            continue
        address.append({
            "id": f"topic_pos_{topic[:20]}",
            "topic": topic.title(),
            "reason": f"Positive topic cluster — appears in {count} posts with low-crisis audience reactions. High resonance with your base.",
            "keywords": [topic],
            "source_tag": "AI Topic Analysis",
            "source_kind": "narrative",
            "weight": count * 12,
        })

    seen_narr: set = set()
    for narr in pos_narratives[:5]:
        short = narr[:70]
        if short in seen_narr:
            continue
        seen_narr.add(short)
        address.append({
            "id": f"narr_pos_{abs(hash(narr)) % 99999}",
            "topic": narr[:80],
            "reason": "This narrative drives low-crisis post engagement. Leaning into it will reinforce positive public perception.",
            "keywords": [w for w in re.findall(r"\b[a-z]{5,}\b", narr.lower()) if w not in _STOP_WORDS][:5],
            "source_tag": "AI Narrative",
            "source_kind": "narrative",
            "weight": 6,
        })

    for ref in pos_press[:4]:
        address.append({
            "id": f"press_pos_{abs(hash(ref['title'])) % 99999}",
            "topic": f"{ref['title'][:75]}",
            "reason": f"Positive press coverage from {ref['source']} — amplify or reference this story in your posts to ride the positive wave.",
            "keywords": [],
            "source_tag": f"Press · {ref['source']}",
            "source_kind": "press",
            "url": ref.get("url", ""),
            "weight": 9,
        })

    # ── Build AVOID THESE (red) ────────────────────────────────────────────────
    avoid: list[dict] = []

    if neg_exclusive:
        kws = [w for w, _ in neg_exclusive[:8]]
        top_n = neg_exclusive[0][1] if neg_exclusive else 0
        avoid.append({
            "id": "neg_kw_cluster",
            "topic": "Keywords that trigger negative backlash",
            "reason": f"These words appear disproportionately in negative comments ({len(neg_rows)} total). Any post referencing them is likely to inflame the audience.",
            "keywords": kws,
            "source_tag": "Social Listening",
            "source_kind": "comment",
            "weight": top_n,
        })

    for topic, count in topic_neg.most_common(5):
        if count < 2:
            continue
        avoid.append({
            "id": f"topic_neg_{topic[:20]}",
            "topic": topic.title(),
            "reason": f"High-crisis topic cluster — appears in {count} posts with elevated negative reactions. Engaging publicly raises reputation risk.",
            "keywords": [topic],
            "source_tag": "AI Topic Analysis",
            "source_kind": "narrative",
            "weight": count * 12,
        })

    seen_neg_narr: set = set()
    for narr in neg_narratives[:5]:
        short = narr[:70]
        if short in seen_neg_narr:
            continue
        seen_neg_narr.add(short)
        avoid.append({
            "id": f"narr_neg_{abs(hash(narr)) % 99999}",
            "topic": narr[:80],
            "reason": "This narrative is linked to high-crisis-probability posts. Referencing or reacting to it publicly could amplify backlash.",
            "keywords": [w for w in re.findall(r"\b[a-z]{5,}\b", narr.lower()) if w not in _STOP_WORDS][:5],
            "source_tag": "AI Narrative",
            "source_kind": "narrative",
            "weight": 6,
        })

    for ref in neg_press[:4]:
        avoid.append({
            "id": f"press_neg_{abs(hash(ref['title'])) % 99999}",
            "topic": f"{ref['title'][:75]}",
            "reason": f"Negative press from {ref['source']} — avoid engaging with this story publicly; let it pass without amplification.",
            "keywords": [],
            "source_tag": f"Press · {ref['source']}",
            "source_kind": "press",
            "url": ref.get("url", ""),
            "weight": 9,
        })

    # Sort, deduplicate, cap at 8
    def _dedup(items: list[dict]) -> list[dict]:
        seen_topics: set = set()
        out = []
        for item in sorted(items, key=lambda x: x.get("weight", 0), reverse=True):
            key = item["topic"][:40].lower()
            if key not in seen_topics:
                seen_topics.add(key)
                out.append(item)
        return out[:8]

    address = _dedup(address)
    avoid = _dedup(avoid)

    # Overall health score (0–100)
    total_c = len(pos_rows) + len(neg_rows)
    neg_ratio = len(neg_rows) / max(total_c, 1)
    if neg_ratio >= 0.55:
        health = "crisis"
        health_score = max(10, 40 - int((neg_ratio - 0.55) * 100))
    elif neg_ratio >= 0.35:
        health = "caution"
        health_score = 40 + int((0.55 - neg_ratio) * 120)
    else:
        health_score = min(100, 65 + int((0.35 - neg_ratio) * 140))
        health = "stable"

    return {
        "client_id": client_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "days_analysed": days,
        "stats": {
            "total_comments": total_c,
            "positive_comments": len(pos_rows),
            "negative_comments": len(neg_rows),
        },
        "health": health,
        "health_score": health_score,
        "address_these": address,
        "avoid_these": avoid,
    }


@router.post("/html-to-pdf")
async def html_to_pdf(
    body: dict,
    current: CurrentUser = Depends(get_current_user),
):
    """Convert HTML report to PDF using WeasyPrint and return as binary download."""
    from fastapi.responses import Response
    import weasyprint

    html_content: str = body.get("html", "")
    filename: str = body.get("filename", "report.pdf")
    if not html_content:
        from fastapi import HTTPException
        raise HTTPException(400, "html field is required")

    # Sanitise filename
    safe = re.sub(r"[^\w\-\.]", "_", filename)
    if not safe.endswith(".pdf"):
        safe += ".pdf"

    try:
        pdf_bytes = weasyprint.HTML(string=html_content).write_pdf()
    except Exception as exc:
        logger.warning("html-to-pdf weasyprint error: %s", exc)
        from fastapi import HTTPException
        raise HTTPException(500, f"PDF generation failed: {exc}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe}"'},
    )


@router.get("/comment-narrative")
def comment_narrative(
    client_id: str = Query(...),
    profile_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """AI-generated public opinion narrative from all comments for the selected account and period."""
    import httpx as _httpx
    from app.config import settings

    _empty = {
        "narrative_paragraph": "No comment data is available for this account in the selected period.",
        "positive_summary": "",
        "negative_summary": "",
        "positive_keywords": [],
        "negative_keywords": [],
        "positive_samples": [],
        "negative_samples": [],
        "topics": [],
        "stats": {"total": 0, "positive": 0, "negative": 0, "neutral": 0,
                  "positive_pct": 0, "negative_pct": 0, "neutral_pct": 0},
        "risk_level": "Low",
        "health": "stable",
        "health_score": 50,
    }

    # 1. All post IDs for this client
    all_post_ids = _client_post_ids(db, client_id)
    if not all_post_ids:
        return _empty

    # 2. Date + profile filter
    date_filters = []
    if profile_id:
        date_filters.append(Post.social_profile_id == profile_id)
    if date_from:
        try:
            date_filters.append(Post.published_at >= datetime.fromisoformat(date_from.replace("Z", "+00:00")))
        except ValueError:
            pass
    if date_to:
        try:
            date_filters.append(Post.published_at <= datetime.fromisoformat(date_to.replace("Z", "+00:00")))
        except ValueError:
            pass

    if date_filters:
        work_ids = [r[0] for r in db.query(Post.id).filter(
            Post.id.in_(all_post_ids), Post.is_deleted == False, *date_filters
        ).all()]
        if not work_ids:
            work_ids = all_post_ids
    else:
        work_ids = all_post_ids

    # 3. Sentiment counts
    sent_rows = (
        db.query(CommentAnalysis.sentiment, func.count())
        .join(Comment, Comment.id == CommentAnalysis.comment_id)
        .filter(Comment.post_id.in_(work_ids))
        .group_by(CommentAnalysis.sentiment)
        .all()
    )
    counts = {"Positive": 0, "Negative": 0, "Neutral": 0}
    for sent, cnt in sent_rows:
        counts[sent or "Neutral"] += cnt
    total = sum(counts.values())
    if total == 0:
        return _empty

    pos_pct = round(counts["Positive"] * 100 / total)
    neg_pct = round(counts["Negative"] * 100 / total)
    neu_pct = 100 - pos_pct - neg_pct

    # 4. Sample comment text (pick longer, more meaningful comments)
    def _samples(sentiment: str, n: int = 20) -> list[str]:
        rows = (
            db.query(Comment.content)
            .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
            .filter(Comment.post_id.in_(work_ids), CommentAnalysis.sentiment == sentiment)
            .order_by(func.length(Comment.content).desc())
            .limit(500)
            .all()
        )
        return [r.content for r in rows if r.content and len(r.content.strip()) > 20][:n]

    pos_samples = _samples("Positive")
    neg_samples = _samples("Negative")

    # 5. Keyword frequency
    pos_corpus = (
        db.query(Comment.content)
        .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .filter(Comment.post_id.in_(work_ids), CommentAnalysis.sentiment == "Positive")
        .limit(600).all()
    )
    neg_corpus = (
        db.query(Comment.content)
        .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
        .filter(Comment.post_id.in_(work_ids), CommentAnalysis.sentiment == "Negative")
        .limit(600).all()
    )
    pos_text = " ".join(r.content or "" for r in pos_corpus).lower()
    neg_text = " ".join(r.content or "" for r in neg_corpus).lower()
    pos_freq = Counter(t for t in re.findall(r"\b[a-z]{4,}\b", pos_text) if t not in _STOP_WORDS)
    neg_freq = Counter(t for t in re.findall(r"\b[a-z]{4,}\b", neg_text) if t not in _STOP_WORDS)
    pos_kws = [w for w, _ in pos_freq.most_common(10)]
    neg_kws = [w for w, _ in neg_freq.most_common(10)]

    # 6. PostAnalysis topics + narratives
    pa_rows = (
        db.query(PostAnalysis.main_narrative, PostAnalysis.result)
        .filter(PostAnalysis.post_id.in_(work_ids))
        .limit(25)
        .all()
    )
    topic_ctr: Counter = Counter()
    narratives: list[str] = []
    for row in pa_rows:
        res = row.result or {}
        for t in res.get("topics", []):
            if isinstance(t, str) and len(t) > 2:
                topic_ctr[t.lower()] += 1
        if row.main_narrative:
            narratives.append(row.main_narrative)
    top_topics = [t for t, _ in topic_ctr.most_common(6)]

    # 7. Health & risk
    risk_level = "High" if neg_pct > 40 else "Medium" if neg_pct > 25 else "Low"
    neg_ratio = neg_pct / 100
    if neg_ratio >= 0.55:
        health = "crisis"
        health_score = max(10, 40 - int((neg_ratio - 0.55) * 100))
    elif neg_ratio >= 0.35:
        health = "caution"
        health_score = 40 + int((0.55 - neg_ratio) * 120)
    else:
        health_score = min(100, 65 + int((0.35 - neg_ratio) * 140))
        health = "stable"

    # 8. AI narrative via Claude Haiku
    narrative_paragraph = ""
    positive_summary = ""
    negative_summary = ""

    api_key = settings.ANTHROPIC_API_KEY
    if api_key:
        pos_sample_text = "\n".join(f"- {c[:160]}" for c in pos_samples) or "(none)"
        neg_sample_text = "\n".join(f"- {c[:160]}" for c in neg_samples) or "(none)"
        narr_ctx = " ".join(n[:90] for n in narratives[:3]) if narratives else ""

        prompt = (
            "You are a PR analyst writing a client-facing public opinion report.\n\n"
            f"Sentiment: {pos_pct}% positive · {neg_pct}% negative · {neu_pct}% neutral\n"
            f"Total comments: {total:,} · Risk: {risk_level}\n"
            f"Positive keywords: {', '.join(pos_kws[:6]) or 'none'}\n"
            f"Negative keywords: {', '.join(neg_kws[:6]) or 'none'}\n"
            f"Top topics: {', '.join(top_topics[:5]) or 'none'}\n"
            + (f"Post narratives: {narr_ctx}\n" if narr_ctx else "")
            + f"\nSample positive comments:\n{pos_sample_text}\n"
            f"\nSample negative comments:\n{neg_sample_text}\n\n"
            "Write three concise paragraphs (2–3 sentences each):\n"
            "1. Overall public sentiment — what does the audience feel and why?\n"
            "2. Positive highlights — what are they praising or responding well to?\n"
            "3. Negative concerns — what criticisms or issues need to be addressed?\n\n"
            'Respond ONLY with valid JSON: {"overall": "...", "positive": "...", "negative": "..."}'
        )
        try:
            with _httpx.Client(timeout=25.0) as hc:
                resp = hc.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": settings.CLAUDE_SENTIMENT_MODEL,
                        "max_tokens": 700,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                resp.raise_for_status()
                raw = resp.json()["content"][0]["text"].strip()
                m = re.search(r"\{.*\}", raw, re.DOTALL)
                if m:
                    parsed = json.loads(m.group(0))
                    narrative_paragraph = parsed.get("overall", "")
                    positive_summary = parsed.get("positive", "")
                    negative_summary = parsed.get("negative", "")
        except Exception as exc:
            logger.warning("comment-narrative AI call failed: %s", exc)

    # Fallback: generate prose from data if AI unavailable or failed
    if not narrative_paragraph:
        tone = "strongly positive" if pos_pct > 60 else "moderately positive" if pos_pct > 40 else "mixed"
        narrative_paragraph = (
            f"Public sentiment analysis across {total:,} comments reveals a {tone} audience response "
            f"({pos_pct}% positive, {neg_pct}% negative, {neu_pct}% neutral). "
            + ("Reputation is stable with strong positive engagement from the audience."
               if risk_level == "Low" else
               "There are notable negative sentiments that warrant closer monitoring and proactive engagement."
               if risk_level == "Medium" else
               "Significant negative feedback is present and requires immediate attention from the communications team.")
        )
    if not positive_summary:
        positive_summary = (
            f"Audience members respond positively to content related to {', '.join(pos_kws[:4])}. "
            "Positive engagement signals strong affinity with the account's messaging and causes."
        ) if pos_kws else "The account maintains a base of positive supporters expressing appreciation and agreement."
    if not negative_summary:
        negative_summary = (
            f"Key areas of criticism centre around {', '.join(neg_kws[:4])}. "
            "These concerns should be addressed through proactive communication and targeted audience engagement."
        ) if neg_kws else "Negative comments represent a minority and reflect general audience disagreements rather than targeted backlash."

    return {
        "narrative_paragraph": narrative_paragraph,
        "positive_summary": positive_summary,
        "negative_summary": negative_summary,
        "positive_keywords": pos_kws,
        "negative_keywords": neg_kws,
        "positive_samples": pos_samples,
        "negative_samples": neg_samples,
        "topics": top_topics,
        "stats": {
            "total": total,
            "positive": counts["Positive"],
            "negative": counts["Negative"],
            "neutral": counts["Neutral"],
            "positive_pct": pos_pct,
            "negative_pct": neg_pct,
            "neutral_pct": neu_pct,
        },
        "risk_level": risk_level,
        "health": health,
        "health_score": health_score,
    }
