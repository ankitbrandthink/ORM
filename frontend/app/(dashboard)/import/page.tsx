"use client";
import { useEffect, useRef, useState } from "react";
import {
  Upload, Link2, CheckCircle2, AlertCircle, Loader2,
  ChevronDown, ChevronUp, RefreshCw, Trash2, Table2, Plus,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button } from "@/components/ui/primitives";

type Client = { id: string; name: string; industry?: string };

type SheetConn = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  sheet_url: string;
  sheet_name: string;
  last_synced_at: string | null;
  last_sync_posts: number;
  last_sync_comments: number;
  last_sync_status: string;
};

type ImportResult = {
  status: string;
  tabs_processed?: number;
  posts_imported: number;
  comments_imported: number;
  duplicates_skipped?: number;
  tabs?: string[];
  connection_id?: string;
};

function fmtDate(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(s: string) {
  if (s === "synced") return "bg-green-500/15 text-green-700 dark:text-green-400";
  if (s.startsWith("error")) return "bg-red-500/15 text-red-600";
  return "bg-muted/20 text-muted";
}

export default function ImportPage() {
  // Clients
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");

  // Sheets form
  const [sheetUrl, setSheetUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [sheetLabel, setSheetLabel] = useState("");

  // CSV form
  const [tabName, setTabName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // State
  const [busy, setBusy] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [showTabs, setShowTabs] = useState(false);

  // Connected sheets table
  const [sheets, setSheets] = useState<SheetConn[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(true);

  useEffect(() => {
    api.get("/clients").then((r) => {
      const list: Client[] = r.data || [];
      setClients(list);
      if (list.length > 0 && !clientId) {
        setClientId(list[0].id);
        setClientName(list[0].name);
      }
    }).catch(() => {});
    loadSheets();
  }, []);

  function loadSheets() {
    setSheetsLoading(true);
    api.get("/import/sheets").then((r) => setSheets(r.data || [])).catch(() => {}).finally(() => setSheetsLoading(false));
  }

  function errMsg(e: any) {
    const d = e?.response?.data?.detail;
    if (d && typeof d === "object" && d.message) return d.message;
    return typeof d === "string" ? d : "Import failed.";
  }

  function onClientChange(id: string) {
    setClientId(id);
    const c = clients.find((c) => c.id === id);
    setClientName(c?.name || "");
  }

  async function importGSheets() {
    if (!sheetUrl) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const { data } = await api.post("/import/gsheets", {
        url: sheetUrl,
        api_key: apiKey || null,
        client_id: clientId || null,
        client_name: clientName || null,
        sheet_name: sheetLabel || null,
        save_connection: true,
      });
      setResult(data);
      setSheetUrl("");
      setSheetLabel("");
      loadSheets();
    } catch (e: any) {
      setError(errMsg(e) || "Import failed. Check the sheet URL or try adding an API key.");
    } finally { setBusy(false); }
  }

  async function importCsv(file: File) {
    setBusy(true); setError(""); setResult(null);
    const form = new FormData();
    form.append("file", file);
    const params = new URLSearchParams();
    if (tabName) params.set("tab_name", tabName);
    if (clientId) params.set("client_id", clientId);
    if (clientName) params.set("client_name", clientName);
    try {
      const { data } = await api.post(`/import/csv?${params.toString()}`, form);
      setResult(data);
    } catch (e: any) {
      setError(errMsg(e) || "CSV import failed.");
    } finally { setBusy(false); }
  }

  async function syncSheet(id: string) {
    setSyncingId(id); setError(""); setResult(null);
    try {
      const { data } = await api.post(`/import/sheets/${id}/sync`);
      setResult(data);
      loadSheets();
    } catch (e: any) {
      setError(errMsg(e) || "Sync failed.");
    } finally { setSyncingId(null); }
  }

  async function deleteSheet(id: string) {
    try {
      await api.delete(`/import/sheets/${id}`);
      setSheets((prev) => prev.filter((s) => s.id !== id));
    } catch {}
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Import Data</h1>
        <p className="mt-1 text-sm text-muted">
          Pull in post &amp; comment data from Google Sheets or upload a CSV file exported from your researcher sheet.
        </p>
      </div>

      {/* Client selector */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-full bg-accent flex items-center justify-center text-[10px] text-white font-bold">C</div>
          <h2 className="font-semibold text-sm">Assign to Client</h2>
        </div>
        {clients.length === 0 ? (
          <p className="text-sm text-muted">
            No clients found. <a href="/admin/clients" className="text-accent hover:underline">Add a client first</a> before importing.
          </p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {clients.map((c) => (
              <button key={c.id} onClick={() => onClientChange(c.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors ${
                  clientId === c.id
                    ? "bg-accent text-white border-accent"
                    : "border-border text-muted hover:text-fg"
                }`}>
                {c.name}
              </button>
            ))}
          </div>
        )}
        {clientId && (
          <p className="text-xs text-muted">Importing for <strong>{clientName}</strong></p>
        )}
      </Card>

      {/* Google Sheets import */}
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-accent" />
          <h2 className="font-semibold">Import from Google Sheets</h2>
        </div>
        <p className="text-sm text-muted">
          Paste the URL of your Researcher Sheet. All daily tabs will be scanned and new posts imported automatically.
          Set sheet to <strong>Anyone with the link can view</strong>, or add an API key for private sheets.
        </p>
        <div className="space-y-2">
          <input
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
          />
          <input
            value={sheetLabel}
            onChange={(e) => setSheetLabel(e.target.value)}
            placeholder="Sheet label (e.g. Raghav Chadha — Facebook Posts)"
            className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
          />
          <button onClick={() => setShowApiKey(!showApiKey)}
            className="flex items-center gap-1 text-xs text-muted hover:text-fg">
            {showApiKey ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Google Sheets API key (optional — for private sheets)
          </button>
          {showApiKey && (
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy… (from Google Cloud Console → Credentials)"
              type="password"
              className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm font-mono"
            />
          )}
        </div>
        <Button onClick={importGSheets} disabled={busy || !sheetUrl} className="w-full">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : <><Plus className="h-4 w-4" /> Import all tabs &amp; save connection</>}
        </Button>
        <div className="rounded-lg bg-black/5 dark:bg-white/5 p-3 text-xs text-muted space-y-1">
          <div className="font-medium text-fg">For private sheets — get an API key:</div>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Google Cloud Console → APIs &amp; Services → Credentials</li>
            <li>Create an API key, restrict it to "Google Sheets API"</li>
            <li>Enable "Google Sheets API" in your project</li>
            <li>Paste the key above — stored securely on your server</li>
          </ol>
        </div>
      </Card>

      {/* CSV upload */}
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-accent" />
          <h2 className="font-semibold">Upload a CSV file</h2>
        </div>
        <p className="text-sm text-muted">
          Download any individual tab from your Researcher Sheet as CSV (File → Download → CSV) and upload it here.
        </p>
        <input
          value={tabName}
          onChange={(e) => setTabName(e.target.value)}
          placeholder="Tab name / date label (e.g. 08-06 or July-Week1)"
          className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
        />
        <input ref={fileRef} type="file" accept=".csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
        <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}
          className="w-full border border-border border-dashed">
          {busy
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
            : <><Upload className="h-4 w-4" /> Choose CSV file</>}
        </Button>
      </Card>

      {/* Result banner */}
      {result && (
        <Card className="border-green-500/40 bg-green-500/5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            <div className="space-y-1">
              <div className="font-medium text-green-700 dark:text-green-400">Import complete</div>
              <div className="text-sm">
                <span className="font-semibold">{result.posts_imported}</span> new posts ·{" "}
                <span className="font-semibold">{result.comments_imported}</span> comments added
                {result.tabs_processed !== undefined && (
                  <> · <span className="font-semibold">{result.tabs_processed}</span> tabs</>
                )}
                {(result.duplicates_skipped ?? 0) > 0 && (
                  <> · <span className="font-semibold text-muted">{result.duplicates_skipped}</span> duplicates skipped</>
                )}
              </div>
              {result.posts_imported === 0 && (result.duplicates_skipped ?? 0) > 0 && (
                <p className="text-xs text-muted">All posts already existed — no new data to add. Run again after adding new data to your sheet.</p>
              )}
              {result.posts_imported === 0 && (result.duplicates_skipped ?? 0) === 0 && (
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  No posts found. Check that your sheet has a column named POST LINK, LINK, or URL containing social media URLs (facebook.com, instagram.com, etc.)
                </p>
              )}
              {result.tabs && result.tabs.length > 0 && (
                <div>
                  <button onClick={() => setShowTabs(!showTabs)} className="text-xs text-accent hover:underline">
                    {showTabs ? "Hide" : "Show"} processed tabs
                  </button>
                  {showTabs && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {result.tabs.map((t) => (
                        <span key={t} className="rounded bg-green-500/10 px-1.5 py-0.5 text-[11px] text-green-700 dark:text-green-400">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted">
                View in <a href="/listening" className="text-accent hover:underline">Posts &amp; Comments</a>
              </p>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <Card className="border-red-500/40 bg-red-500/5">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <div className="font-medium text-red-600">Import failed</div>
              <div className="text-sm text-muted">{error}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Connected sheets table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Table2 className="h-5 w-5 text-accent" />
            <h2 className="font-semibold">Connected Sheets</h2>
          </div>
          <button onClick={loadSheets}
            className="flex items-center gap-1 text-xs text-muted hover:text-fg">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        {sheetsLoading ? (
          <Card className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </Card>
        ) : sheets.length === 0 ? (
          <Card className="py-8 text-center text-sm text-muted">
            No connected sheets yet. Import a Google Sheet above to save it here.
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-black/5 dark:bg-white/5">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted">Sheet</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted">Client</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted">Last Synced</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted">Posts</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted">Status</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sheets.map((s) => (
                    <tr key={s.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium leading-tight">{s.sheet_name}</div>
                        <a href={s.sheet_url} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-accent hover:underline truncate block max-w-[200px]">
                          {s.sheet_url.replace("https://docs.google.com/spreadsheets/d/", "…/")}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-sm">{s.client_name || <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{fmtDate(s.last_synced_at)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className="font-semibold">{s.last_sync_posts}</span>
                        {s.last_sync_comments > 0 && (
                          <span className="text-xs text-muted"> · {s.last_sync_comments}c</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge(s.last_sync_status)}`}>
                          {s.last_sync_status === "never" ? "Never synced" : s.last_sync_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => syncSheet(s.id)}
                            disabled={syncingId === s.id}
                            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-accent hover:text-white hover:border-accent transition-colors disabled:opacity-50">
                            {syncingId === s.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <RefreshCw className="h-3 w-3" />}
                            Sync
                          </button>
                          <button
                            onClick={() => deleteSheet(s.id)}
                            className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
