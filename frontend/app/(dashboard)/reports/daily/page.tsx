"use client";
import { useEffect, useRef, useState } from "react";
import {
  Eye, Send, Printer, TrendingDown, TrendingUp, Minus,
  RefreshCw, FileBarChart2, X, FileText, Download,
  Link2, CheckCircle2, CalendarDays, Users, Database,
  TableProperties, ArrowDownToLine,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button } from "@/components/ui/primitives";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface ClientSummary {
  id: string; name: string; industry: string;
  posts: number; comments: number; analyzed_comments: number;
  sentiment: { Positive: number; Negative: number; Neutral: number };
  positive_pct: number; negative_pct: number; neutral_pct: number;
  crisis: boolean; top_topics: string; latest_date: string | null;
  data_range?: string;
  sheet_url?: string;
}
interface DailyRow {
  date: string;
  positive: number; negative: number; neutral: number; total: number;
  positive_pct: number; negative_pct: number; neutral_pct: number;
}
interface AccountRow {
  platform: string; handle: string;
  posts: number; comments: number;
  sentiment: { Positive: number; Negative: number; Neutral: number };
  positive_pct: number; negative_pct: number; neutral_pct: number;
}
interface ClientDetail {
  client: { id: string; name: string; industry: string };
  daily: DailyRow[]; total_days: number;
  narratives: { topic: string; count: number }[];
  keywords: { word: string; count: number }[];
  accounts?: AccountRow[];
}
interface EodPost {
  sno: number; url: string; deployed: number;
  before: number | null; after: number | null;
}
interface EodSection {
  client: { id: string; name: string };
  posts: EodPost[]; total_links: number; total_deployed: number;
  summary: string; total_before?: number | null; total_after?: number | null; date?: string;
}
interface FullEodReport {
  date: string; sections: EodSection[];
  grand_total_links: number; grand_total_deployed: number;
  project_name?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function SentBar({ pos, neg, neu }: { pos: number; neg: number; neu: number }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full">
      <div className="bg-emerald-500" style={{ width: `${pos}%` }} />
      <div className="bg-rose-500" style={{ width: `${neg}%` }} />
      <div className="bg-gray-300 dark:bg-gray-600" style={{ width: `${neu}%` }} />
    </div>
  );
}
function Badge({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label} {pct}%
    </span>
  );
}
function TrendIcon({ pct }: { pct: number }) {
  if (pct >= 50) return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (pct >= 30) return <Minus className="h-4 w-4 text-amber-500" />;
  return <TrendingDown className="h-4 w-4 text-rose-500" />;
}

/* ─── Overlay ───────────────────────────────────────────────────────────── */
function Overlay({ onClose, title, wide, actions, children }: {
  onClose: () => void; title: string; wide?: boolean;
  actions?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-10" onClick={onClose}>
      <div
        className={`relative flex w-full flex-col rounded-2xl border border-border bg-card shadow-2xl ${wide ? "max-w-5xl" : "max-w-2xl"}`}
        style={{ maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="ml-3 text-muted hover:text-fg"><X className="h-5 w-5" /></button>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-black/5 px-5 py-2.5 dark:bg-white/5">
            {actions}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ─── EOD HTML builder ──────────────────────────────────────────────────── */
function buildEodHtml(sections: EodSection[], date: string, grandLinks: number, grandDeployed: number, reportTitle?: string): string {
  const title = reportTitle || (sections.length === 1 ? sections[0].client.name.toUpperCase() : "ORM DAILY REPORT");
  const clientSections = sections.map((sec) => {
    const rows = sec.posts.map((p) => `
      <tr>
        <td style="border:1px solid #ccc;padding:4px 8px;text-align:center;">${p.sno}</td>
        <td style="border:1px solid #ccc;padding:4px 8px;"><a href="${p.url}" style="color:#1155CC;word-break:break-all;">${p.url}</a></td>
        <td style="border:1px solid #ccc;padding:4px 8px;text-align:center;">${p.deployed}</td>
        <td style="border:1px solid #ccc;padding:4px 8px;text-align:center;">${p.before ?? "---"}</td>
        <td style="border:1px solid #ccc;padding:4px 8px;text-align:center;">${p.after ?? "---"}</td>
      </tr>`).join("");
    return `
      <tr><td colspan="5" style="background:#F4921A;color:#fff;font-weight:bold;text-align:center;padding:7px 8px;border:1px solid #E07000;font-size:13px;letter-spacing:0.5px;">${sec.client.name.toUpperCase()}</td></tr>
      <tr style="background:#FFF9E6;font-weight:bold;font-size:11px;">
        <th style="border:1px solid #ccc;padding:5px 8px;width:40px;">Sno</th>
        <th style="border:1px solid #ccc;padding:5px 8px;">Links</th>
        <th style="border:1px solid #ccc;padding:5px 8px;width:100px;">Comments deployed</th>
        <th style="border:1px solid #ccc;padding:5px 8px;width:100px;">Before deployment</th>
        <th style="border:1px solid #ccc;padding:5px 8px;width:100px;">After deployment</th>
      </tr>
      ${rows}
      <tr style="background:#FFF9E6;font-weight:bold;">
        <td colspan="2" style="border:1px solid #ccc;padding:5px 8px;text-align:center;">Total</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">${sec.total_deployed.toLocaleString()}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">${sec.total_before != null ? sec.total_before.toLocaleString() : "---"}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">${sec.total_after != null ? sec.total_after.toLocaleString() : "---"}</td>
      </tr>
      <tr><td colspan="5" style="padding:8px;font-size:11px;text-align:center;background:#FFFDE7;border:1px solid #E8E0B0;color:#555;">${sec.summary}</td></tr>
      <tr><td colspan="5" style="height:12px;border:none;background:#fff;"></td></tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} — EOD ${date}</title>
<style>body{font-family:Calibri,Arial,sans-serif;margin:16px;color:#000;background:#fff;}table{border-collapse:collapse;width:100%;font-size:12px;}th{font-weight:bold;}a{color:#1155CC;}@page{margin:12mm 10mm;size:A4 landscape;}</style>
</head><body><table>
<tr><td colspan="5" style="background:#FFFF00;text-align:center;font-weight:bold;font-size:16px;padding:10px;border:1px solid #ccc;letter-spacing:1px;">${title}</td>
<td rowspan="3" style="width:220px;vertical-align:top;padding:0;border:none;"><table style="width:100%;border-collapse:collapse;height:100%;">
<tr><td colspan="2" style="background:#6B1943;color:#fff;font-weight:bold;text-align:center;padding:8px;border:1px solid #6B1943;font-size:13px;">SUMMARY</td></tr>
<tr style="font-weight:bold;font-size:11px;background:#F9F0F6;"><td style="border:1px solid #ccc;padding:5px;text-align:center;">Total Links</td><td style="border:1px solid #ccc;padding:5px;text-align:center;">Total Comments</td></tr>
<tr><td style="border:1px solid #ccc;padding:14px 5px;text-align:center;font-size:20px;font-weight:bold;">${grandLinks}</td><td style="border:1px solid #ccc;padding:14px 5px;text-align:center;font-size:20px;font-weight:bold;">${grandDeployed.toLocaleString()}</td></tr>
</table></td></tr>
<tr><td colspan="5" style="text-align:center;font-weight:bold;padding:7px;border:1px solid #ddd;font-size:13px;background:#FAFAFA;">EOD — ${date}</td></tr>
<tr><td colspan="5" style="height:6px;border:none;background:#fff;"></td></tr>
${clientSections}</table>
<script>window.onload=function(){window.print();}</script></body></html>`;
}

function openEodPdf(sections: EodSection[], date: string, grandLinks: number, grandDeployed: number, reportTitle?: string) {
  const w = window.open("", "_blank", "width=1300,height=900,scrollbars=yes");
  if (!w) { alert("Allow pop-ups to open the PDF preview."); return; }
  w.document.write(buildEodHtml(sections, date, grandLinks, grandDeployed, reportTitle));
  w.document.close();
}

async function downloadEodPdf(sections: EodSection[], date: string, grandLinks: number, grandDeployed: number, reportTitle?: string) {
  const html = buildEodHtml(sections, date, grandLinks, grandDeployed, reportTitle);
  const title = reportTitle || (sections.length === 1 ? sections[0].client.name : "ORM_Daily_Report");
  const filename = `${title.replace(/[^\w\s]/g,"").replace(/\s+/g,"_")}_EOD_${date.replace(/\//g,"-")}.pdf`;
  try {
    const { api } = await import("@/lib/api");
    const resp = await api.post("/analytics/html-to-pdf", { html, filename }, { responseType: "arraybuffer" });
    const blob = new Blob([resp.data], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch { openEodPdf(sections, date, grandLinks, grandDeployed, reportTitle); }
}

/* ─── EodClientSection (modal preview) ──────────────────────────────────── */
function EodClientSection({ sec }: { sec: EodSection }) {
  return (
    <div className="mb-4">
      <div className="bg-[#F4921A] py-1.5 text-center text-xs font-bold text-white">{sec.client.name.toUpperCase()}</div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-amber-50 font-semibold text-[11px]">
            <th className="border border-gray-300 px-2 py-1.5 text-center w-8">Sno</th>
            <th className="border border-gray-300 px-3 py-1.5 text-left">Links</th>
            <th className="border border-gray-300 px-2 py-1.5 text-center w-20">Deployed</th>
            <th className="border border-gray-300 px-2 py-1.5 text-center w-20">Before</th>
            <th className="border border-gray-300 px-2 py-1.5 text-center w-20">After</th>
          </tr>
        </thead>
        <tbody>
          {sec.posts.map((p, i) => (
            <tr key={p.sno} className={i % 2 === 0 ? "bg-white" : "bg-amber-50/20"}>
              <td className="border border-gray-300 px-2 py-1 text-center text-muted">{p.sno}</td>
              <td className="border border-gray-300 px-3 py-1">
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 hover:underline">{p.url}</a>
              </td>
              <td className="border border-gray-300 px-2 py-1 text-center">{p.deployed}</td>
              <td className="border border-gray-300 px-2 py-1 text-center text-amber-700">{p.before ?? "---"}</td>
              <td className="border border-gray-300 px-2 py-1 text-center text-emerald-700">{p.after ?? "---"}</td>
            </tr>
          ))}
          <tr className="bg-amber-50 font-semibold text-[11px]">
            <td colSpan={2} className="border border-gray-300 px-3 py-1 text-center">Total</td>
            <td className="border border-gray-300 px-2 py-1 text-center">{sec.total_deployed.toLocaleString()}</td>
            <td className="border border-gray-300 px-2 py-1 text-center text-amber-700">
              {sec.total_before != null ? sec.total_before.toLocaleString() : "---"}
            </td>
            <td className="border border-gray-300 px-2 py-1 text-center text-emerald-700">
              {sec.total_after != null ? sec.total_after.toLocaleString() : "---"}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="border border-t-0 border-gray-300 bg-yellow-50 px-3 py-2 text-center text-[11px] text-gray-600">{sec.summary}</div>
    </div>
  );
}

/* ─── Full EOD Modal ─────────────────────────────────────────────────────── */
function FullEodModal({ open, onClose, report, loading, onSend, reportTitle }: {
  open: boolean; onClose: () => void; report: FullEodReport | null;
  loading: boolean; onSend: () => void; reportTitle?: string;
}) {
  if (!open) return null;
  function doPrint() {
    if (!report) return;
    downloadEodPdf(report.sections, report.date, report.grand_total_links, report.grand_total_deployed, reportTitle);
  }
  return (
    <Overlay wide onClose={onClose}
      title={report ? `${reportTitle ?? "EOD Report"} — ${report.date}` : "EOD Daily Report"}
      actions={<>
        <Button onClick={doPrint} className="flex items-center gap-1.5 text-sm"><Printer className="h-3.5 w-3.5" /> Download / Print PDF</Button>
        <Button variant="ghost" onClick={onSend} className="flex items-center gap-1.5 text-sm"><Send className="h-3.5 w-3.5" /> Send to WhatsApp</Button>
        <span className="ml-auto text-xs text-muted">Pop-ups must be allowed for PDF</span>
      </>}>
      {loading ? (
        <div className="flex h-40 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-muted" /></div>
      ) : !report ? null : (
        <div>
          <div className="mb-4 overflow-hidden rounded-xl border border-gray-300">
            <div className="flex">
              <div className="flex-1">
                <div className="bg-yellow-300 py-2 text-center text-sm font-bold tracking-widest text-black">{reportTitle ?? "EOD REPORT"}</div>
                <div className="border-b border-gray-300 bg-gray-50 py-1.5 text-center text-xs font-semibold">EOD — {report.date}</div>
              </div>
              <div className="w-48 shrink-0 border-l border-gray-300">
                <div className="bg-[#6B1943] py-1.5 text-center text-xs font-bold text-white">SUMMARY</div>
                <div className="flex border-b border-gray-300 text-[11px] font-semibold">
                  <div className="flex-1 border-r border-gray-300 py-1 text-center">Total Links</div>
                  <div className="flex-1 py-1 text-center">Total Comments</div>
                </div>
                <div className="flex">
                  <div className="flex-1 border-r border-gray-300 py-3 text-center text-xl font-bold">{report.grand_total_links}</div>
                  <div className="flex-1 py-3 text-center text-xl font-bold">{report.grand_total_deployed.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-0 overflow-x-auto">
            {report.sections.map((sec) => <EodClientSection key={sec.client.id} sec={sec} />)}
          </div>
        </div>
      )}
    </Overlay>
  );
}

/* ─── Sentiments Modal ───────────────────────────────────────────────────── */
function SentimentsModal({ open, onClose, detail, summary, onSend, onPreviewPdf }: {
  open: boolean; onClose: () => void;
  detail: ClientDetail | null; summary: ClientSummary | null;
  onSend: () => void; onPreviewPdf: () => void;
}) {
  if (!open || !detail || !summary) return null;
  return (
    <Overlay onClose={onClose} title={`Sentiments — ${detail.client.name}`}
      actions={<>
        <Button onClick={onPreviewPdf} className="flex items-center gap-1.5 text-sm"><FileText className="h-3.5 w-3.5" /> Preview PDF</Button>
        <Button variant="ghost" onClick={onSend} className="flex items-center gap-1.5 text-sm"><Send className="h-3.5 w-3.5" /> Send Report</Button>
      </>}>
      <div className="space-y-5 text-sm">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Posts", value: summary.posts.toLocaleString(), color: "text-blue-600" },
            { label: "Comments", value: summary.comments.toLocaleString(), color: "text-indigo-600" },
            { label: "Days active", value: detail.total_days, color: "text-violet-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-border p-3">
              <div className="text-xs text-muted">{label}</div>
              <div className={`mt-1 text-lg font-semibold ${color}`}>{value}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="mb-2 font-medium">Sentiment Overview</div>
          <div className="mb-3 flex gap-4 text-xs">
            <span className="text-emerald-600">■ Positive {summary.positive_pct}%</span>
            <span className="text-rose-500">■ Negative {summary.negative_pct}%</span>
            <span className="text-muted">■ Neutral {summary.neutral_pct}%</span>
          </div>
          <SentBar pos={summary.positive_pct} neg={summary.negative_pct} neu={summary.neutral_pct} />
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span>✅ {summary.sentiment.Positive.toLocaleString()}</span>
            <span>❌ {summary.sentiment.Negative.toLocaleString()}</span>
            <span>⚪ {summary.sentiment.Neutral.toLocaleString()}</span>
          </div>
        </div>
        {detail.daily.length > 0 && (
          <div>
            <div className="mb-2 font-medium">Daily Breakdown</div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-muted">Date</th>
                    <th className="px-3 py-2 text-right text-muted">Total</th>
                    <th className="px-3 py-2 text-right text-emerald-600">Pos</th>
                    <th className="px-3 py-2 text-right text-rose-500">Neg</th>
                    <th className="px-3 py-2 text-right text-muted">Neu</th>
                    <th className="px-3 py-2 w-20">Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.daily.slice().reverse().map((row) => (
                    <tr key={row.date} className="border-t border-border/50 hover:bg-black/5 dark:hover:bg-white/5">
                      <td className="px-3 py-1.5 font-medium">{row.date}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.total.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-600">{row.positive_pct}%</td>
                      <td className="px-3 py-1.5 text-right text-rose-500">{row.negative_pct}%</td>
                      <td className="px-3 py-1.5 text-right text-muted">{row.neutral_pct}%</td>
                      <td className="px-3 py-1.5"><SentBar pos={row.positive_pct} neg={row.negative_pct} neu={row.neutral_pct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {detail.accounts && detail.accounts.length > 0 && (
          <div>
            <div className="mb-2 font-medium">Per-Account Breakdown</div>
            <div className="space-y-2">
              {detail.accounts.map((acc) => (
                <div key={`${acc.platform}-${acc.handle}`} className="rounded-xl border border-border p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold capitalize text-accent">{acc.platform}</span>
                      <span className="text-sm font-medium">{acc.handle}</span>
                    </div>
                    <span className="text-xs text-muted">{acc.posts} posts · {acc.comments.toLocaleString()} comments</span>
                  </div>
                  <SentBar pos={acc.positive_pct} neg={acc.negative_pct} neu={acc.neutral_pct} />
                  <div className="mt-1.5 flex gap-3 text-xs">
                    <span className="text-emerald-600">✅ {acc.sentiment.Positive.toLocaleString()} ({acc.positive_pct}%)</span>
                    <span className="text-rose-500">❌ {acc.sentiment.Negative.toLocaleString()} ({acc.negative_pct}%)</span>
                    <span className="text-muted">⚪ {acc.sentiment.Neutral.toLocaleString()} ({acc.neutral_pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {detail.narratives.length > 0 && (
          <div>
            <div className="mb-2 font-medium">Key Narratives</div>
            <div className="flex flex-wrap gap-1.5">
              {detail.narratives.map((n) => (
                <span key={n.topic} className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                  {n.topic} <span className="opacity-60">·{n.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {detail.keywords.length > 0 && (
          <div>
            <div className="mb-2 font-medium">Top Keywords</div>
            <div className="flex flex-wrap gap-1.5">
              {detail.keywords.map((k) => (
                <span key={k.word} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-white/10">
                  {k.word} <span className="text-muted">×{k.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}

/* ─── Send Modal ─────────────────────────────────────────────────────────── */
function SendModal({ open, onClose, clientId, clientName }: {
  open: boolean; onClose: () => void; clientId: string; clientName: string;
}) {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function sendWA() {
    if (!phone) return;
    setSending(true); setResult(null);
    try {
      const { data } = await api.post("/reports/daily-send", { client_id: clientId, phone });
      setResult({ ok: data.ok, msg: data.message || data.error || "Sent" });
    } catch (e: any) {
      setResult({ ok: false, msg: e.response?.data?.detail || "Error" });
    } finally { setSending(false); }
  }

  return open ? (
    <Overlay onClose={onClose} title={`Send Report — ${clientName}`}>
      <div className="space-y-4 text-sm">
        <div>
          <label className="mb-1 block text-xs text-muted">WhatsApp number (with country code)</label>
          <input type="tel" placeholder="+918222050382" value={phone} onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm" />
        </div>
        {result && (
          <div className={`rounded-xl px-3 py-2 text-xs ${result.ok
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
            : "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300"}`}>
            {result.ok ? "✅ " : "❌ "}{result.msg}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button onClick={sendWA} disabled={!phone || sending} className="flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send via WhatsApp"}
          </Button>
          <button onClick={onClose} className="text-sm text-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </Overlay>
  ) : null;
}

/* ─── Sheet Sync Section ─────────────────────────────────────────────────── */
function SheetSyncSection({ clients }: { clients: ClientSummary[] }) {
  const [profiles, setProfiles]   = useState<any[]>([]);
  const [clientId, setClientId]   = useState("");
  const [profileId, setProfileId] = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo,   setDateTo]     = useState("");
  const [sheetUrl, setSheetUrl]   = useState("");
  const [syncing,  setSyncing]    = useState(false);
  const [report,   setReport]     = useState<FullEodReport | null>(null);
  const [error,    setError]      = useState("");
  const [saveMsg,  setSaveMsg]    = useState("");

  useEffect(() => {
    api.get("/profiles").then((r) => setProfiles(r.data || [])).catch(() => {});
  }, []);

  /* Pre-fill sheet URL from client meta when client changes */
  useEffect(() => {
    if (!clientId) { setSheetUrl(""); return; }
    const c = clients.find((x) => x.id === clientId);
    if (c?.sheet_url) setSheetUrl(c.sheet_url);
  }, [clientId, clients]);

  /* Filter profiles by selected client */
  const filteredProfiles = clientId
    ? profiles.filter((p) => p.client_id === clientId)
    : profiles;

  async function sync() {
    if (!sheetUrl.trim()) { setError("Please paste a Google Sheets URL."); return; }
    setSyncing(true); setReport(null); setError("");
    try {
      const { data } = await api.post("/reports/sheet-eod", {
        client_id:  clientId  || undefined,
        profile_id: profileId || undefined,
        sheet_url:  sheetUrl.trim(),
        date_from:  dateFrom  || undefined,
        date_to:    dateTo    || undefined,
      });
      setReport(data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Could not read sheet. Make sure it is shared as 'Anyone with the link can view'.");
    } finally { setSyncing(false); }
  }

  async function saveSheet() {
    if (!clientId || !sheetUrl.trim()) return;
    try {
      await api.patch(`/clients/${clientId}/sheet`, { sheet_url: sheetUrl.trim() });
      setSaveMsg("✅ Sheet linked to client!");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch { setSaveMsg("❌ Failed to save."); }
  }

  function printReport() {
    if (!report) return;
    downloadEodPdf(report.sections, report.date, report.grand_total_links, report.grand_total_deployed, report.project_name);
  }

  return (
    <Card className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30">
          <TableProperties className="h-4 w-4 text-violet-600 dark:text-violet-300" />
        </div>
        <div>
          <div className="text-sm font-semibold">Sheet Data Sync</div>
          <div className="text-xs text-muted">Connect a Google Sheet, filter by date, and generate a report from that data</div>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Client */}
        <div>
          <label className="mb-1 block text-xs text-muted"><Users className="inline h-3 w-3 mr-1" />Client</label>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setProfileId(""); }}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <option value="">All / Any</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Account (social profile) */}
        <div>
          <label className="mb-1 block text-xs text-muted"><Database className="inline h-3 w-3 mr-1" />Account (optional)</label>
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <option value="">All accounts</option>
            {filteredProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.platform} · {p.handle || p.display_name || p.id.slice(0, 8)}</option>
            ))}
          </select>
        </div>

        {/* Date from */}
        <div>
          <label className="mb-1 block text-xs text-muted"><CalendarDays className="inline h-3 w-3 mr-1" />Date From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        </div>

        {/* Date to */}
        <div>
          <label className="mb-1 block text-xs text-muted">Date To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        </div>
      </div>

      {/* Sheet URL */}
      <div>
        <label className="mb-1 block text-xs text-muted">Google Sheets URL</label>
        <div className="flex gap-2">
          <input
            value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          {clientId && sheetUrl && (
            <button onClick={saveSheet}
              className="flex items-center gap-1 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300 shrink-0">
              <Link2 className="h-3.5 w-3.5" /> Save Link
            </button>
          )}
        </div>
        <p className="mt-1 text-[10px] text-muted">
          Sheet must be shared as <span className="italic">"Anyone with the link can view"</span>.
          Supports EOD Report format and Researcher sheet format.
        </p>
        {saveMsg && <p className="mt-1 text-xs font-medium text-violet-700 dark:text-violet-300">{saveMsg}</p>}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
          ❌ {error}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={sync} disabled={syncing || !sheetUrl.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
          {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
          {syncing ? "Syncing…" : "Sync & Generate Report"}
        </button>
        {report && (
          <button onClick={printReport}
            className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">
            <Printer className="h-3.5 w-3.5" /> Print / Download PDF
          </button>
        )}
      </div>

      {/* Inline report preview */}
      {report && (
        <div className="rounded-xl border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div>
              <span className="text-sm font-semibold">{report.project_name || "Report"}</span>
              <span className="ml-2 text-xs text-muted">— {report.date}</span>
              {(dateFrom || dateTo) && (
                <span className="ml-2 text-[11px] text-violet-600 dark:text-violet-300">
                  {dateFrom && `from ${dateFrom} `}{dateTo && `to ${dateTo}`}
                </span>
              )}
            </div>
            <div className="text-xs text-muted">
              {report.grand_total_links} links · {report.grand_total_deployed.toLocaleString()} comments
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto p-4">
            {report.sections.map((sec) => <EodClientSection key={sec.client.id} sec={sec} />)}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function DailyReportsPage() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading]         = useState(true);
  const [generatedAt, setGeneratedAt] = useState("");

  /* Date filter */
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [filterClient, setFilterClient] = useState("all");
  const [filterApplied, setFilterApplied] = useState(false);

  /* Sentiments */
  const [viewClient, setViewClient]   = useState<ClientSummary | null>(null);
  const [detail, setDetail]           = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sentOpen, setSentOpen]       = useState(false);

  /* Full EOD report */
  const [fullReport, setFullReport]   = useState<FullEodReport | null>(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [fullOpen, setFullOpen]       = useState(false);
  const [eodClientName, setEodClientName] = useState("All Clients");

  /* Sheet EOD */
  const [sheetReport, setSheetReport]   = useState<FullEodReport | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetOpen, setSheetOpen]       = useState(false);
  const [sheetClientName, setSheetClientName] = useState("");

  /* Inline sheet-link */
  const [linkingFor, setLinkingFor]     = useState<string | null>(null);
  const [sheetUrlInput, setSheetUrlInput] = useState("");
  const [sheetSaving, setSheetSaving]   = useState(false);
  const [sheetSaveMsg, setSheetSaveMsg] = useState("");

  /* Send */
  const [sendId, setSendId]     = useState("");
  const [sendName, setSendName] = useState("");
  const [sendOpen, setSendOpen] = useState(false);

  function buildParams() {
    const p: any = {};
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo)   p.date_to   = dateTo;
    if (filterClient !== "all") p.client_id = filterClient;
    return p;
  }

  function load() {
    setLoading(true);
    api.get("/reports/daily-clients", { params: buildParams() })
      .then((r) => { setClients(r.data.clients || []); setGeneratedAt(r.data.generated_at || ""); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function applyFilter() {
    const p: any = {};
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo)   p.date_to   = dateTo;
    if (filterClient !== "all") p.client_id = filterClient;
    setFilterApplied(!!(dateFrom || dateTo || filterClient !== "all"));
    setLoading(true);
    api.get("/reports/daily-clients", { params: p })
      .then((r) => { setClients(r.data.clients || []); setGeneratedAt(r.data.generated_at || ""); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function clearFilter() {
    setDateFrom(""); setDateTo(""); setFilterClient("all");
    setFilterApplied(false);
    setLoading(true);
    api.get("/reports/daily-clients")
      .then((r) => { setClients(r.data.clients || []); setGeneratedAt(r.data.generated_at || ""); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function openSentiments(c: ClientSummary) {
    setViewClient(c); setDetailLoading(true); setSentOpen(true);
    try {
      const { data } = await api.get(`/reports/daily-clients/${c.id}`, { params: buildParams() });
      setDetail(data);
    } finally { setDetailLoading(false); }
  }

  async function openFullEod() {
    setEodClientName("All Clients");
    setFullReport(null); setFullLoading(true); setFullOpen(true);
    try {
      const { data } = await api.get("/reports/eod-report", {
        params: { ...buildParams(), ...(filterClient !== "all" ? { client_id: filterClient } : {}) },
      });
      setFullReport(data);
    } finally { setFullLoading(false); }
  }

  async function openClientEod(c: ClientSummary) {
    setEodClientName(c.name);
    setFullReport(null); setFullLoading(true); setFullOpen(true);
    try {
      const { data } = await api.get("/reports/eod-report", {
        params: { client_id: c.id, ...(dateFrom ? { date_from: dateFrom } : {}), ...(dateTo ? { date_to: dateTo } : {}) },
      });
      setFullReport(data);
    } finally { setFullLoading(false); }
  }

  async function openSheetEod(c: ClientSummary, urlOverride?: string) {
    const url = urlOverride || c.sheet_url || "";
    if (!url) { setLinkingFor(c.id); setSheetUrlInput(""); return; }
    setSheetClientName(c.name);
    setSheetReport(null); setSheetLoading(true); setSheetOpen(true);
    try {
      const { data } = await api.post("/reports/sheet-eod", {
        client_id: c.id, sheet_url: url || undefined,
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo   ? { date_to: dateTo }     : {}),
      });
      setSheetReport(data);
      if (url) setClients((prev) => prev.map((x) => x.id === c.id ? { ...x, sheet_url: url } : x));
    } catch (e: any) {
      setSheetOpen(false);
      alert(e.response?.data?.detail || "Could not read sheet. Make sure it is shared as 'Anyone with the link can view'.");
    } finally { setSheetLoading(false); }
  }

  async function saveSheetUrl(clientId: string) {
    if (!sheetUrlInput.trim()) return;
    setSheetSaving(true); setSheetSaveMsg("");
    try {
      await api.patch(`/clients/${clientId}/sheet`, { sheet_url: sheetUrlInput.trim() });
      setClients((prev) => prev.map((x) => x.id === clientId ? { ...x, sheet_url: sheetUrlInput.trim() } : x));
      setSheetSaveMsg("✅ Sheet linked!");
      setTimeout(() => { setLinkingFor(null); setSheetSaveMsg(""); }, 1200);
    } catch {
      setSheetSaveMsg("❌ Failed to save.");
    } finally { setSheetSaving(false); }
  }

  function openSend(c: ClientSummary) { setSendId(c.id); setSendName(c.name); setSendOpen(true); }
  function openSendFromSentiments() {
    if (!viewClient) return;
    setSentOpen(false); setSendId(viewClient.id); setSendName(viewClient.name); setSendOpen(true);
  }
  function openSendFromEod() {
    setFullOpen(false); setSendId(clients[0]?.id || ""); setSendName("All Clients"); setSendOpen(true);
  }
  function openSendFromSheet() {
    setSheetOpen(false); setSendId(""); setSendName(sheetClientName); setSendOpen(true);
  }

  /* All clients for the "All clients" selector in SheetSyncSection */
  const [allClientsForSync, setAllClientsForSync] = useState<ClientSummary[]>([]);
  useEffect(() => {
    api.get("/reports/daily-clients")
      .then((r) => setAllClientsForSync(r.data.clients || []))
      .catch(() => {});
  }, []);

  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Daily Reports</h1>
          <p className="text-sm text-muted">{date}</p>
          {generatedAt && <p className="text-xs text-muted">Data as of {new Date(generatedAt).toLocaleTimeString()}</p>}
        </div>
        <div className="flex gap-2">
          <Button onClick={openFullEod} className="flex items-center gap-1.5">
            <Download className="h-4 w-4" /> Full EOD Report
          </Button>
          <Button variant="ghost" onClick={load} disabled={loading} className="flex items-center gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Date & Client Filter Bar ── */}
      <Card className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs text-muted"><Users className="inline h-3 w-3 mr-1" />Client</label>
          <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <option value="all">All Clients</option>
            {allClientsForSync.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="min-w-[150px]">
          <label className="mb-1 block text-xs text-muted"><CalendarDays className="inline h-3 w-3 mr-1" />From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="min-w-[150px]">
          <label className="mb-1 block text-xs text-muted">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div className="flex items-end gap-2">
          {filterApplied && (
            <Button variant="ghost" onClick={clearFilter}>Clear</Button>
          )}
          <Button onClick={applyFilter} disabled={loading}>
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Apply Filter"}
          </Button>
        </div>
        {filterApplied && (
          <div className="w-full">
            <p className="text-[11px] text-accent">
              Showing data
              {filterClient !== "all" && ` for ${allClientsForSync.find(c => c.id === filterClient)?.name || "selected client"}`}
              {dateFrom && ` from ${dateFrom}`}
              {dateTo   && ` to ${dateTo}`}
            </p>
          </div>
        )}
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded-full bg-emerald-500" /> Positive</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded-full bg-rose-500" /> Negative</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded-full bg-gray-300 dark:bg-gray-600" /> Neutral</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Crisis (&gt;40% neg)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-emerald-600" /> Sheet linked</span>
      </div>

      {/* Client cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-card" />)}
        </div>
      ) : clients.length === 0 ? (
        <Card><p className="text-muted">No clients found.</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <Card key={c.id} className={`relative ${c.crisis ? "border-rose-300 dark:border-rose-700" : ""}`}>
              {c.crisis && (
                <span className="absolute right-3 top-3 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">⚠ Crisis</span>
              )}
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <FileBarChart2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{c.name}</span>
                    <TrendIcon pct={c.positive_pct} />
                    {c.sheet_url && (
                      <span title="Google Sheet linked" className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> Sheet
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted">{c.industry}</div>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted">
                <span>{c.posts.toLocaleString()} posts</span>
                <span>{c.comments.toLocaleString()} comments</span>
                {c.analyzed_comments > 0 && c.analyzed_comments !== c.comments && (
                  <span className="text-indigo-500">{c.analyzed_comments.toLocaleString()} analysed</span>
                )}
                {c.data_range && c.data_range !== "All time"
                  ? <span className="font-medium text-amber-600 dark:text-amber-400">📅 {c.data_range}</span>
                  : c.latest_date && <span>{c.latest_date}</span>
                }
              </div>
              <div className="mb-2"><SentBar pos={c.positive_pct} neg={c.negative_pct} neu={c.neutral_pct} /></div>
              <div className="mb-4 flex gap-2 text-xs">
                <Badge label="Pos" pct={c.positive_pct} color="text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/20" />
                <Badge label="Neg" pct={c.negative_pct} color="text-rose-600 bg-rose-50 dark:text-rose-300 dark:bg-rose-900/20" />
                <Badge label="Neu" pct={c.neutral_pct} color="text-muted bg-black/5 dark:bg-white/5" />
              </div>
              {c.top_topics && (
                <p className="mb-3 line-clamp-1 text-xs text-muted">
                  <span className="font-medium text-fg">Topics: </span>{c.top_topics}
                </p>
              )}
              <div className="flex gap-1.5">
                <button onClick={() => openSentiments(c)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-border py-1.5 text-xs font-medium hover:bg-accent/5 hover:text-accent transition-colors">
                  <Eye className="h-3.5 w-3.5" /> Sentiments
                </button>
                <button onClick={() => openClientEod(c)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-border py-1.5 text-xs font-medium hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-900/20 transition-colors">
                  <FileText className="h-3.5 w-3.5" /> EOD
                </button>
                <button onClick={() => openSheetEod(c)}
                  title={c.sheet_url ? "Generate EOD from linked Google Sheet" : "Link a Google Sheet"}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-xl border py-1.5 text-xs font-medium transition-colors ${
                    c.sheet_url
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                      : "border-border hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-900/20"
                  }`}>
                  <Link2 className="h-3.5 w-3.5" />
                  {c.sheet_url ? "Sheet EOD" : "Link Sheet"}
                </button>
                <button onClick={() => openSend(c)}
                  className="flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Inline sheet-link input */}
              {linkingFor === c.id && (
                <div className="mt-3 space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-700 dark:bg-violet-900/20">
                  <p className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                    Paste the Google Sheets URL for <b>{c.name}</b>
                  </p>
                  <p className="text-[10px] text-muted">Sheet must be shared as <i>"Anyone with the link can view"</i>.</p>
                  <input value={sheetUrlInput} onChange={(e) => setSheetUrlInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs dark:bg-black/20" />
                  {sheetSaveMsg && <p className="text-[11px] font-medium text-violet-700 dark:text-violet-300">{sheetSaveMsg}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => saveSheetUrl(c.id)} disabled={sheetSaving || !sheetUrlInput.trim()}
                      className="rounded-lg bg-violet-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                      {sheetSaving ? "Saving…" : "Save & Generate Report"}
                    </button>
                    <button onClick={() => { openSheetEod(c, sheetUrlInput.trim()); setLinkingFor(null); }}
                      disabled={!sheetUrlInput.trim()}
                      className="rounded-lg border border-violet-300 px-3 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50">
                      Preview Only
                    </button>
                    <button onClick={() => { setLinkingFor(null); setSheetUrlInput(""); }}
                      className="ml-auto text-[11px] text-muted hover:text-fg">Cancel</button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Summary table */}
      {!loading && clients.length > 0 && (
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">All Clients — Summary</h2>
            <button onClick={openFullEod} className="flex items-center gap-1.5 text-xs text-accent hover:underline">
              <Download className="h-3.5 w-3.5" /> Download Full EOD Report
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="px-4 py-2.5 text-left">Client</th>
                  <th className="px-4 py-2.5 text-right">Posts</th>
                  <th className="px-4 py-2.5 text-right">Comments</th>
                  <th className="px-4 py-2.5 text-right text-emerald-600">Positive</th>
                  <th className="px-4 py-2.5 text-right text-rose-500">Negative</th>
                  <th className="px-4 py-2.5 text-right text-muted">Neutral</th>
                  <th className="px-4 py-2.5 w-28">Sentiment</th>
                  <th className="px-4 py-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-black/5 dark:hover:bg-white/5">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted">{c.industry}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.posts.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.comments.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">
                      {c.sentiment.Positive.toLocaleString()} ({c.positive_pct}%)
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-rose-500">
                      {c.sentiment.Negative.toLocaleString()} ({c.negative_pct}%)
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">{c.sentiment.Neutral.toLocaleString()}</td>
                    <td className="px-4 py-2.5"><SentBar pos={c.positive_pct} neg={c.negative_pct} neu={c.neutral_pct} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openSentiments(c)} className="text-muted hover:text-accent" title="Sentiments"><Eye className="h-4 w-4" /></button>
                        <button onClick={() => openClientEod(c)} className="text-muted hover:text-amber-600" title="EOD Report"><FileText className="h-4 w-4" /></button>
                        <button onClick={() => openSheetEod(c)} className="text-muted hover:text-violet-600" title="Sheet EOD"><Link2 className="h-4 w-4" /></button>
                        <button onClick={() => openSend(c)} className="text-muted hover:text-emerald-600" title="Send"><Send className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Sheet Data Sync Section ── */}
      <div className="border-t border-border pt-5">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Sheet Data Sync</h2>
          <p className="text-xs text-muted">Connect a Google Sheet for any account, filter by date range, and generate a report from the sheet data.</p>
        </div>
        <SheetSyncSection clients={allClientsForSync} />
      </div>

      {/* Sentiments modal */}
      {sentOpen && (
        detailLoading ? (
          <Overlay onClose={() => setSentOpen(false)} title="Loading sentiments…">
            <div className="flex h-40 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-muted" /></div>
          </Overlay>
        ) : (
          <SentimentsModal open={sentOpen} onClose={() => setSentOpen(false)}
            detail={detail} summary={viewClient}
            onSend={openSendFromSentiments}
            onPreviewPdf={() => { setSentOpen(false); openFullEod(); }} />
        )
      )}

      <FullEodModal open={fullOpen} onClose={() => setFullOpen(false)}
        report={fullReport} loading={fullLoading}
        onSend={openSendFromEod} reportTitle={eodClientName} />

      <FullEodModal open={sheetOpen} onClose={() => setSheetOpen(false)}
        report={sheetReport} loading={sheetLoading}
        onSend={openSendFromSheet}
        reportTitle={sheetReport?.project_name || sheetClientName} />

      <SendModal open={sendOpen} onClose={() => setSendOpen(false)} clientId={sendId} clientName={sendName} />
    </div>
  );
}
