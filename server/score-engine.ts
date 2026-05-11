// @ts-nocheck
import { storage } from "./storage";
import type { AgencyLegitimacyScore, AgencyScoreWeight } from "@shared/schema";

interface ScoreBreakdown {
  licenseStatusScore: number;
  complianceHistoryScore: number;
  paymentTransparencyScore: number;
  governmentVerificationScore: number;
  userFeedbackScore: number;
  longevityScore: number;
  overallScore: number;
  tier: string;
}

function determineTier(score: number): string {
  if (score >= 90) return "platinum";
  if (score >= 75) return "gold";
  if (score >= 60) return "silver";
  if (score >= 40) return "caution";
  return "high_risk";
}

function getWeightValue(weights: AgencyScoreWeight[], factorName: string, defaultWeight: number): number {
  const w = weights.find(w => w.factorName === factorName);
  return (w && w.isActive) ? w.weight : defaultWeight;
}

export async function calculateAgencyScore(agencyId: string, triggeredBy: string = "system"): Promise<AgencyLegitimacyScore | null> {
  const existingScore = await storage.getAgencyScore(agencyId);
  if (existingScore?.isFrozen) {
    return existingScore;
  }

  const agency = await storage.getNeaAgencyById(agencyId);
  if (!agency) return null;

  const weights = await storage.getScoreWeights();

  const licenseWeight = getWeightValue(weights, "license_status", 30);
  const complianceWeight = getWeightValue(weights, "compliance_history", 15);
  const paymentWeight = getWeightValue(weights, "payment_transparency", 10);
  const govWeight = getWeightValue(weights, "government_verification", 20);
  const feedbackWeight = getWeightValue(weights, "user_feedback", 5);
  const longevityWeight = getWeightValue(weights, "longevity", 10);

  const totalWeight = licenseWeight + complianceWeight + paymentWeight + govWeight + feedbackWeight + longevityWeight;

  let licenseRaw = 0;
  if (agency.expiryDate) {
    const now = new Date();
    const expiry = new Date(agency.expiryDate);
    if (expiry > now) {
      licenseRaw = 1;
    } else {
      licenseRaw = -1;
    }
  }
  if (agency.statusOverride === "suspended") {
    licenseRaw = -1;
  }

  const recentEvents = await storage.getRecentComplianceEvents(agencyId, 12);
  const majorViolations = recentEvents.filter(e => e.severity === "major").length;
  const minorViolations = recentEvents.filter(e => e.severity === "minor").length;
  let complianceRaw: number;
  if (majorViolations > 0) {
    complianceRaw = -1;
  } else if (minorViolations > 0) {
    complianceRaw = -0.67;
  } else {
    complianceRaw = 1;
  }

  let paymentRaw = 0;
  try {
    const renewals = await storage.getLicenseRenewalPaymentsByAgency(agencyId);
    const verified = renewals.filter((p: any) => p.paymentStatus === "completed").length;
    const unverified = renewals.filter((p: any) => p.paymentStatus === "pending" || p.paymentStatus === "failed").length;
    if (verified > 0) paymentRaw = 1;
    if (unverified > verified) paymentRaw = -0.5;
  } catch {
    paymentRaw = 0;
  }

  let govRaw = 0;
  try {
    const overrides = await storage.getManualOverrides({ limit: 1000 });
    const agencyOverride = overrides.find((o: any) => o.agencyId === agencyId);
    if (agencyOverride && agencyOverride.syncStatus === "synced") {
      govRaw = 1;
    } else {
      const syncLogs = await storage.getGovernmentSyncLogs({ status: "success", limit: 100 });
      const hasAgencySync = syncLogs.some((log: any) =>
        log.licenseNumber === agency.licenseNumber && (log.status === "success")
      );
      if (hasAgencySync) govRaw = 1;
    }
  } catch {
    govRaw = 0;
  }

  let feedbackRaw = 0;
  try {
    const reports = await storage.getAgencyReports();
    const agencyReports = reports.filter((r: any) => r.agencyId === agencyId || r.agencyName === agency.agencyName);
    const positive = recentEvents.filter(e => e.eventType === "positive_feedback").length;
    const negative = agencyReports.length + recentEvents.filter(e => e.eventType === "negative_feedback").length;
    feedbackRaw = Math.max(-3, Math.min(3, positive - negative));
    feedbackRaw = feedbackRaw / 3;
  } catch {
    feedbackRaw = 0;
  }

  let longevityRaw = 0;
  if (agency.issueDate) {
    const issueDate = new Date(agency.issueDate);
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    if (issueDate <= twoYearsAgo) longevityRaw = 1;
  }

  const licenseScore = Math.round(licenseRaw * licenseWeight);
  const complianceScore = Math.round(complianceRaw * complianceWeight);
  const paymentScore = Math.round(paymentRaw * paymentWeight);
  const govScore = Math.round(govRaw * govWeight);
  const feedbackScore = Math.round(feedbackRaw * feedbackWeight);
  const longevityScoreVal = Math.round(longevityRaw * longevityWeight);

  const rawTotal = licenseScore + complianceScore + paymentScore + govScore + feedbackScore + longevityScoreVal;
  const baseScore = 50;
  const overallScore = Math.max(0, Math.min(100, baseScore + rawTotal));
  const tier = determineTier(overallScore);

  const previousScore = existingScore?.overallScore ?? 50;
  const previousTier = existingScore?.tier ?? "silver";

  const scoreData = {
    agencyId,
    overallScore,
    licenseStatusScore: licenseScore,
    complianceHistoryScore: complianceScore,
    paymentTransparencyScore: paymentScore,
    governmentVerificationScore: govScore,
    userFeedbackScore: feedbackScore,
    longevityScore: longevityScoreVal,
    tier,
    lastCalculatedAt: new Date(),
  };

  const saved = await storage.upsertAgencyScore(scoreData);

  if (previousScore !== overallScore || previousTier !== tier) {
    await storage.createScoreHistory({
      agencyId,
      previousScore,
      newScore: overallScore,
      previousTier,
      newTier: tier,
      changeReason: `Score recalculated by ${triggeredBy}`,
      triggeredBy,
      details: {
        licenseStatusScore: licenseScore,
        complianceHistoryScore: complianceScore,
        paymentTransparencyScore: paymentScore,
        governmentVerificationScore: govScore,
        userFeedbackScore: feedbackScore,
        longevityScore: longevityScoreVal,
      },
    });
  }

  return saved;
}

export async function recalculateAllScores(triggeredBy: string = "system"): Promise<{ total: number; calculated: number; frozen: number; errors: number }> {
  const agencies = await storage.getNeaAgencies();
  let calculated = 0;
  let frozen = 0;
  let errors = 0;

  for (const agency of agencies) {
    try {
      const result = await calculateAgencyScore(agency.id, triggeredBy);
      if (result?.isFrozen) {
        frozen++;
      } else {
        calculated++;
      }
    } catch (err) {
      errors++;
      console.error(`[ScoreEngine] Error calculating score for agency ${agency.id}:`, err);
    }
  }

  console.log(`[ScoreEngine] Batch recalculation complete: ${calculated} calculated, ${frozen} frozen, ${errors} errors out of ${agencies.length} agencies`);
  return { total: agencies.length, calculated, frozen, errors };
}

export function getTierLabel(tier: string): string {
  switch (tier) {
    case "platinum": return "Platinum";
    case "gold": return "Gold";
    case "silver": return "Silver";
    case "caution": return "Caution";
    case "high_risk": return "High Risk";
    default: return tier;
  }
}
