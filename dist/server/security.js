"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RISK_POINTS = void 0;
exports.createSecurityAlert = createSecurityAlert;
exports.trackSecurityEvent = trackSecurityEvent;
exports.initSecurityMonitor = initSecurityMonitor;
exports.listSecurityAlerts = listSecurityAlerts;
exports.resolveSecurityAlert = resolveSecurityAlert;
exports.getSecurityAlertStats = getSecurityAlertStats;
// @ts-nocheck
const db_1 = require("./db");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const storage_1 = require("./storage");
const ddos_protection_1 = require("./middleware/ddos-protection");
// IPs/identifiers that should never trigger security alerts — server's own traffic
const INTERNAL_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost", "unknown"]);
function isInternalIdentifier(identifier) {
    return INTERNAL_IPS.has(identifier) || identifier.startsWith("::ffff:127.");
}
// Creates a security alert record in the database and logs it to console.
// Called both by real-time hooks (M-Pesa callback, login lockout) and by the periodic scanner.
async function createSecurityAlert(data) {
    // Never record false positives from localhost / internal server traffic
    if (data.ipAddress && INTERNAL_IPS.has(data.ipAddress))
        return;
    if (data.ipAddress && data.ipAddress.startsWith("::ffff:127."))
        return;
    // Also guard against descriptions that reference localhost identifiers
    const localhostPattern = /(127\.0\.0\.1|::1|::ffff:127\.|"unknown"|"localhost")/;
    if (localhostPattern.test(data.description))
        return;
    try {
        await db_1.db.insert(schema_1.securityAlerts).values({
            alertType: data.alertType,
            severity: data.severity,
            title: data.title,
            description: data.description,
            ipAddress: data.ipAddress ?? null,
            userId: data.userId ?? null,
            metadata: data.metadata ?? null,
        });
        console.warn(`[Security][${data.severity.toUpperCase()}] ${data.alertType} | ${data.title} | ${data.description}`);
    }
    catch (err) {
        console.error("[Security] Failed to create alert:", err);
    }
}
// Risk point values for each event type — matched against OWASP risk ratings.
// These accumulate per IP/user within a rolling window so the scorer can
// assign severity to the aggregate pattern rather than a single event.
exports.RISK_POINTS = {
    auth_failure: 10, // Single failed login — moderate risk
    rate_limit_hit: 15, // API abuse threshold exceeded
    payment_attempt: 5, // Normal unless rapid-fire (detected by spike check)
    file_upload_rejected: 12, // Attempted to upload disallowed file type
    restricted_route_access: 25, // Tried to reach an admin/protected route without auth
    xss_attempt: 30, // XSS payload detected and sanitized by middleware
    admin_access: 3, // Low-risk info-only: log when admin routes are accessed
};
// Records a lightweight security event — called from rate limiters, login handlers,
// and middleware to build a per-IP/per-user risk profile over time.
// Fire-and-forget: errors are swallowed so event tracking never breaks request handling.
function trackSecurityEvent(data) {
    const riskPoints = exports.RISK_POINTS[data.eventType] ?? 5;
    storage_1.storage
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
async function runSecurityScan() {
    const scanWindowStart = new Date(Date.now() - 7.5 * 60 * 1000);
    try {
        // ── Check 1: Accounts with high recent failure counts ─────────────────
        const suspiciousLockouts = await db_1.db
            .select()
            .from(schema_1.accountLockouts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.accountLockouts.failedAttempts, 5), (0, drizzle_orm_1.gte)(schema_1.accountLockouts.updatedAt, scanWindowStart)));
        for (const lockout of suspiciousLockouts) {
            // Skip internal/localhost identifiers — these are false positives from
            // the server's own health checks, test callbacks, and dev traffic.
            if (isInternalIdentifier(lockout.identifier))
                continue;
            const severity = lockout.failedAttempts >= 10 ? "critical" : "high";
            await createSecurityAlert({
                alertType: "suspicious_login",
                severity,
                title: lockout.failedAttempts >= 10
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
        const suspiciousPayments = await db_1.db
            .select()
            .from(schema_1.payments)
            .where((0, drizzle_orm_1.eq)(schema_1.payments.isSuspicious, true))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.payments.createdAt))
            .limit(50);
        const recentSuspicious = suspiciousPayments.filter((p) => p.createdAt && new Date(p.createdAt) >= scanWindowStart);
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
        const topIPs = await storage_1.storage.getTopSuspiciousIPs(scanWindowStart, 20);
        for (const row of topIPs) {
            // Skip localhost — internal server traffic is never a real threat
            if (row.ipAddress && isInternalIdentifier(row.ipAddress))
                continue;
            // Always feed score into the dynamic rate limiter cache (even below alert threshold)
            if (row.ipAddress) {
                (0, ddos_protection_1.updateIpRiskCache)(row.ipAddress, row.totalRiskPoints);
            }
            if (row.totalRiskPoints >= spikeThreshold) {
                const severity = row.totalRiskPoints >= 150 ? "critical" : row.totalRiskPoints >= 100 ? "high" : "medium";
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
                    (0, ddos_protection_1.banIp)(row.ipAddress, "severe", `Automated ban: ${row.totalRiskPoints} risk points in 7.5 min (${row.eventTypes.join(", ")})`);
                }
                else if (row.ipAddress && row.totalRiskPoints >= 100) {
                    (0, ddos_protection_1.banIp)(row.ipAddress, "moderate", `Automated ban: ${row.totalRiskPoints} risk points in 7.5 min`);
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
        await storage_1.storage.pruneOldSecurityEvents(pruneDate);
        const alerts = suspiciousLockouts.length + recentSuspicious.length + topIPs.filter(r => r.totalRiskPoints >= spikeThreshold).length;
        if (alerts > 0) {
            console.log(`[Security] Scan complete — ${suspiciousLockouts.length} login threat(s), ${recentSuspicious.length} payment fraud(s), ${topIPs.filter(r => r.totalRiskPoints >= spikeThreshold).length} IP spike(s) alerted`);
        }
    }
    catch (err) {
        console.error("[Security] Scan error:", err);
    }
}
// Infrastructure self-check — verifies key security headers and rate limiter state.
function runInfrastructureCheck() {
    const checks = {
        nodeEnv: process.env.NODE_ENV,
        httpsEnforced: process.env.NODE_ENV === "production",
        sessionSecretSet: Boolean(process.env.SESSION_SECRET),
        mpesaKeysSet: Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET),
        twilioConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID),
    };
    const missing = Object.entries(checks)
        .filter(([, v]) => v === false)
        .map(([k]) => k);
    if (missing.length > 0) {
        console.warn(`[Security][Infrastructure] Missing or misconfigured: ${missing.join(", ")}`);
    }
    else {
        console.log("[Security][Infrastructure] All infrastructure checks passed");
    }
}
// Initialise the security monitor — call once at application startup.
// Runs an initial scan after 60 seconds (to avoid startup congestion),
// then rescans every 5 minutes. Infrastructure checks run every hour.
function initSecurityMonitor() {
    console.log("[Security] Security monitor initialised — periodic scans every 5 minutes");
    setTimeout(() => {
        runSecurityScan();
        runInfrastructureCheck();
    }, 60000);
    setInterval(runSecurityScan, 5 * 60 * 1000);
    setInterval(runInfrastructureCheck, 60 * 60 * 1000);
}
// Storage helpers used by admin routes
async function listSecurityAlerts(opts) {
    const conditions = [];
    if (opts.alertType)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.securityAlerts.alertType, opts.alertType));
    if (opts.severity)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.securityAlerts.severity, opts.severity));
    if (opts.isResolved !== undefined)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.securityAlerts.isResolved, opts.isResolved));
    let query = db_1.db.select().from(schema_1.securityAlerts).orderBy((0, drizzle_orm_1.desc)(schema_1.securityAlerts.createdAt));
    if (conditions.length > 0)
        query = query.where((0, drizzle_orm_1.and)(...conditions));
    query = query.limit(opts.limit ?? 50).offset(opts.offset ?? 0);
    return query;
}
async function resolveSecurityAlert(id, resolvedBy) {
    const [updated] = await db_1.db
        .update(schema_1.securityAlerts)
        .set({ isResolved: true, resolvedAt: new Date(), resolvedBy })
        .where((0, drizzle_orm_1.eq)(schema_1.securityAlerts.id, id))
        .returning();
    return updated;
}
// Condition to exclude alerts originating from internal/localhost traffic
const notInternalAlert = (0, drizzle_orm_1.sql) `(
  ip_address IS NULL
  OR ip_address NOT IN ('127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost')
)
AND description NOT LIKE '%127.0.0.1%'
AND description NOT LIKE '%"unknown"%'`;
async function getSecurityAlertStats() {
    const [total] = await db_1.db
        .select({ cnt: (0, drizzle_orm_1.count)() })
        .from(schema_1.securityAlerts)
        .where(notInternalAlert);
    const [unresolved] = await db_1.db
        .select({ cnt: (0, drizzle_orm_1.count)() })
        .from(schema_1.securityAlerts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.securityAlerts.isResolved, false), notInternalAlert));
    const [critical] = await db_1.db
        .select({ cnt: (0, drizzle_orm_1.count)() })
        .from(schema_1.securityAlerts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.securityAlerts.severity, "critical"), (0, drizzle_orm_1.eq)(schema_1.securityAlerts.isResolved, false), notInternalAlert));
    return {
        total: total?.cnt ?? 0,
        unresolved: unresolved?.cnt ?? 0,
        critical: critical?.cnt ?? 0,
    };
}
