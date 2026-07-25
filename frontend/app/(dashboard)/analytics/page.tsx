"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";
import { SentimentDonut, TrendLine, EmotionBar } from "@/components/dashboard/charts";
import { SourceBreakdownChart } from "@/components/dashboard/SourceBreakdownChart";
import { PressFeedSection } from "@/components/dashboard/PressFeedSection";
import { CounterNarrativeWidget } from "@/components/dashboard/CounterNarrativeWidget";
import { NarrativeBriefingWidget } from "@/components/dashboard/NarrativeBriefingWidget";
import {
  MessageSquare, TrendingUp, TrendingDown, Minus, AlertTriangle,
  Users, Hash, BarChart2, Zap, Eye, Newspaper, Shield, Rss, Brain,
  FileDown, ExternalLink,
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

function buildInsightsHtml(opts: {
  clientName: string;
  industry?: string;
  totalComments: number;
  posCount: number; negCount: number; neuCount: number;
  posPct: number; negPct: number; neuPct: number;
  crisisSignal: string;
  topEmotion: [string, number] | undefined;
  emotions: Record<string, number>;
  trendDays: number;
  avgDaily: number;
  trend: any[];
  words: any[];
  topics: any[];
  briefing: any | null;
  counterNarrative: any | null;
  reportDate: string;
}): string {
  const { clientName, industry, totalComments, posCount, negCount, neuCount,
    posPct, negPct, neuPct, crisisSignal, topEmotion, emotions, trendDays, avgDaily,
    trend, words, topics, briefing, counterNarrative, reportDate } = opts;

  // ─── Derived helpers ──────────────────────────────────────────────────────
  const healthColor = negPct >= 50 ? "#e53e3e" : negPct >= 30 ? "#d69e2e" : "#38a169";
  const healthLabel = negPct >= 50 ? "Crisis" : negPct >= 30 ? "Caution" : "Stable";

  // ─── Sentiment mood label ─────────────────────────────────────────────────
  const sentimentMood = posPct > 60 ? "strongly positive" : posPct > 45 ? "predominantly positive"
    : negPct > 50 ? "critically negative" : negPct > 35 ? "predominantly negative" : "fairly balanced";

  const EMOTION_NOTES: Record<string, string> = {
    "Joy": "Strong positive resonance — the audience is genuinely pleased and engaged.",
    "Trust": "High credibility signals — the audience sees this account as reliable and authoritative.",
    "Anger": "Audience frustration is elevated. Direct, empathetic engagement is required to de-escalate.",
    "Fear": "Concerned responses suggest uncertainty. Reassuring, factual communication is recommended.",
    "Surprise": "The audience is reacting to unexpected content or announcements.",
    "Disgust": "Active opposition detected. Counter-narrative strategy should be prioritised immediately.",
    "Sadness": "Empathetic communication is needed. Avoid dismissive or factual-only responses.",
    "Anticipation": "Audience is forward-looking — ideal timing for announcements or calls to action.",
  };
  const emotionNote = topEmotion ? (EMOTION_NOTES[topEmotion[0]] || "Monitor this emotional pattern and adjust communication tone accordingly.") : "";

  // ─── Executive Summary ────────────────────────────────────────────────────
  const execPara1 = `This report presents a comprehensive social intelligence analysis of <strong>${clientName}</strong>${industry ? ` (${industry})` : ""}, covering <strong>${trendDays} days</strong> of continuous audience monitoring with <strong>${totalComments.toLocaleString()} interactions</strong> analysed across all tracked social platforms. The overall public sentiment profile is <strong>${sentimentMood}</strong> — ${posPct}% of the audience is responding positively while ${negPct}% is expressing criticism or concern.`;

  const execPara2 = topEmotion
    ? `The dominant emotional tone detected is <strong>${topEmotion[0]}</strong>. ${emotionNote} Average daily engagement is <strong>${avgDaily.toLocaleString()} interactions/day</strong>, indicating a ${avgDaily > 500 ? "high" : avgDaily > 100 ? "moderate" : "low"}-volume conversation environment.`
    : `Average daily engagement is <strong>${avgDaily.toLocaleString()} interactions/day</strong>, indicating a ${avgDaily > 500 ? "high" : avgDaily > 100 ? "moderate" : "low"}-volume conversation environment around this account.`;

  const execPara3 = crisisSignal === "High"
    ? `<span style="color:#e53e3e;font-weight:700;">⚠️ Crisis Status:</span> Negative sentiment has crossed the critical 40% threshold. The communications team must prioritise counter-messaging and proactive engagement with critical audiences within 24–48 hours.`
    : crisisSignal === "Medium"
    ? `<span style="color:#d69e2e;font-weight:700;">⚠️ Caution Status:</span> Negative sentiment is elevated at ${negPct}%, approaching the critical threshold. Proactive narrative management is strongly advisable to prevent further deterioration.`
    : `<span style="color:#38a169;font-weight:700;">✅ Stable Status:</span> Reputation metrics are healthy and stable. This is an ideal window to amplify positive narratives and build on current audience momentum.`;

  // ─── Positive / Negative Analysis ─────────────────────────────────────────
  const cn = counterNarrative;
  const amplificationKws: any[] = (cn?.amplification_keywords || []).slice(0, 12);
  const negativeClusters: any[] = (cn?.negative_clusters || []).slice(0, 10);
  const negNarratives: string[] = (cn?.narratives_found || []).slice(0, 5);

  const posParagraph = `The positive response rate of <strong>${posPct}%</strong> (${posCount.toLocaleString()} interactions) represents the core audience base actively supporting ${clientName}. ${posPct > 60 ? "This strong positive majority signals broad audience approval and effective messaging." : posPct > 40 ? "While positive responses are in the majority, there is room to grow this segment through targeted engagement." : "Positive responses exist but are in the minority, indicating a need to actively cultivate supporter voices."} ${amplificationKws.length > 0 ? `Key positive keywords amplified by supporters: <em>${amplificationKws.map((k: any) => k.keyword || k).join(", ")}</em>.` : ""}`;

  const negParagraph = `The negative proportion of <strong>${negPct}%</strong> (${negCount.toLocaleString()} interactions) represents critical voices requiring strategic management. ${negPct > 40 ? "This level of negativity is a reputational risk — the critical audience is nearly matching or outpacing the positive base." : negPct > 25 ? "This elevated criticism suggests organised opposition or recurring unaddressed concerns that need direct engagement." : "The current negative volume is within manageable bounds, but consistent monitoring is essential."} ${negativeClusters.length > 0 ? `Most frequent negative keywords: <em>${negativeClusters.map((c: any) => c.keyword || c).join(", ")}</em>.` : ""}`;

  // ─── Keyword cloud ────────────────────────────────────────────────────────
  const topWords = words.slice(0, 24);
  const maxWord = topWords[0]?.value || 1;
  const WORD_PALETTE = ["#3b82f6","#6366f1","#8b5cf6","#06b6d4","#14b8a6","#10b981","#f59e0b","#f43f5e"];
  const wordCloud = topWords.map((w, i) => {
    const pct = w.value / maxWord;
    const size = Math.round(12 + pct * 26);
    return `<span style="font-size:${size}px;opacity:${0.5+pct*0.5};color:${WORD_PALETTE[i%WORD_PALETTE.length]};font-weight:${pct>0.6?700:600};margin:3px 5px;display:inline-block;">${w.text} <sup style="font-size:9px;opacity:0.6;">${w.value}</sup></span>`;
  }).join("");

  // ─── Topic badges ─────────────────────────────────────────────────────────
  const topicBadges = topics.slice(0, 18).map((t) => {
    const pct = t.size / 100;
    const bg = pct > 0.7 ? "#dbeafe" : pct > 0.4 ? "#e0e7ff" : "#f3f4f6";
    const col = pct > 0.7 ? "#1e40af" : pct > 0.4 ? "#3730a3" : "#374151";
    return `<span style="background:${bg};color:${col};border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;margin:3px;display:inline-block;">${t.topic} · ${t.weight}</span>`;
  }).join("");

  // ─── Emotion rows ─────────────────────────────────────────────────────────
  const emotionRows = Object.entries(emotions)
    .sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 8);
  const maxEmo = (emotionRows[0]?.[1] as number) || 1;

  // ─── Trend table ──────────────────────────────────────────────────────────
  const trendSlice = trend.slice(-14);
  const maxTrendDay = trendSlice.reduce((mx, d) => {
    const t = (d.Positive||0)+(d.Negative||0)+(d.Neutral||0);
    return t > mx.total ? { date: d.date, total: t } : mx;
  }, { date: "", total: 0 });
  const trendTable = trendSlice.map((d) => {
    const total = (d.Positive||0)+(d.Negative||0)+(d.Neutral||0);
    const posPx = total > 0 ? Math.round((d.Positive||0)*120/total) : 0;
    const negPx = total > 0 ? Math.round((d.Negative||0)*120/total) : 0;
    const isPeak = total === maxTrendDay.total && total > 0;
    return `<tr style="border-bottom:1px solid #f0f0f0;${isPeak ? "background:#fffbeb;" : ""}">
      <td style="padding:5px 8px;font-size:12px;color:#555;white-space:nowrap;">${d.date||""}${isPeak?" ⚡":""}</td>
      <td style="padding:5px 8px;font-size:12px;text-align:right;font-weight:${isPeak?700:400};">${total.toLocaleString()}</td>
      <td style="padding:5px 8px;"><div style="display:flex;gap:2px;align-items:center;">
        <div style="width:${posPx}px;height:8px;background:#38a169;border-radius:2px;min-width:${posPx>0?2:0}px;"></div>
        <div style="width:${negPx}px;height:8px;background:#e53e3e;border-radius:2px;min-width:${negPx>0?2:0}px;"></div>
      </div></td>
      <td style="padding:5px 8px;font-size:11px;color:#38a169;">${d.Positive||0}▲</td>
      <td style="padding:5px 8px;font-size:11px;color:#e53e3e;">${d.Negative||0}▼</td>
    </tr>`;
  }).join("");

  // ─── Counter-narrative section ────────────────────────────────────────────
  let counterNarrSection = "";
  if (cn && (cn.overall_strategy || cn.comment_templates?.length || cn.content_angles?.length)) {
    const urgColor = cn.urgency === "high" ? "#e53e3e" : cn.urgency === "medium" ? "#d69e2e" : "#38a169";
    const urgLabel = cn.urgency === "high" ? "HIGH — Immediate Response Required"
      : cn.urgency === "medium" ? "MEDIUM — Proactive Management Recommended" : "LOW — Monitor & Maintain";
    const templatesHtml = (cn.comment_templates||[]).slice(0,3).map((t:string)=>
      `<div style="background:#f0f4ff;border-left:3px solid #6366f1;border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:8px;font-size:12px;color:#374151;font-style:italic;">"${t}"</div>`).join("");
    const anglesHtml = (cn.content_angles||[]).slice(0,4).map((a:string,i:number)=>
      `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
        <span style="background:#dbeafe;color:#1e40af;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${i+1}</span>
        <span style="font-size:12px;color:#374151;line-height:1.6;">${a}</span>
      </div>`).join("");
    const negKwsHtml = negativeClusters.map((c:any)=>
      `<span style="background:#fee2e2;color:#991b1b;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;margin:3px;display:inline-block;">${c.keyword||c}${c.frequency?` (${c.frequency})`:""}</span>`).join("");
    const posKwsHtml = (cn.counter_keywords||[]).slice(0,8).map((k:string)=>
      `<span style="background:#dcfce7;color:#166534;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;margin:3px;display:inline-block;">${k}</span>`).join("");
    counterNarrSection = `
    <div class="section">
      <div class="section-title">🛡️ Counter-Narrative Strategy</div>
      <div style="background:${urgColor}18;border:1px solid ${urgColor}40;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;font-weight:700;color:${urgColor};">🔔 Urgency: ${urgLabel}</div>
      <p style="font-size:12px;color:#4b5563;line-height:1.7;margin-bottom:14px;">${cn.overall_strategy||""}</p>
      ${negNarratives.length>0?`<div style="margin-bottom:14px;"><div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:8px;">Key Negative Narratives Found</div>${negNarratives.map((n:string)=>`<div style="background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:12px;color:#374151;">• ${n}</div>`).join("")}</div>`:""}
      ${negKwsHtml?`<div style="margin-bottom:14px;"><div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:8px;">Top Negative Keywords</div><div>${negKwsHtml}</div></div>`:""}
      ${posKwsHtml?`<div style="margin-bottom:14px;"><div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:8px;">Positive Counter-Keywords to Amplify</div><div>${posKwsHtml}</div></div>`:""}
      ${templatesHtml?`<div style="margin-bottom:14px;"><div style="font-size:13px;font-weight:700;color:#1e40af;margin-bottom:8px;">Suggested Response Templates</div>${templatesHtml}</div>`:""}
      ${anglesHtml?`<div><div style="font-size:13px;font-weight:700;color:#1e40af;margin-bottom:8px;">Content Angles to Explore</div>${anglesHtml}</div>`:""}
    </div>`;
  }

  // ─── Narrative briefing section ───────────────────────────────────────────
  let briefingSection = "";
  if (briefing) {
    const addressHtml = (briefing.address_these||[]).map((item:any)=>
      `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 14px;margin-bottom:10px;">
        <div style="font-weight:700;color:#166534;font-size:13px;margin-bottom:4px;">✅ ${item.topic}</div>
        <div style="font-size:12px;color:#4b5563;line-height:1.6;">${item.reason}</div>
        ${item.keywords?.length?`<div style="margin-top:6px;">${item.keywords.map((k:string)=>`<span style="background:#dcfce7;color:#166534;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;margin-right:4px;">#${k}</span>`).join("")}</div>`:""}
      </div>`).join("");
    const avoidHtml = (briefing.avoid_these||[]).map((item:any)=>
      `<div style="background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;margin-bottom:10px;">
        <div style="font-weight:700;color:#991b1b;font-size:13px;margin-bottom:4px;">🚫 ${item.topic}</div>
        <div style="font-size:12px;color:#4b5563;line-height:1.6;">${item.reason}</div>
        ${item.keywords?.length?`<div style="margin-top:6px;">${item.keywords.map((k:string)=>`<span style="background:#fee2e2;color:#991b1b;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;margin-right:4px;">#${k}</span>`).join("")}</div>`:""}
      </div>`).join("");
    briefingSection = `
    <div class="section">
      <div class="section-title">🧠 Daily Narrative Briefing</div>
      <p style="font-size:12px;color:#6b7280;margin-bottom:16px;">AI-synthesised communication guidance based on 30-day social listening, press coverage, and narrative pattern analysis.</p>
      ${addressHtml?`<div style="margin-bottom:16px;"><div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:8px;">📢 Topics to Address Publicly</div>${addressHtml}</div>`:""}
      ${avoidHtml?`<div><div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:8px;">⛔ Topics to Avoid / Handle with Care</div>${avoidHtml}</div>`:""}
    </div>`;
  }

  // ─── Recommendations ──────────────────────────────────────────────────────
  const recs: {icon:string;priority:string;pColor:string;title:string;text:string}[] = [];
  if (negPct > 40) recs.push({ icon:"🚨", priority:"HIGH PRIORITY", pColor:"#e53e3e", title:"Immediate Crisis Response Required",
    text:`Negative sentiment at ${negPct}% demands immediate action. Deploy rapid response to the most visible negative comments, issue official statements addressing core concerns, and increase positive content output by ≥50% over the next 7 days.` });
  else if (negPct > 25) recs.push({ icon:"⚠️", priority:"MEDIUM PRIORITY", pColor:"#d69e2e", title:"Proactive Narrative Management",
    text:`With ${negPct}% negative sentiment, proactive management will prevent escalation. Focus on direct engagement with critics, transparent communication, and increased cadence of positive content. Weekly sentiment reviews are recommended.` });
  if (topEmotion && (topEmotion[0]==="Anger"||topEmotion[0]==="Disgust")) recs.push({ icon:"💬", priority:"HIGH PRIORITY", pColor:"#e53e3e",
    title:`De-escalate Dominant ${topEmotion[0]} Emotion`,
    text:`The audience's dominant emotion is ${topEmotion[0]}. Priority tactics: acknowledge concerns publicly, issue empathetic statements, and ensure no new controversies emerge during the de-escalation period.` });
  if (posPct > 50) recs.push({ icon:"✅", priority:"OPPORTUNITY", pColor:"#38a169", title:"Amplify Positive Audience Voices",
    text:`With ${posPct}% positive sentiment, there is a strong supporter base to leverage. Create shareable content around positive themes, encourage user-generated content, and personally engage with top positive commenters to build ambassador relationships.` });
  if (briefing?.address_these?.length > 0) { const t=briefing.address_these[0]; recs.push({ icon:"📢", priority:"STRATEGIC", pColor:"#2563eb",
    title:`Address: "${t.topic}"`, text:t.reason+(t.keywords?.length?` Key terms: ${t.keywords.slice(0,5).join(", ")}.`:"") }); }
  if (topics.length > 0) recs.push({ icon:"💡", priority:"CONTENT STRATEGY", pColor:"#7c3aed", title:"Engage with Top Conversation Clusters",
    text:`The most discussed topics are: ${topics.slice(0,5).map((t:any)=>t.topic).join(", ")}. Creating targeted content that addresses these themes will demonstrate audience awareness and improve engagement quality.` });
  if (recs.length === 0) recs.push({ icon:"📊", priority:"MAINTENANCE", pColor:"#6b7280", title:"Maintain Current Strategy",
    text:"Current sentiment metrics are stable. Continue regular content cadence, maintain comment engagement, and monitor for any sentiment shifts. Weekly reporting is sufficient at these levels." });
  const recsHtml = recs.map((r)=>
    `<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:14px;padding:14px;background:#f8fafc;border-radius:10px;border:1px solid #e5e7eb;">
      <div style="font-size:20px;flex-shrink:0;">${r.icon}</div>
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
          <span style="font-size:10px;font-weight:700;color:${r.pColor};background:${r.pColor}18;border-radius:999px;padding:2px 8px;">${r.priority}</span>
          <span style="font-size:13px;font-weight:700;color:#1a202c;">${r.title}</span>
        </div>
        <p style="font-size:12px;color:#4b5563;line-height:1.7;margin:0;">${r.text}</p>
      </div>
    </div>`).join("");

  // ─── Conclusion ────────────────────────────────────────────────────────────
  const conclusionText = `Based on the analysis of ${totalComments.toLocaleString()} interactions over ${trendDays} days, ${clientName} faces ${crisisSignal==="High"?"a significant reputational challenge requiring immediate coordinated action":crisisSignal==="Medium"?"an elevated risk environment demanding proactive management":"a stable digital reputation landscape that benefits from consistent monitoring"}. The ${sentimentMood} sentiment balance${topEmotion?`, combined with the dominant ${topEmotion[0]} emotional tone,`:" "} suggests that ${posPct>50?"the core audience is supportive and can be activated for positive amplification":"rebuilding audience trust should be the primary communications objective"}. ${topics.length>0?`The conversation centres around ${topics.slice(0,3).map((t:any)=>t.topic).join(", ")} — messaging that speaks directly to these themes will improve resonance. `:""}The next cycle should focus on ${negPct>35?"tracking whether recommended counter-narrative actions have reduced negative sentiment":"sustaining positive momentum and expanding audience reach"}.`;

  // ─── Full HTML ────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Social Insights Report — ${clientName}</title>
<style>
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;color:#1a202c;}
  .page{max-width:920px;margin:0 auto;padding:28px 24px;}
  .print-btn{display:block;margin:0 0 20px;padding:10px 28px;background:#1e40af;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;width:fit-content;}
  .cover{background:linear-gradient(135deg,#0f2460 0%,#1e40af 60%,#2563eb 100%);color:#fff;border-radius:16px;padding:32px 36px;margin-bottom:24px;}
  .cover-title{font-size:28px;font-weight:800;margin-bottom:4px;}
  .cover-sub{font-size:14px;opacity:0.85;margin-bottom:18px;}
  .cover-chips{display:flex;gap:10px;flex-wrap:wrap;}
  .cover-chip{background:rgba(255,255,255,0.18);border-radius:999px;padding:5px 14px;font-size:12px;font-weight:600;}
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px;}
  .kpi-box{background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:16px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06);}
  .kpi-val{font-size:28px;font-weight:800;margin-bottom:2px;}
  .kpi-lbl{font-size:11px;color:#6b7280;font-weight:500;}
  .kpi-sub{font-size:10px;color:#9ca3af;margin-top:2px;}
  .section{background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:22px 24px;margin-bottom:18px;box-shadow:0 1px 3px rgba(0,0,0,.06);}
  .section-title{font-size:15px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:6px;color:#1a202c;}
  .section-sub{font-size:12px;color:#6b7280;line-height:1.7;margin-bottom:14px;}
  .sent-bar{height:20px;border-radius:999px;overflow:hidden;display:flex;margin:10px 0;}
  .sent-bar-pos{background:#38a169;} .sent-bar-neg{background:#e53e3e;} .sent-bar-neu{background:#9ca3af;}
  .sent-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-top:6px;}
  .sent-dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:5px;}
  .health-badge{display:inline-flex;align-items:center;gap:6px;background:${healthColor};color:#fff;border-radius:10px;padding:8px 18px;font-size:13px;font-weight:700;margin-top:10px;}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;}
  .card-pos{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;}
  .card-neg{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;}
  .card-pct{font-size:32px;font-weight:800;margin-bottom:2px;}
  .emo-row{display:flex;align-items:center;margin-bottom:8px;gap:8px;}
  .emo-label{width:120px;font-size:12px;color:#374151;text-align:right;flex-shrink:0;}
  .emo-bar-wrap{flex:1;background:#f3f4f6;border-radius:999px;height:10px;overflow:hidden;}
  .emo-bar-fill{height:100%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:999px;}
  .emo-count{width:50px;font-size:11px;color:#6b7280;text-align:right;}
  .trend-table{width:100%;border-collapse:collapse;font-size:12px;}
  .trend-table th{text-align:left;padding:6px 8px;font-size:11px;color:#6b7280;font-weight:600;border-bottom:2px solid #e5e7eb;}
  .word-cloud{display:flex;flex-wrap:wrap;align-items:center;line-height:2.2;}
  .topic-cloud{display:flex;flex-wrap:wrap;}
  .footer{text-align:center;padding:20px;font-size:11px;color:#9ca3af;margin-top:10px;border-top:1px solid #e5e7eb;}
  @media print{
    .print-btn{display:none!important;}.page{padding:16px;}.cover{border-radius:10px;}
    .section{break-inside:avoid;margin-bottom:12px;}.kpi-row{break-inside:avoid;}.two-col{break-inside:avoid;}
  }
</style>
</head>
<body>
<div class="page">
<button class="print-btn" onclick="window.print()">🖨 Save as PDF (Ctrl+P)</button>

<!-- COVER -->
<div class="cover">
  <div class="cover-title">Social Insights Report</div>
  <div class="cover-sub">${clientName}${industry?" · "+industry:""}</div>
  <div class="cover-chips">
    <span class="cover-chip">📅 ${reportDate}</span>
    <span class="cover-chip">💬 ${totalComments.toLocaleString()} interactions</span>
    <span class="cover-chip">📊 ${trendDays} days tracked</span>
    <span class="cover-chip" style="background:${negPct>=50?"rgba(229,62,62,.5)":negPct>=30?"rgba(214,158,46,.5)":"rgba(56,161,105,.5)"};">🔍 ${healthLabel} Reputation</span>
    <span class="cover-chip">⚡ ${avgDaily.toLocaleString()}/day avg</span>
  </div>
</div>

<!-- KPIs -->
<div class="kpi-row">
  <div class="kpi-box"><div class="kpi-val" style="color:#2563eb;">${totalComments.toLocaleString()}</div><div class="kpi-lbl">Total Interactions</div><div class="kpi-sub">all platforms</div></div>
  <div class="kpi-box"><div class="kpi-val" style="color:#38a169;">${posPct}%</div><div class="kpi-lbl">Positive Sentiment</div><div class="kpi-sub">${posCount.toLocaleString()} supportive</div></div>
  <div class="kpi-box"><div class="kpi-val" style="color:#e53e3e;">${negPct}%</div><div class="kpi-lbl">Negative Sentiment</div><div class="kpi-sub">${negCount.toLocaleString()} critical</div></div>
  <div class="kpi-box"><div class="kpi-val" style="color:${healthColor};">${crisisSignal}</div><div class="kpi-lbl">Reputation Risk</div><div class="kpi-sub">${negPct}% neg threshold</div></div>
</div>

<!-- EXECUTIVE SUMMARY -->
<div class="section">
  <div class="section-title">📋 Executive Summary</div>
  <p style="font-size:13px;color:#374151;line-height:1.8;margin-bottom:10px;">${execPara1}</p>
  <p style="font-size:13px;color:#374151;line-height:1.8;margin-bottom:10px;">${execPara2}</p>
  <p style="font-size:13px;color:#374151;line-height:1.8;">${execPara3}</p>
</div>

<!-- OVERALL SENTIMENT -->
<div class="section">
  <div class="section-title">💬 Overall Sentiment Overview</div>
  <p class="section-sub">Distribution of public sentiment across all monitored interactions. This reflects the aggregate emotional posture of all audiences engaging with ${clientName}.</p>
  <div class="sent-bar">
    <div class="sent-bar-pos" style="width:${posPct}%;"></div>
    <div class="sent-bar-neg" style="width:${negPct}%;"></div>
    <div class="sent-bar-neu" style="width:${neuPct}%;"></div>
  </div>
  <div class="sent-legend">
    <span><span class="sent-dot" style="background:#38a169;"></span>Positive ${posCount.toLocaleString()} (${posPct}%)</span>
    <span><span class="sent-dot" style="background:#e53e3e;"></span>Negative ${negCount.toLocaleString()} (${negPct}%)</span>
    <span><span class="sent-dot" style="background:#9ca3af;"></span>Neutral ${neuCount.toLocaleString()} (${neuPct}%)</span>
  </div>
  <div class="health-badge">${healthLabel==="Stable"?"✅":healthLabel==="Caution"?"⚠️":"🚨"} ${healthLabel} — ${negPct>=50?"Crisis monitoring required. Immediate strategy response needed.":negPct>=30?"Elevated risk. Active monitoring and proactive engagement recommended.":"Sentiment is healthy. Sustain current engagement strategy."}</div>
</div>

<!-- POSITIVE + NEGATIVE DEEP-DIVE -->
<div class="two-col">
  <div class="card-pos">
    <div style="font-size:12px;font-weight:600;color:#166534;margin-bottom:8px;">✅ Positive Sentiment Analysis</div>
    <div class="card-pct" style="color:#38a169;">${posPct}%</div>
    <div style="font-size:11px;color:#166534;margin-bottom:10px;">${posCount.toLocaleString()} supportive interactions</div>
    <p style="font-size:12px;color:#374151;line-height:1.7;">${posParagraph}</p>
    ${amplificationKws.length>0?`<div style="margin-top:10px;">${amplificationKws.map((k:any)=>`<span style="background:#dcfce7;color:#166534;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;margin:2px;display:inline-block;">${k.keyword||k}</span>`).join("")}</div>`:""}
  </div>
  <div class="card-neg">
    <div style="font-size:12px;font-weight:600;color:#991b1b;margin-bottom:8px;">❌ Negative Sentiment Analysis</div>
    <div class="card-pct" style="color:#e53e3e;">${negPct}%</div>
    <div style="font-size:11px;color:#991b1b;margin-bottom:10px;">${negCount.toLocaleString()} critical interactions</div>
    <p style="font-size:12px;color:#374151;line-height:1.7;">${negParagraph}</p>
    ${negativeClusters.length>0?`<div style="margin-top:10px;">${negativeClusters.map((c:any)=>`<span style="background:#fee2e2;color:#991b1b;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;margin:2px;display:inline-block;">${c.keyword||c}</span>`).join("")}</div>`:""}
  </div>
</div>

<!-- EMOTION BREAKDOWN -->
${emotionRows.length>0?`<div class="section">
  <div class="section-title">🎭 Emotion & Psychology Analysis</div>
  <p class="section-sub">Emotional tones detected across audience comments. Understanding the psychological response pattern helps tailor communication to resonate with — or de-escalate — the audience's emotional state.${topEmotion?` The dominant emotion is <strong>${topEmotion[0]}</strong>. ${emotionNote}`:""}</p>
  ${emotionRows.map(([name,val])=>{const pct=Math.round((val as number)*100/maxEmo);return`<div class="emo-row"><div class="emo-label">${name}</div><div class="emo-bar-wrap"><div class="emo-bar-fill" style="width:${pct}%;"></div></div><div class="emo-count">${(val as number).toLocaleString()}</div></div>`;}).join("")}
</div>`:""}

<!-- KEYWORD INTELLIGENCE -->
${topWords.length>0?`<div class="section">
  <div class="section-title">🔤 Keyword Intelligence</div>
  <p class="section-sub">Most frequently mentioned words across all audience interactions. Word size indicates frequency. Aligning content messaging to these terms increases audience resonance.</p>
  <div class="word-cloud">${wordCloud}</div>
</div>`:""}

<!-- TOPIC CLUSTERS -->
${topics.length>0?`<div class="section">
  <div class="section-title">⚡ Topic Clusters & Narratives</div>
  <p class="section-sub">Recurring themes and narratives extracted from comment analysis. Each cluster represents a conversation thread actively discussed by the audience — both positively and negatively.</p>
  <div class="topic-cloud">${topicBadges}</div>
  ${negNarratives.length>0?`<div style="margin-top:14px;"><div style="font-size:12px;font-weight:700;color:#991b1b;margin-bottom:6px;">Key Negative Narratives Detected:</div>${negNarratives.map((n:string)=>`<div style="background:#fff5f5;border-left:3px solid #fca5a5;border-radius:0 6px 6px 0;padding:6px 10px;margin-bottom:5px;font-size:12px;color:#374151;">• ${n}</div>`).join("")}</div>`:""}
</div>`:""}

<!-- TREND -->
${trendSlice.length>0?`<div class="section">
  <div class="section-title">📈 Engagement Trend — Last ${trendSlice.length} Days</div>
  <p class="section-sub">Daily interaction volume with sentiment breakdown. Green = positive, Red = negative. ${maxTrendDay.date?`Peak engagement: <strong>${maxTrendDay.date}</strong> with <strong>${maxTrendDay.total.toLocaleString()}</strong> interactions.`:""} Spikes often correlate with high-visibility posts, media coverage, or external events.</p>
  <table class="trend-table"><thead><tr>
    <th>Date</th><th style="text-align:right;">Total</th><th>Sentiment Mix</th><th style="color:#38a169;">Positive</th><th style="color:#e53e3e;">Negative</th>
  </tr></thead><tbody>${trendTable}</tbody></table>
</div>`:""}

${counterNarrSection}
${briefingSection}

<!-- RECOMMENDATIONS -->
<div class="section" style="border-color:#e0e7ff;background:linear-gradient(135deg,#f5f3ff 0%,#fff 100%);">
  <div class="section-title" style="color:#4c1d95;">🎯 Recommendations & Action Plan</div>
  <p class="section-sub">Prioritised action items based on current sentiment data, emotional analysis, and AI-generated narrative intelligence. Implement in priority order for maximum reputational impact.</p>
  ${recsHtml}
</div>

<!-- CONCLUSION -->
<div class="section" style="background:linear-gradient(135deg,#eff6ff 0%,#fff 100%);">
  <div class="section-title">📌 Conclusion</div>
  <p style="font-size:13px;color:#374151;line-height:1.8;margin-bottom:14px;">${conclusionText}</p>
  <div style="padding:12px 16px;background:#1e40af;border-radius:10px;color:#fff;font-size:12px;font-weight:600;">
    Next Review: ${trendDays>0?"Monitor weekly and compare against this baseline. If negative sentiment increases by >5%, escalate to crisis protocol.":"Establish baseline data by running a full report after 7+ days of data collection."}
  </div>
</div>

<!-- SOCIAL LISTENING SUMMARY -->
<div class="section" style="background:#f8fafc;">
  <div class="section-title">🔍 Social Listening Summary</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:12px;">
    <div>
      <div style="font-weight:700;margin-bottom:8px;color:#1e40af;">Engagement Metrics</div>
      <div style="margin-bottom:4px;">📊 Total: <strong>${totalComments.toLocaleString()}</strong></div>
      <div style="margin-bottom:4px;">📅 Days tracked: <strong>${trendDays}</strong></div>
      <div style="margin-bottom:4px;">⚡ Daily avg: <strong>${avgDaily.toLocaleString()}</strong></div>
      <div style="margin-bottom:4px;">⚡ Topics: <strong>${topics.length}</strong></div>
      <div style="margin-bottom:4px;">🔤 Keywords: <strong>${words.length}</strong></div>
    </div>
    <div>
      <div style="font-weight:700;margin-bottom:8px;color:#1e40af;">Reputation Status</div>
      <div style="margin-bottom:4px;">✅ Positive: <strong>${posCount.toLocaleString()} (${posPct}%)</strong></div>
      <div style="margin-bottom:4px;">❌ Negative: <strong>${negCount.toLocaleString()} (${negPct}%)</strong></div>
      <div style="margin-bottom:4px;">⚪ Neutral: <strong>${neuCount.toLocaleString()} (${neuPct}%)</strong></div>
      ${topEmotion?`<div style="margin-bottom:4px;">💡 Dom. emotion: <strong>${topEmotion[0]}</strong></div>`:""}
      <div style="margin-top:8px;font-weight:700;color:${healthColor};">${negPct>=50?"🚨 Crisis monitoring active":negPct>=30?"⚠️ Elevated — monitor closely":"✅ Stable"}</div>
    </div>
  </div>
</div>

<div class="footer">
  <p>Social Insights Report · ${clientName} · Generated by ORM CMS</p>
  <p style="margin-top:3px;">${reportDate} · BrandThink Agency · orm.itechexpand.com · Confidential — For internal use only</p>
</div>
</div>
</body>
</html>`;
}

export default function AnalyticsPage() {
  const [clients, setClients]       = useState<any[]>([]);
  const [clientId, setClientId]     = useState<string>("");
  const [sentiment, setSentiment]   = useState<any>({ counts: {} });
  const [emotion, setEmotion]       = useState<any>({ emotions: {} });
  const [trend, setTrend]           = useState<any[]>([]);
  const [words, setWords]           = useState<any[]>([]);
  const [topics, setTopics]         = useState<any[]>([]);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    api.get("/clients").then((r) => {
      const list = r.data || [];
      setClients(list);
      if (list.length > 0) setClientId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    // Guard: never fetch without a real client selected — empty string triggers unfiltered all-tenant data
    if (!clientId) return;
    const p = { client_id: clientId };
    setLoading(true);
    // Reset stale data so old account's keywords don't flash while new data loads
    setSentiment({ counts: {} });
    setEmotion({ emotions: {} });
    setTrend([]);
    setWords([]);
    setTopics([]);
    Promise.all([
      api.get("/analytics/sentiment-overview", { params: p }),
      api.get("/analytics/emotion-breakdown",  { params: p }),
      api.get("/analytics/trend",              { params: p }),
      api.get("/analytics/word-frequency",     { params: p }),
      api.get("/analytics/topic-clusters",     { params: p }),
    ]).then(([s, e, t, w, tc]) => {
      setSentiment(s.data);
      setEmotion(e.data);
      setTrend(t.data.trend || []);
      setWords(w.data.words || []);
      setTopics(tc.data.clusters || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [clientId]);

  const maxWord = words[0]?.value || 1;
  const selClient = clients.find((c) => c.id === clientId);

  // Derived stats
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

  const [reportLoading, setReportLoading] = useState(false);

  async function generateReport(mode: "preview" | "download") {
    if (!clientId || !selClient) return;
    setReportLoading(true);
    let briefing: any = null;
    let counterNarr: any = null;
    try {
      const [br, cn] = await Promise.all([
        api.get("/analytics/narrative-briefing", { params: { client_id: clientId, days: 30 } }),
        api.get("/analytics/counter-narrative",  { params: { client_id: clientId } }),
      ]);
      briefing = br.data;
      counterNarr = cn.data;
    } catch { /* both optional */ }

    const reportDate = new Date().toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });
    const html = buildInsightsHtml({
      clientName: selClient.name,
      industry: selClient.industry,
      totalComments, posCount, negCount, neuCount,
      posPct, negPct, neuPct, crisisSignal,
      topEmotion: topEmotion as [string, number] | undefined,
      emotions, trendDays, avgDaily, trend, words, topics,
      briefing, counterNarrative: counterNarr, reportDate,
    });

    if (mode === "download") {
      const safeName = selClient.name.replace(/[^\w\s\-]/g, "").trim().replace(/\s+/g, "_");
      const filename = `Social_Insights_${safeName}_${new Date().toISOString().slice(0,10)}.pdf`;
      try {
        const resp = await api.post("/analytics/html-to-pdf", { html, filename }, { responseType: "arraybuffer" });
        const blob = new Blob([resp.data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch {
        const w = window.open("", "_blank", "width=1100,height=850,scrollbars=yes");
        if (w) { w.document.write(html); w.document.close(); w.focus(); }
      }
    } else {
      const w = window.open("", "_blank", "width=1200,height=850,scrollbars=yes");
      if (!w) { alert("Allow pop-ups to open the report."); setReportLoading(false); return; }
      w.document.write(html); w.document.close(); w.focus();
    }
    setReportLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Social Insights</h1>
          {selClient && (
            <p className="text-xs text-muted mt-0.5">
              Social listening report for <span className="font-semibold text-fg">{selClient.name}</span>
              {selClient.industry ? ` · ${selClient.industry}` : ""}
            </p>
          )}
        </div>
        {clients.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm min-w-[180px]"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={() => generateReport("preview")}
              disabled={!clientId || loading || reportLoading}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Open full report in a new window"
            >
              <Eye className="h-4 w-4" />
              {reportLoading ? "Generating…" : "Preview Report"}
            </button>
            <button
              onClick={() => generateReport("download")}
              disabled={!clientId || loading || reportLoading}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              title="Download full report as PDF"
            >
              <FileDown className="h-4 w-4" />
              {reportLoading ? "Generating…" : "Download Report"}
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Loading analytics…
        </div>
      )}

      {/* ── Daily Narrative Briefing ── */}
      {clientId && (
        <Card className="border-2 border-dashed border-border">
          <div className="mb-3 flex items-center gap-2">
            <Brain className="h-4 w-4 text-accent" />
            <div>
              <h3 className="text-sm font-semibold">Daily Narrative Briefing</h3>
              <p className="text-[11px] text-muted">
                What {selClient?.name || "this account"} should publicly address vs. avoid today — synthesised from social listening, AI narratives, and press coverage.
              </p>
            </div>
          </div>
          <NarrativeBriefingWidget clientId={clientId} clientName={selClient?.name} />
        </Card>
      )}

      {/* Social Listening KPI Row */}
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
            Avg daily activity: <span className="font-bold">{avgDaily.toLocaleString()}</span> comments/day
          </div>
        )}
        {negPct >= 30 && (
          <div className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            Reputation monitoring recommended
          </div>
        )}
      </div>

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

      {/* Source Breakdown — Press + Social */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold">Source Breakdown — Social vs Press</h3>
        </div>
        <p className="mb-3 text-xs text-muted">
          Sentiment distribution across social platforms and press/web sources for{" "}
          {selClient?.name || "this account"}.
        </p>
        <SourceBreakdownChart clientId={clientId} />
      </Card>

      {/* Press Intelligence Feed */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Rss className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold">Press & Web Intelligence Feed</h3>
        </div>
        <p className="mb-3 text-xs text-muted">
          News articles and web coverage about {selClient?.name || "this account"} — from RSS feeds and YouTube news channels.
        </p>
        <PressFeedSection clientId={clientId} />
      </Card>

      {/* Counter-Narrative Strategy Engine */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Shield className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold">Counter-Narrative Strategy Engine</h3>
        </div>
        <p className="mb-3 text-xs text-muted">
          AI-powered analysis of negative comment patterns with counter-keyword clusters, comment templates, and content strategy for {selClient?.name || "this account"}.
        </p>
        <CounterNarrativeWidget clientId={clientId} />
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
            <div className={`mt-1 font-semibold ${crisisColor}`}>
              {negPct >= 50 ? "⚠️ Crisis monitoring active" : negPct >= 30 ? "⚠️ Elevated negative — monitor" : "✅ Sentiment stable"}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
