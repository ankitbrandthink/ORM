"use client";
import { useEffect, useState } from "react";
import {
  Zap, DollarSign, BarChart2, Users, AlertTriangle, RefreshCw,
  TrendingUp, CheckCircle2, XCircle, Loader2, ExternalLink, Trash2, ChevronDown,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";

// ── Types ────────────────────────────────────────────────────────────────────

interface ProviderModel { id: string; name: string; input_price: number; output_price: number; free_daily: number; }
interface Provider { id: string; name: string; get_key_url: string; models: ProviderModel[]; }
interface ActiveConfig { configured: boolean; id?: string; provider?: string; model?: string; is_active?: boolean; is_validated?: boolean; daily_limit?: number; last_validated_at?: string; api_key_hint?: string; }
interface SavedConfig { id: string; provider: string; model: string; is_active: boolean; is_validated: boolean; daily_limit: number; last_validated_at?: string; api_key_hint: string; }
interface DailyPoint { date: string; total_tokens: number; cost_usd: number; items_processed: number; }
interface UsageSummary { period_days: number; model: string; engine_active: boolean; total_tokens: number; total_cost_usd: number; total_items_processed: number; daily_token_limit: number; today_tokens: number; ceiling_pct: number; daily: DailyPoint[]; per_user: { email: string; total_tokens: number; cost_usd: number; items_processed: number; }[]; by_operation: { operation: string; total_tokens: number; cost_usd: number; items: number; }[]; }

// ── Static provider catalog (mirrors backend) ─────────────────────────────

const CATALOG: Provider[] = [
  {
    id: "claude", name: "Anthropic Claude", get_key_url: "https://platform.claude.com/settings/keys",
    models: [
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku — fastest · $0.80/1M", input_price: 0.80, output_price: 4.00,  free_daily: 0 },
      { id: "claude-sonnet-4-6",          name: "Claude Sonnet — smarter · $3/1M",  input_price: 3.00, output_price: 15.00, free_daily: 0 },
    ],
  },
  {
    id: "groq", name: "Groq (Free: 14,400 req/day)", get_key_url: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.1-8b-instant",    name: "Llama 3.1 8B — free 14,400/day",  input_price: 0.05, output_price: 0.08, free_daily: 14400 },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B — smarter",          input_price: 0.59, output_price: 0.79, free_daily: 0 },
    ],
  },
  {
    id: "gemini", name: "Google Gemini (Free: 1,500 req/day)", get_key_url: "https://aistudio.google.com/app/apikey",
    models: [
      { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite — free 1,500/day", input_price: 0.075, output_price: 0.30, free_daily: 1500 },
      { id: "gemini-2.0-flash",      name: "Gemini 2.0 Flash — faster",              input_price: 0.10,  output_price: 0.40, free_daily: 1500 },
    ],
  },
  {
    id: "openai", name: "OpenAI", get_key_url: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini — $0.15/1M",     input_price: 0.15, output_price: 0.60,  free_daily: 0 },
      { id: "gpt-4o",      name: "GPT-4o — powerful · $2.50/1M", input_price: 2.50, output_price: 10.00, free_daily: 0 },
    ],
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StatTile({ icon: Icon, label, value, sub, color = "text-accent" }: { icon: any; label: string; value: string; sub?: string; color?: string; }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className="text-xl font-bold">{value}</div>
        {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-muted/30">
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

function DailySparkline({ data }: { data: DailyPoint[] }) {
  if (!data.length) return null;
  const maxTok = Math.max(...data.map(d => d.total_tokens), 1);
  return (
    <div className="flex items-end gap-0.5 h-12 w-full">
      {data.map(d => {
        const h = Math.max(2, Math.round((d.total_tokens / maxTok) * 48));
        return (
          <div key={d.date} title={`${d.date}: ${d.total_tokens.toLocaleString()} tokens · $${d.cost_usd.toFixed(4)}`}
            className="flex-1 bg-accent/70 rounded-t hover:bg-accent transition-colors cursor-default"
            style={{ height: h }} />
        );
      })}
    </div>
  );
}

// ── Provider Config Panel ─────────────────────────────────────────────────────

function ProviderConfigPanel({ active, configs, onSaved }: { active: ActiveConfig; configs: SavedConfig[]; onSaved: () => void; }) {
  const [selectedProvider, setSelectedProvider] = useState(active.provider ?? "claude");
  const [selectedModel, setSelectedModel] = useState(active.model ?? CATALOG[0].models[0].id);
  const [apiKey, setApiKey] = useState("");
  const [dailyLimit, setDailyLimit] = useState(active.daily_limit ?? 500000);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [validStatus, setValidStatus] = useState<"idle" | "ok" | "fail">("idle");
  const [disconnecting, setDisconnecting] = useState(false);
  const [showForm, setShowForm] = useState(!active.configured);

  const provider = CATALOG.find(p => p.id === selectedProvider) ?? CATALOG[0];
  const model = provider.models.find(m => m.id === selectedModel) ?? provider.models[0];
  const savedFor = (id: string) => configs.find(c => c.provider === id);
  const selectedSaved = savedFor(selectedProvider);

  const handleProviderChange = (id: string) => {
    setSelectedProvider(id);
    const saved = savedFor(id);
    const p = CATALOG.find(x => x.id === id)!;
    setSelectedModel(saved?.model && p.models.some(m => m.id === saved.model) ? saved.model : p.models[0].id);
    setValidStatus("idle");
  };

  const activate = async () => {
    setActivating(true);
    try {
      await api.post("/ai-config/activate", { provider: selectedProvider, model: selectedModel });
      onSaved();
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Failed to switch provider");
    } finally { setActivating(false); }
  };

  const validate = async () => {
    if (!apiKey.trim()) return;
    setValidating(true); setValidStatus("idle");
    try {
      const r = await api.post("/ai-config/validate", { provider: selectedProvider, model: selectedModel, api_key: apiKey, daily_limit: dailyLimit });
      setValidStatus(r.data.valid ? "ok" : "fail");
    } catch { setValidStatus("fail"); }
    finally { setValidating(false); }
  };

  const save = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await api.post("/ai-config/config", { provider: selectedProvider, model: selectedModel, api_key: apiKey, daily_limit: dailyLimit });
      setApiKey(""); setShowForm(false); onSaved();
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Save failed");
    } finally { setSaving(false); }
  };

  const disconnect = async () => {
    if (!confirm("Remove the AI provider connection? Sentiment analysis will fall back to heuristic mode.")) return;
    setDisconnecting(true);
    try { await api.delete("/ai-config/config"); onSaved(); }
    catch { alert("Failed to disconnect"); }
    finally { setDisconnecting(false); }
  };

  return (
    <Card className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold">Sentiment Engine</span>
        </div>
        {active.configured && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {CATALOG.find(p => p.id === active.provider)?.name ?? active.provider} · {active.model?.split("-").slice(0,3).join("-")}
            </span>
            <button onClick={() => setShowForm(v => !v)}
              className="text-xs text-muted hover:text-fg px-2 py-1 rounded-lg border border-border hover:bg-black/5 dark:hover:bg-white/5">
              {showForm ? "Cancel" : "Change"}
            </button>
            <button onClick={disconnect} disabled={disconnecting}
              className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
              {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </button>
          </div>
        )}
      </div>

      {/* Active hint */}
      {active.configured && !showForm && (
        <div className="text-[11px] text-muted">
          API key: {active.api_key_hint} · Daily limit: {active.daily_limit?.toLocaleString()} tokens
          {active.last_validated_at && <> · Last validated: {new Date(active.last_validated_at).toLocaleDateString()}</>}
        </div>
      )}

      {/* Config form */}
      {showForm && (
        <div className="space-y-3 border-t border-border pt-3">
          {/* Provider tabs */}
          <div>
            <label className="block text-xs text-muted mb-1.5">AI Provider</label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {CATALOG.map(p => {
                const saved = savedFor(p.id);
                return (
                  <button key={p.id} onClick={() => handleProviderChange(p.id)}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium text-left transition-colors ${
                      selectedProvider === p.id
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border hover:bg-black/5 dark:hover:bg-white/5"
                    }`}>
                    <span className="flex items-center gap-1.5">
                      {p.id === "claude" && "Anthropic"}
                      {p.id === "groq" && "Groq"}
                      {p.id === "gemini" && "Gemini"}
                      {p.id === "openai" && "OpenAI"}
                      {saved && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                      {saved?.is_active && (
                        <span className="rounded bg-green-600/15 px-1 text-[9px] font-bold text-green-700 dark:text-green-400">ACTIVE</span>
                      )}
                      {!saved && (p.id === "groq" || p.id === "gemini") && (
                        <span className="text-green-600 text-[10px]">FREE</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model select */}
          <div>
            <label className="block text-xs text-muted mb-1.5">Model</label>
            <div className="relative">
              <select value={selectedModel} onChange={e => { setSelectedModel(e.target.value); setValidStatus("idle"); }}
                className="w-full appearance-none rounded-xl border border-border bg-card px-3 py-2 text-sm pr-8">
                {provider.models.map(m => (
                  <option key={m.id} value={m.id}>{m.name}
                    {m.free_daily > 0 ? ` · FREE ${m.free_daily.toLocaleString()}/day` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
            </div>
            {model.free_daily > 0 && (
              <p className="mt-1 text-[11px] text-green-700 dark:text-green-400">
                Free tier: {model.free_daily.toLocaleString()} requests/day — no billing required
              </p>
            )}
            {model.free_daily === 0 && (
              <p className="mt-1 text-[11px] text-muted">
                Pricing: ${model.input_price}/1M input · ${model.output_price}/1M output
              </p>
            )}
          </div>

          {/* Saved-key fast path: switch without re-entering the key */}
          {selectedSaved && (
            <div className="flex items-center justify-between rounded-xl border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/15 px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-xs text-green-800 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4" />
                Key saved ({selectedSaved.api_key_hint})
                {selectedSaved.is_active ? " — currently active" : ""}
              </span>
              {!selectedSaved.is_active && (
                <button onClick={activate} disabled={activating}
                  className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
                  {activating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Use this provider
                </button>
              )}
            </div>
          )}

          {/* API key */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted">
                {selectedSaved ? "Replace API Key (optional)" : "API Key"}
              </label>
              <a href={provider.get_key_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-[11px] text-accent hover:underline">
                Get key <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setValidStatus("idle"); }}
              placeholder={`Paste your ${provider.name} API key here`}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono"
            />
          </div>

          {/* Daily limit */}
          <div>
            <label className="block text-xs text-muted mb-1.5">Daily Token Ceiling</label>
            <select value={dailyLimit} onChange={e => setDailyLimit(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <option value={100000}>100,000 tokens (~$0.08/day)</option>
              <option value={250000}>250,000 tokens (~$0.20/day)</option>
              <option value={500000}>500,000 tokens (~$0.40/day)</option>
              <option value={1000000}>1,000,000 tokens (~$0.80/day)</option>
              <option value={0}>Unlimited (no ceiling)</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={validate} disabled={!apiKey.trim() || validating}
              className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40">
              {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Test Key"}
            </button>

            {validStatus === "ok" && (
              <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" /> Key is valid
              </span>
            )}
            {validStatus === "fail" && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <XCircle className="h-4 w-4" /> Invalid key — check and retry
              </span>
            )}

            <button onClick={save} disabled={!apiKey.trim() || saving}
              className="ml-auto flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-40">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {saving ? "Connecting…" : "Save & Connect"}
            </button>
          </div>
        </div>
      )}

      {/* Not configured state */}
      {!active.configured && !showForm && (
        <button onClick={() => setShowForm(true)}
          className="w-full rounded-xl border-2 border-dashed border-accent/40 py-4 text-sm text-accent hover:bg-accent/5">
          + Connect an AI provider for Claude Haiku, Groq (free), Gemini, or OpenAI
        </button>
      )}
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [active, setActive] = useState<ActiveConfig>({ configured: false });
  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [days, setDays] = useState(30);

  const loadAll = () => {
    setLoadingUsage(true);
    Promise.all([
      api.get(`/usage/summary?days=${days}`),
      api.get("/ai-config/active"),
      api.get("/ai-config/configs"),
    ]).then(([u, a, c]) => {
      setUsage(u.data);
      setActive(a.data);
      setConfigs(c.data ?? []);
    }).catch(() => {}).finally(() => setLoadingUsage(false));
  };

  useEffect(() => { loadAll(); }, [days]); // eslint-disable-line

  const ceilColor = !usage ? "" :
    usage.ceiling_pct >= 90 ? "bg-red-500" :
    usage.ceiling_pct >= 70 ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">AI API Usage & Billing</h1>
          <p className="text-sm text-muted mt-0.5">Token consumption, cost tracking, and AI provider settings.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button onClick={loadAll} disabled={loadingUsage}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loadingUsage ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Provider Config Panel */}
      <ProviderConfigPanel key={`${active.provider}-${configs.length}`} active={active} configs={configs} onSaved={loadAll} />

      {/* Daily ceiling */}
      {usage && usage.daily_token_limit > 0 && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className={`h-4 w-4 ${usage.ceiling_pct >= 90 ? "text-red-500" : usage.ceiling_pct >= 70 ? "text-amber-500" : "text-green-600"}`} />
              Today's Token Budget
            </div>
            <span className={`text-sm font-bold ${usage.ceiling_pct >= 90 ? "text-red-600" : usage.ceiling_pct >= 70 ? "text-amber-600" : "text-green-600"}`}>
              {usage.ceiling_pct}% used
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted/30">
            <div className={`h-full rounded-full transition-all ${ceilColor}`} style={{ width: `${usage.ceiling_pct}%` }} />
          </div>
          <p className="text-[11px] text-muted">
            {usage.today_tokens.toLocaleString()} / {usage.daily_token_limit.toLocaleString()} tokens today
          </p>
        </Card>
      )}

      {/* Stats */}
      {usage && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={Zap} label="Total Tokens" value={usage.total_tokens.toLocaleString()} sub={`last ${usage.period_days} days`} />
          <StatTile icon={DollarSign} label="Total Cost" value={`$${usage.total_cost_usd.toFixed(4)}`} sub="estimated USD" color="text-green-600" />
          <StatTile icon={BarChart2} label="Items Processed" value={usage.total_items_processed.toLocaleString()} sub="comments + posts" color="text-violet-600" />
          <StatTile icon={TrendingUp} label="Cost/1k Items"
            value={usage.total_items_processed > 0 ? `$${(usage.total_cost_usd / usage.total_items_processed * 1000).toFixed(3)}` : "$0.000"}
            sub="avg per 1,000" color="text-sky-600" />
        </div>
      )}

      {/* Daily chart */}
      {usage && usage.daily.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold">Daily Token Usage</span>
          </div>
          <DailySparkline data={usage.daily} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="pb-1 text-left">Date</th>
                  <th className="pb-1 text-right">Tokens</th>
                  <th className="pb-1 text-right">Cost (USD)</th>
                  <th className="pb-1 text-right">Items</th>
                </tr>
              </thead>
              <tbody>
                {[...usage.daily].reverse().slice(0, 14).map(r => (
                  <tr key={r.date} className="border-b border-border/50 hover:bg-black/5 dark:hover:bg-white/5">
                    <td className="py-1.5 text-muted">{r.date}</td>
                    <td className="py-1.5 text-right font-mono">{r.total_tokens.toLocaleString()}</td>
                    <td className="py-1.5 text-right font-mono text-green-700 dark:text-green-400">${r.cost_usd.toFixed(4)}</td>
                    <td className="py-1.5 text-right">{r.items_processed.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Per-user */}
      {usage && usage.per_user.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold">Usage by User</span>
          </div>
          <div className="space-y-2">
            {usage.per_user.map(u => {
              const maxTok = Math.max(...usage.per_user.map(x => x.total_tokens), 1);
              return (
                <div key={u.email} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate max-w-[60%]">{u.email}</span>
                    <span className="text-muted">{u.total_tokens.toLocaleString()} tok · ${u.cost_usd.toFixed(4)}</span>
                  </div>
                  <MiniBar value={u.total_tokens} max={maxTok} />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* By operation */}
      {usage && usage.by_operation.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold">Usage by Operation</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="pb-1 text-left">Operation</th>
                <th className="pb-1 text-right">Tokens</th>
                <th className="pb-1 text-right">Cost</th>
                <th className="pb-1 text-right">Items</th>
              </tr>
            </thead>
            <tbody>
              {usage.by_operation.map(op => (
                <tr key={op.operation} className="border-b border-border/50 hover:bg-black/5 dark:hover:bg-white/5">
                  <td className="py-1.5 font-mono text-muted">{op.operation}</td>
                  <td className="py-1.5 text-right font-mono">{op.total_tokens.toLocaleString()}</td>
                  <td className="py-1.5 text-right font-mono text-green-700 dark:text-green-400">${op.cost_usd.toFixed(4)}</td>
                  <td className="py-1.5 text-right">{op.items.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Empty state */}
      {usage && usage.total_tokens === 0 && active.configured && (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-muted">
          <Zap className="mx-auto mb-3 h-8 w-8 opacity-30" />
          <p className="text-sm font-medium">No usage recorded yet for this period.</p>
          <p className="mt-1 text-xs">Run sentiment analysis on any post to see tokens appear here.</p>
        </div>
      )}

      {loadingUsage && !usage && (
        <div className="py-24 text-center text-muted text-sm">Loading usage data…</div>
      )}
    </div>
  );
}
