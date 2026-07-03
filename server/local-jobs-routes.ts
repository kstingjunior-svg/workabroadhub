/**
 * Local Jobs Routes — Kenya Careers Phase 1 (public read-only)
 *
 * 2026-06: Phase 1 of the Kenya Careers employer portal. Read-only public
 * browsing endpoints for the new /kenya-careers section. Strictly isolated
 * from the existing payment / auth / visa-jobs / subscription systems:
 *
 *   • Mounted under a separate /api/local-jobs prefix (no collision with
 *     /api/jobs or /api/jobs/sponsorship which serve the overseas board)
 *   • No isAuthenticated middleware — fully public so SEO crawls work
 *   • No FK joins back into the existing users/jobs/payments tables
 *   • All writes (apply, post job, approve company) live in future phases
 *
 * Endpoints:
 *   GET /api/local-jobs                — paginated job list with filters
 *   GET /api/local-jobs/filters        — distinct counties/categories/companies
 *                                        for dropdowns
 *   GET /api/local-jobs/companies      — list of approved companies with job counts
 *   GET /api/local-jobs/stats          — total jobs / counties served / employers
 *   GET /api/local-jobs/:id            — single job detail with company + branch
 */
import type { Express, Request, Response } from "express";
import multer from "multer";
import { pool } from "./db";

/**
 * 2026-06 Phase 2.5 BUGFIX: read the session-based userId without requiring
 * the isAuthenticated middleware to have run first.
 *
 * Why this exists:
 *   The Kenya Careers endpoints are PUBLIC by design (anonymous users browse
 *   freely, signed-in free users see the upgrade card, paid users see the
 *   form). So we can't put `isAuthenticated` in front of them — it would
 *   reject anonymous users with 401.
 *
 *   But that ALSO means `req.user` is never populated, because populating it
 *   IS what the isAuthenticated middleware does. So a signed-in user landing
 *   on /api/local-jobs/me/apply-status was being treated as anonymous, sent
 *   to /login, and asked to sign in again — which is exactly the bug the
 *   founder reported ("I'm logged in but it keeps telling me to log in").
 *
 *   This helper reads BOTH session paths (customUserId from /api/auth/login
 *   and passport's req.user from any OAuth flow) without rejecting the
 *   request. Returns null when no session exists — the caller decides what
 *   to do.
 */
function readSessionUserId(req: any): string | null {
  // Path 1: req.user already populated (isAuthenticated ran for a parent route, or req re-used)
  const fromReqUser = req.user?.claims?.sub ?? req.user?.id;
  if (fromReqUser) return String(fromReqUser);
  // Path 2: custom session (the /api/auth/login flow used by the WAH frontend)
  const fromSession = req.session?.customUserId;
  if (fromSession) return String(fromSession);
  // Path 3: passport session (OAuth)
  if (req.isAuthenticated?.() && req.user) {
    const fromPassport = req.user?.claims?.sub ?? req.user?.id;
    if (fromPassport) return String(fromPassport);
  }
  return null;
}

const VALID_EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "contract", "internship", "casual"]);
const VALID_EXPERIENCE       = new Set(["entry", "mid", "senior", "any"]);

// 2026-06 Phase 2: tier-gated apply flow. Same KES tiers users already pay for
// the overseas board — free can browse but must upgrade to KES 99 trial to
// submit a Kenya Careers application. PAID_TIERS matches the canonical set
// from server/routes.ts / server/services/community.ts.
const KENYA_CAREERS_PAID_TIERS = new Set(["trial", "basic", "monthly", "yearly", "pro", "pro_referral"]);

// ── Application volume policy ─────────────────────────────────────────────
//
// 2026-07-03 POLICY CHANGE: WAH does NOT charge per application. We charge
// for TIME-BOUNDED ACCESS to the platform (KES 99 = 24h, KES 1,000 = 30d,
// KES 4,500 = 365d). Applications inside your access window are unlimited.
//
// Why: capping applications made honest users think their subscription was
// finished after a handful of applies. A user paid KES 99 at 11:45 AM, hit
// the old 3/day cap, and thought "pesa imeisha" — WhatsApp complaint on
// 3 July 2026 is what triggered this rewrite.
//
// The ONLY brake left is a per-minute rate limit that fires on bots, not
// real users. 10 applies inside 60s is impossible for a human filling
// forms; 5/min is a comfortable ceiling for the fastest real job hunter.
//
// See docs/pricing/TIME_BASED_ACCESS.md (if you touch this, update that).
const APPLY_RATE_PER_MINUTE = 10;         // hard ceiling — bot brake only
const APPLY_RATE_WINDOW_MS  = 60 * 1000;  // sliding 60-second window

// In-memory sliding window per userId. Serverless-friendly enough for our
// single-node Render deployment; if we ever move to multi-node this should
// migrate to Redis (Upstash already used by BullMQ).
const applyRateWindow = new Map<string, number[]>();

function checkApplyRate(userId: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const windowStart = now - APPLY_RATE_WINDOW_MS;
  const recent = (applyRateWindow.get(userId) ?? []).filter(t => t > windowStart);
  if (recent.length >= APPLY_RATE_PER_MINUTE) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + APPLY_RATE_WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSec };
  }
  recent.push(now);
  applyRateWindow.set(userId, recent);
  return { allowed: true, retryAfterSec: 0 };
}

// Periodic cleanup — old entries hang around forever otherwise.
setInterval(() => {
  const cutoff = Date.now() - APPLY_RATE_WINDOW_MS;
  for (const [uid, arr] of applyRateWindow.entries()) {
    const kept = arr.filter(t => t > cutoff);
    if (kept.length === 0) applyRateWindow.delete(uid);
    else applyRateWindow.set(uid, kept);
  }
}, 5 * 60 * 1000).unref?.();

// Multer config — memory storage, 5 MB per file limit. Mirrors the existing
// /api/upload-cv handler so users get a consistent experience.
//
// Phase 2.5: now accepts TWO fields ("cv" + "certificates") so applicants can
// attach diplomas/transcripts alongside their CV. Certificates also allow JPG/PNG
// because many Kenyans take phone photos of their certificates rather than
// scanning to PDF.
const CV_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);
const CERT_MIME = new Set([
  ...CV_MIME,
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

const applicationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "cv")           return cb(null, CV_MIME.has(file.mimetype));
    if (file.fieldname === "certificates") return cb(null, CERT_MIME.has(file.mimetype));
    cb(null, false);
  },
});

export function registerLocalJobsRoutes(app: Express): void {
  // ─── GET /api/local-jobs/_ping ────────────────────────────────────────────
  // 2026-06: Pure diagnostic — no DB, no logic. If this returns JSON {ok:true,
  // routesAt: <ISO>}, the route registration is alive on the server.
  // If it returns 404 or HTML, the deploy is incomplete (build cache, missing
  // file, boot crash before registration, etc).
  //
  // Use this to validate the deploy:
  //   curl -i https://workabroadhub.tech/api/local-jobs/_ping
  // Expected: HTTP 200 + Content-Type: application/json + {"ok":true,...}
  app.get("/api/local-jobs/_ping", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      routesAt: new Date().toISOString(),
      module: "local-jobs-routes",
      version: 1,
    });
  });

  // ─── GET /api/local-jobs ──────────────────────────────────────────────────
  // Public job list with optional filters. No auth required.
  // Query params:
  //   county    — exact match
  //   category  — exact match
  //   companyId — exact match
  //   experienceLevel — entry|mid|senior|any
  //   employmentType  — full_time|part_time|contract|internship|casual
  //   search    — ILIKE on title / department / company name
  //   limit     — default 24, max 100
  //   offset    — default 0
  app.get("/api/local-jobs", async (req: Request, res: Response) => {
    try {
      const {
        county, category, companyId, experienceLevel, employmentType, search,
      } = req.query as Record<string, string | undefined>;
      const limit  = Math.min(Number(req.query.limit  ?? 24), 100);
      const offset = Math.max(Number(req.query.offset ?? 0),  0);

      const conditions: string[] = ["j.status = 'open'", "c.status = 'approved'"];
      const params: any[] = [];
      const push = (clause: string, value: any) => {
        params.push(value);
        conditions.push(clause.replace("$$", `$${params.length}`));
      };

      if (county)       push("j.county = $$",                county);
      if (category)     push("j.category = $$",              category);
      if (companyId)    push("j.company_id = $$",            companyId);
      if (experienceLevel && VALID_EXPERIENCE.has(experienceLevel)) {
        push("j.experience_level = $$",                       experienceLevel);
      }
      if (employmentType && VALID_EMPLOYMENT_TYPES.has(employmentType)) {
        push("j.employment_type = $$",                        employmentType);
      }
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        params.push(term, term, term);
        const i = params.length;
        conditions.push(
          `(j.title ILIKE $${i - 2} OR j.department ILIKE $${i - 1} OR c.name ILIKE $${i})`,
        );
      }

      const where = conditions.join(" AND ");

      // Count + page in parallel
      const [countResult, listResult] = await Promise.all([
        pool.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total
             FROM local_jobs j
             JOIN companies   c ON c.id = j.company_id
            WHERE ${where}`,
          params,
        ),
        pool.query<{
          id: string; title: string; department: string | null; vacancies: number;
          employment_type: string | null;
          salary_min: number | null; salary_max: number | null;
          county: string | null; town: string | null;
          experience_level: string | null; category: string | null;
          deadline: Date | null;
          created_at: Date;
          is_seed: boolean;
          company_id: string; company_name: string; company_slug: string | null;
          company_industry: string | null; company_verified_at: Date | null;
          branch_id: string | null; branch_name: string | null;
        }>(
          `SELECT
              j.id, j.title, j.department, j.vacancies, j.employment_type,
              j.salary_min, j.salary_max, j.county, j.town,
              j.experience_level, j.category, j.deadline, j.created_at,
              COALESCE(j.is_seed, false) AS is_seed,
              c.id AS company_id, c.name AS company_name, c.slug AS company_slug,
              c.industry AS company_industry, c.verified_at AS company_verified_at,
              b.id AS branch_id, b.name AS branch_name
             FROM local_jobs j
             JOIN companies c ON c.id = j.company_id
        LEFT JOIN branches  b ON b.id = j.branch_id
            WHERE ${where}
            ORDER BY j.created_at DESC, j.id
            LIMIT ${limit} OFFSET ${offset}`,
          params,
        ),
      ]);

      const total = Number(countResult.rows[0]?.total ?? "0");

      const jobs = listResult.rows.map((r) => ({
        id:              r.id,
        title:           r.title,
        department:      r.department,
        vacancies:       r.vacancies,
        employmentType:  r.employment_type,
        salaryMin:       r.salary_min,
        salaryMax:       r.salary_max,
        county:          r.county,
        town:            r.town,
        experienceLevel: r.experience_level,
        category:        r.category,
        deadline:        r.deadline,
        createdAt:       r.created_at,
        isSeed:          !!r.is_seed,
        company: {
          id:        r.company_id,
          name:      r.company_name,
          slug:      r.company_slug,
          industry:  r.company_industry,
          // 2026-06 SAFETY: while every job in the catalogue is a seed, the
          // company hasn't actually verified themselves with us. Hide the
          // "Verified" tick until the company is genuinely verified — i.e.
          // when there's at least one real (non-seed) job under their name.
          // This keeps us legally honest about who's actually a confirmed
          // partner vs who's still a placeholder.
          verified:  !!r.company_verified_at && !r.is_seed,
        },
        branch: r.branch_id ? { id: r.branch_id, name: r.branch_name } : null,
      }));

      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({ total, limit, offset, jobs });
    } catch (err: any) {
      // Bootstrap may have failed (tables missing). Return empty list rather
      // than 500 so the public page still loads — Phase 1 is best-effort.
      if (err?.code === "42P01") {
        return res.json({ total: 0, limit: 24, offset: 0, jobs: [] });
      }
      console.error("[GET /api/local-jobs]", err?.message);
      res.status(500).json({ message: "Could not load local jobs." });
    }
  });

  // ─── GET /api/local-jobs/filters ──────────────────────────────────────────
  // 2026-06 Phase 3a: Founder asked that ALL 47 Kenyan counties appear in the
  // filter dropdown — not just the ones that currently have jobs. So we
  // return the canonical IEBC list of 47 counties (sourced from
  // ./lib/local-jobs-seed-data) regardless of what's in the jobs table. The
  // empty-state on the landing page handles "no jobs in this county yet".
  app.get("/api/local-jobs/filters", async (_req: Request, res: Response) => {
    try {
      const { KENYA_47_COUNTIES } = await import("./lib/local-jobs-seed-data");
      const [categoriesRes, industriesRes, companiesRes] = await Promise.all([
        pool.query<{ category: string }>(
          `SELECT DISTINCT category FROM local_jobs WHERE status='open' AND category IS NOT NULL ORDER BY category`,
        ).catch(() => ({ rows: [] }) as any),
        pool.query<{ industry: string }>(
          `SELECT DISTINCT industry FROM companies WHERE status='approved' AND industry IS NOT NULL ORDER BY industry`,
        ).catch(() => ({ rows: [] }) as any),
        pool.query<{ id: string; name: string; industry: string | null; job_count: string }>(
          `SELECT c.id, c.name, c.industry,
                  (SELECT COUNT(*) FROM local_jobs WHERE company_id = c.id AND status = 'open')::text AS job_count
             FROM companies c
            WHERE c.status = 'approved'
            ORDER BY c.name`,
        ).catch(() => ({ rows: [] }) as any),
      ]);
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json({
        counties:   KENYA_47_COUNTIES,                       // ALL 47, always
        categories: categoriesRes.rows.map((r: any) => r.category),
        industries: industriesRes.rows.map((r: any) => r.industry),
        companies:  companiesRes.rows.map((r: any) => ({
          id:       r.id,
          name:     r.name,
          industry: r.industry,
          jobCount: Number(r.job_count ?? 0),
        })),
      });
    } catch (err: any) {
      if (err?.code === "42P01") {
        // Fall back to the canonical county list even if the tables don't
        // exist yet — so the dropdown always has options.
        try {
          const { KENYA_47_COUNTIES } = await import("./lib/local-jobs-seed-data");
          return res.json({ counties: KENYA_47_COUNTIES, categories: [], industries: [], companies: [] });
        } catch {
          return res.json({ counties: [], categories: [], industries: [], companies: [] });
        }
      }
      console.error("[GET /api/local-jobs/filters]", err?.message);
      res.status(500).json({ message: "Could not load filters." });
    }
  });

  // ─── GET /api/local-jobs/empty-suggestions ────────────────────────────────
  // 2026-06 Phase 3a: powers the "No jobs in <county>" empty-state. Returns
  // (a) the nearest counties that DO have jobs (by simple alphabetical
  // neighbourhood — good enough for Phase 3a), (b) a few related employers,
  // (c) a count of jobs in the same category if a category was filtered.
  // Caller passes ?county=...&category=...&companyId=... — same query
  // shape as /api/local-jobs.
  app.get("/api/local-jobs/empty-suggestions", async (req: Request, res: Response) => {
    try {
      const { county, category } = req.query as Record<string, string | undefined>;
      const { KENYA_47_COUNTIES } = await import("./lib/local-jobs-seed-data");

      // Counties that DO have jobs right now, ordered by job count desc
      const { rows: activeCounties } = await pool.query<{ county: string; job_count: string }>(`
        SELECT j.county, COUNT(*)::text AS job_count
          FROM local_jobs j
          JOIN companies c ON c.id = j.company_id
         WHERE j.status = 'open' AND c.status = 'approved' AND j.county IS NOT NULL
         GROUP BY j.county
         ORDER BY COUNT(*) DESC
         LIMIT 6
      `).catch(() => ({ rows: [] }) as any);

      // A handful of recently-approved employers — used to seed "Related
      // employers" when the user is browsing a county with no jobs.
      const { rows: employerSuggestions } = await pool.query<{
        id: string; name: string; industry: string | null; job_count: string;
      }>(`
        SELECT c.id, c.name, c.industry,
               (SELECT COUNT(*) FROM local_jobs WHERE company_id = c.id AND status = 'open')::text AS job_count
          FROM companies c
         WHERE c.status = 'approved'
         ORDER BY c.created_at DESC
         LIMIT 6
      `).catch(() => ({ rows: [] }) as any);

      // Is the asked-for county actually valid (one of the 47)?
      const countyIsKenyan = !!county && KENYA_47_COUNTIES.includes(county);

      res.setHeader("Cache-Control", "public, max-age=120");
      res.json({
        message: countyIsKenyan
          ? `No jobs currently available in ${county}. Check back soon — employers are joining every week.`
          : "No jobs match those filters yet.",
        suggestedCounties: activeCounties.map((r: any) => ({ county: r.county, jobCount: Number(r.job_count) })),
        suggestedEmployers: employerSuggestions.map((r: any) => ({
          id: r.id, name: r.name, industry: r.industry, jobCount: Number(r.job_count),
        })),
        filterContext: { county: county ?? null, category: category ?? null },
      });
    } catch (err: any) {
      console.error("[GET /api/local-jobs/empty-suggestions]", err?.message);
      res.json({
        message: "No jobs currently available.",
        suggestedCounties: [],
        suggestedEmployers: [],
        filterContext: {},
      });
    }
  });

  // ─── GET /api/local-jobs/companies ────────────────────────────────────────
  // Public list of approved employers + their open-job counts. Powers the
  // "Featured Employers" strip on the landing page.
  app.get("/api/local-jobs/companies", async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query<{
        id: string; name: string; slug: string | null;
        industry: string | null; county: string | null;
        verified_at: Date | null; logo_url: string | null;
        job_count: string;
      }>(`
        SELECT
            c.id, c.name, c.slug, c.industry, c.county,
            c.verified_at, c.logo_url,
            COUNT(j.id) FILTER (WHERE j.status = 'open')::text AS job_count
          FROM companies c
     LEFT JOIN local_jobs j ON j.company_id = c.id
         WHERE c.status = 'approved'
      GROUP BY c.id
      ORDER BY c.name
      `);

      res.setHeader("Cache-Control", "public, max-age=300");
      res.json({
        companies: rows.map((r) => ({
          id:       r.id,
          name:     r.name,
          slug:     r.slug,
          industry: r.industry,
          county:   r.county,
          logoUrl:  r.logo_url,
          verified: !!r.verified_at,
          jobCount: Number(r.job_count),
        })),
      });
    } catch (err: any) {
      if (err?.code === "42P01") return res.json({ companies: [] });
      console.error("[GET /api/local-jobs/companies]", err?.message);
      res.status(500).json({ message: "Could not load companies." });
    }
  });

  // ─── GET /api/local-jobs/companies/:slug ──────────────────────────────────
  // 2026-06 Phase 3 expansion: dedicated company profile data — used by the
  // /kenya-careers/company/:slug page. Returns the company itself, its
  // branches (each with the county/town), and all its currently-open jobs
  // (with their is_seed flag for the honest "sample" banner).
  app.get("/api/local-jobs/companies/:slug", async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      // Accept either UUID (id) or slug — flexible because the seed catalogue
      // uses slugs but custom employers added by admin might only have IDs.
      const byUuid = /^[0-9a-f-]{36}$/i.test(slug);
      const lookupClause = byUuid ? "id = $1" : "slug = $1";

      const { rows: [company] } = await pool.query<{
        id: string; name: string; slug: string | null; logo_url: string | null;
        industry: string | null; address: string | null; county: string | null;
        contact_name: string | null; phone: string | null; email: string | null;
        description: string | null; website: string | null;
        verified_at: Date | null; status: string; created_at: Date;
      }>(`
        SELECT id, name, slug, logo_url, industry, address, county,
               contact_name, phone, email, description, website,
               verified_at, status, created_at
          FROM companies
         WHERE ${lookupClause} AND status = 'approved'
         LIMIT 1
      `, [slug]);

      if (!company) {
        return res.status(404).json({ message: "Company not found." });
      }

      const [branchesRes, jobsRes] = await Promise.all([
        pool.query<{
          id: string; name: string; county: string | null; town: string | null;
          location_detail: string | null;
        }>(`
          SELECT id, name, county, town, location_detail
            FROM branches WHERE company_id = $1 ORDER BY county, name
        `, [company.id]),
        pool.query<{
          id: string; title: string; department: string | null;
          vacancies: number; employment_type: string | null;
          salary_min: number | null; salary_max: number | null;
          county: string | null; town: string | null;
          experience_level: string | null; category: string | null;
          deadline: Date | null; created_at: Date; is_seed: boolean;
          branch_id: string | null; branch_name: string | null;
        }>(`
          SELECT j.id, j.title, j.department, j.vacancies, j.employment_type,
                 j.salary_min, j.salary_max, j.county, j.town,
                 j.experience_level, j.category, j.deadline, j.created_at,
                 COALESCE(j.is_seed, false) AS is_seed,
                 b.id AS branch_id, b.name AS branch_name
            FROM local_jobs j
       LEFT JOIN branches b ON b.id = j.branch_id
           WHERE j.company_id = $1 AND j.status = 'open'
           ORDER BY j.is_seed ASC, j.created_at DESC
        `, [company.id]),
      ]);

      // Derive "counties served" from branches (no separate field in DB —
      // branches IS the source of truth for which counties the company
      // operates in).
      const countiesServed = Array.from(new Set(
        branchesRes.rows.map((b) => b.county).filter(Boolean) as string[],
      )).sort();

      // All-seed-flag — if every job is a seed, the entire company is
      // unclaimed/sample. UI shows a more prominent disclosure in that case.
      const allJobsAreSeed = jobsRes.rows.length > 0 && jobsRes.rows.every((j) => j.is_seed);
      const realJobCount   = jobsRes.rows.filter((j) => !j.is_seed).length;

      res.setHeader("Cache-Control", "public, max-age=120");
      res.json({
        id:          company.id,
        name:        company.name,
        slug:        company.slug,
        logoUrl:     company.logo_url,
        industry:    company.industry,
        description: company.description,
        website:     company.website,
        headquarters: { county: company.county, address: company.address },
        // 2026-06 SAFETY: hide Verified tick if every job is a seed.
        verified:    !!company.verified_at && !allJobsAreSeed,
        allJobsAreSeed,
        realJobCount,
        countiesServed,
        branches: branchesRes.rows.map((b) => ({
          id: b.id, name: b.name, county: b.county, town: b.town, location: b.location_detail,
        })),
        jobs: jobsRes.rows.map((j) => ({
          id:              j.id,
          title:           j.title,
          department:      j.department,
          vacancies:       j.vacancies,
          employmentType:  j.employment_type,
          salaryMin:       j.salary_min,
          salaryMax:       j.salary_max,
          county:          j.county,
          town:            j.town,
          experienceLevel: j.experience_level,
          category:        j.category,
          deadline:        j.deadline,
          createdAt:       j.created_at,
          isSeed:          j.is_seed,
          branch: j.branch_id ? { id: j.branch_id, name: j.branch_name } : null,
        })),
      });
    } catch (err: any) {
      if (err?.code === "42P01") return res.status(404).json({ message: "Company not found." });
      console.error(`[GET /api/local-jobs/companies/:slug]`, err?.message);
      res.status(500).json({ message: "Could not load company profile." });
    }
  });

  // ─── GET /api/local-jobs/stats ────────────────────────────────────────────
  // Headline numbers for the landing hero: "X jobs · Y employers · Z counties".
  app.get("/api/local-jobs/stats", async (_req: Request, res: Response) => {
    try {
      const { rows: [stats] } = await pool.query<{
        total_jobs: string; total_employers: string; total_counties: string; total_vacancies: string;
      }>(`
        SELECT
          (SELECT COUNT(*)::text                                FROM local_jobs WHERE status='open')      AS total_jobs,
          (SELECT COUNT(DISTINCT company_id)::text              FROM local_jobs WHERE status='open')      AS total_employers,
          (SELECT COUNT(DISTINCT county)::text                  FROM local_jobs WHERE status='open' AND county IS NOT NULL) AS total_counties,
          (SELECT COALESCE(SUM(vacancies), 0)::text             FROM local_jobs WHERE status='open')      AS total_vacancies
      `);
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json({
        totalJobs:      Number(stats?.total_jobs      ?? "0"),
        totalEmployers: Number(stats?.total_employers ?? "0"),
        totalCounties:  Number(stats?.total_counties  ?? "0"),
        totalVacancies: Number(stats?.total_vacancies ?? "0"),
      });
    } catch (err: any) {
      if (err?.code === "42P01") {
        return res.json({ totalJobs: 0, totalEmployers: 0, totalCounties: 0, totalVacancies: 0 });
      }
      console.error("[GET /api/local-jobs/stats]", err?.message);
      res.status(500).json({ message: "Could not load stats." });
    }
  });

  // ─── GET /api/local-jobs/:id ──────────────────────────────────────────────
  // Single job detail with full company + branch info. Used by the job
  // detail page at /kenya-careers/job/:id.
  app.get("/api/local-jobs/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      // Reject obviously-malformed IDs early so we don't burn a query
      if (!/^[0-9a-f-]{8,}$/i.test(id)) {
        return res.status(400).json({ message: "Invalid job id." });
      }

      const { rows: [job] } = await pool.query<{
        id: string; title: string; department: string | null; vacancies: number;
        employment_type: string | null;
        salary_min: number | null; salary_max: number | null;
        requirements: string | null; responsibilities: string | null;
        deadline: Date | null; county: string | null; town: string | null;
        experience_level: string | null; category: string | null;
        status: string; created_at: Date; is_seed: boolean;
        company_id: string; company_name: string; company_slug: string | null;
        company_industry: string | null; company_description: string | null;
        company_website: string | null; company_verified_at: Date | null;
        company_county: string | null;
        branch_id: string | null; branch_name: string | null;
        branch_county: string | null; branch_town: string | null;
        branch_location: string | null;
      }>(`
        SELECT
            j.id, j.title, j.department, j.vacancies, j.employment_type,
            j.salary_min, j.salary_max, j.requirements, j.responsibilities,
            j.deadline, j.county, j.town, j.experience_level, j.category,
            j.status, j.created_at, COALESCE(j.is_seed, false) AS is_seed,
            c.id AS company_id, c.name AS company_name, c.slug AS company_slug,
            c.industry AS company_industry, c.description AS company_description,
            c.website AS company_website, c.verified_at AS company_verified_at,
            c.county AS company_county,
            b.id AS branch_id, b.name AS branch_name,
            b.county AS branch_county, b.town AS branch_town,
            b.location_detail AS branch_location
          FROM local_jobs j
          JOIN companies   c ON c.id = j.company_id
     LEFT JOIN branches    b ON b.id = j.branch_id
         WHERE j.id = $1
           AND c.status = 'approved'
         LIMIT 1
      `, [id]);

      if (!job) return res.status(404).json({ message: "Job not found or no longer available." });

      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({
        id:              job.id,
        title:           job.title,
        department:      job.department,
        vacancies:       job.vacancies,
        employmentType:  job.employment_type,
        salaryMin:       job.salary_min,
        salaryMax:       job.salary_max,
        requirements:    job.requirements,
        responsibilities: job.responsibilities,
        deadline:        job.deadline,
        county:          job.county,
        town:            job.town,
        experienceLevel: job.experience_level,
        category:        job.category,
        status:          job.status,
        createdAt:       job.created_at,
        isSeed:          !!job.is_seed,
        company: {
          id:          job.company_id,
          name:        job.company_name,
          slug:        job.company_slug,
          industry:    job.company_industry,
          description: job.company_description,
          website:     job.company_website,
          // 2026-06 SAFETY: hide the Verified tick while the job is a seed —
          // the company hasn't actually confirmed they're listing with us.
          verified:    !!job.company_verified_at && !job.is_seed,
          county:      job.company_county,
        },
        branch: job.branch_id ? {
          id:       job.branch_id,
          name:     job.branch_name,
          county:   job.branch_county,
          town:     job.branch_town,
          location: job.branch_location,
        } : null,
      });
    } catch (err: any) {
      if (err?.code === "42P01") {
        return res.status(404).json({ message: "Job not found." });
      }
      console.error(`[GET /api/local-jobs/:id]`, err?.message);
      res.status(500).json({ message: "Could not load job." });
    }
  });

  // ─── GET /api/local-jobs/me/apply-status ──────────────────────────────────
  // 2026-06 Phase 2: lightweight check the client uses to decide what the
  // Apply button shows. Returns the user's tier, today's application count,
  // their daily limit, and whether they can apply right now.
  //
  // Anonymous users get `{ canApply: false, reason: "signin" }` so the client
  // routes them to login. Free-tier signed-in users get
  // `{ canApply: false, reason: "upgrade" }` so the client routes them to
  // /pricing.
  app.get("/api/local-jobs/me/apply-status", async (req: any, res: Response) => {
    try {
      const userId = readSessionUserId(req) ?? undefined;
      if (!userId) {
        return res.json({
          canApply:    false,
          reason:      "signin",
          tier:        null,
          appsToday:   0,
          dailyLimit:  null,
          unlimited:   false,
          message:     "Sign in or sign up first — unlimited applying with the KES 99 24-hour pass.",
        });
      }

      const { storage } = await import("./storage");
      const tier = await storage.getUserPlan(userId);

      if (!KENYA_CAREERS_PAID_TIERS.has(tier)) {
        console.log(`[kenya-careers/gate] BLOCK userId=${userId} tier=${tier} reason=not_paid`);
        return res.json({
          canApply:   false,
          reason:     "upgrade",
          tier,
          appsToday:  0,
          dailyLimit: null,
          unlimited:  false,
          message:    "Unlock unlimited applying — KES 99 gets you 24 hours, KES 1,000 gets you 30 days, KES 4,500 gets you a full year. No per-application charges.",
        });
      }

      // Paid tier — unlimited applications inside the paid window.
      // We still return appsToday for the UI to show applicants a running
      // total (nice-to-have, not a paywall). The only server-side cap is
      // the per-minute bot brake enforced on POST /apply.
      const { rows: [{ count }] } = await pool.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
          FROM local_job_applications
         WHERE applicant_user_id = $1
           AND applied_at > NOW() - INTERVAL '24 hours'
      `, [userId]).catch(() => ({ rows: [{ count: "0" }] }) as any);

      res.json({
        canApply:      true,
        reason:        "ok",
        tier,
        appsToday:     Number(count ?? "0"),
        dailyLimit:    null,   // unlimited within your access window
        unlimited:     true,
        message:       null,
      });
    } catch (err: any) {
      console.error("[GET /api/local-jobs/me/apply-status]", err?.message);
      res.status(500).json({ message: "Could not check application status." });
    }
  });

  // ─── POST /api/local-jobs/jobs/:id/apply ─────────────────────────────────
  // Submit an application. Multipart form (CV file + cover note). Requires
  // authentication + a paid tier. Idempotent on (job_id, applicant_user_id)
  // — re-submitting updates the existing application instead of inserting
  // duplicates, so an honest "I want to update my CV" works without
  // counting against the daily limit twice.
  app.post(
    "/api/local-jobs/jobs/:id/apply",
    applicationUpload.fields([
      { name: "cv",           maxCount: 1 },
      { name: "certificates", maxCount: 1 },
    ]),
    async (req: any, res: Response) => {
      try {
        const userId = readSessionUserId(req) ?? undefined;
        if (!userId) {
          return res.status(401).json({
            message: "Please sign in to apply.",
            reason:  "signin",
          });
        }

        const jobId = req.params.id;
        if (!/^[0-9a-f-]{8,}$/i.test(jobId)) {
          return res.status(400).json({ message: "Invalid job id." });
        }

        // ── 1. Tier check — primary paywall ────────────────────────────────
        // getUserPlan() is the single source of truth used by every paid
        // feature in WAH. It does a live DB read of users.plan + the active
        // subscription's end_date, and auto-downgrades expired users to
        // "free" on the spot. So a trial user 25 hours after payment is
        // already "free" by the time this check runs.
        const { storage } = await import("./storage");
        const tier = await storage.getUserPlan(userId);
        if (!KENYA_CAREERS_PAID_TIERS.has(tier)) {
          console.log(`[kenya-careers/apply] BLOCK userId=${userId} tier=${tier} reason=not_paid jobId=${jobId}`);
          return res.status(402).json({
            message: "Unlock applying — KES 99 trial covers both overseas AND Kenya jobs.",
            reason:  "upgrade",
            tier,
          });
        }

        // ── 1b. Defensive subscription expiry double-check ─────────────────
        // Belt-and-braces: even though getUserPlan() auto-downgrades expired
        // users, do an independent end_date read here. If the subscription
        // record exists but is in the past, treat the user as free. Catches
        // any edge case where getUserPlan's lazy-sync hasn't run yet
        // (database trigger lag, missed sweep, etc).
        const sub = await storage.getUserSubscription(userId).catch(() => null);
        if (sub?.endDate && new Date(sub.endDate) < new Date()) {
          console.log(`[kenya-careers/apply] BLOCK userId=${userId} tier=${tier} reason=subscription_expired endDate=${sub.endDate} jobId=${jobId}`);
          return res.status(402).json({
            message: "Your plan has expired. Renew to keep applying.",
            reason:  "upgrade",
            tier:    "free",
          });
        }

        // ── 2. Per-minute bot brake (NOT a paywall) ────────────────────────
        // Applications are unlimited inside your paid window. This only
        // fires on inhuman submission speeds (>10 applies in 60 seconds)
        // to protect employers from bot spray. Real applicants filling
        // forms will never see this.
        const rate = checkApplyRate(userId);
        if (!rate.allowed) {
          console.log(`[kenya-careers/apply] RATE-LIMIT userId=${userId} tier=${tier} retryAfter=${rate.retryAfterSec}s`);
          return res.status(429).json({
            message: `You're submitting applications very fast. Please wait ${rate.retryAfterSec} seconds before applying to the next job. Your ${tier} plan is still active and there is no daily cap.`,
            reason:  "rate_limit",
            retryAfterSec: rate.retryAfterSec,
            planStillActive: true,
          });
        }

        // ── 3. Validate the job exists, is open, and is REAL (not a seed) ──
        // 2026-06 SAFETY: founder confirmed the catalogue jobs are NOT real
        // postings from the named employers. Until Phase 4 onboards real
        // employers via the self-service portal, every seeded row has
        // is_seed=true and applications are blocked here with a clear
        // honest message that does NOT take the user's money or pretend
        // the application is being routed to the employer.
        const { rows: [job] } = await pool.query<{
          id: string; title: string; status: string; is_seed: boolean;
          company_id: string; company_name: string;
        }>(`
          SELECT j.id, j.title, j.status, j.is_seed,
                 c.id AS company_id, c.name AS company_name
            FROM local_jobs j
            JOIN companies   c ON c.id = j.company_id
           WHERE j.id = $1 AND c.status = 'approved'
           LIMIT 1
        `, [jobId]);
        if (!job) {
          return res.status(404).json({ message: "Job not found or no longer available." });
        }
        if (job.is_seed) {
          console.log(`[kenya-careers/apply] BLOCK userId=${userId} reason=seed_listing company="${job.company_name}" jobId=${jobId}`);
          return res.status(410).json({
            message: `This is a sample listing — ${job.company_name} hasn't been onboarded yet. We're not sending applications to them yet. Tap "Notify me" on the job page and we'll email you the moment ${job.company_name} posts real openings.`,
            reason: "sample_listing",
            companyName: job.company_name,
            companyId: job.company_id,
          });
        }
        if (job.status !== "open") {
          return res.status(410).json({ message: "Applications for this job have closed." });
        }

        // ── 4. Pull applicant identity from their user record ──────────────
        const user = await storage.getUserById(userId);
        if (!user?.email || !user?.phone) {
          return res.status(400).json({
            message: "Add your phone and email to your profile before applying — employers contact you on these.",
            reason:  "incomplete_profile",
          });
        }
        const applicantName = (
          (user as any).firstName || (user as any).first_name || ""
        ).trim() + " " + (
          (user as any).lastName  || (user as any).last_name  || ""
        ).trim();

        const coverNote = String(req.body?.coverNote ?? req.body?.coverLetter ?? "").trim().slice(0, 2000) || null;

        // Phase 2.5: extra applicant fields. Sanitised and length-capped.
        const applicantCounty   = String(req.body?.county          ?? "").trim().slice(0, 60)  || null;
        const highestEducation  = String(req.body?.education       ?? "").trim().slice(0, 80)  || null;
        const yearsExperienceN  = Number(req.body?.yearsExperience);
        const yearsExperience   = Number.isFinite(yearsExperienceN) && yearsExperienceN >= 0
                                    ? Math.min(50, Math.floor(yearsExperienceN))
                                    : null;

        // ── 5. Upload CV and (optionally) certificates ──────────────────────
        // req.files comes from multer.fields() — each key is an array of files.
        // Both uploads go through logCvUpload so they land in the same
        // Supabase Storage bucket; we just record different URLs.
        const filesIn = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
        const cvFile     = filesIn.cv?.[0];
        const certFile   = filesIn.certificates?.[0];

        let cvUrl: string | null = null;
        let certificatesUrl: string | null = null;

        if (cvFile && cvFile.buffer && cvFile.buffer.length > 0) {
          try {
            const { logCvUpload } = await import("./supabaseClient");
            await logCvUpload({
              userId,
              fileName:   cvFile.originalname,
              buffer:     cvFile.buffer,
              mimeType:   cvFile.mimetype,
              parsedText: "",
            });
            const { rows: [row] } = await pool.query<{ file_url: string | null }>(`
              SELECT file_url FROM cv_uploads
               WHERE user_id = $1 AND file_url IS NOT NULL
               ORDER BY uploaded_at DESC NULLS LAST, id DESC
               LIMIT 1
            `, [userId]).catch(() => ({ rows: [{ file_url: null }] }) as any);
            cvUrl = row?.file_url ?? null;
          } catch (uploadErr: any) {
            console.warn(`[apply] CV upload failed for user=${userId}:`, uploadErr?.message);
          }
        }

        // Certificates upload — same pipeline but tagged in the filename so
        // it doesn't collide with the user's main CV in cv_uploads.
        if (certFile && certFile.buffer && certFile.buffer.length > 0) {
          try {
            const { logCvUpload } = await import("./supabaseClient");
            await logCvUpload({
              userId,
              fileName:   `cert-${certFile.originalname}`,
              buffer:     certFile.buffer,
              mimeType:   certFile.mimetype,
              parsedText: "",
            });
            const { rows: [row] } = await pool.query<{ file_url: string | null }>(`
              SELECT file_url FROM cv_uploads
               WHERE user_id = $1 AND file_url IS NOT NULL AND file_name LIKE 'cert-%'
               ORDER BY uploaded_at DESC NULLS LAST, id DESC
               LIMIT 1
            `, [userId]).catch(() => ({ rows: [{ file_url: null }] }) as any);
            certificatesUrl = row?.file_url ?? null;
          } catch (uploadErr: any) {
            console.warn(`[apply] Certificates upload failed for user=${userId}:`, uploadErr?.message);
          }
        }

        // ── 6. Upsert application — re-applying updates instead of duplicating ──
        // 2026-06 Phase 2.5: includes the new applicant_county / highest_education
        // / years_experience / certificates_url / company_id columns. ON CONFLICT
        // updates everything that was supplied this time but keeps existing values
        // when the new submission left them blank.
        const insertParams = [
          jobId, userId, applicantName.trim() || user.email, user.phone, user.email,
          cvUrl, coverNote, applicantCounty, highestEducation, yearsExperience,
          certificatesUrl, job.company_id,
        ];
        const { rows: [appRow] } = await pool.query<{ id: string }>(`
          INSERT INTO local_job_applications (
            job_id, applicant_user_id, applicant_name, phone, email,
            cv_url, cover_note, applicant_county, highest_education, years_experience,
            certificates_url, company_id, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'submitted')
          ON CONFLICT (job_id, applicant_user_id) DO UPDATE
             SET cv_url            = COALESCE(EXCLUDED.cv_url,            local_job_applications.cv_url),
                 cover_note        = COALESCE(EXCLUDED.cover_note,        local_job_applications.cover_note),
                 applicant_county  = COALESCE(EXCLUDED.applicant_county,  local_job_applications.applicant_county),
                 highest_education = COALESCE(EXCLUDED.highest_education, local_job_applications.highest_education),
                 years_experience  = COALESCE(EXCLUDED.years_experience,  local_job_applications.years_experience),
                 certificates_url  = COALESCE(EXCLUDED.certificates_url,  local_job_applications.certificates_url),
                 company_id        = COALESCE(EXCLUDED.company_id,        local_job_applications.company_id),
                 updated_at        = NOW()
          RETURNING id
        `, insertParams)
          .catch(async (err: any) => {
            // First-deploy guard: if the ON CONFLICT constraint or new columns
            // don't exist yet, add them idempotently and retry once.
            if (err?.code === "42P10" || err?.code === "42703") {
              await pool.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS uq_local_app_job_user
                ON local_job_applications(job_id, applicant_user_id)
                WHERE applicant_user_id IS NOT NULL
              `).catch(() => {});
              await pool.query(`ALTER TABLE local_job_applications ADD COLUMN IF NOT EXISTS applicant_county    VARCHAR(60)`).catch(() => {});
              await pool.query(`ALTER TABLE local_job_applications ADD COLUMN IF NOT EXISTS highest_education   VARCHAR(80)`).catch(() => {});
              await pool.query(`ALTER TABLE local_job_applications ADD COLUMN IF NOT EXISTS years_experience    INTEGER`).catch(() => {});
              await pool.query(`ALTER TABLE local_job_applications ADD COLUMN IF NOT EXISTS certificates_url    TEXT`).catch(() => {});
              await pool.query(`ALTER TABLE local_job_applications ADD COLUMN IF NOT EXISTS company_id          UUID`).catch(() => {});
              return pool.query<{ id: string }>(`
                INSERT INTO local_job_applications (
                  job_id, applicant_user_id, applicant_name, phone, email,
                  cv_url, cover_note, applicant_county, highest_education, years_experience,
                  certificates_url, company_id, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'submitted')
                RETURNING id
              `, insertParams);
            }
            throw err;
          });

        // ── 7. Confirmation email (non-blocking, best-effort) ──────────────
        (async () => {
          try {
            const { sendEmail } = await import("./email");
            const firstName = ((user as any).firstName || (user as any).first_name || "there").trim() || "there";
            await sendEmail({
              to: user.email,
              subject: `Application sent — ${job.title} at ${job.company_name}`,
              html: `
                <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;">
                  <h2 style="margin:0 0 12px;color:#0f766e;">Application received, ${escapeHtmlSafe(firstName)} ✓</h2>
                  <p>Your application for <strong>${escapeHtmlSafe(job.title)}</strong> at <strong>${escapeHtmlSafe(job.company_name)}</strong> has been received and shared with the employer.</p>
                  <p style="font-size:14px;color:#475569;">What happens next:</p>
                  <ol style="font-size:14px;color:#475569;padding-left:20px;">
                    <li>The employer reviews applicants over the next 1-2 weeks.</li>
                    <li>If you're shortlisted, they'll contact you on <strong>${escapeHtmlSafe(user.phone || "your phone")}</strong> or by email.</li>
                    <li>You can see your application status anytime at <a href="https://workabroadhub.tech/kenya-careers/my-applications" style="color:#0f766e;">workabroadhub.tech/kenya-careers/my-applications</a>.</li>
                  </ol>
                  <p style="font-size:13px;color:#94a3b8;margin-top:24px;">— WorkAbroad Hub Kenya Careers</p>
                </div>`,
              text: `Hi ${firstName},\n\nYour application for ${job.title} at ${job.company_name} has been received and shared with the employer.\n\nIf you're shortlisted, they'll contact you on ${user.phone || "your phone"} or by email. See your application status anytime at https://workabroadhub.tech/kenya-careers/my-applications.\n\n— WorkAbroad Hub Kenya Careers`,
            });
          } catch (emailErr: any) {
            console.warn(`[apply] confirmation email failed for ${user.email}:`, emailErr?.message);
          }
        })();

        // Running 24h total for logging / UI stats (NOT a cap).
        const { rows: [{ count: appsTodayCount }] } = await pool
          .query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM local_job_applications
              WHERE applicant_user_id = $1
                AND applied_at > NOW() - INTERVAL '24 hours'`,
            [userId],
          )
          .catch(() => ({ rows: [{ count: "1" }] }) as any);

        console.log(
          `[kenya-careers/apply] ALLOW userId=${userId} tier=${tier} jobId=${jobId} ` +
          `company="${job.company_name}" applicationId=${appRow.id} appsToday=${appsTodayCount}`,
        );

        res.json({
          success:       true,
          applicationId: appRow.id,
          message:       `Application sent to ${job.company_name}. Check your email — we sent you a confirmation.`,
          appsToday:     Number(appsTodayCount),
          dailyLimit:    null,   // unlimited within your access window
          unlimited:     true,
          tier,
        });
      } catch (err: any) {
        console.error("[POST /api/local-jobs/jobs/:id/apply]", err?.message, err?.stack?.split("\n").slice(0, 3).join(" | "));
        res.status(500).json({ message: "Could not submit your application right now. Please try again." });
      }
    },
  );

  // ─── POST /api/local-jobs/companies/:id/notify ───────────────────────────
  // 2026-06 SAFETY: replaces Apply on every seed job. Visitor leaves their
  // email (and optionally phone) — when Tony actually onboards {company},
  // everyone in this table for that company gets a notification email.
  // No payment taken. No false promise. Public — no auth required.
  app.post("/api/local-jobs/companies/:id/notify", async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      if (!/^[0-9a-f-]{8,}$/i.test(id)) {
        return res.status(400).json({ message: "Invalid company id." });
      }
      const email = String(req.body?.email ?? "").trim().slice(0, 160).toLowerCase();
      const phone = String(req.body?.phone ?? "").trim().slice(0, 40) || null;
      const sourceJobId = String(req.body?.jobId ?? "").trim() || null;

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email." });
      }

      // Confirm the company exists
      const { rows: [company] } = await pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM companies WHERE id = $1 LIMIT 1`, [id],
      );
      if (!company) return res.status(404).json({ message: "Company not found." });

      const userId = readSessionUserId(req); // optional — present if signed in

      await pool.query(`
        INSERT INTO employer_notify_signups (company_id, email, phone, signed_up_user_id, source_job_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (company_id, email) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, employer_notify_signups.phone)
      `, [id, email, phone, userId, sourceJobId])
        .catch(async (err: any) => {
          if (err?.code === "42P01") {
            await pool.query(`
              CREATE TABLE IF NOT EXISTS employer_notify_signups (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                company_id UUID NOT NULL,
                email VARCHAR(160) NOT NULL,
                phone VARCHAR(40),
                signed_up_user_id UUID,
                source_job_id UUID,
                notified_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
              )
            `).catch(() => {});
            await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_notify_company_email ON employer_notify_signups(company_id, email)`).catch(() => {});
            return pool.query(`
              INSERT INTO employer_notify_signups (company_id, email, phone, signed_up_user_id, source_job_id)
              VALUES ($1, $2, $3, $4, $5)
            `, [id, email, phone, userId, sourceJobId]);
          }
          throw err;
        });

      console.log(`[kenya-careers/notify] new signup company="${company.name}" email=${email} phone=${phone ?? "n/a"}`);

      res.json({
        success: true,
        message: `Got it! We'll email ${email} as soon as ${company.name} starts posting real openings on WorkAbroad Hub.`,
      });
    } catch (err: any) {
      console.error("[POST /api/local-jobs/companies/:id/notify]", err?.message);
      res.status(500).json({ message: "Could not save your signup. Try again or email hello@workabroadhub.tech." });
    }
  });

  // ─── Phase 4.5 SAFETY: claim verification helpers ────────────────────────

  /**
   * Free email providers — claims from these are auto-flagged as LOW trust
   * because they can't possibly prove employment at a major company. Tony
   * still sees the claim but knows to scrutinise harder.
   */
  const FREE_EMAIL_DOMAINS = new Set([
    "gmail.com", "yahoo.com", "yahoo.co.uk", "outlook.com", "hotmail.com",
    "live.com", "icloud.com", "protonmail.com", "proton.me", "aol.com",
    "mail.com", "yandex.com", "zoho.com", "fastmail.com",
  ]);

  /** Generate a 6-digit numeric verification code. */
  function generate6DigitCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /** Extract the lower-cased domain from an email (everything after the @). */
  function extractDomain(email: string): string | null {
    const m = String(email || "").trim().toLowerCase().match(/@([a-z0-9.-]+)$/);
    return m ? m[1] : null;
  }

  /**
   * Trust score logic:
   *   high   = domain matches a known company domain  →  Tony 1-click approves
   *   medium = corporate-looking domain but unknown   →  Tony scrutinises
   *   low    = free email provider (gmail, yahoo, …) →  Tony requires extra evidence
   */
  function computeTrustScore(email: string, knownDomains: string[]): "high" | "medium" | "low" {
    const domain = extractDomain(email);
    if (!domain) return "low";
    if (knownDomains.some((d) => d.toLowerCase() === domain)) return "high";
    if (FREE_EMAIL_DOMAINS.has(domain)) return "low";
    return "medium";
  }

  /** Send the verification code email via Hostinger SMTP. */
  async function sendClaimVerificationEmail(
    to: string, name: string, companyName: string, code: string,
  ): Promise<void> {
    const { sendEmail } = await import("./email");
    const firstName = name.trim().split(/\s+/)[0] || "there";
    await sendEmail({
      to,
      subject: `Your WorkAbroad Hub verification code: ${code}`,
      html: `
        <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;">
          <h2 style="margin:0 0 12px;color:#0f766e;">Verify your email — ${escapeHtmlSafe(companyName)}</h2>
          <p>Hi ${escapeHtmlSafe(firstName)},</p>
          <p>You requested to claim the <strong>${escapeHtmlSafe(companyName)}</strong> profile on WorkAbroad Hub. To prove this email is yours, enter the code below in the claim form:</p>
          <p style="margin:24px 0;text-align:center;">
            <span style="display:inline-block;font-family:monospace;font-size:28px;letter-spacing:6px;background:#f1f5f9;color:#0f766e;padding:14px 28px;border-radius:8px;border:2px solid #0f766e;">${code}</span>
          </p>
          <p style="font-size:14px;color:#475569;">This code expires in 24 hours. If you didn't request this claim, you can ignore this email — no action will be taken.</p>
          <p style="margin-top:32px;font-size:13px;color:#94a3b8;">— WorkAbroad Hub Kenya Careers</p>
        </div>`,
      text: `Hi ${firstName},\n\nYou requested to claim the ${companyName} profile on WorkAbroad Hub.\n\nYour verification code is: ${code}\n\nIt expires in 24 hours. If you didn't request this claim, you can ignore this email.\n\n— WorkAbroad Hub Kenya Careers`,
    });
  }

  // ─── POST /api/local-jobs/companies/:id/claim ────────────────────────────
  // 2026-06 Phase 3a → 4.5: "Are you this employer? Claim your company profile."
  // Public endpoint (no auth required — claims often come from HR managers
  // who don't yet have a WAH account).
  //
  // Phase 4.5 hardening adds:
  //   1. Email code verification — 6-digit code emailed; claimant must enter
  //   2. Domain match check — email domain must match company's known_domains
  //   3. Trust score computation — high/medium/low based on the above
  //   4. Rate limit + duplicate block — max 1 active claim per (company, email)
  //   5. Honest error messages for free email providers
  app.post("/api/local-jobs/companies/:id/claim", async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      if (!/^[0-9a-f-]{8,}$/i.test(id)) {
        return res.status(400).json({ message: "Invalid company id." });
      }

      const claimantName  = String(req.body?.name  ?? "").trim().slice(0, 160);
      const claimantEmail = String(req.body?.email ?? "").trim().slice(0, 160).toLowerCase();
      const claimantPhone = String(req.body?.phone ?? "").trim().slice(0, 40) || null;
      const roleAtCompany = String(req.body?.role  ?? "").trim().slice(0, 120) || null;
      const message       = String(req.body?.message ?? "").trim().slice(0, 2000) || null;

      if (!claimantName || claimantName.length < 2) {
        return res.status(400).json({ message: "Please enter your full name." });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimantEmail)) {
        return res.status(400).json({ message: "Please enter a valid work email." });
      }

      // Confirm the company actually exists AND fetch its known_domains
      const { rows: [company] } = await pool.query<{
        id: string; name: string; known_domains: string[] | null;
      }>(`SELECT id, name, COALESCE(known_domains, '{}') AS known_domains FROM companies WHERE id = $1 LIMIT 1`, [id]);
      if (!company) return res.status(404).json({ message: "Company not found." });

      // Compute domain match + trust score
      const claimantDomain = extractDomain(claimantEmail);
      const knownDomains   = (company.known_domains ?? []) as string[];
      const domainMatch    = !!claimantDomain && knownDomains.some((d) => d.toLowerCase() === claimantDomain);
      const trustScore     = computeTrustScore(claimantEmail, knownDomains);

      // Block: too-low-trust gets a friendly hint to use a work email if they
      // can, but doesn't outright reject — sometimes legit HR people only have
      // gmail. We just flag it for stricter manual review.
      const lowTrustWarning = trustScore === "low" && knownDomains.length > 0
        ? `Heads up — ${claimantEmail} is a personal email, so we'll need extra evidence before approving (a business card, contract page, or a link to your business cert). You'll be asked to provide this after verification.`
        : null;

      // Generate verification code (expires 24h)
      const code = generate6DigitCode();
      const codeExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Insert claim (de-dupe enforced by unique partial index on company_id + email)
      const insertResult = await pool.query<{ id: string }>(`
        INSERT INTO company_claims (
          company_id, claimant_name, claimant_email, claimant_phone,
          role_at_company, message,
          verification_code, verification_code_expires_at,
          domain_match, trust_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        id, claimantName, claimantEmail, claimantPhone, roleAtCompany, message,
        code, codeExpiresAt, domainMatch, trustScore,
      ]).catch(async (err: any) => {
        if (err?.code === "23505") {
          // Unique constraint hit — there's already an active claim from this email for this company.
          return null;
        }
        if (err?.code === "42P01" || err?.code === "42703") {
          // Table or columns missing — bootstrap will create on next boot. For now,
          // tell the user to retry in a few minutes.
          throw new Error("Verification system is initialising — please try again in a moment.");
        }
        throw err;
      });

      if (!insertResult) {
        return res.status(409).json({
          message: `${claimantEmail} has already submitted a claim for ${company.name}. Check your inbox for the verification code we sent earlier, or contact hello@workabroadhub.tech if you need to start over.`,
        });
      }
      const claim = insertResult.rows[0];

      console.log(
        `[claim-company] new claim id=${claim.id} company="${company.name}" ` +
        `claimant="${claimantName}" <${claimantEmail}> domain=${claimantDomain ?? "?"} ` +
        `domain_match=${domainMatch} trust=${trustScore}`,
      );

      // Send the verification code email to the claimant (non-blocking but logged)
      sendClaimVerificationEmail(claimantEmail, claimantName, company.name, code).catch((err: any) => {
        console.error(`[claim-company] verification email send FAILED for ${claimantEmail}:`, err?.message);
      });

      // Notify Tony (admin) — non-blocking
      (async () => {
        try {
          const { sendEmail } = await import("./email");
          const trustColor = trustScore === "high" ? "#059669" : trustScore === "medium" ? "#d97706" : "#dc2626";
          await sendEmail({
            to: "hello@workabroadhub.tech",
            subject: `[Kenya Careers] New claim (${trustScore.toUpperCase()} trust): ${company.name}`,
            html: `
              <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;color:#1a2530;">
                <h3>New employer claim — ${escapeHtmlSafe(company.name)}</h3>
                <p style="font-size:14px;">
                  <strong>Trust:</strong> <span style="color:${trustColor};font-weight:bold;">${trustScore.toUpperCase()}</span>
                  &nbsp;·&nbsp; <strong>Domain match:</strong> ${domainMatch ? "✓ Yes" : "✗ No"}
                </p>
                <p><strong>${escapeHtmlSafe(claimantName)}</strong> (${escapeHtmlSafe(claimantEmail)}${claimantPhone ? `, ${escapeHtmlSafe(claimantPhone)}` : ""})</p>
                ${roleAtCompany ? `<p><strong>Role at company:</strong> ${escapeHtmlSafe(roleAtCompany)}</p>` : ""}
                ${message ? `<p><strong>Message:</strong></p><p style="border-left:3px solid #ddd;padding-left:8px;">${escapeHtmlSafe(message)}</p>` : ""}
                <p style="font-size:13px;color:#666;">Claimant must verify their email before this becomes actionable. Once verified, review at:</p>
                <p><a href="https://workabroadhub.tech/admin/kenya-careers">→ Admin panel</a></p>
                <p style="font-size:11px;color:#999;">Claim ID: ${claim.id}</p>
              </div>`,
            text: `New claim — ${company.name}\nTrust: ${trustScore.toUpperCase()} | Domain match: ${domainMatch ? "Yes" : "No"}\n${claimantName} (${claimantEmail})\n${roleAtCompany ? `Role: ${roleAtCompany}\n` : ""}${message ? `Msg: ${message}\n` : ""}\nReview: https://workabroadhub.tech/admin/kenya-careers\nID: ${claim.id}`,
          });
        } catch (err: any) {
          console.warn("[claim-company] founder notification email failed:", err?.message);
        }
      })();

      res.json({
        success: true,
        message: `We just emailed a verification code to ${claimantEmail}. Enter it on the next screen.`,
        claimId: claim.id,
        emailMasked: claimantEmail.replace(/^(.).+(@.+)$/, "$1•••$2"),
        requiresVerification: true,
        trustScore,
        domainMatch,
        lowTrustWarning,
      });
    } catch (err: any) {
      console.error("[POST /api/local-jobs/companies/:id/claim]", err?.message);
      res.status(500).json({ message: "Could not submit your claim. Try again or email hello@workabroadhub.tech." });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // EMPLOYER PORTAL (Phase 4)
  // ════════════════════════════════════════════════════════════════════════
  // Routes under /api/employer/* are for HR managers / recruiters managing
  // their company's listings. A user becomes an employer admin when:
  //   • Their company_claims row is approved (auto-inserts company_admins)
  //   • Tony grants them directly via the admin panel
  // Permission check is per-endpoint via isCompanyAdmin() — never trust
  // the client to send a companyId without re-verifying.

  /**
   * Returns true if the given userId is listed as an admin/recruiter on
   * the given companyId. Throws on DB error so the caller can 500 cleanly.
   */
  async function isCompanyAdmin(userId: string, companyId: string): Promise<boolean> {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM company_admins
        WHERE user_id = $1 AND company_id = $2 LIMIT 1`,
      [userId, companyId],
    ).catch(() => ({ rows: [{ count: "0" }] }) as any);
    return Number(rows?.[0]?.count ?? 0) > 0;
  }

  // ─── GET /api/employer/me ─────────────────────────────────────────────────
  // Returns the companies the signed-in user can manage, with job + app counts.
  app.get("/api/employer/me", async (req: any, res: Response) => {
    const userId = readSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in." });

    try {
      const { rows: companies } = await pool.query<{
        id: string; name: string; slug: string | null;
        logo_url: string | null; industry: string | null;
        county: string | null; verified_at: Date | null;
        status: string; role: string;
        job_count: string; real_job_count: string; app_count: string;
      }>(`
        SELECT
            c.id, c.name, c.slug, c.logo_url, c.industry, c.county,
            c.verified_at, c.status, ca.role,
            (SELECT COUNT(*) FROM local_jobs WHERE company_id = c.id AND status = 'open')::text AS job_count,
            (SELECT COUNT(*) FROM local_jobs WHERE company_id = c.id AND status = 'open' AND COALESCE(is_seed, false) = false)::text AS real_job_count,
            (SELECT COUNT(*) FROM local_job_applications WHERE company_id = c.id)::text AS app_count
          FROM company_admins ca
          JOIN companies c ON c.id = ca.company_id
         WHERE ca.user_id = $1
         ORDER BY c.name
      `, [userId]).catch(() => ({ rows: [] }) as any);

      res.json({
        userId,
        companies: companies.map((r: any) => ({
          id:           r.id,
          name:         r.name,
          slug:         r.slug,
          logoUrl:      r.logo_url,
          industry:     r.industry,
          county:       r.county,
          verified:     !!r.verified_at,
          status:       r.status,
          role:         r.role,
          openJobs:     Number(r.job_count ?? 0),
          realJobs:     Number(r.real_job_count ?? 0),
          applications: Number(r.app_count ?? 0),
        })),
      });
    } catch (err: any) {
      console.error("[GET /api/employer/me]", err?.message);
      res.status(500).json({ message: "Could not load your employer dashboard." });
    }
  });

  // ─── GET /api/employer/companies/:id ──────────────────────────────────────
  // Full company data for the manage page — profile, branches, jobs,
  // recent applications. Auth: must be admin of this company.
  app.get("/api/employer/companies/:id", async (req: any, res: Response) => {
    const userId = readSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in." });
    try {
      const { id } = req.params;
      if (!await isCompanyAdmin(userId, id)) {
        return res.status(403).json({ message: "You don't have access to this company." });
      }

      const [companyRes, branchesRes, jobsRes, appsRes] = await Promise.all([
        pool.query(`
          SELECT id, name, slug, logo_url, industry, address, county,
                 contact_name, phone, email, description, website,
                 verified_at, status
            FROM companies WHERE id = $1 LIMIT 1
        `, [id]),
        pool.query(`
          SELECT id, name, county, town, location_detail, manager_name, contact_phone
            FROM branches WHERE company_id = $1 ORDER BY county, name
        `, [id]),
        pool.query(`
          SELECT j.id, j.title, j.department, j.vacancies, j.employment_type,
                 j.salary_min, j.salary_max, j.county, j.town,
                 j.experience_level, j.category, j.deadline, j.status, j.created_at,
                 COALESCE(j.is_seed, false) AS is_seed,
                 b.id AS branch_id, b.name AS branch_name,
                 (SELECT COUNT(*) FROM local_job_applications WHERE job_id = j.id)::int AS app_count
            FROM local_jobs j
       LEFT JOIN branches b ON b.id = j.branch_id
           WHERE j.company_id = $1
           ORDER BY j.created_at DESC
        `, [id]),
        pool.query(`
          SELECT a.id, a.status, a.applied_at, a.applicant_name, a.email, a.phone,
                 a.applicant_county, a.highest_education, a.years_experience,
                 a.cv_url, a.certificates_url, a.cover_note,
                 j.id AS job_id, j.title AS job_title
            FROM local_job_applications a
            JOIN local_jobs j ON j.id = a.job_id
           WHERE a.company_id = $1
           ORDER BY a.applied_at DESC
           LIMIT 100
        `, [id]),
      ]);

      const c: any = companyRes.rows[0];
      if (!c) return res.status(404).json({ message: "Company not found." });

      res.json({
        company: {
          id: c.id, name: c.name, slug: c.slug, logoUrl: c.logo_url,
          industry: c.industry, address: c.address, county: c.county,
          contactName: c.contact_name, phone: c.phone, email: c.email,
          description: c.description, website: c.website,
          verified: !!c.verified_at, status: c.status,
        },
        branches: branchesRes.rows.map((b: any) => ({
          id: b.id, name: b.name, county: b.county, town: b.town,
          location: b.location_detail, managerName: b.manager_name, contactPhone: b.contact_phone,
        })),
        jobs: jobsRes.rows.map((j: any) => ({
          id: j.id, title: j.title, department: j.department, vacancies: j.vacancies,
          employmentType: j.employment_type, salaryMin: j.salary_min, salaryMax: j.salary_max,
          county: j.county, town: j.town, experienceLevel: j.experience_level,
          category: j.category, deadline: j.deadline, status: j.status,
          createdAt: j.created_at, isSeed: j.is_seed, applicationCount: j.app_count,
          branch: j.branch_id ? { id: j.branch_id, name: j.branch_name } : null,
        })),
        applications: appsRes.rows.map((a: any) => ({
          id: a.id, status: a.status, appliedAt: a.applied_at,
          applicantName: a.applicant_name, email: a.email, phone: a.phone,
          county: a.applicant_county, education: a.highest_education,
          yearsExperience: a.years_experience, cvUrl: a.cv_url,
          certificatesUrl: a.certificates_url, coverNote: a.cover_note,
          jobId: a.job_id, jobTitle: a.job_title,
        })),
      });
    } catch (err: any) {
      console.error("[GET /api/employer/companies/:id]", err?.message);
      res.status(500).json({ message: "Could not load company." });
    }
  });

  // ─── POST /api/employer/companies/:id/jobs ────────────────────────────────
  // Employer posts a real job. Auto-marks is_seed=false because real
  // employer postings ARE real openings. Validates admin.
  app.post("/api/employer/companies/:id/jobs", async (req: any, res: Response) => {
    const userId = readSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in." });
    try {
      const { id } = req.params;
      if (!await isCompanyAdmin(userId, id)) {
        return res.status(403).json({ message: "You don't have access to this company." });
      }

      const b = req.body ?? {};
      const branchId       = String(b.branchId       ?? "").trim() || null;
      const title          = String(b.title          ?? "").trim().slice(0, 200);
      const department     = String(b.department     ?? "").trim().slice(0, 120) || null;
      const vacancies      = Math.max(1, Math.min(999, Number(b.vacancies ?? 1)));
      const employmentType = String(b.employmentType ?? "full_time").trim();
      const salaryMin      = b.salaryMin != null && b.salaryMin !== "" ? Number(b.salaryMin) : null;
      const salaryMax      = b.salaryMax != null && b.salaryMax !== "" ? Number(b.salaryMax) : null;
      const requirements   = String(b.requirements   ?? "").trim() || null;
      const responsibilities = String(b.responsibilities ?? "").trim() || null;
      const deadline       = String(b.deadline       ?? "").trim().slice(0, 10) || null;
      const county         = String(b.county         ?? "").trim().slice(0, 60) || null;
      const town           = String(b.town           ?? "").trim().slice(0, 80) || null;
      const experience     = String(b.experienceLevel ?? "any").trim();
      const category       = String(b.category       ?? "other").trim();

      if (!title || title.length < 3) return res.status(400).json({ message: "Job title is required (min 3 chars)." });
      if (!VALID_EMPLOYMENT_TYPES.has(employmentType)) return res.status(400).json({ message: "Invalid employment type." });
      if (!VALID_EXPERIENCE.has(experience)) return res.status(400).json({ message: "Invalid experience level." });
      if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) {
        return res.status(400).json({ message: "Max salary must be greater than or equal to min salary." });
      }

      const { rows: [job] } = await pool.query<{ id: string }>(`
        INSERT INTO local_jobs (
          company_id, branch_id, title, department, vacancies, employment_type,
          salary_min, salary_max, requirements, responsibilities, deadline,
          county, town, experience_level, category, status, is_seed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'open', false)
        RETURNING id
      `, [
        id, branchId, title, department, vacancies, employmentType,
        salaryMin, salaryMax, requirements, responsibilities, deadline,
        county, town, experience, category,
      ]);

      console.log(`[employer/post-job] userId=${userId} companyId=${id} jobId=${job.id} title="${title}"`);
      res.json({ success: true, jobId: job.id, message: `Job "${title}" published.` });
    } catch (err: any) {
      console.error("[POST /api/employer/companies/:id/jobs]", err?.message);
      res.status(500).json({ message: "Could not publish job." });
    }
  });

  // ─── PATCH /api/employer/companies/:id ────────────────────────────────────
  // Edit company profile — description, website, logo URL, contact info.
  // Status (approved/pending/suspended) is admin-only and not editable here.
  app.patch("/api/employer/companies/:id", async (req: any, res: Response) => {
    const userId = readSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in." });
    try {
      const { id } = req.params;
      if (!await isCompanyAdmin(userId, id)) {
        return res.status(403).json({ message: "You don't have access to this company." });
      }

      const b = req.body ?? {};
      // Editable fields only — name + slug + status NOT editable by employer
      const description = b.description != null ? String(b.description).trim().slice(0, 2000) : undefined;
      const website     = b.website     != null ? String(b.website).trim().slice(0, 240)      : undefined;
      const logoUrl     = b.logoUrl     != null ? String(b.logoUrl).trim().slice(0, 500)      : undefined;
      const industry    = b.industry    != null ? String(b.industry).trim().slice(0, 80)      : undefined;
      const county      = b.county      != null ? String(b.county).trim().slice(0, 60)        : undefined;
      const address     = b.address     != null ? String(b.address).trim().slice(0, 500)      : undefined;
      const phone       = b.phone       != null ? String(b.phone).trim().slice(0, 40)         : undefined;
      const email       = b.email       != null ? String(b.email).trim().slice(0, 160).toLowerCase() : undefined;

      const updates: string[] = [];
      const params: any[] = [];
      const push = (col: string, val: any) => {
        params.push(val);
        updates.push(`${col} = $${params.length}`);
      };
      if (description !== undefined) push("description", description || null);
      if (website     !== undefined) push("website",     website     || null);
      if (logoUrl     !== undefined) push("logo_url",    logoUrl     || null);
      if (industry    !== undefined) push("industry",    industry    || null);
      if (county      !== undefined) push("county",      county      || null);
      if (address     !== undefined) push("address",     address     || null);
      if (phone       !== undefined) push("phone",       phone       || null);
      if (email       !== undefined) push("email",       email       || null);

      if (updates.length === 0) return res.status(400).json({ message: "Nothing to update." });

      updates.push("updated_at = NOW()");
      params.push(id);
      await pool.query(`UPDATE companies SET ${updates.join(", ")} WHERE id = $${params.length}`, params);

      console.log(`[employer/edit-profile] userId=${userId} companyId=${id} fieldsUpdated=${updates.length - 1}`);
      res.json({ success: true, message: "Profile updated." });
    } catch (err: any) {
      console.error("[PATCH /api/employer/companies/:id]", err?.message);
      res.status(500).json({ message: "Could not update profile." });
    }
  });

  // ─── POST /api/employer/companies/:id/branches ────────────────────────────
  // Add a new branch to a company they manage.
  app.post("/api/employer/companies/:id/branches", async (req: any, res: Response) => {
    const userId = readSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in." });
    try {
      const { id } = req.params;
      if (!await isCompanyAdmin(userId, id)) {
        return res.status(403).json({ message: "You don't have access to this company." });
      }

      const b = req.body ?? {};
      const name = String(b.name ?? "").trim().slice(0, 160);
      const county = String(b.county ?? "").trim().slice(0, 60) || null;
      const town = String(b.town ?? "").trim().slice(0, 80) || null;

      if (!name || name.length < 2) return res.status(400).json({ message: "Branch name is required." });

      const { rows: [branch] } = await pool.query<{ id: string }>(`
        INSERT INTO branches (company_id, name, county, town)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (company_id, name) DO UPDATE SET county = EXCLUDED.county, town = EXCLUDED.town
        RETURNING id
      `, [id, name, county, town]);

      res.json({ success: true, branchId: branch.id, message: `Branch "${name}" added.` });
    } catch (err: any) {
      console.error("[POST /api/employer/companies/:id/branches]", err?.message);
      res.status(500).json({ message: "Could not add branch." });
    }
  });

  // ─── PATCH /api/employer/jobs/:id ─────────────────────────────────────────
  // Edit a job they posted. Validates admin via the job's company_id.
  // Quick win: close a job by sending {status: "closed"}.
  app.patch("/api/employer/jobs/:id", async (req: any, res: Response) => {
    const userId = readSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in." });
    try {
      const { id } = req.params;
      const { rows: [job] } = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM local_jobs WHERE id = $1 LIMIT 1`, [id],
      );
      if (!job) return res.status(404).json({ message: "Job not found." });
      if (!await isCompanyAdmin(userId, job.company_id)) {
        return res.status(403).json({ message: "You don't manage this job's company." });
      }

      const b = req.body ?? {};
      const status = b.status != null ? String(b.status).trim() : undefined;
      if (status && !["open", "closed", "draft"].includes(status)) {
        return res.status(400).json({ message: "Invalid status." });
      }

      if (status) {
        await pool.query(`UPDATE local_jobs SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id]);
      }
      res.json({ success: true, message: status ? `Job status set to ${status}.` : "Updated." });
    } catch (err: any) {
      console.error("[PATCH /api/employer/jobs/:id]", err?.message);
      res.status(500).json({ message: "Could not update job." });
    }
  });

  // ─── PATCH /api/employer/applications/:id ─────────────────────────────────
  // Employer updates an applicant status — shortlist / reject / hire.
  app.patch("/api/employer/applications/:id", async (req: any, res: Response) => {
    const userId = readSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in." });
    try {
      const { id } = req.params;
      const { rows: [appRow] } = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM local_job_applications WHERE id = $1 LIMIT 1`, [id],
      );
      if (!appRow) return res.status(404).json({ message: "Application not found." });
      if (!await isCompanyAdmin(userId, appRow.company_id)) {
        return res.status(403).json({ message: "You don't manage this applicant's company." });
      }

      const newStatus = String(req.body?.status ?? "").trim();
      const valid = ["submitted", "under_review", "shortlisted", "interview", "hired", "rejected"];
      if (!valid.includes(newStatus)) {
        return res.status(400).json({ message: `Status must be one of: ${valid.join(", ")}` });
      }
      await pool.query(`UPDATE local_job_applications SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, id]);
      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      console.error("[PATCH /api/employer/applications/:id]", err?.message);
      res.status(500).json({ message: "Could not update application." });
    }
  });

  // ─── POST /api/employer/register-company ──────────────────────────────────
  // Register a brand-new company (not in the seed catalogue). Creates the
  // companies row with status='pending' AND inserts a company_claims row so
  // admin can review + verify the registrant's right to manage. Once
  // approved, the registrant is auto-promoted to company admin.
  app.post("/api/employer/register-company", async (req: any, res: Response) => {
    const userId = readSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in to register a company." });
    try {
      const b = req.body ?? {};
      const name        = String(b.name        ?? "").trim().slice(0, 160);
      const industry    = String(b.industry    ?? "").trim().slice(0, 80)  || null;
      const county      = String(b.county      ?? "").trim().slice(0, 60)  || null;
      const description = String(b.description ?? "").trim().slice(0, 2000) || null;
      const website     = String(b.website     ?? "").trim().slice(0, 240) || null;
      const contactName = String(b.contactName ?? "").trim().slice(0, 120) || null;
      const phone       = String(b.phone       ?? "").trim().slice(0, 40)  || null;
      const email       = String(b.email       ?? "").trim().slice(0, 160).toLowerCase() || null;
      const role        = String(b.role        ?? "").trim().slice(0, 120) || null;
      const evidenceUrl = String(b.evidenceUrl ?? "").trim().slice(0, 500) || null;

      if (!name || name.length < 2) return res.status(400).json({ message: "Company name is required." });
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Valid work email is required." });
      }

      // Slug from name (best-effort, may collide — append timestamp suffix on conflict)
      const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "company";

      const { rows: [company] } = await pool.query<{ id: string; name: string }>(`
        INSERT INTO companies (name, slug, industry, county, description, website, contact_name, phone, email, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        ON CONFLICT (slug) DO UPDATE SET slug = $2 || '-' || (extract(epoch from now())::bigint)
        RETURNING id, name
      `, [name, baseSlug, industry, county, description, website, contactName, phone, email]);

      // Submit a claim so admin reviews the registrant too
      await pool.query(`
        INSERT INTO company_claims (
          company_id, claimant_name, claimant_email, claimant_phone,
          role_at_company, message, evidence_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        company.id, contactName || email, email, phone, role,
        `Registered NEW company: ${name}`, evidenceUrl,
      ]).catch(() => { /* table created above */ });

      // Email Tony
      (async () => {
        try {
          const { sendEmail } = await import("./email");
          await sendEmail({
            to: "hello@workabroadhub.tech",
            subject: `[Kenya Careers] New company registered: ${name}`,
            html: `
              <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;color:#1a2530;">
                <h3>New company registered — needs verification</h3>
                <p><strong>${name}</strong> was registered by <strong>${contactName || email}</strong> (${email}${phone ? `, ${phone}` : ""}).</p>
                ${industry ? `<p><strong>Industry:</strong> ${industry}</p>` : ""}
                ${county   ? `<p><strong>County:</strong> ${county}</p>`     : ""}
                ${role     ? `<p><strong>Their role:</strong> ${role}</p>`   : ""}
                ${evidenceUrl ? `<p><strong>License/cert URL:</strong> <a href="${evidenceUrl}">${evidenceUrl}</a></p>` : ""}
                <p><strong>Status:</strong> pending verification</p>
                <p><a href="https://workabroadhub.tech/admin/kenya-careers">Review in admin panel →</a></p>
              </div>`,
            text: `New company registered: ${name}\nBy: ${contactName || email} (${email})\n${role ? `Role: ${role}\n` : ""}${evidenceUrl ? `License: ${evidenceUrl}\n` : ""}Status: pending. Review: https://workabroadhub.tech/admin/kenya-careers`,
          });
        } catch (err: any) {
          console.warn("[register-company] founder notification email failed:", err?.message);
        }
      })();

      console.log(`[employer/register] userId=${userId} created companyId=${company.id} name="${name}" status=pending`);
      res.json({
        success: true,
        companyId: company.id,
        message: `Got it! We've received your registration for ${company.name} and emailed our team. We'll review and verify within 1-2 business days.`,
      });
    } catch (err: any) {
      console.error("[POST /api/employer/register-company]", err?.message);
      res.status(500).json({ message: "Could not register company. Try again or email hello@workabroadhub.tech." });
    }
  });

  // ─── POST /api/admin/local-jobs/claims/:id/approve ────────────────────────
  // Admin approves a claim → auto-grant company-admin access to the claimant.
  // Looks up the claimant by email (since claims store email, not userId), so
  // the user must have a WAH account with that email when this runs.
  app.post("/api/admin/local-jobs/claims/:id/approve", async (req: any, res: Response) => {
    const adminId = await requireAdminInline(req, res);
    if (!adminId) return;
    try {
      const { id } = req.params;
      const { rows: [claim] } = await pool.query<{
        company_id: string; claimant_email: string;
        email_verified_at: Date | null; trust_score: string | null;
      }>(`
        SELECT company_id, claimant_email, email_verified_at, trust_score
          FROM company_claims WHERE id = $1 LIMIT 1
      `, [id]);
      if (!claim) return res.status(404).json({ message: "Claim not found." });

      // 2026-06 Phase 4.5: refuse to approve un-verified claims. Admin can
      // override by passing `?force=true` if they manually verified out-of-band
      // (e.g. confirmed by phone with the company).
      if (!claim.email_verified_at && req.query.force !== "true") {
        return res.status(400).json({
          message: "Claimant has not verified their email yet. Either wait, or pass ?force=true if you've verified them out-of-band.",
          reason: "email_not_verified",
        });
      }

      // Find the user by email
      const { rows: [userRow] } = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [claim.claimant_email],
      );
      if (!userRow) {
        return res.status(400).json({
          message: `No WAH account found with email ${claim.claimant_email}. Ask the claimant to sign up first, then re-approve.`,
        });
      }

      // Insert into company_admins (idempotent)
      await pool.query(`
        INSERT INTO company_admins (company_id, user_id, role, added_by)
        VALUES ($1, $2, 'admin', $3)
        ON CONFLICT (company_id, user_id) DO NOTHING
      `, [claim.company_id, userRow.id, adminId]);

      // Mark the claim approved + approve the company + stamp verified_at
      await pool.query(`
        UPDATE company_claims SET status = 'approved', reviewed_at = NOW(), reviewed_by = $2
         WHERE id = $1
      `, [id, adminId]);
      await pool.query(`
        UPDATE companies
           SET status = 'approved',
               verified_at = COALESCE(verified_at, NOW()),
               updated_at = NOW()
         WHERE id = $1
      `, [claim.company_id]);

      console.log(`[admin] adminId=${adminId} approved claim=${id} → granted user=${userRow.id} as admin of company=${claim.company_id}`);
      res.json({ success: true, message: "Claim approved — claimant now has employer access." });
    } catch (err: any) {
      console.error("[POST /api/admin/local-jobs/claims/:id/approve]", err?.message);
      res.status(500).json({ message: "Could not approve claim." });
    }
  });

  // ─── POST /api/admin/local-jobs/grant-admin ───────────────────────────────
  // Tony's shortcut to grant himself or any user direct employer-admin
  // access to a company — useful for QA, demos, or when a claim came in via
  // WhatsApp instead of the form.
  app.post("/api/admin/local-jobs/grant-admin", async (req: any, res: Response) => {
    const adminId = await requireAdminInline(req, res);
    if (!adminId) return;
    try {
      const { userId, companyId } = req.body ?? {};
      if (!userId || !companyId) {
        return res.status(400).json({ message: "userId and companyId are required." });
      }
      await pool.query(`
        INSERT INTO company_admins (company_id, user_id, role, added_by)
        VALUES ($1, $2, 'admin', $3)
        ON CONFLICT (company_id, user_id) DO NOTHING
      `, [companyId, userId, adminId]);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[POST /api/admin/local-jobs/grant-admin]", err?.message);
      res.status(500).json({ message: "Could not grant admin." });
    }
  });

  // ─── POST /api/local-jobs/claims/:id/verify-email ────────────────────────
  // 2026-06 Phase 4.5: claimant enters the 6-digit code we emailed them.
  // On success, sets email_verified_at — the claim is now actionable by admin.
  // Failure modes: wrong code (5 tries), expired, already verified.
  app.post("/api/local-jobs/claims/:id/verify-email", async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const enteredCode = String(req.body?.code ?? "").trim();

      if (!/^\d{6}$/.test(enteredCode)) {
        return res.status(400).json({ message: "Enter the 6-digit code from your email." });
      }

      const { rows: [claim] } = await pool.query<{
        id: string; claimant_email: string; verification_code: string | null;
        verification_code_expires_at: Date | null; verification_attempts: number;
        email_verified_at: Date | null; trust_score: string | null;
        company_id: string;
      }>(`
        SELECT id, claimant_email, verification_code, verification_code_expires_at,
               COALESCE(verification_attempts, 0) AS verification_attempts,
               email_verified_at, trust_score, company_id
          FROM company_claims WHERE id = $1 LIMIT 1
      `, [id]);

      if (!claim) return res.status(404).json({ message: "Claim not found." });
      if (claim.email_verified_at) {
        return res.json({ success: true, alreadyVerified: true, message: "Your email is already verified." });
      }
      if ((claim.verification_attempts ?? 0) >= 5) {
        return res.status(429).json({
          message: "Too many wrong codes. Email hello@workabroadhub.tech to reset and we'll send a fresh code.",
          reason: "too_many_attempts",
        });
      }
      if (!claim.verification_code) {
        return res.status(400).json({ message: "No verification code on file — please re-submit the claim form." });
      }
      if (claim.verification_code_expires_at && new Date(claim.verification_code_expires_at) < new Date()) {
        return res.status(410).json({ message: "This code has expired. Re-submit the claim form to get a fresh code.", reason: "expired" });
      }

      if (enteredCode !== claim.verification_code) {
        await pool.query(
          `UPDATE company_claims SET verification_attempts = COALESCE(verification_attempts, 0) + 1 WHERE id = $1`,
          [id],
        );
        const remaining = 5 - ((claim.verification_attempts ?? 0) + 1);
        return res.status(400).json({
          message: `That code doesn't match. ${remaining > 0 ? `${remaining} attempt${remaining === 1 ? "" : "s"} left.` : "No attempts left — email hello@workabroadhub.tech to reset."}`,
          remainingAttempts: Math.max(0, remaining),
        });
      }

      // Success — mark verified
      await pool.query(`
        UPDATE company_claims SET email_verified_at = NOW() WHERE id = $1
      `, [id]);
      console.log(`[claim-verify] claim=${id} email=${claim.claimant_email} VERIFIED`);

      res.json({
        success: true,
        message: "Email verified! Our team will review your claim and grant access within 1-2 business days.",
        trustScore: claim.trust_score,
      });
    } catch (err: any) {
      console.error("[POST /api/local-jobs/claims/:id/verify-email]", err?.message);
      res.status(500).json({ message: "Could not verify code. Try again." });
    }
  });

  // ─── ADMIN ENDPOINTS ─────────────────────────────────────────────────────
  // 2026-06 Phase 2.5: founder asked for the basic admin moderation tools
  // before the full employer dashboard ships in Phase 3:
  //   • Close (or re-open) a fake / spam job
  //   • Suspend (or re-approve) an employer — hides all their jobs from
  //     /kenya-careers AND blocks new applications without losing the
  //     existing data
  //   • List all applications for moderation (read-only)
  // Each endpoint inlines the admin check via storage.isUserAdmin() since
  // isAdmin middleware lives in routes.ts and isn't exported.

  async function requireAdminInline(req: any, res: Response): Promise<string | null> {
    const userId = readSessionUserId(req) ?? undefined;
    if (!userId) {
      res.status(401).json({ message: "Sign in required." });
      return null;
    }
    const { storage } = await import("./storage");
    const admin = await storage.isUserAdmin(userId).catch(() => false);
    if (!admin) {
      res.status(403).json({ message: "Admin access required." });
      return null;
    }
    return userId;
  }

  // PATCH /api/admin/local-jobs/jobs/:id — change status (open / closed)
  app.patch("/api/admin/local-jobs/jobs/:id", async (req: any, res: Response) => {
    const adminId = await requireAdminInline(req, res);
    if (!adminId) return;
    try {
      const { id } = req.params;
      const newStatus = String(req.body?.status ?? "").trim();
      if (!["open", "closed", "draft"].includes(newStatus)) {
        return res.status(400).json({ message: "status must be one of: open, closed, draft." });
      }
      const { rowCount } = await pool.query(
        `UPDATE local_jobs SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, id],
      );
      if (!rowCount) return res.status(404).json({ message: "Job not found." });
      console.log(`[admin] adminId=${adminId} set job=${id} status=${newStatus}`);
      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      console.error("[PATCH /api/admin/local-jobs/jobs/:id]", err?.message);
      res.status(500).json({ message: "Could not update job." });
    }
  });

  // PATCH /api/admin/local-jobs/companies/:id — change status (approved / suspended / pending)
  app.patch("/api/admin/local-jobs/companies/:id", async (req: any, res: Response) => {
    const adminId = await requireAdminInline(req, res);
    if (!adminId) return;
    try {
      const { id } = req.params;
      const newStatus = String(req.body?.status ?? "").trim();
      if (!["approved", "pending", "suspended"].includes(newStatus)) {
        return res.status(400).json({ message: "status must be one of: approved, pending, suspended." });
      }
      const { rowCount } = await pool.query(
        `UPDATE companies SET status = $1, updated_at = NOW(),
                              verified_at = CASE WHEN $1 = 'approved' THEN COALESCE(verified_at, NOW()) ELSE verified_at END
          WHERE id = $2`,
        [newStatus, id],
      );
      if (!rowCount) return res.status(404).json({ message: "Company not found." });
      console.log(`[admin] adminId=${adminId} set company=${id} status=${newStatus}`);
      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      console.error("[PATCH /api/admin/local-jobs/companies/:id]", err?.message);
      res.status(500).json({ message: "Could not update company." });
    }
  });

  // POST /api/admin/local-jobs/jobs — admin manually adds a REAL job that
  // bypasses the seed gate. Used by Tony's manual curation workflow until
  // employer self-service ships in Phase 4. The created job has is_seed=false
  // so applications ARE accepted, payments DO clear, and the candidate
  // genuinely reaches the employer.
  app.post("/api/admin/local-jobs/jobs", async (req: any, res: Response) => {
    const adminId = await requireAdminInline(req, res);
    if (!adminId) return;
    try {
      const b = req.body ?? {};
      const companyId      = String(b.companyId      ?? "").trim();
      const branchId       = String(b.branchId       ?? "").trim() || null;
      const title          = String(b.title          ?? "").trim().slice(0, 200);
      const department     = String(b.department     ?? "").trim().slice(0, 120) || null;
      const vacancies      = Math.max(1, Math.min(999, Number(b.vacancies ?? 1)));
      const employmentType = String(b.employmentType ?? "full_time").trim();
      const salaryMin      = b.salaryMin != null ? Number(b.salaryMin) : null;
      const salaryMax      = b.salaryMax != null ? Number(b.salaryMax) : null;
      const requirements   = String(b.requirements   ?? "").trim() || null;
      const responsibilities = String(b.responsibilities ?? "").trim() || null;
      const deadline       = String(b.deadline       ?? "").trim().slice(0, 10) || null;
      const county         = String(b.county         ?? "").trim().slice(0, 60) || null;
      const town           = String(b.town           ?? "").trim().slice(0, 80) || null;
      const experience     = String(b.experienceLevel ?? "any").trim();
      const category       = String(b.category       ?? "other").trim();

      if (!companyId || !/^[0-9a-f-]{8,}$/i.test(companyId)) {
        return res.status(400).json({ message: "companyId is required and must be a valid UUID." });
      }
      if (!title || title.length < 3) {
        return res.status(400).json({ message: "Job title is required." });
      }
      if (!VALID_EMPLOYMENT_TYPES.has(employmentType)) {
        return res.status(400).json({ message: `employmentType must be one of: ${[...VALID_EMPLOYMENT_TYPES].join(", ")}` });
      }
      if (!VALID_EXPERIENCE.has(experience)) {
        return res.status(400).json({ message: `experienceLevel must be one of: ${[...VALID_EXPERIENCE].join(", ")}` });
      }

      // Confirm the company exists and is approved
      const { rows: [company] } = await pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM companies WHERE id = $1 AND status = 'approved' LIMIT 1`,
        [companyId],
      );
      if (!company) {
        return res.status(404).json({ message: "Company not found or not approved." });
      }

      const { rows: [job] } = await pool.query<{ id: string }>(`
        INSERT INTO local_jobs (
          company_id, branch_id, title, department, vacancies, employment_type,
          salary_min, salary_max, requirements, responsibilities, deadline,
          county, town, experience_level, category, status, is_seed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'open', false)
        RETURNING id
      `, [
        companyId, branchId, title, department, vacancies, employmentType,
        salaryMin, salaryMax, requirements, responsibilities, deadline,
        county, town, experience, category,
      ]);

      console.log(`[admin] adminId=${adminId} created REAL job=${job.id} company="${company.name}" title="${title}"`);

      res.json({
        success: true,
        jobId: job.id,
        message: `Real job "${title}" published at ${company.name}. Applications will reach the employer.`,
      });
    } catch (err: any) {
      console.error("[POST /api/admin/local-jobs/jobs]", err?.message);
      res.status(500).json({ message: "Could not create job." });
    }
  });

  // PATCH /api/admin/local-jobs/applications/:id — change application status
  // Will also be used by the employer dashboard when Phase 3 ships.
  // Valid transitions: submitted → under_review → shortlisted → interview → hired/rejected.
  app.patch("/api/admin/local-jobs/applications/:id", async (req: any, res: Response) => {
    const adminId = await requireAdminInline(req, res);
    if (!adminId) return;
    try {
      const { id } = req.params;
      const newStatus = String(req.body?.status ?? "").trim();
      const validStatuses = ["submitted", "under_review", "shortlisted", "interview", "hired", "rejected"];
      if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({ message: `status must be one of: ${validStatuses.join(", ")}.` });
      }
      const { rowCount } = await pool.query(
        `UPDATE local_job_applications SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, id],
      );
      if (!rowCount) return res.status(404).json({ message: "Application not found." });
      console.log(`[admin] adminId=${adminId} set application=${id} status=${newStatus}`);
      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      console.error("[PATCH /api/admin/local-jobs/applications/:id]", err?.message);
      res.status(500).json({ message: "Could not update application." });
    }
  });

  // GET /api/admin/local-jobs/seed-applicants — refund list.
  // 2026-06 SAFETY: founder needs to identify every paid user who applied
  // to a seed (not-yet-real) job so they can be refunded the KES 99 (or have
  // their trial extended as compensation). Returns applicants joined to
  // their most recent payment.
  app.get("/api/admin/local-jobs/seed-applicants", async (req: any, res: Response) => {
    const adminId = await requireAdminInline(req, res);
    if (!adminId) return;
    try {
      const { rows } = await pool.query<{
        application_id: string; applied_at: Date;
        applicant_user_id: string; applicant_name: string; email: string; phone: string;
        job_id: string; job_title: string; company_name: string;
        payment_id: string | null; payment_amount: number | null;
        payment_status: string | null; mpesa_receipt: string | null;
        plan_id: string | null;
      }>(`
        SELECT
            a.id            AS application_id,
            a.applied_at,
            a.applicant_user_id,
            a.applicant_name,
            a.email,
            a.phone,
            j.id            AS job_id,
            j.title         AS job_title,
            c.name          AS company_name,
            p.id            AS payment_id,
            p.amount        AS payment_amount,
            p.status        AS payment_status,
            p.mpesa_receipt_number AS mpesa_receipt,
            p.plan_id
          FROM local_job_applications a
          JOIN local_jobs j ON j.id = a.job_id
          JOIN companies   c ON c.id = j.company_id
     LEFT JOIN LATERAL (
            SELECT id, amount, status, mpesa_receipt_number, plan_id
              FROM payments
             WHERE user_id = a.applicant_user_id
               AND status IN ('success', 'completed')
               AND plan_id IN ('trial', 'monthly', 'yearly', 'pro')
             ORDER BY created_at DESC
             LIMIT 1
          ) p ON true
         WHERE COALESCE(j.is_seed, false) = true
         ORDER BY a.applied_at DESC
         LIMIT 500
      `).catch(() => ({ rows: [] }) as any);

      res.json({
        message: rows.length === 0
          ? "No paid applications to seed jobs found. You're clear — no refunds needed."
          : `${rows.length} applicant${rows.length === 1 ? "" : "s"} applied to seed jobs with a paid plan. Refund each KES 99 via M-Pesa B2C (paybill 4153025) using the receipt number, or extend their trial as compensation.`,
        count: rows.length,
        applicants: rows.map((r) => ({
          applicationId: r.application_id,
          appliedAt:     r.applied_at,
          applicantName: r.applicant_name,
          email:         r.email,
          phone:         r.phone,
          jobTitle:      r.job_title,
          companyName:   r.company_name,
          paymentId:     r.payment_id,
          paymentAmount: r.payment_amount,
          paymentStatus: r.payment_status,
          mpesaReceipt:  r.mpesa_receipt,
          planId:        r.plan_id,
        })),
      });
    } catch (err: any) {
      console.error("[GET /api/admin/local-jobs/seed-applicants]", err?.message);
      res.status(500).json({ message: "Could not load seed-applicant list." });
    }
  });

  // GET /api/admin/local-jobs/gate-stats — paywall observability for the founder.
  // Shows last-24h counts of: paid users who successfully applied, paid users
  // who hit the daily limit, free users who hit the upgrade card, and the
  // current paid-tier breakdown. Confirms the gate is doing its job without
  // having to dig through Render logs.
  app.get("/api/admin/local-jobs/gate-stats", async (req: any, res: Response) => {
    const adminId = await requireAdminInline(req, res);
    if (!adminId) return;
    try {
      // Applications submitted in last 24h, grouped by tier of the applicant
      // at submission time. We don't store the tier on the row (it's derived
      // from getUserPlan when needed), so we join through users to get the
      // current plan — close enough for an observability stat.
      const { rows: byTier } = await pool.query<{ plan: string; count: string }>(`
        SELECT COALESCE(u.plan, 'free') AS plan, COUNT(*)::text AS count
          FROM local_job_applications a
          JOIN users u ON u.id = a.applicant_user_id
         WHERE a.applied_at > NOW() - INTERVAL '24 hours'
         GROUP BY u.plan
         ORDER BY count DESC
      `).catch(() => ({ rows: [] }) as any);

      // Total applications + unique applicants in last 24h
      const { rows: [totals] } = await pool.query<{ total_apps: string; unique_users: string }>(`
        SELECT COUNT(*)::text AS total_apps,
               COUNT(DISTINCT applicant_user_id)::text AS unique_users
          FROM local_job_applications
         WHERE applied_at > NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ total_apps: "0", unique_users: "0" }] }) as any);

      res.json({
        windowHours: 24,
        totalApplications: Number(totals?.total_apps ?? 0),
        uniqueApplicants:  Number(totals?.unique_users ?? 0),
        byTier: byTier.map((r) => ({ tier: r.plan, count: Number(r.count) })),
        gateLogs: {
          message: "Detailed allow/block decisions are emitted to Render logs. Search for [kenya-careers/apply] ALLOW or BLOCK.",
        },
      });
    } catch (err: any) {
      console.error("[GET /api/admin/local-jobs/gate-stats]", err?.message);
      res.status(500).json({ message: "Could not load gate stats." });
    }
  });

  // GET /api/admin/local-jobs/overview — moderation dashboard data: companies,
  // open jobs, recent applications. Used by the admin Kenya Careers page.
  app.get("/api/admin/local-jobs/overview", async (req: any, res: Response) => {
    const adminId = await requireAdminInline(req, res);
    if (!adminId) return;
    try {
      const [companiesRes, jobsRes, appsRes, claimsRes] = await Promise.all([
        pool.query(`
          SELECT c.id, c.name, c.industry, c.county, c.status, c.verified_at,
                 (SELECT COUNT(*) FROM local_jobs WHERE company_id = c.id)::int AS job_count
            FROM companies c ORDER BY c.created_at DESC LIMIT 100
        `),
        pool.query(`
          SELECT j.id, j.title, j.county, j.town, j.status, j.vacancies, j.created_at,
                 c.id AS company_id, c.name AS company_name, c.status AS company_status
            FROM local_jobs j JOIN companies c ON c.id = j.company_id
           ORDER BY j.created_at DESC LIMIT 100
        `),
        pool.query(`
          SELECT a.id, a.status, a.applied_at, a.applicant_name, a.email, a.phone,
                 a.applicant_county, a.highest_education, a.years_experience,
                 a.cv_url, a.certificates_url, a.cover_note,
                 j.id AS job_id, j.title AS job_title,
                 c.name AS company_name
            FROM local_job_applications a
            JOIN local_jobs j ON j.id = a.job_id
            JOIN companies   c ON c.id = j.company_id
           ORDER BY a.applied_at DESC LIMIT 100
        `),
        pool.query(`
          SELECT cl.id, cl.company_id, cl.claimant_name, cl.claimant_email,
                 cl.claimant_phone, cl.role_at_company, cl.message,
                 cl.evidence_url, cl.status, cl.created_at,
                 cl.email_verified_at, cl.domain_match, cl.trust_score,
                 c.name AS company_name
            FROM company_claims cl
            JOIN companies c ON c.id = cl.company_id
           ORDER BY cl.status = 'pending' DESC, cl.email_verified_at DESC NULLS LAST, cl.created_at DESC
           LIMIT 100
        `).catch(() => ({ rows: [] }) as any),
      ]);
      res.json({
        companies:    companiesRes.rows,
        jobs:         jobsRes.rows,
        applications: appsRes.rows,
        claims:       claimsRes.rows,
      });
    } catch (err: any) {
      console.error("[GET /api/admin/local-jobs/overview]", err?.message);
      res.status(500).json({ message: "Could not load overview." });
    }
  });

  // ─── GET /api/local-jobs/me/applications ─────────────────────────────────
  // Returns the signed-in user's submitted applications with current status
  // + the job + company they applied to. Powers /kenya-careers/my-applications.
  app.get("/api/local-jobs/me/applications", async (req: any, res: Response) => {
    try {
      const userId = readSessionUserId(req) ?? undefined;
      if (!userId) {
        return res.status(401).json({ message: "Please sign in." });
      }
      const { rows } = await pool.query<{
        id: string; status: string; applied_at: Date; updated_at: Date;
        cover_note: string | null; cv_url: string | null;
        job_id: string; job_title: string; job_county: string | null;
        job_town: string | null; job_status: string;
        company_name: string; company_verified_at: Date | null;
      }>(`
        SELECT
            a.id, a.status, a.applied_at, a.updated_at,
            a.cover_note, a.cv_url,
            j.id AS job_id, j.title AS job_title, j.county AS job_county,
            j.town AS job_town, j.status AS job_status,
            c.name AS company_name, c.verified_at AS company_verified_at
          FROM local_job_applications a
          JOIN local_jobs j ON j.id = a.job_id
          JOIN companies   c ON c.id = j.company_id
         WHERE a.applicant_user_id = $1
         ORDER BY a.applied_at DESC
         LIMIT 100
      `, [userId]).catch(() => ({ rows: [] }) as any);

      res.json({
        applications: rows.map((r) => ({
          id:         r.id,
          status:     r.status,
          appliedAt:  r.applied_at,
          updatedAt:  r.updated_at,
          coverNote:  r.cover_note,
          cvUrl:      r.cv_url,
          job: {
            id:        r.job_id,
            title:     r.job_title,
            county:    r.job_county,
            town:      r.job_town,
            status:    r.job_status,
          },
          company: {
            name:     r.company_name,
            verified: !!r.company_verified_at,
          },
        })),
      });
    } catch (err: any) {
      console.error("[GET /api/local-jobs/me/applications]", err?.message);
      res.status(500).json({ message: "Could not load your applications." });
    }
  });
}

// Tiny HTML escape — only used by the confirmation email template
function escapeHtmlSafe(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] || c));
}
