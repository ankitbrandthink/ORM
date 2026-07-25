"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Shield, TrendingDown, Zap, MessageSquare, FileText,
  Target, AlertTriangle, RefreshCw, ChevronDown, ChevronRight,
} from "lucide-react";

interface CNData {
  urgency: "low" | "medium" | "high" | "critical";
  stats: {
    negative_comments: number;
    positive_comments: number;
    total_analysed: number;
    negative_ratio: number;
    avg_crisis_probability: number;
  };
  negative_clusters: { keyword: string; frequency: number }[];
  amplification_keywords: { keyword: string; frequency: number }[];
  top_topics: { topic: string; count: number }[];
  counter_keywords: { against: string; counter_terms: string[]; strategy: string }[];
  comment_templates: { type: string; template: string; use_when: string }[];
  content_angles: { angle: string; description: string; content_types: string[]; priority: string }[];
  overall_strategy: string;
  narratives_found: string[];
}

const URGENCY_STYLE: Record<string, string> = {
  critical: "border-rose-400 bg-rose-50/60 dark:bg-rose-900/20",
  high: "border-amber-400 bg-amber-50/60 dark:bg-amber-900/20",
  medium: "border-yellow-300 bg-yellow-50/60 dark:bg-yellow-900/10",
  low: "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-900/10",
};
const URGENCY_TEXT: Record<string, string> = {
  critical: "text-rose-600 dark:text-rose-400",
  high: "text-amber-600 dark:text-amber-400",
  medium: "text-yellow-700 dark:text-yellow-400",
  low: "text-emerald-600 dark:text-emerald-400",
};
const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  low: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400",
};

function Section({ icon: Icon, title, children, defaultOpen = true }: {
  icon: any; title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
      </button>
      {open && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  );
}

export function CounterNarrativeWidget({
  clientId,
  postId,
}: {
  clientId?: string;
  postId?: string;
}) {
  const [data, setData] = useState<CNData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params: Record<string, string> = {};
    if (clientId) params.client_id = clientId;
    if (postId) params.post_id = postId;
    if (!clientId && !postId) return;

    setLoading(true);
    try {
      const r = await api.get("/analytics/counter-narrative", { params });
      setData(r.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [clientId, postId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        Analysing narrative patterns…
      </div>
    );
  }

  if (!data) return null;

  const { urgency, stats, negative_clusters, amplification_keywords, counter_keywords,
    comment_templates, content_angles, overall_strategy, narratives_found, top_topics } = data;

  return (
    <div className="space-y-3">
      {/* Overall Strategy Banner */}
      <div className={`rounded-xl border-2 px-4 py-3 ${URGENCY_STYLE[urgency]}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${URGENCY_TEXT[urgency]}`} />
            <div>
              <span className={`text-xs font-bold uppercase tracking-wider ${URGENCY_TEXT[urgency]}`}>
                {urgency} urgency
              </span>
              <p className="mt-0.5 text-xs text-fg leading-relaxed">{overall_strategy}</p>
            </div>
          </div>
          <button
            onClick={load}
            className="shrink-0 rounded-lg border border-border p-1.5 hover:bg-black/5 dark:hover:bg-white/5"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        {/* Mini stats */}
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {[
            { label: "Neg. Comments", value: stats.negative_comments },
            { label: "Pos. Comments", value: stats.positive_comments },
            { label: "Total Analysed", value: stats.total_analysed },
            { label: "Neg. Ratio", value: `${stats.negative_ratio}%` },
            { label: "Crisis Score", value: `${Math.round(stats.avg_crisis_probability * 100)}%` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-white/60 dark:bg-black/20 px-2 py-1.5 text-center">
              <div className="text-base font-bold tabular-nums">{value}</div>
              <div className="text-[10px] text-muted">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Negative Keyword Clusters */}
      {negative_clusters.length > 0 && (
        <Section icon={TrendingDown} title="Negative Keyword Clusters" defaultOpen>
          <p className="mb-2 text-xs text-muted">Top words driving negative sentiment — size = frequency.</p>
          <div className="flex flex-wrap gap-2">
            {negative_clusters.map((c, i) => {
              const max = negative_clusters[0]?.frequency || 1;
              const pct = c.frequency / max;
              const size = Math.round(11 + pct * 14);
              return (
                <span
                  key={c.keyword}
                  style={{ fontSize: `${size}px`, opacity: 0.5 + pct * 0.5 }}
                  className="cursor-default rounded-full border border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 px-2.5 py-1 font-semibold text-rose-700 dark:text-rose-300"
                  title={`${c.frequency} occurrences`}
                >
                  {c.keyword}
                  <span className="ml-1 text-[10px] font-normal opacity-70">×{c.frequency}</span>
                </span>
              );
            })}
          </div>
        </Section>
      )}

      {/* Counter-Keywords */}
      {counter_keywords.length > 0 && (
        <Section icon={Shield} title="Counter-Keyword Strategy" defaultOpen>
          <p className="mb-3 text-xs text-muted">Replace each negative term with its counter-narrative pivot words.</p>
          <div className="space-y-2">
            {counter_keywords.map((ck) => (
              <div key={ck.against} className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-3">
                <div className="shrink-0">
                  <span className="rounded-full border border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                    ✗ {ck.against}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-muted">→</div>
                <div className="flex flex-wrap gap-1.5">
                  {ck.counter_terms.map((t) => (
                    <span key={t} className="rounded-full border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      ✓ {t}
                    </span>
                  ))}
                </div>
                <p className="w-full text-[11px] text-muted mt-0.5">{ck.strategy}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Positive Amplification Keywords */}
      {amplification_keywords.length > 0 && (
        <Section icon={Zap} title="Positive Amplification Keywords" defaultOpen={false}>
          <p className="mb-2 text-xs text-muted">Words from positive comments — use these to reinforce the pro narrative.</p>
          <div className="flex flex-wrap gap-2">
            {amplification_keywords.map((k) => (
              <span key={k.keyword} className="rounded-full border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {k.keyword}
                <span className="ml-1 opacity-60">×{k.frequency}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Comment Language Templates */}
      {comment_templates.length > 0 && (
        <Section icon={MessageSquare} title="Comment Language Templates" defaultOpen>
          <p className="mb-3 text-xs text-muted">Copy-paste ready responses. Edit the bracketed placeholders before posting.</p>
          <div className="space-y-3">
            {comment_templates.map((tmpl) => (
              <div key={tmpl.type} className="rounded-lg border border-border bg-black/[0.02] dark:bg-white/[0.02] p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-accent">{tmpl.type}</span>
                  <button
                    onClick={() => copy(tmpl.template, tmpl.type)}
                    className="rounded px-2 py-0.5 text-[10px] font-medium border border-border hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    {copied === tmpl.type ? "✓ Copied!" : "Copy"}
                  </button>
                </div>
                <p className="text-xs text-fg leading-relaxed">{tmpl.template}</p>
                <p className="mt-1.5 text-[10px] text-muted italic">Use when: {tmpl.use_when}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Content Strategy Angles */}
      {content_angles.length > 0 && (
        <Section icon={FileText} title="Content Strategy Angles" defaultOpen>
          <p className="mb-3 text-xs text-muted">Tactical content directions based on current sentiment patterns.</p>
          <div className="space-y-3">
            {content_angles.map((a) => (
              <div key={a.angle} className="rounded-lg border border-border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-semibold">{a.angle}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PRIORITY_BADGE[a.priority] || PRIORITY_BADGE.low}`}>
                    {a.priority}
                  </span>
                </div>
                <p className="text-xs text-muted leading-relaxed">{a.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.content_types.map((ct) => (
                    <span key={ct} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">
                      {ct}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Topic Clusters (reference) */}
      {top_topics.length > 0 && (
        <Section icon={Target} title="Topic Clusters Detected" defaultOpen={false}>
          <p className="mb-2 text-xs text-muted">Recurring topics from AI narrative analysis — cross-reference when crafting counter-content.</p>
          <div className="flex flex-wrap gap-2">
            {top_topics.map((t) => (
              <span key={t.topic} className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted">
                {t.topic}
                <span className="ml-1 opacity-50">×{t.count}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Narratives found */}
      {narratives_found.length > 0 && (
        <Section icon={FileText} title="Detected Narratives" defaultOpen={false}>
          <p className="mb-2 text-xs text-muted">Main narratives extracted from post-level AI analysis.</p>
          <ul className="space-y-1.5">
            {narratives_found.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-fg">
                <span className="mt-0.5 shrink-0 text-accent">›</span>
                {n}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
