"""Async report generation."""
from app.database import SessionLocal
from app.models import ReportFile, ReportRun
from app.services.report_generator import generate_report_pdf
from app.services.storage import get_storage
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.report_tasks.generate_report_task")
def generate_report_task(run_id: str, tenant_id: str, kind: str = "executive",
                         client_id: str | None = None):
    db = SessionLocal()
    try:
        run = db.query(ReportRun).filter(ReportRun.id == run_id).first()
        if not run:
            return
        run.status = "running"; db.commit()
        pdf = generate_report_pdf(db, tenant_id, kind=kind, client_id=client_id)
        key = f"reports/{tenant_id}/{run_id}.pdf"
        get_storage().put(key, pdf, "application/pdf")
        db.add(ReportFile(tenant_id=tenant_id, report_run_id=run_id, object_key=key,
                          filename=f"report-{kind}.pdf"))
        run.status = "done"; db.commit()
    finally:
        db.close()
