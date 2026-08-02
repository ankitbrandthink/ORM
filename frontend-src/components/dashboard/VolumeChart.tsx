"use client";
/**
 * WhatsApp-style sentiment volume chart.
 * Shows comment volume over time, stacked and color-coded by sentiment.
 */
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, Cell, Line,
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
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-xs shadow-lg">
      <div className="mb-1.5 font-semibold">{label}</div>
      {(payload as any[]).map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.fill || p.color }} />
          <span className="text-muted">{p.name}:</span>
          <span className="font-medium">{p.value}</span>
          <span className="text-muted">({total ? Math.round(p.value * 100 / total) : 0}%)</span>
        </div>
      ))}
      <div className="mt-1.5 border-t border-border pt-1 font-semibold">Total: {total}</div>
    </div>
  );
}

function CustomLabel({ x, y, width, value }: any) {
  if (!value || value < 3) return null;
  return (
    <text x={x + width / 2} y={y + 12} fill="#fff" textAnchor="middle" fontSize={10} fontWeight={600}>
      {value}
    </text>
  );
}

export function VolumeChart({ data, title = "Comment volume over time", height = 260, showLegend = true }: VolumeChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted">
        No volume data available
      </div>
    );
  }

  // Add total line data
  const enriched = data.map((d) => ({ ...d, Total: d.Positive + d.Negative + d.Neutral }));

  return (
    <div>
      {title && <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{title}</div>}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={enriched} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={32}
          />
          <Tooltip content={<CustomTooltip />} />
          {showLegend && (
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
          )}
          <Bar dataKey="Positive" stackId="a" fill={COLORS.Positive} radius={[0, 0, 0, 0]}>
            <CustomLabel />
          </Bar>
          <Bar dataKey="Neutral" stackId="a" fill={COLORS.Neutral}>
            <CustomLabel />
          </Bar>
          <Bar dataKey="Negative" stackId="a" fill={COLORS.Negative} radius={[3, 3, 0, 0]}>
            <CustomLabel />
          </Bar>
          <Line
            type="monotone"
            dataKey="Total"
            stroke="#007aff"
            strokeWidth={2}
            dot={{ r: 3, fill: "#007aff" }}
            strokeDasharray="4 2"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
