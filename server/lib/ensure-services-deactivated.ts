// ─────────────────────────────────────────────────────────────────────────────
// ensure-services-deactivated — one-shot bootstrap that flips is_active=false
// on services we've retired from the storefront.
//
// Why this exists: seedDatabase() typically only INSERTS-IF-MISSING for the
// services table, so bumping isActive: false in the seed does not update rows
// that already exist in production. This runs a direct UPDATE on boot so the
// change actually takes effect for the live DB.
//
// Runs fire-and-forget with a 5s timeout. Failure is logged, non-fatal.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from "../db";

/** Slugs of services that must NEVER show in the public storefront. */
const DEACTIVATED_SLUGS = [
  // 2026-09 (Tony's trust audit — round 1): remove per-CV upsells that
  // competed with the AI CV Builder + felt like we were selling
  // recruiter services rather than delivering them.
  "ats_cv_optimization",
  "cv_rewrite",
  // 2026-09 (Tony's trust audit — round 2): the three Monthly
  // Subscription cards overlapped with core Pro benefits and read as
  // "pay again for help you already paid for". Removed from storefront.
  "whatsapp_support",
  "job_alerts",
  "emergency_support",
];

export async function ensureServicesDeactivated(): Promise<void> {
  try {
    const result = await pool.query(
      `UPDATE services SET is_active = false, updated_at = NOW()
        WHERE slug = ANY($1::text[]) AND is_active = true`,
      [DEACTIVATED_SLUGS],
    );
    if (result.rowCount) {
      console.warn(
        `[ensureServicesDeactivated] Deactivated ${result.rowCount} storefront service(s): ${DEACTIVATED_SLUGS.join(", ")}`,
      );
    } else {
      console.log(`[ensureServicesDeactivated] ✓ ${DEACTIVATED_SLUGS.length} slug(s) already inactive`);
    }
  } catch (err: any) {
    // Non-fatal — services table might not exist yet during first boot on
    // a fresh DB. seedDatabase() below will create it.
    console.warn(`[ensureServicesDeactivated] skipped: ${err?.message}`);
  }
}
