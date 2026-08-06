"use client";
import { useEffect, useState } from "react";
import {
  Brain, CheckCircle2, XCircle, RefreshCw, Eye, EyeOff,
  ExternalLink, ChevronDown, ChevronUp, Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const PROVIDER_LOGOS: Record<string, string> = {
  claude:  "🟠",
  groq:    "⚡",
  gemini:  "💠",
  openai:  "🟢",
};

const PROVIDER_DESC: Record<string, string> = {
  claude:  "Anthropic Claude — best reasoning, highest accuracy for sentiment.",
  groq:    "Groq (Llama) — ultra-fast, generous free tier (14,400 req/day).",
  gemini:  "Google Gemini — large free tier (1,500 req/day), multilingual.",
  openai:  "OpenAI GPT-4o — battle-tested, broad language support.",
};

export default function AIModelsPage() {
  const [catalog, setCatalog]   = useState<any[]>([]);
  const [configs, setConfigs]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState("");
  const [activating, setActivating] = useState("");
  const [expanded, setExpanded] = useState<string>("");

  const [forms, setForms] = useState<Record<string, { key: string; model: string; showKey: boolean }>>({});

  async function load() {
    setLoading(true);
    try {
      const [cat, cfg] = await Promise.all([
        api.get("/ai-config/providers"),
        api.get("/ai-config/configs"),
      ]);
      setCatalog(cat.data || []);
      setConfigs(cfg.data || []);
      const init: Record<string, { key: string; model: string; showKey: boolean }> = {};
      for (const p of (cat.data || [])) {
        const saved = (cfg.data || []).find((c: any) => c.provider === p.id);
        init[p.id] = {
          key: "",
          model: saved?.model || p.models?.[0]?.id || "",
          showKey: false,
        };
      }
      setForms(init);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function savedConfig(providerId: string) {
    return configs.find((c) => c.provider === providerId);
  }

  async function activate(providerId: string, model?: string) {
    setActivating(providerId);
    try {
      await api.post("/ai-config/activate", { provider: providerId, model: model || "" });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Could not activate provider.");
    } finally { setActivating(""); }
  }

  async function saveKey(providerId: string) {
    const f = forms[providerId];
    if (!f?.key?.trim()) { alert("Enter an API key first."); return; }
    setSaving(providerId);
    try {
      await api.post("/ai-config/config", {
        provider: providerId,
        model: f.model,
        api_key: f.key.trim(),
        daily_limit: 500_000,
      });
      setForms((prev) => ({ ...prev, [providerId]: { ...prev[providerId], key: "" } }));
      await load();
      setExpanded("");
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Validation failed — check the key.");
    } finally { setSaving(""); }
  }

  async function removeProvider(providerId: string) {
    if (!confirm(`Disconnect ${providerId}?`)) return;
    await api.delete(`/ai-config/config?provider=${providerId}`).catch(() => {});
    await load();
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-muted gap-2">
      <RefreshCw className="h-5 w-5 animate-spin" /><span className="text-sm">Loading…</span>
    </div>
  );

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Brain className="h-6 w-6 text-accent" /> AI Model Connections
        </h1>
        <p className="text-sm text-muted mt-0.5">
          Connect up to 4 AI providers. Only one is active at a time — switch instantly without re-entering keys.
        </p>
      </div>

      <div className="space-y-3">
        {catalog.map((p) => {
          const saved = savedConfig(p.id);
          const isActive = saved?.is_active;
          const isConnected = !!saved;
          const form = forms[p.id] || { key: "", model: p.models?.[0]?.id || "", showKey: false };
          const isExpanded = expanded === p.id;

          return (
            <Card key={p.id} className="p-0 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-2xl">{PROVIDER_LOGOS[p.id] || "🤖"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{p.name}</span>
                    {isActive && (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]">
                        <Sparkles className="h-2.5 w-2.5 mr-1" /> Active
                      </Badge>
                    )}
                    {isConnected && !isActive && (
                      <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 text-[10px]">Connected</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted">{PROVIDER_DESC[p.id] || ""}</p>
                  {saved?.api_key_hint && (
                    <p className="text-[11px] text-muted mt-0.5 font-mono">Key: {saved.api_key_hint}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isConnected && !isActive && (
                    <Button onClick={() => activate(p.id, form.model)} disabled={activating === p.id}
                      className="text-xs px-3 py-1.5">
                      {activating === p.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Use this"}
                    </Button>
                  )}
                  {isConnected && (
                    <button onClick={() => removeProvider(p.id)}
                      className="text-xs text-red-500 hover:bg-red-500/10 rounded-lg px-2 py-1.5 transition-colors">
                      Remove
                    </button>
                  )}
                  <button onClick={() => setExpanded(isExpanded ? "" : p.id)}
                    className="text-muted hover:text-fg p-1.5 transition-colors">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border px-4 py-4 space-y-3 bg-card/50">
                  <div>
                    <label className="block text-xs font-medium mb-1">Model</label>
                    <select
                      value={form.model}
                      onChange={(e) => setForms((prev) => ({ ...prev, [p.id]: { ...prev[p.id], model: e.target.value } }))}
                      className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                      {p.models?.map((m: any) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium">API Key</label>
                      <a href={p.get_key_url} target="_blank" rel="noreferrer"
                        className="text-[11px] text-accent hover:underline flex items-center gap-1">
                        Get key <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={form.showKey ? "text" : "password"}
                        value={form.key}
                        onChange={(e) => setForms((prev) => ({ ...prev, [p.id]: { ...prev[p.id], key: e.target.value } }))}
                        placeholder={isConnected ? "Enter new key to update…" : "Paste your API key…"}
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 pr-10 text-sm font-mono"
                      />
                      <button type="button"
                        onClick={() => setForms((prev) => ({ ...prev, [p.id]: { ...prev[p.id], showKey: !prev[p.id]?.showKey } }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg">
                        {form.showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button onClick={() => saveKey(p.id)} disabled={saving === p.id || !form.key.trim()}
                    className="flex items-center gap-1.5 text-sm">
                    {saving === p.id ? (
                      <><RefreshCw className="h-4 w-4 animate-spin" /> Validating…</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4" /> {isConnected ? "Update & activate" : "Connect & activate"}</>
                    )}
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted">
        Keys are encrypted at rest. Only one provider is used for sentiment analysis at a time.
      </p>
    </div>
  );
}
