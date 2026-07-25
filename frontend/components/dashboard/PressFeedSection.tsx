"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { ExternalLink, RefreshCw, Newspaper, Rss, Youtube, ChevronDown } from "lucide-react";

interface Article {
  id: string;
  title: string;
  content: string;
  url: string;
  author: string;
  source_kind: string;
  source_name: string;
  leaning: string;
  domestic: boolean;
  published_at: string | null;
  sentiment: string;
  crisis_probability: number;
  main_narrative: string;
}

const SENTIMENT_BADGE: Record<string, string> = {
  Positive: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Negative: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  Neutral: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
};

const LEANING_BADGE: Record<string, string> = {
  friendly: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  hostile: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  independent: "bg-gray-50 text-gray-600 dark:bg-white/5 dark:text-gray-400",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function PressFeedSection({ clientId }: { clientId: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 10;

  const load = useCallback(async (off: number = 0) => {
    if (!clientId) return;
    setLoading(true);
    try {
      const r = await api.get("/analytics/press-feed", {
        params: { client_id: clientId, limit: LIMIT, offset: off },
      });
      if (off === 0) {
        setArticles(r.data.articles || []);
      } else {
        setArticles((prev) => [...prev, ...(r.data.articles || [])]);
      }
      setTotal(r.data.total || 0);
      setOffset(off);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    setArticles([]);
    setOffset(0);
    load(0);
  }, [load]);

  if (!clientId) return null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">
            {total} press article{total !== 1 ? "s" : ""} ingested from RSS feeds and YouTube channels.
          </p>
        </div>
        <button
          onClick={() => load(0)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {articles.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted">
          <Newspaper className="h-8 w-8 opacity-30" />
          <p>No press articles yet.</p>
          <p className="text-xs">Add an RSS feed or YouTube channel in <strong>Press Sources</strong> and run ingestion.</p>
        </div>
      )}

      <div className="space-y-3">
        {articles.map((a) => (
          <div key={a.id} className="rounded-xl border border-border bg-card/60 p-4 hover:border-accent/40 transition-colors">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  {a.source_kind === "youtube_channel_video" ? (
                    <Youtube className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  ) : (
                    <Rss className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                  )}
                  <span className="text-xs text-muted font-medium">{a.source_name || a.author}</span>
                  <span className="text-muted opacity-40">·</span>
                  <span className="text-xs text-muted">{formatDate(a.published_at)}</span>
                </div>
                <h4 className="text-sm font-semibold text-fg leading-snug">{a.title}</h4>
                {a.main_narrative && (
                  <p className="mt-1 text-xs text-muted line-clamp-2">{a.main_narrative}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SENTIMENT_BADGE[a.sentiment] || SENTIMENT_BADGE.Neutral}`}>
                  {a.sentiment}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${LEANING_BADGE[a.leaning] || LEANING_BADGE.independent}`}>
                  {a.leaning}
                </span>
                {a.crisis_probability > 0.4 && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    ⚠ Crisis {Math.round(a.crisis_probability * 100)}%
                  </span>
                )}
                {a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[10px] hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    Open
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Loading articles…
        </div>
      )}

      {!loading && articles.length > 0 && articles.length < total && (
        <button
          onClick={() => load(offset + LIMIT)}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
        >
          <ChevronDown className="h-4 w-4" />
          Load more ({total - articles.length} remaining)
        </button>
      )}
    </div>
  );
}
