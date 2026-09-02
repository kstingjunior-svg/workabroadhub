"use strict";
// @ts-nocheck
/**
 * Service Processor
 *
 * Handles fulfilment of AI-generated service requests (cover letters, ATS CV
 * optimisation, SOPs, etc.) raised after a successful payment.
 *
 * Each service_id (UUID) is resolved to its canonical service name via the
 * local DB `services` table, then routed to the appropriate AI generator.
 * The existing SERVICE_PROMPTS / processOrderWithAI pipeline in ai-processor.ts
 * is reused so all quality checks and prompts stay centralised.
 *
 * Caller contract:
 *   - `request.input_data`  — JSON string of { fullName, email, phone,
 *                              targetCountry, currentRole, yearsExperience,
 *                              additionalInfo, currentCvUrl, linkedinUrl }
 *   - `request.output_data` — populated here on success
 *   - `request.status`      — updated to "completed" | "failed"
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCoverLetter = generateCoverLetter;
exports.optimizeCV = optimizeCV;
exports.processService = processService;
const supabaseClient_1 = require("../supabaseClient");
const db_1 = require("../db");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const ai_processor_1 = require("./ai-processor");
const extract_text_1 = require("../utils/extract-text");
// ── Slug aliases for human-readable service_ids ───────────────────────────────
// Mirrors the SERVICE_NAME_ALIASES in ai-processor.ts but keyed on the
// slug that callers may supply (e.g. "cover_letter", "ats_cv").
const SLUG_TO_CANONICAL = {
    cover_letter: "Cover Letter Writing",
    ats_cv: "ATS CV Optimization",
    cv_rewrite: "Country-Specific CV Rewrite",
    linkedin: "LinkedIn Profile Optimization",
    interview_coaching: "Interview Coaching",
    interview_pack: "Interview Coaching",
    sop: "SOP / Statement of Purpose",
    motivation_letter: "Motivation Letter Writing",
    visa_guidance: "Visa Guidance Session",
    contract_review: "Employment Contract Review",
    employer_verification: "Employer Verification Report",
    pre_departure: "Pre-Departure Orientation Pack",
    guided_apply: "Guided Apply Mode",
    app_tracking: "Application Tracking Pro",
    reminder_alerts: "Reminder & Deadline Alerts",
    ats_cover_bundle: "ATS + Cover Letter Bundle",
};
// ── Resolve service name from UUID or slug ────────────────────────────────────
async function resolveServiceName(serviceId) {
    // 1. Try slug alias first (fast, no DB round-trip)
    const slug = serviceId.toLowerCase().replace(/-/g, "_");
    if (SLUG_TO_CANONICAL[slug])
        return SLUG_TO_CANONICAL[slug];
    // 2. Try UUID lookup in local DB
    try {
        const rows = await db_1.db
            .select({ name: schema_1.services.name })
            .from(schema_1.services)
            .where((0, drizzle_orm_1.eq)(schema_1.services.id, serviceId))
            .limit(1);
        if (rows[0]?.name)
            return rows[0].name;
    }
    catch (err) {
        console.error("[ServiceProcessor] DB lookup error:", err.message);
    }
    // 3. Try Supabase fallback
    const { data } = await supabaseClient_1.supabase
        .from("services")
        .select("name")
        .eq("id", serviceId)
        .single();
    return data?.name ?? null;
}
// ── Mark request in-progress ──────────────────────────────────────────────────
async function markInProgress(requestId) {
    await supabaseClient_1.supabase
        .from("service_requests")
        .update({ status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", requestId);
}
// ── Mark request completed ────────────────────────────────────────────────────
async function markCompleted(requestId, outputData) {
    await supabaseClient_1.supabase
        .from("service_requests")
        .update({
        status: "completed",
        output_data: JSON.stringify(outputData),
        error_msg: null,
        updated_at: new Date().toISOString(),
    })
        .eq("id", requestId);
}
// ── Mark request failed ───────────────────────────────────────────────────────
async function markFailed(requestId, errorMsg, retryCount, maxRetries) {
    const nextRetry = retryCount + 1;
    const finalFail = nextRetry >= maxRetries;
    await supabaseClient_1.supabase
        .from("service_requests")
        .update({
        status: finalFail ? "failed" : "pending",
        error_msg: errorMsg,
        retry_count: nextRetry,
        updated_at: new Date().toISOString(),
    })
        .eq("id", requestId);
}
// ── Public generators (also usable outside the scheduler) ─────────────────────
/**
 * Generate a cover letter for the given intake data.
 * Returns the AI content string or throws on error.
 */
async function generateCoverLetter(inputData) {
    const fakeOrder = buildFakeOrder("Cover Letter Writing", inputData);
    const result = await (0, ai_processor_1.processOrderWithAI)(fakeOrder);
    if (!result.success || !result.output?.content) {
        throw new Error(result.error ?? "Cover letter generation returned no content");
    }
    return result.output.content;
}
/**
 * Optimise a CV for ATS systems.
 * Returns the AI content string or throws on error.
 */
async function optimizeCV(inputData) {
    const fakeOrder = buildFakeOrder("ATS CV Optimization", inputData);
    const result = await (0, ai_processor_1.processOrderWithAI)(fakeOrder);
    if (!result.success || !result.output?.content) {
        throw new Error(result.error ?? "ATS CV optimisation returned no content");
    }
    return result.output.content;
}
// ── Central router ────────────────────────────────────────────────────────────
/**
 * Process a single service_requests row.
 * Resolves the service name, calls the right AI generator, and updates Supabase.
 */
async function processService(request, maxRetries = 3) {
    const { id, service_id, input_data, retry_count } = request;
    // Parse input
    let intake = {};
    try {
        if (input_data)
            intake = JSON.parse(input_data);
    }
    catch {
        console.warn(`[ServiceProcessor] request=${id} — input_data is not valid JSON, using empty intake`);
    }
    // Resolve service name
    const serviceName = await resolveServiceName(service_id);
    if (!serviceName) {
        console.warn(`[ServiceProcessor] request=${id} — unrecognised service_id=${service_id}, skipping`);
        await markFailed(id, `Unrecognised service_id: ${service_id}`, retry_count, maxRetries);
        return;
    }
    console.log(`[ServiceProcessor] Processing request=${id} service="${serviceName}"`);
    await markInProgress(id);
    try {
        const fakeOrder = buildFakeOrder(serviceName, intake);
        const result = await (0, ai_processor_1.processOrderWithAI)(fakeOrder);
        if (!result.success || !result.output?.content) {
            throw new Error(result.error ?? "AI returned no content");
        }
        const content = result.output.content;
        await markCompleted(id, {
            content,
            service: serviceName,
            qualityCheck: result.qualityCheck ?? null,
            generatedAt: new Date().toISOString(),
        });
        console.log(`[ServiceProcessor] ✓ Completed request=${id} service="${serviceName}"`);
        // For CV services: stamp improved_cv + extracted ATS score onto cv_uploads
        const isCvService = serviceName === "ATS CV Optimization" ||
            serviceName === "Country-Specific CV Rewrite" ||
            serviceName === "ATS + Cover Letter Bundle";
        if (isCvService && request.user_id) {
            const score = (0, extract_text_1.extractScore)(content);
            (0, supabaseClient_1.updateLatestCvUpload)(request.user_id, content, score).catch((e) => console.error("[ServiceProcessor] updateLatestCvUpload failed:", e?.message));
        }
    }
    catch (err) {
        const msg = err?.message ?? String(err);
        console.error(`[ServiceProcessor] ✗ Failed request=${id}: ${msg}`);
        await markFailed(id, msg, retry_count, maxRetries);
    }
}
// ── Internal helper ───────────────────────────────────────────────────────────
/**
 * Build a minimal ServiceOrder-compatible object from intake data so we can
 * pass it to the existing processOrderWithAI without touching the DB order.
 */
function buildFakeOrder(serviceName, intake) {
    return {
        id: 0,
        userId: 0,
        status: "pending",
        serviceName,
        intakeData: JSON.stringify(intake),
        outputData: null,
        qualityScore: null,
        qualityPassed: null,
        qualityIssues: null,
        autoApproved: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveredAt: null,
        completedAt: null,
    };
}
