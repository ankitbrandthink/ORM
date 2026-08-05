"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, Button } from "@/components/ui/primitives";
import { SentimentDonut, TrendLine, EmotionBar } from "@/components/dashboard/charts";
import {
  MessageSquare, TrendingUp, TrendingDown, Minus, AlertTriangle,
  Hash, Zap, Eye, Brain, Loader2, CheckCircle2,
  Globe, Target, ShieldAlert, FileBarChart2, Bell, ArrowRight,
  ThumbsUp, ThumbsDown, Lightbulb, BookOpen, Users, MessageCircle,
  Activity, Star, XCircle, Languages,
} from "lucide-react";

const WORD_COLORS = [
  "text-blue-600","text-indigo-600","text-violet-600","text-cyan-600",
  "text-teal-600","text-emerald-600","text-amber-600","text-rose-600",
];

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon?: any; color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        {Icon && <Icon className={`h-4 w-4 ${color || "text-muted"}`} />}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function SentimentSignal({ pct, label }: { pct: number; label: string }) {
  const level = pct >= 60 ? "High" : pct >= 30 ? "Medium" : "Low";
  const color = label === "Positive"
    ? pct >= 60 ? "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700"
      : "text-muted bg-black/5 border-border"
    : pct >= 40 ? "text-rose-600 bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-700"
    : "text-muted bg-black/5 border-border";
  return (
    <div className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${color}`}>
      {label}: {level} ({pct}%)
    </div>
  );
}

function KeywordPill({ word, count, variant }: { word: string; count?: number; variant: "positive" | "negative" | "neutral" }) {
  const colors = {
    positive: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-700",
    negative: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-700",
    neutral:  "bg-gray-100 text-gray-600 border-gray-200 dark:bg-white/5 dark:text-gray-400 dark:border-white/10",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${colors[variant]}`}>
      {word}
      {count !== undefined && <span className="opacity-60">·{count}</span>}
    </span>
  );
}

function getLanguageStrategy(lang: string, pct: number): { response: string; tone: string; tip: string } {
  const strategies: Record<string, { response: string; tone: string; tip: string }> = {
    hi: { response: "हिंदी में जवाब दें", tone: "Conversational & warm", tip: "Use simple Hindi, avoid jargon. Reference local values and achievements." },
    hindi: { response: "हिंदी में जवाब दें", tone: "Conversational & warm", tip: "Use simple Hindi, avoid jargon. Reference local values and achievements." },
    en: { response: "Respond in English", tone: "Formal & concise", tip: "Use professional tone. Cite facts and data to counter criticism." },
    english: { response: "Respond in English", tone: "Formal & concise", tip: "Use professional tone. Cite facts and data to counter criticism." },
    ur: { response: "اردو میں جواب دیں", tone: "Respectful & empathetic", tip: "Use respectful greetings. Acknowledge concerns before responding." },
    urdu: { response: "اردو میں جواب دیں", tone: "Respectful & empathetic", tip: "Use respectful greetings. Acknowledge concerns before responding." },
    mr: { response: "मराठीत उत्तर द्या", tone: "Community-focused", tip: "Reference local Maharashtra context and development." },
    marathi: { response: "मराठीत उत्तर द्या", tone: "Community-focused", tip: "Reference local Maharashtra context and development." },
    bn: { response: "বাংলায় উত্তর দিন", tone: "Cultural & respectful", tip: "Reference Bengali culture and regional identity." },
    bengali: { response: "বাংলায় উত্তর দিন", tone: "Cultural & respectful", tip: "Reference Bengali culture and regional identity." },
    ta: { response: "தமிழில் பதில் சொல்லுங்கள்", tone: "Pride-based messaging", tip: "Reference Tamil pride and regional achievements." },
    tamil: { response: "தமிழில் பதில் சொல்லுங்கள்", tone: "Pride-based messaging", tip: "Reference Tamil pride and regional achievements." },
    te: { response: "తెలుగులో సమాధానం ఇవ్వండి", tone: "Community & development", tip: "Focus on local development and progress." },
    telugu: { response: "తెలుగులో సమాధానం ఇవ్వండి", tone: "Community & development", tip: "Focus on local development and progress." },
    gu: { response: "ગુજરાતીમાં જવાબ આપો", tone: "Business-friendly & positive", tip: "Reference economic growth and development achievements." },
    gujarati: { response: "ગુજરાતીમાં જવાબ આપો", tone: "Business-friendly & positive", tip: "Reference economic growth and development achievements." },
    pa: { response: "ਪੰਜਾਬੀ ਵਿੱਚ ਜਵਾਬ ਦਿਓ", tone: "Direct & confident", tip: "Use direct language. Reference agricultural and regional achievements." },
    punjabi: { response: "ਪੰਜਾਬੀ ਵਿੱਚ ਜਵਾਬ ਦਿਓ", tone: "Direct & confident", tip: "Use direct language. Reference agricultural and regional achievements." },
  };
  const found = strategies[lang.toLowerCase()];
  if (found) return found;
  return {
    response: `Respond in ${lang}`,
    tone: "Localized & respectful",
    tip: `${pct}% of your audience uses ${lang} — native-language responses significantly increase trust and engagement.`,
  };
}

export default function AnalyticsPage() {
  const [clients, setClients]               = useState<any[]>([]);
  const [clientId, setClientId]             = useState<string>("");
  const [sentiment, setSentiment]           = useState<any>({ counts: {} });
  const [emotion, setEmotion]               = useState<any>({ emotions: {} });
  const [trend, setTrend]                   = useState<any[]>([]);
  const [words, setWords]                   = useState<any[]>([]);
  const [topics, setTopics]                 = useState<any[]>([]);
  const [counterNarrative, setCN]           = useState<any>(null);
  const [pressInsights, setPressInsights]   = useState<any>(null);
  const [commentNarrative, setCommentNar]   = useState<any>(null);
  const [narrativeBriefing, setNarBriefing] = useState<any>(null);
  const [loading, setLoading]               = useState(false);
  const [training, setTraining]             = useState<any>({ status: "idle", progress: 0, stats: {} });
  const [trainBusy, setTrainBusy]           = useState(false);

  useEffect(() => {
    api.get("/clients").then((r) => {
      const list = r.data || [];
      setClients(list);
      if (list.length > 0) setClientId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const p = { client_id: clientId };
    setLoading(true);
    setSentiment({ counts: {} });
    setEmotion({ emotions: {} });
    setTrend([]);
    setWords([]);
    setTopics([]);
    setCN(null);
    setPressInsights(null);
    setCommentNar(null);
    setNarBriefing(null);
    Promise.allSettled([
      api.get("/analytics/sentiment-overview",  { params: p }),
      api.get("/analytics/emotion-breakdown",   { params: p }),
      api.get("/analytics/trend",               { params: p }),
      api.get("/analytics/word-frequency",      { params: p }),
      api.get("/analytics/topic-clusters",      { params: p }),
      api.get("/analytics/counter-narrative",   { params: p }),
      api.get("/analytics/press-insights",      { params: p }),
      api.get("/analytics/comment-narrative",   { params: p }),
      api.get("/analytics/narrative-briefing",  { params: p }),
    ]).then(([s, e, t, w, tc, cn, pi, comNar, narBrf]) => {
      if (s.status === "fulfilled")      setSentiment(s.value.data);
      if (e.status === "fulfilled")      setEmotion(e.value.data);
      if (t.status === "fulfilled")      setTrend(t.value.data?.trend || []);
      if (w.status === "fulfilled")      setWords(w.value.data?.words || []);
      if (tc.status === "fulfilled")     setTopics(tc.value.data?.clusters || []);
      if (cn.status === "fulfilled")     setCN(cn.value.data);
      if (pi.status === "fulfilled")     setPressInsights(pi.value.data);
      if (comNar.status === "fulfilled") setCommentNar(comNar.value.data);
      if (narBrf.status === "fulfilled") setNarBriefing(narBrf.value.data);
    }).finally(() => setLoading(false));
  }, [clientId]);

  async function startTraining() {
    setTrainBusy(true);
    try {
      const params = clientId ? { client_id: clientId } : {};
      await api.post("/analytics/train", null, { params });
      const poll = setInterval(async () => {
        try {
          const r = await api.get("/analytics/train/status");
          setTraining(r.data);
          if (r.data.status === "done" || r.data.status === "error") {
            clearInterval(poll);
            setTrainBusy(false);
          }
        } catch {}
      }, 2000);
    } catch {
      setTrainBusy(false);
    }
  }

  const maxWord = words[0]?.value || 1;
  const selClient = clients.find((c) => c.id === clientId);

  const counts = sentiment.counts || {};
  const totalComments = Object.values(counts).reduce((a: number, b: any) => a + Number(b), 0) as number;
  const posCount = counts.Positive || 0;
  const negCount = counts.Negative || 0;
  const neuCount = counts.Neutral || 0;
  const posPct = totalComments > 0 ? Math.round(posCount * 100 / totalComments) : 0;
  const negPct = totalComments > 0 ? Math.round(negCount * 100 / totalComments) : 0;
  const neuPct = totalComments > 0 ? Math.round(neuCount * 100 / totalComments) : 0;

  const emotions = emotion.emotions || {};
  const topEmotion = Object.entries(emotions).sort(([, a], [, b]) => (b as number) - (a as number))[0];
  const trendDays = trend.length;
  const avgDaily = trendDays > 0
    ? Math.round(trend.reduce((s, d) => s + (d.Positive || 0) + (d.Negative || 0) + (d.Neutral || 0), 0) / trendDays)
    : 0;

  const crisisSignal = negPct >= 50 ? "High" : negPct >= 30 ? "Medium" : "Low";
  const CrisisIcon = negPct >= 50 ? TrendingDown : negPct >= 30 ? Minus : TrendingUp;
  const crisisColor = negPct >= 50 ? "text-rose-600" : negPct >= 30 ? "text-amber-500" : "text-emerald-600";

  // Counter-narrative data
  const ampKeywords: any[]      = counterNarrative?.amplification_keywords || [];
  const counterKeywords: any[]  = counterNarrative?.counter_keywords || [];
  const negClusters: any[]      = counterNarrative?.negative_clusters || [];
  const commentTemplates: any[] = counterNarrative?.comment_templates || [];
  const contentAngles: any[]    = counterNarrative?.content_angles || [];
  const overallStrategy: string = counterNarrative?.overall_strategy || "";
  const cnUrgency: string       = counterNarrative?.urgency || "STABLE";

  // Comment narrative data (from /comment-narrative)
  const posKeywords: string[]  = commentNarrative?.positive_keywords || [];
  const negKeywords: string[]  = commentNarrative?.negative_keywords || [];
  const posSummary: string     = commentNarrative?.positive_summary || "";
  const negSummary: string     = commentNarrative?.negative_summary || "";
  const posSamples: string[]   = commentNarrative?.positive_samples || [];
  const negSamples: string[]   = commentNarrative?.negative_samples || [];

  // Narrative briefing data (from /narrative-briefing)
  const healthScore: number   = narrativeBriefing?.health_score || 0;
  const healthStatus: string  = narrativeBriefing?.health || "stable";
  const addressThese: any[]   = narrativeBriefing?.address_these || [];
  const avoidThese: any[]     = narrativeBriefing?.avoid_these || [];

  // Use comment_narrative keywords as primary fallback for positive/negative
  const showPosKeywords = ampKeywords.length > 0 ? ampKeywords : posKeywords.map((k) => ({ keyword: k }));
  const showNegKeywords = counterKeywords.length > 0 ? counterKeywords : negKeywords.map((k) => ({ keyword: k }));

  // Language breakdown
  const commentLangs: Record<string, number> = pressInsights?.comment_languages || {};
  const totalLangCount = Object.values(commentLangs).reduce((a, b) => a + b, 0);
  const sortedLangs = Object.entries(commentLangs).sort(([, a], [, b]) => b - a).slice(0, 10);

  const urgencyColor = cnUrgency.includes("CRISIS") ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
    : cnUrgency.includes("MONITOR") ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
    : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300";

  const healthColor = healthStatus === "crisis"
    ? { text: "text-rose-700 dark:text-rose-300", bg: "bg-rose-50 dark:bg-rose-900/20", border: "border-rose-200 dark:border-rose-700", bar: "bg-rose-500" }
    : healthStatus === "caution"
    ? { text: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-700", bar: "bg-amber-500" }
    : { text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-700", bar: "bg-emerald-500" };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Social Insights</h1>
          {selClient && (
            <p className="text-xs text-muted mt-0.5">
              Social listening & sentiment intelligence for <span className="font-semibold text-fg">{selClient.name}</span>
              {selClient.industry ? ` · ${selClient.industry}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {clients.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Account:</span>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm min-w-[180px]"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <Link href="/reports/daily"
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent/5 hover:text-accent transition-colors">
            <FileBarChart2 className="h-3.5 w-3.5" /> Daily Reports
          </Link>
          <Link href="/admin/alerts"
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent/5 hover:text-accent transition-colors">
            <Bell className="h-3.5 w-3.5" /> WhatsApp Alerts
          </Link>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Loading analytics…
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Comments" value={totalComments.toLocaleString()}
          sub="across all posts" icon={MessageSquare} color="text-blue-600" />
        <StatCard label="Positive Sentiment" value={`${posPct}%`}
          sub={`${posCount.toLocaleString()} supportive`} icon={TrendingUp} color="text-emerald-600" />
        <StatCard label="Negative Sentiment" value={`${negPct}%`}
          sub={`${negCount.toLocaleString()} critical`} icon={TrendingDown} color="text-rose-600" />
        <StatCard label="Reputation Signal" value={crisisSignal}
          sub={`${negPct}% negative threshold`} icon={CrisisIcon} color={crisisColor} />
      </div>

      {/* Signal row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted uppercase tracking-wide mr-1">Live Signals:</span>
        <SentimentSignal pct={posPct} label="Positive" />
        <SentimentSignal pct={negPct} label="Negative" />
        {topEmotion && (
          <div className="rounded-lg border border-border bg-black/5 dark:bg-white/5 px-3 py-1.5 text-xs font-medium">
            Top Emotion: <span className="font-bold">{topEmotion[0]}</span> ({(topEmotion[1] as number).toLocaleString()})
          </div>
        )}
        {trendDays > 0 && (
          <div className="rounded-lg border border-border bg-black/5 dark:bg-white/5 px-3 py-1.5 text-xs font-medium">
            Avg daily: <span className="font-bold">{avgDaily.toLocaleString()}</span> comments/day
          </div>
        )}
        {cnUrgency && cnUrgency !== "STABLE" && (
          <div className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${urgencyColor}`}>
            <ShieldAlert className="h-3 w-3" /> {cnUrgency}
          </div>
        )}
        {negPct >= 30 && (
          <div className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            Reputation monitoring recommended
          </div>
        )}
      </div>

      {/* ── Sentiment Intelligence Brief ── */}
      {(posSummary || negSummary || posSamples.length > 0 || negSamples.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Positive Brief */}
          <Card className="border-l-4 border-l-emerald-500">
            <div className="mb-2 flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Positive Sentiment Analysis</h3>
              <span className="ml-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                {posPct}% positive
              </span>
            </div>
            {posSummary ? (
              <p className="mb-3 text-sm leading-relaxed text-fg">{posSummary}</p>
            ) : (
              <p className="mb-3 text-sm text-muted">Positive engagement signals from the audience.</p>
            )}
            {posSamples.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  <MessageCircle className="h-3 w-3" /> Sample Positive Comments
                </div>
                {posSamples.slice(0, 3).map((s: string, i: number) => (
                  <div key={i} className="flex gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 p-2.5">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <span className="text-xs leading-relaxed text-fg line-clamp-2">{s}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Negative Brief */}
          <Card className="border-l-4 border-l-rose-500">
            <div className="mb-2 flex items-center gap-2">
              <ThumbsDown className="h-4 w-4 text-rose-600" />
              <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-400">Negative Sentiment Analysis</h3>
              <span className="ml-auto rounded-full bg-rose-100 dark:bg-rose-900/30 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
                {negPct}% negative
              </span>
            </div>
            {negSummary ? (
              <p className="mb-3 text-sm leading-relaxed text-fg">{negSummary}</p>
            ) : (
              <p className="mb-3 text-sm text-muted">Monitoring criticism and negative narratives for counter-strategy.</p>
            )}
            {negSamples.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  <MessageCircle className="h-3 w-3" /> Sample Critical Comments
                </div>
                {negSamples.slice(0, 3).map((s: string, i: number) => (
                  <div key={i} className="flex gap-2 rounded-lg bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 p-2.5">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                    <span className="text-xs leading-relaxed text-fg line-clamp-2">{s}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Main charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SentimentDonut data={sentiment.counts || {}} />
        <TrendLine data={trend} />
        <EmotionBar data={emotion.emotions || {}} />

        {/* Word Cloud */}
        <Card>
          <div className="mb-1 flex items-center gap-2">
            <Hash className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold">Keyword Cloud</h3>
          </div>
          <p className="mb-3 text-xs text-muted">
            Most frequently mentioned words in comments for {selClient?.name || "this account"}. Size = frequency.
          </p>
          {words.length === 0 ? (
            <div className="flex h-36 items-center justify-center text-sm text-muted">No comment data</div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 leading-relaxed">
              {words.map((w, i) => {
                const pct = w.value / maxWord;
                const size = Math.round(11 + pct * 22);
                const opacity = 0.45 + pct * 0.55;
                const color = WORD_COLORS[i % WORD_COLORS.length];
                return (
                  <span key={w.text}
                    style={{ fontSize: `${size}px`, opacity, fontWeight: pct > 0.6 ? 700 : pct > 0.3 ? 600 : 400 }}
                    className={`cursor-default select-none transition-opacity hover:opacity-100 ${color}`}
                    title={`"${w.text}" mentioned ${w.value} times`}>
                    {w.text}
                  </span>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Positive & Negative Sentiment Keywords ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Positive keywords */}
        <Card>
          <div className="mb-1 flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Positive Keywords</h3>
          </div>
          <p className="mb-3 text-xs text-muted">
            Words driving supportive sentiment — amplify these in content to reinforce positive narrative.
          </p>
          {showPosKeywords.length === 0 ? (
            <div className="text-sm text-muted">No positive keyword data yet. Add comments to populate.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {showPosKeywords.map((kw: any, i: number) => (
                <KeywordPill key={kw.keyword || kw.word || kw || i}
                  word={kw.keyword || kw.word || kw}
                  count={kw.frequency || kw.count}
                  variant="positive" />
              ))}
            </div>
          )}
        </Card>

        {/* Negative counter keywords */}
        <Card>
          <div className="mb-1 flex items-center gap-2">
            <ThumbsDown className="h-4 w-4 text-rose-600" />
            <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-400">Negative Keywords</h3>
          </div>
          <p className="mb-3 text-xs text-muted">
            Words associated with criticism or negative sentiment — monitor and develop counter responses.
          </p>
          {showNegKeywords.length === 0 ? (
            <div className="text-sm text-muted">No negative keyword data yet. Add comments to populate.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {showNegKeywords.map((kw: any, i: number) => (
                <KeywordPill key={kw.keyword || kw.word || kw || i}
                  word={kw.keyword || kw.word || kw}
                  count={kw.frequency || kw.count}
                  variant="negative" />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Comment Language Analysis & ORM Language Strategy ── */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Languages className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold">Comment Language Analysis</h3>
        </div>
        <p className="mb-3 text-xs text-muted">
          Languages detected across comments for <b>{selClient?.name || "this account"}</b> — use this to craft targeted, native-language ORM responses that maximise engagement and trust.
        </p>
        {sortedLangs.length === 0 ? (
          <div className="text-sm text-muted">No language data yet. Language detection runs as comments are collected.</div>
        ) : (
          <>
            {/* Language bars */}
            <div className="space-y-2 mb-4">
              {sortedLangs.map(([lang, count]) => {
                const pct = totalLangCount > 0 ? Math.round(count * 100 / totalLangCount) : 0;
                return (
                  <div key={lang}>
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="font-medium capitalize">{lang || "Unknown"}</span>
                      <span className="tabular-nums text-muted">{count.toLocaleString()} comments ({pct}%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-language ORM strategy guide */}
            <div className="border-t border-border pt-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <Globe className="h-3.5 w-3.5" /> ORM Team Language Strategy Guide
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sortedLangs.slice(0, 4).map(([lang, count]) => {
                  const pct = totalLangCount > 0 ? Math.round(count * 100 / totalLangCount) : 0;
                  const strat = getLanguageStrategy(lang, pct);
                  const isTop = sortedLangs[0][0] === lang;
                  return (
                    <div key={lang} className={`rounded-xl border p-3 ${isTop
                      ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                      : "border-border bg-card"}`}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className={`text-xs font-bold capitalize ${isTop ? "text-blue-700 dark:text-blue-300" : "text-fg"}`}>
                          {lang} {isTop && "★ Primary"}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted">{pct}% of audience</span>
                      </div>
                      <div className="space-y-0.5 text-[11px]">
                        <div><span className="text-muted">Respond:</span> <span className="font-medium">{strat.response}</span></div>
                        <div><span className="text-muted">Tone:</span> <span className="font-medium">{strat.tone}</span></div>
                        <div className={`mt-1.5 rounded-lg p-2 text-[10px] leading-relaxed ${isTop ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300" : "bg-black/5 dark:bg-white/5 text-muted"}`}>
                          💡 {strat.tip}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Shift strategy tip */}
              <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-900/20 p-3 text-xs text-violet-700 dark:text-violet-300">
                <span className="font-semibold">Narrative Shift Strategy:</span>{" "}
                {negPct >= 40
                  ? `High negativity (${negPct}%) detected. Prioritise ${sortedLangs[0]?.[0] || "native"}-language positive counter-content on the same topics driving criticism.`
                  : negPct >= 25
                  ? `Moderate criticism at ${negPct}%. Focus ${sortedLangs[0]?.[0] || "native"} responses on achievements and addressing top complaint keywords.`
                  : `Sentiment is healthy (${posPct}% positive). Reinforce with ${sortedLangs[0]?.[0] || "native"}-language content amplifying top positive keywords.`}
              </div>
            </div>
          </>
        )}
      </Card>

      {/* ── ORM Action Briefing (from narrative-briefing) ── */}
      {(addressThese.length > 0 || avoidThese.length > 0 || healthScore > 0) && (
        <Card className={`border-l-4 ${healthColor.border} border-l-${healthStatus === "crisis" ? "rose" : healthStatus === "caution" ? "amber" : "emerald"}-500`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold">ORM Action Briefing</h3>
            </div>
            {healthScore > 0 && (
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 ${healthColor.bg} ${healthColor.border}`}>
                <span className={`text-xs font-bold ${healthColor.text} capitalize`}>
                  {healthStatus} · {healthScore}/100
                </span>
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/10">
                  <div className={`h-full rounded-full transition-all ${healthColor.bar}`} style={{ width: `${healthScore}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Address these */}
            {addressThese.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Issues to Address Proactively
                </div>
                <div className="space-y-2">
                  {addressThese.map((item: any, i: number) => {
                    const text = typeof item === "string" ? item : item.topic || item.issue || item.narrative || JSON.stringify(item);
                    return (
                      <div key={i} className="flex gap-2 rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-900/10 p-2.5">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600" />
                        <span className="text-xs leading-relaxed">{text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Avoid these */}
            {avoidThese.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <XCircle className="h-3.5 w-3.5 text-rose-500" /> What to Avoid
                </div>
                <div className="space-y-2">
                  {avoidThese.map((item: any, i: number) => {
                    const text = typeof item === "string" ? item : item.reason || item.source || item.narrative || JSON.stringify(item);
                    return (
                      <div key={i} className="flex gap-2 rounded-lg border border-rose-100 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-900/10 p-2.5">
                        <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-rose-500" />
                        <span className="text-xs leading-relaxed">{text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Topic Clusters */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Zap className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold">Topic Clusters & Narratives</h3>
        </div>
        <p className="mb-3 text-xs text-muted">
          Recurring themes, stances, and narratives extracted from comment analysis on {selClient?.name || "this account"}'s posts.
        </p>
        {topics.length === 0 ? (
          <div className="text-sm text-muted">No topic data available. Generate AI narratives on posts to populate this.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {topics.map((t, i) => {
              const pct = t.size / 100;
              const bg = pct > 0.7
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-700"
                : pct > 0.4
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700"
                : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400 border-gray-200 dark:border-white/10";
              return (
                <div key={t.topic + i}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${bg}`}>
                  <span>{t.topic}</span>
                  <span className="opacity-60">·</span>
                  <span className="tabular-nums opacity-70">{t.weight.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Strategy & Counter-Narrative ── */}
      {(overallStrategy || negClusters.length > 0 || commentTemplates.length > 0 || contentAngles.length > 0) && (
        <Card className={`border-2 ${
          cnUrgency.includes("CRISIS") ? "border-rose-200 dark:border-rose-800"
          : cnUrgency.includes("MONITOR") ? "border-amber-200 dark:border-amber-800"
          : "border-emerald-200 dark:border-emerald-800"
        }`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold">Engagement Strategy</h3>
            </div>
            {cnUrgency && (
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${urgencyColor}`}>
                {cnUrgency}
              </span>
            )}
          </div>

          {overallStrategy && (
            <div className="mb-4 rounded-xl border border-border bg-card p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide">
                <Lightbulb className="h-3.5 w-3.5" /> Recommended Strategy
              </div>
              <p className="text-sm leading-relaxed">{overallStrategy}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {negClusters.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide">
                  <ShieldAlert className="h-3.5 w-3.5 text-rose-500" /> Negative Comment Clusters
                </div>
                <div className="space-y-2">
                  {negClusters.slice(0, 5).map((cluster: any, i: number) => (
                    <div key={i} className="rounded-lg border border-rose-100 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-900/10 p-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                          {cluster.keyword || cluster.topic || cluster.cluster || `Cluster ${i + 1}`}
                        </span>
                        {(cluster.frequency || cluster.count) && (
                          <span className="text-[10px] tabular-nums text-rose-600/70">
                            ×{cluster.frequency || cluster.count}
                          </span>
                        )}
                      </div>
                      {cluster.examples && cluster.examples.length > 0 && (
                        <p className="text-[11px] text-muted italic line-clamp-1">"{cluster.examples[0]}"</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {commentTemplates.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide">
                  <BookOpen className="h-3.5 w-3.5 text-blue-500" /> Suggested Response Templates
                </div>
                <div className="space-y-2">
                  {commentTemplates.slice(0, 3).map((tmpl: any, i: number) => (
                    <div key={i} className="rounded-lg border border-blue-100 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-900/10 p-2.5">
                      {tmpl.for && (
                        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                          For: {tmpl.for}
                        </div>
                      )}
                      <p className="text-xs leading-relaxed text-fg">{tmpl.template || tmpl.text || tmpl}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {contentAngles.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-muted uppercase tracking-wide">Content Angles to Amplify</div>
              <div className="flex flex-wrap gap-1.5">
                {contentAngles.map((angle: any, i: number) => (
                  <span key={i}
                    className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
                    {angle.angle || angle.topic || angle}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* AI Model Training */}
      <Card className="bg-gradient-to-r from-purple-500/5 to-transparent border-purple-200/50 dark:border-purple-800/30">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-semibold">AI Model Training</h3>
          </div>
          <Button
            onClick={startTraining}
            disabled={trainBusy || training.status === "running"}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1.5"
          >
            {trainBusy || training.status === "running" ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Training…</>
            ) : (
              <><Brain className="h-3.5 w-3.5" /> Train on {totalComments.toLocaleString()} comments</>
            )}
          </Button>
        </div>
        <p className="mb-3 text-xs text-muted">
          Train the AI sentiment model on accumulated comment data for{" "}
          <b>{selClient?.name || "this account"}</b>. Training improves heuristic accuracy and updates
          the sentiment lexicon — detecting relevant positive/negative language, emojis, and cultural patterns.
        </p>
        {(training.status === "running" || training.status === "queued") && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>Training in progress…</span>
              <span>{training.progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-purple-100 dark:bg-purple-900/30">
              <div className="h-full bg-purple-500 rounded-full transition-all duration-500"
                style={{ width: `${training.progress}%` }} />
            </div>
          </div>
        )}
        {training.status === "done" && training.stats && (
          <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-700 dark:text-purple-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Training complete — Lexicon v{training.stats.lexicon_version}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted">Samples used: </span><b>{training.stats.total_samples?.toLocaleString()}</b></div>
              <div>
                <span className="text-muted">Heuristic accuracy: </span>
                <b className={training.stats.heuristic_accuracy_pct >= 70 ? "text-emerald-600" : "text-amber-600"}>
                  {training.stats.heuristic_accuracy_pct}%
                </b>
              </div>
            </div>
            {training.stats.new_positive_words?.length > 0 && (
              <div className="text-xs">
                <span className="text-muted">New positive signals: </span>
                <span className="text-emerald-600">{training.stats.new_positive_words.slice(0, 8).join(", ")}</span>
              </div>
            )}
            {training.stats.new_negative_words?.length > 0 && (
              <div className="text-xs">
                <span className="text-muted">New negative signals: </span>
                <span className="text-rose-600">{training.stats.new_negative_words.slice(0, 8).join(", ")}</span>
              </div>
            )}
          </div>
        )}
        {training.status === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-3 text-xs text-red-600">
            {training.stats?.error || "Training failed. Try again after adding more comment data."}
          </div>
        )}
      </Card>

      {/* Social Listening Summary */}
      <Card className="bg-gradient-to-r from-accent/5 to-transparent">
        <div className="mb-2 flex items-center gap-2">
          <Eye className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold">Social Listening Summary</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 text-xs">
            <div className="font-semibold text-fg">Audience Sentiment</div>
            <div className="flex gap-2">
              <span className="text-emerald-600">✅ Positive: {posCount.toLocaleString()} ({posPct}%)</span>
              <span className="text-rose-500">❌ Negative: {negCount.toLocaleString()} ({negPct}%)</span>
            </div>
            <div className="text-muted">⚪ Neutral: {neuCount.toLocaleString()} ({neuPct}%)</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
              <div className="flex h-full">
                <div className="bg-emerald-500" style={{ width: `${posPct}%` }} />
                <div className="bg-rose-500" style={{ width: `${negPct}%` }} />
                <div className="bg-gray-400" style={{ width: `${neuPct}%` }} />
              </div>
            </div>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="font-semibold text-fg">Listening Signals</div>
            <div>📊 Total engagement: <b>{totalComments.toLocaleString()}</b> comments analysed</div>
            {topEmotion && <div>💡 Dominant emotion: <b>{topEmotion[0]}</b></div>}
            <div>📅 Active days tracked: <b>{trendDays}</b></div>
            {avgDaily > 0 && <div>⚡ Avg comments/day: <b>{avgDaily.toLocaleString()}</b></div>}
            <div>🔍 Unique topics: <b>{topics.length}</b></div>
            <div>🔤 Keywords tracked: <b>{words.length}</b></div>
            {sortedLangs.length > 0 && (
              <div>🌐 Top language: <b className="capitalize">{sortedLangs[0][0]}</b> ({Math.round(sortedLangs[0][1] * 100 / (totalLangCount || 1))}%)</div>
            )}
            {healthScore > 0 && (
              <div className={healthColor.text}>🏥 Reputation health: <b>{healthScore}/100 ({healthStatus})</b></div>
            )}
            <div className={`mt-1 font-semibold ${crisisColor}`}>
              {negPct >= 50 ? "⚠️ Crisis monitoring active" : negPct >= 30 ? "⚠️ Elevated negative — monitor" : "✅ Sentiment stable"}
            </div>
          </div>
        </div>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/reports/daily"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-accent/50 hover:bg-accent/5 transition-all group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 shrink-0">
            <FileBarChart2 className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Daily Reports</p>
            <p className="text-xs text-muted">View per-client sentiment summaries, EOD reports, and send via WhatsApp</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted group-hover:text-accent transition-colors shrink-0" />
        </Link>
        <Link href="/admin/alerts"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-accent/50 hover:bg-accent/5 transition-all group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 shrink-0">
            <Bell className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">WhatsApp Alert Config</p>
            <p className="text-xs text-muted">Configure WhatsApp numbers, alert thresholds, and MessageCentral credentials</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted group-hover:text-accent transition-colors shrink-0" />
        </Link>
      </div>
    </div>
  );
}
