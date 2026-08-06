"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, Mail, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { Modal, Field, InfoDot, inputClass } from "@/components/ui/help";

const ROLES = [
  { id: "SuperAdmin", label: "Super Admin — full control" },
  { id: "CROManager", label: "Manager — manage team & clients" },
  { id: "Analyst", label: "Analyst — analyse & reply" },
  { id: "Client", label: "Client — view their brand only" },
  { id: "Viewer", label: "Viewer — read only" },
];

const blank = { id: "", email: "", full_name: "", role: "Viewer", is_active: true, password: "" };

export default function SettingsUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState<string>(""); // userId that just got a reset link
  const [resetSending, setResetSending] = useState<string>(""); // userId currently sending

  function load() {
    api.get("/users").then((r) => setUsers(r.data || [])).catch(() => {});
    api.get("/admin/feature-flags").then((r) => setFlags(r.data || [])).catch(() => {});
  }
  useEffect(load, []);

  function openNew() { setIsNew(true); setEditing({ ...blank }); setError(""); setShowPassword(false); }
  function openEdit(u: any) {
    setIsNew(false);
    setEditing({ id: u.id, email: u.email, full_name: u.full_name || "",
      role: u.roles?.[0] || "Viewer", is_active: u.is_active, password: "" });
    setError("");
    setShowPassword(false);
    setResetSent("");
  }

  async function save() {
    setError("");
    try {
      if (isNew) {
        if (!editing.email || !editing.password) { setError("Email and password are required."); return; }
        await api.post("/users", { email: editing.email, full_name: editing.full_name,
          password: editing.password, roles: [editing.role] });
      } else {
        const body: any = { email: editing.email, full_name: editing.full_name,
          is_active: editing.is_active, roles: [editing.role] };
        if (editing.password) body.password = editing.password;
        await api.put(`/users/${editing.id}`, body);
      }
      setEditing(null); load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not save. Please check the details.");
    }
  }

  async function sendResetLink(userId: string) {
    setResetSending(userId);
    setResetSent("");
    try {
      await api.post(`/auth/send-reset-link/${userId}`);
      setResetSent(userId);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not send reset link.");
    } finally {
      setResetSending("");
    }
  }

  async function toggleActive(u: any) {
    await api.put(`/users/${u.id}`, { is_active: !u.is_active }).catch(() => {});
    load();
  }

  async function remove(u: any) {
    if (!confirm(`Delete ${u.email}? This cannot be undone.`)) return;
    try { await api.delete(`/users/${u.id}`); load(); }
    catch (e: any) { alert(e?.response?.data?.detail || "Could not delete this user."); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Settings · Team & Access</h1>
          <p className="text-sm text-muted">Add people, change their role, turn access on/off, or remove them.</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4" /> Add User</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-muted">
            <tr>
              <th className="p-3">Email</th><th className="p-3">Name</th>
              <th className="p-3">Role</th><th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border/60 hover:bg-black/5 dark:hover:bg-white/5">
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.full_name || "—"}</td>
                <td className="p-3">
                  {(u.roles || []).map((r: string) => (
                    <Badge key={r} className="mr-1 bg-accent/10 text-accent">{r}</Badge>
                  ))}
                </td>
                <td className="p-3">
                  <button onClick={() => toggleActive(u)} title="Click to turn on/off"
                    className={`text-sm font-medium hover:underline ${u.is_active ? "text-green-600" : "text-gray-400"}`}>
                    {u.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => openEdit(u)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" onClick={() => remove(u)} title="Delete"
                      className="text-red-500 hover:bg-red-500/10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted">No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted">Feature Flags</h2>
        <div className="flex flex-wrap gap-2">
          {flags.map((f) => (
            <Badge key={f.id} className={f.enabled ? "bg-green-500/15 text-green-600" : "bg-gray-500/15 text-gray-500"}>
              {f.key}: {f.enabled ? "on" : "off"}
            </Badge>
          ))}
        </div>
      </div>

      {/* Add / Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)}
        title={isNew ? "Add User" : "Edit User"}>
        {editing && (
          <div className="space-y-3">
            <Field label="Email" required hint="Used to log in.">
              <input className={inputClass} value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                placeholder="name@company.com" />
            </Field>
            <Field label="Full name">
              <input className={inputClass} value={editing.full_name}
                onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                placeholder="e.g. Priya Sharma" />
            </Field>
            <Field label="Role" hint="Controls what this person can see and do.">
              <select className={inputClass} value={editing.role}
                onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Field>
            {!isNew && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.is_active}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
                Account is active
                <InfoDot text="Turn off to block login without deleting the account." />
              </label>
            )}
            <Field label={isNew ? "Password" : "New password (optional)"}
              required={isNew} hint={isNew ? "Set a starting password." : "Leave blank to keep the current one."}>
              <div className="relative">
                <input className={inputClass + " pr-10"} type={showPassword ? "text" : "password"}
                  value={editing.password}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            {/* Send reset link — only for existing users */}
            {!isNew && (
              <div className="rounded-lg border border-border bg-card/50 p-3 space-y-1.5">
                <p className="text-xs font-medium text-muted">Password reset link</p>
                <p className="text-xs text-muted">
                  Send a one-click reset link to <span className="font-medium text-foreground">{editing.email}</span>. The link expires in 1 hour.
                </p>
                {resetSent === editing.id ? (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Reset link sent to {editing.email}
                  </div>
                ) : (
                  <Button variant="ghost"
                    onClick={() => sendResetLink(editing.id)}
                    disabled={resetSending === editing.id}
                    className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-500/10">
                    <Mail className="h-3.5 w-3.5 mr-1" />
                    {resetSending === editing.id ? "Sending…" : "Send reset link"}
                  </Button>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button className="w-full" onClick={save}>{isNew ? "Create User" : "Save Changes"}</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
