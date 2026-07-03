"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NanjilaFlags = void 0;
exports.dumpNanjilaFlags = dumpNanjilaFlags;
const node_crypto_1 = __importDefault(require("node:crypto"));
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function boolFlag(name, defaultValue = false) {
    const raw = (process.env[name] ?? "").trim().toLowerCase();
    if (raw === "true" || raw === "1" || raw === "yes" || raw === "on")
        return true;
    if (raw === "false" || raw === "0" || raw === "no" || raw === "off")
        return false;
    return defaultValue;
}
function intFlag(name, defaultValue, min = 0, max = 100) {
    const raw = Number((process.env[name] ?? "").trim());
    if (Number.isNaN(raw))
        return defaultValue;
    return Math.max(min, Math.min(max, Math.round(raw)));
}
// ─────────────────────────────────────────────────────────────────────────────
// Flag catalogue
// ─────────────────────────────────────────────────────────────────────────────
//
// Reads are lazy via getters so Render env-var changes take effect on next
// request without a restart.
exports.NanjilaFlags = {
    // ── Phase A foundations ────────────────────────────────────────────────
    get orchestratorEnabled() {
        return boolFlag("NANJILA_ORCHESTRATOR_ENABLED", false);
    },
    /** 0-100: percentage of eligible users to route via orchestrator. */
    get orchestratorRolloutPct() {
        return intFlag("NANJILA_ORCHESTRATOR_ROLLOUT_PCT", 0, 0, 100);
    },
    get memoryEnabled() {
        return boolFlag("NANJILA_MEMORY_ENABLED", false);
    },
    // ── Phase B — intelligence surfacing ───────────────────────────────────
    get jobScoreEnabled() {
        return boolFlag("NANJILA_JOB_SCORE_ENABLED", false);
    },
    get employerIntelEnabled() {
        return boolFlag("NANJILA_EMPLOYER_INTEL_ENABLED", false);
    },
    get timelineEnabled() {
        return boolFlag("NANJILA_TIMELINE_ENABLED", false);
    },
    // ── Phase C — predictive + decisions ───────────────────────────────────
    get predictorsEnabled() {
        return boolFlag("NANJILA_PREDICTORS_ENABLED", false);
    },
    // Per-predictor sub-flags (default off; require both PREDICTORS_ENABLED
    // AND the per-predictor flag).
    get predictorPassportEnabled() {
        return boolFlag("NANJILA_PREDICTOR_PASSPORT_ENABLED", false);
    },
    get predictorNewJobEnabled() {
        return boolFlag("NANJILA_PREDICTOR_NEW_JOB_ENABLED", false);
    },
    get predictorCvScoreEnabled() {
        return boolFlag("NANJILA_PREDICTOR_CV_SCORE_ENABLED", false);
    },
    get predictorEmployerReplyEnabled() {
        return boolFlag("NANJILA_PREDICTOR_EMPLOYER_REPLY_ENABLED", false);
    },
    get predictorSubscriptionExpiryEnabled() {
        return boolFlag("NANJILA_PREDICTOR_SUBSCRIPTION_EXPIRY_ENABLED", false);
    },
    get predictorInterviewEnabled() {
        return boolFlag("NANJILA_PREDICTOR_INTERVIEW_ENABLED", false);
    },
    get predictorAgencyComplaintEnabled() {
        return boolFlag("NANJILA_PREDICTOR_AGENCY_COMPLAINT_ENABLED", false);
    },
    get decisionsEnabled() {
        return boolFlag("NANJILA_DECISIONS_ENABLED", false);
    },
    get trustDashboardEnabled() {
        return boolFlag("NANJILA_TRUST_DASHBOARD_ENABLED", false);
    },
    // ── Phase D — voice + academy ──────────────────────────────────────────
    get voiceEnabled() {
        return boolFlag("NANJILA_VOICE_ENABLED", false);
    },
    get academyEnabled() {
        return boolFlag("NANJILA_ACADEMY_ENABLED", false);
    },
    // ── Cost governance ────────────────────────────────────────────────────
    /** Daily cost cap per user (KES). Enforced by orchestrator. */
    get dailyCostCapKes() {
        return intFlag("NANJILA_DAILY_COST_CAP_KES", 30, 0, 10000);
    },
    /** Daily cost cap per Pro user (KES). */
    get dailyCostCapProKes() {
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
    userInBucket(userId, rolloutPct) {
        if (!userId) {
            // Guest users use a simple % on Math.random when the caller doesn't
            // supply an id. Since guests don't persist across sessions this is
            // acceptable non-determinism.
            return Math.random() * 100 < rolloutPct;
        }
        if (rolloutPct <= 0)
            return false;
        if (rolloutPct >= 100)
            return true;
        const hash = node_crypto_1.default.createHash("sha256").update(String(userId)).digest("hex");
        const bucket = parseInt(hash.slice(0, 8), 16) % 100; // 0..99
        return bucket < rolloutPct;
    },
};
// ─────────────────────────────────────────────────────────────────────────────
// Debug — dump all current flag values (admin dashboard)
// ─────────────────────────────────────────────────────────────────────────────
function dumpNanjilaFlags() {
    return {
        NANJILA_ORCHESTRATOR_ENABLED: exports.NanjilaFlags.orchestratorEnabled,
        NANJILA_ORCHESTRATOR_ROLLOUT_PCT: exports.NanjilaFlags.orchestratorRolloutPct,
        NANJILA_MEMORY_ENABLED: exports.NanjilaFlags.memoryEnabled,
        NANJILA_JOB_SCORE_ENABLED: exports.NanjilaFlags.jobScoreEnabled,
        NANJILA_EMPLOYER_INTEL_ENABLED: exports.NanjilaFlags.employerIntelEnabled,
        NANJILA_TIMELINE_ENABLED: exports.NanjilaFlags.timelineEnabled,
        NANJILA_PREDICTORS_ENABLED: exports.NanjilaFlags.predictorsEnabled,
        NANJILA_PREDICTOR_PASSPORT_ENABLED: exports.NanjilaFlags.predictorPassportEnabled,
        NANJILA_PREDICTOR_NEW_JOB_ENABLED: exports.NanjilaFlags.predictorNewJobEnabled,
        NANJILA_PREDICTOR_CV_SCORE_ENABLED: exports.NanjilaFlags.predictorCvScoreEnabled,
        NANJILA_PREDICTOR_EMPLOYER_REPLY_ENABLED: exports.NanjilaFlags.predictorEmployerReplyEnabled,
        NANJILA_PREDICTOR_SUBSCRIPTION_EXPIRY_ENABLED: exports.NanjilaFlags.predictorSubscriptionExpiryEnabled,
        NANJILA_PREDICTOR_INTERVIEW_ENABLED: exports.NanjilaFlags.predictorInterviewEnabled,
        NANJILA_PREDICTOR_AGENCY_COMPLAINT_ENABLED: exports.NanjilaFlags.predictorAgencyComplaintEnabled,
        NANJILA_DECISIONS_ENABLED: exports.NanjilaFlags.decisionsEnabled,
        NANJILA_TRUST_DASHBOARD_ENABLED: exports.NanjilaFlags.trustDashboardEnabled,
        NANJILA_VOICE_ENABLED: exports.NanjilaFlags.voiceEnabled,
        NANJILA_ACADEMY_ENABLED: exports.NanjilaFlags.academyEnabled,
        NANJILA_DAILY_COST_CAP_KES: exports.NanjilaFlags.dailyCostCapKes,
        NANJILA_DAILY_COST_CAP_PRO_KES: exports.NanjilaFlags.dailyCostCapProKes,
    };
}
