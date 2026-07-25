"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, XCircle, RefreshCw, Eye, EyeOff,
  AlertTriangle, ArrowLeft, Info,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";

export default function InstagramSessionPage() {
  const router = useRouter();
  const [status, setStatus]     = useState<{ configured: boolean; username?: string; source?: string } | null>(null);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState("");

  const [username, setUsername] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [showSess, setShowSess] = useState(false);

  useEffect(() => {
    api.get("/admin/instagram-session")
      .then((r) => setStatus(r.data))
      .catch(() => setStatus({ configured: false }));
  }, []);

  async function saveSession() {
    if (!username.trim() || !sessionId.trim()) return;
    setSaving(true); setSaveMsg(""); setTestResult(null);
    try {
      await api.put("/admin/instagram-session", {
        username: username.trim(),
        session_id: sessionId.trim(),
        csrf_token: csrfToken.trim(),
      });
      setSaveMsg("✓ Session saved successfully.");
      setStatus({ configured: true, username: username.trim(), source: "file" });
      setSessionId(""); setCsrfToken("");
    } catch (e: any) {
      setSaveMsg("✗ " + (e?.response?.data?.detail || "Save failed."));
    } finally {
      setSaving(false);
    }
  }

  async function testSession() {
    setTesting(true); setTestResult(null);
    try {
      const r = await api.post("/admin/instagram-session/test");
      setTestResult(r.data);
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.response?.data?.detail || "Test failed." });
    } finally {
      setTesting(false);
    }
  }

  async function deleteSession() {
    if (!confirm("Remove the Instagram session? Comment scraping will stop working until a new session is configured.")) return;
    try {
      await api.delete("/admin/instagram-session");
      setStatus({ configured: false });
      setTestResult(null);
      setSaveMsg("Session removed.");
    } catch { /**/ }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/5 text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold">Instagram Session</h1>
          <p className="text-sm text-muted">Configure the server-side Instagram login for comment scraping.</p>
        </div>
      </div>

      {/* Current status */}
      <Card>
        <h2 className="font-semibold mb-3">Current Status</h2>
        {status ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {status.configured
                ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                : <XCircle className="h-5 w-5 text-red-500" />}
              <span className="text-sm font-medium">
                {status.configured
                  ? `Session configured${status.username ? ` — @${status.username}` : ""}`
                  : "No session configured"}
              </span>
              {status.source && (
                <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[10px] text-muted">{status.source}</span>
              )}
            </div>

            {status.configured && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={testSession}
                  disabled={testing}
                  className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted/10 disabled:opacity-40">
                  <RefreshCw className={`h-4 w-4 ${testing ? "animate-spin" : ""}`} />
                  {testing ? "Testing…" : "Test Session"}
                </button>
                <button
                  onClick={deleteSession}
                  className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <XCircle className="h-4 w-4" />
                  Remove Session
                </button>
              </div>
            )}

            {testResult && (
              <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${
                testResult.ok
                  ? "bg-green-50 border border-green-200 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                  : "bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/20 dark:text-red-300"
              }`}>
                {testResult.ok
                  ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                  : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
      </Card>

      {/* Configure session */}
      <Card>
        <h2 className="font-semibold mb-4">{status?.configured ? "Update" : "Configure"} Instagram Session</h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Instagram Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="yourusername (without @)"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              <code className="bg-muted/30 px-1 rounded">sessionid</code> Cookie Value
            </label>
            <div className="relative">
              <input
                type={showSess ? "text" : "password"}
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="Paste the sessionid cookie value here"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm font-mono"
              />
              <button onClick={() => setShowSess(v => !v)}
                className="absolute right-3 top-2.5 text-muted hover:text-fg">
                {showSess ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              <code className="bg-muted/30 px-1 rounded">csrftoken</code> Cookie (optional but recommended)
            </label>
            <input
              type="password"
              value={csrfToken}
              onChange={(e) => setCsrfToken(e.target.value)}
              placeholder="Paste csrftoken value (optional)"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono"
            />
          </div>

          <button
            onClick={saveSession}
            disabled={saving || !username.trim() || !sessionId.trim()}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving…" : "Save Session"}
          </button>

          {saveMsg && (
            <p className={`text-sm ${saveMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
              {saveMsg}
            </p>
          )}
        </div>
      </Card>

      {/* Instructions */}
      <Card>
        <h2 className="font-semibold mb-3">How to get the sessionid cookie</h2>
        <ol className="space-y-2 text-sm text-muted list-decimal list-inside">
          <li>Open <strong className="text-fg">instagram.com</strong> in Chrome and make sure you are logged in.</li>
          <li>Press <kbd className="border rounded px-1.5 py-0.5 text-xs font-mono">F12</kbd> to open DevTools.</li>
          <li>Go to <strong className="text-fg">Application</strong> tab → <strong className="text-fg">Cookies</strong> → <code className="bg-muted/30 px-1 rounded">https://www.instagram.com</code></li>
          <li>Find <code className="bg-muted/30 px-1 rounded">sessionid</code> in the list and copy the full <strong className="text-fg">Value</strong>.</li>
          <li>Also copy <code className="bg-muted/30 px-1 rounded">csrftoken</code> if you want more reliable requests.</li>
          <li>Paste both above and click <strong className="text-fg">Save Session</strong>.</li>
          <li>Click <strong className="text-fg">Test Session</strong> to verify it works. Sessions typically last several weeks.</li>
        </ol>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-3 text-xs text-amber-800 dark:text-amber-300">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Security note</p>
            <p>This session is stored on the server and used only for reading public post comments. It is never exposed to end users. Use a dedicated scraper account, not your personal account.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
