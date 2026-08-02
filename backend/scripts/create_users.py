"""Create official BrandThink team users. Safe to run multiple times."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, engine, Base
from app.models import User, Tenant
from app.security import hash_password

USERS = [
    {"email": "ankit.rohilla@thebrandthink.com", "full_name": "Ankit Rohilla",   "password": "BrandThink@Ankit26"},
    {"email": "jay.vardhan@thebrandthink.com",   "full_name": "Jay Vardhan",     "password": "BrandThink@Jay26"},
]

def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).first()
        if not tenant:
            print("No tenant found — run seed.py first"); return

        for u in USERS:
            existing = db.query(User).filter_by(email=u["email"]).first()
            if existing:
                print(f"  EXISTS  {u['email']}")
                continue
            user = User(
                email=u["email"],
                full_name=u["full_name"],
                hashed_password=hash_password(u["password"]),
                tenant_id=tenant.id,
                is_active=True,
            )
            db.add(user)
            db.flush()
            print(f"  CREATED {u['email']}  pw={u['password']}")

        db.commit()
        print("\nDone.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
