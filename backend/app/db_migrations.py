"""Idempotent DB migrations for ORM CMS.

Called once at startup. Safe to re-run — every statement is guarded.
Add new migrations at the bottom of run_migrations().
"""
import logging

from sqlalchemy import text

from app.database import engine

log = logging.getLogger("orm.migrations")


def _column_exists(conn, table: str, column: str) -> bool:
    try:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        return any(r[1] == column for r in rows)
    except Exception:
        return False


def _table_exists(conn, table: str) -> bool:
    try:
        row = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"),
            {"t": table},
        ).fetchone()
        return row is not None
    except Exception:
        return False


def run_migrations():
    """Run all pending idempotent migrations."""
    with engine.connect() as conn:
        # ── Phase 1: press_sources table ─────────────────────────────────────
        if not _table_exists(conn, "press_sources"):
            conn.execute(text("""
                CREATE TABLE press_sources (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    client_id TEXT,
                    name TEXT NOT NULL,
                    kind TEXT NOT NULL DEFAULT 'rss',
                    url TEXT NOT NULL,
                    source_type TEXT DEFAULT 'mainline_press',
                    leaning TEXT DEFAULT 'independent',
                    article_type_default TEXT DEFAULT 'news',
                    domestic INTEGER DEFAULT 1,
                    circulation INTEGER,
                    primary_region TEXT,
                    last_ingested_at TEXT,
                    config TEXT DEFAULT '{}',
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    is_deleted INTEGER DEFAULT 0
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_press_sources_tenant_id ON press_sources(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_press_sources_client_id ON press_sources(client_id)"))
            conn.commit()
            log.info("[migration] Created press_sources table")

        # ── Phase 1: posts.press_source_id column ────────────────────────────
        if not _column_exists(conn, "posts", "press_source_id"):
            conn.execute(text("ALTER TABLE posts ADD COLUMN press_source_id TEXT"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_posts_press_source_id ON posts(press_source_id)"))
            conn.commit()
            log.info("[migration] Added posts.press_source_id column")

        # ── Phase 2: api_usage_logs table ────────────────────────────────────
        if not _table_exists(conn, "api_usage_logs"):
            conn.execute(text("""
                CREATE TABLE api_usage_logs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    user_id TEXT,
                    model TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    input_tokens INTEGER DEFAULT 0,
                    output_tokens INTEGER DEFAULT 0,
                    total_tokens INTEGER DEFAULT 0,
                    cost_usd REAL DEFAULT 0.0,
                    item_count INTEGER DEFAULT 1,
                    date TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    is_deleted INTEGER DEFAULT 0
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_api_usage_tenant_date ON api_usage_logs(tenant_id, date)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_api_usage_user_id ON api_usage_logs(user_id)"))
            conn.commit()
            log.info("[migration] Created api_usage_logs table")

        # ── Phase 3: ai_provider_configs table ───────────────────────────────
        if not _table_exists(conn, "ai_provider_configs"):
            conn.execute(text("""
                CREATE TABLE ai_provider_configs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL,
                    api_key_enc TEXT NOT NULL,
                    is_active INTEGER DEFAULT 0,
                    is_validated INTEGER DEFAULT 0,
                    daily_limit INTEGER DEFAULT 500000,
                    last_validated_at TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    is_deleted INTEGER DEFAULT 0
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ai_provider_tenant ON ai_provider_configs(tenant_id)"))
            conn.commit()
            log.info("[migration] Created ai_provider_configs table")

        # ── Phase 4: performance indexes on hottest query paths ──────────────
        for stmt in [
            "CREATE INDEX IF NOT EXISTS ix_comments_post_id ON comments(post_id)",
            "CREATE INDEX IF NOT EXISTS ix_comment_analysis_comment_id ON comment_analysis(comment_id)",
            "CREATE INDEX IF NOT EXISTS ix_comment_analysis_tenant_id ON comment_analysis(tenant_id)",
            "CREATE INDEX IF NOT EXISTS ix_posts_client_created ON posts(client_id, created_at)",
            "CREATE INDEX IF NOT EXISTS ix_posts_profile_id ON posts(social_profile_id)",
            "CREATE INDEX IF NOT EXISTS ix_posts_tenant_deleted ON posts(tenant_id, is_deleted)",
            "CREATE INDEX IF NOT EXISTS ix_social_profiles_client ON social_profiles(client_id)",
            "CREATE INDEX IF NOT EXISTS ix_clients_tenant ON clients(tenant_id)",
        ]:
            try:
                conn.execute(text(stmt))
            except Exception as e:
                log.warning("[migration] index skipped: %s (%s)", stmt, e)
        conn.commit()
        log.info("[migration] Phase 4 performance indexes ensured")

        # ── Phase 5: user_sessions (device/location session tracking) ──────────
        if not _table_exists(conn, "user_sessions"):
            conn.execute(text("""
                CREATE TABLE user_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    device_type TEXT,
                    browser TEXT,
                    os TEXT,
                    country TEXT,
                    region TEXT,
                    city TEXT,
                    latitude REAL,
                    longitude REAL,
                    is_active INTEGER DEFAULT 1,
                    logged_in_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    last_active_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    logged_out_at TEXT,
                    FOREIGN KEY(user_id) REFERENCES users(id),
                    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_sessions_user_id ON user_sessions(user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_sessions_tenant_id ON user_sessions(tenant_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_sessions_is_active ON user_sessions(is_active)"))
            conn.commit()
            log.info("[migration] Phase 5 — user_sessions table created")

        # ── Phase 6: device_name column on user_sessions ─────────────────────
        if not _column_exists(conn, "user_sessions", "device_name"):
            conn.execute(text("ALTER TABLE user_sessions ADD COLUMN device_name TEXT"))
            conn.commit()
            log.info("[migration] Phase 6 — added user_sessions.device_name column")

    log.info("[migration] All migrations complete")
