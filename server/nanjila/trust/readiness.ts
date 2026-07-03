/**
 * Nanjila — Trust Dashboard readiness scoring (Feature 9 backend, v0).
 *
 * Computes nine 0-100 readiness scores for a user, plus a composite. Reads
 * ONLY from tables that already exist in production. All scoring functions
 * are pure with respect to the DB snapshot they see at call time.
 *
 * Scoring philosophy:
 *   • Absent data → score 0 with an actionable "next action" pointing at
 *     what would move the score up (e.g. "Upload a CV to unlock CV Strength").
 *   • Available but weak data → moderate score with a concrete recommendation.
 *   • Strong data → high score with a maintenance action ("Refresh your CV
 *     after any major achievement").
 *
 * Materialization strategy:
 *   • Nightly BullMQ job upserts one row per active user into
 *     nanjila_readiness_snapshots.
 *   • Real-time reads hit the latest snapshot; sub-5ms.
 *   • On-demand recompute available via /api/nanjila/trust/refresh.
 *
 * See OS_EVOLUTION_PLAN.md §14 (Feature 9).
 */

import { pool } from "../../db";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface ReadinessScore {
  score:      number;          // 0-100
  factors:    Array<{ label: string; contribution: number; direction: "up" | "down" }>;
  nextAction: string | null;   // A single concrete "do this next"
}

export interface ReadinessReport {
  userId:                     string;
  cvStrength:                 ReadinessScore;
  applicationReadiness:       ReadinessScore;
  scamAwareness:              ReadinessScore;
  documentCompleteness:       ReadinessScore;
  verificationStatus:         ReadinessScore;
  countryReadiness:           ReadinessScore;
  languageReadiness:          ReadinessScore;
  interviewReadiness:         ReadinessScore;
  overallMigrationReadiness:  ReadinessScore;
  computedAt:                 Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// The nine scores
// ─────────────────────────────────────────────────────────────────────────────

async function scoreCvStrength(userId: string): Promise<ReadinessScore> {
  const { rows } = await pool.query<{ score: number | null; delivered_at: Date | null }>(
    `SELECT
       (SELECT delivered_score FROM cv_fingerprints
          WHERE user_id = $1 ORDER BY delivered_at DESC LIMIT 1) AS score,
       (SELECT delivered_at FROM cv_fingerprints
          WHERE user_id = $1 ORDER BY delivered_at DESC LIMIT 1) AS delivered_at`,
    [userId],
  );
  const raw = rows[0]?.score;
  if (raw == null) {
    return {
      score:      0,
      factors:    [{ label: "No CV on file", contribution: 0, direction: "down" }],
      nextAction: "Upload your CV to /tools/ats-cv-checker for a free score.",
    };
  }
  const score = clamp(Number(raw), 0, 100);
  return {
    score,
    factors: [{ label: `ATS score ${score}`, contribution: score, direction: score >= 60 ? "up" : "down" }],
    nextAction: score < 70
      ? "Run CV Fix Lite to raise your ATS score past 70."
      : score < 90
        ? "Consider ATS CV Optimization (KES 499) to hit 90+."
        : "Refresh your CV every 3 months to keep the score fresh.",
  };
}

async function scoreApplicationReadiness(userId: string): Promise<ReadinessScore> {
  const { rows } = await pool.query<{ apps: string; active: string }>(
    `SELECT
       COUNT(*)::text AS apps,
       COUNT(*) FILTER (WHERE status NOT IN ('rejected', 'withdrawn', 'expired'))::text AS active
       FROM user_job_applications
      WHERE user_id = $1`,
    [userId],
  );
  const apps   = Number(rows[0]?.apps ?? 0);
  const active = Number(rows[0]?.active ?? 0);
  if (apps === 0) {
    return {
      score:      10,
      factors:    [{ label: "No applications submitted yet", contribution: 10, direction: "down" }],
      nextAction: "Submit your first application via /tools/visa-sponsorship-jobs.",
    };
  }
  const score = clamp(Math.round(Math.min(active * 15 + 40, 100)), 0, 100);
  return {
    score,
    factors: [
      { label: `${active} active applications`, contribution: Math.min(active * 15, 60), direction: "up" },
      { label: `${apps} total applications submitted`, contribution: 40, direction: "up" },
    ],
    nextAction: active < 3
      ? "Aim for 3 active applications to broaden your chances."
      : "Track responses in /my-applications weekly.",
  };
}

async function scoreScamAwareness(userId: string): Promise<ReadinessScore> {
  // Signals: has run the scam checker / offer checker / visa checker? has
  // read scam alerts? has viewed the /verify-us page?
  const { rows: usageRows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM tool_usage
      WHERE user_id = $1 AND tool_name IN ('job_scam_checker', 'offer_check', 'visa_check')`,
    [userId],
  ).catch(() => ({ rows: [] as { n: string }[] }));
  const usage = Number(usageRows[0]?.n ?? 0);
  const score = clamp(Math.min(usage * 20 + 30, 100), 0, 100);
  return {
    score,
    factors: [
      { label: `Used scam / offer / visa screening ${usage} times`, contribution: Math.min(usage * 20, 60), direction: "up" },
      { label: "Base awareness credit", contribution: 30, direction: "up" },
    ],
    nextAction: usage < 3
      ? "Try the three screening tools once each to boost scam awareness."
      : "Review scam alerts on your dashboard monthly.",
  };
}

async function scoreDocumentCompleteness(userId: string): Promise<ReadinessScore> {
  const { rows } = await pool.query<{
    cv: string | null; passport: string | null; kyc_verified: boolean | null;
  }>(
    `SELECT
       (SELECT delivered_at::text FROM cv_fingerprints
          WHERE user_id = $1 ORDER BY delivered_at DESC LIMIT 1) AS cv,
       (SELECT passport_expiry::text FROM user_career_profiles
          WHERE user_id = $1 LIMIT 1) AS passport,
       (SELECT kyc_verified FROM users WHERE id = $1 LIMIT 1) AS kyc_verified`,
    [userId],
  ).catch(() => ({ rows: [] as any[] }));
  const r = rows[0] ?? {};
  const hasCv     = !!r.cv;
  const hasPass   = !!r.passport;
  const hasKyc    = r.kyc_verified === true;
  const rawScore  = (hasCv ? 40 : 0) + (hasPass ? 40 : 0) + (hasKyc ? 20 : 0);
  return {
    score:   clamp(rawScore, 0, 100),
    factors: [
      { label: "CV on file",       contribution: hasCv ? 40 : 0, direction: hasCv ? "up" : "down" },
      { label: "Passport recorded", contribution: hasPass ? 40 : 0, direction: hasPass ? "up" : "down" },
      { label: "KYC verified",      contribution: hasKyc ? 20 : 0, direction: hasKyc ? "up" : "down" },
    ],
    nextAction: !hasCv
      ? "Upload a CV to move this score up 40 points."
      : !hasPass
        ? "Add your passport expiry to your profile."
        : !hasKyc
          ? "Complete KYC on /account/verify."
          : "Set a calendar reminder to re-verify these details annually.",
  };
}

async function scoreVerificationStatus(userId: string): Promise<ReadinessScore> {
  const { rows } = await pool.query<{ email: boolean | null; phone: boolean | null }>(
    `SELECT email_verified AS email, phone_verified AS phone
       FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  ).catch(() => ({ rows: [] as any[] }));
  const r = rows[0] ?? {};
  const emailOk = r.email === true;
  const phoneOk = r.phone === true;
  const score = (emailOk ? 50 : 0) + (phoneOk ? 50 : 0);
  return {
    score,
    factors: [
      { label: "Email verified", contribution: emailOk ? 50 : 0, direction: emailOk ? "up" : "down" },
      { label: "Phone verified", contribution: phoneOk ? 50 : 0, direction: phoneOk ? "up" : "down" },
    ],
    nextAction: !emailOk ? "Verify your email on /account/verify."
              : !phoneOk ? "Verify your phone on /account/verify."
              : "Verified — no action needed.",
  };
}

async function scoreCountryReadiness(userId: string): Promise<ReadinessScore> {
  const { rows } = await pool.query<{ progress: number | null; country: string | null }>(
    `SELECT progress_pct AS progress, country_code AS country
       FROM user_country_journeys
      WHERE user_id = $1
      ORDER BY progress_pct DESC NULLS LAST
      LIMIT 1`,
    [userId],
  ).catch(() => ({ rows: [] as any[] }));
  const r = rows[0];
  if (!r || r.progress == null) {
    return {
      score:      15,
      factors:    [{ label: "No country journey started", contribution: 15, direction: "down" }],
      nextAction: "Pick a target country on /country and start your journey.",
    };
  }
  const score = clamp(Number(r.progress), 0, 100);
  return {
    score,
    factors: [
      { label: `${r.country ?? "Target country"} journey at ${score}%`, contribution: score, direction: "up" },
    ],
    nextAction: score < 40
      ? `Advance the ${r.country ?? "your country"} journey — visit /country/${r.country?.toLowerCase() ?? ""}.`
      : score < 80
        ? "Focus on document collection for the next stage."
        : "Almost there — finalize interviews and visa paperwork.",
  };
}

async function scoreLanguageReadiness(userId: string): Promise<ReadinessScore> {
  const { rows } = await pool.query<{ level: string | null }>(
    `SELECT english_level AS level
       FROM user_career_profiles
      WHERE user_id = $1 LIMIT 1`,
    [userId],
  ).catch(() => ({ rows: [] as any[] }));
  const level = rows[0]?.level ?? null;
  const bandMap: Record<string, number> = {
    "beginner": 20, "elementary": 30, "intermediate": 55, "upper_intermediate": 75,
    "advanced": 90, "fluent": 95, "native": 100,
  };
  if (!level) {
    return {
      score:      0,
      factors:    [{ label: "English level not on file", contribution: 0, direction: "down" }],
      nextAction: "Set your English level on your career profile.",
    };
  }
  const score = bandMap[level.toLowerCase()] ?? 40;
  return {
    score,
    factors: [{ label: `English: ${level}`, contribution: score, direction: score >= 60 ? "up" : "down" }],
    nextAction: score < 55
      ? "Consider an IELTS prep course before applying to English-speaking countries."
      : score < 80
        ? "Push to advanced with a proficiency test."
        : "You're set for English-speaking destinations.",
  };
}

async function scoreInterviewReadiness(userId: string): Promise<ReadinessScore> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM interview_sessions
      WHERE user_id = $1`,
    [userId],
  ).catch(() => ({ rows: [] as any[] }));
  const sessions = Number(rows[0]?.n ?? 0);
  if (sessions === 0) {
    return {
      score:      20,
      factors:    [{ label: "No interview practice sessions", contribution: 20, direction: "down" }],
      nextAction: "Run one Interview Practice session at /tools/interview-practice.",
    };
  }
  const score = clamp(Math.min(sessions * 30 + 20, 100), 0, 100);
  return {
    score,
    factors: [
      { label: `${sessions} practice sessions completed`, contribution: Math.min(sessions * 30, 80), direction: "up" },
    ],
    nextAction: sessions < 3
      ? "Run 2 more Interview Practice sessions to strengthen your baseline."
      : "Book a live Interview Coaching session for personalized feedback.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite + assembly
// ─────────────────────────────────────────────────────────────────────────────

const OVERALL_WEIGHTS = {
  cv:            0.20,
  application:   0.15,
  scam:          0.10,
  documents:     0.15,
  verification:  0.10,
  country:       0.10,
  language:      0.10,
  interview:     0.10,
};

/**
 * Compute the full readiness report for a user. Runs all 8 subscores in
 * parallel, then derives the overall composite.
 */
export async function computeReadinessReport(userId: string): Promise<ReadinessReport> {
  const [cv, application, scam, documents, verification, country, language, interview] =
    await Promise.all([
      scoreCvStrength(userId),
      scoreApplicationReadiness(userId),
      scoreScamAwareness(userId),
      scoreDocumentCompleteness(userId),
      scoreVerificationStatus(userId),
      scoreCountryReadiness(userId),
      scoreLanguageReadiness(userId),
      scoreInterviewReadiness(userId),
    ]);

  const overallRaw =
    cv.score           * OVERALL_WEIGHTS.cv +
    application.score  * OVERALL_WEIGHTS.application +
    scam.score         * OVERALL_WEIGHTS.scam +
    documents.score    * OVERALL_WEIGHTS.documents +
    verification.score * OVERALL_WEIGHTS.verification +
    country.score      * OVERALL_WEIGHTS.country +
    language.score     * OVERALL_WEIGHTS.language +
    interview.score    * OVERALL_WEIGHTS.interview;

  const overall: ReadinessScore = {
    score: clamp(Math.round(overallRaw), 0, 100),
    factors: [
      { label: "CV Strength",          contribution: Math.round(cv.score           * OVERALL_WEIGHTS.cv),           direction: "up" },
      { label: "Application activity", contribution: Math.round(application.score  * OVERALL_WEIGHTS.application),  direction: "up" },
      { label: "Scam awareness",       contribution: Math.round(scam.score         * OVERALL_WEIGHTS.scam),         direction: "up" },
      { label: "Documents",            contribution: Math.round(documents.score    * OVERALL_WEIGHTS.documents),    direction: "up" },
      { label: "Verification",         contribution: Math.round(verification.score * OVERALL_WEIGHTS.verification), direction: "up" },
      { label: "Country journey",      contribution: Math.round(country.score      * OVERALL_WEIGHTS.country),      direction: "up" },
      { label: "Language",             contribution: Math.round(language.score     * OVERALL_WEIGHTS.language),     direction: "up" },
      { label: "Interview practice",   contribution: Math.round(interview.score    * OVERALL_WEIGHTS.interview),    direction: "up" },
    ],
    nextAction: pickTopNextAction([cv, application, scam, documents, verification, country, language, interview]),
  };

  return {
    userId,
    cvStrength:                cv,
    applicationReadiness:      application,
    scamAwareness:             scam,
    documentCompleteness:      documents,
    verificationStatus:        verification,
    countryReadiness:          country,
    languageReadiness:         language,
    interviewReadiness:        interview,
    overallMigrationReadiness: overall,
    computedAt:                new Date(),
  };
}

/**
 * Persist a computed report into nanjila_readiness_snapshots (upsert on
 * (user_id, snapshot_date)). Called by the nightly BullMQ job.
 */
export async function persistReadinessSnapshot(report: ReadinessReport): Promise<void> {
  await pool.query(
    `INSERT INTO nanjila_readiness_snapshots
       (user_id, snapshot_date,
        cv_strength, application_readiness, scam_awareness, document_completeness,
        verification_status, country_readiness, language_readiness, interview_readiness,
        overall_migration_readiness, factors, next_actions)
     VALUES ($1, CURRENT_DATE,
             $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
     ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
       cv_strength               = EXCLUDED.cv_strength,
       application_readiness     = EXCLUDED.application_readiness,
       scam_awareness            = EXCLUDED.scam_awareness,
       document_completeness     = EXCLUDED.document_completeness,
       verification_status       = EXCLUDED.verification_status,
       country_readiness         = EXCLUDED.country_readiness,
       language_readiness        = EXCLUDED.language_readiness,
       interview_readiness       = EXCLUDED.interview_readiness,
       overall_migration_readiness = EXCLUDED.overall_migration_readiness,
       factors                   = EXCLUDED.factors,
       next_actions              = EXCLUDED.next_actions,
       computed_at               = NOW()`,
    [
      report.userId,
      report.cvStrength.score,
      report.applicationReadiness.score,
      report.scamAwareness.score,
      report.documentCompleteness.score,
      report.verificationStatus.score,
      report.countryReadiness.score,
      report.languageReadiness.score,
      report.interviewReadiness.score,
      report.overallMigrationReadiness.score,
      JSON.stringify(collectFactors(report)),
      JSON.stringify(collectNextActions(report)),
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function pickTopNextAction(scores: ReadinessScore[]): string {
  const withActions = scores.filter((s) => s.nextAction).sort((a, b) => a.score - b.score);
  return withActions[0]?.nextAction ?? "Everything looks good — keep going.";
}

function collectFactors(report: ReadinessReport): Record<string, any> {
  return {
    cv:            report.cvStrength.factors,
    application:   report.applicationReadiness.factors,
    scam:          report.scamAwareness.factors,
    documents:     report.documentCompleteness.factors,
    verification:  report.verificationStatus.factors,
    country:       report.countryReadiness.factors,
    language:      report.languageReadiness.factors,
    interview:     report.interviewReadiness.factors,
  };
}

function collectNextActions(report: ReadinessReport): string[] {
  return [
    report.cvStrength.nextAction,
    report.applicationReadiness.nextAction,
    report.scamAwareness.nextAction,
    report.documentCompleteness.nextAction,
    report.verificationStatus.nextAction,
    report.countryReadiness.nextAction,
    report.languageReadiness.nextAction,
    report.interviewReadiness.nextAction,
  ].filter((s): s is string => !!s);
}
