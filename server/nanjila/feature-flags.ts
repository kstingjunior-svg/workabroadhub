/**
 * Nanjila — feature flags.
 *
 * Typed accessors for every Phase A-D feature flag. All flags DEFAULT OFF —
 * shipping a flag doesn't mean users see the feature. Enabling requires
 * setting the env var to "true" (or "1") on Render.
 *
 * See docs/nanjila/OS_EVOLUTION_PLAN.md §17.1 for the flag catalogue.
 *
 * Usage:
 *
 *   import { NanjilaFlags } from "./nanjila/feature-flags";
 *
 *   if (NanjilaFlags.orchestratorEnabled) {
 *     // Route through the orchestrator
 *   } else {
 *     // Fall back to legacy router.ts
 *   }
 *
 * Two per-user flag options for A/B rollout:
 *
 *   NanjilaFlags.orchestratorRolloutPct  // 0..100 - percentage of users routed
 *   NanjilaFlags.userInBucket(userId, rolloutPct)  // deterministic hash-based bucket
 *
 * This module has ZERO runtime dependencies beyond node's crypto module.
 * Import order and startup ordering are irrelevant.
 */

import crypto from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function boolFlag(name: string, defaultValue = false): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  return defaultValue;
}

function intFlag(name: string, defaultValue: number, min = 0, max = 100): number {
  const raw = Number((process.env[name] ?? "").trim());
  if (Number.isNaN(raw)) return defaultValue;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Flag catalogue
// ─────────────────────────────────────────────────────────────────────────────
//
// Reads are lazy via getters so Render env-var changes take effect on next
// request without a restart.
export const NanjilaFlags = {
  // ── Phase A foundations ────────────────────────────────────────────────
  get orchestratorEnabled(): boolean {
    return boolFlag("NANJILA_ORCHESTRATOR_ENABLED", false);
  },
  /** 0-100: percentage of eligible users to route via orchestrator. */
  get orchestratorRolloutPct(): number {
    return intFlag("NANJILA_ORCHESTRATOR_ROLLOUT_PCT", 0, 0, 100);
  },
  get memoryEnabled(): boolean {
    return boolFlag("NANJILA_MEMORY_ENABLED", false);
  },

  // ── Phase B — intelligence surfacing ───────────────────────────────────
  get jobScoreEnabled(): boolean {
    return boolFlag("NANJILA_JOB_SCORE_ENABLED", false);
  },
  get employerIntelEnabled(): boolean {
    return boolFlag("NANJILA_EMPLOYER_INTEL_ENABLED", false);
  },
  get timelineEnabled(): boolean {
    return boolFlag("NANJILA_TIMELINE_ENABLED", false);
  },

  // ── Phase C — predictive + decisions ───────────────────────────────────
  get predictorsEnabled(): boolean {
    return boolFlag("NANJILA_PREDICTORS_ENABLED", false);
  },
  // Per-predictor sub-flags (default off; require both PREDICTORS_ENABLED
  // AND the per-predictor flag).
  get predictorPassportEnabled(): boolean {
    return boolFlag("NANJILA_PREDICTOR_PASSPORT_ENABLED", false);
  },
  get predictorNewJobEnabled(): boolean {
    return boolFlag("NANJILA_PREDICTOR_NEW_JOB_ENABLED", false);
  },
  get predictorCvScoreEnabled(): boolean {
    return boolFlag("NANJILA_PREDICTOR_CV_SCORE_ENABLED", false);
  },
  get predictorEmployerReplyEnabled(): boolean {
    return boolFlag("NANJILA_PREDICTOR_EMPLOYER_REPLY_ENABLED", false);
  },
  get predictorSubscriptionExpiryEnabled(): boolean {
    return boolFlag("NANJILA_PREDICTOR_SUBSCRIPTION_EXPIRY_ENABLED", false);
  },
  get predictorInterviewEnabled(): boolean {
    return boolFlag("NANJILA_PREDICTOR_INTERVIEW_ENABLED", false);
  },
  get predictorAgencyComplaintEnabled(): boolean {
    return boolFlag("NANJILA_PREDICTOR_AGENCY_COMPLAINT_ENABLED", false);
  },
  get decisionsEnabled(): boolean {
    return boolFlag("NANJILA_DECISIONS_ENABLED", false);
  },
  get trustDashboardEnabled(): boolean {
    return boolFlag("NANJILA_TRUST_DASHBOARD_ENABLED", false);
  },

  // ── Phase D — voice + academy ──────────────────────────────────────────
  get voiceEnabled(): boolean {
    return boolFlag("NANJILA_VOICE_ENABLED", false);
  },
  get academyEnabled(): boolean {
    return boolFlag("NANJILA_ACADEMY_ENABLED", false);
  },

  // ── Cost governance ────────────────────────────────────────────────────
  /** Daily cost cap per user (KES). Enforced by orchestrator. */
  get dailyCostCapKes(): number {
    return intFlag("NANJILA_DAILY_COST_CAP_KES", 30, 0, 10000);
  },
  /** Daily cost cap per Pro user (KES). */
  get dailyCostCapProKes(): number {
    return intFlag("NANJILA_DAILY_COST_CAP_PRO_KES", 300, 0, 100000);
  },

  // ── Percentage rollout helper ──────────────────────────────────────────
  /**
   * Deterministic per-user bucketing for percentage rollouts.
   * Returns true if the user is inside the given rollout percentage.
   *
   * Uses a stable sha-256 hash of userId — same user always maps to the
   * same bucket, so rollout percentage changes only affect the marginal
   * users at the boundary.
   */
  userInBucket(userId: string | null | undefined, rolloutPct: number): boolean {
    if (!userId) {
      // Guest users use a simple % on Math.random when the caller doesn't
      // supply an id. Since guests don't persist across sessions this is
      // acceptable non-determinism.
      return Math.random() * 100 < rolloutPct;
    }
    if (rolloutPct <= 0)   return false;
    if (rolloutPct >= 100) return true;
    const hash = crypto.createHash("sha256").update(String(userId)).digest("hex");
    const bucket = parseInt(hash.slice(0, 8), 16) % 100; // 0..99
    return bucket < rolloutPct;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Debug — dump all current flag values (admin dashboard)
// ─────────────────────────────────────────────────────────────────────────────

export function dumpNanjilaFlags(): Record<string, boolean | number> {
  return {
    NANJILA_ORCHESTRATOR_ENABLED:              NanjilaFlags.orchestratorEnabled,
    NANJILA_ORCHESTRATOR_ROLLOUT_PCT:          NanjilaFlags.orchestratorRolloutPct,
    NANJILA_MEMORY_ENABLED:                    NanjilaFlags.memoryEnabled,
    NANJILA_JOB_SCORE_ENABLED:                 NanjilaFlags.jobScoreEnabled,
    NANJILA_EMPLOYER_INTEL_ENABLED:            NanjilaFlags.employerIntelEnabled,
    NANJILA_TIMELINE_ENABLED:                  NanjilaFlags.timelineEnabled,
    NANJILA_PREDICTORS_ENABLED:                NanjilaFlags.predictorsEnabled,
    NANJILA_PREDICTOR_PASSPORT_ENABLED:        NanjilaFlags.predictorPassportEnabled,
    NANJILA_PREDICTOR_NEW_JOB_ENABLED:         NanjilaFlags.predictorNewJobEnabled,
    NANJILA_PREDICTOR_CV_SCORE_ENABLED:        NanjilaFlags.predictorCvScoreEnabled,
    NANJILA_PREDICTOR_EMPLOYER_REPLY_ENABLED:  NanjilaFlags.predictorEmployerReplyEnabled,
    NANJILA_PREDICTOR_SUBSCRIPTION_EXPIRY_ENABLED: NanjilaFlags.predictorSubscriptionExpiryEnabled,
    NANJILA_PREDICTOR_INTERVIEW_ENABLED:       NanjilaFlags.predictorInterviewEnabled,
    NANJILA_PREDICTOR_AGENCY_COMPLAINT_ENABLED: NanjilaFlags.predictorAgencyComplaintEnabled,
    NANJILA_DECISIONS_ENABLED:                 NanjilaFlags.decisionsEnabled,
    NANJILA_TRUST_DASHBOARD_ENABLED:           NanjilaFlags.trustDashboardEnabled,
    NANJILA_VOICE_ENABLED:                     NanjilaFlags.voiceEnabled,
    NANJILA_ACADEMY_ENABLED:                   NanjilaFlags.academyEnabled,
    NANJILA_DAILY_COST_CAP_KES:                NanjilaFlags.dailyCostCapKes,
    NANJILA_DAILY_COST_CAP_PRO_KES:            NanjilaFlags.dailyCostCapProKes,
  };
}
