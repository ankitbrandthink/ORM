"use client";
import { useEffect, useRef, useState } from "react";

/*
 * Bookmarklet receiver — opened as a popup by the Instagram bookmarklet.
 *
 * Handles two message types:
 *  ORM_IG_DATA          → profile sync (multiple posts + sampled comments)
 *  ORM_IG_POST_COMMENTS → post deep-sync (ALL comments for one specific post)
 */

const ALLOWED_ORIGINS = [
  "https://www.instagram.com", "https://instagram.com",
  "https://www.facebook.com", "https://web.facebook.com", "https://m.facebook.com",
];

type Line = { t: string; ok?: boolean; err?: boolean };

export default function BookmarkletReceiver() {
  const [lines, setLines] = useState<Line[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const busy = useRef(false);

  function log(t: string, kind?: "ok" | "err") {
    setLines((p) => [...p, { t, ok: kind === "ok", err: kind === "err" }]);
  }

  useEffect(() => {
    const tok = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    setToken(tok);
    if (!tok) {
      log("You are not logged into the ORM dashboard in this browser.", "err");
      log("Open the dashboard, log in, then click the bookmarklet again.", "err");
      return;
    }
    log("Ready — waiting for Instagram data from the bookmarklet…");

    const apiBase = `${window.location.protocol}//${window.location.host}/api/v1`;

    async function handle(ev: MessageEvent) {
      if (!ALLOWED_ORIGINS.includes(ev.origin)) return;
      const d = ev.data;
      if (!d || d.source !== "orm-bookmarklet") return;
      if (busy.current) return;
      busy.current = true;

      try {
        /* ── POST DEEP-SYNC: ALL comments for one specific post ── */
        if (d.type === "ORM_IG_POST_COMMENTS") {
          const shortcode = d.shortcode as string;
          const comments  = d.comments  as any[];
          const total     = d.total_count as number | undefined;
          log(`Post mode: ${comments.length.toLocaleString()} comments for shortcode=${shortcode}. Looking up post…`);

          // Find the post in ORM by its Instagram shortcode (external_id)
          const lr = await fetch(
            `${apiBase}/posts/by-external-id?external_id=${encodeURIComponent(shortcode)}&platform=instagram`,
            { headers: { Authorization: `Bearer ${tok}` } }
          );
          if (!lr.ok) {
            const e = await lr.json().catch(() => ({}));
            throw new Error(
              e.detail ||
              `Post shortcode "${shortcode}" is not in the ORM dashboard yet. ` +
              `Run the bookmarklet on the PROFILE page first to import the post, then re-run on this post page.`
            );
          }
          const postInfo = await lr.json();
          log(`Found post id=${postInfo.id}. Saving ${comments.length.toLocaleString()} real comments…`);

          const ir = await fetch(`${apiBase}/posts/${postInfo.id}/append-comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
            body: JSON.stringify({ comments, total_count: total ?? null }),
          });
          if (!ir.ok) {
            const e = await ir.json().catch(() => ({}));
            throw new Error(e.detail || `Save failed (HTTP ${ir.status}).`);
          }
          const res = await ir.json();
          log(`✓ Saved ${res.added.toLocaleString()} new comments (${res.total_stored.toLocaleString()} total in dashboard). You can close this tab.`, "ok");
          log(`Refresh the post page in the ORM dashboard to see all ${res.total_stored.toLocaleString()} comments with sentiment.`, "ok");

          try {
            (ev.source as Window)?.postMessage(
              { source: "orm-receiver", type: "ORM_DONE", ok: true,
                added: res.added, total_stored: res.total_stored },
              ev.origin
            );
          } catch {}
          return;
        }

        /* ── PROFILE SYNC: multiple posts + sampled comments ── */
        if (d.type === "ORM_IG_DATA") {
          const handle   = (d.handle || "").replace(/^@/, "");
          const platform = d.platform || "instagram";
          log(`Received ${d.posts?.length || 0} posts for @${handle}. Saving…`);

          const lr = await fetch(
            `${apiBase}/profiles/lookup?handle=${encodeURIComponent(handle)}&platform=${platform}`,
            { headers: { Authorization: `Bearer ${tok}` } }
          );
          if (!lr.ok) {
            const e = await lr.json().catch(() => ({}));
            throw new Error(e.detail || `Profile @${handle} is not connected in the dashboard.`);
          }
          const prof = await lr.json();

          const ir = await fetch(`${apiBase}/profiles/${prof.id}/ingest-scrape`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
            body: JSON.stringify({ posts: d.posts || [], replace: d.replace !== false }),
          });
          if (!ir.ok) {
            const e = await ir.json().catch(() => ({}));
            throw new Error(e.detail || `Save failed (HTTP ${ir.status}).`);
          }
          const res = await ir.json();
          log(`✓ Saved ${res.posts} real posts and ${res.comments} comments for @${handle}.`, "ok");
          log("This account now shows ● Live data in the dashboard. You can close this tab.", "ok");

          try {
            (ev.source as Window)?.postMessage(
              { source: "orm-receiver", type: "ORM_DONE", ok: true,
                posts: res.posts, comments: res.comments },
              ev.origin
            );
          } catch {}
          return;
        }

        log(`Unknown message type: ${d.type}`, "err");
      } catch (e: any) {
        log("✗ " + (e?.message || "Failed to save."), "err");
        try {
          (ev.source as Window)?.postMessage(
            { source: "orm-receiver", type: "ORM_DONE", ok: false, error: e?.message },
            ev.origin
          );
        } catch {}
      } finally {
        busy.current = false;
      }
    }

    window.addEventListener("message", handle);
    // Announce readiness to the opener so it can send the payload immediately.
    try { window.opener?.postMessage({ source: "orm-receiver", type: "ORM_READY" }, "*"); } catch {}
    return () => window.removeEventListener("message", handle);
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 560, margin: "40px auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>ORM — Instagram Sync</h1>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
        Receiving data from your logged-in Instagram tab. Keep this tab open until it says "Saved".
      </p>
      <div style={{
        background: "#0b1020", color: "#cde", borderRadius: 10, padding: 14,
        fontFamily: "ui-monospace, monospace", fontSize: 12.5, lineHeight: 1.7, minHeight: 120,
      }}>
        {lines.length === 0
          ? <div style={{ opacity: 0.6 }}>Starting…</div>
          : lines.map((l, i) => (
              <div key={i} style={{ color: l.ok ? "#7CFC9B" : l.err ? "#ff8b8b" : "#cde" }}>{l.t}</div>
            ))}
      </div>
      {!token && (
        <a href="/login" style={{ display: "inline-block", marginTop: 16, color: "#1877f2", fontWeight: 600 }}>
          Go to dashboard login →
        </a>
      )}
    </div>
  );
}
