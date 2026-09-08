// ─────────────────────────────────────────────────────────────────────────────
// trial-gate.ts
//
// The KES 99 / 24-hour trial is a ONCE-PER-USER offer. This module is the
// single source of truth for that rule.
//
// The primary enforcement point lives inside /api/subscriptions/upgrade in
// server/routes.ts (the SELECT EXISTS(...) check ~line 2801). This module
// adds three defence-in-depth layers on top:
//
//   1. bootstrapTrialGuards() — installs Postgres UNIQUE PARTIAL indexes on
//      the payments table so that even if two identical /upgrade requests
//      race past the SELECT check simultaneously, only one row can actually
//      commit as a successful trial. The second commit raises a
//      unique_violation which the caller re-maps to TRIAL_ALREADY_USED.
//
//   2. isTrialConsumed({ userId, phone }) — the same query the /upgrade
//      handler uses, exported so any other endpoint (services flow, an
//      admin tool, a future promo endpoint) can ask the exact same question
//      and get the exact same answer.
//
//   3. GET /api/subscriptions/trial-eligibility (registered by
//      registerTrialEligibilityRoute below) — public read used by the
//      pricing page and the upgrade modal to hide the KES 99 card up-front
//      instead of surfacing it and then rejecting a payment attempt with a
//      403. Uses the authenticated user's id when available; falls back to
//      a phone lookup for guest-checkout flows.
//
// 2026-09 (Tony's KES-99-abuse follow-up).
// ─────────────────────────────────────────────────────────────────────────────

import type { Express } from "express";
import { pool } from "../db";

// ── 1. DB indexes (idempotent, run at boot) ──────────────────────────────────
//
// Both indexes are PARTIAL — they only cover successful trial rows, so
// legitimate repeats of monthly/yearly plans and failed trial attempts
// are unaffected. Two indexes (per user_id, per phone) so the guard
// mirrors the SELECT EXISTS check inside /upgrade exactly.

export async function bootstrapTrialGuards(): Promise<void> {
  const started = Date.now();
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_trial_success_per_user
      ON payments (user_id)
      WHERE status IN ('success', 'completed')
        AND (plan_id IN ('trial', 'basic')
             OR service_id IN ('plan_trial', 'plan_basic'))
        AND user_id IS NOT NULL;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_trial_success_per_phone
      ON payments (phone)
      WHERE status IN ('success', 'completed')
        AND (plan_id IN ('trial', 'basic')
             OR service_id IN ('plan_trial', 'plan_basic'))
        AND phone IS NOT NULL;
    `);
    console.log(`[trial-gate] indexes ensured in ${Date.now() - started}ms`);
  } catch (err: any) {
    // Non-fatal. The application-level SELECT-EXISTS gate still fires; the
    // indexes are the belt-and-braces layer.
    console.error("[trial-gate] index creation failed (non-fatal):", err?.message);
  }
}

// ── 2. Reusable eligibility query ────────────────────────────────────────────

export interface TrialCheckInput {
  userId?: string | null;
  phone?: string | null;
}

export async function isTrialConsumed(input: TrialCheckInput): Promise<boolean> {
  const userId = input.userId?.trim() || null;
  const phone  = input.phone?.trim()  || null;
  if (!userId && !phone) return false;

  const { rows } = await pool.query<{ consumed: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM payments
       WHERE ($1::text IS NOT NULL AND user_id = $1
              OR $2::text IS NOT NULL AND phone = $2)
         AND status IN ('success', 'completed')
         AND (plan_id IN ('trial', 'basic')
              OR service_id IN ('plan_trial', 'plan_basic'))
     ) AS consumed`,
    [userId, phone],
  );
  return Boolean(rows[0]?.consumed);
}

// ── 3. HTTP endpoint the frontend hits to know whether to render the card ────

export function registerTrialEligibilityRoute(app: Express): void {
  app.get("/api/subscriptions/trial-eligibility", async (req: any, res) => {
    try {
      const userId: string | undefined =
        req.user?.claims?.sub ?? req.user?.id ?? undefined;
      // Phone hint: authenticated user's stored phone, or explicit ?phone=
      // query param for guest pricing-page renders. Never trusted for
      // ACTIVATION — the /upgrade endpoint re-checks. Only used to hide
      // the card so a returning user doesn't see stale KES 99 options.
      const phoneHint = String(req.query?.phone ?? "").trim() || undefined;

      const consumed = await isTrialConsumed({
        userId: userId ?? null,
        phone:  phoneHint ?? null,
      });
      res.json({
        eligible: !consumed,
        // Include a stable code so the client can key its copy off it.
        code:     consumed ? "TRIAL_ALREADY_USED" : "TRIAL_ELIGIBLE",
      });
    } catch (err: any) {
      console.error("[trial-gate] eligibility check failed:", err?.message);
      // Fail OPEN for UI purposes — the /upgrade endpoint is the real
      // gate. The worst case here is the card renders and the payment
      // gets rejected server-side with a friendly TRIAL_ALREADY_USED.
      res.json({ eligible: true, code: "TRIAL_ELIGIBLE_FALLBACK" });
    }
  });
  console.log("[trial-gate] ✓ GET /api/subscriptions/trial-eligibility registered");
}
