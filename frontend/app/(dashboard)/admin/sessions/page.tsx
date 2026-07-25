"use client";
import { useEffect, useState, useCallback } from "react";
import { Monitor, Smartphone, Tablet, MapPin, Clock, Shield, LogOut, RefreshCw, Users, Wifi, Globe, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";

interface Session {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  ip_address: string | null;
  device_type: string | null;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  logged_in_at: string | null;
  last_active_at: string | null;
  logged_out_at: string | null;
}

interface Stats {
  active_sessions: number;
  total_users: number;
  total_sessions_ever: number;
  accounts_connected: number;
  countries: string[];
  devices: Record<string, number>;
}

function DeviceIcon({ type }: { type: string | null }) {
  const cls = "h-5 w-5";
  if (type === "mobile") return <Smartphone className={cls} />;
  if (type === "tablet") return <Tablet className={cls} />;
  return <Monitor className={cls} />;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function timeSince(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sesRes, statRes] = await Promise.all([
        api.get("/sessions/", { params: { active_only: activeOnly, limit: 200 } }),
        api.get("/sessions/stats"),
      ]);
      setSessions(sesRes.data.sessions);
      setStats(statRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load sessions. Admin access required.");
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => { load(); }, [load]);

  async function revokeSession(id: string) {
    if (!confirm("Force-logout this session?")) return;
    setRevoking(id);
    try {
      await api.delete(`/sessions/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (stats) setStats({ ...stats, active_sessions: stats.active_sessions - 1 });
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to revoke session");
    } finally {
      setRevoking(null);
    }
  }

  async function revokeAll(userId: string, userName: string | null) {
    if (!confirm(`Force-logout ALL sessions for ${userName || userId}?`)) return;
    try {
      const { data } = await api.delete(`/sessions/user/${userId}/all`);
      setSessions((prev) => prev.filter((s) => s.user_id !== userId));
      if (stats) setStats({ ...stats, active_sessions: Math.max(0, stats.active_sessions - (data.count || 0)) });
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to revoke sessions");
    }
  }

  // Group by user for "per account" view
  const byUser = sessions.reduce<Record<string, Session[]>>((acc, s) => {
    const key = s.user_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Shield className="h-6 w-6 text-accent" /> Active Sessions</h1>
          <p className="text-sm text-muted mt-0.5">Monitor all logged-in devices, locations and sessions across the platform.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-muted cursor-pointer">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="rounded" />
            Active only
          </label>
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: <Wifi className="h-5 w-5 text-emerald-500" />, label: "Active Sessions", value: stats.active_sessions, color: "text-emerald-600 dark:text-emerald-400" },
            { icon: <Users className="h-5 w-5 text-blue-500" />, label: "Signed-up Users", value: stats.total_users, color: "text-blue-600 dark:text-blue-400" },
            { icon: <Globe className="h-5 w-5 text-purple-500" />, label: "Social Accounts", value: stats.accounts_connected, color: "text-purple-600 dark:text-purple-400" },
            { icon: <Clock className="h-5 w-5 text-orange-500" />, label: "Total Logins Ever", value: stats.total_sessions_ever, color: "text-orange-600 dark:text-orange-400" },
          ].map((s) => (
            <Card key={s.label} className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/5 dark:bg-white/5">{s.icon}</div>
              <div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted">{s.label}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Device + country breakdown */}
      {stats && (stats.countries.length > 0 || Object.keys(stats.devices).length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.keys(stats.devices).length > 0 && (
            <Card className="p-4">
              <div className="text-sm font-semibold mb-3">Device Breakdown</div>
              <div className="space-y-2">
                {Object.entries(stats.devices).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2">
                    <DeviceIcon type={type} />
                    <span className="text-sm capitalize flex-1">{type}</span>
                    <span className="text-sm font-semibold">{count}</span>
                    <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${(count / Math.max(1, stats.active_sessions)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {stats.countries.length > 0 && (
            <Card className="p-4">
              <div className="text-sm font-semibold mb-3">Active Locations</div>
              <div className="flex flex-wrap gap-2">
                {stats.countries.map((c) => (
                  <span key={c} className="flex items-center gap-1 rounded-full bg-black/5 dark:bg-white/5 px-3 py-1 text-xs">
                    <MapPin className="h-3 w-3 text-accent" /> {c}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Sessions grouped by user */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted py-8 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading sessions…
        </div>
      ) : sessions.length === 0 ? (
        <Card className="p-8 text-center text-muted text-sm">
          No {activeOnly ? "active " : ""}sessions found.
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(byUser).map(([userId, userSessions]) => {
            const firstSession = userSessions[0];
            return (
              <Card key={userId} className="overflow-hidden">
                {/* User header */}
                <div className="flex items-center justify-between px-4 py-3 bg-black/3 dark:bg-white/3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-accent font-semibold text-sm">
                      {(firstSession.user_name || firstSession.user_email || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{firstSession.user_name || "Unknown User"}</div>
                      <div className="text-xs text-muted">{firstSession.user_email}</div>
                    </div>
                    <span className="ml-2 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[11px] font-medium">
                      {userSessions.length} {userSessions.length === 1 ? "device" : "devices"}
                    </span>
                  </div>
                  {activeOnly && userSessions.length > 0 && (
                    <button
                      onClick={() => revokeAll(userId, firstSession.user_name)}
                      className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1"
                    >
                      <LogOut className="h-3 w-3" /> Logout all
                    </button>
                  )}
                </div>

                {/* Sessions for this user */}
                <div className="divide-y divide-border">
                  {userSessions.map((s) => (
                    <div key={s.id} className="flex items-start gap-4 px-4 py-3">
                      {/* Device icon */}
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.is_active ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400" : "bg-gray-100 dark:bg-gray-800 text-gray-400"}`}>
                        <DeviceIcon type={s.device_type} />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {s.device_name ? s.device_name : (s.device_type || "Unknown device")}
                          </span>
                          <span className="text-sm text-muted">·</span>
                          <span className="text-sm text-muted">{s.browser} on {s.os}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${s.is_active ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                            {s.is_active ? "● Active" : "Logged out"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted flex-wrap">
                          {(s.city || s.country) && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {[s.city, s.region, s.country].filter(Boolean).join(", ")}
                            </span>
                          )}
                          {s.ip_address && (
                            <span className="font-mono">{s.ip_address}</span>
                          )}
                          {s.logged_in_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Login: {fmtTime(s.logged_in_at)}
                            </span>
                          )}
                          {s.last_active_at && s.is_active && (
                            <span className="text-emerald-600 dark:text-emerald-400">Active {timeSince(s.last_active_at)}</span>
                          )}
                          {s.logged_out_at && !s.is_active && (
                            <span>Logout: {fmtTime(s.logged_out_at)}</span>
                          )}
                        </div>
                      </div>

                      {/* Revoke button */}
                      {s.is_active && (
                        <button
                          onClick={() => revokeSession(s.id)}
                          disabled={revoking === s.id}
                          className="shrink-0 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 disabled:opacity-50 transition-colors"
                        >
                          {revoking === s.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
