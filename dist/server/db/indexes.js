"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Boot-time index creation.
//
// Drizzle schema (shared/schema.ts) doesn't declare explicit indexes for most
// tables — only PRIMARY KEY and UNIQUE constraints get them automatically.
// Under low load that's invisible, but at 3,000 concurrent users every
// missing index becomes a sequential scan and Postgres CPU pegs at 100%.
//
// This module runs once at boot. CREATE INDEX IF NOT EXISTS is idempotent
// and CONCURRENTLY-equivalent for an empty/cool index, so it's safe to run
// on every deploy. Concurrent creation isn't possible inside a transaction;
// we run each statement standalone.
//
// What we index:
//   - foreign keys hit most often by per-user dashboard queries
//   - the "look up by code/slug/email" patterns hit by service/country pages
//   - the (user_id, status) composites used by subscription expiration sweeps
//   - the (created_at) on payments / events for admin time-range queries
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureScalingIndexes = ensureScalingIndexes;
const db_1 = require("../db");
// Pairs of (statement, friendly-name) — friendly-name used only for logging.
const INDEX_STATEMENTS = [
    // ── Per-user lookups (the dashboard load) ───────────────────────────────
    ["CREATE INDEX IF NOT EXISTS idx_payments_user_id           ON payments(user_id)", "payments.user_id"],
    ["CREATE INDEX IF NOT EXISTS idx_payments_user_created      ON payments(user_id, created_at DESC)", "payments.user_id+created"],
    ["CREATE INDEX IF NOT EXISTS idx_payments_status            ON payments(status)", "payments.status"],
    ["CREATE INDEX IF NOT EXISTS idx_payments_created_at        ON payments(created_at DESC)", "payments.created_at"],
    ["CREATE INDEX IF NOT EXISTS idx_user_subs_user_id          ON user_subscriptions(user_id)", "user_subscriptions.user_id"],
    ["CREATE INDEX IF NOT EXISTS idx_user_subs_status_end       ON user_subscriptions(status, end_date)", "user_subscriptions.status+end_date"],
    ["CREATE INDEX IF NOT EXISTS idx_user_subs_user_status      ON user_subscriptions(user_id, status)", "user_subscriptions.user_id+status"],
    ["CREATE INDEX IF NOT EXISTS idx_service_orders_user_id     ON service_orders(user_id)", "service_orders.user_id"],
    ["CREATE INDEX IF NOT EXISTS idx_service_orders_created     ON service_orders(created_at DESC)", "service_orders.created_at"],
    ["CREATE INDEX IF NOT EXISTS idx_user_notifs_user_id        ON user_notifications(user_id)", "user_notifications.user_id"],
    ["CREATE INDEX IF NOT EXISTS idx_user_notifs_user_unread    ON user_notifications(user_id, is_read)", "user_notifications.user_id+is_read"],
    ["CREATE INDEX IF NOT EXISTS idx_user_job_apps_user_id      ON user_job_applications(user_id)", "user_job_applications.user_id"],
    ["CREATE INDEX IF NOT EXISTS idx_user_career_user_id        ON user_career_profiles(user_id)", "user_career_profiles.user_id"],
    ["CREATE INDEX IF NOT EXISTS idx_tracked_apps_user_id       ON tracked_applications(user_id)", "tracked_applications.user_id"],
    ["CREATE INDEX IF NOT EXISTS idx_user_app_packs_user_id     ON user_application_packs(user_id)", "user_application_packs.user_id"],
    // ── Auth + identity lookups ─────────────────────────────────────────────
    ["CREATE INDEX IF NOT EXISTS idx_users_email                ON users(email)", "users.email"],
    ["CREATE INDEX IF NOT EXISTS idx_users_phone                ON users(phone)", "users.phone"],
    ["CREATE INDEX IF NOT EXISTS idx_users_plan                 ON users(plan)", "users.plan"],
    ["CREATE INDEX IF NOT EXISTS idx_users_is_admin             ON users(is_admin) WHERE is_admin = true", "users.is_admin (partial)"],
    ["CREATE INDEX IF NOT EXISTS idx_users_role                 ON users(role) WHERE role IS NOT NULL", "users.role (partial)"],
    ["CREATE INDEX IF NOT EXISTS idx_users_created              ON users(created_at DESC)", "users.created_at"],
    // ── M-Pesa + payment integrity ──────────────────────────────────────────
    ["CREATE INDEX IF NOT EXISTS idx_payments_mpesa_receipt     ON payments(mpesa_receipt) WHERE mpesa_receipt IS NOT NULL", "payments.mpesa_receipt (partial)"],
    ["CREATE INDEX IF NOT EXISTS idx_payments_checkout_request  ON payments(checkout_request_id) WHERE checkout_request_id IS NOT NULL", "payments.checkout_request_id (partial)"],
    ["CREATE INDEX IF NOT EXISTS idx_mpesa_tx_receipt           ON mpesa_transactions(mpesa_receipt) WHERE mpesa_receipt IS NOT NULL", "mpesa_transactions.mpesa_receipt"],
    ["CREATE INDEX IF NOT EXISTS idx_mpesa_tx_user              ON mpesa_transactions(user_id) WHERE user_id IS NOT NULL", "mpesa_transactions.user_id"],
    // ── Public catalogue queries (services / countries / agencies / jobs) ──
    ["CREATE INDEX IF NOT EXISTS idx_services_slug              ON services(slug)", "services.slug"],
    ["CREATE INDEX IF NOT EXISTS idx_services_active            ON services(is_active) WHERE is_active = true", "services.is_active (partial)"],
    ["CREATE INDEX IF NOT EXISTS idx_countries_code             ON countries(code)", "countries.code"],
    ["CREATE INDEX IF NOT EXISTS idx_countries_is_active        ON countries(is_active) WHERE is_active = true", "countries.is_active (partial)"],
    ["CREATE INDEX IF NOT EXISTS idx_nea_agencies_status        ON nea_agencies(status) WHERE status IS NOT NULL", "nea_agencies.status"],
    ["CREATE INDEX IF NOT EXISTS idx_nea_agencies_active        ON nea_agencies(is_active) WHERE is_active = true", "nea_agencies.is_active (partial)"],
    ["CREATE INDEX IF NOT EXISTS idx_agency_jobs_active         ON agency_jobs(is_active) WHERE is_active = true", "agency_jobs.is_active (partial)"],
    // ── Audit / event-stream queries (admin dashboards) ─────────────────────
    ["CREATE INDEX IF NOT EXISTS idx_funnel_events_created      ON funnel_events(created_at DESC)", "funnel_events.created_at"],
    ["CREATE INDEX IF NOT EXISTS idx_funnel_events_user         ON funnel_events(user_id) WHERE user_id IS NOT NULL", "funnel_events.user_id"],
    ["CREATE INDEX IF NOT EXISTS idx_payment_audit_log_payment  ON payment_audit_log(payment_id)", "payment_audit_log.payment_id"],
    ["CREATE INDEX IF NOT EXISTS idx_payment_audit_log_created  ON payment_audit_log(created_at DESC)", "payment_audit_log.created_at"],
    // ── Webhook locking ─────────────────────────────────────────────────────
    ["CREATE INDEX IF NOT EXISTS idx_webhook_locks_key          ON webhook_processing_locks(lock_key)", "webhook_processing_locks.lock_key"],
    // ── AI usage quotas (bulk-apply throttle) ───────────────────────────────
    ["CREATE INDEX IF NOT EXISTS idx_ai_usage_user_tool_day     ON ai_usage(user_id, tool, day)", "ai_usage.user_id+tool+day"],
];
let DONE = false;
/**
 * Run once at server boot. Each statement is independent so one failure
 * (e.g. table not yet created on a fresh DB) doesn't block the rest.
 */
async function ensureScalingIndexes() {
    if (DONE)
        return;
    DONE = true;
    const start = Date.now();
    let created = 0;
    let skipped = 0;
    let failed = 0;
    for (const [sql, name] of INDEX_STATEMENTS) {
        try {
            const res = await db_1.pool.query(sql);
            // `IF NOT EXISTS` doesn't tell us whether the index was created or
            // already existed — but CREATE INDEX returns an empty result either way.
            // We can use a follow-up check, but for boot logging the count is fine.
            created++;
        }
        catch (err) {
            const msg = err?.message || String(err);
            if (msg.includes("does not exist")) {
                // Table doesn't exist yet (fresh DB, migration pending). Quiet skip.
                skipped++;
            }
            else {
                failed++;
                console.warn(`[indexes] failed: ${name} — ${msg.slice(0, 120)}`);
            }
        }
    }
    const ms = Date.now() - start;
    console.log(`[indexes] boot-time ensure complete: ${created} ensured, ${skipped} skipped (table missing), ${failed} failed in ${ms}ms`);
}
