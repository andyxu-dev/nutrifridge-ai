#!/usr/bin/env python3
"""
Knowledge base ingestion script.

Usage:
  cd backend
  source ../venv/bin/activate
  python ingest_knowledge.py            # skips already-ingested sources
  python ingest_knowledge.py --force    # re-ingests everything
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import assistant  # noqa: F401 — registers the tables
from app.database import Base, engine

# Ensure tables exist
Base.metadata.create_all(bind=engine)

from app.routers.assistant import ingest_knowledge_base

force = "--force" in sys.argv

db = SessionLocal()
try:
    result = ingest_knowledge_base(db, force=force)
    print(f"\nKnowledge base ingestion result:")
    print(f"  Status:          {result['status']}")
    print(f"  Sources added:   {result['sources_ingested']}")
    print(f"  Chunks added:    {result['chunks_ingested']}")
    print(f"  Sources skipped: {result['sources_skipped']}")
    print(f"  Message:         {result['message']}")
    if result["status"] == "error":
        sys.exit(1)
finally:
    db.close()
