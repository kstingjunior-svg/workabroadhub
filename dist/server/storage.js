"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = exports.DatabaseStorage = void 0;
// @ts-nocheck
const schema_1 = require("../shared/schema");
const auth_1 = require("../shared/models/auth");
const db_1 = require("./db");
const drizzle_orm_1 = require("drizzle-orm");
class DatabaseStorage {
    async getCountries() {
        return db_1.db.select().from(schema_1.countries);
    }
    async getCountryById(id) {
        const [country] = await db_1.db.select().from(schema_1.countries).where((0, drizzle_orm_1.eq)(schema_1.countries.id, id));
        return country;
    }
    async getCountryByCode(code) {
        const [country] = await db_1.db.select().from(schema_1.countries).where((0, drizzle_orm_1.eq)(schema_1.countries.code, code));
        return country;
    }
    // OPTIMIZED: Parallel queries for faster response
    async getCountryWithDetails(code) {
        const country = await this.getCountryByCode(code);
        if (!country)
            return undefined;
        // Run all queries in parallel
        const [guides, links, alerts] = await Promise.all([
            db_1.db.select().from(schema_1.countryGuides).where((0, drizzle_orm_1.eq)(schema_1.countryGuides.countryId, country.id)),
            db_1.db.select().from(schema_1.jobLinks).where((0, drizzle_orm_1.eq)(schema_1.jobLinks.countryId, country.id)).orderBy(schema_1.jobLinks.order),
            db_1.db.select().from(schema_1.scamAlerts).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.scamAlerts.countryId, country.id), (0, drizzle_orm_1.eq)(schema_1.scamAlerts.isActive, true))),
        ]);
        return {
            ...country,
            guides,
            jobLinks: links,
            scamAlerts: alerts,
        };
    }
    // OPTIMIZED: Batch queries to avoid N+1
    async getAllCountriesWithDetails() {
        const allCountries = await this.getCountries();
        if (allCountries.length === 0)
            return [];
        const countryIds = allCountries.map(c => c.id);
        // Batch all queries with Promise.all to avoid N+1
        const [allGuides, allLinks, allAlerts] = await Promise.all([
            db_1.db.select().from(schema_1.countryGuides).where((0, drizzle_orm_1.inArray)(schema_1.countryGuides.countryId, countryIds)),
            db_1.db.select().from(schema_1.jobLinks).where((0, drizzle_orm_1.inArray)(schema_1.jobLinks.countryId, countryIds)),
            db_1.db.select().from(schema_1.scamAlerts).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.scamAlerts.countryId, countryIds), (0, drizzle_orm_1.eq)(schema_1.scamAlerts.isActive, true))),
        ]);
        // Map results to countries
        return allCountries.map(country => ({
            ...country,
            guides: allGuides.filter(g => g.countryId === country.id),
            jobLinks: allLinks
                .filter(l => l.countryId === country.id)
                .sort((a, b) => a.order - b.order),
            scamAlerts: allAlerts.filter(a => a.countryId === country.id),
        }));
    }
    async createCountry(country) {
        const [created] = await db_1.db.insert(schema_1.countries).values(country).returning();
        return created;
    }
    async updateCountry(id, country) {
        const [updated] = await db_1.db.update(schema_1.countries).set(country).where((0, drizzle_orm_1.eq)(schema_1.countries.id, id)).returning();
        return updated;
    }
    async getCountryGuides(countryId) {
        return db_1.db.select().from(schema_1.countryGuides).where((0, drizzle_orm_1.eq)(schema_1.countryGuides.countryId, countryId));
    }
    async getGuideById(id) {
        const [guide] = await db_1.db.select().from(schema_1.countryGuides).where((0, drizzle_orm_1.eq)(schema_1.countryGuides.id, id));
        return guide;
    }
    async createGuide(guide) {
        const [created] = await db_1.db.insert(schema_1.countryGuides).values(guide).returning();
        return created;
    }
    async updateGuide(id, data) {
        const [updated] = await db_1.db.update(schema_1.countryGuides).set(data).where((0, drizzle_orm_1.eq)(schema_1.countryGuides.id, id)).returning();
        return updated;
    }
    async upsertCountryGuide(guide) {
        const [existing] = await db_1.db
            .select()
            .from(schema_1.countryGuides)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.countryGuides.countryId, guide.countryId), (0, drizzle_orm_1.eq)(schema_1.countryGuides.section, guide.section)));
        if (existing) {
            const [updated] = await db_1.db
                .update(schema_1.countryGuides)
                .set({ content: guide.content })
                .where((0, drizzle_orm_1.eq)(schema_1.countryGuides.id, existing.id))
                .returning();
            return updated;
        }
        const [created] = await db_1.db.insert(schema_1.countryGuides).values(guide).returning();
        return created;
    }
    async getJobLinks(countryId) {
        return db_1.db.select().from(schema_1.jobLinks).where((0, drizzle_orm_1.eq)(schema_1.jobLinks.countryId, countryId)).orderBy(schema_1.jobLinks.order);
    }
    async getJobLinkById(id) {
        const [link] = await db_1.db.select().from(schema_1.jobLinks).where((0, drizzle_orm_1.eq)(schema_1.jobLinks.id, id));
        return link;
    }
    async createJobLink(link) {
        const [created] = await db_1.db.insert(schema_1.jobLinks).values(link).returning();
        return created;
    }
    async updateJobLink(id, link) {
        const [updated] = await db_1.db.update(schema_1.jobLinks).set(link).where((0, drizzle_orm_1.eq)(schema_1.jobLinks.id, id)).returning();
        return updated;
    }
    async deleteJobLink(id) {
        await db_1.db.delete(schema_1.jobLinks).where((0, drizzle_orm_1.eq)(schema_1.jobLinks.id, id));
    }
    async incrementJobLinkClick(id) {
        await db_1.db.update(schema_1.jobLinks)
            .set({ clickCount: (0, drizzle_orm_1.sql) `${schema_1.jobLinks.clickCount} + 1` })
            .where((0, drizzle_orm_1.eq)(schema_1.jobLinks.id, id));
    }
    async verifyJobLink(id) {
        await db_1.db.update(schema_1.jobLinks)
            .set({ lastVerified: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.jobLinks.id, id));
    }
    async getAllScamAlerts() {
        return db_1.db.select().from(schema_1.scamAlerts).orderBy((0, drizzle_orm_1.desc)(schema_1.scamAlerts.createdAt));
    }
    async createScamAlert(alert) {
        const [created] = await db_1.db.insert(schema_1.scamAlerts).values(alert).returning();
        return created;
    }
    async updateScamAlert(id, data) {
        const [updated] = await db_1.db.update(schema_1.scamAlerts).set(data).where((0, drizzle_orm_1.eq)(schema_1.scamAlerts.id, id)).returning();
        return updated;
    }
    async getPayments() {
        return db_1.db.select().from(schema_1.payments).orderBy((0, drizzle_orm_1.desc)(schema_1.payments.createdAt));
    }
    async getPaymentsByUser(userId) {
        return db_1.db.select().from(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.userId, userId)).orderBy((0, drizzle_orm_1.desc)(schema_1.payments.createdAt));
    }
    async getPaymentsByStatus(status) {
        return db_1.db.select().from(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.status, status)).orderBy((0, drizzle_orm_1.desc)(schema_1.payments.createdAt));
    }
    async createPayment(payment) {
        const [created] = await db_1.db.insert(schema_1.payments).values(payment).returning();
        return created;
    }
    async updatePayment(id, payment) {
        const [updated] = await db_1.db.update(schema_1.payments).set({ ...payment, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.payments.id, id)).returning();
        return updated;
    }
    async getPaymentById(id) {
        const [row] = await db_1.db.select().from(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.id, id));
        return row;
    }
    async getPaymentByTransactionRef(ref) {
        // Check dedicated checkout_request_id column first, fall back to legacy transactionRef
        const [byCheckoutId] = await db_1.db.select().from(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.checkoutRequestId, ref));
        if (byCheckoutId)
            return byCheckoutId;
        const [byTransactionRef] = await db_1.db.select().from(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.transactionRef, ref));
        return byTransactionRef;
    }
    // Payments eligible for automatic retry (status=retry_available, retryCount < maxRetries)
    async getPaymentsEligibleForAutoRetry(gatewayMethod) {
        const conditions = [
            (0, drizzle_orm_1.eq)(schema_1.payments.status, "retry_available"),
            (0, drizzle_orm_1.sql) `${schema_1.payments.retryCount} < ${schema_1.payments.maxRetries}`,
        ];
        if (gatewayMethod) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.payments.method, gatewayMethod));
        }
        return db_1.db.select().from(schema_1.payments).where((0, drizzle_orm_1.and)(...conditions)).orderBy((0, drizzle_orm_1.asc)(schema_1.payments.createdAt));
    }
    // Atomic idempotency claim — only the first caller wins.
    // The UPDATE is conditional on processed = false, so exactly one concurrent
    // caller gets rows.length === 1 (true); all others get 0 rows (false).
    async markPaymentProcessed(paymentId) {
        const rows = await db_1.db
            .update(schema_1.payments)
            .set({ processed: true, processedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.payments.id, paymentId), (0, drizzle_orm_1.eq)(schema_1.payments.processed, false)))
            .returning({ id: schema_1.payments.id });
        return rows.length > 0;
    }
    // Reset the processed flag so Safaricom retries (after the webhook lock expires)
    // can re-attempt activation on payments that failed mid-processing.
    // Only clears the flag when status is NOT already 'success' or 'completed' —
    // a fully activated payment can never be un-processed.
    async resetPaymentProcessed(paymentId) {
        await db_1.db
            .update(schema_1.payments)
            .set({ processed: false, processedAt: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.payments.id, paymentId), (0, drizzle_orm_1.sql) `${schema_1.payments.status} NOT IN ('success', 'completed')`));
    }
    // ── Payment Retry Logs ──────────────────────────────────────────────────────
    async createPaymentRetryLog(data) {
        const [log] = await db_1.db.insert(schema_1.paymentRetryLogs).values(data).returning();
        return log;
    }
    async getPaymentRetryLogs(paymentId) {
        return db_1.db.select().from(schema_1.paymentRetryLogs)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentRetryLogs.paymentId, paymentId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.paymentRetryLogs.createdAt));
    }
    // ── Refund Requests ────────────────────────────────────────────────────────
    async createRefundRequest(data) {
        const [created] = await db_1.db.insert(schema_1.refundRequests).values(data).returning();
        return created;
    }
    async getRefundRequests() {
        return db_1.db.select().from(schema_1.refundRequests).orderBy((0, drizzle_orm_1.desc)(schema_1.refundRequests.createdAt));
    }
    async getRefundRequestsByUser(userId) {
        return db_1.db.select().from(schema_1.refundRequests).where((0, drizzle_orm_1.eq)(schema_1.refundRequests.userId, userId)).orderBy((0, drizzle_orm_1.desc)(schema_1.refundRequests.createdAt));
    }
    async getRefundRequestByPayment(paymentId) {
        const [row] = await db_1.db.select().from(schema_1.refundRequests).where((0, drizzle_orm_1.eq)(schema_1.refundRequests.paymentId, paymentId));
        return row;
    }
    async updateRefundRequest(id, data) {
        const [updated] = await db_1.db.update(schema_1.refundRequests).set({ ...data, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.refundRequests.id, id)).returning();
        return updated;
    }
    // ──────────────────────────────────────────────────────────────────────────
    async getMpesaUserByPhone(phone) {
        const [user] = await db_1.db.select().from(schema_1.mpesaUsers).where((0, drizzle_orm_1.eq)(schema_1.mpesaUsers.phone, phone)).orderBy((0, drizzle_orm_1.desc)(schema_1.mpesaUsers.id));
        return user;
    }
    async getMpesaTransactionByReceipt(receiptNumber) {
        const [tx] = await db_1.db.select().from(schema_1.mpesaUsers)
            .where((0, drizzle_orm_1.eq)(schema_1.mpesaUsers.mpesaReceipt, receiptNumber))
            .limit(1);
        return tx;
    }
    async getMpesaAllTransactions(limit = 200) {
        return db_1.db.select().from(schema_1.mpesaUsers)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.mpesaUsers.id))
            .limit(limit);
    }
    async getMpesaOrphanTransactions(limit = 100) {
        return db_1.db.select().from(schema_1.mpesaUsers)
            .where((0, drizzle_orm_1.eq)(schema_1.mpesaUsers.status, "orphan"))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.mpesaUsers.id))
            .limit(limit);
    }
    async getMpesaFailedCallbacks(limit = 100) {
        return db_1.db.select().from(schema_1.webhookProcessingLocks)
            .where((0, drizzle_orm_1.eq)(schema_1.webhookProcessingLocks.status, "failed"))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.webhookProcessingLocks.createdAt))
            .limit(limit);
    }
    async getMpesaLockedAccounts(minFailures = 3) {
        return db_1.db.select().from(schema_1.accountLockouts)
            .where((0, drizzle_orm_1.gte)(schema_1.accountLockouts.failedAttempts, minFailures))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.accountLockouts.failedAttempts));
    }
    async unlockAccount(id) {
        await db_1.db.update(schema_1.accountLockouts)
            .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.accountLockouts.id, id));
    }
    // ── Payment Audit Log ──────────────────────────────────────────────────────
    async createPaymentAuditLog(data) {
        const [row] = await db_1.db
            .insert(schema_1.paymentAuditLogs)
            .values({
            paymentId: data.paymentId ?? null,
            event: data.event,
            ip: data.ip ?? null,
            metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        })
            .returning();
        return row;
    }
    async getPaymentAuditLogs(paymentId, limit = 200) {
        if (paymentId) {
            return db_1.db
                .select()
                .from(schema_1.paymentAuditLogs)
                .where((0, drizzle_orm_1.eq)(schema_1.paymentAuditLogs.paymentId, paymentId))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.paymentAuditLogs.createdAt))
                .limit(limit);
        }
        return db_1.db
            .select()
            .from(schema_1.paymentAuditLogs)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.paymentAuditLogs.createdAt))
            .limit(limit);
    }
    // Expire any payments still in "awaiting_payment" after the cutoff window.
    // Returns the full list of expired records so callers can send user notifications.
    // NOTE: ISO-string binding — see comment in checkNotificationExists.
    async expireStalePayments(olderThanMinutes = 15) {
        const cutoffIso = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
        const expired = await db_1.db
            .update(schema_1.payments)
            .set({ status: "expired", updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.payments.status, "awaiting_payment"), (0, drizzle_orm_1.sql) `${schema_1.payments.createdAt} < ${cutoffIso}`))
            .returning();
        return expired;
    }
    async getAbandonedOrders(minMinutes = 60, maxHours = 48) {
        const minCutoffIso = new Date(Date.now() - minMinutes * 60 * 1000).toISOString();
        const maxCutoffIso = new Date(Date.now() - maxHours * 60 * 60 * 1000).toISOString();
        return db_1.db.select().from(schema_1.serviceOrders).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceOrders.status, "pending_payment"), (0, drizzle_orm_1.sql) `${schema_1.serviceOrders.createdAt} <= ${minCutoffIso}`, (0, drizzle_orm_1.sql) `${schema_1.serviceOrders.createdAt} >= ${maxCutoffIso}`, (0, drizzle_orm_1.isNull)(schema_1.serviceOrders.abandonedCartAlertSentAt))).orderBy((0, drizzle_orm_1.desc)(schema_1.serviceOrders.createdAt));
    }
    async markAbandonedCartAlerted(orderId) {
        await db_1.db.update(schema_1.serviceOrders)
            .set({ abandonedCartAlertSentAt: new Date(), updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.serviceOrders.id, orderId));
    }
    async expireStaleServiceOrders(olderThanHours = 48) {
        const cutoffIso = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
        // Walk an unknown error chain (drizzle wraps pg errors under `cause`).
        // We need to detect 23514 whether it's `err.code`, `err.cause.code`, or
        // `err.cause.cause.code`.
        const isCheckRejection = (e) => {
            for (let cur = e, depth = 0; cur && depth < 5; cur = cur.cause, depth++) {
                if (String(cur.code ?? "") === "23514")
                    return true;
                if (/service_orders_status_check/i.test(String(cur.message ?? "")))
                    return true;
                if (/service_orders_status_check/i.test(String(cur.constraint ?? "")))
                    return true;
            }
            return false;
        };
        // SELF-HEAL: widen the CHECK constraint inline so subsequent runs don't
        // crash. We also widen the bootup helper in seed.ts, but that one runs
        // fire-and-forget and races with this loop. This makes the storage layer
        // itself responsible for ensuring the schema can hold 'expired'.
        let widenedThisCall = false;
        const widenConstraintInline = async () => {
            if (widenedThisCall)
                return false;
            widenedThisCall = true;
            try {
                console.warn("[storage] widening service_orders_status_check inline to add 'expired'");
                await db_1.pool.query(`ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_status_check;`);
                await db_1.pool.query(`
          ALTER TABLE service_orders
            ADD CONSTRAINT service_orders_status_check
            CHECK (status IN (
              'pending_payment','paid','processing','completed',
              'failed','cancelled','expired'
            ));
        `);
                console.log("[storage] service_orders_status_check widened — retrying with 'expired'");
                return true;
            }
            catch (alterErr) {
                console.error("[storage] inline widen failed:", alterErr?.message ?? alterErr);
                return false;
            }
        };
        const runUpdate = (status) => db_1.db.update(schema_1.serviceOrders)
            .set({ status, updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceOrders.status, "pending_payment"), (0, drizzle_orm_1.sql) `${schema_1.serviceOrders.updatedAt} < ${cutoffIso}`))
            .returning();
        try {
            return await runUpdate("expired");
        }
        catch (err) {
            if (!isCheckRejection(err))
                throw err;
            // Try widening, then retrying with 'expired'.
            const widened = await widenConstraintInline();
            if (widened) {
                try {
                    return await runUpdate("expired");
                }
                catch (retryErr) {
                    console.warn("[storage] retry after widen still failed:", retryErr?.message);
                }
            }
            // Final fallback — use 'cancelled' so the cleanup loop never crashes
            // even if we couldn't widen the schema (e.g. role lacks ALTER perms).
            console.warn("[storage] expireStaleServiceOrders falling back to status='cancelled'");
            return await runUpdate("cancelled");
        }
    }
    // ───────────────────────────────────────────────────────────────────────────
    async createMpesaTransaction(data) {
        const [created] = await db_1.db.insert(schema_1.mpesaUsers).values(data).returning();
        return created;
    }
    async updateMpesaTransaction(id, data) {
        const [updated] = await db_1.db.update(schema_1.mpesaUsers).set(data).where((0, drizzle_orm_1.eq)(schema_1.mpesaUsers.id, id)).returning();
        return updated;
    }
    async getServices() {
        return db_1.db.select().from(schema_1.services).orderBy(schema_1.services.order);
    }
    async getServiceById(id) {
        const [row] = await db_1.db.select().from(schema_1.services).where((0, drizzle_orm_1.eq)(schema_1.services.id, id)).limit(1);
        return row;
    }
    async getServiceBySlug(slug) {
        const [row] = await db_1.db.select().from(schema_1.services).where((0, drizzle_orm_1.eq)(schema_1.services.slug, slug)).limit(1);
        return row;
    }
    async createService(service) {
        const [created] = await db_1.db.insert(schema_1.services).values(service).returning();
        return created;
    }
    async updateService(id, service) {
        const [updated] = await db_1.db.update(schema_1.services).set(service).where((0, drizzle_orm_1.eq)(schema_1.services.id, id)).returning();
        return updated;
    }
    async deleteService(id) {
        await db_1.db.delete(schema_1.services).where((0, drizzle_orm_1.eq)(schema_1.services.id, id));
    }
    async getUserSubscription(userId) {
        const now = new Date();
        // Prefer the most-recent active, non-expired subscription.
        // Falls back to any subscription (even expired) if none is active — callers must check status/endDate.
        const [active] = await db_1.db
            .select()
            .from(schema_1.userSubscriptions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userSubscriptions.status, "active"), (0, drizzle_orm_1.or)((0, drizzle_orm_1.sql) `${schema_1.userSubscriptions.endDate} IS NULL`, (0, drizzle_orm_1.gte)(schema_1.userSubscriptions.endDate, now))))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.userSubscriptions.createdAt));
        if (active)
            return active;
        // No active non-expired subscription — return the most recent row for display purposes
        const [latest] = await db_1.db
            .select()
            .from(schema_1.userSubscriptions)
            .where((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.userSubscriptions.createdAt));
        return latest;
    }
    async createUserSubscription(subscription) {
        const [created] = await db_1.db.insert(schema_1.userSubscriptions).values(subscription).returning();
        // Sync denormalised plan field
        if (subscription.plan && subscription.status === "active") {
            await db_1.db.update(auth_1.users).set({ plan: subscription.plan, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(auth_1.users.id, subscription.userId)).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }
        return created;
    }
    async getAllSubscriptions() {
        return db_1.db.select().from(schema_1.userSubscriptions);
    }
    async updateSubscriptionStatus(userId, active) {
        await db_1.db
            .update(schema_1.userSubscriptions)
            .set({ status: active ? "active" : "canceled", updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.userId, userId));
    }
    async createSubscription(userId) {
        const [created] = await db_1.db
            .insert(schema_1.userSubscriptions)
            .values({
            userId,
            paymentId: null,
            status: "active",
            plan: "pro",
            endDate: null,
            autoRenew: true,
        })
            .returning();
        return created;
    }
    // ── Plan management ───────────────────────────────────────────────────────
    async getPlans(includeInactive = false) {
        const query = db_1.db.select().from(schema_1.plans);
        if (!includeInactive) {
            return query.where((0, drizzle_orm_1.eq)(schema_1.plans.isActive, true)).orderBy(schema_1.plans.displayOrder, schema_1.plans.price);
        }
        return query.orderBy(schema_1.plans.displayOrder, schema_1.plans.price);
    }
    async getPlanById(planId) {
        const [plan] = await db_1.db.select().from(schema_1.plans).where((0, drizzle_orm_1.eq)(schema_1.plans.planId, planId));
        return plan;
    }
    async updatePlan(planId, data) {
        const { planId: _id, createdAt: _c, ...safeData } = data;
        const [updated] = await db_1.db
            .update(schema_1.plans)
            .set({ ...safeData, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.plans.planId, planId))
            .returning();
        return updated;
    }
    async upsertPlan(data) {
        const [result] = await db_1.db
            .insert(schema_1.plans)
            .values({ ...data, updatedAt: new Date() })
            .onConflictDoUpdate({
            target: schema_1.plans.planId,
            set: { ...data, updatedAt: new Date() },
        })
            .returning();
        return result;
    }
    async updateUserLastSeen(userId) {
        await db_1.db.update(auth_1.users).set({ lastSeen: new Date() }).where((0, drizzle_orm_1.eq)(auth_1.users.id, userId));
    }
    async getUserPlan(userId) {
        const sub = await this.getUserSubscription(userId);
        // Always fetch users.plan — used as authoritative fallback for admin-promoted accounts
        const [userRow] = await db_1.db.select({ plan: auth_1.users.plan }).from(auth_1.users).where((0, drizzle_orm_1.eq)(auth_1.users.id, userId));
        const usersPlan = userRow?.plan || "free";
        // 2026-06 DIAGNOSTIC: log every gate-relevant tier decision with full
        // context. Founder reported a paying user appearing as "free" — this
        // makes the audit trail visible in Render logs so we can answer
        // "what tier did getUserPlan return at time T for user X?" instantly.
        const logCtx = `userId=${userId} usersPlan="${usersPlan}" subStatus=${sub?.status ?? "none"} subPlan=${sub?.plan ?? "?"} subEnd=${sub?.endDate ? new Date(sub.endDate).toISOString() : "null"}`;
        // If there's an active, non-expired subscription, return its plan
        if (sub && sub.status === "active") {
            if (!sub.endDate || sub.endDate >= new Date()) {
                if (sub.plan) {
                    // Active + non-expired + plan set — the canonical happy path
                    return sub.plan;
                }
                // Subscription is active but plan is null (legacy row) — trust users.plan
                if (usersPlan !== "free") {
                    console.info(`[getUserPlan] ${logCtx} → result="${usersPlan}" reason=active_sub_no_plan_field_fallback_users_plan`);
                }
                return usersPlan;
            }
            // 2026-06 BUGFIX: Renewal protection. Before declaring this user "expired",
            // check if they have a successful M-Pesa payment in the last 5 minutes.
            // If so, the callback is probably mid-flight — return their previous plan
            // until the new subscription row commits. Prevents the "I paid but I'm
            // back on free" race that founder reported.
            const recentPayCheck = await db_1.pool.query(`SELECT COUNT(*)::text AS count FROM payments
          WHERE user_id = $1 AND method = 'mpesa'
            AND status IN ('success', 'completed')
            AND created_at > NOW() - INTERVAL '5 minutes'`, [userId]).catch(() => ({ rows: [{ count: "0" }] }));
            if (Number(recentPayCheck.rows[0]?.count ?? 0) > 0) {
                console.warn(`[getUserPlan] ${logCtx} → result="${sub.plan ?? usersPlan}" reason=RENEWAL_PROTECTION_recent_payment_within_5min`);
                return sub.plan || usersPlan;
            }
            // Subscription exists but is expired AND no recent payment — proceed with downgrade
            console.warn(`[getUserPlan] ${logCtx} → result="free" reason=sub_expired_lazy_downgrade`);
            db_1.db.update(schema_1.userSubscriptions).set({ status: "expired", updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.userId, userId)).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
            db_1.db.update(auth_1.users).set({ plan: "free", subscriptionStatus: "expired", updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(auth_1.users.id, userId)).catch((err) => {
                console.warn(`[getUserPlan] Could not sync expired plan for userId=${userId}:`, err?.message);
            });
            // Mirror expiry to Supabase subscriptions table
            Promise.resolve().then(() => __importStar(require("./supabaseClient"))).then(({ downgradeSupabaseUser }) => downgradeSupabaseUser(userId)).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
            return "free";
        }
        // No active subscription in userSubscriptions — but still check for a recent
        // payment before declaring them free. Same renewal-protection logic.
        if (usersPlan === "free") {
            const recentPayCheck = await db_1.pool.query(`SELECT COUNT(*)::text AS count, MAX(plan_id) AS plan_id FROM payments
          WHERE user_id = $1 AND method = 'mpesa'
            AND status IN ('success', 'completed')
            AND plan_id IS NOT NULL
            AND created_at > NOW() - INTERVAL '5 minutes'`, [userId]).catch(() => ({ rows: [{ count: "0", plan_id: null }] }));
            if (Number(recentPayCheck.rows[0]?.count ?? 0) > 0) {
                const protectivePlan = recentPayCheck.rows[0]?.plan_id || "trial";
                console.warn(`[getUserPlan] ${logCtx} → result="${protectivePlan}" reason=RENEWAL_PROTECTION_no_sub_yet_but_recent_payment`);
                return protectivePlan;
            }
        }
        if (usersPlan !== "free") {
            console.info(`[getUserPlan] ${logCtx} → result="${usersPlan}" reason=no_active_sub_fallback_users_plan`);
        }
        return usersPlan;
    }
    async activateUserPlan(userId, planId, paymentId, expiresAt) {
        // Use a real DB transaction so all three writes (expire old, insert new, sync users.plan)
        // are atomic.  A crash between any of them can no longer leave inconsistent state.
        const client = await db_1.pool.connect();
        try {
            await client.query("BEGIN");
            // Lock the current active subscription row (if any) so parallel callbacks
            // can't read a stale end_date and both compute the same extension.
            const { rows: [existing] } = await client.query(`SELECT end_date FROM user_subscriptions
         WHERE user_id = $1 AND status = 'active'
         ORDER BY end_date DESC NULLS LAST
         LIMIT 1
         FOR UPDATE`, [userId]);
            // Extension logic:
            // • If the user already has time left → add the new plan's duration to
            //   their current expiry (they don't lose remaining days when they renew early)
            // • If the subscription has lapsed → use the fresh expiresAt passed in
            //
            // 2026-06 hardening: the previous code defaulted to 360 days if the
            // caller forgot to pass expiresAt — that's a silent footgun that would
            // give a KES 99 trial user 360 days of access. Now we compute the
            // correct default per-plan: trial=1d, monthly=30d, yearly/pro=365d.
            const PLAN_DAYS = {
                trial: 1,
                monthly: 30,
                yearly: 365,
                pro: 365,
            };
            const defaultDays = PLAN_DAYS[planId] ?? PLAN_DAYS.pro;
            const now = new Date();
            const freshExpiry = expiresAt ?? new Date(Date.now() + defaultDays * 86400000);
            const duration = freshExpiry.getTime() - now.getTime();
            const currentExpiry = existing?.end_date ? new Date(existing.end_date) : null;
            const finalExpiry = (currentExpiry && currentExpiry > now)
                ? new Date(currentExpiry.getTime() + duration) // extend
                : freshExpiry; // fresh start
            // Expire all currently-active rows for this user (keeps the table tidy)
            await client.query(`UPDATE user_subscriptions
         SET status = 'expired', updated_at = now()
         WHERE user_id = $1 AND status = 'active'`, [userId]);
            // Insert the new active subscription
            const { rows: [created] } = await client.query(`INSERT INTO user_subscriptions
           (user_id, payment_id, status, plan, end_date, auto_renew, created_at, updated_at)
         VALUES ($1, $2, 'active', $3, $4, true, now(), now())
         RETURNING *`, [userId, paymentId || null, planId, finalExpiry]);
            // Sync denormalised fields so gating checks are instant (no join needed)
            await client.query(`UPDATE users SET plan = $1, subscription_status = 'active', updated_at = now() WHERE id = $2`, [planId, userId]);
            await client.query("COMMIT");
            if (currentExpiry && currentExpiry > now) {
                console.log(`[activateUserPlan] Extended "${planId}" for userId=${userId} ` +
                    `from ${currentExpiry.toISOString()} → ${finalExpiry.toISOString()}`);
            }
            else {
                console.log(`[activateUserPlan] Activated "${planId}" for userId=${userId} ` +
                    `| expires=${finalExpiry.toISOString()}`);
            }
            return created;
        }
        catch (err) {
            await client.query("ROLLBACK");
            console.error(`[activateUserPlan] Transaction rolled back for userId=${userId}:`, err?.message);
            throw err;
        }
        finally {
            client.release();
        }
    }
    // ── Promo codes ────────────────────────────────────────────────────────────
    async createPromoCode(data) {
        const [row] = await db_1.db
            .insert(schema_1.promoCodes)
            .values({ ...data, updatedAt: new Date() })
            .returning();
        return row;
    }
    // Case-insensitive lookup; checks active flag and expiry in-app (callers decide on expired codes).
    async getPromoCode(code) {
        const [row] = await db_1.db
            .select()
            .from(schema_1.promoCodes)
            .where((0, drizzle_orm_1.sql) `LOWER(${schema_1.promoCodes.code}) = LOWER(${code})`);
        return row;
    }
    // Atomically claim one use of a promo code.
    // Returns true if the increment succeeded (used_count was still < maxUses or unlimited).
    // Uses UPDATE WHERE ... RETURNING to avoid a race condition between the check and increment.
    async usePromoCode(codeId, maxUses) {
        if (maxUses === null) {
            // Unlimited uses — just increment
            const rows = await db_1.db
                .update(schema_1.promoCodes)
                .set({ usedCount: (0, drizzle_orm_1.sql) `${schema_1.promoCodes.usedCount} + 1`, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.promoCodes.id, codeId))
                .returning({ id: schema_1.promoCodes.id });
            return rows.length > 0;
        }
        // Limited uses — conditional increment (only when room remains)
        const rows = await db_1.db
            .update(schema_1.promoCodes)
            .set({ usedCount: (0, drizzle_orm_1.sql) `${schema_1.promoCodes.usedCount} + 1`, updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.promoCodes.id, codeId), (0, drizzle_orm_1.sql) `${schema_1.promoCodes.usedCount} < ${maxUses}`))
            .returning({ id: schema_1.promoCodes.id });
        return rows.length > 0;
    }
    async listPromoCodes() {
        return db_1.db.select().from(schema_1.promoCodes).orderBy((0, drizzle_orm_1.desc)(schema_1.promoCodes.createdAt));
    }
    async updatePromoCode(id, data) {
        const [row] = await db_1.db
            .update(schema_1.promoCodes)
            .set({ ...data, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.promoCodes.id, id))
            .returning();
        return row;
    }
    // ── Service unlock ────────────────────────────────────────────────────────
    // Idempotent: uses ON CONFLICT DO UPDATE so duplicate calls are safe.
    async unlockService(userId, serviceId, paymentId, metadata) {
        const [row] = await db_1.db
            .insert(schema_1.userServices)
            .values({
            userId,
            serviceId,
            paymentId,
            unlockedAt: new Date(),
            expiresAt: null,
            metadata: metadata ? JSON.stringify(metadata) : null,
        })
            .onConflictDoUpdate({
            target: [schema_1.userServices.userId, schema_1.userServices.serviceId],
            set: {
                paymentId,
                unlockedAt: new Date(),
                metadata: metadata ? JSON.stringify(metadata) : null,
            },
        })
            .returning();
        return row;
    }
    async getUserServices(userId) {
        return db_1.db
            .select()
            .from(schema_1.userServices)
            .where((0, drizzle_orm_1.eq)(schema_1.userServices.userId, userId));
    }
    async hasServiceAccess(userId, serviceId) {
        const [row] = await db_1.db
            .select({ id: schema_1.userServices.id, expiresAt: schema_1.userServices.expiresAt })
            .from(schema_1.userServices)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userServices.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userServices.serviceId, serviceId)));
        if (!row)
            return false;
        if (row.expiresAt && row.expiresAt < new Date())
            return false;
        return true;
    }
    async getUserByPhone(phone) {
        const { normalizePhone } = await Promise.resolve().then(() => __importStar(require("./utils/phone")));
        const normalized = normalizePhone(phone.trim());
        console.info(`[Storage][getUserByPhone] searching phone="${normalized}"`);
        const [user] = await db_1.db
            .select()
            .from(auth_1.users)
            .where((0, drizzle_orm_1.eq)(auth_1.users.phone, normalized));
        console.info(`[Storage][getUserByPhone] ${user ? `found userId=${user.id}` : "not found"}`);
        return user;
    }
    async getUserByEmail(email) {
        const normalized = email.toLowerCase().trim();
        const [user] = await db_1.db
            .select()
            .from(auth_1.users)
            .where((0, drizzle_orm_1.ilike)(auth_1.users.email, normalized));
        return user;
    }
    // Canonical lookup: if input contains "@" → search by email, otherwise → normalize phone and search by phone.
    async getUserByEmailOrPhone(identifier) {
        const raw = identifier.trim();
        if (raw.includes("@")) {
            console.info(`[Storage][getUserByEmailOrPhone] searching by email="${raw.toLowerCase()}"`);
            const user = await this.getUserByEmail(raw);
            console.info(`[Storage][getUserByEmailOrPhone] email search ${user ? `found userId=${user.id}` : "not found"}`);
            return user;
        }
        // Phone lookup
        const { normalizePhone } = await Promise.resolve().then(() => __importStar(require("./utils/phone")));
        const normalized = normalizePhone(raw);
        console.info(`[Storage][getUserByEmailOrPhone] searching by phone="${normalized}" (raw="${raw}")`);
        const user = await this.getUserByPhone(normalized);
        console.info(`[Storage][getUserByEmailOrPhone] phone search ${user ? `found userId=${user.id}` : "not found"}`);
        return user;
    }
    // Legacy: email-first lookup — if input contains "@" query by email; otherwise query by id.
    async getUserByEmailOrId(emailOrId) {
        const isEmail = emailOrId.includes("@");
        if (isEmail) {
            return this.getUserByEmail(emailOrId);
        }
        return this.getUserById(emailOrId);
    }
    async getAllUsers() {
        return db_1.db.select().from(auth_1.users).orderBy((0, drizzle_orm_1.desc)(auth_1.users.createdAt));
    }
    async getFilteredUsers(opts) {
        const { search = "", plan = "all", status = "all", page = 1, limit = 20 } = opts;
        const offset = (page - 1) * limit;
        const conditions = [];
        if (search.trim()) {
            const q = `%${search.trim().toLowerCase()}%`;
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(auth_1.users.email, q), (0, drizzle_orm_1.ilike)(auth_1.users.firstName, q), (0, drizzle_orm_1.ilike)(auth_1.users.lastName, q), (0, drizzle_orm_1.ilike)(auth_1.users.phone, q)));
        }
        if (plan === "paid" || plan === "pro") {
            // Match users whose plan column is "pro" OR who have an active pro subscription
            // (covers cases where users.plan was not yet synced after a runtime grant)
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(auth_1.users.plan, "pro"), (0, drizzle_orm_1.sql) `EXISTS (
          SELECT 1 FROM user_subscriptions us
          WHERE us.user_id = users.id
            AND us.plan = 'pro'
            AND us.status = 'active'
            AND (us.end_date IS NULL OR us.end_date > NOW())
        )`));
        }
        else if (plan === "free") {
            // Free = no "pro" in users.plan AND no active pro subscription
            conditions.push((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(auth_1.users.plan, "free"), (0, drizzle_orm_1.sql) `users.plan IS NULL`), (0, drizzle_orm_1.sql) `NOT EXISTS (
          SELECT 1 FROM user_subscriptions us
          WHERE us.user_id = users.id
            AND us.plan = 'pro'
            AND us.status = 'active'
            AND (us.end_date IS NULL OR us.end_date > NOW())
        )`));
        }
        else if (plan !== "all") {
            conditions.push((0, drizzle_orm_1.eq)(auth_1.users.plan, plan));
        }
        if (status === "active") {
            conditions.push((0, drizzle_orm_1.eq)(auth_1.users.isActive, true));
        }
        else if (status === "inactive") {
            conditions.push((0, drizzle_orm_1.eq)(auth_1.users.isActive, false));
        }
        const where = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const [totalResult, userRows] = await Promise.all([
            db_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(auth_1.users).where(where),
            db_1.db.select({
                id: auth_1.users.id,
                email: auth_1.users.email,
                firstName: auth_1.users.firstName,
                lastName: auth_1.users.lastName,
                phone: auth_1.users.phone,
                country: auth_1.users.country,
                isAdmin: auth_1.users.isAdmin,
                isActive: auth_1.users.isActive,
                role: auth_1.users.role,
                plan: auth_1.users.plan,
                userStage: auth_1.users.userStage,
                authMethod: auth_1.users.authMethod,
                referralCode: auth_1.users.referralCode,
                createdAt: auth_1.users.createdAt,
                updatedAt: auth_1.users.updatedAt,
                lastLogin: auth_1.users.lastLogin,
            }).from(auth_1.users).where(where).orderBy((0, drizzle_orm_1.asc)(auth_1.users.firstName), (0, drizzle_orm_1.asc)(auth_1.users.lastName), (0, drizzle_orm_1.asc)(auth_1.users.email)).limit(limit).offset(offset),
        ]);
        const totalUsers = Number(totalResult[0]?.count ?? 0);
        const totalPages = Math.ceil(totalUsers / limit);
        return {
            users: userRows,
            totalUsers,
            totalPages,
            currentPage: page,
        };
    }
    async getUserById(id) {
        const [user] = await db_1.db.select().from(auth_1.users).where((0, drizzle_orm_1.eq)(auth_1.users.id, id));
        return user;
    }
    async getUserByReferralCode(code) {
        const [user] = await db_1.db.select().from(auth_1.users).where((0, drizzle_orm_1.eq)(auth_1.users.referralCode, code));
        return user;
    }
    async generateAndSaveReferralCode(userId) {
        const user = await this.getUserById(userId);
        if (user?.referralCode)
            return user.referralCode;
        const { generateUniqueReferralCode } = await Promise.resolve().then(() => __importStar(require("./utils/referral-code")));
        const code = await generateUniqueReferralCode();
        await db_1.db.update(auth_1.users).set({ referralCode: code, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(auth_1.users.id, userId));
        return code;
    }
    async updateUserProfile(id, data) {
        // Always store phone in normalized 254XXXXXXXXX format
        const payload = { ...data };
        if (payload.phone) {
            const { normalizePhone } = await Promise.resolve().then(() => __importStar(require("./utils/phone")));
            payload.phone = normalizePhone(payload.phone.trim());
        }
        const [updated] = await db_1.db
            .update(auth_1.users)
            .set({
            ...payload,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(auth_1.users.id, id))
            .returning();
        return updated;
    }
    async updateUserStage(userId, stage) {
        await db_1.db
            .update(auth_1.users)
            .set({ userStage: stage, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(auth_1.users.id, userId))
            .catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    }
    async getNonPayingUsers(limit = 500) {
        // Users who are still on the free plan — registered but never converted
        return db_1.db
            .select()
            .from(auth_1.users)
            .where((0, drizzle_orm_1.eq)(auth_1.users.plan, "free"))
            .orderBy((0, drizzle_orm_1.desc)(auth_1.users.createdAt))
            .limit(limit);
    }
    async getFunnelStageStats() {
        const all = await db_1.db.select({ stage: auth_1.users.userStage }).from(auth_1.users);
        const total = all.length;
        if (total === 0)
            return [];
        const counts = { new: 0, active: 0, paid: 0, inactive: 0 };
        for (const u of all) {
            const s = u.stage ?? "new";
            counts[s] = (counts[s] ?? 0) + 1;
        }
        return Object.entries(counts).map(([stage, count]) => ({
            stage,
            count,
            percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        }));
    }
    async updateUserStatus(id, isActive) {
        const [updated] = await db_1.db
            .update(auth_1.users)
            .set({ isActive, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(auth_1.users.id, id))
            .returning();
        return updated;
    }
    async setUserAdmin(id, isAdmin) {
        const [updated] = await db_1.db
            .update(auth_1.users)
            .set({ isAdmin, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(auth_1.users.id, id))
            .returning();
        return updated;
    }
    async isUserAdmin(userId) {
        const user = await this.getUserById(userId);
        return user?.isAdmin || false;
    }
    // Referral methods
    async createReferral(data) {
        const [created] = await db_1.db
            .insert(schema_1.referrals)
            .values(data)
            .returning();
        return created;
    }
    async getReferrals() {
        return db_1.db.select().from(schema_1.referrals).orderBy((0, drizzle_orm_1.desc)(schema_1.referrals.createdAt));
    }
    async getReferralsByCode(refCode) {
        return db_1.db
            .select()
            .from(schema_1.referrals)
            .where((0, drizzle_orm_1.eq)(schema_1.referrals.refCode, refCode))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.referrals.createdAt));
    }
    async updateReferralStatus(id, status, transactionId) {
        const updateData = { status };
        if (status === "paid") {
            updateData.paidAt = new Date();
            if (transactionId) {
                updateData.transactionId = transactionId;
            }
        }
        const [updated] = await db_1.db
            .update(schema_1.referrals)
            .set(updateData)
            .where((0, drizzle_orm_1.eq)(schema_1.referrals.id, id))
            .returning();
        return updated;
    }
    async getPendingReferrals(maxRetries = 5) {
        return db_1.db
            .select()
            .from(schema_1.referrals)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.referrals.status, "pending"), (0, drizzle_orm_1.sql) `${schema_1.referrals.retryCount} < ${maxRetries}`))
            .orderBy(schema_1.referrals.createdAt);
    }
    async markReferralPayoutAttempt(id, transactionId) {
        const [updated] = await db_1.db
            .update(schema_1.referrals)
            .set({
            status: "processing",
            transactionId,
            lastPayoutAttempt: new Date(),
            retryCount: (0, drizzle_orm_1.sql) `${schema_1.referrals.retryCount} + 1`,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.referrals.id, id))
            .returning();
        return updated;
    }
    async markReferralFailed(id) {
        const [updated] = await db_1.db
            .update(schema_1.referrals)
            .set({
            status: "failed",
            lastPayoutAttempt: new Date(),
            retryCount: (0, drizzle_orm_1.sql) `${schema_1.referrals.retryCount} + 1`,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.referrals.id, id))
            .returning();
        return updated;
    }
    // Fraud detection: Check for self-referrals and loops
    async checkFraud(refCode, referredPhone) {
        // Check if the referred phone has already been used
        const existingReferral = await db_1.db
            .select()
            .from(schema_1.referrals)
            .where((0, drizzle_orm_1.eq)(schema_1.referrals.referredPhone, referredPhone));
        if (existingReferral.length > 0) {
            return { isFraud: true, reason: "Phone number already referred" };
        }
        // SECURITY: Check for self-referral by comparing influencer's phone with payer's phone
        const influencer = await this.getInfluencerByRefCode(refCode);
        if (influencer && influencer.phone) {
            // Normalize both phones to 2547XXXXXXXX format for comparison
            const { normalizePhone: normPhone } = await Promise.resolve().then(() => __importStar(require("./utils/phone")));
            if (normPhone(influencer.phone) === normPhone(referredPhone)) {
                return { isFraud: true, reason: "Self-referral detected" };
            }
        }
        // Check for duplicate referral from same refCode to same phone
        const refOwnerReferrals = await this.getReferralsByCode(refCode);
        if (refOwnerReferrals.some(r => r.referredPhone === referredPhone)) {
            return { isFraud: true, reason: "Duplicate referral detected" };
        }
        return { isFraud: false };
    }
    // Get referral by referred phone
    async getReferralByPhone(phone) {
        const [result] = await db_1.db
            .select()
            .from(schema_1.referrals)
            .where((0, drizzle_orm_1.eq)(schema_1.referrals.referredPhone, phone));
        return result;
    }
    // Top partners analytics
    async getTopPartners(limit = 10) {
        const allReferrals = await this.getReferrals();
        const partnerStats = {};
        for (const ref of allReferrals) {
            if (!partnerStats[ref.refCode]) {
                partnerStats[ref.refCode] = { totalReferrals: 0, totalCommission: 0, pendingPayout: 0 };
            }
            partnerStats[ref.refCode].totalReferrals++;
            partnerStats[ref.refCode].totalCommission += ref.commission;
            if (ref.status === "pending") {
                partnerStats[ref.refCode].pendingPayout += ref.commission;
            }
        }
        return Object.entries(partnerStats)
            .map(([refCode, data]) => ({ refCode, ...data }))
            .sort((a, b) => b.totalReferrals - a.totalReferrals)
            .slice(0, limit);
    }
    async getReferralStats() {
        const allReferrals = await this.getReferrals();
        const stats = {};
        for (const ref of allReferrals) {
            if (!stats[ref.refCode]) {
                stats[ref.refCode] = { total: 0, pending: 0, paid: 0, totalCommission: 0 };
            }
            stats[ref.refCode].total++;
            stats[ref.refCode].totalCommission += ref.commission;
            if (ref.status === "pending") {
                stats[ref.refCode].pending++;
            }
            else if (ref.status === "paid") {
                stats[ref.refCode].paid++;
            }
        }
        return Object.entries(stats).map(([refCode, data]) => ({
            refCode,
            ...data,
        }));
    }
    // Influencer management
    async createInfluencer(data) {
        const [influencer] = await db_1.db.insert(schema_1.influencers).values(data).returning();
        return influencer;
    }
    async getInfluencers() {
        return db_1.db.select().from(schema_1.influencers).orderBy((0, drizzle_orm_1.desc)(schema_1.influencers.createdAt));
    }
    // Admin audit logging
    async logAdminAction(adminId, action, target, ipAddress) {
        const [log] = await db_1.db.insert(schema_1.adminLogs).values({
            adminId,
            action,
            target: target ? JSON.stringify(target) : null,
            ipAddress: ipAddress || null,
        }).returning();
        return log;
    }
    async getAdminLogs(limit = 100) {
        return db_1.db.select().from(schema_1.adminLogs).orderBy((0, drizzle_orm_1.desc)(schema_1.adminLogs.timestamp)).limit(limit);
    }
    async getInfluencerByRefCode(refCode) {
        const [result] = await db_1.db.select().from(schema_1.influencers).where((0, drizzle_orm_1.eq)(schema_1.influencers.refCode, refCode));
        return result;
    }
    async getInfluencerByUserId(userId) {
        const [result] = await db_1.db.select().from(schema_1.influencers).where((0, drizzle_orm_1.eq)(schema_1.influencers.userId, userId));
        return result;
    }
    async updateInfluencerStatus(id, status) {
        const updateData = { status };
        if (status === "approved") {
            updateData.approvedAt = new Date();
        }
        const [updated] = await db_1.db.update(schema_1.influencers).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.influencers.id, id)).returning();
        return updated;
    }
    async updateInfluencerStats(refCode, referralAmount) {
        const influencer = await this.getInfluencerByRefCode(refCode);
        if (influencer) {
            await db_1.db.update(schema_1.influencers)
                .set({
                totalReferrals: influencer.totalReferrals + 1,
                totalEarnings: influencer.totalEarnings + referralAmount
            })
                .where((0, drizzle_orm_1.eq)(schema_1.influencers.refCode, refCode));
        }
    }
    async getUserCount() {
        const result = await db_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(auth_1.users);
        return Number(result[0]?.count ?? 0);
    }
    async getSignupStats() {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const [todayRows, weekRows, monthRows] = await Promise.all([
            db_1.db.select({ c: (0, drizzle_orm_1.count)() }).from(auth_1.users).where((0, drizzle_orm_1.gte)(auth_1.users.createdAt, todayStart)),
            db_1.db.select({ c: (0, drizzle_orm_1.count)() }).from(auth_1.users).where((0, drizzle_orm_1.gte)(auth_1.users.createdAt, weekStart)),
            db_1.db.select({ c: (0, drizzle_orm_1.count)() }).from(auth_1.users).where((0, drizzle_orm_1.gte)(auth_1.users.createdAt, monthStart)),
        ]);
        return {
            today: Number(todayRows[0]?.c ?? 0),
            thisWeek: Number(weekRows[0]?.c ?? 0),
            thisMonth: Number(monthRows[0]?.c ?? 0),
        };
    }
    async getActiveSubscriptionCount() {
        // Count DISTINCT real users who have an active paid subscription.
        // Uses INNER JOIN with the users table to exclude orphaned/test data rows
        // whose user_id no longer exists in the users table.
        const result = await db_1.db
            .select({ c: (0, drizzle_orm_1.sql) `count(distinct ${schema_1.userSubscriptions.userId})` })
            .from(schema_1.userSubscriptions)
            .innerJoin(auth_1.users, (0, drizzle_orm_1.eq)(schema_1.userSubscriptions.userId, auth_1.users.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.status, "active"), (0, drizzle_orm_1.inArray)(schema_1.userSubscriptions.plan, ["pro"])));
        return Number(result[0]?.c ?? 0);
    }
    async getTotalRevenue() {
        const result = await db_1.db.select().from(schema_1.payments)
            .where((0, drizzle_orm_1.sql) `status IN ('completed', 'success')`);
        return result.reduce((sum, p) => sum + p.amount, 0);
    }
    async getRevenueToday() {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const result = await db_1.db.select().from(schema_1.payments)
            .where((0, drizzle_orm_1.sql) `status IN ('completed', 'success') AND created_at >= ${startOfDay.toISOString()}`);
        return result.reduce((sum, p) => sum + p.amount, 0);
    }
    generateRefCode(user) {
        return user.firstName
            ? `${user.firstName.toUpperCase()}${user.id?.slice(-4) || ""}`
            : `USER${user.id?.slice(-6) || ""}`;
    }
    async exportUserData(userId) {
        const user = await this.getUserById(userId);
        if (!user)
            return {};
        const refCode = this.generateRefCode(user);
        const [userPayments, subscription, userReferrals, userOrders, userNotifs, userAlerts, userCareerProfile, userBookings, userTracked, userJobApps, userAppPacks, userInfluencer,] = await Promise.all([
            db_1.db.select().from(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.userId, userId)),
            this.getUserSubscription(userId),
            db_1.db.select().from(schema_1.referrals).where((0, drizzle_orm_1.eq)(schema_1.referrals.refCode, refCode)),
            db_1.db.select().from(schema_1.serviceOrders).where((0, drizzle_orm_1.eq)(schema_1.serviceOrders.userId, userId)),
            db_1.db.select().from(schema_1.userNotifications).where((0, drizzle_orm_1.eq)(schema_1.userNotifications.userId, userId)),
            db_1.db.select().from(schema_1.jobAlertSubscriptions).where((0, drizzle_orm_1.eq)(schema_1.jobAlertSubscriptions.userId, userId)),
            db_1.db.select().from(schema_1.userCareerProfiles).where((0, drizzle_orm_1.eq)(schema_1.userCareerProfiles.userId, userId)),
            db_1.db.select().from(schema_1.consultationBookings).where((0, drizzle_orm_1.eq)(schema_1.consultationBookings.userId, userId)),
            db_1.db.select().from(schema_1.trackedApplications).where((0, drizzle_orm_1.eq)(schema_1.trackedApplications.userId, userId)),
            db_1.db.select().from(schema_1.userJobApplications).where((0, drizzle_orm_1.eq)(schema_1.userJobApplications.userId, userId)),
            db_1.db.select().from(schema_1.userApplicationPacks).where((0, drizzle_orm_1.eq)(schema_1.userApplicationPacks.userId, userId)),
            db_1.db.select().from(schema_1.influencers).where((0, drizzle_orm_1.eq)(schema_1.influencers.userId, userId)),
        ]);
        return {
            exportDate: new Date().toISOString(),
            profile: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                phone: user.phone,
                country: user.country,
                consentAccepted: user.consentAccepted,
                createdAt: user.createdAt,
            },
            subscription: subscription || null,
            payments: userPayments,
            referrals: userReferrals,
            serviceOrders: userOrders,
            trackedApplications: userTracked,
            jobApplications: userJobApps,
            applicationPacks: userAppPacks,
            notifications: userNotifs,
            jobAlertSubscriptions: userAlerts,
            careerProfile: userCareerProfile,
            consultationBookings: userBookings,
            influencerProfile: userInfluencer,
        };
    }
    async deleteUserAccount(userId) {
        const user = await this.getUserById(userId);
        if (!user)
            return false;
        const refCode = this.generateRefCode(user);
        // Get user's job application IDs for cascading delete of status history
        const userJobApps = await db_1.db.select({ id: schema_1.userJobApplications.id })
            .from(schema_1.userJobApplications).where((0, drizzle_orm_1.eq)(schema_1.userJobApplications.userId, userId));
        const jobAppIds = userJobApps.map(a => a.id);
        // Get user's service order IDs for cascading delete of deliverables
        const userOrders = await db_1.db.select({ id: schema_1.serviceOrders.id })
            .from(schema_1.serviceOrders).where((0, drizzle_orm_1.eq)(schema_1.serviceOrders.userId, userId));
        const orderIds = userOrders.map(o => o.id);
        // Get user's payment IDs for cascading delete of payment_retry_logs (FK: payment_retry_logs.payment_id → payments.id)
        const userPaymentRows = await db_1.db.select({ id: schema_1.payments.id })
            .from(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.userId, userId));
        const paymentIds = userPaymentRows.map(p => p.id);
        // Phase 1: Delete child records that have FK constraints pointing at other user records
        const phase1Deletes = [];
        if (jobAppIds.length > 0) {
            phase1Deletes.push(db_1.db.delete(schema_1.applicationStatusHistory).where((0, drizzle_orm_1.inArray)(schema_1.applicationStatusHistory.applicationId, jobAppIds)));
        }
        if (orderIds.length > 0) {
            phase1Deletes.push(db_1.db.delete(schema_1.serviceDeliverables).where((0, drizzle_orm_1.inArray)(schema_1.serviceDeliverables.orderId, orderIds)));
        }
        if (paymentIds.length > 0) {
            // Must delete payment_retry_logs before payments (FK: NO ACTION)
            phase1Deletes.push(db_1.db.delete(schema_1.paymentRetryLogs).where((0, drizzle_orm_1.inArray)(schema_1.paymentRetryLogs.paymentId, paymentIds)));
        }
        if (phase1Deletes.length > 0) {
            await Promise.all(phase1Deletes);
        }
        // Phase 2: Delete all direct user-linked records in parallel (no FK constraints)
        await Promise.all([
            db_1.db.delete(schema_1.userNotifications).where((0, drizzle_orm_1.eq)(schema_1.userNotifications.userId, userId)),
            db_1.db.delete(schema_1.pushSubscriptions).where((0, drizzle_orm_1.eq)(schema_1.pushSubscriptions.userId, userId)),
            db_1.db.delete(schema_1.jobAlertSubscriptions).where((0, drizzle_orm_1.eq)(schema_1.jobAlertSubscriptions.userId, userId)),
            db_1.db.delete(schema_1.trackedApplications).where((0, drizzle_orm_1.eq)(schema_1.trackedApplications.userId, userId)),
            db_1.db.delete(schema_1.userCareerProfiles).where((0, drizzle_orm_1.eq)(schema_1.userCareerProfiles.userId, userId)),
            db_1.db.delete(schema_1.consultationBookings).where((0, drizzle_orm_1.eq)(schema_1.consultationBookings.userId, userId)),
            db_1.db.delete(schema_1.analyticsEvents).where((0, drizzle_orm_1.eq)(schema_1.analyticsEvents.userId, userId)),
            db_1.db.delete(schema_1.conversionEvents).where((0, drizzle_orm_1.eq)(schema_1.conversionEvents.userId, userId)),
            db_1.db.delete(schema_1.userJobApplications).where((0, drizzle_orm_1.eq)(schema_1.userJobApplications.userId, userId)),
            db_1.db.delete(schema_1.userApplicationPacks).where((0, drizzle_orm_1.eq)(schema_1.userApplicationPacks.userId, userId)),
            db_1.db.delete(schema_1.scheduledNotifications).where((0, drizzle_orm_1.eq)(schema_1.scheduledNotifications.createdBy, userId)),
            db_1.db.delete(schema_1.accountLockouts).where((0, drizzle_orm_1.eq)(schema_1.accountLockouts.identifier, userId)),
            db_1.db.delete(schema_1.influencers).where((0, drizzle_orm_1.eq)(schema_1.influencers.userId, userId)),
            db_1.db.delete(schema_1.notificationPreferences).where((0, drizzle_orm_1.eq)(schema_1.notificationPreferences.userId, userId)),
            db_1.db.delete(schema_1.userServices).where((0, drizzle_orm_1.eq)(schema_1.userServices.userId, userId)),
            db_1.db.delete(schema_1.securityAlerts).where((0, drizzle_orm_1.eq)(schema_1.securityAlerts.userId, userId)),
            db_1.db.delete(schema_1.securityEvents).where((0, drizzle_orm_1.eq)(schema_1.securityEvents.userId, userId)),
            db_1.db.delete(schema_1.toolUsage).where((0, drizzle_orm_1.eq)(schema_1.toolUsage.userId, userId)),
            db_1.db.delete(schema_1.toolReports).where((0, drizzle_orm_1.eq)(schema_1.toolReports.userId, userId)),
            db_1.db.delete(schema_1.cvTemplateDownloads).where((0, drizzle_orm_1.eq)(schema_1.cvTemplateDownloads.userId, userId)),
            db_1.db.delete(schema_1.refundRequests).where((0, drizzle_orm_1.eq)(schema_1.refundRequests.userId, userId)),
            db_1.db.delete(schema_1.aiUsage).where((0, drizzle_orm_1.eq)(schema_1.aiUsage.userId, userId)),
            db_1.db.delete(schema_1.agencyClaims).where((0, drizzle_orm_1.eq)(schema_1.agencyClaims.userId, userId)),
        ]);
        // Phase 3: Delete records with FK dependencies (sequential order matters)
        await db_1.db.delete(schema_1.serviceOrders).where((0, drizzle_orm_1.eq)(schema_1.serviceOrders.userId, userId));
        await db_1.db.delete(schema_1.userSubscriptions).where((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.userId, userId));
        await db_1.db.delete(schema_1.referrals).where((0, drizzle_orm_1.eq)(schema_1.referrals.refCode, refCode));
        await db_1.db.delete(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.userId, userId));
        await db_1.db.delete(auth_1.users).where((0, drizzle_orm_1.eq)(auth_1.users.id, userId));
        // Phase 4: Clear sessions
        try {
            await db_1.db.execute((0, drizzle_orm_1.sql) `DELETE FROM sessions WHERE sess::jsonb -> 'passport' ->> 'user' = ${userId}`);
        }
        catch { }
        return true;
    }
    // ── Agency Jobs ──────────────────────────────────────────────────────────────
    async getAgencyJobs(agencyId) {
        return db_1.db
            .select()
            .from(schema_1.agencyJobs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agencyJobs.agencyId, agencyId), (0, drizzle_orm_1.eq)(schema_1.agencyJobs.isActive, true)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.agencyJobs.isFeatured), (0, drizzle_orm_1.desc)(schema_1.agencyJobs.createdAt));
    }
    async getAllActiveAgencyJobs(filters) {
        const conditions = [(0, drizzle_orm_1.eq)(schema_1.agencyJobs.isActive, true)];
        if (filters?.country)
            conditions.push((0, drizzle_orm_1.ilike)(schema_1.agencyJobs.country, `%${filters.country}%`));
        if (filters?.category)
            conditions.push((0, drizzle_orm_1.ilike)(schema_1.agencyJobs.jobCategory, `%${filters.category}%`));
        return db_1.db
            .select()
            .from(schema_1.agencyJobs)
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.agencyJobs.isFeatured), (0, drizzle_orm_1.desc)(schema_1.agencyJobs.createdAt));
    }
    async getAgencyJobById(jobId) {
        const [job] = await db_1.db.select().from(schema_1.agencyJobs).where((0, drizzle_orm_1.eq)(schema_1.agencyJobs.id, jobId));
        return job;
    }
    async createAgencyJob(data) {
        const [job] = await db_1.db.insert(schema_1.agencyJobs).values(data).returning();
        return job;
    }
    async updateAgencyJob(jobId, data) {
        const [job] = await db_1.db
            .update(schema_1.agencyJobs)
            .set({ ...data, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.agencyJobs.id, jobId))
            .returning();
        return job;
    }
    async deleteAgencyJob(jobId) {
        await db_1.db.update(schema_1.agencyJobs).set({ isActive: false }).where((0, drizzle_orm_1.eq)(schema_1.agencyJobs.id, jobId));
    }
    async incrementAgencyJobViews(jobId) {
        await db_1.db
            .update(schema_1.agencyJobs)
            .set({ viewCount: (0, drizzle_orm_1.sql) `view_count + 1` })
            .where((0, drizzle_orm_1.eq)(schema_1.agencyJobs.id, jobId));
    }
    // ─────────────────────────────────────────────────────────────────────────────
    async getNeaAgencies(search, statusFilter) {
        let query = db_1.db.select().from(schema_1.neaAgencies).where((0, drizzle_orm_1.eq)(schema_1.neaAgencies.isPublished, true));
        if (search) {
            const safeSearch = search.slice(0, 200).replace(/[%_\\]/g, c => `\\${c}`);
            const searchPattern = `%${safeSearch}%`;
            query = db_1.db.select().from(schema_1.neaAgencies).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.neaAgencies.isPublished, true), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.neaAgencies.agencyName, searchPattern), (0, drizzle_orm_1.ilike)(schema_1.neaAgencies.licenseNumber, searchPattern))));
        }
        return query.orderBy(schema_1.neaAgencies.agencyName);
    }
    async getNeaAgencyById(id) {
        const [agency] = await db_1.db.select().from(schema_1.neaAgencies).where((0, drizzle_orm_1.eq)(schema_1.neaAgencies.id, id));
        return agency;
    }
    async createNeaAgency(agency) {
        const [created] = await db_1.db.insert(schema_1.neaAgencies).values(agency).returning();
        return created;
    }
    async updateNeaAgency(id, agency) {
        const [updated] = await db_1.db.update(schema_1.neaAgencies).set({
            ...agency,
            lastUpdated: new Date(),
        }).where((0, drizzle_orm_1.eq)(schema_1.neaAgencies.id, id)).returning();
        return updated;
    }
    async deleteNeaAgency(id) {
        await db_1.db.delete(schema_1.neaAgencies).where((0, drizzle_orm_1.eq)(schema_1.neaAgencies.id, id));
    }
    async bulkCreateNeaAgencies(agencies) {
        if (agencies.length === 0)
            return [];
        const created = await db_1.db.insert(schema_1.neaAgencies).values(agencies).returning();
        return created;
    }
    async getAgencyStats() {
        const nowIso = new Date().toISOString();
        const [totalRow] = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema_1.neaAgencies).where((0, drizzle_orm_1.eq)(schema_1.neaAgencies.isPublished, true));
        const [expiredRow] = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema_1.neaAgencies).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.neaAgencies.isPublished, true), (0, drizzle_orm_1.sql) `${schema_1.neaAgencies.expiryDate} < ${nowIso}`));
        const total = Number(totalRow?.count ?? 0);
        const expired = Number(expiredRow?.count ?? 0);
        return { total, valid: total - expired, expired };
    }
    async getAgencyByClaimedUser(userId) {
        const [agency] = await db_1.db.select().from(schema_1.neaAgencies).where((0, drizzle_orm_1.eq)(schema_1.neaAgencies.claimedByUserId, userId));
        return agency;
    }
    async searchAgenciesForClaim(rawQuery) {
        const query = rawQuery.slice(0, 200).replace(/[%_\\]/g, c => `\\${c}`);
        return db_1.db.select().from(schema_1.neaAgencies)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.neaAgencies.agencyName, `%${query}%`), (0, drizzle_orm_1.ilike)(schema_1.neaAgencies.licenseNumber, `%${query}%`)))
            .limit(10);
    }
    async claimAgency(agencyId, userId) {
        const [updated] = await db_1.db.update(schema_1.neaAgencies)
            .set({ claimedByUserId: userId, claimedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.neaAgencies.id, agencyId))
            .returning();
        return updated;
    }
    async verifyAgencyOwner(agencyId, userId) {
        const [updated] = await db_1.db.update(schema_1.neaAgencies)
            .set({ claimedByUserId: userId, claimedAt: new Date(), isVerifiedOwner: true, verifiedOwnerAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.neaAgencies.id, agencyId))
            .returning();
        return updated;
    }
    async createAgencyClaim(claim) {
        const [created] = await db_1.db.insert(schema_1.agencyClaims).values(claim).returning();
        return created;
    }
    async getAgencyClaims(filters) {
        const conditions = [];
        if (filters?.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.agencyClaims.status, filters.status));
        if (filters?.agencyId)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.agencyClaims.agencyId, filters.agencyId));
        const query = db_1.db.select().from(schema_1.agencyClaims).orderBy((0, drizzle_orm_1.desc)(schema_1.agencyClaims.submittedAt));
        if (conditions.length > 0)
            return query.where((0, drizzle_orm_1.and)(...conditions));
        return query;
    }
    async getAgencyClaimById(id) {
        const [claim] = await db_1.db.select().from(schema_1.agencyClaims).where((0, drizzle_orm_1.eq)(schema_1.agencyClaims.id, id));
        return claim;
    }
    async getUserClaimForAgency(userId, agencyId) {
        const [claim] = await db_1.db.select().from(schema_1.agencyClaims)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agencyClaims.userId, userId), (0, drizzle_orm_1.eq)(schema_1.agencyClaims.agencyId, agencyId)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.agencyClaims.submittedAt));
        return claim;
    }
    async updateAgencyClaim(id, data) {
        const [updated] = await db_1.db.update(schema_1.agencyClaims)
            .set({ ...data, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.agencyClaims.id, id))
            .returning();
        return updated;
    }
    async getAgencyClaimCount() {
        const all = await db_1.db.select().from(schema_1.agencyClaims);
        return {
            total: all.length,
            pending: all.filter(c => c.status === "pending").length,
            approved: all.filter(c => c.status === "approved").length,
            rejected: all.filter(c => c.status === "rejected").length,
        };
    }
    async getAgencyReports(agencyId) {
        if (agencyId) {
            return db_1.db.select().from(schema_1.agencyReports)
                .where((0, drizzle_orm_1.eq)(schema_1.agencyReports.agencyId, agencyId))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.agencyReports.createdAt));
        }
        return db_1.db.select().from(schema_1.agencyReports).orderBy((0, drizzle_orm_1.desc)(schema_1.agencyReports.createdAt));
    }
    async createAgencyReport(report) {
        const [created] = await db_1.db.insert(schema_1.agencyReports).values(report).returning();
        return created;
    }
    async updateAgencyReportStatus(id, status) {
        const [updated] = await db_1.db.update(schema_1.agencyReports).set({ status }).where((0, drizzle_orm_1.eq)(schema_1.agencyReports.id, id)).returning();
        return updated;
    }
    async getAgencyNotifications(unreadOnly) {
        if (unreadOnly) {
            return db_1.db.select().from(schema_1.agencyNotifications)
                .where((0, drizzle_orm_1.eq)(schema_1.agencyNotifications.isRead, false))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.agencyNotifications.createdAt));
        }
        return db_1.db.select().from(schema_1.agencyNotifications).orderBy((0, drizzle_orm_1.desc)(schema_1.agencyNotifications.createdAt));
    }
    async createAgencyNotification(notification) {
        const [created] = await db_1.db.insert(schema_1.agencyNotifications).values(notification).returning();
        return created;
    }
    async markNotificationAsRead(id) {
        await db_1.db.update(schema_1.agencyNotifications).set({ isRead: true }).where((0, drizzle_orm_1.eq)(schema_1.agencyNotifications.id, id));
    }
    async markAllNotificationsAsRead() {
        await db_1.db.update(schema_1.agencyNotifications).set({ isRead: true }).where((0, drizzle_orm_1.eq)(schema_1.agencyNotifications.isRead, false));
    }
    async getUnreadNotificationCount() {
        const result = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema_1.agencyNotifications)
            .where((0, drizzle_orm_1.eq)(schema_1.agencyNotifications.isRead, false));
        return Number(result[0]?.count ?? 0);
    }
    async checkNotificationExists(agencyId, type, date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        // NOTE: Always interpolate Date params as ISO strings. The postgres-js
        // driver (3.4.9) can raise `ERR_INVALID_ARG_TYPE` inside its Bind path
        // when a Date object reaches `reset.str` without explicit type
        // negotiation — converting to ISO 8601 sidesteps the issue and is
        // accepted natively by PostgreSQL timestamp/timestamptz columns.
        const result = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema_1.agencyNotifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agencyNotifications.agencyId, agencyId), (0, drizzle_orm_1.eq)(schema_1.agencyNotifications.type, type), (0, drizzle_orm_1.sql) `${schema_1.agencyNotifications.createdAt} >= ${startOfDay.toISOString()}`, (0, drizzle_orm_1.sql) `${schema_1.agencyNotifications.createdAt} <= ${endOfDay.toISOString()}`));
        return Number(result[0]?.count ?? 0) > 0;
    }
    // Agency Add-Ons
    async getAgencyAddOns(agencyId) {
        if (agencyId) {
            return db_1.db.select().from(schema_1.agencyAddOns).where((0, drizzle_orm_1.eq)(schema_1.agencyAddOns.agencyId, agencyId)).orderBy((0, drizzle_orm_1.desc)(schema_1.agencyAddOns.createdAt));
        }
        return db_1.db.select().from(schema_1.agencyAddOns).orderBy((0, drizzle_orm_1.desc)(schema_1.agencyAddOns.createdAt));
    }
    async getActiveAddOnsByType(addOnType) {
        const nowIso = new Date().toISOString();
        return db_1.db.select().from(schema_1.agencyAddOns).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agencyAddOns.addOnType, addOnType), (0, drizzle_orm_1.eq)(schema_1.agencyAddOns.isActive, true), (0, drizzle_orm_1.sql) `${schema_1.agencyAddOns.startDate} <= ${nowIso}`, (0, drizzle_orm_1.sql) `${schema_1.agencyAddOns.endDate} >= ${nowIso}`));
    }
    async getAgencyActiveAddOns(agencyId) {
        const nowIso = new Date().toISOString();
        return db_1.db.select().from(schema_1.agencyAddOns).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agencyAddOns.agencyId, agencyId), (0, drizzle_orm_1.eq)(schema_1.agencyAddOns.isActive, true), (0, drizzle_orm_1.sql) `${schema_1.agencyAddOns.startDate} <= ${nowIso}`, (0, drizzle_orm_1.sql) `${schema_1.agencyAddOns.endDate} >= ${nowIso}`));
    }
    async createAgencyAddOn(addOn) {
        const [created] = await db_1.db.insert(schema_1.agencyAddOns).values(addOn).returning();
        return created;
    }
    async updateAgencyAddOn(id, data) {
        const [updated] = await db_1.db.update(schema_1.agencyAddOns).set(data).where((0, drizzle_orm_1.eq)(schema_1.agencyAddOns.id, id)).returning();
        return updated;
    }
    async deleteAgencyAddOn(id) {
        await db_1.db.delete(schema_1.agencyAddOns).where((0, drizzle_orm_1.eq)(schema_1.agencyAddOns.id, id));
    }
    // Agency Clicks
    async recordAgencyClick(click) {
        const [created] = await db_1.db.insert(schema_1.agencyClicks).values(click).returning();
        return created;
    }
    async getAgencyClickStats(agencyId, startDate, endDate) {
        let query = db_1.db.select({
            source: schema_1.agencyClicks.source,
            count: (0, drizzle_orm_1.sql) `count(*)::int`
        })
            .from(schema_1.agencyClicks)
            .where((0, drizzle_orm_1.eq)(schema_1.agencyClicks.agencyId, agencyId))
            .groupBy(schema_1.agencyClicks.source);
        return query;
    }
    async getAgencyTotalClicks(agencyId) {
        const result = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema_1.agencyClicks)
            .where((0, drizzle_orm_1.eq)(schema_1.agencyClicks.agencyId, agencyId));
        return Number(result[0]?.count ?? 0);
    }
    // Agency Profiles
    async getAgencyProfile(agencyId) {
        const [profile] = await db_1.db.select().from(schema_1.agencyProfiles).where((0, drizzle_orm_1.eq)(schema_1.agencyProfiles.agencyId, agencyId));
        return profile;
    }
    async createAgencyProfile(profile) {
        const [created] = await db_1.db.insert(schema_1.agencyProfiles).values(profile).returning();
        return created;
    }
    async updateAgencyProfile(agencyId, data) {
        const [updated] = await db_1.db.update(schema_1.agencyProfiles)
            .set({ ...data, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.agencyProfiles.agencyId, agencyId))
            .returning();
        return updated;
    }
    async deleteAgencyProfile(agencyId) {
        await db_1.db.delete(schema_1.agencyProfiles).where((0, drizzle_orm_1.eq)(schema_1.agencyProfiles.agencyId, agencyId));
    }
    // Service Orders
    async getServiceOrders(filters) {
        let query = db_1.db.select().from(schema_1.serviceOrders).orderBy((0, drizzle_orm_1.desc)(schema_1.serviceOrders.createdAt));
        if (filters?.userId && filters?.status) {
            return db_1.db.select().from(schema_1.serviceOrders)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceOrders.userId, filters.userId), (0, drizzle_orm_1.eq)(schema_1.serviceOrders.status, filters.status)))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.serviceOrders.createdAt));
        }
        else if (filters?.userId) {
            return db_1.db.select().from(schema_1.serviceOrders)
                .where((0, drizzle_orm_1.eq)(schema_1.serviceOrders.userId, filters.userId))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.serviceOrders.createdAt));
        }
        else if (filters?.status) {
            return db_1.db.select().from(schema_1.serviceOrders)
                .where((0, drizzle_orm_1.eq)(schema_1.serviceOrders.status, filters.status))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.serviceOrders.createdAt));
        }
        return db_1.db.select().from(schema_1.serviceOrders).orderBy((0, drizzle_orm_1.desc)(schema_1.serviceOrders.createdAt));
    }
    async getServiceOrderById(id) {
        const [order] = await db_1.db.select().from(schema_1.serviceOrders).where((0, drizzle_orm_1.eq)(schema_1.serviceOrders.id, id));
        return order;
    }
    async getServiceOrderByPaymentRef(paymentRef) {
        const [order] = await db_1.db.select().from(schema_1.serviceOrders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceOrders.paymentRef, paymentRef), (0, drizzle_orm_1.eq)(schema_1.serviceOrders.status, "pending_payment")));
        return order;
    }
    async createServiceOrder(order) {
        const [created] = await db_1.db.insert(schema_1.serviceOrders).values(order).returning();
        return created;
    }
    async updateServiceOrder(id, data) {
        const [updated] = await db_1.db.update(schema_1.serviceOrders)
            .set({ ...data, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.serviceOrders.id, id))
            .returning();
        return updated;
    }
    // Service Deliverables
    async getDeliverablesByOrderId(orderId) {
        return db_1.db.select().from(schema_1.serviceDeliverables)
            .where((0, drizzle_orm_1.eq)(schema_1.serviceDeliverables.orderId, orderId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.serviceDeliverables.createdAt));
    }
    async getDeliverablesByUserId(userId) {
        const rows = await db_1.db
            .select({
            id: schema_1.serviceDeliverables.id,
            orderId: schema_1.serviceDeliverables.orderId,
            fileName: schema_1.serviceDeliverables.fileName,
            fileType: schema_1.serviceDeliverables.fileType,
            fileSize: schema_1.serviceDeliverables.fileSize,
            fileUrl: schema_1.serviceDeliverables.fileUrl,
            description: schema_1.serviceDeliverables.description,
            downloadCount: schema_1.serviceDeliverables.downloadCount,
            uploadedBy: schema_1.serviceDeliverables.uploadedBy,
            createdAt: schema_1.serviceDeliverables.createdAt,
            serviceName: schema_1.serviceOrders.serviceName,
            serviceId: schema_1.serviceOrders.serviceId,
            orderedAt: schema_1.serviceOrders.createdAt,
        })
            .from(schema_1.serviceDeliverables)
            .innerJoin(schema_1.serviceOrders, (0, drizzle_orm_1.eq)(schema_1.serviceDeliverables.orderId, schema_1.serviceOrders.id))
            .where((0, drizzle_orm_1.eq)(schema_1.serviceOrders.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.serviceDeliverables.createdAt));
        return rows;
    }
    async getDeliverableById(id) {
        const [deliverable] = await db_1.db.select().from(schema_1.serviceDeliverables).where((0, drizzle_orm_1.eq)(schema_1.serviceDeliverables.id, id));
        return deliverable;
    }
    async createDeliverable(deliverable) {
        const [created] = await db_1.db.insert(schema_1.serviceDeliverables).values(deliverable).returning();
        return created;
    }
    async incrementDownloadCount(id) {
        await db_1.db.update(schema_1.serviceDeliverables)
            .set({ downloadCount: (0, drizzle_orm_1.sql) `${schema_1.serviceDeliverables.downloadCount} + 1` })
            .where((0, drizzle_orm_1.eq)(schema_1.serviceDeliverables.id, id));
    }
    // User Notifications
    async getUserNotifications(userId, unreadOnly) {
        if (unreadOnly) {
            return db_1.db.select().from(schema_1.userNotifications)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userNotifications.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userNotifications.isRead, false)))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.userNotifications.createdAt));
        }
        return db_1.db.select().from(schema_1.userNotifications)
            .where((0, drizzle_orm_1.eq)(schema_1.userNotifications.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.userNotifications.createdAt));
    }
    async createDelivery(delivery) {
        const [created] = await db_1.db.insert(schema_1.deliveries).values(delivery).returning();
        return created;
    }
    async getUserDeliveries(userId) {
        return db_1.db.select().from(schema_1.deliveries)
            .where((0, drizzle_orm_1.eq)(schema_1.deliveries.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.deliveries.createdAt));
    }
    async createUserNotification(notification) {
        const [created] = await db_1.db.insert(schema_1.userNotifications).values(notification).returning();
        return created;
    }
    async markUserNotificationAsRead(id) {
        await db_1.db.update(schema_1.userNotifications)
            .set({ isRead: true })
            .where((0, drizzle_orm_1.eq)(schema_1.userNotifications.id, id));
    }
    async markAllUserNotificationsAsRead(userId) {
        await db_1.db.update(schema_1.userNotifications)
            .set({ isRead: true })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userNotifications.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userNotifications.isRead, false)));
    }
    async getUnreadUserNotificationCount(userId) {
        const result = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema_1.userNotifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userNotifications.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userNotifications.isRead, false)));
        return Number(result[0]?.count ?? 0);
    }
    async getTrustMetrics() {
        // Get all orders
        const allOrders = await db_1.db.select().from(schema_1.serviceOrders).orderBy((0, drizzle_orm_1.desc)(schema_1.serviceOrders.createdAt));
        const totalOrders = allOrders.length;
        const autoApproved = allOrders.filter(o => !o.needsHumanReview && o.status === 'completed').length;
        const humanReviewed = allOrders.filter(o => o.needsHumanReview && o.status === 'completed').length;
        const flaggedForReview = allOrders.filter(o => o.needsHumanReview && o.status !== 'completed').length;
        // Quality scores
        const ordersWithScores = allOrders.filter(o => o.qualityScore !== null);
        const averageQualityScore = ordersWithScores.length > 0
            ? ordersWithScores.reduce((sum, o) => sum + (o.qualityScore || 0), 0) / ordersWithScores.length
            : 0;
        // Hallucination detection count
        const hallucinationDetections = allOrders.filter(o => {
            const details = o.qualityCheckData;
            return details?.hallucinationDetected === true;
        }).length;
        // Auto-approval rate
        const completedOrders = allOrders.filter(o => o.status === 'completed');
        const autoApprovalRate = completedOrders.length > 0
            ? (autoApproved / completedOrders.length) * 100
            : 0;
        // Average processing time (from createdAt to completedAt)
        const ordersWithTimes = completedOrders.filter(o => o.createdAt && o.completedAt);
        const avgProcessingTime = ordersWithTimes.length > 0
            ? ordersWithTimes.reduce((sum, o) => {
                const created = new Date(o.createdAt).getTime();
                const completed = new Date(o.completedAt).getTime();
                return sum + (completed - created) / 1000; // seconds
            }, 0) / ordersWithTimes.length
            : 0;
        // Quality distribution
        const qualityDistribution = {
            excellent: ordersWithScores.filter(o => (o.qualityScore || 0) >= 85).length,
            good: ordersWithScores.filter(o => (o.qualityScore || 0) >= 75 && (o.qualityScore || 0) < 85).length,
            acceptable: ordersWithScores.filter(o => (o.qualityScore || 0) >= 60 && (o.qualityScore || 0) < 75).length,
            poor: ordersWithScores.filter(o => (o.qualityScore || 0) < 60).length,
        };
        // Fail reasons from quality check details
        const failReasonCounts = {};
        allOrders.forEach(o => {
            if (o.needsHumanReview && o.qualityCheckData) {
                const details = o.qualityCheckData;
                const issues = details.issues || [];
                issues.forEach((issue) => {
                    if (issue.startsWith('FAIL:') || issue.startsWith('CONDITION:')) {
                        const reason = issue.replace(/^(FAIL:|CONDITION:)\s*/, '').substring(0, 50);
                        failReasonCounts[reason] = (failReasonCounts[reason] || 0) + 1;
                    }
                });
            }
        });
        const failReasons = Object.entries(failReasonCounts)
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        // Service stats
        const serviceMap = {};
        allOrders.forEach(o => {
            if (!serviceMap[o.serviceName]) {
                serviceMap[o.serviceName] = { total: 0, autoApproved: 0, totalScore: 0, scoreCount: 0 };
            }
            serviceMap[o.serviceName].total++;
            if (!o.needsHumanReview && o.status === 'completed') {
                serviceMap[o.serviceName].autoApproved++;
            }
            if (o.qualityScore !== null) {
                serviceMap[o.serviceName].totalScore += o.qualityScore;
                serviceMap[o.serviceName].scoreCount++;
            }
        });
        const serviceStats = Object.entries(serviceMap).map(([serviceName, stats]) => ({
            serviceName,
            total: stats.total,
            autoApproved: stats.autoApproved,
            avgScore: stats.scoreCount > 0 ? stats.totalScore / stats.scoreCount : 0,
        }));
        // Recent orders (last 10)
        const recentOrders = allOrders.slice(0, 10);
        return {
            totalOrders,
            autoApproved,
            humanReviewed,
            flaggedForReview,
            averageQualityScore,
            hallucinationDetections,
            autoApprovalRate,
            avgProcessingTime,
            recentOrders,
            qualityDistribution,
            failReasons,
            serviceStats,
        };
    }
    // Push Subscriptions
    async createPushSubscription(data) {
        const existing = await db_1.db
            .select()
            .from(schema_1.pushSubscriptions)
            .where((0, drizzle_orm_1.eq)(schema_1.pushSubscriptions.endpoint, data.endpoint))
            .limit(1);
        if (existing.length > 0) {
            const [updated] = await db_1.db
                .update(schema_1.pushSubscriptions)
                .set({ ...data, isActive: true, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.pushSubscriptions.id, existing[0].id))
                .returning();
            return updated;
        }
        const [sub] = await db_1.db.insert(schema_1.pushSubscriptions).values(data).returning();
        return sub;
    }
    async getActivePushSubscriptions() {
        return db_1.db.select().from(schema_1.pushSubscriptions).where((0, drizzle_orm_1.eq)(schema_1.pushSubscriptions.isActive, true));
    }
    async getUserPushSubscriptions(userId) {
        return db_1.db
            .select()
            .from(schema_1.pushSubscriptions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pushSubscriptions.userId, userId), (0, drizzle_orm_1.eq)(schema_1.pushSubscriptions.isActive, true)));
    }
    async deactivatePushSubscription(id) {
        await db_1.db.update(schema_1.pushSubscriptions).set({ isActive: false }).where((0, drizzle_orm_1.eq)(schema_1.pushSubscriptions.id, id));
    }
    async deletePushSubscription(endpoint) {
        await db_1.db.delete(schema_1.pushSubscriptions).where((0, drizzle_orm_1.eq)(schema_1.pushSubscriptions.endpoint, endpoint));
    }
    // Scheduled Notifications
    async createScheduledNotification(data) {
        const [notification] = await db_1.db.insert(schema_1.scheduledNotifications).values(data).returning();
        return notification;
    }
    async getScheduledNotifications() {
        return db_1.db.select().from(schema_1.scheduledNotifications).orderBy((0, drizzle_orm_1.desc)(schema_1.scheduledNotifications.createdAt));
    }
    async updateScheduledNotification(id, data) {
        const [updated] = await db_1.db
            .update(schema_1.scheduledNotifications)
            .set(data)
            .where((0, drizzle_orm_1.eq)(schema_1.scheduledNotifications.id, id))
            .returning();
        return updated || null;
    }
    async getPushSubscriptionCount() {
        const result = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.pushSubscriptions).where((0, drizzle_orm_1.eq)(schema_1.pushSubscriptions.isActive, true));
        return Number(result[0]?.count || 0);
    }
    // Job counts for real-time alerts
    async getAllJobCounts() {
        return db_1.db.select().from(schema_1.jobCounts);
    }
    async getJobCountByCountry(countryCode) {
        const [count] = await db_1.db.select().from(schema_1.jobCounts).where((0, drizzle_orm_1.eq)(schema_1.jobCounts.countryCode, countryCode));
        return count;
    }
    async updateJobCount(countryCode, count, updatedBy) {
        const existing = await this.getJobCountByCountry(countryCode);
        if (existing) {
            const [updated] = await db_1.db
                .update(schema_1.jobCounts)
                .set({
                previousCount: existing.jobCount,
                jobCount: count,
                lastUpdated: new Date(),
                updatedBy: updatedBy || existing.updatedBy,
            })
                .where((0, drizzle_orm_1.eq)(schema_1.jobCounts.countryCode, countryCode))
                .returning();
            return updated;
        }
        // Create new entry if doesn't exist
        const countryNames = {
            usa: "USA",
            canada: "Canada",
            uk: "United Kingdom",
            uae: "UAE",
            australia: "Australia",
            europe: "Europe",
        };
        const [created] = await db_1.db
            .insert(schema_1.jobCounts)
            .values({
            countryCode,
            countryName: countryNames[countryCode] || countryCode.toUpperCase(),
            jobCount: count,
            previousCount: 0,
            updatedBy,
        })
            .returning();
        return created;
    }
    // Student Visa methods - OPTIMIZED: Batch queries to avoid N+1
    async getStudentVisasByCountry(countryCode) {
        const visas = await db_1.db.select().from(schema_1.studentVisas)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.studentVisas.countryCode, countryCode), (0, drizzle_orm_1.eq)(schema_1.studentVisas.isActive, true)))
            .orderBy(schema_1.studentVisas.order);
        if (visas.length === 0)
            return [];
        const visaIds = visas.map(v => v.id);
        // Batch all queries with Promise.all to avoid N+1
        const [allRequirements, allSteps, allLinks] = await Promise.all([
            db_1.db.select().from(schema_1.visaRequirements).where((0, drizzle_orm_1.inArray)(schema_1.visaRequirements.visaId, visaIds)),
            db_1.db.select().from(schema_1.visaSteps).where((0, drizzle_orm_1.inArray)(schema_1.visaSteps.visaId, visaIds)),
            db_1.db.select().from(schema_1.visaLinks).where((0, drizzle_orm_1.or)((0, drizzle_orm_1.inArray)(schema_1.visaLinks.visaId, visaIds), (0, drizzle_orm_1.eq)(schema_1.visaLinks.countryCode, countryCode))),
        ]);
        // Map results to visas
        return visas.map(visa => ({
            ...visa,
            requirements: allRequirements
                .filter(r => r.visaId === visa.id)
                .sort((a, b) => a.order - b.order),
            steps: allSteps
                .filter(s => s.visaId === visa.id)
                .sort((a, b) => a.stepNumber - b.stepNumber),
            links: allLinks
                .filter(l => l.visaId === visa.id || l.countryCode === countryCode)
                .sort((a, b) => a.order - b.order),
        }));
    }
    async getStudentVisaById(id) {
        const [visa] = await db_1.db.select().from(schema_1.studentVisas).where((0, drizzle_orm_1.eq)(schema_1.studentVisas.id, id));
        if (!visa)
            return undefined;
        const requirements = await db_1.db.select().from(schema_1.visaRequirements)
            .where((0, drizzle_orm_1.eq)(schema_1.visaRequirements.visaId, id))
            .orderBy(schema_1.visaRequirements.order);
        const steps = await db_1.db.select().from(schema_1.visaSteps)
            .where((0, drizzle_orm_1.eq)(schema_1.visaSteps.visaId, id))
            .orderBy(schema_1.visaSteps.stepNumber);
        const links = await db_1.db.select().from(schema_1.visaLinks)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.visaLinks.visaId, id), (0, drizzle_orm_1.eq)(schema_1.visaLinks.countryCode, visa.countryCode)))
            .orderBy(schema_1.visaLinks.order);
        return { ...visa, requirements, steps, links };
    }
    async getAllStudentVisas() {
        return db_1.db.select().from(schema_1.studentVisas).orderBy(schema_1.studentVisas.countryCode, schema_1.studentVisas.order);
    }
    async createStudentVisa(visa) {
        const [created] = await db_1.db.insert(schema_1.studentVisas).values(visa).returning();
        return created;
    }
    async updateStudentVisa(id, visa) {
        const [updated] = await db_1.db.update(schema_1.studentVisas).set(visa).where((0, drizzle_orm_1.eq)(schema_1.studentVisas.id, id)).returning();
        return updated;
    }
    async deleteStudentVisa(id) {
        await db_1.db.delete(schema_1.visaRequirements).where((0, drizzle_orm_1.eq)(schema_1.visaRequirements.visaId, id));
        await db_1.db.delete(schema_1.visaSteps).where((0, drizzle_orm_1.eq)(schema_1.visaSteps.visaId, id));
        await db_1.db.delete(schema_1.visaLinks).where((0, drizzle_orm_1.eq)(schema_1.visaLinks.visaId, id));
        await db_1.db.delete(schema_1.studentVisas).where((0, drizzle_orm_1.eq)(schema_1.studentVisas.id, id));
    }
    async getVisaRequirements(visaId) {
        return db_1.db.select().from(schema_1.visaRequirements).where((0, drizzle_orm_1.eq)(schema_1.visaRequirements.visaId, visaId)).orderBy(schema_1.visaRequirements.order);
    }
    async createVisaRequirement(requirement) {
        const [created] = await db_1.db.insert(schema_1.visaRequirements).values(requirement).returning();
        return created;
    }
    async deleteVisaRequirement(id) {
        await db_1.db.delete(schema_1.visaRequirements).where((0, drizzle_orm_1.eq)(schema_1.visaRequirements.id, id));
    }
    async getVisaSteps(visaId) {
        return db_1.db.select().from(schema_1.visaSteps).where((0, drizzle_orm_1.eq)(schema_1.visaSteps.visaId, visaId)).orderBy(schema_1.visaSteps.stepNumber);
    }
    async createVisaStep(step) {
        const [created] = await db_1.db.insert(schema_1.visaSteps).values(step).returning();
        return created;
    }
    async deleteVisaStep(id) {
        await db_1.db.delete(schema_1.visaSteps).where((0, drizzle_orm_1.eq)(schema_1.visaSteps.id, id));
    }
    async getVisaLinks(visaId, countryCode) {
        if (visaId) {
            return db_1.db.select().from(schema_1.visaLinks).where((0, drizzle_orm_1.eq)(schema_1.visaLinks.visaId, visaId)).orderBy(schema_1.visaLinks.order);
        }
        if (countryCode) {
            return db_1.db.select().from(schema_1.visaLinks).where((0, drizzle_orm_1.eq)(schema_1.visaLinks.countryCode, countryCode)).orderBy(schema_1.visaLinks.order);
        }
        return db_1.db.select().from(schema_1.visaLinks).orderBy(schema_1.visaLinks.order);
    }
    async createVisaLink(link) {
        const [created] = await db_1.db.insert(schema_1.visaLinks).values(link).returning();
        return created;
    }
    async deleteVisaLink(id) {
        await db_1.db.delete(schema_1.visaLinks).where((0, drizzle_orm_1.eq)(schema_1.visaLinks.id, id));
    }
    // ============================================
    // ASSISTED APPLY MODE IMPLEMENTATIONS
    // ============================================
    async getApplicationPacks() {
        return db_1.db.select().from(schema_1.applicationPacks).where((0, drizzle_orm_1.eq)(schema_1.applicationPacks.isActive, true)).orderBy(schema_1.applicationPacks.order);
    }
    async getApplicationPackById(id) {
        const [pack] = await db_1.db.select().from(schema_1.applicationPacks).where((0, drizzle_orm_1.eq)(schema_1.applicationPacks.id, id));
        return pack;
    }
    async createApplicationPack(pack) {
        const [created] = await db_1.db.insert(schema_1.applicationPacks).values(pack).returning();
        return created;
    }
    async updateApplicationPack(id, pack) {
        const [updated] = await db_1.db.update(schema_1.applicationPacks).set(pack).where((0, drizzle_orm_1.eq)(schema_1.applicationPacks.id, id)).returning();
        return updated;
    }
    async deleteApplicationPack(id) {
        await db_1.db.delete(schema_1.applicationPacks).where((0, drizzle_orm_1.eq)(schema_1.applicationPacks.id, id));
    }
    async getUserApplicationPacks(userId) {
        return db_1.db.select().from(schema_1.userApplicationPacks).where((0, drizzle_orm_1.eq)(schema_1.userApplicationPacks.userId, userId)).orderBy((0, drizzle_orm_1.desc)(schema_1.userApplicationPacks.createdAt));
    }
    async getUserApplicationPackById(id) {
        const [pack] = await db_1.db.select().from(schema_1.userApplicationPacks).where((0, drizzle_orm_1.eq)(schema_1.userApplicationPacks.id, id));
        return pack;
    }
    async getUserApplicationPackByPaymentRef(paymentRef) {
        const [pack] = await db_1.db.select().from(schema_1.userApplicationPacks).where((0, drizzle_orm_1.eq)(schema_1.userApplicationPacks.paymentRef, paymentRef));
        return pack;
    }
    async createUserApplicationPack(pack) {
        const [created] = await db_1.db.insert(schema_1.userApplicationPacks).values(pack).returning();
        return created;
    }
    async updateUserApplicationPack(id, pack) {
        const [updated] = await db_1.db.update(schema_1.userApplicationPacks).set({
            ...pack,
            updatedAt: new Date(),
        }).where((0, drizzle_orm_1.eq)(schema_1.userApplicationPacks.id, id)).returning();
        return updated;
    }
    async getUserJobApplications(userId) {
        return db_1.db.select().from(schema_1.userJobApplications).where((0, drizzle_orm_1.eq)(schema_1.userJobApplications.userId, userId)).orderBy((0, drizzle_orm_1.desc)(schema_1.userJobApplications.createdAt));
    }
    async getUserJobApplicationById(id) {
        const [application] = await db_1.db.select().from(schema_1.userJobApplications).where((0, drizzle_orm_1.eq)(schema_1.userJobApplications.id, id));
        return application;
    }
    async createUserJobApplication(application) {
        const [created] = await db_1.db.insert(schema_1.userJobApplications).values(application).returning();
        return created;
    }
    async updateUserJobApplication(id, application) {
        const [updated] = await db_1.db.update(schema_1.userJobApplications).set({
            ...application,
            updatedAt: new Date(),
        }).where((0, drizzle_orm_1.eq)(schema_1.userJobApplications.id, id)).returning();
        return updated;
    }
    async getApplicationStatusHistory(applicationId) {
        return db_1.db.select().from(schema_1.applicationStatusHistory).where((0, drizzle_orm_1.eq)(schema_1.applicationStatusHistory.applicationId, applicationId)).orderBy((0, drizzle_orm_1.desc)(schema_1.applicationStatusHistory.createdAt));
    }
    async createApplicationStatusHistory(history) {
        const [created] = await db_1.db.insert(schema_1.applicationStatusHistory).values(history).returning();
        return created;
    }
    // Security: Account lockout methods
    async getAccountLockout(identifier, identifierType) {
        const [lockout] = await db_1.db.select().from(schema_1.accountLockouts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.accountLockouts.identifier, identifier), (0, drizzle_orm_1.eq)(schema_1.accountLockouts.identifierType, identifierType)));
        return lockout;
    }
    async incrementFailedAttempts(identifier, identifierType) {
        const existing = await this.getAccountLockout(identifier, identifierType);
        const now = new Date();
        if (existing) {
            const newAttempts = existing.failedAttempts + 1;
            // Lock account after 5 failed attempts for 30 minutes
            const lockedUntil = newAttempts >= 5 ? new Date(now.getTime() + 30 * 60 * 1000) : null;
            const [updated] = await db_1.db.update(schema_1.accountLockouts).set({
                failedAttempts: newAttempts,
                lastFailedAt: now,
                lockedUntil,
                updatedAt: now,
            }).where((0, drizzle_orm_1.eq)(schema_1.accountLockouts.id, existing.id)).returning();
            return updated;
        }
        const [created] = await db_1.db.insert(schema_1.accountLockouts).values({
            identifier,
            identifierType,
            failedAttempts: 1,
            lastFailedAt: now,
        }).returning();
        return created;
    }
    async resetFailedAttempts(identifier, identifierType) {
        await db_1.db.update(schema_1.accountLockouts).set({
            failedAttempts: 0,
            lockedUntil: null,
            updatedAt: new Date(),
        }).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.accountLockouts.identifier, identifier), (0, drizzle_orm_1.eq)(schema_1.accountLockouts.identifierType, identifierType)));
    }
    async isAccountLocked(identifier, identifierType) {
        const lockout = await this.getAccountLockout(identifier, identifierType);
        if (!lockout || !lockout.lockedUntil)
            return false;
        return lockout.lockedUntil > new Date();
    }
    // Security: Webhook idempotency methods
    async acquireWebhookLock(lockKey, webhookType, ttlSeconds = 300) {
        try {
            const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
            await db_1.db.insert(schema_1.webhookProcessingLocks).values({
                lockKey,
                webhookType,
                status: "processing",
                expiresAt,
            });
            return true;
        }
        catch (error) {
            // Unique constraint violation means lock already exists
            if (error.code === "23505") {
                // Check if existing lock is stale (expired)
                const [existing] = await db_1.db.select().from(schema_1.webhookProcessingLocks)
                    .where((0, drizzle_orm_1.eq)(schema_1.webhookProcessingLocks.lockKey, lockKey));
                if (existing && existing.expiresAt < new Date()) {
                    // Stale lock - clean up and try again
                    await db_1.db.delete(schema_1.webhookProcessingLocks).where((0, drizzle_orm_1.eq)(schema_1.webhookProcessingLocks.lockKey, lockKey));
                    return this.acquireWebhookLock(lockKey, webhookType, ttlSeconds);
                }
                return false;
            }
            throw error;
        }
    }
    async completeWebhookLock(lockKey) {
        await db_1.db.update(schema_1.webhookProcessingLocks).set({
            status: "completed",
            processedAt: new Date(),
        }).where((0, drizzle_orm_1.eq)(schema_1.webhookProcessingLocks.lockKey, lockKey));
    }
    async failWebhookLock(lockKey) {
        await db_1.db.update(schema_1.webhookProcessingLocks).set({
            status: "failed",
            processedAt: new Date(),
        }).where((0, drizzle_orm_1.eq)(schema_1.webhookProcessingLocks.lockKey, lockKey));
    }
    async getWebhookLock(lockKey) {
        const [lock] = await db_1.db.select().from(schema_1.webhookProcessingLocks)
            .where((0, drizzle_orm_1.eq)(schema_1.webhookProcessingLocks.lockKey, lockKey));
        return lock;
    }
    async cleanupStaleWebhookLocks() {
        const result = await db_1.db.delete(schema_1.webhookProcessingLocks)
            .where((0, drizzle_orm_1.lt)(schema_1.webhookProcessingLocks.expiresAt, new Date()))
            .returning();
        return result.length;
    }
    // User self-tracked applications implementation
    async getTrackedApplications(userId) {
        return db_1.db.select().from(schema_1.trackedApplications)
            .where((0, drizzle_orm_1.eq)(schema_1.trackedApplications.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.trackedApplications.updatedAt));
    }
    async getTrackedApplicationById(id) {
        const [application] = await db_1.db.select().from(schema_1.trackedApplications)
            .where((0, drizzle_orm_1.eq)(schema_1.trackedApplications.id, id));
        return application;
    }
    async createTrackedApplication(application) {
        const [created] = await db_1.db.insert(schema_1.trackedApplications).values(application).returning();
        return created;
    }
    async updateTrackedApplication(id, application) {
        const [updated] = await db_1.db.update(schema_1.trackedApplications)
            .set({ ...application, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.trackedApplications.id, id))
            .returning();
        return updated;
    }
    async deleteTrackedApplication(id) {
        await db_1.db.delete(schema_1.trackedApplications).where((0, drizzle_orm_1.eq)(schema_1.trackedApplications.id, id));
    }
    async getTrackedApplicationStats(userId) {
        const applications = await this.getTrackedApplications(userId);
        return {
            total: applications.length,
            applied: applications.filter(a => a.status === 'applied').length,
            interviewing: applications.filter(a => a.status === 'interviewing').length,
            offered: applications.filter(a => a.status === 'offered' || a.status === 'accepted').length,
        };
    }
    // Analytics implementation
    async recordAnalyticsEvent(event) {
        const [created] = await db_1.db.insert(schema_1.analyticsEvents).values(event).returning();
        return created;
    }
    async recordConversionEvent(event) {
        const [created] = await db_1.db.insert(schema_1.conversionEvents).values(event).returning();
        return created;
    }
    async getDailyStats(startDate, endDate) {
        return db_1.db.select().from(schema_1.dailyStats)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${schema_1.dailyStats.date} >= ${startDate}`, (0, drizzle_orm_1.sql) `${schema_1.dailyStats.date} <= ${endDate}`))
            .orderBy(schema_1.dailyStats.date);
    }
    async incrementDailyStat(date, statType) {
        // First, try to get existing record
        const [existing] = await db_1.db.select().from(schema_1.dailyStats).where((0, drizzle_orm_1.eq)(schema_1.dailyStats.date, date));
        if (!existing) {
            // Create new record
            const newRecord = {
                date,
                pageViews: 0,
                uniqueVisitors: 0,
                signups: 0,
                paymentsStarted: 0,
                paymentsCompleted: 0,
                revenue: 0,
                jobLinkClicks: 0,
                serviceOrders: 0,
                signupRate: 0,
                paymentRate: 0
            };
            // Increment the specific stat
            switch (statType) {
                case 'landing_view':
                    newRecord.pageViews = 1;
                    newRecord.uniqueVisitors = 1;
                    break;
                case 'signup':
                    newRecord.signups = 1;
                    break;
                case 'payment_started':
                    newRecord.paymentsStarted = 1;
                    break;
                case 'payment_completed':
                    newRecord.paymentsCompleted = 1;
                    break;
                case 'job_link_click':
                    newRecord.jobLinkClicks = 1;
                    break;
                case 'service_order':
                    newRecord.serviceOrders = 1;
                    break;
            }
            await db_1.db.insert(schema_1.dailyStats).values(newRecord);
        }
        else {
            // Update existing record
            const updateData = { updatedAt: new Date() };
            switch (statType) {
                case 'landing_view':
                    updateData.pageViews = (existing.pageViews || 0) + 1;
                    break;
                case 'signup':
                    updateData.signups = (existing.signups || 0) + 1;
                    break;
                case 'payment_started':
                    updateData.paymentsStarted = (existing.paymentsStarted || 0) + 1;
                    break;
                case 'payment_completed':
                    updateData.paymentsCompleted = (existing.paymentsCompleted || 0) + 1;
                    break;
                case 'job_link_click':
                    updateData.jobLinkClicks = (existing.jobLinkClicks || 0) + 1;
                    break;
                case 'service_order':
                    updateData.serviceOrders = (existing.serviceOrders || 0) + 1;
                    break;
            }
            await db_1.db.update(schema_1.dailyStats).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.dailyStats.date, date));
        }
    }
    async getConversionFunnel(startDate, endDate) {
        const steps = ['landing_view', 'signup', 'payment_started', 'payment_completed', 'dashboard_access'];
        const results = [];
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();
        for (const step of steps) {
            const [result] = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(distinct ${schema_1.conversionEvents.sessionId})` })
                .from(schema_1.conversionEvents)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversionEvents.funnelStep, step), (0, drizzle_orm_1.sql) `${schema_1.conversionEvents.completedAt} >= ${startIso}`, (0, drizzle_orm_1.sql) `${schema_1.conversionEvents.completedAt} <= ${endIso}`));
            results.push({
                step,
                count: Number(result?.count || 0),
                percentage: 0
            });
        }
        // Calculate percentages relative to first step
        const firstStepCount = results[0]?.count || 1;
        results.forEach(r => {
            r.percentage = Math.round((r.count / firstStepCount) * 100);
        });
        return results;
    }
    async getTopPages(startDate, endDate, limit) {
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();
        const result = await db_1.db.select({
            page: schema_1.analyticsEvents.page,
            views: (0, drizzle_orm_1.sql) `count(*)::int`
        })
            .from(schema_1.analyticsEvents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.analyticsEvents.eventType, 'page_view'), (0, drizzle_orm_1.sql) `${schema_1.analyticsEvents.createdAt} >= ${startIso}`, (0, drizzle_orm_1.sql) `${schema_1.analyticsEvents.createdAt} <= ${endIso}`))
            .groupBy(schema_1.analyticsEvents.page)
            .orderBy((0, drizzle_orm_1.sql) `count(*) desc`)
            .limit(limit);
        return result.map(r => ({
            page: r.page || 'unknown',
            views: Number(r.views)
        }));
    }
    async getDeviceBreakdown(startDate, endDate) {
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();
        const result = await db_1.db.select({
            device: schema_1.analyticsEvents.deviceType,
            count: (0, drizzle_orm_1.sql) `count(distinct ${schema_1.analyticsEvents.sessionId})::int`
        })
            .from(schema_1.analyticsEvents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${schema_1.analyticsEvents.createdAt} >= ${startIso}`, (0, drizzle_orm_1.sql) `${schema_1.analyticsEvents.createdAt} <= ${endIso}`))
            .groupBy(schema_1.analyticsEvents.deviceType);
        const total = result.reduce((sum, r) => sum + Number(r.count), 0) || 1;
        return result.map(r => ({
            device: r.device || 'unknown',
            count: Number(r.count),
            percentage: Math.round((Number(r.count) / total) * 100)
        }));
    }
    async getRecentEvents(limit) {
        return db_1.db.select().from(schema_1.analyticsEvents)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.analyticsEvents.createdAt))
            .limit(limit);
    }
    async getActiveUsers(minutes) {
        const cutoffIso = new Date(Date.now() - minutes * 60 * 1000).toISOString();
        const [result] = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(distinct ${schema_1.analyticsEvents.sessionId})::int` })
            .from(schema_1.analyticsEvents)
            .where((0, drizzle_orm_1.sql) `${schema_1.analyticsEvents.createdAt} >= ${cutoffIso}`);
        return Number(result?.count || 0);
    }
    async getEventsByCategory(startDate, endDate, category) {
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();
        let query = db_1.db.select({
            category: schema_1.analyticsEvents.eventCategory,
            eventName: schema_1.analyticsEvents.eventName,
            count: (0, drizzle_orm_1.sql) `count(*)::int`
        })
            .from(schema_1.analyticsEvents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${schema_1.analyticsEvents.createdAt} >= ${startIso}`, (0, drizzle_orm_1.sql) `${schema_1.analyticsEvents.createdAt} <= ${endIso}`, category ? (0, drizzle_orm_1.eq)(schema_1.analyticsEvents.eventCategory, category) : (0, drizzle_orm_1.sql) `1=1`))
            .groupBy(schema_1.analyticsEvents.eventCategory, schema_1.analyticsEvents.eventName)
            .orderBy((0, drizzle_orm_1.sql) `count(*) desc`);
        const result = await query;
        return result.map(r => ({
            category: r.category,
            eventName: r.eventName,
            count: Number(r.count)
        }));
    }
    // ============================================
    // COUNTRY INSIGHTS, ADVISORS, CONSULTATIONS
    // ============================================
    async getCountryInsights(countryCode) {
        const [insight] = await db_1.db.select().from(schema_1.countryInsights).where((0, drizzle_orm_1.eq)(schema_1.countryInsights.countryCode, countryCode));
        return insight || null;
    }
    async getAllCountryInsights() {
        return db_1.db.select().from(schema_1.countryInsights);
    }
    async getActiveAdvisors() {
        return db_1.db.select().from(schema_1.advisors).where((0, drizzle_orm_1.eq)(schema_1.advisors.isActive, true));
    }
    async getAdvisorById(id) {
        const [advisor] = await db_1.db.select().from(schema_1.advisors).where((0, drizzle_orm_1.eq)(schema_1.advisors.id, id));
        return advisor || null;
    }
    async createConsultationBooking(booking) {
        const [newBooking] = await db_1.db.insert(schema_1.consultationBookings).values(booking).returning();
        return newBooking;
    }
    async getUserConsultations(userId) {
        return db_1.db.select().from(schema_1.consultationBookings).where((0, drizzle_orm_1.eq)(schema_1.consultationBookings.userId, userId)).orderBy((0, drizzle_orm_1.desc)(schema_1.consultationBookings.scheduledDate));
    }
    async getAllConsultations() {
        return db_1.db.select().from(schema_1.consultationBookings).orderBy((0, drizzle_orm_1.desc)(schema_1.consultationBookings.createdAt));
    }
    async updateConsultationStatus(id, status) {
        const [updated] = await db_1.db.update(schema_1.consultationBookings).set({ status, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.consultationBookings.id, id)).returning();
        return updated || null;
    }
    async updateConsultationAdmin(id, data) {
        const [updated] = await db_1.db.update(schema_1.consultationBookings)
            .set({ ...data, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.consultationBookings.id, id))
            .returning();
        return updated || null;
    }
    async markConsultationWhatsappSent(id) {
        await db_1.db.update(schema_1.consultationBookings).set({ whatsappSent: true }).where((0, drizzle_orm_1.eq)(schema_1.consultationBookings.id, id));
    }
    async getFeaturedSuccessStories() {
        return db_1.db.select().from(schema_1.successStories).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.successStories.isActive, true), (0, drizzle_orm_1.eq)(schema_1.successStories.isFeatured, true))).limit(6);
    }
    async getAllSuccessStories() {
        return db_1.db.select().from(schema_1.successStories).where((0, drizzle_orm_1.eq)(schema_1.successStories.isActive, true));
    }
    // ============================================
    // USER CAREER PROFILES & JOB ALERTS
    // ============================================
    async getUserCareerProfile(userId) {
        const [profile] = await db_1.db.select().from(schema_1.userCareerProfiles).where((0, drizzle_orm_1.eq)(schema_1.userCareerProfiles.userId, userId));
        return profile || null;
    }
    async upsertUserCareerProfile(userId, data) {
        const existing = await this.getUserCareerProfile(userId);
        if (existing) {
            const [updated] = await db_1.db.update(schema_1.userCareerProfiles)
                .set({ ...data, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.userCareerProfiles.userId, userId))
                .returning();
            return updated;
        }
        else {
            const [created] = await db_1.db.insert(schema_1.userCareerProfiles)
                .values({ ...data, userId })
                .returning();
            return created;
        }
    }
    async updateCareerProfileRecommendations(userId, recommendations) {
        const [updated] = await db_1.db.update(schema_1.userCareerProfiles)
            .set({ aiRecommendations: recommendations, lastAnalyzedAt: new Date(), updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.userCareerProfiles.userId, userId))
            .returning();
        return updated || null;
    }
    async createJobAlertSubscription(subscription) {
        const [created] = await db_1.db.insert(schema_1.jobAlertSubscriptions).values(subscription).returning();
        return created;
    }
    async getUserJobAlerts(userId) {
        return db_1.db.select().from(schema_1.jobAlertSubscriptions).where((0, drizzle_orm_1.eq)(schema_1.jobAlertSubscriptions.userId, userId));
    }
    async updateJobAlert(id, data) {
        const [updated] = await db_1.db.update(schema_1.jobAlertSubscriptions).set(data).where((0, drizzle_orm_1.eq)(schema_1.jobAlertSubscriptions.id, id)).returning();
        return updated || null;
    }
    async deleteJobAlert(id) {
        await db_1.db.delete(schema_1.jobAlertSubscriptions).where((0, drizzle_orm_1.eq)(schema_1.jobAlertSubscriptions.id, id));
    }
    async getVideoTestimonials() {
        return db_1.db.select().from(schema_1.videoTestimonials).where((0, drizzle_orm_1.eq)(schema_1.videoTestimonials.isApproved, true));
    }
    async createVideoTestimonial(testimonial) {
        const [created] = await db_1.db.insert(schema_1.videoTestimonials).values(testimonial).returning();
        return created;
    }
    async getAgencyNotificationPreference(agencyId) {
        const [pref] = await db_1.db.select().from(schema_1.agencyNotificationPreferences).where((0, drizzle_orm_1.eq)(schema_1.agencyNotificationPreferences.agencyId, agencyId));
        return pref;
    }
    async upsertAgencyNotificationPreference(pref) {
        const existing = await this.getAgencyNotificationPreference(pref.agencyId);
        if (existing) {
            const [updated] = await db_1.db.update(schema_1.agencyNotificationPreferences)
                .set({ ...pref, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.agencyNotificationPreferences.agencyId, pref.agencyId))
                .returning();
            return updated;
        }
        const [created] = await db_1.db.insert(schema_1.agencyNotificationPreferences).values(pref).returning();
        return created;
    }
    async getAllAgencyNotificationPreferences() {
        return db_1.db.select().from(schema_1.agencyNotificationPreferences);
    }
    async disableAgencyReminders(agencyId) {
        const existing = await this.getAgencyNotificationPreference(agencyId);
        if (existing) {
            await db_1.db.update(schema_1.agencyNotificationPreferences)
                .set({ remindersEnabled: false, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.agencyNotificationPreferences.agencyId, agencyId));
        }
        else {
            await db_1.db.insert(schema_1.agencyNotificationPreferences).values({
                agencyId,
                remindersEnabled: false,
            });
        }
    }
    async enableAgencyReminders(agencyId) {
        const existing = await this.getAgencyNotificationPreference(agencyId);
        if (existing) {
            await db_1.db.update(schema_1.agencyNotificationPreferences)
                .set({ remindersEnabled: true, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.agencyNotificationPreferences.agencyId, agencyId));
        }
        else {
            await db_1.db.insert(schema_1.agencyNotificationPreferences).values({
                agencyId,
                remindersEnabled: true,
            });
        }
    }
    async createLicenseReminderLog(log) {
        const [created] = await db_1.db.insert(schema_1.licenseReminderLogs).values(log).returning();
        return created;
    }
    async getLicenseReminderLogs(filters) {
        const conditions = [];
        if (filters?.agencyId)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.licenseReminderLogs.agencyId, filters.agencyId));
        if (filters?.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.licenseReminderLogs.status, filters.status));
        if (filters?.reminderTier)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.licenseReminderLogs.reminderTier, filters.reminderTier));
        const query = db_1.db.select().from(schema_1.licenseReminderLogs);
        const withConditions = conditions.length > 0 ? query.where((0, drizzle_orm_1.and)(...conditions)) : query;
        const ordered = withConditions.orderBy((0, drizzle_orm_1.desc)(schema_1.licenseReminderLogs.createdAt));
        if (filters?.limit) {
            const limited = ordered.limit(filters.limit);
            if (filters?.offset)
                return limited.offset(filters.offset);
            return limited;
        }
        return ordered;
    }
    async getLicenseReminderLogCount(filters) {
        const conditions = [];
        if (filters?.agencyId)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.licenseReminderLogs.agencyId, filters.agencyId));
        if (filters?.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.licenseReminderLogs.status, filters.status));
        if (filters?.reminderTier)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.licenseReminderLogs.reminderTier, filters.reminderTier));
        const query = db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.licenseReminderLogs);
        const withConditions = conditions.length > 0 ? query.where((0, drizzle_orm_1.and)(...conditions)) : query;
        const [result] = await withConditions;
        return Number(result?.count || 0);
    }
    async getLicenseReminderLogById(id) {
        const [log] = await db_1.db.select().from(schema_1.licenseReminderLogs).where((0, drizzle_orm_1.eq)(schema_1.licenseReminderLogs.id, id));
        return log;
    }
    async updateLicenseReminderLog(id, data) {
        const [updated] = await db_1.db.update(schema_1.licenseReminderLogs)
            .set(data)
            .where((0, drizzle_orm_1.eq)(schema_1.licenseReminderLogs.id, id))
            .returning();
        return updated;
    }
    async checkReminderAlreadySent(agencyId, reminderTier, date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        // Bind dates as ISO strings (see comment in checkNotificationExists).
        const [existing] = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema_1.licenseReminderLogs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.licenseReminderLogs.agencyId, agencyId), (0, drizzle_orm_1.eq)(schema_1.licenseReminderLogs.reminderTier, reminderTier), (0, drizzle_orm_1.sql) `${schema_1.licenseReminderLogs.createdAt} >= ${startOfDay.toISOString()}`, (0, drizzle_orm_1.sql) `${schema_1.licenseReminderLogs.createdAt} <= ${endOfDay.toISOString()}`));
        return Number(existing?.count || 0) > 0;
    }
    async createLicenseRenewalPayment(payment) {
        const [created] = await db_1.db.insert(schema_1.licenseRenewalPayments).values(payment).returning();
        return created;
    }
    async getLicenseRenewalPaymentById(id) {
        const [payment] = await db_1.db.select().from(schema_1.licenseRenewalPayments).where((0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.id, id));
        return payment;
    }
    async getLicenseRenewalPaymentByCheckoutId(checkoutRequestId) {
        const [payment] = await db_1.db.select().from(schema_1.licenseRenewalPayments)
            .where((0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.checkoutRequestId, checkoutRequestId));
        return payment;
    }
    async getLicenseRenewalPaymentsByAgency(agencyId) {
        return db_1.db.select().from(schema_1.licenseRenewalPayments)
            .where((0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.agencyId, agencyId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.licenseRenewalPayments.createdAt));
    }
    async updateLicenseRenewalPayment(id, data) {
        const [updated] = await db_1.db.update(schema_1.licenseRenewalPayments)
            .set(data)
            .where((0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.id, id))
            .returning();
        return updated;
    }
    async getGovernmentIntegrations() {
        return db_1.db.select().from(schema_1.governmentIntegrations).orderBy(schema_1.governmentIntegrations.name);
    }
    async getGovernmentIntegrationById(id) {
        const [integration] = await db_1.db.select().from(schema_1.governmentIntegrations)
            .where((0, drizzle_orm_1.eq)(schema_1.governmentIntegrations.id, id)).limit(1);
        return integration;
    }
    async getGovernmentIntegrationByCode(code) {
        const [integration] = await db_1.db.select().from(schema_1.governmentIntegrations)
            .where((0, drizzle_orm_1.eq)(schema_1.governmentIntegrations.code, code)).limit(1);
        return integration;
    }
    async createGovernmentIntegration(data) {
        const [integration] = await db_1.db.insert(schema_1.governmentIntegrations).values(data).returning();
        return integration;
    }
    async updateGovernmentIntegration(id, data) {
        const [updated] = await db_1.db.update(schema_1.governmentIntegrations)
            .set({ ...data, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.governmentIntegrations.id, id)).returning();
        return updated;
    }
    async deleteGovernmentIntegration(id) {
        const result = await db_1.db.delete(schema_1.governmentIntegrations).where((0, drizzle_orm_1.eq)(schema_1.governmentIntegrations.id, id));
        return true;
    }
    async getGovernmentSyncLogs(filters) {
        let query = db_1.db.select().from(schema_1.governmentSyncLogs).orderBy((0, drizzle_orm_1.desc)(schema_1.governmentSyncLogs.startedAt));
        const conditions = [];
        if (filters?.integrationCode) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.governmentSyncLogs.integrationCode, filters.integrationCode));
        }
        if (filters?.status) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.governmentSyncLogs.status, filters.status));
        }
        if (filters?.action) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.governmentSyncLogs.action, filters.action));
        }
        if (conditions.length > 0) {
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        }
        return query.limit(filters?.limit || 100).offset(filters?.offset || 0);
    }
    async getGovernmentSyncLogByRequestId(requestId) {
        const [log] = await db_1.db.select().from(schema_1.governmentSyncLogs)
            .where((0, drizzle_orm_1.eq)(schema_1.governmentSyncLogs.requestId, requestId)).limit(1);
        return log;
    }
    async getGovernmentSyncStats() {
        const logs = await db_1.db.select().from(schema_1.governmentSyncLogs);
        const stats = {
            total: logs.length,
            pending: logs.filter(l => l.status === "pending").length,
            success: logs.filter(l => l.status === "success").length,
            error: logs.filter(l => l.status === "error").length,
            byIntegration: {},
        };
        logs.forEach(l => {
            if (!stats.byIntegration[l.integrationCode]) {
                stats.byIntegration[l.integrationCode] = { total: 0, success: 0, error: 0 };
            }
            stats.byIntegration[l.integrationCode].total++;
            if (l.status === "success")
                stats.byIntegration[l.integrationCode].success++;
            if (l.status === "error")
                stats.byIntegration[l.integrationCode].error++;
        });
        return stats;
    }
    async getGovernmentFeatureFlags() {
        return db_1.db.select().from(schema_1.governmentFeatureFlags).orderBy(schema_1.governmentFeatureFlags.key);
    }
    async getGovernmentFeatureFlagByKey(key) {
        const [flag] = await db_1.db.select().from(schema_1.governmentFeatureFlags)
            .where((0, drizzle_orm_1.eq)(schema_1.governmentFeatureFlags.key, key)).limit(1);
        return flag;
    }
    async upsertGovernmentFeatureFlag(data) {
        const existing = await this.getGovernmentFeatureFlagByKey(data.key);
        if (existing) {
            const [updated] = await db_1.db.update(schema_1.governmentFeatureFlags)
                .set({ ...data, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.governmentFeatureFlags.id, existing.id)).returning();
            return updated;
        }
        const [created] = await db_1.db.insert(schema_1.governmentFeatureFlags).values(data).returning();
        return created;
    }
    async updateGovernmentFeatureFlag(id, data) {
        const [updated] = await db_1.db.update(schema_1.governmentFeatureFlags)
            .set({ ...data, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.governmentFeatureFlags.id, id)).returning();
        return updated;
    }
    async getManualOverrides(filters) {
        let query = db_1.db.select().from(schema_1.manualOverrides).orderBy((0, drizzle_orm_1.desc)(schema_1.manualOverrides.createdAt));
        if (filters) {
            const conditions = [];
            if (filters.integrationCode) {
                conditions.push((0, drizzle_orm_1.eq)(schema_1.manualOverrides.integrationCode, filters.integrationCode));
            }
            if (filters.overrideStatus) {
                conditions.push((0, drizzle_orm_1.eq)(schema_1.manualOverrides.overrideStatus, filters.overrideStatus));
            }
            if (filters.syncStatus) {
                conditions.push((0, drizzle_orm_1.eq)(schema_1.manualOverrides.syncStatus, filters.syncStatus));
            }
            if (conditions.length > 0) {
                query = query.where((0, drizzle_orm_1.and)(...conditions));
            }
            if (filters.limit) {
                query = query.limit(filters.limit);
            }
            if (filters.offset) {
                query = query.offset(filters.offset);
            }
        }
        return query;
    }
    async getManualOverrideById(id) {
        const [override] = await db_1.db.select().from(schema_1.manualOverrides)
            .where((0, drizzle_orm_1.eq)(schema_1.manualOverrides.id, id)).limit(1);
        return override;
    }
    async getManualOverrideByLicense(integrationCode, licenseNumber) {
        const [override] = await db_1.db.select().from(schema_1.manualOverrides)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.manualOverrides.integrationCode, integrationCode), (0, drizzle_orm_1.eq)(schema_1.manualOverrides.licenseNumber, licenseNumber), (0, drizzle_orm_1.eq)(schema_1.manualOverrides.overrideStatus, 'approved')))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.manualOverrides.approvedAt))
            .limit(1);
        return override;
    }
    async createManualOverride(data) {
        const [override] = await db_1.db.insert(schema_1.manualOverrides).values(data).returning();
        return override;
    }
    async updateManualOverride(id, data) {
        const [updated] = await db_1.db.update(schema_1.manualOverrides)
            .set({ ...data, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.manualOverrides.id, id)).returning();
        return updated;
    }
    async getManualOverrideCount(filters) {
        let query = db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.manualOverrides);
        if (filters) {
            const conditions = [];
            if (filters.integrationCode) {
                conditions.push((0, drizzle_orm_1.eq)(schema_1.manualOverrides.integrationCode, filters.integrationCode));
            }
            if (filters.overrideStatus) {
                conditions.push((0, drizzle_orm_1.eq)(schema_1.manualOverrides.overrideStatus, filters.overrideStatus));
            }
            if (filters.syncStatus) {
                conditions.push((0, drizzle_orm_1.eq)(schema_1.manualOverrides.syncStatus, filters.syncStatus));
            }
            if (conditions.length > 0) {
                query = query.where((0, drizzle_orm_1.and)(...conditions));
            }
        }
        const [result] = await query;
        return Number(result?.count ?? 0);
    }
    async getPendingSyncOverrides(integrationCode) {
        return db_1.db.select().from(schema_1.manualOverrides)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.manualOverrides.integrationCode, integrationCode), (0, drizzle_orm_1.eq)(schema_1.manualOverrides.overrideStatus, 'approved'), (0, drizzle_orm_1.eq)(schema_1.manualOverrides.syncRequired, true), (0, drizzle_orm_1.eq)(schema_1.manualOverrides.syncStatus, 'pending')))
            .orderBy(schema_1.manualOverrides.createdAt);
    }
    async getExpiredManualOverrides() {
        return db_1.db.select().from(schema_1.manualOverrides)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.manualOverrides.overrideStatus, 'approved'), (0, drizzle_orm_1.eq)(schema_1.manualOverrides.expiryNotified, false), (0, drizzle_orm_1.sql) `${schema_1.manualOverrides.manualVerificationExpiry} IS NOT NULL AND ${schema_1.manualOverrides.manualVerificationExpiry} < NOW()`));
    }
    // ── Security Events (behavior tracking + anomaly detection) ─────────────
    async createSecurityEvent(data) {
        const [event] = await db_1.db.insert(schema_1.securityEvents).values(data).returning();
        return event;
    }
    async getSecurityEvents(opts) {
        const conditions = [];
        if (opts?.eventType)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.securityEvents.eventType, opts.eventType));
        if (opts?.ipAddress)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.securityEvents.ipAddress, opts.ipAddress));
        if (opts?.userId)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.securityEvents.userId, opts.userId));
        if (opts?.since)
            conditions.push((0, drizzle_orm_1.gte)(schema_1.securityEvents.createdAt, opts.since));
        let query = db_1.db.select().from(schema_1.securityEvents).orderBy((0, drizzle_orm_1.desc)(schema_1.securityEvents.createdAt));
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        query = query.limit(opts?.limit ?? 100).offset(opts?.offset ?? 0);
        return query;
    }
    async getTopSuspiciousIPs(since, limit = 10) {
        // Bind `since` as an ISO string — postgres-js 3.4.9 throws
        // ERR_INVALID_ARG_TYPE in Buffer.byteLength inside its Bind path
        // when a Date arrives without explicit type negotiation.
        const sinceIso = since.toISOString();
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT
        ip_address AS "ipAddress",
        SUM(risk_points)::int AS "totalRiskPoints",
        COUNT(*)::int AS "eventCount",
        ARRAY_AGG(DISTINCT event_type)::text[] AS "eventTypes"
      FROM security_events
      WHERE ip_address IS NOT NULL AND created_at >= ${sinceIso}
      GROUP BY ip_address
      ORDER BY SUM(risk_points) DESC
      LIMIT ${limit}
    `);
        // postgres-js returns a RowList (array-like). pg returns { rows: [...] }.
        // Support both so the function works whether db is wired to postgres-js or pg.
        return (rows.rows ?? rows);
    }
    async getHighRiskUsers(since, limit = 10) {
        const sinceIso = since.toISOString();
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT
        user_id AS "userId",
        SUM(risk_points)::int AS "totalRiskPoints",
        COUNT(*)::int AS "eventCount",
        ARRAY_AGG(DISTINCT event_type)::text[] AS "eventTypes"
      FROM security_events
      WHERE user_id IS NOT NULL AND created_at >= ${sinceIso}
      GROUP BY user_id
      ORDER BY SUM(risk_points) DESC
      LIMIT ${limit}
    `);
        return (rows.rows ?? rows);
    }
    async getSecurityEventStats(since) {
        const sinceIso = since.toISOString();
        const totalsResult = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT
        COUNT(*)::int AS "totalEvents",
        COALESCE(SUM(risk_points), 0)::int AS "totalRiskPoints",
        COUNT(DISTINCT ip_address)::int AS "uniqueIPs",
        COUNT(DISTINCT user_id)::int AS "uniqueUsers"
      FROM security_events
      WHERE created_at >= ${sinceIso}
    `);
        const totalsRows = (totalsResult.rows ?? totalsResult);
        const t = (totalsRows[0] ?? {});
        const typeResult = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT event_type AS "eventType", COUNT(*)::int AS cnt
      FROM security_events
      WHERE created_at >= ${sinceIso}
      GROUP BY event_type
    `);
        const typeRows = (typeResult.rows ?? typeResult);
        const byType = {};
        for (const row of typeRows) {
            byType[row.eventType] = row.cnt;
        }
        return {
            totalEvents: t.totalEvents ?? 0,
            totalRiskPoints: t.totalRiskPoints ?? 0,
            uniqueIPs: t.uniqueIPs ?? 0,
            uniqueUsers: t.uniqueUsers ?? 0,
            byType,
        };
    }
    async pruneOldSecurityEvents(olderThan) {
        const olderThanIso = olderThan.toISOString();
        const result = await db_1.db.delete(schema_1.securityEvents).where((0, drizzle_orm_1.sql) `${schema_1.securityEvents.createdAt} < ${olderThanIso}`);
        return result.rowCount ?? 0;
    }
    async setIntegrationFallbackMode(code, enabled, reason) {
        const [updated] = await db_1.db.update(schema_1.governmentIntegrations)
            .set({
            fallbackMode: enabled,
            fallbackReason: reason || null,
            fallbackActivatedAt: enabled ? new Date() : null,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.governmentIntegrations.code, code)).returning();
        return updated;
    }
    async createComplianceAuditLog(log) {
        const [created] = await db_1.db.insert(schema_1.complianceAuditLogs).values(log).returning();
        return created;
    }
    async getComplianceAuditLogs(filters) {
        let query = db_1.db.select().from(schema_1.complianceAuditLogs).orderBy((0, drizzle_orm_1.desc)(schema_1.complianceAuditLogs.createdAt));
        if (filters) {
            const conditions = [];
            if (filters.userId)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAuditLogs.userId, filters.userId));
            if (filters.action)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAuditLogs.action, filters.action));
            if (filters.recordType)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAuditLogs.recordType, filters.recordType));
            if (filters.recordId)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAuditLogs.recordId, filters.recordId));
            if (conditions.length > 0)
                query = query.where((0, drizzle_orm_1.and)(...conditions));
            if (filters.limit)
                query = query.limit(filters.limit);
            if (filters.offset)
                query = query.offset(filters.offset);
        }
        return query;
    }
    async getComplianceAuditLogCount(filters) {
        let query = db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.complianceAuditLogs);
        if (filters) {
            const conditions = [];
            if (filters.userId)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAuditLogs.userId, filters.userId));
            if (filters.action)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAuditLogs.action, filters.action));
            if (filters.recordType)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAuditLogs.recordType, filters.recordType));
            if (filters.recordId)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAuditLogs.recordId, filters.recordId));
            if (conditions.length > 0)
                query = query.where((0, drizzle_orm_1.and)(...conditions));
        }
        const [result] = await query;
        return Number(result?.count ?? 0);
    }
    async createDowntimeEvent(event) {
        const [created] = await db_1.db.insert(schema_1.governmentDowntimeEvents).values(event).returning();
        return created;
    }
    async getDowntimeEvents(filters) {
        let query = db_1.db.select().from(schema_1.governmentDowntimeEvents).orderBy((0, drizzle_orm_1.desc)(schema_1.governmentDowntimeEvents.createdAt));
        if (filters) {
            const conditions = [];
            if (filters.integrationCode)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.governmentDowntimeEvents.integrationCode, filters.integrationCode));
            if (filters.eventType)
                conditions.push((0, drizzle_orm_1.eq)(schema_1.governmentDowntimeEvents.eventType, filters.eventType));
            if (conditions.length > 0)
                query = query.where((0, drizzle_orm_1.and)(...conditions));
            if (filters.limit)
                query = query.limit(filters.limit);
            if (filters.offset)
                query = query.offset(filters.offset);
        }
        return query;
    }
    async getDowntimeAnalytics(integrationCode) {
        let baseConditions = [];
        if (integrationCode)
            baseConditions.push((0, drizzle_orm_1.eq)(schema_1.governmentDowntimeEvents.integrationCode, integrationCode));
        const [totalResult] = await (baseConditions.length > 0
            ? db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.governmentDowntimeEvents).where((0, drizzle_orm_1.and)(...baseConditions))
            : db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.governmentDowntimeEvents));
        const outageConditions = [...baseConditions, (0, drizzle_orm_1.eq)(schema_1.governmentDowntimeEvents.eventType, 'outage_start')];
        const [outageResult] = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.governmentDowntimeEvents).where((0, drizzle_orm_1.and)(...outageConditions));
        const fallbackConditions = [...baseConditions, (0, drizzle_orm_1.eq)(schema_1.governmentDowntimeEvents.eventType, 'fallback_activated')];
        const [fallbackResult] = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.governmentDowntimeEvents).where((0, drizzle_orm_1.and)(...fallbackConditions));
        const durationConditions = [...baseConditions, (0, drizzle_orm_1.sql) `${schema_1.governmentDowntimeEvents.durationMs} IS NOT NULL`];
        const [durationResult] = await db_1.db.select({ avg: (0, drizzle_orm_1.sql) `COALESCE(AVG(${schema_1.governmentDowntimeEvents.durationMs}), 0)` }).from(schema_1.governmentDowntimeEvents).where((0, drizzle_orm_1.and)(...durationConditions));
        return {
            totalEvents: Number(totalResult?.count ?? 0),
            totalOutages: Number(outageResult?.count ?? 0),
            totalFallbacks: Number(fallbackResult?.count ?? 0),
            avgDurationMs: Math.round(Number(durationResult?.avg ?? 0)),
        };
    }
    async createAuditExport(data) {
        const [created] = await db_1.db.insert(schema_1.auditExports).values(data).returning();
        return created;
    }
    async getAuditExports(limit = 50) {
        return db_1.db.select().from(schema_1.auditExports).orderBy((0, drizzle_orm_1.desc)(schema_1.auditExports.createdAt)).limit(limit);
    }
    async getAgencyScore(agencyId) {
        const [score] = await db_1.db.select().from(schema_1.agencyLegitimacyScores).where((0, drizzle_orm_1.eq)(schema_1.agencyLegitimacyScores.agencyId, agencyId));
        return score;
    }
    async upsertAgencyScore(data) {
        const existing = await this.getAgencyScore(data.agencyId);
        if (existing) {
            const [updated] = await db_1.db.update(schema_1.agencyLegitimacyScores)
                .set({ ...data, updatedAt: new Date(), lastCalculatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.agencyLegitimacyScores.agencyId, data.agencyId))
                .returning();
            return updated;
        }
        const [created] = await db_1.db.insert(schema_1.agencyLegitimacyScores).values(data).returning();
        return created;
    }
    async getAllAgencyScores(filters) {
        const conditions = [];
        if (filters?.tier)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.agencyLegitimacyScores.tier, filters.tier));
        if (filters?.isFrozen !== undefined)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.agencyLegitimacyScores.isFrozen, filters.isFrozen));
        const query = db_1.db.select().from(schema_1.agencyLegitimacyScores)
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.agencyLegitimacyScores.overallScore))
            .limit(filters?.limit || 100)
            .offset(filters?.offset || 0);
        return query;
    }
    async getAgencyScoreCount(filters) {
        const conditions = [];
        if (filters?.tier)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.agencyLegitimacyScores.tier, filters.tier));
        if (filters?.isFrozen !== undefined)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.agencyLegitimacyScores.isFrozen, filters.isFrozen));
        const [result] = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema_1.agencyLegitimacyScores)
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined);
        return Number(result?.count ?? 0);
    }
    async freezeAgencyScore(agencyId, frozenBy, reason) {
        await db_1.db.update(schema_1.agencyLegitimacyScores)
            .set({ isFrozen: true, frozenBy, frozenReason: reason, frozenAt: new Date(), updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.agencyLegitimacyScores.agencyId, agencyId));
    }
    async unfreezeAgencyScore(agencyId) {
        await db_1.db.update(schema_1.agencyLegitimacyScores)
            .set({ isFrozen: false, frozenBy: null, frozenReason: null, frozenAt: null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.agencyLegitimacyScores.agencyId, agencyId));
    }
    async createScoreHistory(data) {
        const [created] = await db_1.db.insert(schema_1.agencyScoreHistory).values(data).returning();
        return created;
    }
    async getScoreHistory(agencyId, limit = 50) {
        return db_1.db.select().from(schema_1.agencyScoreHistory)
            .where((0, drizzle_orm_1.eq)(schema_1.agencyScoreHistory.agencyId, agencyId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.agencyScoreHistory.createdAt))
            .limit(limit);
    }
    async createComplianceEvent(data) {
        const [created] = await db_1.db.insert(schema_1.agencyComplianceEvents).values(data).returning();
        return created;
    }
    async getComplianceEvents(agencyId, limit = 50) {
        return db_1.db.select().from(schema_1.agencyComplianceEvents)
            .where((0, drizzle_orm_1.eq)(schema_1.agencyComplianceEvents.agencyId, agencyId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.agencyComplianceEvents.createdAt))
            .limit(limit);
    }
    async getRecentComplianceEvents(agencyId, monthsBack = 12) {
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
        const cutoffIso = cutoffDate.toISOString();
        return db_1.db.select().from(schema_1.agencyComplianceEvents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agencyComplianceEvents.agencyId, agencyId), (0, drizzle_orm_1.sql) `${schema_1.agencyComplianceEvents.createdAt} >= ${cutoffIso}`))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.agencyComplianceEvents.createdAt));
    }
    async getScoreWeights() {
        return db_1.db.select().from(schema_1.agencyScoreWeights).orderBy(schema_1.agencyScoreWeights.factorName);
    }
    async updateScoreWeight(id, weight, updatedBy) {
        const [updated] = await db_1.db.update(schema_1.agencyScoreWeights)
            .set({ weight, updatedBy, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.agencyScoreWeights.id, id))
            .returning();
        return updated;
    }
    async createBlacklistEntry(data) {
        const [entry] = await db_1.db.insert(schema_1.blacklistedEntities).values(data).returning();
        return entry;
    }
    async getBlacklistEntry(id) {
        const [entry] = await db_1.db.select().from(schema_1.blacklistedEntities).where((0, drizzle_orm_1.eq)(schema_1.blacklistedEntities.id, id));
        return entry;
    }
    async getAllBlacklistEntries(filters = {}) {
        const conditions = [];
        if (filters.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.blacklistedEntities.status, filters.status));
        if (filters.entityType)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.blacklistedEntities.entityType, filters.entityType));
        let query = db_1.db.select().from(schema_1.blacklistedEntities);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.blacklistedEntities.dateAdded))
            .limit(filters.limit || 100)
            .offset(filters.offset || 0);
    }
    async getBlacklistCount(filters = {}) {
        const conditions = [];
        if (filters.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.blacklistedEntities.status, filters.status));
        if (filters.entityType)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.blacklistedEntities.entityType, filters.entityType));
        let query = db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.blacklistedEntities);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        const [result] = await query;
        return Number(result.count);
    }
    async isEntityBlacklisted(entityId) {
        const [entry] = await db_1.db.select().from(schema_1.blacklistedEntities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.blacklistedEntities.entityId, entityId), (0, drizzle_orm_1.eq)(schema_1.blacklistedEntities.status, "active")));
        return !!entry;
    }
    async getActiveBlacklistedEntityIds() {
        const rows = await db_1.db.select({ entityId: schema_1.blacklistedEntities.entityId })
            .from(schema_1.blacklistedEntities)
            .where((0, drizzle_orm_1.eq)(schema_1.blacklistedEntities.status, "active"));
        return new Set(rows.map(r => r.entityId));
    }
    async getBlacklistByEntityId(entityId) {
        return db_1.db.select().from(schema_1.blacklistedEntities)
            .where((0, drizzle_orm_1.eq)(schema_1.blacklistedEntities.entityId, entityId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.blacklistedEntities.dateAdded));
    }
    async updateBlacklistStatus(id, status) {
        const [updated] = await db_1.db.update(schema_1.blacklistedEntities)
            .set({ status, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.blacklistedEntities.id, id))
            .returning();
        return updated;
    }
    async clearBlacklistEntry(id, clearedBy, clearedReason) {
        const [updated] = await db_1.db.update(schema_1.blacklistedEntities)
            .set({ status: "cleared", clearedAt: new Date(), clearedBy, clearedReason, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.blacklistedEntities.id, id))
            .returning();
        return updated;
    }
    async createFraudFlag(data) {
        const [flag] = await db_1.db.insert(schema_1.fraudFlags).values(data).returning();
        return flag;
    }
    async getFraudFlag(id) {
        const [flag] = await db_1.db.select().from(schema_1.fraudFlags).where((0, drizzle_orm_1.eq)(schema_1.fraudFlags.id, id));
        return flag;
    }
    async getAllFraudFlags(filters = {}) {
        const conditions = [];
        if (filters.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudFlags.status, filters.status));
        if (filters.severity)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudFlags.severity, filters.severity));
        if (filters.entityType)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudFlags.entityType, filters.entityType));
        let query = db_1.db.select().from(schema_1.fraudFlags);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.fraudFlags.createdAt))
            .limit(filters.limit || 100)
            .offset(filters.offset || 0);
    }
    async getFraudFlagCount(filters = {}) {
        const conditions = [];
        if (filters.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudFlags.status, filters.status));
        if (filters.severity)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudFlags.severity, filters.severity));
        let query = db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.fraudFlags);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        const [result] = await query;
        return Number(result.count);
    }
    async updateFraudFlagStatus(id, status, resolvedBy) {
        const updateData = { status };
        if (status === "resolved" || status === "dismissed") {
            updateData.resolvedBy = resolvedBy;
            updateData.resolvedAt = new Date();
        }
        const [updated] = await db_1.db.update(schema_1.fraudFlags)
            .set(updateData)
            .where((0, drizzle_orm_1.eq)(schema_1.fraudFlags.id, id))
            .returning();
        return updated;
    }
    async getFraudFlagsByEntityId(entityId) {
        return db_1.db.select().from(schema_1.fraudFlags)
            .where((0, drizzle_orm_1.eq)(schema_1.fraudFlags.entityId, entityId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.fraudFlags.createdAt));
    }
    async getOpenFraudFlagsByEntityAndRule(entityId, ruleTriggered) {
        return db_1.db.select().from(schema_1.fraudFlags)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.fraudFlags.entityId, entityId), (0, drizzle_orm_1.eq)(schema_1.fraudFlags.ruleTriggered, ruleTriggered), (0, drizzle_orm_1.eq)(schema_1.fraudFlags.status, "open")));
    }
    async createFraudInvestigationNote(data) {
        const [note] = await db_1.db.insert(schema_1.fraudInvestigationNotes).values(data).returning();
        return note;
    }
    async getNotesByFraudFlag(fraudFlagId) {
        return db_1.db.select().from(schema_1.fraudInvestigationNotes)
            .where((0, drizzle_orm_1.eq)(schema_1.fraudInvestigationNotes.fraudFlagId, fraudFlagId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.fraudInvestigationNotes.createdAt));
    }
    async getNotesByBlacklistEntry(blacklistEntryId) {
        return db_1.db.select().from(schema_1.fraudInvestigationNotes)
            .where((0, drizzle_orm_1.eq)(schema_1.fraudInvestigationNotes.blacklistEntryId, blacklistEntryId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.fraudInvestigationNotes.createdAt));
    }
    async updateFraudFlagAutoActions(id, actions) {
        await db_1.db.update(schema_1.fraudFlags)
            .set({ autoActions: actions })
            .where((0, drizzle_orm_1.eq)(schema_1.fraudFlags.id, id));
    }
    async getAllFraudDetectionRules() {
        return db_1.db.select().from(schema_1.fraudDetectionRules).orderBy(schema_1.fraudDetectionRules.ruleName);
    }
    async getActiveFraudDetectionRules() {
        return db_1.db.select().from(schema_1.fraudDetectionRules)
            .where((0, drizzle_orm_1.eq)(schema_1.fraudDetectionRules.isActive, true))
            .orderBy(schema_1.fraudDetectionRules.ruleName);
    }
    async getFraudDetectionRule(id) {
        const [rule] = await db_1.db.select().from(schema_1.fraudDetectionRules).where((0, drizzle_orm_1.eq)(schema_1.fraudDetectionRules.id, id));
        return rule;
    }
    async seedDefaultFraudDetectionRules() {
        const defaults = [
            { ruleName: "complaints_threshold", description: "3 or more complaints against an agency within 30 days", ruleType: "complaints", threshold: 3, timeWindowDays: 30, severity: "high", autoBlacklist: false, autoReduceScore: true, scoreReduction: 15 },
            { ruleName: "license_expired_extended", description: "License expired for more than 60 days without renewal", ruleType: "license_expiry", threshold: 60, timeWindowDays: 0, severity: "high", autoBlacklist: false, autoReduceScore: true, scoreReduction: 20 },
            { ruleName: "manual_verification_rejected", description: "Manual verification requests repeatedly rejected", ruleType: "verification_rejected", threshold: 3, timeWindowDays: 90, severity: "critical", autoBlacklist: true, autoReduceScore: true, scoreReduction: 25 },
            { ruleName: "payment_fraud", description: "Payment fraud or disputes reported against agency", ruleType: "payment_fraud", threshold: 1, timeWindowDays: 90, severity: "critical", autoBlacklist: true, autoReduceScore: true, scoreReduction: 30 },
            { ruleName: "fake_renewal_receipts", description: "Multiple failed or fraudulent renewal payment attempts", ruleType: "fake_receipts", threshold: 2, timeWindowDays: 60, severity: "high", autoBlacklist: false, autoReduceScore: true, scoreReduction: 20 },
        ];
        for (const rule of defaults) {
            const existing = await db_1.db.select().from(schema_1.fraudDetectionRules).where((0, drizzle_orm_1.eq)(schema_1.fraudDetectionRules.ruleName, rule.ruleName));
            if (existing.length === 0) {
                await db_1.db.insert(schema_1.fraudDetectionRules).values(rule);
            }
        }
    }
    async updateFraudDetectionRule(id, data) {
        const [updated] = await db_1.db.update(schema_1.fraudDetectionRules)
            .set({ ...data, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.fraudDetectionRules.id, id))
            .returning();
        return updated;
    }
    async getComplianceRiskScores(filters) {
        const conditions = [];
        if (filters?.minScore !== undefined)
            conditions.push((0, drizzle_orm_1.gte)(schema_1.complianceRiskScores.riskScore, filters.minScore));
        if (filters?.maxScore !== undefined)
            conditions.push((0, drizzle_orm_1.sql) `${schema_1.complianceRiskScores.riskScore} <= ${filters.maxScore}`);
        if (filters?.trend)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceRiskScores.trend, filters.trend));
        let query = db_1.db.select().from(schema_1.complianceRiskScores);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.complianceRiskScores.riskScore))
            .limit(filters?.limit || 100)
            .offset(filters?.offset || 0);
    }
    async getComplianceRiskScoreByAgency(agencyId) {
        const [score] = await db_1.db.select().from(schema_1.complianceRiskScores)
            .where((0, drizzle_orm_1.eq)(schema_1.complianceRiskScores.agencyId, agencyId)).limit(1);
        return score;
    }
    async getComplianceRiskHistory(agencyId, limit) {
        return db_1.db.select().from(schema_1.complianceRiskHistory)
            .where((0, drizzle_orm_1.eq)(schema_1.complianceRiskHistory.agencyId, agencyId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.complianceRiskHistory.calculatedAt))
            .limit(limit || 30);
    }
    async getComplianceAnomalies(filters) {
        const conditions = [];
        if (filters?.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAnomalies.status, filters.status));
        if (filters?.severity)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAnomalies.severity, filters.severity));
        if (filters?.anomalyType)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAnomalies.anomalyType, filters.anomalyType));
        let query = db_1.db.select().from(schema_1.complianceAnomalies);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.complianceAnomalies.detectedAt))
            .limit(filters?.limit || 100)
            .offset(filters?.offset || 0);
    }
    async updateComplianceAnomaly(id, data) {
        const [updated] = await db_1.db.update(schema_1.complianceAnomalies)
            .set({ ...data, reviewedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.complianceAnomalies.id, id))
            .returning();
        return updated;
    }
    async getComplianceAlerts(filters) {
        const conditions = [];
        if (filters?.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAlerts.status, filters.status));
        if (filters?.severity)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAlerts.severity, filters.severity));
        if (filters?.alertType)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceAlerts.alertType, filters.alertType));
        let query = db_1.db.select().from(schema_1.complianceAlerts);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.complianceAlerts.triggeredAt))
            .limit(filters?.limit || 100)
            .offset(filters?.offset || 0);
    }
    async acknowledgeComplianceAlert(id, userId) {
        const [updated] = await db_1.db.update(schema_1.complianceAlerts)
            .set({ status: "acknowledged", acknowledgedBy: userId, acknowledgedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.complianceAlerts.id, id))
            .returning();
        return updated;
    }
    async resolveComplianceAlert(id, userId) {
        const [updated] = await db_1.db.update(schema_1.complianceAlerts)
            .set({ status: "resolved", resolvedBy: userId, resolvedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.complianceAlerts.id, id))
            .returning();
        return updated;
    }
    async getComplianceRiskConfig() {
        return db_1.db.select().from(schema_1.complianceRiskConfig).orderBy(schema_1.complianceRiskConfig.configKey);
    }
    async updateComplianceRiskConfig(key, value) {
        const [updated] = await db_1.db.update(schema_1.complianceRiskConfig)
            .set({ configValue: value, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.complianceRiskConfig.configKey, key))
            .returning();
        return updated;
    }
    async getComplianceDashboardStats() {
        const [highRiskResult] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.complianceRiskScores)
            .where((0, drizzle_orm_1.gte)(schema_1.complianceRiskScores.riskScore, 70));
        const [anomalyResult] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.complianceAnomalies)
            .where((0, drizzle_orm_1.eq)(schema_1.complianceAnomalies.status, "open"));
        const [pendingResult] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.complianceAlerts)
            .where((0, drizzle_orm_1.eq)(schema_1.complianceAlerts.status, "pending"));
        const [criticalResult] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.complianceAlerts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.complianceAlerts.status, "pending"), (0, drizzle_orm_1.eq)(schema_1.complianceAlerts.severity, "critical")));
        const [avgResult] = await db_1.db.select({ avg: (0, drizzle_orm_1.sql) `COALESCE(AVG(${schema_1.complianceRiskScores.riskScore}), 0)` })
            .from(schema_1.complianceRiskScores);
        return {
            highRisk: highRiskResult?.cnt || 0,
            openAnomalies: anomalyResult?.cnt || 0,
            pendingAlerts: pendingResult?.cnt || 0,
            avgRiskScore: Math.round(avgResult?.avg || 0),
            criticalAlerts: criticalResult?.cnt || 0,
        };
    }
    async getComplianceIndexRankings(filters) {
        const conditions = [(0, drizzle_orm_1.eq)(schema_1.complianceIndexScores.isExcluded, false)];
        if (filters?.country)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceIndexScores.country, filters.country));
        if (filters?.industry)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceIndexScores.industry, filters.industry));
        if (filters?.badge && filters.badge !== "_all")
            conditions.push((0, drizzle_orm_1.eq)(schema_1.complianceIndexScores.badge, filters.badge));
        if (filters?.search)
            conditions.push((0, drizzle_orm_1.ilike)(schema_1.complianceIndexScores.agencyName, `%${filters.search}%`));
        return db_1.db.select().from(schema_1.complianceIndexScores)
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy(schema_1.complianceIndexScores.globalRank)
            .limit(filters?.limit || 100)
            .offset(filters?.offset || 0);
    }
    async getComplianceIndexByAgency(agencyId) {
        const [score] = await db_1.db.select().from(schema_1.complianceIndexScores)
            .where((0, drizzle_orm_1.eq)(schema_1.complianceIndexScores.agencyId, agencyId)).limit(1);
        return score;
    }
    async getComplianceIndexHistory(agencyId, limit) {
        return db_1.db.select().from(schema_1.complianceIndexHistory)
            .where((0, drizzle_orm_1.eq)(schema_1.complianceIndexHistory.agencyId, agencyId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.complianceIndexHistory.calculatedAt))
            .limit(limit || 30);
    }
    async getComplianceIndexStats() {
        const notExcluded = (0, drizzle_orm_1.eq)(schema_1.complianceIndexScores.isExcluded, false);
        const [totalResult] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.complianceIndexScores).where(notExcluded);
        const [avgResult] = await db_1.db.select({ avg: (0, drizzle_orm_1.sql) `COALESCE(AVG(${schema_1.complianceIndexScores.compositeScore}), 0)` }).from(schema_1.complianceIndexScores).where(notExcluded);
        const [diamond] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.complianceIndexScores).where((0, drizzle_orm_1.and)(notExcluded, (0, drizzle_orm_1.eq)(schema_1.complianceIndexScores.badge, "diamond")));
        const [platinum] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.complianceIndexScores).where((0, drizzle_orm_1.and)(notExcluded, (0, drizzle_orm_1.eq)(schema_1.complianceIndexScores.badge, "platinum")));
        const [gold] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.complianceIndexScores).where((0, drizzle_orm_1.and)(notExcluded, (0, drizzle_orm_1.eq)(schema_1.complianceIndexScores.badge, "gold")));
        const [silver] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.complianceIndexScores).where((0, drizzle_orm_1.and)(notExcluded, (0, drizzle_orm_1.eq)(schema_1.complianceIndexScores.badge, "silver")));
        return {
            totalRanked: totalResult?.cnt || 0,
            avgScore: Math.round(avgResult?.avg || 0),
            diamondCount: diamond?.cnt || 0,
            platinumCount: platinum?.cnt || 0,
            goldCount: gold?.cnt || 0,
            silverCount: silver?.cnt || 0,
        };
    }
    async getComplianceIndexConfig() {
        return db_1.db.select().from(schema_1.complianceIndexConfig).orderBy(schema_1.complianceIndexConfig.configKey);
    }
    async updateComplianceIndexConfig(key, value) {
        const [updated] = await db_1.db.update(schema_1.complianceIndexConfig)
            .set({ configValue: value, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.complianceIndexConfig.configKey, key))
            .returning();
        return updated;
    }
    async excludeAgencyFromIndex(agencyId, excludedBy, reason) {
        await db_1.db.update(schema_1.complianceIndexScores)
            .set({ isExcluded: true, excludedBy, excludedReason: reason, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.complianceIndexScores.agencyId, agencyId));
    }
    async includeAgencyInIndex(agencyId) {
        await db_1.db.update(schema_1.complianceIndexScores)
            .set({ isExcluded: false, excludedBy: null, excludedReason: null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.complianceIndexScores.agencyId, agencyId));
    }
    async getCertificateByCertId(certificateId) {
        const [cert] = await db_1.db.select().from(schema_1.agencyCertificates)
            .where((0, drizzle_orm_1.eq)(schema_1.agencyCertificates.certificateId, certificateId)).limit(1);
        return cert;
    }
    async getCertificateByAgency(agencyId) {
        const [cert] = await db_1.db.select().from(schema_1.agencyCertificates)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agencyCertificates.agencyId, agencyId), (0, drizzle_orm_1.eq)(schema_1.agencyCertificates.status, "active")))
            .limit(1);
        return cert;
    }
    async listCertificates(filters) {
        const conditions = [];
        if (filters?.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.agencyCertificates.status, filters.status));
        let query = db_1.db.select().from(schema_1.agencyCertificates);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.agencyCertificates.issuedAt))
            .limit(filters?.limit || 100)
            .offset(filters?.offset || 0);
    }
    async getCertificateCount(filters) {
        const conditions = [];
        if (filters?.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.agencyCertificates.status, filters.status));
        let query = db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.agencyCertificates);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        const [result] = await query;
        return result?.cnt || 0;
    }
    async createFraudReport(data) {
        const [report] = await db_1.db.insert(schema_1.fraudReports).values(data).returning();
        return report;
    }
    async getFraudReportById(id) {
        const [report] = await db_1.db.select().from(schema_1.fraudReports).where((0, drizzle_orm_1.eq)(schema_1.fraudReports.id, id)).limit(1);
        return report;
    }
    async listFraudReports(filters) {
        const conditions = [];
        if (filters?.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudReports.status, filters.status));
        if (filters?.incidentType)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudReports.incidentType, filters.incidentType));
        let query = db_1.db.select().from(schema_1.fraudReports);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.fraudReports.createdAt))
            .limit(filters?.limit || 100)
            .offset(filters?.offset || 0);
    }
    async getFraudReportCount(filters) {
        const conditions = [];
        if (filters?.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudReports.status, filters.status));
        if (filters?.incidentType)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudReports.incidentType, filters.incidentType));
        let query = db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.fraudReports);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        const [result] = await query;
        return result?.cnt || 0;
    }
    async updateFraudReportStatus(id, status, updatedBy, resolution) {
        const updates = { status, updatedAt: new Date() };
        if (status === "confirmed" || status === "rejected") {
            updates.resolvedAt = new Date();
            updates.resolvedBy = updatedBy;
            if (resolution)
                updates.resolution = resolution;
        }
        const [report] = await db_1.db.update(schema_1.fraudReports).set(updates).where((0, drizzle_orm_1.eq)(schema_1.fraudReports.id, id)).returning();
        return report;
    }
    async assignFraudReport(id, assignedTo) {
        const [report] = await db_1.db.update(schema_1.fraudReports)
            .set({ assignedTo, status: "investigating", updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.fraudReports.id, id)).returning();
        return report;
    }
    async getUserFraudReports(userId) {
        return db_1.db.select().from(schema_1.fraudReports)
            .where((0, drizzle_orm_1.eq)(schema_1.fraudReports.reporterId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.fraudReports.createdAt));
    }
    async createFraudIndicator(data) {
        const [indicator] = await db_1.db.insert(schema_1.fraudIndicators).values(data).returning();
        return indicator;
    }
    async getFraudIndicatorById(id) {
        const [indicator] = await db_1.db.select().from(schema_1.fraudIndicators).where((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.id, id)).limit(1);
        return indicator;
    }
    async listFraudIndicators(filters) {
        const conditions = [];
        if (filters?.indicatorType)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.indicatorType, filters.indicatorType));
        if (filters?.riskLevel)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.riskLevel, filters.riskLevel));
        if (filters?.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.status, filters.status || "active"));
        let query = db_1.db.select().from(schema_1.fraudIndicators);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        return query.orderBy((0, drizzle_orm_1.desc)(schema_1.fraudIndicators.reportCount))
            .limit(filters?.limit || 100)
            .offset(filters?.offset || 0);
    }
    async getFraudIndicatorCount(filters) {
        const conditions = [];
        if (filters?.indicatorType)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.indicatorType, filters.indicatorType));
        if (filters?.riskLevel)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.riskLevel, filters.riskLevel));
        if (filters?.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.status, filters.status || "active"));
        let query = db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.fraudIndicators);
        if (conditions.length > 0)
            query = query.where((0, drizzle_orm_1.and)(...conditions));
        const [result] = await query;
        return result?.cnt || 0;
    }
    async updateFraudIndicator(id, data) {
        const [indicator] = await db_1.db.update(schema_1.fraudIndicators).set(data).where((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.id, id)).returning();
        return indicator;
    }
    async deleteFraudIndicator(id) {
        await db_1.db.delete(schema_1.fraudIndicators).where((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.id, id));
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // GROWTH TOOLS SUITE
    // ═══════════════════════════════════════════════════════════════════════════
    async getVisaJobs(filters) {
        let query = db_1.db.select().from(schema_1.jobs).where((0, drizzle_orm_1.eq)(schema_1.jobs.isActive, true));
        if (filters?.country) {
            query = db_1.db.select().from(schema_1.jobs).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.jobs.isActive, true), (0, drizzle_orm_1.ilike)(schema_1.jobs.country, `%${filters.country}%`)));
        }
        if (filters?.category) {
            const countryFilter = filters?.country
                ? (0, drizzle_orm_1.ilike)(schema_1.jobs.country, `%${filters.country}%`)
                : undefined;
            const conditions = countryFilter
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.jobs.isActive, true), countryFilter, (0, drizzle_orm_1.ilike)(schema_1.jobs.jobCategory, `%${filters.category}%`))
                : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.jobs.isActive, true), (0, drizzle_orm_1.ilike)(schema_1.jobs.jobCategory, `%${filters.category}%`));
            query = db_1.db.select().from(schema_1.jobs).where(conditions);
        }
        return await query.orderBy((0, drizzle_orm_1.desc)(schema_1.jobs.createdAt));
    }
    async createJob(data) {
        const [job] = await db_1.db.insert(schema_1.jobs).values(data).returning();
        return job;
    }
    async updateJob(id, data) {
        const [job] = await db_1.db.update(schema_1.jobs).set(data).where((0, drizzle_orm_1.eq)(schema_1.jobs.id, id)).returning();
        return job;
    }
    async deleteJob(id) {
        await db_1.db.update(schema_1.jobs).set({ isActive: false }).where((0, drizzle_orm_1.eq)(schema_1.jobs.id, id));
    }
    async recordToolUsage(data) {
        const [record] = await db_1.db.insert(schema_1.toolUsage).values({
            userId: data.userId,
            toolName: data.toolName,
            metadata: data.metadata,
        }).returning();
        return record;
    }
    async getUserToolUsageCount(userId, toolName) {
        const [row] = await db_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.toolUsage)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.toolUsage.userId, userId), (0, drizzle_orm_1.eq)(schema_1.toolUsage.toolName, toolName)));
        return Number(row?.count ?? 0);
    }
    async userHasSuccessfulPayment(userId) {
        const [row] = await db_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.payments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.payments.userId, userId), (0, drizzle_orm_1.eq)(schema_1.payments.status, "success")));
        return Number(row?.count ?? 0) > 0;
    }
    async recordTemplateDownload(data) {
        const [record] = await db_1.db.insert(schema_1.cvTemplateDownloads).values({
            templateId: data.templateId,
            userId: data.userId,
        }).returning();
        return record;
    }
    async getToolsAnalytics() {
        // By tool
        const byToolRows = await db_1.db
            .select({ toolName: schema_1.toolUsage.toolName, count: (0, drizzle_orm_1.count)() })
            .from(schema_1.toolUsage)
            .groupBy(schema_1.toolUsage.toolName)
            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.count)()));
        const byTool = byToolRows.map((r) => ({ toolName: r.toolName, count: Number(r.count) }));
        const totalUsage = byTool.reduce((s, r) => s + r.count, 0);
        const mostUsedTool = byTool[0]?.toolName ?? "N/A";
        // Daily trend (last 14 days)
        const since = new Date();
        since.setDate(since.getDate() - 14);
        const trendRows = await db_1.db
            .select({
            date: (0, drizzle_orm_1.sql) `DATE(created_at)::text`,
            count: (0, drizzle_orm_1.count)(),
        })
            .from(schema_1.toolUsage)
            .where((0, drizzle_orm_1.gte)(schema_1.toolUsage.createdAt, since))
            .groupBy((0, drizzle_orm_1.sql) `DATE(created_at)`)
            .orderBy((0, drizzle_orm_1.sql) `DATE(created_at)`);
        const dailyTrend = trendRows.map((r) => ({ date: r.date, count: Number(r.count) }));
        // Template downloads
        const [{ count: dlCount }] = await db_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(schema_1.cvTemplateDownloads);
        const templateDownloads = Number(dlCount);
        return { totalUsage, byTool, mostUsedTool, dailyTrend, templateDownloads };
    }
    async createToolReport(data) {
        const [report] = await db_1.db.insert(schema_1.toolReports).values(data).returning();
        return report;
    }
    async getToolReport(reportId) {
        const [report] = await db_1.db.select().from(schema_1.toolReports).where((0, drizzle_orm_1.eq)(schema_1.toolReports.id, reportId));
        return report;
    }
    async incrementReportViews(reportId) {
        await db_1.db.update(schema_1.toolReports)
            .set({ views: (0, drizzle_orm_1.sql) `${schema_1.toolReports.views} + 1` })
            .where((0, drizzle_orm_1.eq)(schema_1.toolReports.id, reportId));
    }
    async incrementReportShares(reportId) {
        await db_1.db.update(schema_1.toolReports)
            .set({ shares: (0, drizzle_orm_1.sql) `${schema_1.toolReports.shares} + 1` })
            .where((0, drizzle_orm_1.eq)(schema_1.toolReports.id, reportId));
    }
    // ── AI Usage Tracking ────────────────────────────────────────────────────
    async getAiUsageToday(userId, toolName, date) {
        const [row] = await db_1.db
            .select({ questionsUsed: schema_1.aiUsage.questionsUsed })
            .from(schema_1.aiUsage)
            .where((0, drizzle_orm_1.sql) `${schema_1.aiUsage.userId} = ${userId} AND ${schema_1.aiUsage.toolName} = ${toolName} AND ${schema_1.aiUsage.date} = ${date}`);
        return row;
    }
    async incrementAiUsage(userId, toolName, date) {
        const existing = await this.getAiUsageToday(userId, toolName, date);
        if (existing) {
            const newCount = existing.questionsUsed + 1;
            await db_1.db
                .update(schema_1.aiUsage)
                .set({ questionsUsed: newCount, updatedAt: new Date() })
                .where((0, drizzle_orm_1.sql) `${schema_1.aiUsage.userId} = ${userId} AND ${schema_1.aiUsage.toolName} = ${toolName} AND ${schema_1.aiUsage.date} = ${date}`);
            return newCount;
        }
        else {
            await db_1.db.insert(schema_1.aiUsage).values({ userId, toolName, date, questionsUsed: 1 });
            return 1;
        }
    }
    async addAiUsage(userId, toolName, date, count) {
        const existing = await this.getAiUsageToday(userId, toolName, date);
        if (existing) {
            const newCount = existing.questionsUsed + count;
            await db_1.db
                .update(schema_1.aiUsage)
                .set({ questionsUsed: newCount, updatedAt: new Date() })
                .where((0, drizzle_orm_1.sql) `${schema_1.aiUsage.userId} = ${userId} AND ${schema_1.aiUsage.toolName} = ${toolName} AND ${schema_1.aiUsage.date} = ${date}`);
            return newCount;
        }
        else {
            await db_1.db.insert(schema_1.aiUsage).values({ userId, toolName, date, questionsUsed: count });
            return count;
        }
    }
    async bulkCreateTrackedApplications(apps) {
        if (apps.length === 0)
            return [];
        const inserted = await db_1.db.insert(schema_1.trackedApplications).values(apps).returning();
        return inserted;
    }
    // ── Scam Reports ──────────────────────────────────────────────────────────
    async getScamReports(filters) {
        const conditions = [];
        if (filters?.status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.scamReports.status, filters.status));
        if (filters?.country)
            conditions.push((0, drizzle_orm_1.ilike)(schema_1.scamReports.country, `%${filters.country}%`));
        if (filters?.search)
            conditions.push((0, drizzle_orm_1.ilike)(schema_1.scamReports.agencyName, `%${filters.search}%`));
        const query = db_1.db.select().from(schema_1.scamReports)
            .where(conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.scamReports.createdAt))
            .limit(filters?.limit ?? 20)
            .offset(filters?.offset ?? 0);
        return query;
    }
    async getScamReportById(id) {
        const [r] = await db_1.db.select().from(schema_1.scamReports).where((0, drizzle_orm_1.eq)(schema_1.scamReports.id, id));
        return r;
    }
    async createScamReport(data) {
        const [r] = await db_1.db.insert(schema_1.scamReports).values(data).returning();
        return r;
    }
    async updateScamReport(id, data) {
        const [r] = await db_1.db.update(schema_1.scamReports).set({ ...data, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.scamReports.id, id)).returning();
        return r;
    }
    async deleteScamReport(id) {
        await db_1.db.delete(schema_1.scamReports).where((0, drizzle_orm_1.eq)(schema_1.scamReports.id, id));
    }
    async countScamReports(status) {
        const [{ value }] = await db_1.db.select({ value: (0, drizzle_orm_1.count)() }).from(schema_1.scamReports)
            .where(status ? (0, drizzle_orm_1.eq)(schema_1.scamReports.status, status) : undefined);
        return Number(value);
    }
    async getRecentScamReportsByUser(userId, since) {
        const [{ value }] = await db_1.db.select({ value: (0, drizzle_orm_1.count)() }).from(schema_1.scamReports)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.scamReports.reportedBy, userId), (0, drizzle_orm_1.gte)(schema_1.scamReports.createdAt, since)));
        return Number(value);
    }
    async getScamWallFeed(page, limit) {
        const offset = (page - 1) * limit;
        const reports = await db_1.db.select().from(schema_1.scamReports)
            .where((0, drizzle_orm_1.eq)(schema_1.scamReports.status, "approved"))
            .orderBy((0, drizzle_orm_1.sql) `${schema_1.scamReports.isFeatured} DESC, ${schema_1.scamReports.likesCount} DESC, ${schema_1.scamReports.createdAt} DESC`)
            .limit(limit).offset(offset);
        const [{ value }] = await db_1.db.select({ value: (0, drizzle_orm_1.count)() }).from(schema_1.scamReports).where((0, drizzle_orm_1.eq)(schema_1.scamReports.status, "approved"));
        return { reports, total: Number(value) };
    }
    async likeScamReport(reportId, fingerprint) {
        const { scamWallLikes } = await Promise.resolve().then(() => __importStar(require('@shared/schema')));
        const existing = await db_1.db.select().from(scamWallLikes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(scamWallLikes.reportId, reportId), (0, drizzle_orm_1.eq)(scamWallLikes.fingerprint, fingerprint)))
            .limit(1);
        if (existing.length > 0) {
            await db_1.db.delete(scamWallLikes).where((0, drizzle_orm_1.eq)(scamWallLikes.id, existing[0].id));
            const [updated] = await db_1.db.update(schema_1.scamReports)
                .where((0, drizzle_orm_1.eq)(schema_1.scamReports.id, reportId)).returning({ likesCount: schema_1.scamReports.likesCount });
            return { liked: false, likesCount: updated?.likesCount ?? 0 };
        }
        else {
            await db_1.db.insert(scamWallLikes).values({ reportId, fingerprint });
            const [updated] = await db_1.db.update(schema_1.scamReports)
                .set({ likesCount: (0, drizzle_orm_1.sql) `${schema_1.scamReports.likesCount} + 1` })
                .where((0, drizzle_orm_1.eq)(schema_1.scamReports.id, reportId))
                .returning({ likesCount: schema_1.scamReports.likesCount });
            return { liked: true, likesCount: updated?.likesCount ?? 0 };
        }
    }
    async getScamWallComments(reportId) {
        const { scamWallComments } = await Promise.resolve().then(() => __importStar(require('@shared/schema')));
        return db_1.db.select().from(scamWallComments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(scamWallComments.reportId, reportId), (0, drizzle_orm_1.eq)(scamWallComments.isApproved, true)))
            .orderBy((0, drizzle_orm_1.sql) `${scamWallComments.createdAt} DESC`).limit(50);
    }
    async addScamWallComment(reportId, content, authorName) {
        const { scamWallComments } = await Promise.resolve().then(() => __importStar(require('@shared/schema')));
        const [comment] = await db_1.db.insert(scamWallComments).values({ reportId, content, authorName }).returning();
        return comment;
    }
    async incrementScamReportViews(reportId) {
        await db_1.db.update(schema_1.scamReports)
            .set({ viewsCount: (0, drizzle_orm_1.sql) `${schema_1.scamReports.viewsCount} + 1` })
            .where((0, drizzle_orm_1.eq)(schema_1.scamReports.id, reportId));
    }
}
exports.DatabaseStorage = DatabaseStorage;
exports.storage = new DatabaseStorage();
