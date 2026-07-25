"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw, Plus, CheckCircle2, ExternalLink, BarChart3,
  TrendingUp, Loader2, Link2, FileSpreadsheet, ChevronDown, ChevronUp,
  FileDown, Info, Search, Sparkles, ThumbsUp, ThumbsDown, MessageCircle,
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
  { key: "daily",   label: "Daily",   gran: "hourly" as const, days: 1  },
  { key: "weekly",  label: "Weekly",  gran: "daily"  as const, days: 7  },
  { key: "monthly", label: "Monthly", gran: "daily"  as const, days: 30 },
] as const;
type PresetKey = typeof PRESETS[number]["key"];

const DEFAULT_PRESET: PresetKey = "monthly";
const DEFAULT_DAYS = 30;

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
type NarrativeData = {
  narrative_paragraph: string;
  positive_summary: string;
  negative_summary: string;
  positive_keywords: string[];
  negative_keywords: string[];
  positive_samples: string[];
  negative_samples: string[];
  topics: string[];
  stats: { total: number; positive: number; negative: number; neutral: number; positive_pct: number; negative_pct: number; neutral_pct: number };
  risk_level: string;
  health: string;
  health_score: number;
} | null;

function buildExportHTML(opts: {
  accountName: string;
  preset: typeof PRESETS[number];
  gran: string;
  data: { date: string; Positive: number; Negative: number; Neutral: number }[];
  allAccounts: { name: string; trend: any[] }[];
  narrative?: NarrativeData;
}) {
  const { accountName, preset, gran, data, allAccounts, narrative } = opts;
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

  // ─── Executive summary ────────────────────────────────────────────────────
  const sentMood = pct > 60 ? "strongly positive" : pct > 45 ? "predominantly positive"
    : npct > 50 ? "critically negative" : npct > 35 ? "predominantly negative" : "balanced";
  const peakDay = data.reduce((mx, d) => {
    const t = d.Positive + d.Negative + d.Neutral;
    return t > (mx.t||0) ? { date: d.date, t } : mx;
  }, { date: "", t: 0 });
  const healthColor = npct >= 40 ? "#dc2626" : npct >= 25 ? "#d97706" : "#16a34a";
  const healthLabel = npct >= 40 ? "High Risk" : npct >= 25 ? "Caution" : "Stable";
  const execSummary = `This report covers public comment analysis for <strong>${accountName}</strong> during the <strong>${preset.label}</strong> period, with <strong>${total.toLocaleString()} interactions</strong> analysed in ${granLabel} intervals. The overall sentiment is <strong>${sentMood}</strong> — ${pct}% positive and ${npct}% negative. ${peakDay.date ? `Peak engagement occurred on <strong>${peakDay.date}</strong> with ${peakDay.t.toLocaleString()} interactions. ` : ""}${npct >= 40 ? "The elevated negative sentiment requires immediate attention and a coordinated communications response." : npct >= 25 ? "Negative sentiment is above comfortable levels and warrants proactive monitoring." : "Sentiment is healthy — an opportunity to build on positive momentum."}`;

  // ─── Recommendations ──────────────────────────────────────────────────────
  const listenRecs: string[] = [];
  if (npct > 40) listenRecs.push(`<strong>🚨 Crisis Response:</strong> Negative sentiment at ${npct}% requires immediate action. Engage directly with the most-visible critical comments, issue factual clarifications, and escalate to the communications lead.`);
  else if (npct > 25) listenRecs.push(`<strong>⚠️ Monitor & Engage:</strong> Negative sentiment is elevated at ${npct}%. Increase positive content frequency and proactively engage with critics to prevent further deterioration.`);
  if (pct > 55) listenRecs.push(`<strong>✅ Amplify Positives:</strong> With ${pct}% positive engagement, this is the right time to amplify supporter voices. Encourage shares, replies, and user-generated content around top-performing posts.`);
  if (narrative?.positive_keywords?.length) listenRecs.push(`<strong>💡 Leverage Positive Keywords:</strong> The terms <em>${narrative.positive_keywords.slice(0,5).join(", ")}</em> are driving positive engagement. Use these in upcoming content briefs.`);
  if (narrative?.negative_keywords?.length) listenRecs.push(`<strong>🛡️ Address Negative Themes:</strong> Keywords <em>${narrative.negative_keywords.slice(0,5).join(", ")}</em> are associated with negative sentiment. These themes need direct, empathetic acknowledgment.`);
  if (listenRecs.length === 0) listenRecs.push(`<strong>📊 Maintain Strategy:</strong> Current sentiment metrics are stable. Continue regular content cadence and maintain comment engagement to sustain positive momentum.`);
  const recsHtml = listenRecs.map((r) => `<div style="padding:10px 14px;background:#f8fafc;border-radius:8px;border-left:3px solid #2563eb;margin-bottom:8px;font-size:12px;color:#374151;line-height:1.7;">${r}</div>`).join("");

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
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;background:#f8fafc;}
.page{max-width:920px;margin:0 auto;padding:28px 24px;}
.cover{background:linear-gradient(135deg,#1a2744 0%,#1e40af 100%);color:#fff;padding:28px 32px;border-radius:14px;margin-bottom:24px;}
.cover h1{font-size:24px;font-weight:800;margin-bottom:4px;}
.cover p{font-size:13px;color:#bfdbfe;margin-bottom:14px;}
.meta{display:flex;gap:10px;flex-wrap:wrap;}
.meta span{font-size:11px;background:rgba(255,255,255,0.18);border-radius:999px;padding:4px 12px;color:#fff;font-weight:600;}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px;}
.kpi{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.05);}
.kpi .val{font-size:26px;font-weight:800;}.kpi .lbl{font-size:11px;color:#64748b;margin-top:4px;}
.exec-box{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.05);}
.exec-box h2{font-size:14px;font-weight:700;color:#1a2744;margin-bottom:10px;}
.exec-box p{font-size:12px;color:#374151;line-height:1.8;}
.risk-badge{display:inline-block;padding:6px 16px;border-radius:999px;font-size:12px;font-weight:700;color:#fff;background:${healthColor};margin-top:10px;}
.sent-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:22px;}
.sent-card{border-radius:10px;padding:16px;text-align:center;}
.sent-pos{background:#f0fdf4;border:1px solid #bbf7d0;}.sent-neg{background:#fef2f2;border:1px solid #fecaca;}.sent-neu{background:#f8fafc;border:1px solid #e2e8f0;}
.sent-card .pct{font-size:28px;font-weight:800;}
.sent-pos .pct{color:#16a34a;}.sent-neg .pct{color:#dc2626;}.sent-neu .pct{color:#64748b;}
.sent-card .cnt{font-size:11px;color:#64748b;margin-top:3px;}.sent-card .lbl{font-size:12px;font-weight:600;margin-top:3px;}
.sent-card p{font-size:11px;color:#64748b;margin-top:8px;line-height:1.6;}
.section{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:18px;box-shadow:0 1px 3px rgba(0,0,0,.05);}
.section h2{font-size:14px;font-weight:700;color:#1a2744;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e2e8f0;}
table{width:100%;border-collapse:collapse;font-size:12px;}
th{background:#1a2744;color:#fff;padding:8px 12px;text-align:left;font-size:11px;}
td{padding:7px 12px;border-bottom:1px solid #f1f5f9;}
tr:nth-child(even) td{background:#f8fafc;}
.note{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:18px;font-size:12px;line-height:1.75;color:#1e3a70;margin-bottom:22px;}
.note h3{font-size:13px;font-weight:700;color:#1a2744;margin-bottom:10px;}.note .row{margin-bottom:10px;}.note .label{font-weight:700;color:#1a2744;}
.narr{border-radius:10px;padding:20px;margin-bottom:22px;font-size:12px;line-height:1.8;}
.narr-overall{background:#f8fafc;border:1px solid #e2e8f0;}.narr-pos{background:#f0fdf4;border:1px solid #bbf7d0;}.narr-neg{background:#fef2f2;border:1px solid #fecaca;}
.narr h3{font-size:13px;font-weight:700;margin-bottom:8px;}
.narr-overall h3{color:#1a2744;}.narr-pos h3{color:#16a34a;}.narr-neg h3{color:#dc2626;}
.kw-list{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;}
.kw{border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;}
.kw-pos{background:#dcfce7;color:#15803d;}.kw-neg{background:#fee2e2;color:#b91c1c;}
.sample-quote{border-left:3px solid;margin:6px 0;padding:4px 10px;font-size:11px;color:#374151;font-style:italic;}
.sample-pos{border-color:#16a34a;}.sample-neg{border-color:#dc2626;}
.conclusion-box{background:linear-gradient(135deg,#eff6ff 0%,#fff 100%);border:1px solid #bfdbfe;border-radius:10px;padding:18px 20px;margin-bottom:18px;}
footer{text-align:center;font-size:10px;color:#94a3b8;margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;}
@media print{body{background:#fff;}.page{padding:16px;}.cover{border-radius:10px;}.section,.exec-box,.sent-grid,.kpi-grid,.narr,.note,.conclusion-box{page-break-inside:avoid;}}
</style>
</head>
<body>
<div class="page">

<!-- COVER -->
<div class="cover">
  <h1>ORM Comment Sentiment Report</h1>
  <p>Generated by BrandThink ORM CMS — Online Reputation Management Platform</p>
  <div class="meta">
    <span>Account: ${accountName}</span>
    <span>Period: ${preset.label}</span>
    <span>View: ${granLabel}</span>
    <span>Generated: ${today}</span>
    <span>Reputation: ${healthLabel}</span>
  </div>
</div>

<!-- KPI GRID -->
<div class="kpi-grid">
  <div class="kpi"><div class="val">${total.toLocaleString()}</div><div class="lbl">Interactions Analysed</div></div>
  <div class="kpi"><div class="val" style="color:#16a34a">${pct}%</div><div class="lbl">Positive Sentiment</div></div>
  <div class="kpi"><div class="val" style="color:#dc2626">${npct}%</div><div class="lbl">Negative Sentiment</div></div>
  <div class="kpi"><div class="val" style="color:${healthColor}">${risk}</div><div class="lbl">Reputation Risk</div></div>
</div>

<!-- EXECUTIVE SUMMARY -->
<div class="exec-box">
  <h2>📋 Executive Summary</h2>
  <p>${execSummary}</p>
  <div class="risk-badge">${healthLabel === "Stable" ? "✅" : healthLabel === "Caution" ? "⚠️" : "🚨"} ${healthLabel} — ${npct>=40?"Crisis monitoring required.":npct>=25?"Proactive management recommended.":"Sentiment is healthy."}</div>
</div>

${narrative ? `
<div class="section">
  <h2>Public Opinion Narrative — AI-Generated Analysis</h2>
  <div class="narr narr-overall">
    <h3>Overall Public Sentiment</h3>
    <p>${narrative.narrative_paragraph}</p>
    ${narrative.topics.length ? `<div class="kw-list">${narrative.topics.map(t => `<span class="kw" style="background:#e0f2fe;color:#0369a1">${t}</span>`).join("")}</div>` : ""}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
    <div class="narr narr-pos">
      <h3>Positive Highlights</h3>
      <p>${narrative.positive_summary}</p>
      ${narrative.positive_keywords.length ? `<div class="kw-list">${narrative.positive_keywords.slice(0,8).map(k => `<span class="kw kw-pos">${k}</span>`).join("")}</div>` : ""}
      ${narrative.positive_samples.length ? `<div style="margin-top:10px">${narrative.positive_samples.slice(0,3).map(s => `<div class="sample-quote sample-pos">"${s.slice(0,140).replace(/"/g,"'")}"</div>`).join("")}</div>` : ""}
    </div>
    <div class="narr narr-neg">
      <h3>Negative Concerns</h3>
      <p>${narrative.negative_summary}</p>
      ${narrative.negative_keywords.length ? `<div class="kw-list">${narrative.negative_keywords.slice(0,8).map(k => `<span class="kw kw-neg">${k}</span>`).join("")}</div>` : ""}
      ${narrative.negative_samples.length ? `<div style="margin-top:10px">${narrative.negative_samples.slice(0,3).map(s => `<div class="sample-quote sample-neg">"${s.slice(0,140).replace(/"/g,"'")}"</div>`).join("")}</div>` : ""}
    </div>
  </div>
</div>` : ""}

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

<!-- RECOMMENDATIONS -->
<div class="section">
  <h2>🎯 Recommendations & Action Plan</h2>
  ${recsHtml}
</div>

<!-- CONCLUSION -->
<div class="conclusion-box">
  <h2 style="font-size:14px;font-weight:700;color:#1a2744;margin-bottom:10px;">📌 Conclusion</h2>
  <p style="font-size:12px;color:#374151;line-height:1.8;margin-bottom:10px;">
    For <strong>${accountName}</strong> during <strong>${preset.label}</strong>, the data reveals a <strong>${sentMood}</strong> sentiment environment with ${total.toLocaleString()} total interactions.
    ${pct > npct ? `The majority of the audience (${pct}%) is responding positively, presenting an opportunity to strengthen relationships and amplify positive narratives.` : `Negative sentiment (${npct}%) currently outweighs positive responses, requiring prompt attention to restore audience trust.`}
    ${narrative ? " The AI narrative analysis confirms these findings and provides specific topic guidance above." : ""}
  </p>
  <div style="padding:10px 14px;background:#1a2744;border-radius:8px;color:#fff;font-size:11px;font-weight:600;">
    Next steps: Review recommendations above, align with communications team, and schedule next report after 7 days to measure impact.
  </div>
</div>

<footer>
  <p>ORM CMS Platform — BrandThink Agency &middot; orm.itechexpand.com &middot; ankit.rohilla@thebrandthink.com</p>
  <p style="margin-top:4px">Generated: ${today} &middot; Data collected in real-time from public social media posts &middot; Confidential</p>
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

  // Public opinion narrative (AI-generated)
  const [opinionNarrative, setOpinionNarrative] = useState<NarrativeData>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);

  // URL search state — filters posts list by URL/permalink
  const [urlSearch, setUrlSearch] = useState("");
  // source_kind filter (all / social / press_rss / youtube_channel_video)
  const [sourceKindFilter, setSourceKindFilter] = useState<string>("");

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
  const loadVolume = useCallback((params?: { date_from?: string; date_to?: string; granularity?: string; client_id?: string }) => {
    api.get("/analytics/volume-by-client", { params: { granularity: volumeGran, ...params } })
      .then((r) => setVolumeData(r.data?.clients || []))
      .catch(() => {});
  }, [volumeGran]);

  /* ── load AI public opinion narrative ── */
  async function loadNarrative(cid: string, preset: typeof PRESETS[number]) {
    if (!cid) { setOpinionNarrative(null); return; }
    const { from, to } = presetWindow(preset);
    setNarrativeLoading(true);
    try {
      const { data } = await api.get("/analytics/comment-narrative", {
        params: {
          client_id: cid,
          date_from: new Date(from).toISOString(),
          date_to: new Date(to + "T23:59:59").toISOString(),
        },
      });
      setOpinionNarrative(data);
    } catch {
      setOpinionNarrative(null);
    } finally {
      setNarrativeLoading(false);
    }
  }

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
    const fp: Record<string, string> = { date_from: fromStr, date_to: toStr };
    if (clientId) fp.client_id = clientId;
    loadVolume({ ...fp, granularity: preset.gran });
    df.applyFilter(fromStr, toStr, preset.gran);
    loadPosts(profileId, fp, urlSearch);
    if (clientId) loadNarrative(clientId, preset);
  }

  /* ── export PDF — only for the currently selected account ── */
  async function exportVolumePDF() {
    const preset = PRESETS.find((p) => p.key === activePreset) ?? PRESETS[0];
    const isAll  = volumeClient === "__all__" || !volumeClient;
    const name   = isAll
      ? "All Accounts"
      : (volumeData.find((c) => c.id === volumeClient)?.name ?? "");
    const accountsForPdf = isAll
      ? volumeData
      : volumeData.filter((c) => c.id === volumeClient);
    const html = buildExportHTML({
      accountName: name,
      preset,
      gran: volumeGran,
      data: volumeChartData,
      allAccounts: accountsForPdf,
      narrative: opinionNarrative,
    });
    const safeName = name.replace(/[^\w\s\-]/g, "").trim().replace(/\s+/g, "_");
    const filename = `Listening_Report_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
    try {
      const resp = await api.post(
        "/analytics/html-to-pdf",
        { html, filename },
        { responseType: "arraybuffer" },
      );
      const blob = new Blob([resp.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      // Fallback: open HTML in new tab for manual print
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
      ...(sourceKindFilter ? { source_kind: sourceKindFilter } : {}),
    };
    api.get("/posts", { params }).then((r) => {
      const list: any[] = r.data.items || [];
      setPosts(list); setTotalPosts(r.data.total ?? 0); setCurrentPage(1);
      fetchSentiments(list, base);
    }).catch(() => {}).finally(() => setInitialLoading(false));
  }, [profileId, df, sourceKindFilter]); // eslint-disable-line react-hooks/exhaustive-deps

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
      ...(sourceKindFilter ? { source_kind: sourceKindFilter } : {}),
    };
    api.get("/posts", { params }).then((r) => {
      const newItems: any[] = r.data.items || [];
      setPosts((prev) => [...prev, ...newItems]);
      setTotalPosts(r.data.total ?? 0); setCurrentPage(nextPage);
      fetchSentiments(newItems, base);
    }).catch(() => {}).finally(() => setLoadingMore(false));
  }, [profileId, currentPage, loadingMore, df, sourceKindFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // When profile changes, load posts defaulting to last 90 days
  useEffect(() => {
    setUrlSearch("");
    loadPosts(profileId, undefined, "");
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync chart to the top-level client selection — reload with client_id for accurate post_count
  useEffect(() => {
    if (clientId) {
      setVolumeClient(clientId);
      const { from, to } = volumeDateRef.current;
      loadVolume({ date_from: from, date_to: to, client_id: clientId });
      // Load AI narrative for the selected account + current preset
      const preset = PRESETS.find((p) => p.key === activePreset) ?? PRESETS[0];
      loadNarrative(clientId, preset);
    } else {
      setOpinionNarrative(null);
    }
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /* ── generate analysis for posts with 0 comments ── */
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ generated: number; skipped: number; posts_processed: number } | null>(null);

  async function generateMissingAnalysis() {
    if (!clientId) return;
    setGenerating(true); setGenResult(null);
    try {
      const { data } = await api.post("/sentiment/generate-missing", { client_id: clientId });
      setGenResult(data);
      loadPosts(profileId);
      loadVolume({ ...volumeDateRef.current, client_id: clientId });
      setTimeout(() => setGenResult(null), 8000);
    } catch { /* ignore */ } finally { setGenerating(false); }
  }

  /* ── bulk heuristic for posts that have real comments but no analysis ── */
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ analyzed: number; already_done: number; posts_processed: number } | null>(null);

  async function bulkAnalyzeReal() {
    if (!clientId) return;
    setBulkAnalyzing(true); setBulkResult(null);
    try {
      const { data } = await api.post(`/posts/bulk-analyze-heuristic?client_id=${clientId}`);
      setBulkResult(data);
      loadPosts(profileId);
      loadVolume({ ...volumeDateRef.current, client_id: clientId });
      setTimeout(() => setBulkResult(null), 10000);
    } catch { /* ignore */ } finally { setBulkAnalyzing(false); }
  }

  /* ── bulk import posts from researcher sheet ── */
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; total: number; sections: any[] } | null>(null);

  async function importPostsFromSheet() {
    if (!sheetUrl) return;
    setImporting(true); setImportResult(null); setSheetMsg("");
    try {
      const body: any = { sheet_url: sheetUrl };
      if (profileId) body.social_profile_id = profileId;
      else if (clientId) body.client_id = clientId;
      const { data } = await api.post("/posts/import-from-researcher-sheet", body);
      setImportResult(data);
      setSheetMsg(`✅ Imported ${data.created} new + updated ${data.updated} posts from sheet.`);
      // Reload posts list to show the newly imported posts
      loadPosts(profileId);
    } catch (e: any) {
      setSheetMsg(e.response?.data?.detail || "❌ Could not import posts from sheet.");
    } finally {
      setImporting(false);
      setTimeout(() => setSheetMsg(""), 6000);
    }
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
        comments: 40,
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
              Paste the <b>Researcher Google Sheet URL</b> to import all post links into this account,
              or load a narrative to use for sentiment scoring.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <FileSpreadsheet className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-600 pointer-events-none" />
                <input value={sheetUrl} onChange={(e) => { setSheetUrl(e.target.value); setImportResult(null); }}
                  placeholder="Paste Google Sheet URL (researcher/seeding sheet)…"
                  className="w-full rounded-xl border border-border bg-transparent pl-9 pr-3 py-2 text-sm" />
              </div>
              {/* Import all posts from researcher sheet */}
              <button
                onClick={importPostsFromSheet}
                disabled={importing || !sheetUrl}
                className="flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 shrink-0">
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                {importing ? "Importing…" : "Import Posts from Sheet"}
              </button>
              {/* Load narrative only */}
              <Button variant="ghost" onClick={loadFromSheet} disabled={sheetLoading || !sheetUrl} className="shrink-0">
                {sheetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-green-600" />}
                {sheetLoading ? "Loading…" : "Load Narrative"}
              </Button>
            </div>

            {/* Import result */}
            {importResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200">
                <div className="font-semibold mb-1">
                  ✅ {importResult.created} posts created · {importResult.updated} updated · {importResult.total} total
                </div>
                {importResult.sections.map((s: any, i: number) => (
                  <div key={i} className="text-[11px]">
                    {s.client}: {s.created} new, {s.updated} updated
                    {!s.profile_id && <span className="ml-1 text-amber-600">(no matching profile found — posts saved as unlinked)</span>}
                  </div>
                ))}
              </div>
            )}

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
              {activePreset === "daily"   && " Daily view: today's comments only."}
              {activePreset === "weekly"  && " Weekly view: last 7 days, one bar per day."}
              {activePreset === "monthly" && " Monthly view: last 30 days, one bar per day."}
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
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  onClick={generateMissingAnalysis}
                  disabled={generating || bulkAnalyzing}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  {generating ? "Generating…" : "Generate Analysis for All Posts"}
                </button>
                <button
                  onClick={bulkAnalyzeReal}
                  disabled={bulkAnalyzing || generating}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  {bulkAnalyzing ? "Analyzing…" : "Analyze Real Comments"}
                </button>
                {genResult && (
                  <span className="text-[11px] text-green-700 dark:text-green-400 font-medium">
                    ✓ {genResult.generated} comments generated for {genResult.posts_processed} posts
                    {genResult.skipped > 0 ? ` · ${genResult.skipped} already had data` : ""}
                  </span>
                )}
                {bulkResult && (
                  <span className="text-[11px] text-blue-700 dark:text-blue-400 font-medium">
                    ✓ {bulkResult.analyzed.toLocaleString()} comments analyzed across {bulkResult.posts_processed} posts
                    {bulkResult.already_done > 0 ? ` · ${bulkResult.already_done} already done` : ""}
                  </span>
                )}
              </div>
            </div>
          )}

        </Card>
      )}

      {/* ── Public Opinion Narrative ── */}
      {clientId && (narrativeLoading || opinionNarrative) && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-semibold">Public Opinion Narrative</span>
            <span className="ml-1 rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">AI-generated</span>
            <span className="text-xs text-muted ml-1">
              {PRESETS.find((p) => p.key === activePreset)?.label ?? ""} · {opinionNarrative?.stats.total.toLocaleString() ?? "…"} comments analysed
            </span>
            {narrativeLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted ml-auto" />}
          </div>

          {narrativeLoading && !opinionNarrative && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating AI narrative from {PRESETS.find((p) => p.key === activePreset)?.label.toLowerCase()} comment data…
            </div>
          )}

          {opinionNarrative && !narrativeLoading && opinionNarrative.stats.total === 0 && (
            <p className="text-sm text-muted py-4">No comment data available for this account in the selected period.</p>
          )}

          {opinionNarrative && opinionNarrative.stats.total > 0 && (
            <div className="space-y-4">
              {/* Overall narrative */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageCircle className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Overall Public Sentiment</span>
                </div>
                <p className="text-sm leading-relaxed">{opinionNarrative.narrative_paragraph}</p>
                {opinionNarrative.topics.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {opinionNarrative.topics.map((t) => (
                      <span key={t} className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Positive & Negative side-by-side */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Positive */}
                <div className="rounded-xl border border-green-200 dark:border-green-800/30 bg-green-50 dark:bg-green-900/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ThumbsUp className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">Positive Highlights</span>
                    <span className="ml-auto text-xs font-bold text-green-600">{opinionNarrative.stats.positive_pct}%</span>
                  </div>
                  <p className="text-sm leading-relaxed text-green-900 dark:text-green-100">{opinionNarrative.positive_summary}</p>
                  {opinionNarrative.positive_keywords.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {opinionNarrative.positive_keywords.slice(0, 8).map((k) => (
                        <span key={k} className="rounded-full bg-green-200 dark:bg-green-800/40 px-2 py-0.5 text-[10px] font-semibold text-green-800 dark:text-green-200">{k}</span>
                      ))}
                    </div>
                  )}
                  {opinionNarrative.positive_samples.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {opinionNarrative.positive_samples.slice(0, 3).map((s, i) => (
                        <div key={i} className="border-l-2 border-green-400 pl-2.5 text-[11px] italic text-green-800 dark:text-green-200 line-clamp-2">
                          "{s}"
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Negative */}
                <div className="rounded-xl border border-red-200 dark:border-red-800/30 bg-red-50 dark:bg-red-900/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ThumbsDown className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">Negative Concerns</span>
                    <span className="ml-auto text-xs font-bold text-red-500">{opinionNarrative.stats.negative_pct}%</span>
                  </div>
                  <p className="text-sm leading-relaxed text-red-900 dark:text-red-100">{opinionNarrative.negative_summary}</p>
                  {opinionNarrative.negative_keywords.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {opinionNarrative.negative_keywords.slice(0, 8).map((k) => (
                        <span key={k} className="rounded-full bg-red-200 dark:bg-red-800/40 px-2 py-0.5 text-[10px] font-semibold text-red-800 dark:text-red-200">{k}</span>
                      ))}
                    </div>
                  )}
                  {opinionNarrative.negative_samples.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {opinionNarrative.negative_samples.slice(0, 3).map((s, i) => (
                        <div key={i} className="border-l-2 border-red-400 pl-2.5 text-[11px] italic text-red-800 dark:text-red-200 line-clamp-2">
                          "{s}"
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <p className="text-[10px] text-muted text-right">
                Analysis based on {opinionNarrative.stats.total.toLocaleString()} comments ·
                {" "}{opinionNarrative.stats.positive.toLocaleString()} positive ·
                {" "}{opinionNarrative.stats.negative.toLocaleString()} negative ·
                {" "}{opinionNarrative.stats.neutral.toLocaleString()} neutral ·
                Generated by Claude AI
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

        {/* URL search bar + source filter */}
        {profileId && (
          <div className="flex flex-wrap items-center gap-2">
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
            {/* Source type filter */}
            <select
              value={sourceKindFilter}
              onChange={(e) => {
                setSourceKindFilter(e.target.value);
                loadPosts(undefined, undefined, urlSearch);
              }}
              className="rounded-xl border border-border bg-card px-3 py-2 text-xs"
            >
              <option value="">All sources</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="twitter">X / Twitter</option>
              <option value="youtube">YouTube</option>
              <option value="press_rss">Press (RSS)</option>
              <option value="youtube_channel_video">Press (YT Channel)</option>
            </select>
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
