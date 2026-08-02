"""
Per-account Claude API usage & billing dashboard endpoint.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import ApiUsageLog, User

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("/summary")
def usage_summary(
    days: int = Query(30, ge=1, le=365),
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return daily Claude API usage for the tenant over the last N days."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

    # Daily totals
    daily = (
        db.query(
            ApiUsageLog.date,
            func.sum(ApiUsageLog.input_tokens).label("input_tokens"),
            func.sum(ApiUsageLog.output_tokens).label("output_tokens"),
            func.sum(ApiUsageLog.total_tokens).label("total_tokens"),
            func.sum(ApiUsageLog.cost_usd).label("cost_usd"),
            func.sum(ApiUsageLog.item_count).label("items_processed"),
        )
        .filter(ApiUsageLog.tenant_id == current.tenant_id, ApiUsageLog.date >= since)
        .group_by(ApiUsageLog.date)
        .order_by(ApiUsageLog.date)
        .all()
    )

    # Per-user totals
    per_user = (
        db.query(
            ApiUsageLog.user_id,
            User.email,
            func.sum(ApiUsageLog.total_tokens).label("total_tokens"),
            func.sum(ApiUsageLog.cost_usd).label("cost_usd"),
            func.sum(ApiUsageLog.item_count).label("items_processed"),
        )
        .outerjoin(User, User.id == ApiUsageLog.user_id)
        .filter(ApiUsageLog.tenant_id == current.tenant_id, ApiUsageLog.date >= since)
        .group_by(ApiUsageLog.user_id, User.email)
        .order_by(func.sum(ApiUsageLog.total_tokens).desc())
        .all()
    )

    # Operation breakdown
    by_op = (
        db.query(
            ApiUsageLog.operation,
            func.sum(ApiUsageLog.total_tokens).label("total_tokens"),
            func.sum(ApiUsageLog.cost_usd).label("cost_usd"),
            func.sum(ApiUsageLog.item_count).label("items"),
        )
        .filter(ApiUsageLog.tenant_id == current.tenant_id, ApiUsageLog.date >= since)
        .group_by(ApiUsageLog.operation)
        .all()
    )

    # Totals
    grand = (
        db.query(
            func.sum(ApiUsageLog.total_tokens),
            func.sum(ApiUsageLog.cost_usd),
            func.sum(ApiUsageLog.item_count),
        )
        .filter(ApiUsageLog.tenant_id == current.tenant_id, ApiUsageLog.date >= since)
        .first()
    )
    total_tokens = grand[0] or 0
    total_cost   = round(grand[1] or 0.0, 4)
    total_items  = grand[2] or 0

    # Ceiling check
    daily_limit = settings.CLAUDE_DAILY_TOKEN_LIMIT
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_tokens = (
        db.query(func.sum(ApiUsageLog.total_tokens))
        .filter(ApiUsageLog.tenant_id == current.tenant_id, ApiUsageLog.date == today)
        .scalar() or 0
    )
    ceiling_pct = round(today_tokens * 100 / daily_limit, 1) if daily_limit else 0

    return {
        "period_days": days,
        "model": settings.CLAUDE_SENTIMENT_MODEL,
        "engine_active": bool(settings.ANTHROPIC_API_KEY),
        "total_tokens": total_tokens,
        "total_cost_usd": total_cost,
        "total_items_processed": total_items,
        "daily_token_limit": daily_limit,
        "today_tokens": today_tokens,
        "ceiling_pct": ceiling_pct,
        "daily": [
            {
                "date": r.date,
                "input_tokens": r.input_tokens or 0,
                "output_tokens": r.output_tokens or 0,
                "total_tokens": r.total_tokens or 0,
                "cost_usd": round(r.cost_usd or 0, 4),
                "items_processed": r.items_processed or 0,
            }
            for r in daily
        ],
        "per_user": [
            {
                "user_id": r.user_id,
                "email": r.email or "system",
                "total_tokens": r.total_tokens or 0,
                "cost_usd": round(r.cost_usd or 0, 4),
                "items_processed": r.items_processed or 0,
            }
            for r in per_user
        ],
        "by_operation": [
            {
                "operation": r.operation,
                "total_tokens": r.total_tokens or 0,
                "cost_usd": round(r.cost_usd or 0, 4),
                "items": r.items or 0,
            }
            for r in by_op
        ],
    }
