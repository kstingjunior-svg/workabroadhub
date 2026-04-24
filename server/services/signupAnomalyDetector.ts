/**
 * Signup Anomaly Detector
 *
 * Monitors signup velocity using an in-memory sliding-window buffer.
 * No Firebase indexes required — all analysis runs in-process.
 *
 * Thresholds (configurable via env):
 *   ANOMALY_GLOBAL_LIMIT   — max total signups in 5 min before alerting (default 10)
 *   ANOMALY_PER_IP_LIMIT   — max signups from one IP in 5 min before alerting (default 3)
 *   ANOMALY_WINDOW_MS      — sliding window size in ms (default 300_000 = 5 min)
 *   ANOMALY_ALERT_COOLDOWN — min ms between two emails for the same alert key (default 600_000 = 10 min)
 *
 * Writes every signup to Firebase RTDB at signupMonitor/{pushId} for permanent audit trail.
 */

import { sendEmail } from "../email";

// ─── Config ───────────────────────────────────────────────────────────────────

const WINDOW_MS      = parseInt(process.env.ANOMALY_WINDOW_MS      || "300000",  10); // 5 min
const GLOBAL_LIMIT   = parseInt(process.env.ANOMALY_GLOBAL_LIMIT   || "10",      10);
const PER_IP_LIMIT   = parseInt(process.env.ANOMALY_PER_IP_LIMIT   || "3",       10);
const ALERT_COOLDOWN = parseInt(process.env.ANOMALY_ALERT_COOLDOWN || "600000",  10); // 10 min

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || process.env.GMAIL_USER || "";
const DB_URL         = process.env.VITE_FIREBASE_DATABASE_URL || "";

// ─── In-memory buffer ─────────────────────────────────────────────────────────

interface SignupRecord {
  ip:        string;
  userId:    string;
  userAgent: string;
  timestamp: number;
}

const buffer: SignupRecord[] = [];

/** Remove entries older than WINDOW_MS from the front of the buffer. */
function pruneBuffer(): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (buffer.length > 0 && buffer[0].timestamp < cutoff) {
    buffer.shift();
  }
}

// ─── Alert throttle ───────────────────────────────────────────────────────────

const lastAlertAt = new Map<string, number>(); // alertKey → last sent ms

function canAlert(key: string): boolean {
  const last = lastAlertAt.get(key) ?? 0;
  return Date.now() - last >= ALERT_COOLDOWN;
}

function markAlerted(key: string): void {
  lastAlertAt.set(key, Date.now());
}

// ─── Admin email ──────────────────────────────────────────────────────────────

async function sendAdminAlert(subject: string, details: Record<string, unknown>): Promise<void> {
  if (!ADMIN_EMAIL) {
    console.warn("[AnomalyDetector] No ADMIN_EMAIL configured — logging alert to console only.");
    console.warn("[AnomalyDetector] ALERT:", subject, JSON.stringify(details, null, 2));
    return;
  }

  const rows = Object.entries(details)
    .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">${k}</td><td style="padding:6px 12px;font-size:13px;font-weight:600;">${String(v)}</td></tr>`)
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
      <div style="background:#dc2626;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <h2 style="color:#fff;margin:0;font-size:16px;">&#x26A0;&#xFE0F; WorkAbroad Hub — Security Alert</h2>
        <p style="color:#fecaca;margin:4px 0 0;font-size:13px;">${new Date().toUTCString()}</p>
      </div>
      <p style="color:#111827;font-size:15px;margin:0 0 16px;"><strong>${subject}</strong></p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        ${rows}
      </table>
      <p style="color:#6b7280;font-size:12px;margin-top:20px;">
        Review the admin dashboard for more details. This alert will not repeat for ${ALERT_COOLDOWN / 60000} minutes.
      </p>
    </div>`;

  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `[WorkAbroad Hub Security] ${subject}`,
    html,
    text: `${subject}\n\n${Object.entries(details).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  }).catch((err) => {
    console.error("[AnomalyDetector] Email send failed:", err);
  });
}

// ─── Firebase RTDB audit trail ─────────────────────────────────────────────────

async function writeAuditRecord(record: SignupRecord & { flagged: boolean; reason: string | null }): Promise<void> {
  if (!DB_URL) return;
  try {
    await fetch(`${DB_URL}/signupMonitor.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ip:        record.ip,
        userId:    record.userId,
        userAgent: record.userAgent,
        timestamp: record.timestamp,
        flagged:   record.flagged,
        reason:    record.reason,
      }),
    });
  } catch {
    // audit trail failure is non-fatal
  }
}

// ─── Core detection ───────────────────────────────────────────────────────────

async function analyzeThreats(latestIp: string): Promise<void> {
  const now = Date.now();

  // 1. Global velocity — too many signups from anyone in the window
  const globalCount = buffer.length;
  if (globalCount > GLOBAL_LIMIT) {
    const alertKey = `global_velocity`;
    if (canAlert(alertKey)) {
      markAlerted(alertKey);
      const uniqueIps = new Set(buffer.map((r) => r.ip)).size;
      console.warn(`[AnomalyDetector] GLOBAL velocity breach: ${globalCount} signups in ${WINDOW_MS / 60000} min from ${uniqueIps} IPs`);
      await sendAdminAlert("Unusual signup activity detected — possible bot attack", {
        "Signups in last 5 min": globalCount,
        "Unique IPs":            uniqueIps,
        "Threshold":             GLOBAL_LIMIT,
        "Window":                `${WINDOW_MS / 60000} minutes`,
        "Time (UTC)":            new Date(now).toUTCString(),
      });
    }
  }

  // 2. Per-IP velocity — same IP signing up repeatedly
  const ipSignups = buffer.filter((r) => r.ip === latestIp && latestIp !== "");
  if (ipSignups.length >= PER_IP_LIMIT) {
    const alertKey = `ip_${latestIp}`;
    if (canAlert(alertKey)) {
      markAlerted(alertKey);
      const maskedIp = maskIp(latestIp);
      console.warn(`[AnomalyDetector] IP velocity breach: ${ipSignups.length} signups from ${maskedIp} in ${WINDOW_MS / 60000} min`);
      await sendAdminAlert("Suspicious IP — repeated rapid signups detected", {
        "IP address (masked)":  maskedIp,
        "Signups from this IP": ipSignups.length,
        "Threshold":            PER_IP_LIMIT,
        "Window":               `${WINDOW_MS / 60000} minutes`,
        "Time (UTC)":           new Date(now).toUTCString(),
        "Latest userId":        ipSignups[ipSignups.length - 1]?.userId ?? "—",
      });
    }
  }
}

/** Partially mask an IP for logs (e.g. 192.168.1.xxx or 2001:db8:xxx:xxx). */
function maskIp(ip: string): string {
  if (!ip) return "unknown";
  if (ip.includes(":")) {
    // IPv6 — mask last two groups
    const parts = ip.split(":");
    if (parts.length > 4) {
      parts.splice(-2, 2, "xxx", "xxx");
      return parts.join(":");
    }
    return ip;
  }
  // IPv4 — mask last octet
  const parts = ip.split(".");
  if (parts.length === 4) {
    parts[3] = "xxx";
    return parts.join(".");
  }
  return ip;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call this immediately after every successful signup.
 * Fire-and-forget — does not block the HTTP response.
 */
export async function recordSignupEvent(
  ip: string,
  userId: string,
  userAgent = "",
): Promise<void> {
  const record: SignupRecord = {
    ip:        ip || "",
    userId,
    userAgent,
    timestamp: Date.now(),
  };

  pruneBuffer();
  buffer.push(record);

  // Run threat analysis
  let flagged = false;
  let reason: string | null = null;

  const globalCount = buffer.length;
  const ipCount     = buffer.filter((r) => r.ip === ip && ip !== "").length;

  if (globalCount > GLOBAL_LIMIT) { flagged = true; reason = `global_velocity:${globalCount}`; }
  if (ipCount >= PER_IP_LIMIT)    { flagged = true; reason = (reason ? reason + "," : "") + `ip_velocity:${ipCount}`; }

  // Write audit trail (fire and forget)
  writeAuditRecord({ ...record, flagged, reason }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

  // Analyse and maybe alert (fire and forget — non-blocking)
  analyzeThreats(ip).catch((err) => {
    console.error("[AnomalyDetector] analyzeThreats error:", err);
  });
}

/** Returns a snapshot of the current buffer (for admin API use). */
export function getRecentSignupStats(): {
  countInWindow: number;
  windowMs:      number;
  topIps:        { ip: string; count: number }[];
} {
  pruneBuffer();
  const ipMap = new Map<string, number>();
  for (const r of buffer) {
    ipMap.set(r.ip, (ipMap.get(r.ip) ?? 0) + 1);
  }
  const topIps = [...ipMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ip, count]) => ({ ip: maskIp(ip), count }));

  return { countInWindow: buffer.length, windowMs: WINDOW_MS, topIps };
}

console.log(`[AnomalyDetector] Initialized — global limit: ${GLOBAL_LIMIT}/5min, per-IP limit: ${PER_IP_LIMIT}/5min`);
