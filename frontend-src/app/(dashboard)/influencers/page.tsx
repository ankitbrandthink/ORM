"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Users, TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink,
  Newspaper, MessageSquare, Filter, Star, FileDown,
  Zap, Info, Search, Twitter, X,
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

function InfluencerCard({ inf, idx, onRemove }: { inf: any; idx: number; onRemove?: (id: string) => void }) {
  const Icon = STANCE_ICON[inf.stance] ?? Minus;
  const total = inf.positive_count + inf.negative_count || 1;
  const posP = Math.round((inf.positive_count / total) * 100);
  const negP = Math.round((inf.negative_count / total) * 100);
  const isTwitter = inf.source === "twitter";
  const isReddit = inf.source === "reddit";
  const isDiscovered = isTwitter || isReddit;

  const borderColor = isTwitter
    ? "border-l-4 border-l-purple-400"
    : isReddit
    ? "border-l-4 border-l-orange-400"
    : "";

  const avatarClass = isTwitter
    ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600"
    : isReddit
    ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600"
    : "bg-accent/10 text-accent";

  return (
    <Card className={cn("space-y-3", borderColor)}>
      <div className="flex items-start gap-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", avatarClass)}>
          {isTwitter ? (
            <Twitter className="h-4 w-4" />
          ) : isReddit ? (
            <RedditIcon className="h-4 w-4" />
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
    const pros  = allInfluencers.filter((i) => i.stance === "Pro");
    const antis = allInfluencers.filter((i) => i.stance === "Anti");
    const mixed = allInfluencers.filter((i) => i.stance === "Mixed");

    const rows = (list: any[]) => list.map((inf, idx) => `
      <tr style="background:${idx % 2 === 0 ? "#fff" : "#f9fafb"};">
        <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:10pt;">#${idx + 1}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:600;font-size:10pt;">${inf.name}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:10pt;">${inf.type === "press" ? "Media Outlet" : "Social"}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-size:10pt;">${inf.total_mentions.toLocaleString()}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;color:#16a34a;text-align:right;font-size:10pt;font-weight:600;">+${inf.positive_count}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;color:#dc2626;text-align:right;font-size:10pt;font-weight:600;">-${inf.negative_count}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:9pt;word-break:break-all;">${inf.posts?.map((p: any) => p.url ? `<a href="${p.url}" style="color:#2563eb;text-decoration:none;">${p.title || p.url}</a>` : "").filter(Boolean).slice(0,2).join("<br>") || "—"}</td>
      </tr>`).join("");

    const section = (title: string, color: string, list: any[]) => list.length === 0 ? "" : `
      <div style="margin-top:20px;">
        <h3 style="margin:0 0 8px;color:${color};font-size:13pt;border-left:4px solid ${color};padding-left:8px;">${title} (${list.length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;">
          <thead>
            <tr style="background:#1e40af;color:#fff;">
              <th style="padding:6px 8px;text-align:left;font-size:9pt;width:4%;">#</th>
              <th style="padding:6px 8px;text-align:left;font-size:9pt;width:22%;">Name / Handle</th>
              <th style="padding:6px 8px;text-align:left;font-size:9pt;width:12%;">Type</th>
              <th style="padding:6px 8px;text-align:right;font-size:9pt;width:12%;">Mentions</th>
              <th style="padding:6px 8px;text-align:right;font-size:9pt;width:8%;">Pro</th>
              <th style="padding:6px 8px;text-align:right;font-size:9pt;width:8%;">Anti</th>
              <th style="padding:6px 8px;text-align:left;font-size:9pt;">Source Links</th>
            </tr>
          </thead>
          <tbody>${rows(list)}</tbody>
        </table>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Influencer Intelligence Report — ${clientName}</title>
<style>
  @page { size: A4; margin: 15mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111; margin: 0; padding: 0; }
  h1 { font-size: 18pt; color: #1e40af; margin: 0 0 4px; }
  h2 { font-size: 13pt; color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin: 20px 0 10px; }
  a { color: #2563eb; text-decoration: none; }
  table { border-collapse: collapse; }
  .header-bar { background: #1e40af; color: #fff; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px; }
  .header-bar h1 { color: #fff; }
  .header-bar p { margin: 2px 0; font-size: 10pt; opacity: 0.9; }
  .kpi-grid { display: table; width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .kpi-cell { display: table-cell; border: 1px solid #e5e7eb; border-radius: 4px; padding: 10px 14px; text-align: center; width: 20%; }
  .kpi-label { font-size: 9pt; color: #6b7280; margin-bottom: 2px; }
  .kpi-value { font-size: 20pt; font-weight: 700; }
  .page-break { page-break-before: always; }
  .footer { margin-top: 24px; font-size: 9pt; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style>
</head>
<body>

<div class="header-bar">
  <h1>Influencer Intelligence Report</h1>
  <p><strong>Account:</strong> ${clientName} &nbsp;&nbsp; <strong>Period:</strong> Last ${days} days &nbsp;&nbsp; <strong>Generated:</strong> ${date}</p>
  <p>Viral threshold: ${viralThreshold}+ interactions &nbsp;|&nbsp; Anonymous accounts excluded &nbsp;|&nbsp; Powered by ORM CMS</p>
</div>

<h2>Executive Summary</h2>
<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
  <tr>
    <td style="border:1px solid #e5e7eb;padding:10px 14px;text-align:center;width:20%;">
      <div style="font-size:9pt;color:#6b7280;">Total Voices</div>
      <div style="font-size:22pt;font-weight:700;">${allInfluencers.length}</div>
    </td>
    <td style="border:1px solid #e5e7eb;padding:10px 14px;text-align:center;width:20%;">
      <div style="font-size:9pt;color:#6b7280;">Pro Voices</div>
      <div style="font-size:22pt;font-weight:700;color:#16a34a;">${proCount}</div>
    </td>
    <td style="border:1px solid #e5e7eb;padding:10px 14px;text-align:center;width:20%;">
      <div style="font-size:9pt;color:#6b7280;">Anti Voices</div>
      <div style="font-size:22pt;font-weight:700;color:#dc2626;">${antiCount}</div>
    </td>
    <td style="border:1px solid #e5e7eb;padding:10px 14px;text-align:center;width:20%;">
      <div style="font-size:9pt;color:#6b7280;">Media Outlets</div>
      <div style="font-size:22pt;font-weight:700;color:#2563eb;">${pressCount}</div>
    </td>
    <td style="border:1px solid #e5e7eb;padding:10px 14px;text-align:center;width:20%;">
      <div style="font-size:9pt;color:#6b7280;">Social Influencers</div>
      <div style="font-size:22pt;font-weight:700;color:#7c3aed;">${socialCount}</div>
    </td>
  </tr>
</table>

${pros.length > 0 ? `<h2>Pro Voices (${pros.length})</h2>${section("", "#16a34a", pros).replace(/<div[^>]*>|<\/div>/g, "")}` : ""}
${antis.length > 0 ? `<div class="page-break"></div><h2>Anti Voices (${antis.length})</h2>${section("", "#dc2626", antis).replace(/<div[^>]*>|<\/div>/g, "")}` : ""}
${mixed.length > 0 ? `<h2>Mixed / Neutral (${mixed.length})</h2>${section("", "#6b7280", mixed).replace(/<div[^>]*>|<\/div>/g, "")}` : ""}

<div class="footer">Generated by ORM CMS &nbsp;&middot;&nbsp; ${date} &nbsp;&middot;&nbsp; Confidential</div>
</body>
</html>`;

    const filename = `Influencer-Report-${clientName}-${days}d.pdf`;
    try {
      const res = await api.post(
        "/analytics/html-to-pdf",
        { html, filename },
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(res.data as Blob);
      const a   = document.createElement("a");
      a.href     = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab for manual print-to-PDF
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
          on Twitter/X <span className="text-purple-600 font-medium">(purple border)</span> and Reddit
          <span className="text-orange-600 font-medium"> (orange border)</span>.
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
              <Twitter className="h-5 w-5 text-[#1DA1F2]" /> Discover More Social Influencers
            </h2>
            <p className="text-xs text-muted">
              Search Twitter/X &amp; Reddit by keyword — AI classifies accounts as Pro or Anti and adds them to the list above.
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
              Found accounts appear above in the influencer grid with a Twitter badge.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
