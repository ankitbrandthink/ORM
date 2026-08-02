"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell, Send, RefreshCw, CheckCircle, XCircle, Clock,
  QrCode, Smartphone, AlertTriangle, ChevronDown, ChevronUp,
  Zap, Phone, ToggleLeft, ToggleRight, ArrowLeft, ExternalLink, Info,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button } from "@/components/ui/primitives";
import { useRouter } from "next/navigation";

interface Config {
  manager_phone: string;
  alert_phones: string[];
  min_volume: number;
  cooldown_minutes: number;
  enabled: boolean;
  channel: string;
  test_mode: boolean;
  // MessageCentral
  mc_api_key: string;
  mc_project_id: string;
  mc_template_id: string;
  mc_country_code: string;
  // Twilio (legacy)
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_from_number: string;
  twilio_sandbox_number: string;
  alert_client_ids: string[];
}

const DEFAULT_CFG: Config = {
  manager_phone: "+918950205038",
  alert_phones: ["+918222050382"],
  min_volume: 10,
  cooldown_minutes: 60,
  enabled: true,
  channel: "messagecentral",
  test_mode: true,
  mc_api_key: "",
  mc_project_id: "",
  mc_template_id: "orm_alert",
  mc_country_code: "91",
  twilio_account_sid: "",
  twilio_auth_token: "",
  twilio_from_number: "",
  twilio_sandbox_number: "+14155238886",
  alert_client_ids: [],
};

interface AlertLogItem {
  id: string;
  post_id: string | null;
  alert_type: string;
  neg_pct: number;
  total_comments: number;
  whatsapp_number: string;
  status: string;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  message: string;
}

interface WaStatus {
  status: string;
  connected: boolean;
  qr_available?: boolean;
  error?: string | null;
}

interface McStatus {
  ok: boolean;
  error?: string;
  has_project: boolean;
  project_id?: string;
  template_id?: string;
}

const STATUS_COLOR: Record<string, string> = {
  sent: "text-green-600", test: "text-blue-500",
  failed: "text-red-500", skipped: "text-yellow-500", pending: "text-gray-400",
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  sent: <CheckCircle className="h-3.5 w-3.5 text-green-600" />,
  test: <CheckCircle className="h-3.5 w-3.5 text-blue-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  skipped: <Clock className="h-3.5 w-3.5 text-yellow-500" />,
};

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label?: string }) {
  return (
    <button onClick={onToggle} className="flex items-center gap-1.5" title={label}>
      {on
        ? <ToggleRight className="h-5 w-5 text-green-500" />
        : <ToggleLeft className="h-5 w-5 text-gray-400" />}
      {label && <span className="text-xs text-muted">{label}</span>}
    </button>
  );
}

export default function AlertsPage() {
  const router = useRouter();
  const [cfg, setCfg] = useState<Config>(DEFAULT_CFG);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

  const [waStatus, setWaStatus] = useState<WaStatus | null>(null);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  const [mcStatus, setMcStatus] = useState<McStatus | null>(null);
  const [mcChecking, setMcChecking] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ checked: number; alerted: number; skipped: number } | null>(null);

  const [logs, setLogs] = useState<AlertLogItem[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await api.get("/whatsapp/config");
      setCfg(c => ({
        ...c,
        ...data,
        manager_phone: data.manager_phone ?? c.manager_phone,
        alert_phones: Array.isArray(data.alert_phones) && data.alert_phones.length > 0
          ? data.alert_phones : c.alert_phones,
        min_volume: data.min_volume ?? c.min_volume,
        cooldown_minutes: data.cooldown_minutes ?? c.cooldown_minutes,
        enabled: data.enabled ?? c.enabled,
        channel: data.channel ?? "messagecentral",
        test_mode: data.test_mode ?? true,
        mc_api_key: data.mc_api_key ?? "",
        mc_project_id: data.mc_project_id ?? "",
        mc_template_id: data.mc_template_id ?? "orm_alert",
        mc_country_code: data.mc_country_code ?? "91",
        twilio_account_sid: data.twilio_account_sid ?? "",
        twilio_auth_token: data.twilio_auth_token ?? "",
        twilio_from_number: data.twilio_from_number ?? "",
        twilio_sandbox_number: data.twilio_sandbox_number ?? "+14155238886",
        alert_client_ids: Array.isArray(data.alert_client_ids) ? data.alert_client_ids : [],
      }));
    } catch {}
  }, []);

  const loadLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const { data } = await api.get("/whatsapp/logs", { params: { page, page_size: 15 } });
      setLogs(data.items || []);
      setLogTotal(data.total || 0);
      setLogPage(page);
    } catch {} finally { setLogsLoading(false); }
  }, []);

  const loadWaStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const { data } = await api.get("/whatsapp/wa-status");
      setWaStatus(data);
    } catch (e: any) {
      setWaStatus({ status: "unreachable", connected: false, error: e?.message });
    } finally { setStatusLoading(false); }
  }, []);

  const checkMcStatus = useCallback(async () => {
    setMcChecking(true);
    try {
      const { data } = await api.get("/whatsapp/mc-status");
      setMcStatus(data);
    } catch (e: any) {
      setMcStatus({ ok: false, error: e?.message || "Request failed", has_project: false });
    } finally { setMcChecking(false); }
  }, []);

  useEffect(() => {
    loadConfig(); loadLogs(); loadWaStatus();
    api.get("/clients").then(r => setClients(r.data || [])).catch(() => {});
    setTimeout(checkMcStatus, 800);
  }, [loadConfig, loadLogs, loadWaStatus, checkMcStatus]);

  /* poll WA status while disconnected */
  useEffect(() => {
    if (waStatus?.connected) {
      if (pollRef.current) clearInterval(pollRef.current);
      setQrImg(null);
      return;
    }
    if (!pollRef.current) {
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await api.get("/whatsapp/wa-status");
          setWaStatus(data);
          if (data.connected) { clearInterval(pollRef.current!); pollRef.current = null; setQrImg(null); }
        } catch {}
      }, 5000);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [waStatus?.connected]);

  async function saveConfig() {
    setSaving(true); setSaveMsg("");
    try {
      await api.put("/whatsapp/config", {
        manager_phone: cfg.manager_phone,
        alert_phones: cfg.alert_phones.filter(p => p.trim()),
        min_volume: cfg.min_volume,
        cooldown_minutes: cfg.cooldown_minutes,
        enabled: cfg.enabled,
        channel: cfg.channel,
        test_mode: cfg.test_mode,
        mc_api_key: cfg.mc_api_key || null,
        mc_project_id: cfg.mc_project_id || null,
        mc_template_id: cfg.mc_template_id || "orm_alert",
        mc_country_code: cfg.mc_country_code || "91",
        twilio_account_sid: cfg.twilio_account_sid || null,
        twilio_auth_token: cfg.twilio_auth_token || null,
        twilio_from_number: cfg.twilio_from_number || null,
        twilio_sandbox_number: cfg.twilio_sandbox_number || "+14155238886",
        alert_client_ids: cfg.alert_client_ids,
      });
      setSaveMsg("Saved successfully.");
      setTimeout(checkMcStatus, 400);
    } catch { setSaveMsg("Failed to save."); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(""), 3000); }
  }

  async function loadQr() {
    setQrLoading(true);
    try {
      const { data } = await api.get("/whatsapp/qr");
      setQrImg(data.qr || null);
      if (!data.qr) setTestMsg("No QR available — is the WhatsApp service running?");
    } catch { setTestMsg("Could not reach WhatsApp service."); }
    finally { setQrLoading(false); }
  }

  async function sendTest() {
    setTesting(true); setTestMsg("");
    try {
      await api.post("/whatsapp/test");
      setTestMsg("✅ Test message sent! Check WhatsApp on all recipient numbers.");
      loadLogs();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || "Failed to send test.";
      const status = e?.response?.status;
      if (status === 429) {
        setTestMsg("⚠️ Daily message limit reached. Upgrade your MessageCentral plan.");
      } else if (status === 422 && detail.includes("Project ID")) {
        setTestMsg("⚠️ MessageCentral Project ID not set. Connect your WhatsApp Business number at whatsapp.messagecentral.com, then paste the WA-XXXXXX ID in the field below.");
      } else if (status === 422) {
        setTestMsg(`⚠️ ${detail}`);
      } else {
        setTestMsg(`❌ ${detail}`);
      }
    } finally { setTesting(false); }
  }

  async function runCheck() {
    setChecking(true); setCheckResult(null);
    try {
      const { data } = await api.post("/whatsapp/check");
      setCheckResult(data);
      loadLogs();
    } catch {} finally { setChecking(false); }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await api.delete("/whatsapp/logs", { data: { ids: Array.from(selected) } });
      setSelected(new Set());
      loadLogs(1);
    } catch {} finally { setDeleting(false); }
  }

  async function deleteAll() {
    if (!confirm(`Delete all ${logTotal} alert log entries? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.delete("/whatsapp/logs/all");
      setSelected(new Set());
      loadLogs(1);
    } catch {} finally { setDeleting(false); }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(prev => prev.size === logs.length ? new Set() : new Set(logs.map(l => l.id)));
  }

  const [restarting, setRestarting] = useState(false);

  async function restartWa() {
    setRestarting(true);
    try {
      await api.post("/whatsapp/restart-wa");
      // poll status after restart
      setTimeout(loadWaStatus, 3000);
      setTimeout(loadWaStatus, 8000);
      setTimeout(loadWaStatus, 15000);
    } catch {}
    finally { setRestarting(false); }
  }

  const waConnected = waStatus?.connected;
  const waUnreachable = !waStatus || waStatus.status === "unreachable";
  const waError = waStatus?.status === "error";
  const useMc = cfg.channel === "messagecentral";
  const useTwilio = cfg.channel === "twilio";
  const canSendTest = useMc ? !!cfg.mc_api_key : useTwilio ? !!cfg.twilio_account_sid : waConnected;

  return (
    <div className="space-y-6">

      {/* Header with back */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/5 text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold">WhatsApp Alert Settings</h1>
          <p className="text-xs text-muted mt-0.5">
            Alert fires when <b>negative comments ≥ positive comments</b> on any monitored post.
          </p>
        </div>
      </div>

      {/* Environment banner */}
      <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
        cfg.test_mode
          ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
          : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
      }`}>
        <div>
          <p className={`text-sm font-semibold ${cfg.test_mode ? "text-blue-700 dark:text-blue-400" : "text-green-700 dark:text-green-400"}`}>
            {cfg.test_mode ? "🧪 TEST / SANDBOX MODE" : "🟢 LIVE / PRODUCTION MODE"}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {cfg.test_mode
              ? "Messages sent to test sandbox. No real alerts delivered."
              : "Messages sent to real WhatsApp number. 24×7 monitoring active."}
          </p>
        </div>
        <Toggle
          on={!cfg.test_mode}
          onToggle={() => setCfg(c => ({ ...c, test_mode: !c.test_mode }))}
          label={cfg.test_mode ? "Switch to Live" : "Switch to Test"}
        />
      </div>

      {/* Channel selector */}
      <div className="flex gap-3">
        <button
          onClick={() => setCfg(c => ({ ...c, channel: "messagecentral" }))}
          className={`flex flex-1 items-center gap-3 rounded-xl border p-4 transition-all ${
            useMc ? "border-accent bg-accent/5 ring-1 ring-accent/30" : "border-border hover:border-accent/50"
          }`}>
          <Zap className="h-5 w-5 text-green-500 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-semibold">MessageCentral WhatsApp</p>
            <p className="text-xs text-muted">Official WhatsApp Business API — cloud, reliable, scalable.</p>
          </div>
          {useMc && <CheckCircle className="ml-auto h-4 w-4 text-accent shrink-0" />}
        </button>
        <button
          onClick={() => setCfg(c => ({ ...c, channel: "openwa" }))}
          className={`flex flex-1 items-center gap-3 rounded-xl border p-4 transition-all ${
            !useMc && !useTwilio ? "border-accent bg-accent/5 ring-1 ring-accent/30" : "border-border hover:border-accent/50"
          }`}>
          <Smartphone className="h-5 w-5 text-gray-500 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-semibold">OpenWA (Local)</p>
            <p className="text-xs text-muted">WhatsApp Web via local Node.js service. Legacy.</p>
          </div>
          {!useMc && !useTwilio && <CheckCircle className="ml-auto h-4 w-4 text-accent shrink-0" />}
        </button>
      </div>

      {/* ── MessageCentral status panel ── */}
      {useMc && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-500" />
              <span className="text-sm font-semibold">MessageCentral WhatsApp Status</span>
            </div>
            <button onClick={checkMcStatus} disabled={mcChecking}
              className="flex items-center gap-1 text-xs text-muted hover:text-fg">
              <RefreshCw className={`h-3.5 w-3.5 ${mcChecking ? "animate-spin" : ""}`} />
              {mcChecking ? "Checking…" : "Refresh"}
            </button>
          </div>

          <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {/* 1 — API Key */}
            <div className="px-4 py-3 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">API Key</p>
              {mcStatus ? (
                mcStatus.ok ? (
                  <div className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" /> Valid &amp; Active
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-red-500">
                      <XCircle className="h-4 w-4" /> {cfg.mc_api_key ? "Invalid" : "Not set"}
                    </div>
                    {mcStatus.error && <p className="text-xs text-red-400">{mcStatus.error.slice(0, 80)}</p>}
                  </>
                )
              ) : (
                <div className="flex items-center gap-1.5 text-sm text-muted">
                  <Clock className="h-4 w-4" /> Not checked
                </div>
              )}
            </div>

            {/* 2 — Project / Business Number */}
            <div className="px-4 py-3 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">WA Business Project</p>
              {mcStatus?.ok ? (
                mcStatus.has_project ? (
                  <>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                      <CheckCircle className="h-4 w-4" /> Connected
                    </div>
                    <p className="text-xs font-mono text-muted">{mcStatus.project_id}</p>
                    <p className="text-xs text-muted">Template: <code className="rounded bg-muted/30 px-1">{mcStatus.template_id}</code></p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-orange-500">
                      <AlertTriangle className="h-4 w-4" /> Not connected
                    </div>
                    <a href="https://whatsapp.messagecentral.com/console/whatsapp-manager"
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                      Connect number <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )
              ) : (
                <div className="text-sm text-muted">—</div>
              )}
            </div>

            {/* 3 — Recipients */}
            <div className="px-4 py-3 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Alert Recipients</p>
              {cfg.alert_phones.length > 0 ? (
                cfg.alert_phones.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <span className="font-mono">{p}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted">No numbers added.</p>
              )}
              <p className="text-[11px] text-muted pt-1">
                Mode: <span className={cfg.test_mode ? "text-blue-500 font-medium" : "text-green-600 font-medium"}>
                  {cfg.test_mode ? "Sandbox" : "Production"}
                </span>
              </p>
            </div>
          </div>

          {/* Setup steps — when API key valid but no project */}
          {mcStatus?.ok && !mcStatus.has_project && (
            <div className="border-t border-border bg-orange-50/60 dark:bg-orange-900/10 px-4 py-3">
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-2">
                ⚠️ WhatsApp Business number not connected — complete these steps to enable live alerts:
              </p>
              <ol className="text-xs text-muted space-y-1 list-decimal ml-4">
                <li>Open <a href="https://whatsapp.messagecentral.com/console/whatsapp-manager" target="_blank" rel="noreferrer" className="text-accent hover:underline font-medium">MessageCentral → WhatsApp Manager</a></li>
                <li>Click <b>Login to Facebook</b> and complete Meta embedded signup with your business number.</li>
                <li>After signup, note the <b>WA-XXXXXX Project ID</b> shown in the dashboard.</li>
                <li>Paste the Project ID in the field below and click <b>Save configuration</b>.</li>
                <li>Create an <b>orm_alert</b> template in <a href="https://whatsapp.messagecentral.com/console/templates" target="_blank" rel="noreferrer" className="text-accent hover:underline">Templates</a> with 6 body variables (account, platform, negative %, positive %, total, post URL).</li>
                <li>Once template is approved by Meta, alerts will send automatically.</li>
              </ol>
              <p className="mt-2 text-[11px] text-muted">
                <b>For sandbox testing</b> (without a real number): use the{" "}
                <a href="https://whatsapp.messagecentral.com/console/try-for-free" target="_blank" rel="noreferrer" className="text-accent hover:underline">Try For Free</a>{" "}
                feature in MessageCentral — it sends a test message from their shared number to verify your account is working.
              </p>
            </div>
          )}

          {/* All good */}
          {mcStatus?.ok && mcStatus.has_project && (
            <div className="border-t border-border bg-green-50/60 dark:bg-green-900/10 px-4 py-2">
              <p className="text-xs text-green-700 dark:text-green-400">
                ✅ MessageCentral fully configured. Click <b>Send test message</b> to verify delivery.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Monitored accounts ── */}
      {clients.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold">Monitored accounts</h2>
              <p className="text-xs text-muted mt-0.5">
                {cfg.alert_client_ids.length === 0
                  ? "All accounts are monitored. Tick specific ones to restrict alerts."
                  : `Alerts active for ${cfg.alert_client_ids.length} account${cfg.alert_client_ids.length > 1 ? "s" : ""} only.`}
              </p>
            </div>
            {cfg.alert_client_ids.length > 0 && (
              <button
                onClick={() => setCfg(c => ({ ...c, alert_client_ids: [] }))}
                className="text-xs text-accent hover:underline">
                Monitor all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => {
              const checked = cfg.alert_client_ids.length === 0 || cfg.alert_client_ids.includes(client.id);
              const explicit = cfg.alert_client_ids.includes(client.id);
              return (
                <label key={client.id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                    explicit
                      ? "border-accent bg-accent/5 text-fg"
                      : cfg.alert_client_ids.length === 0
                        ? "border-green-200 bg-green-50/60 dark:border-green-800/40 dark:bg-green-900/10 text-fg"
                        : "border-border bg-card text-muted"
                  }`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    checked={explicit}
                    onChange={(e) => {
                      setCfg(c => {
                        const ids = c.alert_client_ids.includes(client.id)
                          ? c.alert_client_ids.filter(id => id !== client.id)
                          : [...c.alert_client_ids, client.id];
                        return { ...c, alert_client_ids: ids };
                      });
                    }}
                  />
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">{client.name}</span>
                  {cfg.alert_client_ids.length === 0 && !explicit && (
                    <span className="text-[10px] text-green-600 dark:text-green-400 shrink-0">monitoring</span>
                  )}
                  {explicit && (
                    <span className="text-[10px] text-accent shrink-0">✓ selected</span>
                  )}
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Unchecked accounts are <b>not monitored</b> if any account is ticked. Tick none = monitor all.
            Click <b>Save configuration</b> below to apply.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* LEFT: Connection card */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            {useMc
              ? <Zap className="h-4 w-4 text-green-500" />
              : useTwilio ? <Zap className="h-4 w-4 text-blue-500" />
              : <Smartphone className="h-4 w-4 text-gray-500" />}
            <h2 className="text-sm font-semibold">
              {useMc ? "MessageCentral Configuration" : useTwilio ? "Twilio Configuration (Legacy)" : "WhatsApp Connection"}
            </h2>
            {!useMc && !useTwilio && (
              <button onClick={loadWaStatus} className="ml-auto text-muted hover:text-fg" title="Refresh status">
                <RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>

          {useMc ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  API Key
                  {mcStatus?.ok && (
                    <span className="flex items-center gap-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 text-[10px] font-semibold">
                      <CheckCircle className="h-3 w-3" /> Valid
                    </span>
                  )}
                </label>
                <input type="password" placeholder="wa_now_xxxxxxxxxxxxxxxxxxxxxxxx"
                  autoComplete="off"
                  value={cfg.mc_api_key}
                  onChange={e => setCfg(c => ({ ...c, mc_api_key: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono" />
                <p className="text-[11px] text-muted">
                  Find in{" "}
                  <a href="https://whatsapp.messagecentral.com/console/developer-guide?tab=api" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    MessageCentral → Developer Guide → API Key
                  </a>
                </p>
              </div>
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  Project ID
                  {mcStatus?.ok && mcStatus.has_project && (
                    <span className="flex items-center gap-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 text-[10px] font-semibold">
                      <CheckCircle className="h-3 w-3" /> Set
                    </span>
                  )}
                </label>
                <input type="text" placeholder="WA-123456 (from WhatsApp Manager)"
                  autoComplete="off"
                  value={cfg.mc_project_id}
                  onChange={e => setCfg(c => ({ ...c, mc_project_id: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono" />
                <p className="text-[11px] text-muted">
                  Available after connecting your WhatsApp Business number via{" "}
                  <a href="https://whatsapp.messagecentral.com/console/whatsapp-manager" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    WhatsApp Manager
                  </a>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Alert Template Name</label>
                  <input type="text" placeholder="orm_alert"
                    autoComplete="off"
                    value={cfg.mc_template_id}
                    onChange={e => setCfg(c => ({ ...c, mc_template_id: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Default Country Code</label>
                  <input type="text" placeholder="91"
                    value={cfg.mc_country_code}
                    onChange={e => setCfg(c => ({ ...c, mc_country_code: e.target.value.replace(/\D/g, "") }))}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono" />
                </div>
              </div>
            </div>
          ) : useTwilio ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Account SID (Legacy)</label>
                <input type="text" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={cfg.twilio_account_sid}
                  onChange={e => setCfg(c => ({ ...c, twilio_account_sid: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Auth Token</label>
                <input type="password" placeholder="Leave blank to keep existing"
                  value={cfg.twilio_auth_token}
                  onChange={e => setCfg(c => ({ ...c, twilio_auth_token: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono" />
              </div>
            </div>
          ) : (
            <>
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                waConnected ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : waUnreachable ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                : waError ? "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400"
                : "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400"}`}>
                <span className={`h-2 w-2 rounded-full ${waConnected ? "bg-green-500" : waUnreachable ? "bg-red-500" : waError ? "bg-orange-500" : "bg-yellow-500"}`} />
                {waConnected ? "Connected" : waUnreachable ? "Service not running" : waError ? "Session error — retrying…" : waStatus?.status === "qr_waiting" ? "Waiting for QR scan" : "Initializing…"}
              </div>

              {waError && (
                <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs dark:border-orange-800 dark:bg-orange-900/20">
                  <p className="font-medium text-orange-800 dark:text-orange-300">Session boot failed. Likely stale session data.</p>
                  {waStatus?.error && <p className="text-[11px] text-orange-700 dark:text-orange-400 font-mono break-all">{waStatus.error.substring(0, 120)}</p>}
                  <Button onClick={restartWa} disabled={restarting} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                    <RefreshCw className={`h-4 w-4 ${restarting ? "animate-spin" : ""}`} />
                    {restarting ? "Restarting…" : "Clean session & retry"}
                  </Button>
                </div>
              )}

              {waUnreachable && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs dark:border-yellow-800 dark:bg-yellow-900/20">
                  <p className="font-medium text-yellow-800 dark:text-yellow-400">Start the WhatsApp service:</p>
                  <code className="mt-1 block text-[11px] text-yellow-700 dark:text-yellow-300 whitespace-pre">
{"cd D:\\ORM\\whatsapp-service\nnpm install\nnode index.js"}
                  </code>
                </div>
              )}

              {!waConnected && !waUnreachable && (
                <div className="space-y-3">
                  <p className="text-xs text-muted">Scan the QR code with WhatsApp on your phone to connect.</p>
                  {qrImg ? (
                    <div className="flex flex-col items-center gap-2">
                      <img src={qrImg} alt="WhatsApp QR Code" className="h-48 w-48 rounded-lg border border-border" />
                      <span className="text-[11px] text-muted">Open WhatsApp → Settings → Linked Devices → Link a Device</span>
                    </div>
                  ) : (
                    <Button variant="ghost" onClick={loadQr} disabled={qrLoading} className="w-full">
                      <QrCode className="h-4 w-4" />
                      {qrLoading ? "Loading QR…" : "Show QR Code"}
                    </Button>
                  )}
                </div>
              )}

              {waConnected && <p className="text-xs text-green-700 dark:text-green-400">WhatsApp connected. Alerts deliver instantly.</p>}
            </>
          )}
        </Card>

        {/* RIGHT: Alert Config */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold">Alert Configuration</h2>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted">{cfg.enabled ? "Alerts ON" : "Alerts OFF"}</span>
              <button
                onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
                className={`relative h-5 w-9 rounded-full transition-colors ${cfg.enabled ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${cfg.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>

          {/* Alert recipient numbers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted">Alert recipient numbers</label>
              <button
                type="button"
                onClick={() => setCfg(c => ({ ...c, alert_phones: [...c.alert_phones, ""] }))}
                className="flex items-center gap-1 text-xs text-accent hover:underline">
                + Add number
              </button>
            </div>
            {cfg.alert_phones.length === 0 && (
              <p className="text-[11px] text-muted">No recipients — click "+ Add number" above.</p>
            )}
            {cfg.alert_phones.map((phone, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
                  <input type="tel" placeholder="+918222050382"
                    value={phone}
                    onChange={e => setCfg(c => {
                      const phones = [...c.alert_phones];
                      phones[idx] = e.target.value;
                      return { ...c, alert_phones: phones };
                    })}
                    className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm" />
                </div>
                <button
                  type="button"
                  onClick={() => setCfg(c => ({ ...c, alert_phones: c.alert_phones.filter((_, i) => i !== idx) }))}
                  className="shrink-0 rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            ))}
            <p className="text-[11px] text-muted">Alerts send to all numbers. Include country code (e.g. +91 for India).</p>
          </div>

          {/* Alert trigger info */}
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">Alert trigger condition</p>
            <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
              🔴 Fires when <b>negative comments ≥ positive comments</b> on a post (and ≥ min volume below).
            </p>
          </div>

          {/* Min volume */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-xs font-medium text-muted">Minimum comments before checking</label>
              <span className="text-xs font-semibold">{cfg.min_volume}</span>
            </div>
            <input type="range" min={1} max={100} step={1}
              value={cfg.min_volume}
              onChange={e => setCfg(c => ({ ...c, min_volume: Number(e.target.value) }))}
              className="w-full" />
          </div>

          {/* Cooldown */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-xs font-medium text-muted">Cooldown between repeat alerts</label>
              <span className="text-xs font-semibold">{cfg.cooldown_minutes} min</span>
            </div>
            <input type="range" min={15} max={480} step={15}
              value={cfg.cooldown_minutes}
              onChange={e => setCfg(c => ({ ...c, cooldown_minutes: Number(e.target.value) }))}
              className="w-full" />
            <p className="text-[11px] text-muted">Won't re-alert the same post within this window</p>
          </div>

          <Button onClick={saveConfig} disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save configuration"}
          </Button>
          {saveMsg && (
            <p className={`text-xs ${saveMsg.includes("success") ? "text-green-600" : "text-red-500"}`}>{saveMsg}</p>
          )}
        </Card>
      </div>

      {/* Alert Actions */}
      <Card className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold">Alert Actions</h2>
          <p className="text-xs text-muted">Test setup or manually trigger a check across all posts.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={sendTest} disabled={testing || !canSendTest}>
            <Send className="h-4 w-4" />
            {testing ? "Sending…" : "Send test message"}
          </Button>
          <Button onClick={runCheck} disabled={checking}>
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking…" : "Run alert check now"}
          </Button>
        </div>
        <div className="w-full space-y-1">
          {testMsg && <p className={`text-xs ${testMsg.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>{testMsg}</p>}
          {checkResult && (
            <p className="text-xs text-muted">
              Check complete — <b>{checkResult.checked}</b> posts scanned,{" "}
              <b className="text-red-500">{checkResult.alerted}</b> alerts sent,{" "}
              <b>{checkResult.skipped}</b> skipped (cooldown).
            </p>
          )}
          {!canSendTest && useMc && (
            <p className="flex items-center gap-1 text-xs text-yellow-600">
              <AlertTriangle className="h-3 w-3" />
              Enter MessageCentral API Key above and save to enable test messages.
            </p>
          )}
          {!canSendTest && !useMc && !useTwilio && (
            <p className="flex items-center gap-1 text-xs text-yellow-600">
              <AlertTriangle className="h-3 w-3" />
              Start the WhatsApp service and connect first.
            </p>
          )}
        </div>
      </Card>

      {/* Alert logic cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { n: "1", title: "Volume check", body: `Posts with fewer than ${cfg.min_volume} comments are skipped — too little data.` },
          { n: "2", title: "Trigger check", body: "Alert fires when negative comment count ≥ positive comment count on the post." },
          { n: "3", title: "Cooldown", body: `Same post won't re-alert for ${cfg.cooldown_minutes} min — prevents flood during incidents.` },
        ].map(({ n, title, body }) => (
          <div key={n} className="rounded-xl border border-border bg-card p-4">
            <p className="mb-1 text-xs font-bold text-accent">{n}.</p>
            <p className="text-sm font-semibold mb-1">{title}</p>
            <p className="text-xs text-muted">{body}</p>
          </div>
        ))}
      </div>

      {/* Alert history */}
      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          {/* Select-all checkbox */}
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer rounded"
            checked={logs.length > 0 && selected.size === logs.length}
            ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < logs.length; }}
            onChange={toggleSelectAll}
            title="Select / deselect all on this page"
          />
          <span className="text-sm font-semibold flex-1">
            Alert history ({logTotal}){selected.size > 0 && ` · ${selected.size} selected`}
          </span>

          {/* Actions when items selected */}
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50">
              <XCircle className="h-3.5 w-3.5" />
              {deleting ? "Deleting…" : `Delete ${selected.size}`}
            </button>
          )}
          {logTotal > 0 && (
            <button
              onClick={deleteAll}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-900/20">
              Delete all
            </button>
          )}
          <button onClick={() => loadLogs(1)} className="ml-1 text-muted hover:text-fg" title="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${logsLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {logs.length === 0 && !logsLoading && (
          <p className="p-8 text-center text-sm text-muted">No alerts yet. Run a check or wait for the 60-min auto-check.</p>
        )}

        <ul className="divide-y divide-border/60">
          {logs.map(log => (
            <li key={log.id} className={`px-4 py-3 transition-colors ${selected.has(log.id) ? "bg-accent/5" : ""}`}>
              <div className="flex items-start gap-3">
                {/* Row checkbox */}
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded shrink-0"
                  checked={selected.has(log.id)}
                  onChange={() => toggleSelect(log.id)}
                  onClick={e => e.stopPropagation()}
                />
                <button className="flex flex-1 items-start justify-between gap-3 text-left min-w-0"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                  <div className="flex items-center gap-2 min-w-0">
                    {STATUS_ICON[log.status] || <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                    <span className={`text-xs font-medium shrink-0 ${STATUS_COLOR[log.status] || ""}`}>
                      {log.alert_type === "test" ? "Test" : log.alert_type === "manual" ? "Manual" : "Auto alert"}
                    </span>
                    {log.neg_pct > 0 && (
                      <span className="text-xs text-muted truncate">— {log.neg_pct.toFixed(1)}% neg · {log.total_comments} comments</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[11px] text-muted">{log.created_at ? new Date(log.created_at).toLocaleString() : ""}</span>
                    {expandedLog === log.id ? <ChevronUp className="h-3.5 w-3.5 text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-muted" />}
                  </div>
                </button>
              </div>
              {expandedLog === log.id && (
                <div className="mt-2 ml-7 space-y-2">
                  {log.error && <p className="text-xs text-red-500">Error: {log.error}</p>}
                  {log.post_id && (
                    <a href={`/listening/${log.post_id}`} className="block text-xs text-accent hover:underline">View post →</a>
                  )}
                  {log.message && (
                    <pre className="whitespace-pre-wrap rounded-lg bg-black/5 p-3 text-[11px] text-muted dark:bg-white/5">{log.message}</pre>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {logTotal > logs.length && (
          <div className="border-t border-border p-3 text-center">
            <Button variant="ghost" onClick={() => loadLogs(logPage + 1)} disabled={logsLoading}>Load more</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
