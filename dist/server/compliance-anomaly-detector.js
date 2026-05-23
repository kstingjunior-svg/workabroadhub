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
exports.detectAgencyAnomalies = detectAgencyAnomalies;
exports.runAnomalyDetection = runAnomalyDetection;
// @ts-nocheck
const db_1 = require("./db");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
async function getConfigValue(key, defaultValue) {
    const { complianceRiskConfig } = await Promise.resolve().then(() => __importStar(require("@shared/schema")));
    const [config] = await db_1.db.select().from(complianceRiskConfig)
        .where((0, drizzle_orm_1.eq)(complianceRiskConfig.configKey, key)).limit(1);
    return config?.configValue ?? defaultValue;
}
async function detectTransactionSpike(agencyId, agencyName) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [recent] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.licenseRenewalPayments)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.agencyId, agencyId), (0, drizzle_orm_1.gte)(schema_1.licenseRenewalPayments.createdAt, sevenDaysAgo)));
    const [historical] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.licenseRenewalPayments)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.agencyId, agencyId), (0, drizzle_orm_1.gte)(schema_1.licenseRenewalPayments.createdAt, thirtyDaysAgo)));
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
async function detectMultiplePhoneNumbers(agencyId, agencyName) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const threshold = await getConfigValue("anomaly_phone_threshold", 10);
    const payments = await db_1.db.select({ phone: schema_1.licenseRenewalPayments.phoneNumber })
        .from(schema_1.licenseRenewalPayments)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.agencyId, agencyId), (0, drizzle_orm_1.gte)(schema_1.licenseRenewalPayments.createdAt, sevenDaysAgo)));
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
async function detectPaymentsAfterExpiry(agencyId, agencyName, agency) {
    if (!agency.expiryDate)
        return null;
    const expiry = new Date(agency.expiryDate);
    if (expiry.getTime() > Date.now())
        return null;
    const paymentsAfterExpiry = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() })
        .from(schema_1.licenseRenewalPayments)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.agencyId, agencyId), (0, drizzle_orm_1.gte)(schema_1.licenseRenewalPayments.createdAt, expiry), (0, drizzle_orm_1.eq)(schema_1.licenseRenewalPayments.status, "completed")));
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
async function detectSharedPaymentAccounts() {
    const results = [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sharedPhones = await db_1.db.select({
        phone: schema_1.licenseRenewalPayments.phoneNumber,
        agencyCount: (0, drizzle_orm_1.sql) `count(distinct ${schema_1.licenseRenewalPayments.agencyId})`,
        agencies: (0, drizzle_orm_1.sql) `string_agg(distinct ${schema_1.licenseRenewalPayments.agencyId}, ',')`,
    })
        .from(schema_1.licenseRenewalPayments)
        .where((0, drizzle_orm_1.gte)(schema_1.licenseRenewalPayments.createdAt, thirtyDaysAgo))
        .groupBy(schema_1.licenseRenewalPayments.phoneNumber)
        .having((0, drizzle_orm_1.sql) `count(distinct ${schema_1.licenseRenewalPayments.agencyId}) > 1`);
    for (const row of sharedPhones) {
        if (!row.phone)
            continue;
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
async function storeAnomaly(anomaly) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [existing] = await db_1.db.select({ cnt: (0, drizzle_orm_1.count)() }).from(schema_1.complianceAnomalies)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.complianceAnomalies.agencyId, anomaly.agencyId), (0, drizzle_orm_1.eq)(schema_1.complianceAnomalies.anomalyType, anomaly.anomalyType), (0, drizzle_orm_1.eq)(schema_1.complianceAnomalies.status, "open"), (0, drizzle_orm_1.gte)(schema_1.complianceAnomalies.detectedAt, oneDayAgo)));
    if ((existing?.cnt || 0) > 0)
        return;
    await db_1.db.insert(schema_1.complianceAnomalies).values({
        agencyId: anomaly.agencyId,
        agencyName: anomaly.agencyName,
        anomalyType: anomaly.anomalyType,
        severity: anomaly.severity,
        details: anomaly.details,
        status: "open",
    });
    if (anomaly.severity === "critical" || anomaly.severity === "high") {
        const typeLabels = {
            transaction_spike: "Transaction Volume Spike",
            multiple_phone_numbers: "Multiple Phone Numbers",
            payments_after_expiry: "Payments After License Expiry",
            shared_payment_account: "Shared Payment Account",
        };
        await db_1.db.insert(schema_1.complianceAlerts).values({
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
async function detectAgencyAnomalies(agencyId) {
    const agency = await db_1.db.select().from(schema_1.neaAgencies).where((0, drizzle_orm_1.eq)(schema_1.neaAgencies.id, agencyId)).limit(1);
    if (!agency[0])
        return [];
    const a = agency[0];
    const anomalies = [];
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
async function runAnomalyDetection() {
    console.log("[AnomalyDetector] Starting batch anomaly detection...");
    const agencies = await db_1.db.select({ id: schema_1.neaAgencies.id, agencyName: schema_1.neaAgencies.agencyName })
        .from(schema_1.neaAgencies);
    let anomaliesFound = 0;
    let errors = 0;
    const batchSize = 100;
    for (let i = 0; i < agencies.length; i += batchSize) {
        const batch = agencies.slice(i, i + batchSize);
        await Promise.all(batch.map(async (a) => {
            try {
                const results = await detectAgencyAnomalies(a.id);
                anomaliesFound += results.length;
            }
            catch (err) {
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
