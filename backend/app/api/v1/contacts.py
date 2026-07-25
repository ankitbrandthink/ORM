"""
Contact management — alert recipients with name, email, mobile, WhatsApp.
Phase 5 admin panel requirement.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import ContactInfo

router = APIRouter()


class ContactIn(BaseModel):
    name: str
    email: Optional[str] = None
    mobile: Optional[str] = None
    whatsapp: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    is_primary: bool = False
    receive_whatsapp: bool = True
    receive_email: bool = False
    notes: Optional[str] = None


def _fmt(c: ContactInfo) -> dict:
    return {
        "id": c.id, "name": c.name, "email": c.email, "mobile": c.mobile,
        "whatsapp": c.whatsapp, "role": c.role, "company": c.company,
        "is_primary": c.is_primary, "receive_whatsapp": c.receive_whatsapp,
        "receive_email": c.receive_email, "notes": c.notes,
        "created_at": c.created_at,
    }


@router.get("")
def list_contacts(current: CurrentUser = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    rows = db.query(ContactInfo).filter(
        ContactInfo.tenant_id == current.tenant_id,
        ContactInfo.is_deleted == False,
    ).order_by(ContactInfo.is_primary.desc(), ContactInfo.name).all()
    return [_fmt(c) for c in rows]


@router.post("", status_code=201)
def create_contact(body: ContactIn,
                   current: CurrentUser = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    c = ContactInfo(tenant_id=current.tenant_id, **body.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return _fmt(c)


@router.put("/{contact_id}")
def update_contact(contact_id: str, body: ContactIn,
                   current: CurrentUser = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    c = db.query(ContactInfo).filter(
        ContactInfo.id == contact_id,
        ContactInfo.tenant_id == current.tenant_id,
    ).first()
    if not c:
        raise HTTPException(404, "Contact not found")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return _fmt(c)


@router.delete("/{contact_id}")
def delete_contact(contact_id: str,
                   current: CurrentUser = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    c = db.query(ContactInfo).filter(
        ContactInfo.id == contact_id,
        ContactInfo.tenant_id == current.tenant_id,
    ).first()
    if not c:
        raise HTTPException(404, "Contact not found")
    c.is_deleted = True
    db.commit()
    return {"ok": True}


@router.post("/{contact_id}/set-primary")
def set_primary(contact_id: str,
                current: CurrentUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Mark one contact as primary (clears primary on all others)."""
    db.query(ContactInfo).filter(
        ContactInfo.tenant_id == current.tenant_id,
        ContactInfo.is_deleted == False,
    ).update({"is_primary": False})
    c = db.query(ContactInfo).filter(
        ContactInfo.id == contact_id,
        ContactInfo.tenant_id == current.tenant_id,
    ).first()
    if not c:
        raise HTTPException(404, "Contact not found")
    c.is_primary = True
    db.commit()
    return {"ok": True}
