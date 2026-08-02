from fastapi import APIRouter

from app.api.v1 import (
    auth, users, clients, sources, monitors, posts, comments,
    analytics, tickets, reports, admin, health, profiles, import_data, connections,
    whatsapp_alerts, contacts, sync, sentiment, social_sync, press_sources, usage, ai_config,
    sessions, training,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(clients.router, prefix="/clients", tags=["clients"])
api_router.include_router(profiles.router, prefix="/profiles", tags=["profiles"])
api_router.include_router(sources.router, prefix="/sources", tags=["sources"])
api_router.include_router(monitors.router, prefix="/monitors", tags=["monitors"])
api_router.include_router(posts.router, prefix="/posts", tags=["posts"])
api_router.include_router(comments.router, prefix="/comments", tags=["comments"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(tickets.router, prefix="/tickets", tags=["tickets"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(import_data.router, prefix="/import", tags=["import"])
api_router.include_router(connections.router, prefix="/connections", tags=["connections"])
api_router.include_router(whatsapp_alerts.router, prefix="/whatsapp", tags=["whatsapp"])
api_router.include_router(contacts.router, prefix="/contacts", tags=["contacts"])
api_router.include_router(sync.router, prefix="/sync", tags=["sync"])
api_router.include_router(sentiment.router, tags=["sentiment"])
api_router.include_router(social_sync.router, prefix="/social-sync", tags=["social-sync"])
api_router.include_router(press_sources.router, prefix="/press-sources", tags=["press-sources"])
api_router.include_router(usage.router, tags=["usage"])
api_router.include_router(ai_config.router, tags=["ai-config"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(training.router, prefix="/analytics", tags=["training"])
