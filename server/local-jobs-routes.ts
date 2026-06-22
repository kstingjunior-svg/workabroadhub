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

// Per-day application limits by tier. Encourages upgrade without punishing
// loyal customers. Yearly users get unlimited applications.
const DAILY_LIMITS: Record<string, number> = {
  trial:        3,
  basic:        3,    // legacy alias for trial
  monthly:     20,
  yearly:    9999,    // effectively unlimited
  pro:       9999,
  pro_referral: 9999,
};

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
          dailyLimit:  0,
          message:     "Sign in or sign up first — applying is free with the KES 99 trial.",
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
          dailyLimit: 0,
          message:    "Unlock applying — KES 99 trial covers both overseas AND Kenya jobs.",
        });
      }

      // Paid tier — count today's applications across both job boards.
      const limit = DAILY_LIMITS[tier] ?? 3;
      const { rows: [{ count }] } = await pool.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
          FROM local_job_applications
         WHERE applicant_user_id = $1
           AND applied_at > NOW() - INTERVAL '24 hours'
      `, [userId]).catch(() => ({ rows: [{ count: "0" }] }) as any);

      const appsToday = Number(count ?? "0");
      const canApply = appsToday < limit;

      res.json({
        canApply,
        reason:    canApply ? "ok" : "daily_limit",
        tier,
        appsToday,
        dailyLimit: limit,
        message:   canApply
          ? null
          : `You've used your ${limit} application${limit === 1 ? "" : "s"} for today. Resets in 24 hours, or upgrade for more daily applications.`,
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

        // ── 2. Daily limit check ───────────────────────────────────────────
        const limit = DAILY_LIMITS[tier] ?? 3;
        const { rows: [{ count }] } = await pool.query<{ count: string }>(`
          SELECT COUNT(*)::text AS count
            FROM local_job_applications
           WHERE applicant_user_id = $1
             AND applied_at > NOW() - INTERVAL '24 hours'
             AND job_id <> $2
        `, [userId, jobId]);
        if (Number(count) >= limit) {
          return res.status(429).json({
            message: `You've used your ${limit} applications for today. Resets in 24 hours.`,
            reason:  "daily_limit",
            appsToday: Number(count),
            dailyLimit: limit,
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

        console.log(
          `[kenya-careers/apply] ALLOW userId=${userId} tier=${tier} jobId=${jobId} ` +
          `company="${job.company_name}" applicationId=${appRow.id} appsToday=${Number(count) + 1}/${limit}`,
        );

        res.json({
          success:       true,
          applicationId: appRow.id,
          message:       `Application sent to ${job.company_name}. Check your email — we sent you a confirmation.`,
          dailyLimit:    limit,
          appsToday:     Number(count) + 1,
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

  // ─── POST /api/local-jobs/companies/:id/claim ────────────────────────────
  // 2026-06 Phase 3a: "Are you this employer? Claim your company profile."
  // Public endpoint (no auth required — claims often come from HR managers
  // who don't yet have a WAH account). Stores the claim for admin review.
  // Light validation + one email to support so the founder is notified.
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

      // Confirm the company actually exists
      const { rows: [company] } = await pool.query<{ id: string; name: string }>(`
        SELECT id, name FROM companies WHERE id = $1 LIMIT 1
      `, [id]);
      if (!company) return res.status(404).json({ message: "Company not found." });

      // Insert claim
      const { rows: [claim] } = await pool.query<{ id: string }>(`
        INSERT INTO company_claims (
          company_id, claimant_name, claimant_email, claimant_phone, role_at_company, message
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [id, claimantName, claimantEmail, claimantPhone, roleAtCompany, message])
        .catch(async (err: any) => {
          if (err?.code === "42P01") {
            // Table doesn't exist yet — create minimal version then retry
            await pool.query(`
              CREATE TABLE IF NOT EXISTS company_claims (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                company_id UUID NOT NULL, claimant_name VARCHAR(160) NOT NULL,
                claimant_email VARCHAR(160) NOT NULL, claimant_phone VARCHAR(40),
                role_at_company VARCHAR(120), message TEXT,
                status VARCHAR(24) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
              )
            `).catch(() => {});
            return pool.query<{ id: string }>(`
              INSERT INTO company_claims (company_id, claimant_name, claimant_email, claimant_phone, role_at_company, message)
              VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
            `, [id, claimantName, claimantEmail, claimantPhone, roleAtCompany, message]);
          }
          throw err;
        });

      console.log(`[claim-company] new claim id=${claim.id} company="${company.name}" claimant="${claimantName}" <${claimantEmail}>`);

      // Email the founder so they know to review
      (async () => {
        try {
          const { sendEmail } = await import("./email");
          await sendEmail({
            to: "hello@workabroadhub.tech",
            subject: `[Kenya Careers] New company claim: ${company.name}`,
            html: `
              <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;color:#1a2530;">
                <h3>New employer claim — ${company.name}</h3>
                <p><strong>${claimantName}</strong> (${claimantEmail}${claimantPhone ? `, ${claimantPhone}` : ""}) wants to claim this company profile.</p>
                ${roleAtCompany ? `<p><strong>Role at company:</strong> ${roleAtCompany}</p>` : ""}
                ${message ? `<p><strong>Message:</strong></p><p style="border-left:3px solid #ddd;padding-left:8px;">${message}</p>` : ""}
                <p><a href="https://workabroadhub.tech/admin/kenya-careers">Review in admin panel →</a></p>
                <p style="font-size:12px;color:#999;">Claim ID: ${claim.id}</p>
              </div>`,
            text: `New employer claim — ${company.name}\n\n${claimantName} (${claimantEmail}${claimantPhone ? `, ${claimantPhone}` : ""}) wants to claim this company.\n${roleAtCompany ? `Role: ${roleAtCompany}\n` : ""}${message ? `Message: ${message}\n` : ""}\nReview: https://workabroadhub.tech/admin/kenya-careers\nClaim ID: ${claim.id}`,
          });
        } catch (err: any) {
          console.warn("[claim-company] founder notification email failed (non-fatal):", err?.message);
        }
      })();

      res.json({
        success: true,
        message: `Thanks ${claimantName.split(" ")[0]}! We received your claim for ${company.name}. We'll review and reach out at ${claimantEmail} within 1-2 business days.`,
        claimId: claim.id,
      });
    } catch (err: any) {
      console.error("[POST /api/local-jobs/companies/:id/claim]", err?.message);
      res.status(500).json({ message: "Could not submit your claim. Try again or email hello@workabroadhub.tech." });
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
      const [companiesRes, jobsRes, appsRes] = await Promise.all([
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
      ]);
      res.json({
        companies:    companiesRes.rows,
        jobs:         jobsRes.rows,
        applications: appsRes.rows,
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
