/**
 * Silent-failure monitor (2026-11).
 *
 * Catches the kind of breakage found in the 19 Nov sweep (pages crashing,
 * admin screens timing out) the same day instead of weeks later:
 *
 *   1. Every API response with status >= 500 is counted per route.
 *   2. Every real page crash reported by browsers (/api/log/client-error)
 *      is counted per page + message.
 *   3. Every 30 min the server probes its own key endpoints and slow
 *      database views.
 *
 * Counts live in app_failures (one row per hour × kind × key × status).
 * The 07:00 admin digest lists the last 24 h. A spike (>= 20 server
 * errors on one route in an hour) or a probe failing twice in a row sends
 * one urgent email straight away (max once per problem per 6 h).
 *
 * Turn off: FAILURE_MONITOR=off. Alerts go to ADMIN_DIGEST_TO.
 */
import type { Request, Response, NextFunction } from "express";
import { pool } from "../db";

export type FailureKind = "server" | "client" | "probe";

const BASE = (process.env.APP_URL || "https://workabroadhub.tech").replace(/\/$/, "");
const FROM = "WorkAbroad Hub <support@workabroadhub.tech>";
export const SPIKE_THRESHOLD = 20;          // server errors on one route within one hour
export const PROBE_FAILS_BEFORE_ALERT = 2;  // consecutive probe failures
const ALERT_COOLDOWN_MS = 6 * 3600_000;

const enabled = () => String(process.env.FAILURE_MONITOR || "on").toLowerCase() !== "off";

// ── PURE helpers (unit-tested) ─────────────────────────────────────────────
/** /api/users/3f2a…-…/orders/42?x=1 → /api/users/:id/orders/:id */
export function normalizeRoute(path: string): string {
  const p = String(path || "").split("?")[0].split("#")[0];
  return p
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":id";
      if (/^\d+$/.test(seg)) return ":id";
      if (/^WAH-[A-Za-z0-9_-]{6,}$/.test(seg)) return ":id";
      if (seg.length >= 20 && /^[A-Za-z0-9_-]+$/.test(seg) && /\d/.test(seg)) return ":token";
      return seg;
    })
    .join("/")
    .slice(0, 160);
}

/** Browser errors that are not our bugs (network blips, deploy reloads, extensions). */
export function isClientNoise(message: string, stack = ""): boolean {
  const m = String(message || "").toLowerCase();
  if (!m || m === "unknown") return true;
  if (/(chrome|moz|safari)-extension:\/\//i.test(stack)) return true;
  return [
    "failed to fetch", "load failed", "networkerror", "network error", "network request failed",
    "failed to fetch dynamically imported module", "importing a module script failed",
    "error loading dynamically imported module", "loading chunk", "loading css chunk",
    "resizeobserver", "script error", "aborterror", "the operation was aborted", "cancelled",
    "rtdb credential check",
  ].some((n) => m.includes(n));
}

/** Key for a client crash: page path + first part of the message. */
export function clientKey(url: string, message: string): string {
  let path = "unknown";
  try { path = normalizeRoute(new URL(url).pathname); } catch { path = normalizeRoute(String(url || "unknown")); }
  return `${path} — ${String(message || "").replace(/\s+/g, " ").slice(0, 120)}`;
}

/** Routes that crossed the spike threshold in the current hour. */
export function findSpikes(counts: Map<string, number>, threshold = SPIKE_THRESHOLD): string[] {
  return [...counts.entries()].filter(([, n]) => n >= threshold).map(([k]) => k);
}

// ── Recording (buffered, flushed every 60 s) ───────────────────────────────
type Buf = { kind: FailureKind; key: string; status: number; count: number; sample: string };
const buffer = new Map<string, Buf>();
const hourCounts = new Map<string, number>(); // server key → count in current hour
let hourStamp = new Date().getUTCHours();

export function recordFailure(kind: FailureKind, key: string, status: number, sample = ""): void {
  if (!enabled()) return;
  const k = `${kind}|${key}|${status}`;
  const b = buffer.get(k);
  if (b) { b.count++; if (sample) b.sample = sample; }
  else buffer.set(k, { kind, key: key.slice(0, 300), status, count: 1, sample: sample.slice(0, 500) });
  if (kind === "server") {
    const h = new Date().getUTCHours();
    if (h !== hourStamp) { hourCounts.clear(); hourStamp = h; }
    hourCounts.set(key, (hourCounts.get(key) ?? 0) + 1);
  }
}

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS app_failures (
        bucket   timestamptz NOT NULL,
        kind     text NOT NULL,
        key      text NOT NULL,
        status   int  NOT NULL DEFAULT 0,
        count    int  NOT NULL DEFAULT 0,
        sample   text,
        last_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (bucket, kind, key, status)
      );
      ALTER TABLE app_failures ENABLE ROW LEVEL SECURITY;
      CREATE INDEX IF NOT EXISTS idx_app_failures_bucket ON app_failures (bucket DESC);
    `).then(() => undefined).catch((e) => { tableReady = null; throw e; });
  }
  return tableReady;
}

export async function flushFailures(): Promise<number> {
  if (!buffer.size) return 0;
  const rows = [...buffer.values()];
  buffer.clear();
  try {
    await ensureTable();
    for (const r of rows) {
      await pool.query(
        `INSERT INTO app_failures (bucket, kind, key, status, count, sample, last_at)
         VALUES (date_trunc('hour', now()), $1, $2, $3, $4, $5, now())
         ON CONFLICT (bucket, kind, key, status)
         DO UPDATE SET count = app_failures.count + EXCLUDED.count,
                       sample = COALESCE(NULLIF(EXCLUDED.sample, ''), app_failures.sample),
                       last_at = now()`,
        [r.kind, r.key, r.status, r.count, r.sample],
      );
    }
  } catch (e: any) {
    console.warn("[failure-monitor] flush failed:", e?.message);
  }
  return rows.length;
}

/** Express middleware — counts API 5xx responses. */
export function failureMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith("/api/") && !req.headers["x-wah-probe"]) {
    res.on("finish", () => {
      if (res.statusCode >= 500) recordFailure("server", `${req.method} ${normalizeRoute(req.path)}`, res.statusCode);
    });
  }
  next();
}

// ── Probes ─────────────────────────────────────────────────────────────────
type Probe = { name: string; run: () => Promise<void> };
const consecutive = new Map<string, number>();

function httpProbe(path: string, expectJson = true): Probe {
  return {
    name: `GET ${path}`,
    run: async () => {
      const port = parseInt(process.env.PORT || "5000", 10);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15_000);
      try {
        const r = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { "x-wah-probe": "1" }, signal: ctrl.signal });
        if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
        if (expectJson) await r.json();
      } finally { clearTimeout(t); }
    },
  };
}

function sqlProbe(name: string, sql: string): Probe {
  return {
    name,
    run: async () => {
      const c = await pool.connect();
      try {
        await c.query("SET statement_timeout = '8s'");
        await c.query(sql);
      } finally {
        await c.query("RESET statement_timeout").catch(() => {});
        c.release();
      }
    },
  };
}

export const PROBES: Probe[] = [
  httpProbe("/api/health/ready"),
  httpProbe("/api/services"),
  httpProbe("/api/plans"),
  httpProbe("/api/public/stats"),
  httpProbe("/api/public/live-activity"),
  httpProbe("/api/scam-wall"),
  httpProbe("/api/local-jobs"),
  httpProbe("/", false),
  sqlProbe("DB: finance ledger (Admin → Finance)", "SELECT count(*) FROM finance_ledger"),
  sqlProbe("DB: analytics funnel (Admin → Analytics)", "SELECT count(DISTINCT session_id) FROM conversion_events WHERE funnel_step = 'landing_view' AND completed_at > now() - interval '7 days'"),
  sqlProbe("DB: VerifyX findings", "SELECT f.code, f.status, count(*) FROM verifyx_findings f JOIN verifyx_requests r ON r.id = f.request_id WHERE r.created_at > now() - interval '30 days' GROUP BY 1,2"),
];

export async function runProbes(): Promise<{ name: string; ok: boolean; error?: string }[]> {
  const out: { name: string; ok: boolean; error?: string }[] = [];
  for (const p of PROBES) {
    try {
      await p.run();
      consecutive.set(p.name, 0);
      out.push({ name: p.name, ok: true });
    } catch (e: any) {
      const msg = String(e?.name === "AbortError" ? "timed out" : e?.message ?? e).slice(0, 200);
      const n = (consecutive.get(p.name) ?? 0) + 1;
      consecutive.set(p.name, n);
      recordFailure("probe", p.name, 0, msg);
      out.push({ name: p.name, ok: false, error: msg });
      if (n === PROBE_FAILS_BEFORE_ALERT) {
        await sendUrgentAlert(`probe:${p.name}`, `Check failing: ${p.name}`,
          `This check has failed ${n} times in a row (every 30 minutes). Last error: ${msg}`);
      }
    }
  }
  return out;
}

// ── Urgent alerts ──────────────────────────────────────────────────────────
const lastAlert = new Map<string, number>();
async function sendUrgentAlert(key: string, title: string, detail: string): Promise<void> {
  const now = Date.now();
  if ((lastAlert.get(key) ?? 0) > now - ALERT_COOLDOWN_MS) return;
  lastAlert.set(key, now);
  try {
    const to = (process.env.ADMIN_DIGEST_TO || "kstingjunior@gmail.com").trim();
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
    const { sendEmail } = await import("../email");
    await sendEmail({
      to, from: FROM,
      subject: `⚠️ Something is breaking on WorkAbroad Hub: ${title}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:600px">
<h2 style="margin:0 0 12px">⚠️ ${esc(title)}</h2><p>${esc(detail)}</p>
<p style="color:#666;font-size:13px">Automatic alert — sent at most once every 6 hours per problem. Details also appear in tomorrow's 7:00 email.</p></div>`,
      text: `${title}\n\n${detail}\n\nAutomatic alert — at most once every 6 hours per problem.`,
    });
    console.warn(`[failure-monitor] urgent alert sent: ${title}`);
  } catch (e: any) {
    console.warn("[failure-monitor] alert email failed:", e?.message);
  }
}

async function checkSpikes(): Promise<void> {
  for (const key of findSpikes(hourCounts)) {
    await sendUrgentAlert(`spike:${key}`, `${key} is failing`,
      `${hourCounts.get(key)} server errors on ${key} in the last hour. Customers using this feature are getting errors.`);
  }
}

// ── Digest items (last 24 h) ───────────────────────────────────────────────
export async function failureDigestItems(): Promise<Array<{ title: string; detail: string; link: string; urgent?: boolean; lines?: string[] }>> {
  if (!enabled()) return [];
  try {
    await flushFailures();
    await ensureTable();
    const { rows } = await pool.query(
      `SELECT kind, key, max(status) status, sum(count)::int n, max(last_at) last_at, (array_agg(sample ORDER BY last_at DESC))[1] sample
         FROM app_failures WHERE bucket > now() - interval '24 hours'
        GROUP BY kind, key ORDER BY n DESC`);
    const items: Array<{ title: string; detail: string; link: string; urgent?: boolean; lines?: string[] }> = [];
    const by = (k: string) => rows.filter((r: any) => r.kind === k);
    const server = by("server"), client = by("client"), probe = by("probe");
    if (server.length) {
      const total = server.reduce((s: number, r: any) => s + r.n, 0);
      items.push({
        urgent: total >= 50, link: `${BASE}/admin/error-monitor`,
        title: `${total} server error${total === 1 ? "" : "s"} in the last 24 hours`,
        detail: "Requests the server couldn't complete (status 500+). Top routes:",
        lines: server.slice(0, 6).map((r: any) => `${r.n}× ${r.key} (${r.status})`),
      });
    }
    if (client.length) {
      const total = client.reduce((s: number, r: any) => s + r.n, 0);
      items.push({
        urgent: total >= 20, link: `${BASE}/admin/error-monitor`,
        title: `${total} page crash${total === 1 ? "" : "es"} seen by visitors`,
        detail: "Visitors saw the \"Just a small detour\" page. Page and error:",
        lines: client.slice(0, 6).map((r: any) => `${r.n}× ${r.key}`),
      });
    }
    if (probe.length) {
      items.push({
        urgent: true, link: `${BASE}/admin`,
        title: `${probe.length} automatic check${probe.length === 1 ? "" : "s"} failed`,
        detail: "The server tests its key pages and slow reports every 30 minutes.",
        lines: probe.slice(0, 6).map((r: any) => `${r.key}: failed ${r.n}× — ${String(r.sample ?? "").slice(0, 90)}`),
      });
    }
    return items;
  } catch (e: any) {
    console.warn("[failure-monitor] digest query failed:", e?.message);
    return [];
  }
}

export async function recentFailures(hours = 24) {
  await flushFailures();
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT kind, key, max(status) status, sum(count)::int n, max(last_at) last_at, (array_agg(sample ORDER BY last_at DESC))[1] sample
       FROM app_failures WHERE bucket > now() - make_interval(hours => $1)
      GROUP BY kind, key ORDER BY n DESC LIMIT 200`, [Math.min(24 * 30, Math.max(1, hours))]);
  return rows;
}

// ── Scheduler ──────────────────────────────────────────────────────────────
let started = false;
export function startFailureMonitor(): void {
  if (started || !enabled()) return;
  started = true;
  setInterval(() => { flushFailures().catch(() => {}); checkSpikes().catch(() => {}); }, 60_000);
  setInterval(() => { runProbes().catch((e) => console.warn("[failure-monitor] probes:", e?.message)); }, 30 * 60_000);
  setTimeout(() => { runProbes().catch(() => {}); }, 3 * 60_000); // first run after boot settles
  // keep 30 days
  setInterval(() => { pool.query(`DELETE FROM app_failures WHERE bucket < now() - interval '30 days'`).catch(() => {}); }, 24 * 3600_000);
  console.log("[failure-monitor] on — 5xx + page crashes + probes every 30 min; alerts → " + (process.env.ADMIN_DIGEST_TO || "kstingjunior@gmail.com"));
}
