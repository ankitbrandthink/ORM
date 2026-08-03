"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2, Radio, BarChart3, ArrowRight, Smile, Frown, Meh,
  AlertTriangle, RefreshCw, MessageSquare, Clock, Bell, BellOff,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";
import { SentimentDonut, TrendLine, EmotionBar, CommentVolumeChart } from "@/components/dashboard/charts";

function StatCard({ icon, label, value, hint, tone = "default" }: any) {
  const tones: Record<string, string> = {
    good: "text-green-600", bad: "text-red-500", warn: "text-orange-500", default: "text-fg",
  };
  return (
    <Card>
      <div className="flex items-center gap-2 text-xs text-muted">{icon}{label}</div>
      <div className={`mt-1 text-[32px] font-semibold leading-none ${tones[tone]}`}>{value}</div>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </Card>
  );
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export default function HomePage() {
  const [clients, setClients]       = useState<any[]>([]);
  const [clientId, setClientId]     = useState<string>("");
  const [sentiment, setSentiment]   = useState<any>({ counts: {}, total: 0, percentages: {} });
  const [emotion, setEmotion]       = useState<any>({ emotions: {} });
  const [trend, setTrend]           = useState<any[]>([]);
  const [crisis, setCrisis]         = useState<any>({ crisis_score: 0, level: "Low" });
  const [tickets, setTickets]       = useState<any[]>([]);
  const [summary, setSummary]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [tick, setTick]             = useState(0); // forces timeAgo re-render

  // Tick every 30 s so "X minutes ago" stays fresh
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Load cached dashboard data from localStorage (shows instantly before API responds)
  const loadCache = useCallback((cid: string) => {
    try {
      const raw = localStorage.getItem(`dashboard_cache_${cid}`);
      if (!raw) return false;
      const cache = JSON.parse(raw);
      if (cache.sentiment) setSentiment(cache.sentiment);
      if (cache.emotion)   setEmotion(cache.emotion);
      if (cache.trend)     setTrend(cache.trend);
      if (cache.crisis)    setCrisis(cache.crisis);
      if (cache.summary)   setSummary(cache.summary);
      if (cache.tickets)   setTickets(cache.tickets);
      return true;
    } catch { return false; }
  }, []);

  const refreshData = useCallback(async (id?: string) => {
    const cid = id ?? clientId;
    if (!cid) return;
    setSyncing(true);
    // Show cache immediately; only show spinner if no cache
    const hasCached = loadCache(cid);
    if (!hasCached) setLoading(true);
    try {
      const p = { client_id: cid };
      const [s, e, t, c, sum, tkt] = await Promise.allSettled([
        api.get("/analytics/sentiment-overview", { params: p }),
        api.get("/analytics/emotion-breakdown",  { params: p }),
        api.get("/analytics/trend",              { params: p }),
        api.get("/analytics/crisis-score",       { params: p }),
        api.get("/analytics/client-summary"),
        api.get("/tickets"),
      ]);
      const fresh: any = {};
      if (s.status === "fulfilled") { setSentiment(s.value.data); fresh.sentiment = s.value.data; }
      if (e.status === "fulfilled") { setEmotion(e.value.data);   fresh.emotion   = e.value.data; }
      if (t.status === "fulfilled") { setTrend(t.value.data.trend || []); fresh.trend = t.value.data.trend || []; }
      if (c.status === "fulfilled") { setCrisis(c.value.data);    fresh.crisis    = c.value.data; }
      if (sum.status === "fulfilled") { setSummary(sum.value.data || []); fresh.summary = sum.value.data || []; }
      if (tkt.status === "fulfilled") { setTickets(tkt.value.data || []); fresh.tickets = tkt.value.data || []; }
      // Persist to localStorage so next load is instant
      try { localStorage.setItem(`dashboard_cache_${cid}`, JSON.stringify(fresh)); } catch {}
      setLastSynced(new Date());
    } catch {
      // silent
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, [clientId, loadCache]);

  // Initial load — clients then first data load
  useEffect(() => {
    api.get("/clients").then((r) => {
      const list = r.data || [];
      setClients(list);
      if (list.length > 0) {
        setClientId(list[0].id);
        refreshData(list[0].id);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload charts when client changes (not on first mount — handled above)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (clientId) refreshData(clientId);
  }, [clientId]); // eslint-disable-line

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(() => {
      if (clientId && !syncing) refreshData();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [clientId, syncing, refreshData]);

  // ── WA alerts toggle ─────────────────────────────────────────────────────
  const [waEnabled,  setWaEnabled]  = useState<boolean | null>(null);
  const [waConfig,   setWaConfig]   = useState<any>(null);
  const [waToggling, setWaToggling] = useState(false);

  useEffect(() => {
    api.get("/whatsapp/config").then((r) => {
      setWaConfig(r.data);
      setWaEnabled(r.data.enabled ?? true);
    }).catch(() => {});
  }, []);

  async function toggleAlerts() {
    if (!waConfig || waToggling) return;
    const next = !waEnabled;
    setWaEnabled(next);
    setWaToggling(true);
    try {
      await api.put("/whatsapp/config", { ...waConfig, enabled: next });
      setWaConfig((c: any) => ({ ...c, enabled: next }));
    } catch { setWaEnabled(!next); }
    finally { setWaToggling(false); }
  }

  const open       = tickets.filter((t) => !["Resolved", "Closed"].includes(t.status)).length;
  const pos        = sentiment.percentages?.Positive ?? 0;
  const neg        = sentiment.percentages?.Negative ?? 0;
  const hasData    = sentiment.total > 0;
  const crisisTone = crisis.level === "High" ? "bad" : crisis.level === "Medium" ? "warn" : "good";
  const selClient  = clients.find((c) => c.id === clientId);
  const selName    = selClient?.name ?? "";
  const selSummary = summary.find((s) => s.id === clientId);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">Real-time sentiment monitoring across all your accounts.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Account selector dropdown */}
          {clients.length > 0 && (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm min-w-[200px]"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          {/* WA alerts toggle */}
          {waEnabled !== null && (
            <button
              onClick={toggleAlerts}
              disabled={waToggling}
              title={waEnabled ? "WhatsApp alerts are ON — click to pause" : "WhatsApp alerts are PAUSED — click to enable"}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors disabled:opacity-60 ${
                waEnabled
                  ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "border-border bg-card text-muted hover:text-fg hover:border-orange-400"
              }`}
            >
              {waEnabled
                ? <><Bell className="h-4 w-4" /> Alerts ON</>
                : <><BellOff className="h-4 w-4" /> Paused</>}
            </button>
          )}

          {/* Sync / Refresh button */}
          <button
            onClick={() => refreshData()}
            disabled={syncing}
            title={lastSynced ? `Last synced: ${timeAgo(lastSynced)}` : "Sync data"}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted hover:text-fg hover:border-accent transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin text-accent" : ""}`} />
            {syncing ? "Syncing…" : "Sync"}
          </button>
        </div>
      </div>

      {/* ── Last synced + account context ── */}
      {selName && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/60 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Viewing:</span>
            <span className="font-semibold text-fg">{selName}</span>
            {selSummary && (
              <>
                <span className="text-border">·</span>
                <span className="text-muted text-xs">{selSummary.comments?.toLocaleString()} comments</span>
                <span className="text-green-600 text-xs font-medium">{selSummary.percentages?.Positive ?? 0}% pos</span>
                <span className="text-red-500 text-xs font-medium">{selSummary.percentages?.Negative ?? 0}% neg</span>
              </>
            )}
          </div>
          {lastSynced && (
            <div className="flex items-center gap-1 text-xs text-muted">
              <Clock className="h-3 w-3" />
              Last synced: <span className="font-medium text-fg">{timeAgo(lastSynced)}</span>
              <span className="ml-2 text-muted/60">· auto-refreshes every 5 min</span>
            </div>
          )}
          {!lastSynced && loading && (
            <span className="text-xs text-muted">Loading data…</span>
          )}
        </div>
      )}

      {/* ── First-time setup guide ── */}
      {clients.length === 0 && (
        <Card className="bg-accent/5">
          <h2 className="mb-3 text-sm font-semibold">Get started in 3 easy steps</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { n: 1, icon: <Building2 className="h-5 w-5" />, title: "Add your brand & accounts",
                text: "Tell us your brand and paste your social page links.", href: "/admin/clients", cta: "Add accounts" },
              { n: 2, icon: <Radio className="h-5 w-5" />, title: "Bring in posts",
                text: "Paste any post link to read its comments instantly.", href: "/listening", cta: "Add a post" },
              { n: 3, icon: <BarChart3 className="h-5 w-5" />, title: "See the insights",
                text: "Charts show what people feel — happy, upset or neutral.", href: "/analytics", cta: "View insights" },
            ].map((s) => (
              <Link key={s.n} href={s.href}
                className="rounded-xl border border-border bg-card p-4 transition-all hover:border-accent">
                <div className="flex items-center gap-2 text-accent">{s.icon}
                  <span className="text-xs font-semibold">STEP {s.n}</span>
                </div>
                <div className="mt-2 text-sm font-medium">{s.title}</div>
                <p className="mt-1 text-xs text-muted">{s.text}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs text-accent">
                  {s.cta} <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Smile className="h-4 w-4 text-green-500" />} label="Positive comments" tone="good"
          value={`${pos}%`} hint="Share that sounds positive." />
        <StatCard icon={<Frown className="h-4 w-4 text-red-500" />} label="Negative comments"
          tone={neg > 40 ? "bad" : "default"} value={`${neg}%`} hint="Share that sounds negative." />
        <StatCard icon={<Meh className="h-4 w-4 text-gray-500" />} label="Total comments read"
          value={sentiment.total?.toLocaleString() ?? 0} hint="Comments analysed." />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Risk level" tone={crisisTone}
          value={crisis.level} hint="High = act fast." />
      </div>

      {/* ── Charts ── */}
      {hasData ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-muted">Overall sentiment (green = happy, red = upset)</p>
              <SentimentDonut data={sentiment.counts || {}} />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">Mood over time — is it improving?</p>
              <TrendLine data={trend} />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">Emotions in the comments</p>
              <EmotionBar data={emotion.emotions || {}} />
            </div>
            <Card>
              <h3 className="mb-2 text-sm font-medium">Open reply queue</h3>
              <p className="text-[32px] font-semibold">{open}</p>
              <p className="text-xs text-muted">Items needing a reply.</p>
              <Link href="/orm" className="mt-2 inline-flex items-center gap-1 text-sm text-accent">
                Go to Reply Queue <ArrowRight className="h-3 w-3" />
              </Link>
            </Card>
          </div>
          {/* ── Comment Volume Overview (7 / 30 / 90 days) ── */}
          <CommentVolumeChart clientId={clientId} clientName={selName} />
        </>
      ) : !loading ? (
        <Card className="py-10 text-center text-muted">
          No comments analysed yet for <b>{selName}</b> — add a post to see charts here.
          <div className="mt-3">
            <Link href="/listening" className="inline-flex items-center gap-1 text-sm text-accent">
              Add a post <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="flex items-center justify-center gap-2 py-16 text-muted">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading data for {selName}…</span>
        </Card>
      )}

      {/* ── Sentiment analysis note ── */}
      {hasData && (
        <div className="rounded-xl border border-border bg-card/40 px-4 py-3 text-[11px] leading-relaxed text-muted">
          <span className="font-semibold text-fg">How sentiment is calculated: </span>
          Every public comment on each post linked to <b>{selName}</b> is read by our AI model.
          Each comment is individually classified as <span className="text-green-600 font-medium">Positive</span>,{" "}
          <span className="text-muted font-medium">Neutral</span>, or{" "}
          <span className="text-red-500 font-medium">Negative</span> based on word choice, tone, and context —
          not just keywords. The model evaluates the full sentence, so phrases like "not bad" are scored correctly.
          Risk level is <b>Low</b> when negative comments are below 25%, <b>Medium</b> at 25–40%, and <b>High</b> above 40%.
          Charts update automatically every 5 minutes. Use the <MessageSquare className="inline h-3 w-3" />{" "}
          <Link href="/listening" className="text-accent hover:underline">Posts & Comments</Link> page
          to see per-post sentiment and export detailed PDF reports.
        </div>
      )}
    </div>
  );
}
