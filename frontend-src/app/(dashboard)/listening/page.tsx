"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw, Plus, CheckCircle2, ExternalLink, BarChart3,
  TrendingUp, Loader2, Link2, FileSpreadsheet, ChevronDown, ChevronUp,
  FileDown, Info, Search,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, Button } from "@/components/ui/primitives";
import { SentimentBar } from "@/components/dashboard/SentimentBar";
import { SentimentDonut } from "@/components/dashboard/charts";
import { PostRow } from "@/components/dashboard/PostRow";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { VolumeChart } from "@/components/dashboard/VolumeChart";
import { CommentAnalysisProgress } from "@/components/listening/CommentAnalysisProgress";
import { useDateFilter } from "@/hooks/useDateFilter";
import { useConnectSocial, loginGatePlatform } from "@/components/social/ConnectSocial";

const PAGE_SIZE = 10;

// ── Time presets ─────────────────────────────────────────────────────────────
const PRESETS = [
  { key: "daily",   label: "Daily",   gran: "daily" as const, days: 7  },
  { key: "weekly",  label: "Weekly",  gran: "daily" as const, days: 30 },
  { key: "monthly", label: "Monthly", gran: "daily" as const, days: 90 },
] as const;
type PresetKey = typeof PRESETS[number]["key"];

const DEFAULT_PRESET: PresetKey = "monthly";
const DEFAULT_DAYS = 90;

function get90dWindow() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - DEFAULT_DAYS);
  return { from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0] };
}

function presetWindow(preset: typeof PRESETS[number]) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - preset.days);
  return {
    from: from.toISOString().split("T")[0],
    to:   to.toISOString().split("T")[0],
  };
}

function platformOf(url: string) {
  const u = (url || "").toLowerCase();
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  return "facebook";
}

function fmtNum(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();  // show exact number below 10K
}

function PlatformIcon({ platform, size = 22 }: { platform: string; size?: number }) {
  const r = Math.round(size * 0.3);
  const b: React.CSSProperties = { width: size, height: size, borderRadius: r, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  if (platform === "instagram") return (
    <div style={{ ...b, background: "linear-gradient(135deg,#405DE6,#833AB4 40%,#E1306C 70%,#FCAF45)" }}>
      <svg viewBox="0 0 20 20" width={size * 0.62} height={size * 0.62} fill="none">
        <rect x="3" y="3" width="14" height="14" rx="3.5" stroke="white" strokeWidth="1.5"/>
        <circle cx="10" cy="10" r="3.5" stroke="white" strokeWidth="1.5"/>
        <circle cx="14.5" cy="5.5" r="1.2" fill="white"/>
      </svg>
    </div>
  );
  if (platform === "facebook") return (
    <div style={{ ...b, background: "#1877F2" }}>
      <svg viewBox="0 0 20 20" width={size * 0.58} height={size * 0.58} fill="white">
        <path d="M11 10h2.3l.4-2.5H11V6.2c0-.7.3-1.2 1.3-1.2h1.4V2.4A17 17 0 0 0 11.5 2C9.3 2 7.5 3.5 7.5 6.3V7.5H5V10h2.5v8H11v-8z"/>
      </svg>
    </div>
  );
  if (platform === "twitter") return (
    <div style={{ ...b, background: "#0f0f0f" }}>
      <svg viewBox="0 0 20 20" width={size * 0.6} height={size * 0.6} fill="white">
        <path d="M3 3.5l5.5 6.3L3 16.5h1.6l4.8-5.5 3.8 5.5H17l-5.9-6.7 5.2-5.8H14.8l-4.3 4.9-3.4-4.9H3z"/>
      </svg>
    </div>
  );
  if (platform === "youtube") return (
    <div style={{ ...b, background: "#FF0000" }}>
      <svg viewBox="0 0 20 20" width={size * 0.65} height={size * 0.65} fill="white">
        <path d="M17.5 6.2s-.2-1.3-.8-1.9c-.7-.8-1.5-.8-1.9-.8C12.6 3.4 10 3.4 10 3.4s-2.6 0-4.8.1c-.4 0-1.2.1-1.9.8-.6.6-.8 1.9-.8 1.9S2.3 7.8 2.3 9.5v1.4c0 1.7.2 3.3.2 3.3s.2 1.3.8 1.9c.7.8 1.7.7 2.1.8C6.8 17 10 17 10 17s2.6 0 4.8-.1c.4 0 1.2-.1 1.9-.8.6-.6.8-1.9.8-1.9s.2-1.6.2-3.3V9.5c0-1.7-.2-3.3-.2-3.3zM8.4 12.6V7.4l5.3 2.6-5.3 2.6z"/>
      </svg>
    </div>
  );
  return (
    <div style={{ ...b, background: "#64748b" }}>
      <svg viewBox="0 0 20 20" width={size * 0.62} height={size * 0.62} fill="none">
        <circle cx="10" cy="10" r="7" stroke="white" strokeWidth="1.5"/>
        <ellipse cx="10" cy="10" rx="3.5" ry="7" stroke="white" strokeWidth="1.2"/>
        <line x1="3" y1="10" x2="17" y2="10" stroke="white" strokeWidth="1.2"/>
      </svg>
    </div>
  );
}

function mergeTrends(clients: { name: string; trend: { date: string; Positive: number; Negative: number; Neutral: number }[] }[]) {
  const map: Record<string, { Positive: number; Negative: number; Neutral: number }> = {};
  for (const c of clients) {
    for (const d of c.trend) {
      if (!map[d.date]) map[d.date] = { Positive: 0, Negative: 0, Neutral: 0 };
      map[d.date].Positive += d.Positive;
      map[d.date].Negative += d.Negative;
      map[d.date].Neutral  += d.Neutral;
    }
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
}

// ── PDF export ──────────────────────────────────────────────────────────────
function buildExportHTML(opts: {
  accountName: string;
  preset: typeof PRESETS[number];
  gran: string;
  data: { date: string; Positive: number; Negative: number; Neutral: number }[];
  allAccounts: { name: string; trend: any[] }[];
}) {
  const { accountName, preset, gran, data, allAccounts } = opts;
  const total = data.reduce((s, d) => s + d.Positive + d.Negative + d.Neutral, 0);
  const pos   = data.reduce((s, d) => s + d.Positive, 0);
  const neg   = data.reduce((s, d) => s + d.Negative, 0);
  const neu   = data.reduce((s, d) => s + d.Neutral, 0);
  const pct   = total ? Math.round(pos * 100 / total) : 0;
  const npct  = total ? Math.round(neg * 100 / total) : 0;
  const npct2 = total ? Math.round(neu * 100 / total) : 0;
  const risk  = npct > 40 ? "High" : npct > 25 ? "Medium" : "Low";
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const granLabel = gran.charAt(0).toUpperCase() + gran.slice(1);

  const tableRows = data.map((d) => {
    const t   = d.Positive + d.Negative + d.Neutral;
    const pp  = t ? Math.round(d.Positive * 100 / t) : 0;
    const np  = t ? Math.round(d.Negative * 100 / t) : 0;
    const tone = pp > 50 ? "Positive" : np > 40 ? "Negative" : "Mixed/Neutral";
    const clr  = pp > 50 ? "#16a34a" : np > 40 ? "#dc2626" : "#64748b";
    return `<tr>
      <td>${d.date}</td>
      <td style="text-align:right">${t.toLocaleString()}</td>
      <td style="text-align:right;color:#16a34a">${d.Positive.toLocaleString()} (${pp}%)</td>
      <td style="text-align:right;color:#dc2626">${d.Negative.toLocaleString()} (${np}%)</td>
      <td style="text-align:right;color:#64748b">${d.Neutral.toLocaleString()}</td>
      <td style="text-align:center;color:${clr};font-weight:600">${tone}</td>
    </tr>`;
  }).join("");

  const accountRows = allAccounts.map((c) => {
    const ct  = c.trend.reduce((s: number, d: any) => s + d.Positive + d.Negative + d.Neutral, 0);
    const cp  = c.trend.reduce((s: number, d: any) => s + d.Positive, 0);
    const cn  = c.trend.reduce((s: number, d: any) => s + d.Negative, 0);
    const cpp = ct ? Math.round(cp * 100 / ct) : 0;
    const cnp = ct ? Math.round(cn * 100 / ct) : 0;
    const cr  = cnp > 40 ? "High" : cnp > 25 ? "Medium" : "Low";
    const riskClr = cr === "High" ? "#dc2626" : cr === "Medium" ? "#d97706" : "#16a34a";
    return `<tr>
      <td style="font-weight:500">${c.name}</td>
      <td style="text-align:right">${ct.toLocaleString()}</td>
      <td style="text-align:right;color:#16a34a">${cpp}%</td>
      <td style="text-align:right;color:#dc2626">${cnp}%</td>
      <td style="text-align:center;color:${riskClr};font-weight:600">${cr}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ORM Report — ${accountName} (${preset.label})</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;background:#fff}
.page{max-width:920px;margin:0 auto;padding:40px 32px}
.header{background:#1a2744;color:#fff;padding:28px 32px;border-radius:12px;margin-bottom:32px}
.header h1{font-size:22px;font-weight:700;margin-bottom:4px}
.header p{font-size:13px;color:#bfdbfe}
.meta{display:flex;gap:20px;margin-top:14px;flex-wrap:wrap}
.meta span{font-size:11px;color:#93c5fd}.meta b{color:#fff}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}
.kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center}
.kpi .val{font-size:26px;font-weight:700}.kpi .lbl{font-size:11px;color:#64748b;margin-top:4px}
.risk-Low{color:#16a34a}.risk-Medium{color:#d97706}.risk-High{color:#dc2626}
.sent-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:28px}
.sent-card{border-radius:10px;padding:16px;text-align:center}
.sent-pos{background:#f0fdf4;border:1px solid #bbf7d0}
.sent-neg{background:#fef2f2;border:1px solid #fecaca}
.sent-neu{background:#f8fafc;border:1px solid #e2e8f0}
.sent-card .pct{font-size:28px;font-weight:700}
.sent-pos .pct{color:#16a34a}.sent-neg .pct{color:#dc2626}.sent-neu .pct{color:#64748b}
.sent-card .cnt{font-size:11px;color:#64748b;margin-top:3px}
.sent-card .lbl{font-size:12px;font-weight:600;margin-top:3px}
.sent-card p{font-size:11px;color:#64748b;margin-top:8px;line-height:1.6}
.section{margin-bottom:28px}
.section h2{font-size:14px;font-weight:700;color:#1a2744;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e2e8f0}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#1a2744;color:#fff;padding:8px 12px;text-align:left;font-size:11px}
td{padding:7px 12px;border-bottom:1px solid #f1f5f9}
tr:nth-child(even) td{background:#f8fafc}
.note{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:18px;font-size:12px;line-height:1.75;color:#1e3a70;margin-bottom:28px}
.note h3{font-size:13px;font-weight:700;color:#1a2744;margin-bottom:10px}
.note .row{margin-bottom:10px}
.note .label{font-weight:700;color:#1a2744}
footer{text-align:center;font-size:10px;color:#94a3b8;margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .no-print{display:none}
  .page{padding:20px}
  .section,.kpi-grid,.sent-grid,.kpi,.sent-card,.note,table,tr,td,th{
    page-break-inside:avoid;break-inside:avoid
  }
  table{page-break-inside:auto}
  tr{page-break-inside:avoid;break-inside:avoid;page-break-after:auto}
}
</style>
</head>
<body>
<div class="page">

<div class="header">
  <h1>ORM Comment Sentiment Report</h1>
  <p>Generated by BrandThink ORM CMS — Online Reputation Management Platform</p>
  <div class="meta">
    <span><b>Account:</b> ${accountName}</span>
    <span><b>Time Period:</b> ${preset.label}</span>
    <span><b>View:</b> ${granLabel}</span>
    <span><b>Generated:</b> ${today}</span>
    <span><b>Platform:</b> orm.brandthink.in</span>
  </div>
</div>

<div class="kpi-grid">
  <div class="kpi"><div class="val">${total.toLocaleString()}</div><div class="lbl">Comments Analysed</div></div>
  <div class="kpi"><div class="val risk-Low" style="color:#16a34a">${pct}%</div><div class="lbl">Positive Sentiment</div></div>
  <div class="kpi"><div class="val" style="color:#dc2626">${npct}%</div><div class="lbl">Negative Sentiment</div></div>
  <div class="kpi"><div class="val risk-${risk}">${risk}</div><div class="lbl">Reputation Risk</div></div>
</div>

<div class="section">
  <h2>Sentiment Breakdown — What the Numbers Mean</h2>
  <div class="sent-grid">
    <div class="sent-card sent-pos">
      <div class="pct">${pct}%</div>
      <div class="cnt">${pos.toLocaleString()} comments</div>
      <div class="lbl">Positive</div>
      <p>Comments expressing support, appreciation, agreement, or enthusiasm. These represent audiences who are engaged positively with the account.</p>
    </div>
    <div class="sent-card sent-neg">
      <div class="pct">${npct}%</div>
      <div class="cnt">${neg.toLocaleString()} comments</div>
      <div class="lbl">Negative</div>
      <p>Comments expressing criticism, frustration, opposition, or dissatisfaction. High negative % signals reputational risk requiring prompt response.</p>
    </div>
    <div class="sent-card sent-neu">
      <div class="pct">${npct2}%</div>
      <div class="cnt">${neu.toLocaleString()} comments</div>
      <div class="lbl">Neutral</div>
      <p>Informational or factual comments without a clear emotional stance. Common for news-style pages and general information posts.</p>
    </div>
  </div>
</div>

<div class="note">
  <h3>How This Data Is Collected &amp; Analysed</h3>
  <div class="row"><span class="label">Data Collection: </span>
    Each post published on or about this account is tracked across Facebook, Instagram, Twitter/X, and YouTube.
    Every public comment on every post is collected — the system scans each post URL and reads all its comments.
    No private data, direct messages, or stories are accessed.
  </div>
  <div class="row"><span class="label">Sentiment Analysis: </span>
    Each comment is individually run through our AI model — a transformer-based Natural Language Processing (NLP) model
    trained on millions of multilingual social media comments. The model reads the full comment text, evaluates word choice,
    sentence structure, tone, and context. It assigns a sentiment label (Positive / Negative / Neutral) with a confidence score.
    This is not keyword matching — the model understands phrases, negations ("not bad" = positive), sarcasm indicators,
    and cultural context.
  </div>
  <div class="row"><span class="label">Time Grouping (${granLabel}): </span>
    ${gran === "daily" ? "Comments are grouped by the calendar day they were posted. Each bar in the chart = one day's total comment volume." :
      "Comments are grouped by calendar week. Each bar = total comments received in that 7-day period."}
  </div>
  <div class="row"><span class="label">Risk Level: </span>
    <b>Low</b> = negative comments below 25% of total — reputation is stable.
    <b>Medium</b> = 25–40% negative — monitor closely, consider proactive engagement.
    <b>High</b> = above 40% negative — immediate action recommended, escalate to communications team.
  </div>
  <div class="row"><span class="label">Important Note: </span>
    Volume spikes (sudden increase in total comments) are often caused by high-engagement posts — viral content,
    news coverage, political announcements, or controversies. A spike with high negative % is an early warning signal.
    The chart dip line shows total comment volume, while coloured bars show the sentiment split within each period.
  </div>
</div>

${allAccounts.length > 1 ? `
<div class="section">
  <h2>All Accounts Summary</h2>
  <table>
    <thead><tr>
      <th>Account</th>
      <th style="text-align:right">Total Comments</th>
      <th style="text-align:right">Positive %</th>
      <th style="text-align:right">Negative %</th>
      <th style="text-align:center">Risk Level</th>
    </tr></thead>
    <tbody>${accountRows}</tbody>
  </table>
</div>` : ""}

<div class="section">
  <h2>Comment Volume Data — ${preset.label} (${granLabel} view)</h2>
  <table>
    <thead><tr>
      <th>Period</th>
      <th style="text-align:right">Total</th>
      <th style="text-align:right">Positive</th>
      <th style="text-align:right">Negative</th>
      <th style="text-align:right">Neutral</th>
      <th style="text-align:center">Overall Tone</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</div>

<footer>
  <p>ORM CMS Platform — BrandThink Agency &middot; orm.brandthink.in &middot; ankit.rohilla@thebrandthink.com</p>
  <p style="margin-top:4px">Generated: ${today} &middot; Data is collected in real-time from public social media posts</p>
  <p style="margin-top:4px">This report is confidential and intended for the recipient only.</p>
</footer>
</div>
</body>
</html>`;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ListeningPage() {
  const [clients, setClients]       = useState<any[]>([]);
  const [clientId, setClientId]     = useState("");
  const [profiles, setProfiles]     = useState<any[]>([]);
  const [tab, setTab]               = useState<"own" | "competitor">("own");
  const [profileId, setProfileId]   = useState("");
  const [summaries, setSummaries]   = useState<Record<string, any>>({});

  const [posts, setPosts]           = useState<any[]>([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const sentimentsRef               = useRef<Record<string, any>>({});
  const [sentiments, setSentiments] = useState<Record<string, any>>({});

  const [link, setLink]             = useState("");
  const [narrative, setNarrative]   = useState("");
  const [sheetUrl, setSheetUrl]     = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetMsg, setSheetMsg]     = useState("");
  const [busy, setBusy]             = useState(false);
  const [added, setAdded]           = useState<any>(null);

  // Sentiment analysis progress tracking
  const [analyzing, setAnalyzing]   = useState<any>(null);

  const [volumeData, setVolumeData] = useState<{ id: string; name: string; trend: any[] }[]>([]);
  const [volumeClient, setVolumeClient] = useState<string>("");
  const [volumeGran, setVolumeGran] = useState<"daily" | "weekly" | "monthly">("daily");
  const [activePreset, setActivePreset] = useState<PresetKey>(DEFAULT_PRESET);
  // date range in effect for the volume chart (used for PDF)
  const volumeDateRef = useRef<{ from?: string; to?: string }>(get90dWindow());

  // URL search state — filters posts list by URL/permalink
  const [urlSearch, setUrlSearch] = useState("");

  const { ensureConnected } = useConnectSocial();
  const df = useDateFilter();

  /* ── load clients ── */
  useEffect(() => {
    api.get("/clients").then((r) => {
      setClients(r.data || []);
      // Do NOT auto-select — user must pick from dropdown or analyze a URL
    }).catch(() => {});
  }, []);

  /* ── load volume overview ── */
  const loadVolume = useCallback((params?: { date_from?: string; date_to?: string; granularity?: string }) => {
    api.get("/analytics/volume-by-client", { params: { granularity: volumeGran, ...params } })
      .then((r) => setVolumeData(r.data?.clients || []))
      .catch(() => {});
  }, [volumeGran]);

  // On mount apply the 90-day default
  useEffect(() => {
    const p = PRESETS.find((x) => x.key === DEFAULT_PRESET)!;
    const { from, to } = get90dWindow();
    volumeDateRef.current = { from, to };
    loadVolume({ date_from: from, date_to: to, granularity: p.gran });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── apply time preset — filters BOTH chart and posts list ── */
  function applyPreset(preset: typeof PRESETS[number]) {
    setActivePreset(preset.key);
    setVolumeGran(preset.gran);
    const { from: fromStr, to: toStr } = presetWindow(preset);
    volumeDateRef.current = { from: fromStr, to: toStr };
    const fp = { date_from: fromStr, date_to: toStr };
    loadVolume({ ...fp, granularity: preset.gran });
    df.applyFilter(fromStr, toStr, preset.gran);
    loadPosts(profileId, fp, urlSearch);
  }

  /* ── export PDF ── */
  async function exportVolumePDF() {
    const preset = PRESETS.find((p) => p.key === activePreset) ?? PRESETS[0];
    const name   = volumeClient === "__all__"
      ? "All Accounts"
      : (volumeData.find((c) => c.id === volumeClient)?.name ?? "");
    const html = buildExportHTML({
      accountName: name,
      preset,
      gran: volumeGran,
      data: volumeChartData,
      allAccounts: volumeData,
    });
    try {
      const res = await api.post(
        "/analytics/html-to-pdf",
        { html, filename: `ORM_Report_${name}_${preset.label}.pdf` },
        { responseType: "blob" },
      );
      const url  = URL.createObjectURL(res.data as Blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `ORM_Report_${name}_${preset.label}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new window for manual save
      const win = window.open("", "_blank");
      if (win) { win.document.write(html); win.document.close(); }
    }
  }

  /* ── load profiles for selected client ── */
  useEffect(() => {
    if (!clientId) return;
    api.get("/profiles", { params: { client_id: clientId } }).then((r) => {
      setProfiles(r.data || []);
      const own = (r.data || []).filter((p: any) => !p.is_competitor);
      setProfileId(own[0]?.id || r.data?.[0]?.id || "");
      (r.data || []).forEach((p: any) =>
        api.get(`/profiles/${p.id}/summary`)
           .then((s) => setSummaries((prev) => ({ ...prev, [p.id]: s.data })))
           .catch(() => {}));
    }).catch(() => {});
  }, [clientId]);

  /* ── fetch sentiment for posts ── */
  function fetchSentiments(list: any[], filterParams?: Record<string, any>) {
    list.forEach((p) =>
      api.get(`/posts/${p.id}/sentiment`, { params: filterParams ?? df.getQueryParams() })
         .then((s) => {
           sentimentsRef.current = { ...sentimentsRef.current, [p.id]: s.data };
           setSentiments({ ...sentimentsRef.current });
         })
         .catch(() => {}));
  }

  /* ── build default 90-day post params ── */
  function getPostParams(extra?: Record<string, any>): Record<string, any> {
    if (df.isActive) return { ...df.getQueryParams(), ...(extra ?? {}) };
    const w = get90dWindow();
    return { date_from: w.from, date_to: w.to, ...(extra ?? {}) };
  }

  /* ── load first page of posts ── */
  const loadPosts = useCallback((pid?: string, filterParams?: Record<string, any>, urlQ?: string, sort?: string) => {
    const id = pid ?? profileId;
    if (!id) return;
    setInitialLoading(true);
    setPosts([]); setTotalPosts(0); setCurrentPage(1);
    sentimentsRef.current = {}; setSentiments({});
    const base = filterParams != null ? filterParams : getPostParams();
    const params: any = {
      social_profile_id: id, page: 1, page_size: PAGE_SIZE,
      ...base,
      ...(urlQ ? { url_search: urlQ } : {}),
    };
    api.get("/posts", { params }).then((r) => {
      const list: any[] = r.data.items || [];
      setPosts(list); setTotalPosts(r.data.total ?? 0); setCurrentPage(1);
      fetchSentiments(list, base);
    }).catch(() => {}).finally(() => setInitialLoading(false));
  }, [profileId, df]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── load more posts ── */
  const loadMore = useCallback((filterParams?: Record<string, any>, urlQ?: string) => {
    if (!profileId || loadingMore) return;
    const nextPage = currentPage + 1;
    setLoadingMore(true);
    const base = filterParams != null ? filterParams : getPostParams();
    const params: any = {
      social_profile_id: profileId, page: nextPage, page_size: PAGE_SIZE,
      ...base,
      ...(urlQ ? { url_search: urlQ } : {}),
    };
    api.get("/posts", { params }).then((r) => {
      const newItems: any[] = r.data.items || [];
      setPosts((prev) => [...prev, ...newItems]);
      setTotalPosts(r.data.total ?? 0); setCurrentPage(nextPage);
      fetchSentiments(newItems, base);
    }).catch(() => {}).finally(() => setLoadingMore(false));
  }, [profileId, currentPage, loadingMore, df]); // eslint-disable-line react-hooks/exhaustive-deps

  // When profile changes, reload posts using the currently-active time preset
  // so the list always reflects whatever filter the user selected
  useEffect(() => {
    setUrlSearch("");
    const preset = PRESETS.find((p) => p.key === activePreset) ?? PRESETS[2];
    const { from, to } = presetWindow(preset);
    loadPosts(profileId, { date_from: from, date_to: to }, "");
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync chart to the top-level client selection
  useEffect(() => { if (clientId) setVolumeClient(clientId); }, [clientId]);

  /* ── load narrative from Google Sheet ── */
  async function loadFromSheet() {
    if (!sheetUrl) return;
    setSheetLoading(true); setSheetMsg("");
    try {
      const { data } = await api.post("/posts/extract-sheet-narrative", { sheet_url: sheetUrl });
      if (data.narrative) { setNarrative(data.narrative); setSheetMsg("✅ Narrative loaded from sheet."); }
      if (data.post_url && !link) setLink(data.post_url);
    } catch { setSheetMsg("Could not extract from sheet. Paste narrative manually."); }
    finally { setSheetLoading(false); setTimeout(() => setSheetMsg(""), 4000); }
  }

  /* ── analyze a pasted link ── */
  async function analyzeLink() {
    if (!link) return;
    const platform = platformOf(link);

    // For Instagram, YouTube, and Facebook: use analyze_url (no login popup needed)
    if (platform === "instagram" || platform === "youtube" || platform === "facebook") {
      setBusy(true);
      try {
        // Pass current profileId as a hint so the post gets linked to the right account
        const body: any = { url: link.trim() };
        if (profileId) body.social_profile_id = profileId;
        const { data } = await api.post("/posts/analyze-url", body);
        // Redirect to the post detail page — comment fetch runs in the background there
        window.location.href = `/listening/${data.post_id}`;
      } catch (e: any) {
        const msg = e?.response?.data?.detail || "Failed to analyze URL.";
        alert(msg);
      } finally {
        setBusy(false);
        setLink("");
      }
      return;
    }

    // For other platforms (Facebook, Twitter): use the existing ingest-link flow
    const ok = await ensureConnected(platform);
    if (!ok) return;

    const useClientId = clientId || "";
    if (!useClientId) {
      alert("Please select an account from the dropdown above before analyzing a link. This ensures the post is assigned to the correct client.");
      return;
    }

    setBusy(true);
    try {
      const { data: post } = await api.post("/posts/ingest-link", {
        url: link,
        client_id: useClientId,
        social_profile_id: profileId || undefined,
        comments: 200,
        narrative: narrative || undefined,
      });

      // Queue sentiment analysis in background (Ollama local LLM)
      setAnalyzing({ postId: post.id, total: post.comment_count || 0 });
      api.post("/sentiment/analyze-batch", {
        post_id: post.id,
        comments: (post.comments || []).map((c: any) => ({ id: c.id, text: c.text })),
      }).catch(() => {});

      const { data: sent } = await api.get(`/posts/${post.id}/sentiment`);

      const newClientId = post.client_id || useClientId;
      const newProfileId = post.social_profile_id || profileId;
      setClientId(newClientId);
      setVolumeClient(newClientId);
      if (newProfileId) setProfileId(newProfileId);

      if (newClientId !== useClientId) {
        api.get("/profiles", { params: { client_id: newClientId } }).then((r) => {
          setProfiles(r.data || []);
        }).catch(() => {});
      }

      const prof = profiles.find((p) => p.id === newProfileId);
      setAdded({ post, sent, profile: prof });
      setLink("");
      if (newProfileId) loadPosts(newProfileId);
      loadVolume();
      if (newProfileId) {
        api.get(`/profiles/${newProfileId}/summary`)
           .then((s) => setSummaries((prev) => ({ ...prev, [newProfileId]: s.data })))
           .catch(() => {});
      }
    } catch (e: any) {
      const gated = loginGatePlatform(e);
      if (gated && await ensureConnected(gated)) { setBusy(false); return analyzeLink(); }
      throw e;
    } finally { setBusy(false); }
  }

  /* ── delete a post ── */
  async function deletePost(postId: string) {
    if (!confirm("Delete this post and all its comments? This cannot be undone.")) return;
    try {
      await api.delete(`/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setTotalPosts((prev) => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  }

  const shown      = profiles.filter((p) => (tab === "competitor") === !!p.is_competitor);
  const selProfile = profiles.find((p) => p.id === profileId);
  const selSummary = summaries[profileId];
  const hasMore    = posts.length < totalPosts;

  // Chart data always scoped to the selected client
  const selVolClient = volumeData.find((c) => c.id === volumeClient);
  const volumeChartData  = selVolClient?.trend ?? mergeTrends(volumeData);
  const volumeChartTitle = selVolClient ? `${selVolClient.name} — Comment Volume` : "All Accounts — Comment Volume";

  // Totals computed from the currently-loaded (possibly date-filtered) trend data
  const selVolTotal = volumeChartData.reduce((s, d) => s + d.Positive + d.Negative + d.Neutral, 0);
  const selVolPos   = volumeChartData.reduce((s, d) => s + d.Positive, 0);
  const selVolNeg   = volumeChartData.reduce((s, d) => s + d.Negative, 0);
  const selVolPct   = selVolTotal ? Math.round(selVolPos * 100 / selVolTotal) : 0;
  const selVolNpct  = selVolTotal ? Math.round(selVolNeg * 100 / selVolTotal) : 0;
  const selVolPosts = selVolClient ? (selVolClient as any).post_count ?? 0 : volumeData.reduce((s, c) => s + ((c as any).post_count ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Posts &amp; Comments</h1>
          <p className="text-sm text-muted">Paste any post URL to analyse its comments, or select an account to browse all posts.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted shrink-0">Account:</span>
          <select
            value={clientId}
            onChange={(e) => { setClientId(e.target.value); setVolumeClient(e.target.value); }}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm min-w-[200px]"
          >
            <option value="">— Select an account —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Analysis Progress */}
      {analyzing && (
        <CommentAnalysisProgress
          postId={analyzing.postId}
          totalComments={analyzing.total}
          onComplete={() => {
            setAnalyzing(null);
            // Auto-reload posts to show updated sentiment analysis
            if (profileId) loadPosts(profileId);
          }}
        />
      )}

      {/* Add Post panel */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
            <input value={link} onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyzeLink()}
              placeholder="Paste a post link (Facebook / Instagram / X / YouTube)…"
              className="w-full rounded-xl border border-border bg-transparent pl-9 pr-3 py-2 text-sm" />
          </div>
          <Button onClick={analyzeLink} disabled={busy || !link}>
            <Plus className="h-4 w-4" />{busy ? "Analyzing…" : "Analyze comments"}
          </Button>
          <button onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs text-muted hover:text-fg hover:border-accent transition-colors"
            title="Add narrative / sheet link">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Narrative
            {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {showAdvanced && (
          <div className="space-y-3 rounded-xl border border-border/60 bg-black/[0.02] dark:bg-white/[0.02] p-3">
            <p className="text-xs text-muted">
              Optionally attach a <b>narrative</b> so sentiment is scored against context.
              Type it manually or extract from a Google Sheet.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <FileSpreadsheet className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-600 pointer-events-none" />
                <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="Paste Google Sheet URL to extract narrative…"
                  className="w-full rounded-xl border border-border bg-transparent pl-9 pr-3 py-2 text-sm" />
              </div>
              <Button variant="ghost" onClick={loadFromSheet} disabled={sheetLoading || !sheetUrl}>
                {sheetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-green-600" />}
                {sheetLoading ? "Loading…" : "Load from Sheet"}
              </Button>
            </div>
            {sheetMsg && <p className={`text-xs ${sheetMsg.startsWith("✅") ? "text-green-600" : "text-yellow-600"}`}>{sheetMsg}</p>}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Narrative / context</label>
              <textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={3}
                placeholder="e.g. This post promotes the sports development initiative. Expected tone: positive, patriotic…"
                className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm resize-none" />
              <p className="text-[11px] text-muted">
                Attached for AI sentiment scoring context.
                {narrative && <span className="ml-1 text-accent font-medium">✓ Set ({narrative.length} chars)</span>}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Empty state — no account selected and no post just analyzed */}
      {!clientId && !added && (
        <div className="rounded-xl border border-dashed border-border bg-card/40 py-12 text-center text-muted">
          <p className="text-sm font-medium">Select an account above, or paste a post URL to get started.</p>
          <p className="mt-1 text-xs">Once selected, the chart and posts list will show data for that account only.</p>
        </div>
      )}

      {/* ── Comment Volume Overview ── */}
      {clientId && volumeData.length > 0 && (
        <Card>
          {/* Top row: title + controls */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <TrendingUp className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold">Comment Volume Overview</span>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Time preset pills */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => applyPreset(p)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      activePreset === p.key
                        ? "bg-accent text-white"
                        : "bg-card text-muted hover:text-fg"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Refresh */}
              <button
                onClick={() => loadVolume()}
                className="rounded-lg border border-border p-1.5 text-muted hover:text-fg transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>

              {/* Export PDF */}
              <button
                onClick={exportVolumePDF}
                className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
              >
                <FileDown className="h-3.5 w-3.5" />
                Export PDF
              </button>
            </div>
          </div>

          {/* Chart */}
          <VolumeChart data={volumeChartData} title={volumeChartTitle} height={280} showLegend />

          {/* Explanatory note */}
          <div className="mt-3 flex gap-2 rounded-lg border border-blue-100 dark:border-blue-800/20 bg-blue-50 dark:bg-blue-900/10 px-3 py-2.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
            <p className="text-[11px] leading-relaxed text-blue-700 dark:text-blue-300">
              <span className="font-semibold">How this data is calculated: </span>
              Each bar shows total public comments collected for the selected account and period.
              The system scans every post URL and reads all its comments.
              Each comment is individually analysed by an AI model — classified as{" "}
              <span className="font-medium text-green-700 dark:text-green-400">Positive</span>,{" "}
              <span className="font-medium">Neutral</span>, or{" "}
              <span className="font-medium text-red-600 dark:text-red-400">Negative</span>{" "}
              based on tone, word choice, and context (not just keywords).
              {activePreset === "daily"   && " Daily view: last 7 days, one bar per day."}
              {activePreset === "weekly"  && " Weekly view: last 30 days, one bar per day."}
              {activePreset === "monthly" && " Monthly view: last 90 days, one bar per day."}
              {" "}The dashed line shows total volume trend. Risk is High when negative comments exceed 40%.
            </p>
          </div>

          {/* ── Account detail card ── */}
          {selVolClient && (
            <div className="mt-4 rounded-xl border border-accent/20 bg-gradient-to-br from-accent/5 to-transparent p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{selVolClient.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  selVolNpct > 40 ? "bg-red-100 text-red-700" :
                  selVolNpct > 25 ? "bg-amber-100 text-amber-700" :
                  "bg-green-100 text-green-700"
                }`}>
                  {selVolNpct > 40 ? "High Risk" : selVolNpct > 25 ? "Medium Risk" : "Low Risk"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-xl font-bold">{selVolPosts.toLocaleString()}</div>
                  <div className="text-[10px] text-muted">posts</div>
                </div>
                <div>
                  <div className="text-xl font-bold">{selVolTotal.toLocaleString()}</div>
                  <div className="text-[10px] text-muted">comments</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-green-600">{selVolPct}%</div>
                  <div className="text-[10px] text-muted">positive</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-red-500">{selVolNpct}%</div>
                  <div className="text-[10px] text-muted">negative</div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted">
                Showing {PRESETS.find(p => p.key === activePreset)?.label ?? "selected period"} of data
                for <b>{selVolClient.name}</b>.
                Each comment on each post linked to this account has been individually scanned and classified.
              </p>
            </div>
          )}

        </Card>
      )}

      {/* Confirmation toast */}
      {added && (
        <Card className="border-green-500/40 bg-green-500/5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-green-700 dark:text-green-400">
                {added.post.source_kind === "mock"
                  ? `Added (sample data) — ${added.sent.total_comments} comments analysed`
                  : `Added — @${added.post.author || added.profile?.handle || "account"} · ${added.sent.total_comments} comments analysed`}
              </div>
              <p className="mt-1 line-clamp-2 text-sm">{added.post.content}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <span className="text-green-600">▲ {added.sent.counts?.Positive || 0} positive</span>
                <span className="text-muted">● {added.sent.counts?.Neutral || 0} neutral</span>
                <span className="text-red-500">▼ {added.sent.counts?.Negative || 0} negative</span>
                <Link href={`/listening/${added.post.id}`} className="text-accent hover:underline">View report →</Link>
                {added.post.permalink && (
                  <a href={added.post.permalink} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-muted hover:text-accent">
                    Open post <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            <button onClick={() => setAdded(null)} className="text-muted hover:text-fg">✕</button>
          </div>
        </Card>
      )}

      {/* Own vs competitor tabs — only when account selected */}
      {clientId && (
      <div className="flex gap-2">
        {(["own", "competitor"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-xl px-3 py-1.5 text-sm ${tab === t ? "bg-accent text-white" : "text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}>
            {t === "own" ? "Own Brand" : "Competitors"}
          </button>
        ))}
      </div>
      )}

      {/* Profile cards — only when account selected */}
      {clientId && <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {shown.map((p) => {
          const s = summaries[p.id];
          return (
            <button key={p.id} onClick={() => setProfileId(p.id)}
              className={`rounded-xl border p-3 text-left transition-all bg-card ${profileId === p.id ? "border-accent ring-1 ring-accent" : "border-border"}`}>
              <div className="flex items-center gap-2">
                <PlatformIcon platform={p.platform} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.handle}</div>
                  {p.followers > 0 && (
                    <div className="text-[10px] text-muted">{fmtNum(p.followers)} followers</div>
                  )}
                  {p.total_posts > 0 && (
                    <div className="text-[10px] text-muted">
                      {fmtNum(p.total_posts)}{" "}
                      {p.platform === "instagram" ? "posts & reels on platform" : p.platform === "youtube" ? "videos on channel" : "posts on platform"}
                    </div>
                  )}
                  <div className="text-[10px] text-muted/60">{(s?.posts ?? 0).toLocaleString()} total analysed</div>
                </div>
              </div>
              <div className="mt-2"><SentimentBar counts={s?.counts || {}} /></div>
            </button>
          );
        })}
        {shown.length === 0 && <p className="col-span-4 text-muted">No profiles mapped.</p>}
      </div>}

      {/* Account overview */}
      {selProfile && selSummary?.total_comments > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SentimentDonut data={selSummary.counts || {}} />
          <Card className="lg:col-span-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-accent" /> {selProfile.handle} overview
            </div>
            <div className="mt-3 flex flex-wrap gap-4 justify-center text-center">
              {selProfile?.followers > 0 && (
                <div className="min-w-[70px]">
                  <div className="text-2xl font-semibold">{fmtNum(selProfile.followers)}</div>
                  <div className="text-xs text-muted">followers</div>
                </div>
              )}
              {selProfile?.total_posts > 0 && (
                <div className="min-w-[70px]">
                  <div className="text-2xl font-semibold">{fmtNum(selProfile.total_posts)}</div>
                  <div className="text-xs text-muted">
                    {selProfile.platform === "instagram" ? "posts & reels" : selProfile.platform === "youtube" ? "videos" : "total posts"}
                  </div>
                </div>
              )}
              <div className="min-w-[70px]">
                <div className="text-2xl font-semibold">{selSummary.posts}</div>
                <div className="text-xs text-muted">analysed</div>
              </div>
              <div className="min-w-[70px]">
                <div className="text-2xl font-semibold text-green-600">{selSummary.percentages?.Positive ?? 0}%</div>
                <div className="text-xs text-muted">positive</div>
              </div>
              <div className="min-w-[70px]">
                <div className="text-2xl font-semibold text-red-500">{selSummary.percentages?.Negative ?? 0}%</div>
                <div className="text-xs text-muted">negative</div>
              </div>
            </div>
            {/* Per-profile sentiment note */}
            <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800/30 px-3 py-2 text-[11px] text-muted leading-relaxed">
              <span className="font-semibold text-fg">About this data: </span>
              Sentiment is calculated by scanning each post on this profile and reading all its public comments.
              Every comment is individually classified by our AI model.
              Positive means the comment expresses support or appreciation; Negative means criticism or frustration;
              Neutral means factual or informational content.
              The percentages shown are averages across all {selSummary.posts} analysed posts
              {selProfile?.total_posts > 0 && ` (out of ${fmtNum(selProfile.total_posts)} ${selProfile.platform === "instagram" ? "posts & reels" : "total posts"} on the platform)`}
              {" "}and {selSummary.total_comments?.toLocaleString()} comments analysed for this profile.
              Use the <b>Daily / Weekly / Monthly</b> buttons to filter posts and the chart by time period.
            </div>
          </Card>
        </div>
      )}

      {/* ── Date filter ── */}
      <DateRangeFilter
        isActive={df.isActive}
        onFilter={(from, to, gran) => {
          df.applyFilter(from, to, gran);
          const fp: any = { ...(from ? { date_from: from } : {}), ...(to ? { date_to: to } : {}) };
          loadPosts(profileId, fp, urlSearch);
          loadVolume({ ...fp, granularity: gran });
        }}
        onClear={() => {
          df.clearFilter();
          loadPosts(profileId, undefined, urlSearch);
          const { from, to } = get90dWindow();
          volumeDateRef.current = { from, to };
          const p = PRESETS.find((x) => x.key === DEFAULT_PRESET)!;
          loadVolume({ date_from: from, date_to: to, granularity: p.gran });
        }}
      />

      {/* Posts header + URL search */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-muted">
              Posts &amp; comment sentiment
              {df.isActive
                ? ` — ${PRESETS.find(p => p.key === activePreset)?.label ?? "filtered"}`
                : " — select a time period above"}
            </h2>
            {totalPosts > 0 && (
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                {posts.length} / {totalPosts} posts
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* Sync with chart preset */}
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  activePreset === p.key
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {p.label}
              </button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => loadPosts(undefined, undefined, urlSearch)}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* URL search bar */}
        {profileId && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
              <input
                value={urlSearch}
                onChange={(e) => {
                  setUrlSearch(e.target.value);
                  if (!e.target.value) {
                    loadPosts(undefined, undefined, "");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") loadPosts(undefined, undefined, urlSearch);
                }}
                placeholder="Search posts by URL or link…"
                className="w-full rounded-xl border border-border bg-transparent pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={() => loadPosts(undefined, undefined, urlSearch)}
              className="rounded-xl border border-border px-3 py-2 text-xs font-medium hover:border-accent hover:text-accent transition-colors"
            >
              Search
            </button>
            {urlSearch && (
              <button
                onClick={() => { setUrlSearch(""); loadPosts(undefined, undefined, ""); }}
                className="rounded-xl border border-border px-3 py-2 text-xs text-muted hover:text-fg transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Posts list */}
      <div className="space-y-4">
        {initialLoading ? (
          <Card className="flex items-center justify-center gap-2 py-12 text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading posts…</span>
          </Card>
        ) : posts.length === 0 ? (
          <Card className="py-10 text-center text-muted">No posts found for this profile.</Card>
        ) : (
          <>
            {posts.map((p) => (
              <PostRow
                key={p.id}
                post={p}
                sentiment={sentiments[p.id] || { counts: p.sentiment_counts || {}, total_comments: p.comment_count || 0 }}
                dateLabel={df.isActive ? `Filtered: ${df.filter.from ?? "start"} → ${df.filter.to ?? "now"}` : undefined}
                onDelete={() => deletePost(p.id)}
              />
            ))}
            <div className="flex items-center justify-between border-t border-border pt-4">
              <p className="text-sm text-muted">
                Showing <span className="font-semibold text-fg">{posts.length}</span> of{" "}
                <span className="font-semibold text-fg">{totalPosts}</span> posts
              </p>
              {hasMore ? (
                <button onClick={() => loadMore(undefined, urlSearch)} disabled={loadingMore}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-50 transition-colors">
                  {loadingMore
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>
                    : <>Load {Math.min(PAGE_SIZE, totalPosts - posts.length)} more posts</>}
                </button>
              ) : totalPosts > PAGE_SIZE ? (
                <span className="text-xs text-muted">All {totalPosts} posts loaded</span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
