import io
import os
import re
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Optional

import httpx
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import (
    Client, Comment, CommentAnalysis, Post, PostAnalysis,
    ReportRun, ReportFile, Upload, WhatsAppConfig, SocialProfile,
)

WA_SERVICE_URL = os.getenv("WA_SERVICE_URL", "http://localhost:3002")
WA_SECRET = os.getenv("WA_SECRET", "orm-wa-secret-change-me")

_STOP = {
    "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
    "from","is","was","are","were","be","been","has","have","had","do","does","did",
    "will","would","could","should","may","might","this","that","these","those","it",
    "its","i","we","you","he","she","they","them","their","our","your","my","his",
    "her","as","so","if","not","no","what","when","who","which","how","all","also",
    "just","more","can","than","then","there","up","out","about","after","before",
    "into","s","t","re","ve","ll","don","won","get","got","like","go","went","said",
    "say","one","two","know","see","make","time","way","good","new","first","last",
    "long","great","little","own","right","big","high","need","years","come","people",
    "us","very","over","even","back","same","much","am","me","him","any","only",
    "some","such","each","most","other","many","because","while","through","during",
    "between","against","without","already","well","still","again","off","down",
    "things","thing","take","give","keep","let","put","seem","turn","show","try",
    "ask","mean","become","leave","feel","call","help","start","every","under",
}
from app.schemas import BatchIds
from app.services.storage import get_storage
from app.services.report_generator import (
    build_report_data, generate_report_pdf, generate_report_csv, generate_report_xlsx,
)

router = APIRouter()

VALID_KINDS = {"executive", "daily", "weekly", "monthly"}


@router.post("/upload")
async def upload_report(file: UploadFile = File(...),
                        current: CurrentUser = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    data = await file.read()
    columns = []
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(data))
        else:
            df = pd.read_excel(io.BytesIO(data))
        columns = list(df.columns)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Could not parse file: {e}")

    storage = get_storage()
    key = f"uploads/{current.tenant_id}/{file.filename}"
    storage.put(key, data, file.content_type or "application/octet-stream")

    up = Upload(tenant_id=current.tenant_id, uploader_id=current.id, object_key=key,
                filename=file.filename, content_type=file.content_type,
                mapping={"columns": columns}, status="uploaded")
    db.add(up); db.commit(); db.refresh(up)
    return {"id": up.id, "filename": up.filename, "columns": columns, "rows": len(df)}


@router.post("/generate")
def generate(current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db),
             client_id: str | None = None, kind: str = "executive",
             date_from: str | None = None, date_to: str | None = None):
    if kind not in VALID_KINDS:
        raise HTTPException(400, f"kind must be one of {sorted(VALID_KINDS)}")
    params: dict = {"kind": kind}
    if date_from: params["date_from"] = date_from
    if date_to:   params["date_to"]   = date_to
    run = ReportRun(tenant_id=current.tenant_id, client_id=client_id,
                    status="running", params=params)
    db.add(run); db.flush()
    pdf_bytes = generate_report_pdf(db, current.tenant_id, kind=kind, client_id=client_id)
    storage = get_storage()
    key = f"reports/{current.tenant_id}/{run.id}.pdf"
    storage.put(key, pdf_bytes, "application/pdf")
    rf = ReportFile(tenant_id=current.tenant_id, report_run_id=run.id, object_key=key,
                    filename=f"report-{kind}.pdf")
    run.status = "done"
    db.add(rf); db.commit(); db.refresh(run)
    return {"id": run.id, "status": run.status, "file_id": rf.id, "kind": kind}


class _SentimentReportRequest(BaseModel):
    client_id: str
    date_from: Optional[str] = None
    date_to:   Optional[str] = None


@router.post("/sentiment-report")
def sentiment_report(body: _SentimentReportRequest,
                     current: CurrentUser = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    """Generate a daily-format sentiment report for a client + optional date range.
    Returns JSON with daily breakdown, per-account, totals — used by print/download."""
    client = (db.query(Client)
              .filter(Client.id == body.client_id, Client.tenant_id == current.tenant_id)
              .first())
    if not client:
        raise HTTPException(404, "Client not found")

    post_ids = _post_ids_for_client(db, body.client_id)

    # Comment sentiment filtered by dates — group by DATE (first 10 chars) not full timestamp
    date_expr = func.substr(Comment.published_at, 1, 10)
    base_q = (db.query(date_expr, CommentAnalysis.sentiment, func.count())
              .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
              .filter(Comment.post_id.in_(post_ids) if post_ids else Comment.post_id.is_(None),
                      CommentAnalysis.is_deleted == False))
    if body.date_from:
        base_q = base_q.filter(Comment.published_at >= body.date_from)
    if body.date_to:
        base_q = base_q.filter(Comment.published_at <= body.date_to + " 23:59:59")
    rows = base_q.group_by(date_expr, CommentAnalysis.sentiment).order_by(date_expr).all()

    by_date: dict = defaultdict(lambda: {"Positive": 0, "Negative": 0, "Neutral": 0})
    for dk, sent, cnt in rows:
        by_date[dk or "unknown"][sent or "Neutral"] += cnt

    daily = []
    totals = {"Positive": 0, "Negative": 0, "Neutral": 0}
    for date, counts in sorted(by_date.items()):
        tot = sum(counts.values()) or 1
        daily.append({
            "date": date,
            "positive": counts["Positive"], "negative": counts["Negative"],
            "neutral": counts["Neutral"], "total": sum(counts.values()),
            "positive_pct": round(counts["Positive"] * 100 / tot),
            "negative_pct": round(counts["Negative"] * 100 / tot),
            "neutral_pct":  round(counts["Neutral"]  * 100 / tot),
        })
        for k in totals: totals[k] += counts[k]

    grand = sum(totals.values()) or 1

    # Per-account breakdown
    profiles = (db.query(SocialProfile)
                .filter(SocialProfile.client_id == body.client_id)
                .order_by(SocialProfile.platform).all())
    accounts = []
    for prof in profiles:
        prof_post_ids = [r for (r,) in
            db.query(Post.id).filter(Post.social_profile_id == prof.id, Post.is_deleted == False).all()]
        if not prof_post_ids: continue
        pq = (db.query(CommentAnalysis.sentiment, func.count())
              .join(Comment, Comment.id == CommentAnalysis.comment_id)
              .filter(Comment.post_id.in_(prof_post_ids), CommentAnalysis.is_deleted == False))
        if body.date_from: pq = pq.filter(Comment.published_at >= body.date_from)
        if body.date_to:   pq = pq.filter(Comment.published_at <= body.date_to + " 23:59:59")
        ps = {"Positive": 0, "Negative": 0, "Neutral": 0}
        for s, c in pq.group_by(CommentAnalysis.sentiment).all():
            ps[s or "Neutral"] = c
        ptotal = sum(ps.values()) or 1
        accounts.append({
            "platform": prof.platform, "handle": prof.handle or prof.display_name or "",
            "posts": len(prof_post_ids), "comments": ptotal, "sentiment": ps,
            "positive_pct": round(ps["Positive"] * 100 / ptotal),
            "negative_pct": round(ps["Negative"] * 100 / ptotal),
            "neutral_pct":  round(ps["Neutral"]  * 100 / ptotal),
        })

    return {
        "client": {"id": client.id, "name": client.name, "industry": client.industry or ""},
        "date_from": body.date_from, "date_to": body.date_to,
        "daily": daily, "total_days": len(daily),
        "totals": totals,
        "positive_pct": round(totals["Positive"] * 100 / grand),
        "negative_pct": round(totals["Negative"] * 100 / grand),
        "neutral_pct":  round(totals["Neutral"]  * 100 / grand),
        "grand_total": sum(totals.values()),
        "accounts": accounts,
        "generated_at": datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC"),
    }


@router.get("")
def list_reports(current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    runs = db.query(ReportRun).filter(ReportRun.tenant_id == current.tenant_id,
                                      ReportRun.is_deleted == False) \
             .order_by(ReportRun.created_at.desc()).all()
    return [{"id": r.id, "kind": (r.params or {}).get("kind", "executive"), "status": r.status,
             "client_id": r.client_id, "created_at": r.created_at} for r in runs]


def _kind_of(run: ReportRun) -> str:
    return (run.params or {}).get("kind", "executive")


@router.get("/{report_id}/data")
def report_data(report_id: str, current: CurrentUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Numbers behind a report — used by the in-app viewer."""
    run = db.query(ReportRun).filter(ReportRun.id == report_id,
                                     ReportRun.tenant_id == current.tenant_id).first()
    if not run:
        raise HTTPException(404, "Report not found")
    return build_report_data(db, current.tenant_id, _kind_of(run), run.client_id)


@router.get("/{report_id}/download")
def download(report_id: str, format: str = "pdf",
             current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    run = db.query(ReportRun).filter(ReportRun.id == report_id,
                                     ReportRun.tenant_id == current.tenant_id).first()
    if not run:
        raise HTTPException(404, "Report not found")
    kind = _kind_of(run)
    fmt = (format or "pdf").lower()
    if fmt == "pdf":
        rf = db.query(ReportFile).filter(ReportFile.report_run_id == report_id).first()
        data = get_storage().get(rf.object_key) if rf else \
            generate_report_pdf(db, current.tenant_id, kind, run.client_id)
        media, ext = "application/pdf", "pdf"
    elif fmt == "csv":
        data = generate_report_csv(db, current.tenant_id, kind, run.client_id)
        media, ext = "text/csv", "csv"
    elif fmt in ("xlsx", "excel", "xl"):
        data = generate_report_xlsx(db, current.tenant_id, kind, run.client_id)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ext = "xlsx"
    else:
        raise HTTPException(400, "format must be pdf, csv, or xlsx")
    name = f"{kind}-report-{report_id[:8]}.{ext}"
    return StreamingResponse(io.BytesIO(data), media_type=media,
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.delete("/{report_id}")
def delete_report(report_id: str, current: CurrentUser = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    run = db.query(ReportRun).filter(ReportRun.id == report_id,
                                     ReportRun.tenant_id == current.tenant_id).first()
    if not run:
        raise HTTPException(404, "Report not found")
    run.is_deleted = True
    db.query(ReportFile).filter(ReportFile.report_run_id == report_id).update(
        {ReportFile.is_deleted: True})
    db.commit()
    return {"status": "deleted"}


@router.post("/batch-delete")
def batch_delete(body: BatchIds, current: CurrentUser = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    n = (db.query(ReportRun).filter(ReportRun.tenant_id == current.tenant_id,
         ReportRun.id.in_(body.ids)).update({ReportRun.is_deleted: True},
         synchronize_session=False))
    db.commit()
    return {"deleted": n}


@router.post("/batch-download")
def batch_download(body: BatchIds, format: str = "pdf",
                   current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Zip several reports together in the chosen format."""
    runs = db.query(ReportRun).filter(ReportRun.tenant_id == current.tenant_id,
                                      ReportRun.id.in_(body.ids),
                                      ReportRun.is_deleted == False).all()
    if not runs:
        raise HTTPException(404, "No reports found")
    fmt = (format or "pdf").lower()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for run in runs:
            kind = _kind_of(run)
            if fmt == "csv":
                data = generate_report_csv(db, current.tenant_id, kind, run.client_id); ext = "csv"
            elif fmt in ("xlsx", "excel", "xl"):
                data = generate_report_xlsx(db, current.tenant_id, kind, run.client_id); ext = "xlsx"
            else:
                rf = db.query(ReportFile).filter(ReportFile.report_run_id == run.id).first()
                data = get_storage().get(rf.object_key) if rf else \
                    generate_report_pdf(db, current.tenant_id, kind, run.client_id)
                ext = "pdf"
            zf.writestr(f"{kind}-{run.id[:8]}.{ext}", data)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": 'attachment; filename="reports.zip"'})


# ═══════════════════════════════════════════════════════════════════════════════
# DAILY CLIENT REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

def _wa_headers_r():
    return {"Authorization": f"Bearer {WA_SECRET}"} if WA_SECRET else {}


def _extract_top_words(texts: list[str], n: int = 5) -> str:
    counter: Counter = Counter()
    for text in texts:
        for w in re.findall(r"[a-zA-Z]{4,}", (text or "").lower()):
            if w not in _STOP:
                counter[w] += 1
    return ", ".join(w.title() for w, _ in counter.most_common(n))


# ═══════════════════════════════════════════════════════════════════════════════
# GOOGLE SHEET → EOD REPORT PARSER
# ═══════════════════════════════════════════════════════════════════════════════

def _sheets_csv_url(raw: str) -> str:
    """Convert any Google Sheets share/edit URL → CSV export URL."""
    gid_match = re.search(r"gid=(\d+)", raw)
    gid = gid_match.group(1) if gid_match else "0"
    id_match = re.search(r"/d/([a-zA-Z0-9_-]+)", raw)
    if not id_match:
        raise HTTPException(400, "Could not extract Google Sheet ID from URL")
    sheet_id = id_match.group(1)
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"


def _safe_int(val, default=None):
    try:
        if val is None or str(val).strip() in ("", "---", "-", "N/A"):
            return default
        return int(float(str(val).replace(",", "")))
    except Exception:
        return default


def _eod_summary(name: str, deployed: int) -> str:
    return (
        f"As of today, our team has successfully deployed a total of "
        f"{deployed:,} comments for {name.upper()}. "
        f"The final number of comments after deployment is expected to increase, "
        f"as there is organic engagement on the posts."
    )


def _parse_eod_format(csv_rows: list[list[str]]) -> dict:
    """Parse the EOD Report sheet format (project name + date in first 2 rows,
    then client section headers in orange + data rows)."""
    today = datetime.now(timezone.utc).strftime("%d-%m-%Y")

    project_name = (csv_rows[0][0] if csv_rows and csv_rows[0] else "EOD REPORT").strip()
    date_raw = (csv_rows[1][0] if len(csv_rows) > 1 and csv_rows[1] else today).strip()
    # Remove "EOD - " prefix if present
    date_str = re.sub(r"(?i)^eod\s*[-–]\s*", "", date_raw).strip() or today

    SKIP_FIRSTS = {"sno", "total", "summary", ""}
    sections: list[dict] = []
    current_name: str | None = None
    current_posts: list[dict] = []

    for row in csv_rows[2:]:
        if not row or not any((c or "").strip() for c in row):
            continue
        first = (row[0] or "").strip()
        first_lower = first.lower()

        # Skip header / total / summary rows
        if first_lower in SKIP_FIRSTS or first_lower.startswith("as of today") or first_lower.startswith("sno"):
            continue
        # Sub-total rows: col 0 empty, col 1 is a count number
        if not first and len(row) > 1 and _safe_int(row[1]) is not None:
            continue

        # Data row: col 0 is a serial number
        sno = _safe_int(first)
        if sno is not None:
            url = (row[1] or "").strip() if len(row) > 1 else ""
            if not url.startswith("http"):
                continue
            deployed = _safe_int(row[2] if len(row) > 2 else None, 0)
            before   = _safe_int(row[3] if len(row) > 3 else None)
            after    = _safe_int(row[4] if len(row) > 4 else None)
            if after is None and before is not None:
                after = (before or 0) + (deployed or 0)
            current_posts.append({
                "sno": len(current_posts) + 1,
                "url": url,
                "deployed": deployed or 0,
                "before": before,
                "after": after,
            })
            continue

        # Section header row (non-numeric, non-URL text like "PRESIDENT ALI")
        if first and not first.startswith("http"):
            if current_name is not None and current_posts:
                td = sum(p["deployed"] for p in current_posts)
                sections.append({
                    "client": {"id": current_name, "name": current_name},
                    "posts": current_posts, "total_links": len(current_posts),
                    "total_deployed": td, "summary": _eod_summary(current_name, td),
                })
            current_name = first
            current_posts = []

    # Flush last section
    if current_name and current_posts:
        td = sum(p["deployed"] for p in current_posts)
        sections.append({
            "client": {"id": current_name, "name": current_name},
            "posts": current_posts, "total_links": len(current_posts),
            "total_deployed": td, "summary": _eod_summary(current_name, td),
        })

    for sec in sections:
        sec["total_before"] = sum(p["before"] for p in sec["posts"] if p.get("before") is not None) or None
        sec["total_after"]  = sum(p["after"]  for p in sec["posts"] if p.get("after")  is not None) or None

    return {
        "date": date_str, "project_name": project_name,
        "sections": sections,
        "grand_total_links": sum(s["total_links"] for s in sections),
        "grand_total_deployed": sum(s["total_deployed"] for s in sections),
    }


def _parse_researcher_format(csv_rows: list[list[str]], project_name: str) -> dict:
    """Parse the internal researcher / writer tracking sheet format:
    SNO | POST LINK | NARRATIVE | SENTIMENT | EXISTING COMMENT NO | COMMENTS TO ADD | ..."""
    today = datetime.now(timezone.utc).strftime("%d-%m-%Y")

    if not csv_rows:
        return {"date": today, "project_name": project_name, "sections": [],
                "grand_total_links": 0, "grand_total_deployed": 0}

    # Find the header row (first row with "POST LINK" or "COMMENTS TO ADD")
    header_row_idx = 0
    header = []
    for i, row in enumerate(csv_rows[:5]):
        cols = [c.strip().upper() for c in row]
        if "POST LINK" in cols or "COMMENTS TO ADD" in cols:
            header = cols
            header_row_idx = i
            break

    def _col(names: list[str]) -> int | None:
        for n in names:
            if n in header:
                return header.index(n)
        return None

    link_col     = _col(["POST LINK", "LINK", "URL"])
    deployed_col = _col(["COMMENTS TO ADD", "COMMENTS ADDED", "NO OF COMMENTS", "COMMENTS"])
    before_col   = _col(["EXISTING COMMENT NO", "EXISTING COMMENTS", "COMMENT NO", "BEFORE"])

    if link_col is None:
        raise HTTPException(422, "Could not find 'POST LINK' column in sheet")

    sections: list[dict] = []
    current_team = project_name
    current_posts: list[dict] = []

    def _flush():
        nonlocal current_posts
        if current_posts:
            td = sum(p["deployed"] for p in current_posts)
            sections.append({
                "client": {"id": current_team, "name": current_team},
                "posts": current_posts, "total_links": len(current_posts),
                "total_deployed": td, "summary": _eod_summary(current_team, td),
            })
            current_posts = []

    for row in csv_rows[header_row_idx + 1:]:
        if not row or len(row) <= link_col:
            continue
        link = (row[link_col] or "").strip()

        # Team separator row (e.g. "Team Mohammed")
        if not link or not link.startswith("http"):
            team_label = next((c.strip() for c in row if c and c.strip().lower().startswith("team")), None)
            if team_label:
                _flush()
                current_team = team_label
            continue

        deployed = _safe_int(row[deployed_col] if deployed_col is not None and deployed_col < len(row) else None, 0)
        before   = _safe_int(row[before_col]   if before_col   is not None and before_col   < len(row) else None)
        after    = (before or 0) + (deployed or 0) if before is not None else deployed

        current_posts.append({
            "sno": len(current_posts) + 1,
            "url": link,
            "deployed": deployed or 0,
            "before": before,
            "after": after,
        })

    _flush()

    # Add total_before / total_after to each section
    for sec in sections:
        sec["total_before"] = sum(p["before"] for p in sec["posts"] if p.get("before") is not None) or None
        sec["total_after"]  = sum(p["after"]  for p in sec["posts"] if p.get("after")  is not None) or None

    return {
        "date": today, "project_name": project_name,
        "sections": sections,
        "grand_total_links": sum(s["total_links"] for s in sections),
        "grand_total_deployed": sum(s["total_deployed"] for s in sections),
    }


def _parse_sheet_to_eod(csv_text: str, project_name: str = "EOD REPORT") -> dict:
    """Auto-detect sheet format and parse to standard EOD report dict."""
    import csv as _csv, io as _io
    reader = _csv.reader(_io.StringIO(csv_text))
    rows = list(reader)
    if not rows:
        raise HTTPException(422, "Sheet is empty")

    # Detect researcher format: header row within first 3 rows has POST LINK column
    for row in rows[:3]:
        cols = [c.strip().upper() for c in row]
        if "POST LINK" in cols:
            return _parse_researcher_format(rows, project_name)

    # EOD format
    return _parse_eod_format(rows)


class _SheetEodRequest(BaseModel):
    client_id:  Optional[str] = None
    sheet_url:  Optional[str] = None  # if provided, also saves to client meta
    date_from:  Optional[str] = None
    date_to:    Optional[str] = None
    profile_id: Optional[str] = None  # social profile to associate with


@router.post("/sheet-eod")
def sheet_eod_report(body: _SheetEodRequest,
                     current: CurrentUser = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    """Read a Google Sheet (EOD or researcher format) and return a FullEodReport JSON.
    If sheet_url is provided alongside client_id, it is also saved to client meta."""
    import httpx

    raw_url = (body.sheet_url or "").strip()

    # Resolve URL: use provided URL or fall back to stored client meta
    if not raw_url and body.client_id:
        client = (db.query(Client)
                  .filter(Client.id == body.client_id, Client.tenant_id == current.tenant_id)
                  .first())
        if not client:
            raise HTTPException(404, "Client not found")
        raw_url = (client.meta or {}).get("sheet_url", "")

    if not raw_url:
        raise HTTPException(400, "No Google Sheet URL provided or linked to this client")

    # Save URL to client meta if provided explicitly
    if body.sheet_url and body.client_id:
        client = (db.query(Client)
                  .filter(Client.id == body.client_id, Client.tenant_id == current.tenant_id)
                  .first())
        if client:
            meta = dict(client.meta or {})
            meta["sheet_url"] = body.sheet_url.strip()
            client.meta = meta
            db.commit()

    # Fetch CSV
    csv_url = _sheets_csv_url(raw_url) if "docs.google.com" in raw_url else raw_url
    try:
        r = httpx.get(csv_url, follow_redirects=True, timeout=20.0)
        r.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"Could not fetch Google Sheet: {e}")

    # Determine project name from client name if available
    project_name = "EOD REPORT"
    if body.client_id:
        c2 = (db.query(Client)
              .filter(Client.id == body.client_id, Client.tenant_id == current.tenant_id)
              .first())
        if c2:
            project_name = c2.name.upper()

    return _parse_sheet_to_eod(r.text, project_name)


def _client_post_filter(client_id: str):
    """SQLAlchemy filter clause that matches posts owned by a client directly
    or via their linked social profiles."""
    return or_(
        Post.client_id == client_id,
        Post.social_profile_id.in_(
            # subquery: profile IDs belonging to this client
            # (inline lambda keeps it self-contained)
            None  # placeholder — replaced per-call below
        )
    )


def _post_ids_for_client(db: Session, client_id: str):
    """Return a list of Post IDs for a client across both ownership paths."""
    profile_ids = [r for (r,) in
        db.query(SocialProfile.id)
        .filter(SocialProfile.client_id == client_id)
        .all()]
    q = db.query(Post.id).filter(
        Post.is_deleted == False,
        or_(Post.client_id == client_id,
            Post.social_profile_id.in_(profile_ids) if profile_ids else Post.client_id == client_id)
    )
    return [r for (r,) in q.all()]


def _post_id_subq(db: Session, client_id: str):
    """Return a SQLAlchemy subquery for Post IDs belonging to a client.
    Avoids materialising a large Python IN list for high-volume queries."""
    profile_subq = (db.query(SocialProfile.id)
                    .filter(SocialProfile.client_id == client_id)
                    .subquery())
    return (db.query(Post.id)
            .filter(
                Post.is_deleted == False,
                or_(Post.client_id == client_id,
                    Post.social_profile_id.in_(profile_subq)),
            )
            .subquery())


@router.get("/daily-clients")
def daily_clients_summary(current: CurrentUser = Depends(get_current_user),
                          db: Session = Depends(get_db),
                          date_from: str | None = None,
                          date_to: str | None = None,
                          client_id: str | None = None):
    """All clients with aggregated sentiment stats (for daily reports table).
    Optionally filter by date_from / date_to (YYYY-MM-DD) and client_id."""
    q = db.query(Client).filter(Client.tenant_id == current.tenant_id, Client.is_deleted == False)
    if client_id:
        q = q.filter(Client.id == client_id)
    clients = q.order_by(Client.name).all()

    if not clients:
        return {"clients": [], "generated_at": datetime.now(timezone.utc).isoformat()}

    client_map = {c.id: c for c in clients}
    client_ids = list(client_map)

    # Named placeholders for SQLite (no tuple binding support)
    cid_params = {f"cid{i}": cid for i, cid in enumerate(client_ids)}
    cid_ph = ",".join(f":cid{i}" for i in range(len(client_ids)))

    # Optional date filter SQL fragments
    post_date_sql = ""
    comment_date_sql = ""
    date_params: dict = {}
    if date_from:
        post_date_sql += " AND p.published_at >= :date_from"
        comment_date_sql += " AND c.published_at >= :date_from"
        date_params["date_from"] = date_from
    if date_to:
        post_date_sql += " AND p.published_at <= :date_to_end"
        comment_date_sql += " AND c.published_at <= :date_to_end"
        date_params["date_to_end"] = date_to + " 23:59:59"

    all_params = {**cid_params, **date_params}

    # ── Batch query 1: post counts + comment counts + sentiment ────────────
    # Uses UNION ALL to split direct-client posts from profile-routed posts so
    # SQLite can use ix_posts_client_id and ix_posts_social_profile_id.
    stats_sql = text(f"""
        WITH cp AS (
            SELECT p.id AS post_id, p.client_id AS client_id, p.published_at
            FROM   posts p
            WHERE  p.is_deleted = 0
              AND  p.client_id IN ({cid_ph})
              {post_date_sql}
            UNION ALL
            SELECT p.id, sp.client_id, p.published_at
            FROM   posts p
            JOIN   social_profiles sp ON sp.id = p.social_profile_id
            WHERE  p.is_deleted = 0
              AND  p.client_id IS NULL
              AND  sp.client_id IN ({cid_ph})
              {post_date_sql}
        )
        SELECT
            cp.client_id                               AS client_id,
            COUNT(DISTINCT cp.post_id)                 AS post_count,
            COUNT(c.id)                                AS total_comments,
            COALESCE(ca.sentiment, 'Unknown')          AS sentiment,
            COUNT(ca.id)                               AS analyzed_count,
            MAX(cp.published_at)                       AS latest_post_date
        FROM cp
        LEFT JOIN comments c
               ON c.post_id = cp.post_id
              {comment_date_sql}
        LEFT JOIN comment_analysis ca
               ON ca.comment_id = c.id
              AND ca.is_deleted = 0
        GROUP BY cp.client_id, ca.sentiment
    """)
    stat_rows = db.execute(stats_sql, all_params).fetchall()

    # ── Batch query 2: narrative texts (top 50 per client) ────────────────
    narrative_sql = text(f"""
        WITH cp AS (
            SELECT p.id AS post_id, p.client_id
            FROM   posts p
            WHERE  p.is_deleted = 0 AND p.client_id IN ({cid_ph})
            UNION ALL
            SELECT p.id, sp.client_id
            FROM   posts p
            JOIN   social_profiles sp ON sp.id = p.social_profile_id
            WHERE  p.is_deleted = 0 AND p.client_id IS NULL AND sp.client_id IN ({cid_ph})
        )
        SELECT cp.client_id, pa.main_narrative
        FROM   cp
        JOIN   post_analysis pa ON pa.post_id = cp.post_id
        WHERE  pa.is_deleted = 0 AND pa.main_narrative IS NOT NULL
        LIMIT  {50 * len(client_ids)}
    """)
    narrative_rows = db.execute(narrative_sql, cid_params).fetchall()

    # ── Aggregate in Python ───────────────────────────────────────────────
    from collections import defaultdict as _dd

    stats_by_client: dict = _dd(lambda: {
        "post_count": 0, "total_comments": 0, "latest_post_date": None,
        "sentiment": {"Positive": 0, "Negative": 0, "Neutral": 0},
    })
    for row in stat_rows:
        s = stats_by_client[row.client_id]
        s["post_count"] = row.post_count
        s["total_comments"] = row.total_comments
        if row.latest_post_date and (s["latest_post_date"] is None or row.latest_post_date > s["latest_post_date"]):
            s["latest_post_date"] = row.latest_post_date
        sent = row.sentiment
        if sent in ("Positive", "Negative", "Neutral"):
            s["sentiment"][sent] = row.analyzed_count

    narratives_by_client: dict = _dd(list)
    for row in narrative_rows:
        narratives_by_client[row.client_id].append(row.main_narrative)

    result = []
    for client in clients:
        s = stats_by_client.get(client.id, {})
        sentiment = s.get("sentiment", {"Positive": 0, "Negative": 0, "Neutral": 0})
        analyzed = sum(sentiment.values())
        pct_div = analyzed or 1
        pos_pct = round(sentiment["Positive"] * 100 / pct_div)
        neg_pct = round(sentiment["Negative"] * 100 / pct_div)

        if date_to:
            display_date = date_to
        elif date_from:
            display_date = date_from
        else:
            ld = s.get("latest_post_date")
            display_date = str(ld)[:10] if ld else None

        top_topics = _extract_top_words(narratives_by_client.get(client.id, []))

        result.append({
            "id": client.id,
            "name": client.name,
            "industry": client.industry or "",
            "posts": s.get("post_count", 0),
            "comments": s.get("total_comments", 0),
            "analyzed_comments": analyzed,
            "sentiment": sentiment,
            "positive_pct": pos_pct,
            "negative_pct": neg_pct,
            "neutral_pct": 100 - pos_pct - neg_pct,
            "crisis": neg_pct >= 40,
            "top_topics": top_topics,
            "latest_date": display_date,
            "data_range": f"{date_from} → {date_to}" if (date_from and date_to) else (date_from or date_to or "All time"),
            "sheet_url": (client.meta or {}).get("sheet_url", ""),
        })

    return {"clients": result, "generated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/daily-clients/{client_id}")
def daily_client_detail(client_id: str,
                        current: CurrentUser = Depends(get_current_user),
                        db: Session = Depends(get_db),
                        date_from: str | None = None,
                        date_to: str | None = None):
    """Full daily breakdown + top narratives + keywords for one client."""
    client = (db.query(Client)
              .filter(Client.id == client_id, Client.tenant_id == current.tenant_id)
              .first())
    if not client:
        raise HTTPException(404, "Client not found")

    post_ids = _post_ids_for_client(db, client_id)

    # Daily sentiment rows
    daily_q = (db.query(Comment.published_at, CommentAnalysis.sentiment, func.count())
               .join(CommentAnalysis, CommentAnalysis.comment_id == Comment.id)
               .filter(Comment.post_id.in_(post_ids) if post_ids else Comment.post_id == None,
                       CommentAnalysis.is_deleted == False))
    if date_from:
        daily_q = daily_q.filter(Comment.published_at >= date_from)
    if date_to:
        daily_q = daily_q.filter(Comment.published_at <= date_to + " 23:59:59")
    rows = daily_q.group_by(Comment.published_at, CommentAnalysis.sentiment).order_by(Comment.published_at).all()

    by_date: dict = defaultdict(lambda: {"Positive": 0, "Negative": 0, "Neutral": 0})
    for pub, sent, cnt in rows:
        dk = str(pub)[:10] if pub else "unknown"
        by_date[dk][sent or "Neutral"] += cnt

    daily = []
    for date, counts in sorted(by_date.items()):
        tot = sum(counts.values()) or 1
        daily.append({
            "date": date,
            "positive": counts["Positive"],
            "negative": counts["Negative"],
            "neutral": counts["Neutral"],
            "total": tot,
            "positive_pct": round(counts["Positive"] * 100 / tot),
            "negative_pct": round(counts["Negative"] * 100 / tot),
            "neutral_pct": round(counts["Neutral"] * 100 / tot),
        })

    # Top narratives and topics
    narr_rows = ([r for r in
        db.query(PostAnalysis.main_narrative, PostAnalysis.intent, PostAnalysis.political_angle)
        .filter(PostAnalysis.post_id.in_(post_ids), PostAnalysis.is_deleted == False)
        .limit(100).all()] if post_ids else [])

    _SKIP = {"sentiment_management", "neutral", "unknown", "none", "n/a", ""}
    topic_counter: Counter = Counter()
    narrative_texts = []
    for narr, intent, angle in narr_rows:
        if narr:
            narrative_texts.append(narr)
        if intent and intent.strip().lower() not in _SKIP:
            topic_counter[intent.strip().title()] += 1
        if angle and angle.strip().lower() not in _SKIP:
            topic_counter[angle.strip().title()] += 1

    word_counter: Counter = Counter()
    for text in narrative_texts:
        for w in re.findall(r"[a-zA-Z]{4,}", text.lower()):
            if w not in _STOP:
                word_counter[w] += 1

    # Top comment keywords
    comment_texts = ([c for (c,) in
        db.query(Comment.content)
        .filter(Comment.post_id.in_(post_ids), Comment.content.isnot(None))
        .limit(1000).all()] if post_ids else [])

    kw_counter: Counter = Counter()
    for text in comment_texts:
        for w in re.findall(r"[a-zA-Z]{4,}", text.lower()):
            if w not in _STOP:
                kw_counter[w] += 1

    # Per-social-profile account breakdown
    profiles = (db.query(SocialProfile)
                .filter(SocialProfile.client_id == client_id)
                .order_by(SocialProfile.platform).all())
    accounts = []
    for prof in profiles:
        prof_post_ids = [r for (r,) in
            db.query(Post.id).filter(Post.social_profile_id == prof.id, Post.is_deleted == False).all()]
        if not prof_post_ids:
            continue
        prof_sent = {"Positive": 0, "Negative": 0, "Neutral": 0}
        for s, c in (db.query(CommentAnalysis.sentiment, func.count())
                     .join(Comment, Comment.id == CommentAnalysis.comment_id)
                     .filter(Comment.post_id.in_(prof_post_ids), CommentAnalysis.is_deleted == False)
                     .group_by(CommentAnalysis.sentiment).all()):
            prof_sent[s or "Neutral"] = c
        ptotal = sum(prof_sent.values()) or 1
        accounts.append({
            "platform": prof.platform,
            "handle": prof.handle or prof.display_name or "",
            "posts": len(prof_post_ids),
            "comments": ptotal,
            "sentiment": prof_sent,
            "positive_pct": round(prof_sent["Positive"] * 100 / ptotal),
            "negative_pct": round(prof_sent["Negative"] * 100 / ptotal),
            "neutral_pct": round(prof_sent["Neutral"] * 100 / ptotal),
        })

    return {
        "client": {"id": client.id, "name": client.name, "industry": client.industry or ""},
        "daily": daily,
        "total_days": len(daily),
        "narratives": [{"topic": t, "count": c} for t, c in topic_counter.most_common(10)],
        "keywords": [{"word": w, "count": c} for w, c in kw_counter.most_common(20)],
        "accounts": accounts,
    }


@router.get("/daily-clients/{client_id}/eod-posts")
def daily_client_eod_posts(client_id: str,
                            current: CurrentUser = Depends(get_current_user),
                            db: Session = Depends(get_db)):
    """Returns post data for EOD report — metrics.real_comment_total / to_add mapping."""
    client = (db.query(Client)
              .filter(Client.id == client_id, Client.tenant_id == current.tenant_id)
              .first())
    if not client:
        raise HTTPException(404, "Client not found")

    from app.models import Post as PostModel
    post_ids = _post_ids_for_client(db, client_id)
    posts = (db.query(PostModel)
             .filter(PostModel.id.in_(post_ids) if post_ids else PostModel.id == None)
             .order_by(PostModel.published_at.desc())
             .limit(30).all())

    rows = []
    for i, p in enumerate(posts):
        m = p.metrics or {}
        seeded_target = int(m.get("seeded_target") or 0)
        existing_comments = m.get("existing_comments")
        real_total = int(m.get("real_comment_total") or 0)

        if seeded_target or m.get("imported_from_sheet"):
            deployed = seeded_target
            before = int(existing_comments) if existing_comments is not None else None
            after = (int(existing_comments) if existing_comments is not None else 0) + seeded_target
        else:
            actual_count = (db.query(func.count(Comment.id))
                            .filter(Comment.post_id == p.id, Comment.is_deleted == False)
                            .scalar() or 0)
            deployed = actual_count
            after = real_total if real_total else actual_count
            before = max(0, after - deployed) if deployed else None

        rows.append({
            "sno": i + 1,
            "url": p.url or p.permalink or "",
            "deployed": deployed,
            "before": before,
            "after": after,
        })

    total_deployed = sum(r["deployed"] for r in rows)
    total_before = sum(r["before"] for r in rows if r["before"] is not None)
    total_after = sum(r["after"] for r in rows if r["after"] is not None)

    return {
        "client": {"id": client.id, "name": client.name},
        "date": datetime.now(timezone.utc).strftime("%d-%m-%Y"),
        "posts": rows,
        "total_links": len(rows),
        "total_deployed": total_deployed,
        "total_before": total_before or None,
        "total_after": total_after or None,
        "summary": (
            f"As of today, our team has successfully deployed a total of "
            f"{total_deployed:,} comments for {client.name.upper()}. "
            f"The final number of comments after deployment is expected to increase, "
            f"as there is organic engagement on the posts."
        ),
    }


@router.get("/eod-report")
def eod_report_all(current: CurrentUser = Depends(get_current_user),
                   db: Session = Depends(get_db),
                   client_id: str | None = None,
                   date_from: str | None = None,
                   date_to: str | None = None):
    """Full EOD report — all clients or a specific client if client_id provided."""
    from app.models import Post as PostModel
    q = db.query(Client).filter(Client.tenant_id == current.tenant_id, Client.is_deleted == False)
    if client_id:
        q = q.filter(Client.id == client_id)
    clients = q.order_by(Client.name).all()

    sections = []
    grand_links = 0
    grand_deployed = 0

    for client in clients:
        cpost_ids = _post_ids_for_client(db, client.id)
        pq = db.query(PostModel).filter(PostModel.id.in_(cpost_ids) if cpost_ids else PostModel.id == None)
        if date_from: pq = pq.filter(PostModel.published_at >= date_from)
        if date_to:   pq = pq.filter(PostModel.published_at <= date_to + " 23:59:59")
        posts = pq.order_by(PostModel.published_at.desc()).limit(30).all()
        if not posts:
            continue
        rows = []
        for i, p in enumerate(posts):
            m = p.metrics or {}
            seeded_target = int(m.get("seeded_target") or 0)
            existing_comments = m.get("existing_comments")
            real_total = int(m.get("real_comment_total") or 0)

            if seeded_target or m.get("imported_from_sheet"):
                # Post imported from researcher sheet — use sheet data
                deployed = seeded_target
                before = int(existing_comments) if existing_comments is not None else None
                after = (int(existing_comments) if existing_comments is not None else 0) + seeded_target
            else:
                # Scraped post — use actual analyzed comment count
                actual_count = (db.query(func.count(Comment.id))
                                .filter(Comment.post_id == p.id, Comment.is_deleted == False)
                                .scalar() or 0)
                deployed = actual_count
                after = real_total if real_total else actual_count
                before = max(0, after - deployed) if deployed else None

            rows.append({
                "sno": i + 1,
                "url": p.url or p.permalink or "",
                "deployed": deployed,
                "before": before,
                "after": after,
            })
        total_dep = sum(r["deployed"] for r in rows)
        total_before = sum(r["before"] for r in rows if r["before"] is not None)
        total_after  = sum(r["after"]  for r in rows if r["after"]  is not None)
        grand_links += len(rows)
        grand_deployed += total_dep
        sections.append({
            "client": {"id": client.id, "name": client.name},
            "posts": rows,
            "total_links": len(rows),
            "total_deployed": total_dep,
            "total_before": total_before,
            "total_after": total_after,
            "summary": (
                f"As of today, our team has successfully deployed a total of "
                f"{total_dep:,} comments for {client.name.upper()}. "
                f"The final number of comments after deployment is expected to increase, "
                f"as there is organic engagement on the posts."
            ),
        })

    return {
        "date": datetime.now(timezone.utc).strftime("%d-%m-%Y"),
        "sections": sections,
        "grand_total_links": grand_links,
        "grand_total_deployed": grand_deployed,
    }


DEFAULT_SEEDING_SHEET_ID = "1FAttq_5SAxjjGxMwPH6HduEbTjeZGHTWLWJ_YRWkj20"
# GID-based tabs that contain actual seeding data (for fallback when date tabs are empty)
DEFAULT_SEEDING_GIDS = ["1777158762", "702679188", "1999413541"]


GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")


@router.get("/google-auth-config")
def google_auth_config():
    """Return the Google OAuth Client ID for the frontend to use with GIS."""
    return {"client_id": GOOGLE_CLIENT_ID or None}


def _parse_seeding_format(csv_rows: list[list[str]]) -> dict:
    """Parse researcher/seeding sheet — extracts all 13 tracker columns.

    gviz format  — row 0 = column labels (e.g. 'POST LINK President Ali'),
                   data rows start at row 1; client sections are non-URL rows.
    export format — header row identified by 'POST LINK' keyword, data follows.
    """
    today = datetime.now(timezone.utc).strftime("%d-%m-%Y")

    if not csv_rows:
        return {"date": today, "project_name": "", "sections": [], "total_posts": 0,
                "grand_total_links": 0, "grand_total_deployed": 0}

    # Locate header row (first row containing "POST LINK")
    header_row_idx: int | None = None
    header: list[str] = []
    for i, row in enumerate(csv_rows[:15]):
        cols = [c.strip().upper() for c in row]
        if any("POST LINK" in c for c in cols):
            header = cols
            header_row_idx = i
            break

    if header_row_idx is None:
        raise HTTPException(422, "Could not find POST LINK column in sheet")

    # Extract project name from any row before the header row that has non-trivial text
    project_name = ""
    for i in range(header_row_idx):
        cell = (csv_rows[i][0] if csv_rows[i] else "").strip()
        if cell and not cell.upper().startswith("SNO") and not cell.upper().startswith("EOD"):
            project_name = cell
            break

    def _col(*names: str) -> int | None:
        """Find first column index whose header starts with any of the given names."""
        for n in names:
            for idx, h in enumerate(header):
                if h == n or h.startswith(n):
                    return idx
        return None

    # All 13 columns from the researcher sheet
    link_col          = _col("POST LINK", "LINK", "URL")
    post_sent_col     = _col("POST SENTIMENT", "POST SENT")
    narrative_col     = _col("NARRATIVE", "NARRATION")
    comment_sent_col  = _col("COMMENT SENTIMENT", "COMMENT SENT")
    existing_col      = _col("EXISTING COMMENT NO", "EXISTING COMMENTS", "EXISTING", "BEFORE")
    to_add_col        = _col("COMMENTS TO ADD", "TO ADD", "COMMENTS ADDED", "NO OF COMMENTS", "DEPLOYED")
    head_checked_col  = _col("ORM HEAD LINK CHECKED", "HEAD LINK CHECKED", "HEAD CHECKED")
    checkers_col      = _col("CHECKERS ASSIGN WRITERS", "CHECKERS ASSIGN", "ASSIGN WRITERS")
    remarks_col       = _col("REMARKS")
    writers_link_col  = _col("WRITERS COMMENT LINK", "WRITERS FILE LINK", "WRITERS LINK")
    checkers_appr_col = _col("CHECKERS LINK APPROVED", "CHECKERS APPROVED", "LINK APPROVED")
    head_send_col     = _col("ORM HEAD SEND TL", "ORM HEAD SEND VENDOR", "HEAD SEND")

    if link_col is None:
        raise HTTPException(422, "Could not find POST LINK column in header")

    # Extract first client name embedded in gviz header label
    # e.g. 'POST LINK President Ali ' → first_client = 'President Ali'
    first_client = ""
    raw_label = csv_rows[header_row_idx][link_col].strip()
    for prefix in ("POST LINK", "LINK"):
        if raw_label.upper().startswith(prefix):
            remainder = raw_label[len(prefix):].strip()
            if remainder:
                first_client = remainder
            break

    sections: list[dict] = []
    current_name: str = first_client or "Unknown"
    current_posts: list[dict] = []

    def _get(r: list, col: int | None) -> str:
        if col is None or col >= len(r):
            return ""
        return (r[col] or "").strip()

    def _flush():
        nonlocal current_posts
        if current_posts:
            td = sum(p["deployed"] for p in current_posts)
            sections.append({
                "client": {"id": current_name, "name": current_name},
                "posts": list(current_posts),
                "total_links": len(current_posts),
                "total_deployed": td,
                "summary": _eod_summary(current_name, td),
            })
            current_posts.clear()

    for row in csv_rows[header_row_idx + 1:]:
        if not row or not any((c or "").strip() for c in row):
            continue

        link_val = _get(row, link_col)

        if link_val.startswith("http"):
            before   = _safe_int(_get(row, existing_col))
            deployed = _safe_int(_get(row, to_add_col), 0)
            after    = (before or 0) + (deployed or 0) if before is not None else deployed

            current_posts.append({
                "sno":               len(current_posts) + 1,
                "url":               link_val,
                "deployed":          deployed or 0,
                "before":            before,
                "after":             after,
                # All researcher tracker columns
                "post_sentiment":    _get(row, post_sent_col),
                "narrative":         _get(row, narrative_col),
                "comment_sentiment": _get(row, comment_sent_col),
                "head_checked":      _get(row, head_checked_col),
                "checkers_assign":   _get(row, checkers_col),
                "remarks":           _get(row, remarks_col),
                "writers_link":      _get(row, writers_link_col),
                "checkers_approved": _get(row, checkers_appr_col),
                "head_send":         _get(row, head_send_col),
            })
        elif link_val and not link_val.startswith("http"):
            _flush()
            current_name = link_val

    _flush()

    grand_links    = sum(s["total_links"]    for s in sections)
    grand_deployed = sum(s["total_deployed"] for s in sections)

    return {
        "date": today,
        "project_name": project_name,
        "sections": sections,
        "grand_total_links": grand_links,
        "grand_total_deployed": grand_deployed,
        "total_posts": grand_links,
    }


class _SeedingReportRequest(BaseModel):
    sheet_url:     Optional[str] = None   # override; defaults to hardcoded seeding sheet
    date:          Optional[str] = None   # YYYY-MM-DD → mapped to tab name "16/7"
    date_from:     Optional[str] = None   # range start
    date_to:       Optional[str] = None   # range end
    client_filter: Optional[str] = None   # optional substring filter on client name
    google_token:  Optional[str] = None   # Google OAuth access token (for private sheets)
    gid:           Optional[str] = None   # direct GID-based tab access (bypasses date lookup)


def _fetch_via_sheets_api(sheet_id: str, tab: str, google_token: str) -> list[list[str]] | None:
    """Fetch a sheet tab using Google Sheets API v4 with an OAuth token.
    Returns list-of-rows (same shape as CSV reader output) or None on failure."""
    import urllib.parse as _up
    range_str = f"'{tab}'!A:Z"
    url = (f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}"
           f"/values/{_up.quote(range_str, safe='')}")
    try:
        resp = httpx.get(url, headers={"Authorization": f"Bearer {google_token}"},
                         timeout=15.0)
        if resp.status_code == 401:
            raise HTTPException(401, "Google token is invalid or expired. Please re-authenticate.")
        if resp.status_code == 403:
            raise HTTPException(403, "Your Google account does not have access to this sheet.")
        if resp.status_code == 404:
            return None   # tab doesn't exist
        resp.raise_for_status()
        data = resp.json()
        return data.get("values", []) or None
    except HTTPException:
        raise
    except Exception:
        return None


@router.post("/seeding-report")
def seeding_report(body: _SeedingReportRequest,
                   current: CurrentUser = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    """Fetch the researcher/seeding sheet by date tab and return per-client seeding data.
    If google_token provided, uses Sheets API v4 (works for private sheets).
    Otherwise falls back to gviz public CSV (requires sheet to be publicly viewable)."""
    import csv as _csv
    import io as _io
    from datetime import date as _dt_date, timedelta as _timedelta

    sheet_id = DEFAULT_SEEDING_SHEET_ID
    if body.sheet_url:
        m = re.search(r"/d/([a-zA-Z0-9_-]+)", body.sheet_url)
        if m:
            sheet_id = m.group(1)

    # Build list of dates to try
    dates: list[str] = []
    if body.date:
        dates.append(body.date)
    elif body.date_from and body.date_to:
        try:
            start = _dt_date.fromisoformat(body.date_from)
            end   = _dt_date.fromisoformat(body.date_to)
            d = start
            while d <= end:
                dates.append(d.isoformat())
                d += _timedelta(days=1)
        except Exception:
            pass
    if not dates:
        dates.append(datetime.now(timezone.utc).strftime("%Y-%m-%d"))

    all_rows: list[list[str]] = []
    tabs_synced: list[str] = []
    header_inserted = False
    _per_date: list[tuple[str, list[list[str]]]] = []  # [(date_str, rows)] for period mode

    def _rows_have_data(rows: list[list[str]]) -> bool:
        """Return True only if rows contain at least one actual http URL."""
        return any(
            any((c or "").strip().startswith("http") for c in row)
            for row in rows
        )

    def _merge_rows(rows: list[list[str]], label: str):
        nonlocal header_inserted
        if not rows:
            return
        if not header_inserted:
            all_rows.extend(rows)
            header_inserted = True
        else:
            skip = 0
            for i, r in enumerate(rows[:15]):
                cols = [c.strip().upper() for c in r]
                if any("POST LINK" in c for c in cols):
                    skip = i + 1
                    break
            all_rows.extend(rows[skip:])
        tabs_synced.append(label)

    # ── Direct GID access (bypasses date logic) ─────────────────────────────
    if body.gid:
        gviz_base = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq"
        try:
            resp = httpx.get(gviz_base,
                             params={"tqx": "out:csv", "gid": body.gid},
                             follow_redirects=True, timeout=15.0)
            if resp.status_code == 200 and "POST LINK" in resp.text.upper():
                _merge_rows(list(_csv.reader(_io.StringIO(resp.text))), f"gid:{body.gid}")
        except Exception:
            pass

    # ── Date-based tab lookup ────────────────────────────────────────────────
    if not body.gid:
        for date_str in dates:
            try:
                d = _dt_date.fromisoformat(date_str)
            except Exception:
                continue

            for tab in [f"{d.day}/{d.month}", f"{d.day}/{d.month:02d}"]:
                rows: list[list[str]] | None = None

                if body.google_token:
                    rows = _fetch_via_sheets_api(sheet_id, tab, body.google_token)
                else:
                    gviz_base = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq"
                    try:
                        resp = httpx.get(gviz_base, params={"tqx": "out:csv", "sheet": tab},
                                         follow_redirects=True, timeout=15.0)
                        if resp.status_code == 200 and "POST LINK" in resp.text.upper():
                            rows = list(_csv.reader(_io.StringIO(resp.text)))
                    except Exception:
                        pass

                if rows and _rows_have_data(rows):
                    if len(dates) > 1:
                        # Period mode: parse each date independently to preserve date context
                        _per_date.append((date_str, rows))
                        tabs_synced.append(tab)
                    else:
                        _merge_rows(rows, tab)
                    break   # found for this date, move to next

    # ── GID fallback: try known data-bearing GIDs when date tabs were empty ──
    if not all_rows and not body.google_token:
        gviz_base = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq"
        for gid in DEFAULT_SEEDING_GIDS:
            try:
                resp = httpx.get(gviz_base,
                                 params={"tqx": "out:csv", "gid": gid},
                                 follow_redirects=True, timeout=15.0)
                if resp.status_code == 200 and "POST LINK" in resp.text.upper():
                    rows = list(_csv.reader(_io.StringIO(resp.text)))
                    if _rows_have_data(rows):
                        _merge_rows(rows, f"gid:{gid}")
                        break
            except Exception:
                continue
        if not all_rows:
            raise HTTPException(502, "Could not fetch seeding sheet — all GID fallbacks returned no data.")

    if not all_rows and not _per_date:
        if body.google_token:
            raise HTTPException(404, "No data found for the selected date(s) in the connected sheet.")
        raise HTTPException(422, "Sheet appears to be empty or inaccessible. "
                                 "Make sure the sheet is shared publicly or connect your Google account.")

    if _per_date:
        # Period mode: parse each date's rows independently, tag each section with its date
        period_sections: list[dict] = []
        for date_str, date_rows in _per_date:
            try:
                d_obj = _dt_date.fromisoformat(date_str)
                date_display = f"{d_obj.day}/{d_obj.month}/{d_obj.year}"
            except Exception:
                date_display = date_str
            daily = _parse_seeding_format(date_rows)
            for section in daily["sections"]:
                section["date"] = date_display
            period_sections.extend(daily["sections"])
        grand_links    = sum(s["total_links"]    for s in period_sections)
        grand_deployed = sum(s["total_deployed"] for s in period_sections)
        result = {
            "date": f"{dates[0]} → {dates[-1]}",
            "project_name": "",
            "sections": period_sections,
            "grand_total_links": grand_links,
            "grand_total_deployed": grand_deployed,
            "total_posts": grand_links,
        }
    else:
        result = _parse_seeding_format(all_rows)

    if body.client_filter:
        fl = body.client_filter.lower()
        result["sections"] = [s for s in result["sections"]
                              if fl in s["client"]["name"].lower()]

    result["tabs_synced"] = tabs_synced
    result["sheet_id"] = sheet_id
    result["authenticated"] = bool(body.google_token)
    return result


class _SeedingImportRequest(BaseModel):
    sheet_url:    Optional[str] = None
    date:         Optional[str] = None
    date_from:    Optional[str] = None
    date_to:      Optional[str] = None
    google_token: Optional[str] = None


@router.post("/seeding-import")
def seeding_import(body: _SeedingImportRequest,
                   current: CurrentUser = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    """Import seeded comments from researcher sheet into the database.

    For every post URL in the sheet, creates Comment + CommentAnalysis
    records (sentiment=Positive) equal to the COMMENTS TO ADD value.
    Already-imported seeded comments are skipped (idempotent).
    Returns { created, skipped_posts, already_seeded, errors }.
    """
    import csv as _csv
    import io as _io
    import uuid as _uuid
    from datetime import date as _dt_date, timedelta as _timedelta

    # ── Fetch sheet data (same logic as seeding_report) ──────────────────────
    sheet_id = DEFAULT_SEEDING_SHEET_ID
    if body.sheet_url:
        m = re.search(r"/d/([a-zA-Z0-9_-]+)", body.sheet_url)
        if m:
            sheet_id = m.group(1)

    dates: list[str] = []
    if body.date:
        dates.append(body.date)
    elif body.date_from and body.date_to:
        try:
            start = _dt_date.fromisoformat(body.date_from)
            end   = _dt_date.fromisoformat(body.date_to)
            d = start
            while d <= end:
                dates.append(d.isoformat())
                d += _timedelta(days=1)
        except Exception:
            pass
    if not dates:
        dates.append(datetime.now(timezone.utc).strftime("%Y-%m-%d"))

    all_rows: list[list[str]] = []
    tabs_synced: list[str] = []
    header_inserted = False
    sheet_date = dates[0] if dates else datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for date_str in dates:
        try:
            d = _dt_date.fromisoformat(date_str)
        except Exception:
            continue
        for tab in [f"{d.day}/{d.month}", f"{d.day}/{d.month:02d}"]:
            rows: list[list[str]] | None = None
            if body.google_token:
                rows = _fetch_via_sheets_api(sheet_id, tab, body.google_token)
            else:
                gviz_base = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq"
                try:
                    resp = httpx.get(gviz_base, params={"tqx": "out:csv", "sheet": tab},
                                     follow_redirects=True, timeout=15.0)
                    if resp.status_code == 200 and "POST LINK" in resp.text.upper():
                        rows = list(_csv.reader(_io.StringIO(resp.text)))
                except Exception:
                    pass
            if rows:
                if not header_inserted:
                    all_rows.extend(rows)
                    header_inserted = True
                else:
                    skip = 0
                    for i, r in enumerate(rows[:15]):
                        cols = [c.strip().upper() for c in r]
                        if any("POST LINK" in c for c in cols):
                            skip = i + 1
                            break
                    all_rows.extend(rows[skip:])
                tabs_synced.append(tab)
                break

    if not all_rows:
        raise HTTPException(422, "Could not fetch sheet data. Make sure the sheet is accessible.")

    result = _parse_seeding_format(all_rows)

    # ── Import comments into DB ───────────────────────────────────────────────
    try:
        pub_dt = datetime.fromisoformat(sheet_date + "T12:00:00").replace(tzinfo=timezone.utc)
    except Exception:
        pub_dt = datetime.now(timezone.utc)

    created = 0
    already_seeded = 0
    skipped_posts = 0
    errors: list[str] = []

    for section in result.get("sections", []):
        for post_entry in section.get("posts", []):
            url = post_entry.get("url", "")
            to_create: int = int(post_entry.get("deployed") or 0)
            if not url or to_create <= 0:
                continue

            db_post = db.query(Post).filter(
                Post.tenant_id == current.tenant_id,
                Post.url == url,
            ).first()

            if not db_post:
                skipped_posts += 1
                errors.append(f"Post not in DB (run sheet import first): {url[:80]}")
                continue

            existing_seeded_count = db.query(func.count(Comment.id)).filter(
                Comment.post_id == db_post.id,
                Comment.external_id.like("seeded-%"),
            ).scalar() or 0

            to_add = to_create - existing_seeded_count
            if to_add <= 0:
                already_seeded += 1
                continue

            for _ in range(to_add):
                ext_id = f"seeded-{db_post.id[:8]}-{_uuid.uuid4().hex[:10]}"
                cm = Comment(
                    id=str(_uuid.uuid4()),
                    tenant_id=current.tenant_id,
                    post_id=db_post.id,
                    external_id=ext_id,
                    author="seeded",
                    content="[Seeded positive comment]",
                    language="en",
                    published_at=pub_dt,
                )
                db.add(cm)
                db.flush()
                db.add(CommentAnalysis(
                    id=str(_uuid.uuid4()),
                    tenant_id=current.tenant_id,
                    comment_id=cm.id,
                    sentiment="Positive",
                    stance="supportive",
                    emotion=[],
                    sarcasm=False,
                    toxicity_score=0.0,
                    spam_score=0.0,
                    bot_probability=0.0,
                    confidence=0.95,
                    result={"source": "seeded"},
                ))
                created += 1
                if created % 200 == 0:
                    db.commit()

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Database error while saving seeded comments: {e}")

    return {
        "created": created,
        "already_seeded": already_seeded,
        "skipped_posts": skipped_posts,
        "errors": errors[:20],
        "tabs_synced": tabs_synced,
    }


class DailyReportSendRequest(BaseModel):
    client_id: str
    phone: str
    message: Optional[str] = None


@router.post("/daily-send")
def daily_send_report(body: DailyReportSendRequest,
                      current: CurrentUser = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    """Send a daily report summary via WhatsApp."""
    client = (db.query(Client)
              .filter(Client.id == body.client_id, Client.tenant_id == current.tenant_id)
              .first())
    if not client:
        raise HTTPException(404, "Client not found")

    # Build summary from CRM data if no message provided
    if body.message:
        msg = body.message
    else:
        send_post_ids = _post_ids_for_client(db, body.client_id)
        sent_rows = (db.query(CommentAnalysis.sentiment, func.count())
                     .join(Comment, Comment.id == CommentAnalysis.comment_id)
                     .filter(Comment.post_id.in_(send_post_ids) if send_post_ids else Comment.post_id == None)
                     .group_by(CommentAnalysis.sentiment).all()) if send_post_ids else []
        sentiment = {"Positive": 0, "Negative": 0, "Neutral": 0}
        for s, c in sent_rows:
            sentiment[s or "Neutral"] = c
        total = sum(sentiment.values()) or 1
        post_count = len(send_post_ids)

        date_str = datetime.now(timezone.utc).strftime('%d %b %Y')
        msg = (
            f"📊 *ORM Daily Report — {client.name}*\n"
            f"Date: {date_str}\n\n"
            f"📝 Posts monitored: *{post_count}*\n"
            f"💬 Total comments: *{total:,}*\n\n"
            f"✅ Positive: *{sentiment['Positive']:,}* "
            f"({round(sentiment['Positive']*100/total)}%)\n"
            f"❌ Negative: *{sentiment['Negative']:,}* "
            f"({round(sentiment['Negative']*100/total)}%)\n"
            f"⚪ Neutral: *{sentiment['Neutral']:,}* "
            f"({round(sentiment['Neutral']*100/total)}%)\n\n"
            f"_Generated by ORM CMS_"
        )

    # Use Twilio if configured, fall back to OpenWA service
    from app.api.v1.whatsapp_alerts import _get_or_create_config, _send_via_twilio
    cfg = _get_or_create_config(db, current.tenant_id)
    phone = body.phone.strip()
    # Ensure + prefix
    if phone and not phone.startswith("+") and not phone.startswith("whatsapp:"):
        phone = "+" + phone

    if cfg.twilio_account_sid and cfg.twilio_auth_token:
        ok, err = _send_via_twilio(phone, msg, cfg)
        if ok:
            return {"ok": True, "message": "Report sent via WhatsApp (Twilio)"}
        return {"ok": False, "error": err}

    # Fallback: OpenWA local service
    try:
        r = httpx.post(f"{WA_SERVICE_URL}/send",
                       json={"to": phone, "message": msg},
                       headers=_wa_headers_r(), timeout=30.0)
        if r.status_code == 200:
            return {"ok": True, "message": "Report sent via WhatsApp"}
        return {"ok": False, "error": r.json().get("error", r.text)}
    except Exception as e:
        return {"ok": False, "error": str(e)}
