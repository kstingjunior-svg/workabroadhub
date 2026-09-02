"use strict";
/**
 * AutoApply API — user-facing endpoints for the /autoapply page.
 *
 *   GET    /api/autoapply/agent            → the current user's agent (or null)
 *   POST   /api/autoapply/agent            → create/update agent (upsert on user_id)
 *   POST   /api/autoapply/agent/pause      → toggle is_active
 *   DELETE /api/autoapply/agent            → delete agent + all its matches
 *   POST   /api/autoapply/agent/scan-now   → trigger an immediate scan (rate-limited)
 *   GET    /api/autoapply/matches          → paginated match list (?status=new|starred|applied|dismissed)
 *   POST   /api/autoapply/matches/:id/status  → mark applied / starred / dismissed
 *   POST   /api/autoapply/matches/:id/draft-letter → regenerate cover letter
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAutoApplyRoutes = registerAutoApplyRoutes;
const db_1 = require("../db");
const autoapply_1 = require("../lib/autoapply");
const cover_letter_1 = require("../lib/autoapply/cover-letter");
const plan_limits_1 = require("../lib/autoapply/plan-limits");
function requireAuth(req, res) {
    const userId = req.session?.customUserId;
    if (!userId) {
        res.status(401).json({ message: "Please sign in to use AutoApply." });
        return null;
    }
    return userId;
}
function registerAutoApplyRoutes(app, _isAuthenticated) {
    // ── GET current user's agent + plan limits + trial status + quota ───
    app.get("/api/autoapply/agent", async (req, res) => {
        const userId = requireAuth(req, res);
        if (!userId)
            return;
        const [agentRes, planRes, quotaRes] = await Promise.all([
            db_1.pool.query(`SELECT * FROM autoapply_agents WHERE user_id = $1 LIMIT 1`, [userId]),
            db_1.pool.query(`SELECT plan, is_admin, role FROM users WHERE id = $1`, [userId]),
            db_1.pool.query(`SELECT COUNT(*)::text AS c FROM autoapply_matches
          WHERE user_id = $1 AND cover_letter IS NOT NULL
            AND cover_letter_at > NOW() - INTERVAL '24 hours'`, [userId]),
        ]);
        const u = planRes.rows[0];
        const agent = agentRes.rows[0];
        const isAdmin = !!(u?.is_admin || u?.role === "ADMIN" || u?.role === "SUPER_ADMIN");
        const trialActive = !!(agent?.pro_trial_ends_at && new Date(agent.pro_trial_ends_at).getTime() > Date.now());
        // Effective plan considers admin bypass + active trial
        let effectivePlanKey;
        if (isAdmin || trialActive)
            effectivePlanKey = "pro";
        else
            effectivePlanKey = u?.plan ?? "free";
        const limits = (0, plan_limits_1.getAutoApplyLimits)(effectivePlanKey);
        const lettersUsedToday = Number(quotaRes.rows[0]?.c ?? 0);
        return res.json({
            agent: agent ?? null,
            plan: {
                id: effectivePlanKey,
                ...limits,
                // Trial info exposed to UI so it can render the countdown
                trial_active: trialActive,
                trial_ends_at: agent?.pro_trial_ends_at ?? null,
                real_plan: u?.plan ?? "free", // underlying plan (post-trial)
            },
            quota: {
                letters_used_today: lettersUsedToday,
                letters_daily_limit: limits.maxCoverLettersPerDay,
                letters_remaining_today: Math.max(0, limits.maxCoverLettersPerDay - lettersUsedToday),
            },
            offers: {
                // Frontend uses these to render the upgrade card. Includes annual
                // option (~17% cheaper vs. monthly × 12).
                pro: {
                    ...plan_limits_1.AUTOAPPLY_PLAN_LIMITS.pro,
                    upgradeUrl: "/services",
                    annualPriceKes: plan_limits_1.AUTOAPPLY_PRO_ANNUAL_KES,
                    annualSavings: plan_limits_1.AUTOAPPLY_PLAN_LIMITS.pro.monthlyPriceKes * 12 - plan_limits_1.AUTOAPPLY_PRO_ANNUAL_KES,
                },
                trialDays: plan_limits_1.AUTOAPPLY_PRO_TRIAL_DAYS,
            },
        });
    });
    // ── POST create/update agent (upsert) ─────────────────────────────────
    app.post("/api/autoapply/agent", async (req, res) => {
        const userId = requireAuth(req, res);
        if (!userId)
            return;
        const body = req.body ?? {};
        const targetCountries = Array.isArray(body.target_countries)
            ? body.target_countries.map(String).slice(0, 5)
            : [];
        const targetRoles = Array.isArray(body.target_roles)
            ? body.target_roles.map(String).slice(0, 5)
            : [];
        const cvText = String(body.cv_text ?? "").trim();
        if (targetCountries.length === 0)
            return res.status(400).json({ message: "Pick at least one target country." });
        if (targetRoles.length === 0)
            return res.status(400).json({ message: "Pick at least one target role." });
        if (cvText.length < 200)
            return res.status(400).json({ message: "Paste your CV text (minimum 200 characters)." });
        const minSalaryKes = body.min_salary_kes ? Number(body.min_salary_kes) : null;
        const experienceYrs = body.experience_years ? Number(body.experience_years) : null;
        const visaReq = body.visa_sponsorship_required !== false;
        const remoteOk = body.remote_ok === true;
        const maxPerDay = Math.min(30, Math.max(1, Number(body.max_matches_per_day ?? 10)));
        // 2026-08 Phase 2.5: on FIRST create, grant a 7-day Pro trial. Users
        // who already have an agent (updating settings) keep whatever trial
        // state they had — we never extend or reset the trial retroactively.
        const { rows } = await db_1.pool.query(`INSERT INTO autoapply_agents
         (user_id, target_countries, target_roles, target_industries,
          min_salary_kes, visa_sponsorship_required, remote_ok,
          experience_years, cv_text, max_matches_per_day,
          is_active, next_scan_at, pro_trial_ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,
               NOW() + INTERVAL '5 minutes',
               NOW() + ($11::text || ' days')::interval)
       ON CONFLICT (user_id) DO UPDATE
         SET target_countries          = EXCLUDED.target_countries,
             target_roles              = EXCLUDED.target_roles,
             target_industries         = EXCLUDED.target_industries,
             min_salary_kes            = EXCLUDED.min_salary_kes,
             visa_sponsorship_required = EXCLUDED.visa_sponsorship_required,
             remote_ok                 = EXCLUDED.remote_ok,
             experience_years          = EXCLUDED.experience_years,
             cv_text                   = EXCLUDED.cv_text,
             max_matches_per_day       = EXCLUDED.max_matches_per_day,
             is_active                 = true,
             updated_at                = NOW()
             -- Deliberately DO NOT touch pro_trial_ends_at on update
       RETURNING *`, [
            userId,
            targetCountries,
            targetRoles,
            Array.isArray(body.target_industries) ? body.target_industries.map(String).slice(0, 5) : [],
            minSalaryKes,
            visaReq,
            remoteOk,
            experienceYrs,
            cvText,
            maxPerDay,
            String(plan_limits_1.AUTOAPPLY_PRO_TRIAL_DAYS),
        ]);
        return res.json({ agent: rows[0] });
    });
    // ── POST pause/resume ─────────────────────────────────────────────────
    app.post("/api/autoapply/agent/pause", async (req, res) => {
        const userId = requireAuth(req, res);
        if (!userId)
            return;
        const paused = req.body?.paused === true;
        const { rows } = await db_1.pool.query(`UPDATE autoapply_agents SET is_active = $2, updated_at = NOW()
        WHERE user_id = $1 RETURNING id, is_active`, [userId, !paused]);
        return res.json({ agent: rows[0] ?? null });
    });
    // ── DELETE agent ──────────────────────────────────────────────────────
    app.delete("/api/autoapply/agent", async (req, res) => {
        const userId = requireAuth(req, res);
        if (!userId)
            return;
        await db_1.pool.query(`DELETE FROM autoapply_agents WHERE user_id = $1`, [userId]);
        return res.json({ ok: true });
    });
    // ── POST run scan now (rate-limited to 1 per hour) ────────────────────
    app.post("/api/autoapply/agent/scan-now", async (req, res) => {
        const userId = requireAuth(req, res);
        if (!userId)
            return;
        const { rows } = await db_1.pool.query(`SELECT * FROM autoapply_agents WHERE user_id = $1 LIMIT 1`, [userId]);
        const agent = rows[0];
        if (!agent)
            return res.status(404).json({ message: "No agent configured." });
        if (agent.last_scan_at && Date.now() - new Date(agent.last_scan_at).getTime() < 60 * 60 * 1000) {
            return res.status(429).json({ message: "Please wait — your last scan was less than an hour ago." });
        }
        // Fire-and-forget so the HTTP response returns fast; user polls /matches
        (async () => {
            try {
                await (0, autoapply_1.runScanForAgent)(agent);
            }
            catch (err) {
                console.error("[autoapply] on-demand scan failed:", err?.message);
            }
        })();
        return res.json({ ok: true, message: "Scan started — new matches will appear in your inbox within 60 seconds." });
    });
    // ── GET matches (paginated) ───────────────────────────────────────────
    app.get("/api/autoapply/matches", async (req, res) => {
        const userId = requireAuth(req, res);
        if (!userId)
            return;
        const status = String(req.query.status ?? "").trim();
        const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
        const params = [userId];
        let sql = `SELECT id, agent_id, source, external_id, job_title, employer,
                      country, city, salary_display, salary_kes_monthly,
                      posted_at, apply_url, description, match_score,
                      match_reasons, cover_letter, cover_letter_at,
                      status, applied_at, dismissed_at, created_at
                 FROM autoapply_matches
                WHERE user_id = $1`;
        if (["new", "starred", "applied", "dismissed"].includes(status)) {
            params.push(status);
            sql += ` AND status = $${params.length}`;
        }
        params.push(limit);
        sql += ` ORDER BY match_score DESC, created_at DESC LIMIT $${params.length}`;
        const { rows } = await db_1.pool.query(sql, params);
        return res.json({ matches: rows });
    });
    // ── POST update match status ──────────────────────────────────────────
    app.post("/api/autoapply/matches/:id/status", async (req, res) => {
        const userId = requireAuth(req, res);
        if (!userId)
            return;
        const matchId = String(req.params.id);
        const status = String(req.body?.status ?? "").trim();
        if (!["new", "starred", "applied", "dismissed"].includes(status)) {
            return res.status(400).json({ message: "Invalid status." });
        }
        const setTs = status === "applied" ? ", applied_at = NOW()" :
            status === "dismissed" ? ", dismissed_at = NOW()" : "";
        const { rows } = await db_1.pool.query(`UPDATE autoapply_matches
          SET status = $3 ${setTs}
        WHERE id = $2 AND user_id = $1
        RETURNING id, status`, [userId, matchId, status]);
        if (rows.length === 0)
            return res.status(404).json({ message: "Match not found." });
        // If they applied, bump the lifetime counter
        if (status === "applied") {
            await db_1.pool.query(`UPDATE autoapply_agents SET total_applied_lifetime = total_applied_lifetime + 1
          WHERE user_id = $1`, [userId]);
        }
        return res.json({ match: rows[0] });
    });
    // ── POST regenerate cover letter for a match ──────────────────────────
    // Pro-only (Phase 2 gate). Free users see a "Upgrade to draft" prompt
    // in the UI instead of the button.
    app.post("/api/autoapply/matches/:id/draft-letter", async (req, res) => {
        const userId = requireAuth(req, res);
        if (!userId)
            return;
        // Plan check
        const { rows: u } = await db_1.pool.query(`SELECT plan, is_admin, role FROM users WHERE id = $1`, [userId]);
        const isAdmin = !!(u[0]?.is_admin || u[0]?.role === "ADMIN" || u[0]?.role === "SUPER_ADMIN");
        const limits = (0, plan_limits_1.getAutoApplyLimits)(isAdmin ? "pro" : (u[0]?.plan ?? "free"));
        if (limits.maxCoverLettersPerDay === 0) {
            return res.status(402).json({
                message: "AI cover letters are a Pro feature.",
                upgradeUrl: "/services",
                planRequired: "pro",
            });
        }
        const matchId = String(req.params.id);
        const { rows } = await db_1.pool.query(`SELECT m.job_title, m.employer, m.country, m.description, a.cv_text
         FROM autoapply_matches m
         JOIN autoapply_agents  a ON a.id = m.agent_id
        WHERE m.id = $1 AND m.user_id = $2
        LIMIT 1`, [matchId, userId]);
        const row = rows[0];
        if (!row)
            return res.status(404).json({ message: "Match not found." });
        try {
            const letter = await (0, cover_letter_1.draftCoverLetter)({
                jobTitle: row.job_title,
                employer: row.employer ?? "the hiring team",
                country: row.country ?? "target country",
                jobDescription: (row.description ?? "").slice(0, 2000),
                cvText: String(row.cv_text ?? "").slice(0, 3000),
            });
            await db_1.pool.query(`UPDATE autoapply_matches
            SET cover_letter = $2, cover_letter_at = NOW()
          WHERE id = $1`, [matchId, letter]);
            return res.json({ cover_letter: letter });
        }
        catch (err) {
            return res.status(500).json({ message: err?.message ?? "Draft failed." });
        }
    });
    console.log("[Autoapply] routes registered: /api/autoapply/{agent,matches,...}");
}
