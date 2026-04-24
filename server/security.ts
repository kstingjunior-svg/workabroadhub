import { db } from "./db";
import { securityAlerts, accountLockouts, payments, securityEvents } from "@shared/schema";
import { eq, gte, and, desc, count, isNull, sql } from "drizzle-orm";
import { storage } from "./storage";
import { updateIpRiskCache, banIp } from "./middleware/ddos-protection";

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertType =
  | "suspicious_login"
  | "payment_fraud"
  | "api_abuse"
  | "admin_abuse"
  | "system_vulnerability"
  | "file_upload";

export interface SecurityAlertData {
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  ipAddress?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// IPs/identifiers that should never trigger security alerts — server's own traffic
const INTERNAL_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost", "unknown"]);

function isInternalIdentifier(identifier: string): boolean {
  return INTERNAL_IPS.has(identifier) || identifier.startsWith("::ffff:127.");
}

// Creates a security alert record in the database and logs it to console.
// Called both by real-time hooks (M-Pesa callback, login lockout) and by the periodic scanner.
export async function createSecurityAlert(data: SecurityAlertData): Promise<void> {
  // Never record false positives from localhost / internal server traffic
  if (data.ipAddress && INTERNAL_IPS.has(data.ipAddress)) return;
  if (data.ipAddress && data.ipAddress.startsWith("::ffff:127.")) return;
  // Also guard against descriptions that reference localhost identifiers
  const localhostPattern = /(127\.0\.0\.1|::1|::ffff:127\.|"unknown"|"localhost")/;
  if (localhostPattern.test(data.description)) return;

  try {
    await db.insert(securityAlerts).values({
      alertType: data.alertType,
      severity: data.severity,
      title: data.title,
      description: data.description,
      ipAddress: data.ipAddress ?? null,
      userId: data.userId ?? null,
      metadata: data.metadata ?? null,
    });
    console.warn(
      `[Security][${data.severity.toUpperCase()}] ${data.alertType} | ${data.title} | ${data.description}`
    );
  } catch (err) {
    console.error("[Security] Failed to create alert:", err);
  }
}

// Risk point values for each event type — matched against OWASP risk ratings.
// These accumulate per IP/user within a rolling window so the scorer can
// assign severity to the aggregate pattern rather than a single event.
export const RISK_POINTS: Record<string, number> = {
  auth_failure: 10,          // Single failed login — moderate risk
  rate_limit_hit: 15,        // API abuse threshold exceeded
  payment_attempt: 5,        // Normal unless rapid-fire (detected by spike check)
  file_upload_rejected: 12,  // Attempted to upload disallowed file type
  restricted_route_access: 25, // Tried to reach an admin/protected route without auth
  xss_attempt: 30,           // XSS payload detected and sanitized by middleware
  admin_access: 3,           // Low-risk info-only: log when admin routes are accessed
};

// Records a lightweight security event — called from rate limiters, login handlers,
// and middleware to build a per-IP/per-user risk profile over time.
// Fire-and-forget: errors are swallowed so event tracking never breaks request handling.
export function trackSecurityEvent(data: {
  eventType: string;
  ipAddress?: string;
  userId?: string;
  endpoint?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): void {
  const riskPoints = RISK_POINTS[data.eventType] ?? 5;
  storage
    .createSecurityEvent({
      eventType: data.eventType,
      riskPoints,
      ipAddress: data.ipAddress ?? null,
      userId: data.userId ?? null,
      endpoint: data.endpoint ?? null,
      userAgent: data.userAgent ?? null,
      metadata: data.metadata ?? null,
    })
    .catch((err) => {
      console.error("[Security] Failed to track event:", err);
    });
}

// Periodic security scanner — detects threat patterns in the database.
// Looks back 7.5 minutes so each 5-minute scan cycle covers fresh events
// with a 50% overlap for coverage without missing edge-of-window events.
async function runSecurityScan(): Promise<void> {
  const scanWindowStart = new Date(Date.now() - 7.5 * 60 * 1000);

  try {
    // ── Check 1: Accounts with high recent failure counts ─────────────────
    const suspiciousLockouts = await db
      .select()
      .from(accountLockouts)
      .where(
        and(
          gte(accountLockouts.failedAttempts, 5),
          gte(accountLockouts.updatedAt, scanWindowStart)
        )
      );

    for (const lockout of suspiciousLockouts) {
      // Skip internal/localhost identifiers — these are false positives from
      // the server's own health checks, test callbacks, and dev traffic.
      if (isInternalIdentifier(lockout.identifier)) continue;

      const severity: AlertSeverity = lockout.failedAttempts >= 10 ? "critical" : "high";
      await createSecurityAlert({
        alertType: "suspicious_login",
        severity,
        title:
          lockout.failedAttempts >= 10
            ? "Critical Brute-Force Attack Detected"
            : "Repeated Login Failures Detected",
        description: `${lockout.failedAttempts} failed login attempts on ${lockout.identifierType} identifier "${lockout.identifier}". Account is ${lockout.lockedUntil ? "locked" : "not yet locked"}.`,
        metadata: {
          identifier: lockout.identifier,
          identifierType: lockout.identifierType,
          failedAttempts: lockout.failedAttempts,
          lockedUntil: lockout.lockedUntil,
        },
      });
    }

    // ── Check 2: Payments flagged as suspicious in the scan window ────────
    const suspiciousPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.isSuspicious, true))
      .orderBy(desc(payments.createdAt))
      .limit(50);

    const recentSuspicious = suspiciousPayments.filter(
      (p) => p.createdAt && new Date(p.createdAt) >= scanWindowStart
    );

    for (const payment of recentSuspicious) {
      await createSecurityAlert({
        alertType: "payment_fraud",
        severity: "high",
        title: "Suspicious Payment Flagged",
        description: `Payment ${payment.id} flagged by M-Pesa security chain: ${payment.fraudReason ?? "unknown reason"}`,
        userId: payment.userId,
        metadata: {
          paymentId: payment.id,
          fraudReason: payment.fraudReason,
          amount: payment.amount,
          method: payment.method,
        },
      });
    }

    // ── Check 3: IP spike detection from security_events ─────────────────
    // Any IP accumulating ≥60 risk points in the 7.5-minute window is suspicious.
    // Threshold chosen so that 4 rate_limit_hit events (4×15=60) trigger an alert
    // without false-positives from normal admin activity.
    const spikeThreshold = 60;
    const topIPs = await storage.getTopSuspiciousIPs(scanWindowStart, 20);
    for (const row of topIPs) {
      // Skip localhost — internal server traffic is never a real threat
      if (row.ipAddress && isInternalIdentifier(row.ipAddress)) continue;

      // Always feed score into the dynamic rate limiter cache (even below alert threshold)
      if (row.ipAddress) {
        updateIpRiskCache(row.ipAddress, row.totalRiskPoints);
      }

      if (row.totalRiskPoints >= spikeThreshold) {
        const severity: AlertSeverity = row.totalRiskPoints >= 150 ? "critical" : row.totalRiskPoints >= 100 ? "high" : "medium";
        await createSecurityAlert({
          alertType: "api_abuse",
          severity,
          title: "Suspicious IP Activity Detected",
          description: `IP ${row.ipAddress} accumulated ${row.totalRiskPoints} risk points across ${row.eventCount} events in the last 7.5 minutes. Event types: ${row.eventTypes.join(", ")}.`,
          ipAddress: row.ipAddress,
          metadata: {
            totalRiskPoints: row.totalRiskPoints,
            eventCount: row.eventCount,
            eventTypes: row.eventTypes,
            windowMinutes: 7.5,
          },
        });

        // Auto-ban the most egregious IPs directly
        if (row.ipAddress && row.totalRiskPoints >= 200) {
          banIp(row.ipAddress, "severe", `Automated ban: ${row.totalRiskPoints} risk points in 7.5 min (${row.eventTypes.join(", ")})`);
        } else if (row.ipAddress && row.totalRiskPoints >= 100) {
          banIp(row.ipAddress, "moderate", `Automated ban: ${row.totalRiskPoints} risk points in 7.5 min`);
        }
      }
    }

    // ── Check 4: XSS attempts ─────────────────────────────────────────────
    const xssEvents = topIPs.filter(r => r.eventTypes.includes("xss_attempt"));
    for (const row of xssEvents) {
      await createSecurityAlert({
        alertType: "api_abuse",
        severity: "high",
        title: "XSS Payload Attempt Detected",
        description: `IP ${row.ipAddress} sent XSS payloads. All were blocked by input sanitization middleware.`,
        ipAddress: row.ipAddress,
        metadata: { eventTypes: row.eventTypes, eventCount: row.eventCount },
      });
    }

    // ── Prune security_events older than 7 days to keep table lean ────────
    const pruneDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await storage.pruneOldSecurityEvents(pruneDate);

    const alerts = suspiciousLockouts.length + recentSuspicious.length + topIPs.filter(r => r.totalRiskPoints >= spikeThreshold).length;
    if (alerts > 0) {
      console.log(`[Security] Scan complete — ${suspiciousLockouts.length} login threat(s), ${recentSuspicious.length} payment fraud(s), ${topIPs.filter(r => r.totalRiskPoints >= spikeThreshold).length} IP spike(s) alerted`);
    }
  } catch (err) {
    console.error("[Security] Scan error:", err);
  }
}

// Infrastructure self-check — verifies key security headers and rate limiter state.
function runInfrastructureCheck(): void {
  const checks = {
    nodeEnv: process.env.NODE_ENV,
    httpsEnforced: process.env.NODE_ENV === "production" || Boolean(process.env.REPL_SLUG ?? process.env.REPL_ID),
    sessionSecretSet: Boolean(process.env.SESSION_SECRET),
    mpesaKeysSet: Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET),
    twilioConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID),
  };

  const missing = Object.entries(checks)
    .filter(([, v]) => v === false)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.warn(`[Security][Infrastructure] Missing or misconfigured: ${missing.join(", ")}`);
  } else {
    console.log("[Security][Infrastructure] All infrastructure checks passed");
  }
}

// Initialise the security monitor — call once at application startup.
// Runs an initial scan after 60 seconds (to avoid startup congestion),
// then rescans every 5 minutes. Infrastructure checks run every hour.
export function initSecurityMonitor(): void {
  console.log("[Security] Security monitor initialised — periodic scans every 5 minutes");

  setTimeout(() => {
    runSecurityScan();
    runInfrastructureCheck();
  }, 60_000);

  setInterval(runSecurityScan, 5 * 60 * 1000);
  setInterval(runInfrastructureCheck, 60 * 60 * 1000);
}

// Storage helpers used by admin routes

export async function listSecurityAlerts(opts: {
  alertType?: string;
  severity?: string;
  isResolved?: boolean;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (opts.alertType) conditions.push(eq(securityAlerts.alertType, opts.alertType));
  if (opts.severity) conditions.push(eq(securityAlerts.severity, opts.severity));
  if (opts.isResolved !== undefined) conditions.push(eq(securityAlerts.isResolved, opts.isResolved));

  let query = db.select().from(securityAlerts).orderBy(desc(securityAlerts.createdAt)) as any;
  if (conditions.length > 0) query = query.where(and(...conditions));
  query = query.limit(opts.limit ?? 50).offset(opts.offset ?? 0);
  return query;
}

export async function resolveSecurityAlert(id: string, resolvedBy: string) {
  const [updated] = await db
    .update(securityAlerts)
    .set({ isResolved: true, resolvedAt: new Date(), resolvedBy })
    .where(eq(securityAlerts.id, id))
    .returning();
  return updated;
}

// Condition to exclude alerts originating from internal/localhost traffic
const notInternalAlert = sql`(
  ip_address IS NULL
  OR ip_address NOT IN ('127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost')
)
AND description NOT LIKE '%127.0.0.1%'
AND description NOT LIKE '%"unknown"%'`;

export async function getSecurityAlertStats() {
  const [total] = await db
    .select({ cnt: count() })
    .from(securityAlerts)
    .where(notInternalAlert);
  const [unresolved] = await db
    .select({ cnt: count() })
    .from(securityAlerts)
    .where(and(eq(securityAlerts.isResolved, false), notInternalAlert));
  const [critical] = await db
    .select({ cnt: count() })
    .from(securityAlerts)
    .where(and(eq(securityAlerts.severity, "critical"), eq(securityAlerts.isResolved, false), notInternalAlert));

  return {
    total: total?.cnt ?? 0,
    unresolved: unresolved?.cnt ?? 0,
    critical: critical?.cnt ?? 0,
  };
}
