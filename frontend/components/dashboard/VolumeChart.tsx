"use client";
/**
 * Sentiment volume chart — stacked bars with equal width regardless of data density.
 * Supports hourly (24 bars), daily (7 or 30 bars), weekly, and monthly granularity.
 */
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, Line,
} from "recharts";

interface VolumePoint {
  date: string;
  Positive: number;
  Negative: number;
  Neutral: number;
}

interface VolumeChartProps {
  data: VolumePoint[];
  title?: string;
  height?: number;
  showLegend?: boolean;
}

const COLORS = { Positive: "#34c759", Neutral: "#8e8e93", Negative: "#ff3b30" };

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = (payload as any[]).reduce((s: number, p: any) => s + (p.value || 0), 0);
  // Also surface the raw ISO date from the first payload entry's data
  const rawDate: string | undefined = payload[0]?.payload?.date;
  let dateDisplay = label as string;
  if (rawDate && /^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
    try {
      dateDisplay = new Date(rawDate + "T00:00:00").toLocaleDateString("en-GB", {
        weekday: "short", day: "numeric", month: "short", year: "numeric",
      });
    } catch { /* keep label */ }
  }
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-xs shadow-lg min-w-[160px]">
      <div className="mb-1.5 font-semibold text-foreground">{dateDisplay}</div>
      {(payload as any[]).filter((p: any) => p.dataKey !== "Total").map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.fill || p.color }} />
          <span className="text-muted">{p.name}:</span>
          <span className="font-medium">{p.value.toLocaleString()}</span>
          <span className="text-muted">({total ? Math.round(p.value * 100 / total) : 0}%)</span>
        </div>
      ))}
      <div className="mt-1.5 border-t border-border pt-1 font-semibold">Total: {total.toLocaleString()}</div>
    </div>
  );
}

/** Format date label based on data density. */
function formatLabel(date: string, _count: number): string {
  // Hourly: "2026-07-04 14:00" → "14:00"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(date)) {
    return date.slice(11, 16);
  }
  // Monthly bucket: "2026-07" → "Jul '26"
  if (/^\d{4}-\d{2}$/.test(date)) {
    const [y, m] = date.split("-");
    return new Date(+y, +m - 1).toLocaleString("en-US", { month: "short" }) + " '" + y.slice(2);
  }
  // Daily/weekly: always show "Jun 27" format for clarity
  const d = new Date(date + "T00:00:00");
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

export function VolumeChart({ data, title = "Comment volume over time", height = 260, showLegend = true }: VolumeChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted">
        No volume data available for the selected period.
      </div>
    );
  }

  const enriched = data.map((d) => ({
    ...d,
    // Short label for X-axis
    label: formatLabel(d.date, data.length),
    Total: d.Positive + d.Negative + d.Neutral,
  }));

  // Smart tick interval: show at most ~10 labels on the axis
  const tickInterval = Math.max(0, Math.ceil(data.length / 10) - 1);

  // Narrow bars when dense, capped so they never stretch too wide
  const maxBarSize = data.length <= 3 ? 60 : data.length <= 7 ? 48 : data.length <= 14 ? 32 : 20;

  const dense = data.length > 20;

  return (
    <div>
      {title && <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{title}</div>}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={enriched}
          margin={{ top: 4, right: 16, left: 8, bottom: dense ? 28 : 8 }}
          barCategoryGap="20%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: dense ? 10 : 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            interval={tickInterval}
            angle={dense ? -35 : 0}
            textAnchor={dense ? "end" : "middle"}
            height={dense ? 44 : 24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={44}
            label={{
              value: "Comments",
              angle: -90,
              position: "insideLeft",
              offset: 4,
              style: { fontSize: 10, fill: "currentColor", opacity: 0.45, textAnchor: "middle" },
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          {showLegend && (
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value) => value === "Total" ? null : value}
            />
          )}
          <Bar dataKey="Positive" stackId="a" fill={COLORS.Positive} maxBarSize={maxBarSize} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Neutral"  stackId="a" fill={COLORS.Neutral}   maxBarSize={maxBarSize} />
          <Bar dataKey="Negative" stackId="a" fill={COLORS.Negative}  maxBarSize={maxBarSize} radius={[3, 3, 0, 0]} />
          <Line
            type="monotone"
            dataKey="Total"
            stroke="#007aff"
            strokeWidth={1.5}
            dot={data.length <= 7 ? { r: 3, fill: "#007aff" } : false}
            strokeDasharray="4 2"
            legendType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
