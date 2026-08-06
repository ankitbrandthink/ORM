"use client";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Trash2, Sparkles, RefreshCw, MessageSquare, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";

const SENT_COLORS: Record<string, string> = {
  Positive: "#34c759", Negative: "#ff3b30", Neutral: "#8e8e93",
};

function MiniDonut({ counts }: { counts: Record<string, number> }) {
  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));
  if (!data.length) return <div className="flex h-36 items-center justify-center text-xs text-muted">No data</div>;
  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2}>
          {data.map((e) => <Cell key={e.name} fill={SENT_COLORS[e.name] || "#c7c7cc"} />)}
        </Pie>
        <Tooltip
          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

interface PostRowProps {
  post: any;
  sentiment: any;
  dateLabel?: string;
  onDelete?: () => void;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function PostRow({ post, sentiment, dateLabel, onDelete }: PostRowProps) {
  const counts: Record<string, number> = sentiment?.counts || {};
  const total: number = sentiment?.total_comments || Object.values(counts).reduce((a: number, b: any) => a + Number(b), 0);
  const avgTox = ((sentiment?.avg_toxicity || 0) * 100).toFixed(0);
  const crisis = ((sentiment?.crisis_probability || 0) * 100).toFixed(0);

  const sampledCount: number = post?.sampled_count ?? 0;
  const realTotal: number = Number(post?.metrics?.real_comment_total || post?.metrics?.comments || 0);
  const isExtrapolated = realTotal > 0 && realTotal > sampledCount && sampledCount > 0;

  // AI Narrative state
  const [narrative, setNarrative] = useState<string | null>(post?.ai_narrative ?? null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);

  // Top comments state
  const [showComments, setShowComments] = useState(false);
  const [topComments, setTopComments] = useState<any[] | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);

  async function loadTopComments() {
    if (topComments !== null) {
      setShowComments((v) => !v);
      return;
    }
    setShowComments(true);
    setCommentsLoading(true);
    try {
      const { data } = await api.get("/comments", {
        params: { post_id: post.id, page_size: 20 },
      });
      const all: any[] = data.items || [];
      // Pick most relevant: up to 3 negative, 2 positive, 1 neutral for a balanced view
      const neg = all.filter((c) => c.sentiment === "Negative").slice(0, 3);
      const pos = all.filter((c) => c.sentiment === "Positive").slice(0, 2);
      const neu = all.filter((c) => c.sentiment === "Neutral").slice(0, 1);
      const selected = [...neg, ...pos, ...neu];
      setTopComments(selected.length > 0 ? selected : all.slice(0, 5));
    } catch {
      setTopComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }

  async function generateNarrative(regenerate = false) {
    setNarrativeLoading(true);
    try {
      const { data } = await api.get(`/posts/${post.id}/narrative`, { params: regenerate ? { regenerate: true } : {} });
      setNarrative(data.narrative || null);
    } catch { /* ignore */ }
    finally { setNarrativeLoading(false); }
  }

  const riskColor = Number(crisis) > 40
    ? "text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200"
    : Number(crisis) > 25
    ? "text-amber-700 bg-amber-50 dark:bg-amber-900/20 border-amber-200"
    : "text-green-700 bg-green-50 dark:bg-green-900/20 border-green-200";

  return (
    <Card className="overflow-hidden p-0">
      {/* 3-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border">

        {/* Col 1 — Post preview */}
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Post preview</span>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium capitalize text-accent">
              {post.source_kind || "facebook"}
            </span>
          </div>
          <p className="text-sm font-semibold leading-snug line-clamp-1">{post.author}</p>
          <p className="text-sm leading-relaxed text-muted line-clamp-3">{post.content}</p>
          {post.published_at && (
            <p className="text-[11px] text-muted">{new Date(post.published_at).toLocaleDateString()}</p>
          )}
          {dateLabel && (
            <p className="text-[11px] italic text-accent">{dateLabel}</p>
          )}
          {post.permalink && (
            <a href={post.permalink} target="_blank" rel="noreferrer"
              className="mt-auto inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent">
              Open post <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Col 2 — Sentiment donut */}
        <div className="flex flex-col gap-1 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Sentiment Overview</span>
          <MiniDonut counts={counts} />
          <div className="flex flex-wrap justify-center gap-3 text-xs">
            {Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: SENT_COLORS[k] || "#ccc" }} />
                {k} ({v})
              </span>
            ))}
          </div>
        </div>

        {/* Col 3 — Breakdown */}
        <div className="flex flex-col gap-2 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Breakdown &amp; filters</span>

          <div className="space-y-1">
            {[
              ["All",      total,              "text-fg"],
              ["Positive", counts.Positive || 0, "text-green-600"],
              ["Negative", counts.Negative || 0, "text-red-500"],
              ["Neutral",  counts.Neutral  || 0, "text-gray-400"],
            ].map(([label, n, color]) => (
              <div key={label as string}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5">
                <span className={`text-sm ${color}`}>{label}</span>
                <span className="text-sm font-semibold">
                  {n as number}
                  <span className="ml-1 text-xs text-muted">
                    ({total ? `${Math.round((n as number) * 100 / total)}%` : "0%"})
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
            {/* Real total from platform */}
            <div className="flex justify-between">
              <span className="text-muted">Total on post</span>
              <b title="Real comment count reported by the platform">{realTotal > 0 ? fmtNum(realTotal) : fmtNum(total)}</b>
            </div>
            {/* Analysed sample */}
            <div className="flex justify-between">
              <span className="text-muted">Analysed</span>
              <b>{sampledCount > 0 ? `${fmtNum(sampledCount)} comments` : "—"}</b>
            </div>
            {isExtrapolated && (
              <div className="rounded bg-amber-50 dark:bg-amber-900/20 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-400">
                Sentiment from {sampledCount}-comment sample · click post for full fetch
              </div>
            )}
            <div className="flex justify-between"><span className="text-muted">Avg toxicity</span><b>{avgTox}%</b></div>
            <div className="flex justify-between">
              <span className="text-muted">Crisis prob.</span>
              <b className={Number(crisis) > 25 ? "text-red-600" : ""}>{crisis}%</b>
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Narrative section ── */}
      <div className="border-t border-border bg-gradient-to-r from-accent/5 to-transparent px-4 py-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">AI Narrative</span>
              {narrative && !narrativeLoading && (
                <button
                  onClick={() => generateNarrative(true)}
                  className="flex items-center gap-0.5 text-[10px] text-muted hover:text-accent transition-colors"
                  title="Regenerate narrative"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </button>
              )}
            </div>
            {narrativeLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Generating narrative from {sampledCount || total} comments…
              </div>
            ) : narrative ? (
              <div className="space-y-1">
                {narrative.split("\n\n").map((para, i) => (
                  <p key={i} className={`text-xs leading-relaxed ${
                    i === 0 ? "text-fg line-clamp-2" :
                    para.startsWith("Reputation risk") ? `font-semibold rounded px-1.5 py-0.5 border text-[11px] w-fit ${riskColor}` :
                    "text-muted"
                  }`}>
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              <button
                onClick={() => generateNarrative(false)}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                Generate AI narrative from comments
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Top Comments section ── */}
      <div className="border-t border-border px-4 py-3">
        <button
          onClick={loadTopComments}
          className="flex items-center gap-2 text-xs font-medium text-muted hover:text-fg transition-colors"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {showComments ? "Hide" : "Top comments"}
          {total > 0 && (
            <span className="rounded-full bg-border px-1.5 py-0.5 text-[10px] font-semibold">
              {total}
            </span>
          )}
          {commentsLoading
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : showComments
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />}
        </button>

        {showComments && topComments && topComments.length > 0 && (
          <div className="mt-3 space-y-2">
            {topComments.map((c, i) => (
              <div key={c.id || i} className="flex gap-2 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] p-2.5">
                <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  c.sentiment === "Positive" ? "bg-green-500" :
                  c.sentiment === "Negative" ? "bg-red-500" :
                  "bg-gray-400"
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                    {c.author && (
                      <span className="text-[10px] font-medium text-muted">{c.author}</span>
                    )}
                    <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${
                      c.sentiment === "Positive"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : c.sentiment === "Negative"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {c.sentiment || "Unknown"}
                    </span>
                    {c.toxicity_score > 0.4 && (
                      <span className="rounded px-1 py-0.5 text-[10px] font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        Toxic {Math.round(c.toxicity_score * 100)}%
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-xs leading-relaxed text-fg">{c.content}</p>
                </div>
              </div>
            ))}
            <Link
              href={`/listening/${post.id}`}
              className="mt-1 inline-block text-[11px] text-accent hover:underline"
            >
              View all {total} comments →
            </Link>
          </div>
        )}

        {showComments && topComments && topComments.length === 0 && (
          <p className="mt-2 text-xs text-muted">No comments found for this post.</p>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="flex items-center justify-between border-t border-border bg-black/2 px-4 py-2 dark:bg-white/2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted">
            {sampledCount > 0
              ? `${fmtNum(sampledCount)} analysed${realTotal > sampledCount ? ` / ${fmtNum(realTotal)} total on platform` : ""}`
              : `${fmtNum(total)} comments`}
          </span>
          {onDelete && (
            <button
              onClick={onDelete}
              title="Delete this post and all its comments"
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          )}
        </div>
        <Link href={`/listening/${post.id}`}
          className="rounded-xl bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent/90">
          View full sentiment report →
        </Link>
      </div>
    </Card>
  );
}
