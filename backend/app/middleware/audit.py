"""Audit middleware — logs every non-GET API write to audit_logs automatically."""
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

log = logging.getLogger("orm.audit")

# Auth paths are explicitly logged in auth.py — skip to avoid duplicates
_AUTH_PREFIXES = ("/api/v1/auth/",)

# Human-readable descriptions keyed by action code
_DESCRIPTIONS = {
    "clients.create": "Created a new client",
    "clients.update": "Updated client details",
    "clients.delete": "Deleted a client",
    "profiles.create": "Added a social profile",
    "profiles.update": "Updated a social profile",
    "profiles.delete": "Removed a social profile",
    "posts.create": "Added a post for monitoring",
    "posts.update": "Updated a post",
    "posts.delete": "Deleted a monitored post",
    "tickets.create": "Created a support ticket",
    "tickets.update": "Updated a ticket",
    "tickets.delete": "Deleted a ticket",
    "users.create": "Created a new user",
    "users.update": "Updated user profile",
    "users.delete": "Deleted a user",
    "reports.create": "Generated a report",
    "reports.action": "Ran a report",
    "import.action": "Imported data",
    "sync.action": "Ran a manual sync",
    "social-sync.action": "Ran social sync",
    "social-sync.create": "Configured social sync",
    "social-sync.update": "Updated social sync settings",
    "press-sources.create": "Added a press source",
    "press-sources.update": "Updated a press source",
    "press-sources.delete": "Deleted a press source",
    "monitors.create": "Created a monitor",
    "monitors.update": "Updated a monitor",
    "monitors.delete": "Deleted a monitor",
    "contacts.create": "Added an alert contact",
    "contacts.update": "Updated an alert contact",
    "contacts.delete": "Removed an alert contact",
    "admin.update": "Updated admin settings",
    "admin.create": "Created admin resource",
    "connections.action": "Updated platform connection",
    "connections.create": "Added platform connection",
    "connections.delete": "Removed platform connection",
    "whatsapp.action": "Triggered WhatsApp action",
    "whatsapp.update": "Updated WhatsApp settings",
    "ai-config.action": "Updated AI configuration",
    "ai-config.update": "Updated AI configuration",
    "sources.create": "Added a data source",
    "sources.update": "Updated a data source",
    "sources.delete": "Deleted a data source",
    "analytics.action": "Ran analytics",
    "sentiment.action": "Ran sentiment analysis",
    "chat.action": "Used AI assistant",
}


def _resolve_action(method: str, path: str) -> tuple[str | None, str | None]:
    """Return (action_code, description) for a method+path pair, or (None, None) to skip."""
    if method not in ("POST", "PUT", "PATCH", "DELETE"):
        return None, None

    for prefix in _AUTH_PREFIXES:
        if path.startswith(prefix):
            return None, None

    # Strip /api/v1 prefix
    p = path
    for strip in ("/api/v1",):
        if p.startswith(strip):
            p = p[len(strip):]

    p = p.strip("/")
    parts = [x for x in p.split("/") if x]
    resource = parts[0] if parts else "unknown"
    has_id = len(parts) > 1

    verb_map = {
        "POST": "create" if not has_id else "action",
        "PUT": "update",
        "PATCH": "update",
        "DELETE": "delete",
    }
    verb = verb_map.get(method, method.lower())
    action = f"{resource}.{verb}"
    description = _DESCRIPTIONS.get(action, f"{method} /{resource}")
    return action, description


def _decode_user(request: Request) -> tuple[str | None, str | None]:
    """Extract user_id, tenant_id from Bearer JWT without raising."""
    try:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None, None
        from app.security import decode_token
        payload = decode_token(auth[7:])
        if payload:
            return payload.get("sub"), payload.get("tenant_id")
    except Exception:
        pass
    return None, None


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        action, description = _resolve_action(request.method, request.url.path)
        if not action:
            return response

        # Only log successful writes (2xx)
        if response.status_code >= 300:
            return response

        try:
            user_id, tenant_id = _decode_user(request)
            if not tenant_id:
                return response

            from app.api.v1.auth import _get_ip, _parse_user_agent
            from app.database import SessionLocal
            from app.models import AuditLog

            ip = _get_ip(request)
            ua_info = _parse_user_agent(request.headers.get("User-Agent", ""))

            # Extract target_id from path last segment if it looks like an ID
            parts = [x for x in request.url.path.split("/") if x]
            target_id = parts[-1] if parts and len(parts[-1]) > 8 else ""
            resource = action.split(".")[0]

            db = SessionLocal()
            try:
                entry = AuditLog(
                    tenant_id=tenant_id,
                    actor_id=user_id,
                    action=action,
                    target_type=resource,
                    target_id=target_id,
                    detail={
                        "description": description,
                        "method": request.method,
                        "path": request.url.path,
                        "status": response.status_code,
                        "ip": ip,
                        "device": ua_info.get("device_name"),
                        "browser": ua_info.get("browser"),
                        "os": ua_info.get("os"),
                    },
                )
                db.add(entry)
                db.commit()
            except Exception as e:
                log.warning("[audit-mw] write failed: %s", e)
                try:
                    db.rollback()
                except Exception:
                    pass
            finally:
                db.close()

        except Exception as e:
            log.debug("[audit-mw] skipped: %s", e)

        return response
