"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { isAuthenticated } from "@/lib/auth";
import { api } from "@/lib/api";
import { ConnectSocialProvider } from "@/components/social/ConnectSocial";

async function verifySession(): Promise<boolean> {
  try {
    await api.get("/auth/me");
    return true;
  } catch {
    return false;
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    // Verify the session is still active on the server (catches revoked sessions)
    verifySession().then((ok) => {
      if (!ok) {
        router.replace("/login");
      } else {
        setReady(true);
      }
    });
  }, [router]);

  useEffect(() => {
    // Re-check every time the tab becomes visible (handles logout-in-other-tab)
    const onVisible = () => {
      if (document.visibilityState === "visible" && isAuthenticated()) {
        verifySession().then((ok) => {
          if (!ok) router.replace("/login");
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  // Block render until auth verified — prevents dashboard flash in incognito / logged-out state
  if (!ready) return null;

  return (
    <ConnectSocialProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </ConnectSocialProvider>
  );
}
