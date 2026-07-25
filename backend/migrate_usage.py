"""
One-time migration: create api_usage_logs table.
Run: python migrate_usage.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from app.database import Base, engine
from app.models import ApiUsageLog  # noqa: F401 — registers the model

Base.metadata.create_all(bind=engine, tables=[ApiUsageLog.__table__])
print("✓ api_usage_logs table created (or already exists)")
