"use client";
import { useState } from "react";
import { AlertTriangle, RefreshCw, Play, Link2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";

export default function AnalyzePostPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleAnalyze() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true); setErr("");
    try {
      const res = await api.post("/posts/analyze-url", { url: trimmed });
      router.push(`/listening/${res.data.post_id}`);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Failed to analyze URL. Check it's a valid Instagram or YouTube link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Analyze a Post</h1>
        <p className="text-sm text-muted mt-0.5">
          Paste any Instagram or YouTube post URL — the server fetches all comments and runs sentiment automatically.
        </p>
      </div>

      {/* ── URL input ── */}
      <Card>
        <div className="flex items-start gap-3 mb-4">
          <Link2 className="mt-0.5 h-5 w-5 text-accent shrink-0" />
          <div>
            <h2 className="font-semibold">Post URL</h2>
            <p className="text-sm text-muted mt-0.5">
              Works for any public Instagram post or YouTube video — no login or API key required.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            placeholder="https://www.instagram.com/p/… or https://youtube.com/watch?v=…"
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            autoFocus
          />
          <button
            onClick={handleAnalyze}
            disabled={busy || !url.trim()}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 whitespace-nowrap">
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {busy ? "Loading…" : "Fetch All Comments"}
          </button>
        </div>

        {err && (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {err}
          </p>
        )}

        <p className="mt-3 text-xs text-muted">
          You can also paste URLs directly on the{" "}
          <Link href="/listening" className="text-accent hover:underline">Posts &amp; Comments</Link> page.
        </p>
      </Card>

      {/* ── How it works ── */}
      <Card>
        <h2 className="font-semibold mb-3">How it works</h2>
        <ol className="space-y-2 text-sm text-muted list-decimal list-inside">
          <li>Paste a post URL from Instagram or YouTube above.</li>
          <li>The server automatically detects the platform and fetches the post info.</li>
          <li>All comments are downloaded in the background and analysed individually.</li>
          <li>Each comment gets a Positive / Negative / Neutral label using AI.</li>
          <li>You see a live scrollable feed with sentiment on the post detail page.</li>
        </ol>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 p-3 text-xs text-green-800 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
          <span>No browser extensions, no cookies, no API keys required from any user.</span>
        </div>
      </Card>
    </div>
  );
}
