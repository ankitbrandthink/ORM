"use client";
import { useEffect, useMemo, useState } from "react";
import { Eye, Download, Trash2, FileText, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/help";

const GROUPS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "executive", label: "Executive" },
];

function saveBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [kind, setKind] = useState("executive");
  const [busy, setBusy] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<any>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [viewing, setViewing] = useState<any>(null);   // { id, data }
  const [menuFor, setMenuFor] = useState<string>("");  // report id whose download menu is open

  function load() { api.get("/reports").then((r) => setReports(r.data || [])).catch(() => {}); }
  useEffect(load, []);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const r of reports) (g[r.kind] = g[r.kind] || []).push(r);
    return g;
  }, [reports]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  async function generate() {
    setBusy(true);
    try { await api.post("/reports/generate", null, { params: { kind } }); load(); }
    finally { setBusy(false); }
  }
  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    const { data } = await api.post("/reports/upload", fd);
    setUploadInfo(data);
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
    await api.delete(`/reports/${id}`); setSelected((s) => ({ ...s, [id]: false })); load();
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
    setSelected({}); load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted">Create, view, download (PDF / Excel / CSV) and organise your reports.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
            {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label} report</option>)}
          </select>
          <Button onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate"}</Button>
        </div>
      </div>

      {/* Upload */}
      <Card className="border-dashed">
        <label className="cursor-pointer text-sm text-accent">
          Upload data (.xlsx / .csv)
          <input type="file" accept=".xlsx,.csv" className="hidden" onChange={onUpload} />
        </label>
        {uploadInfo && (
          <p className="mt-2 text-xs text-muted">
            Parsed {uploadInfo.filename}: {uploadInfo.rows} rows — columns: {uploadInfo.columns?.join(", ")}
          </p>
        )}
      </Card>

      {/* Batch action bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
          <span>{selectedIds.length} selected</span>
          <span className="text-muted">·</span>
          <button className="text-accent hover:underline" onClick={() => batchDownload("pdf")}>Download PDF zip</button>
          <button className="text-accent hover:underline" onClick={() => batchDownload("xlsx")}>Excel zip</button>
          <button className="text-accent hover:underline" onClick={() => batchDownload("csv")}>CSV zip</button>
          <button className="ml-auto text-red-500 hover:underline" onClick={batchDelete}>Delete selected</button>
        </div>
      )}

      {reports.length === 0 && <p className="text-muted">No reports yet. Pick a type and click Generate.</p>}

      {/* Grouped lists */}
      {GROUPS.filter((g) => grouped[g.key]?.length).map((g) => (
        <div key={g.key}>
          <h2 className="mb-2 text-sm font-medium text-muted">{g.label} reports ({grouped[g.key].length})</h2>
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
                      <div className="absolute right-0 z-10 mt-1 w-32 rounded-xl border border-border bg-card py-1 text-sm shadow-lg">
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
      ))}

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
            <div>
              <div className="mb-1 font-medium">Sentiment</div>
              <table className="w-full">
                <tbody>
                  {Object.entries(viewing.data.sentiment || {}).map(([s, c]) => (
                    <tr key={s} className="border-b border-border/60">
                      <td className="py-1">{s}</td><td className="py-1 text-right">{c as number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
