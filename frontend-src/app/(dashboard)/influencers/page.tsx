"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Users, TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink,
  Filter, Star, FileDown, Zap, Search,
  ChevronDown, ChevronUp, X, Hash, Flame, Eye,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscoveredPost {
  url: string;
  content: string;
  sentiment: string | null;
  published_at: string | null;
}

interface Influencer {
  id: string;
  platform: string;
  handle: string;
  profile_url: string;
  keyword: string;
  stance: "Pro" | "Anti" | "Mixed";
  positive_count: number;
  negative_count: number;
  total_posts: number;
  followers_count: number | null;
  follower_tier: string;
  keyword_clusters: string[];
  last_seen: string | null;
  posts: DiscoveredPost[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  micro: "< 10K",
  mid: "10K – 1L",
  macro: "1L – 10L",
  mega: "10L+",
  unknown: "Unknown",
};

// Always show all 4 tiers in the filter bar
const ALL_TIERS = ["micro", "mid", "macro", "mega"] as const;

function formatFollowers(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// ── Platform icons ────────────────────────────────────────────────────────────

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  if (platform === "youtube") return <YouTubeIcon className={className} />;
  if (platform === "facebook") return <FacebookIcon className={className} />;
  if (platform === "instagram") return <InstagramIcon className={className} />;
  return <TwitterIcon className={className} />;
}

function platformLabel(platform: string): string {
  if (platform === "youtube") return "YouTube";
  if (platform === "facebook") return "Facebook";
  if (platform === "instagram") return "Instagram";
  return "Twitter/X";
}

function platformColor(platform: string): string {
  if (platform === "youtube") return "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400";
  if (platform === "facebook") return "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400";
  if (platform === "instagram") return "bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400";
  return "bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400";
}

// ── Influencer Card (accordion) ───────────────────────────────────────────────

function InfluencerCard({ inf, onRemove }: { inf: Influencer; onRemove: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const total = (inf.positive_count + inf.negative_count) || 1;
  const posP = Math.round((inf.positive_count / total) * 100);
  const negP = Math.round((inf.negative_count / total) * 100);

  const stanceCls =
    inf.stance === "Pro"
      ? "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30"
      : inf.stance === "Anti"
      ? "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30"
      : "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/40";

  const borderCls =
    inf.stance === "Pro"
      ? "border-l-4 border-l-emerald-400"
      : inf.stance === "Anti"
      ? "border-l-4 border-l-red-400"
      : "border-l-4 border-l-slate-300";

  const StanceIcon = inf.stance === "Pro" ? TrendingUp : inf.stance === "Anti" ? TrendingDown : Minus;

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", borderCls)}>
      {/* Header row */}
      <button
        className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-muted/10 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        {/* Platform avatar */}
        <div className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5",
          platformColor(inf.platform),
        )}>
          <PlatformIcon platform={inf.platform} className="h-3.5 w-3.5" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Handle + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold truncate text-accent">@{inf.handle}</span>
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold flex items-center gap-0.5", stanceCls)}>
              <StanceIcon className="h-2.5 w-2.5" />{inf.stance}
            </span>
            {inf.follower_tier !== "unknown" && (
              <Badge className="text-[9px] px-1.5">{TIER_LABELS[inf.follower_tier]}</Badge>
            )}
            {inf.followers_count != null && (
              <span className="text-[9px] text-muted">{formatFollowers(inf.followers_count)}</span>
            )}
            {inf.total_posts >= 3 && (
              <span className="rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 px-1.5 py-0.5 text-[9px] font-semibold flex items-center gap-0.5">
                <Zap className="h-2.5 w-2.5" />Active
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-muted">
            <span className="font-medium">{inf.total_posts} posts</span>
            <span className="text-emerald-600 font-medium">+{inf.positive_count}</span>
            <span className="text-red-500 font-medium">−{inf.negative_count}</span>
            {inf.keyword && <span className="opacity-50">#{inf.keyword}</span>}
          </div>

          {/* Sentiment bar */}
          <div className="flex gap-0.5 h-1 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 mt-1.5">
            {posP > 0 && <div className="bg-emerald-500" style={{ width: `${posP}%` }} />}
            {negP > 0 && <div className="bg-red-500" style={{ width: `${negP}%` }} />}
            {100 - posP - negP > 0 && <div className="bg-slate-300 dark:bg-slate-600 flex-1" />}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-muted" />}
          <button
            onClick={e => { e.stopPropagation(); onRemove(inf.id); }}
            className="text-muted hover:text-red-500 transition-colors ml-0.5"
            title="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="px-3 pb-3 border-t border-border/60 space-y-2.5 pt-2.5">
          {/* Keyword clusters */}
          {inf.keyword_clusters.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-[11px] text-muted mb-1.5">
                <Hash className="h-3 w-3" /><span className="font-medium">Keyword Clusters</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {inf.keyword_clusters.map((kw, i) => (
                  <span key={i} className="rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[10px] font-medium">#{kw}</span>
                ))}
              </div>
            </div>
          )}

          {/* Posts */}
          {inf.posts.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-[11px] text-muted mb-1.5">
                <Eye className="h-3 w-3" /><span className="font-medium">Posts ({inf.posts.length})</span>
              </div>
              <div className="space-y-1.5">
                {inf.posts.map((p, i) => (
                  <div key={i} className="rounded-lg bg-muted/20 dark:bg-slate-800/40 p-2 space-y-1">
                    <div className="flex items-start gap-1.5">
                      {p.sentiment && (
                        <span className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                          p.sentiment === "Pro"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : p.sentiment === "Anti"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-700/40",
                        )}>
                          {p.sentiment}
                        </span>
                      )}
                      <p className="text-[11px] text-fg/80 line-clamp-2 flex-1">{p.content}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      {p.published_at && (
                        <span className="text-[10px] text-muted">
                          {new Date(p.published_at).toLocaleDateString("en-IN")}
                        </span>
                      )}
                      <a href={p.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-0.5 text-[10px] text-accent hover:underline ml-auto">
                        <ExternalLink className="h-2.5 w-2.5" /> View
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Profile link */}
          {inf.profile_url && (
            <a href={inf.profile_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-accent hover:underline">
              <ExternalLink className="h-3 w-3" /> View @{inf.handle} on {platformLabel(inf.platform)}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Viral Posts Section (primary default view) ───────────────────────────────

const PAGE_SIZE = 10;

function stripHtml(text: string): string {
  return text
    .replace(/^\[(?:Pro|Anti|Mixed) toward [^\]]+\]\s*/i, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[^<>]*>\s*/g, "")
    .replace(/^<[^>]+/, "")
    .replace(/&[a-zA-Z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ViralSection({ influencers, clientName }: { influencers: Influencer[]; clientName: string }) {
  const [proVisible, setProVisible] = useState(PAGE_SIZE);
  const [antiVisible, setAntiVisible] = useState(PAGE_SIZE);

  // All posts across ALL platforms (no ig/fb filter here)
  const allPosts = influencers
    .flatMap(inf => inf.posts.map(p => ({ ...p, handle: inf.handle, stance: inf.stance, platform: inf.platform, profile_url: inf.profile_url })))
    .filter(p => p.url);

  const proViral  = allPosts.filter(p => p.stance === "Pro");
  const antiViral = allPosts.filter(p => p.stance === "Anti");

  const proShow  = proViral.slice(0, proVisible);
  const antiShow = antiViral.slice(0, antiVisible);

  if (proViral.length === 0 && antiViral.length === 0) return null;

  function PostCard({ p, accent }: { p: typeof proViral[0]; accent: "pro" | "anti" }) {
    const borderCls = accent === "pro"
      ? "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/20"
      : "border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20";
    const iconCls = accent === "pro" ? "text-emerald-600" : "text-red-500";
    const displayContent = stripHtml(p.content) || p.url;
    return (
      <a href={p.url} target="_blank" rel="noreferrer"
        className={`block rounded-lg border p-2.5 transition-colors group ${borderCls}`}>
        <div className="flex items-center gap-1.5 mb-1">
          <PlatformIcon platform={p.platform} className={`h-3 w-3 ${iconCls}`} />
          <span className="text-[11px] font-semibold text-accent">@{p.handle}</span>
          <span className={cn("text-[9px] font-bold uppercase rounded-full px-1.5 py-px ml-auto",
            accent === "pro" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300")}>
            {platformLabel(p.platform)}
          </span>
        </div>
        <p className="text-[11px] text-fg/80 line-clamp-2">{displayContent}</p>
        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-accent group-hover:underline">
          <ExternalLink className="h-3 w-3" /> Open Post
        </div>
      </a>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          Viral Posts — All Social Media
          <span className="text-xs text-muted font-normal">Pro &amp; Anti voices for {clientName}</span>
        </h2>
        <span className="text-xs text-muted">{proViral.length + antiViral.length} posts total</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {proViral.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Pro Voices
              <span className="ml-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-1.5 text-[10px]">{proViral.length}</span>
            </div>
            {proShow.map((p, i) => <PostCard key={i} p={p} accent="pro" />)}
            {proVisible < proViral.length && (
              <button
                onClick={() => setProVisible(v => v + PAGE_SIZE)}
                className="w-full rounded-lg border border-emerald-200 dark:border-emerald-800/40 py-2 text-xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors">
                Load more · {proViral.length - proVisible} remaining
              </button>
            )}
          </div>
        )}
        {antiViral.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" /> Anti Voices
              <span className="ml-1 rounded-full bg-red-100 dark:bg-red-900/30 px-1.5 text-[10px]">{antiViral.length}</span>
            </div>
            {antiShow.map((p, i) => <PostCard key={i} p={p} accent="anti" />)}
            {antiVisible < antiViral.length && (
              <button
                onClick={() => setAntiVisible(v => v + PAGE_SIZE)}
                className="w-full rounded-lg border border-red-200 dark:border-red-800/40 py-2 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                Load more · {antiViral.length - antiVisible} remaining
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function InfluencersPage() {
  const [clients, setClients]       = useState<any[]>([]);
  const [clientId, setClientId]     = useState("");
  const [clientName, setClientName] = useState("");
  const [days, setDays]             = useState(90);

  const [discovered, setDiscovered]                 = useState<Influencer[]>([]);
  const [discoverKeywords, setDiscoverKeywords]     = useState<string[]>([]);
  const [discoverLoading, setDiscoverLoading]       = useState(false);

  const [stanceFilter, setStanceFilter]     = useState<"all" | "pro" | "anti" | "mixed">("all");
  const [tierFilter, setTierFilter]         = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [activeKeyword, setActiveKeyword]   = useState<string | null>(null);
  const [igFbOnly, setIgFbOnly]             = useState(true);

  const [discoverKeyword, setDiscoverKeyword]     = useState("");
  const [discoverPlatform, setDiscoverPlatform]   = useState<"twitter" | "instagram" | "facebook">("instagram");
  const [discovering, setDiscovering]             = useState(false);
  const [discoverStatus, setDiscoverStatus]       = useState("");
  const [extractProgress, setExtractProgress]     = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const autoDiscoveredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    api.get("/clients").then(r => {
      const list = r.data || [];
      setClients(list);
      if (list.length > 0) { setClientId(list[0].id); setClientName(list[0].name); }
    }).catch(() => {});
  }, []);

  const loadDiscovered = useCallback((cid: string, kw?: string | null) => {
    if (!cid) return;
    setDiscoverLoading(true);
    const params: any = { client_id: cid };
    if (kw) params.keyword = kw;
    api.get("/social-listening/influencers", { params })
      .then(r => {
        setDiscovered(r.data.influencers || []);
        setDiscoverKeywords(r.data.keywords || []);
      })
      .catch(() => {})
      .finally(() => setDiscoverLoading(false));
  }, []);

  useEffect(() => {
    if (clientId) loadDiscovered(clientId, activeKeyword);
  }, [clientId, activeKeyword, loadDiscovered]);

  // Auto-discover on first visit
  useEffect(() => {
    if (!clientId || !clientName || discoverLoading) return;
    if (autoDiscoveredRef.current.has(clientId)) return;
    autoDiscoveredRef.current.add(clientId);
    if (discoverKeywords.length === 0) {
      setDiscoverStatus(`Auto-discovering influencers for "${clientName}" on Instagram & Facebook…`);
      api.post("/social-listening/discover", {
        client_id: clientId, keyword: clientName, platform: "instagram", limit: 50,
      }).then(() => {
        setTimeout(() => loadDiscovered(clientId, null), 20000);
        setTimeout(() => { loadDiscovered(clientId, null); setDiscoverStatus(""); }, 35000);
      }).catch(() => setDiscoverStatus(""));
    }
  }, [clientId, clientName, discoverLoading, discoverKeywords.length, loadDiscovered]);

  function handleClientChange(id: string) {
    setClientId(id);
    const c = clients.find(c => c.id === id);
    if (c) setClientName(c.name);
    setActiveKeyword(null);
  }

  async function handleExtract() {
    if (!clientId) return;
    const kw = discoverKeyword.trim() || clientName;
    if (!kw) return;
    const plat = discoverPlatform === "twitter" ? "instagram" : discoverPlatform;
    const companion = plat === "instagram" ? "facebook" : "instagram";
    setDiscovering(true);
    setIgFbOnly(false); // show all platforms so Twitter/YouTube aren't hidden
    setExtractProgress(0);
    setDiscoverStatus("");

    // Animate progress bar: 0→90% over 35 s, then hold until results arrive
    const startMs = Date.now();
    const totalMs = 35000;
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      const p = Math.min(90, ((Date.now() - startMs) / totalMs) * 100);
      setExtractProgress(p);
      if (p >= 90) { clearInterval(progressTimerRef.current!); progressTimerRef.current = null; }
    }, 300);

    try {
      await api.post("/social-listening/discover", {
        client_id: clientId, keyword: kw, platform: plat, limit: 50,
      });
      api.post("/social-listening/discover", {
        client_id: clientId, keyword: kw, platform: companion, limit: 50,
      }).catch(() => {});
      setTimeout(() => loadDiscovered(clientId, null), 20000);
      setTimeout(() => {
        loadDiscovered(clientId, null);
        setExtractProgress(100);
        setTimeout(() => { setExtractProgress(0); setDiscovering(false); }, 600);
      }, 40000);
    } catch {
      setDiscoverStatus("Extraction failed. Please try again.");
      setExtractProgress(0);
      setDiscovering(false);
      if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
    }
  }

  async function removeInfluencer(id: string) {
    await api.delete(`/social-listening/influencers/${id}`).catch(() => {});
    setDiscovered(prev => prev.filter(d => d.id !== id));
  }

  // Apply filters
  const filtered = discovered.filter(inf => {
    if (igFbOnly && inf.platform !== "instagram" && inf.platform !== "facebook") return false;
    if (stanceFilter !== "all" && inf.stance.toLowerCase() !== stanceFilter) return false;
    if (tierFilter !== "all" && inf.follower_tier !== "unknown" && inf.follower_tier !== tierFilter) return false;
    if (platformFilter !== "all" && inf.platform !== platformFilter) return false;
    return true;
  });

  const proList   = filtered.filter(i => i.stance === "Pro");
  const antiList  = filtered.filter(i => i.stance === "Anti");
  const mixedList = filtered.filter(i => i.stance === "Mixed");

  const platformsPresent = [...new Set(discovered.map(i => i.platform))];

  // Tier counts for display on pills
  const tierCounts = discovered.reduce<Record<string, number>>((acc, i) => {
    if (i.follower_tier !== "unknown") acc[i.follower_tier] = (acc[i.follower_tier] || 0) + 1;
    return acc;
  }, {});

  // ── Report helpers ───────────────────────────────────────────────────────────

  function buildReportHtml(): string {
    const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const proCount   = discovered.filter(i => i.stance === "Pro").length;
    const antiCount  = discovered.filter(i => i.stance === "Anti").length;
    const mixedCount = discovered.filter(i => i.stance === "Mixed").length;
    const total      = discovered.length;
    const proP       = total > 0 ? Math.round((proCount / total) * 100) : 0;
    const antiP      = total > 0 ? Math.round((antiCount / total) * 100) : 0;
    const mixedP     = Math.max(0, 100 - proP - antiP);
    const repScore   = total > 0 ? Math.round(((proCount + mixedCount * 0.5) / total) * 100) : 50;

    const topClusters = discovered
      .flatMap(i => i.keyword_clusters)
      .reduce((acc: Record<string, number>, kw) => { acc[kw] = (acc[kw] || 0) + 1; return acc; }, {});
    const topKws = Object.entries(topClusters).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k]) => k);

    function esc(s: string) {
      return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function makeSection(list: Influencer[], label: string, color: string) {
      if (!list.length) return "";
      const rows = list.map((inf, idx) => {
        const topPost = inf.posts[0];
        const postLink = topPost
          ? `<a href="${esc(topPost.url)}" style="color:#1e40af;font-size:7.5pt;">${esc((topPost.content || topPost.url).slice(0, 80))}…</a>`
          : (inf.profile_url ? `<a href="${esc(inf.profile_url)}" style="color:#1e40af;font-size:7.5pt;">View Profile →</a>` : "—");
        const clusters = inf.keyword_clusters.slice(0, 4).map(k =>
          `<span style="display:inline-block;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:1px 6px;border-radius:8px;font-size:7pt;margin:1px;">#${esc(k)}</span>`
        ).join(" ");
        return `<tr>
          <td style="color:#9ca3af;text-align:center;font-size:8pt;">${idx + 1}</td>
          <td><a href="${esc(inf.profile_url)}" style="color:#1e40af;font-weight:600;font-size:9pt;">@${esc(inf.handle)}</a><br>
          <span style="font-size:7.5pt;color:#6b7280;">${esc(platformLabel(inf.platform))} · ${inf.followers_count != null ? formatFollowers(inf.followers_count) + " followers" : TIER_LABELS[inf.follower_tier]}</span></td>
          <td style="font-size:8pt;">${clusters}</td>
          <td style="text-align:right;font-size:9pt;">${inf.total_posts}</td>
          <td style="text-align:right;font-size:9pt;color:#16a34a;">+${inf.positive_count}</td>
          <td style="text-align:right;font-size:9pt;color:#dc2626;">−${inf.negative_count}</td>
          <td style="font-size:8pt;">${postLink}</td>
        </tr>`;
      }).join("");
      return `
        <h2 style="color:${color};font-size:13pt;border-left:4px solid ${color};padding:3px 0 3px 10px;margin:20px 0 9px;">${label} (${list.length})</h2>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:${color};color:#fff;">
            <th style="padding:5px 7px;width:3%;text-align:center;">#</th>
            <th style="padding:5px 7px;width:20%;">Handle</th>
            <th style="padding:5px 7px;width:28%;">Keyword Clusters</th>
            <th style="padding:5px 7px;width:6%;text-align:right;">Posts</th>
            <th style="padding:5px 7px;width:5%;text-align:right;">Pro</th>
            <th style="padding:5px 7px;width:5%;text-align:right;">Anti</th>
            <th style="padding:5px 7px;">Top Post</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Influencer Intelligence Report — ${esc(clientName)}</title>
<style>
@page{size:A4;margin:14mm 11mm;}*{box-sizing:border-box;}
body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#111;margin:0;padding:0;}
h2{page-break-before:always;padding-top:2px;}
h3{color:#374151;font-size:10.5pt;margin:12px 0 5px;font-weight:600;}
table{width:100%;border-collapse:collapse;}td{padding:5px 7px;border-bottom:1px solid #f0f0f0;vertical-align:top;}
tr:nth-child(even) td{background:#f9fafb;}
a{color:#1e40af;text-decoration:none;}
.hdr{background:#1e40af;color:white;padding:13px 17px;margin-bottom:16px;border-radius:4px;}
.hdr h1{color:white;font-size:18pt;margin:0 0 4px;}.hdr p{color:rgba(255,255,255,.88);font-size:9pt;margin:2px 0;}
.kpi td{border:1px solid #e5e7eb!important;background:white!important;padding:10px 8px;text-align:center;}
.kpi-label{font-size:8pt;color:#6b7280;margin-bottom:2px;}.kpi-val{font-size:22pt;font-weight:800;line-height:1.1;}
.footer{margin-top:22px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:8pt;color:#9ca3af;text-align:center;}
.rec{border-left:3px solid #1e40af;padding:7px 12px;margin:7px 0;background:#f8faff;border-radius:0 4px 4px 0;font-size:9.5pt;}
.rec.warn{border-left-color:#dc2626;background:#fff8f8;}.rec.good{border-left-color:#16a34a;background:#f0fdf4;}
</style></head><body>
<div class="hdr"><h1>Influencer Intelligence Report</h1>
<p><strong>Account:</strong> ${esc(clientName)} &nbsp;·&nbsp; <strong>Period:</strong> Last ${days} days &nbsp;·&nbsp; <strong>Generated:</strong> ${date}</p>
<p>Keywords: ${esc(discoverKeywords.join(", ") || clientName)} &nbsp;·&nbsp; Platforms: Twitter/X, YouTube &nbsp;·&nbsp; Powered by ORM CMS</p></div>

<h2 style="color:#1e40af;font-size:13pt;border-left:4px solid #1e40af;padding:3px 0 3px 10px;margin:0 0 9px;page-break-before:auto;">Executive Summary</h2>
<table class="kpi" style="margin-bottom:14px;"><tr>
<td><div class="kpi-label">Total Influencers</div><div class="kpi-val">${total}</div></td>
<td><div class="kpi-label">Pro Voices</div><div class="kpi-val" style="color:#16a34a">${proCount}</div></td>
<td><div class="kpi-label">Anti Voices</div><div class="kpi-val" style="color:#dc2626">${antiCount}</div></td>
<td><div class="kpi-label">Mixed</div><div class="kpi-val" style="color:#6b7280">${mixedCount}</div></td>
<td><div class="kpi-label">Rep Score</div><div class="kpi-val" style="color:${repScore >= 60 ? "#16a34a" : repScore >= 40 ? "#f59e0b" : "#dc2626"}">${repScore}%</div></td>
</tr></table>

<div style="height:20px;border-radius:3px;overflow:hidden;display:flex;margin:6px 0 10px;">
<div style="width:${proP}%;background:#16a34a;"></div>
<div style="width:${antiP}%;background:#dc2626;"></div>
<div style="width:${mixedP}%;background:#d1d5db;"></div>
</div>
<div style="font-size:8.5pt;display:flex;gap:14px;margin-bottom:16px;">
<span><span style="color:#16a34a;font-weight:700">■</span> Pro ${proP}% (${proCount})</span>
<span><span style="color:#dc2626;font-weight:700">■</span> Anti ${antiP}% (${antiCount})</span>
<span><span style="color:#9ca3af;font-weight:700">■</span> Mixed ${mixedP}% (${mixedCount})</span>
</div>

${topKws.length > 0 ? `<h3>Top Keyword Clusters</h3><div style="margin:5px 0 14px;">${topKws.map(k => `<span style="display:inline-block;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:2px 9px;border-radius:10px;font-size:8.5pt;margin:2px;">#${esc(k)}</span>`).join(" ")}</div>` : ""}

${makeSection(discovered.filter(i => i.stance === "Pro"), "Pro Voices — Supporters", "#16a34a")}
${makeSection(discovered.filter(i => i.stance === "Anti"), "Anti Voices — Critics", "#dc2626")}
${makeSection(discovered.filter(i => i.stance === "Mixed"), "Mixed / Neutral Voices", "#6b7280")}

<h2 style="color:#1e40af;font-size:13pt;border-left:4px solid #1e40af;padding:3px 0 3px 10px;margin:20px 0 9px;">Strategy &amp; Recommendations</h2>
${proP >= 60 ? `<div class="rec good"><strong>✓ Strong Pro Sentiment (${proP}%)</strong><br>Amplify top supporters. Engage proactively and reshare their content.</div>` : proP < 35 ? `<div class="rec warn"><strong>⚠ Low Support — Action Required (${proP}% Pro, ${antiP}% Anti)</strong><br>Urgent reputation management needed.</div>` : `<div class="rec"><strong>◈ Balanced Coverage (${proP}% Pro, ${antiP}% Anti)</strong><br>Focus on converting mixed voices through targeted engagement.</div>`}
${antiCount > 0 ? `<div class="rec warn"><strong>⚠ Monitor ${antiCount} Anti Voice${antiCount !== 1 ? "s" : ""}</strong><br>Track and address with factual responses.</div>` : `<div class="rec good"><strong>✓ No Major Critics Found</strong><br>Continue monitoring regularly.</div>`}
<div class="rec"><strong>◈ Recommended Next Steps</strong><br>1. Amplify top pro voices weekly<br>2. Respond to anti voices within 24 hours<br>3. Run keyword discovery weekly for: ${esc(discoverKeywords.join(", ") || clientName)}<br>4. Generate monthly reports to track trends</div>

<div class="footer">Generated by ORM CMS · ${date} · Confidential · Account: ${esc(clientName)} · ${total} social influencers analysed (Twitter/X + YouTube)</div>
</body></html>`;

    return html;
  }

  function previewReport() {
    const html = buildReportHtml();
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  async function downloadReport() {
    const html = buildReportHtml();
    const filename = `Influencer-Report-${clientName.replace(/\s+/g, "-")}-${days}d.pdf`;
    try {
      const res = await api.post("/analytics/html-to-pdf", { html, filename }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch {
      previewReport();
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Star className="h-6 w-6 text-accent" /> Influencer Intelligence
          </h1>
          <p className="text-sm text-muted">
            Instagram &amp; Facebook handles — Pro &amp; Anti voices for {clientName || "the connected account"}.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {clients.length > 0 && (
            <select value={clientId} onChange={e => handleClientChange(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last year</option>
          </select>
          <Button onClick={handleExtract} disabled={discovering || !clientId}
            className="relative overflow-hidden flex items-center gap-1.5 text-sm min-w-[158px] justify-center">
            {/* progress fill layer */}
            {discovering && (
              <span
                className="absolute inset-0 bg-white/20 transition-all ease-linear"
                style={{ width: `${extractProgress}%`, transitionDuration: "300ms" }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {discovering
                ? <><RefreshCw className="h-4 w-4 animate-spin" />{Math.round(extractProgress)}%</>
                : <><Zap className="h-4 w-4" />Extract Handles</>}
            </span>
          </Button>
          {discovered.length > 0 && (
            <Button variant="ghost" onClick={previewReport}
              className="flex items-center gap-1.5 text-sm border border-border">
              <Eye className="h-4 w-4" /> Preview Report
            </Button>
          )}
          {discovered.length > 0 && (
            <Button onClick={downloadReport} className="flex items-center gap-1.5 text-sm">
              <FileDown className="h-4 w-4" /> Download PDF
            </Button>
          )}
        </div>
      </div>

      {/* ── Keyword + Platform row ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/30 border border-border/60 px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted shrink-0" />
        <input
          type="text"
          value={discoverKeyword}
          onChange={e => setDiscoverKeyword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleExtract()}
          placeholder={`Keyword (default: ${clientName || "account name"})`}
          className="flex-1 min-w-[160px] max-w-xs bg-transparent text-sm focus:outline-none placeholder:text-muted/60"
        />
        <div className="h-4 w-px bg-border/60 mx-1" />
        <span className="text-xs text-muted shrink-0">Platform:</span>
        {(["instagram", "facebook", "twitter"] as const).map(p => {
          const active = discoverPlatform === p;
          const color = p === "instagram"
            ? active ? "bg-pink-500 text-white border-pink-500" : "border-pink-300 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20"
            : p === "facebook"
            ? active ? "bg-blue-600 text-white border-blue-600" : "border-blue-300 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            : active ? "bg-sky-500 text-white border-sky-500" : "border-sky-300 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20";
          return (
            <button key={p} onClick={() => setDiscoverPlatform(p)}
              className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center gap-1 border transition-colors", color)}>
              <PlatformIcon platform={p} className="h-2.5 w-2.5" />
              {p === "instagram" ? "Instagram" : p === "facebook" ? "Facebook" : "Twitter/X"}
            </button>
          );
        })}
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <div className="text-xs text-muted flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Total</div>
          <div className="mt-1 text-3xl font-semibold">{discovered.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Pro</div>
          <div className="mt-1 text-3xl font-semibold text-emerald-600">{discovered.filter(i => i.stance === "Pro").length}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5 text-red-500" /> Anti</div>
          <div className="mt-1 text-3xl font-semibold text-red-600">{discovered.filter(i => i.stance === "Anti").length}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted flex items-center gap-1.5"><Minus className="h-3.5 w-3.5 text-slate-400" /> Mixed</div>
          <div className="mt-1 text-3xl font-semibold text-slate-600">{discovered.filter(i => i.stance === "Mixed").length}</div>
        </Card>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 text-muted shrink-0" />

        {/* Stance */}
        {(["all", "pro", "anti", "mixed"] as const).map(f => (
          <button key={f} onClick={() => setStanceFilter(f)}
            className={cn("rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
              stanceFilter === f ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg")}>
            {f === "all" ? "All Stances" : f === "pro" ? "Pro" : f === "anti" ? "Anti" : "Mixed"}
          </button>
        ))}

        <div className="mx-1 h-3.5 w-px bg-border" />

        {/* Follower tier — always show all 4 tiers */}
        <button onClick={() => setTierFilter("all")}
          className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
            tierFilter === "all" ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg")}>
          All Sizes
        </button>
        {ALL_TIERS.map(tier => (
          <button key={tier} onClick={() => setTierFilter(tier)}
            className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tierFilter === tier ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg")}>
            {TIER_LABELS[tier]}
            {tierCounts[tier] ? <span className="ml-1 opacity-60">({tierCounts[tier]})</span> : null}
          </button>
        ))}

        {/* Platform filter */}
        {platformsPresent.length > 1 && (
          <>
            <div className="mx-1 h-3.5 w-px bg-border" />
            {platformsPresent.map(plat => (
              <button key={plat} onClick={() => setPlatformFilter(platformFilter === plat ? "all" : plat)}
                className={cn("rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1 transition-colors",
                  platformFilter === plat ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg")}>
                <PlatformIcon platform={plat} className="h-3 w-3" />
                {platformLabel(plat)}
              </button>
            ))}
          </>
        )}

        {/* Keyword chips */}
        {discoverKeywords.length > 0 && (
          <>
            <div className="mx-1 h-3.5 w-px bg-border" />
            {discoverKeywords.map(kw => (
              <button key={kw} onClick={() => setActiveKeyword(activeKeyword === kw ? null : kw)}
                className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  activeKeyword === kw ? "bg-purple-600 text-white" : "bg-card border border-border text-muted hover:text-fg")}>
                #{kw}
              </button>
            ))}
          </>
        )}

        {/* Platform scope toggle */}
        <div className="mx-1 h-3.5 w-px bg-border" />
        <button
          onClick={() => setIgFbOnly(v => !v)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1 transition-colors",
            igFbOnly
              ? "bg-pink-500 text-white"
              : "bg-card border border-border text-muted hover:text-fg"
          )}>
          <InstagramIcon className="h-3 w-3" />
          {igFbOnly ? "IG + FB Only" : "All Platforms"}
        </button>
      </div>

      {/* ── Status banner ── */}
      {discoverStatus && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 dark:border-purple-800/40 dark:bg-purple-900/10 px-4 py-2 text-xs text-purple-700 dark:text-purple-300 flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
          {discoverStatus}
        </div>
      )}

      {/* ── Viral Posts (default primary view) ── */}
      {discovered.length > 0 && <ViralSection influencers={discovered} clientName={clientName} />}

      {/* ── Influencer Accordion List ── */}
      {discovered.length === 0 && !discoverLoading && !discoverStatus ? (
        <Card className="py-8 text-center text-muted">
          <Users className="mx-auto mb-2 h-8 w-8 opacity-20" />
          <p className="text-sm font-medium">No handles extracted yet</p>
          <p className="mt-1 text-xs max-w-sm mx-auto">
            Click <strong>Extract Handles</strong> above to search Instagram &amp; Facebook for accounts talking about {clientName || "this account"}.
          </p>
        </Card>
      ) : filtered.length === 0 && !discoverLoading ? (
        <Card className="py-6 text-center text-muted space-y-2">
          <InstagramIcon className="mx-auto mb-1 h-6 w-6 opacity-20" />
          <p className="text-sm font-medium">No Instagram / Facebook handles found yet</p>
          <p className="text-xs max-w-sm mx-auto">
            {discovered.length > 0
              ? `${discovered.length} Twitter/YouTube handles exist but are hidden in IG+FB view.`
              : `Click Extract Handles to search Instagram & Facebook for "${clientName}" handles.`}
          </p>
          {discovered.length > 0 && (
            <button onClick={() => setIgFbOnly(false)}
              className="text-xs text-accent underline hover:opacity-80">
              Show all {discovered.length} platforms
            </button>
          )}
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Anti first — usually the most populated group */}
          {antiList.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
                <TrendingDown className="h-4 w-4" />
                Anti Voices
                <span className="rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 text-xs font-bold ml-1">
                  {antiList.length}
                </span>
              </div>
              <div className="space-y-2">
                {antiList.map(inf => <InfluencerCard key={inf.id} inf={inf} onRemove={removeInfluencer} />)}
              </div>
            </div>
          )}

          {/* Pro voices */}
          {proList.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                <TrendingUp className="h-4 w-4" />
                Pro Voices
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs font-bold ml-1">
                  {proList.length}
                </span>
              </div>
              <div className="space-y-2">
                {proList.map(inf => <InfluencerCard key={inf.id} inf={inf} onRemove={removeInfluencer} />)}
              </div>
            </div>
          )}

          {/* Mixed / Neutral */}
          {mixedList.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Minus className="h-4 w-4" />
                Mixed / Neutral
                <span className="rounded-full bg-slate-100 dark:bg-slate-700/40 text-slate-600 dark:text-slate-300 px-2 py-0.5 text-xs font-bold ml-1">
                  {mixedList.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {mixedList.map(inf => <InfluencerCard key={inf.id} inf={inf} onRemove={removeInfluencer} />)}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
