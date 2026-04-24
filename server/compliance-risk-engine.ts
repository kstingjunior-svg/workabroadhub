import { storage } from "./storage";
import { db } from "./db";
import {
  complianceRiskScores,
  complianceRiskHistory,
  complianceAlerts,
  complianceRiskConfig,
  neaAgencies,
  fraudFlags,
  agencyReports,
  licenseRenewalPayments,
  manualOverrides,
  governmentSyncLogs,
  complianceAuditLogs,
} from "@shared/schema";
import { eq, and, gte, sql, desc, count } from "drizzle-orm";

interface RiskFactor {
  name: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  explanation: string;
}

interface RiskResult {
  agencyId: string;
  agencyName: string;
  riskScore: number;
  previousScore: number | null;
  scoreDelta: number;
  trend: string;
  factors: RiskFactor[];
  explanation: string;
}

async function getConfigValue(key: string, defaultValue: any): Promise<any> {
  const [config] = await db.select().from(complianceRiskConfig)
    .where(eq(complianceRiskConfig.configKey, key)).limit(1);
  return config?.configValue ?? defaultValue;
}

async function getWeights(): Promise<Record<string, number>> {
  const defaults = {
    license_expiry: 20,
    manual_fallback: 10,
    payment_disputes: 15,
    complaint_rate: 15,
    transaction_volume_spike: 10,
    gov_verification_mismatch: 15,
    account_changes: 5,
    fraud_flags: 10,
  };
  return await getConfigValue("risk_weights", defaults) as Record<string, number>;
}

async function evaluateLicenseExpiry(agencyId: string, agency: any): Promise<{ rawScore: number; explanation: string }> {
  if (!agency.expiryDate) return { rawScore: 50, explanation: "No expiry date on file" };

  const now = new Date();
  const expiry = new Date(agency.expiryDate);
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 0) {
    const daysPast = Math.abs(daysUntilExpiry);
    return { rawScore: Math.min(100, 60 + daysPast), explanation: `License expired ${daysPast} days ago` };
  }
  if (daysUntilExpiry <= 14) return { rawScore: 70, explanation: `License expiring in ${daysUntilExpiry} days` };
  if (daysUntilExpiry <= 30) return { rawScore: 40, explanation: `License expiring in ${daysUntilExpiry} days` };
  if (daysUntilExpiry <= 60) return { rawScore: 20, explanation: `License expiring in ${daysUntilExpiry} days` };
  return { rawScore: 0, explanation: "License valid and not expiring soon" };
}

async function evaluateManualFallback(agencyId: string): Promise<{ rawScore: number; explanation: string }> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const overrides = await db.select({ cnt: count() }).from(manualOverrides)
    .where(and(
      eq(manualOverrides.agencyId, agencyId),
      gte(manualOverrides.createdAt, thirtyDaysAgo)
    ));
  const cnt = overrides[0]?.cnt || 0;
  if (cnt >= 5) return { rawScore: 90, explanation: `${cnt} manual override verifications in last 30 days` };
  if (cnt >= 3) return { rawScore: 60, explanation: `${cnt} manual override verifications in last 30 days` };
  if (cnt >= 1) return { rawScore: 30, explanation: `${cnt} manual override verification in last 30 days` };
  return { rawScore: 0, explanation: "No manual fallback verifications" };
}

async function evaluatePaymentDisputes(agencyId: string): Promise<{ rawScore: number; explanation: string }> {
  const payments = await db.select().from(licenseRenewalPayments)
    .where(eq(licenseRenewalPayments.agencyId, agencyId));
  const total = payments.length;
  if (total === 0) return { rawScore: 10, explanation: "No renewal payment history" };
  const failed = payments.filter(p => p.status === "failed" || p.status === "cancelled").length;
  const ratio = failed / total;
  if (ratio > 0.5) return { rawScore: 90, explanation: `${failed}/${total} payments failed (${Math.round(ratio * 100)}%)` };
  if (ratio > 0.3) return { rawScore: 60, explanation: `${failed}/${total} payments failed (${Math.round(ratio * 100)}%)` };
  if (ratio > 0.1) return { rawScore: 30, explanation: `${failed}/${total} payments failed (${Math.round(ratio * 100)}%)` };
  return { rawScore: 0, explanation: `All ${total} payments successful` };
}

async function evaluateComplaintRate(agencyId: string): Promise<{ rawScore: number; explanation: string }> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const reports = await db.select({ cnt: count() }).from(agencyReports)
    .where(and(
      eq(agencyReports.agencyId, agencyId),
      gte(agencyReports.createdAt, ninetyDaysAgo)
    ));
  const cnt = reports[0]?.cnt || 0;
  if (cnt >= 10) return { rawScore: 100, explanation: `${cnt} complaints in last 90 days` };
  if (cnt >= 5) return { rawScore: 70, explanation: `${cnt} complaints in last 90 days` };
  if (cnt >= 2) return { rawScore: 40, explanation: `${cnt} complaints in last 90 days` };
  if (cnt >= 1) return { rawScore: 20, explanation: `${cnt} complaint in last 90 days` };
  return { rawScore: 0, explanation: "No complaints in last 90 days" };
}

async function evaluateTransactionVolumeSpike(agencyId: string): Promise<{ rawScore: number; explanation: string }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [recent] = await db.select({ cnt: count() }).from(licenseRenewalPayments)
    .where(and(eq(licenseRenewalPayments.agencyId, agencyId), gte(licenseRenewalPayments.createdAt, sevenDaysAgo)));
  const [historical] = await db.select({ cnt: count() }).from(licenseRenewalPayments)
    .where(and(eq(licenseRenewalPayments.agencyId, agencyId), gte(licenseRenewalPayments.createdAt, thirtyDaysAgo)));

  const recentCnt = recent?.cnt || 0;
  const historicalCnt = historical?.cnt || 0;
  const avgWeekly = historicalCnt > 0 ? (historicalCnt / 4.3) : 0;

  if (avgWeekly === 0 && recentCnt > 0) {
    return { rawScore: recentCnt >= 3 ? 80 : 30, explanation: `${recentCnt} transactions this week with no prior history` };
  }
  const multiplier = await getConfigValue("anomaly_spike_multiplier", 3);
  if (avgWeekly > 0 && recentCnt > avgWeekly * multiplier) {
    return { rawScore: 80, explanation: `${recentCnt} transactions this week vs ${avgWeekly.toFixed(1)} weekly average (${(recentCnt / avgWeekly).toFixed(1)}x spike)` };
  }
  return { rawScore: 0, explanation: "Normal transaction volume" };
}

async function evaluateGovVerificationMismatch(agencyId: string): Promise<{ rawScore: number; explanation: string }> {
  const mismatchOverrides = await db.select({ cnt: count() }).from(manualOverrides)
    .where(and(
      eq(manualOverrides.agencyId, agencyId),
      eq(manualOverrides.syncStatus, "mismatch")
    ));
  const cnt = mismatchOverrides[0]?.cnt || 0;

  const failedSyncs = await db.select({ cnt: count() }).from(governmentSyncLogs)
    .where(and(
      eq(governmentSyncLogs.agencyId, agencyId),
      eq(governmentSyncLogs.status, "error")
    ));
  const failCnt = failedSyncs[0]?.cnt || 0;

  const total = cnt + failCnt;
  if (total >= 5) return { rawScore: 90, explanation: `${cnt} verification mismatches and ${failCnt} failed syncs` };
  if (total >= 2) return { rawScore: 50, explanation: `${cnt} verification mismatches and ${failCnt} failed syncs` };
  if (total >= 1) return { rawScore: 20, explanation: `${total} verification issue detected` };
  return { rawScore: 0, explanation: "No verification issues" };
}

async function evaluateAccountChanges(agencyId: string): Promise<{ rawScore: number; explanation: string }> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const changes = await db.select({ cnt: count() }).from(complianceAuditLogs)
    .where(and(
      eq(complianceAuditLogs.recordId, agencyId),
      eq(complianceAuditLogs.recordType, "nea_agency"),
      gte(complianceAuditLogs.createdAt, thirtyDaysAgo)
    ));
  const cnt = changes[0]?.cnt || 0;
  if (cnt >= 10) return { rawScore: 80, explanation: `${cnt} account modifications in last 30 days` };
  if (cnt >= 5) return { rawScore: 40, explanation: `${cnt} account modifications in last 30 days` };
  return { rawScore: 0, explanation: `${cnt} account modifications — normal activity` };
}

async function evaluateFraudFlags(agencyId: string): Promise<{ rawScore: number; explanation: string }> {
  const flags = await db.select().from(fraudFlags)
    .where(and(
      eq(fraudFlags.entityId, agencyId),
      eq(fraudFlags.status, "open")
    ));
  const critical = flags.filter(f => f.severity === "critical").length;
  const high = flags.filter(f => f.severity === "high").length;
  const medium = flags.filter(f => f.severity === "medium").length;

  if (critical > 0) return { rawScore: 100, explanation: `${critical} critical fraud flag(s) active` };
  if (high > 0) return { rawScore: 80, explanation: `${high} high-severity fraud flag(s) active` };
  if (medium > 0) return { rawScore: 50, explanation: `${medium} medium-severity fraud flag(s)` };
  if (flags.length > 0) return { rawScore: 30, explanation: `${flags.length} low-severity fraud flag(s)` };
  return { rawScore: 0, explanation: "No active fraud flags" };
}

export async function calculateAgencyRiskScore(agencyId: string): Promise<RiskResult | null> {
  const agency = await storage.getNeaAgencyById(agencyId);
  if (!agency) return null;

  const weights = await getWeights();
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const factorEvals = await Promise.all([
    evaluateLicenseExpiry(agencyId, agency).then(r => ({ key: "license_expiry", ...r })),
    evaluateManualFallback(agencyId).then(r => ({ key: "manual_fallback", ...r })),
    evaluatePaymentDisputes(agencyId).then(r => ({ key: "payment_disputes", ...r })),
    evaluateComplaintRate(agencyId).then(r => ({ key: "complaint_rate", ...r })),
    evaluateTransactionVolumeSpike(agencyId).then(r => ({ key: "transaction_volume_spike", ...r })),
    evaluateGovVerificationMismatch(agencyId).then(r => ({ key: "gov_verification_mismatch", ...r })),
    evaluateAccountChanges(agencyId).then(r => ({ key: "account_changes", ...r })),
    evaluateFraudFlags(agencyId).then(r => ({ key: "fraud_flags", ...r })),
  ]);

  const factors: RiskFactor[] = factorEvals.map(f => {
    const weight = weights[f.key] || 0;
    const weightedScore = Math.round((f.rawScore * weight) / totalWeight);
    return {
      name: f.key,
      weight,
      rawScore: f.rawScore,
      weightedScore,
      explanation: f.explanation,
    };
  });

  const riskScore = Math.min(100, factors.reduce((sum, f) => sum + f.weightedScore, 0));

  const [existing] = await db.select().from(complianceRiskScores)
    .where(eq(complianceRiskScores.agencyId, agencyId)).limit(1);

  const previousScore = existing?.riskScore ?? null;
  const scoreDelta = previousScore !== null ? riskScore - previousScore : 0;
  const trend = scoreDelta > 5 ? "worsening" : scoreDelta < -5 ? "improving" : "stable";

  const explanationParts = factors
    .filter(f => f.rawScore > 0)
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .map(f => f.explanation);
  const explanation = explanationParts.length > 0
    ? `Risk score ${riskScore} due to: ${explanationParts.join("; ")}.`
    : `Risk score ${riskScore}: No significant risk factors detected.`;

  if (existing) {
    await db.update(complianceRiskScores)
      .set({
        agencyName: agency.agencyName,
        riskScore,
        previousScore,
        scoreDelta,
        trend,
        factors,
        explanation,
        updatedAt: new Date(),
      })
      .where(eq(complianceRiskScores.agencyId, agencyId));
  } else {
    await db.insert(complianceRiskScores).values({
      agencyId,
      agencyName: agency.agencyName,
      riskScore,
      previousScore,
      scoreDelta,
      trend,
      factors,
      explanation,
    });
  }

  await db.insert(complianceRiskHistory).values({
    agencyId,
    riskScore,
    factors,
  });

  return {
    agencyId,
    agencyName: agency.agencyName || "Unknown",
    riskScore,
    previousScore,
    scoreDelta,
    trend,
    factors,
    explanation,
  };
}

export async function generatePredictiveAlerts(agencyId: string, riskResult: RiskResult): Promise<void> {
  const agency = await storage.getNeaAgencyById(agencyId);
  if (!agency) return;

  const highThreshold = await getConfigValue("alert_threshold_high", 70);
  const criticalThreshold = await getConfigValue("alert_threshold_critical", 85);
  const riskIncreasePct = await getConfigValue("risk_increase_alert_pct", 30);
  const licenseWarningDays = await getConfigValue("license_expiry_warning_days", 14);

  if (riskResult.riskScore >= criticalThreshold) {
    await createAlertIfNew(agencyId, agency.agencyName || "", "critical_risk", "critical",
      `Critical Risk: ${agency.agencyName}`,
      `Agency has reached a critical compliance risk score of ${riskResult.riskScore}.`,
      riskResult.explanation);
  } else if (riskResult.riskScore >= highThreshold) {
    await createAlertIfNew(agencyId, agency.agencyName || "", "high_risk", "high",
      `High Risk: ${agency.agencyName}`,
      `Agency compliance risk score is ${riskResult.riskScore}, above the threshold of ${highThreshold}.`,
      riskResult.explanation);
  }

  if (riskResult.previousScore !== null && riskResult.previousScore > 0) {
    const pctIncrease = ((riskResult.riskScore - riskResult.previousScore) / riskResult.previousScore) * 100;
    if (pctIncrease >= riskIncreasePct) {
      await createAlertIfNew(agencyId, agency.agencyName || "", "risk_spike", "high",
        `Risk Spike: ${agency.agencyName}`,
        `Risk score increased by ${Math.round(pctIncrease)}% (${riskResult.previousScore} → ${riskResult.riskScore}).`,
        riskResult.explanation);
    }
  }

  if (agency.expiryDate) {
    const daysUntil = Math.ceil((new Date(agency.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntil > 0 && daysUntil <= licenseWarningDays) {
      const payments = await db.select({ cnt: count() }).from(licenseRenewalPayments)
        .where(and(
          eq(licenseRenewalPayments.agencyId, agencyId),
          eq(licenseRenewalPayments.status, "completed"),
          gte(licenseRenewalPayments.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        ));
      if ((payments[0]?.cnt || 0) === 0) {
        await createAlertIfNew(agencyId, agency.agencyName || "", "license_expiry_warning", "medium",
          `License Expiring: ${agency.agencyName}`,
          `License expires in ${daysUntil} days and no renewal payment has been initiated.`,
          `License ${agency.licenseNumber} expires on ${new Date(agency.expiryDate).toLocaleDateString()}.`);
      }
    }
  }
}

async function createAlertIfNew(
  agencyId: string,
  agencyName: string,
  alertType: string,
  severity: string,
  title: string,
  message: string,
  explanation: string
): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [existing] = await db.select({ cnt: count() }).from(complianceAlerts)
    .where(and(
      eq(complianceAlerts.agencyId, agencyId),
      eq(complianceAlerts.alertType, alertType),
      eq(complianceAlerts.status, "pending"),
      gte(complianceAlerts.triggeredAt, oneDayAgo)
    ));
  if ((existing?.cnt || 0) > 0) return;

  await db.insert(complianceAlerts).values({
    agencyId,
    agencyName,
    alertType,
    severity,
    title,
    message,
    explanation,
    status: "pending",
  });
}

export async function batchCalculateRiskScores(): Promise<{ total: number; processed: number; highRisk: number; errors: number }> {
  const agencies = await db.select({ id: neaAgencies.id }).from(neaAgencies);
  let processed = 0;
  let highRisk = 0;
  let errors = 0;

  const batchSize = await getConfigValue("scan_batch_size", 100);

  for (let i = 0; i < agencies.length; i += batchSize) {
    const batch = agencies.slice(i, i + batchSize);
    await Promise.all(batch.map(async (a) => {
      try {
        const result = await calculateAgencyRiskScore(a.id);
        if (result) {
          processed++;
          if (result.riskScore >= 70) highRisk++;
          await generatePredictiveAlerts(a.id, result);
        }
      } catch (err) {
        errors++;
        console.error(`[ComplianceRisk] Error scoring agency ${a.id}:`, err);
      }
    }));
  }

  console.log(`[ComplianceRisk] Batch complete: ${processed}/${agencies.length} scored, ${highRisk} high-risk, ${errors} errors`);
  return { total: agencies.length, processed, highRisk, errors };
}
