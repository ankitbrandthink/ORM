"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Users, TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink,
  Newspaper, MessageSquare, Filter, Download, Star, AlertTriangle,
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
        {/* Rank */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
          #{idx + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{inf.name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1", STANCE_COLOR[inf.stance])}>
              <Icon className="h-3 w-3" />
              {inf.stance}
            </span>
            {inf.type === "press" ? (
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[10px]">
                <Newspaper className="h-2.5 w-2.5 mr-1" />Press
              </Badge>
            ) : (
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px]">
                <MessageSquare className="h-2.5 w-2.5 mr-1" />Social
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted">
            <span>{inf.total_mentions} mention{inf.total_mentions !== 1 ? "s" : ""}</span>
            <span className="text-emerald-600 font-medium">+{inf.positive_count} pro</span>
            <span className="text-red-500 font-medium">−{inf.negative_count} anti</span>
          </div>
        </div>
      </div>

      {/* Sentiment bar */}
      <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        {posP > 0 && (
          <div className="bg-emerald-500 transition-all" style={{ width: `${posP}%` }} title={`Pro: ${posP}%`} />
        )}
        {negP > 0 && (
          <div className="bg-red-500 transition-all" style={{ width: `${negP}%` }} title={`Anti: ${negP}%`} />
        )}
        {100 - posP - negP > 0 && (
          <div className="bg-slate-300 dark:bg-slate-600 flex-1" title="Neutral" />
        )}
      </div>

      {/* Article/post links */}
      {inf.posts?.length > 0 && (
        <div className="space-y-1">
          {inf.posts.slice(0, 3).map((p: any, i: number) => (
            <a key={i} href={p.url} target="_blank" rel="noreferrer"
              className="flex items-start gap-1.5 text-[11px] text-muted hover:text-accent group">
              <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 group-hover:text-accent" />
              <span className="line-clamp-1">{p.title || p.url}</span>
              {p.published_at && (
                <span className="shrink-0 text-muted/60 ml-auto">{p.published_at}</span>
              )}
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function InfluencersPage() {
  const [clients, setClients]   = useState<any[]>([]);
  const [clientId, setClientId] = useState("");
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [days, setDays]         = useState(90);
  const [filter, setFilter]     = useState<"all" | "pro" | "anti">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "press" | "social">("all");

  useEffect(() => {
    api.get("/clients").then((r) => {
      const list = r.data || [];
      setClients(list);
      if (list.length > 0) setClientId(list[0].id);
    }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!clientId) return;
    setLoading(true);
    const params: any = { days, limit: 30 };
    if (clientId) params.client_id = clientId;
    api.get("/analytics/influencers", { params })
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId, days]);

  useEffect(() => { load(); }, [load]);

  const allInfluencers = [
    ...(data?.press || []).map((i: any) => ({ ...i, type: "press" })),
    ...(data?.social || []).map((i: any) => ({ ...i, type: "social" })),
  ]
    .filter((i) => filter === "all" || i.stance.toLowerCase() === filter)
    .filter((i) => typeFilter === "all" || i.type === typeFilter)
    .sort((a, b) => b.total_mentions - a.total_mentions);

  const proCount  = allInfluencers.filter((i) => i.stance === "Pro").length;
  const antiCount = allInfluencers.filter((i) => i.stance === "Anti").length;
  const pressCount  = (data?.press || []).length;
  const socialCount = (data?.social || []).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Star className="h-6 w-6 text-accent" /> Influencer Intelligence
          </h1>
          <p className="text-sm text-muted">
            Top voices from press coverage and social engagement — ranked by mentions and stance.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {clients.length > 0 && (
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}
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
          <div className="text-xs text-muted flex items-center gap-1.5"><Newspaper className="h-3.5 w-3.5 text-blue-500" /> Press / Social</div>
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
            {f === "all" ? "All Stances" : f === "pro" ? "Pro only" : "Anti only"}
          </button>
        ))}
        <div className="mx-2 h-4 w-px bg-border" />
        {(["all", "press", "social"] as const).map((f) => (
          <button key={f} onClick={() => setTypeFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
              typeFilter === f ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-fg"
            )}>
            {f === "all" ? "All Types" : f === "press" ? "Press only" : "Social only"}
          </button>
        ))}
      </div>

      {/* Data note */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <b>Data source:</b> Influencers are identified from existing press articles and social media engagement in your account.
          To track external influencers mentioning your client across public social platforms (Twitter/X, YouTube, Instagram),
          set up social listening sources in the <b>Press Sources</b> section.
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
          <p className="text-sm font-medium">No influencer data yet</p>
          <p className="mt-1 text-xs">
            Add press sources and sync social accounts to start building the influencer map.
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
      {!loading && data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Top pro voices */}
          <Card>
            <h3 className="text-sm font-semibold text-emerald-600 mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Top Pro Voices
            </h3>
            <div className="space-y-2">
              {allInfluencers.filter(i => i.stance === "Pro").slice(0, 5).map((i, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="truncate">{i.name}</span>
                  <span className="text-xs text-muted ml-2 shrink-0">{i.total_mentions} mentions</span>
                </div>
              ))}
              {allInfluencers.filter(i => i.stance === "Pro").length === 0 && (
                <p className="text-xs text-muted">No pro voices identified yet</p>
              )}
            </div>
          </Card>

          {/* Top anti voices */}
          <Card>
            <h3 className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-2">
              <TrendingDown className="h-4 w-4" /> Top Anti Voices
            </h3>
            <div className="space-y-2">
              {allInfluencers.filter(i => i.stance === "Anti").slice(0, 5).map((i, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="truncate">{i.name}</span>
                  <span className="text-xs text-muted ml-2 shrink-0">{i.total_mentions} mentions</span>
                </div>
              ))}
              {allInfluencers.filter(i => i.stance === "Anti").length === 0 && (
                <p className="text-xs text-muted">No anti voices identified yet</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
