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

import type { Express, Request, Response, RequestHandler } from "express";
import { pool } from "../db";
import { runScanForAgent, type AgentRow } from "../lib/autoapply";
import { draftCoverLetter } from "../lib/autoapply/cover-letter";

function requireAuth(req: Request, res: Response): string | null {
  const userId = (req.session as any)?.customUserId as string | undefined;
  if (!userId) {
    res.status(401).json({ message: "Please sign in to use AutoApply." });
    return null;
  }
  return userId;
}

export function registerAutoApplyRoutes(app: Express, _isAuthenticated?: RequestHandler): void {
  // ── GET current user's agent ──────────────────────────────────────────
  app.get("/api/autoapply/agent", async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const { rows } = await pool.query<AgentRow>(
      `SELECT * FROM autoapply_agents WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    return res.json({ agent: rows[0] ?? null });
  });

  // ── POST create/update agent (upsert) ─────────────────────────────────
  app.post("/api/autoapply/agent", async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;

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

    const { rows } = await pool.query<AgentRow>(
      `INSERT INTO autoapply_agents
         (user_id, target_countries, target_roles, target_industries,
          min_salary_kes, visa_sponsorship_required, remote_ok,
          experience_years, cv_text, max_matches_per_day,
          is_active, next_scan_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,NOW() + INTERVAL '5 minutes')
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
       RETURNING *`,
      [
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
      ],
    );
    return res.json({ agent: rows[0] });
  });

  // ── POST pause/resume ─────────────────────────────────────────────────
  app.post("/api/autoapply/agent/pause", async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const paused = req.body?.paused === true;
    const { rows } = await pool.query(
      `UPDATE autoapply_agents SET is_active = $2, updated_at = NOW()
        WHERE user_id = $1 RETURNING id, is_active`,
      [userId, !paused],
    );
    return res.json({ agent: rows[0] ?? null });
  });

  // ── DELETE agent ──────────────────────────────────────────────────────
  app.delete("/api/autoapply/agent", async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    await pool.query(`DELETE FROM autoapply_agents WHERE user_id = $1`, [userId]);
    return res.json({ ok: true });
  });

  // ── POST run scan now (rate-limited to 1 per hour) ────────────────────
  app.post("/api/autoapply/agent/scan-now", async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const { rows } = await pool.query<AgentRow>(
      `SELECT * FROM autoapply_agents WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const agent = rows[0];
    if (!agent) return res.status(404).json({ message: "No agent configured." });
    if (agent.last_scan_at && Date.now() - new Date(agent.last_scan_at).getTime() < 60 * 60 * 1000) {
      return res.status(429).json({ message: "Please wait — your last scan was less than an hour ago." });
    }
    // Fire-and-forget so the HTTP response returns fast; user polls /matches
    (async () => {
      try { await runScanForAgent(agent); }
      catch (err: any) { console.error("[autoapply] on-demand scan failed:", err?.message); }
    })();
    return res.json({ ok: true, message: "Scan started — new matches will appear in your inbox within 60 seconds." });
  });

  // ── GET matches (paginated) ───────────────────────────────────────────
  app.get("/api/autoapply/matches", async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const status = String(req.query.status ?? "").trim();
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
    const params: any[] = [userId];
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
    const { rows } = await pool.query(sql, params);
    return res.json({ matches: rows });
  });

  // ── POST update match status ──────────────────────────────────────────
  app.post("/api/autoapply/matches/:id/status", async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const matchId = String(req.params.id);
    const status = String(req.body?.status ?? "").trim();
    if (!["new", "starred", "applied", "dismissed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }
    const setTs = status === "applied" ? ", applied_at = NOW()" :
                  status === "dismissed" ? ", dismissed_at = NOW()" : "";
    const { rows } = await pool.query(
      `UPDATE autoapply_matches
          SET status = $3 ${setTs}
        WHERE id = $2 AND user_id = $1
        RETURNING id, status`,
      [userId, matchId, status],
    );
    if (rows.length === 0) return res.status(404).json({ message: "Match not found." });

    // If they applied, bump the lifetime counter
    if (status === "applied") {
      await pool.query(
        `UPDATE autoapply_agents SET total_applied_lifetime = total_applied_lifetime + 1
          WHERE user_id = $1`,
        [userId],
      );
    }
    return res.json({ match: rows[0] });
  });

  // ── POST regenerate cover letter for a match ──────────────────────────
  app.post("/api/autoapply/matches/:id/draft-letter", async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const matchId = String(req.params.id);
    const { rows } = await pool.query(
      `SELECT m.job_title, m.employer, m.country, m.description, a.cv_text
         FROM autoapply_matches m
         JOIN autoapply_agents  a ON a.id = m.agent_id
        WHERE m.id = $1 AND m.user_id = $2
        LIMIT 1`,
      [matchId, userId],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ message: "Match not found." });
    try {
      const letter = await draftCoverLetter({
        jobTitle:       row.job_title,
        employer:       row.employer ?? "the hiring team",
        country:        row.country ?? "target country",
        jobDescription: (row.description ?? "").slice(0, 2000),
        cvText:         String(row.cv_text ?? "").slice(0, 3000),
      });
      await pool.query(
        `UPDATE autoapply_matches
            SET cover_letter = $2, cover_letter_at = NOW()
          WHERE id = $1`,
        [matchId, letter],
      );
      return res.json({ cover_letter: letter });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message ?? "Draft failed." });
    }
  });

  console.log("[Autoapply] routes registered: /api/autoapply/{agent,matches,...}");
}
