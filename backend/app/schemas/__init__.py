from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


# ---- Auth ----
class LoginRequest(BaseModel):
    email: str
    password: str
    recaptcha_token: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class SignupRequest(BaseModel):
    email: str
    full_name: str


class SessionOut(BaseModel):
    id: str
    user_id: str
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    ip_address: Optional[str] = None
    device_type: Optional[str] = None
    browser: Optional[str] = None
    os: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_active: bool
    logged_in_at: Optional[str] = None
    last_active_at: Optional[str] = None
    logged_out_at: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class RegisterRequest(BaseModel):
    email: str
    full_name: str
    password: str
    roles: list[str] = ["Viewer"]


class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    roles: Optional[list[str]] = None
    password: Optional[str] = None


# ---- Generic ----
class ORMBase(BaseModel):
    model_config = {"from_attributes": True}


class UserOut(ORMBase):
    id: str
    email: str
    full_name: Optional[str] = None
    is_active: bool
    roles: list[str] = []


class ClientIn(BaseModel):
    name: str
    industry: Optional[str] = None
    logo_url: Optional[str] = None
    meta: dict = {}


class ClientOut(ORMBase):
    id: str
    name: str
    industry: Optional[str] = None
    logo_url: Optional[str] = None


class SourceIn(BaseModel):
    name: str
    kind: str = "mock"
    config: dict = {}
    is_active: bool = True


class SourceOut(ORMBase):
    id: str
    name: str
    kind: str
    is_active: bool


class MonitorIn(BaseModel):
    name: str
    client_id: Optional[str] = None
    keywords: list[str] = []
    config: dict = {}


class MonitorOut(ORMBase):
    id: str
    name: str
    is_active: bool


class ProfileIn(BaseModel):
    client_id: Optional[str] = None
    platform: str = "instagram"
    handle: Optional[str] = None
    display_name: Optional[str] = None
    profile_url: Optional[str] = None
    is_competitor: bool = False
    followers: int = 0
    total_posts: int = 0


class ProfileOut(ORMBase):
    id: str
    client_id: Optional[str] = None
    platform: str
    handle: Optional[str] = None
    display_name: Optional[str] = None
    profile_url: Optional[str] = None
    is_competitor: bool = False
    avatar_url: Optional[str] = None
    followers: int = 0
    total_posts: int = 0
    meta: dict = {}


class PostOut(ORMBase):
    id: str
    client_id: Optional[str] = None
    social_profile_id: Optional[str] = None
    source_kind: Optional[str] = None
    author: Optional[str] = None
    sampled_count: Optional[int] = None   # injected by _post_with_sentiment, not a DB column
    content: Optional[str] = None
    language: Optional[str] = None
    url: Optional[str] = None
    permalink: Optional[str] = None
    published_at: Optional[datetime] = None
    last_synced_at: Optional[datetime] = None
    metrics: dict = {}


class PostSentiment(BaseModel):
    post_id: str
    total_comments: int     # scaled to real platform total (or actual if no scaling)
    sampled_count: int = 0  # actual # of comments that were analyzed
    counts: dict
    percentages: dict
    avg_toxicity: float = 0.0
    crisis_probability: float = 0.0


class IngestLinkRequest(BaseModel):
    url: str
    client_id: Optional[str] = None
    social_profile_id: Optional[str] = None
    comments: int = 50
    narrative: Optional[str] = None


class CommentOut(ORMBase):
    id: str
    post_id: str
    author: Optional[str] = None
    content: Optional[str] = None
    language: Optional[str] = None
    published_at: Optional[datetime] = None


class Paginated(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[Any]


# ---- Tickets ----
class TicketIn(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "Medium"
    client_id: Optional[str] = None
    post_id: Optional[str] = None
    comment_id: Optional[str] = None


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None


class TicketOut(ORMBase):
    id: str
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    assignee_id: Optional[str] = None
    due_date: Optional[datetime] = None
    created_at: datetime


class AssignRequest(BaseModel):
    assignee_id: str


class EscalateRequest(BaseModel):
    reason: str


class ResolveRequest(BaseModel):
    note: Optional[str] = None


class BatchIds(BaseModel):
    ids: list[str] = []
