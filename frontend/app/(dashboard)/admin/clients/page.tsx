"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Building2, Link2, Trash2, AlertTriangle, Loader2, RefreshCw, XCircle, Info, Newspaper } from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { Modal, Field, InfoDot, inputClass } from "@/components/ui/help";
import { SentimentBar } from "@/components/dashboard/SentimentBar";

const PLATFORMS = [
  { id: "instagram", label: "📸 Instagram" },
  { id: "facebook", label: "📘 Facebook" },
  { id: "twitter", label: "🐦 X (Twitter)" },
  { id: "youtube", label: "▶️ YouTube" },
  { id: "web", label: "🌐 Website / News" },
  { id: "gmb", label: "📍 Google Business" },
];

/** Extract a clean handle/username from a social profile URL. */
function parseHandle(input: string, platform: string): string {
  const s = input.trim();
  if (!s.startsWith("http")) return s;
  try {
    const url = new URL(s);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return s;
    let handle = parts[0];
    if (platform === "youtube" && handle.startsWith("@")) handle = handle.slice(1);
    return handle.replace(/\/$/, "");
  } catch {
    return s;
  }
}

const ACTIVE_STATUSES = new Set(["pending", "running", "queued", "starting", "fallback", "storing", "syncing"]);

type SyncState = {
  status: string;
  posts_done: number;
  total_posts: number;
  comments_done: number;
  error?: string | null;
};

function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = "Delete", danger = true }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; confirmLabel?: string; danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-2 shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-base">{title}</h3>
            <p className="text-sm text-muted mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/20 transition-colors">
            Cancel
          </button>
          <button onClick={() => { onConfirm(); onClose(); }}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-accent hover:bg-accent/90"
            }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientsAccountsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any[]>>({});
  const [summaries, setSummaries] = useState<Record<string, any>>({});
  const [pressCounts, setPressCounts] = useState<Record<string, number>>({});
  const [showClient, setShowClient] = useState(false);
  const [accountFor, setAccountFor] = useState<any>(null);
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const [resyncing, setResyncing] = useState<Record<string, boolean>>({});

  const [confirmProfile, setConfirmProfile] = useState<{ id: string; handle: string } | null>(null);
  const [confirmClient, setConfirmClient] = useState<{ id: string; name: string } | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientIndustry, setClientIndustry] = useState("");
  const [acc, setAcc] = useState({ platform: "instagram", handle: "", profile_url: "", is_competitor: false });

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  function loadSummary(profileId: string) {
    api.get(`/profiles/${profileId}/summary`).then((s) =>
      setSummaries((prev) => ({ ...prev, [profileId]: s.data }))).catch(() => {});
  }

  function load() {
    api.get("/clients").then((r) => {
      const clientList: any[] = r.data || [];
      setClients(clientList);
      clientList.forEach((c: any) => {
        api.get("/profiles", { params: { client_id: c.id } }).then((p) => {
          setProfiles((prev) => ({ ...prev, [c.id]: p.data || [] }));
          (p.data || []).forEach((pr: any) => {
            loadSummary(pr.id);
            const s = pr.meta?.sync_status || "";
            if (ACTIVE_STATUSES.has(s)) {
              setSyncStates((prev) => ({
                ...prev,
                [pr.id]: { status: s, posts_done: 0, total_posts: 0, comments_done: 0 },
              }));
            }
          });
        }).catch(() => {});
        // Load press sources count for each client
        api.get("/press-sources", { params: { client_id: c.id } }).then((p) => {
          setPressCounts((prev) => ({ ...prev, [c.id]: (p.data || []).length }));
        }).catch(() => {});
      });
    }).catch(() => {});
  }
  useEffect(load, []);


  // Unified polling: poll any profile that has an active sync state
  useEffect(() => {
    const activeIds = [
      // From profiles meta
      ...Object.values(profiles).flat()
        .filter((p: any) => ACTIVE_STATUSES.has(p.meta?.sync_status || ""))
        .map((p: any) => p.id),
      // From live syncStates (catches newly connected profiles before load() resolves)
      ...Object.entries(syncStates)
        .filter(([, s]) => ACTIVE_STATUSES.has(s.status))
        .map(([id]) => id),
    ];
    const unique = [...new Set(activeIds)];

    if (unique.length === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;

    pollRef.current = setInterval(async () => {
      const allProfiles = Object.values(profiles).flat();
      // Collect all IDs that still need polling
      const toCheck = [...new Set([
        ...allProfiles.filter((p: any) => ACTIVE_STATUSES.has(p.meta?.sync_status || "")).map((p: any) => p.id),
        ...Object.entries(syncStates).filter(([, s]) => ACTIVE_STATUSES.has(s.status)).map(([id]) => id),
      ])];

      let anyActive = false;
      for (const pid of toCheck) {
        try {
          const r = await api.get(`/profiles/${pid}/sync-status`);
          const d = r.data;
          const normalized: SyncState = {
            status: d.sync_status,
            posts_done: d.posts_done ?? 0,
            total_posts: d.total_posts ?? 0,
            comments_done: d.comments_done ?? 0,
            error: d.error,
          };
          setSyncStates((prev) => ({ ...prev, [pid]: normalized }));

          if (d.sync_status === "done" || d.sync_status === "error") {
            loadSummary(pid);
            // Refresh the profile meta in local state
            setProfiles((prev) => {
              const next = { ...prev };
              for (const cid in next) {
                next[cid] = next[cid].map((pr: any) =>
                  pr.id === pid ? { ...pr, meta: { ...pr.meta, sync_status: d.sync_status } } : pr
                );
              }
              return next;
            });
          } else {
            anyActive = true;
          }
        } catch {}
      }
      if (!anyActive) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }, 3000);

    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [profiles, syncStates]);

  async function addClient() {
    if (!clientName) return;
    await api.post("/clients", { name: clientName, industry: clientIndustry });
    setClientName(""); setClientIndustry(""); setShowClient(false); load();
  }

  async function addAccount() {
    const handle = parseHandle(acc.handle, acc.platform);
    let profile_url = acc.profile_url;
    if (!profile_url) {
      if (acc.platform === "instagram") profile_url = `https://www.instagram.com/${handle.replace(/^@/, "")}/`;
      else if (acc.platform === "facebook") profile_url = `https://www.facebook.com/${handle.replace(/^@/, "")}`;
      else if (acc.platform === "twitter") profile_url = `https://twitter.com/${handle.replace(/^@/, "")}`;
      else if (acc.platform === "youtube") profile_url = `https://www.youtube.com/@${handle.replace(/^@/, "")}`;
    }
    const resp = await api.post("/profiles", { ...acc, handle, profile_url, client_id: accountFor.id });
    const newProfile = resp.data;
    setAcc({ platform: "instagram", handle: "", profile_url: "", is_competitor: false });
    setAccountFor(null);
    load();
    // Immediately mark new profile as syncing for supported platforms
    if (newProfile && (newProfile.platform === "instagram" || newProfile.platform === "youtube")) {
      setSyncStates((prev) => ({
        ...prev,
        [newProfile.id]: { status: "pending", posts_done: 0, total_posts: 0, comments_done: 0 },
      }));
    }
  }

  async function resyncProfile(profileId: string) {
    setResyncing((prev) => ({ ...prev, [profileId]: true }));
    try {
      await api.post(`/profiles/${profileId}/resync`);
      setSyncStates((prev) => ({
        ...prev,
        [profileId]: { status: "pending", posts_done: 0, total_posts: 0, comments_done: 0 },
      }));
      // Update local profile meta so polling starts
      setProfiles((prev) => {
        const next = { ...prev };
        for (const cid in next) {
          next[cid] = next[cid].map((pr: any) =>
            pr.id === profileId ? { ...pr, meta: { ...pr.meta, sync_status: "pending" } } : pr
          );
        }
        return next;
      });
    } catch {
      // ignore — badge stays as error
    } finally {
      setResyncing((prev) => ({ ...prev, [profileId]: false }));
    }
  }

  async function delAccount(id: string) {
    try {
      await api.delete(`/profiles/${id}`);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to remove account. Please try again.");
      return;
    }
    setSyncStates((prev) => { const n = { ...prev }; delete n[id]; return n; });
    load();
  }

  async function delClient(id: string) {
    try {
      await api.delete(`/clients/${id}`);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to delete client. Please try again.");
      return;
    }
    load();
  }

  function SyncBadge({ profileId, meta }: { profileId: string; meta: any }) {
    const live = syncStates[profileId];
    const status = live?.status || meta?.sync_status || "none";
    const isActive = ACTIVE_STATUSES.has(status);
    const pct = live?.total_posts ? Math.round((live.posts_done / live.total_posts) * 100) : 0;

    if (status === "done" || status === "none") return null;

    if (status === "error") {
      const canRetry = meta?.platform === "instagram" || meta?.platform === "youtube";
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-red-500">
              <XCircle className="h-3 w-3" /> Sync failed
            </span>
            {canRetry && (
              <button
                onClick={() => resyncProfile(profileId)}
                disabled={resyncing[profileId]}
                className="flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors">
                <RefreshCw className={`h-3 w-3 ${resyncing[profileId] ? "animate-spin" : ""}`} />
                Retry sync
              </button>
            )}
          </div>
        </div>
      );
    }

    const stageLabel: Record<string, string> = {
      pending: "Queued…",
      queued: "Queued…",
      running: "Starting…",
      starting: "Starting…",
      fallback: "Building data…",
      storing: "Saving posts…",
      syncing: live?.total_posts
        ? `Syncing ${live.posts_done}/${live.total_posts} posts`
        : "Syncing…",
    };
    const label = stageLabel[status] || "Syncing…";

    return (
      <div className="space-y-1.5">
        <span className="flex items-center gap-1 text-xs text-blue-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          {label}
        </span>
        {/* Progress bar — visible once total_posts is known */}
        <div className="w-full h-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: pct > 0 ? `${pct}%` : "15%" }}
          />
        </div>
        {live?.comments_done > 0 && (
          <p className="text-xs text-muted">{live.comments_done.toLocaleString()} comments processed</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clients & Accounts</h1>
          <p className="text-sm text-muted">Add a client (brand), then connect their social accounts to start tracking.</p>
        </div>
        <Button onClick={() => setShowClient(true)}><Plus className="h-4 w-4" /> Add Client</Button>
      </div>

      {/* Notice when any account is showing estimated (AI-generated) data */}
      {Object.values(profiles).flat().some((p: any) => p.meta?.data_source === "estimated") && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <strong>Some accounts show AI-estimated data.</strong> When the platform blocks our server IP,
            the system automatically generates representative posts &amp; sentiment estimates (clearly tagged{" "}
            <em>Estimated</em> below) so your dashboard stays functional. Click <strong>Resync</strong> on
            any account to retry a live scrape, or use{" "}
            <Link href="/import" className="font-semibold underline hover:no-underline">Import Data</Link> to
            bring in real data from a spreadsheet.
          </div>
        </div>
      )}

      {clients.length === 0 && (
        <Card className="border-dashed text-center">
          <Building2 className="mx-auto mb-2 h-8 w-8 text-muted" />
          <p className="text-sm">No clients yet. Click <b>Add Client</b> to begin.</p>
        </Card>
      )}

      {clients.map((c) => (
        <Card key={c.id}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="h-5 w-5 text-accent shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold truncate">{c.name}</div>
                <div className="text-xs text-muted">{c.industry || "—"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {pressCounts[c.id] !== undefined && (
                <Link href="/admin/press-sources"
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    pressCounts[c.id] > 0
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100"
                      : "bg-gray-100 dark:bg-gray-800 text-muted"
                  }`}
                  title="Press sources linked to this client">
                  <Newspaper className="h-3 w-3" />
                  {pressCounts[c.id]} press {pressCounts[c.id] === 1 ? "source" : "sources"}
                </Link>
              )}
              <button
                onClick={() => setAccountFor(c)}
                className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/15 transition-colors">
                <Link2 className="h-3.5 w-3.5" /> Connect account
              </button>
              <button
                onClick={() => setConfirmClient({ id: c.id, name: c.name })}
                className="flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-800 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(profiles[c.id] || []).map((p) => {
              const live = syncStates[p.id];
              const status = live?.status || p.meta?.sync_status || "none";
              const isActive = ACTIVE_STATUSES.has(status);
              return (
                <div key={p.id} className={`rounded-xl border p-3 space-y-2 transition-colors ${
                  isActive ? "border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20" : "border-border bg-background"
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.handle || p.platform}</div>
                      <div className="text-xs capitalize text-muted mt-0.5">
                        {p.platform} · {summaries[p.id]?.posts ?? 0} Posts
                        {summaries[p.id]?.days_span
                          ? <span className="text-muted/70"> ({summaries[p.id].days_span}d)</span>
                          : null}
                      </div>
                      {/* Data-source label */}
                      {!isActive && p.meta?.data_source === "live" && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-green-500/15 text-green-600 px-1.5 py-0.5 text-[10px] font-semibold">
                          ● Live data
                        </span>
                      )}
                      {!isActive && p.meta?.data_source === "estimated" && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 px-1.5 py-0.5 text-[10px] font-semibold"
                          title="Platform blocked the server IP — these are AI-representative estimates.">
                          ● Estimated
                        </span>
                      )}
                    </div>
                    <Badge className={`shrink-0 ${p.is_competitor ? "bg-orange-500/15 text-orange-500" : "bg-green-500/15 text-green-600"}`}>
                      {p.is_competitor ? "Competitor" : "Own"}
                    </Badge>
                  </div>

                  <SyncBadge profileId={p.id} meta={p} />

                  {!isActive && (
                    <>
                      <div><SentimentBar counts={summaries[p.id]?.counts || {}} /></div>
                      {summaries[p.id]?.counts && (
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span className="text-green-600">▲ {summaries[p.id]?.counts?.Positive ?? 0}</span>
                          <span>• {summaries[p.id]?.counts?.Neutral ?? 0}</span>
                          <span className="text-red-500">▼ {summaries[p.id]?.counts?.Negative ?? 0}</span>
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => resyncProfile(p.id)}
                      disabled={isActive || resyncing[p.id]}
                      title="Pull the latest posts & comments again"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40">
                      <RefreshCw className={`h-3.5 w-3.5 ${(isActive || resyncing[p.id]) ? "animate-spin" : ""}`} />
                      {isActive ? "Syncing…" : "Resync"}
                    </button>
                    <button
                      onClick={() => setConfirmProfile({ id: p.id, handle: p.handle || p.platform })}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </div>
              );
            })}

            {(profiles[c.id] || []).length === 0 && (
              <button
                onClick={() => setAccountFor(c)}
                className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted hover:border-accent/50 hover:text-accent transition-colors">
                <Plus className="h-4 w-4" />
                Connect first account
              </button>
            )}
          </div>
        </Card>
      ))}

      {/* Add client modal */}
      <Modal open={showClient} onClose={() => setShowClient(false)} title="Add a Client (Brand)">
        <div className="space-y-3">
          <Field label="Client / brand name" required hint="The company or brand you want to track.">
            <input className={inputClass} value={clientName} onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. TechBrand Inc" />
          </Field>
          <Field label="Industry" hint="Optional — helps group reports.">
            <input className={inputClass} value={clientIndustry} onChange={(e) => setClientIndustry(e.target.value)}
              placeholder="e.g. Technology" />
          </Field>
          <Button className="w-full" onClick={addClient} disabled={!clientName}>Save Client</Button>
        </div>
      </Modal>

      {/* Connect account modal */}
      <Modal open={!!accountFor} onClose={() => setAccountFor(null)}
        title={`Connect account to ${accountFor?.name || ""}`}>
        <div className="space-y-3">
          <Field label="Platform" required>
            <select className={inputClass} value={acc.platform}
              onChange={(e) => setAcc({ ...acc, platform: e.target.value })}>
              {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Profile URL or handle" required
            hint={
              acc.platform === "instagram"
                ? "Paste the Instagram profile URL or just the handle @username"
                : "Paste the profile URL or enter the handle / page name."
            }>
            <input className={inputClass} value={acc.handle}
              onChange={(e) => setAcc({ ...acc, handle: e.target.value })}
              placeholder={
                acc.platform === "instagram" ? "https://www.instagram.com/username/ or @username"
                : acc.platform === "facebook" ? "https://www.facebook.com/pagename"
                : acc.platform === "twitter" ? "@twitterhandle"
                : acc.platform === "youtube" ? "https://www.youtube.com/@ChannelName"
                : "handle or URL"
              } />
          </Field>
          {acc.handle && acc.handle.startsWith("http") && (
            <p className="text-xs text-accent">
              Handle detected: <b>{parseHandle(acc.handle, acc.platform)}</b>
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={acc.is_competitor}
              onChange={(e) => setAcc({ ...acc, is_competitor: e.target.checked })} />
            This is a competitor&apos;s account
            <InfoDot text="Tick this to compare against rival brands. Leave unticked for your own pages." />
          </label>
          {acc.platform === "youtube" && (
            <p className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
              After connecting, the system pulls the last 90 days of videos and comments automatically (needs a YouTube API key in Sync Engine).
            </p>
          )}
          {acc.platform === "instagram" && (
            <p className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
              After connecting, the system will automatically pull posts &amp; comments. If Instagram rate-limits the server, AI-estimated data is used as a fallback (tagged <strong>Estimated</strong>) — hit <strong>Resync</strong> anytime to retry a live scrape.
            </p>
          )}
          <Button className="w-full" onClick={addAccount} disabled={!acc.handle}>Connect Account</Button>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirmProfile}
        onClose={() => setConfirmProfile(null)}
        onConfirm={() => confirmProfile && delAccount(confirmProfile.id)}
        title="Remove this account?"
        message={`Remove "${confirmProfile?.handle}" and permanently delete all its posts, comments, and analysis? This cannot be undone.`}
        confirmLabel="Yes, remove account"
      />

      <ConfirmModal
        open={!!confirmClient}
        onClose={() => setConfirmClient(null)}
        onConfirm={() => confirmClient && delClient(confirmClient.id)}
        title="Delete this client?"
        message={`Delete "${confirmClient?.name}" and all connected accounts, posts, and data? This is permanent and cannot be undone.`}
        confirmLabel="Yes, delete client"
      />
    </div>
  );
}
