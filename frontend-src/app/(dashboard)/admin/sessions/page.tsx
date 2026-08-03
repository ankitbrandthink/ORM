"use client";
import { useEffect, useState } from "react";
import {
  Monitor, Smartphone, Globe2, RefreshCw, LogOut, Users, Wifi,
  MapPin, Clock, Shield,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui/primitives";

function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return "Active just now";
  if (secs < 3600) return `Active ${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `Active ${Math.floor(secs / 3600)}h ago`;
  return `Active ${Math.floor(secs / 86400)}d ago`;
}

function fmtLogin(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    + ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const DEVICE_ICON: Record<string, any> = {
  mobile: Smartphone, desktop: Monitor, tablet: Monitor,
};

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string>("");

  function load() {
    setLoading(true);
    Promise.all([
      api.get("/sessions", { params: { active_only: activeOnly } }),
      api.get("/sessions/stats"),
    ]).then(([s, st]) => {
      setSessions(s.data.sessions || []);
      setStats(st.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(load, [activeOnly]);

  async function revoke(sessionId: string) {
    if (!confirm("Force-logout this session?")) return;
    setRevoking(sessionId);
    try { await api.delete(`/sessions/${sessionId}`); load(); }
    catch (e: any) { alert(e?.response?.data?.detail || "Could not revoke session."); }
    finally { setRevoking(""); }
  }

  async function revokeAll(userId: string, email: string) {
    if (!confirm(`Force-logout ALL sessions for ${email}?`)) return;
    try { await api.delete(`/sessions/user/${userId}/all`); load(); }
    catch (e: any) { alert(e?.response?.data?.detail || "Could not revoke sessions."); }
  }

  // Group sessions by user
  const byUser: Record<string, { name: string; email: string; sessions: any[] }> = {};
  for (const s of sessions) {
    const uid = s.user_id;
    if (!byUser[uid]) byUser[uid] = { name: s.user_name || "Unknown", email: s.user_email || "", sessions: [] };
    byUser[uid].sessions.push(s);
  }
  const userGroups = Object.entries(byUser);

  // Device breakdown total for bar scaling
  const deviceTotal = stats ? Object.values(stats.devices || {}).reduce((a: any, b: any) => a + b, 0) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-accent" /> Active Sessions
          </h1>
          <p className="text-sm text-muted">Monitor all logged-in devices, locations and sessions across the platform.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
            <input type="checkbox" checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)} />
            Active only
          </label>
          <Button variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card>
            <div className="flex items-center gap-2 text-xs text-muted"><Wifi className="h-4 w-4 text-green-500" />Active Sessions</div>
            <div className="mt-1 text-3xl font-semibold text-green-600">{stats.active_sessions}</div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-xs text-muted"><Users className="h-4 w-4 text-purple-500" />Signed-up Users</div>
            <div className="mt-1 text-3xl font-semibold text-purple-600">{stats.total_users}</div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-xs text-muted"><Globe2 className="h-4 w-4 text-blue-500" />Social Accounts</div>
            <div className="mt-1 text-3xl font-semibold text-blue-600">{stats.accounts_connected}</div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-xs text-muted"><Clock className="h-4 w-4 text-orange-500" />Total Logins Ever</div>
            <div className="mt-1 text-3xl font-semibold text-orange-600">{stats.total_sessions_ever}</div>
          </Card>
        </div>
      )}

      {/* Device breakdown + Locations row */}
      {stats && (Object.keys(stats.devices || {}).length > 0 || stats.countries?.length > 0) && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Device breakdown */}
          {Object.keys(stats.devices || {}).length > 0 && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">Device Breakdown</h3>
              <div className="space-y-3">
                {Object.entries(stats.devices).map(([device, count]) => {
                  const Icon = DEVICE_ICON[device] ?? Monitor;
                  const pct = deviceTotal > 0 ? Math.round((count as number) * 100 / deviceTotal) : 0;
                  return (
                    <div key={device} className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-muted" />
                      <span className="w-20 text-sm capitalize">{device}</span>
                      <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-6 text-right text-sm font-medium">{count as number}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Active locations */}
          {stats.countries?.length > 0 && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">Active Locations</h3>
              <div className="space-y-2">
                {stats.countries.map((c: string) => (
                  <div key={c} className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-accent shrink-0" />
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Sessions grouped by user */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading sessions…</span>
        </div>
      ) : sessions.length === 0 ? (
        <Card className="py-10 text-center text-muted">
          <Wifi className="mx-auto mb-2 h-8 w-8 opacity-30" />
          <p className="text-sm">{activeOnly ? "No active sessions right now." : "No sessions found."}</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden divide-y divide-border">
          {userGroups.map(([userId, group]) => (
            <div key={userId}>
              {/* User header row */}
              <div className="flex items-center gap-3 px-4 py-3 bg-card/60">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent text-sm font-semibold">
                  {initials(group.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{group.name}</span>
                    <Badge className="bg-accent/10 text-accent text-xs px-2 py-0.5">
                      {group.sessions.length} device{group.sessions.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted">{group.email}</div>
                </div>
                <button
                  onClick={() => revokeAll(userId, group.email)}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-lg px-2 py-1 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" /> Logout all
                </button>
              </div>

              {/* Session rows for this user */}
              {group.sessions.map((s: any) => {
                const DevIcon = DEVICE_ICON[s.device_type ?? ""] ?? Monitor;
                const location = [s.city, s.region, s.country].filter(Boolean).join(", ") || "Unknown";
                const deviceLabel = [s.device_name || (s.device_type ? s.device_type.charAt(0).toUpperCase() + s.device_type.slice(1) + " PC" : "Device"), s.browser, s.os].filter(Boolean).join(" - ");
                return (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3 pl-14 border-t border-border/40 hover:bg-black/5 dark:hover:bg-white/5">
                    <DevIcon className="h-5 w-5 shrink-0 text-muted" />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <span className="font-medium">{deviceLabel || "Unknown device"}</span>
                        {s.is_active && (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                        {location !== "Unknown" && (
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{location}</span>
                        )}
                        {s.ip_address && <span>{s.ip_address}</span>}
                        {s.logged_in_at && (
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Login: {fmtLogin(s.logged_in_at)}</span>
                        )}
                        {s.last_active_at && (
                          <span className="text-green-600 font-medium">{timeAgo(s.last_active_at)}</span>
                        )}
                      </div>
                    </div>
                    {s.is_active && (
                      <button
                        onClick={() => revoke(s.id)}
                        disabled={revoking === s.id}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-lg px-2 py-1 transition-colors disabled:opacity-50 shrink-0"
                      >
                        <LogOut className="h-3.5 w-3.5" /> Revoke
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
