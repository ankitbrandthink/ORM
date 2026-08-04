"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Users, TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink,
  Newspaper, MessageSquare, Filter, Star, FileDown,
  Zap, Info, Search, Twitter, Globe, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const STANCE_COLOR: Record<string, string> = {
  Pro:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Anti:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  Mixed: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
};
const STANCE_ICON: Record<string, any> = {
  Pro: TrendingUp, Anti: TrendingDown, Mixed: Minus,
};

function RedditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
    </svg>
  );
}

function HackerNewsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 24V0h24v24H0zM6.951 5.896l4.112 7.708v5.064h1.583v-4.972l4.148-7.799h-1.749l-2.457 4.875c-.372.745-.688 1.434-.688 1.434s-.297-.708-.651-1.434L8.831 5.896z"/>
    </svg>
  );
}

function MastodonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z"/>
    </svg>
  );
}

function InfluencerCard({ inf, idx, onRemove }: { inf: any; idx: number; onRemove?: (id: string) => void }) {
  const Icon = STANCE_ICON[inf.stance] ?? Minus;
  const total = inf.positive_count + inf.negative_count || 1;
  const posP = Math.round((inf.positive_count / total) * 100);
  const negP = Math.round((inf.negative_count / total) * 100);
  const isTwitter = inf.source === "twitter";
  const isReddit = inf.source === "reddit";
  const isHN = inf.source === "hackernews";
  const isMastodon = inf.source === "mastodon";
  const isDiscovered = isTwitter || isReddit || isHN || isMastodon;

  const borderColor = isTwitter
    ? "border-l-4 border-l-purple-400"
    : isReddit
    ? "border-l-4 border-l-orange-400"
    : isHN
    ? "border-l-4 border-l-amber-500"
    : isMastodon
    ? "border-l-4 border-l-violet-400"
    : "";

  const avatarClass = isTwitter
    ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600"
    : isReddit
    ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600"
    : isHN
    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700"
    : isMastodon
    ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600"
    : "bg-accent/10 text-accent";

  return (
    <Card className={cn("space-y-3", borderColor)}>
      <div className="flex items-start gap-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", avatarClass)}>
          {isTwitter ? (
            <Twitter className="h-4 w-4" />
          ) : isReddit ? (
            <RedditIcon className="h-4 w-4" />
          ) : isHN ? (
            <HackerNewsIcon className="h-4 w-4" />
          ) : isMastodon ? (
            <MastodonIcon className="h-4 w-4" />
          ) : (
            `#${idx + 1}`
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {inf.profile_url ? (
              <a href={inf.profile_url} target="_blank" rel="noreferrer"
                className="text-sm font-semibold truncate text-accent hover:underline">
                {inf.name}
              </a>
            ) : (
              <span className="text-sm font-semibold truncate">{inf.name}</span>
            )}
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1", STANCE_COLOR[inf.stance])}>
              <Icon className="h-3 w-3" />{inf.stance}
            </span>
            {inf.type === "press" ? (
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[10px]">
                <Newspaper className="h-2.5 w-2.5 mr-1" />Media Outlet
              </Badge>
            ) : isTwitter ? (
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px]">
                <Twitter className="h-2.5 w-2.5 mr-1" />Twitter/X
              </Badge>
            ) : isReddit ? (
              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 text-[10px]">
                <RedditIcon className="h-2.5 w-2.5 mr-1" />Reddit
              </Badge>
            ) : isHN ? (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px]">
                <HackerNewsIcon className="h-2.5 w-2.5 mr-1" />HackerNews
              </Badge>
            ) : isMastodon ? (
              <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 text-[10px]">
                <MastodonIcon className="h-2.5 w-2.5 mr-1" />Mastodon
              </Badge>
            ) : (
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px]">
                <MessageSquare className="h-2.5 w-2.5 mr-1" />Social
              </Badge>
            )}
            {inf.total_mentions >= 3 && (
              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 text-[10px]">
                <Zap className="h-2.5 w-2.5 mr-1" />Active
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted">
            <span className="font-medium">{inf.total_mentions.toLocaleString()} {isDiscovered ? "posts" : "mentions"}</span>
            <span className="text-emerald-600 font-medium">+{inf.positive_count} pro</span>
            <span className="text-red-500 font-medium">−{inf.negative_count} anti</span>
            {inf.keyword && <span className="opacity-60">#{inf.keyword}</span>}
          </div>
        </div>
        {isDiscovered && onRemove && inf._discoveredId && (
          <button onClick={() => onRemove(inf._discoveredId)}
            className="text-muted hover:text-red-500 shrink-0 transition-colors" title="Remove">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        {posP > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${posP}%` }} title={`Pro: ${posP}%`} />}
        {negP > 0 && <div className="bg-red-500 transition-all" style={{ width: `${negP}%` }} title={`Anti: ${negP}%`} />}
        {100 - posP - negP > 0 && <div className="bg-slate-300 dark:bg-slate-600 flex-1" title="Neutral" />}
      </div>

      {inf.posts?.length > 0 && (
        <div className="space-y-1">
          {inf.posts.slice(0, 3).map((p: any, i: number) => (
            <a key={i} href={p.url} target="_blank" rel="noreferrer"
              className="flex items-start gap-1.5 text-[11px] text-muted hover:text-accent group">
              <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 group-hover:text-accent" />
              <span className="line-clamp-2">{p.title || p.url}</span>
              {p.published_at && <span className="shrink-0 text-muted/60 ml-auto">{p.published_at}</span>}
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

function DiscoveredCard({ inf, onRemove }: { inf: any; onRemove: (id: string) => void }) {
  const Icon = STANCE_ICON[inf.stance] ?? Minus;
  const [expanded, setExpanded] = useState(false);
  const platform = inf.platform || "twitter";
  const isTwitter = platform === "twitter";
  const isReddit = platform === "reddit";
  const isHN = platform === "hackernews";
  const isMastodon = platform === "mastodon";

  const borderClass = isHN
    ? "border-l-4 border-l-amber-500"
    : isMastodon
    ? "border-l-4 border-l-violet-400"
    : isReddit
    ? "border-l-4 border-l-orange-400"
    : "border-l-4 border-l-purple-400";

  const avatarClass = isHN
    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700"
    : isMastodon
    ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600"
    : isReddit
    ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600"
    : "bg-purple-100 dark:bg-purple-900/30 text-purple-600";

  const badgeClass = isHN
    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px]"
    : isMastodon
    ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 text-[10px]"
    : isReddit
    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 text-[10px]"
    : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px]";

  const platformLabel = isHN ? "HackerNews" : isMastodon ? "Mastodon" : isReddit ? "Reddit" : "Twitter/X";
  const postLabel = isHN ? "posts" : isMastodon ? "toots" : isReddit ? "posts" : "tweets";
  const handlePrefix = isHN ? "" : isReddit ? "u/" : "@";

  return (
    <Card className={cn("space-y-3", borderClass)}>
      <div className="flex items-start gap-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", avatarClass)}>
          {isHN ? <HackerNewsIcon className="h-4 w-4" />
            : isMastodon ? <MastodonIcon className="h-4 w-4" />
            : isReddit ? <RedditIcon className="h-4 w-4" />
            : <Twitter className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a href={inf.profile_url} target="_blank" rel="noreferrer"
              className="text-sm font-semibold text-accent hover:underline truncate">
              {handlePrefix}{inf.handle}
            </a>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1", STANCE_COLOR[inf.stance])}>
              <Icon className="h-3 w-3" />{inf.stance}
            </span>
            <Badge className={badgeClass}>
              Discovered · {platformLabel}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted">
            <span className="font-medium">{inf.total_posts} {postLabel}</span>
            <span className="text-emerald-600 font-medium">+{inf.positive_count} pro</span>
            <span className="text-red-500 font-medium">−{inf.negative_count} anti</span>
            <span className="opacity-60">#{inf.keyword}</span>
          </div>
        </div>
        <button onClick={() => onRemove(inf.id)} className="text-muted hover:text-red-500 shrink-0 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {inf.posts?.length > 0 && (
        <>
          <div className="space-y-1">
            {inf.posts.slice(0, expanded ? 5 : 2).map((p: any, i: number) => (
              <a key={i} href={p.url} target="_blank" rel="noreferrer"
                className="flex items-start gap-1.5 text-[11px] text-muted hover:text-accent group">
                <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 group-hover:text-accent" />
                <span className="line-clamp-2">{p.content || p.url}</span>
              </a>
            ))}
          </div>
          {inf.posts.length > 2 && (
            <button onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-accent flex items-center gap-1 hover:underline">
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Show less" : `+${inf.posts.length - 2} more ${postLabel}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

export default function InfluencersPage() {
  const [clients, setClients]   = useState<any[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [days, setDays]         = useState(90);
  const [filter, setFilter]     = useState<"all" | "pro" | "anti">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "press" | "social">("all");
  const reportRef = useRef<HTMLDivElement>(null);
  const autoDiscoveredRef = useRef<Set<string>>(new Set());

  // Social discovery state
  const [discoverKeyword, setDiscoverKeyword] = useState("");
  const [discovering, setDiscovering]         = useState(false);
  const [discoverStatus, setDiscoverStatus]   = useState("");
  const [discovered, setDiscovered]           = useState<any[]>([]);
  const [discoverKeywords, setDiscoverKeywords] = useState<string[]>([]);
  const [activeKeyword, setActiveKeyword]     = useState<string | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  useEffect(() => {
    api.get("/clients").then((r) => {
      const list = r.data || [];
      setClients(list);
      if (list.length > 0) { setClientId(list[0].id); setClientName(list[0].name); }
    }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!clientId) return;
    setLoading(true);
    api.get("/analytics/influencers", { params: { days, limit: 30, client_id: clientId } })
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId, days]);

  useEffect(() => { load(); }, [load]);

  const loadDiscovered = useCallback((cid: string, kw?: string | null) => {
    setDiscoverLoading(true);
    const params: any = { client_id: cid };
    if (kw) params.keyword = kw;
    api.get("/social-listening/influencers", { params })
      .then((r) => {
        setDiscovered(r.data.influencers || []);
        setDiscoverKeywords(r.data.keywords || []);
      })
      .catch(() => {})
      .finally(() => setDiscoverLoading(false));
  }, []);

  useEffect(() => {
    if (clientId) loadDiscovered(clientId, activeKeyword);
  }, [clientId, activeKeyword, loadDiscovered]);

  // Auto-discover for client name on first visit (when no previous discoveries exist)
  useEffect(() => {
    if (!clientId || !clientName || discoverLoading) return;
    if (autoDiscoveredRef.current.has(clientId)) return;
    autoDiscoveredRef.current.add(clientId);
    if (discoverKeywords.length === 0) {
      setDiscoverStatus(`Auto-discovering influencers for "${clientName}" on Twitter/X & Reddit...`);
      api.post("/social-listening/discover", {
        client_id: clientId,
        keyword: clientName,
        platform: "twitter",
        limit: 50,
      }).then(() => {
        // Poll at 20s and again at 35s to catch both fast (Reddit) and slow (nitter) results
        setTimeout(() => loadDiscovered(clientId, null), 20000);
        setTimeout(() => {
          loadDiscovered(clientId, null);
          setDiscoverStatus("");
        }, 35000);
      }).catch(() => { setDiscoverStatus(""); });
    }
  }, [clientId, clientName, discoverLoading, discoverKeywords.length, loadDiscovered]);

  function handleClientChange(id: string) {
    setClientId(id);
    const c = clients.find((c) => c.id === id);
    if (c) setClientName(c.name);
    setActiveKeyword(null);
  }

  async function handleDiscover() {
    if (!discoverKeyword.trim() || !clientId) return;
    setDiscovering(true);
    setDiscoverStatus(`Searching Twitter/X & Reddit for accounts talking about "${discoverKeyword}"...`);
    try {
      await api.post("/social-listening/discover", {
        client_id: clientId,
        keyword: discoverKeyword.trim(),
        platform: "twitter",
        limit: 40,
      });
      setDiscoverStatus("Discovery running in background. Results will appear in 15–30 seconds.");
      setDiscoverKeyword("");
      // Poll at 18s then 32s to catch both Reddit (fast) and Twitter/nitter (slower)
      setTimeout(() => loadDiscovered(clientId, activeKeyword), 18000);
      setTimeout(() => {
        loadDiscovered(clientId, activeKeyword);
        setDiscoverStatus("");
      }, 32000);
    } catch {
      setDiscoverStatus("Discovery failed. Please try again.");
    } finally {
      setDiscovering(false);
    }
  }

  async function removeDiscovered(id: string) {
    await api.delete(`/social-listening/influencers/${id}`).catch(() => {});
    setDiscovered((prev) => prev.filter((d) => d.id !== id));
  }

  // Normalize discovered Twitter accounts to the same shape as allInfluencers entries
  const discoveredNormalized = discovered.map((d: any) => ({
    name: `@${d.handle}`,
    type: "social" as const,
    source: d.platform || "twitter",
    stance: d.stance,
    total_mentions: d.total_posts,
    positive_count: d.positive_count,
    negative_count: d.negative_count,
    profile_url: d.profile_url,
    keyword: d.keyword,
    _discoveredId: d.id,
    posts: (d.posts || []).map((p: any) => ({
      url: p.url,
      title: p.content ? p.content.slice(0, 80) : p.url,
      published_at: p.published_at
        ? new Date(p.published_at).toLocaleDateString("en-IN")
        : "",
    })),
  }));

  const allInfluencers = [
    ...(data?.press || []).map((i: any) => ({ ...i, type: "press" })),
    ...(data?.social || []).map((i: any) => ({ ...i, type: "social", source: "mention" })),
    ...discoveredNormalized,
  ]
    .filter((i) => filter === "all" || i.stance.toLowerCase() === filter)
    .filter((i) => typeFilter === "all" || i.type === typeFilter)
    .sort((a, b) => b.total_mentions - a.total_mentions);

  const proCount    = allInfluencers.filter((i) => i.stance === "Pro").length;
  const antiCount   = allInfluencers.filter((i) => i.stance === "Anti").length;
  const pressCount  = (data?.press || []).length;
  const socialCount = (data?.social || []).length + discovered.length;
  const viralThreshold = data?.viral_threshold ?? 10;

  async function downloadReport() {
    const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    // ── Build COMPLETE, UNFILTERED data for the report (bypass UI stance/type filters) ──
    const pressData: any[] = (data?.press || []).map((i: any) => ({
      ...i, type: "press", platform: "press", displayName: i.name,
    }));
    const socialData: any[] = (data?.social || []).map((i: any) => ({
      ...i, type: "social", platform: "mention", displayName: i.name,
    }));
    const discoveredData: any[] = discovered.map((d: any) => ({
      type: "social", platform: d.platform || "twitter",
      handle: d.handle, displayName: `@${d.handle}`, name: d.handle,
      profile_url: d.profile_url, keyword: d.keyword,
      stance: d.stance, total_mentions: d.total_posts,
      positive_count: d.positive_count, negative_count: d.negative_count,
      posts: (d.posts || []).map((p: any) => ({
        url: p.url,
        published_at: p.published_at ? new Date(p.published_at).toLocaleDateString("en-IN") : "",
      })),
    }));

    const reportAll = [...pressData, ...socialData, ...discoveredData]
      .sort((a, b) => (b.total_mentions || 0) - (a.total_mentions || 0));

    const pros  = reportAll.filter(i => i.stance === "Pro");
    const antis = reportAll.filter(i => i.stance === "Anti");
    const mixed = reportAll.filter(i => i.stance === "Mixed");

    const totalVoices    = reportAll.length;
    const rProCount      = pros.length;
    const rAntiCount     = antis.length;
    const rMixedCount    = mixed.length;
    const rPressCount    = pressData.length;
    const rSocialCount   = socialData.length + discoveredData.length;
    const proPercent     = totalVoices > 0 ? Math.round((rProCount  / totalVoices) * 100) : 0;
    const antiPercent    = totalVoices > 0 ? Math.round((rAntiCount / totalVoices) * 100) : 0;
    const mixedPercent   = Math.max(0, 100 - proPercent - antiPercent);
    const repScore       = totalVoices > 0
      ? Math.round(((rProCount + rMixedCount * 0.5) / totalVoices) * 100) : 50;

    // Platform distribution
    const platCounts: Record<string, number> = {};
    for (const inf of discoveredData) { const p = inf.platform || "twitter"; platCounts[p] = (platCounts[p] || 0) + 1; }
    if (rPressCount   > 0) platCounts["press"]          = rPressCount;
    if (socialData.length > 0) platCounts["mention"]    = socialData.length;

    const keywords = discoverKeywords.length > 0 ? discoverKeywords.join(", ") : clientName;

    // ── Helpers ────────────────────────────────────────────────────────────────
    function esc(s: string) {
      return (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }
    function cleanUrl(url: string) {
      try { const u = new URL(url); const p = u.hostname + u.pathname; return p.length > 52 ? p.slice(0,52)+"…" : p; }
      catch { return (url||"").slice(0,52); }
    }
    function platLabel(p: string) {
      return ({hackernews:"HackerNews",mastodon:"Mastodon",twitter:"Twitter/X",press:"Press/Media",mention:"Social"})[p] || p;
    }
    function platStyle(p: string) {
      return ({hackernews:"background:#fff7ed;color:#c2410c;",mastodon:"background:#f5f3ff;color:#7c3aed;",
        twitter:"background:#e0f2fe;color:#0369a1;",press:"background:#eff6ff;color:#1e40af;",
        mention:"background:#f3f4f6;color:#374151;"})[p] || "background:#f3f4f6;color:#374151;";
    }

    function makeRows(list: any[]) {
      return list.map((inf, idx) => {
        const sColor = inf.stance==="Pro"?"#16a34a":inf.stance==="Anti"?"#dc2626":"#6b7280";
        const sBg    = inf.stance==="Pro"?"#dcfce7":inf.stance==="Anti"?"#fee2e2":"#f3f4f6";
        const nameCell = inf.profile_url
          ? `<a href="${inf.profile_url}" style="color:#1e40af;font-weight:600;">${esc(inf.displayName||inf.name)}</a>`
          : `<strong>${esc(inf.displayName||inf.name)}</strong>`;
        const postLinks = (inf.posts||[]).slice(0,2).filter((p:any)=>p.url)
          .map((p:any)=>`<div style="margin:1px 0;"><a href="${p.url}" style="color:#1e40af;font-size:7.5pt;">${esc(cleanUrl(p.url))}</a>${p.published_at?` <span style="color:#9ca3af;font-size:7pt;">${p.published_at}</span>`:""}</div>`)
          .join("") || (inf.profile_url?`<a href="${inf.profile_url}" style="color:#1e40af;font-size:7.5pt;">View Profile →</a>`:"—");
        return `<tr>
          <td style="color:#9ca3af;font-size:8pt;text-align:center;">${idx+1}</td>
          <td style="font-size:9.5pt;">${nameCell}</td>
          <td><span style="display:inline-block;padding:2px 6px;border-radius:10px;font-size:7.5pt;font-weight:700;${platStyle(inf.platform)}">${platLabel(inf.platform)}</span></td>
          <td><span style="display:inline-block;padding:2px 6px;border-radius:10px;font-size:8pt;font-weight:700;background:${sBg};color:${sColor};">${inf.stance}</span></td>
          <td style="text-align:right;font-size:9.5pt;">${(inf.total_mentions||0).toLocaleString()}</td>
          <td style="text-align:right;font-size:9.5pt;color:#16a34a;font-weight:600;">+${inf.positive_count||0}</td>
          <td style="text-align:right;font-size:9.5pt;color:#dc2626;font-weight:600;">-${inf.negative_count||0}</td>
          <td style="font-size:8.5pt;">${postLinks}</td>
        </tr>`;
      }).join("");
    }

    const tableHead = `<thead><tr style="background:#1e40af;color:#fff;">
      <th style="padding:6px 8px;width:3%;text-align:center;">#</th>
      <th style="padding:6px 8px;width:20%;">Name / Handle</th>
      <th style="padding:6px 8px;width:11%;">Platform</th>
      <th style="padding:6px 8px;width:9%;">Stance</th>
      <th style="padding:6px 8px;width:7%;text-align:right;">Posts</th>
      <th style="padding:6px 8px;width:5%;text-align:right;">Pro</th>
      <th style="padding:6px 8px;width:5%;text-align:right;">Anti</th>
      <th style="padding:6px 8px;">Profile &amp; Post Links</th>
    </tr></thead>`;

    const platRows = Object.entries(platCounts).map(([k,v])=>{
      const pct = Math.round((v/Math.max(1,totalVoices))*100);
      return `<tr><td style="font-size:9pt;">${platLabel(k)}</td><td style="text-align:center;font-weight:600;">${v}</td>
      <td style="width:40%;padding:5px 8px;"><div style="background:#e5e7eb;border-radius:3px;overflow:hidden;height:10px;">
        <div style="background:#1e40af;width:${pct}%;height:100%;"></div></div></td>
      <td style="text-align:right;font-size:8.5pt;color:#6b7280;">${pct}%</td></tr>`;
    }).join("");

    const topProNames  = pros.slice(0,5).map(i=>esc(i.displayName||i.name)).join(", ") || "None identified";
    const topAntiNames = antis.slice(0,5).map(i=>esc(i.displayName||i.name)).join(", ") || "None identified";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Influencer Intelligence Report — ${esc(clientName)}</title>
<style>
@page { size: A4; margin: 14mm 11mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; margin: 0; padding: 0; }
h2 { color: #1e40af; font-size: 13pt; border-left: 4px solid #1e40af; padding: 3px 0 3px 10px; margin: 20px 0 9px; }
h3 { color: #374151; font-size: 10.5pt; margin: 12px 0 5px; font-weight: 600; }
table { width: 100%; border-collapse: collapse; }
th { background: #1e40af; color: white; padding: 6px 8px; text-align: left; font-size: 8.5pt; }
td { padding: 5px 7px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
tr:nth-child(even) td { background: #f9fafb; }
a { color: #1e40af; text-decoration: none; }
.hdr { background: #1e40af; color: white; padding: 13px 17px; margin-bottom: 16px; border-radius: 4px; }
.hdr h1 { color: white; font-size: 19pt; margin: 0 0 5px; }
.hdr p { color: rgba(255,255,255,.88); font-size: 9pt; margin: 2px 0; }
.kpi td { border: 1px solid #e5e7eb !important; background: white !important; padding: 10px 8px; text-align: center; }
.kpi-label { font-size: 8pt; color: #6b7280; margin-bottom: 2px; }
.kpi-val { font-size: 24pt; font-weight: 800; line-height: 1.1; }
.page-break { page-break-before: always; padding-top: 2px; }
.note { font-size: 8.5pt; color: #6b7280; margin: 0 0 10px; }
.score-box { display: inline-block; border: 1.5px solid #e5e7eb; border-radius: 6px; padding: 9px 16px; margin: 0 8px 8px 0; text-align: center; }
.rec { border-left: 3px solid #1e40af; padding: 7px 12px; margin: 7px 0; background: #f8faff; border-radius: 0 4px 4px 0; font-size: 9.5pt; }
.rec.warn { border-left-color: #dc2626; background: #fff8f8; }
.rec.good { border-left-color: #16a34a; background: #f0fdf4; }
.footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 8pt; color: #9ca3af; text-align: center; }
.sbar { height: 18px; border-radius: 3px; overflow: hidden; display: flex; margin: 6px 0 3px; }
</style>
</head>
<body>

<div class="hdr">
  <h1>Influencer Intelligence Report</h1>
  <p><strong>Account:</strong> ${esc(clientName)} &nbsp;&nbsp; <strong>Period:</strong> Last ${days} days &nbsp;&nbsp; <strong>Generated:</strong> ${date}</p>
  <p>Keywords: ${esc(keywords)} &nbsp;|&nbsp; Viral threshold: ${viralThreshold}+ interactions &nbsp;|&nbsp; Powered by ORM CMS</p>
</div>

<h2>Executive Summary</h2>
<table class="kpi" style="margin-bottom:14px;">
  <tr>
    <td><div class="kpi-label">Total Voices</div><div class="kpi-val">${totalVoices}</div></td>
    <td><div class="kpi-label">Pro Voices</div><div class="kpi-val" style="color:#16a34a">${rProCount}</div></td>
    <td><div class="kpi-label">Anti Voices</div><div class="kpi-val" style="color:#dc2626">${rAntiCount}</div></td>
    <td><div class="kpi-label">Mixed / Neutral</div><div class="kpi-val" style="color:#6b7280">${rMixedCount}</div></td>
    <td><div class="kpi-label">Media Outlets</div><div class="kpi-val" style="color:#2563eb">${rPressCount}</div></td>
    <td><div class="kpi-label">Social Accounts</div><div class="kpi-val" style="color:#7c3aed">${rSocialCount}</div></td>
  </tr>
</table>

<h3>Sentiment Distribution</h3>
<div class="sbar">
  <div style="width:${proPercent}%;background:#16a34a;"></div>
  <div style="width:${antiPercent}%;background:#dc2626;"></div>
  <div style="width:${mixedPercent}%;background:#d1d5db;"></div>
</div>
<div style="font-size:8.5pt;color:#374151;display:flex;gap:14px;margin-bottom:14px;">
  <span><span style="color:#16a34a;font-weight:700">■</span> Pro ${proPercent}% (${rProCount})</span>
  <span><span style="color:#dc2626;font-weight:700">■</span> Anti ${antiPercent}% (${rAntiCount})</span>
  <span><span style="color:#9ca3af;font-weight:700">■</span> Mixed ${mixedPercent}% (${rMixedCount})</span>
</div>

${platRows ? `<h3>Platform Distribution</h3>
<table style="width:56%;margin-bottom:14px;">
  <thead><tr style="background:#1e40af;color:#fff;"><th style="padding:5px 7px;">Platform</th><th style="padding:5px 7px;text-align:center;">Accounts</th><th style="padding:5px 7px;">Share</th><th style="padding:5px 7px;text-align:right;">%</th></tr></thead>
  <tbody>${platRows}</tbody>
</table>` : ""}

${pros.length > 0 ? `
<div class="page-break"></div>
<h2 style="border-left-color:#16a34a;color:#16a34a">Pro Voices (${rProCount})</h2>
<p class="note">Accounts publicly supporting or writing positively about <strong>${esc(clientName)}</strong></p>
<table>${tableHead}<tbody>${makeRows(pros)}</tbody></table>` : ""}

${antis.length > 0 ? `
<div class="page-break"></div>
<h2 style="border-left-color:#dc2626;color:#dc2626">Anti Voices (${rAntiCount})</h2>
<p class="note">Accounts publicly opposing or writing critically about <strong>${esc(clientName)}</strong></p>
<table>${tableHead}<tbody>${makeRows(antis)}</tbody></table>` : ""}

${mixed.length > 0 ? `
<h2>Mixed / Neutral Voices (${rMixedCount})</h2>
<p class="note">Accounts with balanced or neutral coverage of <strong>${esc(clientName)}</strong></p>
<table>${tableHead}<tbody>${makeRows(mixed)}</tbody></table>` : ""}

<div class="page-break"></div>
<h2>Reputation &amp; Social Listening Analysis</h2>
<div style="margin-bottom:14px;">
  <div class="score-box">
    <div class="kpi-label">Reputation Score</div>
    <div class="kpi-val" style="color:${repScore>=60?"#16a34a":repScore>=40?"#f59e0b":"#dc2626"};font-size:26pt;">${repScore}%</div>
    <div style="font-size:8pt;color:#6b7280;">${repScore>=60?"Positive":repScore>=40?"Moderate":"Needs Action"}</div>
  </div>
  <div class="score-box">
    <div class="kpi-label">Social Accounts Found</div>
    <div class="kpi-val" style="color:#7c3aed;font-size:26pt;">${discoveredData.length}</div>
    <div style="font-size:8pt;color:#6b7280;">via Keyword Search</div>
  </div>
  <div class="score-box">
    <div class="kpi-label">Keywords Tracked</div>
    <div class="kpi-val" style="color:#0369a1;font-size:26pt;">${Math.max(1,discoverKeywords.length)}</div>
    <div style="font-size:8pt;color:#6b7280;">Search Terms</div>
  </div>
</div>

<h3>Top Supporters</h3>
<p style="font-size:9.5pt;color:#374151;margin:3px 0 12px;">${topProNames}</p>
<h3>Top Critics</h3>
<p style="font-size:9.5pt;color:#374151;margin:3px 0 12px;">${topAntiNames}</p>

${discoverKeywords.length > 0 ? `<h3>Monitored Keywords</h3>
<div style="margin:5px 0 14px;">${discoverKeywords.map(k=>`<span style="display:inline-block;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:2px 9px;border-radius:10px;font-size:8.5pt;margin:2px;">#${esc(k)}</span>`).join(" ")}</div>` : ""}

<h2>Reputation Strategy &amp; Recommendations</h2>
<p class="note">Based on analysis of <strong>${totalVoices} voices</strong> across last <strong>${days} days</strong> for <strong>${esc(clientName)}</strong></p>

${proPercent>=60
  ? `<div class="rec good"><strong>✓ Strong Positive Sentiment (${proPercent}% Pro)</strong><br>Reputation is strong. Amplify top pro voices: <em>${pros.slice(0,3).map(i=>esc(i.displayName||i.name)).join(", ")||"N/A"}</em>. Engage proactively and share their content.</div>`
  : proPercent<35
  ? `<div class="rec warn"><strong>⚠ Low Pro Sentiment — Action Required (${proPercent}% Pro, ${antiPercent}% Anti)</strong><br>Critical attention needed. Address concerns raised by anti voices. Engage directly with media publishing negative content and issue targeted clarifications.</div>`
  : `<div class="rec"><strong>◈ Balanced Coverage (${proPercent}% Pro, ${antiPercent}% Anti)</strong><br>Moderate reputation with room for improvement. Focus on converting neutral voices through targeted engagement and positive press outreach.</div>`}

${rAntiCount>0
  ? `<div class="rec warn"><strong>⚠ Monitor ${rAntiCount} Anti Voice${rAntiCount!==1?"s":""}</strong><br>Key critics to track: <em>${topAntiNames}</em>. Review their specific concerns and prepare targeted PR responses where warranted.</div>`
  : `<div class="rec good"><strong>✓ No Significant Critics Found</strong><br>No major anti voices identified in this period — a positive signal. Continue monitoring regularly to catch early shifts.</div>`}

${rPressCount>0 ? `<div class="rec good"><strong>✓ ${rPressCount} Media Outlets Covering This Account</strong><br>Significant press presence. Maintain relationships with pro-leaning outlets and monitor neutral ones for sentiment shifts.</div>` : ""}

${discoveredData.length>0 ? `<div class="rec"><strong>◈ ${discoveredData.length} Social Accounts Discovered via Keyword Search</strong><br>Active social conversation on HackerNews, Mastodon, and Twitter/X. Engage with key influencers and respond to viral posts within 24 hours for maximum impact.</div>` : ""}

<div class="rec">
  <strong>◈ Recommended Next Steps</strong><br>
  1. Amplify content from top pro voices: ${pros.slice(0,3).map(i=>esc(i.displayName||i.name)).join(", ")||"N/A"}<br>
  2. Monitor anti voices weekly: ${antis.slice(0,3).map(i=>esc(i.displayName||i.name)).join(", ")||"None"}<br>
  3. Run keyword discovery weekly for: ${esc(keywords)}<br>
  4. Track press sentiment from ${rPressCount} media outlets monthly<br>
  5. Generate this report monthly to measure reputation trend changes
</div>

<div class="footer">Generated by ORM CMS &nbsp;·&nbsp; ${date} &nbsp;·&nbsp; Confidential &nbsp;·&nbsp; Account: ${esc(clientName)} &nbsp;·&nbsp; Period: Last ${days} days &nbsp;·&nbsp; ${totalVoices} voices analyzed</div>
</body>
</html>`;

    const filename = `Influencer-Report-${clientName.replace(/\s+/g,"-")}-${days}d.pdf`;
    try {
      const res = await api.post("/analytics/html-to-pdf", { html, filename }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch {
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); }
    }
  }

  return (
    <div className="space-y-5" ref={reportRef}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Star className="h-6 w-6 text-accent" /> Influencer Intelligence
          </h1>
          <p className="text-sm text-muted">
            Verified voices from press & social — viral threshold: {viralThreshold}+ interactions. Anonymous accounts excluded.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {clients.length > 0 && (
            <select value={clientId} onChange={(e) => handleClientChange(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last year</option>
          </select>
          <Button variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          {allInfluencers.length > 0 && (
            <Button onClick={downloadReport} className="flex items-center gap-1.5 text-sm">
              <FileDown className="h-4 w-4" /> Download Report
            </Button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <div className="text-xs text-muted flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Total Voices</div>
          <div className="mt-1 text-3xl font-semibold">{allInfluencers.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Pro</div>
          <div className="mt-1 text-3xl font-semibold text-emerald-600">{proCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5 text-red-500" /> Anti</div>
          <div className="mt-1 text-3xl font-semibold text-red-600">{antiCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted flex items-center gap-1.5"><Newspaper className="h-3.5 w-3.5 text-blue-500" /> Media / Social</div>
          <div className="mt-1 text-3xl font-semibold">{pressCount} / {socialCount}</div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted" />
        {(["all", "pro", "anti"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
              filter === f ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg"
            )}>
            {f === "all" ? "All Stances" : f === "pro" ? "Pro Only" : "Anti Only"}
          </button>
        ))}
        <div className="mx-2 h-4 w-px bg-border" />
        {(["all", "press", "social"] as const).map((f) => (
          <button key={f} onClick={() => setTypeFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
              typeFilter === f ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg"
            )}>
            {f === "all" ? "All Types" : f === "press" ? "Media Outlets" : "Social Only"}
          </button>
        ))}
      </div>

      {/* Data note */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-900/10 px-4 py-2.5 text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <b>What you see here:</b> Media outlets (RSS/press) + social commenters + accounts discovered via keyword search
          on Twitter/X <span className="text-purple-600 font-medium">(purple)</span>,
          HackerNews <span className="text-amber-600 font-medium">(amber)</span>, and
          Mastodon <span className="text-violet-600 font-medium">(violet border)</span>.
          Use <b>Discover More Social Influencers</b> below to extract real accounts talking about any keyword.
        </span>
      </div>

      {/* Influencer grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Analysing influencers…</span>
        </div>
      ) : allInfluencers.length === 0 ? (
        <Card className="py-12 text-center text-muted">
          <Users className="mx-auto mb-2 h-10 w-10 opacity-25" />
          <p className="text-sm font-medium">No influencers found yet</p>
          <p className="mt-1 text-xs max-w-sm mx-auto">
            {discoverLoading || discoverStatus
              ? "Discovering social influencers from Twitter/X — results will appear here in 20–30 seconds."
              : typeFilter === "social"
              ? `Use the "Discover Social Influencers" section below to extract real Twitter/X accounts talking about ${clientName}.`
              : "Connect press sources and use the discover tool below to build the influencer map."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {allInfluencers.map((inf, i) => (
            <InfluencerCard key={`${inf.type}-${inf.name}-${i}`} inf={inf} idx={i} onRemove={removeDiscovered} />
          ))}
        </div>
      )}

      {/* Summary section */}
      {!loading && data && allInfluencers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-emerald-600 mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Top Pro Voices
            </h3>
            <div className="space-y-2">
              {allInfluencers.filter(i => i.stance === "Pro").slice(0, 5).map((i, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="truncate">{i.name}</span>
                  <span className="text-xs text-muted ml-2 shrink-0">{i.total_mentions.toLocaleString()} mentions</span>
                </div>
              ))}
              {allInfluencers.filter(i => i.stance === "Pro").length === 0 && (
                <p className="text-xs text-muted">No pro voices identified yet</p>
              )}
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-2">
              <TrendingDown className="h-4 w-4" /> Top Anti Voices
            </h3>
            <div className="space-y-2">
              {allInfluencers.filter(i => i.stance === "Anti").slice(0, 5).map((i, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="truncate">{i.name}</span>
                  <span className="text-xs text-muted ml-2 shrink-0">{i.total_mentions.toLocaleString()} mentions</span>
                </div>
              ))}
              {allInfluencers.filter(i => i.stance === "Anti").length === 0 && (
                <p className="text-xs text-muted">No anti voices identified yet</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Report section */}
      {!loading && allInfluencers.length > 0 && (
        <Card className="bg-gradient-to-r from-accent/5 to-purple-500/5 border-accent/20">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileDown className="h-4 w-4 text-accent" /> Influencer Intelligence Report
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Download a comprehensive PDF with all voices (pro/anti/mixed), platform breakdown,
                sentiment analysis, social listening insights &amp; reputation strategy — ready to share with your client.
              </p>
            </div>
            <Button onClick={downloadReport} className="shrink-0 flex items-center gap-2">
              <FileDown className="h-4 w-4" /> Download Report
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Social Discovery (Twitter/X keyword search) ─────────────────── */}
      <div className="border-t border-border pt-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Twitter className="h-5 w-5 text-[#1DA1F2]" /> Discover More Social Influencers
            </h2>
            <p className="text-xs text-muted">
              Search Twitter/X, HackerNews &amp; Mastodon by keyword — AI classifies accounts as Pro or Anti and adds them to the list above.
            </p>
          </div>
          <Button variant="ghost" onClick={() => loadDiscovered(clientId, null)} disabled={discoverLoading}>
            <RefreshCw className={cn("h-4 w-4", discoverLoading && "animate-spin")} />
          </Button>
        </div>

        {/* Keyword input */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
            <input
              type="text"
              value={discoverKeyword}
              onChange={(e) => setDiscoverKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
              placeholder={`e.g. ${clientName || "BJP"}, #Congress, @narendramodi`}
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <Button onClick={handleDiscover} disabled={discovering || !discoverKeyword.trim()}>
            {discovering ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : <Search className="h-4 w-4 mr-1.5" />}
            Discover Now
          </Button>
        </div>

        {discoverStatus && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 dark:border-purple-800/40 dark:bg-purple-900/10 px-4 py-2.5 text-xs text-purple-700 dark:text-purple-300 flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
            {discoverStatus}
          </div>
        )}

        {/* Keywords previously discovered */}
        {discoverKeywords.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted">Keywords searched:</span>
            {discoverKeywords.map((kw) => (
              <span key={kw}
                className="rounded-full px-3 py-1 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                #{kw}
              </span>
            ))}
            <span className="text-xs text-muted ml-1">
              — {discovered.length} accounts found, shown above with Twitter/X badge
            </span>
          </div>
        )}

        {discovered.length === 0 && !discoverStatus && (
          <Card className="py-6 text-center text-muted border-dashed">
            <Globe className="mx-auto mb-2 h-8 w-8 opacity-25" />
            <p className="text-sm font-medium">No Twitter/X influencers discovered yet</p>
            <p className="mt-1 text-xs max-w-xs mx-auto">
              Enter a keyword (e.g., "{clientName || "BJP"}", "#Congress") and click Discover Now.
              Found accounts appear above in the influencer grid with platform badges (Twitter, HackerNews, or Mastodon).
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
