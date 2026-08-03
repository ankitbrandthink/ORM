"use client";
import { useEffect, useState } from "react";
import {
  Monitor, Smartphone, Globe2, RefreshCw, LogOut, Users, Clock, Wifi,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui/primitives";

function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const DEVICE_ICON: Record<string, any> = {
  mobile: Smartphone, desktop: Monitor, tablet: Monitor,
};

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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Active Sessions</h1>
          <p className="text-sm text-muted">View and manage all current login sessions across your team.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input type="checkbox" checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)} />
            Active only
          </label>
          <Button variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card>
            <div className="flex items-center gap-2 text-xs text-muted"><Wifi className="h-4 w-4 text-green-500" />Active now</div>
            <div className="mt-1 text-3xl font-semibold text-green-600">{stats.active_sessions}</div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-xs text-muted"><Users className="h-4 w-4" />Total users</div>
            <div className="mt-1 text-3xl font-semibold">{stats.total_users}</div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-xs text-muted"><Globe2 className="h-4 w-4" />Countries</div>
            <div className="mt-1 text-3xl font-semibold">{stats.countries?.length ?? 0}</div>
            {stats.countries?.length > 0 && (
              <p className="mt-1 text-xs text-muted">{stats.countries.join(", ")}</p>
            )}
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-xs text-muted"><Monitor className="h-4 w-4" />Accounts connected</div>
            <div className="mt-1 text-3xl font-semibold">{stats.accounts_connected}</div>
          </Card>
        </div>
      )}

      {/* Device breakdown */}
      {stats?.devices && Object.keys(stats.devices).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.devices).map(([device, count]) => {
            const Icon = DEVICE_ICON[device] ?? Monitor;
            return (
              <Badge key={device} className="bg-accent/10 text-accent flex items-center gap-1.5 px-3 py-1.5">
                <Icon className="h-3.5 w-3.5" />
                {device}: {count as number}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Sessions table */}
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
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Device</th>
                <th className="p-3">Location</th>
                <th className="p-3">Logged in</th>
                <th className="p-3">Last active</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const DevIcon = DEVICE_ICON[s.device_type ?? ""] ?? Monitor;
                const location = [s.city, s.country].filter(Boolean).join(", ") || "Unknown";
                return (
                  <tr key={s.id} className="border-b border-border/60 hover:bg-black/5 dark:hover:bg-white/5">
                    <td className="p-3">
                      <div className="font-medium">{s.user_name || "—"}</div>
                      <div className="text-xs text-muted">{s.user_email}</div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <DevIcon className="h-4 w-4 text-muted" />
                        <span>{s.browser || s.device_type || "—"}</span>
                      </div>
                      <div className="text-xs text-muted">{s.os || ""}</div>
                    </td>
                    <td className="p-3 text-muted">{location}</td>
                    <td className="p-3 text-muted">
                      {s.logged_in_at ? timeAgo(s.logged_in_at) : "—"}
                    </td>
                    <td className="p-3 text-muted">
                      {s.last_active_at ? timeAgo(s.last_active_at) : "—"}
                    </td>
                    <td className="p-3">
                      <Badge className={s.is_active
                        ? "bg-green-500/15 text-green-600"
                        : "bg-gray-500/15 text-gray-500"}>
                        {s.is_active ? "Active" : "Ended"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        {s.is_active && (
                          <>
                            <Button variant="ghost" onClick={() => revoke(s.id)}
                              disabled={revoking === s.id}
                              title="Force-logout this session"
                              className="text-xs px-2 py-1 text-orange-600 hover:bg-orange-500/10">
                              <LogOut className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" onClick={() => revokeAll(s.user_id, s.user_email)}
                              title="Force-logout all sessions for this user"
                              className="text-xs px-2 py-1 text-red-500 hover:bg-red-500/10">
                              All
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
