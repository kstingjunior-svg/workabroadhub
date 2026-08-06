/**
 * GET /api/me/career-overview — Phase 3 MY CAREER dashboard aggregation
 *
 * Consolidates career-related stats for the signed-in user across:
 *   - local_job_applications (Kenya Careers applications) — status counts
 *   - tool_reports (ATS checks) — highest ATS score achieved
 *   - service_orders (paid services: CV Revamp, Cover Letter, etc.) — count
 *   - Recent applications table (10 most recent) — powers Application Tracker
 *
 * Response shape (client renders 6 tiles + the applications table):
 *   {
 *     stats: {
 *       applications:   <int>,   // total submitted
 *       cvScore:        <int | null>,  // highest ATS score
 *       interviews:     <int>,   // status IN ('shortlisted','interviewing')
 *       offers:         <int>,   // status IN ('hired','offer')
 *       countries:      <int>,   // distinct destination countries
 *       cvRevamps:      <int>    // completed paid CV services
 *     },
 *     recentApplications: [ { id, jobTitle, companyName, status, appliedAt, county } ]
 *   }
 *
 * Resilient to missing tables — any query that throws is silently treated
 * as zero. Never returns 500 for missing schema; only 401 for unauth.
 *
 * 2026-08 Phase 3.
 */
import type { Express, Response } from "express";
import { pool } from "../db";

export function registerCareerOverviewRoute(app: Express): void {
  app.get("/api/me/career-overview", async (req: any, res: Response) => {
    try {
      const userId = req.user?.claims?.sub ?? req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Please sign in." });
      }

      // ── Applications aggregate (Kenya careers) ────────────────────────
      let stats = {
        applications: 0,
        cvScore:      null as number | null,
        interviews:   0,
        offers:       0,
        countries:    0,
        cvRevamps:    0,
      };
      let recentApplications: any[] = [];

      // Applications count + status counts
      try {
        const { rows } = await pool.query<{
          total: string; interviews: string; offers: string; countries: string;
        }>(
          `SELECT
              COUNT(*)                                                   AS total,
              COUNT(*) FILTER (WHERE a.status IN ('shortlisted','interviewing','interview_scheduled')) AS interviews,
              COUNT(*) FILTER (WHERE a.status IN ('hired','offer','accepted'))                         AS offers,
              COUNT(DISTINCT j.county)                                   AS countries
             FROM local_job_applications a
             JOIN local_jobs j ON j.id = a.job_id
            WHERE a.applicant_user_id = $1`,
          [userId],
        );
        const r = rows[0];
        if (r) {
          stats.applications = parseInt(r.total ?? "0", 10);
          stats.interviews   = parseInt(r.interviews ?? "0", 10);
          stats.offers       = parseInt(r.offers ?? "0", 10);
          stats.countries    = parseInt(r.countries ?? "0", 10);
        }
      } catch (e: any) {
        console.warn("[career-overview] applications aggregate failed:", e?.message);
      }

      // Highest ATS score from tool_reports (report_data.score)
      try {
        const { rows } = await pool.query<{ max_score: string | null }>(
          `SELECT MAX((report_data->>'score')::int) AS max_score
             FROM tool_reports
            WHERE user_id = $1
              AND tool_name = 'ats'
              AND (report_data->>'score') ~ '^[0-9]+$'`,
          [userId],
        );
        const raw = rows[0]?.max_score;
        stats.cvScore = raw != null ? parseInt(raw, 10) : null;
      } catch (e: any) {
        console.warn("[career-overview] ATS score aggregate failed:", e?.message);
      }

      // CV Revamps + other completed paid services
      try {
        const { rows } = await pool.query<{ total: string }>(
          `SELECT COUNT(*) AS total
             FROM service_orders
            WHERE user_id = $1
              AND status = 'completed'
              AND service_slug IN ('cv_fix_lite', 'ats_cv_optimization', 'cv_rewrite', 'cover_letter', 'cv_and_cover_combo')`,
          [userId],
        );
        stats.cvRevamps = parseInt(rows[0]?.total ?? "0", 10);
      } catch (e: any) {
        console.warn("[career-overview] service orders aggregate failed:", e?.message);
      }

      // 10 most recent applications for the tracker table
      try {
        const { rows } = await pool.query<{
          id: string; status: string; applied_at: Date;
          job_id: string; job_title: string; county: string | null; town: string | null;
          company_name: string; company_verified_at: Date | null;
        }>(
          `SELECT
              a.id, a.status, a.applied_at,
              j.id AS job_id, j.title AS job_title, j.county, j.town,
              c.name AS company_name, c.verified_at AS company_verified_at
             FROM local_job_applications a
             JOIN local_jobs j ON j.id = a.job_id
             JOIN companies   c ON c.id = j.company_id
            WHERE a.applicant_user_id = $1
            ORDER BY a.applied_at DESC
            LIMIT 10`,
          [userId],
        );
        recentApplications = rows.map((r) => ({
          id:          r.id,
          jobId:       r.job_id,
          jobTitle:    r.job_title,
          companyName: r.company_name,
          companyVerified: !!r.company_verified_at,
          status:      r.status,
          appliedAt:   r.applied_at,
          county:      r.county,
          town:        r.town,
        }));
      } catch (e: any) {
        console.warn("[career-overview] recent applications failed:", e?.message);
      }

      res.json({ stats, recentApplications });
    } catch (err: any) {
      console.error("[GET /api/me/career-overview]", err?.message);
      res.status(500).json({ message: "Could not load your career overview." });
    }
  });

  console.log("[career-overview] Route registered: GET /api/me/career-overview");
}
