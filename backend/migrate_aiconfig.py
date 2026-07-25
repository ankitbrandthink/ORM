"""One-time migration: create ai_provider_configs table."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from app.database import Base, engine
from app.models import AIProviderConfig  # noqa: F401
Base.metadata.create_all(bind=engine, tables=[AIProviderConfig.__table__])
print("✓ ai_provider_configs table created (or already exists)")
