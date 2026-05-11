// @ts-nocheck
import { db } from "./db";
import {
  complianceAnomalies,
  complianceAlerts,
  licenseRenewalPayments,
  neaAgencies,
} from "@shared/schema";
import { eq, and, gte, count, sql, desc } from "drizzle-orm";

interface AnomalyResult {
  agencyId: string;
  agencyName: string;
  anomalyType: string;
  severity: string;
  details: Record<string, any>;
}

async function getConfigValue(key: string, defaultValue: any): Promise<any> {
  const { complianceRiskConfig } = await import("@shared/schema");
  const [config] = await db.select().from(complianceRiskConfig)
    .where(eq(complianceRiskConfig.configKey, key)).limit(1);
  return config?.configValue ?? defaultValue;
}

async function detectTransactionSpike(agencyId: string, agencyName: string): Promise<AnomalyResult | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [recent] = await db.select({ cnt: count() }).from(licenseRenewalPayments)
    .where(and(eq(licenseRenewalPayments.agencyId, agencyId), gte(licenseRenewalPayments.createdAt, sevenDaysAgo)));
  const [historical] = await db.select({ cnt: count() }).from(licenseRenewalPayments)
    .where(and(eq(licenseRenewalPayments.agencyId, agencyId), gte(licenseRenewalPayments.createdAt, thirtyDaysAgo)));

  const recentCnt = recent?.cnt || 0;
  const avgWeekly = (historical?.cnt || 0) / 4.3;
  const multiplier = await getConfigValue("anomaly_spike_multiplier", 3);

  if (avgWeekly > 0 && recentCnt > avgWeekly * multiplier && recentCnt >= 3) {
    return {
      agencyId,
      agencyName,
      anomalyType: "transaction_spike",
      severity: recentCnt > avgWeekly * 5 ? "critical" : "high",
      details: {
        recentTransactions: recentCnt,
        weeklyAverage: Math.round(avgWeekly * 10) / 10,
        spikeMultiplier: Math.round((recentCnt / avgWeekly) * 10) / 10,
      },
    };
  }
  return null;
}

async function detectMultiplePhoneNumbers(agencyId: string, agencyName: string): Promise<AnomalyResult | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const threshold = await getConfigValue("anomaly_phone_threshold", 10);

  const payments = await db.select({ phone: licenseRenewalPayments.phoneNumber })
    .from(licenseRenewalPayments)
    .where(and(
      eq(licenseRenewalPayments.agencyId, agencyId),
      gte(licenseRenewalPayments.createdAt, sevenDaysAgo)
    ));

  const uniquePhones = new Set(payments.map(p => p.phone).filter(Boolean));
  if (uniquePhones.size >= threshold) {
    return {
      agencyId,
      agencyName,
      anomalyType: "multiple_phone_numbers",
      severity: "high",
      details: {
        uniquePhoneCount: uniquePhones.size,
        totalTransactions: payments.length,
        threshold,
      },
    };
  }
  return null;
}

async function detectPaymentsAfterExpiry(agencyId: string, agencyName: string, agency: any): Promise<AnomalyResult | null> {
  if (!agency.expiryDate) return null;

  const expiry = new Date(agency.expiryDate);
  if (expiry.getTime() > Date.now()) return null;

  const paymentsAfterExpiry = await db.select({ cnt: count() })
    .from(licenseRenewalPayments)
    .where(and(
      eq(licenseRenewalPayments.agencyId, agencyId),
      gte(licenseRenewalPayments.createdAt, expiry),
      eq(licenseRenewalPayments.status, "completed")
    ));

  const cnt = paymentsAfterExpiry[0]?.cnt || 0;
  if (cnt > 0) {
    return {
      agencyId,
      agencyName,
      anomalyType: "payments_after_expiry",
      severity: "critical",
      details: {
        paymentsAfterExpiry: cnt,
        licenseExpiry: expiry.toISOString(),
        daysSinceExpiry: Math.ceil((Date.now() - expiry.getTime()) / (1000 * 60 * 60 * 24)),
      },
    };
  }
  return null;
}

async function detectSharedPaymentAccounts(): Promise<AnomalyResult[]> {
  const results: AnomalyResult[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const sharedPhones = await db.select({
    phone: licenseRenewalPayments.phoneNumber,
    agencyCount: sql<number>`count(distinct ${licenseRenewalPayments.agencyId})`,
    agencies: sql<string>`string_agg(distinct ${licenseRenewalPayments.agencyId}, ',')`,
  })
    .from(licenseRenewalPayments)
    .where(gte(licenseRenewalPayments.createdAt, thirtyDaysAgo))
    .groupBy(licenseRenewalPayments.phoneNumber)
    .having(sql`count(distinct ${licenseRenewalPayments.agencyId}) > 1`);

  for (const row of sharedPhones) {
    if (!row.phone) continue;
    const agencyIds = (row.agencies || "").split(",").filter(Boolean);
    for (const aid of agencyIds) {
      results.push({
        agencyId: aid,
        agencyName: "",
        anomalyType: "shared_payment_account",
        severity: "high",
        details: {
          sharedPhone: row.phone.slice(0, 4) + "****" + row.phone.slice(-3),
          totalAgenciesSharing: row.agencyCount,
          relatedAgencyIds: agencyIds.filter(id => id !== aid),
        },
      });
    }
  }
  return results;
}

async function storeAnomaly(anomaly: AnomalyResult): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [existing] = await db.select({ cnt: count() }).from(complianceAnomalies)
    .where(and(
      eq(complianceAnomalies.agencyId, anomaly.agencyId),
      eq(complianceAnomalies.anomalyType, anomaly.anomalyType),
      eq(complianceAnomalies.status, "open"),
      gte(complianceAnomalies.detectedAt, oneDayAgo)
    ));
  if ((existing?.cnt || 0) > 0) return;

  await db.insert(complianceAnomalies).values({
    agencyId: anomaly.agencyId,
    agencyName: anomaly.agencyName,
    anomalyType: anomaly.anomalyType,
    severity: anomaly.severity,
    details: anomaly.details,
    status: "open",
  });

  if (anomaly.severity === "critical" || anomaly.severity === "high") {
    const typeLabels: Record<string, string> = {
      transaction_spike: "Transaction Volume Spike",
      multiple_phone_numbers: "Multiple Phone Numbers",
      payments_after_expiry: "Payments After License Expiry",
      shared_payment_account: "Shared Payment Account",
    };

    await db.insert(complianceAlerts).values({
      agencyId: anomaly.agencyId,
      agencyName: anomaly.agencyName,
      alertType: `anomaly_${anomaly.anomalyType}`,
      severity: anomaly.severity,
      title: `Anomaly: ${typeLabels[anomaly.anomalyType] || anomaly.anomalyType}`,
      message: `${typeLabels[anomaly.anomalyType] || anomaly.anomalyType} detected for agency ${anomaly.agencyName || anomaly.agencyId}.`,
      explanation: JSON.stringify(anomaly.details),
      status: "pending",
    });
  }
}

export async function detectAgencyAnomalies(agencyId: string): Promise<AnomalyResult[]> {
  const agency = await db.select().from(neaAgencies).where(eq(neaAgencies.id, agencyId)).limit(1);
  if (!agency[0]) return [];

  const a = agency[0];
  const anomalies: AnomalyResult[] = [];

  const results = await Promise.all([
    detectTransactionSpike(agencyId, a.agencyName || ""),
    detectMultiplePhoneNumbers(agencyId, a.agencyName || ""),
    detectPaymentsAfterExpiry(agencyId, a.agencyName || "", a),
  ]);

  for (const r of results) {
    if (r) {
      anomalies.push(r);
      await storeAnomaly(r);
    }
  }

  return anomalies;
}

export async function runAnomalyDetection(): Promise<{ total: number; anomaliesFound: number; errors: number }> {
  console.log("[AnomalyDetector] Starting batch anomaly detection...");

  const agencies = await db.select({ id: neaAgencies.id, agencyName: neaAgencies.agencyName })
    .from(neaAgencies);

  let anomaliesFound = 0;
  let errors = 0;

  const batchSize = 100;
  for (let i = 0; i < agencies.length; i += batchSize) {
    const batch = agencies.slice(i, i + batchSize);
    await Promise.all(batch.map(async (a) => {
      try {
        const results = await detectAgencyAnomalies(a.id);
        anomaliesFound += results.length;
      } catch (err) {
        errors++;
        console.error(`[AnomalyDetector] Error for agency ${a.id}:`, err);
      }
    }));
  }

  const sharedAccounts = await detectSharedPaymentAccounts();
  for (const anomaly of sharedAccounts) {
    await storeAnomaly(anomaly);
    anomaliesFound++;
  }

  console.log(`[AnomalyDetector] Complete: ${agencies.length} agencies scanned, ${anomaliesFound} anomalies, ${errors} errors`);
  return { total: agencies.length, anomaliesFound, errors };
}
