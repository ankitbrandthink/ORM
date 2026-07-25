from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from app.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
_kwargs: dict = {"future": True}
if _is_sqlite:
    _kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
else:
    _kwargs["pool_pre_ping"] = True

engine = create_engine(settings.DATABASE_URL, **_kwargs)

if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(conn, _rec):
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
