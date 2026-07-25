"""
AI Provider Configuration — per-tenant encrypted key storage + validation.
Supports Claude, Groq, Gemini, OpenAI with live key validation before saving.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.ai.providers.catalog import PROVIDERS, PROVIDER_CATALOG
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import AIProviderConfig
from app.utils.crypto import decrypt_key, encrypt_key

router = APIRouter(prefix="/ai-config", tags=["ai-config"])


def seed_env_provider():
    """At startup: if a tenant has no AI provider config but the server .env has a
    valid ANTHROPIC_API_KEY, save it (encrypted) as the active Claude config so the
    dashboard reflects what the sentiment engine is actually using."""
    from app.config import settings
    from app.database import SessionLocal
    from app.models import Tenant

    if not (settings.ANTHROPIC_API_KEY and settings.ANTHROPIC_API_KEY.startswith("sk-ant")
            and all(ord(c) < 128 for c in settings.ANTHROPIC_API_KEY)):
        return
    db = SessionLocal()
    try:
        for (tid,) in db.query(Tenant.id).all():
            has_any = db.query(AIProviderConfig.id).filter(
                AIProviderConfig.tenant_id == tid).first()
            if has_any:
                continue
            db.add(AIProviderConfig(
                tenant_id=tid,
                provider="claude",
                model=settings.CLAUDE_SENTIMENT_MODEL,
                api_key_enc=encrypt_key(settings.ANTHROPIC_API_KEY),
                is_active=True,
                is_validated=True,
                daily_limit=500_000,
                last_validated_at=datetime.now(timezone.utc),
            ))
        db.commit()
    finally:
        db.close()


class ConfigRequest(BaseModel):
    provider: str
    model: str
    api_key: str
    daily_limit: int = 500_000


class ActivateRequest(BaseModel):
    provider: str
    model: str = ""


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/providers")
def list_providers():
    """Static catalog of all supported providers with models and pricing."""
    return PROVIDER_CATALOG


@router.get("/active")
def get_active(
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    config = (
        db.query(AIProviderConfig)
        .filter(AIProviderConfig.tenant_id == current.tenant_id)
        .order_by(AIProviderConfig.is_active.desc(), AIProviderConfig.created_at.desc())
        .first()
    )
    if not config:
        return {"configured": False}

    raw_key = decrypt_key(config.api_key_enc)
    return {
        "configured": True,
        "id": config.id,
        "provider": config.provider,
        "model": config.model,
        "is_active": config.is_active,
        "is_validated": config.is_validated,
        "daily_limit": config.daily_limit,
        "last_validated_at": config.last_validated_at,
        "api_key_hint": f"{'*' * max(0, len(raw_key) - 4)}{raw_key[-4:]}",
    }


@router.get("/configs")
def list_configs(
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All saved provider configs for this tenant, with masked key hints."""
    rows = (
        db.query(AIProviderConfig)
        .filter(AIProviderConfig.tenant_id == current.tenant_id)
        .order_by(AIProviderConfig.is_active.desc(), AIProviderConfig.created_at.desc())
        .all()
    )
    out = []
    for c in rows:
        raw = decrypt_key(c.api_key_enc)
        out.append({
            "id": c.id,
            "provider": c.provider,
            "model": c.model,
            "is_active": c.is_active,
            "is_validated": c.is_validated,
            "daily_limit": c.daily_limit,
            "last_validated_at": c.last_validated_at,
            "api_key_hint": f"…{raw[-4:]}" if raw else "",
        })
    return out


@router.post("/activate")
def activate_provider(
    req: ActivateRequest,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Switch the active provider to one whose key is already saved — no re-entry."""
    target = db.query(AIProviderConfig).filter(
        AIProviderConfig.tenant_id == current.tenant_id,
        AIProviderConfig.provider == req.provider,
    ).first()
    if not target:
        raise HTTPException(404, f"No saved key for provider '{req.provider}' — add one first.")

    db.query(AIProviderConfig).filter(
        AIProviderConfig.tenant_id == current.tenant_id
    ).update({"is_active": False})
    target.is_active = True
    if req.model:
        target.model = req.model
    db.commit()
    return {"activated": True, "provider": target.provider, "model": target.model}


@router.post("/validate")
async def validate_key(
    req: ConfigRequest,
    current: CurrentUser = Depends(get_current_user),
):
    """Test the API key against the provider without saving anything."""
    if req.provider not in PROVIDERS:
        raise HTTPException(400, f"Unknown provider: {req.provider}")
    ok = await PROVIDERS[req.provider].validate_key(req.api_key, req.model)
    return {"valid": ok, "provider": req.provider, "model": req.model}


@router.post("/config")
async def save_config(
    req: ConfigRequest,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Validate the API key then save encrypted as the active provider."""
    if req.provider not in PROVIDERS:
        raise HTTPException(400, f"Unknown provider: {req.provider}")

    ok = await PROVIDERS[req.provider].validate_key(req.api_key, req.model)
    if not ok:
        raise HTTPException(400, "API key validation failed — check the key and try again.")

    # Deactivate all existing configs for this tenant
    db.query(AIProviderConfig).filter(
        AIProviderConfig.tenant_id == current.tenant_id
    ).update({"is_active": False})

    # Upsert same-provider record
    existing = db.query(AIProviderConfig).filter(
        AIProviderConfig.tenant_id == current.tenant_id,
        AIProviderConfig.provider == req.provider,
    ).first()

    now = datetime.now(timezone.utc)
    if existing:
        existing.model = req.model
        existing.api_key_enc = encrypt_key(req.api_key)
        existing.is_active = True
        existing.is_validated = True
        existing.daily_limit = req.daily_limit
        existing.last_validated_at = now
    else:
        db.add(AIProviderConfig(
            tenant_id=current.tenant_id,
            provider=req.provider,
            model=req.model,
            api_key_enc=encrypt_key(req.api_key),
            is_active=True,
            is_validated=True,
            daily_limit=req.daily_limit,
            last_validated_at=now,
        ))

    db.commit()
    return {"saved": True, "provider": req.provider, "model": req.model}


@router.delete("/config")
def disconnect_provider(
    provider: str = "",
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove one provider config (?provider=groq) or all — revert to env var / heuristic."""
    q = db.query(AIProviderConfig).filter(
        AIProviderConfig.tenant_id == current.tenant_id
    )
    if provider:
        q = q.filter(AIProviderConfig.provider == provider)
    q.delete()
    db.commit()
    return {"disconnected": True, "provider": provider or "all"}
