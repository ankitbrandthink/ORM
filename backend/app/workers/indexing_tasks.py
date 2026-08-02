"""Index analyzed documents into OpenSearch."""
from app.database import SessionLocal
from app.models import CommentAnalysis, Post, PostAnalysis
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.indexing_tasks.index_post_task")
def index_post_task(post_id: str, tenant_id: str):
    db = SessionLocal()
    try:
        post = db.query(Post).filter(Post.id == post_id).first()
        if not post:
            return
        try:
            from app.search.indexer import index_post
            index_post({
                "id": post.id, "tenant_id": tenant_id, "content": post.content,
                "author": post.author, "language": post.language,
                "published_at": post.published_at.isoformat() if post.published_at else None,
            })
        except Exception:  # noqa: BLE001 — search is best-effort
            pass
    finally:
        db.close()
