"""AI analysis tasks for posts and comments."""
from app.ai.comment_analyzer import analyze_comment_sync
from app.ai.post_analyzer import analyze_post_sync
from app.database import SessionLocal
from app.models import AIInferenceLog, Comment, CommentAnalysis, Post, PostAnalysis
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.analysis_tasks.analyze_post_task")
def analyze_post_task(post_id: str, tenant_id: str):
    db = SessionLocal()
    try:
        post = db.query(Post).filter(Post.id == post_id).first()
        if not post:
            return
        result = analyze_post_sync(post_id, post.content or "")
        if db.query(PostAnalysis).filter(PostAnalysis.post_id == post_id).first():
            return
        db.add(PostAnalysis(
            tenant_id=tenant_id, post_id=post_id,
            summary=result.get("summary"), main_narrative=result.get("main_narrative"),
            intent=result.get("intent"), political_angle=result.get("political_angle"),
            crisis_probability=float(result.get("crisis_probability", 0) or 0),
            urgency_score=float(result.get("urgency_score", 0) or 0),
            virality_score=float(result.get("virality_score", 0) or 0),
            result=result,
        ))
        db.add(AIInferenceLog(tenant_id=tenant_id, task_type="post_analysis",
                              model_name=result.get("_engine", "?"), success=True))
        db.commit()
        from app.workers.indexing_tasks import index_post_task
        index_post_task.delay(post_id, tenant_id)
    finally:
        db.close()


@celery_app.task(name="app.workers.analysis_tasks.analyze_comment_task")
def analyze_comment_task(comment_id: str, tenant_id: str):
    db = SessionLocal()
    try:
        comment = db.query(Comment).filter(Comment.id == comment_id).first()
        if not comment:
            return
        result = analyze_comment_sync(comment.content or "")
        if db.query(CommentAnalysis).filter(CommentAnalysis.comment_id == comment_id).first():
            return
        db.add(CommentAnalysis(
            tenant_id=tenant_id, comment_id=comment_id,
            sentiment=result.get("sentiment"), stance=result.get("stance"),
            emotion=result.get("emotion", []), sarcasm=bool(result.get("sarcasm")),
            toxicity_score=float(result.get("toxicity_score", 0) or 0),
            spam_score=float(result.get("spam_score", 0) or 0),
            bot_probability=float(result.get("bot_probability", 0) or 0),
            confidence=float(result.get("confidence", 0) or 0),
            result=result,
        ))
        db.commit()
    finally:
        db.close()
