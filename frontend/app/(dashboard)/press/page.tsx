"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Rss, Plus, Trash2, RefreshCw, ExternalLink, Newspaper, Search, X,
  Globe, Youtube, Clock, ChevronRight, ChevronLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { Modal, Field, inputClass } from "@/components/ui/help";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<string, any> = { rss: Rss, youtube_channel: Youtube };
const KIND_LABEL: Record<string, string> = { rss: "RSS Feed", youtube_channel: "YouTube Channel" };

const LEANING_COLOR: Record<string, string> = {
  friendly: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  hostile:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  independent: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const SENTIMENT_COLOR: Record<string, string> = {
  Positive: "text-emerald-600",
  Negative: "text-red-500",
  Neutral:  "text-slate-400",
};

const blank = {
  name: "", kind: "rss", url: "", client_id: "",
  source_type: "mainline_press", leaning: "independent",
  article_type_default: "news", domestic: true, is_active: true,
};

function parseKeywords(raw: string): string[] {
  return raw.split(/[,\s]+/).map(k => k.trim()).filter(k => k.length >= 2);
}

export default function PressPage() {
  const [sources, setSources]   = useState<any[]>([]);
  const [articles, setArticles] = useState<any[]>([]);
  const [clients, setClients]   = useState<any[]>([]);
  const [clientId, setClientId] = useState("");
  const [total, setTotal]       = useState(0);
  const [offset, setOffset]     = useState(0);
  const [loading, setLoading]   = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState("");
  const [editing, setEditing]   = useState<any>(null);
  const [isNew, setIsNew]       = useState(false);
  const [error, setError]       = useState("");
  const [activeTab, setActiveTab] = useState<"feed" | "sources">("feed");

  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PAGE = 20;

  const loadSources = useCallback(() => {
    const params: any = {};
    if (clientId) params.client_id = clientId;
    api.get("/press-sources", { params }).then((r) => setSources(r.data || [])).catch(() => {});
  }, [clientId]);

  const loadFeed = useCallback((off = 0, search = activeSearch) => {
    setLoading(true);
    const params: any = { limit: PAGE, offset: off };
    if (clientId) params.client_id = clientId;
    if (search.trim()) params.q = search.trim();
    api.get("/analytics/press-feed", { params })
      .then((r) => {
        setArticles(r.data.articles || []);
        setTotal(r.data.total || 0);
        setOffset(off);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId, activeSearch]);

  useEffect(() => {
    api.get("/clients").then((r) => {
      const list = r.data || [];
      setClients(list);
      if (list.length > 0) setClientId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (clientId) { loadSources(); loadFeed(0, activeSearch); }
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setActiveSearch(val);
      if (clientId) loadFeed(0, val);
    }, 400);
  };

  const clearSearch = () => {
    setSearchInput("");
    setActiveSearch("");
    if (clientId) loadFeed(0, "");
  };

  const removeKeyword = (kw: string) => {
    const remaining = parseKeywords(searchInput).filter(k => k !== kw).join(", ");
    setSearchInput(remaining);
    setActiveSearch(remaining);
    if (clientId) loadFeed(0, remaining);
  };

  async function ingestAll() {
    setIngesting(true);
    setIngestMsg("");
    try {
      const r = await api.post("/press-sources/ingest-all");
      setIngestMsg(r.data?.message || "Ingestion started — refresh in a few minutes.");
      setTimeout(() => setIngestMsg(""), 8000);
      loadFeed(0);
    }
    catch (e: any) { setIngestMsg(e?.response?.data?.detail || "Ingestion failed — check sources."); }
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

  const chips = parseKeywords(searchInput);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Press &amp; News</h1>
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
            <RefreshCw className={cn("h-4 w-4", ingesting && "animate-spin")} />
            {ingesting ? "Ingesting…" : "Fetch All"}
          </Button>
          <Button onClick={() => { setIsNew(true); setEditing({ ...blank, client_id: clientId }); setError(""); }}
            className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Add Source
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search articles… separate keywords with comma or space"
            className="w-full rounded-2xl border border-border bg-card py-2.5 pl-9 pr-10 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          {searchInput && (
            <button onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {chips.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Filtering by:</span>
            {chips.map((kw) => (
              <span key={kw}
                className="flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                {kw}
                <button onClick={() => removeKeyword(kw)} className="hover:text-red-500 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button onClick={clearSearch} className="text-xs text-muted hover:text-red-500 transition-colors">
              Clear all
            </button>
          </div>
        )}
      </div>

      {ingestMsg && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-2 text-sm text-accent">
          {ingestMsg}
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {(["feed", "sources"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              activeTab === tab ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"
            )}>
            {tab === "feed" ? `News Feed (${total.toLocaleString()})` : `All Sources (${sources.length})`}
          </button>
        ))}
      </div>

      {activeTab === "feed" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            {activeSearch ? (
              <>{total.toLocaleString()} article{total !== 1 ? "s" : ""} matching <span className="font-medium text-accent">&ldquo;{activeSearch}&rdquo;</span></>
            ) : (
              <>{total.toLocaleString()} article{total !== 1 ? "s" : ""} in the feed</>
            )}
          </p>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-muted">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading articles…</span>
            </div>
          )}

          {!loading && articles.length === 0 && (
            <Card className="py-10 text-center text-muted">
              <Newspaper className="mx-auto mb-2 h-8 w-8 opacity-30" />
              {activeSearch ? (
                <><p className="text-sm font-medium">No articles match your search.</p><p className="mt-1 text-xs">Try different keywords or <button onClick={clearSearch} className="text-accent hover:underline">clear the search</button>.</p></>
              ) : (
                <><p className="text-sm">No press articles yet.</p><p className="mt-1 text-xs">Add RSS sources above then click <b>Fetch All</b> to import articles.</p></>
              )}
            </Card>
          )}

          <div className="space-y-2">
            {articles.map((a) => (
              <Card key={a.id} className="group flex gap-3 hover:shadow-sm transition-shadow">
                <div className="min-w-0 flex-1 space-y-1">
                  <a href={a.url} target="_blank" rel="noreferrer"
                    className="text-sm font-medium text-fg hover:text-accent transition-colors line-clamp-2 leading-snug">
                    {a.title || a.content || a.url}
                    <ExternalLink className="inline ml-1 h-3 w-3 opacity-50" />
                  </a>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {a.source_name && <span className="font-medium text-muted">{a.source_name}</span>}
                    {a.leaning && a.leaning !== "independent" && (
                      <span className={cn("rounded-full px-1.5 py-0.5 font-medium capitalize", LEANING_COLOR[a.leaning] || LEANING_COLOR.independent)}>
                        {a.leaning}
                      </span>
                    )}
                    {a.published_at && (
                      <span className="flex items-center gap-1 text-muted">
                        <Clock className="h-3 w-3" />
                        {new Date(a.published_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    )}
                    {a.sentiment && (
                      <span className={cn("font-medium", SENTIMENT_COLOR[a.sentiment] || "text-muted")}>{a.sentiment}</span>
                    )}
                  </div>
                  {(a.summary || a.main_narrative) && (
                    <p className="text-[11px] text-muted line-clamp-2 leading-relaxed">{a.summary || a.main_narrative}</p>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {total > PAGE && (
            <div className="flex items-center justify-between pt-2 text-sm">
              <span className="text-muted text-xs">{offset + 1}–{Math.min(offset + PAGE, total)} of {total.toLocaleString()}</span>
              <div className="flex items-center gap-1">
                <button disabled={offset === 0} onClick={() => loadFeed(offset - PAGE)}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <span className="text-xs text-muted px-2">Page {Math.floor(offset / PAGE) + 1} / {Math.ceil(total / PAGE)}</span>
                <button disabled={offset + PAGE >= total} onClick={() => loadFeed(offset + PAGE)}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{s.name}</span>
                    <Badge className={s.is_active ? "bg-green-500/15 text-green-600" : "bg-gray-500/15 text-gray-500"}>
                      {s.is_active ? "Active" : "Paused"}
                    </Badge>
                    <Badge className="bg-blue-500/15 text-blue-600">{KIND_LABEL[s.kind] ?? s.kind}</Badge>
                    {s.leaning && s.leaning !== "independent" && (
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize", LEANING_COLOR[s.leaning] || LEANING_COLOR.independent)}>
                        {s.leaning}
                      </span>
                    )}
                  </div>
                  <a href={s.url} target="_blank" rel="noreferrer"
                    className="text-xs text-muted hover:text-accent truncate block max-w-xs">{s.url}</a>
                  {s.last_ingested_at && (
                    <span className="text-xs text-muted">Last fetched: {new Date(s.last_ingested_at).toLocaleString()}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" onClick={() => ingestOne(s.id)} title="Fetch now" className="text-xs px-2 py-1">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" onClick={() => { setIsNew(false); setEditing(s); setError(""); }} className="text-xs px-2 py-1">Edit</Button>
                  <Button variant="ghost" onClick={() => deleteSource(s.id)}
                    className="text-xs px-2 py-1 text-red-500 hover:bg-red-500/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

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
