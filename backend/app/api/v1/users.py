from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models import User, UserRole, Role
from app.schemas import UserOut, RegisterRequest, UserUpdate
from app.security import hash_password

router = APIRouter()


def _roles_for(db: Session, user_id: str) -> list[str]:
    rows = (db.query(Role.name).join(UserRole, UserRole.role_id == Role.id)
            .filter(UserRole.user_id == user_id).all())
    return [r[0] for r in rows]


@router.get("/me", response_model=UserOut)
def me(current: CurrentUser = Depends(get_current_user)):
    return UserOut(id=current.id, email=current.email,
                   full_name=current.user.full_name, is_active=True, roles=current.roles)


@router.get("", response_model=list[UserOut])
def list_users(current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
               db: Session = Depends(get_db)):
    users = db.query(User).filter(User.tenant_id == current.tenant_id,
                                  User.is_deleted == False).all()
    return [UserOut(id=u.id, email=u.email, full_name=u.full_name,
                    is_active=u.is_active, roles=_roles_for(db, u.id)) for u in users]


@router.post("", response_model=UserOut)
def create_user(body: RegisterRequest,
                current: CurrentUser = Depends(require_roles("CROManager")),
                db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email exists")
    u = User(tenant_id=current.tenant_id, email=body.email, full_name=body.full_name,
             hashed_password=hash_password(body.password))
    db.add(u); db.flush()
    for rn in body.roles:
        r = db.query(Role).filter(Role.name == rn).first()
        if r:
            db.add(UserRole(user_id=u.id, role_id=r.id))
    db.commit()
    return UserOut(id=u.id, email=u.email, full_name=u.full_name, is_active=True, roles=body.roles)


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: str, body: UserUpdate,
                current: CurrentUser = Depends(require_roles("CROManager")),
                db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id, User.tenant_id == current.tenant_id,
                              User.is_deleted == False).first()
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if body.email is not None and body.email != u.email:
        clash = db.query(User).filter(User.email == body.email, User.id != user_id,
                                      User.is_deleted == False).first()
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already in use")
        u.email = body.email
    if body.full_name is not None:
        u.full_name = body.full_name
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.password:
        u.hashed_password = hash_password(body.password)
    if body.roles is not None:
        db.query(UserRole).filter(UserRole.user_id == u.id).delete()
        for rn in body.roles:
            r = db.query(Role).filter(Role.name == rn).first()
            if r:
                db.add(UserRole(user_id=u.id, role_id=r.id))
    db.commit()
    return UserOut(id=u.id, email=u.email, full_name=u.full_name,
                   is_active=u.is_active, roles=_roles_for(db, u.id))


@router.delete("/{user_id}")
def delete_user(user_id: str,
                current: CurrentUser = Depends(require_roles("CROManager")),
                db: Session = Depends(get_db)):
    if user_id == current.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own account")
    u = db.query(User).filter(User.id == user_id, User.tenant_id == current.tenant_id).first()
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    u.is_deleted = True
    db.commit()
    return {"status": "deleted"}
