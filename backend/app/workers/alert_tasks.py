"""Evaluate alert rules (e.g. crisis spike) and record triggers."""
from datetime import datetime, timezone

from sqlalchemy import func

from app.database import SessionLocal
from app.models import Alert, CommentAnalysis
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.alert_tasks.evaluate_alerts")
def evaluate_alerts():
    db = SessionLocal()
    triggered = 0
    try:
        alerts = db.query(Alert).filter(Alert.is_active == True, Alert.is_deleted == False).all()
        for a in alerts:
            rule = a.rule or {}
            threshold = float(rule.get("toxicity_threshold", 0.7))
            avg_tox = db.query(func.avg(CommentAnalysis.toxicity_score)).filter(
                CommentAnalysis.tenant_id == a.tenant_id).scalar() or 0.0
            if float(avg_tox) >= threshold:
                a.last_triggered_at = datetime.now(timezone.utc)
                triggered += 1
        db.commit()
        return {"triggered": triggered}
    finally:
        db.close()
