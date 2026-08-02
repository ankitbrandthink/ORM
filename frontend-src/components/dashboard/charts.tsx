"use client";
import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, BarChart, Bar, CartesianGrid, Legend, ComposedChart,
} from "recharts";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/primitives";
import { api } from "@/lib/api";

const SENT_COLORS: Record<string, string> = {
  Positive: "#34c759", Negative: "#ff3b30", Neutral: "#8e8e93", Unknown: "#c7c7cc",
};

const EMOTION_COLORS: Record<string, string> = {
  Anger: "#ff3b30", Joy: "#34c759", Hope: "#5ac8fa", Confusion: "#ff9500",
  Mockery: "#af52de", Fear: "#ff6b00", Frustration: "#ff453a",
  Sadness: "#636e72", Surprise: "#0071E3", Disgust: "#8e44ad",
};

function sentimentInsight(data: Record<string, number>): string {
  const pos = data.Positive || 0;
  const neg = data.Negative || 0;
  const neu = data.Neutral || 0;
  const total = pos + neg + neu || 1;
  const posPct = Math.round(pos * 100 / total);
  const negPct = Math.round(neg * 100 / total);
  if (posPct >= 60) return `Strong positive sentiment — ${posPct}% of audience reactions are supportive.`;
  if (negPct >= 50) return `High negative sentiment — ${negPct}% of comments show criticism or concern.`;
  if (negPct >= 30) return `Mixed reactions — ${negPct}% negative and ${posPct}% positive. Monitor closely.`;
  return `Broadly neutral audience — ${posPct}% positive with ${negPct}% negative engagement.`;
}

export function KPICard({ label, value, trend }: { label: string; value: string | number; trend?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card>
        <div className="text-xs text-muted">{label}</div>
        <div className="mt-1 text-[32px] font-semibold leading-none">{value}</div>
        {trend && <div className="mt-1 text-xs text-accent">{trend}</div>}
      </Card>
    </motion.div>
  );
}

export function SentimentDonut({ data, className }: { data: Record<string, number>; className?: string }) {
  const chart = Object.entries(data).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  const total = chart.reduce((a, b) => a + b.value, 0) || 1;
  const insight = sentimentInsight(data);

  return (
    <Card className={className}>
      <h3 className="mb-1 text-sm font-semibold">Sentiment Overview</h3>
      <p className="mb-2 text-xs text-muted">{insight}</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={chart} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
            {chart.map((e) => <Cell key={e.name} fill={SENT_COLORS[e.name] || "#0071E3"} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number, name: string) => [`${v.toLocaleString()} (${Math.round(v * 100 / total)}%)`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 text-xs">
        {chart.map((e) => {
          const pct = Math.round(e.value * 100 / total);
          return (
            <span key={e.name} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SENT_COLORS[e.name] || "#0071E3" }} />
              <span className="font-medium">{e.name}</span>
              <span className="text-muted">{e.value.toLocaleString()} · {pct}%</span>
            </span>
          );
        })}
      </div>
    </Card>
  );
}

export function TrendLine({ data }: { data: any[] }) {
  const total = data.reduce((s, d) => s + (d.Positive || 0) + (d.Negative || 0) + (d.Neutral || 0), 0);
  const peakDate = data.reduce((best, d) => {
    const v = (d.Positive || 0) + (d.Negative || 0) + (d.Neutral || 0);
    return v > (best.val || 0) ? { date: d.date, val: v } : best;
  }, {} as any);

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold">Sentiment Trend</h3>
      <p className="mb-2 text-xs text-muted">
        {total > 0
          ? `${total.toLocaleString()} total comments over time${peakDate.date ? ` · peak activity on ${peakDate.date}` : ""}.`
          : "Daily comment volume split by sentiment."}
      </p>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" fontSize={10} tick={{ fill: "var(--muted)" }}
            label={{ value: "Date", position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--muted)" }}
            tickFormatter={(v: string) => v?.slice(5) || v} />
          <YAxis fontSize={10} tick={{ fill: "var(--muted)" }} width={38}
            label={{ value: "Comments", angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: "var(--muted)" }} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(l) => `Date: ${l}`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="Positive" stroke="#34c759" dot={false} strokeWidth={2} name="Positive" />
          <Line type="monotone" dataKey="Negative" stroke="#ff3b30" dot={false} strokeWidth={2} name="Negative" />
          <Line type="monotone" dataKey="Neutral" stroke="#8e8e93" dot={false} strokeWidth={1.5} name="Neutral" />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function EmotionBar({ data }: { data: Record<string, number> }) {
  const chart = Object.entries(data)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));
  const total = chart.reduce((s, d) => s + d.value, 0) || 1;
  const topEmotion = chart[0];
  const topPct = topEmotion ? Math.round(topEmotion.value * 100 / total) : 0;

  const emotionInsight = topEmotion
    ? `Dominant emotion: ${topEmotion.name} (${topPct}% of reactions). ${
        topEmotion.name === "Anger" || topEmotion.name === "Frustration"
          ? "High anger signals — consider proactive response."
          : topEmotion.name === "Joy" || topEmotion.name === "Hope"
          ? "Positive emotional engagement from the audience."
          : "Mixed emotional signals across the audience."
      }`
    : "Emotion distribution across all analysed comments.";

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold">Emotion Breakdown</h3>
      <p className="mb-2 text-xs text-muted">{emotionInsight}</p>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={chart} margin={{ left: 0, right: 8, top: 4, bottom: 18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" fontSize={10} tick={{ fill: "var(--muted)" }}
            label={{ value: "Emotion", position: "insideBottom", offset: -10, fontSize: 10, fill: "var(--muted)" }} />
          <YAxis fontSize={10} tick={{ fill: "var(--muted)" }} width={42}
            label={{ value: "Count", angle: -90, position: "insideLeft", offset: 12, fontSize: 10, fill: "var(--muted)" }} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number, name: string) => [`${v.toLocaleString()} (${Math.round(v * 100 / total)}%)`, name]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Comments">
            {chart.map((entry) => (
              <Cell key={entry.name} fill={EMOTION_COLORS[entry.name] || "#0071E3"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
        {chart.slice(0, 6).map((e) => (
          <span key={e.name} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: EMOTION_COLORS[e.name] || "#0071E3" }} />
            {e.name} <span className="text-muted">{Math.round(e.value * 100 / total)}%</span>
          </span>
        ))}
      </div>
    </Card>
  );
}

export function CrisisScore({ score, level }: { score: number; level: string }) {
  const color = level === "High" ? "#ff3b30" : level === "Medium" ? "#ff9500" : "#34c759";
  return (
    <Card>
      <h3 className="mb-2 text-sm font-medium">Crisis Score</h3>
      <div className="flex items-end gap-3">
        <div className="text-[32px] font-semibold" style={{ color }}>{(score * 100).toFixed(0)}</div>
        <div className="mb-1 text-sm" style={{ color }}>{level} risk</div>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-border">
        <div className="h-2 rounded-full" style={{ width: `${score * 100}%`, background: color }} />
      </div>
    </Card>
  );
}

export function CommentVolumeChart({
  clientId, clientName,
}: { clientId: string; clientName: string }) {
  const [gran, setGran] = useState<"daily" | "weekly" | "monthly">("daily");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const days = gran === "daily" ? 7 : gran === "weekly" ? 30 : 90;

  useEffect(() => {
    if (!clientId) return;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setLoading(true);
    api.get("/analytics/volume-by-client", {
      params: {
        client_id: clientId,
        date_from: from.toISOString().slice(0, 10),
        date_to:   to.toISOString().slice(0, 10),
        granularity: gran,
      },
    }).then((r) => {
      const clients: any[] = r.data.clients || [];
      const raw = clients[0]?.trend || [];
      setData(raw.map((d: any) => ({
        ...d,
        Total: (d.Positive || 0) + (d.Negative || 0) + (d.Neutral || 0),
      })));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [clientId, gran, days]);

  const total   = data.reduce((s, d) => s + (d.Total || 0), 0);
  const peakDay = data.reduce((b: any, d) => (d.Total || 0) > (b?.Total || 0) ? d : b, null as any);
  const xLabel  = gran === "daily" ? "Day" : gran === "weekly" ? "Week" : "Month";

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Comment Volume Overview</h3>
          <p className="mt-0.5 text-[11px] text-muted">
            {clientName
              ? `${clientName} · ${total.toLocaleString()} comments${peakDay ? ` · peak ${peakDay.date}` : ""}`
              : "Daily / weekly / monthly comment volume by sentiment"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {(["daily", "weekly", "monthly"] as const).map((g) => (
            <button key={g} onClick={() => setGran(g)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors capitalize ${
                gran === g
                  ? "bg-accent text-white"
                  : "border border-border text-muted hover:text-fg"
              }`}>
              {g === "daily" ? "Daily" : g === "weekly" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-[230px] items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-[230px] items-center justify-center text-sm text-muted">
          No comment data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" fontSize={10} tick={{ fill: "var(--muted)" }}
              tickFormatter={(v: string) => v?.slice(5) || v}
              label={{ value: xLabel, position: "insideBottom", offset: -10, fontSize: 10, fill: "var(--muted)" }} />
            <YAxis fontSize={10} tick={{ fill: "var(--muted)" }} width={38}
              label={{ value: "Comments", angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: "var(--muted)" }} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(l) => `Period: ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Positive" stackId="s" fill="#34c759" name="Positive" />
            <Bar dataKey="Neutral"  stackId="s" fill="#8e8e93" name="Neutral" />
            <Bar dataKey="Negative" stackId="s" fill="#ff3b30" name="Negative" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="Total" stroke="#0071E3" strokeWidth={2}
              strokeDasharray="5 5" dot={{ r: 3, fill: "#0071E3" }} name="Total" />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      <p className="mt-1 text-[10px] text-muted">
        {gran === "daily" ? "Daily (last 7 days)" : gran === "weekly" ? "Weekly (last 30 days)" : "Monthly (last 90 days)"} comment volume —
        stacked bars show Positive / Neutral / Negative split; dashed blue line = total.
      </p>
    </Card>
  );
}
