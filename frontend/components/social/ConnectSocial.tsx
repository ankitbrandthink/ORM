"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Facebook, Instagram, Twitter, Youtube, ExternalLink, CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/help";
import { Button } from "@/components/ui/primitives";

const PLATFORM_META: Record<string, { label: string; icon: any; color: string }> = {
  facebook: { label: "Facebook", icon: Facebook, color: "#1877f2" },
  instagram: { label: "Instagram", icon: Instagram, color: "#E1306C" },
  twitter: { label: "X (Twitter)", icon: Twitter, color: "#000000" },
  youtube: { label: "YouTube", icon: Youtube, color: "#FF0000" },
};

const LOGIN_URLS: Record<string, string> = {
  facebook: "https://www.facebook.com/login.php",
  instagram: "https://www.instagram.com/accounts/login/",
  twitter: "https://twitter.com/login",
  youtube: "https://accounts.google.com/ServiceLogin?service=youtube",
};

type Ctx = {
  /** Ensure a platform session is connected. Resolves true if connected (now or already), false if cancelled. */
  ensureConnected: (platform: string) => Promise<boolean>;
  isConnected: (platform: string) => boolean;
  refresh: () => void;
};

const ConnectCtx = createContext<Ctx | null>(null);

export function useConnectSocial() {
  const ctx = useContext(ConnectCtx);
  if (!ctx) throw new Error("useConnectSocial must be used within <ConnectSocialProvider>");
  return ctx;
}

export function ConnectSocialProvider({ children }: { children: React.ReactNode }) {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState("facebook");
  const [opened, setOpened] = useState(false);   // user clicked "open login"
  const [busy, setBusy] = useState(false);
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null);

  const refresh = useCallback(() => {
    api.get("/connections").then((r) => {
      const m: Record<string, boolean> = {};
      (r.data.platforms || []).forEach((p: any) => { m[p.platform] = p.connected; });
      setStatuses(m);
    }).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const isConnected = useCallback((p: string) => !!statuses[p], [statuses]);

  const ensureConnected = useCallback((p: string) => {
    return new Promise<boolean>((resolve) => {
      if (statuses[p]) { resolve(true); return; }
      setPlatform(p);
      setOpened(false);
      setOpen(true);
      setResolver(() => resolve);
    });
  }, [statuses]);

  function openLogin() {
    window.open(LOGIN_URLS[platform] || LOGIN_URLS.facebook, "social_login",
      "width=520,height=640,noopener,noreferrer");
    setOpened(true);
  }

  async function confirmLoggedIn() {
    setBusy(true);
    try {
      await api.post(`/connections/${platform}/connect`);
      setStatuses((prev) => ({ ...prev, [platform]: true }));
      setOpen(false);
      resolver?.(true);
      setResolver(null);
    } finally { setBusy(false); }
  }

  function cancel() {
    setOpen(false);
    resolver?.(false);
    setResolver(null);
  }

  const meta = PLATFORM_META[platform] || PLATFORM_META.facebook;
  const Icon = meta.icon;

  return (
    <ConnectCtx.Provider value={{ ensureConnected, isConnected, refresh }}>
      {children}
      <Modal open={open} onClose={cancel} title={`Connect ${meta.label}`}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ background: `${meta.color}1a` }}>
              <Icon className="h-6 w-6" style={{ color: meta.color }} />
            </span>
            <p className="text-sm text-muted">
              To read real comments and totals from {meta.label} posts, sign in to your {meta.label} account.
              The login opens on {meta.label}'s own site — your password is never entered into this dashboard.
            </p>
          </div>

          <ol className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${opened ? "bg-green-500 text-white" : "bg-accent text-white"}`}>1</span>
              <div className="flex-1">
                <button onClick={openLogin}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                  style={{ background: meta.color }}>
                  Open {meta.label} login <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <p className="mt-1 text-xs text-muted">A popup opens — log in there, then come back here.</p>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${opened ? "bg-accent text-white" : "bg-border text-muted"}`}>2</span>
              <div className="flex-1">
                <Button onClick={confirmLoggedIn} disabled={!opened || busy} className="w-full">
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
                        : <><CheckCircle2 className="h-4 w-4" /> I've logged in — continue</>}
                </Button>
              </div>
            </li>
          </ol>

          <button onClick={cancel} className="w-full text-center text-xs text-muted hover:text-fg">
            Cancel
          </button>
        </div>
      </Modal>
    </ConnectCtx.Provider>
  );
}

/** Inspect an axios error; if it's a 428 social-login gate, return the platform. */
export function loginGatePlatform(err: any): string | null {
  const d = err?.response?.data?.detail;
  if (err?.response?.status === 428 && d?.error === "social_login_required") {
    return d.platform || "facebook";
  }
  return null;
}
