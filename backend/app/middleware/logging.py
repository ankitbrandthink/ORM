import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("orm.access")


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        started = time.time()
        response = await call_next(request)
        duration = (time.time() - started) * 1000
        logger.info("%s %s -> %s (%.1fms)", request.method, request.url.path,
                    response.status_code, duration)
        response.headers["X-Process-Time-ms"] = f"{duration:.1f}"
        return response
