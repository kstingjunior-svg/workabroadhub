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

import { supabase, updateLatestCvUpload } from "../supabaseClient";
import { db } from "../db";
import { services } from "@shared/schema";
import { eq } from "drizzle-orm";
import { processOrderWithAI } from "./ai-processor";
import { extractScore } from "../utils/extract-text";

// ── Slug aliases for human-readable service_ids ───────────────────────────────
// Mirrors the SERVICE_NAME_ALIASES in ai-processor.ts but keyed on the
// slug that callers may supply (e.g. "cover_letter", "ats_cv").
const SLUG_TO_CANONICAL: Record<string, string> = {
  cover_letter:          "Cover Letter Writing",
  ats_cv:                "ATS CV Optimization",
  cv_rewrite:            "Country-Specific CV Rewrite",
  linkedin:              "LinkedIn Profile Optimization",
  interview_coaching:    "Interview Coaching",
  interview_pack:        "Interview Coaching",
  sop:                   "SOP / Statement of Purpose",
  motivation_letter:     "Motivation Letter Writing",
  visa_guidance:         "Visa Guidance Session",
  contract_review:       "Employment Contract Review",
  employer_verification: "Employer Verification Report",
  pre_departure:         "Pre-Departure Orientation Pack",
  guided_apply:          "Guided Apply Mode",
  app_tracking:          "Application Tracking Pro",
  reminder_alerts:       "Reminder & Deadline Alerts",
  ats_cover_bundle:      "ATS + Cover Letter Bundle",
};

// ── Row shape returned from Supabase ─────────────────────────────────────────
export interface ServiceRequestRow {
  id:          string;
  user_id:     string;
  service_id:  string;
  payment_id:  string | null;
  status:      string;
  input_data:  string | null;
  output_data: string | null;
  error_msg:   string | null;
  retry_count: number;
}

// ── Resolve service name from UUID or slug ────────────────────────────────────
async function resolveServiceName(serviceId: string): Promise<string | null> {
  // 1. Try slug alias first (fast, no DB round-trip)
  const slug = serviceId.toLowerCase().replace(/-/g, "_");
  if (SLUG_TO_CANONICAL[slug]) return SLUG_TO_CANONICAL[slug];

  // 2. Try UUID lookup in local DB
  try {
    const rows = await db
      .select({ name: services.name })
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);
    if (rows[0]?.name) return rows[0].name;
  } catch (err: any) {
    console.error("[ServiceProcessor] DB lookup error:", err.message);
  }

  // 3. Try Supabase fallback
  const { data } = await supabase
    .from("services")
    .select("name")
    .eq("id", serviceId)
    .single();
  return data?.name ?? null;
}

// ── Mark request in-progress ──────────────────────────────────────────────────
async function markInProgress(requestId: string) {
  await supabase
    .from("service_requests")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", requestId);
}

// ── Mark request completed ────────────────────────────────────────────────────
async function markCompleted(requestId: string, outputData: unknown) {
  await supabase
    .from("service_requests")
    .update({
      status:      "completed",
      output_data: JSON.stringify(outputData),
      error_msg:   null,
      updated_at:  new Date().toISOString(),
    })
    .eq("id", requestId);
}

// ── Mark request failed ───────────────────────────────────────────────────────
async function markFailed(
  requestId:  string,
  errorMsg:   string,
  retryCount: number,
  maxRetries: number,
) {
  const nextRetry = retryCount + 1;
  const finalFail = nextRetry >= maxRetries;
  await supabase
    .from("service_requests")
    .update({
      status:      finalFail ? "failed" : "pending",
      error_msg:   errorMsg,
      retry_count: nextRetry,
      updated_at:  new Date().toISOString(),
    })
    .eq("id", requestId);
}

// ── Public generators (also usable outside the scheduler) ─────────────────────

/**
 * Generate a cover letter for the given intake data.
 * Returns the AI content string or throws on error.
 */
export async function generateCoverLetter(inputData: Record<string, unknown>): Promise<string> {
  const fakeOrder = buildFakeOrder("Cover Letter Writing", inputData);
  const result    = await processOrderWithAI(fakeOrder);
  if (!result.success || !result.output?.content) {
    throw new Error(result.error ?? "Cover letter generation returned no content");
  }
  return result.output.content;
}

/**
 * Optimise a CV for ATS systems.
 * Returns the AI content string or throws on error.
 */
export async function optimizeCV(inputData: Record<string, unknown>): Promise<string> {
  const fakeOrder = buildFakeOrder("ATS CV Optimization", inputData);
  const result    = await processOrderWithAI(fakeOrder);
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
export async function processService(
  request:    ServiceRequestRow,
  maxRetries: number = 3,
): Promise<void> {
  const { id, service_id, input_data, retry_count } = request;

  // Parse input
  let intake: Record<string, unknown> = {};
  try {
    if (input_data) intake = JSON.parse(input_data);
  } catch {
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
    const result    = await processOrderWithAI(fakeOrder);

    if (!result.success || !result.output?.content) {
      throw new Error(result.error ?? "AI returned no content");
    }

    const content = result.output.content;

    await markCompleted(id, {
      content,
      service:      serviceName,
      qualityCheck: result.qualityCheck ?? null,
      generatedAt:  new Date().toISOString(),
    });

    console.log(`[ServiceProcessor] ✓ Completed request=${id} service="${serviceName}"`);

    // For CV services: stamp improved_cv + extracted ATS score onto cv_uploads
    const isCvService =
      serviceName === "ATS CV Optimization" ||
      serviceName === "Country-Specific CV Rewrite" ||
      serviceName === "ATS + Cover Letter Bundle";

    if (isCvService && request.user_id) {
      const score = extractScore(content);
      updateLatestCvUpload(request.user_id, content, score).catch((e) =>
        console.error("[ServiceProcessor] updateLatestCvUpload failed:", e?.message)
      );
    }
  } catch (err: any) {
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
function buildFakeOrder(serviceName: string, intake: Record<string, unknown>) {
  return {
    id:          0,
    userId:      0,
    status:      "pending",
    serviceName,
    intakeData:  JSON.stringify(intake),
    outputData:  null,
    qualityScore: null,
    qualityPassed: null,
    qualityIssues: null,
    autoApproved:  null,
    reviewNotes:   null,
    createdAt:     new Date(),
    updatedAt:     new Date(),
    deliveredAt:   null,
    completedAt:   null,
  } as any;
}
