import httpx
import redis
from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.database import engine

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/health/services")
def health_services():
    services: dict[str, str] = {}

    # Postgres
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        services["postgres"] = "ok"
    except Exception as e:  # noqa: BLE001
        services["postgres"] = f"error: {e}"

    # Redis
    try:
        r = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        r.ping()
        services["redis"] = "ok"
    except Exception as e:  # noqa: BLE001
        services["redis"] = f"error: {e}"

    # OpenSearch
    try:
        resp = httpx.get(f"{settings.OPENSEARCH_HOST}/_cluster/health", timeout=3)
        services["opensearch"] = "ok" if resp.status_code == 200 else f"status {resp.status_code}"
    except Exception as e:  # noqa: BLE001
        services["opensearch"] = f"error: {e}"

    # MinIO
    try:
        resp = httpx.get(f"http://{settings.MINIO_ENDPOINT}/minio/health/live", timeout=3)
        services["minio"] = "ok" if resp.status_code == 200 else f"status {resp.status_code}"
    except Exception as e:  # noqa: BLE001
        services["minio"] = f"error: {e}"

    overall = "ok" if all(v == "ok" for v in services.values()) else "degraded"
    return {"status": overall, "services": services}
