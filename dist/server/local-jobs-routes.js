"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLocalJobsRoutes = registerLocalJobsRoutes;
const db_1 = require("./db");
const VALID_EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "contract", "internship", "casual"]);
const VALID_EXPERIENCE = new Set(["entry", "mid", "senior", "any"]);
function registerLocalJobsRoutes(app) {
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
    app.get("/api/local-jobs", async (req, res) => {
        try {
            const { county, category, companyId, experienceLevel, employmentType, search, } = req.query;
            const limit = Math.min(Number(req.query.limit ?? 24), 100);
            const offset = Math.max(Number(req.query.offset ?? 0), 0);
            const conditions = ["j.status = 'open'", "c.status = 'approved'"];
            const params = [];
            const push = (clause, value) => {
                params.push(value);
                conditions.push(clause.replace("$$", `$${params.length}`));
            };
            if (county)
                push("j.county = $$", county);
            if (category)
                push("j.category = $$", category);
            if (companyId)
                push("j.company_id = $$", companyId);
            if (experienceLevel && VALID_EXPERIENCE.has(experienceLevel)) {
                push("j.experience_level = $$", experienceLevel);
            }
            if (employmentType && VALID_EMPLOYMENT_TYPES.has(employmentType)) {
                push("j.employment_type = $$", employmentType);
            }
            if (search && search.trim()) {
                const term = `%${search.trim()}%`;
                params.push(term, term, term);
                const i = params.length;
                conditions.push(`(j.title ILIKE $${i - 2} OR j.department ILIKE $${i - 1} OR c.name ILIKE $${i})`);
            }
            const where = conditions.join(" AND ");
            // Count + page in parallel
            const [countResult, listResult] = await Promise.all([
                db_1.pool.query(`SELECT COUNT(*)::text AS total
             FROM local_jobs j
             JOIN companies   c ON c.id = j.company_id
            WHERE ${where}`, params),
                db_1.pool.query(`SELECT
              j.id, j.title, j.department, j.vacancies, j.employment_type,
              j.salary_min, j.salary_max, j.county, j.town,
              j.experience_level, j.category, j.deadline, j.created_at,
              c.id AS company_id, c.name AS company_name, c.slug AS company_slug,
              c.industry AS company_industry, c.verified_at AS company_verified_at,
              b.id AS branch_id, b.name AS branch_name
             FROM local_jobs j
             JOIN companies c ON c.id = j.company_id
        LEFT JOIN branches  b ON b.id = j.branch_id
            WHERE ${where}
            ORDER BY j.created_at DESC, j.id
            LIMIT ${limit} OFFSET ${offset}`, params),
            ]);
            const total = Number(countResult.rows[0]?.total ?? "0");
            const jobs = listResult.rows.map((r) => ({
                id: r.id,
                title: r.title,
                department: r.department,
                vacancies: r.vacancies,
                employmentType: r.employment_type,
                salaryMin: r.salary_min,
                salaryMax: r.salary_max,
                county: r.county,
                town: r.town,
                experienceLevel: r.experience_level,
                category: r.category,
                deadline: r.deadline,
                createdAt: r.created_at,
                company: {
                    id: r.company_id,
                    name: r.company_name,
                    slug: r.company_slug,
                    industry: r.company_industry,
                    verified: !!r.company_verified_at,
                },
                branch: r.branch_id ? { id: r.branch_id, name: r.branch_name } : null,
            }));
            res.setHeader("Cache-Control", "public, max-age=60");
            res.json({ total, limit, offset, jobs });
        }
        catch (err) {
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
    // Distinct values for the filter dropdowns. Cached aggressively because
    // these change rarely once Phase 3 ships employer posting.
    app.get("/api/local-jobs/filters", async (_req, res) => {
        try {
            const [countiesRes, categoriesRes, companiesRes] = await Promise.all([
                db_1.pool.query(`SELECT DISTINCT county FROM local_jobs WHERE status='open' AND county IS NOT NULL ORDER BY county`),
                db_1.pool.query(`SELECT DISTINCT category FROM local_jobs WHERE status='open' AND category IS NOT NULL ORDER BY category`),
                db_1.pool.query(`SELECT id, name FROM companies WHERE status='approved' ORDER BY name`),
            ]);
            res.setHeader("Cache-Control", "public, max-age=300");
            res.json({
                counties: countiesRes.rows.map((r) => r.county),
                categories: categoriesRes.rows.map((r) => r.category),
                companies: companiesRes.rows,
            });
        }
        catch (err) {
            if (err?.code === "42P01") {
                return res.json({ counties: [], categories: [], companies: [] });
            }
            console.error("[GET /api/local-jobs/filters]", err?.message);
            res.status(500).json({ message: "Could not load filters." });
        }
    });
    // ─── GET /api/local-jobs/companies ────────────────────────────────────────
    // Public list of approved employers + their open-job counts. Powers the
    // "Featured Employers" strip on the landing page.
    app.get("/api/local-jobs/companies", async (_req, res) => {
        try {
            const { rows } = await db_1.pool.query(`
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
                    id: r.id,
                    name: r.name,
                    slug: r.slug,
                    industry: r.industry,
                    county: r.county,
                    logoUrl: r.logo_url,
                    verified: !!r.verified_at,
                    jobCount: Number(r.job_count),
                })),
            });
        }
        catch (err) {
            if (err?.code === "42P01")
                return res.json({ companies: [] });
            console.error("[GET /api/local-jobs/companies]", err?.message);
            res.status(500).json({ message: "Could not load companies." });
        }
    });
    // ─── GET /api/local-jobs/stats ────────────────────────────────────────────
    // Headline numbers for the landing hero: "X jobs · Y employers · Z counties".
    app.get("/api/local-jobs/stats", async (_req, res) => {
        try {
            const { rows: [stats] } = await db_1.pool.query(`
        SELECT
          (SELECT COUNT(*)::text                                FROM local_jobs WHERE status='open')      AS total_jobs,
          (SELECT COUNT(DISTINCT company_id)::text              FROM local_jobs WHERE status='open')      AS total_employers,
          (SELECT COUNT(DISTINCT county)::text                  FROM local_jobs WHERE status='open' AND county IS NOT NULL) AS total_counties,
          (SELECT COALESCE(SUM(vacancies), 0)::text             FROM local_jobs WHERE status='open')      AS total_vacancies
      `);
            res.setHeader("Cache-Control", "public, max-age=300");
            res.json({
                totalJobs: Number(stats?.total_jobs ?? "0"),
                totalEmployers: Number(stats?.total_employers ?? "0"),
                totalCounties: Number(stats?.total_counties ?? "0"),
                totalVacancies: Number(stats?.total_vacancies ?? "0"),
            });
        }
        catch (err) {
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
    app.get("/api/local-jobs/:id", async (req, res) => {
        try {
            const { id } = req.params;
            // Reject obviously-malformed IDs early so we don't burn a query
            if (!/^[0-9a-f-]{8,}$/i.test(id)) {
                return res.status(400).json({ message: "Invalid job id." });
            }
            const { rows: [job] } = await db_1.pool.query(`
        SELECT
            j.id, j.title, j.department, j.vacancies, j.employment_type,
            j.salary_min, j.salary_max, j.requirements, j.responsibilities,
            j.deadline, j.county, j.town, j.experience_level, j.category,
            j.status, j.created_at,
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
            if (!job)
                return res.status(404).json({ message: "Job not found or no longer available." });
            res.setHeader("Cache-Control", "public, max-age=60");
            res.json({
                id: job.id,
                title: job.title,
                department: job.department,
                vacancies: job.vacancies,
                employmentType: job.employment_type,
                salaryMin: job.salary_min,
                salaryMax: job.salary_max,
                requirements: job.requirements,
                responsibilities: job.responsibilities,
                deadline: job.deadline,
                county: job.county,
                town: job.town,
                experienceLevel: job.experience_level,
                category: job.category,
                status: job.status,
                createdAt: job.created_at,
                company: {
                    id: job.company_id,
                    name: job.company_name,
                    slug: job.company_slug,
                    industry: job.company_industry,
                    description: job.company_description,
                    website: job.company_website,
                    verified: !!job.company_verified_at,
                    county: job.company_county,
                },
                branch: job.branch_id ? {
                    id: job.branch_id,
                    name: job.branch_name,
                    county: job.branch_county,
                    town: job.branch_town,
                    location: job.branch_location,
                } : null,
            });
        }
        catch (err) {
            if (err?.code === "42P01") {
                return res.status(404).json({ message: "Job not found." });
            }
            console.error(`[GET /api/local-jobs/:id]`, err?.message);
            res.status(500).json({ message: "Could not load job." });
        }
    });
}
