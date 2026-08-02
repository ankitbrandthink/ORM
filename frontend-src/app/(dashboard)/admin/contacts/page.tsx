"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Star, StarOff, Phone, Mail, MessageSquare, User } from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  whatsapp: string | null;
  role: string | null;
  company: string | null;
  is_primary: boolean;
  receive_whatsapp: boolean;
  receive_email: boolean;
  notes: string | null;
}

const empty: Omit<Contact, "id"> = {
  name: "", email: "", mobile: "", whatsapp: "", role: "", company: "",
  is_primary: false, receive_whatsapp: true, receive_email: false, notes: "",
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editing, setEditing]   = useState<Contact | null>(null);
  const [form, setForm]         = useState<Omit<Contact, "id">>(empty);
  const [open, setOpen]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  function load() {
    api.get("/contacts").then((r) => setContacts(r.data)).catch(() => {});
  }
  useEffect(load, []);

  function openNew() {
    setEditing(null);
    setForm(empty);
    setError("");
    setOpen(true);
  }

  function openEdit(c: Contact) {
    setEditing(c);
    setForm({ name: c.name, email: c.email ?? "", mobile: c.mobile ?? "",
      whatsapp: c.whatsapp ?? "", role: c.role ?? "", company: c.company ?? "",
      is_primary: c.is_primary, receive_whatsapp: c.receive_whatsapp,
      receive_email: c.receive_email, notes: c.notes ?? "" });
    setError("");
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/contacts/${editing.id}`, form);
      } else {
        await api.post("/contacts", form);
      }
      setOpen(false);
      load();
    } catch { setError("Failed to save. Please try again."); }
    finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm("Delete this contact?")) return;
    await api.delete(`/contacts/${id}`);
    load();
  }

  async function makePrimary(id: string) {
    await api.post(`/contacts/${id}/set-primary`);
    load();
  }

  const f = (field: keyof Omit<Contact, "id">, value: any) =>
    setForm((p) => ({ ...p, [field]: value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Alert Contacts</h1>
          <p className="text-sm text-muted">People who receive WhatsApp and email alerts when issues are detected.</p>
        </div>
        <button onClick={openNew}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          <Plus className="h-4 w-4" /> Add Contact
        </button>
      </div>

      {contacts.length === 0 ? (
        <Card className="py-12 text-center">
          <User className="mx-auto mb-3 h-10 w-10 text-muted/40" />
          <p className="text-sm text-muted">No contacts yet. Add the first one to receive alerts.</p>
          <button onClick={openNew}
            className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">
            <Plus className="h-4 w-4" /> Add Contact
          </button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {contacts.map((c) => (
            <Card key={c.id} className={`relative ${c.is_primary ? "ring-1 ring-accent/40" : ""}`}>
              {c.is_primary && (
                <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  <Star className="h-3 w-3" /> Primary
                </span>
              )}
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent font-semibold text-sm">
                  {c.name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.name}</div>
                  {(c.role || c.company) && (
                    <div className="text-xs text-muted">{[c.role, c.company].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {c.whatsapp && (
                  <div className="flex items-center gap-2 text-xs">
                    <MessageSquare className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <span className="text-muted">{c.whatsapp}</span>
                    {c.receive_whatsapp && <span className="rounded bg-green-100 px-1 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-400">alerts on</span>}
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-2 text-xs">
                    <Mail className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span className="truncate text-muted">{c.email}</span>
                    {c.receive_email && <span className="rounded bg-blue-100 px-1 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">alerts on</span>}
                  </div>
                )}
                {c.mobile && !c.whatsapp && (
                  <div className="flex items-center gap-2 text-xs">
                    <Phone className="h-3.5 w-3.5 text-muted shrink-0" />
                    <span className="text-muted">{c.mobile}</span>
                  </div>
                )}
              </div>
              {c.notes && <p className="mt-2 text-xs text-muted italic line-clamp-2">{c.notes}</p>}
              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                <button onClick={() => openEdit(c)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-muted/10">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                {!c.is_primary && (
                  <button onClick={() => makePrimary(c.id)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-muted/10">
                    <Star className="h-3.5 w-3.5" /> Set Primary
                  </button>
                )}
                <button onClick={() => del(c.id)}
                  className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">{editing ? "Edit Contact" : "New Contact"}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted">Full Name *</label>
                  <input value={form.name} onChange={(e) => f("name", e.target.value)}
                    placeholder="Ankit Rohilla"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Role</label>
                  <input value={form.role ?? ""} onChange={(e) => f("role", e.target.value)}
                    placeholder="Brand Manager"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Company</label>
                <input value={form.company ?? ""} onChange={(e) => f("company", e.target.value)}
                  placeholder="The Brandthink"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted">WhatsApp Number</label>
                  <input value={form.whatsapp ?? ""} onChange={(e) => f("whatsapp", e.target.value)}
                    placeholder="+918539076183"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                  <p className="mt-0.5 text-[10px] text-muted">Include country code e.g. +91…</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Mobile Number</label>
                  <input value={form.mobile ?? ""} onChange={(e) => f("mobile", e.target.value)}
                    placeholder="+918539076183"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Email Address</label>
                <input type="email" value={form.email ?? ""} onChange={(e) => f("email", e.target.value)}
                  placeholder="ankit@thebrandthink.com"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Notes</label>
                <textarea value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)}
                  rows={2} placeholder="Any notes about this contact…"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none" />
              </div>
              <div className="flex flex-wrap gap-4 rounded-xl border border-border p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.receive_whatsapp}
                    onChange={(e) => f("receive_whatsapp", e.target.checked)}
                    className="rounded" />
                  Send WhatsApp alerts
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.receive_email}
                    onChange={(e) => f("receive_email", e.target.checked)}
                    className="rounded" />
                  Send email alerts
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_primary}
                    onChange={(e) => f("is_primary", e.target.checked)}
                    className="rounded" />
                  Primary contact
                </label>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2 text-sm text-muted hover:bg-muted/10">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
