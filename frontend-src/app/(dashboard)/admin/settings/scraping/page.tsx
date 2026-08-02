"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, XCircle, RefreshCw, Eye, EyeOff,
  Chrome, Globe, Info, AlertTriangle, Copy, ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";

type Tab = "extension" | "proxy";

interface ProxySettings {
  proxy_url: string;
  active: boolean;
  env_override: boolean;
  effective_url: string;
}

const EXTENSION_STEPS = [
  {
    step: 1,
    title: "Open Chrome Extensions",
    body: "In Chrome, type",
    code: "chrome://extensions",
    extra: "in the address bar and press Enter.",
  },
  {
    step: 2,
    title: "Enable Developer Mode",
    body: 'Toggle the "Developer mode" switch in the top-right corner of the extensions page.',
  },
  {
    step: 3,
    title: "Load the Extension",
    body: 'Click "Load unpacked", then select the folder:',
    code: "D:\\ORM\\extension",
  },
  {
    step: 4,
    title: "Pin the Extension",
    body: 'Click the puzzle-piece icon in Chrome toolbar, find "ORM Auto Sync" and click the pin icon.',
  },
  {
    step: 5,
    title: "Connect to Dashboard",
    body: "Click the ORM Auto Sync icon. In the popup:",
    bullets: [
      "API URL: https://orm.itechexpand.com/api/v1",
      "Email: admin@orm.local",
      "Password: Admin@123",
    ],
  },
  {
    step: 6,
    title: "Start Auto-Sync",
    body: 'Click "Connect dashboard", then "Start auto-sync". Keep instagram.com open and logged in.',
  },
];

export default function ScrapingSettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("extension");

  // Proxy state
  const [proxy, setProxy] = useState<ProxySettings | null>(null);
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxyActive, setProxyActive] = useState(false);
  const [showProxy, setShowProxy] = useState(false);
  const [savingProxy, setSavingProxy] = useState(false);
  const [proxyMsg, setProxyMsg] = useState("");

  useEffect(() => {
    api.get("/admin/proxy-settings")
      .then((r) => {
        setProxy(r.data);
        setProxyUrl(r.data.proxy_url || "");
        setProxyActive(r.data.active || false);
      })
      .catch(() => {});
  }, []);

  async function saveProxy() {
    setSavingProxy(true); setProxyMsg("");
    try {
      await api.put("/admin/proxy-settings", { proxy_url: proxyUrl.trim(), active: proxyActive });
      setProxyMsg("✓ Proxy settings saved.");
      setProxy(prev => prev ? { ...prev, proxy_url: proxyUrl.trim(), active: proxyActive } : null);
    } catch (e: any) {
      setProxyMsg("✗ " + (e?.response?.data?.detail || "Save failed."));
    } finally {
      setSavingProxy(false);
    }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/5 text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold">Scraping Settings</h1>
          <p className="text-sm text-muted">Choose how Instagram (and Facebook) comments are collected.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => setTab("extension")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors
            ${tab === "extension" ? "bg-accent text-white" : "hover:bg-muted/10 text-fg"}`}>
          <Chrome className="h-4 w-4" />
          Browser Extension
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold
            ${tab === "extension" ? "bg-white/20 text-white" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>
            FREE · ACTIVE
          </span>
        </button>
        <button
          onClick={() => setTab("proxy")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors
            ${tab === "proxy" ? "bg-accent text-white" : "hover:bg-muted/10 text-fg"}`}>
          <Globe className="h-4 w-4" />
          Residential Proxy
          {proxy?.active ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold
              ${tab === "proxy" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
              ON
            </span>
          ) : (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold
              ${tab === "proxy" ? "bg-white/20 text-white" : "bg-muted/20 text-muted"}`}>
              UPGRADE
            </span>
          )}
        </button>
      </div>

      {/* ── Extension Tab ── */}
      {tab === "extension" && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <h2 className="font-semibold text-green-700 dark:text-green-400">Recommended Free Setup</h2>
                <p className="text-sm text-muted mt-1">
                  The <strong className="text-fg">ORM Auto Sync</strong> Chrome extension runs in your browser
                  and uses your logged-in Instagram session to pull real posts + comments — no IP blocks,
                  no API keys, completely free. Set it up once and leave Chrome running.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold mb-4">Setup Steps</h2>
            <ol className="space-y-5">
              {EXTENSION_STEPS.map(({ step, title, body, code, extra, bullets }) => (
                <li key={step} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white text-sm font-bold">{step}</span>
                  <div className="pt-0.5">
                    <p className="font-medium text-sm">{title}</p>
                    <p className="text-sm text-muted mt-0.5">
                      {body}{" "}
                      {extra && <span className="text-fg">{extra}</span>}
                    </p>
                    {code && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/10 border border-border px-3 py-2">
                        <code className="flex-1 text-xs font-mono text-fg">{code}</code>
                        <button onClick={() => copyText(code)}
                          className="text-muted hover:text-fg" title="Copy">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {bullets && (
                      <ul className="mt-2 space-y-1">
                        {bullets.map((b, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-muted">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                            <code className="font-mono text-xs">{b}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold mb-1">Important: keep Chrome + Instagram open</p>
                <p>The extension needs Chrome running with at least one instagram.com tab logged in.
                   It opens a hidden background tab and syncs automatically. You don&apos;t need to interact
                   with it — just don&apos;t close Chrome.</p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold mb-3">How it works</h2>
            <div className="space-y-2 text-sm text-muted">
              <p>① Extension fetches the list of Instagram accounts from the ORM dashboard.</p>
              <p>② Opens a hidden instagram.com tab using <strong className="text-fg">your logged-in session</strong> (no blocks).</p>
              <p>③ Calls Instagram&apos;s own API to get recent posts + comments (same as you browsing it).</p>
              <p>④ Sends results to the ORM server — you see live data appear in Posts &amp; Comments.</p>
              <p>⑤ Repeats automatically every hour for all connected accounts.</p>
            </div>
          </Card>
        </div>
      )}

      {/* ── Proxy Tab ── */}
      {tab === "proxy" && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-start gap-3">
              <Globe className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <h2 className="font-semibold">Residential Proxy Mode</h2>
                <p className="text-sm text-muted mt-1">
                  Configure a residential proxy so the <strong className="text-fg">server</strong> fetches
                  Instagram comments directly — no browser needed, fully automated 24/7.
                  Requires a paid proxy subscription (e.g. Bright Data, Oxylabs, SmartProxy).
                </p>
              </div>
            </div>
          </Card>

          {proxy?.env_override && (
            <div className="flex items-start gap-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 p-3 text-xs text-blue-800 dark:text-blue-300">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Proxy URL is currently set via the <code>INSTAGRAM_PROXY_URL</code> environment variable and takes priority over this form.</span>
            </div>
          )}

          <Card>
            <h2 className="font-semibold mb-4">Proxy Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Proxy URL <span className="text-muted">(http://user:pass@host:port format)</span>
                </label>
                <div className="relative">
                  <input
                    type={showProxy ? "text" : "password"}
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    placeholder="http://user:pass@proxy.brightdata.com:22225"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm font-mono"
                  />
                  <button onClick={() => setShowProxy(v => !v)}
                    className="absolute right-3 top-2.5 text-muted hover:text-fg">
                    {showProxy ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  role="switch"
                  aria-checked={proxyActive}
                  onClick={() => setProxyActive(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${proxyActive ? "bg-accent" : "bg-muted/30"}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
                    ${proxyActive ? "translate-x-6" : "translate-x-1"}`} />
                </button>
                <div>
                  <p className="text-sm font-medium">{proxyActive ? "Proxy enabled" : "Proxy disabled"}</p>
                  <p className="text-xs text-muted">
                    {proxyActive
                      ? "Server will route Instagram requests through the proxy above."
                      : "Server uses direct connection (or browser extension if set up)."}
                  </p>
                </div>
              </div>

              <button
                onClick={saveProxy}
                disabled={savingProxy}
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40">
                {savingProxy ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                {savingProxy ? "Saving…" : "Save Proxy Settings"}
              </button>

              {proxyMsg && (
                <p className={`text-sm ${proxyMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                  {proxyMsg}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold mb-3">Recommended Providers</h2>
            <div className="space-y-3 text-sm">
              {[
                { name: "Bright Data", desc: "Largest residential network, Instagram-ready", url: "https://brightdata.com", tag: "Most reliable" },
                { name: "Oxylabs", desc: "High-success residential proxies, good for social media", url: "https://oxylabs.io", tag: "" },
                { name: "SmartProxy", desc: "Affordable entry-level residential proxies", url: "https://smartproxy.com", tag: "Budget-friendly" },
              ].map(({ name, desc, url, tag }) => (
                <div key={name} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{name}</span>
                      {tag && <span className="rounded-full bg-accent/10 text-accent text-[10px] px-2 py-0.5 font-semibold">{tag}</span>}
                    </div>
                    <p className="text-xs text-muted mt-0.5">{desc}</p>
                  </div>
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-accent hover:underline shrink-0">
                    Visit <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold mb-2">Comparison</h2>
            <div className="overflow-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="pb-2 font-medium">Feature</th>
                    <th className="pb-2 font-medium text-green-600">Extension (Free)</th>
                    <th className="pb-2 font-medium text-blue-600">Proxy (Paid)</th>
                  </tr>
                </thead>
                <tbody className="text-muted">
                  {[
                    ["Cost", "Free", "$50–200/mo"],
                    ["Needs Chrome open", "Yes", "No"],
                    ["Fully automated", "Partial", "Yes"],
                    ["Block risk", "None", "Low (residential)"],
                    ["Speed", "Slow (browser)", "Fast (server)"],
                    ["Best for", "1–5 accounts", "10+ accounts"],
                  ].map(([feat, ext, prx]) => (
                    <tr key={feat} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5 font-medium text-fg">{feat}</td>
                      <td className="py-1.5">{ext}</td>
                      <td className="py-1.5">{prx}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
