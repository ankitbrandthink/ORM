from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models import Monitor, MonitorQuery
from app.schemas import MonitorIn, MonitorOut

router = APIRouter()


@router.get("", response_model=list[MonitorOut])
def list_monitors(current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Monitor).filter(Monitor.tenant_id == current.tenant_id,
                                    Monitor.is_deleted == False).all()


@router.post("", response_model=MonitorOut)
def create_monitor(body: MonitorIn,
                   current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
                   db: Session = Depends(get_db)):
    m = Monitor(tenant_id=current.tenant_id, name=body.name,
                client_id=body.client_id, config=body.config)
    db.add(m); db.flush()
    for kw in body.keywords:
        db.add(MonitorQuery(monitor_id=m.id, keyword=kw))
    db.commit(); db.refresh(m)
    return m


@router.get("/{monitor_id}", response_model=MonitorOut)
def get_monitor(monitor_id: str, current: CurrentUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    m = db.query(Monitor).filter(Monitor.id == monitor_id,
                                 Monitor.tenant_id == current.tenant_id).first()
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return m


@router.put("/{monitor_id}", response_model=MonitorOut)
def update_monitor(monitor_id: str, body: MonitorIn,
                   current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
                   db: Session = Depends(get_db)):
    m = db.query(Monitor).filter(Monitor.id == monitor_id,
                                 Monitor.tenant_id == current.tenant_id).first()
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    m.name = body.name; m.client_id = body.client_id; m.config = body.config
    db.commit(); db.refresh(m)
    return m


@router.delete("/{monitor_id}")
def delete_monitor(monitor_id: str,
                   current: CurrentUser = Depends(require_roles("CROManager")),
                   db: Session = Depends(get_db)):
    m = db.query(Monitor).filter(Monitor.id == monitor_id,
                                 Monitor.tenant_id == current.tenant_id).first()
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    m.is_deleted = True; db.commit()
    return {"status": "deleted"}
