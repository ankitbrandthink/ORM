"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  RefreshCw, TrendingUp, TrendingDown, MessageSquare,
  Newspaper, Cpu, CheckCircle2, AlertTriangle, AlertOctagon,
  ExternalLink, Zap,
} from "lucide-react";

interface BriefingItem {
  id: string;
  topic: string;
  reason: string;
  keywords: string[];
  source_tag: string;
  source_kind: string;
  url?: string;
  weight: number;
}

interface BriefingData {
  client_id: string;
  generated_at: string;
  days_analysed: number;
  stats: { total_comments: number; positive_comments: number; negative_comments: number };
  health: "stable" | "caution" | "crisis";
  health_score: number;
  address_these: BriefingItem[];
  avoid_these: BriefingItem[];
}

const HEALTH_CONFIG = {
  stable: {
    label: "Stable",
    icon: CheckCircle2,
    bar: "bg-emerald-500",
    badge: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  caution: {
    label: "Caution",
    icon: AlertTriangle,
    bar: "bg-amber-400",
    badge: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/20 dark:border-amber-700",
    text: "text-amber-700 dark:text-amber-400",
  },
  crisis: {
    label: "Crisis",
    icon: AlertOctagon,
    bar: "bg-rose-500",
    badge: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-900/20 dark:border-rose-700",
    text: "text-rose-700 dark:text-rose-400",
  },
};

const SOURCE_ICON: Record<string, any> = {
  comment: MessageSquare,
  narrative: Cpu,
  press: Newspaper,
};

function BriefingCard({ item, side }: { item: BriefingItem; side: "green" | "red" }) {
  const Icon = SOURCE_ICON[item.source_kind] || Zap;
  const isGreen = side === "green";

  return (
    <div className={`rounded-xl border p-4 transition-shadow hover:shadow-sm ${
      isGreen
        ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-900/10"
        : "border-rose-200 bg-rose-50/60 dark:border-rose-800/60 dark:bg-rose-900/10"
    }`}>
      {/* Topic header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className={`text-sm font-semibold leading-snug flex-1 ${
          isGreen ? "text-emerald-800 dark:text-emerald-200" : "text-rose-800 dark:text-rose-200"
        }`}>
          {isGreen ? "✅" : "🚫"} {item.topic}
        </p>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 text-muted hover:text-accent mt-0.5">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Reason */}
      <p className="text-xs text-muted leading-relaxed mb-2.5">{item.reason}</p>

      {/* Keywords */}
      {item.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {item.keywords.map((kw) => (
            <span key={kw} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isGreen
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-800/40 dark:text-emerald-300"
                : "bg-rose-100 text-rose-700 dark:bg-rose-800/40 dark:text-rose-300"
            }`}>
              #{kw}
            </span>
          ))}
        </div>
      )}

      {/* Source tag */}
      <div className="flex items-center gap-1 text-[10px] text-muted">
        <Icon className="h-3 w-3 shrink-0" />
        <span>{item.source_tag}</span>
      </div>
    </div>
  );
}

export function NarrativeBriefingWidget({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const r = await api.get("/analytics/narrative-briefing", {
        params: { client_id: clientId, days: 30 },
      });
      setData(r.data);
      setLastRefresh(new Date());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    setData(null);
    refresh();
  }, [refresh]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        Generating daily narrative briefing…
      </div>
    );
  }

  if (!data) return null;

  const hCfg = HEALTH_CONFIG[data.health] || HEALTH_CONFIG.stable;
  const HealthIcon = hCfg.icon;
  const genTime = new Date(data.generated_at);
  const noAddress = data.address_these.length === 0;
  const noAvoid = data.avoid_these.length === 0;

  return (
    <div className="space-y-4">
      {/* ── Summary bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Health badge */}
          <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${hCfg.badge}`}>
            <HealthIcon className="h-3.5 w-3.5" />
            Narrative Health: {hCfg.label}
          </div>

          {/* Score bar */}
          <div className="flex items-center gap-2">
            <div className="h-2 w-28 overflow-hidden rounded-full bg-border">
              <div
                className={`h-full transition-all duration-700 ${hCfg.bar}`}
                style={{ width: `${data.health_score}%` }}
              />
            </div>
            <span className={`text-xs font-bold tabular-nums ${hCfg.text}`}>{data.health_score}/100</span>
          </div>

          {/* Stats chips */}
          <div className="flex gap-2">
            <span className="rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
              <TrendingUp className="inline h-2.5 w-2.5 mr-0.5" />
              {data.stats.positive_comments} positive
            </span>
            <span className="rounded-full border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
              <TrendingDown className="inline h-2.5 w-2.5 mr-0.5" />
              {data.stats.negative_comments} negative
            </span>
            <span className="rounded-full border border-border bg-black/5 dark:bg-white/5 px-2 py-0.5 text-[10px] text-muted">
              {data.days_analysed}d window
            </span>
          </div>
        </div>

        {/* Refresh */}
        <div className="flex items-center gap-2 shrink-0">
          {lastRefresh && (
            <span className="text-[10px] text-muted">
              Updated {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Live Refresh
          </button>
        </div>
      </div>

      {/* ── Two-column briefing ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* GREEN — Address These */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2.5">
            <TrendingUp className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Address These — Drive Positive Narrative</p>
              <p className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70">
                Topics your audience responds positively to. Engage, amplify, create content around these.
              </p>
            </div>
          </div>

          {noAddress ? (
            <div className="rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 px-4 py-8 text-center text-sm text-muted">
              Not enough positive signal data yet. Sync more posts and comments.
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.address_these.map((item) => (
                <BriefingCard key={item.id} item={item} side="green" />
              ))}
            </div>
          )}
        </div>

        {/* RED — Avoid These */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border-2 border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 px-4 py-2.5">
            <TrendingDown className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <div>
              <p className="text-sm font-bold text-rose-800 dark:text-rose-200">Avoid These — Reputation Risk Zones</p>
              <p className="text-[11px] text-rose-700/70 dark:text-rose-400/70">
                Topics generating negative backlash. Do not post, comment on, or publicly associate with these.
              </p>
            </div>
          </div>

          {noAvoid ? (
            <div className="rounded-xl border border-dashed border-rose-300 dark:border-rose-800 px-4 py-8 text-center text-sm text-muted">
              No significant negative patterns detected. Sentiment is clean.
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.avoid_these.map((item) => (
                <BriefingCard key={item.id} item={item} side="red" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-center text-[11px] text-muted/60 italic">
        Synthesised from {data.stats.total_comments.toLocaleString()} comments, AI post narratives, and press coverage
        for {clientName || "this account"} · Last {data.days_analysed} days ·
        Generated {genTime.toLocaleDateString()} {genTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}
