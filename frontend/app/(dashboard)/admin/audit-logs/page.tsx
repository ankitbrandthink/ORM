"use client";
// audit-logs
import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import {
  FileDown, RefreshCw, X, ChevronLeft, ChevronRight,
  ShieldAlert, Trash2, Download, LogIn, LogOut, User,
  Settings, AlertTriangle, Database, FileText, Upload,
  Radio, Ticket, Building2, Lock, Search, ArchiveRestore,
  CheckSquare, Square,
} from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  actor_email: string | null;
  actor_name: string | null;
  actor_id: string | null;
  ip: string | null;
  device: string | null;
  browser: string | null;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, any>;
  at: string | null;
}

/* ── Action metadata ─────────────────────────────────────────────────── */
const ACTION_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  "user.login":            { label: "Login",           color: "bg-blue-500/15 text-blue-400 border-blue-500/20",     icon: <LogIn className="h-3.5 w-3.5" /> },
  "user.logout":           { label: "Logout",          color: "bg-slate-500/15 text-slate-400 border-slate-500/20",  icon: <LogOut className="h-3.5 w-3.5" /> },
  "user.signup":           { label: "Sign Up",         color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", icon: <User className="h-3.5 w-3.5" /> },
  "user.forgot_password":  { label: "Forgot Password", color: "bg-amber-500/15 text-amber-400 border-amber-500/20",  icon: <Lock className="h-3.5 w-3.5" /> },
  "user.password_reset":   { label: "Password Reset",  color: "bg-purple-500/15 text-purple-400 border-purple-500/20", icon: <Lock className="h-3.5 w-3.5" /> },
  "user.register":         { label: "User Created",    color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",     icon: <User className="h-3.5 w-3.5" /> },
  "clients.create":        { label: "Client Created",  color: "bg-green-500/15 text-green-400 border-green-500/20",  icon: <Building2 className="h-3.5 w-3.5" /> },
  "clients.update":        { label: "Client Updated",  color: "bg-green-500/15 text-green-400 border-green-500/20",  icon: <Building2 className="h-3.5 w-3.5" /> },
  "clients.delete":        { label: "Client Deleted",  color: "bg-red-500/15 text-red-400 border-red-500/20",        icon: <Building2 className="h-3.5 w-3.5" /> },
  "profiles.create":       { label: "Profile Added",   color: "bg-sky-500/15 text-sky-400 border-sky-500/20",        icon: <Radio className="h-3.5 w-3.5" /> },
  "profiles.update":       { label: "Profile Updated", color: "bg-sky-500/15 text-sky-400 border-sky-500/20",        icon: <Radio className="h-3.5 w-3.5" /> },
  "profiles.delete":       { label: "Profile Removed", color: "bg-red-500/15 text-red-400 border-red-500/20",        icon: <Radio className="h-3.5 w-3.5" /> },
  "posts.create":          { label: "Post Added",      color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20", icon: <FileText className="h-3.5 w-3.5" /> },
  "posts.delete":          { label: "Post Deleted",    color: "bg-red-500/15 text-red-400 border-red-500/20",        icon: <FileText className="h-3.5 w-3.5" /> },
  "tickets.create":        { label: "Ticket Created",  color: "bg-orange-500/15 text-orange-400 border-orange-500/20", icon: <Ticket className="h-3.5 w-3.5" /> },
  "tickets.update":        { label: "Ticket Updated",  color: "bg-orange-500/15 text-orange-400 border-orange-500/20", icon: <Ticket className="h-3.5 w-3.5" /> },
  "users.create":          { label: "User Created",    color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",     icon: <User className="h-3.5 w-3.5" /> },
  "users.update":          { label: "User Updated",    color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",     icon: <User className="h-3.5 w-3.5" /> },
  "users.delete":          { label: "User Deleted",    color: "bg-red-500/15 text-red-400 border-red-500/20",        icon: <User className="h-3.5 w-3.5" /> },
  "admin.update":          { label: "Settings Changed",color: "bg-violet-500/15 text-violet-400 border-violet-500/20", icon: <Settings className="h-3.5 w-3.5" /> },
  "reports.create":        { label: "Report Generated",color: "bg-teal-500/15 text-teal-400 border-teal-500/20",    icon: <FileText className="h-3.5 w-3.5" /> },
  "import.action":         { label: "Data Import",     color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20", icon: <Upload className="h-3.5 w-3.5" /> },
  "press-sources.create":  { label: "Press Source Added", color: "bg-pink-500/15 text-pink-400 border-pink-500/20", icon: <FileText className="h-3.5 w-3.5" /> },
  "press-sources.delete":  { label: "Press Source Removed", color: "bg-red-500/15 text-red-400 border-red-500/20", icon: <FileText className="h-3.5 w-3.5" /> },
  "monitors.create":       { label: "Monitor Created", color: "bg-lime-500/15 text-lime-400 border-lime-500/20",     icon: <Radio className="h-3.5 w-3.5" /> },
  "monitors.delete":       { label: "Monitor Deleted", color: "bg-red-500/15 text-red-400 border-red-500/20",        icon: <Radio className="h-3.5 w-3.5" /> },
  "contacts.create":       { label: "Contact Added",   color: "bg-rose-500/15 text-rose-400 border-rose-500/20",    icon: <User className="h-3.5 w-3.5" /> },
  "contacts.delete":       { label: "Contact Removed", color: "bg-red-500/15 text-red-400 border-red-500/20",       icon: <User className="h-3.5 w-3.5" /> },
  "sync.action":           { label: "Sync Run",        color: "bg-teal-500/15 text-teal-400 border-teal-500/20",    icon: <RefreshCw className="h-3.5 w-3.5" /> },
  "social-sync.action":    { label: "Social Sync",     color: "bg-teal-500/15 text-teal-400 border-teal-500/20",    icon: <RefreshCw className="h-3.5 w-3.5" /> },
};

function getMeta(action: string) {
  if (ACTION_META[action]) return ACTION_META[action];
  const [resource, verb] = action.split(".");
  const isDelete = verb === "delete";
  const isCreate = verb === "create";
  return {
    label: action.replace(".", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    color: isDelete
      ? "bg-red-500/15 text-red-400 border-red-500/20"
      : isCreate
      ? "bg-green-500/15 text-green-400 border-green-500/20"
      : "bg-gray-500/15 text-gray-400 border-gray-500/20",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  };
}

function getDescription(item: AuditEntry): string {
  const detail = item.detail || {};
  if (detail.description) return detail.description;
  const who = item.actor_name || item.actor_email || "Someone";
  const meta = getMeta(item.action);
  return `${who} — ${meta.label}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (diff < 60000) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

function fullDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch { return iso; }
}

const ALL_ACTIONS = Object.keys(ACTION_META);

/* ─────────────────────────────────────────────────────────────────────── */

export default function AuditLogsPage() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const [filterAction, setFilterAction] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDate, setFilterDate] = useState({ from: "", to: "" });

  const [downloading, setDownloading] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const fetchLogs = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(pageNum * PAGE_SIZE),
      };
      if (filterAction) params.action = filterAction;
      if (filterDate.from) params.date_from = filterDate.from;
      if (filterDate.to) params.date_to = filterDate.to;
      const res = await api.get("/admin/audit-logs", { params });
      const raw = (res.data.items || []) as AuditEntry[];
      // Client-side search filter
      const search = filterSearch.trim().toLowerCase();
      const filtered = search
        ? raw.filter((i) =>
            (i.actor_email || "").toLowerCase().includes(search) ||
            (i.actor_name || "").toLowerCase().includes(search) ||
            (i.ip || "").includes(search) ||
            (i.action || "").toLowerCase().includes(search) ||
            ((i.detail?.description || "")).toLowerCase().includes(search)
          )
        : raw;
      setItems(filtered);
      setTotal(res.data.total || 0);
      setSelected(new Set());
    } catch (err) {
      console.error("Failed to load audit logs", err);
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterDate, filterSearch]);

  useEffect(() => { fetchLogs(page); }, [fetchLogs, page]);

  function applyFilters() { setPage(0); fetchLogs(0); }
  function clearFilters() {
    setFilterAction(""); setFilterDate({ from: "", to: "" }); setFilterSearch(""); setPage(0);
  }

  /* ── Selection helpers ──────────────────────────────────────────────── */
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /* ── Delete selected ────────────────────────────────────────────────── */
  async function deleteSelected() {
    if (!selected.size) return;
    setDeleting(true);
    try {
      await api.delete("/admin/audit-logs", { data: { ids: Array.from(selected) } });
      setSelected(new Set());
      setDeleteConfirm(false);
      fetchLogs(page);
    } catch (err) {
      console.error("Delete failed", err);
    } finally {
      setDeleting(false);
    }
  }

  /* ── CSV export ─────────────────────────────────────────────────────── */
  async function downloadCsv() {
    setDownloading(true);
    try {
      const params: Record<string, string> = {};
      if (filterAction) params.action = filterAction;
      if (filterDate.from) params.date_from = filterDate.from;
      if (filterDate.to) params.date_to = filterDate.to;
      const res = await api.get("/admin/audit-logs/download", { params, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a"); a.href = url;
      a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { console.error("CSV download failed"); }
    finally { setDownloading(false); }
  }

  /* ── Backup download ────────────────────────────────────────────────── */
  async function downloadBackup() {
    setBackingUp(true);
    try {
      const res = await api.get("/admin/backup/download", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/zip" }));
      const a = document.createElement("a"); a.href = url;
      a.download = `orm_backup_${new Date().toISOString().slice(0, 10)}.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch { console.error("Backup download failed"); }
    finally { setBackingUp(false); }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!(filterAction || filterDate.from || filterDate.to || filterSearch);

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-blue-400" />
            <h1 className="text-lg font-semibold">Activity Logs</h1>
            <span className="text-xs text-muted bg-black/10 dark:bg-white/5 rounded-full px-2 py-0.5">
              {total.toLocaleString()} records
            </span>
            {someSelected && (
              <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5">
                {selected.size} selected
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-1">Every user action logged — sign-ins, data changes, settings, reports</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {someSelected && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selected.size}
            </button>
          )}
          <button onClick={() => fetchLogs(page)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-fg transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={downloadCsv} disabled={downloading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-50 transition-colors">
            {downloading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            Export CSV
          </button>
          <button onClick={downloadBackup} disabled={backingUp}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60 transition-colors">
            {backingUp ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {backingUp ? "Packing…" : "Backup System"}
          </button>
        </div>
      </div>

      {/* ── Delete confirm modal ─────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <div className="font-semibold">Delete {selected.size} log{selected.size > 1 ? "s" : ""}?</div>
                <div className="text-xs text-muted">This cannot be undone.</div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDeleteConfirm(false)}
                className="flex-1 rounded-xl border border-border py-2 text-sm text-muted hover:text-fg transition-colors">
                Cancel
              </button>
              <button onClick={deleteSelected} disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                {deleting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs text-muted">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
            <input
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder="User, IP, action…"
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-transparent text-fg placeholder:text-muted focus:outline-none focus:border-blue-500 w-full"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Action type</label>
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-border bg-card text-fg focus:outline-none focus:border-blue-500">
            <option value="">All actions</option>
            {Object.entries(ACTION_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">From</label>
          <input type="date" value={filterDate.from}
            onChange={(e) => setFilterDate((p) => ({ ...p, from: e.target.value }))}
            className="px-3 py-1.5 text-sm rounded-lg border border-border bg-card text-fg focus:outline-none focus:border-blue-500" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">To</label>
          <input type="date" value={filterDate.to}
            onChange={(e) => setFilterDate((p) => ({ ...p, to: e.target.value }))}
            className="px-3 py-1.5 text-sm rounded-lg border border-border bg-card text-fg focus:outline-none focus:border-blue-500" />
        </div>

        <button onClick={applyFilters}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
          Apply
        </button>
        {hasFilters && (
          <button onClick={clearFilters}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-fg transition-colors">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* ── Activity Feed ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-black/5 dark:bg-white/[0.02]">
          <button onClick={toggleAll} className="text-muted hover:text-fg transition-colors shrink-0">
            {allSelected
              ? <CheckSquare className="h-4 w-4 text-blue-400" />
              : someSelected
                ? <Square className="h-4 w-4 text-blue-400/60" />
                : <Square className="h-4 w-4" />}
          </button>
          <span className="text-xs font-medium text-muted">Event</span>
          <span className="ml-auto text-xs text-muted hidden sm:block">Time</span>
        </div>

        {/* Rows */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-muted">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading activity…
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted gap-2">
            <ArchiveRestore className="h-8 w-8 opacity-30" />
            <span className="text-sm">No activity logs found</span>
          </div>
        )}

        {!loading && items.map((item) => {
          const meta = getMeta(item.action);
          const desc = getDescription(item);
          const isExpanded = expanded === item.id;
          const isSelected = selected.has(item.id);
          const detail = item.detail || {};

          return (
              <div
                key={item.id}
                className={`flex items-start gap-3 px-4 py-3 border-b border-border/40 transition-colors
                  ${isSelected ? "bg-blue-500/5" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.02]"}`}
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleOne(item.id); }}
                  className="mt-0.5 text-muted hover:text-blue-400 transition-colors shrink-0"
                >
                  {isSelected
                    ? <CheckSquare className="h-4 w-4 text-blue-400" />
                    : <Square className="h-4 w-4" />}
                </button>

                {/* Action badge icon */}
                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${meta.color}`}>
                  {meta.icon}
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : item.id)}>
                  {/* Description */}
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="text-sm font-medium leading-snug">{desc}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>

                  {/* Sub-line */}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {item.actor_email && (
                      <span className="text-xs text-muted">{item.actor_email}</span>
                    )}
                    {(item.device || detail.device) && (
                      <span className="text-xs text-muted">
                        · {item.device || detail.device}
                      </span>
                    )}
                    {item.ip && (
                      <span className="text-xs font-mono text-muted">· {item.ip}</span>
                    )}
                    {detail.path && (
                      <span className="text-[11px] font-mono text-muted/60 hidden lg:block">
                        · {detail.method} {detail.path}
                      </span>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-3 rounded-xl border border-border bg-black/20 dark:bg-white/[0.02] p-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3 text-xs">
                        {[
                          ["Action", item.action],
                          ["User", item.actor_email || "—"],
                          ["IP Address", item.ip || "—"],
                          ["Device", item.device || detail.device || "—"],
                          ["Browser", item.browser || detail.browser || "—"],
                          ["Status", detail.status || "—"],
                          ["Target Type", item.target_type || "—"],
                          ["Target ID", item.target_id ? item.target_id.slice(0, 16) + "…" : "—"],
                          ["Timestamp", fullDate(item.at)],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <div className="text-muted mb-0.5">{k}</div>
                            <div className="font-medium text-fg break-all">{v}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-[11px] text-muted mb-1">Raw detail</div>
                      <pre className="text-[11px] text-slate-400 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-2">
                        {JSON.stringify(detail, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <div className="text-right shrink-0 ml-2">
                  <div className="text-xs text-muted whitespace-nowrap">{relativeTime(item.at)}</div>
                  <div className="text-[10px] text-muted/50 whitespace-nowrap hidden sm:block">
                    {fullDate(item.at).split(",")[0]}
                  </div>
                </div>
              </div>
          );
        })}
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span className="text-xs">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()} events
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:text-fg disabled:opacity-40 transition-colors">
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="text-xs px-1">Page {page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:text-fg disabled:opacity-40 transition-colors">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Backup info panel ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Database className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium">System Backup</span>
        </div>
        <p className="text-xs text-muted mb-3">
          The backup ZIP includes: <strong>full SQLite database</strong>, <strong>audit logs CSV</strong>, and <strong>system metadata</strong>.
          Download it regularly to safeguard your data.
        </p>
        <div className="flex gap-2">
          <button onClick={downloadBackup} disabled={backingUp}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60 transition-colors">
            {backingUp ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {backingUp ? "Creating backup…" : "Download Full Backup (.zip)"}
          </button>
          <button onClick={downloadCsv} disabled={downloading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-fg disabled:opacity-50 transition-colors">
            <FileDown className="h-4 w-4" />
            Export Logs CSV
          </button>
        </div>
      </div>

    </div>
  );
}
