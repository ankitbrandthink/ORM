"""Ingestion: fetch from adapters, normalize, dedup, store, queue analysis."""
import asyncio
import hashlib

from app.database import SessionLocal
from app.models import Comment, IngestionJob, Monitor, Post, RawDocument
from app.scrapers.mock_adapter import MockAdapter
from app.workers.celery_app import celery_app


def _hash(text: str) -> str:
    return hashlib.sha256((text or "").encode()).hexdigest()


@celery_app.task(name="app.workers.ingestion_tasks.ingest_mock_for_monitor")
def ingest_mock_for_monitor(monitor_id: str, tenant_id: str, num_posts: int = 5,
                            comments_per_post: int = 50):
    db = SessionLocal()
    adapter = MockAdapter()
    job = IngestionJob(tenant_id=tenant_id, status="running", stats={})
    db.add(job); db.flush()
    posts_created = comments_created = 0
    try:
        for p in range(num_posts):
            np = asyncio.run(adapter.fetch_post(f"{monitor_id}-{p}"))
            chash = _hash(np.content + np.external_id)
            if db.query(RawDocument).filter(RawDocument.content_hash == chash).first():
                continue
            db.add(RawDocument(tenant_id=tenant_id, source_kind=np.source_kind,
                               content_hash=chash, payload={"content": np.content}))
            post = Post(tenant_id=tenant_id, monitor_id=monitor_id, source_kind=np.source_kind,
                        external_id=np.external_id, url=np.url, author=np.author,
                        content=np.content, language=np.language,
                        published_at=np.published_at, metrics=np.metrics)
            db.add(post); db.flush()
            posts_created += 1
            from app.workers.analysis_tasks import analyze_post_task
            analyze_post_task.delay(post.id, tenant_id)
            for nc in asyncio.run(adapter.fetch_comments(np.external_id, comments_per_post)):
                c = Comment(tenant_id=tenant_id, post_id=post.id, external_id=nc.external_id,
                            author=nc.author, content=nc.content, language=nc.language,
                            published_at=nc.published_at)
                db.add(c); db.flush()
                comments_created += 1
                from app.workers.analysis_tasks import analyze_comment_task
                analyze_comment_task.delay(c.id, tenant_id)
        job.status = "done"
        job.stats = {"posts": posts_created, "comments": comments_created}
        db.commit()
    except Exception as e:  # noqa: BLE001
        job.status = "failed"; job.stats = {"error": str(e)}; db.commit()
        raise
    finally:
        db.close()
    return {"posts": posts_created, "comments": comments_created}


@celery_app.task(name="app.workers.ingestion_tasks.poll_active_monitors")
def poll_active_monitors():
    db = SessionLocal()
    try:
        monitors = db.query(Monitor).filter(Monitor.is_active == True,
                                            Monitor.is_deleted == False).all()
        for m in monitors:
            ingest_mock_for_monitor.delay(m.id, m.tenant_id, 2, 20)
        return {"polled": len(monitors)}
    finally:
        db.close()
