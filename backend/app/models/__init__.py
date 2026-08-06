"""SQLAlchemy ORM models for the ORM CMS platform.

All tables share: UUID PK, created_at, updated_at, is_deleted (soft delete).
All tenant-scoped tables carry tenant_id.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.orm import relationship

# Use generic types for SQLite/local dev compatibility
JSONB = JSON

class _StrUUID(String):
    """String(36) used as a cross-dialect UUID column."""
    pass

def _make_uuid_col(as_uuid=False):  # noqa: ARG001
    return _StrUUID(36)

class UUID:
    """Shim that mimics sqlalchemy.dialects.postgresql.UUID but returns String(36)."""
    def __new__(cls, as_uuid=False):
        return _StrUUID(36)

from app.database import Base


def _uuid():
    return str(uuid.uuid4())


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)


def pk():
    return Column(UUID(as_uuid=False), primary_key=True, default=_uuid)


def tenant_fk():
    return Column(UUID(as_uuid=False), ForeignKey("tenants.id"), nullable=False, index=True)


# ---------------------------------------------------------------------------
# Tenancy & identity
# ---------------------------------------------------------------------------
class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"
    id = pk()
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False)
    meta = Column(JSONB, default=dict)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id = pk()
    tenant_id = tenant_fk()
    email = Column(String(255), nullable=False, index=True)
    full_name = Column(String(255))
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    meta = Column(JSONB, default=dict)
    roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("tenant_id", "email", name="uq_user_tenant_email"),)


class Role(Base, TimestampMixin):
    __tablename__ = "roles"
    id = pk()
    name = Column(String(100), nullable=False)  # SuperAdmin, CROManager, Analyst, Client, Viewer
    description = Column(String(255))


class Permission(Base, TimestampMixin):
    __tablename__ = "permissions"
    id = pk()
    code = Column(String(100), unique=True, nullable=False)  # e.g. tickets:write
    description = Column(String(255))


class RolePermission(Base, TimestampMixin):
    __tablename__ = "role_permissions"
    id = pk()
    role_id = Column(UUID(as_uuid=False), ForeignKey("roles.id"), index=True)
    permission_id = Column(UUID(as_uuid=False), ForeignKey("permissions.id"), index=True)


class UserRole(Base, TimestampMixin):
    __tablename__ = "user_roles"
    id = pk()
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), index=True)
    role_id = Column(UUID(as_uuid=False), ForeignKey("roles.id"), index=True)
    user = relationship("User", back_populates="roles")
    role = relationship("Role")


# ---------------------------------------------------------------------------
# Clients / brands / sources
# ---------------------------------------------------------------------------
class Client(Base, TimestampMixin):
    __tablename__ = "clients"
    id = pk()
    tenant_id = tenant_fk()
    name = Column(String(255), nullable=False)
    industry = Column(String(255))
    logo_url = Column(String(512))
    meta = Column(JSONB, default=dict)


class Brand(Base, TimestampMixin):
    __tablename__ = "brands"
    id = pk()
    tenant_id = tenant_fk()
    client_id = Column(UUID(as_uuid=False), ForeignKey("clients.id"), index=True)
    name = Column(String(255), nullable=False)
    aliases = Column(JSONB, default=list)


class SocialProfile(Base, TimestampMixin):
    """A mapped social media account/page for a client (own brand or competitor)."""
    __tablename__ = "social_profiles"
    id = pk()
    tenant_id = tenant_fk()
    client_id = Column(UUID(as_uuid=False), ForeignKey("clients.id"), index=True, nullable=True)
    platform = Column(String(50), nullable=False)  # facebook, instagram, twitter, youtube, web, gmb
    handle = Column(String(255))                    # @handle or page name
    display_name = Column(String(255))
    profile_url = Column(String(1024))
    external_id = Column(String(255), index=True)
    is_competitor = Column(Boolean, default=False, index=True)
    avatar_url = Column(String(1024))
    followers = Column(Integer, default=0)
    total_posts = Column(Integer, default=0)
    meta = Column(JSONB, default=dict)


class DiscoveredInfluencer(Base, TimestampMixin):
    """Social influencer discovered via keyword search on Twitter/X and other platforms."""
    __tablename__ = "discovered_influencers"
    id = pk()
    tenant_id = tenant_fk()
    client_id = Column(UUID(as_uuid=False), ForeignKey("clients.id"), index=True, nullable=True)
    platform = Column(String(50), default="twitter")   # twitter, youtube, instagram
    handle = Column(String(255), nullable=False)
    profile_url = Column(String(500), nullable=True)
    keyword = Column(String(255), nullable=False)       # search keyword used to find this account
    stance = Column(String(20), default="Mixed")        # Pro, Anti, Mixed, Neutral
    positive_count = Column(Integer, default=0)
    negative_count = Column(Integer, default=0)
    total_posts = Column(Integer, default=0)
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    posts = relationship("DiscoveredPost", back_populates="influencer", cascade="all, delete-orphan")


class DiscoveredPost(Base, TimestampMixin):
    """A single post/tweet from a discovered influencer."""
    __tablename__ = "discovered_posts"
    id = pk()
    influencer_id = Column(UUID(as_uuid=False), ForeignKey("discovered_influencers.id"), nullable=False, index=True)
    post_url = Column(String(500), nullable=False)
    content = Column(Text, nullable=True)
    sentiment = Column(String(20), nullable=True)      # Pro, Anti, Neutral
    published_at = Column(DateTime(timezone=True), nullable=True)
    keyword = Column(String(255), nullable=True)
    influencer = relationship("DiscoveredInfluencer", back_populates="posts")


class UserSession(Base):
    """Tracks individual login sessions with device/location info."""
    __tablename__ = "user_sessions"
    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    tenant_id = Column(UUID(as_uuid=False), ForeignKey("tenants.id"), nullable=False, index=True)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    device_type = Column(String(50))   # desktop, mobile, tablet
    device_name = Column(String(150))  # e.g. "iPhone 14", "Windows PC", "Pixel 7"
    browser = Column(String(100))
    os = Column(String(100))
    country = Column(String(100))
    region = Column(String(100))
    city = Column(String(100))
    latitude = Column(Float)
    longitude = Column(Float)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    logged_in_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_active_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    logged_out_at = Column(DateTime(timezone=True))


class DataSource(Base, TimestampMixin):
    __tablename__ = "data_sources"
    id = pk()
    tenant_id = tenant_fk()
    name = Column(String(255), nullable=False)
    kind = Column(String(50), nullable=False)  # mock, rss, news_api, facebook...
    config = Column(JSONB, default=dict)
    is_active = Column(Boolean, default=True)


class SourceCredential(Base, TimestampMixin):
    __tablename__ = "source_credentials"
    id = pk()
    tenant_id = tenant_fk()
    data_source_id = Column(UUID(as_uuid=False), ForeignKey("data_sources.id"), index=True)
    secret = Column(JSONB, default=dict)


# ---------------------------------------------------------------------------
# Monitors
# ---------------------------------------------------------------------------
class Monitor(Base, TimestampMixin):
    __tablename__ = "monitors"
    id = pk()
    tenant_id = tenant_fk()
    client_id = Column(UUID(as_uuid=False), ForeignKey("clients.id"), index=True)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    config = Column(JSONB, default=dict)


class MonitorQuery(Base, TimestampMixin):
    __tablename__ = "monitor_queries"
    id = pk()
    monitor_id = Column(UUID(as_uuid=False), ForeignKey("monitors.id"), index=True)
    keyword = Column(String(255), nullable=False)
    operator = Column(String(20), default="OR")


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------
class IngestionJob(Base, TimestampMixin):
    __tablename__ = "ingestion_jobs"
    id = pk()
    tenant_id = tenant_fk()
    data_source_id = Column(UUID(as_uuid=False), ForeignKey("data_sources.id"), index=True)
    status = Column(String(50), default="pending")  # pending/running/done/failed
    stats = Column(JSONB, default=dict)


class RawDocument(Base, TimestampMixin):
    __tablename__ = "raw_documents"
    id = pk()
    tenant_id = tenant_fk()
    source_kind = Column(String(50))
    content_hash = Column(String(64), index=True)
    payload = Column(JSONB, default=dict)


# ---------------------------------------------------------------------------
# Posts / comments / entities / topics
# ---------------------------------------------------------------------------
class Post(Base, TimestampMixin):
    __tablename__ = "posts"
    id = pk()
    tenant_id = tenant_fk()
    monitor_id = Column(UUID(as_uuid=False), ForeignKey("monitors.id"), index=True, nullable=True)
    client_id = Column(UUID(as_uuid=False), ForeignKey("clients.id"), index=True, nullable=True)
    social_profile_id = Column(UUID(as_uuid=False), ForeignKey("social_profiles.id"),
                               index=True, nullable=True)
    press_source_id = Column(String(36), nullable=True, index=True)  # FK → press_sources.id
    source_kind = Column(String(50), index=True)
    external_id = Column(String(255), index=True)
    url = Column(String(1024))
    permalink = Column(String(1024))
    author = Column(String(255))
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    content = Column(Text)
    language = Column(String(20))
    published_at = Column(DateTime(timezone=True))
    metrics = Column(JSONB, default=dict)  # likes, shares, views; press: article_type/leaning/etc.
    comments = relationship("Comment", back_populates="post")


class Comment(Base, TimestampMixin):
    __tablename__ = "comments"
    id = pk()
    tenant_id = tenant_fk()
    post_id = Column(UUID(as_uuid=False), ForeignKey("posts.id"), index=True)
    external_id = Column(String(255), index=True)
    author = Column(String(255))
    author_url = Column(String(512))
    content = Column(Text)
    language = Column(String(20))
    published_at = Column(DateTime(timezone=True))
    post = relationship("Post", back_populates="comments")


class Entity(Base, TimestampMixin):
    __tablename__ = "entities"
    id = pk()
    tenant_id = tenant_fk()
    name = Column(String(255), index=True)
    kind = Column(String(50))  # person, org, brand, place


class Topic(Base, TimestampMixin):
    __tablename__ = "topics"
    id = pk()
    tenant_id = tenant_fk()
    label = Column(String(255), index=True)


class PostTopic(Base, TimestampMixin):
    __tablename__ = "post_topics"
    id = pk()
    post_id = Column(UUID(as_uuid=False), ForeignKey("posts.id"), index=True)
    topic_id = Column(UUID(as_uuid=False), ForeignKey("topics.id"), index=True)
    weight = Column(Float, default=0.0)


class PostAnalysis(Base, TimestampMixin):
    __tablename__ = "post_analysis"
    id = pk()
    tenant_id = tenant_fk()
    post_id = Column(UUID(as_uuid=False), ForeignKey("posts.id"), index=True, unique=True)
    summary = Column(Text)
    main_narrative = Column(Text)
    intent = Column(String(100))
    political_angle = Column(String(20))
    crisis_probability = Column(Float, default=0.0)
    urgency_score = Column(Float, default=0.0)
    virality_score = Column(Float, default=0.0)
    result = Column(JSONB, default=dict)


class CommentAnalysis(Base, TimestampMixin):
    __tablename__ = "comment_analysis"
    id = pk()
    tenant_id = tenant_fk()
    comment_id = Column(UUID(as_uuid=False), ForeignKey("comments.id"), index=True, unique=True)
    sentiment = Column(String(20), index=True)  # Positive/Negative/Neutral
    stance = Column(String(50))
    emotion = Column(JSONB, default=list)
    sarcasm = Column(Boolean, default=False)
    toxicity_score = Column(Float, default=0.0)
    spam_score = Column(Float, default=0.0)
    bot_probability = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    result = Column(JSONB, default=dict)


# ---------------------------------------------------------------------------
# Ticketing
# ---------------------------------------------------------------------------
class TicketCategory(Base, TimestampMixin):
    __tablename__ = "ticket_categories"
    id = pk()
    tenant_id = tenant_fk()
    name = Column(String(255), nullable=False)


class Ticket(Base, TimestampMixin):
    __tablename__ = "tickets"
    id = pk()
    tenant_id = tenant_fk()
    client_id = Column(UUID(as_uuid=False), ForeignKey("clients.id"), index=True, nullable=True)
    category_id = Column(UUID(as_uuid=False), ForeignKey("ticket_categories.id"), nullable=True)
    post_id = Column(UUID(as_uuid=False), ForeignKey("posts.id"), nullable=True)
    comment_id = Column(UUID(as_uuid=False), ForeignKey("comments.id"), nullable=True)
    title = Column(String(512), nullable=False)
    description = Column(Text)
    status = Column(String(30), default="Open", index=True)  # Open/Assigned/In Progress/Pending/Resolved/Closed
    priority = Column(String(20), default="Medium")  # Low/Medium/High/Critical
    assignee_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    meta = Column(JSONB, default=dict)


class TicketEvent(Base, TimestampMixin):
    __tablename__ = "ticket_events"
    id = pk()
    tenant_id = tenant_fk()
    ticket_id = Column(UUID(as_uuid=False), ForeignKey("tickets.id"), index=True)
    actor_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    event_type = Column(String(50))  # created/assigned/status_change/escalated/comment
    from_value = Column(String(100))
    to_value = Column(String(100))
    note = Column(Text)


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------
class ReportTemplate(Base, TimestampMixin):
    __tablename__ = "report_templates"
    id = pk()
    tenant_id = tenant_fk()
    name = Column(String(255), nullable=False)
    kind = Column(String(50))  # executive/daily/weekly/monthly
    body = Column(Text)  # jinja2 template


class ReportRun(Base, TimestampMixin):
    __tablename__ = "report_runs"
    id = pk()
    tenant_id = tenant_fk()
    template_id = Column(UUID(as_uuid=False), ForeignKey("report_templates.id"), nullable=True)
    client_id = Column(UUID(as_uuid=False), ForeignKey("clients.id"), nullable=True)
    status = Column(String(30), default="pending")
    params = Column(JSONB, default=dict)


class ReportFile(Base, TimestampMixin):
    __tablename__ = "report_files"
    id = pk()
    tenant_id = tenant_fk()
    report_run_id = Column(UUID(as_uuid=False), ForeignKey("report_runs.id"), index=True)
    object_key = Column(String(512))
    filename = Column(String(255))
    content_type = Column(String(100), default="application/pdf")


class Upload(Base, TimestampMixin):
    __tablename__ = "uploads"
    id = pk()
    tenant_id = tenant_fk()
    uploader_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    object_key = Column(String(512))
    filename = Column(String(255))
    content_type = Column(String(100))
    mapping = Column(JSONB, default=dict)
    status = Column(String(30), default="uploaded")


# ---------------------------------------------------------------------------
# Dashboards / filters / alerts
# ---------------------------------------------------------------------------
class Dashboard(Base, TimestampMixin):
    __tablename__ = "dashboards"
    id = pk()
    tenant_id = tenant_fk()
    name = Column(String(255), nullable=False)
    layout = Column(JSONB, default=dict)


class SavedFilter(Base, TimestampMixin):
    __tablename__ = "saved_filters"
    id = pk()
    tenant_id = tenant_fk()
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    name = Column(String(255))
    definition = Column(JSONB, default=dict)


class Alert(Base, TimestampMixin):
    __tablename__ = "alerts"
    id = pk()
    tenant_id = tenant_fk()
    name = Column(String(255))
    rule = Column(JSONB, default=dict)
    is_active = Column(Boolean, default=True)
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)


class WhatsAppConfig(Base, TimestampMixin):
    __tablename__ = "whatsapp_configs"
    id = pk()
    tenant_id = Column(UUID(as_uuid=False), ForeignKey("tenants.id"), nullable=False, unique=True)
    manager_phone = Column(String(30), nullable=False, default="")
    min_volume = Column(Integer, default=10)               # ignore posts with fewer comments
    cooldown_minutes = Column(Integer, default=60)         # skip repeat alert within N min
    enabled = Column(Boolean, default=True)
    # Channel: "openwa" | "twilio" (legacy) | "messagecentral"
    channel = Column(String(20), default="messagecentral")
    test_mode = Column(Boolean, default=True)
    # Twilio (legacy — kept for migration compatibility)
    twilio_account_sid = Column(String(100), nullable=True)
    twilio_auth_token = Column(String(100), nullable=True)
    twilio_from_number = Column(String(30), nullable=True)
    twilio_sandbox_number = Column(String(30), default="+14155238886")
    sandbox_join_keyword = Column(String(100), nullable=True)
    alert_phones = Column(Text, default="[]")
    # MessageCentral WhatsApp credentials
    mc_api_key = Column(String(200), nullable=True)
    mc_project_id = Column(String(50), nullable=True)   # e.g. "WA-123456"
    mc_template_id = Column(String(100), nullable=True) # template name for ORM alerts
    mc_country_code = Column(String(5), default="91")   # default recipient country code


class AlertLog(Base, TimestampMixin):
    __tablename__ = "alert_logs"
    id = pk()
    tenant_id = tenant_fk()
    post_id = Column(UUID(as_uuid=False), ForeignKey("posts.id"), nullable=True)
    alert_type = Column(String(50), default="negative_sentiment")
    neg_pct = Column(Float, default=0.0)
    total_comments = Column(Integer, default=0)
    message = Column(Text)
    whatsapp_number = Column(String(30))
    status = Column(String(20), default="pending")   # sent | failed | skipped | test
    error = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# AI / audit / flags
# ---------------------------------------------------------------------------
class AIModelConfig(Base, TimestampMixin):
    __tablename__ = "ai_model_configs"
    id = pk()
    tenant_id = tenant_fk()
    task_type = Column(String(50))  # post_analysis/comment_analysis/response_gen
    model_name = Column(String(100))
    fallback_model = Column(String(100))
    params = Column(JSONB, default=dict)


class AIInferenceLog(Base, TimestampMixin):
    __tablename__ = "ai_inference_logs"
    id = pk()
    tenant_id = tenant_fk()
    task_type = Column(String(50))
    model_name = Column(String(100))
    prompt = Column(Text)
    response = Column(Text)
    latency_ms = Column(Integer)
    success = Column(Boolean, default=True)
    error = Column(Text)


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"
    id = pk()
    tenant_id = tenant_fk()
    actor_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    action = Column(String(100))
    target_type = Column(String(100))
    target_id = Column(String(100))
    detail = Column(JSONB, default=dict)


class FeatureFlag(Base, TimestampMixin):
    __tablename__ = "feature_flags"
    id = pk()
    tenant_id = tenant_fk()
    key = Column(String(100), nullable=False)
    enabled = Column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("tenant_id", "key", name="uq_flag_tenant_key"),)


class ContactInfo(Base, TimestampMixin):
    """Alert contact — name, email, mobile, WhatsApp number, role/company."""
    __tablename__ = "contact_info"
    id = pk()
    tenant_id = tenant_fk()
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    mobile = Column(String(30), nullable=True)
    whatsapp = Column(String(30), nullable=True)   # with country code e.g. +918539076183
    role = Column(String(100), nullable=True)
    company = Column(String(255), nullable=True)
    is_primary = Column(Boolean, default=False)    # primary alert recipient
    receive_whatsapp = Column(Boolean, default=True)
    receive_email = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)


# ---------------------------------------------------------------------------
# Phase 1 — Web & Press Intelligence Layer
# ---------------------------------------------------------------------------
class PressSource(Base, TimestampMixin):
    """A configured press/news/video source for web intelligence ingestion.

    kind: 'rss' for RSS/Atom feeds, 'youtube_channel' for YT news channels.
    source_type: 'mainline_press' | 'digital_native_partisan'
    leaning: 'independent' | 'friendly' | 'hostile'  (manually set by manager)
    article_type_default: 'news' | 'opinion'  (per-article override stored in post.metrics)
    """
    __tablename__ = "press_sources"
    id = pk()
    tenant_id = tenant_fk()
    client_id = Column(UUID(as_uuid=False), ForeignKey("clients.id"), index=True, nullable=True)
    name = Column(String(255), nullable=False)
    kind = Column(String(50), nullable=False, default="rss")  # rss | youtube_channel
    url = Column(String(1024), nullable=False)                 # RSS feed URL or YT channel URL
    source_type = Column(String(50), default="mainline_press") # mainline_press | digital_native_partisan
    leaning = Column(String(20), default="independent")        # independent | friendly | hostile
    article_type_default = Column(String(20), default="news")  # news | opinion
    domestic = Column(Boolean, default=True)
    circulation = Column(Integer, nullable=True)               # print/digital reach estimate
    primary_region = Column(String(100), nullable=True)        # e.g. "Delhi NCR", "National"
    last_ingested_at = Column(DateTime(timezone=True), nullable=True)
    config = Column(JSONB, default=dict)   # max_articles, yt_api_key override, etc.
    is_active = Column(Boolean, default=True)



class ApiUsageLog(Base, TimestampMixin):
    """Per-call log of AI API token usage for billing/ceiling tracking."""
    __tablename__ = "api_usage_logs"
    id = pk()
    tenant_id = tenant_fk()
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), index=True, nullable=True)
    model = Column(String(100), nullable=False)
    operation = Column(String(100), nullable=False)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    item_count = Column(Integer, default=1)
    date = Column(String(10), nullable=False)            # YYYY-MM-DD


class AIProviderConfig(Base, TimestampMixin):
    """Tenant-level AI provider configuration — encrypted API key stored per provider."""
    __tablename__ = "ai_provider_configs"
    id = pk()
    tenant_id = tenant_fk()
    provider = Column(String(50), nullable=False)        # claude | groq | gemini | openai
    model = Column(String(100), nullable=False)
    api_key_enc = Column(Text, nullable=False)           # Fernet-encrypted key
    is_active = Column(Boolean, default=False)
    is_validated = Column(Boolean, default=False)
    daily_limit = Column(Integer, default=500_000)
    last_validated_at = Column(DateTime(timezone=True), nullable=True)
