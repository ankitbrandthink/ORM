"""
Data import API — Google Sheets or uploaded CSV/XLSX files.

POST /import/gsheets          — import from a Google Sheets URL
POST /import/csv              — import from an uploaded CSV file
GET  /import/sheets           — list all connected Google Sheets for this tenant
POST /import/sheets           — save a Google Sheet connection (with client assignment)
DELETE /import/sheets/{id}    — remove a saved connection
POST /import/sheets/{id}/sync — re-run import for a saved connection
"""
import csv
import io
import re
import time
import uuid
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import (
    Tenant, Client, Brand, SocialProfile, Monitor, MonitorQuery,
    Post, Comment, PostAnalysis, CommentAnalysis,
)

router = APIRouter()

YEAR = 2025
COMMENTS_CAP = 100  # synthetic comments per post


# ── SQLite sheet-connections table (created on first use) ─────────────────────

def _ensure_sheets_table(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS sheet_connections (
            id          TEXT PRIMARY KEY,
            tenant_id   TEXT NOT NULL,
            client_id   TEXT,
            client_name TEXT,
            sheet_url   TEXT NOT NULL,
            sheet_name  TEXT,
            api_key     TEXT,
            last_synced_at  TEXT,
            last_sync_posts INTEGER DEFAULT 0,
            last_sync_comments INTEGER DEFAULT 0,
            last_sync_status   TEXT DEFAULT 'never',
            created_at  TEXT DEFAULT (datetime('now'))
        )
    """))
    db.commit()


def _list_sheets(db: Session, tenant_id: str) -> list[dict]:
    _ensure_sheets_table(db)
    rows = db.execute(
        text("SELECT * FROM sheet_connections WHERE tenant_id=:tid ORDER BY created_at DESC"),
        {"tid": tenant_id},
    ).fetchall()
    return [dict(r._mapping) for r in rows]


def _get_sheet(db: Session, sheet_id: str, tenant_id: str) -> dict | None:
    _ensure_sheets_table(db)
    r = db.execute(
        text("SELECT * FROM sheet_connections WHERE id=:id AND tenant_id=:tid"),
        {"id": sheet_id, "tid": tenant_id},
    ).fetchone()
    return dict(r._mapping) if r else None


def _upsert_sheet_status(db: Session, sheet_id: str, posts: int, comments: int, status: str):
    db.execute(text("""
        UPDATE sheet_connections
        SET last_synced_at=:now, last_sync_posts=:posts,
            last_sync_comments=:comments, last_sync_status=:status
        WHERE id=:id
    """), {"now": datetime.now(timezone.utc).isoformat(), "posts": posts,
           "comments": comments, "status": status, "id": sheet_id})
    db.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_int(v) -> int:
    try:
        return int(float(str(v).strip() or 0))
    except (ValueError, TypeError):
        return 0


def _norm_sent(v: str) -> str:
    v = (v or "").strip().lower()
    if "pos" in v and "neg" not in v:
        return "Positive"
    if "neg" in v and "pos" not in v:
        return "Negative"
    return "Neutral"


def _parse_date(name: str) -> datetime | None:
    d = re.sub(r"[^0-9]", "", str(name))
    try:
        if len(d) == 4:
            dd, mm = int(d[:2]), int(d[2:])
        elif len(d) == 3:
            dd, mm = int(d[:1]), int(d[1:])
        else:
            return None
        if not (1 <= mm <= 12 and 1 <= dd <= 31):
            return None
        return datetime(YEAR, mm, dd, 12, 0, tzinfo=timezone.utc)
    except (ValueError, OverflowError):
        return None


def _find_col(row: dict, *names: str) -> str:
    """Case-insensitive column lookup — tries each name in order."""
    upper_row = {k.strip().upper(): v for k, v in row.items()}
    for n in names:
        if n.upper() in upper_row:
            v = str(upper_row[n.upper()]).strip()
            if v:
                return v
    return ""


def _find_url_col(row: dict) -> str:
    """Find the first column value that looks like a social media URL."""
    for v in row.values():
        s = str(v).strip()
        if s.startswith("http") and any(x in s for x in
                ["facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "fb.com"]):
            return s
    return ""


def _get_or_create_client(db: Session, tenant_id: str, client_id: str | None,
                           client_name: str | None) -> tuple:
    """Return (client, social_profile, monitor) creating them if needed."""
    if client_id:
        client = db.query(Client).filter(Client.id == client_id,
                                         Client.tenant_id == tenant_id).first()
        if not client:
            raise HTTPException(404, f"Client {client_id} not found")
    elif client_name:
        client = db.query(Client).filter(Client.tenant_id == tenant_id,
                                         Client.name == client_name).first()
        if not client:
            client = Client(tenant_id=tenant_id, name=client_name, industry="General")
            db.add(client)
            db.flush()
            db.add(Brand(tenant_id=tenant_id, client_id=client.id, name=client_name))
    else:
        # Fallback: first client or create generic
        client = db.query(Client).filter(Client.tenant_id == tenant_id).first()
        if not client:
            client = Client(tenant_id=tenant_id, name="Imported Data", industry="General")
            db.add(client)
            db.flush()

    monitor = db.query(Monitor).filter(Monitor.tenant_id == tenant_id,
                                       Monitor.client_id == client.id).first()
    if not monitor:
        monitor = Monitor(tenant_id=tenant_id, client_id=client.id, name=f"{client.name} Monitor")
        db.add(monitor)
        db.flush()

    return client, monitor


def _import_rows(db: Session, tenant, client, monitor, rows: list[dict],
                 tab_name: str, day: datetime | None) -> tuple[int, int, int]:
    """Returns (new_posts, new_comments, skipped_duplicates)."""
    n_posts = n_comments = n_dup = 0
    published = day or datetime(YEAR, 1, 1, 12, 0, tzinfo=timezone.utc)

    for ri, row in enumerate(rows):
        # Flexible URL detection
        link = (_find_col(row, "POST LINK", "LINK", "URL", "POST URL", "FACEBOOK", "FB LINK",
                          "INSTAGRAM", "TWITTER", "YOUTUBE", "POST")
                or _find_url_col(row))
        if not link or "http" not in link:
            continue

        # Deduplicate
        if db.query(Post).filter(Post.tenant_id == tenant.id,
                                 Post.permalink == link).first():
            n_dup += 1
            continue

        psent = _norm_sent(_find_col(row, "POST SENTIMENT", "SENTIMENT", "SENT"))
        csent = _norm_sent(_find_col(row, "COMMENT SENTIMENT", "COMMENTS SENTIMENT")) or psent
        narrative = (_find_col(row, "NARRATIVE", "DESCRIPTION", "CONTENT", "CAPTION",
                               "POST CONTENT", "POST TEXT") or "(no narrative)")
        existing  = _to_int(_find_col(row, "EXISTING", "EXISTING COMMENTS", "COMMENT COUNT"))
        to_add    = _to_int(_find_col(row, "COMMENTS TO ADD", "TO ADD", "ADD"))
        real_total = (existing + to_add) or existing or 50

        # Detect platform from URL
        src = ("facebook" if "facebook.com" in link or "fb.com" in link else
               "instagram" if "instagram.com" in link else
               "twitter" if "twitter.com" in link or "x.com" in link else
               "youtube" if "youtube.com" in link else "facebook")

        post = Post(
            tenant_id=tenant.id, monitor_id=monitor.id, client_id=client.id,
            source_kind=src, external_id=f"imp-{tab_name}-{ri}",
            url=link, permalink=link, author=client.name, content=narrative,
            language="en", published_at=published, last_synced_at=published,
            metrics={"existing_comments": existing, "real_comment_total": real_total,
                     "sheet": tab_name, "source": "import"})
        db.add(post)
        db.flush()
        db.add(PostAnalysis(
            tenant_id=tenant.id, post_id=post.id,
            summary=narrative[:240], main_narrative=narrative[:240],
            intent="campaign", political_angle="medium",
            crisis_probability=0.6 if psent == "Negative" else 0.1,
            urgency_score=0.7 if psent == "Negative" else 0.2,
            virality_score=0.5,
            result={"post_sentiment": psent, "comment_sentiment": csent,
                    "real_comment_total": real_total}))
        n_posts += 1

        # Generate synthetic comment analysis rows proportional to real_total
        try:
            from app.ai.sample_comments import generate as _gen_comments
            gen = min(real_total, COMMENTS_CAP)
            seed = (ri * 131) % 99999
            crows, arows = [], []
            for comment, analysis in _gen_comments(gen, csent, published, seed):
                comment["tenant_id"] = tenant.id
                comment["post_id"] = post.id
                comment["external_id"] = f"imp-{post.external_id}-c{len(crows)}"
                analysis["tenant_id"] = tenant.id
                crows.append(comment)
                arows.append(analysis)
            if crows:
                db.bulk_insert_mappings(Comment, crows)
                db.bulk_insert_mappings(CommentAnalysis, arows)
                n_comments += len(crows)
        except Exception:
            pass  # sample comments not critical

    return n_posts, n_comments, n_dup


def _run_gsheets_import(db: Session, tenant, client, monitor,
                        spreadsheet_id: str, api_key: str) -> dict:
    """Fetch all tabs and import rows. Returns result dict."""
    if api_key:
        tab_names = _get_tabs_api(spreadsheet_id, api_key)
    else:
        tab_names = _get_tabs_gviz(spreadsheet_id)

    if not tab_names:
        raise HTTPException(400,
            "Could not read sheet tabs. Make sure the sheet is set to "
            "'Anyone with the link can view', or provide a Google Sheets API key for private sheets.")

    total_posts = total_comments = total_dup = 0
    processed_tabs = []

    for tab in tab_names:
        if str(tab).startswith("=") or "MASTER" in str(tab).upper():
            continue
        day = _parse_date(tab)
        rows = _fetch_tab_csv(spreadsheet_id, tab, api_key)
        if not rows:
            continue
        np, nc, nd = _import_rows(db, tenant, client, monitor, rows, tab, day)
        if np or nd:
            total_posts += np
            total_comments += nc
            total_dup += nd
            processed_tabs.append(tab)
        db.commit()
        time.sleep(0.1)

    return {
        "status": "ok",
        "tabs_processed": len(processed_tabs),
        "posts_imported": total_posts,
        "comments_imported": total_comments,
        "duplicates_skipped": total_dup,
        "tabs": processed_tabs,
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class GSheetsImportRequest(BaseModel):
    url: str
    api_key: str | None = None
    client_id: str | None = None
    client_name: str | None = None
    sheet_name: str | None = None  # label for the saved connection
    save_connection: bool = True   # save to connected sheets list


class SheetConnectionCreate(BaseModel):
    sheet_url: str
    sheet_name: str | None = None
    client_id: str | None = None
    client_name: str | None = None
    api_key: str | None = None


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/sheets")
def list_sheet_connections(
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all connected Google Sheets for this tenant."""
    return _list_sheets(db, current.tenant_id)


@router.post("/sheets")
def add_sheet_connection(
    body: SheetConnectionCreate,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a Google Sheet connection without running an import."""
    _ensure_sheets_table(db)
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", body.sheet_url)
    if not m:
        raise HTTPException(400, "Invalid Google Sheets URL")
    sheet_id = m.group(1)
    conn_id = str(uuid.uuid4())

    # Resolve client name if only id provided
    client_name = body.client_name
    if body.client_id and not client_name:
        c = db.query(Client).filter(Client.id == body.client_id,
                                    Client.tenant_id == current.tenant_id).first()
        client_name = c.name if c else None

    db.execute(text("""
        INSERT INTO sheet_connections (id, tenant_id, client_id, client_name, sheet_url, sheet_name, api_key)
        VALUES (:id, :tid, :cid, :cname, :url, :sname, :akey)
    """), {
        "id": conn_id, "tid": current.tenant_id,
        "cid": body.client_id, "cname": client_name,
        "url": f"https://docs.google.com/spreadsheets/d/{sheet_id}",
        "sname": body.sheet_name or f"Sheet ({sheet_id[:8]}…)",
        "akey": body.api_key,
    })
    db.commit()
    return _get_sheet(db, conn_id, current.tenant_id)


@router.delete("/sheets/{sheet_id}")
def delete_sheet_connection(
    sheet_id: str,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_sheets_table(db)
    db.execute(text("DELETE FROM sheet_connections WHERE id=:id AND tenant_id=:tid"),
               {"id": sheet_id, "tid": current.tenant_id})
    db.commit()
    return {"deleted": True}


@router.post("/sheets/{sheet_id}/sync")
def sync_sheet(
    sheet_id: str,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-import a saved Google Sheet connection."""
    conn = _get_sheet(db, sheet_id, current.tenant_id)
    if not conn:
        raise HTTPException(404, "Sheet connection not found")

    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", conn["sheet_url"])
    if not m:
        raise HTTPException(400, "Invalid sheet URL in connection")
    spreadsheet_id = m.group(1)

    tenant = db.query(Tenant).filter(Tenant.id == current.tenant_id).first()
    if not tenant:
        raise HTTPException(500, "Tenant not found")

    client, monitor = _get_or_create_client(db, current.tenant_id,
                                             conn.get("client_id"), conn.get("client_name"))

    try:
        result = _run_gsheets_import(db, tenant, client, monitor,
                                     spreadsheet_id, conn.get("api_key") or "")
        _upsert_sheet_status(db, sheet_id,
                             result["posts_imported"], result["comments_imported"], "synced")
        return result
    except HTTPException as e:
        _upsert_sheet_status(db, sheet_id, 0, 0, f"error: {e.detail}")
        raise


@router.post("/gsheets")
def import_from_gsheets(
    req: GSheetsImportRequest,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import all tabs from a Google Sheets researcher sheet."""
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", req.url)
    spreadsheet_id = m.group(1) if m else req.url.strip()
    if not re.match(r"^[a-zA-Z0-9_-]{20,}$", spreadsheet_id):
        raise HTTPException(400, "Invalid Google Sheets URL or ID")

    tenant = db.query(Tenant).filter(Tenant.id == current.tenant_id).first()
    if not tenant:
        raise HTTPException(500, "Tenant not found")

    client, monitor = _get_or_create_client(db, current.tenant_id,
                                             req.client_id, req.client_name)

    result = _run_gsheets_import(db, tenant, client, monitor,
                                 spreadsheet_id, req.api_key or "")

    # Save connection for future syncs
    if req.save_connection:
        _ensure_sheets_table(db)
        conn_id = str(uuid.uuid4())
        try:
            db.execute(text("""
                INSERT INTO sheet_connections
                    (id, tenant_id, client_id, client_name, sheet_url, sheet_name, api_key,
                     last_synced_at, last_sync_posts, last_sync_comments, last_sync_status)
                VALUES (:id, :tid, :cid, :cname, :url, :sname, :akey, :now, :posts, :comments, :status)
            """), {
                "id": conn_id, "tid": current.tenant_id,
                "cid": client.id, "cname": client.name,
                "url": f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}",
                "sname": req.sheet_name or f"Sheet ({spreadsheet_id[:8]}…)",
                "akey": req.api_key,
                "now": datetime.now(timezone.utc).isoformat(),
                "posts": result["posts_imported"],
                "comments": result["comments_imported"],
                "status": "synced",
            })
            db.commit()
            result["connection_id"] = conn_id
        except Exception:
            pass  # connection save is not critical

    return result


@router.post("/csv")
async def import_csv_upload(
    file: UploadFile = File(...),
    tab_name: str = "upload",
    client_id: str | None = None,
    client_name: str | None = None,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import from an uploaded CSV file."""
    content = await file.read()
    try:
        text_data = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text_data = content.decode("latin-1")

    lines = text_data.splitlines()
    # Find the header row (first row that has any URL-like content OR column keywords)
    header_idx = 0
    for i, line in enumerate(lines):
        upper = line.upper()
        if any(k in upper for k in ("POST LINK", "LINK", "URL", "FACEBOOK", "HTTP")):
            header_idx = i
            break

    csv_text = "\n".join(lines[header_idx:])
    reader = csv.DictReader(io.StringIO(csv_text))
    rows = list(reader)

    if not rows:
        raise HTTPException(400, "No data rows found in CSV. Make sure the file has column headers.")

    tenant = db.query(Tenant).filter(Tenant.id == current.tenant_id).first()
    if not tenant:
        raise HTTPException(500, "Tenant not found")

    client, monitor = _get_or_create_client(db, current.tenant_id, client_id, client_name)

    day = _parse_date(tab_name)
    np, nc, nd = _import_rows(db, tenant, client, monitor, rows, tab_name, day)
    db.commit()

    return {
        "status": "ok",
        "posts_imported": np,
        "comments_imported": nc,
        "duplicates_skipped": nd,
    }


# ── Google Sheets helpers ─────────────────────────────────────────────────────

def _get_tabs_gviz(spreadsheet_id: str) -> list[str]:
    url = f"https://spreadsheets.google.com/feeds/worksheets/{spreadsheet_id}/public/basic?alt=json"
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            import json
            data = json.loads(r.read())
            return [e["title"]["$t"] for e in data.get("feed", {}).get("entry", [])]
    except Exception:
        return []


def _get_tabs_api(spreadsheet_id: str, api_key: str) -> list[str]:
    url = (f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
           f"?key={urllib.parse.quote(api_key)}&fields=sheets.properties.title")
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            import json
            data = json.loads(r.read())
            return [s["properties"]["title"] for s in data.get("sheets", [])]
    except Exception:
        return []


def _fetch_tab_csv(spreadsheet_id: str, sheet_name: str, api_key: str = "") -> list[dict] | None:
    if api_key:
        return _fetch_tab_api(spreadsheet_id, sheet_name, api_key)
    enc = urllib.parse.quote(sheet_name)
    url = (f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}"
           f"/gviz/tq?tqx=out:csv&sheet={enc}&range=A1:P500")
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            content = r.read().decode("utf-8")
            reader = csv.DictReader(io.StringIO(content))
            rows = list(reader)
            # Find header row with meaningful columns if the first row is blank
            if rows and not any(str(v).strip() for v in list(rows[0].values())[:3]):
                return rows[1:]
            return rows
    except Exception:
        return None


def _fetch_tab_api(spreadsheet_id: str, sheet_name: str, api_key: str) -> list[dict] | None:
    enc = urllib.parse.quote(f"{sheet_name}!A1:P500")
    url = (f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
           f"/values/{enc}?key={urllib.parse.quote(api_key)}")
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            import json
            data = json.loads(r.read())
            values = data.get("values", [])
            if len(values) < 2:
                return []
            header_row = 0
            for i, row in enumerate(values):
                if any(any(k in str(c).upper() for k in
                           ("LINK", "URL", "POST", "FACEBOOK")) for c in row):
                    header_row = i
                    break
            headers = [str(h).strip() for h in values[header_row]]
            rows = []
            for row in values[header_row + 1:]:
                padded = list(row) + [""] * (len(headers) - len(row))
                rows.append(dict(zip(headers, padded)))
            return rows
    except Exception:
        return None
