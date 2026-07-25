"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Eye, Download, Printer, Trash2, FileText, ChevronDown,
  CalendarDays, Users, RefreshCw, BarChart3, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/help";

const GROUPS = [
  { key: "daily",     label: "Daily" },
  { key: "weekly",    label: "Weekly" },
  { key: "monthly",   label: "Monthly" },
  { key: "executive", label: "Executive" },
];

function saveBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function SentBar({ pos, neg, neu }: { pos: number; neg: number; neu: number }) {
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full">
      <div className="bg-emerald-500" style={{ width: `${pos}%` }} />
      <div className="bg-rose-500"    style={{ width: `${neg}%` }} />
      <div className="bg-gray-300 dark:bg-gray-600" style={{ width: `${neu}%` }} />
    </div>
  );
}

function TrendIcon({ pct }: { pct: number }) {
  if (pct >= 50) return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (pct >= 30) return <Minus className="h-3.5 w-3.5 text-amber-500" />;
  return <TrendingDown className="h-3.5 w-3.5 text-rose-500" />;
}

/* ── Sentiment Report print/download (HTML in new window) ── */
function buildSentimentHtml(report: any): string {
  const { client, date_from, date_to, daily, totals, positive_pct, negative_pct, neutral_pct,
          grand_total, accounts, generated_at } = report;

  const dateRange = date_from || date_to
    ? `${date_from ?? "—"} to ${date_to ?? "—"}`
    : "All time";

  const dailyRows = daily.map((r: any) => `
    <tr>
      <td style="border:1px solid #ddd;padding:5px 10px;">${r.date}</td>
      <td style="border:1px solid #ddd;padding:5px 10px;text-align:right;">${r.total.toLocaleString()}</td>
      <td style="border:1px solid #ddd;padding:5px 10px;text-align:right;color:#059669;">${r.positive} (${r.positive_pct}%)</td>
      <td style="border:1px solid #ddd;padding:5px 10px;text-align:right;color:#e11d48;">${r.negative} (${r.negative_pct}%)</td>
      <td style="border:1px solid #ddd;padding:5px 10px;text-align:right;color:#6b7280;">${r.neutral} (${r.neutral_pct}%)</td>
    </tr>`).join("");

  const accountRows = accounts.map((a: any) => `
    <tr>
      <td style="border:1px solid #ddd;padding:5px 10px;text-transform:capitalize;">${a.platform}</td>
      <td style="border:1px solid #ddd;padding:5px 10px;">${a.handle}</td>
      <td style="border:1px solid #ddd;padding:5px 10px;text-align:right;">${a.posts}</td>
      <td style="border:1px solid #ddd;padding:5px 10px;text-align:right;">${a.comments.toLocaleString()}</td>
      <td style="border:1px solid #ddd;padding:5px 10px;text-align:right;color:#059669;">${a.positive_pct}%</td>
      <td style="border:1px solid #ddd;padding:5px 10px;text-align:right;color:#e11d48;">${a.negative_pct}%</td>
      <td style="border:1px solid #ddd;padding:5px 10px;text-align:right;color:#6b7280;">${a.neutral_pct}%</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${client.name} — Sentiment Report</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; margin: 20px; color: #111; background: #fff; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; margin-bottom: 20px; }
    th { background: #f3f4f6; font-weight: bold; padding: 7px 10px; border: 1px solid #ddd; text-align: left; }
    td { vertical-align: middle; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
    .kpi { display: inline-block; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 20px;
           margin: 0 8px 8px 0; text-align: center; min-width: 120px; }
    .kpi-val { font-size: 22px; font-weight: bold; }
    .pos { color: #059669; } .neg { color: #e11d48; } .neu { color: #6b7280; }
    @page { margin: 12mm; size: A4; }
  </style>
</head>
<body>
  <h1>${client.name.toUpperCase()} — SENTIMENT REPORT</h1>
  <div class="meta">Date range: ${dateRange} · Generated: ${generated_at} · Industry: ${client.industry || "—"}</div>

  <div style="margin-bottom:20px;">
    <div class="kpi"><div class="kpi-val">${grand_total.toLocaleString()}</div><div>Total Comments</div></div>
    <div class="kpi"><div class="kpi-val pos">${positive_pct}%</div><div>Positive</div></div>
    <div class="kpi"><div class="kpi-val neg">${negative_pct}%</div><div>Negative</div></div>
    <div class="kpi"><div class="kpi-val neu">${neutral_pct}%</div><div>Neutral</div></div>
    <div class="kpi"><div class="kpi-val">${daily.length}</div><div>Active Days</div></div>
  </div>

  ${dailyRows ? `
  <h2>Daily Breakdown</h2>
  <table>
    <thead><tr>
      <th>Date</th><th>Total</th><th class="pos">Positive</th><th class="neg">Negative</th><th class="neu">Neutral</th>
    </tr></thead>
    <tbody>${dailyRows}</tbody>
  </table>` : ""}

  ${accountRows ? `
  <h2>Per-Account Breakdown</h2>
  <table>
    <thead><tr>
      <th>Platform</th><th>Handle</th><th>Posts</th><th>Comments</th>
      <th class="pos">Pos%</th><th class="neg">Neg%</th><th class="neu">Neu%</th>
    </tr></thead>
    <tbody>${accountRows}</tbody>
  </table>` : ""}

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;
}

function openSentimentPdf(report: any) {
  const w = window.open("", "_blank", "width=1100,height=800,scrollbars=yes");
  if (!w) { alert("Allow pop-ups to open the PDF preview."); return; }
  w.document.write(buildSentimentHtml(report));
  w.document.close();
}

/* ── Client sentiment card (per client generate section) ── */
function ClientReportCard({
  client, dateFrom, dateTo,
}: {
  client: any; dateFrom: string; dateTo: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [report,     setReport]     = useState<any>(null);
  const [genError,   setGenError]   = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startProgress() {
    setProgress(0);
    let p = 0;
    timerRef.current = setInterval(() => {
      p = Math.min(p + Math.random() * 12 + 3, 88);
      setProgress(p);
    }, 350);
  }

  function stopProgress(success: boolean) {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (success) {
      setProgress(100);
      setTimeout(() => setProgress(0), 600);
    } else {
      setProgress(0);
    }
  }

  async function generate() {
    setGenerating(true); setGenError(""); startProgress();
    try {
      const { data } = await api.post("/reports/sentiment-report", {
        client_id: client.id,
        date_from: dateFrom || undefined,
        date_to:   dateTo   || undefined,
      });
      setReport(data);
      stopProgress(true);
    } catch (e: any) {
      stopProgress(false);
      setGenError(e.response?.data?.detail || "Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card className={`relative ${(client.negative_pct ?? 0) >= 40 ? "border-rose-300 dark:border-rose-700" : ""}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-sm">{client.name}</span>
            <TrendIcon pct={client.positive_pct ?? 50} />
            {(client.negative_pct ?? 0) >= 40 && (
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">⚠ Crisis</span>
            )}
          </div>
          <div className="text-[11px] text-muted">{client.industry || "—"}</div>
        </div>
        <div className="text-right text-xs text-muted shrink-0">
          <div>{(client.posts ?? 0).toLocaleString()} posts</div>
          <div>{(client.comments ?? 0).toLocaleString()} comments</div>
        </div>
      </div>

      {/* Sentiment bar */}
      <div className="mb-2">
        <SentBar pos={client.positive_pct ?? 0} neg={client.negative_pct ?? 0} neu={client.neutral_pct ?? 0} />
      </div>
      <div className="mb-4 flex gap-3 text-[11px]">
        <span className="text-emerald-600">✅ {client.positive_pct ?? 0}%</span>
        <span className="text-rose-500">❌ {client.negative_pct ?? 0}%</span>
        <span className="text-muted">⚪ {client.neutral_pct ?? 0}%</span>
      </div>

      {report && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs dark:border-emerald-800 dark:bg-emerald-900/20">
          <div className="mb-1 font-semibold text-emerald-700 dark:text-emerald-300">
            ✓ Report ready — {report.grand_total.toLocaleString()} comments analysed
          </div>
          <div className="flex flex-wrap gap-3 text-muted">
            <span className="text-emerald-600">Pos {report.positive_pct}%</span>
            <span className="text-rose-500">Neg {report.negative_pct}%</span>
            <span>Neu {report.neutral_pct}%</span>
            <span>· {report.total_days} active days</span>
          </div>
        </div>
      )}

      {genError && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
          {genError}
        </div>
      )}

      {/* Generate button with progress bar */}
      <div className="space-y-1.5">
        <button
          onClick={generate}
          disabled={generating}
          className="relative flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed">
          {/* Progress fill */}
          {generating && (
            <span
              className="absolute inset-y-0 left-0 bg-violet-700 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            {generating
              ? <RefreshCw className="h-3 w-3 animate-spin" />
              : <BarChart3 className="h-3.5 w-3.5" />}
            {generating
              ? `Generating… ${Math.round(progress)}%`
              : report ? "Regenerate" : "Generate Report"}
          </span>
        </button>

        {report && (
          <div className="flex gap-1.5">
            <button
              onClick={() => openSentimentPdf(report)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5">
              <Printer className="h-3.5 w-3.5" /> Preview PDF
            </button>
            <button
              onClick={async () => {
                const html = buildSentimentHtml(report);
                const filename = `${report.client.name.replace(/[^\w\s]/g,"").replace(/\s+/g,"_")}_Sentiment_Report.pdf`;
                try {
                  const resp = await api.post("/analytics/html-to-pdf", { html, filename }, { responseType: "arraybuffer" });
                  const blob = new Blob([resp.data], { type: "application/pdf" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = filename;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 5000);
                } catch { openSentimentPdf(report); }
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
              <Download className="h-3.5 w-3.5" /> Download PDF
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function ReportsPage() {
  /* Clients for the per-client report section */
  const [clients, setClients] = useState<any[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  /* Filters */
  const [filterClient, setFilterClient] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");

  /* Existing generated reports */
  const [reports, setReports]     = useState<any[]>([]);
  const [kind, setKind]           = useState("executive");
  const [busy, setBusy]           = useState(false);
  const [selected, setSelected]   = useState<Record<string, boolean>>({});
  const [viewing, setViewing]     = useState<any>(null);
  const [menuFor, setMenuFor]     = useState<string>("");

  function loadClients() {
    setClientsLoading(true);
    const params: any = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo)   params.date_to   = dateTo;
    if (filterClient !== "all") params.client_id = filterClient;
    api.get("/reports/daily-clients", { params })
      .then((r) => setClients(r.data.clients || []))
      .catch(() => {})
      .finally(() => setClientsLoading(false));
  }

  function loadReports() {
    api.get("/reports").then((r) => setReports(r.data || [])).catch(() => {});
  }

  useEffect(() => { loadClients(); loadReports(); }, []);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const r of reports) (g[r.kind] = g[r.kind] || []).push(r);
    return g;
  }, [reports]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  /* All clients list for dropdown (unfiltered) */
  const [allClients, setAllClients] = useState<any[]>([]);
  useEffect(() => {
    api.get("/reports/daily-clients").then((r) => setAllClients(r.data.clients || [])).catch(() => {});
  }, []);

  async function generate() {
    setBusy(true);
    try {
      await api.post("/reports/generate", null, {
        params: {
          kind,
          ...(filterClient !== "all" ? { client_id: filterClient } : {}),
          ...(dateFrom ? { date_from: dateFrom } : {}),
          ...(dateTo   ? { date_to:   dateTo   } : {}),
        },
      });
      loadReports();
    } finally { setBusy(false); }
  }

  async function downloadOne(id: string, format: string) {
    setMenuFor("");
    const res = await api.get(`/reports/${id}/download`, { params: { format }, responseType: "blob" });
    saveBlob(res.data, `report-${id.slice(0, 8)}.${format === "xlsx" ? "xlsx" : format}`);
  }
  async function view(id: string) {
    const { data } = await api.get(`/reports/${id}/data`);
    setViewing({ id, data });
  }
  async function remove(id: string) {
    if (!confirm("Delete this report?")) return;
    await api.delete(`/reports/${id}`); setSelected((s) => ({ ...s, [id]: false })); loadReports();
  }
  async function batchDownload(format: string) {
    if (!selectedIds.length) return;
    const res = await api.post("/reports/batch-download", { ids: selectedIds },
      { params: { format }, responseType: "blob" });
    saveBlob(res.data, `reports-${format}.zip`);
  }
  async function batchDelete() {
    if (!selectedIds.length || !confirm(`Delete ${selectedIds.length} report(s)?`)) return;
    await api.post("/reports/batch-delete", { ids: selectedIds });
    setSelected({}); loadReports();
  }

  /* Displayed clients (already filtered by API, but also apply local filter for instant UI) */
  const displayClients = filterClient === "all"
    ? clients
    : clients.filter((c) => c.id === filterClient);

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted">Generate, view and download sentiment reports per client and date range.</p>
      </div>

      {/* ── Filter bar ── */}
      <Card className="flex flex-wrap items-end gap-3">
        {/* Client selector */}
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs text-muted">
            <Users className="inline h-3 w-3 mr-1" />Client
          </label>
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <option value="all">All Clients</option>
            {allClients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Date from */}
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs text-muted">
            <CalendarDays className="inline h-3 w-3 mr-1" />From
          </label>
          <input
            type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        </div>

        {/* Date to */}
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs text-muted">To</label>
          <input
            type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        </div>

        {/* Apply + Generate (existing PDF/XLSX reports) */}
        <div className="flex items-end gap-2">
          <Button variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); setFilterClient("all"); }}>
            Clear
          </Button>
          <Button onClick={loadClients} disabled={clientsLoading}>
            {clientsLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Apply Filter"}
          </Button>
        </div>
      </Card>

      {/* ── Per-client Report Cards ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">
            {filterClient === "all" ? "All Clients" : displayClients[0]?.name || "Client"} — Sentiment Reports
            {(dateFrom || dateTo) && (
              <span className="ml-2 font-normal text-accent">
                {dateFrom && ` from ${dateFrom}`}{dateTo && ` to ${dateTo}`}
              </span>
            )}
          </h2>
          <span className="text-xs text-muted">{displayClients.length} client{displayClients.length !== 1 ? "s" : ""}</span>
        </div>

        {clientsLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-card" />
            ))}
          </div>
        ) : displayClients.length === 0 ? (
          <Card><p className="text-sm text-muted">No clients found for this filter.</p></Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {displayClients.map((c) => (
              <ClientReportCard
                key={c.id} client={c}
                dateFrom={dateFrom} dateTo={dateTo}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Divider: Archive / Generated Reports ── */}
      <div className="border-t border-border pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Saved Reports Archive</h2>
            <p className="text-xs text-muted">Generate a saved PDF / Excel / CSV report below.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
              {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label} report</option>)}
            </select>
            <Button onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate & Save"}</Button>
          </div>
        </div>

        {/* Batch action bar */}
        {selectedIds.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
            <span>{selectedIds.length} selected</span>
            <span className="text-muted">·</span>
            <button className="text-accent hover:underline" onClick={() => batchDownload("pdf")}>PDF zip</button>
            <button className="text-accent hover:underline" onClick={() => batchDownload("xlsx")}>Excel zip</button>
            <button className="text-accent hover:underline" onClick={() => batchDownload("csv")}>CSV zip</button>
            <button className="ml-auto text-red-500 hover:underline" onClick={batchDelete}>Delete selected</button>
          </div>
        )}

        {reports.length === 0 ? (
          <p className="text-sm text-muted">No saved reports yet. Pick a type and click Generate & Save.</p>
        ) : (
          GROUPS.filter((g) => grouped[g.key]?.length).map((g) => (
            <div key={g.key} className="mb-4">
              <h3 className="mb-2 text-xs font-medium text-muted">{g.label} reports ({grouped[g.key].length})</h3>
              <Card className="p-0">
                <ul className="divide-y divide-border/60">
                  {grouped[g.key].map((r) => (
                    <li key={r.id} className="flex items-center gap-3 p-3">
                      <input type="checkbox" checked={!!selected[r.id]}
                        onChange={(e) => setSelected((s) => ({ ...s, [r.id]: e.target.checked }))} />
                      <FileText className="h-4 w-4 text-muted" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm capitalize">{r.kind} report</div>
                        <div className="text-xs text-muted">{new Date(r.created_at).toLocaleString()}</div>
                      </div>
                      <span className="text-xs text-green-600">{r.status}</span>
                      <button onClick={() => view(r.id)} className="text-muted hover:text-accent" title="View">
                        <Eye className="h-4 w-4" />
                      </button>
                      <div className="relative">
                        <button onClick={() => setMenuFor(menuFor === r.id ? "" : r.id)}
                          className="flex items-center gap-0.5 text-muted hover:text-accent" title="Download">
                          <Download className="h-4 w-4" /><ChevronDown className="h-3 w-3" />
                        </button>
                        {menuFor === r.id && (
                          <div className="absolute right-0 z-10 mt-1 w-36 rounded-xl border border-border bg-card py-1 text-sm shadow-lg">
                            {["pdf", "xlsx", "csv"].map((f) => (
                              <button key={f} onClick={() => downloadOne(r.id, f)}
                                className="block w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5">
                                {f === "xlsx" ? "Excel (.xlsx)" : f === "csv" ? "CSV (.csv)" : "PDF (.pdf)"}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => remove(r.id)} className="text-muted hover:text-red-500" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ))
        )}
      </div>

      {/* In-app report viewer */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Report preview">
        {viewing && (
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-lg font-semibold">{viewing.data.title}</div>
              <div className="text-xs text-muted">{viewing.data.client_name} · {viewing.data.generated_at}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Comments analysed", viewing.data.total_comments],
                ["Positive %", `${viewing.data.positive_pct}%`],
                ["Negative %", `${viewing.data.negative_pct}%`],
                ["Avg toxicity %", `${viewing.data.avg_toxicity_pct}%`],
                ["Open tickets", viewing.data.open_tickets],
                ["Resolved tickets", viewing.data.resolved_tickets],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-lg border border-border p-2">
                  <div className="text-xs text-muted">{l}</div>
                  <div className="text-lg font-semibold">{v}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => downloadOne(viewing.id, "pdf")}>PDF</Button>
              <Button variant="ghost" onClick={() => downloadOne(viewing.id, "xlsx")}>Excel</Button>
              <Button variant="ghost" onClick={() => downloadOne(viewing.id, "csv")}>CSV</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
