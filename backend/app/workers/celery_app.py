from celery import Celery

from app.config import settings

celery_app = Celery(
    "orm",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.ingestion_tasks",
        "app.workers.analysis_tasks",
        "app.workers.indexing_tasks",
        "app.workers.report_tasks",
        "app.workers.alert_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    beat_schedule={
        "poll-monitors-every-5-min": {
            "task": "app.workers.ingestion_tasks.poll_active_monitors",
            "schedule": 300.0,
        },
        "evaluate-alerts-every-2-min": {
            "task": "app.workers.alert_tasks.evaluate_alerts",
            "schedule": 120.0,
        },
    },
)
