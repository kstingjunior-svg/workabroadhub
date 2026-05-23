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
exports.runFraudDetection = runFraudDetection;
exports.runBatchFraudDetection = runBatchFraudDetection;
// @ts-nocheck
const storage_1 = require("./storage");
async function runFraudDetection(entityId, entityType = "agency") {
    const rules = await storage_1.storage.getActiveFraudDetectionRules();
    const result = { entityId, entityType, flagsCreated: [], actionsExecuted: [] };
    for (const rule of rules) {
        try {
            const triggered = await evaluateRule(rule, entityId, entityType);
            if (!triggered)
                continue;
            const existingFlags = await storage_1.storage.getOpenFraudFlagsByEntityAndRule(entityId, rule.ruleName);
            if (existingFlags.length > 0)
                continue;
            const flag = await storage_1.storage.createFraudFlag({
                entityId,
                entityType,
                ruleTriggered: rule.ruleName,
                severity: rule.severity,
                details: triggered.details,
                autoActions: [],
                status: "open",
            });
            const actions = await executeAutoActions(flag, rule);
            result.flagsCreated.push(flag);
            result.actionsExecuted.push(...actions);
        }
        catch (err) {
            console.error(`[FraudEngine] Error evaluating rule ${rule.ruleName} for ${entityId}:`, err);
        }
    }
    return result;
}
async function evaluateRule(rule, entityId, entityType) {
    switch (rule.ruleType) {
        case "complaints":
            return evaluateComplaints(rule, entityId);
        case "license_expiry":
            return evaluateLicenseExpiry(rule, entityId);
        case "verification_rejected":
            return evaluateVerificationRejected(rule, entityId);
        case "payment_fraud":
            return evaluatePaymentFraud(rule, entityId);
        case "fake_receipts":
            return evaluateFakeReceipts(rule, entityId);
        default:
            return null;
    }
}
async function evaluateComplaints(rule, entityId) {
    try {
        const reports = await storage_1.storage.getAgencyReports(entityId);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - rule.timeWindowDays);
        const recentReports = reports.filter(r => r.createdAt && new Date(r.createdAt) >= cutoffDate);
        if (recentReports.length >= rule.threshold) {
            return {
                triggered: true,
                details: {
                    complaintCount: recentReports.length,
                    threshold: rule.threshold,
                    timeWindowDays: rule.timeWindowDays,
                    recentComplaintIds: recentReports.slice(0, 5).map(r => r.id),
                },
            };
        }
    }
    catch (err) {
        console.error("[FraudEngine] Complaints evaluation error:", err);
    }
    return null;
}
async function evaluateLicenseExpiry(rule, entityId) {
    try {
        const agencies = await storage_1.storage.getNeaAgencies();
        const agency = agencies.find(a => a.id === entityId);
        if (!agency || !agency.expiryDate)
            return null;
        const expiryDate = new Date(agency.expiryDate);
        const now = new Date();
        const daysSinceExpiry = Math.floor((now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceExpiry > rule.threshold) {
            return {
                triggered: true,
                details: {
                    expiryDate: agency.expiryDate,
                    daysSinceExpiry,
                    threshold: rule.threshold,
                    agencyName: agency.agencyName,
                    licenseNumber: agency.licenseNumber,
                },
            };
        }
    }
    catch (err) {
        console.error("[FraudEngine] License expiry evaluation error:", err);
    }
    return null;
}
async function evaluateVerificationRejected(rule, entityId) {
    try {
        const overrides = await storage_1.storage.getManualOverrides({ overrideStatus: "rejected" });
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - rule.timeWindowDays);
        const rejectedForEntity = overrides.filter(o => o.agencyId === entityId && o.reviewedAt && new Date(o.reviewedAt) >= cutoffDate);
        if (rejectedForEntity.length >= rule.threshold) {
            return {
                triggered: true,
                details: {
                    rejectedCount: rejectedForEntity.length,
                    threshold: rule.threshold,
                    timeWindowDays: rule.timeWindowDays,
                    recentRejectionIds: rejectedForEntity.slice(0, 5).map(o => o.id),
                },
            };
        }
    }
    catch (err) {
        console.error("[FraudEngine] Verification rejected evaluation error:", err);
    }
    return null;
}
async function evaluatePaymentFraud(rule, entityId) {
    try {
        const complianceEvents = await storage_1.storage.getRecentComplianceEvents(entityId, Math.ceil(rule.timeWindowDays / 30));
        const fraudEvents = complianceEvents.filter(e => e.eventType === "payment_unverified" || e.severity === "major");
        if (fraudEvents.length >= rule.threshold) {
            return {
                triggered: true,
                details: {
                    fraudEventCount: fraudEvents.length,
                    threshold: rule.threshold,
                    eventTypes: fraudEvents.map(e => e.eventType),
                },
            };
        }
    }
    catch (err) {
        console.error("[FraudEngine] Payment fraud evaluation error:", err);
    }
    return null;
}
async function evaluateFakeReceipts(rule, entityId) {
    try {
        const payments = await storage_1.storage.getLicenseRenewalPaymentsByAgency(entityId);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - rule.timeWindowDays);
        const failedPayments = payments.filter(p => p.status === "failed" && p.createdAt && new Date(p.createdAt) >= cutoffDate);
        if (failedPayments.length >= rule.threshold) {
            return {
                triggered: true,
                details: {
                    failedPaymentCount: failedPayments.length,
                    threshold: rule.threshold,
                    timeWindowDays: rule.timeWindowDays,
                },
            };
        }
    }
    catch (err) {
        console.error("[FraudEngine] Fake receipts evaluation error:", err);
    }
    return null;
}
async function executeAutoActions(flag, rule) {
    const actions = [];
    try {
        if (rule.autoReduceScore) {
            const { calculateAgencyScore } = await Promise.resolve().then(() => __importStar(require("./score-engine")));
            const scoreResult = await calculateAgencyScore(flag.entityId, "fraud_engine");
            if (scoreResult) {
                actions.push(`score_recalculated`);
            }
        }
        if (rule.autoBlacklist) {
            const isAlready = await storage_1.storage.isEntityBlacklisted(flag.entityId);
            if (!isAlready) {
                await storage_1.storage.createBlacklistEntry({
                    entityId: flag.entityId,
                    entityType: flag.entityType,
                    reason: `Auto-blacklisted: ${rule.description}`,
                    reportedBy: "fraud_engine",
                    status: "active",
                    evidence: [{ flagId: flag.id, rule: rule.ruleName, details: flag.details }],
                });
                actions.push("auto_blacklisted");
            }
        }
        try {
            const { notifyComplianceTeamFraudAlert } = await Promise.resolve().then(() => __importStar(require("./sms")));
            await notifyComplianceTeamFraudAlert(flag, rule);
            actions.push("compliance_team_notified");
        }
        catch (notifyErr) {
            console.error("[FraudEngine] Failed to notify compliance team:", notifyErr);
        }
        if (actions.length > 0) {
            await storage_1.storage.updateFraudFlagAutoActions(flag.id, actions);
        }
    }
    catch (err) {
        console.error("[FraudEngine] Error executing auto-actions:", err);
    }
    return actions;
}
async function runBatchFraudDetection() {
    const agencies = await storage_1.storage.getNeaAgencies();
    const results = [];
    let flagged = 0;
    for (const agency of agencies) {
        try {
            const result = await runFraudDetection(agency.id, "agency");
            if (result.flagsCreated.length > 0) {
                flagged++;
                results.push(result);
            }
        }
        catch (err) {
            console.error(`[FraudEngine] Batch scan error for agency ${agency.id}:`, err);
        }
    }
    console.log(`[FraudEngine] Batch scan complete: ${agencies.length} scanned, ${flagged} flagged`);
    return { scanned: agencies.length, flagged, results };
}
