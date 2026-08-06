"""Press & Web Intelligence source management API (Phase 1).

Endpoints:
  GET    /press-sources           — list sources (optionally filter by client_id)
  POST   /press-sources           — create a source (max 25 per client)
  GET    /press-sources/{id}      — get one source
  PUT    /press-sources/{id}      — update a source
  DELETE /press-sources/{id}      — soft-delete
  POST   /press-sources/{id}/ingest     — trigger ingestion for one source
  POST   /press-sources/ingest-all      — trigger ingestion for all tenant sources
  GET    /press-sources/youtube-quota   — current YT API quota state
"""
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models import PressSource

log = logging.getLogger("orm.press_sources")
router = APIRouter()

_MAX_SOURCES_PER_CLIENT = 25


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class PressSourceIn(BaseModel):
    name: str
    kind: str = "rss"                        # rss | youtube_channel
    url: str
    client_id: Optional[str] = None
    source_type: str = "mainline_press"      # mainline_press | digital_native_partisan
    leaning: str = "independent"             # independent | friendly | hostile
    article_type_default: str = "news"       # news | opinion
    domestic: bool = True
    circulation: Optional[int] = None
    primary_region: Optional[str] = None
    config: dict = {}
    is_active: bool = True


class PressSourceOut(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    name: str
    kind: str
    url: str
    client_id: Optional[str] = None
    source_type: str
    leaning: str
    article_type_default: str
    domestic: bool
    circulation: Optional[int] = None
    primary_region: Optional[str] = None
    config: dict = {}
    is_active: bool
    last_ingested_at: Optional[str] = None

    @classmethod
    def from_orm(cls, obj):
        d = {
            "id": obj.id,
            "name": obj.name,
            "kind": obj.kind,
            "url": obj.url,
            "client_id": obj.client_id,
            "source_type": obj.source_type,
            "leaning": obj.leaning,
            "article_type_default": obj.article_type_default,
            "domestic": bool(obj.domestic),
            "circulation": obj.circulation,
            "primary_region": obj.primary_region,
            "config": obj.config or {},
            "is_active": bool(obj.is_active),
            "last_ingested_at": obj.last_ingested_at.isoformat() if obj.last_ingested_at else None,
        }
        return cls(**d)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_source(source_id: str, tenant_id: str, db: Session) -> PressSource:
    s = db.query(PressSource).filter(
        PressSource.id == source_id,
        PressSource.tenant_id == tenant_id,
        PressSource.is_deleted == False,
    ).first()
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Press source not found")
    return s


def _count_active_sources(client_id: str, tenant_id: str, db: Session) -> int:
    return db.query(PressSource).filter(
        PressSource.tenant_id == tenant_id,
        PressSource.client_id == client_id,
        PressSource.is_active == True,
        PressSource.is_deleted == False,
    ).count()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[PressSourceOut])
def list_press_sources(
    client_id: Optional[str] = Query(None),  # kept for backward compat but no longer filters
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return ALL active press sources for the tenant.

    Sources are now tenant-wide; article counts per client are obtained via
    /analytics/press-source-stats?client_id=X rather than filtering sources here.
    """
    sources = db.query(PressSource).filter(
        PressSource.tenant_id == current.tenant_id,
        PressSource.is_deleted == False,
    ).order_by(PressSource.created_at.desc()).all()
    return [PressSourceOut.from_orm(s) for s in sources]


@router.post("", response_model=PressSourceOut)
def create_press_source(
    body: PressSourceIn,
    current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
    db: Session = Depends(get_db),
):
    if body.client_id:
        count = _count_active_sources(body.client_id, current.tenant_id, db)
        if count >= _MAX_SOURCES_PER_CLIENT:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Client already has {_MAX_SOURCES_PER_CLIENT} active press sources (max limit).",
            )

    s = PressSource(
        tenant_id=current.tenant_id,
        **body.model_dump(),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    log.info(f"[press] Created source: {s.name} ({s.kind}) for tenant {current.tenant_id[:8]}…")
    return PressSourceOut.from_orm(s)


@router.get("/youtube-quota")
def youtube_quota(current: CurrentUser = Depends(get_current_user)):
    from app.scrapers.youtube_adapter import get_youtube_quota
    return get_youtube_quota()


@router.post("/ingest-all")
async def ingest_all_sources(
    background_tasks: BackgroundTasks,
    current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
    db: Session = Depends(get_db),
):
    """Trigger ingestion for all active press sources for this tenant (background).

    With 50+ sources, synchronous execution would exceed the nginx/proxy timeout (~60 s).
    We return 200 immediately and let the ingestion run in a background task.
    """
    from app.scrapers.press_ingestion_service import ingest_all_for_tenant
    from app.database import SessionLocal

    tenant_id = current.tenant_id

    # Count how many sources will be processed so the UI can show a meaningful message
    from app.models import PressSource as PS
    source_count = db.query(PS).filter(
        PS.tenant_id == tenant_id,
        PS.is_active == True,
        PS.is_deleted == False,
    ).count()

    async def _run_ingest():
        bg_db = SessionLocal()
        try:
            await ingest_all_for_tenant(bg_db, tenant_id)
        except Exception as e:
            log.error(f"[press] background ingest-all error: {e}")
        finally:
            bg_db.close()

    background_tasks.add_task(_run_ingest)
    return {
        "status": "queued",
        "sources_queued": source_count,
        "message": f"Ingestion started for {source_count} sources. Refresh in a few minutes.",
    }


@router.get("/suggestions")
def media_suggestions_route(
    category: Optional[str] = Query(None),
    kind: Optional[str] = Query(None),
    current: CurrentUser = Depends(get_current_user),
):
    """Return curated Indian media RSS / YouTube library for bulk import."""
    sources = _INDIAN_MEDIA_LIBRARY
    if category:
        sources = [s for s in sources if s["category"] == category]
    if kind:
        sources = [s for s in sources if s["kind"] == kind]
    return {
        "categories": _MEDIA_CATEGORIES,
        "total": len(sources),
        "sources": sources,
    }


@router.get("/{source_id}", response_model=PressSourceOut)
def get_press_source(
    source_id: str,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return PressSourceOut.from_orm(_get_source(source_id, current.tenant_id, db))


@router.put("/{source_id}", response_model=PressSourceOut)
def update_press_source(
    source_id: str,
    body: PressSourceIn,
    current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
    db: Session = Depends(get_db),
):
    s = _get_source(source_id, current.tenant_id, db)
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return PressSourceOut.from_orm(s)


@router.delete("/{source_id}")
def delete_press_source(
    source_id: str,
    current: CurrentUser = Depends(require_roles("CROManager")),
    db: Session = Depends(get_db),
):
    s = _get_source(source_id, current.tenant_id, db)
    s.is_deleted = True
    s.is_active = False
    db.commit()
    return {"status": "deleted"}


@router.post("/rematch-client/{client_id}")
async def rematch_for_client(
    client_id: str,
    current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
    db: Session = Depends(get_db),
):
    """Retroactively match existing press articles to a specific client by keyword."""
    from app.models import Client
    from app.scrapers.press_ingestion_service import rematch_existing_articles_for_client

    client = db.query(Client).filter(
        Client.id == client_id,
        Client.tenant_id == current.tenant_id,
    ).first()
    if not client:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")

    try:
        result = rematch_existing_articles_for_client(db, current.tenant_id, client_id, client.name)
        return {"status": "ok", **result}
    except Exception as e:
        log.error(f"[press] rematch-client error ({client_id}): {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))


@router.post("/rematch-all-clients")
async def rematch_all_clients(
    current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
    db: Session = Depends(get_db),
):
    """Retroactively match all existing press articles to all clients."""
    from app.models import Client
    from app.scrapers.press_ingestion_service import rematch_existing_articles_for_client

    clients = db.query(Client).filter(Client.tenant_id == current.tenant_id).all()
    total_created = 0
    results = []
    for c in clients:
        try:
            r = rematch_existing_articles_for_client(db, current.tenant_id, c.id, c.name)
            total_created += r.get("created", 0)
            results.append(r)
        except Exception as e:
            results.append({"client_id": c.id, "client_name": c.name, "error": str(e)})

    return {"status": "ok", "total_created": total_created, "clients": results}


@router.post("/{source_id}/ingest")
async def ingest_one_source(
    source_id: str,
    current: CurrentUser = Depends(require_roles("CROManager", "Analyst")),
    db: Session = Depends(get_db),
):
    """Trigger ingestion for a single press source immediately."""
    from app.scrapers.press_ingestion_service import ingest_rss_source, ingest_youtube_channel_source

    from app.models import Client
    s = _get_source(source_id, current.tenant_id, db)
    all_clients = db.query(Client).filter(Client.tenant_id == current.tenant_id).all()
    try:
        if s.kind == "rss":
            result = await ingest_rss_source(db, s, current.tenant_id, all_clients)
        elif s.kind == "youtube_channel":
            result = await ingest_youtube_channel_source(db, s, current.tenant_id, all_clients)
        else:
            result = {"status": "unknown_kind", "new": 0}
        return result
    except Exception as e:
        log.error(f"[press] ingest-one error ({source_id}): {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))


# ── Curated Indian Media Library ──────────────────────────────────────────────

_INDIAN_MEDIA_LIBRARY = [
    # ─── National English ────────────────────────────────────────
    {"name": "Times of India", "kind": "rss", "url": "https://timesofindia.indiatimes.com/rssfeedstopstories.cms", "category": "National English", "source_type": "mainline_press", "leaning": "independent", "circulation": 2800000, "primary_region": "Pan-India", "domestic": True},
    {"name": "Hindustan Times", "kind": "rss", "url": "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", "category": "National English", "source_type": "mainline_press", "leaning": "independent", "circulation": 1100000, "primary_region": "Pan-India", "domestic": True},
    {"name": "NDTV — India", "kind": "rss", "url": "https://feeds.feedburner.com/ndtvnews-india-news", "category": "National English", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "The Hindu", "kind": "rss", "url": "https://www.thehindu.com/news/national/?service=rss", "category": "National English", "source_type": "mainline_press", "leaning": "independent", "circulation": 1400000, "primary_region": "South India", "domestic": True},
    {"name": "Indian Express", "kind": "rss", "url": "https://indianexpress.com/section/india/feed/", "category": "National English", "source_type": "mainline_press", "leaning": "independent", "circulation": 740000, "primary_region": "Pan-India", "domestic": True},
    {"name": "India Today", "kind": "rss", "url": "https://www.indiatoday.in/rss/home", "category": "National English", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "News18 India", "kind": "rss", "url": "https://www.news18.com/rss/india.xml", "category": "National English", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "Republic World", "kind": "rss", "url": "https://www.republicworld.com/rss/india-news.xml", "category": "National English", "source_type": "digital_native_partisan", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "The Wire", "kind": "rss", "url": "https://thewire.in/feed", "category": "National English", "source_type": "digital_native_partisan", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "Scroll.in", "kind": "rss", "url": "https://scroll.in/feed", "category": "National English", "source_type": "digital_native_partisan", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "The Print", "kind": "rss", "url": "https://theprint.in/feed/", "category": "National English", "source_type": "digital_native_partisan", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "LiveMint", "kind": "rss", "url": "https://www.livemint.com/rss/news", "category": "National English", "source_type": "mainline_press", "leaning": "independent", "circulation": 380000, "primary_region": "Pan-India", "domestic": True},
    {"name": "Economic Times", "kind": "rss", "url": "https://economictimes.indiatimes.com/rssfeedstopstories.cms", "category": "National English", "source_type": "mainline_press", "leaning": "independent", "circulation": 830000, "primary_region": "Pan-India", "domestic": True},
    {"name": "Business Standard", "kind": "rss", "url": "https://www.business-standard.com/rss/home_page_top_stories.rss", "category": "National English", "source_type": "mainline_press", "leaning": "independent", "circulation": 220000, "primary_region": "Pan-India", "domestic": True},
    # ─── Hindi National ──────────────────────────────────────────
    {"name": "Dainik Bhaskar", "kind": "rss", "url": "https://www.bhaskar.com/rss-feed/1061/", "category": "Hindi National", "source_type": "mainline_press", "leaning": "independent", "circulation": 4400000, "primary_region": "North India", "domestic": True},
    {"name": "Amar Ujala", "kind": "rss", "url": "https://www.amarujala.com/rss/india-news.xml", "category": "Hindi National", "source_type": "mainline_press", "leaning": "independent", "circulation": 2900000, "primary_region": "North India", "domestic": True},
    {"name": "Navbharat Times", "kind": "rss", "url": "https://navbharattimes.indiatimes.com/rssfeedstopstories.cms", "category": "Hindi National", "source_type": "mainline_press", "leaning": "independent", "circulation": 1500000, "primary_region": "North India", "domestic": True},
    {"name": "Jagran", "kind": "rss", "url": "https://www.jagran.com/rss/news-national.xml", "category": "Hindi National", "source_type": "mainline_press", "leaning": "independent", "circulation": 3500000, "primary_region": "UP & Bihar", "domestic": True},
    {"name": "Livehindustan", "kind": "rss", "url": "https://www.livehindustan.com/rss/national.xml", "category": "Hindi National", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "North India", "domestic": True},
    {"name": "ABP Live Hindi", "kind": "rss", "url": "https://hindi.abplive.com/rss/national.xml", "category": "Hindi National", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "Zee News Hindi", "kind": "rss", "url": "https://zeenews.india.com/hindi/rss/india.xml", "category": "Hindi National", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    # ─── TV Channels (YouTube) ───────────────────────────────────
    {"name": "NDTV (YouTube)", "kind": "youtube_channel", "url": "https://www.youtube.com/@ndtv", "category": "TV News", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "ABP News (YouTube)", "kind": "youtube_channel", "url": "https://www.youtube.com/@abpnewstv", "category": "TV News", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "Aaj Tak (YouTube)", "kind": "youtube_channel", "url": "https://www.youtube.com/@aajtak", "category": "TV News", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "Zee News (YouTube)", "kind": "youtube_channel", "url": "https://www.youtube.com/@zeenews", "category": "TV News", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "India TV (YouTube)", "kind": "youtube_channel", "url": "https://www.youtube.com/@indiatv", "category": "TV News", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "Republic TV (YouTube)", "kind": "youtube_channel", "url": "https://www.youtube.com/@RepublicWorld", "category": "TV News", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "News18 India (YouTube)", "kind": "youtube_channel", "url": "https://www.youtube.com/@News18India", "category": "TV News", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    # ─── Regional ────────────────────────────────────────────────
    {"name": "Deccan Herald", "kind": "rss", "url": "https://www.deccanherald.com/rss-feed/national.rss", "category": "Regional", "source_type": "mainline_press", "leaning": "independent", "circulation": 220000, "primary_region": "Karnataka", "domestic": True},
    {"name": "The Telegraph (Bengal)", "kind": "rss", "url": "https://www.telegraphindia.com/feeds/rss/nation.xml", "category": "Regional", "source_type": "mainline_press", "leaning": "independent", "circulation": 490000, "primary_region": "West Bengal", "domestic": True},
    {"name": "Mathrubhumi (Kerala)", "kind": "rss", "url": "https://www.mathrubhumi.com/rss/national.xml", "category": "Regional", "source_type": "mainline_press", "leaning": "independent", "circulation": 820000, "primary_region": "Kerala", "domestic": True},
    {"name": "Dinamalar (Tamil Nadu)", "kind": "rss", "url": "https://www.dinamalar.com/rss-feeds.asp", "category": "Regional", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Tamil Nadu", "domestic": True},
    {"name": "Sakshi (Andhra)", "kind": "rss", "url": "https://www.sakshi.com/rss", "category": "Regional", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Andhra Pradesh", "domestic": True},
    {"name": "Eenadu", "kind": "rss", "url": "https://www.eenadu.net/rss/national.xml", "category": "Regional", "source_type": "mainline_press", "leaning": "independent", "circulation": 1650000, "primary_region": "Andhra / Telangana", "domestic": True},
    {"name": "Maharashtra Times", "kind": "rss", "url": "https://maharashtratimes.com/rssfeedstopstories.cms", "category": "Regional", "source_type": "mainline_press", "leaning": "independent", "circulation": None, "primary_region": "Maharashtra", "domestic": True},
    {"name": "Punjab Kesari", "kind": "rss", "url": "https://www.punjabkesari.in/rss/national.xml", "category": "Regional", "source_type": "mainline_press", "leaning": "independent", "circulation": 940000, "primary_region": "Punjab / Haryana", "domestic": True},
    # ─── Official / Government ───────────────────────────────────
    {"name": "PIB India (Press Release)", "kind": "rss", "url": "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3", "category": "Official", "source_type": "mainline_press", "leaning": "friendly", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "MyGov India", "kind": "rss", "url": "https://www.mygov.in/rss/initiatives/", "category": "Official", "source_type": "mainline_press", "leaning": "friendly", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    # ─── Digital & Political ─────────────────────────────────────
    {"name": "OpIndia", "kind": "rss", "url": "https://www.opindia.com/feed/", "category": "Digital & Political", "source_type": "digital_native_partisan", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "NewsLaundry", "kind": "rss", "url": "https://www.newslaundry.com/feed", "category": "Digital & Political", "source_type": "digital_native_partisan", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "Firstpost", "kind": "rss", "url": "https://www.firstpost.com/rss/india.xml", "category": "Digital & Political", "source_type": "digital_native_partisan", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
    {"name": "Swarajya", "kind": "rss", "url": "https://swarajyamag.com/feed", "category": "Digital & Political", "source_type": "digital_native_partisan", "leaning": "independent", "circulation": None, "primary_region": "Pan-India", "domestic": True},
]

_MEDIA_CATEGORIES = sorted({s["category"] for s in _INDIAN_MEDIA_LIBRARY})


