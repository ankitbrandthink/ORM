"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ExternalLink, RefreshCw, ChevronDown, Play, Pencil, Check, X, ArrowLeft, ShieldCheck, ShieldAlert, ShieldX, Users } from "lucide-react";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

import { api } from "@/lib/api";
import { Card, Button } from "@/components/ui/primitives";
import { SentimentDonut } from "@/components/dashboard/charts";
import { SentimentTimeSeries } from "@/components/dashboard/SentimentTimeSeries";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { useDateFilter } from "@/hooks/useDateFilter";

const SENT_COLOR: Record<string, string> = {
  Positive: "text-green-600", Negative: "text-red-500", Neutral: "text-gray-500",
};
const SORTS = [
  { id: "new", label: "Newest first" },
  { id: "old", label: "Oldest first" },
  { id: "pos", label: "Positive first" },
  { id: "neg", label: "Negative first" },
];
const PAGE_SIZE = 10;

function isVideoLink(url: string) {
  return /\/(reel|videos?|watch)\//i.test(url) || /\/share\/v\//i.test(url);
}
function fbEmbed(url: string) {
  return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&width=350&show_text=true`;
}

export default function PostSentimentPage() {
  const { postId } = useParams<{ postId: string }>();
  const router = useRouter();

  const [post, setPost]             = useState<any>(null);
  const [sent, setSent]             = useState<any>({ counts: {}, total_comments: 0 });
  const [timeSeries, setTimeSeries] = useState<any[]>([]);
  const [comments, setComments]     = useState<any[]>([]);
  const [sentFilter, setSentFilter] = useState("");
  const [sort, setSort]             = useState("new");
  const [busy, setBusy]             = useState(false);
  const [page, setPage]             = useState(1);
  const [feedTotal, setFeedTotal]   = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncMsg, setSyncMsg]       = useState("");
  const [editingTotal, setEditingTotal] = useState(false);
  const [newTotal, setNewTotal]     = useState("");
  const [alerting, setAlerting]     = useState(false);
  const [alertMsg, setAlertMsg]     = useState("");
  const [fetchingAll, setFetchingAll] = useState(false);
  const [fetchJob, setFetchJob]     = useState<{
    status: string; comments_added: number; comments_in_db: number;
    real_total: number; error?: string;
  } | null>(null);
  const [botStats, setBotStats]     = useState<{
    total_comments: number; estimated_real: number; estimated_bots: number;
    estimated_suspicious: number; real_pct: number; bot_pct: number; suspicious_pct: number;
  } | null>(null);

  const pollFetchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const df = useDateFilter();

  /* ── post meta + sentiment ── */
  const loadMeta = useCallback((extraParams: Record<string, any> = {}) => {
    api.get(`/posts/${postId}`).then((r) => setPost(r.data)).catch(() => {});
    api.get(`/posts/${postId}/sentiment`, { params: extraParams }).then((r) => setSent(r.data)).catch(() => {});
    api.get(`/posts/${postId}/sentiment-timeseries`, { params: extraParams })
       .then((r) => setTimeSeries(Array.isArray(r.data) ? r.data : []))
       .catch(() => setTimeSeries([]));
  }, [postId]);

  /* ── paginated comments ── */
  const fetchComments = useCallback(async (pageNum: number, replace: boolean, extraParams: Record<string, any> = {}) => {
    const params: any = { page: pageNum, page_size: PAGE_SIZE, sort, ...extraParams };
    if (sentFilter) params.sentiment = sentFilter;
    const { data } = await api.get(`/posts/${postId}/comments`, { params });
    setFeedTotal(data.total || 0);
    setComments((prev) => replace ? (data.items || []) : [...prev, ...(data.items || [])]);
    setPage(pageNum);
  }, [postId, sort, sentFilter]);

  /* ── initial load ── */
  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { fetchComments(1, true).catch(() => {}); }, [fetchComments]);
  useEffect(() => {
    if (!postId) return;
    api.get("/analytics/bot-analysis", { params: { post_id: postId } })
      .then((r) => setBotStats(r.data)).catch(() => {});
  }, [postId]);

  async function saveTotal() {
    const n = parseInt(newTotal, 10);
    if (!n || n < 1) return;
    await api.patch(`/posts/${postId}/update-total`, { total_count: n });
    setEditingTotal(false); setNewTotal("");
    loadMeta();
  }

  async function syncNow() {
    setBusy(true);
    try {
      await api.post(`/posts/${postId}/refresh`);
      setSyncMsg(""); loadMeta();
      await fetchComments(1, true, df.getQueryParams());
    } catch { setSyncMsg("Could not generate comments."); }
    finally { setBusy(false); }
  }

  /* ── Server-side comment fetch (works for all platforms, no extension needed) ── */
  async function fetchAllComments() {
    if (!post?.permalink && !post?.url) { setSyncMsg("Post has no URL — cannot fetch comments."); return; }
    setSyncMsg("");
    if (pollFetchRef.current) { clearInterval(pollFetchRef.current); pollFetchRef.current = null; }

    setFetchingAll(true);
    setFetchJob(null);
    try {
      const res = await api.post("/posts/analyze-url", {
        url: post.permalink || post.url,
        social_profile_id: post.social_profile_id || undefined,
      });
      const { post_id } = res.data;
      let misses = 0;
      pollFetchRef.current = setInterval(async () => {
        try {
          const r = await api.get(`/posts/${post_id}/fetch-progress`);
          setFetchJob(r.data);
          if (r.data.status === "done" || r.data.status === "error") {
            clearInterval(pollFetchRef.current!); pollFetchRef.current = null;
            setFetchingAll(false);
            if (r.data.status === "done") { loadMeta(); fetchComments(1, true, df.getQueryParams()).catch(() => {}); }
          }
        } catch { if (++misses >= 5) { clearInterval(pollFetchRef.current!); pollFetchRef.current = null; setFetchingAll(false); } }
      }, 2000);
    } catch (e: any) {
      setSyncMsg(e?.response?.data?.detail || "Failed to start comment fetch.");
      setFetchingAll(false);
    }
  }

  async function reanalyzeSentiment() {
    setBusy(true); setSyncMsg("Re-analyzing all comments…");
    try {
      const r = await api.post(`/posts/${postId}/reanalyze-sentiment`);
      setSyncMsg(`✓ Re-analyzed ${r.data.updated.toLocaleString()} comments.`);
      loadMeta(); fetchComments(1, true, df.getQueryParams()).catch(() => {});
    } catch { setSyncMsg("Re-analyze failed."); }
    finally { setBusy(false); setTimeout(() => setSyncMsg(""), 6000); }
  }

  async function loadMore() {
    setLoadingMore(true);
    try { await fetchComments(page + 1, false, df.getQueryParams()); }
    finally { setLoadingMore(false); }
  }

  async function sendAlert() {
    setAlerting(true); setAlertMsg("");
    try {
      await api.post(`/whatsapp/send-post-alert/${postId}`);
      setAlertMsg("✅ Alert sent to WhatsApp!");
    } catch (e: any) {
      setAlertMsg(e?.response?.data?.detail || "Failed to send alert.");
    } finally { setAlerting(false); setTimeout(() => setAlertMsg(""), 5000); }
  }

  function applyDateFilter(from: string | null, to: string | null, gran: "daily" | "weekly" | "monthly") {
    df.applyFilter(from, to, gran);
    const p: any = {};
    if (from) p.date_from = from;
    if (to)   p.date_to   = to;
    loadMeta(p); fetchComments(1, true, p).catch(() => {});
  }
  function clearDateFilter() {
    df.clearFilter(); loadMeta(); fetchComments(1, true).catch(() => {});
  }

  const counts   = sent.counts || {};
  const total    = sent.total_comments || 0;
  const realTotal    = Number(post?.metrics?.real_comment_total || post?.metrics?.comments || 0);
  const sampledCount = Number(sent?.sampled_count ?? post?.sampled_count ?? 0);
  const isExtrapolated = realTotal > 0 && sampledCount > 0 && realTotal > sampledCount;
  const hasMore  = comments.length < feedTotal;

  if (!post) return <p className="p-6 text-muted">Loading…</p>;

  const postUrl = post.permalink || post.url || "";
  const isFacebook = postUrl.includes("facebook.com");

  /* ── Progress banner state ── */
  const fetched    = fetchJob?.comments_added || 0;
  const knownTotal = Math.max(realTotal, fetched, 1);
  const pct        = fetched > 0 ? Math.min(Math.round((fetched / knownTotal) * 100), 95) : 0;
  const isRunning  = !!fetchJob && !["done", "error"].includes(fetchJob.status);
  const isDone     = fetchJob?.status === "done";
  const isError    = fetchJob?.status === "error";

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/5 text-muted hover:text-fg shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">Sentiment report · {post.author}</h1>
            <p className="text-xs text-muted">
              {post.published_at ? new Date(post.published_at).toLocaleDateString() : ""} · {post.source_kind}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button variant="ghost" onClick={sendAlert} disabled={alerting}>
              <WhatsAppIcon className={`h-4 w-4 ${alerting ? "animate-pulse text-red-500" : "text-green-600"}`} />
              {alerting ? "Sending…" : "Send Alert"}
            </Button>
            {post?.source_kind === "instagram" && (
              <Button variant="ghost" onClick={reanalyzeSentiment} disabled={busy || fetchingAll}>
                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                Re-analyze Sentiment
              </Button>
            )}
            <Button onClick={fetchAllComments} disabled={fetchingAll || busy || (!post?.permalink && !post?.url)}
              title={(!post?.permalink && !post?.url) ? "No post URL available — resync the account to capture post links" : undefined}>
              <RefreshCw className={`h-4 w-4 ${fetchingAll ? "animate-spin" : ""}`} />
              {fetchingAll ? "Syncing…" : "Sync Comments"}
            </Button>
          </div>
          {alertMsg && <span className={`text-right text-[11px] ${alertMsg.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>{alertMsg}</span>}
          {syncMsg && <span className="text-right text-[11px] text-muted">{syncMsg}</span>}
        </div>
      </div>

      {/* ── Sync progress banner ── */}
      {(fetchingAll || fetchJob) && (
        <div className={`rounded-xl border overflow-hidden ${
          isDone ? "border-green-300" : isError ? "border-red-300" : "border-blue-300"
        }`}>
          <div className={`flex items-center justify-between gap-3 px-4 py-3 ${
            isDone ? "bg-green-50 dark:bg-green-900/20"
            : isError ? "bg-red-50 dark:bg-red-900/20"
            : "bg-blue-50 dark:bg-blue-900/20"
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {isDone ? (
                <svg className="h-4 w-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              ) : isError ? (
                <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <RefreshCw className="h-4 w-4 shrink-0 text-blue-600 animate-spin" />
              )}
              <span className={`text-sm font-semibold truncate ${
                isDone ? "text-green-700"
                : isError ? "text-red-700"
                : "text-blue-700"
              }`}>
                {isDone
                  ? `✓ Done — ${fetchJob!.comments_added.toLocaleString()} comments synced`
                  : isError
                  ? `Sync error: ${fetchJob?.error || "server could not fetch comments"}`
                  : fetchJob?.status === "rate-limited"
                  ? "Rate-limited — retrying…"
                  : fetched > 0
                  ? `Syncing comments… ${fetched.toLocaleString()}${realTotal > 0 ? ` of ~${realTotal.toLocaleString()}` : ""} found`
                  : "Syncing comments from server…"}
              </span>
            </div>
            {isRunning && fetched > 0 && (
              <span className="shrink-0 text-xs font-mono font-bold text-blue-600 tabular-nums">{pct}%</span>
            )}
          </div>
          {isRunning && (
            <div className="h-1.5 w-full bg-blue-100 dark:bg-blue-900/40">
              <div
                className="h-1.5 bg-blue-500 transition-all duration-700 ease-out"
                style={{ width: fetched > 0 ? `${pct}%` : "8%", animation: fetched === 0 ? "pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite" : "none" }}
              />
            </div>
          )}
          {(isDone || isError) && (
            <div className={`px-4 py-2.5 text-xs border-t ${isDone ? "border-green-200 text-green-700 dark:text-green-300 bg-green-50/50 dark:bg-green-900/10" : "border-red-200 text-red-700 dark:text-red-400 bg-red-50/50"}`}>
              {isDone
                ? `${fetchJob!.comments_added.toLocaleString()} comments synced. Click Re-analyze Sentiment to run AI scoring.`
                : fetchJob?.error}
            </div>
          )}
        </div>
      )}

      {/* ── Date filter ── */}
      <DateRangeFilter
        isActive={df.isActive}
        onFilter={applyDateFilter}
        onClear={clearDateFilter}
      />

      {/* ── Bot / Authenticity Summary ── */}
      {botStats && botStats.total_comments > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold">Account Authenticity Analysis</span>
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">
                {botStats.total_comments} accounts analysed
              </span>
            </div>
            <span className="text-[11px] text-muted italic">Heuristic estimate — indicative only</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
              <ShieldCheck className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{botStats.real_pct}%</div>
              <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Authentic</div>
              <div className="text-[11px] text-muted">{botStats.estimated_real} accounts</div>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-center">
              <ShieldAlert className="h-5 w-5 text-amber-600 mx-auto mb-1" />
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">{botStats.suspicious_pct}%</div>
              <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">Suspicious</div>
              <div className="text-[11px] text-muted">{botStats.estimated_suspicious} accounts</div>
            </div>
            <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3 text-center">
              <ShieldX className="h-5 w-5 text-rose-600 mx-auto mb-1" />
              <div className="text-2xl font-bold text-rose-700 dark:text-rose-400 tabular-nums">{botStats.bot_pct}%</div>
              <div className="text-xs text-rose-700 dark:text-rose-400 font-medium">Bot / Fake</div>
              <div className="text-[11px] text-muted">{botStats.estimated_bots} accounts</div>
            </div>
          </div>
          {/* Stacked bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-border flex">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${botStats.real_pct}%` }} />
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${botStats.suspicious_pct}%` }} />
            <div className="h-full bg-rose-500 transition-all" style={{ width: `${botStats.bot_pct}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Based on username patterns, comment velocity, duplicate detection, and content signals. Green = likely real · Amber = suspicious · Red = likely bot.
          </p>
        </div>
      )}

      {/* ── 3-column layout ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Col 1: Post preview */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Post preview</h3>
            {postUrl && (
              <a href={postUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/15 transition-colors shrink-0">
                View live post <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {isFacebook && isVideoLink(postUrl) && (
            <a href={postUrl} target="_blank" rel="noreferrer"
              className="group relative flex h-48 items-center justify-center overflow-hidden rounded-lg border border-border bg-gradient-to-br from-[#1877f2] to-[#0a3d8f]">
              <div className="relative flex flex-col items-center gap-2 text-white">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 transition-transform group-hover:scale-110">
                  <Play className="h-6 w-6 translate-x-0.5 fill-[#1877f2] text-[#1877f2]" />
                </span>
                <span className="text-sm font-medium">Watch on Facebook</span>
              </div>
            </a>
          )}
          {isFacebook && !isVideoLink(postUrl) && postUrl && (
            <iframe src={fbEmbed(postUrl)} className="w-full rounded-lg border border-border"
              height={360} style={{ border: "none", overflow: "hidden" }}
              scrolling="no" allow="encrypted-media" title="Post preview" />
          )}
          <div className="max-h-40 overflow-y-auto text-sm leading-relaxed text-muted">{post.content}</div>
          {!postUrl && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No direct post URL available — this may be an AI-estimated post or the link wasn&apos;t captured during sync.
            </p>
          )}
        </Card>

        {/* Col 2: Sentiment donut */}
        <div className="flex flex-col gap-2">
          <SentimentDonut data={counts} className="flex-1" />
          {df.isActive && (
            <p className="text-center text-[11px] italic text-accent">
              Filtered: {df.filter.from ?? "start"} → {df.filter.to ?? "now"}
            </p>
          )}
        </div>

        {/* Col 3: Breakdown & filters */}
        <Card className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Breakdown &amp; filters</h3>
          <div className="space-y-1 text-sm">
            {[
              ["All",      "",          total,              "text-fg"],
              ["Positive", "Positive",  counts.Positive || 0, "text-green-600"],
              ["Negative", "Negative",  counts.Negative || 0, "text-red-500"],
              ["Neutral",  "Neutral",   counts.Neutral  || 0, "text-gray-400"],
            ].map(([label, val, n, color]) => (
              <button key={label as string} onClick={() => setSentFilter(val as string)}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 transition-colors ${
                  sentFilter === val ? "bg-accent/10 ring-1 ring-accent/30" : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}>
                <span className={color as string}>{label as string}</span>
                <span className="font-semibold">
                  {n as number}
                  <span className="ml-1 text-xs font-normal text-muted">
                    {total ? `(${Math.round((n as number) * 100 / total)}%)` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="space-y-1 border-t border-border pt-3 text-xs">
            {isExtrapolated && !fetchingAll && !fetchJob && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 px-3 py-2.5 text-[11px] text-blue-800 dark:text-blue-300 mb-2 space-y-1">
                <p className="font-semibold">ℹ {sampledCount.toLocaleString()} of {realTotal.toLocaleString()} comments analyzed</p>
                <p>Click <strong>Sync Comments</strong> above to fetch the full set.</p>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">Total on post</span>
              {editingTotal ? (
                <div className="flex items-center gap-1">
                  <input type="number" min={1} value={newTotal} onChange={(e) => setNewTotal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveTotal(); if (e.key === "Escape") setEditingTotal(false); }}
                    className="w-24 rounded border border-accent px-1.5 py-0.5 text-xs" autoFocus
                    placeholder={String(Math.max(total, realTotal))} />
                  <button onClick={saveTotal} className="text-green-600 hover:text-green-700"><Check className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setEditingTotal(false)} className="text-muted hover:text-fg"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <b>{Math.max(total, realTotal).toLocaleString()}</b>
                  <button onClick={() => { setEditingTotal(true); setNewTotal(String(Math.max(total, realTotal))); }}
                    title="Override count" className="text-muted hover:text-accent">
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            {sampledCount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Analysed</span>
                <b>{sampledCount} of {Math.max(total, realTotal).toLocaleString()} comments</b>
              </div>
            )}
            <div className="flex justify-between"><span className="text-muted">Avg toxicity</span><b>{((sent.avg_toxicity || 0) * 100).toFixed(0)}%</b></div>
            <div className="flex justify-between"><span className="text-muted">Crisis prob.</span><b>{((sent.crisis_probability || 0) * 100).toFixed(0)}%</b></div>
            <div className="flex justify-between"><span className="text-muted">Last synced</span><b>{post.last_synced_at ? new Date(post.last_synced_at).toLocaleString() : "—"}</b></div>
          </div>
        </Card>
      </div>

      {/* ── Time-series chart ── */}
      {timeSeries.length > 0 && (
        <SentimentTimeSeries
          data={timeSeries}
          title={df.isActive ? `Sentiment trend — ${df.filter.from ?? "start"} to ${df.filter.to ?? "now"}` : "Sentiment trend over time"}
        />
      )}

      {/* ── Comments feed ── */}
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
          <span className="text-sm font-medium">
            Comments — {comments.length} of {feedTotal}
            {sentFilter && <span className="ml-1 text-accent">{sentFilter.toLowerCase()}</span>}
            {df.isActive && <span className="ml-1 text-[11px] text-muted">(date filtered)</span>}
            {!post.metrics?.scraped && realTotal > feedTotal && (
              <span className="ml-1 text-[11px] text-muted">· {realTotal} total on post</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Sort:</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1 text-sm">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <ul className="divide-y divide-border/60">
          {comments.map((c) => {
            const authLabel: string = c.authenticity_label || "real";
            const authScore: number = c.authenticity_score ?? 0;
            const isBot = authLabel === "bot";
            const isSusp = authLabel === "suspicious";
            return (
              <li key={c.id} className="flex items-start gap-3 p-3">
                <span className={`w-16 shrink-0 text-xs font-medium ${SENT_COLOR[c.sentiment] || "text-gray-400"}`}>
                  {c.sentiment || "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.author_url ? (
                      <a href={c.author_url} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        {c.author}
                      </a>
                    ) : (
                      <span className="text-sm font-medium">{c.author}</span>
                    )}
                    {/* Authenticity badge */}
                    {isBot ? (
                      <span
                        title={`Bot/Fake account (score ${Math.round(authScore * 100)}%)`}
                        className="inline-flex items-center gap-0.5 rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400 cursor-help"
                      >
                        <ShieldX className="h-2.5 w-2.5" />
                        Bot {Math.round(authScore * 100)}%
                      </span>
                    ) : isSusp ? (
                      <span
                        title={`Suspicious account (score ${Math.round(authScore * 100)}%)`}
                        className="inline-flex items-center gap-0.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 cursor-help"
                      >
                        <ShieldAlert className="h-2.5 w-2.5" />
                        Suspicious
                      </span>
                    ) : (
                      <span
                        title={`Likely authentic account (score ${Math.round(authScore * 100)}%)`}
                        className="inline-flex items-center gap-0.5 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 cursor-help"
                      >
                        <ShieldCheck className="h-2.5 w-2.5" />
                        Real
                      </span>
                    )}
                    <span className="text-[11px] text-muted">
                      {c.published_at ? new Date(c.published_at).toLocaleString() : ""}
                    </span>
                    {c.sarcasm && <span className="text-xs text-orange-500">sarcasm</span>}
                    {(c.emotion || []).map((e: string) => (
                      <span key={e} className="text-[11px] text-accent">{e}</span>
                    ))}
                  </div>
                  <p className="text-sm">{c.content}</p>
                </div>
                {c.toxicity_score > 0.3 && (
                  <span className="shrink-0 cursor-help rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                    title={`Toxicity: ${(c.toxicity_score * 100).toFixed(0)}%`}>
                    ⚠ Tox {(c.toxicity_score * 100).toFixed(0)}%
                  </span>
                )}
              </li>
            );
          })}
          {comments.length === 0 && (
            <li className="p-8 text-center text-muted">No comments match the current filters.</li>
          )}
        </ul>
        {hasMore && (
          <div className="border-t border-border p-3 text-center">
            <Button variant="ghost" onClick={loadMore} disabled={loadingMore}>
              <ChevronDown className={`h-4 w-4 ${loadingMore ? "animate-bounce" : ""}`} />
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
