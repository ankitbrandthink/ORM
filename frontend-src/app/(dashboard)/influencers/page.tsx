"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Users, TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink,
  Filter, Star, FileDown, Zap, Search, Twitter, Globe,
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
  mid: "10K–1L",
  macro: "1L–10L",
  mega: "10L+",
  unknown: "Unknown",
};

const TIER_ORDER = ["micro", "mid", "macro", "mega", "unknown"];

function formatFollowers(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

// ── Platform icons ────────────────────────────────────────────────────────────

function MastodonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z"/>
    </svg>
  );
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  if (platform === "mastodon") return <MastodonIcon className={className} />;
  return <Twitter className={className} />;
}

// ── Influencer Card (accordion) ───────────────────────────────────────────────

function InfluencerCard({
  inf, onRemove,
}: {
  inf: Influencer;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = (inf.positive_count + inf.negative_count) || 1;
  const posP = Math.round((inf.positive_count / total) * 100);
  const negP = Math.round((inf.negative_count / total) * 100);
  const isMastodon = inf.platform === "mastodon";

  const stanceColor =
    inf.stance === "Pro"
      ? "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30"
      : inf.stance === "Anti"
      ? "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30"
      : "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/40";

  const borderColor =
    inf.stance === "Pro"
      ? "border-l-4 border-l-emerald-400"
      : inf.stance === "Anti"
      ? "border-l-4 border-l-red-400"
      : "border-l-4 border-l-slate-300";

  const StanceIcon = inf.stance === "Pro" ? TrendingUp : inf.stance === "Anti" ? TrendingDown : Minus;

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", borderColor)}>
      {/* Header row — always visible */}
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/10 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {/* Platform avatar */}
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5",
          isMastodon
            ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600"
            : "bg-sky-100 dark:bg-sky-900/30 text-sky-600",
        )}>
          <PlatformIcon platform={inf.platform} className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + stance badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate text-accent">
              @{inf.handle}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1", stanceColor)}>
              <StanceIcon className="h-3 w-3" />
              {inf.stance}
            </span>
            {inf.follower_tier !== "unknown" && (
              <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300 text-[10px]">
                {TIER_LABELS[inf.follower_tier]}
              </Badge>
            )}
            {inf.followers_count != null && (
              <span className="text-[10px] text-muted">{formatFollowers(inf.followers_count)} followers</span>
            )}
            {inf.total_posts >= 3 && (
              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 text-[10px]">
                <Zap className="h-2.5 w-2.5 mr-1" />Active
              </Badge>
            )}
          </div>

          {/* Counts row */}
          <div className="flex items-center gap-3 mt-1 text-xs text-muted">
            <span className="font-medium">{inf.total_posts} posts</span>
            <span className="text-emerald-600 font-medium">+{inf.positive_count} pro</span>
            <span className="text-red-500 font-medium">−{inf.negative_count} anti</span>
            {inf.keyword && <span className="opacity-60">#{inf.keyword}</span>}
          </div>

          {/* Sentiment bar */}
          <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 mt-2">
            {posP > 0 && <div className="bg-emerald-500" style={{ width: `${posP}%` }} />}
            {negP > 0 && <div className="bg-red-500" style={{ width: `${negP}%` }} />}
            {100 - posP - negP > 0 && <div className="bg-slate-300 dark:bg-slate-600 flex-1" />}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {open ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(inf.id); }}
            className="text-muted hover:text-red-500 transition-colors ml-1"
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </button>

      {/* Expanded accordion body */}
      {open && (
        <div className="px-4 pb-4 border-t border-border/60 space-y-3 pt-3">
          {/* Keyword clusters */}
          {inf.keyword_clusters.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted mb-2">
                <Hash className="h-3 w-3" />
                <span className="font-medium">Keyword Clusters</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {inf.keyword_clusters.map((kw, i) => (
                  <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[10px] font-medium">
                    #{kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Posts */}
          {inf.posts.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted mb-2">
                <Eye className="h-3 w-3" />
                <span className="font-medium">Posts ({inf.posts.length})</span>
              </div>
              <div className="space-y-2">
                {inf.posts.map((p, i) => (
                  <div key={i} className="rounded-lg bg-muted/30 dark:bg-slate-800/40 p-2.5 space-y-1">
                    <div className="flex items-start gap-2">
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
                      <p className="text-[11px] text-fg/80 line-clamp-3 flex-1">{p.content}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      {p.published_at && (
                        <span className="text-[10px] text-muted">
                          {new Date(p.published_at).toLocaleDateString("en-IN")}
                        </span>
                      )}
                      <a href={p.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-0.5 text-[10px] text-accent hover:underline ml-auto">
                        <ExternalLink className="h-3 w-3" /> View Post
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
              className="flex items-center gap-1.5 text-[11px] text-accent hover:underline">
              <ExternalLink className="h-3 w-3" /> View @{inf.handle}'s profile
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Viral Content Section ─────────────────────────────────────────────────────

function ViralSection({ influencers }: { influencers: Influencer[] }) {
  const allPosts = influencers
    .flatMap((inf) =>
      inf.posts.map((p) => ({ ...p, handle: inf.handle, stance: inf.stance, profile_url: inf.profile_url }))
    )
    .filter((p) => p.content && p.url);

  const proViral = allPosts.filter((p) => p.stance === "Pro").slice(0, 3);
  const antiViral = allPosts.filter((p) => p.stance === "Anti").slice(0, 3);

  if (proViral.length === 0 && antiViral.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <Flame className="h-4 w-4 text-orange-500" /> Viral Content
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {proViral.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Pro Voices — Viral Posts
            </div>
            {proViral.map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noreferrer"
                className="block rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/10 p-3 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 transition-colors group">
                <div className="text-[11px] font-medium text-muted mb-1">@{p.handle}</div>
                <div className="text-xs text-fg/80 line-clamp-2">{p.content}</div>
                <div className="flex items-center gap-1 mt-2 text-[10px] text-accent group-hover:underline">
                  <ExternalLink className="h-3 w-3" /> View Post
                </div>
              </a>
            ))}
          </div>
        )}
        {antiViral.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" /> Anti Voices — Viral Posts
            </div>
            {antiViral.map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noreferrer"
                className="block rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 p-3 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors group">
                <div className="text-[11px] font-medium text-muted mb-1">@{p.handle}</div>
                <div className="text-xs text-fg/80 line-clamp-2">{p.content}</div>
                <div className="flex items-center gap-1 mt-2 text-[10px] text-accent group-hover:underline">
                  <ExternalLink className="h-3 w-3" /> View Post
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function InfluencersPage() {
  const [clients, setClients]     = useState<any[]>([]);
  const [clientId, setClientId]   = useState("");
  const [clientName, setClientName] = useState("");
  const [days, setDays]           = useState(90);

  // Social discovery
  const [discovered, setDiscovered]           = useState<Influencer[]>([]);
  const [discoverKeywords, setDiscoverKeywords] = useState<string[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  // Filters
  const [stanceFilter, setStanceFilter]         = useState<"all" | "pro" | "anti" | "mixed">("all");
  const [tierFilter, setTierFilter]             = useState<string>("all");
  const [platformFilter, setPlatformFilter]     = useState<string>("all");
  const [activeKeyword, setActiveKeyword]       = useState<string | null>(null);

  // Discover UI
  const [discoverKeyword, setDiscoverKeyword] = useState("");
  const [discovering, setDiscovering]         = useState(false);
  const [discoverStatus, setDiscoverStatus]   = useState("");

  const autoDiscoveredRef = useRef<Set<string>>(new Set());

  // Load clients
  useEffect(() => {
    api.get("/clients").then((r) => {
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

  // Auto-discover on first visit
  useEffect(() => {
    if (!clientId || !clientName || discoverLoading) return;
    if (autoDiscoveredRef.current.has(clientId)) return;
    autoDiscoveredRef.current.add(clientId);
    if (discoverKeywords.length === 0) {
      setDiscoverStatus(`Auto-discovering influencers for "${clientName}" on Twitter/X…`);
      api.post("/social-listening/discover", {
        client_id: clientId, keyword: clientName, platform: "twitter", limit: 50,
      }).then(() => {
        setTimeout(() => loadDiscovered(clientId, null), 20000);
        setTimeout(() => { loadDiscovered(clientId, null); setDiscoverStatus(""); }, 35000);
      }).catch(() => setDiscoverStatus(""));
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
    setDiscoverStatus(`Searching Twitter/X for accounts talking about "${discoverKeyword}"…`);
    try {
      await api.post("/social-listening/discover", {
        client_id: clientId, keyword: discoverKeyword.trim(), platform: "twitter", limit: 50,
      });
      setDiscoverStatus("Discovery running. Results will appear in 20–35 seconds.");
      setDiscoverKeyword("");
      setTimeout(() => loadDiscovered(clientId, activeKeyword), 20000);
      setTimeout(() => { loadDiscovered(clientId, activeKeyword); setDiscoverStatus(""); }, 35000);
    } catch {
      setDiscoverStatus("Discovery failed. Please try again.");
    } finally {
      setDiscovering(false);
    }
  }

  async function removeInfluencer(id: string) {
    await api.delete(`/social-listening/influencers/${id}`).catch(() => {});
    setDiscovered((prev) => prev.filter((d) => d.id !== id));
  }

  // Apply filters
  const filtered = discovered.filter((inf) => {
    if (stanceFilter !== "all" && inf.stance.toLowerCase() !== stanceFilter) return false;
    if (tierFilter !== "all" && inf.follower_tier !== tierFilter) return false;
    if (platformFilter !== "all" && inf.platform !== platformFilter) return false;
    return true;
  });

  const proList   = filtered.filter((i) => i.stance === "Pro");
  const antiList  = filtered.filter((i) => i.stance === "Anti");
  const mixedList = filtered.filter((i) => i.stance === "Mixed");

  // Tiers present in data for filter pills
  const tiersPresent = [...new Set(discovered.map((i) => i.follower_tier))].sort(
    (a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b)
  );
  const platformsPresent = [...new Set(discovered.map((i) => i.platform))];

  // PDF report
  async function downloadReport() {
    const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const proCount   = discovered.filter((i) => i.stance === "Pro").length;
    const antiCount  = discovered.filter((i) => i.stance === "Anti").length;
    const mixedCount = discovered.filter((i) => i.stance === "Mixed").length;
    const total      = discovered.length;
    const proP       = total > 0 ? Math.round((proCount / total) * 100) : 0;
    const antiP      = total > 0 ? Math.round((antiCount / total) * 100) : 0;
    const mixedP     = Math.max(0, 100 - proP - antiP);
    const repScore   = total > 0 ? Math.round(((proCount + mixedCount * 0.5) / total) * 100) : 50;

    const topClusters = discovered
      .flatMap((i) => i.keyword_clusters)
      .reduce((acc: Record<string, number>, kw) => { acc[kw] = (acc[kw] || 0) + 1; return acc; }, {});
    const topKws = Object.entries(topClusters).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k]) => k);

    function esc(s: string) {
      return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function makeSection(list: Influencer[], label: string, color: string, bg: string) {
      if (!list.length) return "";
      const rows = list.map((inf, idx) => {
        const topPost = inf.posts[0];
        const postLink = topPost
          ? `<a href="${esc(topPost.url)}" style="color:#1e40af;font-size:7.5pt;">${esc((topPost.content || topPost.url).slice(0, 80))}…</a>`
          : (inf.profile_url ? `<a href="${esc(inf.profile_url)}" style="color:#1e40af;font-size:7.5pt;">View Profile →</a>` : "—");
        const clusters = inf.keyword_clusters.slice(0, 4).map((k) => `<span style="display:inline-block;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:1px 6px;border-radius:8px;font-size:7pt;margin:1px;">#${esc(k)}</span>`).join(" ");
        return `<tr>
          <td style="color:#9ca3af;text-align:center;font-size:8pt;">${idx + 1}</td>
          <td><a href="${esc(inf.profile_url)}" style="color:#1e40af;font-weight:600;font-size:9pt;">@${esc(inf.handle)}</a><br><span style="font-size:7.5pt;color:#6b7280;">${inf.platform} · ${inf.followers_count != null ? formatFollowers(inf.followers_count) + " followers" : TIER_LABELS[inf.follower_tier]}</span></td>
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
<p>Keywords: ${esc(discoverKeywords.join(", ") || clientName)} &nbsp;·&nbsp; Powered by ORM CMS</p></div>

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

${topKws.length > 0 ? `<h3>Top Keyword Clusters</h3><div style="margin:5px 0 14px;">${topKws.map((k) => `<span style="display:inline-block;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:2px 9px;border-radius:10px;font-size:8.5pt;margin:2px;">#${esc(k)}</span>`).join(" ")}</div>` : ""}

${makeSection(discovered.filter((i) => i.stance === "Pro"), "Pro Voices — Supporters", "#16a34a", "#16a34a")}
${makeSection(discovered.filter((i) => i.stance === "Anti"), "Anti Voices — Critics", "#dc2626", "#dc2626")}
${makeSection(discovered.filter((i) => i.stance === "Mixed"), "Mixed / Neutral Voices", "#6b7280", "#6b7280")}

<h2 style="color:#1e40af;font-size:13pt;border-left:4px solid #1e40af;padding:3px 0 3px 10px;margin:20px 0 9px;">Strategy &amp; Recommendations</h2>
${proP >= 60 ? `<div class="rec good"><strong>✓ Strong Pro Sentiment (${proP}%)</strong><br>Amplify top supporters. Engage proactively and reshare their content.</div>` : proP < 35 ? `<div class="rec warn"><strong>⚠ Low Support — Action Required (${proP}% Pro, ${antiP}% Anti)</strong><br>Urgent reputation management needed. Respond to anti voices with targeted clarifications.</div>` : `<div class="rec"><strong>◈ Balanced Coverage (${proP}% Pro, ${antiP}% Anti)</strong><br>Focus on converting mixed voices through targeted engagement.</div>`}
${antiCount > 0 ? `<div class="rec warn"><strong>⚠ Monitor ${antiCount} Anti Voice${antiCount !== 1 ? "s" : ""}</strong><br>Key critics to track and address with factual responses.</div>` : `<div class="rec good"><strong>✓ No Major Critics Found</strong><br>Continue monitoring regularly to catch early shifts.</div>`}
<div class="rec"><strong>◈ Recommended Next Steps</strong><br>1. Amplify top pro voices weekly<br>2. Monitor anti voices and respond within 24 hours<br>3. Run keyword discovery weekly for: ${esc(discoverKeywords.join(", ") || clientName)}<br>4. Generate monthly reports to track reputation trends</div>

<div class="footer">Generated by ORM CMS · ${date} · Confidential · Account: ${esc(clientName)} · ${total} social influencers analysed</div>
</body></html>`;

    const filename = `Influencer-Report-${clientName.replace(/\s+/g, "-")}-${days}d.pdf`;
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
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Star className="h-6 w-6 text-accent" /> Influencer Intelligence
          </h1>
          <p className="text-sm text-muted">
            Social media influencers talking about {clientName || "the connected account"} — Pro &amp; Anti voices only.
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
          <Button variant="ghost" onClick={() => loadDiscovered(clientId, activeKeyword)} disabled={discoverLoading}>
            <RefreshCw className={cn("h-4 w-4", discoverLoading && "animate-spin")} />
          </Button>
          {discovered.length > 0 && (
            <Button onClick={downloadReport} className="flex items-center gap-1.5 text-sm">
              <FileDown className="h-4 w-4" /> Download Report
            </Button>
          )}
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <div className="text-xs text-muted flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Total Influencers</div>
          <div className="mt-1 text-3xl font-semibold">{discovered.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Pro Voices</div>
          <div className="mt-1 text-3xl font-semibold text-emerald-600">{discovered.filter((i) => i.stance === "Pro").length}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5 text-red-500" /> Anti Voices</div>
          <div className="mt-1 text-3xl font-semibold text-red-600">{discovered.filter((i) => i.stance === "Anti").length}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted flex items-center gap-1.5"><Minus className="h-3.5 w-3.5 text-slate-400" /> Mixed / Neutral</div>
          <div className="mt-1 text-3xl font-semibold text-slate-600">{discovered.filter((i) => i.stance === "Mixed").length}</div>
        </Card>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted shrink-0" />

        {/* Stance filter */}
        {(["all", "pro", "anti", "mixed"] as const).map((f) => (
          <button key={f} onClick={() => setStanceFilter(f)}
            className={cn("rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
              stanceFilter === f ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg")}>
            {f === "all" ? "All Stances" : f === "pro" ? "Pro" : f === "anti" ? "Anti" : "Mixed"}
          </button>
        ))}

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Follower tier filter */}
        <button onClick={() => setTierFilter("all")}
          className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
            tierFilter === "all" ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg")}>
          All Sizes
        </button>
        {tiersPresent.filter((t) => t !== "unknown").map((tier) => (
          <button key={tier} onClick={() => setTierFilter(tier)}
            className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tierFilter === tier ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg")}>
            {TIER_LABELS[tier]}
          </button>
        ))}

        {platformsPresent.length > 1 && (
          <>
            <div className="mx-1 h-4 w-px bg-border" />
            {platformsPresent.map((plat) => (
              <button key={plat} onClick={() => setPlatformFilter(platformFilter === plat ? "all" : plat)}
                className={cn("rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                  platformFilter === plat ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg")}>
                {plat === "mastodon" ? "Mastodon" : "Twitter/X"}
              </button>
            ))}
          </>
        )}

        {/* Active keyword chips */}
        {discoverKeywords.length > 0 && (
          <>
            <div className="mx-1 h-4 w-px bg-border" />
            {discoverKeywords.map((kw) => (
              <button key={kw} onClick={() => setActiveKeyword(activeKeyword === kw ? null : kw)}
                className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  activeKeyword === kw ? "bg-purple-600 text-white" : "bg-card border border-border text-muted hover:text-fg")}>
                #{kw}
              </button>
            ))}
          </>
        )}
      </div>

      {/* ── Status banner ── */}
      {discoverStatus && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 dark:border-purple-800/40 dark:bg-purple-900/10 px-4 py-2.5 text-xs text-purple-700 dark:text-purple-300 flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
          {discoverStatus}
        </div>
      )}

      {/* ── Two-column Pro/Anti grid ── */}
      {discovered.length === 0 && !discoverLoading && !discoverStatus ? (
        <Card className="py-12 text-center text-muted">
          <Users className="mx-auto mb-2 h-10 w-10 opacity-25" />
          <p className="text-sm font-medium">No influencers discovered yet</p>
          <p className="mt-1 text-xs max-w-sm mx-auto">
            Use the Discover section below to find Twitter/X and Mastodon accounts talking about {clientName}.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Pro Column */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
              <TrendingUp className="h-4 w-4" />
              Pro Voices
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs font-bold ml-1">
                {proList.length}
              </span>
            </div>
            {proList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted">
                No Pro voices found for this filter
              </div>
            ) : (
              proList.map((inf) => (
                <InfluencerCard key={inf.id} inf={inf} onRemove={removeInfluencer} />
              ))
            )}
          </div>

          {/* Anti Column */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
              <TrendingDown className="h-4 w-4" />
              Anti Voices
              <span className="rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 text-xs font-bold ml-1">
                {antiList.length}
              </span>
            </div>
            {antiList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted">
                No Anti voices found for this filter
              </div>
            ) : (
              antiList.map((inf) => (
                <InfluencerCard key={inf.id} inf={inf} onRemove={removeInfluencer} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Mixed voices — single column below */}
      {mixedList.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Minus className="h-4 w-4" />
            Mixed / Neutral Voices
            <span className="rounded-full bg-slate-100 dark:bg-slate-700/40 text-slate-600 dark:text-slate-300 px-2 py-0.5 text-xs font-bold ml-1">
              {mixedList.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {mixedList.map((inf) => (
              <InfluencerCard key={inf.id} inf={inf} onRemove={removeInfluencer} />
            ))}
          </div>
        </div>
      )}

      {/* ── Viral Content ── */}
      {filtered.length > 0 && <ViralSection influencers={filtered} />}

      {/* ── Report CTA ── */}
      {discovered.length > 0 && (
        <Card className="bg-gradient-to-r from-accent/5 to-purple-500/5 border-accent/20">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileDown className="h-4 w-4 text-accent" /> Influencer Intelligence Report
              </h3>
              <p className="text-xs text-muted mt-0.5">
                PDF report with Pro/Anti breakdown, keyword clusters, post links &amp; reputation strategy.
              </p>
            </div>
            <Button onClick={downloadReport} className="shrink-0 flex items-center gap-2">
              <FileDown className="h-4 w-4" /> Download Report
            </Button>
          </div>
        </Card>
      )}

      {/* ── Discover Section ── */}
      <div className="border-t border-border pt-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Twitter className="h-5 w-5 text-[#1DA1F2]" /> Discover Social Influencers
            </h2>
            <p className="text-xs text-muted">
              Search Twitter/X &amp; Mastodon by keyword — AI classifies accounts as Pro or Anti.
              Journals, media outlets &amp; anonymous accounts are excluded automatically.
            </p>
          </div>
          <Button variant="ghost" onClick={() => loadDiscovered(clientId, null)} disabled={discoverLoading}>
            <RefreshCw className={cn("h-4 w-4", discoverLoading && "animate-spin")} />
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
            <input type="text" value={discoverKeyword}
              onChange={(e) => setDiscoverKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
              placeholder={`e.g. ${clientName || "BJP"}, #NarendraModi, @RahulGandhi`}
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>
          <Button onClick={handleDiscover} disabled={discovering || !discoverKeyword.trim()}>
            {discovering ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : <Search className="h-4 w-4 mr-1.5" />}
            Discover Now
          </Button>
        </div>

        {discovered.length === 0 && !discoverStatus && (
          <Card className="py-6 text-center text-muted border-dashed">
            <Globe className="mx-auto mb-2 h-8 w-8 opacity-25" />
            <p className="text-sm font-medium">No influencers discovered yet</p>
            <p className="mt-1 text-xs max-w-xs mx-auto">
              Enter a keyword (e.g. "{clientName || "BJP"}", "#Congress") and click Discover Now.
              Only genuine social media influencers are shown — media outlets and anonymous accounts are filtered out.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
