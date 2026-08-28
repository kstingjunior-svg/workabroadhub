/**
 * AutoApply Agent — the core orchestrator.
 *
 * 2026-08 (Tony's revenue play #1): every night for each active agent we:
 *   1. Query configured job sources (Adzuna V1; verified portals + NHS Jobs V2)
 *   2. Score each result against the user's CV
 *   3. Draft a tailored cover letter for the top N matches
 *   4. Persist the matches (deduped by external_id)
 *   5. Send a morning digest email to the user
 *
 * Data-source strategy: V1 uses the Adzuna Search API (free tier — 250
 * calls/day, covers UK/Canada/USA/Germany/AU/UAE). V2 will add direct
 * pulls from NHS Jobs (RSS), IRCC Job Bank, and our own verified_portals
 * scrapers. The `runScanForAgent()` function is source-agnostic — plug
 * new adapters into `SOURCE_ADAPTERS` below and they'll be scanned too.
 */

import { pool } from "../../db";
import { scoreJobAgainstCv } from "./matcher";
import { fetchAdzunaJobs, type NormalisedJob } from "./sources/adzuna";
import { draftCoverLetter } from "./cover-letter";
import { sendDailyDigest } from "./report";
import { getAutoApplyLimits, type AutoApplyPlanLimits } from "./plan-limits";

// ─── Public API ───────────────────────────────────────────────────────────

export interface AgentRow {
  id:                       string;
  user_id:                  string;
  target_countries:         string[];
  target_roles:             string[];
  target_industries:        string[] | null;
  min_salary_kes:           number | null;
  visa_sponsorship_required: boolean;
  remote_ok:                boolean;
  experience_years:         number | null;
  cv_text:                  string;
  is_active:                boolean;
  max_matches_per_day:      number;
  daily_report_time:        string;
  last_scan_at:             Date | null;
}

export interface ScanSummary {
  agentId:              string;
  runId:                string;
  status:               "ok" | "error";
  jobsScanned:          number;
  matchesFound:         number;
  matchesStored:        number;
  coverLettersGenerated: number;
  reportSent:           boolean;
  errorMessage?:        string;
}

/**
 * Run a full scan → match → draft → report cycle for one agent.
 * Called by the scheduler once per agent per day, and manually via the
 * admin "Run scan now" button.
 */
export async function runScanForAgent(agent: AgentRow): Promise<ScanSummary> {
  const runId = await openScanRun(agent.id);
  let scanned = 0;
  let stored = 0;
  let drafted = 0;

  // 2026-08 (Phase 2 revenue): resolve the user's plan-based limits so
  // free users get a taste (3 matches, no AI letters) and paid users
  // get the full experience. Runs INSIDE the scan (not at API layer)
  // so limits apply equally to on-demand + scheduled scans.
  const limits = await resolveLimitsForUser(agent.user_id);

  try {
    // 1. Fetch jobs from all configured sources
    const jobs: NormalisedJob[] = [];
    for (const country of agent.target_countries) {
      for (const role of agent.target_roles.slice(0, 3)) {  // cap roles per scan
        try {
          const chunk = await fetchAdzunaJobs({
            country,
            what: role,
            resultsPerPage: 20,
          });
          jobs.push(...chunk);
        } catch (err: any) {
          console.warn(`[autoapply] adzuna fetch failed country=${country} role=${role}:`, err?.message);
        }
      }
    }
    scanned = jobs.length;

    // 2. Score every fetched job against the user's CV
    // 2026-08 Phase 2: use the SMALLER of (user's chosen daily cap, their
    // plan's max). Free users are hard-capped at 3 matches/day even if
    // they entered a bigger number in their config.
    const effectiveCap = Math.min(
      agent.max_matches_per_day,
      limits.maxMatchesPerDay,
    );

    const scored = jobs
      .map((job) => {
        const { score, reasons } = scoreJobAgainstCv({
          jobTitle:       job.title,
          jobDescription: job.description ?? "",
          jobLocation:    job.city ?? job.country ?? "",
          cvText:         agent.cv_text,
          targetRoles:    agent.target_roles,
          experienceYrs:  agent.experience_years ?? undefined,
        });
        return { job, score, reasons };
      })
      .filter((m) => m.score >= 40)   // discard weak matches
      .sort((a, b) => b.score - a.score)
      .slice(0, effectiveCap);

    // 3. Persist matches (ON CONFLICT dedupes previously-seen jobs)
    for (const { job, score, reasons } of scored) {
      const inserted = await insertMatch({
        agentId:      agent.id,
        userId:       agent.user_id,
        source:       job.source,
        externalId:   job.externalId,
        jobTitle:     job.title,
        employer:     job.employer,
        country:      job.country,
        city:         job.city,
        salaryDisplay: job.salaryDisplay,
        salaryKesMonthly: job.salaryKesMonthly,
        postedAt:     job.postedAt,
        applyUrl:     job.applyUrl,
        description:  (job.description ?? "").slice(0, 8000),
        matchScore:   score,
        matchReasons: reasons,
      });
      if (inserted) {
        stored++;
        // 4. Draft a cover letter for the top N new matches ONLY if the
        //    user's plan permits AI letters (Phase 2 gate). Free users
        //    see the match + apply URL but no letter — upgrade prompt
        //    in the UI encourages them to Pro for the drafting service.
        if (drafted < limits.maxCoverLettersPerDay) {
          try {
            const letter = await draftCoverLetter({
              jobTitle:    job.title,
              employer:    job.employer ?? "the hiring team",
              country:     job.country ?? "the target country",
              jobDescription: (job.description ?? "").slice(0, 2000),
              cvText:      agent.cv_text.slice(0, 3000),
            });
            await attachCoverLetter(inserted, letter);
            drafted++;
          } catch (err: any) {
            console.warn(`[autoapply] cover-letter draft failed match=${inserted}:`, err?.message);
          }
        }
      }
    }

    // 5. Send the morning digest — Pro-only (Phase 2 gate). Free users
    //    see matches in the /autoapply inbox but don't get the daily
    //    email. That daily-email habit is one of the biggest reasons
    //    users upgrade — losing it hurts.
    let reportSent = false;
    if (limits.dailyDigestEmail) {
      try {
        const matches = await loadRecentMatches(agent.id, 24);
        if (matches.length > 0) {
          await sendDailyDigest({ agent, matches });
          reportSent = true;
        }
      } catch (err: any) {
        console.warn(`[autoapply] digest send failed agent=${agent.id}:`, err?.message);
      }
    }

    await closeScanRun(runId, {
      status:                 "ok",
      jobsScanned:            scanned,
      matchesFound:           scored.length,
      matchesStored:          stored,
      coverLettersGenerated:  drafted,
      reportSent,
    });

    // 6. Update agent stats + schedule next scan
    await pool.query(
      `UPDATE autoapply_agents
          SET last_scan_at = NOW(),
              next_scan_at = NOW() + INTERVAL '24 hours',
              total_matches_lifetime = total_matches_lifetime + $1,
              updated_at = NOW()
        WHERE id = $2`,
      [stored, agent.id],
    );

    return {
      agentId:              agent.id,
      runId,
      status:               "ok",
      jobsScanned:          scanned,
      matchesFound:         scored.length,
      matchesStored:        stored,
      coverLettersGenerated: drafted,
      reportSent,
    };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error(`[autoapply] scan failed agent=${agent.id}:`, msg);
    await closeScanRun(runId, { status: "error", errorMessage: msg });
    return {
      agentId:              agent.id,
      runId,
      status:               "error",
      jobsScanned:          scanned,
      matchesFound:         0,
      matchesStored:        stored,
      coverLettersGenerated: drafted,
      reportSent:           false,
      errorMessage:         msg,
    };
  }
}

/**
 * Fetch every active agent that's due for a scan and run them serially.
 * Called by the scheduler on its tick; safe to call multiple times per day
 * (agents that already scanned in the last 20h are skipped).
 */
export async function runDueScans(): Promise<{ scanned: number; errors: number }> {
  const { rows } = await pool.query<AgentRow>(
    `SELECT * FROM autoapply_agents
      WHERE is_active = true
        AND (last_scan_at IS NULL OR last_scan_at < NOW() - INTERVAL '20 hours')
      ORDER BY last_scan_at ASC NULLS FIRST
      LIMIT 50`,
  );
  let ok = 0, err = 0;
  for (const agent of rows) {
    const result = await runScanForAgent(agent);
    if (result.status === "ok") ok++;
    else err++;
    // Small pause between agents to avoid rate-limiting Adzuna
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { scanned: ok, errors: err };
}

// ─── DB helpers ───────────────────────────────────────────────────────────

interface InsertMatchArgs {
  agentId:          string;
  userId:           string;
  source:           string;
  externalId:       string;
  jobTitle:         string;
  employer:         string | null;
  country:          string | null;
  city:             string | null;
  salaryDisplay:    string | null;
  salaryKesMonthly: number | null;
  postedAt:         Date | null;
  applyUrl:         string;
  description:      string;
  matchScore:       number;
  matchReasons:     string[];
}

async function insertMatch(m: InsertMatchArgs): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO autoapply_matches
       (agent_id, user_id, source, external_id, job_title, employer,
        country, city, salary_display, salary_kes_monthly, posted_at,
        apply_url, description, match_score, match_reasons)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (agent_id, source, external_id) DO NOTHING
     RETURNING id`,
    [
      m.agentId, m.userId, m.source, m.externalId, m.jobTitle, m.employer,
      m.country, m.city, m.salaryDisplay, m.salaryKesMonthly, m.postedAt,
      m.applyUrl, m.description, m.matchScore, m.matchReasons,
    ],
  );
  return rows[0]?.id ?? null;
}

async function attachCoverLetter(matchId: string, letter: string): Promise<void> {
  await pool.query(
    `UPDATE autoapply_matches
        SET cover_letter    = $2,
            cover_letter_at = NOW()
      WHERE id = $1`,
    [matchId, letter],
  );
}

async function loadRecentMatches(agentId: string, hours: number) {
  const { rows } = await pool.query(
    `SELECT * FROM autoapply_matches
      WHERE agent_id = $1
        AND created_at > NOW() - ($2::text || ' hours')::interval
      ORDER BY match_score DESC
      LIMIT 20`,
    [agentId, String(hours)],
  );
  return rows;
}

async function openScanRun(agentId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO autoapply_scan_runs (agent_id, status)
     VALUES ($1, 'running')
     RETURNING id`,
    [agentId],
  );
  return rows[0].id;
}

async function closeScanRun(
  id: string,
  patch: Partial<{
    status:                "ok" | "error";
    jobsScanned:           number;
    matchesFound:          number;
    matchesStored:         number;
    coverLettersGenerated: number;
    reportSent:            boolean;
    errorMessage:          string;
  }>,
): Promise<void> {
  await pool.query(
    `UPDATE autoapply_scan_runs
        SET finished_at    = NOW(),
            status         = COALESCE($2, status),
            jobs_scanned   = COALESCE($3, jobs_scanned),
            matches_found  = COALESCE($4, matches_found),
            matches_stored = COALESCE($5, matches_stored),
            cover_letters_generated = COALESCE($6, cover_letters_generated),
            report_sent    = COALESCE($7, report_sent),
            error_message  = COALESCE($8, error_message)
      WHERE id = $1`,
    [
      id,
      patch.status ?? null,
      patch.jobsScanned ?? null,
      patch.matchesFound ?? null,
      patch.matchesStored ?? null,
      patch.coverLettersGenerated ?? null,
      patch.reportSent ?? null,
      patch.errorMessage ?? null,
    ],
  );
}

// ─── Plan resolution ─────────────────────────────────────────────────
// Cheap fetch — we skip /api/auth/user's heavier caching path since
// scans happen in the background where a few extra ms are irrelevant.
// Admins are treated as Pro (matches the rest of the platform's admin
// bypass pattern).
async function resolveLimitsForUser(userId: string): Promise<AutoApplyPlanLimits> {
  try {
    const { rows } = await pool.query<{ plan: string | null; is_admin: boolean | null; role: string | null }>(
      `SELECT plan, is_admin, role FROM users WHERE id = $1`,
      [userId],
    );
    const u = rows[0];
    if (!u) return getAutoApplyLimits("free");
    if (u.is_admin || u.role === "ADMIN" || u.role === "SUPER_ADMIN") {
      return getAutoApplyLimits("pro");
    }
    return getAutoApplyLimits(u.plan);
  } catch {
    return getAutoApplyLimits("free");
  }
}
