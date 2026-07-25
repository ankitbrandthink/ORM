"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { Newspaper, Share2, Tv2 } from "lucide-react";

interface SourceBreakdownProps {
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
}

const SENTIMENT_COLORS = {
  Positive: "#34c759",
  Negative: "#ff3b30",
  Neutral: "#8e8e93",
};

const CATEGORY_ICONS: Record<string, any> = {
  social: Share2,
  press: Newspaper,
  other: Tv2,
};

function CategoryBadge({ category }: { category: string }) {
  const Icon = CATEGORY_ICONS[category] || Tv2;
  const colors: Record<string, string> = {
    social: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400",
    press: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
    other: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${colors[category] || colors.other}`}>
      <Icon className="h-2.5 w-2.5" />
      {category}
    </span>
  );
}

export function SourceBreakdownChart({ clientId, dateFrom, dateTo }: SourceBreakdownProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    const params: Record<string, string> = { client_id: clientId };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    api.get("/analytics/source-breakdown", { params })
      .then((r) => setData(r.data?.breakdown || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [clientId, dateFrom, dateTo]);

  if (!clientId) return null;

  if (loading) {
    return (
      <div className="flex h-36 items-center justify-center text-sm text-muted">
        Loading source breakdown…
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex h-36 items-center justify-center text-sm text-muted">
        No press or social data yet — add sources in Press Sources admin.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.label,
    Positive: d.sentiment.Positive,
    Negative: d.sentiment.Negative,
    Neutral: d.sentiment.Neutral,
    posts: d.post_count,
    category: d.category,
    source_kind: d.source_kind,
  }));

  const hasPress = data.some((d) => d.category === "press");

  return (
    <div className="space-y-3">
      {/* Legend row */}
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        {["Positive", "Negative", "Neutral"].map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full inline-block"
              style={{ background: SENTIMENT_COLORS[s as keyof typeof SENTIMENT_COLORS] }} />
            {s}
          </span>
        ))}
        <span className="ml-auto text-muted">by source type</span>
      </div>

      {/* Bar chart */}
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10 }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={48}
          />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number, name: string, props: any) => [
              value,
              name,
            ]}
          />
          <Bar dataKey="Positive" stackId="a" fill={SENTIMENT_COLORS.Positive} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Negative" stackId="a" fill={SENTIMENT_COLORS.Negative} />
          <Bar dataKey="Neutral" stackId="a" fill={SENTIMENT_COLORS.Neutral} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Source table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="border-b border-border bg-black/2 dark:bg-white/2">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted">Source</th>
              <th className="px-3 py-2 text-left font-medium text-muted">Type</th>
              <th className="px-3 py-2 text-right font-medium text-muted">Posts / Articles</th>
              <th className="px-3 py-2 text-right font-medium text-muted">Comments Analysed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((row) => {
              const total = row.sentiment.Positive + row.sentiment.Negative + row.sentiment.Neutral;
              return (
                <tr key={row.source_kind} className="hover:bg-black/2 dark:hover:bg-white/2">
                  <td className="px-3 py-2 font-medium">{row.label}</td>
                  <td className="px-3 py-2">
                    <CategoryBadge category={row.category} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.post_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!hasPress && (
        <p className="text-[11px] text-muted italic">
          No press sources configured yet.{" "}
          <a href="/admin/press-sources" className="text-accent underline">Add press sources →</a>
        </p>
      )}
    </div>
  );
}
