"use client";
import { useEffect, useState } from "react";
import {
  CreditCard, RefreshCw, Zap, TrendingUp, Users, Layers,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button } from "@/components/ui/primitives";

function fmt(n: number, dec = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const OP_LABELS: Record<string, string> = {
  sentiment_analysis: "Sentiment Analysis",
  report_generation: "Report Generation",
  narrative_briefing: "Narrative Briefing",
  training: "Model Training",
};

export default function BillingPage() {
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);

  function load(d = days) {
    setLoading(true);
    api.get("/usage/summary", { params: { days: d } })
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(days); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const dailyMax = data ? Math.max(...(data.daily || []).map((r: any) => r.total_tokens), 1) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-accent" /> API Usage &amp; Billing
          </h1>
          <p className="text-sm text-muted">Claude API token consumption and estimated cost for your workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <Button variant="ghost" onClick={() => load(days)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted">
          <RefreshCw className="h-5 w-5 animate-spin" /><span className="text-sm">Loading usage…</span>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <div className="flex items-center gap-2 text-xs text-muted"><Zap className="h-4 w-4 text-yellow-500" />Total Tokens Used</div>
              <div className="mt-1 text-3xl font-semibold">{fmtK(data.total_tokens)}</div>
              <p className="text-xs text-muted mt-1">Last {data.period_days} days</p>
            </Card>
            <Card>
              <div className="flex items-center gap-2 text-xs text-muted"><CreditCard className="h-4 w-4 text-green-500" />Estimated Cost</div>
              <div className="mt-1 text-3xl font-semibold text-green-600">${fmt(data.total_cost_usd)}</div>
              <p className="text-xs text-muted mt-1">USD</p>
            </Card>
            <Card>
              <div className="flex items-center gap-2 text-xs text-muted"><TrendingUp className="h-4 w-4 text-blue-500" />Items Processed</div>
              <div className="mt-1 text-3xl font-semibold">{fmtK(data.total_items_processed)}</div>
              <p className="text-xs text-muted mt-1">Comments &amp; posts</p>
            </Card>
            <Card>
              <div className="flex items-center gap-2 text-xs text-muted">
                <AlertTriangle className={`h-4 w-4 ${data.ceiling_pct > 80 ? "text-red-500" : "text-orange-400"}`} />
                Today&apos;s Daily Cap
              </div>
              <div className={`mt-1 text-3xl font-semibold ${data.ceiling_pct > 80 ? "text-red-500" : data.ceiling_pct > 50 ? "text-orange-500" : "text-fg"}`}>
                {data.ceiling_pct}%
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div className={`h-full rounded-full transition-all ${data.ceiling_pct > 80 ? "bg-red-500" : data.ceiling_pct > 50 ? "bg-orange-400" : "bg-accent"}`}
                  style={{ width: `${Math.min(data.ceiling_pct, 100)}%` }} />
              </div>
              <p className="text-xs text-muted mt-1">{fmtK(data.today_tokens)} / {fmtK(data.daily_token_limit)} tokens</p>
            </Card>
          </div>

          {data.daily?.length > 0 && (
            <Card>
              <h3 className="mb-4 text-sm font-semibold">Daily Token Usage</h3>
              <div className="flex items-end gap-1 h-32">
                {data.daily.map((d: any) => {
                  const pct = Math.round((d.total_tokens / dailyMax) * 100);
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group"
                      title={`${d.date}: ${fmtK(d.total_tokens)} tokens • $${fmt(d.cost_usd)}`}>
                      <div className="w-full rounded-sm bg-accent transition-all" style={{ height: `${Math.max(pct, 2)}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted">
                <span>{data.daily[0]?.date}</span>
                <span>{data.daily[data.daily.length - 1]?.date}</span>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.per_user?.length > 0 && (
              <Card>
                <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted" /> Usage by User
                </h3>
                <div className="space-y-2">
                  {data.per_user.map((u: any) => (
                    <div key={u.user_id || u.email} className="flex items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{u.email}</div>
                        <div className="text-xs text-muted">{fmtK(u.items_processed)} items</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-medium">{fmtK(u.total_tokens)}</div>
                        <div className="text-xs text-green-600">${fmt(u.cost_usd)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {data.by_operation?.length > 0 && (
              <Card>
                <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted" /> Usage by Operation
                </h3>
                <div className="space-y-2">
                  {data.by_operation.map((op: any) => {
                    const label = OP_LABELS[op.operation] || op.operation;
                    return (
                      <div key={op.operation} className="flex items-center gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{label}</div>
                          <div className="text-xs text-muted">{fmtK(op.items)} items</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-medium">{fmtK(op.total_tokens)}</div>
                          <div className="text-xs text-green-600">${fmt(op.cost_usd)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card/40 px-4 py-3 text-xs text-muted flex items-center justify-between gap-4">
            <span>
              <span className="font-semibold text-fg">AI Model: </span>{data.model || "claude-3-5-haiku"}
              {" · "}
              <span className={data.engine_active ? "text-green-600 font-medium" : "text-red-500 font-medium"}>
                {data.engine_active ? "Engine active" : "Engine inactive — API key missing"}
              </span>
              {" · "}Cost estimate is approximate based on public Claude pricing.
            </span>
            <a href="/admin/settings/ai-models" className="shrink-0 text-accent hover:underline font-medium">
              Switch model →
            </a>
          </div>
        </>
      )}
    </div>
  );
}
