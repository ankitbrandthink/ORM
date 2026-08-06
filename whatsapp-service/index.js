/**
 * ORM WhatsApp Notification Service — whatsapp-web.js edition
 *
 * Endpoints:
 *   GET  /health       - liveness probe
 *   GET  /status       - connection status + error
 *   GET  /qr           - QR code as base64 PNG data-URI
 *   POST /send         - send { to (E.164), message }
 *   POST /restart      - kill session, clean auth, reboot
 *   POST /disconnect   - graceful logout
 */

require("dotenv").config();

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode  = require("qrcode");
const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");

const PORT    = parseInt(process.env.WA_PORT || "3002", 10);
const SECRET  = process.env.WA_SECRET || "";
const AUTH_DIR = path.join(__dirname, ".wwebjs_auth");

const app = express();
app.use(cors());
app.use(express.json());

// ── State ─────────────────────────────────────────────────────────────────────
let waClient   = null;
let qrBase64   = null;
let connStatus = "initializing";   // initializing | qr_waiting | connected | disconnected | error
let lastError  = null;
let retryTimer = null;

// ── Auth guard ────────────────────────────────────────────────────────────────
function guard(req, res, next) {
  if (!SECRET) return next();
  if (req.headers["authorization"] === `Bearer ${SECRET}`) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, status: connStatus }));

app.get("/status", guard, (_req, res) =>
  res.json({
    status:       connStatus,
    connected:    connStatus === "connected",
    qr_available: !!qrBase64,
    error:        lastError,
  })
);

app.get("/qr", guard, (_req, res) => {
  if (!qrBase64)
    return res.json({ qr: null, status: connStatus, error: lastError });
  res.json({ qr: qrBase64, status: connStatus });
});

app.post("/send", guard, async (req, res) => {
  const { to, message } = req.body || {};
  if (!to || !message)
    return res.status(400).json({ error: "Fields required: to (E.164), message" });
  if (connStatus !== "connected" || !waClient)
    return res.status(503).json({ error: "WhatsApp not connected", status: connStatus });

  try {
    const digits = to.replace(/\D/g, "");
    const chatId = `${digits}@c.us`;

    const isRegistered = await waClient.isRegisteredUser(chatId);
    if (!isRegistered)
      return res.status(404).json({ error: `${to} is not registered on WhatsApp` });

    const result = await waClient.sendMessage(chatId, message);
    res.json({ success: true, msgId: result.id._serialized });
  } catch (err) {
    console.error("[ORM-WA] Send error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/disconnect", guard, async (_req, res) => {
  await killClient(true);
  connStatus = "disconnected";
  res.json({ ok: true });
});

app.post("/restart", guard, async (_req, res) => {
  console.log("[ORM-WA] Restart requested — cleaning session and rebooting…");
  res.json({ ok: true, message: "Restarting — watch /status for qr_waiting" });
  await killClient(true);
  cleanAuth();
  connStatus = "initializing";
  lastError  = null;
  qrBase64   = null;
  setTimeout(bootWhatsApp, 1000);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function killClient(logout = false) {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (waClient) {
    try {
      if (logout) await waClient.logout().catch(() => {});
      await waClient.destroy().catch(() => {});
    } catch (_) {}
    waClient = null;
  }
  qrBase64 = null;
}

function cleanAuth() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      console.log("[ORM-WA] Auth folder cleaned.");
    }
  } catch (e) {
    console.warn("[ORM-WA] Could not clean auth:", e.message);
  }
}

// ── WhatsApp bootstrap ────────────────────────────────────────────────────────
function cleanChromeLock() {
  // Chrome leaves a SingletonLock file when it crashes — remove it before booting.
  const lockFiles = ["SingletonLock", "SingletonCookie", "SingletonSocket"];
  const sessionDir = path.join(AUTH_DIR, "session");
  for (const f of lockFiles) {
    const p = path.join(sessionDir, f);
    try { if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`[ORM-WA] Removed stale lock: ${f}`); } }
    catch (_) {}
  }
}

async function bootWhatsApp() {
  console.log("[ORM-WA] Booting whatsapp-web.js…");
  cleanChromeLock();
  connStatus = "initializing";
  lastError  = null;

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    puppeteer: {
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    },
  });

  client.on("qr", async (qr) => {
    try {
      qrBase64   = await qrcode.toDataURL(qr);
      connStatus = "qr_waiting";
      console.log(`[ORM-WA] QR ready — scan at http://localhost:${PORT}/qr`);
    } catch (e) {
      console.error("[ORM-WA] QR generation failed:", e.message);
    }
  });

  client.on("loading_screen", (pct, msg) => {
    console.log(`[ORM-WA] Loading: ${pct}% — ${msg}`);
  });

  client.on("authenticated", () => {
    console.log("[ORM-WA] Authenticated — session saved.");
    qrBase64 = null;
  });

  client.on("auth_failure", (msg) => {
    console.error("[ORM-WA] Auth failure:", msg);
    connStatus = "error";
    lastError  = `Auth failure: ${msg}`;
    cleanAuth();
    scheduleRetry(30_000);
  });

  client.on("ready", () => {
    connStatus = "connected";
    lastError  = null;
    qrBase64   = null;
    console.log("[ORM-WA] ✓ WhatsApp CONNECTED");
  });

  client.on("disconnected", (reason) => {
    console.log("[ORM-WA] Disconnected:", reason);
    connStatus = "disconnected";
    waClient   = null;
    scheduleRetry(20_000);
  });

  waClient = client;

  try {
    await client.initialize();
  } catch (err) {
    console.error("[ORM-WA] Initialize error:", err.message);
    connStatus = "error";
    lastError  = err.message;
    waClient   = null;
    scheduleRetry(20_000);
  }
}

function scheduleRetry(ms) {
  if (retryTimer) return;
  console.log(`[ORM-WA] Will retry in ${ms / 1000}s…`);
  retryTimer = setTimeout(() => { retryTimer = null; bootWhatsApp(); }, ms);
}

// ── Start HTTP then WA ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[ORM-WA] HTTP on http://localhost:${PORT}`);
  bootWhatsApp();
});
