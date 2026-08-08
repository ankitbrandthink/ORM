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
  const [postsVisible, setPostsVisible] = useState(PAGE_SIZE);
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
                {inf.posts.slice(0, postsVisible).map((p, i) => (
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
                      <p className="text-[11px] text-fg/80 line-clamp-2 flex-1">{stripHtml(p.content) || p.content}</p>
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
                {postsVisible < inf.posts.length && (
                  <button
                    onClick={() => setPostsVisible(v => v + PAGE_SIZE)}
                    className="w-full rounded-lg border border-border py-1.5 text-[11px] text-muted hover:text-fg hover:bg-muted/20 transition-colors">
                    Load more · {inf.posts.length - postsVisible} remaining
                  </button>
                )}
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

const PAGE_SIZE = 5;

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
  const [proVisible, setProVisible]     = useState(PAGE_SIZE);
  const [antiVisible, setAntiVisible]   = useState(PAGE_SIZE);
  const [mixedVisible, setMixedVisible] = useState(PAGE_SIZE);

  // All posts across ALL platforms (no ig/fb filter here)
  const allPosts = influencers
    .flatMap(inf => inf.posts.map(p => ({ ...p, handle: inf.handle, stance: inf.stance, platform: inf.platform, profile_url: inf.profile_url })))
    .filter(p => p.url);

  const proViral   = allPosts.filter(p => p.stance === "Pro");
  const antiViral  = allPosts.filter(p => p.stance === "Anti");
  const mixedViral = allPosts.filter(p => p.stance === "Mixed");

  const proShow   = proViral.slice(0, proVisible);
  const antiShow  = antiViral.slice(0, antiVisible);
  const mixedShow = mixedViral.slice(0, mixedVisible);

  if (proViral.length === 0 && antiViral.length === 0 && mixedViral.length === 0) return null;

  function PostCard({ p, accent }: { p: typeof proViral[0]; accent: "pro" | "anti" | "mixed" }) {
    const borderCls = accent === "pro"
      ? "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/20"
      : accent === "anti"
      ? "border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20"
      : "border-slate-200 dark:border-slate-700/40 bg-slate-50 dark:bg-slate-800/20 hover:bg-slate-100 dark:hover:bg-slate-800/40";
    const iconCls = accent === "pro" ? "text-emerald-600" : accent === "anti" ? "text-red-500" : "text-slate-400";
    const badgeCls = accent === "pro"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      : accent === "anti"
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      : "bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300";
    const displayContent = stripHtml(p.content) || p.url;
    return (
      <a href={p.url} target="_blank" rel="noreferrer"
        className={`block rounded-lg border p-2.5 transition-colors group ${borderCls}`}>
        <div className="flex items-center gap-1.5 mb-1">
          <PlatformIcon platform={p.platform} className={`h-3 w-3 ${iconCls}`} />
          <span className="text-[11px] font-semibold text-accent">@{p.handle}</span>
          <span className={cn("text-[9px] font-bold uppercase rounded-full px-1.5 py-px ml-auto", badgeCls)}>
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
      <div className={cn(
        "grid grid-cols-1 gap-4",
        mixedViral.length > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"
      )}>
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
        {mixedViral.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Minus className="h-3.5 w-3.5" /> Neutral / Mixed
              <span className="ml-1 rounded-full bg-slate-100 dark:bg-slate-700/40 px-1.5 text-[10px]">{mixedViral.length}</span>
            </div>
            {mixedShow.map((p, i) => <PostCard key={i} p={p} accent="mixed" />)}
            {mixedVisible < mixedViral.length && (
              <button
                onClick={() => setMixedVisible(v => v + PAGE_SIZE)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700/40 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                Load more · {mixedViral.length - mixedVisible} remaining
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

  function buildStrategyReportHtml(): string {
    const proList   = discovered.filter(i => i.stance === "Pro");
    const antiList  = discovered.filter(i => i.stance === "Anti");
    const mixedList = discovered.filter(i => i.stance === "Mixed");
    const total     = discovered.length;
    const proCount  = proList.length;
    const antiCount = antiList.length;
    const mixedCount = mixedList.length;
    const proP   = total > 0 ? Math.round((proCount / total) * 100) : 0;
    const antiP  = total > 0 ? Math.round((antiCount / total) * 100) : 0;
    const mixedP = Math.max(0, 100 - proP - antiP);
    const repScore = total > 0 ? Math.round(((proCount + mixedCount * 0.5) / total) * 100) : 50;
    const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    function esc(s: string) {
      return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    const repColor = repScore >= 70 ? "#1E6B47" : repScore >= 50 ? "#C8892A" : "#9B2F2F";
    const repLabel = repScore >= 70 ? "Strong — Maintain &amp; Scale" : repScore >= 50 ? "Moderate — Action Required" : "Critical — Urgent Intervention";

    const influencerRows = discovered.map((inf, i) => {
      const sc = inf.stance === "Pro" ? "#1E6B47" : inf.stance === "Anti" ? "#9B2F2F" : "#4A6080";
      const sb = inf.stance === "Pro" ? "#E4F3EC" : inf.stance === "Anti" ? "#FAEAEA" : "#ECF0F6";
      const kws = inf.keyword_clusters.slice(0, 3).map(k => `#${esc(k)}`).join(" ") || "—";
      return `<tr style="${i % 2 === 0 ? "" : "background:#F9F9F7;"}">
        <td style="padding:9px 12px;border-bottom:1px solid #EBEBEB;"><div style="font-weight:600;color:#1A2E47;font-size:12px;">@${esc(inf.handle)}</div><div style="font-size:11px;color:#8A9AB0;margin-top:2px;">${esc(platformLabel(inf.platform))}</div></td>
        <td style="padding:9px 12px;border-bottom:1px solid #EBEBEB;"><span style="display:inline-block;background:${sb};color:${sc};font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:0.04em;">${esc(inf.stance)}</span></td>
        <td style="padding:9px 12px;border-bottom:1px solid #EBEBEB;font-size:12px;color:#4A5568;text-align:right;">${inf.total_posts}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #EBEBEB;font-size:12px;color:#4A5568;text-align:right;color:#1E6B47;">+${inf.positive_count}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #EBEBEB;font-size:12px;color:#4A5568;text-align:right;color:#9B2F2F;">−${inf.negative_count}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #EBEBEB;font-size:12px;color:#8A9AB0;">${kws}</td>
      </tr>`;
    }).join("");

    const pri1 = antiCount > 0
      ? `Address the ${antiCount} active critic${antiCount > 1 ? "s" : ""} with documented evidence — verified case outcomes, official records, third-party citations. Direct rebuttals give critics amplification; evidence-led redirects reframe the narrative.`
      : `Build an independent advocate network. ${esc(clientName)}'s current monitoring reflects mostly organizational handles. Identify 15–20 independent voices — journalists, academics, sector experts — who can speak credibly as third-party validators.`;
    const pri2 = mixedCount > 5
      ? `Convert the ${mixedCount} Mixed/Neutral voices (${mixedP}%) into active supporters. These accounts are unconvinced, not opposed. Provide verified facts, documented impact, and shareable content that makes endorsement easy without requiring ideological alignment.`
      : `Expand the monitoring ecosystem. With only ${total} account${total !== 1 ? "s" : ""} tracked, the dataset is too thin for strategic decisions. Expand keywords, add LinkedIn and Telegram, and run monthly monitoring cycles.`;
    const pri3 = `Build pre-crisis communication capacity before critics mobilize. Create a content library: documented outcomes, authoritative citations, and pre-approved rapid-response templates for the 5 most likely attack vectors. A prepared organization controls the first frame of any controversy.`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ORM Strategy Report — ${esc(clientName)}</title>
<style>
@page{size:A4;margin:12mm 10mm;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;background:#F4F3EF;color:#181E2C;font-size:14px;line-height:1.65;}
.wrap{max-width:900px;margin:0 auto;background:#fff;}
.hdr{background:#1A2E47;color:#fff;padding:32px 40px 26px;}
.hdr-ey{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:8px;font-weight:600;}
.hdr-nm{font-family:Georgia,serif;font-size:24px;font-weight:normal;color:#fff;margin-bottom:5px;}
.hdr-mt{font-size:12px;color:rgba(255,255,255,.42);line-height:1.8;}
.hdr-kpis{display:flex;gap:24px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(255,255,255,.1);flex-wrap:wrap;}
.kv{font-size:26px;font-weight:700;line-height:1;margin-bottom:3px;}
.kl{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.38);}
.sec{padding:32px 40px;border-bottom:1px solid #EBEBEB;}
.sec:last-child{border-bottom:none;}
.ey{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#C8892A;font-weight:700;margin-bottom:6px;}
.st{font-family:Georgia,serif;font-size:19px;font-weight:normal;color:#181E2C;margin-bottom:14px;line-height:1.35;}
.rule{height:1px;background:#EBEBEB;margin-bottom:22px;}
.score-row{display:flex;gap:24px;align-items:center;background:#F4F3EF;border:1px solid #DEDBD4;border-radius:10px;padding:20px 24px;margin-bottom:20px;flex-wrap:wrap;}
.sc-num{font-size:44px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;}
.sc-txt{flex:1;min-width:200px;}
.sc-lbl{font-size:14px;font-weight:600;color:#181E2C;margin-bottom:4px;}
.sc-sub{font-size:12.5px;color:#48556A;line-height:1.65;}
.sbar{display:flex;height:7px;border-radius:4px;overflow:hidden;margin:11px 0 6px;gap:2px;}
.leg{display:flex;gap:14px;font-size:11px;color:#48556A;flex-wrap:wrap;}
.ld{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:3px;vertical-align:middle;}
.alert{border-left:3px solid #C8892A;background:#FEFCF8;padding:12px 15px;border-radius:0 6px 6px 0;font-size:12.5px;color:#48556A;line-height:1.65;margin-bottom:20px;}
.alert strong{color:#181E2C;}
.cards{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;}
.card{flex:1;min-width:170px;background:#F4F3EF;border:1px solid #DEDBD4;border-radius:10px;padding:14px 16px;}
.cl{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8A9AB0;margin-bottom:6px;font-weight:600;}
.ct{font-size:13px;font-weight:700;color:#181E2C;margin-bottom:4px;}
.cb{font-size:12px;color:#48556A;line-height:1.65;}
.tw{overflow-x:auto;border:1px solid #DEDBD4;border-radius:10px;margin-bottom:14px;}
table{width:100%;border-collapse:collapse;font-size:13px;}
thead{background:#EDECE8;}
th{padding:8px 12px;text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8A9AB0;font-weight:600;border-bottom:1px solid #DEDBD4;}
.pils{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;}
.pil{flex:1;min-width:200px;background:#F4F3EF;border:1px solid #DEDBD4;border-radius:10px;padding:18px;}
.pn{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#C8892A;margin-bottom:8px;}
.pt{font-family:Georgia,serif;font-size:14px;font-weight:normal;color:#181E2C;margin-bottom:8px;line-height:1.4;}
.pb{font-size:12px;color:#48556A;line-height:1.7;}
.narr{background:#1A2E47;border-radius:10px;padding:24px 28px;margin-bottom:18px;}
.nl{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.38);margin-bottom:8px;font-weight:600;}
.ns{font-family:Georgia,serif;font-size:16px;font-weight:normal;color:#fff;line-height:1.6;}
.ne{color:#E8A94A;font-style:normal;}
.mps{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:22px;}
.mp{flex:1;min-width:160px;border-left:3px solid #C8892A;background:#FEFCF8;padding:12px 14px;border-radius:0 6px 6px 0;}
.mpt{font-size:13px;font-weight:700;color:#181E2C;margin-bottom:4px;}
.mpb{font-size:12px;color:#48556A;line-height:1.65;}
.tone{display:flex;gap:0;border:1px solid #DEDBD4;border-radius:10px;overflow:hidden;}
.tc{flex:1;}
.th{padding:9px 13px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;border-bottom:1px solid #DEDBD4;}
.th.do{background:#E4F3EC;color:#1E6B47;}
.th.av{background:#FAEAEA;color:#9B2F2F;}
.ti{padding:9px 13px;font-size:12px;color:#48556A;border-bottom:1px solid #EBEBEB;line-height:1.55;}
.ti:last-child{border-bottom:none;}
.tc:first-child .ti{border-right:1px solid #EBEBEB;}
.tl{padding-left:26px;position:relative;}
.tl::before{content:'';position:absolute;left:7px;top:6px;bottom:6px;width:2px;background:#DEDBD4;}
.tli{position:relative;padding-bottom:28px;}
.tli:last-child{padding-bottom:0;}
.dot{position:absolute;left:-26px;top:3px;width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #C8892A;z-index:1;}
.dot.on{background:#C8892A;}
.tph{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#C8892A;font-weight:700;margin-bottom:4px;}
.ttl{font-size:13.5px;font-weight:600;color:#181E2C;margin-bottom:8px;}
.tls{list-style:none;display:flex;flex-direction:column;gap:5px;}
.tls li{font-size:12px;color:#48556A;padding-left:15px;position:relative;line-height:1.6;}
.tls li::before{content:'–';position:absolute;left:0;color:#8A9AB0;}
.gd{display:flex;gap:12px;margin-bottom:16px;align-items:flex-start;}
.gn{width:24px;height:24px;border-radius:50%;background:#F4F3EF;border:1.5px solid #DEDBD4;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#C8892A;flex-shrink:0;margin-top:1px;}
.gt{font-size:13px;font-weight:600;color:#181E2C;margin-bottom:3px;}
.gb{font-size:12px;color:#48556A;line-height:1.65;}
.kg{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;}
.kc{flex:1;min-width:120px;background:#F4F3EF;border:1px solid #DEDBD4;border-radius:6px;padding:12px 14px;}
.kl2{font-size:10px;color:#8A9AB0;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px;}
.kt{font-size:19px;font-weight:700;color:#C8892A;line-height:1;margin-bottom:3px;}
.kb{font-size:11px;color:#8A9AB0;}
.ftr{background:#F4F3EF;border-top:1px solid #DEDBD4;padding:18px 40px;font-size:11px;color:#8A9AB0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;}
p{color:#48556A;font-size:13px;line-height:1.75;margin-bottom:12px;}
p:last-child{margin-bottom:0;}
h3{font-family:Georgia,serif;font-size:14px;font-weight:normal;color:#181E2C;margin:22px 0 10px;}
h3:first-child{margin-top:0;}
strong{color:#181E2C;}
</style>
</head>
<body>
<div class="wrap">
<div class="hdr">
  <div class="hdr-ey">ORM Strategy Report · Confidential</div>
  <div class="hdr-nm">${esc(clientName)}</div>
  <div class="hdr-mt">Monitoring period: Last ${days} days &nbsp;·&nbsp; Generated: ${date}<br>Keywords: ${esc(discoverKeywords.join(", ") || clientName)} &nbsp;·&nbsp; Platforms: Instagram, Facebook, Twitter/X, YouTube</div>
  <div class="hdr-kpis">
    <div><div class="kv" style="color:#E8A94A;">${repScore}%</div><div class="kl">Rep Score</div></div>
    <div><div class="kv" style="color:rgba(255,255,255,.85);">${total}</div><div class="kl">Influencers</div></div>
    <div><div class="kv" style="color:#62DFA0;">${proCount}</div><div class="kl">Pro Voices</div></div>
    <div><div class="kv" style="color:#FF9090;">${antiCount}</div><div class="kl">Anti Voices</div></div>
    <div><div class="kv" style="color:#94B0D4;">${mixedCount}</div><div class="kl">Mixed / Neutral</div></div>
  </div>
</div>

<div class="sec">
  <div class="ey">01 — Situation Analysis</div>
  <div class="st">Where ${esc(clientName)} Stands in the Influencer Landscape</div>
  <div class="rule"></div>
  <div class="score-row">
    <div class="sc-num" style="color:${repColor};">${repScore}%</div>
    <div class="sc-txt">
      <div class="sc-lbl">Reputation Score: ${repLabel}</div>
      <div class="sc-sub">Based on ${total} influencer account${total !== 1 ? "s" : ""} monitored over the last ${days} days. ${proP}% are active supporters, ${antiP}% are critics, and ${mixedP}% are neutral or mixed. ${repScore >= 70 ? "Strong foundation — focus on scaling advocacy and crisis preparedness." : repScore >= 50 ? "Mixed signals require strategic intervention to shift the balance toward pro voices." : "Critical situation — requires immediate reputation management action."}</div>
      <div class="sbar">
        <div style="width:${proP}%;background:#1E6B47;border-radius:3px;"></div>
        <div style="width:${mixedP}%;background:#4A6080;"></div>
        <div style="width:${antiP}%;background:#9B2F2F;border-radius:3px;"></div>
      </div>
      <div class="leg">
        <span><span class="ld" style="background:#1E6B47;"></span>Pro ${proP}% (${proCount})</span>
        <span><span class="ld" style="background:#4A6080;"></span>Mixed ${mixedP}% (${mixedCount})</span>
        <span><span class="ld" style="background:#9B2F2F;"></span>Anti ${antiP}% (${antiCount})</span>
      </div>
    </div>
  </div>
  <div class="cards">
    <div class="card"><div class="cl">${antiCount === 0 ? "Anti Voice Status" : "⚠ Critical Alert"}</div><div class="ct">${antiCount === 0 ? "0 Critics — Monitor Scope" : `${antiCount} Anti Voice${antiCount > 1 ? "s" : ""} — Respond Now`}</div><div class="cb">${antiCount === 0 ? "No anti voices detected. This may reflect limited monitoring scope rather than a safe environment. Expand keywords and platforms before concluding the landscape is risk-free." : `${antiCount} account${antiCount > 1 ? "s are" : " is"} actively critical. Each requires a documented factual response. Do not leave anti voices unaddressed for more than 24 hours.`}</div></div>
    <div class="card"><div class="cl">Biggest Opportunity</div><div class="ct">${mixedCount > 0 ? `Convert ${mixedCount} Neutral Voice${mixedCount > 1 ? "s" : ""}` : "Build Influencer Ecosystem"}</div><div class="cb">${mixedCount > 0 ? `${mixedP}% of influencers are Mixed/Neutral — unconvinced, not opposed. Targeted content and direct engagement can shift a meaningful portion to active Pro supporters.` : "The monitoring pool is limited. Expand keyword coverage and run targeted discovery to build an independent advocate network."}</div></div>
    <div class="card"><div class="cl">Data Coverage</div><div class="ct">${total < 15 ? "Limited Sample — Expand" : "Baseline Established"}</div><div class="cb">${total < 15 ? `Only ${total} account${total !== 1 ? "s" : ""} tracked. Expand keywords, add LinkedIn and Telegram, and run monthly (not quarterly) monitoring cycles to build a reliable picture.` : `${total} accounts provide a baseline. Focus on keyword quality — ensure clusters reflect real topics. Monthly monitoring is recommended.`}</div></div>
  </div>
</div>

<div class="sec">
  <div class="ey">02 — Ecosystem Map</div>
  <div class="st">Who Is Talking About ${esc(clientName)}</div>
  <div class="rule"></div>
  <p>The accounts below are the complete influencer monitoring pool for this period. Review each for account type and strategic significance before acting on aggregate statistics.</p>
  <div class="tw"><table>
    <thead><tr><th>Handle</th><th>Sentiment</th><th style="text-align:right;">Posts</th><th style="text-align:right;">Pro</th><th style="text-align:right;">Anti</th><th>Keywords</th></tr></thead>
    <tbody>${influencerRows || `<tr><td colspan="6" style="padding:20px;text-align:center;color:#8A9AB0;">No influencers tracked yet — run keyword discovery to populate.</td></tr>`}</tbody>
  </table></div>
</div>

<div class="sec">
  <div class="ey">03 — ORM Strategy</div>
  <div class="st">Three Strategic Priorities for the Next 90 Days</div>
  <div class="rule"></div>
  <div class="pils">
    <div class="pil"><div class="pn">Priority 01</div><div class="pt">${antiCount > 0 ? "Address Active Critics With Evidence" : "Build an Independent Advocate Network"}</div><div class="pb">${esc(pri1)}</div></div>
    <div class="pil"><div class="pn">Priority 02</div><div class="pt">${mixedCount > 5 ? "Convert Neutral Voices to Supporters" : "Expand the Monitoring Ecosystem"}</div><div class="pb">${esc(pri2)}</div></div>
    <div class="pil"><div class="pn">Priority 03</div><div class="pt">Build Pre-Crisis Communication Capacity</div><div class="pb">${esc(pri3)}</div></div>
  </div>
  <h3>Platform Strategy</h3>
  <div class="tw"><table>
    <thead><tr><th>Platform</th><th>Primary Role</th><th>Content Type</th><th>Cadence</th></tr></thead>
    <tbody>
      <tr><td><strong>Twitter / X</strong></td><td style="font-size:12px;color:#48556A;">Real-time advocacy, rapid response</td><td style="font-size:12px;color:#48556A;">Case updates, milestones, thread documentation</td><td style="font-size:12px;color:#48556A;">Daily</td></tr>
      <tr style="background:#F9F9F7;"><td><strong>Instagram</strong></td><td style="font-size:12px;color:#48556A;">Human-interest storytelling</td><td style="font-size:12px;color:#48556A;">Stories, infographics, visual documentation</td><td style="font-size:12px;color:#48556A;">3–4× / week</td></tr>
      <tr><td><strong>Facebook</strong></td><td style="font-size:12px;color:#48556A;">Community engagement</td><td style="font-size:12px;color:#48556A;">Reports, events, explainers, updates</td><td style="font-size:12px;color:#48556A;">4–5× / week</td></tr>
      <tr style="background:#F9F9F7;"><td><strong>YouTube</strong></td><td style="font-size:12px;color:#48556A;">Long-form credibility</td><td style="font-size:12px;color:#48556A;">Documentaries, analysis, event recordings</td><td style="font-size:12px;color:#48556A;">1–2× / month</td></tr>
      <tr><td><strong>LinkedIn</strong></td><td style="font-size:12px;color:#48556A;">Professional network</td><td style="font-size:12px;color:#48556A;">Reports, case outcomes, team updates</td><td style="font-size:12px;color:#48556A;">2–3× / week</td></tr>
    </tbody>
  </table></div>
</div>

<div class="sec">
  <div class="ey">04 — Narrative Architecture</div>
  <div class="st">How ${esc(clientName)} Should Frame Its Story</div>
  <div class="rule"></div>
  <div class="narr"><div class="nl">Core Narrative Statement</div><div class="ns">"${esc(clientName)} exists to ensure that <span class="ne">every stakeholder's rights and interests</span> are defended — through transparency, documented accountability, and the public good."</div></div>
  <h3>Message Pillars</h3>
  <div class="mps">
    <div class="mp"><div class="mpt">Documented Impact</div><div class="mpb">Lead with verified outcomes: milestones achieved, communities served, problems solved. Numbers and records are the most credible validators in a contested information environment.</div></div>
    <div class="mp"><div class="mpt">Principled Authority</div><div class="mpb">Communicate through experts and official records. Third-party credibility — expert citations, official reports, partner endorsements — builds authority that self-promotion cannot.</div></div>
    <div class="mp"><div class="mpt">Community Voice</div><div class="mpb">Amplify stakeholder voices with consent and dignity. Their accounts validate ground-level presence without the organization speaking on their behalf.</div></div>
    <div class="mp"><div class="mpt">Coalition Building</div><div class="mpb">Publicly name partner organizations and collaborative outcomes. Organizations with visible support networks are harder to isolate or discredit.</div></div>
  </div>
  <h3>Tone Guidelines</h3>
  <div class="tone">
    <div class="tc"><div class="th do">Always Do</div><div class="ti">Speak in facts, verified records, and documented outcomes</div><div class="ti">Acknowledge complexity and due process at all times</div><div class="ti">Center the dignity and agency of stakeholders served</div><div class="ti">Engage critics with evidence, not emotion or counter-attack</div><div class="ti">Build alliances publicly — name partners and collaborators</div></div>
    <div class="tc"><div class="th av">Always Avoid</div><div class="ti">Rhetorical attacks on any party, individual, or competitor</div><div class="ti">Claiming outcomes before they are confirmed and finalized</div><div class="ti">Engaging bad-faith actors directly on their own terms</div><div class="ti">Framing that positions ${esc(clientName)} as a political actor</div><div class="ti">Appearing to operate without coalition or third-party support</div></div>
  </div>
</div>

<div class="sec">
  <div class="ey">05 — 90-Day Roadmap</div>
  <div class="st">Foundation → Activation → Amplification</div>
  <div class="rule"></div>
  <div class="tl">
    <div class="tli"><div class="dot on"></div><div class="tph">Days 1–30 · Foundation</div><div class="ttl">Audit, expand monitoring, identify advocates</div><ul class="tls"><li>Expand keyword list — add name variations, related topics, key case names, and issue areas</li><li>Add LinkedIn to monitored platforms; add manual logging for Telegram and print media mentions</li><li>Remove false-positive handles from the monitoring pool to clean up the ecosystem data</li><li>Audit all existing owned social media — identify content gaps and inactive handles</li><li>Build a target list of 25 independent advocates: journalists, academics, sector experts</li><li>Document 10–15 key outcomes or milestones from the past 2–3 years for content repurposing</li></ul></div>
    <div class="tli"><div class="dot on"></div><div class="tph">Days 31–60 · Activation</div><div class="ttl">Launch content and begin advocate engagement</div><ul class="tls"><li>Launch a weekly content series — one documented impact story or milestone per week</li><li>Begin 1:1 outreach to the top 10 target advocates — provide briefings, invite co-authorship</li><li>Publish an Impact Report (PDF + social summary) — designed for sharing with media and stakeholders</li><li>Pitch regional and sector media with story angles and press notes on 2–3 key current topics</li><li>Establish a rapid response protocol — designate a spokesperson, write pre-approved templates</li><li>Run the second monitoring cycle — compare against this baseline to measure coverage growth</li></ul></div>
    <div class="tli"><div class="dot"></div><div class="tph">Days 61–90 · Amplification</div><div class="ttl">Scale, activate advocates, and measure</div><ul class="tls"><li>Activate 5–10 independent advocates into visible public positions — posts, co-authored content, media quotes</li><li>Host a virtual briefing for 10–15 journalists — establish ${esc(clientName)} as the go-to credible source</li><li>Launch long-form content (video, podcast, detailed report) demonstrating expertise and depth</li><li>Run the 90-day monitoring report — measure Rep Score (target: ${Math.min(repScore + 15, 100)}%+), influencer count (target: ${Math.max(total * 2, 20)}+), Pro% (target: ${Math.min(proP + 15, 60)}%+)</li><li>Present findings as a before/after comparison — the delta is the measurable ORM impact</li></ul></div>
  </div>
</div>

<div class="sec">
  <div class="ey">06 — Working Guidelines</div>
  <div class="st">How to Execute ORM Day-to-Day</div>
  <div class="rule"></div>
  <div class="gd"><div class="gn">1</div><div><div class="gt">Monitor daily — respond to significant mentions within 4 hours</div><div class="gb">Set keyword alerts across all platforms. Any significant mention needs acknowledgment or a deliberate decision to stay silent within 4 hours on business days. Silence reads as absence.</div></div></div>
  <div class="gd"><div class="gn">2</div><div><div class="gt">Never rebut bad-faith attacks on their terms — reframe with evidence</div><div class="gb">When attacked by partisan accounts, redirect to evidence: a verified record, a documented outcome. Direct rebuttals give attackers amplification; evidence-led redirects reframe the story.</div></div></div>
  <div class="gd"><div class="gn">3</div><div><div class="gt">Separate owned, earned, and monitored channels</div><div class="gb">Owned channels publish the narrative. Earned channels (advocates, media) validate it. Monitored channels inform strategy. Don't use owned channels to punch back at critics.</div></div></div>
  <div class="gd"><div class="gn">4</div><div><div class="gt">Run monthly monitoring reports — not quarterly</div><div class="gb">A hostile narrative can calcify in 10 days. Monthly reports allow tactical adjustments before framing becomes fixed. Quarterly reports are client summaries; monthly reports are operational tools.</div></div></div>
  <div class="gd"><div class="gn">5</div><div><div class="gt">Maintain a 2-week advance content buffer at all times</div><div class="gb">Keep 10 pre-written posts, 5 designed graphics, and 3 rapid-response templates ready. Content produced under urgency skips review and makes errors that are expensive to correct.</div></div></div>
  <div class="gd"><div class="gn">6</div><div><div class="gt">Define success metrics before every campaign — not after</div><div class="gb">Specify the ORM target before any content push: which accounts to convert, which Rep Score milestone to hit, which journalists to reach. Retrospective measurement without prospective goals is meaningless.</div></div></div>
</div>

<div class="sec">
  <div class="ey">07 — Success Metrics</div>
  <div class="st">What to Measure at 90 Days</div>
  <div class="rule"></div>
  <p>Targets are calibrated against the current baseline. Achieving these within 90 days represents meaningful ORM progress.</p>
  <div class="kg">
    <div class="kc"><div class="kl2">Rep Score</div><div class="kt">${Math.min(repScore + 15, 100)}%+</div><div class="kb">Baseline: ${repScore}%</div></div>
    <div class="kc"><div class="kl2">Total Influencers</div><div class="kt">${Math.max(total * 2, 20)}+</div><div class="kb">Baseline: ${total}</div></div>
    <div class="kc"><div class="kl2">Pro Voices</div><div class="kt">${Math.min(proP + 15, 60)}%+</div><div class="kb">Baseline: ${proP}%</div></div>
    <div class="kc"><div class="kl2">Ind. Advocates</div><div class="kt">10 active</div><div class="kb">Baseline: ~0</div></div>
    <div class="kc"><div class="kl2">Response Time</div><div class="kt">&lt;4 hrs</div><div class="kb">Baseline: Not set</div></div>
    <div class="kc"><div class="kl2">Content Buffer</div><div class="kt">2-week</div><div class="kb">Baseline: Unknown</div></div>
    <div class="kc"><div class="kl2">Earned Media</div><div class="kt">15+</div><div class="kb">Baseline: Not tracked</div></div>
    <div class="kc"><div class="kl2">Monitor Cycle</div><div class="kt">Monthly</div><div class="kb">Baseline: Quarterly</div></div>
  </div>
  <div class="alert">
    <strong>30-day check-in:</strong> The first milestone report should include expanded keyword results, a revised ecosystem map with noise removed, and first advocate outreach tracking. If Rep Score has not moved above ${repScore + 5}% at 30 days, the keyword strategy needs revision before the 60-day cycle.
  </div>
</div>

<div class="ftr">
  <div>ORM Strategy Report &nbsp;·&nbsp; ${esc(clientName)} &nbsp;·&nbsp; Last ${days} days ending ${date}</div>
  <div>Generated by ORM CMS &nbsp;·&nbsp; Confidential — for client use only</div>
</div>
</div>
</body></html>`;
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
            <Button variant="ghost" onClick={() => {
              const html = buildStrategyReportHtml();
              const w = window.open("", "_blank");
              if (w) { w.document.write(html); w.document.close(); }
            }} className="flex items-center gap-1.5 text-sm border border-border border-amber-300 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20">
              <FileDown className="h-4 w-4" /> Strategy Report
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
