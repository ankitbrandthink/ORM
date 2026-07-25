from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel as _PBase
from sqlalchemy import text as _sql_text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models import Client, Comment, CommentAnalysis, Post, SocialProfile
from app.schemas import ClientIn, ClientOut
from app.utils.ttl_cache import TTLCache


class _SheetBody(_PBase):
    sheet_url: str = ""
    sheet_label: str = ""

router = APIRouter()

_list_cache = TTLCache(ttl=60)


@router.get("", response_model=list[ClientOut])
def list_clients(current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    cached = _list_cache.get(current.tenant_id)
    if cached is not None:
        return cached
    rows = (db.query(Client)
            .filter(Client.tenant_id == current.tenant_id, Client.is_deleted == False)
            .order_by(Client.created_at.desc())
            .all())
    data = [ClientOut.model_validate(r).model_dump() for r in rows]
    _list_cache.set(current.tenant_id, data)
    return data


@router.post("", response_model=ClientOut)
def create_client(body: ClientIn,
                  current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
                  db: Session = Depends(get_db)):
    c = Client(tenant_id=current.tenant_id, **body.model_dump())
    db.add(c); db.commit(); db.refresh(c)
    _list_cache.invalidate(current.tenant_id)
    return c


@router.get("/{client_id}", response_model=ClientOut)
def get_client(client_id: str, current: CurrentUser = Depends(get_current_user),
               db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.id == client_id,
                                Client.tenant_id == current.tenant_id).first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return c


@router.put("/{client_id}", response_model=ClientOut)
def update_client(client_id: str, body: ClientIn,
                  current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
                  db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.id == client_id,
                                Client.tenant_id == current.tenant_id).first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit(); db.refresh(c)
    _list_cache.invalidate(current.tenant_id)
    return c


@router.patch("/{client_id}/sheet")
def set_client_sheet(client_id: str, body: _SheetBody,
                     current: CurrentUser = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    """Store a Google Sheet URL against a client (in meta JSON)."""
    c = db.query(Client).filter(Client.id == client_id,
                                Client.tenant_id == current.tenant_id).first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    meta = dict(c.meta or {})
    meta["sheet_url"] = body.sheet_url.strip()
    if body.sheet_label:
        meta["sheet_label"] = body.sheet_label.strip()
    c.meta = meta
    db.commit()
    return {"ok": True, "sheet_url": meta["sheet_url"]}


@router.delete("/{client_id}")
def delete_client(client_id: str,
                  current: CurrentUser = Depends(require_roles("CROManager")),
                  db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.id == client_id,
                                Client.tenant_id == current.tenant_id).first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")

    # Hard-cascade: all child records first, then profiles, then client row
    profile_ids = [r[0] for r in db.query(SocialProfile.id)
                   .filter(SocialProfile.client_id == client_id).all()]
    if profile_ids:
        post_ids = [r[0] for r in db.query(Post.id)
                    .filter(Post.social_profile_id.in_(profile_ids)).all()]
        if post_ids:
            ph = "('" + "','".join(post_ids) + "')"
            comment_ids = [r[0] for r in db.query(Comment.id)
                           .filter(Comment.post_id.in_(post_ids)).all()]
            if comment_ids:
                db.query(CommentAnalysis).filter(
                    CommentAnalysis.comment_id.in_(comment_ids)
                ).delete(synchronize_session=False)
            db.query(Comment).filter(Comment.post_id.in_(post_ids)).delete(synchronize_session=False)
            db.execute(_sql_text(f"DELETE FROM post_analysis WHERE post_id IN {ph}"))
            db.execute(_sql_text(f"DELETE FROM post_topics WHERE post_id IN {ph}"))
            db.execute(_sql_text(f"DELETE FROM tickets WHERE post_id IN {ph}"))
            db.execute(_sql_text(f"DELETE FROM alert_logs WHERE post_id IN {ph}"))
            db.query(Post).filter(Post.social_profile_id.in_(profile_ids)).delete(synchronize_session=False)
        db.query(SocialProfile).filter(SocialProfile.client_id == client_id).delete(synchronize_session=False)

    db.delete(c)
    db.commit()
    _list_cache.invalidate(current.tenant_id)
    return {"status": "deleted"}
