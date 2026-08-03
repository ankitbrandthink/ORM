"use client";
import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw, CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronRight,
  Youtube, Globe, Users, MessageSquare, BarChart2, Loader2, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}/api/v1`
    : "http://localhost:8000/api/v1");

type SyncProfile = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  platform: string;
  handle: string | null;
  display_name: string | null;
  profile_url: string | null;
  followers: number;
  sync_status: string;
  sync_stage: string;
  sync_posts_done: number;
  sync_total_posts: number;
  sync_comments_done: number;
  sync_error: string | null;
  last_synced: string | null;
  data_source: string;
  post_count: number;
  comment_count: number;
};

type PostRow = {
  id: string;
  external_id: string;
  url: string;
  content: string;
  published_at: string | null;
  metrics: Record<string, number>;
  real_comment_total: number;
  comments_analyzed: number;
  sentiment_breakdown: Record<string, number>;
  dominant_sentiment: string;
  summary: string;
  crisis_probability: number;
};

type CommentRow = {
  id: string;
  content: string;
  author: string | null;
  published_at: string | null;
  sentiment: string;
  emotion: string[];
  sarcasm: boolean;
  toxicity_score: number;
  stance: string;
};

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  youtube: <Youtube className="h-4 w-4 text-red-500" />,
  facebook: <Globe className="h-4 w-4 text-blue-500" />,
  instagram: <Globe className="h-4 w-4 text-pink-500" />,
  twitter: <Globe className="h-4 w-4 text-sky-500" />,
};

const PLATFORM_COLOR: Record<string, string> = {
  youtube: "bg-red-50 border-red-200 dark:bg-red-950/30",
  facebook: "bg-blue-50 border-blue-200 dark:bg-blue-950/30",
  instagram: "bg-pink-50 border-pink-200 dark:bg-pink-950/30",
  twitter: "bg-sky-50 border-sky-200 dark:bg-sky-950/30",
};

const SENTIMENT_COLOR: Record<string, string> = {
  Positive: "text-emerald-600",
  Negative: "text-red-500",
  Neutral: "text-slate-500",
  Mixed: "text-amber-500",
};

const SENTIMENT_BG: Record<string, string> = {
  Positive: "bg-emerald-100 text-emerald-700",
  Negative: "bg-red-100 text-red-700",
  Neutral: "bg-slate-100 text-slate-600",
  Mixed: "bg-amber-100 text-amber-700",
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status, error }: { status: string; error: string | null }) {
  if (status === "done") return (
    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
      <CheckCircle2 className="h-3.5 w-3.5" /> Synced
    </span>
  );
  if (status === "running" || status === "syncing" || status === "storing") return (
    <span className="flex items-center gap-1 text-xs font-medium text-blue-600">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing…
    </span>
  );
  if (status === "error") return (
    <span className="flex items-center gap-1 text-xs font-medium text-red-600" title={error || ""}>
      <AlertCircle className="h-3.5 w-3.5" /> Error
    </span>
  );
  if (status === "pending") return (
    <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
      <Clock className="h-3.5 w-3.5" /> Pending
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-slate-400">
      <Clock className="h-3.5 w-3.5" /> Not synced
    </span>
  );
}

function SentimentBar({ breakdown }: { breakdown: Record<string, number> }) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0) || 1;
  const keys = ["Positive", "Neutral", "Negative", "Mixed"];
  const colors: Record<string, string> = { Positive: "bg-emerald-400", Neutral: "bg-slate-300", Negative: "bg-red-400", Mixed: "bg-amber-400" };
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full">
      {keys.map(k => {
        const pct = ((breakdown[k] || 0) / total) * 100;
        return pct > 0 ? <div key={k} className={colors[k]} style={{ width: `${pct}%` }} title={`${k}: ${breakdown[k]}`} /> : null;
      })}
    </div>
  );
}

function CommentsModal({ profile, post, onClose }: { profile: SyncProfile; post: PostRow; onClose: () => void }) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/social-sync/profiles/${profile.id}/posts/${post.id}/comments?limit=200`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
    })
      .then(r => r.json())
      .then(data => { setComments(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [profile.id, post.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
          <div>
            <p className="font-semibold text-sm">{post.content?.slice(0, 80)}…</p>
            <p className="text-xs text-muted mt-0.5">{comments.length} comments analyzed · {post.dominant_sentiment} sentiment</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-fg text-lg leading-none">×</button>
        </div>
        <div className="divide-y divide-border">
          {loading && <div className="p-8 text-center text-sm text-muted"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading comments…</div>}
          {!loading && comments.length === 0 && <div className="p-8 text-center text-sm text-muted">No analyzed comments yet.</div>}
          {comments.map(c => (
            <div key={c.id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-fg">{c.author || "Anonymous"}</span>
                <div className="flex items-center gap-1.5">
                  {c.sarcasm && <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">Sarcastic</span>}
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", SENTIMENT_BG[c.sentiment] || "bg-slate-100 text-slate-600")}>
                    {c.sentiment}
                  </span>
                  {c.toxicity_score > 0.5 && (
                    <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Toxic</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-fg/80">{c.content}</p>
              <p className="text-[10px] text-muted mt-1">{fmtDate(c.published_at)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileCard({ profile, onSyncDone }: { profile: SyncProfile; onSyncDone: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; comments: number } | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PostRow | null>(null);
  const [currentStatus, setCurrentStatus] = useState(profile.sync_status);
  const [lastSynced, setLastSynced] = useState(profile.last_synced);
  const [postCount, setPostCount] = useState(profile.post_count);
  const [commentCount, setCommentCount] = useState(profile.comment_count);

  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : "";

  const loadPosts = useCallback(async () => {
    if (!expanded) return;
    setLoadingPosts(true);
    try {
      const r = await fetch(`${API}/social-sync/profiles/${profile.id}/posts?limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      setPosts(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoadingPosts(false);
  }, [expanded, profile.id, token]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const pollStatus = useCallback(async (jobId: string) => {
    for (let i = 0; i < 180; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const r = await fetch(`${API}/sync/status/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) continue;
        const data = await r.json();
        setProgress({ done: data.posts_done || 0, total: data.total_posts || 0, comments: data.comments_done || 0 });
        if (data.stage === "done" || data.stage === "error") {
          setSyncing(false);
          setCurrentStatus(data.error ? "error" : "done");
          setSyncError(data.error || null);
          setLastSynced(new Date().toISOString());
          // Refresh counts
          const sr = await fetch(`${API}/social-sync/profiles/${profile.id}/status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (sr.ok) {
            const sd = await sr.json();
            setPostCount(sd.post_count || 0);
            setCommentCount(sd.comment_count || 0);
          }
          await loadPosts();
          onSyncDone();
          return;
        }
      } catch { /* ignore */ }
    }
    setSyncing(false);
  }, [profile.id, token, loadPosts, onSyncDone]);

  const startSync = async () => {
    setSyncing(true);
    setSyncError(null);
    setProgress(null);
    try {
      const r = await fetch(`${API}/social-sync/profiles/${profile.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ max_posts: 200, days: 90 }),
      });
      const data = await r.json();
      if (data.job_id) {
        setCurrentStatus("running");
        pollStatus(data.job_id);
      } else {
        setSyncing(false);
        setSyncError(data.detail || "Failed to start sync");
      }
    } catch (e) {
      setSyncing(false);
      setSyncError("Network error");
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className={cn("rounded-2xl border bg-card transition-all", PLATFORM_COLOR[profile.platform] || "border-border")}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          {PLATFORM_ICON[profile.platform] || <Globe className="h-4 w-4 text-slate-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{profile.display_name || profile.handle || profile.platform}</span>
            {profile.client_name && (
              <span className="text-[10px] px-1.5 py-0.5 bg-black/10 dark:bg-white/10 rounded-full shrink-0">{profile.client_name}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted">
            <span className="capitalize">{profile.platform}</span>
            {profile.followers > 0 && <><span>·</span><span>{profile.followers.toLocaleString()} followers</span></>}
          </div>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted shrink-0">
          <span className="flex items-center gap-1"><BarChart2 className="h-3.5 w-3.5" />{postCount} posts</span>
          <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{commentCount.toLocaleString()} analyzed</span>
        </div>

        {/* Status */}
        <div className="shrink-0 ml-2">
          <StatusBadge status={syncing ? "running" : currentStatus} error={syncError} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={startSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60 transition-opacity"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {syncing ? "Syncing" : "Sync Now"}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-lg p-1.5 text-muted hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Progress bar while syncing */}
      {syncing && progress && (
        <div className="px-4 pb-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-muted">
            {progress.done}/{progress.total} posts · {progress.comments.toLocaleString()} comments analyzed
          </p>
        </div>
      )}

      {/* Error */}
      {syncError && !syncing && (
        <div className="mx-4 mb-3 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-600">
          {syncError}
        </div>
      )}

      {/* Last synced */}
      {lastSynced && !syncing && (
        <div className="px-4 pb-1.5 text-[10px] text-muted">
          Last synced: {fmtDate(lastSynced)}
        </div>
      )}

      {/* Expanded posts list */}
      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3">
          {loadingPosts && (
            <div className="py-8 text-center text-sm text-muted">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading posts…
            </div>
          )}
          {!loadingPosts && posts.length === 0 && (
            <div className="py-8 text-center text-sm text-muted">
              No posts yet. Click <strong>Sync Now</strong> to fetch posts and comments.
            </div>
          )}
          {!loadingPosts && posts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted">Recent posts with comment analysis</p>
                <span className="text-[10px] text-muted">{posts.length} shown</span>
              </div>
              {posts.map(post => (
                <div key={post.id} className="group rounded-xl border border-border bg-card/50 px-3 py-2.5 hover:bg-card transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-fg truncate">{post.content?.slice(0, 100) || "—"}</p>
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-muted">
                        <span>{fmtDate(post.published_at)}</span>
                        {post.real_comment_total > 0 && (
                          <span>{post.real_comment_total.toLocaleString()} total comments</span>
                        )}
                        <span className={cn("font-medium", SENTIMENT_COLOR[post.dominant_sentiment] || "text-muted")}>
                          {post.dominant_sentiment}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-muted whitespace-nowrap">{post.comments_analyzed} analyzed</span>
                      {post.comments_analyzed > 0 && (
                        <button
                          onClick={() => setSelectedPost(post)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Eye className="h-3 w-3" /> View
                        </button>
                      )}
                      {post.url && (
                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-muted hover:text-accent transition-colors opacity-0 group-hover:opacity-100">
                          ↗
                        </a>
                      )}
                    </div>
                  </div>
                  {post.comments_analyzed > 0 && (
                    <div className="mt-1.5">
                      <SentimentBar breakdown={post.sentiment_breakdown} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Comments modal */}
      {selectedPost && (
        <CommentsModal profile={profile} post={selectedPost} onClose={() => setSelectedPost(null)} />
      )}
    </div>
  );
}

export default function SocialSyncPage() {
  const [profiles, setProfiles] = useState<SyncProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ profile_count: number; total_posts: number; total_comments: number; comments_analyzed: number } | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : "";

  const loadData = useCallback(async () => {
    try {
      const [pr, sr] = await Promise.all([
        fetch(`${API}/social-sync/profiles`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/social-sync/summary`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const pd = await pr.json();
      const sd = await sr.json();
      setProfiles(Array.isArray(pd) ? pd : []);
      setSummary(sd);
    } catch (e) {
      setError("Failed to load profiles");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  // Group by client
  const grouped = profiles.reduce<Record<string, SyncProfile[]>>((acc, p) => {
    const key = p.client_name || "Unassigned";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-fg">Social Sync</h1>
        <p className="mt-1 text-sm text-muted">
          Automatically fetch posts and analyze comments from connected accounts — no extension or API key required.
        </p>
      </div>

      {/* Stats strip */}
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Accounts", value: summary.profile_count, icon: Users },
            { label: "Posts", value: summary.total_posts, icon: BarChart2 },
            { label: "Comments", value: summary.total_comments, icon: MessageSquare },
            { label: "Analyzed", value: summary.comments_analyzed, icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2 text-muted text-xs mb-1">
                <Icon className="h-3.5 w-3.5" />{label}
              </div>
              <p className="text-xl font-bold text-fg">{(value || 0).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
        <strong>How it works:</strong> Social Sync fetches real posts and top comments directly from public social media accounts — no browser extension, no paid API, no setup needed. YouTube uses yt-dlp; Facebook uses the mobile web version. Just click <strong>Sync Now</strong> on any account below.
      </div>

      {/* Profiles */}
      {loading && (
        <div className="py-20 text-center text-muted">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
          Loading connected accounts…
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && profiles.length === 0 && (
        <div className="rounded-2xl border border-border bg-card py-16 text-center">
          <Globe className="mx-auto mb-3 h-10 w-10 text-muted/40" />
          <p className="font-medium text-fg">No social accounts connected yet</p>
          <p className="mt-1 text-sm text-muted">Go to <strong>Clients &amp; Accounts</strong> to add social profiles, then come back here to sync them.</p>
        </div>
      )}

      {Object.entries(grouped).map(([clientName, group]) => (
        <div key={clientName} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted px-1">{clientName}</h2>
          <div className="space-y-3">
            {group.map(p => (
              <ProfileCard key={p.id} profile={p} onSyncDone={loadData} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
