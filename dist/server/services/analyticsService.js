"use strict";
// @ts-nocheck
/**
 * Revenue Analytics Service
 *
 * Queries the payments table to calculate revenue metrics.
 * All amounts stored in their original currency (KES for M-Pesa, USD for PayPal).
 * USD amounts are converted to KES using a configurable exchange rate.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRevenueMetrics = getRevenueMetrics;
exports.getPaymentPerformance = getPaymentPerformance;
exports.getCountryAnalytics = getCountryAnalytics;
exports.getRecentTransactions = getRecentTransactions;
exports.generateRevenueCSV = generateRevenueCSV;
exports.generateAllPaymentsCSV = generateAllPaymentsCSV;
const db_1 = require("../db");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const USD_TO_KES = Number(process.env.PAYPAL_KES_RATE) || 130;
function toKes(amount, currency) {
    if (currency === "USD")
        return Math.round(amount * USD_TO_KES);
    return amount;
}
// ─── Date Helpers ─────────────────────────────────────────────────────────────
function startOf(unit) {
    const now = new Date();
    if (unit === "day") {
        now.setHours(0, 0, 0, 0);
        return now;
    }
    if (unit === "week") {
        const day = now.getDay(); // 0=Sun
        now.setDate(now.getDate() - day);
        now.setHours(0, 0, 0, 0);
        return now;
    }
    // month
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now;
}
async function getRevenueMetrics() {
    const successPayments = await db_1.db
        .select()
        .from(schema_1.payments)
        .where((0, drizzle_orm_1.eq)(schema_1.payments.status, "success"));
    const toKesAmount = (p) => toKes(p.amount, p.currency || "KES");
    const todayStart = startOf("day");
    const weekStart = startOf("week");
    const monthStart = startOf("month");
    let totalRevenue = 0;
    let revenueToday = 0;
    let revenueThisWeek = 0;
    let revenueThisMonth = 0;
    for (const p of successPayments) {
        const kes = toKesAmount(p);
        totalRevenue += kes;
        const created = new Date(p.createdAt);
        if (created >= todayStart)
            revenueToday += kes;
        if (created >= weekStart)
            revenueThisWeek += kes;
        if (created >= monthStart)
            revenueThisMonth += kes;
    }
    const averageOrderValue = successPayments.length > 0 ? Math.round(totalRevenue / successPayments.length) : 0;
    return {
        totalRevenue,
        revenueToday,
        revenueThisWeek,
        revenueThisMonth,
        averageOrderValue,
        totalSuccessfulPayments: successPayments.length,
        currency: "KES",
    };
}
async function getPaymentPerformance() {
    const allPayments = await db_1.db.select().from(schema_1.payments);
    const successful = allPayments.filter((p) => p.status === "success").length;
    const failed = allPayments.filter((p) => p.status === "failed").length;
    const pending = allPayments.filter((p) => ["pending", "awaiting_payment"].includes(p.status)).length;
    const retryAvailable = allPayments.filter((p) => p.status === "retry_available").length;
    const total = allPayments.length;
    const successRate = total > 0 ? parseFloat(((successful / total) * 100).toFixed(1)) : 0;
    // Method breakdown
    const methodMap = {};
    for (const p of allPayments) {
        const m = p.method || "unknown";
        if (!methodMap[m])
            methodMap[m] = { count: 0, successCount: 0, revenue: 0 };
        methodMap[m].count++;
        if (p.status === "success") {
            methodMap[m].successCount++;
            methodMap[m].revenue += toKes(p.amount, p.currency || "KES");
        }
    }
    const methodBreakdown = Object.entries(methodMap).map(([method, stats]) => ({
        method,
        count: stats.count,
        successCount: stats.successCount,
        revenue: stats.revenue,
        percentage: total > 0 ? parseFloat(((stats.count / total) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.count - a.count);
    return {
        successfulPayments: successful,
        failedPayments: failed,
        pendingPayments: pending,
        retryAvailablePayments: retryAvailable,
        totalPayments: total,
        successRate,
        methodBreakdown,
    };
}
async function getCountryAnalytics() {
    // Use analytics_events to group by country (payment_method_selected events carry country)
    const events = await db_1.db
        .select({
        country: schema_1.analyticsEvents.country,
        count: (0, drizzle_orm_1.count)(),
    })
        .from(schema_1.analyticsEvents)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${schema_1.analyticsEvents.country} IS NOT NULL`, (0, drizzle_orm_1.sql) `${schema_1.analyticsEvents.country} <> 'XX'`))
        .groupBy(schema_1.analyticsEvents.country);
    // Map ISO country codes to display names
    const countryNames = {
        KE: "Kenya", TZ: "Tanzania", UG: "Uganda", RW: "Rwanda",
        US: "United States", GB: "United Kingdom", DE: "Germany",
        FR: "France", AU: "Australia", CA: "Canada", NL: "Netherlands",
        MZ: "Mozambique", ZA: "South Africa", NG: "Nigeria", GH: "Ghana",
        ET: "Ethiopia", AE: "UAE", SA: "Saudi Arabia", QA: "Qatar",
    };
    return events
        .map((e) => ({
        country: e.country || "XX",
        countryName: countryNames[e.country || ""] || e.country || "Unknown",
        paymentCount: Number(e.count),
        totalRevenue: 0, // Revenue can't be reliably joined without userId correlation
    }))
        .sort((a, b) => b.paymentCount - a.paymentCount)
        .slice(0, 20);
}
async function getRecentTransactions(limit = 20) {
    const rows = await db_1.db
        .select()
        .from(schema_1.payments)
        .orderBy((0, drizzle_orm_1.sql) `${schema_1.payments.createdAt} DESC`)
        .limit(limit);
    return rows.map((p) => ({
        id: p.id,
        amount: p.amount,
        amountKes: toKes(p.amount, p.currency || "KES"),
        currency: p.currency || "KES",
        method: p.method,
        status: p.status,
        createdAt: p.createdAt?.toISOString() ?? "",
    }));
}
// ─── CSV Generator (Step 9) ───────────────────────────────────────────────────
async function generateRevenueCSV() {
    const rows = await db_1.db
        .select()
        .from(schema_1.payments)
        .where((0, drizzle_orm_1.eq)(schema_1.payments.status, "success"))
        .orderBy((0, drizzle_orm_1.sql) `${schema_1.payments.createdAt} DESC`);
    const header = "Payment ID,Amount,Currency,Amount KES,Method,Status,Date\n";
    const body = rows
        .map((p) => [
        p.id,
        p.amount,
        p.currency || "KES",
        toKes(p.amount, p.currency || "KES"),
        p.method,
        p.status,
        p.createdAt?.toISOString() ?? "",
    ].join(","))
        .join("\n");
    return header + body;
}
async function generateAllPaymentsCSV() {
    const rows = await db_1.db
        .select()
        .from(schema_1.payments)
        .orderBy((0, drizzle_orm_1.sql) `${schema_1.payments.createdAt} DESC`);
    const header = "Payment ID,User ID,Amount,Currency,Amount KES,Method,Status,Receipt,Retry Count,Date\n";
    const body = rows
        .map((p) => [
        p.id,
        p.userId,
        p.amount,
        p.currency || "KES",
        toKes(p.amount, p.currency || "KES"),
        p.method,
        p.status,
        p.mpesaReceiptNumber || "",
        p.retryCount ?? 0,
        p.createdAt?.toISOString() ?? "",
    ].join(","))
        .join("\n");
    return header + body;
}
