"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeReport = analyzeReport;
exports.runPatternDetection = runPatternDetection;
exports.getEntityRiskProfile = getEntityRiskProfile;
exports.searchIndicators = searchIndicators;
exports.getFraudAnalytics = getFraudAnalytics;
// @ts-nocheck
const db_1 = require("./db");
const storage_1 = require("./storage");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
function normalize(value) {
    return value.trim().toLowerCase().replace(/[\s\-\(\)]+/g, "");
}
async function analyzeReport(reportId) {
    const report = await storage_1.storage.getFraudReportById(reportId);
    if (!report)
        throw new Error("Report not found");
    let indicatorsFound = 0;
    let riskEscalations = 0;
    const indicators = [];
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
        if (!normalizedVal)
            continue;
        const [existing] = await db_1.db.select().from(schema_1.fraudIndicators)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.indicatorType, ind.type), (0, drizzle_orm_1.eq)(schema_1.fraudIndicators.normalizedValue, normalizedVal), (0, drizzle_orm_1.eq)(schema_1.fraudIndicators.status, "active"))).limit(1);
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
            }
            else if (newCount >= 5 && newRiskLevel !== "critical" && newRiskLevel !== "high") {
                newRiskLevel = "high";
                riskEscalations++;
            }
            else if (newCount >= 3 && newRiskLevel === "low") {
                newRiskLevel = "moderate";
                riskEscalations++;
            }
            await db_1.db.update(schema_1.fraudIndicators)
                .set({
                reportCount: newCount,
                linkedReports,
                lastReportedAt: new Date(),
                riskLevel: newRiskLevel,
            })
                .where((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.id, existing.id));
        }
        else {
            await db_1.db.insert(schema_1.fraudIndicators).values({
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
    await db_1.db.update(schema_1.fraudReports)
        .set({
        analysisResult: { indicatorsFound, patternsDetected, riskEscalations, analyzedAt: new Date().toISOString() },
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.fraudReports.id, reportId));
    return { indicatorsFound, patternsDetected, riskEscalations };
}
async function detectPatternsForReport(reportId) {
    let patterns = 0;
    const highRiskIndicators = await db_1.db.select().from(schema_1.fraudIndicators)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.status, "active"), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.riskLevel, "high"), (0, drizzle_orm_1.eq)(schema_1.fraudIndicators.riskLevel, "critical"))));
    for (const indicator of highRiskIndicators) {
        const linked = Array.isArray(indicator.linkedReports) ? indicator.linkedReports : [];
        if (linked.includes(reportId) && linked.length >= 3) {
            patterns++;
            if (indicator.indicatorType === "name" || indicator.indicatorType === "license") {
                const agencyResults = await db_1.db.select().from(schema_1.fraudReports)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.fraudReports.status, "pending"), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.fraudReports.suspectedEntity, `%${indicator.value}%`), (0, drizzle_orm_1.eq)(schema_1.fraudReports.licenseNumber, indicator.value))));
                if (agencyResults.length >= 3) {
                    try {
                        const alerts = await storage_1.storage.getComplianceAlerts({ status: "pending" });
                        const existingAlert = alerts.find((a) => a.alertType === "fraud_pattern" && a.metadata?.indicatorId === indicator.id);
                        if (!existingAlert) {
                            await storage_1.storage.createComplianceAlert({
                                agencyId: indicator.metadata?.agencyId || "unknown",
                                alertType: "fraud_pattern",
                                severity: indicator.riskLevel === "critical" ? "critical" : "high",
                                message: `Pattern detected: ${indicator.indicatorType} "${indicator.value}" has ${linked.length} fraud reports`,
                                metadata: { indicatorId: indicator.id, reportCount: linked.length },
                            });
                        }
                    }
                    catch { }
                }
            }
        }
    }
    return patterns;
}
async function runPatternDetection() {
    let escalated = 0;
    let alertsCreated = 0;
    const activeIndicators = await db_1.db.select().from(schema_1.fraudIndicators)
        .where((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.status, "active"));
    for (const indicator of activeIndicators) {
        const count = indicator.reportCount || 0;
        let newRisk = indicator.riskLevel;
        if (count >= 10 && indicator.riskLevel !== "critical") {
            newRisk = "critical";
        }
        else if (count >= 5 && indicator.riskLevel !== "critical" && indicator.riskLevel !== "high") {
            newRisk = "high";
        }
        else if (count >= 3 && indicator.riskLevel === "low") {
            newRisk = "moderate";
        }
        if (newRisk !== indicator.riskLevel) {
            await db_1.db.update(schema_1.fraudIndicators)
                .set({ riskLevel: newRisk })
                .where((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.id, indicator.id));
            escalated++;
        }
        if ((newRisk === "high" || newRisk === "critical") && count >= 5) {
            try {
                const existingAlerts = await storage_1.storage.getComplianceAlerts({ status: "pending" });
                const alreadyAlerted = existingAlerts.some((a) => a.alertType === "fraud_pattern" && a.metadata?.indicatorId === indicator.id);
                if (!alreadyAlerted) {
                    await storage_1.storage.createComplianceAlert({
                        agencyId: indicator.metadata?.agencyId || "unknown",
                        alertType: "fraud_pattern",
                        severity: newRisk === "critical" ? "critical" : "high",
                        message: `Scam indicator "${indicator.value}" (${indicator.indicatorType}) has reached ${count} reports`,
                        metadata: { indicatorId: indicator.id, reportCount: count },
                    });
                    alertsCreated++;
                }
            }
            catch { }
        }
    }
    return { scanned: activeIndicators.length, escalated, alertsCreated };
}
async function getEntityRiskProfile(entityId) {
    const reports = await db_1.db.select().from(schema_1.fraudReports)
        .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.fraudReports.suspectedAgencyId, entityId), (0, drizzle_orm_1.ilike)(schema_1.fraudReports.suspectedEntity, `%${entityId}%`)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.fraudReports.createdAt));
    const relatedIndicators = [];
    for (const report of reports) {
        if (report.phoneNumber) {
            const found = await db_1.db.select().from(schema_1.fraudIndicators)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.normalizedValue, normalize(report.phoneNumber)), (0, drizzle_orm_1.eq)(schema_1.fraudIndicators.status, "active")));
            relatedIndicators.push(...found);
        }
        if (report.licenseNumber) {
            const found = await db_1.db.select().from(schema_1.fraudIndicators)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.normalizedValue, normalize(report.licenseNumber)), (0, drizzle_orm_1.eq)(schema_1.fraudIndicators.status, "active")));
            relatedIndicators.push(...found);
        }
    }
    const uniqueIndicators = Array.from(new Map(relatedIndicators.map(i => [i.id, i])).values());
    const highRiskCount = uniqueIndicators.filter(i => i.riskLevel === "high" || i.riskLevel === "critical").length;
    let overallRisk = "low";
    if (highRiskCount >= 3 || reports.length >= 10)
        overallRisk = "critical";
    else if (highRiskCount >= 1 || reports.length >= 5)
        overallRisk = "high";
    else if (reports.length >= 2)
        overallRisk = "moderate";
    return {
        reports: reports.map(r => ({ ...r, reporterId: undefined })),
        indicators: uniqueIndicators,
        riskSummary: { totalReports: reports.length, highRiskIndicators: highRiskCount, overallRisk },
    };
}
async function searchIndicators(query) {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery || normalizedQuery.length < 2)
        return [];
    return db_1.db.select({
        id: schema_1.fraudIndicators.id,
        indicatorType: schema_1.fraudIndicators.indicatorType,
        value: schema_1.fraudIndicators.value,
        riskLevel: schema_1.fraudIndicators.riskLevel,
        reportCount: schema_1.fraudIndicators.reportCount,
        firstReportedAt: schema_1.fraudIndicators.firstReportedAt,
        lastReportedAt: schema_1.fraudIndicators.lastReportedAt,
    }).from(schema_1.fraudIndicators)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.status, "active"), (0, drizzle_orm_1.ilike)(schema_1.fraudIndicators.normalizedValue, `%${normalizedQuery}%`)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.fraudIndicators.reportCount))
        .limit(20);
}
async function getFraudAnalytics() {
    const [reportCount] = await db_1.db.select({ cnt: (0, drizzle_orm_1.sql) `count(*)::int` }).from(schema_1.fraudReports);
    const [indicatorCount] = await db_1.db.select({ cnt: (0, drizzle_orm_1.sql) `count(*)::int` }).from(schema_1.fraudIndicators).where((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.status, "active"));
    const incidentTypes = await db_1.db.select({
        type: schema_1.fraudReports.incidentType,
        cnt: (0, drizzle_orm_1.sql) `count(*)::int`,
    }).from(schema_1.fraudReports).groupBy(schema_1.fraudReports.incidentType);
    const riskLevels = await db_1.db.select({
        level: schema_1.fraudIndicators.riskLevel,
        cnt: (0, drizzle_orm_1.sql) `count(*)::int`,
    }).from(schema_1.fraudIndicators).where((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.status, "active")).groupBy(schema_1.fraudIndicators.riskLevel);
    const indicatorTypes = await db_1.db.select({
        type: schema_1.fraudIndicators.indicatorType,
        cnt: (0, drizzle_orm_1.sql) `count(*)::int`,
    }).from(schema_1.fraudIndicators).where((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.status, "active")).groupBy(schema_1.fraudIndicators.indicatorType);
    const topIndicators = await db_1.db.select({
        id: schema_1.fraudIndicators.id,
        indicatorType: schema_1.fraudIndicators.indicatorType,
        value: schema_1.fraudIndicators.value,
        riskLevel: schema_1.fraudIndicators.riskLevel,
        reportCount: schema_1.fraudIndicators.reportCount,
    }).from(schema_1.fraudIndicators)
        .where((0, drizzle_orm_1.eq)(schema_1.fraudIndicators.status, "active"))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.fraudIndicators.reportCount))
        .limit(10);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [recentCount] = await db_1.db.select({ cnt: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(schema_1.fraudReports)
        .where((0, drizzle_orm_1.gte)(schema_1.fraudReports.createdAt, thirtyDaysAgo));
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
