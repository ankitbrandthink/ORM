from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models import Ticket, TicketEvent
from app.schemas import (
    AssignRequest, EscalateRequest, ResolveRequest,
    TicketIn, TicketOut, TicketUpdate,
)

router = APIRouter()

# State machine: allowed transitions
TRANSITIONS = {
    "Open": {"Assigned", "In Progress", "Closed"},
    "Assigned": {"In Progress", "Pending", "Closed"},
    "In Progress": {"Pending", "Resolved", "Closed"},
    "Pending": {"In Progress", "Resolved", "Closed"},
    "Resolved": {"Closed", "In Progress"},
    "Closed": set(),
}

SLA_HOURS = {"Critical": 4, "High": 12, "Medium": 48, "Low": 96}


def _log(db: Session, current: CurrentUser, ticket: Ticket, event_type: str,
         from_value=None, to_value=None, note=None):
    db.add(TicketEvent(tenant_id=current.tenant_id, ticket_id=ticket.id,
                       actor_id=current.id, event_type=event_type,
                       from_value=from_value, to_value=to_value, note=note))


@router.get("", response_model=list[TicketOut])
def list_tickets(current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db),
                 status_filter: str | None = None, priority: str | None = None):
    q = db.query(Ticket).filter(Ticket.tenant_id == current.tenant_id, Ticket.is_deleted == False)
    if status_filter:
        q = q.filter(Ticket.status == status_filter)
    if priority:
        q = q.filter(Ticket.priority == priority)
    return q.order_by(Ticket.created_at.desc()).all()


@router.post("", response_model=TicketOut)
def create_ticket(body: TicketIn, current: CurrentUser = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    due = datetime.now(timezone.utc) + timedelta(hours=SLA_HOURS.get(body.priority, 48))
    t = Ticket(tenant_id=current.tenant_id, title=body.title, description=body.description,
               priority=body.priority, client_id=body.client_id, post_id=body.post_id,
               comment_id=body.comment_id, status="Open", due_date=due)
    db.add(t); db.flush()
    _log(db, current, t, "created", to_value="Open")
    db.commit(); db.refresh(t)
    return t


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: str, current: CurrentUser = Depends(get_current_user),
               db: Session = Depends(get_db)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id,
                                Ticket.tenant_id == current.tenant_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    return t


@router.put("/{ticket_id}", response_model=TicketOut)
def update_ticket(ticket_id: str, body: TicketUpdate,
                  current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id,
                                Ticket.tenant_id == current.tenant_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    if body.status and body.status != t.status:
        if body.status not in TRANSITIONS.get(t.status, set()):
            raise HTTPException(400, f"Illegal transition {t.status} -> {body.status}")
        _log(db, current, t, "status_change", from_value=t.status, to_value=body.status)
        t.status = body.status
    for field in ("title", "description", "priority"):
        val = getattr(body, field)
        if val is not None:
            setattr(t, field, val)
    db.commit(); db.refresh(t)
    return t


@router.post("/{ticket_id}/assign", response_model=TicketOut)
def assign(ticket_id: str, body: AssignRequest,
           current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id,
                                Ticket.tenant_id == current.tenant_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    t.assignee_id = body.assignee_id
    if t.status == "Open":
        _log(db, current, t, "status_change", from_value="Open", to_value="Assigned")
        t.status = "Assigned"
    _log(db, current, t, "assigned", to_value=body.assignee_id)
    db.commit(); db.refresh(t)
    return t


@router.post("/{ticket_id}/escalate", response_model=TicketOut)
def escalate(ticket_id: str, body: EscalateRequest,
             current: CurrentUser = Depends(require_roles("Analyst", "CROManager")),
             db: Session = Depends(get_db)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id,
                                Ticket.tenant_id == current.tenant_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    t.priority = "Critical"
    t.meta = {**(t.meta or {}), "escalated": True, "escalation_reason": body.reason}
    _log(db, current, t, "escalated", note=body.reason)
    db.commit(); db.refresh(t)
    return t


@router.post("/{ticket_id}/resolve", response_model=TicketOut)
def resolve(ticket_id: str, body: ResolveRequest,
            current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id,
                                Ticket.tenant_id == current.tenant_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    if "Resolved" not in TRANSITIONS.get(t.status, set()):
        raise HTTPException(400, f"Cannot resolve from {t.status}")
    _log(db, current, t, "status_change", from_value=t.status, to_value="Resolved", note=body.note)
    t.status = "Resolved"
    db.commit(); db.refresh(t)
    return t


@router.get("/{ticket_id}/timeline")
def timeline(ticket_id: str, current: CurrentUser = Depends(get_current_user),
             db: Session = Depends(get_db)):
    events = (db.query(TicketEvent)
              .filter(TicketEvent.ticket_id == ticket_id,
                      TicketEvent.tenant_id == current.tenant_id)
              .order_by(TicketEvent.created_at).all())
    return [{"id": e.id, "event_type": e.event_type, "from": e.from_value,
             "to": e.to_value, "note": e.note, "actor_id": e.actor_id,
             "at": e.created_at} for e in events]


@router.get("/{ticket_id}/suggestions")
def suggestions(ticket_id: str, current: CurrentUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id,
                                Ticket.tenant_id == current.tenant_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    from app.ai.response_generator import suggest_for_ticket
    return suggest_for_ticket(t)
