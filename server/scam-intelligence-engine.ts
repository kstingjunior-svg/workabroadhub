import { db } from "./db";
import { storage } from "./storage";
import { fraudReports, fraudIndicators } from "@shared/schema";
import { eq, and, ilike, or, desc, sql, gte } from "drizzle-orm";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\-\(\)]+/g, "");
}

export async function analyzeReport(reportId: string): Promise<{
  indicatorsFound: number;
  patternsDetected: number;
  riskEscalations: number;
}> {
  const report = await storage.getFraudReportById(reportId);
  if (!report) throw new Error("Report not found");

  let indicatorsFound = 0;
  let riskEscalations = 0;
  const indicators: { type: string; value: string }[] = [];

  if (report.phoneNumber) {
    indicators.push({ type: "phone", value: report.phoneNumber });
  }
  if (report.licenseNumber) {
    indicators.push({ type: "license", value: report.licenseNumber });
  }
  if (report.paymentReference) {
    indicators.push({ type: "payment_account", value: report.paymentReference });
  }
  if (report.suspectedEntity) {
    indicators.push({ type: "name", value: report.suspectedEntity });
  }

  for (const ind of indicators) {
    const normalizedVal = normalize(ind.value);
    if (!normalizedVal) continue;

    const [existing] = await db.select().from(fraudIndicators)
      .where(and(
        eq(fraudIndicators.indicatorType, ind.type),
        eq(fraudIndicators.normalizedValue, normalizedVal),
        eq(fraudIndicators.status, "active")
      )).limit(1);

    if (existing) {
      const linkedReports = Array.isArray(existing.linkedReports) ? existing.linkedReports : [];
      const alreadyLinked = linkedReports.includes(reportId);
      if (!alreadyLinked) {
        linkedReports.push(reportId);
      }
      const newCount = alreadyLinked ? (existing.reportCount || 0) : (existing.reportCount || 0) + 1;
      let newRiskLevel = existing.riskLevel;

      if (newCount >= 10 && newRiskLevel !== "critical") {
        newRiskLevel = "critical";
        riskEscalations++;
      } else if (newCount >= 5 && newRiskLevel !== "critical" && newRiskLevel !== "high") {
        newRiskLevel = "high";
        riskEscalations++;
      } else if (newCount >= 3 && newRiskLevel === "low") {
        newRiskLevel = "moderate";
        riskEscalations++;
      }

      await db.update(fraudIndicators)
        .set({
          reportCount: newCount,
          linkedReports,
          lastReportedAt: new Date(),
          riskLevel: newRiskLevel,
        })
        .where(eq(fraudIndicators.id, existing.id));
    } else {
      await db.insert(fraudIndicators).values({
        indicatorType: ind.type,
        value: ind.value,
        normalizedValue: normalizedVal,
        riskLevel: "low",
        source: "user_report",
        linkedReports: [reportId],
        reportCount: 1,
        addedBy: report.reporterId || "system",
      });
    }
    indicatorsFound++;
  }

  const patternsDetected = await detectPatternsForReport(reportId);

  await db.update(fraudReports)
    .set({
      analysisResult: { indicatorsFound, patternsDetected, riskEscalations, analyzedAt: new Date().toISOString() },
      updatedAt: new Date(),
    })
    .where(eq(fraudReports.id, reportId));

  return { indicatorsFound, patternsDetected, riskEscalations };
}

async function detectPatternsForReport(reportId: string): Promise<number> {
  let patterns = 0;

  const highRiskIndicators = await db.select().from(fraudIndicators)
    .where(and(
      eq(fraudIndicators.status, "active"),
      or(eq(fraudIndicators.riskLevel, "high"), eq(fraudIndicators.riskLevel, "critical"))
    ));

  for (const indicator of highRiskIndicators) {
    const linked = Array.isArray(indicator.linkedReports) ? indicator.linkedReports : [];
    if (linked.includes(reportId) && linked.length >= 3) {
      patterns++;

      if (indicator.indicatorType === "name" || indicator.indicatorType === "license") {
        const agencyResults = await db.select().from(fraudReports)
          .where(and(
            eq(fraudReports.status, "pending"),
            or(
              ilike(fraudReports.suspectedEntity, `%${indicator.value}%`),
              eq(fraudReports.licenseNumber, indicator.value)
            )
          ));

        if (agencyResults.length >= 3) {
          try {
            const alerts = await storage.getComplianceAlerts({ status: "pending" });
            const existingAlert = alerts.find((a: any) =>
              a.alertType === "fraud_pattern" && a.metadata?.indicatorId === indicator.id
            );
            if (!existingAlert) {
              await storage.createComplianceAlert({
                agencyId: indicator.metadata?.agencyId || "unknown",
                alertType: "fraud_pattern",
                severity: indicator.riskLevel === "critical" ? "critical" : "high",
                message: `Pattern detected: ${indicator.indicatorType} "${indicator.value}" has ${linked.length} fraud reports`,
                metadata: { indicatorId: indicator.id, reportCount: linked.length },
              });
            }
          } catch {}
        }
      }
    }
  }
  return patterns;
}

export async function runPatternDetection(): Promise<{
  scanned: number;
  escalated: number;
  alertsCreated: number;
}> {
  let escalated = 0;
  let alertsCreated = 0;

  const activeIndicators = await db.select().from(fraudIndicators)
    .where(eq(fraudIndicators.status, "active"));

  for (const indicator of activeIndicators) {
    const count = indicator.reportCount || 0;
    let newRisk = indicator.riskLevel;

    if (count >= 10 && indicator.riskLevel !== "critical") {
      newRisk = "critical";
    } else if (count >= 5 && indicator.riskLevel !== "critical" && indicator.riskLevel !== "high") {
      newRisk = "high";
    } else if (count >= 3 && indicator.riskLevel === "low") {
      newRisk = "moderate";
    }

    if (newRisk !== indicator.riskLevel) {
      await db.update(fraudIndicators)
        .set({ riskLevel: newRisk })
        .where(eq(fraudIndicators.id, indicator.id));
      escalated++;
    }

    if ((newRisk === "high" || newRisk === "critical") && count >= 5) {
      try {
        const existingAlerts = await storage.getComplianceAlerts({ status: "pending" });
        const alreadyAlerted = existingAlerts.some((a: any) =>
          a.alertType === "fraud_pattern" && a.metadata?.indicatorId === indicator.id
        );
        if (!alreadyAlerted) {
          await storage.createComplianceAlert({
            agencyId: indicator.metadata?.agencyId || "unknown",
            alertType: "fraud_pattern",
            severity: newRisk === "critical" ? "critical" : "high",
            message: `Scam indicator "${indicator.value}" (${indicator.indicatorType}) has reached ${count} reports`,
            metadata: { indicatorId: indicator.id, reportCount: count },
          });
          alertsCreated++;
        }
      } catch {}
    }
  }

  return { scanned: activeIndicators.length, escalated, alertsCreated };
}

export async function getEntityRiskProfile(entityId: string): Promise<{
  reports: any[];
  indicators: any[];
  riskSummary: { totalReports: number; highRiskIndicators: number; overallRisk: string };
}> {
  const reports = await db.select().from(fraudReports)
    .where(or(
      eq(fraudReports.suspectedAgencyId, entityId),
      ilike(fraudReports.suspectedEntity, `%${entityId}%`)
    ))
    .orderBy(desc(fraudReports.createdAt));

  const relatedIndicators: any[] = [];
  for (const report of reports) {
    if (report.phoneNumber) {
      const found = await db.select().from(fraudIndicators)
        .where(and(
          eq(fraudIndicators.normalizedValue, normalize(report.phoneNumber)),
          eq(fraudIndicators.status, "active")
        ));
      relatedIndicators.push(...found);
    }
    if (report.licenseNumber) {
      const found = await db.select().from(fraudIndicators)
        .where(and(
          eq(fraudIndicators.normalizedValue, normalize(report.licenseNumber)),
          eq(fraudIndicators.status, "active")
        ));
      relatedIndicators.push(...found);
    }
  }

  const uniqueIndicators = Array.from(new Map(relatedIndicators.map(i => [i.id, i])).values());
  const highRiskCount = uniqueIndicators.filter(i => i.riskLevel === "high" || i.riskLevel === "critical").length;

  let overallRisk = "low";
  if (highRiskCount >= 3 || reports.length >= 10) overallRisk = "critical";
  else if (highRiskCount >= 1 || reports.length >= 5) overallRisk = "high";
  else if (reports.length >= 2) overallRisk = "moderate";

  return {
    reports: reports.map(r => ({ ...r, reporterId: undefined })),
    indicators: uniqueIndicators,
    riskSummary: { totalReports: reports.length, highRiskIndicators: highRiskCount, overallRisk },
  };
}

export async function searchIndicators(query: string): Promise<any[]> {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return [];

  return db.select({
    id: fraudIndicators.id,
    indicatorType: fraudIndicators.indicatorType,
    value: fraudIndicators.value,
    riskLevel: fraudIndicators.riskLevel,
    reportCount: fraudIndicators.reportCount,
    firstReportedAt: fraudIndicators.firstReportedAt,
    lastReportedAt: fraudIndicators.lastReportedAt,
  }).from(fraudIndicators)
    .where(and(
      eq(fraudIndicators.status, "active"),
      ilike(fraudIndicators.normalizedValue, `%${normalizedQuery}%`)
    ))
    .orderBy(desc(fraudIndicators.reportCount))
    .limit(20);
}

export async function getFraudAnalytics(): Promise<{
  totalReports: number;
  totalIndicators: number;
  byIncidentType: Record<string, number>;
  byRiskLevel: Record<string, number>;
  byIndicatorType: Record<string, number>;
  topIndicators: any[];
  recentReports: number;
}> {
  const [reportCount] = await db.select({ cnt: sql<number>`count(*)::int` }).from(fraudReports);
  const [indicatorCount] = await db.select({ cnt: sql<number>`count(*)::int` }).from(fraudIndicators).where(eq(fraudIndicators.status, "active"));

  const incidentTypes = await db.select({
    type: fraudReports.incidentType,
    cnt: sql<number>`count(*)::int`,
  }).from(fraudReports).groupBy(fraudReports.incidentType);

  const riskLevels = await db.select({
    level: fraudIndicators.riskLevel,
    cnt: sql<number>`count(*)::int`,
  }).from(fraudIndicators).where(eq(fraudIndicators.status, "active")).groupBy(fraudIndicators.riskLevel);

  const indicatorTypes = await db.select({
    type: fraudIndicators.indicatorType,
    cnt: sql<number>`count(*)::int`,
  }).from(fraudIndicators).where(eq(fraudIndicators.status, "active")).groupBy(fraudIndicators.indicatorType);

  const topIndicators = await db.select({
    id: fraudIndicators.id,
    indicatorType: fraudIndicators.indicatorType,
    value: fraudIndicators.value,
    riskLevel: fraudIndicators.riskLevel,
    reportCount: fraudIndicators.reportCount,
  }).from(fraudIndicators)
    .where(eq(fraudIndicators.status, "active"))
    .orderBy(desc(fraudIndicators.reportCount))
    .limit(10);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [recentCount] = await db.select({ cnt: sql<number>`count(*)::int` })
    .from(fraudReports)
    .where(gte(fraudReports.createdAt, thirtyDaysAgo));

  return {
    totalReports: reportCount?.cnt || 0,
    totalIndicators: indicatorCount?.cnt || 0,
    byIncidentType: Object.fromEntries(incidentTypes.map(i => [i.type, i.cnt])),
    byRiskLevel: Object.fromEntries(riskLevels.map(r => [r.level, r.cnt])),
    byIndicatorType: Object.fromEntries(indicatorTypes.map(t => [t.type, t.cnt])),
    topIndicators,
    recentReports: recentCount?.cnt || 0,
  };
}
