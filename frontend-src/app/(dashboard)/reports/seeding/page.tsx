"use client";
import { useEffect, useRef, useState } from "react";
import {
  RefreshCw, Printer, Link2, CalendarDays, Users,
  FileSpreadsheet, CheckCircle2, ArrowDownToLine, X, Info,
  LogIn, LogOut, Shield, Database, Eye, FileDown,
  MessageSquare, ChevronDown, ChevronUp, ExternalLink,
  BarChart2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";

/* ─── Constants ───────────────────────────────────────────────────────────── */
const SEEDING_SHEET_ID  = "1FAttq_5SAxjjGxMwPH6HduEbTjeZGHTWLWJ_YRWkj20";
const SEEDING_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SEEDING_SHEET_ID}/edit`;
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/userinfo.email";

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface SeedPost {
  sno: number;
  url: string;
  deployed: number;
  before: number | null;
  after: number | null;
  post_sentiment: string;
  narrative: string;
  comment_sentiment: string;
  head_checked: string;
  checkers_assign: string;
  remarks: string;
  writers_link: string;
  checkers_approved: string;
  head_send: string;
}
interface SeedSection {
  client: { id: string; name: string };
  posts: SeedPost[];
  total_links: number;
  total_deployed: number;
  summary: string;
  date?: string;
}
interface SeedingReport {
  date: string;
  project_name?: string;
  sections: SeedSection[];
  grand_total_links: number;
  grand_total_deployed: number;
  total_posts: number;
  tabs_synced: string[];
  sheet_id: string;
  authenticated: boolean;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function SentimentBadge({ value }: { value: string }) {
  if (!value) return <span className="text-gray-400 text-[10px]">—</span>;
  const v = value.toLowerCase();
  const cls = v.includes("pos")
    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
    : v.includes("neg")
    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {value}
    </span>
  );
}

function BoolCell({ value }: { value: string }) {
  if (!value) return <span className="text-gray-400 text-xs">—</span>;
  const v = value.toUpperCase();
  const isTrue = v === "TRUE" || v === "YES" || v === "✓" || v === "1";
  return isTrue ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
  ) : (
    <span className="text-gray-400 text-xs">—</span>
  );
}

/* ─── EOD-format HTML Builder (matches Google Sheets EOD Report style) ──── */
function buildSeedingHtml(
  sections: SeedSection[],
  dateLabel: string,
  title = "EOD REPORT"
): string {
  const grand_total_links    = sections.reduce((a, s) => a + s.total_links, 0);
  const grand_total_deployed = sections.reduce((a, s) => a + s.total_deployed, 0);

  const clientSections = sections.map((sec) => {
    const rows = sec.posts.map((p) => `
      <tr>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;font-size:11px;">${p.sno}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;"><a href="${p.url}" style="color:#1155CC;font-size:10px;word-break:break-all;">${p.url}</a></td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;font-weight:bold;font-size:12px;">${p.deployed}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;font-size:11px;">${p.before != null ? p.before : "---"}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;font-size:11px;">${p.after  != null ? p.after  : "---"}</td>
      </tr>`).join("");

    return `
      <tr><td colspan="5" style="background:#F4921A;color:#fff;font-weight:bold;text-align:center;padding:7px 8px;border:1px solid #E07000;font-size:13px;letter-spacing:0.5px;">${sec.client.name.toUpperCase()}</td></tr>
      <tr style="background:#DAE8FC;font-weight:bold;font-size:11px;">
        <th style="border:1px solid #ccc;padding:5px 8px;width:36px;text-align:center;">Sno</th>
        <th style="border:1px solid #ccc;padding:5px 8px;text-align:left;">Links</th>
        <th style="border:1px solid #ccc;padding:5px 8px;width:130px;text-align:center;">No. of comments deployed</th>
        <th style="border:1px solid #ccc;padding:5px 8px;width:130px;text-align:center;">Comments before deployment</th>
        <th style="border:1px solid #ccc;padding:5px 8px;width:130px;text-align:center;">Comments after deployment</th>
      </tr>
      ${rows}
      <tr style="background:#FFF9E6;font-weight:bold;font-size:11px;">
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">Total</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">${sec.total_links}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">${sec.total_deployed.toLocaleString()}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">---</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">---</td>
      </tr>
      <tr><td colspan="5" style="height:10px;border:none;background:#fff;"></td></tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title} — ${dateLabel}</title>
<style>
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}
  body{font-family:Calibri,Arial,sans-serif;margin:12px;color:#000;background:#fff;}
  table{border-collapse:collapse;width:100%;font-size:11px;}
  th{font-weight:bold;}
  a{color:#1155CC;}
  @page{margin:8mm 6mm;size:A4 landscape;}
  .print-btn{display:block;margin:0 0 10px 0;padding:8px 22px;background:#1a56db;color:#fff;border:none;border-radius:5px;font-size:13px;font-weight:bold;cursor:pointer;letter-spacing:0.3px;}
  .print-btn:hover{background:#1e429f;}
  @media print{.print-btn{display:none!important;}}
</style>
</head><body>
<button class="print-btn" onclick="window.print()">🖨 Save as PDF (Ctrl+P)</button>
<table>
<tr>
  <td colspan="5" style="background:#FFFF00;text-align:center;font-weight:bold;font-size:17px;padding:10px;border:1px solid #ccc;letter-spacing:1px;">${title}</td>
  <td rowspan="3" style="width:200px;vertical-align:top;padding:0 0 0 10px;border:none;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td colspan="2" style="background:#6B1943;color:#fff;font-weight:bold;text-align:center;padding:8px;font-size:13px;">SUMMARY</td></tr>
      <tr style="font-weight:bold;font-size:11px;background:#F9F0F6;">
        <td style="border:1px solid #ccc;padding:5px;text-align:center;">Total Links</td>
        <td style="border:1px solid #ccc;padding:5px;text-align:center;">Total Comments</td>
      </tr>
      <tr>
        <td style="border:1px solid #ccc;padding:16px 5px;text-align:center;font-size:22px;font-weight:bold;">${grand_total_links}</td>
        <td style="border:1px solid #ccc;padding:16px 5px;text-align:center;font-size:22px;font-weight:bold;">${grand_total_deployed.toLocaleString()}</td>
      </tr>
    </table>
  </td>
</tr>
<tr><td colspan="5" style="text-align:center;font-weight:bold;padding:7px;border:1px solid #ddd;font-size:13px;background:#FAFAFA;">Date: ${dateLabel}</td></tr>
<tr><td colspan="5" style="height:6px;border:none;background:#fff;"></td></tr>
${clientSections}
</table>
</body></html>`;
}

/* ─── Sentiment Report HTML Builder ──────────────────────────────────────── */
function buildSentimentHtml(
  sections: SeedSection[],
  dateLabel: string,
  title = "SENTIMENT REPORT"
): string {
  const countSent = (posts: SeedPost[], field: "post_sentiment" | "comment_sentiment") => {
    let pos = 0, neg = 0, neu = 0;
    posts.forEach((p) => {
      const v = (p[field] || "").toLowerCase();
      if (v.includes("pos")) pos++;
      else if (v.includes("neg")) neg++;
      else if (v.trim()) neu++;
    });
    return { pos, neg, neu };
  };

  const sectionRows = sections.map((sec) => {
    const ps = countSent(sec.posts, "post_sentiment");
    const cs = countSent(sec.posts, "comment_sentiment");
    return `
      <tr>
        <td style="border:1px solid #ccc;padding:6px 10px;font-weight:bold;">${sec.client.name.toUpperCase()}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;">${sec.total_links}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;color:#16a34a;font-weight:bold;">${ps.pos}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;color:#dc2626;font-weight:bold;">${ps.neg}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;color:#6b7280;">${ps.neu}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;color:#16a34a;font-weight:bold;">${cs.pos}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;color:#dc2626;font-weight:bold;">${cs.neg}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;color:#6b7280;">${cs.neu}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;font-weight:bold;">${sec.total_deployed.toLocaleString()}</td>
      </tr>`;
  }).join("");

  let gPos = 0, gNeg = 0, gNeu = 0, gcPos = 0, gcNeg = 0, gcNeu = 0;
  sections.forEach((sec) => {
    const ps = countSent(sec.posts, "post_sentiment");
    const cs = countSent(sec.posts, "comment_sentiment");
    gPos += ps.pos; gNeg += ps.neg; gNeu += ps.neu;
    gcPos += cs.pos; gcNeg += cs.neg; gcNeu += cs.neu;
  });
  const grandLinks    = sections.reduce((a, s) => a + s.total_links, 0);
  const grandDeployed = sections.reduce((a, s) => a + s.total_deployed, 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title} — ${dateLabel}</title>
<style>
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}
  body{font-family:Calibri,Arial,sans-serif;margin:12px;color:#000;background:#fff;}
  table{border-collapse:collapse;width:100%;font-size:12px;}
  th{font-weight:bold;padding:7px 10px;border:1px solid #ccc;background:#DAE8FC;text-align:center;}
  @page{margin:8mm 6mm;size:A4 landscape;}
  .print-btn{display:block;margin:0 0 10px 0;padding:8px 22px;background:#1a56db;color:#fff;border:none;border-radius:5px;font-size:13px;font-weight:bold;cursor:pointer;letter-spacing:0.3px;}
  .print-btn:hover{background:#1e429f;}
  @media print{.print-btn{display:none!important;}}
</style>
</head><body>
<button class="print-btn" onclick="window.print()">🖨 Save as PDF (Ctrl+P)</button>
<table>
<tr><td colspan="9" style="background:#FFFF00;text-align:center;font-weight:bold;font-size:17px;padding:10px;border:1px solid #ccc;letter-spacing:1px;">${title}</td></tr>
<tr><td colspan="9" style="text-align:center;padding:7px;border:1px solid #ddd;font-size:13px;background:#FAFAFA;font-weight:bold;">Date: ${dateLabel}</td></tr>
<tr><td colspan="9" style="height:6px;border:none;"></td></tr>
<tr style="background:#F4921A;color:#fff;font-weight:bold;text-align:center;font-size:12px;">
  <td colspan="2" style="border:1px solid #E07000;padding:6px;">Account</td>
  <td colspan="3" style="border:1px solid #E07000;padding:6px;">Post Sentiment</td>
  <td colspan="3" style="border:1px solid #E07000;padding:6px;">Comment Sentiment</td>
  <td style="border:1px solid #E07000;padding:6px;">Comments Deployed</td>
</tr>
<tr>
  <th style="text-align:left;">Section</th>
  <th>Links</th>
  <th style="color:#16a34a;">Positive</th><th style="color:#dc2626;">Negative</th><th>Neutral</th>
  <th style="color:#16a34a;">Positive</th><th style="color:#dc2626;">Negative</th><th>Neutral</th>
  <th>Total</th>
</tr>
${sectionRows}
<tr style="background:#FFF9E6;font-weight:bold;font-size:12px;">
  <td style="border:1px solid #ccc;padding:6px 10px;">GRAND TOTAL</td>
  <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;">${grandLinks}</td>
  <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;color:#16a34a;">${gPos}</td>
  <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;color:#dc2626;">${gNeg}</td>
  <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;">${gNeu}</td>
  <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;color:#16a34a;">${gcPos}</td>
  <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;color:#dc2626;">${gcNeg}</td>
  <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;">${gcNeu}</td>
  <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;">${grandDeployed.toLocaleString()}</td>
</tr>
</table>
</body></html>`;
}

function openHtmlPreview(html: string, winTitle: string) {
  const w = window.open("", "_blank", "width=1400,height=900,scrollbars=yes");
  if (!w) { alert("Allow pop-ups to open the preview."); return; }
  w.document.title = winTitle;
  w.document.write(html);
  w.document.close();
}

function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function openPdfPreview(sections: SeedSection[], dateLabel: string, title?: string) {
  openHtmlPreview(
    buildSeedingHtml(sections, dateLabel, title),
    `${title ?? "EOD REPORT"} — ${dateLabel}`
  );
}
async function downloadPdf(sections: SeedSection[], dateLabel: string, title?: string) {
  const html = buildSeedingHtml(sections, dateLabel, title);
  const name = (title ?? "EOD_Report").replace(/[^\w\s]/g,"").replace(/\s+/g,"_");
  const filename = `${name}_${dateLabel.replace(/[\s\/]/g,"-")}.pdf`;
  try {
    const { api } = await import("@/lib/api");
    const resp = await api.post("/analytics/html-to-pdf", { html, filename }, { responseType: "arraybuffer" });
    const blob = new Blob([resp.data], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch { openPdfPreview(sections, dateLabel, title); }
}
function openSentimentPreview(sections: SeedSection[], dateLabel: string, title?: string) {
  openHtmlPreview(
    buildSentimentHtml(sections, dateLabel, title),
    `${title ?? "SENTIMENT REPORT"} — ${dateLabel}`
  );
}
async function downloadSentiment(sections: SeedSection[], dateLabel: string, title?: string) {
  const html = buildSentimentHtml(sections, dateLabel, title);
  const name = (title ?? "Sentiment_Report").replace(/[^\w\s]/g,"").replace(/\s+/g,"_");
  const filename = `${name}_Sentiment_${dateLabel.replace(/[\s\/]/g,"-")}.pdf`;
  try {
    const { api } = await import("@/lib/api");
    const resp = await api.post("/analytics/html-to-pdf", { html, filename }, { responseType: "arraybuffer" });
    const blob = new Blob([resp.data], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch { openSentimentPreview(sections, dateLabel, title); }
}

/* ─── Report action buttons ───────────────────────────────────────────────── */
function ReportActions({
  sections, dateLabel, title, compact = false,
}: {
  sections: SeedSection[]; dateLabel: string; title?: string; compact?: boolean;
}) {
  const sz = compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => openPdfPreview(sections, dateLabel, title)}
        className={`flex items-center gap-1 rounded-lg border border-white/30 bg-white/10 font-medium text-white hover:bg-white/20 ${sz}`}
      >
        <Eye className="h-3 w-3" /> EOD Preview
      </button>
      <button
        onClick={() => downloadPdf(sections, dateLabel, title)}
        className={`flex items-center gap-1 rounded-lg bg-white/20 font-semibold text-white hover:bg-white/30 ${sz}`}
      >
        <FileDown className="h-3 w-3" /> Download EOD
      </button>
    </div>
  );
}

/* ─── Account section with full column table ──────────────────────────────── */
function BoolCheck({ value }: { value: string }) {
  const v = (value || "").toUpperCase();
  const yes = v === "TRUE" || v === "YES" || v === "✓" || v === "1";
  if (!value) return <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>;
  return yes
    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
    : <span className="text-gray-400 text-xs">—</span>;
}

function NarrativeCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>;
  const short = text.length > 120;
  return (
    <div className="text-[10px] text-gray-700 dark:text-gray-300 leading-relaxed">
      {expanded || !short ? text : text.slice(0, 120) + "…"}
      {short && (
        <button onClick={() => setExpanded(e => !e)}
          className="ml-1 text-blue-500 hover:underline font-medium">
          {expanded ? "less" : "more"}
        </button>
      )}
    </div>
  );
}

function SeedClientSection({ sec, dateLabel, sectionTitle }: { sec: SeedSection; dateLabel: string; sectionTitle: string }) {
  const [expanded, setExpanded] = useState(true);

  // Detect whether we have tracker columns (any post has narrative/sentiment populated)
  const hasTrackerCols = sec.posts.some(p =>
    p.post_sentiment || p.narrative || p.comment_sentiment ||
    p.head_checked || p.checkers_assign || p.writers_link || p.checkers_approved || p.head_send
  );

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div
        className="flex items-center justify-between bg-[#F4921A] px-4 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-white tracking-wide">
            {sec.client.name.toUpperCase()}
          </span>
          {sec.date && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
              {sec.date}
            </span>
          )}
          <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-white">
            {sec.total_links} links
          </span>
          <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-white">
            {sec.total_deployed.toLocaleString()} deployed
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ReportActions
            sections={[sec]}
            dateLabel={dateLabel}
            title={sectionTitle}
            compact
          />
          {expanded ? <ChevronUp className="h-4 w-4 text-white" /> : <ChevronDown className="h-4 w-4 text-white" />}
        </div>
      </div>

      {expanded && (
        <>
          <div className="overflow-x-auto">
            <table className="border-collapse text-xs" style={{ minWidth: hasTrackerCols ? 1400 : 800, width: "100%" }}>
              <thead>
                <tr className="bg-blue-50 dark:bg-blue-950/40 text-[11px] font-semibold">
                  <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center w-9">Sno</th>
                  <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left" style={{ minWidth: 220 }}>Post Link</th>
                  <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center w-24">Post Sentiment</th>
                  {hasTrackerCols && (
                    <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-left" style={{ minWidth: 200 }}>Narrative</th>
                  )}
                  <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center w-28">Cmts Deployed</th>
                  <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center w-24">Before</th>
                  <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center w-24">After</th>
                  <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center w-24">Cmt Sentiment</th>
                  {hasTrackerCols && <>
                    <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center w-20">Head Checked</th>
                    <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-left w-28">Checkers Assign</th>
                    <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center w-20">Approved</th>
                    <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center w-20">Send Vendor</th>
                    <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-left w-32">Writers Link</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {sec.posts.map((p, i) => (
                  <tr key={p.sno} className={i % 2 === 0 ? "bg-white dark:bg-gray-950" : "bg-gray-50/60 dark:bg-gray-900/40"}>
                    <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center text-muted">{p.sno}</td>
                    <td className="border border-gray-200 dark:border-gray-700 px-3 py-1.5">
                      <a href={p.url} target="_blank" rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-[10px] flex items-center gap-1 min-w-0">
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate" style={{ maxWidth: 280 }}>{p.url}</span>
                      </a>
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center">
                      <SentimentBadge value={p.post_sentiment} />
                    </td>
                    {hasTrackerCols && (
                      <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 align-top">
                        <NarrativeCell text={p.narrative} />
                      </td>
                    )}
                    <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center font-bold text-emerald-700 dark:text-emerald-400">{p.deployed}</td>
                    <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center text-amber-700 dark:text-amber-400">{p.before ?? "—"}</td>
                    <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center text-sky-700 dark:text-sky-400">{p.after ?? "—"}</td>
                    <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center">
                      <SentimentBadge value={p.comment_sentiment} />
                    </td>
                    {hasTrackerCols && <>
                      <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center">
                        <BoolCheck value={p.head_checked} />
                      </td>
                      <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-[10px]">
                        {p.checkers_assign || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center">
                        <BoolCheck value={p.checkers_approved} />
                      </td>
                      <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center">
                        <BoolCheck value={p.head_send} />
                      </td>
                      <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5">
                        {p.writers_link ? (
                          <a href={p.writers_link} target="_blank" rel="noopener noreferrer"
                            className="text-blue-500 hover:underline text-[10px] flex items-center gap-1">
                            <ExternalLink className="h-2.5 w-2.5 shrink-0" /> Link
                          </a>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                    </>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-amber-50 dark:bg-amber-950/30 font-semibold text-[11px]">
                  <td className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center">{sec.total_links}</td>
                  <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">Total</td>
                  <td className="border border-gray-200 dark:border-gray-700 px-2 py-2" />
                  {hasTrackerCols && <td className="border border-gray-200 dark:border-gray-700 px-2 py-2" />}
                  <td className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                    {sec.total_deployed.toLocaleString()}
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center text-muted">---</td>
                  <td className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center text-muted">---</td>
                  {hasTrackerCols
                    ? <td colSpan={6} className="border border-gray-200 dark:border-gray-700 px-2 py-2" />
                    : <td className="border border-gray-200 dark:border-gray-700 px-2 py-2" />}
                </tr>
              </tfoot>
            </table>
          </div>
          {sec.summary && (
            <div className="border-t border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-2 text-center text-[11px] text-gray-600 dark:text-gray-400">
              {sec.summary}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Sentiment section card ──────────────────────────────────────────────── */
function SentimentSection({ sec }: { sec: SeedSection }) {
  const count = (field: "post_sentiment" | "comment_sentiment") => {
    let pos = 0, neg = 0, neu = 0;
    sec.posts.forEach((p) => {
      const v = (p[field] || "").toLowerCase();
      if (v.includes("pos")) pos++;
      else if (v.includes("neg")) neg++;
      else if (v.trim()) neu++;
    });
    return { pos, neg, neu };
  };
  const ps = count("post_sentiment");
  const cs = count("comment_sentiment");

  const Chip = ({ v, color }: { v: number; color: string }) => (
    <span className={`text-sm font-bold ${color}`}>{v}</span>
  );

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="bg-[#F4921A] px-4 py-2.5 flex items-center justify-between">
        <span className="text-sm font-bold text-white tracking-wide">{sec.client.name.toUpperCase()}</span>
        <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-white">{sec.total_links} links</span>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs w-full">
          <thead>
            <tr className="bg-blue-50 dark:bg-blue-950/40 font-semibold text-[11px]">
              <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left" style={{ minWidth: 260 }}>Post Link</th>
              <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center w-28">Post Sentiment</th>
              <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center w-28">Comment Sentiment</th>
              <th className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center w-24">Deployed</th>
            </tr>
          </thead>
          <tbody>
            {sec.posts.map((p, i) => (
              <tr key={p.sno} className={i % 2 === 0 ? "bg-white dark:bg-gray-950" : "bg-gray-50/60 dark:bg-gray-900/40"}>
                <td className="border border-gray-200 dark:border-gray-700 px-3 py-1.5">
                  <a href={p.url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-[10px] flex items-center gap-1">
                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate" style={{ maxWidth: 320 }}>{p.url}</span>
                  </a>
                </td>
                <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center">
                  <SentimentBadge value={p.post_sentiment} />
                </td>
                <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center">
                  <SentimentBadge value={p.comment_sentiment} />
                </td>
                <td className="border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center font-bold text-emerald-700 dark:text-emerald-400">{p.deployed}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-amber-50 dark:bg-amber-950/30 font-semibold text-[11px]">
              <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">
                Posts Sentiment — Pos: <Chip v={ps.pos} color="text-green-600" /> Neg: <Chip v={ps.neg} color="text-red-600" /> Neu: <Chip v={ps.neu} color="text-gray-500" />
              </td>
              <td className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center" />
              <td className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center">
                Cmts — Pos: <Chip v={cs.pos} color="text-green-600" /> Neg: <Chip v={cs.neg} color="text-red-600" /> Neu: <Chip v={cs.neu} color="text-gray-500" />
              </td>
              <td className="border border-gray-200 dark:border-gray-700 px-2 py-2 text-center text-emerald-700 dark:text-emerald-400 font-bold">
                {sec.total_deployed.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ─── Summary stat bar ────────────────────────────────────────────────────── */
function SummaryBar({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-4">
          {i > 0 && <div className="h-6 border-l border-border" />}
          <div>
            <div className="text-xs text-muted">{item.label}</div>
            <div className="font-semibold text-sm">{item.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */
export default function SeedingReportPage() {
  /* Mode: daily or period */
  const [mode, setMode] = useState<"daily" | "period">("daily");

  /* Daily controls */
  const [date,              setDate]              = useState(new Date().toISOString().slice(0, 10));
  const [gidOverride,       setGidOverride]       = useState("");
  const [acctFilter,        setAcctFilter]        = useState("");
  const [reportTitleOverride, setReportTitleOverride] = useState("");
  const [allClients,  setAllClients]  = useState<{ id: string; name: string }[]>([]);
  const [syncing,     setSyncing]     = useState(false);
  const [report,      setReport]      = useState<SeedingReport | null>(null);
  const [error,       setError]       = useState("");
  const [importingDb, setImportingDb] = useState(false);
  const [importRes,   setImportRes]   = useState<{
    created: number; already_seeded: number; skipped_posts: number; errors: string[];
  } | null>(null);

  /* Period controls */
  const [periodFrom,    setPeriodFrom]    = useState("");
  const [periodTo,      setPeriodTo]      = useState("");
  const [periodAcct,    setPeriodAcct]    = useState("");
  const [periodSyncing, setPeriodSyncing] = useState(false);
  const [periodReport,  setPeriodReport]  = useState<SeedingReport | null>(null);

  /* Result tab */
  const [activeTab, setActiveTab] = useState<"eod" | "sentiment">("eod");

  /* Google OAuth */
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [googleToken,    setGoogleToken]    = useState<string | null>(null);
  const [googleEmail,    setGoogleEmail]    = useState<string | null>(null);
  const [gisReady,       setGisReady]       = useState(false);
  const tokenClientRef = useRef<any>(null);

  const dateLabel   = mode === "daily" ? (date || "—") : `${periodFrom || "?"} → ${periodTo || "?"}`;
  const activeReport = mode === "daily" ? report : periodReport;
  const baseSections = activeReport?.sections ?? [];
  const filterStr   = mode === "daily" ? acctFilter : periodAcct;
  const displayedSections = baseSections.filter((sec) =>
    !filterStr || sec.client.name.toLowerCase().includes(filterStr.toLowerCase())
  );

  useEffect(() => {
    api.get("/reports/google-auth-config")
      .then((r) => setGoogleClientId(r.data.client_id || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/reports/daily-clients")
      .then((r) => setAllClients((r.data.clients || []).map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (oauthRequired) return;
    api.post("/reports/seeding-report", { date })
      .then(({ data }) => setReport(data))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!googleClientId || gisReady) return;
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) { setGisReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => setGisReady(true);
    document.head.appendChild(s);
  }, [googleClientId, gisReady]);

  useEffect(() => {
    if (!gisReady || !googleClientId) return;
    const g = (window as any).google;
    if (!g?.accounts?.oauth2) return;
    tokenClientRef.current = g.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: SCOPE,
      callback: async (resp: any) => {
        if (resp.error) {
          setError("Google sign-in failed: " + (resp.error_description || resp.error));
          return;
        }
        setGoogleToken(resp.access_token);
        try {
          const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${resp.access_token}` },
          }).then((r) => r.json());
          setGoogleEmail(info.email || "Google Account");
        } catch { setGoogleEmail("Google Account"); }
      },
    });
  }, [gisReady, googleClientId]);

  function signInGoogle() { tokenClientRef.current?.requestAccessToken({ prompt: "consent" }); }
  function signOutGoogle() {
    const g = (window as any).google;
    if (g?.accounts?.oauth2 && googleToken) g.accounts.oauth2.revoke(googleToken, () => {});
    setGoogleToken(null); setGoogleEmail(null); setReport(null); setPeriodReport(null);
  }

  const oauthRequired = !!googleClientId && !googleToken;

  async function importToDb() {
    setImportingDb(true); setImportRes(null);
    try {
      const body: any = {};
      if (googleToken) body.google_token = googleToken;
      if (mode === "period") { body.date_from = periodFrom; body.date_to = periodTo; }
      else body.date = date;
      const { data } = await api.post("/reports/seeding-import", body);
      setImportRes(data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to import seeded comments.");
    } finally { setImportingDb(false); }
  }

  async function syncDaily() {
    setSyncing(true); setReport(null); setError(""); setImportRes(null);
    try {
      const body: any = {};
      if (googleToken) body.google_token = googleToken;
      if (gidOverride) body.gid = gidOverride.trim();
      else body.date = date;
      const { data } = await api.post("/reports/seeding-report", body);
      setReport(data);
    } catch (e: any) {
      if (e.response?.status === 401) {
        setGoogleToken(null); setGoogleEmail(null);
        setError("Google session expired. Please sign in again.");
      } else if (e.response?.status === 403) {
        setError("Your Google account doesn't have access to this sheet.");
      } else {
        setError(e.response?.data?.detail || "Could not sync sheet.");
      }
    } finally { setSyncing(false); }
  }

  async function syncPeriod() {
    if (!periodFrom || !periodTo) return;
    setPeriodSyncing(true); setPeriodReport(null); setError("");
    try {
      const body: any = { date_from: periodFrom, date_to: periodTo };
      if (googleToken) body.google_token = googleToken;
      const { data } = await api.post("/reports/seeding-report", body);
      setPeriodReport(data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Period fetch failed.");
    } finally { setPeriodSyncing(false); }
  }

  const isSyncing = mode === "daily" ? syncing : periodSyncing;
  const reportTitle = reportTitleOverride.trim() || activeReport?.project_name?.toUpperCase() || "EOD REPORT";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">EOD Report</h1>
        <p className="text-sm text-muted">
          Generate EOD-format comment deployment reports and sentiment breakdowns from the researcher Google Sheet.
        </p>
      </div>

      {/* Sheet info + Google auth */}
      <div className="flex flex-wrap gap-3">
        <Card className="flex flex-1 min-w-[280px] flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Connected Sheet</span>
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Active
              </span>
            </div>
            <div className="text-[11px] text-muted truncate">
              23-02-writer — Researcher Sheet · {SEEDING_SHEET_ID}
            </div>
          </div>
          <a href={SEEDING_SHEET_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 shrink-0">
            <Link2 className="h-3.5 w-3.5" /> Open Sheet
          </a>
        </Card>

        {googleClientId && (
          <Card className="flex min-w-[260px] items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Shield className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            </div>
            <div className="flex-1 min-w-0">
              {googleEmail ? (
                <>
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">● Signed in</div>
                  <div className="text-[11px] text-muted truncate">{googleEmail}</div>
                </>
              ) : (
                <>
                  <div className="text-xs font-semibold">Google Account</div>
                  <div className="text-[11px] text-muted">Required to access private sheet</div>
                </>
              )}
            </div>
            {googleEmail ? (
              <button onClick={signOutGoogle}
                className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 shrink-0">
                <LogOut className="h-3.5 w-3.5" /> Sign Out
              </button>
            ) : (
              <button onClick={signInGoogle} disabled={!gisReady}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 shrink-0">
                <LogIn className="h-3.5 w-3.5" />
                {gisReady ? "Sign in with Google" : "Loading…"}
              </button>
            )}
          </Card>
        )}
      </div>

      {/* ══ REPORT CONTROLS ══════════════════════════════════════════════════ */}
      <Card className="space-y-4">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 w-fit">
          {(["daily", "period"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
                mode === m
                  ? "bg-white dark:bg-gray-700 text-foreground shadow"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {m === "daily" ? "📅 Daily Report" : "📆 Period Report"}
            </button>
          ))}
        </div>

        {/* Date inputs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {mode === "daily" ? (
            <>
              <div>
                <label className="mb-1 block text-xs text-muted">
                  <CalendarDays className="inline h-3 w-3 mr-1" />Date (Sheet Tab)
                </label>
                <input type="date" value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Sheet GID (optional override)</label>
                <input type="text" value={gidOverride}
                  onChange={(e) => setGidOverride(e.target.value)}
                  placeholder="e.g. 1777158762"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs text-muted">
                  <CalendarDays className="inline h-3 w-3 mr-1" />From Date
                </label>
                <input type="date" value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">To Date</label>
                <input type="date" value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-xs text-muted">
              <Users className="inline h-3 w-3 mr-1" />Filter by Account
            </label>
            <select
              value={mode === "daily" ? acctFilter : periodAcct}
              onChange={(e) => mode === "daily" ? setAcctFilter(e.target.value) : setPeriodAcct(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">All Accounts</option>
              {(baseSections.length > 0 ? baseSections : allClients).map((s) => {
                const name = "client" in s ? s.client.name : (s as any).name;
                return <option key={name} value={name}>{name}</option>;
              })}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Report Title (yellow header)</label>
            <input
              type="text"
              value={reportTitleOverride}
              onChange={(e) => setReportTitleOverride(e.target.value)}
              placeholder={activeReport?.project_name?.toUpperCase() || "e.g. THE GUYANA PROJECT"}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {oauthRequired && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <button onClick={signInGoogle} className="font-semibold underline hover:no-underline">Sign in with Google</button>{" "}
              to access this private sheet.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={mode === "daily" ? syncDaily : syncPeriod}
            disabled={isSyncing || oauthRequired || (mode === "daily" ? !date : (!periodFrom || !periodTo))}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {isSyncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
            {isSyncing ? "Syncing from sheet…" : "Sync from Sheet"}
          </button>

          {displayedSections.length > 0 && (
            <>
              <button
                onClick={() => openPdfPreview(displayedSections, dateLabel, reportTitle)}
                className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Eye className="h-3.5 w-3.5" /> Preview EOD Report
              </button>
              <button
                onClick={() => downloadPdf(displayedSections, dateLabel, reportTitle)}
                className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
              >
                <FileDown className="h-3.5 w-3.5" /> Download EOD
              </button>
              <button
                onClick={() => openSentimentPreview(displayedSections, dateLabel, "SENTIMENT REPORT")}
                className="flex items-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300"
              >
                <BarChart2 className="h-3.5 w-3.5" /> Preview Sentiment
              </button>
              <button
                onClick={() => downloadSentiment(displayedSections, dateLabel, "SENTIMENT REPORT")}
                className="flex items-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300"
              >
                <FileDown className="h-3.5 w-3.5" /> Download Sentiment
              </button>
              <button
                onClick={importToDb}
                disabled={importingDb}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {importingDb ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                {importingDb ? "Saving…" : "Save to Dashboard"}
              </button>
            </>
          )}
        </div>

        {importRes && (
          <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
            importRes.created > 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
          }`}>
            <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <span className="font-semibold">
                {importRes.created > 0 ? `✓ ${importRes.created.toLocaleString()} seeded comments saved.` : "No new comments to import."}
              </span>
              {importRes.already_seeded > 0 && <span className="ml-2 text-muted">({importRes.already_seeded} already seeded.)</span>}
              {importRes.skipped_posts > 0 && <div className="mt-0.5">{importRes.skipped_posts} posts not found — run Import Data → Google Sheet first.</div>}
            </div>
          </div>
        )}
      </Card>

      {/* ══ RESULTS ══════════════════════════════════════════════════════════ */}
      {displayedSections.length > 0 && (
        <div className="space-y-4">
          {/* Summary bar */}
          <SummaryBar items={[
            { label: mode === "daily" ? "Date" : "Period", value: dateLabel },
            { label: "Total Links",       value: displayedSections.reduce((a, s) => a + s.total_links, 0) },
            { label: "Total Comments",    value: displayedSections.reduce((a, s) => a + s.total_deployed, 0).toLocaleString() },
            { label: "Accounts",          value: displayedSections.length },
            ...(activeReport?.tabs_synced?.length ? [{ label: "Tabs", value: activeReport.tabs_synced.join(", ") }] : []),
            ...(activeReport?.authenticated ? [{ label: "Auth", value: "🔒 Private" }] : []),
          ]} />

          {/* Tab switcher */}
          <div className="flex items-center gap-1 border-b border-border">
            <button
              onClick={() => setActiveTab("eod")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "eod"
                  ? "border-violet-600 text-violet-600 dark:text-violet-400"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <FileDown className="h-3.5 w-3.5" /> EOD Report
            </button>
            <button
              onClick={() => setActiveTab("sentiment")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "sentiment"
                  ? "border-violet-600 text-violet-600 dark:text-violet-400"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <BarChart2 className="h-3.5 w-3.5" /> Sentiment Reports
            </button>
          </div>

          {/* Tab content */}
          {activeTab === "eod" ? (
            <div className="space-y-3">
              {displayedSections.map((sec, i) => (
                <SeedClientSection key={`${sec.client.id}-${sec.date ?? i}`} sec={sec} dateLabel={sec.date ?? dateLabel} sectionTitle={`${reportTitle} — ${sec.client.name.toUpperCase()}`} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Sentiment summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(() => {
                  let pos = 0, neg = 0, neu = 0;
                  displayedSections.forEach((s) => s.posts.forEach((p) => {
                    const v = (p.post_sentiment || "").toLowerCase();
                    if (v.includes("pos")) pos++;
                    else if (v.includes("neg")) neg++;
                    else if (v.trim()) neu++;
                  }));
                  return [
                    { label: "Positive Posts", value: pos, color: "text-green-600 dark:text-green-400" },
                    { label: "Negative Posts", value: neg, color: "text-red-600 dark:text-red-400" },
                    { label: "Neutral Posts", value: neu, color: "text-gray-500" },
                    { label: "Total Deployed", value: displayedSections.reduce((a, s) => a + s.total_deployed, 0).toLocaleString(), color: "text-violet-600 dark:text-violet-400" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-border bg-card p-4">
                      <div className="text-xs text-muted mb-1">{item.label}</div>
                      <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                    </div>
                  ));
                })()}
              </div>
              {displayedSections.map((sec, i) => (
                <SentimentSection key={`${sec.client.id}-${sec.date ?? i}`} sec={sec} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeReport && displayedSections.length === 0 && (
        <Card>
          <p className="text-sm text-muted">
            No data found for this date/account filter. The sheet tab for this date may not exist yet.
          </p>
        </Card>
      )}
    </div>
  );
}
