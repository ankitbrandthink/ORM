"""Report generation: shared data builder -> PDF / CSV / Excel."""
import io
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Client, CommentAnalysis, Ticket


def build_report_data(db: Session, tenant_id: str, kind: str = "executive",
                      client_id: str | None = None) -> dict:
    """Single source of truth for a report's numbers, reused by every format."""
    sent_rows = (db.query(CommentAnalysis.sentiment, func.count())
                 .filter(CommentAnalysis.tenant_id == tenant_id)
                 .group_by(CommentAnalysis.sentiment).all())
    sentiment = {s or "Unknown": c for s, c in sent_rows}
    total = sum(sentiment.values()) or 1
    positive_pct = round(sentiment.get("Positive", 0) * 100 / total, 1)
    negative_pct = round(sentiment.get("Negative", 0) * 100 / total, 1)

    avg_tox = db.query(func.avg(CommentAnalysis.toxicity_score)).filter(
        CommentAnalysis.tenant_id == tenant_id).scalar() or 0.0

    open_tickets = db.query(func.count()).filter(
        Ticket.tenant_id == tenant_id,
        Ticket.status.notin_(["Resolved", "Closed"])).scalar() or 0
    resolved_tickets = db.query(func.count()).filter(
        Ticket.tenant_id == tenant_id,
        Ticket.status.in_(["Resolved", "Closed"])).scalar() or 0

    tickets = (db.query(Ticket).filter(Ticket.tenant_id == tenant_id,
               Ticket.status.notin_(["Resolved", "Closed"]))
               .order_by(Ticket.created_at.desc()).limit(25).all())

    client_name = "All Clients"
    if client_id:
        c = db.query(Client).filter(Client.id == client_id).first()
        client_name = c.name if c else client_name

    return {
        "kind": kind,
        "title": f"{kind.title()} ORM Report",
        "client_name": client_name,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "total_comments": sum(sentiment.values()),
        "sentiment": sentiment,
        "positive_pct": positive_pct,
        "negative_pct": negative_pct,
        "avg_toxicity_pct": round(float(avg_tox) * 100, 1),
        "open_tickets": open_tickets,
        "resolved_tickets": resolved_tickets,
        "tickets": [{"title": t.title, "priority": t.priority, "status": t.status,
                     "created_at": t.created_at.strftime("%Y-%m-%d") if t.created_at else ""}
                    for t in tickets],
    }


def generate_report_csv(db: Session, tenant_id: str, kind: str = "executive",
                        client_id: str | None = None) -> bytes:
    d = build_report_data(db, tenant_id, kind, client_id)
    buf = io.StringIO()
    buf.write(f"{d['title']}\nClient,{d['client_name']}\nGenerated,{d['generated_at']}\n\n")
    buf.write("Metric,Value\n")
    buf.write(f"Total comments,{d['total_comments']}\n")
    buf.write(f"Positive %,{d['positive_pct']}\n")
    buf.write(f"Negative %,{d['negative_pct']}\n")
    buf.write(f"Avg toxicity %,{d['avg_toxicity_pct']}\n")
    buf.write(f"Open tickets,{d['open_tickets']}\n")
    buf.write(f"Resolved tickets,{d['resolved_tickets']}\n\n")
    buf.write("Sentiment,Count\n")
    for s, c in d["sentiment"].items():
        buf.write(f"{s},{c}\n")
    buf.write("\nOpen Issue,Priority,Status,Created\n")
    for t in d["tickets"]:
        title = t["title"].replace(",", " ")
        buf.write(f"{title},{t['priority']},{t['status']},{t['created_at']}\n")
    return buf.getvalue().encode("utf-8")


def generate_report_xlsx(db: Session, tenant_id: str, kind: str = "executive",
                         client_id: str | None = None) -> bytes:
    d = build_report_data(db, tenant_id, kind, client_id)
    out = io.BytesIO()
    with pd.ExcelWriter(out, engine="openpyxl") as xl:
        pd.DataFrame([
            ["Title", d["title"]], ["Client", d["client_name"]],
            ["Generated", d["generated_at"]], ["Total comments", d["total_comments"]],
            ["Positive %", d["positive_pct"]], ["Negative %", d["negative_pct"]],
            ["Avg toxicity %", d["avg_toxicity_pct"]],
            ["Open tickets", d["open_tickets"]], ["Resolved tickets", d["resolved_tickets"]],
        ], columns=["Metric", "Value"]).to_excel(xl, sheet_name="Summary", index=False)
        pd.DataFrame(list(d["sentiment"].items()), columns=["Sentiment", "Count"]) \
            .to_excel(xl, sheet_name="Sentiment", index=False)
        pd.DataFrame(d["tickets"] or [{"title": "", "priority": "", "status": "", "created_at": ""}]) \
            .to_excel(xl, sheet_name="Open Issues", index=False)
    return out.getvalue()

def _safe(text: str) -> str:
    """Replace characters outside latin-1 range so fpdf built-in fonts don't choke."""
    return (text
            .replace("—", "-").replace("–", "-")   # em/en dash
            .replace("‘", "'").replace("’", "'")   # smart quotes
            .replace("“", '"').replace("”", '"')
            .replace("•", "*").replace("…", "...")
            .encode("latin-1", errors="replace").decode("latin-1"))


def generate_report_pdf(db: Session, tenant_id: str, kind: str = "executive",
                        client_id: str | None = None) -> bytes:
    """Generate a PDF report using fpdf2 (pure Python, no system deps)."""
    from fpdf import FPDF

    d = build_report_data(db, tenant_id, kind, client_id)

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # Cover
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(0, 113, 227)
    pdf.cell(0, 12, _safe(d["title"]), ln=True, align="C")
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 8, _safe(d["client_name"]), ln=True, align="C")
    pdf.cell(0, 8, _safe(f"Generated {d['generated_at']}"), ln=True, align="C")
    pdf.ln(10)

    # KPI strip
    def _section(heading: str):
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(29, 29, 31)
        pdf.set_draw_color(220, 220, 220)
        pdf.cell(0, 10, heading, ln=True)
        pdf.set_line_width(0.3)
        pdf.line(pdf.get_x(), pdf.get_y(), pdf.get_x() + 180, pdf.get_y())
        pdf.ln(3)

    _section("Executive Summary")
    kpis = [
        ("Comments Analysed", f"{d['total_comments']:,}"),
        ("Positive Sentiment", f"{d['positive_pct']}%"),
        ("Negative Sentiment", f"{d['negative_pct']}%"),
        ("Avg Toxicity", f"{d['avg_toxicity_pct']}%"),
        ("Open Tickets", str(d["open_tickets"])),
        ("Resolved Tickets", str(d["resolved_tickets"])),
    ]
    col_w = 60
    for i, (label, value) in enumerate(kpis):
        if i % 3 == 0 and i > 0:
            pdf.ln(18)
        x = pdf.get_x() + (i % 3) * col_w
        pdf.set_xy(x, pdf.get_y())
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_text_color(0, 113, 227)
        pdf.cell(col_w, 8, value)
        pdf.set_xy(x, pdf.get_y() + 8)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(col_w, 6, label)
        if i % 3 == 2:
            pdf.ln(14)
    pdf.ln(16)

    # Sentiment table
    _section("Sentiment Breakdown")
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(29, 29, 31)
    pdf.set_fill_color(245, 245, 247)
    pdf.cell(90, 8, "Sentiment", border=1, fill=True)
    pdf.cell(90, 8, "Comments", border=1, fill=True, ln=True)
    pdf.set_font("Helvetica", "", 10)
    total = sum(d["sentiment"].values()) or 1
    for sent, count in d["sentiment"].items():
        pct = round(count * 100 / total, 1)
        pdf.cell(90, 7, _safe(sent), border="LRB")
        pdf.cell(90, 7, f"{count:,}  ({pct}%)", border="LRB", ln=True)
    pdf.ln(8)

    # Open tickets
    if d["tickets"]:
        _section("Open Issues")
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_fill_color(245, 245, 247)
        pdf.cell(100, 8, "Title", border=1, fill=True)
        pdf.cell(40, 8, "Priority", border=1, fill=True)
        pdf.cell(40, 8, "Status", border=1, fill=True, ln=True)
        pdf.set_font("Helvetica", "", 9)
        for t in d["tickets"]:
            title = _safe((t["title"] or "")[:55])
            pdf.cell(100, 7, title, border="LRB")
            pdf.cell(40, 7, _safe(t["priority"] or ""), border="LRB")
            pdf.cell(40, 7, _safe(t["status"] or ""), border="LRB", ln=True)
        pdf.ln(8)

    # Recommendations
    _section("Recommendations")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)
    recs = [
        "Prioritize response to high-toxicity threads to contain crisis risk.",
        "Engage positively-leaning communities to amplify brand advocates.",
        "Resolve aging open tickets ahead of SLA breach.",
        f"Sentiment is {d['positive_pct']}% positive — {'maintain momentum.' if d['positive_pct'] >= 50 else 'action required to improve perception.'}",
    ]
    for rec in recs:
        pdf.cell(6, 7, "*")
        pdf.cell(0, 7, _safe(rec), ln=True)

    return bytes(pdf.output())
