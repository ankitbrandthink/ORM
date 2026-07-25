"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";
import {
  Newspaper, Plus, Trash2, RefreshCw, Globe, Building2, ExternalLink,
  AlertCircle, CheckCircle2, Youtube, Rss, Library, Search,
  CheckSquare, Square, Download, FileDown, Map, ChevronDown, ChevronUp,
  Calendar, Filter, Clock,
} from "lucide-react";

interface PressSource {
  id: string;
  name: string;
  kind: "rss" | "youtube_channel";
  url: string;
  client_id: string | null;
  source_type: string;
  leaning: string;
  article_type_default: string;
  domestic: boolean;
  circulation: number | null;
  primary_region: string | null;
  config: Record<string, any>;
  is_active: boolean;
  last_ingested_at: string | null;
}

interface Article {
  id: string;
  title: string;
  content: string;
  url: string;
  author: string;
  source_kind: string;
  source_name: string;
  leaning: string;
  domestic: boolean;
  primary_region: string | null;
  published_at: string | null;
  language: string;
  comment_languages: Record<string, number>;
  comment_sentiment_counts: { Positive: number; Negative: number; Neutral: number };
  sentiment: string;
  crisis_probability: number;
  urgency_score: number;
  virality_score: number;
  political_angle: string;
  main_narrative: string;
  summary: string;
}

interface PressInsights {
  total: number;
  sources: Array<{
    name: string; leaning: string; domestic: boolean; primary_region: string | null;
    total: number; Positive: number; Negative: number; Neutral: number;
    crisis_count: number; avg_urgency: number;
  }>;
  languages: Record<string, number>;
  comment_languages: Record<string, number>;
  regions: Record<string, { total: number; Positive: number; Negative: number; Neutral: number; domestic: boolean }>;
}

interface FullReportSource {
  name: string; region: string | null; circulation: number | null; last_ingested: string | null;
  leaning: string; domestic: boolean; total: number;
  Positive: number; Negative: number; Neutral: number;
  pos_pct: number; neg_pct: number; neu_pct: number;
  stances: Record<string, number>; top_topics: Array<{ topic: string; count: number }>;
  keywords: Array<{ word: string; count: number }>;
  top_positive: FullReportArticle[]; top_negative: FullReportArticle[]; crisis_count: number;
}

interface FullReportArticle {
  title: string; summary: string; url: string; published_at: string | null;
  source_name: string; sentiment: string; crisis_probability: number; urgency_score: number;
  topics: string[]; stance: string;
}

interface FullReportData {
  total: number;
  sources: FullReportSource[];
  keywords: { positive: Array<{ word: string; count: number }>; negative: Array<{ word: string; count: number }>; all: Array<{ word: string; count: number }> };
  top_positive_articles: FullReportArticle[];
  top_negative_articles: FullReportArticle[];
  crisis_articles: FullReportArticle[];
  stances: Record<string, number>;
  topics: Array<{ topic: string; count: number }>;
  regions: Record<string, { total: number; Positive: number; Negative: number; Neutral: number }>;
}

interface Client { id: string; name: string; }

const LEANING_COLORS: Record<string, string> = {
  independent: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  friendly:    "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  hostile:     "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
};

const BLANK: Partial<PressSource> = {
  name: "", kind: "rss", url: "", client_id: null,
  source_type: "mainline_press", leaning: "independent",
  article_type_default: "news", domestic: true,
  circulation: undefined, primary_region: "",
};

const INTERNATIONAL_SOURCES: any[] = [
  // Global Wire Services
  { name: "BBC World Service", kind: "rss", url: "http://feeds.bbci.co.uk/news/world/rss.xml", category: "GLOBAL WIRE", leaning: "independent", domestic: false, circulation: 40000, primary_region: "UK / Global", source_type: "mainline_press", article_type_default: "news" },
  { name: "Reuters – Top News", kind: "rss", url: "https://feeds.reuters.com/reuters/topNews", category: "GLOBAL WIRE", leaning: "independent", domestic: false, circulation: 30000, primary_region: "Global", source_type: "mainline_press", article_type_default: "news" },
  { name: "Associated Press", kind: "rss", url: "https://apnews.com/index.rss", category: "GLOBAL WIRE", leaning: "independent", domestic: false, circulation: 35000, primary_region: "USA / Global", source_type: "mainline_press", article_type_default: "news" },
  // English Press
  { name: "The Guardian – World", kind: "rss", url: "https://www.theguardian.com/world/rss", category: "ENGLISH PRESS", leaning: "independent", domestic: false, circulation: 9000, primary_region: "UK", source_type: "mainline_press", article_type_default: "news" },
  { name: "Financial Times", kind: "rss", url: "https://www.ft.com/rss/home", category: "ENGLISH PRESS", leaning: "independent", domestic: false, circulation: 12000, primary_region: "UK / Global", source_type: "mainline_press", article_type_default: "news" },
  { name: "The Economist", kind: "rss", url: "https://www.economist.com/rss/world_rss.xml", category: "ENGLISH PRESS", leaning: "independent", domestic: false, circulation: 13000, primary_region: "UK / Global", source_type: "mainline_press", article_type_default: "opinion" },
  { name: "Al Jazeera English", kind: "rss", url: "https://www.aljazeera.com/xml/rss/all.xml", category: "MIDDLE EAST / ASIA", leaning: "independent", domestic: false, circulation: 8000, primary_region: "Qatar / Global", source_type: "mainline_press", article_type_default: "news" },
  { name: "South China Morning Post", kind: "rss", url: "https://www.scmp.com/rss/5/feed", category: "ASIA PACIFIC", leaning: "independent", domestic: false, circulation: 5000, primary_region: "Hong Kong / Asia", source_type: "mainline_press", article_type_default: "news" },
  { name: "Nikkei Asia", kind: "rss", url: "https://asia.nikkei.com/rss/feed/nar", category: "ASIA PACIFIC", leaning: "independent", domestic: false, circulation: 4500, primary_region: "Japan / Asia", source_type: "mainline_press", article_type_default: "news" },
  // US Media
  { name: "CNN – World", kind: "rss", url: "http://rss.cnn.com/rss/edition_world.rss", category: "US MEDIA", leaning: "independent", domestic: false, circulation: 50000, primary_region: "USA", source_type: "mainline_press", article_type_default: "news" },
  { name: "The Washington Post – World", kind: "rss", url: "https://feeds.washingtonpost.com/rss/world", category: "US MEDIA", leaning: "independent", domestic: false, circulation: 12000, primary_region: "USA", source_type: "mainline_press", article_type_default: "news" },
  { name: "New York Times – Asia", kind: "rss", url: "https://rss.nytimes.com/services/xml/rss/nyt/AsiaPacific.xml", category: "US MEDIA", leaning: "independent", domestic: false, circulation: 13000, primary_region: "USA", source_type: "mainline_press", article_type_default: "news" },
  { name: "Bloomberg – Asia", kind: "rss", url: "https://feeds.bloomberg.com/asia-politics/news.rss", category: "US MEDIA", leaning: "independent", domestic: false, circulation: 20000, primary_region: "USA / Global", source_type: "mainline_press", article_type_default: "news" },
  // European Media
  { name: "Deutsche Welle – Asia", kind: "rss", url: "https://rss.dw.com/xml/rss-en-asia", category: "EUROPEAN MEDIA", leaning: "independent", domestic: false, circulation: 7000, primary_region: "Germany / Global", source_type: "mainline_press", article_type_default: "news" },
  { name: "France 24 – Asia Pacific", kind: "rss", url: "https://www.france24.com/en/asia-pacific/rss", category: "EUROPEAN MEDIA", leaning: "independent", domestic: false, circulation: 6000, primary_region: "France / Global", source_type: "mainline_press", article_type_default: "news" },
  // Global Video / YouTube
  { name: "BBC News YouTube", kind: "youtube_channel", url: "https://www.youtube.com/@BBCNews", category: "GLOBAL VIDEO", leaning: "independent", domestic: false, circulation: null, primary_region: "UK / Global", source_type: "mainline_press", article_type_default: "news" },
  { name: "Al Jazeera English YouTube", kind: "youtube_channel", url: "https://www.youtube.com/@AlJazeeraEnglish", category: "GLOBAL VIDEO", leaning: "independent", domestic: false, circulation: null, primary_region: "Qatar / Global", source_type: "mainline_press", article_type_default: "news" },
  { name: "DW News YouTube", kind: "youtube_channel", url: "https://www.youtube.com/@dwnews", category: "GLOBAL VIDEO", leaning: "independent", domestic: false, circulation: null, primary_region: "Germany / Global", source_type: "mainline_press", article_type_default: "news" },
  { name: "France 24 English YouTube", kind: "youtube_channel", url: "https://www.youtube.com/@FRANCE24English", category: "GLOBAL VIDEO", leaning: "independent", domestic: false, circulation: null, primary_region: "France / Global", source_type: "mainline_press", article_type_default: "news" },
];

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

function isNationalSource(s: PressSource) {
  return s.domestic && (!s.primary_region || /pan.?india|national|all.?india/i.test(s.primary_region));
}

const LANG_NAMES: Record<string, string> = {
  en: "English", hi: "Hindi", ur: "Urdu", bn: "Bengali", ta: "Tamil",
  te: "Telugu", mr: "Marathi", gu: "Gujarati", kn: "Kannada", ml: "Malayalam",
  pa: "Punjabi", or: "Odia", as: "Assamese", ne: "Nepali", sa: "Sanskrit",
  ar: "Arabic", fr: "French", de: "German", zh: "Chinese", es: "Spanish",
  pt: "Portuguese", ru: "Russian", ja: "Japanese", ko: "Korean",
};

function buildPressReportHtml(opts: {
  articles: Article[];
  insights: PressInsights | null;
  reportData: FullReportData | null;
  clientName: string;
  reportDate: string;
}): string {
  const { articles, insights, reportData, clientName, reportDate } = opts;

  // Categorise using primary_region from article (now returned directly by API)
  const nationalArts = articles.filter((a) =>
    a.domestic && (!a.primary_region || /pan.?india|national|all.?india/i.test(a.primary_region))
  );
  const regionalArts = articles.filter((a) =>
    a.domestic && !!a.primary_region && !/pan.?india|national|all.?india/i.test(a.primary_region)
  );
  const intlArts = articles.filter((a) => !a.domestic);

  // ── Helper functions ──────────────────────────────────────────────────────
  function sentStats(arts: Article[]) {
    const pos = arts.filter((a) => a.sentiment === "Positive").length;
    const neg = arts.filter((a) => a.sentiment === "Negative").length;
    const neu = arts.filter((a) => a.sentiment === "Neutral").length;
    const total = arts.length;
    return {
      total, pos, neg, neu,
      posPct: total > 0 ? Math.round(pos * 100 / total) : 0,
      negPct: total > 0 ? Math.round(neg * 100 / total) : 0,
      neuPct: total > 0 ? Math.round(neu * 100 / total) : 0,
    };
  }

  function leaningBreakdown(arts: Article[]) {
    return {
      friendly: arts.filter((a) => a.leaning === "friendly").length,
      hostile:  arts.filter((a) => a.leaning === "hostile").length,
      independent: arts.filter((a) => a.leaning === "independent").length,
    };
  }

  function topSources(arts: Article[], n = 7) {
    const counts: Record<string, number> = {};
    arts.forEach((a) => { if (a.source_name) counts[a.source_name] = (counts[a.source_name] || 0) + 1; });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, n);
  }

  function recentArticles(arts: Article[], n = 5) {
    return [...arts].sort((a, b) => (b.published_at || "").localeCompare(a.published_at || "")).slice(0, n);
  }

  const crisisArts = articles.filter((a) => a.crisis_probability > 0.4)
    .sort((a, b) => b.crisis_probability - a.crisis_probability);

  function sentBlock(stats: ReturnType<typeof sentStats>, compact = false) {
    if (stats.total === 0) return `<p style="color:#9ca3af;font-size:12px;">No articles in this category yet.</p>`;
    const sz = compact ? "18px" : "22px";
    return `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:7px 14px;text-align:center;min-width:72px;">
        <div style="font-size:${sz};font-weight:800;color:#166534;">${stats.posPct}%</div>
        <div style="font-size:10px;color:#166534;">Positive (${stats.pos})</div>
      </div>
      <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:7px 14px;text-align:center;min-width:72px;">
        <div style="font-size:${sz};font-weight:800;color:#991b1b;">${stats.negPct}%</div>
        <div style="font-size:10px;color:#991b1b;">Negative (${stats.neg})</div>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:7px 14px;text-align:center;min-width:72px;">
        <div style="font-size:${sz};font-weight:800;color:#374151;">${stats.neuPct}%</div>
        <div style="font-size:10px;color:#374151;">Neutral (${stats.neu})</div>
      </div>
    </div>
    <div style="height:9px;border-radius:999px;overflow:hidden;display:flex;margin-bottom:8px;background:#f3f4f6;">
      <div style="width:${stats.posPct}%;background:#16a34a;"></div>
      <div style="width:${stats.negPct}%;background:#dc2626;"></div>
      <div style="width:${stats.neuPct}%;background:#9ca3af;"></div>
    </div>`;
  }

  function leaningPills(lb: ReturnType<typeof leaningBreakdown>) {
    return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      <span style="background:#dcfce7;color:#166534;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:600;">✅ Friendly: ${lb.friendly}</span>
      <span style="background:#fee2e2;color:#991b1b;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:600;">⛔ Hostile: ${lb.hostile}</span>
      <span style="background:#f3f4f6;color:#374151;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:600;">⚪ Independent: ${lb.independent}</span>
    </div>`;
  }

  function sourceBars(arts: Article[], color = "#3b82f6") {
    const ts = topSources(arts);
    if (!ts.length) return "";
    const max = ts[0][1];
    return `<div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px;">Top Sources by Coverage</div>
    ${ts.map(([name, count]) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:11px;">
        <div style="width:150px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${name}">${name}</div>
        <div style="flex:1;background:#f3f4f6;border-radius:4px;height:7px;overflow:hidden;">
          <div style="height:100%;width:${Math.round(count * 100 / max)}%;background:${color};border-radius:4px;"></div>
        </div>
        <div style="width:24px;text-align:right;color:#6b7280;font-weight:600;">${count}</div>
      </div>`).join("")}`;
  }

  function regionSection(arts: Article[]) {
    const regMap: Record<string, Article[]> = {};
    arts.forEach((a) => {
      const r = a.primary_region || "Other";
      (regMap[r] = regMap[r] || []).push(a);
    });
    if (!Object.keys(regMap).length) return `<p style="color:#9ca3af;font-size:12px;">No regional articles found.</p>`;
    return Object.entries(regMap)
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([region, rarticles]) => {
        const rs = sentStats(rarticles);
        return `<div style="margin-bottom:12px;padding:12px 14px;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
          <div style="font-weight:700;font-size:13px;color:#374151;margin-bottom:8px;">
            📍 ${region} <span style="font-weight:400;color:#9ca3af;font-size:11px;">${rarticles.length} article${rarticles.length !== 1 ? "s" : ""}</span>
          </div>
          ${sentBlock(rs, true)}
        </div>`;
      }).join("");
  }

  function articleCard(a: Article) {
    const sentColor = a.sentiment === "Positive" ? "#166534" : a.sentiment === "Negative" ? "#991b1b" : "#374151";
    const sentBg    = a.sentiment === "Positive" ? "#f0fdf4" : a.sentiment === "Negative" ? "#fff5f5" : "#f9fafb";
    const date = a.published_at ? new Date(a.published_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
    const langLabel = a.language ? (LANG_NAMES[a.language] || a.language.toUpperCase()) : "";
    const commentLangs = Object.entries(a.comment_languages || {})
      .sort(([, a], [, b]) => b - a).slice(0, 3)
      .map(([l, c]) => `${LANG_NAMES[l] || l.toUpperCase()}(${c})`).join(", ");
    return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:11px 13px;margin-bottom:9px;page-break-inside:avoid;">
      <div style="display:flex;align-items:start;justify-content:space-between;gap:8px;margin-bottom:5px;">
        <div style="font-size:13px;font-weight:600;color:#111827;flex:1;line-height:1.4;">${a.title || "Untitled"}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;shrink:0;">
          <span style="background:${sentBg};color:${sentColor};border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap;">${a.sentiment || "Neutral"}</span>
          ${a.urgency_score > 0.5 ? `<span style="background:#fff7ed;color:#c2410c;border-radius:999px;padding:2px 6px;font-size:9px;font-weight:700;">🔥 Urgency ${Math.round(a.urgency_score * 100)}%</span>` : ""}
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;font-size:11px;color:#6b7280;">
        <span>${a.source_name || ""}</span>
        ${date ? `<span>· ${date}</span>` : ""}
        ${langLabel ? `<span>· 🌐 ${langLabel}</span>` : ""}
        ${a.political_angle ? `<span>· 🏛 ${a.political_angle}</span>` : ""}
      </div>
      ${commentLangs ? `<div style="font-size:10px;color:#9ca3af;margin-bottom:3px;">💬 Comments in: ${commentLangs}</div>` : ""}
      ${a.summary ? `<div style="font-size:11px;color:#374151;line-height:1.5;margin-bottom:3px;">${a.summary}</div>` : ""}
      ${a.main_narrative ? `<div style="font-size:11px;color:#4b5563;line-height:1.5;font-style:italic;">${a.main_narrative}</div>` : ""}
      ${a.crisis_probability > 0.4 ? `<div style="margin-top:5px;font-size:10px;font-weight:700;color:#b45309;">⚠ Crisis signal: ${Math.round(a.crisis_probability * 100)}%</div>` : ""}
      ${a.url ? `<div style="margin-top:4px;"><a href="${a.url}" style="font-size:10px;color:#2563eb;">↗ Read article</a></div>` : ""}
    </div>`;
  }

  function langChart(langs: Record<string, number>, title: string) {
    const total = Object.values(langs).reduce((a, b) => a + b, 0);
    if (!total) return "";
    const sorted = Object.entries(langs).sort(([, a], [, b]) => b - a).slice(0, 8);
    const max = sorted[0][1];
    return `<div style="margin-bottom:14px;">
      <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px;">${title}</div>
      ${sorted.map(([lang, cnt]) => {
        const pct = Math.round(cnt * 100 / total);
        const name = LANG_NAMES[lang] || lang.toUpperCase();
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:11px;">
          <div style="width:80px;color:#374151;font-weight:500;">${name}</div>
          <div style="flex:1;background:#f3f4f6;border-radius:4px;height:7px;overflow:hidden;">
            <div style="height:100%;width:${Math.round(cnt * 100 / max)}%;background:#6366f1;border-radius:4px;"></div>
          </div>
          <div style="width:60px;text-align:right;color:#6b7280;">${cnt} (${pct}%)</div>
        </div>`;
      }).join("")}
    </div>`;
  }

  // ── Computed stats ──────────────────────────────────────────────────────────
  const allStats  = sentStats(articles);
  const natStats  = sentStats(nationalArts);
  const regStats  = sentStats(regionalArts);
  const intlStats = sentStats(intlArts);

  const overallHealthColor = allStats.negPct >= 50 ? "#dc2626" : allStats.negPct >= 30 ? "#d97706" : "#16a34a";
  const overallHealthLabel = allStats.negPct >= 50 ? "Crisis" : allStats.negPct >= 30 ? "Caution" : "Stable";

  const allArticleLangs: Record<string, number> = {};
  const allCommentLangs: Record<string, number> = {};
  articles.forEach((a) => {
    if (a.language) allArticleLangs[a.language] = (allArticleLangs[a.language] || 0) + 1;
    Object.entries(a.comment_languages || {}).forEach(([l, c]) => {
      allCommentLangs[l] = (allCommentLangs[l] || 0) + c;
    });
  });

  // Use reportData.sources if available (rich), else insights.sources, else build from articles
  const sourceRows: Array<any> = reportData?.sources?.length
    ? reportData.sources
    : insights?.sources?.length
      ? insights.sources
      : (() => {
          const m: Record<string, any> = {};
          articles.forEach((a) => {
            const k = a.source_name || "Unknown";
            if (!m[k]) m[k] = { name: k, leaning: a.leaning, domestic: a.domestic, primary_region: a.primary_region, total: 0, Positive: 0, Negative: 0, Neutral: 0, crisis_count: 0 };
            m[k].total++;
            m[k][a.sentiment] = (m[k][a.sentiment] || 0) + 1;
            if (a.crisis_probability > 0.4) m[k].crisis_count++;
          });
          return Object.values(m).sort((a: any, b: any) => b.total - a.total);
        })();

  const crisisArtsGlobal = reportData?.crisis_articles?.length
    ? reportData.crisis_articles
    : articles.filter((a) => a.crisis_probability > 0.4).sort((a, b) => b.crisis_probability - a.crisis_probability).slice(0, 6);

  // ── Keyword bar helper ────────────────────────────────────────────────────────
  function kwBar(kws: Array<{ word: string; count: number }>, color: string, limit = 15) {
    if (!kws?.length) return `<p style="color:#9ca3af;font-size:12px;">No keywords extracted yet.</p>`;
    const top = kws.slice(0, limit);
    const max = top[0]?.count || 1;
    return top.map(({ word, count }) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:11px;">
        <div style="width:110px;font-weight:600;color:#374151;text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${word}</div>
        <div style="flex:1;background:#f3f4f6;border-radius:4px;height:8px;overflow:hidden;">
          <div style="height:100%;width:${Math.round(count * 100 / max)}%;background:${color};border-radius:4px;"></div>
        </div>
        <div style="width:32px;text-align:right;color:#6b7280;font-weight:600;">${count}</div>
      </div>`).join("");
  }

  // ── Full article highlight card ───────────────────────────────────────────────
  function highlightCard(a: FullReportArticle | Article, variant: "positive" | "negative" | "neutral") {
    const colors: Record<string, [string, string, string]> = {
      positive: ["#f0fdf4", "#bbf7d0", "#166534"],
      negative: ["#fff5f5", "#fecaca", "#991b1b"],
      neutral:  ["#f9fafb", "#e5e7eb", "#374151"],
    };
    const [bg, border, textC] = colors[variant];
    const topics = (a as FullReportArticle).topics || [];
    const topicPills = topics.slice(0, 3).map(t =>
      `<span style="background:#eff6ff;color:#1d4ed8;border-radius:4px;padding:1px 7px;font-size:10px;margin-right:4px;font-weight:600;">${t}</span>`
    ).join("");
    const stance = (a as FullReportArticle).stance || "";
    const stancePill = stance && stance !== "Irrelevant"
      ? `<span style="background:${stance === "Defends Subject" ? "#f0fdf4" : "#fff5f5"};color:${stance === "Defends Subject" ? "#15803d" : "#b91c1c"};border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700;margin-left:6px;">${stance === "Defends Subject" ? "✅ Favourable" : "⚠ Critical"}</span>`
      : "";
    const urgency = (a as FullReportArticle).urgency_score || (a as Article).urgency_score || 0;
    return `<div style="border:1px solid ${border};background:${bg};border-radius:10px;padding:14px 16px;margin-bottom:10px;page-break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
        <div style="font-size:13px;font-weight:700;color:#111827;flex:1;line-height:1.45;">${a.title || "Untitled"}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">
          <span style="background:${bg};color:${textC};border:1px solid ${border};border-radius:999px;padding:2px 10px;font-size:10px;font-weight:800;white-space:nowrap;">${variant === "positive" ? "✅ Positive" : variant === "negative" ? "🔴 Negative" : "⚪ Neutral"}</span>
          ${urgency > 0.5 ? `<span style="background:#fff7ed;color:#c2410c;border-radius:999px;padding:2px 7px;font-size:9px;font-weight:700;">🔥 Urgency ${Math.round(urgency * 100)}%</span>` : ""}
        </div>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <strong style="color:#374151;">${(a as FullReportArticle).source_name || (a as Article).source_name || ""}</strong>
        ${a.published_at ? `<span>· ${a.published_at}</span>` : ""}
        ${stancePill}
      </div>
      ${(a as Article).summary || (a as FullReportArticle).summary ? `<div style="font-size:12px;color:#374151;line-height:1.6;margin-bottom:8px;border-left:3px solid ${border};padding-left:10px;">${((a as Article).summary || (a as FullReportArticle).summary || "").slice(0, 300)}</div>` : ""}
      ${topicPills ? `<div style="margin-bottom:6px;">${topicPills}</div>` : ""}
      ${(a as FullReportArticle | Article).url ? `<a href="${(a as FullReportArticle | Article).url}" style="font-size:10px;color:#2563eb;text-decoration:none;">↗ Read full article</a>` : ""}
    </div>`;
  }

  // ── Compact article row ───────────────────────────────────────────────────────
  function articleRow(a: Article) {
    const sentColor = a.sentiment === "Positive" ? "#16a34a" : a.sentiment === "Negative" ? "#dc2626" : "#6b7280";
    const date = a.published_at ? new Date(a.published_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
    const angle = a.political_angle && a.political_angle !== "none" ? a.political_angle : "";
    return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 13px;margin-bottom:7px;page-break-inside:avoid;">
      <div style="display:flex;align-items:start;justify-content:space-between;gap:8px;margin-bottom:4px;">
        <div style="font-size:12px;font-weight:600;color:#111827;flex:1;line-height:1.4;">${a.title || "Untitled"}</div>
        <span style="color:${sentColor};font-size:10px;font-weight:700;white-space:nowrap;flex-shrink:0;">${a.sentiment}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:10px;color:#6b7280;">
        <span>${a.source_name || ""}</span>
        ${date ? `<span>· ${date}</span>` : ""}
        ${angle ? `<span>· 🏛 ${angle}</span>` : ""}
        ${a.urgency_score > 0.5 ? `<span style="color:#c2410c;">· 🔥 Urgency ${Math.round(a.urgency_score * 100)}%</span>` : ""}
      </div>
      ${a.summary && a.summary !== a.title ? `<div style="font-size:11px;color:#4b5563;margin-top:4px;line-height:1.5;">${a.summary.slice(0, 220)}</div>` : ""}
      ${a.url ? `<a href="${a.url}" style="font-size:10px;color:#2563eb;text-decoration:none;">↗ Read article</a>` : ""}
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Press Intelligence Report — ${clientName}</title>
<style>
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;box-sizing:border-box;}
  body{font-family:'Segoe UI',system-ui,Arial,sans-serif;margin:0;padding:0;background:#f8fafc;color:#1a202c;font-size:14px;}
  .page{max-width:1020px;margin:0 auto;padding:24px;}
  .header{background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#2563eb 100%);color:#fff;border-radius:16px;padding:28px 32px;margin-bottom:22px;}
  .header-title{font-size:28px;font-weight:800;margin:0 0 4px;letter-spacing:-0.5px;}
  .header-sub{font-size:13px;opacity:0.8;margin:0 0 16px;}
  .header-meta{display:flex;gap:10px;flex-wrap:wrap;}
  .header-meta span{background:rgba(255,255,255,0.13);border-radius:999px;padding:4px 14px;font-size:11px;font-weight:600;}
  .exec-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
  .exec-box{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);}
  .exec-val{font-size:28px;font-weight:800;margin-bottom:2px;}
  .exec-lbl{font-size:11px;color:#6b7280;font-weight:600;}
  .exec-sub{font-size:10px;color:#9ca3af;margin-top:2px;}
  .section{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px 22px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);}
  .section-title{font-size:16px;font-weight:700;margin:0 0 10px;color:#111827;}
  .section-sub{font-size:12px;color:#6b7280;margin:0 0 14px;line-height:1.5;}
  .print-btn{display:block;margin:0 0 18px;padding:10px 28px;background:#1e40af;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;width:fit-content;}
  .crisis-box{background:#fff7ed;border:2px solid #fed7aa;border-radius:12px;padding:16px 18px;margin-bottom:16px;}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
  .three-col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}
  .footer{text-align:center;font-size:11px;color:#9ca3af;padding:24px;margin-top:12px;border-top:1px solid #f3f4f6;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  th{text-align:left;padding:9px 10px;color:#6b7280;font-weight:600;border-bottom:2px solid #e5e7eb;background:#f9fafb;}
  td{padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top;}
  tr:last-child td{border-bottom:none;}
  tr:hover td{background:#f9fafb;}
  .kw-pill{display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:6px;padding:2px 9px;font-size:10px;font-weight:600;margin:2px 3px 2px 0;}
  .kw-pill.neg{background:#fff5f5;color:#b91c1c;}
  .topic-pill{display:inline-block;background:#f3f4f6;color:#374151;border-radius:6px;padding:2px 9px;font-size:10px;font-weight:600;margin:2px 3px 2px 0;}
  .src-block{border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin-bottom:14px;background:#fafafa;}
  .src-block-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px;}
  @media print{
    .print-btn{display:none!important;}
    .section,.src-block{break-inside:avoid;}
    .exec-grid,.two-col,.three-col{break-inside:avoid;}
    body{background:#fff;}
    .page{padding:12px;}
  }
</style>
</head>
<body>
<div class="page">
  <button class="print-btn" onclick="window.print()">🖨 Save / Print as PDF (Ctrl+P)</button>

  <!-- ── HEADER ── -->
  <div class="header">
    <div class="header-title">Press Intelligence Report</div>
    <div class="header-sub">${clientName} · Comprehensive Multi-Source Media Analysis</div>
    <div class="header-meta">
      <span>📅 ${reportDate}</span>
      <span>📰 ${articles.length} articles</span>
      <span>📡 ${sourceRows.length} sources</span>
      <span>🇮🇳 National: ${nationalArts.length}</span>
      <span>🗺 Regional: ${regionalArts.length}</span>
      <span>🌍 International: ${intlArts.length}</span>
      <span style="background:${overallHealthColor}bb;">🔵 ${overallHealthLabel}</span>
    </div>
  </div>

  <!-- ── EXECUTIVE KPIs ── -->
  <div class="exec-grid">
    <div class="exec-box">
      <div class="exec-val" style="color:#2563eb;">${allStats.total}</div>
      <div class="exec-lbl">Total Articles Analysed</div>
      <div class="exec-sub">${sourceRows.length} active sources</div>
    </div>
    <div class="exec-box">
      <div class="exec-val" style="color:#16a34a;">${allStats.posPct}%</div>
      <div class="exec-lbl">Positive Coverage</div>
      <div class="exec-sub">${allStats.pos} articles</div>
    </div>
    <div class="exec-box">
      <div class="exec-val" style="color:#dc2626;">${allStats.negPct}%</div>
      <div class="exec-lbl">Negative Coverage</div>
      <div class="exec-sub">${allStats.neg} articles</div>
    </div>
    <div class="exec-box">
      <div class="exec-val" style="color:${overallHealthColor};">${overallHealthLabel}</div>
      <div class="exec-lbl">Reputation Signal</div>
      <div class="exec-sub">${crisisArtsGlobal.length} crisis alerts</div>
    </div>
  </div>

  <!-- ── OVERALL SENTIMENT ── -->
  <div class="section">
    <div class="section-title">📊 Overall Media Sentiment — All Sources Combined</div>
    <p class="section-sub">Sentiment across all national, regional, and international press coverage for <strong>${clientName}</strong>. AI-analysed across ${articles.length} articles from ${sourceRows.length} sources.</p>
    ${sentBlock(allStats)}
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-top:8px;">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#16a34a;margin-right:5px;"></span>Positive ${allStats.pos} (${allStats.posPct}%)</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#dc2626;margin-right:5px;"></span>Negative ${allStats.neg} (${allStats.negPct}%)</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#9ca3af;margin-right:5px;"></span>Neutral ${allStats.neu} (${allStats.neuPct}%)</span>
    </div>
  </div>

  <!-- ── CRISIS ALERTS ── -->
  ${crisisArtsGlobal.length > 0 ? `
  <div class="crisis-box">
    <div style="font-size:14px;font-weight:700;color:#c2410c;margin-bottom:12px;">🚨 Crisis Signals — ${crisisArtsGlobal.length} High-Risk Coverage${crisisArtsGlobal.length !== 1 ? " Items" : ""}</div>
    ${crisisArtsGlobal.map((a: any) => `
      <div style="display:flex;align-items:start;gap:10px;margin-bottom:8px;padding:10px 12px;background:#fff;border:1px solid #fed7aa;border-radius:8px;">
        <div style="min-width:50px;text-align:center;padding-top:2px;">
          <div style="font-size:16px;font-weight:800;color:#c2410c;">${Math.round((a.crisis_probability || 0) * 100)}%</div>
          <div style="font-size:9px;color:#9a3412;font-weight:600;">RISK</div>
        </div>
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:600;color:#111827;line-height:1.4;">${a.title || "Untitled"}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:3px;">${a.source_name || ""} · <span style="color:${a.sentiment === "Negative" ? "#dc2626" : "#374151"};font-weight:600;">${a.sentiment || ""}</span></div>
          ${a.summary ? `<div style="font-size:11px;color:#92400e;margin-top:5px;line-height:1.5;">${(a.summary || "").slice(0, 200)}</div>` : ""}
          ${a.url ? `<a href="${a.url}" style="font-size:10px;color:#2563eb;text-decoration:none;margin-top:3px;display:inline-block;">↗ Read article</a>` : ""}
        </div>
      </div>`).join("")}
  </div>` : ""}

  <!-- ── KEY STORY HIGHLIGHTS ── -->
  ${(reportData?.top_positive_articles?.length || reportData?.top_negative_articles?.length) ? `
  <div class="section">
    <div class="section-title">🌟 Key Story Highlights — Top Coverage</div>
    <p class="section-sub">Most significant positive and negative stories across all press sources. AI-extracted summaries show what each article says about <strong>${clientName}</strong>.</p>
    <div class="two-col">
      <div>
        <div style="font-size:13px;font-weight:700;color:#15803d;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #bbf7d0;">✅ Favourable Coverage (${reportData?.top_positive_articles?.length || 0} highlights)</div>
        ${(reportData?.top_positive_articles || []).slice(0,5).map((a: FullReportArticle) => highlightCard(a, "positive")).join("") || `<p style="color:#9ca3af;font-size:12px;">No positive coverage found.</p>`}
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:#b91c1c;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #fecaca;">🔴 Critical Coverage (${reportData?.top_negative_articles?.length || 0} highlights)</div>
        ${(reportData?.top_negative_articles || []).slice(0,5).map((a: FullReportArticle) => highlightCard(a, "negative")).join("") || `<p style="color:#9ca3af;font-size:12px;">No negative coverage found.</p>`}
      </div>
    </div>
  </div>` : ""}

  <!-- ── KEYWORD INTELLIGENCE ── -->
  ${reportData?.keywords ? `
  <div class="section">
    <div class="section-title">🔑 Keyword Intelligence — What Media Is Saying</div>
    <p class="section-sub">Top keywords extracted from ${articles.length} press articles. Positive keywords drive favourable narratives; negative keywords signal risk areas.</p>
    <div class="two-col">
      <div>
        <div style="font-size:13px;font-weight:700;color:#15803d;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #bbf7d0;">✅ Positive Coverage Keywords</div>
        ${kwBar(reportData?.keywords?.positive || [], "#16a34a")}
        ${(reportData?.keywords?.positive || []).slice(0,20).length > 0 ? `<div style="margin-top:10px;">${(reportData?.keywords?.positive || []).slice(0,20).map((k: any) => `<span class="kw-pill">${k.word}</span>`).join("")}</div>` : ""}
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:#b91c1c;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #fecaca;">🔴 Negative Coverage Keywords</div>
        ${kwBar(reportData?.keywords?.negative || [], "#dc2626")}
        ${(reportData?.keywords?.negative || []).slice(0,20).length > 0 ? `<div style="margin-top:10px;">${(reportData?.keywords?.negative || []).slice(0,20).map((k: any) => `<span class="kw-pill neg">${k.word}</span>`).join("")}</div>` : `<p style="color:#9ca3af;font-size:12px;">No negative keywords detected.</p>`}
      </div>
    </div>
    ${(reportData?.keywords?.all || []).length > 0 ? `
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid #f3f4f6;">
      <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">📊 Most Frequent Words — All Coverage</div>
      <div>${(reportData?.keywords?.all || []).slice(0,30).map((k: any) => `<span class="kw-pill" style="background:#f3f4f6;color:#374151;">${k.word} <span style="color:#9ca3af;">${k.count}</span></span>`).join("")}</div>
    </div>` : ""}
  </div>` : ""}

  <!-- ── COVERAGE TOPICS ── -->
  ${(reportData?.topics?.length || reportData?.stances) ? `
  <div class="section">
    <div class="section-title">💬 Coverage Topics & Tone Analysis</div>
    <p class="section-sub">What the press is talking about and whether coverage is favourable or critical towards <strong>${clientName}</strong>.</p>
    <div class="two-col">
      ${(reportData?.topics?.length || 0) > 0 ? `
      <div>
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;">🏷 Top Topics Being Covered</div>
        ${(reportData?.topics || []).slice(0, 15).map((t: any) => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:11px;">
            <div style="flex:1;font-weight:600;color:#374151;text-transform:capitalize;">${t.topic}</div>
            <div style="width:80px;background:#f3f4f6;border-radius:4px;height:7px;overflow:hidden;"><div style="height:100%;width:${Math.round(t.count * 100 / Math.max(...(reportData?.topics || []).map((x: any) => x.count)))}%;background:#6366f1;border-radius:4px;"></div></div>
            <div style="width:28px;text-align:right;color:#6b7280;font-weight:600;">${t.count}</div>
          </div>`).join("")}
      </div>` : "<div></div>"}
      ${reportData?.stances ? `
      <div>
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;">🎯 Media Tone Towards ${clientName}</div>
        ${Object.entries(reportData.stances || {}).map(([stance, count]: [string, any]) => {
          const stanceColor = stance.includes("Defend") ? "#16a34a" : stance.includes("Against") ? "#dc2626" : "#9ca3af";
          const stanceBg = stance.includes("Defend") ? "#f0fdf4" : stance.includes("Against") ? "#fff5f5" : "#f9fafb";
          const stanceLabel = stance.includes("Defend") ? "✅ Favourable" : stance.includes("Against") ? "⚠ Critical" : "⚪ Neutral / Topic";
          const totalStances = Object.values(reportData?.stances || {}).reduce((a: any, b: any) => a + b, 0) as number;
          const pct = Math.round(count * 100 / (totalStances || 1));
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 10px;background:${stanceBg};border:1px solid ${stanceColor}33;border-radius:8px;">
            <div style="flex:1;font-size:11px;font-weight:700;color:${stanceColor};">${stanceLabel}</div>
            <div style="font-size:16px;font-weight:800;color:${stanceColor};">${count}</div>
            <div style="font-size:11px;color:${stanceColor};">(${pct}%)</div>
          </div>`;
        }).join("")}
        <p style="font-size:10px;color:#9ca3af;margin-top:8px;">Based on AI tone analysis of article content.</p>
      </div>` : "<div></div>"}
    </div>
  </div>` : ""}

  <!-- ── NATIONAL COVERAGE ── -->
  <div class="section">
    <div class="section-title">🇮🇳 National Media Coverage</div>
    <p class="section-sub">Pan-India and national press — print, digital, and broadcast sources with national scope.</p>
    ${sentBlock(natStats)}
    ${leaningPills(leaningBreakdown(nationalArts))}
    ${sourceBars(nationalArts, "#3b82f6")}
    ${nationalArts.length > 0 ? `
      <div style="margin-top:16px;font-size:12px;font-weight:600;color:#374151;margin-bottom:10px;">Recent National Coverage</div>
      ${recentArticles(nationalArts, 6).map(articleRow).join("")}
    ` : `<p style="color:#9ca3af;font-size:12px;margin-top:8px;">No national articles yet — run ingestion from Press Sources.</p>`}
  </div>

  <!-- ── REGIONAL COVERAGE ── -->
  <div class="section">
    <div class="section-title">🗺 Regional Media Coverage</div>
    <p class="section-sub">State and city-specific press — each region tracked independently. Coverage from regional language and English dailies.</p>
    ${sentBlock(regStats)}
    ${regionSection(regionalArts)}
    ${regionalArts.length > 0 ? `
      <div style="margin-top:14px;font-size:12px;font-weight:600;color:#374151;margin-bottom:10px;">Recent Regional Coverage</div>
      ${recentArticles(regionalArts, 6).map(articleRow).join("")}
    ` : ""}
  </div>

  <!-- ── INTERNATIONAL COVERAGE ── -->
  <div class="section">
    <div class="section-title">🌍 International Media Coverage</div>
    <p class="section-sub">Global press sentiment — BBC, Reuters, AP, Al Jazeera, and other international outlets covering ${clientName}.</p>
    ${sentBlock(intlStats)}
    ${leaningPills(leaningBreakdown(intlArts))}
    ${sourceBars(intlArts, "#8b5cf6")}
    ${intlArts.length > 0 ? `
      <div style="margin-top:16px;font-size:12px;font-weight:600;color:#374151;margin-bottom:10px;">Recent International Coverage</div>
      ${recentArticles(intlArts, 5).map(articleRow).join("")}
    ` : `<p style="color:#9ca3af;font-size:12px;margin-top:12px;">No international articles yet — add BBC, Reuters, Al Jazeera from the International Media Library.</p>`}
  </div>

  <!-- ── PER-SOURCE INTELLIGENCE ── -->
  ${sourceRows.length > 0 ? `
  <div class="section">
    <div class="section-title">📡 Per-Source Intelligence — Deep Dive</div>
    <p class="section-sub">Coverage analysis, top stories, keywords, and tone for each press source. Shows what each outlet is reporting about <strong>${clientName}</strong>.</p>
    ${sourceRows.map((s: any) => {
      const tot = s.total || 1;
      const posPct = s.pos_pct ?? Math.round((s.Positive || 0) * 100 / tot);
      const negPct = s.neg_pct ?? Math.round((s.Negative || 0) * 100 / tot);
      const neuPct = s.neu_pct ?? Math.round((s.Neutral || 0) * 100 / tot);
      const lc = s.leaning === "friendly" ? "#166534" : s.leaning === "hostile" ? "#991b1b" : "#374151";
      const lb = s.leaning === "friendly" ? "#dcfce7" : s.leaning === "hostile" ? "#fee2e2" : "#f3f4f6";
      const region = s.region || s.primary_region || (s.domestic ? "National" : "International");
      const circ = s.circulation ? s.circulation.toLocaleString("en-IN") : null;
      const lastIng = s.last_ingested || null;

      // Stances for this source
      const stancesHtml = s.stances ? Object.entries(s.stances)
        .filter(([k]: any) => k !== "Irrelevant")
        .map(([stance, cnt]: any) => {
          const sc = String(stance).includes("Defend") ? "#16a34a" : "#dc2626";
          return `<span style="color:${sc};font-size:11px;font-weight:700;margin-right:10px;">${String(stance).includes("Defend") ? "✅" : "⚠"} ${String(stance).replace("Subject","")} ${cnt}</span>`;
        }).join("") : "";

      // Top topics pills
      const topicsHtml = (s.top_topics || []).slice(0, 8).map((t: any) =>
        `<span class="topic-pill">${t.topic} <span style="color:#9ca3af;">${t.count}</span></span>`
      ).join("");

      // Keywords
      const kwHtml = (s.keywords || []).slice(0, 12).map((k: any) =>
        `<span class="kw-pill">${k.word}</span>`
      ).join("");

      return `<div class="src-block">
        <div class="src-block-head">
          <div>
            <div style="font-size:14px;font-weight:800;color:#111827;">${s.name}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;display:flex;gap:10px;flex-wrap:wrap;">
              <span>📍 ${region}</span>
              ${circ ? `<span>📰 Circ: ${circ}</span>` : ""}
              ${lastIng ? `<span>🕐 Last fetched: ${lastIng}</span>` : ""}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            <span style="background:${lb};color:${lc};border-radius:999px;padding:2px 10px;font-size:10px;font-weight:700;text-transform:capitalize;">${s.leaning || "independent"}</span>
            <span style="font-size:11px;color:#6b7280;font-weight:600;">${s.total} articles</span>
          </div>
        </div>

        <!-- Sentiment mini-bar -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <span style="background:#f0fdf4;color:#166534;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;">✅ ${posPct}% (${s.Positive || 0})</span>
          <span style="background:#fff5f5;color:#991b1b;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;">🔴 ${negPct}% (${s.Negative || 0})</span>
          <span style="background:#f9fafb;color:#374151;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;">⚪ ${neuPct}% (${s.Neutral || 0})</span>
          ${s.crisis_count > 0 ? `<span style="background:#fff7ed;color:#c2410c;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;">🚨 ${s.crisis_count} crisis signal${s.crisis_count !== 1 ? "s" : ""}</span>` : ""}
          ${stancesHtml}
        </div>
        <div style="height:6px;border-radius:999px;overflow:hidden;display:flex;margin-bottom:10px;background:#f3f4f6;">
          <div style="width:${posPct}%;background:#16a34a;"></div>
          <div style="width:${negPct}%;background:#dc2626;"></div>
          <div style="width:${neuPct}%;background:#9ca3af;"></div>
        </div>

        ${topicsHtml ? `<div style="margin-bottom:8px;"><span style="font-size:11px;font-weight:700;color:#374151;margin-right:6px;">Topics:</span>${topicsHtml}</div>` : ""}
        ${kwHtml ? `<div style="margin-bottom:10px;"><span style="font-size:11px;font-weight:700;color:#374151;margin-right:6px;">Key terms:</span>${kwHtml}</div>` : ""}

        ${(s.top_positive || []).length > 0 ? `
        <div style="margin-top:10px;">
          <div style="font-size:11px;font-weight:700;color:#15803d;margin-bottom:6px;">✅ Favourable Coverage Highlights</div>
          ${(s.top_positive || []).slice(0,3).map((a: any) => `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:7px;padding:9px 11px;margin-bottom:6px;">
              <div style="font-size:12px;font-weight:600;color:#111827;line-height:1.4;">${a.title || ""}</div>
              ${a.summary ? `<div style="font-size:11px;color:#374151;margin-top:4px;line-height:1.5;border-left:3px solid #86efac;padding-left:8px;">${(a.summary || "").slice(0,250)}</div>` : ""}
              <div style="font-size:10px;color:#6b7280;margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;">
                ${a.published_at ? `<span>${a.published_at}</span>` : ""}
                ${(a.topics || []).slice(0,3).map((t: string) => `<span class="topic-pill" style="margin:0;">${t}</span>`).join("")}
                ${a.url ? `<a href="${a.url}" style="color:#2563eb;text-decoration:none;">↗ Read</a>` : ""}
              </div>
            </div>`).join("")}
        </div>` : ""}

        ${(s.top_negative || []).length > 0 ? `
        <div style="margin-top:10px;">
          <div style="font-size:11px;font-weight:700;color:#b91c1c;margin-bottom:6px;">⚠ Critical Coverage Highlights</div>
          ${(s.top_negative || []).slice(0,3).map((a: any) => `
            <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:7px;padding:9px 11px;margin-bottom:6px;">
              <div style="font-size:12px;font-weight:600;color:#111827;line-height:1.4;">${a.title || ""}</div>
              ${a.summary ? `<div style="font-size:11px;color:#374151;margin-top:4px;line-height:1.5;border-left:3px solid #fca5a5;padding-left:8px;">${(a.summary || "").slice(0,250)}</div>` : ""}
              <div style="font-size:10px;color:#6b7280;margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;">
                ${a.published_at ? `<span>${a.published_at}</span>` : ""}
                ${(a.topics || []).slice(0,3).map((t: string) => `<span class="topic-pill" style="margin:0;">${t}</span>`).join("")}
                ${a.url ? `<a href="${a.url}" style="color:#2563eb;text-decoration:none;">↗ Read</a>` : ""}
              </div>
            </div>`).join("")}
        </div>` : ""}
      </div>`;
    }).join("")}
  </div>` : ""}

  <!-- ── LANGUAGE ANALYSIS ── -->
  ${(Object.keys(allArticleLangs).length > 0) ? `
  <div class="section">
    <div class="section-title">🗣 Language Analysis</div>
    <p class="section-sub">Language distribution of press articles across all sources.</p>
    <div class="two-col">
      ${langChart(allArticleLangs, "📰 Article Languages")}
      ${Object.keys(allCommentLangs).length > 0 ? langChart(allCommentLangs, "💬 Reader Engagement Languages") : `<div><div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px;">💬 Reader Engagement</div><p style="color:#9ca3af;font-size:12px;">YouTube comment language data not yet available.</p></div>`}
    </div>
  </div>` : ""}

  <!-- ── SOURCE PERFORMANCE TABLE ── -->
  <div class="section">
    <div class="section-title">📊 Source Performance Table — All ${sourceRows.length} Sources</div>
    <p class="section-sub">Complete per-source breakdown: article count, sentiment, tone, circulation, and last data fetch.</p>
    <div style="overflow-x:auto;">
    <table>
      <thead>
        <tr>
          <th>Source</th>
          <th>Scope</th>
          <th style="text-align:center;">Articles</th>
          <th style="text-align:center;color:#16a34a;">Positive</th>
          <th style="text-align:center;color:#dc2626;">Negative</th>
          <th style="text-align:center;color:#6b7280;">Neutral</th>
          <th style="text-align:center;">Leaning</th>
          <th style="text-align:right;">Circulation</th>
          <th style="text-align:center;color:#c2410c;">Crisis</th>
          <th>Last Fetched</th>
        </tr>
      </thead>
      <tbody>
        ${sourceRows.map((s: any) => {
          const tot = s.total || 1;
          const posPct = s.pos_pct ?? Math.round((s.Positive || 0) * 100 / tot);
          const negPct = s.neg_pct ?? Math.round((s.Negative || 0) * 100 / tot);
          const neuPct = s.neu_pct ?? Math.round((s.Neutral || 0) * 100 / tot);
          const lc = s.leaning === "friendly" ? "#166534" : s.leaning === "hostile" ? "#991b1b" : "#374151";
          const lb = s.leaning === "friendly" ? "#dcfce7" : s.leaning === "hostile" ? "#fee2e2" : "#f3f4f6";
          const region = s.region || s.primary_region || (s.domestic ? "National" : "International");
          const circ = s.circulation ? s.circulation.toLocaleString("en-IN") : "—";
          const lastIng = s.last_ingested || "—";
          return `<tr>
            <td style="font-weight:700;color:#111827;">${s.name}</td>
            <td style="font-size:11px;color:#6b7280;">${region}</td>
            <td style="text-align:center;font-weight:700;color:#2563eb;">${s.total}</td>
            <td style="text-align:center;color:#16a34a;font-weight:600;">${posPct}%</td>
            <td style="text-align:center;color:#dc2626;font-weight:600;">${negPct}%</td>
            <td style="text-align:center;color:#6b7280;">${neuPct}%</td>
            <td style="text-align:center;"><span style="background:${lb};color:${lc};border-radius:999px;padding:2px 8px;font-size:10px;font-weight:600;text-transform:capitalize;">${s.leaning || "independent"}</span></td>
            <td style="text-align:right;font-size:11px;color:#374151;font-weight:600;">${circ}</td>
            <td style="text-align:center;">${s.crisis_count > 0 ? `<span style="color:#c2410c;font-weight:700;">⚠ ${s.crisis_count}</span>` : `<span style="color:#9ca3af;">—</span>`}</td>
            <td style="font-size:10px;color:#6b7280;">${lastIng}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    </div>
  </div>

  <!-- ── COMPARATIVE SUMMARY ── -->
  <div class="section" style="background:linear-gradient(135deg,#eff6ff 0%,#fff 100%);">
    <div class="section-title">📋 Comparative Coverage Summary</div>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th style="text-align:center;">Articles</th>
          <th style="text-align:center;color:#16a34a;">Positive</th>
          <th style="text-align:center;color:#dc2626;">Negative</th>
          <th style="text-align:center;color:#6b7280;">Neutral</th>
          <th style="text-align:center;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${[
          ["🇮🇳 National", natStats],
          ["🗺 Regional", regStats],
          ["🌍 International", intlStats],
          ["📊 Combined", allStats],
        ].map(([label, st]: any) => {
          const status = st.negPct >= 50 ? "🚨 Crisis" : st.negPct >= 30 ? "⚠ Caution" : "✅ Stable";
          const sc = st.negPct >= 50 ? "#dc2626" : st.negPct >= 30 ? "#d97706" : "#16a34a";
          return `<tr style="${label === "📊 Combined" ? "font-weight:700;background:#eff6ff!important;" : ""}">
            <td style="font-weight:600;color:#374151;">${label}</td>
            <td style="text-align:center;">${st.total}</td>
            <td style="text-align:center;color:#16a34a;font-weight:600;">${st.posPct}%</td>
            <td style="text-align:center;color:#dc2626;font-weight:600;">${st.negPct}%</td>
            <td style="text-align:center;color:#6b7280;">${st.neuPct}%</td>
            <td style="text-align:center;font-weight:700;color:${sc};">${status}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <strong>ORM CMS Press Intelligence</strong> · Generated ${reportDate} · Confidential — For internal use only<br>
    <span style="font-size:10px;">Data sourced from ${sourceRows.length} configured RSS feeds and YouTube channels · AI-powered sentiment &amp; narrative analysis</span>
  </div>
</div>
</body>
</html>`;
}

type ActiveTab = "all" | "national" | "regional" | "international";

export default function PressSourcesPage() {
  const [sources, setSources]     = useState<PressSource[]>([]);
  const [clients, setClients]     = useState<Client[]>([]);
  const [clientId, setClientId]   = useState<string>("");
  const [loading, setLoading]     = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState<any>({ ...BLANK });
  const [saving, setSaving]       = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [ingestMsg, setIngestMsg] = useState<Record<string, string>>({});
  const [quota, setQuota]         = useState<any>(null);
  const [err, setErr]             = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportHtml, setReportHtml]             = useState<string | null>(null);
  const [syncing, setSyncing]                   = useState(false);
  const [syncMsg, setSyncMsg]                   = useState("");

  // Date filter state
  type DateFilter = "all" | "today" | "week" | "month" | "custom";
  const [dateFilter, setDateFilter]   = useState<DateFilter>("all");
  const [customFrom, setCustomFrom]   = useState("");
  const [customTo, setCustomTo]       = useState("");
  // Source article stats (keyed by press_source_id)
  const [sourceStats, setSourceStats]   = useState<Record<string, { count: number; Positive: number; Negative: number; Neutral: number }>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  // Expandable source articles
  const [expandedSrcId, setExpandedSrcId]     = useState<string | null>(null);
  const [expandedArticles, setExpandedArticles] = useState<Article[]>([]);
  const [expandedLoading, setExpandedLoading]   = useState(false);
  // Report date options
  const [showReportOptions, setShowReportOptions]   = useState(false);
  const [reportDateType, setReportDateType]         = useState<DateFilter>("all");
  const [reportCustomFrom, setReportCustomFrom]     = useState("");
  const [reportCustomTo, setReportCustomTo]         = useState("");
  // Media library
  const [showLibrary, setShowLibrary]   = useState(false);
  const [libRegion, setLibRegion]       = useState<"indian" | "international">("indian");
  const [libData, setLibData]           = useState<any>(null);
  const [libCategory, setLibCategory]   = useState<string>("");
  const [libSearch, setLibSearch]       = useState<string>("");
  const [libSelected, setLibSelected]   = useState<Set<string>>(new Set());
  const [libImporting, setLibImporting] = useState(false);
  const [libMsg, setLibMsg]             = useState("");

  const load = (cid?: string) => {
    setLoading(true);
    // Sources are now tenant-wide — no client_id filter needed
    api.get("/press-sources").then((r) => setSources(r.data || []))
      .catch(() => {}).finally(() => setLoading(false));
    // Reset expanded row and show-all toggle when client changes
    setExpandedSrcId(null);
    setExpandedArticles([]);
    setShowAllSources(false);
    // Load source article counts
    loadSourceStats(cid ?? clientId);
  };

  useEffect(() => {
    api.get("/clients").then((r) => {
      const list = r.data || [];
      setClients(list);
      if (list.length > 0) { setClientId(list[0].id); load(list[0].id); }
    }).catch(() => {});
    api.get("/press-sources/youtube-quota").then((r) => setQuota(r.data)).catch(() => {});
  }, []);

  // Reload source stats whenever the date filter changes
  useEffect(() => {
    if (clientId) loadSourceStats(clientId, dateFilter, customFrom, customTo);
  }, [dateFilter, customFrom, customTo]);

  // Tab source groupings
  const nationalSources = sources.filter((s) => isNationalSource(s));
  const regionalSources = sources.filter((s) => s.domestic && s.primary_region && !/pan.?india|national|all.?india/i.test(s.primary_region));
  const intlSources     = sources.filter((s) => !s.domestic);
  const tabSources = activeTab === "national" ? nationalSources
    : activeTab === "regional"      ? regionalSources
    : activeTab === "international" ? intlSources
    : sources;

  // When a client is selected and stats have loaded, filter to only sources with articles
  const statsReady = !!(clientId && !statsLoading && Object.keys(sourceStats).length > 0);
  const activeSources = (statsReady && !showAllSources)
    ? tabSources.filter((s) => (sourceStats[s.id]?.count ?? 0) > 0)
    : tabSources;
  const hiddenCount = statsReady ? tabSources.filter((s) => (sourceStats[s.id]?.count ?? 0) === 0).length : 0;

  // Library sources
  const currentLibSources: any[] = libRegion === "international"
    ? INTERNATIONAL_SOURCES
    : (libData?.sources || []);
  const filteredLibSources = currentLibSources.filter((s: any) => {
    const matchCat = !libCategory || s.category === libCategory;
    const matchSearch = !libSearch || s.name.toLowerCase().includes(libSearch.toLowerCase()) || s.url.toLowerCase().includes(libSearch.toLowerCase());
    return matchCat && matchSearch;
  });
  const allFilteredSelected = filteredLibSources.length > 0 && filteredLibSources.every((s: any) => libSelected.has(s.url));
  const libCategories = [...new Set(currentLibSources.map((s: any) => s.category))];

  const openAdd = () => { setForm({ ...BLANK, client_id: clientId || null }); setEditId(null); setErr(""); setShowModal(true); };
  const openEdit = (s: PressSource) => { setForm({ ...s }); setEditId(s.id); setErr(""); setShowModal(true); };

  const save = async () => {
    if (!form.name || !form.url) { setErr("Name and URL are required."); return; }
    setSaving(true); setErr("");
    try {
      const payload = {
        name: form.name, kind: form.kind, url: form.url,
        client_id: form.client_id || null,
        source_type: form.source_type, leaning: form.leaning,
        article_type_default: form.article_type_default,
        domestic: form.domestic, circulation: form.circulation || null,
        primary_region: form.primary_region || null,
        config: form.config || {}, is_active: form.is_active ?? true,
      };
      if (editId) await api.put(`/press-sources/${editId}`, payload);
      else await api.post("/press-sources", payload);
      setShowModal(false); load();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Save failed.");
    } finally { setSaving(false); }
  };

  const deleteSrc = async (id: string) => {
    if (!confirm("Delete this press source?")) return;
    await api.delete(`/press-sources/${id}`).catch(() => {});
    load();
  };

  const ingest = async (id: string) => {
    setIngestingId(id);
    setIngestMsg((prev) => ({ ...prev, [id]: "Fetching…" }));
    try {
      const r = await api.post(`/press-sources/${id}/ingest`);
      const d = r.data;
      setIngestMsg((prev) => ({ ...prev, [id]: `✓ ${d.new ?? 0} new articles (${d.status})` }));
      load();
    } catch (e: any) {
      setIngestMsg((prev) => ({ ...prev, [id]: `✗ ${e?.response?.data?.detail || "error"}` }));
    } finally { setIngestingId(null); }
  };

  const openLibrary = async () => {
    setShowLibrary(true); setLibSelected(new Set()); setLibMsg(""); setLibCategory(""); setLibSearch(""); setLibRegion("indian");
    if (!libData) {
      const r = await api.get("/press-sources/suggestions").catch(() => null);
      if (r) setLibData(r.data);
    }
  };

  const toggleLib = (url: string) => {
    setLibSelected((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setLibSelected((prev) => {
        const next = new Set(prev);
        filteredLibSources.forEach((s: any) => next.delete(s.url));
        return next;
      });
    } else {
      setLibSelected((prev) => {
        const next = new Set(prev);
        filteredLibSources.forEach((s: any) => next.add(s.url));
        return next;
      });
    }
  };

  const importSelected = async () => {
    if (!libSelected.size) return;
    setLibImporting(true); setLibMsg("");
    let ok = 0; let fail = 0;
    for (const url of Array.from(libSelected)) {
      const src = currentLibSources.find((s: any) => s.url === url);
      if (!src) continue;
      try {
        await api.post("/press-sources", {
          name: src.name, kind: src.kind, url: src.url,
          client_id: clientId || null,
          source_type: src.source_type || "mainline_press", leaning: src.leaning,
          article_type_default: src.article_type_default || "news",
          domestic: src.domestic ?? true,
          circulation: src.circulation || null,
          primary_region: src.primary_region || null,
          config: {}, is_active: true,
        });
        ok++;
      } catch { fail++; }
    }
    setLibMsg(`✓ ${ok} source${ok !== 1 ? "s" : ""} added${fail > 0 ? `, ${fail} failed (already exists?)` : ""}.`);
    setLibImporting(false);
    setLibSelected(new Set());
    load();
  };

  const ingestAll = async () => {
    setLoading(true);
    try {
      const r = await api.post("/press-sources/ingest-all");
      const d = r.data;
      alert(`Ingested ${d.sources_processed} sources → ${d.total_new} new articles`);
      load();
    } catch (e: any) {
      alert("Ingest failed: " + (e?.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  // Retroactively match all existing articles to the selected account (or all accounts)
  const syncArticlesForClient = async () => {
    if (!clientId) return;
    setSyncing(true); setSyncMsg("");
    try {
      const r = await api.post(`/press-sources/rematch-client/${clientId}`);
      const created = r.data.created ?? 0;
      setSyncMsg(`✅ Matched ${created} article${created !== 1 ? "s" : ""} to this account.`);
      if (created > 0) { loadSourceStats(clientId, dateFilter, customFrom, customTo); }
    } catch {
      setSyncMsg("❌ Sync failed. Try again.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(""), 5000);
    }
  };

  function getDateRange(filter: DateFilter, from: string, to: string) {
    const now = new Date();
    if (filter === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
    }
    if (filter === "week") {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      return { dateFrom: d.toISOString(), dateTo: now.toISOString() };
    }
    if (filter === "month") {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      return { dateFrom: d.toISOString(), dateTo: now.toISOString() };
    }
    if (filter === "custom" && from && to) {
      return { dateFrom: new Date(from).toISOString(), dateTo: new Date(to + "T23:59:59").toISOString() };
    }
    return { dateFrom: undefined, dateTo: undefined };
  }

  async function loadSourceStats(cid?: string, filter?: DateFilter, from?: string, to?: string) {
    const effectiveCid = cid ?? clientId;
    if (!effectiveCid) { setSourceStats({}); return; }
    const effectiveFilter = filter ?? dateFilter;
    const { dateFrom, dateTo } = getDateRange(effectiveFilter, from ?? customFrom, to ?? customTo);
    const params: Record<string, string> = { client_id: effectiveCid };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo)   params.date_to   = dateTo;
    setStatsLoading(true);
    try {
      const r = await api.get("/analytics/press-source-stats", { params });
      setSourceStats(r.data.stats || {});
    } catch { setSourceStats({}); } finally { setStatsLoading(false); }
  }

  async function loadSourceArticles(srcId: string) {
    if (expandedSrcId === srcId) { setExpandedSrcId(null); setExpandedArticles([]); return; }
    setExpandedSrcId(srcId);
    setExpandedLoading(true);
    setExpandedArticles([]);
    try {
      const { dateFrom, dateTo } = getDateRange(dateFilter, customFrom, customTo);
      const params: Record<string, string | number> = {
        client_id: clientId, press_source_id: srcId, limit: 50, offset: 0,
      };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      const r = await api.get("/analytics/press-feed", { params });
      setExpandedArticles(r.data.articles || []);
    } catch { setExpandedArticles([]); } finally { setExpandedLoading(false); }
  }

  async function generatePressReport(autoprint: boolean, dateType?: DateFilter, dFrom?: string, dTo?: string) {
    if (!clientId) return;
    const effectiveDateType = dateType ?? reportDateType;
    const effectiveFrom = dFrom ?? reportCustomFrom;
    const effectiveTo   = dTo   ?? reportCustomTo;
    const { dateFrom, dateTo } = getDateRange(effectiveDateType, effectiveFrom, effectiveTo);
    setReportGenerating(true);
    setShowReportOptions(false);
    try {
      const dateParams: Record<string, string> = { client_id: clientId };
      if (dateFrom) dateParams.date_from = dateFrom;
      if (dateTo)   dateParams.date_to   = dateTo;

      // Fetch all three data sources in parallel
      const [insightsRes, fullReportRes, firstPage] = await Promise.all([
        api.get("/analytics/press-insights", { params: dateParams }).catch(() => null),
        api.get("/analytics/press-report-full", { params: dateParams }).catch(() => null),
        api.get("/analytics/press-feed", { params: { ...dateParams, limit: 1000, offset: 0 } }),
      ]);

      let articles: Article[] = firstPage.data.articles || [];
      const total: number = firstPage.data.total || 0;

      // Paginate for very large datasets
      if (total > 1000) {
        const pages = Math.ceil((total - 1000) / 1000);
        for (let i = 1; i <= pages; i++) {
          const r = await api.get("/analytics/press-feed", {
            params: { ...dateParams, limit: 1000, offset: i * 1000 },
          });
          articles = articles.concat(r.data.articles || []);
        }
      }

      const selClient = clients.find((c) => c.id === clientId);
      const dateLabel = effectiveDateType === "all" ? "All Time"
        : effectiveDateType === "today" ? "Today"
        : effectiveDateType === "week"  ? "This Week"
        : effectiveDateType === "month" ? "This Month"
        : `${effectiveFrom} to ${effectiveTo}`;
      const reportDate = `${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · ${dateLabel}`;
      const html = buildPressReportHtml({
        articles,
        insights: insightsRes?.data || null,
        reportData: fullReportRes?.data || null,
        clientName: selClient?.name || "Client",
        reportDate,
      });
      const safeName = (selClient?.name || "Client").replace(/[^a-z0-9]/gi, "_");
      const filename = `Press_Report_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
      if (autoprint) {
        // Download real PDF via server-side WeasyPrint conversion
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
      } else {
        setReportHtml(html);
      }
    } finally {
      setReportGenerating(false);
    }
  }

  // When stats are ready, show count of sources WITH articles; otherwise total configured
  function activeCount(list: PressSource[]) {
    return (statsReady && !showAllSources)
      ? list.filter((s) => (sourceStats[s.id]?.count ?? 0) > 0).length
      : list.length;
  }
  const TABS: { key: ActiveTab; label: string; count: number }[] = [
    { key: "all",           label: "All Sources",      count: activeCount(sources) },
    { key: "national",      label: "🇮🇳 National",      count: activeCount(nationalSources) },
    { key: "regional",      label: "🗺 Regional",        count: activeCount(regionalSources) },
    { key: "international", label: "🌍 International",   count: activeCount(intlSources) },
  ];

  // Group regional sources by primary_region for the Regional tab
  const regionGroups: Record<string, PressSource[]> = {};
  if (activeTab === "regional") {
    regionalSources.forEach((s) => {
      const r = s.primary_region || "Other";
      (regionGroups[r] = regionGroups[r] || []).push(s);
    });
  }

  function SourceRow({ s }: { s: PressSource }) {
    const stats = sourceStats[s.id];
    const articleCount = stats?.count ?? null;
    const isExpanded = expandedSrcId === s.id;
    const sentTot = (stats?.Positive ?? 0) + (stats?.Negative ?? 0) + (stats?.Neutral ?? 0);
    return (
      <>
        <tr className={`transition-colors ${isExpanded ? "bg-accent/5" : "hover:bg-black/2 dark:hover:bg-white/2"}`}>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              {s.kind === "youtube_channel"
                ? <Youtube className="h-4 w-4 text-red-500 shrink-0" />
                : <Rss className="h-4 w-4 text-orange-500 shrink-0" />}
              <div>
                <div className="font-medium">{s.name}</div>
                <a href={s.url} target="_blank" rel="noreferrer"
                  className="text-[11px] text-muted hover:text-accent flex items-center gap-0.5">
                  {s.url.slice(0, 38)}{s.url.length > 38 ? "…" : ""}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          </td>
          <td className="px-4 py-3">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${LEANING_COLORS[s.leaning] || LEANING_COLORS.independent}`}>
              {s.leaning}
            </span>
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-1 text-xs">
              <Globe className={`h-3 w-3 ${s.domestic ? "text-blue-500" : "text-purple-500"}`} />
              <span className="text-muted">{s.primary_region || (s.domestic ? "Domestic" : "International")}</span>
            </div>
          </td>
          {/* Articles column */}
          <td className="px-4 py-3">
            {clientId ? (
              <button onClick={() => loadSourceArticles(s.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  isExpanded
                    ? "bg-accent text-white"
                    : articleCount !== null && articleCount > 0
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100"
                      : "text-muted hover:bg-black/5 border border-border"
                }`}>
                {isExpanded
                  ? <><ChevronUp className="h-3 w-3" /> Hide</>
                  : articleCount !== null
                    ? <><ChevronDown className="h-3 w-3" /> {articleCount} articles</>
                    : <><ChevronDown className="h-3 w-3" /> View</>}
              </button>
            ) : <span className="text-xs text-muted">—</span>}
            {/* Sentiment mini bar */}
            {clientId && stats && sentTot > 0 && (
              <div className="mt-1 flex gap-[2px] h-1 w-20 rounded overflow-hidden">
                <div style={{ width: `${Math.round((stats.Positive / sentTot) * 100)}%` }} className="bg-green-500" />
                <div style={{ width: `${Math.round((stats.Negative / sentTot) * 100)}%` }} className="bg-red-500" />
                <div style={{ width: `${Math.round((stats.Neutral  / sentTot) * 100)}%` }} className="bg-gray-300 dark:bg-gray-600" />
              </div>
            )}
          </td>
          <td className="px-4 py-3 text-right text-xs text-muted tabular-nums">
            {s.circulation ? (s.circulation / 1000).toFixed(0) + "k" : "—"}
          </td>
          <td className="px-4 py-3 text-xs text-muted">
            {fmtDate(s.last_ingested_at)}
            {ingestMsg[s.id] && (
              <div className={`mt-0.5 text-[10px] ${ingestMsg[s.id].startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                {ingestMsg[s.id]}
              </div>
            )}
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center justify-center gap-1">
              <button onClick={() => ingest(s.id)} disabled={ingestingId === s.id} title="Fetch now"
                className="rounded-lg p-1.5 text-muted hover:bg-black/5 hover:text-accent disabled:opacity-40">
                <RefreshCw className={`h-3.5 w-3.5 ${ingestingId === s.id ? "animate-spin" : ""}`} />
              </button>
              <button onClick={() => openEdit(s)} title="Edit"
                className="rounded-lg p-1.5 text-muted hover:bg-black/5 hover:text-accent">
                <Building2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => deleteSrc(s.id)} title="Delete"
                className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </td>
        </tr>
        {isExpanded && (
          <tr>
            <td colSpan={7} className="px-0 py-0">
              <SourceArticlesPanel sourceId={s.id} sourceName={s.name} />
            </td>
          </tr>
        )}
      </>
    );
  }

  function SourceArticlesPanel({ sourceId, sourceName }: { sourceId: string; sourceName: string }) {
    const SENT_COLORS: Record<string, string> = {
      Positive: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      Negative: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      Neutral:  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    };
    const fmtPubDate = (s: string | null) => {
      if (!s) return "—";
      return new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    };
    if (expandedLoading) {
      return (
        <div className="flex items-center gap-2 px-6 py-4 text-sm text-muted bg-accent/5 border-t border-border">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading articles from {sourceName}…
        </div>
      );
    }
    if (expandedArticles.length === 0) {
      return (
        <div className="px-6 py-4 text-sm text-muted bg-accent/5 border-t border-border">
          No articles found for this source with the current date filter.
        </div>
      );
    }
    return (
      <div className="bg-accent/5 border-t border-border">
        <div className="px-4 py-2 text-[11px] font-semibold text-muted uppercase tracking-wider border-b border-border/50">
          {expandedArticles.length} articles from {sourceName}
          {expandedArticles.length === 50 && <span className="ml-1 font-normal">(showing first 50)</span>}
        </div>
        <div className="divide-y divide-border/50 max-h-[480px] overflow-y-auto">
          {expandedArticles.map((a, i) => (
            <div key={i} className="px-4 py-3 flex gap-3 hover:bg-white/50 dark:hover:bg-white/5 transition-colors">
              <div className="shrink-0 mt-0.5">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${SENT_COLORS[a.sentiment] || SENT_COLORS.Neutral}`}>
                  {a.sentiment}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <a href={a.url} target="_blank" rel="noreferrer"
                    className="text-sm font-medium hover:text-accent hover:underline leading-snug line-clamp-2">
                    {a.title || a.content?.slice(0, 100) || "Untitled"}
                  </a>
                  <span className="shrink-0 text-[10px] text-muted whitespace-nowrap flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtPubDate(a.published_at)}
                  </span>
                </div>
                {a.summary && (
                  <p className="mt-0.5 text-xs text-muted line-clamp-2">{a.summary}</p>
                )}
                {a.main_narrative && !a.summary && (
                  <p className="mt-0.5 text-xs text-muted line-clamp-2">{a.main_narrative}</p>
                )}
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  {a.crisis_probability > 0.4 && (
                    <span className="text-[10px] font-medium text-red-600 dark:text-red-400">🚨 Crisis {Math.round(a.crisis_probability * 100)}%</span>
                  )}
                  {a.urgency_score > 0.5 && (
                    <span className="text-[10px] text-orange-600 dark:text-orange-400">⚠ Urgent</span>
                  )}
                  {a.url && (
                    <a href={a.url} target="_blank" rel="noreferrer"
                      className="text-[10px] text-accent hover:underline flex items-center gap-0.5">
                      Read article <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function SourceTable({ list }: { list: PressSource[] }) {
    return (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-black/2 dark:bg-white/2">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted">Source</th>
              <th className="px-4 py-3 text-left font-medium text-muted">Leaning</th>
              <th className="px-4 py-3 text-left font-medium text-muted">Region</th>
              <th className="px-4 py-3 text-left font-medium text-muted">
                Articles {clientId && <span className="text-[10px] font-normal opacity-60">(selected period)</span>}
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted">Circulation</th>
              <th className="px-4 py-3 text-left font-medium text-muted">Last Ingested</th>
              <th className="px-4 py-3 text-center font-medium text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((s) => <SourceRow key={s.id} s={s} />)}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      {/* Backdrop for dropdowns */}
      {showReportOptions && <div className="fixed inset-0 z-40" onClick={() => setShowReportOptions(false)} />}
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-accent" /> Press & Web Sources
          </h1>
          <p className="mt-1 text-sm text-muted">
            Configure news feeds (RSS) and YouTube news/commentary channels for web intelligence. Max 25 active sources per client.
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <button onClick={openLibrary}
            className="flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/5 px-3 py-1.5 text-sm text-accent font-medium hover:bg-accent/10">
            <Library className="h-4 w-4" /> Media Library
          </button>
          <button onClick={ingestAll} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm text-muted hover:bg-black/5 dark:hover:bg-white/5">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Ingest All
          </button>
          <div className="relative">
            <button onClick={() => setShowReportOptions((v) => !v)} disabled={!clientId || reportGenerating}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent/10 disabled:opacity-40">
              <Newspaper className="h-4 w-4" /> {reportGenerating ? "Generating…" : "Generate Report"}
              <ChevronDown className="h-3.5 w-3.5 ml-0.5" />
            </button>
            {showReportOptions && (
              <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl border border-border bg-card shadow-lg p-4 space-y-3">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider">Date Range</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["all", "today", "week", "month", "custom"] as const).map((f) => (
                    <button key={f} onClick={() => setReportDateType(f)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${reportDateType === f ? "bg-accent text-white" : "border border-border hover:bg-black/5 dark:hover:bg-white/5"}`}>
                      {f === "all" ? "All Time" : f === "today" ? "Today" : f === "week" ? "This Week" : f === "month" ? "This Month" : "Custom Range"}
                    </button>
                  ))}
                </div>
                {reportDateType === "custom" && (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-muted">From</label>
                        <input type="date" value={reportCustomFrom} onChange={(e) => setReportCustomFrom(e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-muted">To</label>
                        <input type="date" value={reportCustomTo} onChange={(e) => setReportCustomTo(e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs" />
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => generatePressReport(false)} disabled={reportGenerating}
                    className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/10 disabled:opacity-40">
                    Preview
                  </button>
                  <button onClick={() => generatePressReport(true)} disabled={reportGenerating}
                    className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
                    <span className="flex items-center justify-center gap-1"><FileDown className="h-3.5 w-3.5" /> Download</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">
            <Plus className="h-4 w-4" /> Add Source
          </button>
        </div>
      </div>

      {/* YouTube quota banner */}
      {quota && (
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
          quota.near_cap ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20" : "border-border bg-black/2 text-muted dark:bg-white/2"
        }`}>
          {quota.near_cap ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
          <span>YouTube API quota: <strong>{quota.used}</strong> / {quota.limit} units used today
          {quota.near_cap && " — YouTube ingestion paused until midnight UTC"}</span>
        </div>
      )}

      {/* Client filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted shrink-0">Account:</label>
        <select value={clientId} onChange={(e) => { setClientId(e.target.value); load(e.target.value); }}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
          <option value="">— All clients —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Date filter bar */}
      {clientId && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted shrink-0" />
          <span className="text-xs text-muted shrink-0">Period:</span>
          {(["all", "today", "week", "month", "custom"] as const).map((f) => (
            <button key={f} onClick={() => setDateFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                dateFilter === f ? "bg-accent text-white" : "border border-border hover:bg-black/5 dark:hover:bg-white/5 text-muted"
              }`}>
              {f === "all" ? "All Time" : f === "today" ? "Today" : f === "week" ? "This Week" : f === "month" ? "This Month" : "Custom"}
            </button>
          ))}
          {dateFilter === "custom" && (
            <div className="flex items-center gap-1.5 ml-1">
              <Calendar className="h-3.5 w-3.5 text-muted" />
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-border bg-card px-2 py-1 text-xs" />
              <span className="text-xs text-muted">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-border bg-card px-2 py-1 text-xs" />
            </div>
          )}
          {Object.keys(sourceStats).length > 0 && (
            <span className="ml-auto text-xs text-muted">
              {Object.values(sourceStats).reduce((s, v) => s + v.count, 0)} total articles
            </span>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-border">
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-fg hover:border-border"
            }`}>
            {tab.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
              activeTab === tab.key ? "bg-accent/15 text-accent" : "bg-black/5 dark:bg-white/10 text-muted"
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Source list */}
      {/* Summary bar: active sources + hidden toggle */}
      {statsReady && clientId && (
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <span className="text-muted">
            <span className="font-semibold text-fg">{activeSources.length}</span> source{activeSources.length !== 1 ? "s" : ""} with coverage for this account
            {hiddenCount > 0 && !showAllSources && (
              <> · <span className="text-muted">{hiddenCount} with no matching articles hidden</span></>
            )}
          </span>
          {syncMsg && <span className="text-xs font-medium">{syncMsg}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={syncArticlesForClient} disabled={syncing}
              className="flex items-center gap-1 rounded-lg bg-accent/10 text-accent px-3 py-1 text-xs font-medium hover:bg-accent/20 disabled:opacity-40">
              {syncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {syncing ? "Syncing…" : "Sync to Account"}
            </button>
            {hiddenCount > 0 && (
              <button onClick={() => setShowAllSources((v) => !v)}
                className="text-accent hover:underline font-medium">
                {showAllSources ? `Hide ${hiddenCount} empty` : `Show all ${tabSources.length}`}
              </button>
            )}
          </div>
        </div>
      )}

      {loading || (clientId && statsLoading) ? (
        <div className="flex items-center justify-center py-12 text-muted text-sm">
          {statsLoading ? "Finding articles for this account…" : "Loading…"}
        </div>
      ) : activeSources.length === 0 && statsReady ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <Newspaper className="h-10 w-10 text-muted/40" />
          <div>
            <p className="font-medium">No articles found for this account</p>
            <p className="text-sm text-muted mt-1">
              None of the configured sources have ingested articles for <strong>{clients.find(c => c.id === clientId)?.name}</strong> yet.
              Try clicking <strong>Ingest All</strong> to fetch the latest content.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            <button onClick={syncArticlesForClient} disabled={syncing}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">
              {syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? "Syncing…" : "Sync Articles to Account"}
            </button>
            <button onClick={ingestAll}
              className="flex items-center gap-1.5 rounded-xl bg-accent/10 text-accent px-4 py-2 text-sm font-medium hover:bg-accent/20">
              <RefreshCw className="h-4 w-4" /> Ingest All Sources
            </button>
            <button onClick={() => setShowAllSources(true)}
              className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm text-muted hover:bg-black/5 dark:hover:bg-white/5">
              Show all {tabSources.length} sources
            </button>
          </div>
          {syncMsg && <p className="text-sm font-medium">{syncMsg}</p>}
        </Card>
      ) : tabSources.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          {activeTab === "international" ? <Globe className="h-10 w-10 text-muted/40" /> : activeTab === "regional" ? <Map className="h-10 w-10 text-muted/40" /> : <Newspaper className="h-10 w-10 text-muted/40" />}
          <div>
            <p className="font-medium">No {activeTab === "all" ? "" : activeTab + " "}sources configured</p>
            <p className="text-sm text-muted mt-1">
              {activeTab === "international" ? "Import from the International Media Library or add sources manually." : "Add sources via the Media Library or manually with Add Source."}
            </p>
          </div>
          <button onClick={openLibrary}
            className="mt-1 flex items-center gap-1.5 rounded-xl bg-accent/10 text-accent px-4 py-2 text-sm font-medium hover:bg-accent/20">
            <Library className="h-4 w-4" /> Open Media Library
          </button>
        </Card>
      ) : activeTab === "regional" ? (
        <div className="space-y-4">
          {Object.entries(regionGroups).map(([region, srcs]) => {
            const filteredSrcs = (statsReady && !showAllSources)
              ? srcs.filter((s) => (sourceStats[s.id]?.count ?? 0) > 0)
              : srcs;
            if (filteredSrcs.length === 0) return null;
            return (
              <div key={region}>
                <div className="mb-2 flex items-center gap-2">
                  <Map className="h-3.5 w-3.5 text-muted" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">{region}</span>
                  <span className="text-xs text-muted">· {filteredSrcs.length} source{filteredSrcs.length !== 1 ? "s" : ""}</span>
                </div>
                <SourceTable list={filteredSrcs} />
              </div>
            );
          })}
        </div>
      ) : (
        <SourceTable list={activeSources} />
      )}

      {/* ── Media Library Modal ── */}
      {showLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-card border border-border shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border p-5 shrink-0">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Library className="h-5 w-5 text-accent" />
                  {libRegion === "indian" ? "Indian Media Library" : "International Media Library"}
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {libRegion === "indian"
                    ? `${libData?.total ?? 0} curated Indian sources — national, regional, TV channels, Hindi, and official.`
                    : `${INTERNATIONAL_SOURCES.length} curated international sources — global wire services, English press, and video.`}
                </p>
              </div>
              <button onClick={() => setShowLibrary(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-black/5 dark:hover:bg-white/5 text-xl leading-none shrink-0">
                ×
              </button>
            </div>

            {/* Region toggle */}
            <div className="flex items-center gap-1 border-b border-border px-5 py-3 shrink-0 bg-black/2 dark:bg-white/2">
              <button onClick={() => { setLibRegion("indian"); setLibCategory(""); setLibSearch(""); }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${libRegion === "indian" ? "bg-accent text-white" : "text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}>
                🇮🇳 Indian Sources
              </button>
              <button onClick={() => { setLibRegion("international"); setLibCategory(""); setLibSearch(""); }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${libRegion === "international" ? "bg-accent text-white" : "text-muted hover:bg-black/5 dark:hover:bg-white/5"}`}>
                🌍 International Sources
              </button>
            </div>

            {/* Filters + Select All */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3 shrink-0">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
                <input value={libSearch} onChange={(e) => setLibSearch(e.target.value)}
                  placeholder="Search sources…"
                  className="w-full rounded-lg border border-border bg-black/5 dark:bg-white/5 pl-8 pr-3 py-1.5 text-sm" />
              </div>
              <select value={libCategory} onChange={(e) => setLibCategory(e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
                <option value="">All Categories</option>
                {libCategories.map((cat: string) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <button onClick={toggleSelectAll}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  allFilteredSelected
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted hover:bg-black/5 dark:hover:bg-white/5"
                }`}>
                {allFilteredSelected
                  ? <><CheckSquare className="h-4 w-4" /> Deselect All</>
                  : <><Square className="h-4 w-4" /> Select All</>}
              </button>
              <span className="text-xs text-muted min-w-[80px]">
                {libSelected.size > 0 ? <span className="font-semibold text-accent">{libSelected.size} selected</span> : "none selected"}
              </span>
            </div>

            {/* Source list */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
              {libRegion === "indian" && !libData ? (
                <div className="flex items-center justify-center py-16 text-muted text-sm">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading library…
                </div>
              ) : (() => {
                if (filteredLibSources.length === 0) return (
                  <div className="py-16 text-center text-sm text-muted">No sources match the current filter.</div>
                );
                const groups: Record<string, any[]> = {};
                filteredLibSources.forEach((s: any) => {
                  (groups[s.category] = groups[s.category] || []).push(s);
                });
                return Object.entries(groups).map(([cat, srcs]) => (
                  <div key={cat} className="mb-4">
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted/70">{cat}</div>
                    {srcs.map((s: any) => {
                      const sel = libSelected.has(s.url);
                      return (
                        <div key={s.url} onClick={() => toggleLib(s.url)}
                          className={`flex items-start gap-3 cursor-pointer rounded-xl border p-3 mb-1.5 transition-colors ${
                            sel ? "border-accent bg-accent/5" : "border-border hover:border-accent/30 hover:bg-black/2 dark:hover:bg-white/2"
                          }`}>
                          <div className="mt-0.5 shrink-0">
                            {sel ? <CheckSquare className="h-4 w-4 text-accent" /> : <Square className="h-4 w-4 text-muted" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {s.kind === "youtube_channel"
                                ? <Youtube className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                : <Rss className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                              <span className="text-sm font-semibold">{s.name}</span>
                              <span className={`rounded-full px-1.5 py-0 text-[10px] font-medium ${LEANING_COLORS[s.leaning] || LEANING_COLORS.independent}`}>
                                {s.leaning}
                              </span>
                              {s.primary_region && <span className="text-[10px] text-muted">{s.primary_region}</span>}
                              {s.circulation && <span className="text-[10px] text-muted">circ. {(s.circulation / 1000).toFixed(0)}k</span>}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted truncate">{s.url}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4 shrink-0">
              <div>
                {libMsg && (
                  <span className={`text-sm font-medium ${libMsg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>
                    {libMsg}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowLibrary(false)}
                  className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                  Close
                </button>
                <button onClick={importSelected} disabled={libSelected.size === 0 || libImporting}
                  className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50">
                  {libImporting
                    ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Importing…</>
                    : <><Download className="h-3.5 w-3.5" /> Import {libSelected.size > 0 ? `${libSelected.size} ` : ""}Selected</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Full-screen Report Preview Modal ── */}
      {reportHtml && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/80">
          <div className="flex items-center justify-between gap-3 bg-card border-b border-border px-4 py-2 shrink-0">
            <span className="text-sm font-semibold">Press Intelligence Report Preview</span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  const cName = clients.find((c) => c.id === clientId)?.name || "Client";
                  a.download = `Press_Report_${cName.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().slice(0,10)}.html`;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 5000);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                <FileDown className="h-3.5 w-3.5" /> Download HTML
              </button>
              <button onClick={() => setReportHtml(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5">
                ✕ Close
              </button>
            </div>
          </div>
          <iframe
            srcDoc={reportHtml}
            className="flex-1 w-full border-0 bg-white"
            title="Press Intelligence Report"
            sandbox="allow-same-origin allow-scripts"
          />
        </div>
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl border border-border">
            <h2 className="text-base font-bold mb-4">{editId ? "Edit Source" : "Add Press Source"}</h2>
            {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
            <div className="space-y-3 overflow-y-auto max-h-[65vh]">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Source Name *</label>
                <input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Times of India" className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Source Kind *</label>
                <select value={form.kind || "rss"} onChange={(e) => setForm({ ...form, kind: e.target.value })}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <option value="rss">RSS / Atom Feed</option>
                  <option value="youtube_channel">YouTube News Channel</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  {form.kind === "youtube_channel" ? "YouTube Channel URL *" : "RSS Feed URL *"}
                </label>
                <input value={form.url || ""} onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder={form.kind === "youtube_channel" ? "https://www.youtube.com/@NDTV" : "https://timesofindia.indiatimes.com/..."}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Client</label>
                <select value={form.client_id || ""} onChange={(e) => setForm({ ...form, client_id: e.target.value || null })}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <option value="">— All / No specific client —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Source Type</label>
                  <select value={form.source_type || "mainline_press"} onChange={(e) => setForm({ ...form, source_type: e.target.value })}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <option value="mainline_press">Mainline Press</option>
                    <option value="digital_native_partisan">Digital / Partisan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Editorial Leaning</label>
                  <select value={form.leaning || "independent"} onChange={(e) => setForm({ ...form, leaning: e.target.value })}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <option value="independent">Independent</option>
                    <option value="friendly">Friendly</option>
                    <option value="hostile">Hostile</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Default Article Type</label>
                  <select value={form.article_type_default || "news"} onChange={(e) => setForm({ ...form, article_type_default: e.target.value })}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <option value="news">News</option>
                    <option value="opinion">Opinion / Editorial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Geographic Scope</label>
                  <select value={form.domestic ? "domestic" : "international"} onChange={(e) => setForm({ ...form, domestic: e.target.value === "domestic" })}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <option value="domestic">Domestic / Indian</option>
                    <option value="international">International</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Primary Region</label>
                  <input value={form.primary_region || ""} onChange={(e) => setForm({ ...form, primary_region: e.target.value })}
                    placeholder="e.g. Delhi NCR, Pan-India" className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Circulation</label>
                  <input type="number" value={form.circulation || ""} onChange={(e) => setForm({ ...form, circulation: parseInt(e.target.value) || null })}
                    placeholder="e.g. 500000" className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
                </div>
              </div>
              {form.kind === "youtube_channel" && (
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">YouTube API Key override (optional)</label>
                  <input value={form.config?.yt_api_key || ""} onChange={(e) => setForm({ ...form, config: { ...form.config, yt_api_key: e.target.value } })}
                    placeholder="Uses global YOUTUBE_API_KEY env by default" className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono" />
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60">
                {saving ? "Saving…" : editId ? "Update Source" : "Add Source"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
