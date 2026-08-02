"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Shield, BarChart3, Bell, FileDown, MessageSquare, Radio, RefreshCw, Users } from "lucide-react";
import { login } from "@/lib/auth";

const FEATURES = [
  {
    icon: <MessageSquare className="h-5 w-5" />,
    title: "AI Sentiment Analysis",
    desc: "Every public comment classified as Positive, Neutral, or Negative using NLP — understands context, not just keywords.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    icon: <BarChart3 className="h-5 w-5" />,
    title: "Volume & Trend Charts",
    desc: "Daily, weekly, and monthly comment volume charts with risk-level scoring. Spot spikes before they become crises.",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    icon: <Bell className="h-5 w-5" />,
    title: "Instant Crisis Alerts",
    desc: "WhatsApp and email alerts the moment negative sentiment crosses your threshold. React in minutes, not hours.",
    color: "text-red-500",
    bg: "bg-red-500/10",
  },
  {
    icon: <Radio className="h-5 w-5" />,
    title: "Multi-Platform Coverage",
    desc: "Scan comments across Facebook, Instagram, Twitter/X, and YouTube — all in a single unified dashboard.",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
  {
    icon: <FileDown className="h-5 w-5" />,
    title: "Client PDF Reports",
    desc: "One-click export of a fully branded, plain-English sentiment report — ready to share with any client or stakeholder.",
    color: "text-green-500",
    bg: "bg-green-500/10",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "Multi-Client Management",
    desc: "Manage unlimited brands and accounts from a single workspace with role-based access for your whole team.",
    color: "text-sky-500",
    bg: "bg-sky-500/10",
  },
];

const STATS = [
  { value: "Real-time", label: "Comment scanning" },
  { value: "4 Platforms", label: "Facebook, IG, X, YouTube" },
  { value: "AI-Powered", label: "NLP sentiment engine" },
  { value: "PDF Export", label: "One-click reports" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#0f172a]">

      {/* ── LEFT — landing content ── */}
      <div className="flex-1 flex flex-col justify-between px-8 py-10 lg:px-16 lg:py-14 text-white">

        {/* Brand header */}
        <div className="flex items-center gap-3 mb-10">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-base font-bold leading-none tracking-tight">ORM CMS</div>
            <div className="text-[11px] text-slate-400 mt-0.5">by BrandThink</div>
          </div>
        </div>

        {/* Hero */}
        <div className="mb-10">
          <h1 className="text-3xl lg:text-4xl font-bold leading-tight tracking-tight mb-3">
            Monitor. Understand.{" "}
            <span className="text-blue-400">Respond.</span>
          </h1>
          <p className="text-slate-300 text-base leading-relaxed max-w-lg">
            The complete Online Reputation Management platform — scan every comment
            on every post, understand public sentiment in real time, and protect
            your brand before small issues become big crises.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/[0.07] transition-colors">
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${f.bg} ${f.color}`}>
                {f.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-white mb-0.5">{f.title}</div>
                <p className="text-[12px] text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-white/10 pt-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-lg font-bold text-blue-400">{s.value}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT — login form ── */}
      <div className="w-full lg:w-[420px] flex items-center justify-center bg-white/[0.03] border-t lg:border-t-0 lg:border-l border-white/10 px-8 py-12">
        <div className="w-full max-w-sm">

          {/* Form card */}
          <div className="rounded-2xl border border-white/10 bg-[#1e293b] p-8 shadow-2xl">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white">Sign in to your workspace</h2>
              <p className="mt-1 text-sm text-slate-400">Enter your credentials to access the platform.</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Email address</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Password</label>
                <div className="relative">
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          <p className="mt-4 text-center text-[11px] text-slate-600">
            ORM CMS · BrandThink Agency · orm.brandthink.in
          </p>
        </div>
      </div>
    </div>
  );
}
