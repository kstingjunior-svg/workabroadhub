"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateAgencyRiskScore = calculateAgencyRiskScore;
exports.generatePredictiveAlerts = generatePredictiveAlerts;
exports.batchCalculateRiskScores = batchCalculateRiskScores;
// @ts-nocheck
const storage_1 = require("./storage");
const db_1 = require("./db");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
async function getConfigValue(key, defaultValue) {
    const [config] = await db_1.db.select().from(schema_1.complianceRiskConfig)
        .where((0, drizzle_orm_1.eq)(schema_1.complianceRiskConfig.configKey, key)).limit(1);
    return config?.configValue ?? defaultValue;
}
async function getWeights() {
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
    return await getConfigValue("risk_weights", defaults);
}
async function evaluateLicenseExpiry(agencyId, agency) {
    if (!agency.expiryDate)
        return { rawScore: 50, explanation: "No expiry date on file" };
    const now = new Date();
    const expiry = new Date(agency.expiryDate);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < 0) {
        const daysPast = Math.abs(daysUntilExpiry);
        return { rawScore: Math.min(100, 60 + daysPast), explanation: `License expired ${daysPast} days ago` };
    }
    if (daysUntilExpiry <= 14)
        return { rawScore: 70, explanation: `License expiring in ${daysUntilExpiry} days` };
    if (daysUntilExpiry <= 30)
        return { rawScore: 40, explanation: `License expiring in ${daysUntilExpiry} days` };
    if (daysUntilExpiry <= 60)
        return { rawScore: 20, explanation: `License expiring in ${daysUntilExpiry} days` };
    return { rawScore: 0, explanation: "License valid and not expiring soon" };
}
async function evaluateManualFallback(agencyId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const overrides = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.manualOverrides)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.manualOverrides.agencyId, agencyId), (0, drizzle_orm_1.gte)(schema_1.manualOverrides.createdAt, thirtyDaysAgo)));
    const cnt = overrides[0]?.cnt || 0;
    if (cnt >= 5)
        return { rawScore: 90, explanation: `${cnt} manual override verifications in last 30 days` };
    if (cnt >= 3)
        return { rawScore: 60, explanation: `${cnt} manual override verifications in last 30 days` };
    if (cnt >= 1)
        return { rawScore: 30, explanation: `${cnt} manual override verification in last 30 days` };
    return { rawScore: 0, explanation: "No manual fallback verifications" };
}
async function evaluatePaymentDisputes(agencyId) {
    const payments = await db_1.db.select().from(schema_1.licenseRenewalPayments)
        .where((0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.agencyId, agencyId));
    const total = payments.length;
    if (total === 0)
        return { rawScore: 10, explanation: "No renewal payment history" };
    const failed = payments.filter(p => p.status === "failed" || p.status === "cancelled").length;
    const ratio = failed / total;
    if (ratio > 0.5)
        return { rawScore: 90, explanation: `${failed}/${total} payments failed (${Math.round(ratio * 100)}%)` };
    if (ratio > 0.3)
        return { rawScore: 60, explanation: `${failed}/${total} payments failed (${Math.round(ratio * 100)}%)` };
    if (ratio > 0.1)
        return { rawScore: 30, explanation: `${failed}/${total} payments failed (${Math.round(ratio * 100)}%)` };
    return { rawScore: 0, explanation: `All ${total} payments successful` };
}
async function evaluateComplaintRate(agencyId) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const reports = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.agencyReports)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agencyReports.agencyId, agencyId), (0, drizzle_orm_1.gte)(schema_1.agencyReports.createdAt, ninetyDaysAgo)));
    const cnt = reports[0]?.cnt || 0;
    if (cnt >= 10)
        return { rawScore: 100, explanation: `${cnt} complaints in last 90 days` };
    if (cnt >= 5)
        return { rawScore: 70, explanation: `${cnt} complaints in last 90 days` };
    if (cnt >= 2)
        return { rawScore: 40, explanation: `${cnt} complaints in last 90 days` };
    if (cnt >= 1)
        return { rawScore: 20, explanation: `${cnt} complaint in last 90 days` };
    return { rawScore: 0, explanation: "No complaints in last 90 days" };
}
async function evaluateTransactionVolumeSpike(agencyId) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [recent] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.licenseRenewalPayments)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.agencyId, agencyId), (0, drizzle_orm_1.gte)(schema_1.licenseRenewalPayments.createdAt, sevenDaysAgo)));
    const [historical] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.licenseRenewalPayments)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.agencyId, agencyId), (0, drizzle_orm_1.gte)(schema_1.licenseRenewalPayments.createdAt, thirtyDaysAgo)));
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
async function evaluateGovVerificationMismatch(agencyId) {
    const mismatchOverrides = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.manualOverrides)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.manualOverrides.agencyId, agencyId), (0, drizzle_orm_1.eq)(schema_1.manualOverrides.syncStatus, "mismatch")));
    const cnt = mismatchOverrides[0]?.cnt || 0;
    const failedSyncs = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.governmentSyncLogs)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.governmentSyncLogs.agencyId, agencyId), (0, drizzle_orm_1.eq)(schema_1.governmentSyncLogs.status, "error")));
    const failCnt = failedSyncs[0]?.cnt || 0;
    const total = cnt + failCnt;
    if (total >= 5)
        return { rawScore: 90, explanation: `${cnt} verification mismatches and ${failCnt} failed syncs` };
    if (total >= 2)
        return { rawScore: 50, explanation: `${cnt} verification mismatches and ${failCnt} failed syncs` };
    if (total >= 1)
        return { rawScore: 20, explanation: `${total} verification issue detected` };
    return { rawScore: 0, explanation: "No verification issues" };
}
async function evaluateAccountChanges(agencyId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const changes = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.complianceAuditLogs)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.complianceAuditLogs.recordId, agencyId), (0, drizzle_orm_1.eq)(schema_1.complianceAuditLogs.recordType, "nea_agency"), (0, drizzle_orm_1.gte)(schema_1.complianceAuditLogs.createdAt, thirtyDaysAgo)));
    const cnt = changes[0]?.cnt || 0;
    if (cnt >= 10)
        return { rawScore: 80, explanation: `${cnt} account modifications in last 30 days` };
    if (cnt >= 5)
        return { rawScore: 40, explanation: `${cnt} account modifications in last 30 days` };
    return { rawScore: 0, explanation: `${cnt} account modifications — normal activity` };
}
async function evaluateFraudFlags(agencyId) {
    const flags = await db_1.db.select().from(schema_1.fraudFlags)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.fraudFlags.entityId, agencyId), (0, drizzle_orm_1.eq)(schema_1.fraudFlags.status, "open")));
    const critical = flags.filter(f => f.severity === "critical").length;
    const high = flags.filter(f => f.severity === "high").length;
    const medium = flags.filter(f => f.severity === "medium").length;
    if (critical > 0)
        return { rawScore: 100, explanation: `${critical} critical fraud flag(s) active` };
    if (high > 0)
        return { rawScore: 80, explanation: `${high} high-severity fraud flag(s) active` };
    if (medium > 0)
        return { rawScore: 50, explanation: `${medium} medium-severity fraud flag(s)` };
    if (flags.length > 0)
        return { rawScore: 30, explanation: `${flags.length} low-severity fraud flag(s)` };
    return { rawScore: 0, explanation: "No active fraud flags" };
}
async function calculateAgencyRiskScore(agencyId) {
    const agency = await storage_1.storage.getNeaAgencyById(agencyId);
    if (!agency)
        return null;
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
    const factors = factorEvals.map(f => {
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
    const [existing] = await db_1.db.select().from(schema_1.complianceRiskScores)
        .where((0, drizzle_orm_1.eq)(schema_1.complianceRiskScores.agencyId, agencyId)).limit(1);
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
        await db_1.db.update(schema_1.complianceRiskScores)
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
            .where((0, drizzle_orm_1.eq)(schema_1.complianceRiskScores.agencyId, agencyId));
    }
    else {
        await db_1.db.insert(schema_1.complianceRiskScores).values({
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
    await db_1.db.insert(schema_1.complianceRiskHistory).values({
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
async function generatePredictiveAlerts(agencyId, riskResult) {
    const agency = await storage_1.storage.getNeaAgencyById(agencyId);
    if (!agency)
        return;
    const highThreshold = await getConfigValue("alert_threshold_high", 70);
    const criticalThreshold = await getConfigValue("alert_threshold_critical", 85);
    const riskIncreasePct = await getConfigValue("risk_increase_alert_pct", 30);
    const licenseWarningDays = await getConfigValue("license_expiry_warning_days", 14);
    if (riskResult.riskScore >= criticalThreshold) {
        await createAlertIfNew(agencyId, agency.agencyName || "", "critical_risk", "critical", `Critical Risk: ${agency.agencyName}`, `Agency has reached a critical compliance risk score of ${riskResult.riskScore}.`, riskResult.explanation);
    }
    else if (riskResult.riskScore >= highThreshold) {
        await createAlertIfNew(agencyId, agency.agencyName || "", "high_risk", "high", `High Risk: ${agency.agencyName}`, `Agency compliance risk score is ${riskResult.riskScore}, above the threshold of ${highThreshold}.`, riskResult.explanation);
    }
    if (riskResult.previousScore !== null && riskResult.previousScore > 0) {
        const pctIncrease = ((riskResult.riskScore - riskResult.previousScore) / riskResult.previousScore) * 100;
        if (pctIncrease >= riskIncreasePct) {
            await createAlertIfNew(agencyId, agency.agencyName || "", "risk_spike", "high", `Risk Spike: ${agency.agencyName}`, `Risk score increased by ${Math.round(pctIncrease)}% (${riskResult.previousScore} → ${riskResult.riskScore}).`, riskResult.explanation);
        }
    }
    if (agency.expiryDate) {
        const daysUntil = Math.ceil((new Date(agency.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntil > 0 && daysUntil <= licenseWarningDays) {
            const payments = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.licenseRenewalPayments)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.agencyId, agencyId), (0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.status, "completed"), (0, drizzle_orm_1.gte)(schema_1.licenseRenewalPayments.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))));
            if ((payments[0]?.cnt || 0) === 0) {
                await createAlertIfNew(agencyId, agency.agencyName || "", "license_expiry_warning", "medium", `License Expiring: ${agency.agencyName}`, `License expires in ${daysUntil} days and no renewal payment has been initiated.`, `License ${agency.licenseNumber} expires on ${new Date(agency.expiryDate).toLocaleDateString()}.`);
            }
        }
    }
}
async function createAlertIfNew(agencyId, agencyName, alertType, severity, title, message, explanation) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [existing] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.complianceAlerts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.complianceAlerts.agencyId, agencyId), (0, drizzle_orm_1.eq)(schema_1.complianceAlerts.alertType, alertType), (0, drizzle_orm_1.eq)(schema_1.complianceAlerts.status, "pending"), (0, drizzle_orm_1.gte)(schema_1.complianceAlerts.triggeredAt, oneDayAgo)));
    if ((existing?.cnt || 0) > 0)
        return;
    await db_1.db.insert(schema_1.complianceAlerts).values({
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
async function batchCalculateRiskScores() {
    const agencies = await db_1.db.select({ id: schema_1.neaAgencies.id }).from(schema_1.neaAgencies);
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
                    if (result.riskScore >= 70)
                        highRisk++;
                    await generatePredictiveAlerts(a.id, result);
                }
            }
            catch (err) {
                errors++;
                console.error(`[ComplianceRisk] Error scoring agency ${a.id}:`, err);
            }
        }));
    }
    console.log(`[ComplianceRisk] Batch complete: ${processed}/${agencies.length} scored, ${highRisk} high-risk, ${errors} errors`);
    return { total: agencies.length, processed, highRisk, errors };
}
