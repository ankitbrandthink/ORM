import asyncio
import logging
import threading
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.config import settings
from app.middleware.logging import LoggingMiddleware

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("orm.scheduler")

app = FastAPI(
    title="ORM CMS Platform API",
    version="1.0.0",
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins + ["http://localhost", "http://localhost:80", "http://localhost:3000"],
    allow_origin_regex=r"https://([a-z0-9-]+\.)?(facebook|instagram|twitter|x|youtube)\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(LoggingMiddleware)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root():
    return {"app": "ORM CMS Platform", "docs": "/api/v1/docs", "health": "/api/v1/health"}


# ── 60-minute background alert scheduler ─────────────────────────────────────

def _alert_scheduler_loop(interval_seconds: int = 3600):
    """
    Runs in a daemon thread. Every `interval_seconds` (default 60 min):
    - Loads all tenants that have WhatsApp alerts enabled
    - Calls _run_alert_check for each tenant
    """
    from app.database import SessionLocal
    from app.models import WhatsAppConfig
    from app.api.v1.whatsapp_alerts import _run_alert_check

    log.info(f"Alert scheduler started — checking every {interval_seconds // 60} min")
    while True:
        time.sleep(interval_seconds)
        db = SessionLocal()
        try:
            configs = db.query(WhatsAppConfig).filter(
                WhatsAppConfig.enabled == True,
                WhatsAppConfig.is_deleted == False,
            ).all()
            for cfg in configs:
                try:
                    result = _run_alert_check(db, cfg.tenant_id, cfg)
                    log.info(f"[scheduler] tenant={cfg.tenant_id[:8]}… checked={result['checked']} alerted={result['alerted']}")
                except Exception as e:
                    log.warning(f"[scheduler] tenant={cfg.tenant_id[:8]}… error: {e}")
        except Exception as e:
            log.error(f"[scheduler] DB error: {e}")
        finally:
            db.close()


def _press_ingestion_loop(interval_seconds: int = 7200):
    """Daemon thread: ingest press sources every 2 hours for all tenants."""
    from app.database import SessionLocal
    from app.models import Tenant
    from app.scrapers.press_ingestion_service import ingest_all_for_tenant

    log.info(f"Press ingestion scheduler started — running every {interval_seconds // 60} min")
    while True:
        time.sleep(interval_seconds)
        db = SessionLocal()
        try:
            tenants = db.query(Tenant).filter(Tenant.is_deleted == False).all()
            for tenant in tenants:
                try:
                    results = asyncio.run(ingest_all_for_tenant(db, tenant.id))
                    if results:
                        new_total = sum(r.get("new", 0) for r in results)
                        log.info(f"[press-scheduler] tenant={tenant.id[:8]}… sources={len(results)} new={new_total}")
                except Exception as e:
                    log.warning(f"[press-scheduler] tenant={tenant.id[:8]}… error: {e}")
        except Exception as e:
            log.error(f"[press-scheduler] DB error: {e}")
        finally:
            db.close()


@app.on_event("startup")
def startup_events():
    # Run idempotent DB migrations
    try:
        from app.db_migrations import run_migrations
        run_migrations()
    except Exception as e:
        log.error(f"[startup] Migration error: {e}")

    # Seed AI provider config from server env key so the dashboard shows it
    try:
        from app.api.v1.ai_config import seed_env_provider
        seed_env_provider()
    except Exception as e:
        log.error(f"[startup] AI provider seed error: {e}")

    # Start alert scheduler (60-min)
    t1 = threading.Thread(target=_alert_scheduler_loop, args=(3600,), daemon=True, name="alert-scheduler")
    t1.start()
    log.info("Alert scheduler thread started (60-min interval)")

    # Start press ingestion scheduler (2-hour)
    t2 = threading.Thread(target=_press_ingestion_loop, args=(7200,), daemon=True, name="press-scheduler")
    t2.start()
    log.info("Press ingestion scheduler thread started (2-hour interval)")
