"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScanForAgent = runScanForAgent;
exports.runDueScans = runDueScans;
const db_1 = require("../../db");
const matcher_1 = require("./matcher");
const adzuna_1 = require("./sources/adzuna");
const cover_letter_1 = require("./cover-letter");
const report_1 = require("./report");
const plan_limits_1 = require("./plan-limits");
/**
 * Run a full scan → match → draft → report cycle for one agent.
 * Called by the scheduler once per agent per day, and manually via the
 * admin "Run scan now" button.
 */
async function runScanForAgent(agent) {
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
        const jobs = [];
        for (const country of agent.target_countries) {
            for (const role of agent.target_roles.slice(0, 3)) { // cap roles per scan
                try {
                    const chunk = await (0, adzuna_1.fetchAdzunaJobs)({
                        country,
                        what: role,
                        resultsPerPage: 20,
                    });
                    jobs.push(...chunk);
                }
                catch (err) {
                    console.warn(`[autoapply] adzuna fetch failed country=${country} role=${role}:`, err?.message);
                }
            }
        }
        scanned = jobs.length;
        // 2. Score every fetched job against the user's CV
        // 2026-08 Phase 2: use the SMALLER of (user's chosen daily cap, their
        // plan's max). Free users are hard-capped at 3 matches/day even if
        // they entered a bigger number in their config.
        const effectiveCap = Math.min(agent.max_matches_per_day, limits.maxMatchesPerDay);
        const scored = jobs
            .map((job) => {
            const { score, reasons } = (0, matcher_1.scoreJobAgainstCv)({
                jobTitle: job.title,
                jobDescription: job.description ?? "",
                jobLocation: job.city ?? job.country ?? "",
                cvText: agent.cv_text,
                targetRoles: agent.target_roles,
                experienceYrs: agent.experience_years ?? undefined,
            });
            return { job, score, reasons };
        })
            .filter((m) => m.score >= 40) // discard weak matches
            .sort((a, b) => b.score - a.score)
            .slice(0, effectiveCap);
        // 3. Persist matches (ON CONFLICT dedupes previously-seen jobs)
        for (const { job, score, reasons } of scored) {
            const inserted = await insertMatch({
                agentId: agent.id,
                userId: agent.user_id,
                source: job.source,
                externalId: job.externalId,
                jobTitle: job.title,
                employer: job.employer,
                country: job.country,
                city: job.city,
                salaryDisplay: job.salaryDisplay,
                salaryKesMonthly: job.salaryKesMonthly,
                postedAt: job.postedAt,
                applyUrl: job.applyUrl,
                description: (job.description ?? "").slice(0, 8000),
                matchScore: score,
                matchReasons: reasons,
            });
            if (inserted) {
                stored++;
                // 4. Draft a cover letter — Phase 2.5 quota check.
                //    Counts against the LAST 24 HOURS across all scans (not just
                //    this one), so a user can't game the quota by triggering
                //    multiple scans. Once quota hits limit, remaining matches
                //    still get stored but without letters — the UI shows a
                //    "quota resets midnight" note for those.
                if (limits.maxCoverLettersPerDay > 0) {
                    const usedToday = await countLettersDraftedInLast24h(agent.user_id);
                    if (usedToday + drafted < limits.maxCoverLettersPerDay) {
                        try {
                            const letter = await (0, cover_letter_1.draftCoverLetter)({
                                jobTitle: job.title,
                                employer: job.employer ?? "the hiring team",
                                country: job.country ?? "the target country",
                                jobDescription: (job.description ?? "").slice(0, 2000),
                                cvText: agent.cv_text.slice(0, 3000),
                            });
                            await attachCoverLetter(inserted, letter);
                            drafted++;
                        }
                        catch (err) {
                            console.warn(`[autoapply] cover-letter draft failed match=${inserted}:`, err?.message);
                        }
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
                    await (0, report_1.sendDailyDigest)({ agent, matches });
                    reportSent = true;
                }
            }
            catch (err) {
                console.warn(`[autoapply] digest send failed agent=${agent.id}:`, err?.message);
            }
        }
        await closeScanRun(runId, {
            status: "ok",
            jobsScanned: scanned,
            matchesFound: scored.length,
            matchesStored: stored,
            coverLettersGenerated: drafted,
            reportSent,
        });
        // 6. Update agent stats + schedule next scan
        await db_1.pool.query(`UPDATE autoapply_agents
          SET last_scan_at = NOW(),
              next_scan_at = NOW() + INTERVAL '24 hours',
              total_matches_lifetime = total_matches_lifetime + $1,
              updated_at = NOW()
        WHERE id = $2`, [stored, agent.id]);
        return {
            agentId: agent.id,
            runId,
            status: "ok",
            jobsScanned: scanned,
            matchesFound: scored.length,
            matchesStored: stored,
            coverLettersGenerated: drafted,
            reportSent,
        };
    }
    catch (err) {
        const msg = err?.message ?? String(err);
        console.error(`[autoapply] scan failed agent=${agent.id}:`, msg);
        await closeScanRun(runId, { status: "error", errorMessage: msg });
        return {
            agentId: agent.id,
            runId,
            status: "error",
            jobsScanned: scanned,
            matchesFound: 0,
            matchesStored: stored,
            coverLettersGenerated: drafted,
            reportSent: false,
            errorMessage: msg,
        };
    }
}
/**
 * Fetch every active agent that's due for a scan and run them serially.
 * Called by the scheduler on its tick; safe to call multiple times per day
 * (agents that already scanned in the last 20h are skipped).
 */
/**
 * Fetch every active agent that's due for a scan and run them serially.
 *
 * 2026-08 Phase 2.5: tiered scan cadence via SQL. Pro users (users.plan
 * IN ('pro','basic'), admins, or in active trial) are due every 20
 * hours. Free users are due every 7 days. This makes the daily-morning-
 * digest habit an explicit Pro perk and reduces our Adzuna quota use
 * for freeloaders. Priority queue: Pro agents ordered first.
 */
async function runDueScans() {
    const { rows } = await db_1.pool.query(`SELECT a.*,
            (
              u.is_admin = true
              OR u.role IN ('ADMIN','SUPER_ADMIN')
              OR u.plan IN ('pro','basic')
              OR (a.pro_trial_ends_at IS NOT NULL AND a.pro_trial_ends_at > NOW())
            ) AS is_pro_effective
       FROM autoapply_agents a
       JOIN users u ON u.id = a.user_id
      WHERE a.is_active = true
        AND (
          a.last_scan_at IS NULL
          OR (
            (u.is_admin = true OR u.role IN ('ADMIN','SUPER_ADMIN') OR u.plan IN ('pro','basic')
             OR (a.pro_trial_ends_at IS NOT NULL AND a.pro_trial_ends_at > NOW()))
            AND a.last_scan_at < NOW() - INTERVAL '20 hours'
          )
          OR (
            NOT (u.is_admin = true OR u.role IN ('ADMIN','SUPER_ADMIN') OR u.plan IN ('pro','basic')
                 OR (a.pro_trial_ends_at IS NOT NULL AND a.pro_trial_ends_at > NOW()))
            AND a.last_scan_at < NOW() - INTERVAL '7 days'
          )
        )
      ORDER BY is_pro_effective DESC, a.last_scan_at ASC NULLS FIRST
      LIMIT 50`);
    let ok = 0, err = 0;
    for (const agent of rows) {
        const result = await runScanForAgent(agent);
        if (result.status === "ok")
            ok++;
        else
            err++;
        // Small pause between agents to avoid rate-limiting Adzuna
        await new Promise((r) => setTimeout(r, 1500));
    }
    return { scanned: ok, errors: err };
}
async function insertMatch(m) {
    const { rows } = await db_1.pool.query(`INSERT INTO autoapply_matches
       (agent_id, user_id, source, external_id, job_title, employer,
        country, city, salary_display, salary_kes_monthly, posted_at,
        apply_url, description, match_score, match_reasons)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (agent_id, source, external_id) DO NOTHING
     RETURNING id`, [
        m.agentId, m.userId, m.source, m.externalId, m.jobTitle, m.employer,
        m.country, m.city, m.salaryDisplay, m.salaryKesMonthly, m.postedAt,
        m.applyUrl, m.description, m.matchScore, m.matchReasons,
    ]);
    return rows[0]?.id ?? null;
}
async function attachCoverLetter(matchId, letter) {
    await db_1.pool.query(`UPDATE autoapply_matches
        SET cover_letter    = $2,
            cover_letter_at = NOW()
      WHERE id = $1`, [matchId, letter]);
}
/**
 * 2026-08 Phase 2.5: count how many cover letters were drafted for this
 * user in the last 24h. Used to enforce the daily letter quota so a
 * user can't game the limit by triggering multiple scans in one day.
 */
async function countLettersDraftedInLast24h(userId) {
    const { rows } = await db_1.pool.query(`SELECT COUNT(*)::text AS c
       FROM autoapply_matches
      WHERE user_id = $1
        AND cover_letter IS NOT NULL
        AND cover_letter_at > NOW() - INTERVAL '24 hours'`, [userId]);
    return Number(rows[0]?.c ?? 0);
}
async function loadRecentMatches(agentId, hours) {
    const { rows } = await db_1.pool.query(`SELECT * FROM autoapply_matches
      WHERE agent_id = $1
        AND created_at > NOW() - ($2::text || ' hours')::interval
      ORDER BY match_score DESC
      LIMIT 20`, [agentId, String(hours)]);
    return rows;
}
async function openScanRun(agentId) {
    const { rows } = await db_1.pool.query(`INSERT INTO autoapply_scan_runs (agent_id, status)
     VALUES ($1, 'running')
     RETURNING id`, [agentId]);
    return rows[0].id;
}
async function closeScanRun(id, patch) {
    await db_1.pool.query(`UPDATE autoapply_scan_runs
        SET finished_at    = NOW(),
            status         = COALESCE($2, status),
            jobs_scanned   = COALESCE($3, jobs_scanned),
            matches_found  = COALESCE($4, matches_found),
            matches_stored = COALESCE($5, matches_stored),
            cover_letters_generated = COALESCE($6, cover_letters_generated),
            report_sent    = COALESCE($7, report_sent),
            error_message  = COALESCE($8, error_message)
      WHERE id = $1`, [
        id,
        patch.status ?? null,
        patch.jobsScanned ?? null,
        patch.matchesFound ?? null,
        patch.matchesStored ?? null,
        patch.coverLettersGenerated ?? null,
        patch.reportSent ?? null,
        patch.errorMessage ?? null,
    ]);
}
// ─── Plan resolution ─────────────────────────────────────────────────
// Cheap fetch — we skip /api/auth/user's heavier caching path since
// scans happen in the background where a few extra ms are irrelevant.
// Admins are treated as Pro (matches the rest of the platform's admin
// bypass pattern).
//
// 2026-08 Phase 2.5: honour the pro_trial_ends_at column on
// autoapply_agents. Users in an active 7-day trial get Pro limits
// even though users.plan may still be 'free'. When the trial expires
// (checked on every scan) they silently drop to free until they
// upgrade.
async function resolveLimitsForUser(userId) {
    try {
        const { rows } = await db_1.pool.query(`SELECT u.plan, u.is_admin, u.role, a.pro_trial_ends_at
         FROM users u
         LEFT JOIN autoapply_agents a ON a.user_id = u.id
        WHERE u.id = $1
        LIMIT 1`, [userId]);
        const u = rows[0];
        if (!u)
            return (0, plan_limits_1.getAutoApplyLimits)("free");
        if (u.is_admin || u.role === "ADMIN" || u.role === "SUPER_ADMIN") {
            return (0, plan_limits_1.getAutoApplyLimits)("pro");
        }
        // Active Pro trial → treat as Pro
        if (u.pro_trial_ends_at && new Date(u.pro_trial_ends_at).getTime() > Date.now()) {
            return (0, plan_limits_1.getAutoApplyLimits)("pro");
        }
        return (0, plan_limits_1.getAutoApplyLimits)(u.plan);
    }
    catch {
        return (0, plan_limits_1.getAutoApplyLimits)("free");
    }
}
