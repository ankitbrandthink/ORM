"""Create official BrandThink team users. Safe to run multiple times.

Usage:
    ADMIN_PASSWORD=<password> python scripts/create_users.py

Passwords are never hardcoded. Set them via env vars before running.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, engine, Base
from app.models import User, Tenant
from app.security import hash_password

def _require_env(key: str) -> str:
    val = os.environ.get(key, "").strip()
    if not val:
        print(f"ERROR: set {key} env var before running this script")
        sys.exit(1)
    return val

USERS = [
    {
        "email": "ankit.rohilla@thebrandthink.com",
        "full_name": "Ankit Rohilla",
        "password_env": "ANKIT_PASSWORD",
    },
    {
        "email": "jay.vardhan@thebrandthink.com",
        "full_name": "Jay Vardhan",
        "password_env": "JAY_PASSWORD",
    },
]

def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).first()
        if not tenant:
            print("No tenant found — run seed.py first"); return

        for u in USERS:
            password = _require_env(u["password_env"])
            existing = db.query(User).filter_by(email=u["email"]).first()
            if existing:
                print(f"  EXISTS  {u['email']}")
                continue
            user = User(
                email=u["email"],
                full_name=u["full_name"],
                hashed_password=hash_password(password),
                tenant_id=tenant.id,
                is_active=True,
            )
            db.add(user)
            db.flush()
            print(f"  CREATED {u['email']}")

        db.commit()
        print("\nDone.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
