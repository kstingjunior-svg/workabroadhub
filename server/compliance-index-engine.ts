// @ts-nocheck
import { db } from "./db";
import { storage } from "./storage";
import {
  complianceIndexScores,
  complianceIndexHistory,
  complianceIndexConfig,
  neaAgencies,
} from "@shared/schema";
import { eq, sql, desc, and, ne } from "drizzle-orm";

interface IndexFactorResult {
  name: string;
  rawScore: number;
  weight: number;
  weightedScore: number;
}

interface IndexResult {
  agencyId: string;
  agencyName: string | null;
  compositeScore: number;
  factors: IndexFactorResult[];
  country: string | null;
  city: string | null;
  industry: string | null;
}

async function getWeights(): Promise<Record<string, number>> {
  const configs = await db.select().from(complianceIndexConfig);
  const weights: Record<string, number> = {
    license_validity: 30,
    gov_verification: 20,
    legitimacy: 20,
    compliance_history: 10,
    fraud_detection: 10,
    user_feedback: 10,
  };
  for (const c of configs) {
    const key = c.configKey.replace("weight_", "");
    if (key in weights) {
      weights[key] = typeof c.configValue === "number" ? c.configValue : parseInt(String(c.configValue)) || weights[key];
    }
  }
  return weights;
}

async function getBadgeThresholds(): Promise<{ diamond: number; platinum: number; gold: number; silver: number }> {
  const configs = await db.select().from(complianceIndexConfig);
  const thresholds = { diamond: 1, platinum: 5, gold: 10, silver: 25 };
  for (const c of configs) {
    if (c.configKey === "badge_diamond_pct") thresholds.diamond = Number(c.configValue) || 1;
    if (c.configKey === "badge_platinum_pct") thresholds.platinum = Number(c.configValue) || 5;
    if (c.configKey === "badge_gold_pct") thresholds.gold = Number(c.configValue) || 10;
    if (c.configKey === "badge_silver_pct") thresholds.silver = Number(c.configValue) || 25;
  }
  return thresholds;
}

async function calculateLicenseValidityScore(agency: any): Promise<number> {
  if (!agency.expiryDate) return 0;
  const now = new Date();
  const expiry = new Date(agency.expiryDate);
  const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (agency.statusOverride === "suspended") return 0;
  if (daysUntilExpiry < 0) return 0;
  if (daysUntilExpiry <= 7) return 30;
  if (daysUntilExpiry <= 30) return 60;
  if (daysUntilExpiry <= 90) return 80;
  return 100;
}

async function calculateGovVerificationScore(agencyId: string): Promise<number> {
  try {
    const syncLogs = await db.select().from(
      sql`government_sync_logs`
    ).where(sql`agency_id = ${agencyId} AND status = 'success'`).limit(1) as any[];

    if (syncLogs && syncLogs.length > 0) return 100;

    const overrides = await db.select().from(
      sql`manual_overrides`
    ).where(sql`agency_id = ${agencyId} AND status = 'approved'`).limit(1) as any[];

    if (overrides && overrides.length > 0) return 70;
  } catch {
    // tables may not have data
  }
  return 0;
}

async function calculateLegitimacySubscore(agencyId: string): Promise<number> {
  try {
    const score = await storage.getAgencyScore(agencyId);
    if (score) return score.overallScore;
  } catch {}
  return 50;
}

async function calculateComplianceHistoryScore(agencyId: string): Promise<number> {
  try {
    const events = await storage.getRecentComplianceEvents(agencyId, 12);
    if (!events || events.length === 0) return 100;
    const hasMajor = events.some((e: any) => e.severity === "major" || e.severity === "critical");
    if (hasMajor) return 0;
    const minorCount = events.filter((e: any) => e.severity === "minor").length;
    if (minorCount > 3) return 30;
    if (minorCount > 0) return 60;
    return 100;
  } catch {
    return 100;
  }
}

async function calculateFraudDetectionScore(agencyId: string): Promise<number> {
  try {
    const isBlacklisted = await storage.isEntityBlacklisted(agencyId);
    if (isBlacklisted) return 0;

    const flags = await storage.getAllFraudFlags({
      entityType: "agency",
      limit: 100,
      offset: 0,
    });
    const agencyFlags = flags.filter((f) => f.entityId === agencyId);
    if (agencyFlags.length === 0) return 100;
    const activeFlags = agencyFlags.filter((f) => f.status === "open" || f.status === "investigating");
    if (activeFlags.length > 0) return 10;
    return 60;
  } catch {
    return 100;
  }
}

async function calculateUserFeedbackScore(agencyId: string): Promise<number> {
  try {
    const reports = await storage.getAgencyReports(agencyId);
    if (!reports || reports.length === 0) return 80;
    const resolved = reports.filter((r) => r.status === "resolved").length;
    const pending = reports.filter((r) => r.status === "pending").length;
    const total = reports.length;
    if (total === 0) return 80;
    const resolutionRate = resolved / total;
    if (pending > 5) return 20;
    if (resolutionRate > 0.8) return 70;
    if (resolutionRate > 0.5) return 50;
    return 30;
  } catch {
    return 80;
  }
}

export async function calculateAgencyIndex(agency: any): Promise<IndexResult> {
  const weights = await getWeights();
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const licenseScore = await calculateLicenseValidityScore(agency);
  const govScore = await calculateGovVerificationScore(agency.id);
  const legitimacyScore = await calculateLegitimacySubscore(agency.id);
  const complianceScore = await calculateComplianceHistoryScore(agency.id);
  const fraudScore = await calculateFraudDetectionScore(agency.id);
  const feedbackScore = await calculateUserFeedbackScore(agency.id);

  const factors: IndexFactorResult[] = [
    { name: "License Validity", rawScore: licenseScore, weight: weights.license_validity, weightedScore: Math.round((licenseScore * weights.license_validity) / totalWeight) },
    { name: "Government Verification", rawScore: govScore, weight: weights.gov_verification, weightedScore: Math.round((govScore * weights.gov_verification) / totalWeight) },
    { name: "Legitimacy Score", rawScore: legitimacyScore, weight: weights.legitimacy, weightedScore: Math.round((legitimacyScore * weights.legitimacy) / totalWeight) },
    { name: "Compliance History", rawScore: complianceScore, weight: weights.compliance_history, weightedScore: Math.round((complianceScore * weights.compliance_history) / totalWeight) },
    { name: "Fraud Detection", rawScore: fraudScore, weight: weights.fraud_detection, weightedScore: Math.round((fraudScore * weights.fraud_detection) / totalWeight) },
    { name: "User Feedback", rawScore: feedbackScore, weight: weights.user_feedback, weightedScore: Math.round((feedbackScore * weights.user_feedback) / totalWeight) },
  ];

  const compositeScore = Math.max(0, Math.min(100, factors.reduce((sum, f) => sum + f.weightedScore, 0)));

  return {
    agencyId: agency.id,
    agencyName: agency.agencyName,
    compositeScore,
    factors,
    country: agency.country || null,
    city: agency.city || null,
    industry: agency.serviceType || null,
  };
}

export async function batchCalculateIndex(): Promise<{ total: number; ranked: number; errors: number }> {
  const agencies = await storage.getNeaAgencies();
  const results: IndexResult[] = [];
  let errors = 0;

  const existingExclusions = await db.select({ agencyId: complianceIndexScores.agencyId })
    .from(complianceIndexScores)
    .where(eq(complianceIndexScores.isExcluded, true));
  const excludedSet = new Set(existingExclusions.map(e => e.agencyId));

  for (const agency of agencies) {
    try {
      const isBlacklisted = await storage.isEntityBlacklisted(agency.id);
      if (isBlacklisted) {
        excludedSet.add(agency.id);
        continue;
      }
      const result = await calculateAgencyIndex(agency);
      results.push(result);
    } catch (err) {
      errors++;
    }
  }

  // Remove excluded agencies from ranking pool
  const rankableResults = results.filter(r => !excludedSet.has(r.agencyId));
  rankableResults.sort((a, b) => b.compositeScore - a.compositeScore);

  const thresholds = await getBadgeThresholds();
  const total = rankableResults.length;

  for (let i = 0; i < rankableResults.length; i++) {
    const pctRank = ((i + 1) / total) * 100;
    let badge = "none";
    if (pctRank <= thresholds.diamond) badge = "diamond";
    else if (pctRank <= thresholds.platinum) badge = "platinum";
    else if (pctRank <= thresholds.gold) badge = "gold";
    else if (pctRank <= thresholds.silver) badge = "silver";
    (rankableResults[i] as any).globalRank = i + 1;
    (rankableResults[i] as any).badge = badge;
  }

  const countryGroups: Record<string, IndexResult[]> = {};
  const industryGroups: Record<string, IndexResult[]> = {};
  const cityGroups: Record<string, IndexResult[]> = {};
  for (const r of rankableResults) {
    if (r.country) {
      if (!countryGroups[r.country]) countryGroups[r.country] = [];
      countryGroups[r.country].push(r);
    }
    if (r.industry) {
      if (!industryGroups[r.industry]) industryGroups[r.industry] = [];
      industryGroups[r.industry].push(r);
    }
    if (r.city) {
      const cityKey = `${r.country || ""}:${r.city}`;
      if (!cityGroups[cityKey]) cityGroups[cityKey] = [];
      cityGroups[cityKey].push(r);
    }
  }

  for (const group of Object.values(countryGroups)) {
    group.sort((a, b) => b.compositeScore - a.compositeScore);
    group.forEach((r, i) => { (r as any).countryRank = i + 1; });
  }
  for (const group of Object.values(industryGroups)) {
    group.sort((a, b) => b.compositeScore - a.compositeScore);
    group.forEach((r, i) => { (r as any).industryRank = i + 1; });
  }
  for (const group of Object.values(cityGroups)) {
    group.sort((a, b) => b.compositeScore - a.compositeScore);
    group.forEach((r, i) => { (r as any).cityRank = i + 1; });
  }

  // Mark blacklisted agencies as excluded in DB
  for (const agencyId of excludedSet) {
    const existing = await db.select().from(complianceIndexScores)
      .where(eq(complianceIndexScores.agencyId, agencyId)).limit(1);
    if (existing.length > 0) {
      await db.update(complianceIndexScores)
        .set({ isExcluded: true, updatedAt: new Date() })
        .where(eq(complianceIndexScores.agencyId, agencyId));
    }
  }

  for (const r of rankableResults) {
    const data: any = r as any;
    const existing = await db.select().from(complianceIndexScores)
      .where(eq(complianceIndexScores.agencyId, r.agencyId)).limit(1);

    if (existing.length > 0) {
      await db.update(complianceIndexScores)
        .set({
          agencyName: r.agencyName,
          compositeScore: r.compositeScore,
          licenseValidityScore: r.factors[0].rawScore,
          govVerificationScore: r.factors[1].rawScore,
          legitimacyScore: r.factors[2].rawScore,
          complianceHistoryScore: r.factors[3].rawScore,
          fraudDetectionScore: r.factors[4].rawScore,
          userFeedbackScore: r.factors[5].rawScore,
          globalRank: data.globalRank,
          countryRank: data.countryRank || null,
          industryRank: data.industryRank || null,
          cityRank: data.cityRank || null,
          badge: data.badge,
          country: r.country,
          city: r.city,
          industry: r.industry,
          updatedAt: new Date(),
        })
        .where(eq(complianceIndexScores.agencyId, r.agencyId));
    } else {
      await db.insert(complianceIndexScores).values({
        agencyId: r.agencyId,
        agencyName: r.agencyName,
        compositeScore: r.compositeScore,
        licenseValidityScore: r.factors[0].rawScore,
        govVerificationScore: r.factors[1].rawScore,
        legitimacyScore: r.factors[2].rawScore,
        complianceHistoryScore: r.factors[3].rawScore,
        fraudDetectionScore: r.factors[4].rawScore,
        userFeedbackScore: r.factors[5].rawScore,
        globalRank: data.globalRank,
        countryRank: data.countryRank || null,
        industryRank: data.industryRank || null,
        cityRank: data.cityRank || null,
        badge: data.badge,
        country: r.country,
        city: r.city,
        industry: r.industry,
        isExcluded: excludedSet.has(r.agencyId),
      });
    }

    await db.insert(complianceIndexHistory).values({
      agencyId: r.agencyId,
      compositeScore: r.compositeScore,
      globalRank: data.globalRank,
      badge: data.badge,
    });
  }

  return { total: agencies.length, ranked: rankableResults.length, errors };
}
