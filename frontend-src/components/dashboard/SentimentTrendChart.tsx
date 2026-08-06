"use client";
import { useMemo } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { Card } from "@/components/ui/primitives";

interface TrendPoint {
  date: string;
  Positive: number;
  Negative: number;
  Neutral: number;
}

export function SentimentTrendChart({
  data,
  title,
  height = 300,
}: {
  data: TrendPoint[];
  title: string;
  height?: number;
}) {
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    // Format dates for display (YYYY-MM-DD → MMM DD)
    return data.map((d) => {
      const [y, m, day] = d.date.split("-");
      const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(day));
      return {
        ...d,
        displayDate: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };
    });
  }, [data]);

  if (!processedData || processedData.length === 0) {
    return (
      <Card>
        <h3 className="mb-2 text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted">No comment activity yet.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="mb-4 text-sm font-medium">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={processedData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="negGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="neuGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6b7280" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="displayDate" stroke="var(--muted)" style={{ fontSize: "12px" }} />
          <YAxis stroke="var(--muted)" style={{ fontSize: "12px" }} />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: `1px solid var(--border)`,
              borderRadius: "8px",
            }}
            labelStyle={{ color: "var(--fg)" }}
            formatter={(value) => value.toLocaleString()}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Area
            type="monotone"
            dataKey="Positive"
            stroke="#22c55e"
            fillOpacity={1}
            fill="url(#posGrad)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="Negative"
            stroke="#ef4444"
            fillOpacity={1}
            fill="url(#negGrad)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="Neutral"
            stroke="#6b7280"
            fillOpacity={1}
            fill="url(#neuGrad)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
