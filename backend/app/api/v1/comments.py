from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import Comment, CommentAnalysis
from app.schemas import CommentOut, Paginated

router = APIRouter()


@router.get("", response_model=Paginated)
def list_comments(
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    post_id: str | None = None,
    sentiment: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    q = db.query(Comment).filter(Comment.tenant_id == current.tenant_id,
                                 Comment.is_deleted == False)
    if post_id:
        q = q.filter(Comment.post_id == post_id)
    if sentiment:
        q = q.join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id) \
             .filter(CommentAnalysis.sentiment == sentiment)
    total = q.count()
    items = q.order_by(Comment.published_at.desc().nullslast()) \
             .offset((page - 1) * page_size).limit(page_size).all()
    return Paginated(total=total, page=page, page_size=page_size,
                     items=[CommentOut.model_validate(c).model_dump() for c in items])
