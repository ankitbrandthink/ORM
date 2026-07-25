"use client";

const COLORS: Record<string, string> = {
  Positive: "#34c759", Negative: "#ff3b30", Neutral: "#8e8e93", Unknown: "#c7c7cc",
};

export function SentimentBar({ counts, height = 8 }: { counts: Record<string, number>; height?: number }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const order = ["Positive", "Neutral", "Negative", "Unknown"];
  return (
    <div className="w-full">
      <div className="flex w-full overflow-hidden rounded-full" style={{ height }}>
        {order.filter((k) => counts[k]).map((k) => (
          <div key={k} title={`${k}: ${counts[k]}`}
            style={{ width: `${(counts[k] / total) * 100}%`, background: COLORS[k] }} />
        ))}
        {total === 1 && Object.keys(counts).length === 0 && (
          <div style={{ width: "100%", background: "var(--border)" }} />
        )}
      </div>
      <div className="mt-1 flex gap-3 text-[11px] text-muted">
        <span className="text-green-500">▲ {counts.Positive || 0}</span>
        <span>● {counts.Neutral || 0}</span>
        <span className="text-red-500">▼ {counts.Negative || 0}</span>
      </div>
    </div>
  );
}
