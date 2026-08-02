from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models import DataSource
from app.schemas import SourceIn, SourceOut

router = APIRouter()


@router.get("", response_model=list[SourceOut])
def list_sources(current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(DataSource).filter(DataSource.tenant_id == current.tenant_id,
                                       DataSource.is_deleted == False).all()


@router.post("", response_model=SourceOut)
def create_source(body: SourceIn,
                  current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
                  db: Session = Depends(get_db)):
    s = DataSource(tenant_id=current.tenant_id, **body.model_dump())
    db.add(s); db.commit(); db.refresh(s)
    return s


@router.put("/{source_id}", response_model=SourceOut)
def update_source(source_id: str, body: SourceIn,
                  current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
                  db: Session = Depends(get_db)):
    s = db.query(DataSource).filter(DataSource.id == source_id,
                                    DataSource.tenant_id == current.tenant_id).first()
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    db.commit(); db.refresh(s)
    return s


@router.delete("/{source_id}")
def delete_source(source_id: str,
                  current: CurrentUser = Depends(require_roles("CROManager")),
                  db: Session = Depends(get_db)):
    s = db.query(DataSource).filter(DataSource.id == source_id,
                                    DataSource.tenant_id == current.tenant_id).first()
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    s.is_deleted = True; db.commit()
    return {"status": "deleted"}
