"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, XCircle, RefreshCw, Eye, EyeOff,
  Chrome, Globe, Info, AlertTriangle, Copy, ExternalLink, Youtube, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";

type Tab = "apikeys" | "facebook" | "extension" | "proxy";

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
  const [tab, setTab] = useState<Tab>("apikeys");

  // Proxy state
  const [proxy, setProxy] = useState<ProxySettings | null>(null);
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxyActive, setProxyActive] = useState(false);
  const [showProxy, setShowProxy] = useState(false);
  const [savingProxy, setSavingProxy] = useState(false);
  const [proxyMsg, setProxyMsg] = useState("");

  // YouTube API key state
  const [ytKeyInfo, setYtKeyInfo] = useState<{ configured: boolean; env_override: boolean; masked_key: string } | null>(null);
  const [ytKey, setYtKey] = useState("");
  const [showYtKey, setShowYtKey] = useState(false);
  const [savingYt, setSavingYt] = useState(false);
  const [ytMsg, setYtMsg] = useState("");

  // Facebook config state
  const [fbInfo, setFbInfo] = useState<{ has_token: boolean; env_override: boolean; masked_token: string; has_cookies: boolean; c_user: string } | null>(null);
  const [fbCUser, setFbCUser] = useState("");
  const [fbXs, setFbXs] = useState("");
  const [fbToken, setFbToken] = useState("");
  const [showFbToken, setShowFbToken] = useState(false);
  const [savingFb, setSavingFb] = useState(false);
  const [fbMsg, setFbMsg] = useState("");

  useEffect(() => {
    api.get("/admin/proxy-settings")
      .then((r) => {
        setProxy(r.data);
        setProxyUrl(r.data.proxy_url || "");
        setProxyActive(r.data.active || false);
      })
      .catch(() => {});
    api.get("/admin/youtube-api-key")
      .then((r) => setYtKeyInfo(r.data))
      .catch(() => {});
    api.get("/admin/facebook-config")
      .then((r) => setFbInfo(r.data))
      .catch(() => {});
  }, []);

  async function saveYtKey() {
    setSavingYt(true); setYtMsg("");
    try {
      await api.put("/admin/youtube-api-key", { api_key: ytKey.trim() });
      setYtMsg("✓ YouTube API key saved. Next resync will use it.");
      setYtKeyInfo(prev => prev ? { ...prev, configured: !!ytKey.trim(), masked_key: ytKey.trim().length > 10 ? ytKey.slice(0,6) + "…" + ytKey.slice(-4) : "" } : null);
      setYtKey("");
    } catch (e: any) {
      setYtMsg("✗ " + (e?.response?.data?.detail || "Save failed."));
    } finally {
      setSavingYt(false);
    }
  }

  async function saveFbConfig() {
    setSavingFb(true); setFbMsg("");
    try {
      const body: Record<string, string> = {};
      if (fbCUser.trim()) body.c_user = fbCUser.trim();
      if (fbXs.trim()) body.xs = fbXs.trim();
      if (fbToken.trim()) body.access_token = fbToken.trim();
      await api.put("/admin/facebook-config", body);
      setFbMsg("✓ Facebook config saved. Next resync will use it.");
      const r = await api.get("/admin/facebook-config");
      setFbInfo(r.data);
      setFbCUser(""); setFbXs(""); setFbToken("");
    } catch (e: any) {
      setFbMsg("✗ " + (e?.response?.data?.detail || "Save failed."));
    } finally {
      setSavingFb(false);
    }
  }

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
          onClick={() => setTab("apikeys")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors
            ${tab === "apikeys" ? "bg-accent text-white" : "hover:bg-muted/10 text-fg"}`}>
          <Youtube className="h-4 w-4" />
          API Keys
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold
            ${tab === "apikeys" ? "bg-white/20 text-white" : ytKeyInfo?.configured ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
            {ytKeyInfo?.configured ? "ACTIVE" : "SET UP"}
          </span>
        </button>
        <button
          onClick={() => setTab("facebook")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors
            ${tab === "facebook" ? "bg-accent text-white" : "hover:bg-muted/10 text-fg"}`}>
          <Users className="h-4 w-4" />
          Facebook
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold
            ${tab === "facebook" ? "bg-white/20 text-white" : (fbInfo?.has_cookies || fbInfo?.has_token) ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
            {(fbInfo?.has_cookies || fbInfo?.has_token) ? "ACTIVE" : "SET UP"}
          </span>
        </button>
        <button
          onClick={() => setTab("extension")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors
            ${tab === "extension" ? "bg-accent text-white" : "hover:bg-muted/10 text-fg"}`}>
          <Chrome className="h-4 w-4" />
          Extension
        </button>
        <button
          onClick={() => setTab("proxy")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors
            ${tab === "proxy" ? "bg-accent text-white" : "hover:bg-muted/10 text-fg"}`}>
          <Globe className="h-4 w-4" />
          Proxy
          {proxy?.active && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold
              ${tab === "proxy" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
              ON
            </span>
          )}
        </button>
      </div>

      {/* ── API Keys Tab ── */}
      {tab === "apikeys" && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-start gap-3">
              <Youtube className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <h2 className="font-semibold">YouTube Data API Key</h2>
                <p className="text-sm text-muted mt-1">
                  Without an API key, YouTube video titles are fetched via yt-dlp but
                  <strong className="text-fg"> view counts, like counts, and comment counts show as 0</strong> — YouTube
                  blocks per-video stat requests on server IPs. A free API key from Google Cloud Console
                  unlocks real engagement metrics for all YouTube accounts.
                </p>
              </div>
            </div>
          </Card>

          {ytKeyInfo?.configured && (
            <div className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 p-3 text-sm text-green-800 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                API key configured
                {ytKeyInfo.masked_key ? <> — <code className="font-mono text-xs">{ytKeyInfo.masked_key}</code></> : null}
                {ytKeyInfo.env_override && <span className="ml-1 text-xs opacity-70">(set via environment variable)</span>}
              </span>
            </div>
          )}

          <Card>
            <h2 className="font-semibold mb-4">
              {ytKeyInfo?.configured ? "Update API Key" : "Add API Key"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  YouTube Data API v3 Key
                </label>
                <div className="relative">
                  <input
                    type={showYtKey ? "text" : "password"}
                    value={ytKey}
                    onChange={(e) => setYtKey(e.target.value)}
                    placeholder="AIzaSy…"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm font-mono"
                  />
                  <button onClick={() => setShowYtKey(v => !v)}
                    className="absolute right-3 top-2.5 text-muted hover:text-fg">
                    {showYtKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                onClick={saveYtKey}
                disabled={savingYt || !ytKey.trim()}
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40">
                {savingYt ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                {savingYt ? "Saving…" : "Save API Key"}
              </button>

              {ytMsg && (
                <p className={`text-sm ${ytMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                  {ytMsg}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold mb-3">How to get a free API key</h2>
            <ol className="space-y-3 text-sm text-muted">
              {[
                { n: 1, text: "Go to Google Cloud Console", link: "https://console.cloud.google.com" },
                { n: 2, text: 'Create a new project (or select an existing one).' },
                { n: 3, text: 'Go to APIs & Services → Library. Search for "YouTube Data API v3" and click Enable.' },
                { n: 4, text: 'Go to APIs & Services → Credentials → Create Credentials → API Key.' },
                { n: 5, text: 'Copy the key and paste it above. The free quota is 10,000 units/day (enough for ~50 channel syncs per day).' },
              ].map(({ n, text, link }) => (
                <li key={n} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent text-xs font-bold">{n}</span>
                  <span className="pt-0.5">
                    {text}
                    {link && (
                      <> — <a href={link} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-accent hover:underline">
                        console.cloud.google.com <ExternalLink className="h-3 w-3" />
                      </a></>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold mb-1">After saving: resync your YouTube accounts</p>
                <p>
                  The API key takes effect on the <strong className="text-fg">next sync</strong>.
                  Go to Clients → select a client → click <strong className="text-fg">Resync</strong>
                  on any YouTube account to fetch real view counts, like counts, and comment totals.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Facebook Tab ── */}
      {tab === "facebook" && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <h2 className="font-semibold">Facebook Data Extraction</h2>
                <p className="text-sm text-muted mt-1">
                  Two free methods to pull real Facebook page posts and metrics.
                  <strong className="text-fg"> Option A (cookies)</strong> uses your logged-in browser session —
                  most reliable and free. <strong className="text-fg">Option B (access token)</strong> uses the
                  Meta Graph API — valid for ~60 days, then needs renewal.
                </p>
              </div>
            </div>
          </Card>

          {/* Status banner */}
          {(fbInfo?.has_cookies || fbInfo?.has_token) && (
            <div className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 p-3 text-sm text-green-800 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                {fbInfo?.has_cookies && "Browser cookies configured"}
                {fbInfo?.has_cookies && fbInfo?.has_token && " · "}
                {fbInfo?.has_token && (
                  <>Access token configured{fbInfo.masked_token ? <> — <code className="font-mono text-xs">{fbInfo.masked_token}</code></> : null}</>
                )}
                {fbInfo?.env_override && <span className="ml-1 text-xs opacity-70">(token set via env var)</span>}
              </span>
            </div>
          )}

          {/* Option A: Browser cookies */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold">A</span>
              <h2 className="font-semibold">Option A — Browser Cookies (Recommended)</h2>
            </div>
            <p className="text-xs text-muted mb-4">
              Extract <code className="font-mono bg-muted/20 px-1 rounded">c_user</code> and <code className="font-mono bg-muted/20 px-1 rounded">xs</code> cookies
              from a logged-in Facebook session in your browser. These let the server scrape
              page posts as if you were browsing. No app review needed, completely free.
            </p>
            {fbInfo?.has_cookies && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 px-3 py-2 text-xs text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Cookies configured
                {fbInfo.c_user ? <> — c_user: <code className="font-mono">{fbInfo.c_user.slice(0, 6)}…</code></> : null}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">c_user cookie value</label>
                <input
                  type="text"
                  value={fbCUser}
                  onChange={(e) => setFbCUser(e.target.value)}
                  placeholder="1234567890"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">xs cookie value</label>
                <input
                  type="text"
                  value={fbXs}
                  onChange={(e) => setFbXs(e.target.value)}
                  placeholder="Ab1Cd2Ef3:Gh4Ij5Kl6…"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono"
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-muted/10 border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-fg">How to extract cookies from Chrome:</p>
              <ol className="space-y-1.5 text-xs text-muted">
                <li className="flex gap-2"><span className="font-bold text-fg">1.</span> Open facebook.com and log in normally.</li>
                <li className="flex gap-2"><span className="font-bold text-fg">2.</span> Press <code className="font-mono bg-muted/20 px-1 rounded">F12</code> → Application tab → Cookies → https://www.facebook.com</li>
                <li className="flex gap-2"><span className="font-bold text-fg">3.</span> Find the <code className="font-mono bg-muted/20 px-1 rounded">c_user</code> row — copy its Value (a long number).</li>
                <li className="flex gap-2"><span className="font-bold text-fg">4.</span> Find the <code className="font-mono bg-muted/20 px-1 rounded">xs</code> row — copy its Value (looks like Ab1:Cd2…).</li>
                <li className="flex gap-2"><span className="font-bold text-fg">5.</span> Paste both above and click Save.</li>
              </ol>
            </div>
          </Card>

          {/* Option B: Graph API token */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-bold">B</span>
              <h2 className="font-semibold">Option B — Meta Graph API Token</h2>
            </div>
            <p className="text-xs text-muted mb-4">
              A User Access Token from Meta&apos;s Graph API Explorer gives access to public page posts via the
              official API. Valid for ~60 days. No app review needed for public pages with a personal token.
            </p>
            {fbInfo?.has_token && !fbInfo.env_override && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 px-3 py-2 text-xs text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Token configured — {fbInfo.masked_token || "active"}
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Meta User Access Token</label>
              <div className="relative">
                <input
                  type={showFbToken ? "text" : "password"}
                  value={fbToken}
                  onChange={(e) => setFbToken(e.target.value)}
                  placeholder="EAAxxxxxxxxxxxxx…"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm font-mono"
                />
                <button onClick={() => setShowFbToken(v => !v)}
                  className="absolute right-3 top-2.5 text-muted hover:text-fg">
                  {showFbToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-muted/10 border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-fg">How to get a free Graph API token:</p>
              <ol className="space-y-1.5 text-xs text-muted">
                <li className="flex gap-2"><span className="font-bold text-fg">1.</span> Go to <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">Graph API Explorer <ExternalLink className="h-3 w-3" /></a></li>
                <li className="flex gap-2"><span className="font-bold text-fg">2.</span> Select your Facebook app (or create a free one at developers.facebook.com).</li>
                <li className="flex gap-2"><span className="font-bold text-fg">3.</span> Click <strong className="text-fg">Generate Access Token</strong> — grant <code className="font-mono bg-muted/20 px-1 rounded">pages_read_engagement</code> and <code className="font-mono bg-muted/20 px-1 rounded">pages_show_list</code> permissions.</li>
                <li className="flex gap-2"><span className="font-bold text-fg">4.</span> Copy the token and paste it above.</li>
                <li className="flex gap-2"><span className="font-bold text-fg">5.</span> (Optional) Exchange for a 60-day long-lived token using the Access Token Debugger.</li>
              </ol>
            </div>
          </Card>

          {/* Save button */}
          <div className="flex items-center gap-4">
            <button
              onClick={saveFbConfig}
              disabled={savingFb || (!fbCUser.trim() && !fbXs.trim() && !fbToken.trim())}
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40">
              {savingFb ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              {savingFb ? "Saving…" : "Save Facebook Config"}
            </button>
            {fbMsg && (
              <p className={`text-sm ${fbMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                {fbMsg}
              </p>
            )}
          </div>

          <Card>
            <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold mb-1">After saving: resync your Facebook accounts</p>
                <p>Config takes effect on the <strong className="text-fg">next sync</strong>. Go to
                  Clients → select a client → click <strong className="text-fg">Resync</strong> on any
                  Facebook account. The scraper will try cookies first, fall back to Graph API, then
                  mbasic HTML as a last resort.</p>
              </div>
            </div>
          </Card>

          {/* Instagram bonus */}
          <Card>
            <div className="flex items-start gap-3">
              <span className="text-lg shrink-0">📸</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="font-semibold">Instagram — Same Token, Free</h2>
                  {(fbInfo?.has_token || fbInfo?.has_cookies) && (
                    <span className="rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] px-2 py-0.5 font-bold">COVERED</span>
                  )}
                </div>
                <p className="text-xs text-muted mb-3">
                  The <strong className="text-fg">same Facebook access token (Option B)</strong> also unlocks Instagram
                  data via the <strong className="text-fg">Meta Business Discovery API</strong> — no separate setup.
                  When you save the token above, Instagram accounts sync automatically using the Graph API before
                  falling back to the browser extension.
                </p>
                <div className="rounded-xl bg-muted/10 border border-border p-3 space-y-2">
                  <p className="text-xs font-semibold text-fg">Requirements for Instagram Graph API:</p>
                  <ul className="space-y-1.5 text-xs text-muted">
                    <li className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                      Instagram account must be <strong className="text-fg">Business or Creator</strong> type (not personal). Convert in Instagram app → Settings → Account → Switch to Professional Account.
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                      Instagram account must be <strong className="text-fg">linked to a Facebook Page</strong>. Do this in Facebook Page settings → Linked Accounts → Instagram.
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                      Your Graph API token must include <code className="font-mono bg-muted/20 px-1 rounded">instagram_basic</code> and <code className="font-mono bg-muted/20 px-1 rounded">pages_show_list</code> permissions.
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                      Works for any <strong className="text-fg">public Business/Creator account</strong> via Business Discovery — you look them up through your own linked account.
                    </li>
                  </ul>
                </div>
                {!fbInfo?.has_token && (
                  <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                    ↑ Add a Graph API token in Option B above to activate Instagram Graph API for all Instagram accounts.
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

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
