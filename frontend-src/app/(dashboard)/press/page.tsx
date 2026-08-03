"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Rss, Plus, Trash2, RefreshCw, ExternalLink, Newspaper, ChevronDown,
  Globe, Youtube, CheckCircle2, AlertCircle, Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { Modal, Field, inputClass } from "@/components/ui/help";

const KIND_ICON: Record<string, any> = { rss: Rss, youtube_channel: Youtube };
const KIND_LABEL: Record<string, string> = { rss: "RSS Feed", youtube_channel: "YouTube Channel" };

const blank = {
  name: "", kind: "rss", url: "", client_id: "",
  source_type: "mainline_press", leaning: "independent",
  article_type_default: "news", domestic: true, is_active: true,
};

export default function PressPage() {
  const [sources, setSources] = useState<any[]>([]);
  const [articles, setArticles] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [clientId, setClientId] = useState("");
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"feed" | "sources">("feed");
  const PAGE = 20;

  const loadSources = useCallback(() => {
    const params: any = {};
    if (clientId) params.client_id = clientId;
    api.get("/press-sources", { params }).then((r) => setSources(r.data || [])).catch(() => {});
  }, [clientId]);

  const loadFeed = useCallback((off = 0) => {
    setLoading(true);
    const params: any = { limit: PAGE, offset: off };
    if (clientId) params.client_id = clientId;
    api.get("/analytics/press-feed", { params })
      .then((r) => { setArticles(r.data.posts || []); setTotal(r.data.total || 0); setOffset(off); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    api.get("/clients").then((r) => {
      const list = r.data || [];
      setClients(list);
      if (list.length > 0) setClientId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (clientId) { loadSources(); loadFeed(0); }
  }, [clientId, loadSources, loadFeed]);

  async function ingestAll() {
    setIngesting(true);
    try { await api.post("/press-sources/ingest-all"); loadFeed(0); }
    catch (e: any) { alert(e?.response?.data?.detail || "Ingestion failed"); }
    finally { setIngesting(false); }
  }

  async function ingestOne(id: string) {
    try { await api.post(`/press-sources/${id}/ingest`); loadFeed(0); }
    catch (e: any) { alert(e?.response?.data?.detail || "Ingestion failed"); }
  }

  async function deleteSource(id: string) {
    if (!confirm("Remove this press source?")) return;
    await api.delete(`/press-sources/${id}`).catch(() => {});
    loadSources();
  }

  async function save() {
    setError("");
    try {
      const body = { ...editing, client_id: clientId || editing.client_id };
      if (isNew) await api.post("/press-sources", body);
      else await api.put(`/press-sources/${editing.id}`, body);
      setEditing(null); loadSources();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not save source.");
    }
  }

  const sentimentColor: Record<string, string> = {
    Positive: "text-green-600", Negative: "text-red-500", Neutral: "text-gray-500",
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Press & News</h1>
          <p className="text-sm text-muted">RSS feeds and YouTube channels tracked for this account.</p>
        </div>
        <div className="flex items-center gap-2">
          {clients.length > 0 && (
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <Button variant="ghost" onClick={ingestAll} disabled={ingesting}
            className="flex items-center gap-1.5">
            <RefreshCw className={`h-4 w-4 ${ingesting ? "animate-spin" : ""}`} />
            {ingesting ? "Ingesting…" : "Fetch All"}
          </Button>
          <Button onClick={() => { setIsNew(true); setEditing({ ...blank, client_id: clientId }); setError(""); }}
            className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Add Source
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["feed", "sources"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"
            }`}>
            {tab === "feed" ? `News Feed (${total})` : `Sources (${sources.length})`}
          </button>
        ))}
      </div>

      {/* Feed tab */}
      {activeTab === "feed" && (
        <div className="space-y-3">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-muted">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading articles…</span>
            </div>
          )}
          {!loading && articles.length === 0 && (
            <Card className="py-10 text-center text-muted">
              <Newspaper className="mx-auto mb-2 h-8 w-8 opacity-30" />
              <p className="text-sm">No press articles yet.</p>
              <p className="mt-1 text-xs">Add RSS sources above then click <b>Fetch All</b> to import articles.</p>
            </Card>
          )}
          {articles.map((a) => (
            <Card key={a.id} className="flex gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start gap-2">
                  <a href={a.url} target="_blank" rel="noreferrer"
                    className="text-sm font-medium text-accent hover:underline line-clamp-2 flex-1">
                    {a.content || a.url}
                    <ExternalLink className="inline ml-1 h-3 w-3 opacity-60" />
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  {a.published_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(a.published_at).toLocaleDateString()}
                    </span>
                  )}
                  {a.dominant_sentiment && (
                    <span className={`font-medium ${sentimentColor[a.dominant_sentiment] ?? ""}`}>
                      {a.dominant_sentiment}
                    </span>
                  )}
                  {a.real_comment_total > 0 && (
                    <span>{a.real_comment_total.toLocaleString()} comments</span>
                  )}
                </div>
                {a.summary && <p className="text-xs text-muted line-clamp-2">{a.summary}</p>}
              </div>
            </Card>
          ))}
          {/* Pagination */}
          {total > PAGE && (
            <div className="flex items-center justify-between pt-2 text-sm">
              <span className="text-muted">{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={offset === 0} onClick={() => loadFeed(offset - PAGE)}>Prev</Button>
                <Button variant="ghost" disabled={offset + PAGE >= total} onClick={() => loadFeed(offset + PAGE)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sources tab */}
      {activeTab === "sources" && (
        <div className="space-y-3">
          {sources.length === 0 && (
            <Card className="py-10 text-center text-muted">
              <Rss className="mx-auto mb-2 h-8 w-8 opacity-30" />
              <p className="text-sm">No press sources configured.</p>
              <p className="mt-1 text-xs">Click <b>Add Source</b> to add an RSS feed or YouTube channel.</p>
            </Card>
          )}
          {sources.map((s) => {
            const Icon = KIND_ICON[s.kind] ?? Globe;
            return (
              <Card key={s.id} className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{s.name}</span>
                    <Badge className={s.is_active ? "bg-green-500/15 text-green-600" : "bg-gray-500/15 text-gray-500"}>
                      {s.is_active ? "Active" : "Paused"}
                    </Badge>
                    <Badge className="bg-blue-500/15 text-blue-600">{KIND_LABEL[s.kind] ?? s.kind}</Badge>
                  </div>
                  <a href={s.url} target="_blank" rel="noreferrer"
                    className="text-xs text-muted hover:text-accent truncate block max-w-xs">
                    {s.url}
                  </a>
                  {s.last_ingested_at && (
                    <span className="text-xs text-muted">
                      Last fetched: {new Date(s.last_ingested_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" onClick={() => ingestOne(s.id)} title="Fetch now"
                    className="text-xs px-2 py-1">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" onClick={() => { setIsNew(false); setEditing(s); setError(""); }} title="Edit"
                    className="text-xs px-2 py-1">Edit</Button>
                  <Button variant="ghost" onClick={() => deleteSource(s.id)} title="Remove"
                    className="text-xs px-2 py-1 text-red-500 hover:bg-red-500/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={isNew ? "Add Press Source" : "Edit Press Source"}>
        {editing && (
          <div className="space-y-3">
            <Field label="Name" required hint="Display name for this source.">
              <input className={inputClass} value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. The Hindu - India" />
            </Field>
            <Field label="Type" hint="RSS feed or YouTube channel.">
              <select className={inputClass} value={editing.kind}
                onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                <option value="rss">RSS Feed</option>
                <option value="youtube_channel">YouTube Channel</option>
              </select>
            </Field>
            <Field label="URL" required hint="Feed URL or YouTube channel URL/ID.">
              <input className={inputClass} value={editing.url}
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                placeholder="https://feeds.example.com/rss" />
            </Field>
            <Field label="Leaning" hint="Editorial leaning for bias tracking.">
              <select className={inputClass} value={editing.leaning}
                onChange={(e) => setEditing({ ...editing, leaning: e.target.value })}>
                {["independent", "friendly", "hostile"].map((l) => (
                  <option key={l} value={l} className="capitalize">{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.is_active}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
              Active (auto-fetch enabled)
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button className="w-full" onClick={save}>{isNew ? "Add Source" : "Save Changes"}</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
