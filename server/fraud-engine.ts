// @ts-nocheck
import { storage } from "./storage";
import type { FraudDetectionRule, FraudFlag } from "@shared/schema";

interface FraudScanResult {
  entityId: string;
  entityType: string;
  flagsCreated: FraudFlag[];
  actionsExecuted: string[];
}

export async function runFraudDetection(entityId: string, entityType: string = "agency"): Promise<FraudScanResult> {
  const rules = await storage.getActiveFraudDetectionRules();
  const result: FraudScanResult = { entityId, entityType, flagsCreated: [], actionsExecuted: [] };

  for (const rule of rules) {
    try {
      const triggered = await evaluateRule(rule, entityId, entityType);
      if (!triggered) continue;

      const existingFlags = await storage.getOpenFraudFlagsByEntityAndRule(entityId, rule.ruleName);
      if (existingFlags.length > 0) continue;

      const flag = await storage.createFraudFlag({
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
    } catch (err) {
      console.error(`[FraudEngine] Error evaluating rule ${rule.ruleName} for ${entityId}:`, err);
    }
  }

  return result;
}

async function evaluateRule(
  rule: FraudDetectionRule,
  entityId: string,
  entityType: string
): Promise<{ triggered: boolean; details: Record<string, any> } | null> {
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

async function evaluateComplaints(
  rule: FraudDetectionRule,
  entityId: string
): Promise<{ triggered: boolean; details: Record<string, any> } | null> {
  try {
    const reports = await storage.getAgencyReports(entityId);
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
  } catch (err) {
    console.error("[FraudEngine] Complaints evaluation error:", err);
  }
  return null;
}

async function evaluateLicenseExpiry(
  rule: FraudDetectionRule,
  entityId: string
): Promise<{ triggered: boolean; details: Record<string, any> } | null> {
  try {
    const agencies = await storage.getNeaAgencies();
    const agency = agencies.find(a => a.id === entityId);
    if (!agency || !agency.expiryDate) return null;

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
  } catch (err) {
    console.error("[FraudEngine] License expiry evaluation error:", err);
  }
  return null;
}

async function evaluateVerificationRejected(
  rule: FraudDetectionRule,
  entityId: string
): Promise<{ triggered: boolean; details: Record<string, any> } | null> {
  try {
    const overrides = await storage.getManualOverrides({ overrideStatus: "rejected" });
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - rule.timeWindowDays);
    const rejectedForEntity = overrides.filter(
      o => o.agencyId === entityId && o.reviewedAt && new Date(o.reviewedAt) >= cutoffDate
    );

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
  } catch (err) {
    console.error("[FraudEngine] Verification rejected evaluation error:", err);
  }
  return null;
}

async function evaluatePaymentFraud(
  rule: FraudDetectionRule,
  entityId: string
): Promise<{ triggered: boolean; details: Record<string, any> } | null> {
  try {
    const complianceEvents = await storage.getRecentComplianceEvents(entityId, Math.ceil(rule.timeWindowDays / 30));
    const fraudEvents = complianceEvents.filter(
      e => e.eventType === "payment_unverified" || e.severity === "major"
    );

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
  } catch (err) {
    console.error("[FraudEngine] Payment fraud evaluation error:", err);
  }
  return null;
}

async function evaluateFakeReceipts(
  rule: FraudDetectionRule,
  entityId: string
): Promise<{ triggered: boolean; details: Record<string, any> } | null> {
  try {
    const payments = await storage.getLicenseRenewalPaymentsByAgency(entityId);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - rule.timeWindowDays);
    const failedPayments = payments.filter(
      p => p.status === "failed" && p.createdAt && new Date(p.createdAt) >= cutoffDate
    );

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
  } catch (err) {
    console.error("[FraudEngine] Fake receipts evaluation error:", err);
  }
  return null;
}

async function executeAutoActions(flag: FraudFlag, rule: FraudDetectionRule): Promise<string[]> {
  const actions: string[] = [];

  try {
    if (rule.autoReduceScore) {
      const { calculateAgencyScore } = await import("./score-engine");
      const scoreResult = await calculateAgencyScore(flag.entityId, "fraud_engine");
      if (scoreResult) {
        actions.push(`score_recalculated`);
      }
    }

    if (rule.autoBlacklist) {
      const isAlready = await storage.isEntityBlacklisted(flag.entityId);
      if (!isAlready) {
        await storage.createBlacklistEntry({
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
      const { notifyComplianceTeamFraudAlert } = await import("./sms");
      await notifyComplianceTeamFraudAlert(flag, rule);
      actions.push("compliance_team_notified");
    } catch (notifyErr) {
      console.error("[FraudEngine] Failed to notify compliance team:", notifyErr);
    }

    if (actions.length > 0) {
      await storage.updateFraudFlagAutoActions(flag.id, actions);
    }
  } catch (err) {
    console.error("[FraudEngine] Error executing auto-actions:", err);
  }

  return actions;
}

export async function runBatchFraudDetection(): Promise<{ scanned: number; flagged: number; results: FraudScanResult[] }> {
  const agencies = await storage.getNeaAgencies();
  const results: FraudScanResult[] = [];
  let flagged = 0;

  for (const agency of agencies) {
    try {
      const result = await runFraudDetection(agency.id, "agency");
      if (result.flagsCreated.length > 0) {
        flagged++;
        results.push(result);
      }
    } catch (err) {
      console.error(`[FraudEngine] Batch scan error for agency ${agency.id}:`, err);
    }
  }

  console.log(`[FraudEngine] Batch scan complete: ${agencies.length} scanned, ${flagged} flagged`);
  return { scanned: agencies.length, flagged, results };
}
