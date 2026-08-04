"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Users, TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink,
  Newspaper, MessageSquare, Filter, Star, AlertTriangle, FileDown,
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

function InfluencerCard({ inf, idx }: { inf: any; idx: number }) {
  const Icon = STANCE_ICON[inf.stance] ?? Minus;
  const total = inf.positive_count + inf.negative_count || 1;
  const posP = Math.round((inf.positive_count / total) * 100);
  const negP = Math.round((inf.negative_count / total) * 100);

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
          #{idx + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{inf.name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1", STANCE_COLOR[inf.stance])}>
              <Icon className="h-3 w-3" />{inf.stance}
            </span>
            {inf.type === "press" ? (
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[10px]">
                <Newspaper className="h-2.5 w-2.5 mr-1" />Media Outlet
              </Badge>
            ) : (
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px]">
                <MessageSquare className="h-2.5 w-2.5 mr-1" />Social
              </Badge>
            )}
            {inf.total_mentions >= 100 && (
              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 text-[10px]">
                <Zap className="h-2.5 w-2.5 mr-1" />Viral
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted">
            <span className="font-medium">{inf.total_mentions.toLocaleString()} mentions</span>
            <span className="text-emerald-600 font-medium">+{inf.positive_count} pro</span>
            <span className="text-red-500 font-medium">−{inf.negative_count} anti</span>
          </div>
        </div>
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
              <span className="line-clamp-1">{p.title || p.url}</span>
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
  return (
    <Card className="space-y-3 border-l-4 border-l-purple-400">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30 text-xs font-bold text-purple-600">
          <Twitter className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a href={inf.profile_url} target="_blank" rel="noreferrer"
              className="text-sm font-semibold text-accent hover:underline truncate">
              @{inf.handle}
            </a>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1", STANCE_COLOR[inf.stance])}>
              <Icon className="h-3 w-3" />{inf.stance}
            </span>
            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px]">
              Discovered · Twitter
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted">
            <span className="font-medium">{inf.total_posts} tweets</span>
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
              {expanded ? "Show less" : `+${inf.posts.length - 2} more tweets`}
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

  function handleClientChange(id: string) {
    setClientId(id);
    const c = clients.find((c) => c.id === id);
    if (c) setClientName(c.name);
    setActiveKeyword(null);
  }

  async function handleDiscover() {
    if (!discoverKeyword.trim() || !clientId) return;
    setDiscovering(true);
    setDiscoverStatus("Searching Twitter/X for accounts talking about "" + discoverKeyword + ""…");
    try {
      await api.post("/social-listening/discover", {
        client_id: clientId,
        keyword: discoverKeyword.trim(),
        platform: "twitter",
        limit: 40,
      });
      setDiscoverStatus("Discovery running in background. Results will appear in 15–30 seconds.");
      setDiscoverKeyword("");
      // Poll once after 20s
      setTimeout(() => {
        loadDiscovered(clientId, activeKeyword);
        setDiscoverStatus("");
      }, 22000);
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

  const allInfluencers = [
    ...(data?.press || []).map((i: any) => ({ ...i, type: "press" })),
    ...(data?.social || []).map((i: any) => ({ ...i, type: "social" })),
  ]
    .filter((i) => filter === "all" || i.stance.toLowerCase() === filter)
    .filter((i) => typeFilter === "all" || i.type === typeFilter)
    .sort((a, b) => b.total_mentions - a.total_mentions);

  const proCount    = allInfluencers.filter((i) => i.stance === "Pro").length;
  const antiCount   = allInfluencers.filter((i) => i.stance === "Anti").length;
  const pressCount  = (data?.press || []).length;
  const socialCount = (data?.social || []).length;
  const viralThreshold = data?.viral_threshold ?? 10;

  function downloadReport() {
    const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const pros  = allInfluencers.filter((i) => i.stance === "Pro");
    const antis = allInfluencers.filter((i) => i.stance === "Anti");
    const mixed = allInfluencers.filter((i) => i.stance === "Mixed");

    const rows = (list: any[]) => list.map((inf, idx) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">#${idx + 1}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${inf.name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${inf.type === "press" ? "Media Outlet" : "Social"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${inf.total_mentions.toLocaleString()}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#16a34a;text-align:right;">+${inf.positive_count}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#dc2626;text-align:right;">−${inf.negative_count}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${inf.posts?.map((p: any) => p.url ? `<a href="${p.url}">${p.title || p.url}</a>` : "").filter(Boolean).join("<br>") || "—"}</td>
      </tr>`).join("");

    const section = (title: string, color: string, list: any[]) => list.length === 0 ? "" : `
      <h3 style="margin:24px 0 8px;color:${color};">${title} (${list.length})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f8f9fa;">
          <th style="padding:6px 10px;text-align:left;">#</th>
          <th style="padding:6px 10px;text-align:left;">Name / Handle</th>
          <th style="padding:6px 10px;text-align:left;">Type</th>
          <th style="padding:6px 10px;text-align:right;">Mentions</th>
          <th style="padding:6px 10px;text-align:right;">Pro</th>
          <th style="padding:6px 10px;text-align:right;">Anti</th>
          <th style="padding:6px 10px;text-align:left;">Source Links</th>
        </tr></thead>
        <tbody>${rows(list)}</tbody>
      </table>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Influencer Intelligence Report — ${clientName}</title>
      <style>body{font-family:Arial,sans-serif;margin:40px;color:#111;}h1{color:#1e40af;}h2{color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:8px;}a{color:#2563eb;}</style>
    </head><body>
      <h1>⭐ Influencer Intelligence Report</h1>
      <p><strong>Account:</strong> ${clientName} &nbsp;|&nbsp; <strong>Period:</strong> Last ${days} days &nbsp;|&nbsp; <strong>Generated:</strong> ${date}</p>
      <p><strong>Viral threshold:</strong> ${viralThreshold}+ interactions required &nbsp;|&nbsp; <strong>Anonymous/fake accounts excluded</strong></p>

      <h2>Summary</h2>
      <table style="border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:4px 16px 4px 0;">Total Voices</td><td><strong>${allInfluencers.length}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;">Pro Voices</td><td><strong style="color:#16a34a;">${proCount}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;">Anti Voices</td><td><strong style="color:#dc2626;">${antiCount}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;">Media Outlets</td><td><strong>${pressCount}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;">Social Influencers</td><td><strong>${socialCount}</strong></td></tr>
      </table>

      ${section("Pro Voices", "#16a34a", pros)}
      ${section("Anti Voices", "#dc2626", antis)}
      ${section("Mixed / Neutral", "#6b7280", mixed)}

      <p style="margin-top:40px;font-size:11px;color:#9ca3af;">Generated by ORM CMS · ${date}</p>
    </body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `influencer-report-${clientName}-${days}d.html`;
    a.click(); URL.revokeObjectURL(url);
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
          <b>What you see here:</b> Media outlets are tracked from RSS/YouTube press sources. Social influencers are real named accounts
          who commented on your posts with {viralThreshold}+ interactions and measurable pro/anti sentiment.
          To expand social influencer reach (Twitter/X accounts, Instagram commenters), connect those platforms in{" "}
          <b>Press Sources</b>.
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
          <p className="text-sm font-medium">No verified influencers found</p>
          <p className="mt-1 text-xs max-w-sm mx-auto">
            {typeFilter === "social"
              ? `No social accounts with ${viralThreshold}+ interactions and real pro/anti sentiment found. Anonymous placeholder accounts (citizen_XXXXX) are excluded.`
              : "Connect press sources and sync social accounts to build the influencer map."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {allInfluencers.map((inf, i) => (
            <InfluencerCard key={`${inf.type}-${inf.name}-${i}`} inf={inf} idx={i} />
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
                Download a full HTML report with all {allInfluencers.length} verified influencers, pro/anti breakdown,
                mention counts and source links — ready to share with your client.
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
              <Twitter className="h-5 w-5 text-[#1DA1F2]" /> Discover Social Influencers
            </h2>
            <p className="text-xs text-muted">
              Search Twitter/X for real accounts talking about your client. AI classifies each as Pro or Anti.
            </p>
          </div>
          {discovered.length > 0 && (
            <Button variant="ghost" onClick={() => loadDiscovered(clientId, activeKeyword)} disabled={discoverLoading}>
              <RefreshCw className={cn("h-4 w-4", discoverLoading && "animate-spin")} />
            </Button>
          )}
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
            {discovering && <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />}
            {discoverStatus}
          </div>
        )}

        {/* Keyword filter tabs */}
        {discoverKeywords.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted">Filter by keyword:</span>
            <button
              onClick={() => setActiveKeyword(null)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activeKeyword === null ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg"
              )}>
              All
            </button>
            {discoverKeywords.map((kw) => (
              <button key={kw} onClick={() => setActiveKeyword(kw)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  activeKeyword === kw ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg"
                )}>
                #{kw}
              </button>
            ))}
          </div>
        )}

        {/* Discovered influencer grid */}
        {discoverLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading discovered influencers…</span>
          </div>
        ) : discovered.length === 0 ? (
          <Card className="py-8 text-center text-muted border-dashed">
            <Globe className="mx-auto mb-2 h-8 w-8 opacity-25" />
            <p className="text-sm font-medium">No social influencers discovered yet</p>
            <p className="mt-1 text-xs max-w-xs mx-auto">
              Enter a keyword above (e.g., "BJP", "#Congress", "Modi") and click Discover Now.
              We'll search Twitter/X and classify accounts as Pro or Anti.
            </p>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium">{discovered.length} accounts discovered</span>
              <span className="text-emerald-600">{discovered.filter(d => d.stance === "Pro").length} Pro</span>
              <span className="text-red-500">{discovered.filter(d => d.stance === "Anti").length} Anti</span>
              <span className="text-muted">{discovered.filter(d => d.stance === "Mixed").length} Mixed</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {discovered.map((inf) => (
                <DiscoveredCard key={inf.id} inf={inf} onRemove={removeDiscovered} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
