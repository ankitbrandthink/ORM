"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Shield, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Reset failed. The link may have expired.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#1e293b] p-8 shadow-2xl text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15">
            <XCircle className="h-7 w-7 text-red-400" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Invalid link</h2>
        <p className="text-sm text-slate-400 mb-6">This reset link is missing or malformed. Please request a new one.</p>
        <button onClick={() => router.push("/login")}
          className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors">
          Back to sign in
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#1e293b] p-8 shadow-2xl text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
            <CheckCircle2 className="h-7 w-7 text-green-400" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Password updated!</h2>
        <p className="text-sm text-slate-400 mb-6">Your password has been reset. You can now sign in with your new password.</p>
        <button onClick={() => router.push("/login")}
          className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors">
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1e293b] p-8 shadow-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Set new password</h2>
        <p className="mt-1 text-sm text-slate-400">Choose a strong password — at least 8 characters.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400">New password</label>
          <div className="relative">
            <input
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors" tabIndex={-1}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400">Confirm password</label>
          <div className="relative">
            <input
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />
            <button type="button" onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors" tabIndex={-1}>
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Strength indicator */}
        {password && (
          <div className="space-y-1">
            <div className="flex gap-1">
              {[8, 12, 16].map((n) => (
                <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${
                  password.length >= n ? "bg-green-500" : "bg-white/10"
                }`} />
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              {password.length < 8 ? "Too short" : password.length < 12 ? "Acceptable" : password.length < 16 ? "Good" : "Strong"}
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading}
          className="mt-2 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
          {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-base font-bold leading-none tracking-tight text-white">ORM CMS</div>
            <div className="text-[11px] text-slate-400 mt-0.5">by BrandThink</div>
          </div>
        </div>
        <Suspense fallback={<div className="text-slate-400 text-sm text-center">Loading…</div>}>
          <ResetPasswordForm />
        </Suspense>
        <p className="mt-4 text-center text-[11px] text-slate-600">
          ORM CMS · BrandThink Agency · orm.brandthink.in
        </p>
      </div>
    </div>
  );
}
