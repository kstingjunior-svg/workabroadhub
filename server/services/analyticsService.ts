// @ts-nocheck
/**
 * Revenue Analytics Service
 *
 * Queries the payments table to calculate revenue metrics.
 * All amounts stored in their original currency (KES for M-Pesa, USD for PayPal).
 * USD amounts are converted to KES using a configurable exchange rate.
 */

import { db } from "../db";
import { payments, users, userSubscriptions, analyticsEvents } from "@shared/schema";
import { eq, gte, lte, and, sql, count, sum, avg, ne, lt, desc, isNotNull } from "drizzle-orm";

const USD_TO_KES = Number(process.env.PAYPAL_KES_RATE) || 130;

function toKes(amount: number, currency: string): number {
  if (currency === "USD") return Math.round(amount * USD_TO_KES);
  return amount;
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function startOf(unit: "day" | "week" | "month"): Date {
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

// ─── Revenue Metrics (Step 3) ─────────────────────────────────────────────────

export interface RevenueMetrics {
  totalRevenue: number;
  revenueToday: number;
  revenueThisWeek: number;
  revenueThisMonth: number;
  averageOrderValue: number;
  totalSuccessfulPayments: number;
  currency: "KES";
}

export async function getRevenueMetrics(): Promise<RevenueMetrics> {
  const successPayments = await db
    .select()
    .from(payments)
    .where(eq(payments.status, "success"));

  const toKesAmount = (p: typeof successPayments[0]) => toKes(p.amount, p.currency || "KES");

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
    const created = new Date(p.createdAt!);
    if (created >= todayStart) revenueToday += kes;
    if (created >= weekStart) revenueThisWeek += kes;
    if (created >= monthStart) revenueThisMonth += kes;
  }

  const averageOrderValue =
    successPayments.length > 0 ? Math.round(totalRevenue / successPayments.length) : 0;

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

// ─── Payment Performance (Step 4) ─────────────────────────────────────────────

export interface PaymentPerformance {
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  retryAvailablePayments: number;
  totalPayments: number;
  successRate: number;
  methodBreakdown: MethodStat[];
}

export interface MethodStat {
  method: string;
  count: number;
  successCount: number;
  revenue: number;
  percentage: number;
}

export async function getPaymentPerformance(): Promise<PaymentPerformance> {
  const allPayments = await db.select().from(payments);

  const successful = allPayments.filter((p) => p.status === "success").length;
  const failed = allPayments.filter((p) => p.status === "failed").length;
  const pending = allPayments.filter((p) =>
    ["pending", "awaiting_payment"].includes(p.status)).length;
  const retryAvailable = allPayments.filter((p) => p.status === "retry_available").length;
  const total = allPayments.length;
  const successRate = total > 0 ? parseFloat(((successful / total) * 100).toFixed(1)) : 0;

  // Method breakdown
  const methodMap: Record<string, { count: number; successCount: number; revenue: number }> = {};
  for (const p of allPayments) {
    const m = p.method || "unknown";
    if (!methodMap[m]) methodMap[m] = { count: 0, successCount: 0, revenue: 0 };
    methodMap[m].count++;
    if (p.status === "success") {
      methodMap[m].successCount++;
      methodMap[m].revenue += toKes(p.amount, p.currency || "KES");
    }
  }

  const methodBreakdown: MethodStat[] = Object.entries(methodMap).map(([method, stats]) => ({
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

// ─── Country Analytics (Step 5) ───────────────────────────────────────────────

export interface CountryStat {
  country: string;
  countryName: string;
  paymentCount: number;
  totalRevenue: number;
}

export async function getCountryAnalytics(): Promise<CountryStat[]> {
  // Use analytics_events to group by country (payment_method_selected events carry country)
  const events = await db
    .select({
      country: analyticsEvents.country,
      count: count(),
    })
    .from(analyticsEvents)
    .where(
      and(
        sql`${analyticsEvents.country} IS NOT NULL`,
        sql`${analyticsEvents.country} <> 'XX'`,
      )
    )
    .groupBy(analyticsEvents.country);

  // Map ISO country codes to display names
  const countryNames: Record<string, string> = {
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

// ─── Recent Transactions ──────────────────────────────────────────────────────

export interface RecentTransaction {
  id: string;
  amount: number;
  amountKes: number;
  currency: string;
  method: string;
  status: string;
  createdAt: string;
}

export async function getRecentTransactions(limit = 20): Promise<RecentTransaction[]> {
  const rows = await db
    .select()
    .from(payments)
    .orderBy(sql`${payments.createdAt} DESC`)
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

export async function generateRevenueCSV(): Promise<string> {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.status, "success"))
    .orderBy(sql`${payments.createdAt} DESC`);

  const header = "Payment ID,Amount,Currency,Amount KES,Method,Status,Date\n";
  const body = rows
    .map((p) =>
      [
        p.id,
        p.amount,
        p.currency || "KES",
        toKes(p.amount, p.currency || "KES"),
        p.method,
        p.status,
        p.createdAt?.toISOString() ?? "",
      ].join(",")
    )
    .join("\n");

  return header + body;
}

export async function generateAllPaymentsCSV(): Promise<string> {
  const rows = await db
    .select()
    .from(payments)
    .orderBy(sql`${payments.createdAt} DESC`);

  const header = "Payment ID,User ID,Amount,Currency,Amount KES,Method,Status,Receipt,Retry Count,Date\n";
  const body = rows
    .map((p) =>
      [
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
      ].join(",")
    )
    .join("\n");

  return header + body;
}
