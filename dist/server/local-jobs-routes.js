"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLocalJobsRoutes = registerLocalJobsRoutes;
const multer_1 = __importDefault(require("multer"));
const db_1 = require("./db");
const VALID_EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "contract", "internship", "casual"]);
const VALID_EXPERIENCE = new Set(["entry", "mid", "senior", "any"]);
// 2026-06 Phase 2: tier-gated apply flow. Same KES tiers users already pay for
// the overseas board — free can browse but must upgrade to KES 99 trial to
// submit a Kenya Careers application. PAID_TIERS matches the canonical set
// from server/routes.ts / server/services/community.ts.
const KENYA_CAREERS_PAID_TIERS = new Set(["trial", "basic", "monthly", "yearly", "pro", "pro_referral"]);
// Per-day application limits by tier. Encourages upgrade without punishing
// loyal customers. Yearly users get unlimited applications.
const DAILY_LIMITS = {
    trial: 3,
    basic: 3, // legacy alias for trial
    monthly: 20,
    yearly: 9999, // effectively unlimited
    pro: 9999,
    pro_referral: 9999,
};
// Multer config — memory storage, 5 MB limit, PDF/DOCX only. Mirrors the
// existing /api/upload-cv handler so users get a consistent experience.
const cvUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = new Set([
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
        ]);
        cb(null, allowed.has(file.mimetype));
    },
});
function registerLocalJobsRoutes(app) {
    // ─── GET /api/local-jobs/_ping ────────────────────────────────────────────
    // 2026-06: Pure diagnostic — no DB, no logic. If this returns JSON {ok:true,
    // routesAt: <ISO>}, the route registration is alive on the server.
    // If it returns 404 or HTML, the deploy is incomplete (build cache, missing
    // file, boot crash before registration, etc).
    //
    // Use this to validate the deploy:
    //   curl -i https://workabroadhub.tech/api/local-jobs/_ping
    // Expected: HTTP 200 + Content-Type: application/json + {"ok":true,...}
    app.get("/api/local-jobs/_ping", (_req, res) => {
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
    // ─── GET /api/local-jobs/me/apply-status ──────────────────────────────────
    // 2026-06 Phase 2: lightweight check the client uses to decide what the
    // Apply button shows. Returns the user's tier, today's application count,
    // their daily limit, and whether they can apply right now.
    //
    // Anonymous users get `{ canApply: false, reason: "signin" }` so the client
    // routes them to login. Free-tier signed-in users get
    // `{ canApply: false, reason: "upgrade" }` so the client routes them to
    // /pricing.
    app.get("/api/local-jobs/me/apply-status", async (req, res) => {
        try {
            const userId = req.user?.claims?.sub ?? req.user?.id;
            if (!userId) {
                return res.json({
                    canApply: false,
                    reason: "signin",
                    tier: null,
                    appsToday: 0,
                    dailyLimit: 0,
                    message: "Sign in or sign up first — applying is free with the KES 99 trial.",
                });
            }
            const { storage } = await Promise.resolve().then(() => __importStar(require("./storage")));
            const tier = await storage.getUserPlan(userId);
            if (!KENYA_CAREERS_PAID_TIERS.has(tier)) {
                return res.json({
                    canApply: false,
                    reason: "upgrade",
                    tier,
                    appsToday: 0,
                    dailyLimit: 0,
                    message: "Unlock applying — KES 99 trial covers both overseas AND Kenya jobs.",
                });
            }
            // Paid tier — count today's applications across both job boards.
            const limit = DAILY_LIMITS[tier] ?? 3;
            const { rows: [{ count }] } = await db_1.pool.query(`
        SELECT COUNT(*)::text AS count
          FROM local_job_applications
         WHERE applicant_user_id = $1
           AND applied_at > NOW() - INTERVAL '24 hours'
      `, [userId]).catch(() => ({ rows: [{ count: "0" }] }));
            const appsToday = Number(count ?? "0");
            const canApply = appsToday < limit;
            res.json({
                canApply,
                reason: canApply ? "ok" : "daily_limit",
                tier,
                appsToday,
                dailyLimit: limit,
                message: canApply
                    ? null
                    : `You've used your ${limit} application${limit === 1 ? "" : "s"} for today. Resets in 24 hours, or upgrade for more daily applications.`,
            });
        }
        catch (err) {
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
    app.post("/api/local-jobs/jobs/:id/apply", cvUpload.single("cv"), async (req, res) => {
        try {
            const userId = req.user?.claims?.sub ?? req.user?.id;
            if (!userId) {
                return res.status(401).json({
                    message: "Please sign in to apply.",
                    reason: "signin",
                });
            }
            const jobId = req.params.id;
            if (!/^[0-9a-f-]{8,}$/i.test(jobId)) {
                return res.status(400).json({ message: "Invalid job id." });
            }
            // ── 1. Tier check ──────────────────────────────────────────────────
            const { storage } = await Promise.resolve().then(() => __importStar(require("./storage")));
            const tier = await storage.getUserPlan(userId);
            if (!KENYA_CAREERS_PAID_TIERS.has(tier)) {
                return res.status(402).json({
                    message: "Unlock applying — KES 99 trial covers both overseas AND Kenya jobs.",
                    reason: "upgrade",
                    tier,
                });
            }
            // ── 2. Daily limit check ───────────────────────────────────────────
            const limit = DAILY_LIMITS[tier] ?? 3;
            const { rows: [{ count }] } = await db_1.pool.query(`
          SELECT COUNT(*)::text AS count
            FROM local_job_applications
           WHERE applicant_user_id = $1
             AND applied_at > NOW() - INTERVAL '24 hours'
             AND job_id <> $2
        `, [userId, jobId]);
            if (Number(count) >= limit) {
                return res.status(429).json({
                    message: `You've used your ${limit} applications for today. Resets in 24 hours.`,
                    reason: "daily_limit",
                    appsToday: Number(count),
                    dailyLimit: limit,
                });
            }
            // ── 3. Validate the job exists and is open ─────────────────────────
            const { rows: [job] } = await db_1.pool.query(`
          SELECT j.id, j.title, j.status, c.id AS company_id, c.name AS company_name
            FROM local_jobs j
            JOIN companies   c ON c.id = j.company_id
           WHERE j.id = $1 AND c.status = 'approved'
           LIMIT 1
        `, [jobId]);
            if (!job) {
                return res.status(404).json({ message: "Job not found or no longer available." });
            }
            if (job.status !== "open") {
                return res.status(410).json({ message: "Applications for this job have closed." });
            }
            // ── 4. Pull applicant identity from their user record ──────────────
            const user = await storage.getUserById(userId);
            if (!user?.email || !user?.phone) {
                return res.status(400).json({
                    message: "Add your phone and email to your profile before applying — employers contact you on these.",
                    reason: "incomplete_profile",
                });
            }
            const applicantName = (user.firstName || user.first_name || "").trim() + " " + (user.lastName || user.last_name || "").trim();
            const coverNote = String(req.body?.coverNote ?? "").trim().slice(0, 2000) || null;
            // ── 5. Upload CV to Supabase Storage if a file was attached ────────
            let cvUrl = null;
            if (req.file && req.file.buffer && req.file.buffer.length > 0) {
                try {
                    const { logCvUpload } = await Promise.resolve().then(() => __importStar(require("./supabaseClient")));
                    await logCvUpload({
                        userId,
                        fileName: req.file.originalname,
                        buffer: req.file.buffer,
                        mimeType: req.file.mimetype,
                        parsedText: "", // we don't parse local-jobs CVs (overseas board does, this is just storage)
                    });
                    // logCvUpload writes to cv_uploads; grab the most recent file_url for this user.
                    const { rows: [row] } = await db_1.pool.query(`
              SELECT file_url FROM cv_uploads
               WHERE user_id = $1 AND file_url IS NOT NULL
               ORDER BY uploaded_at DESC NULLS LAST, id DESC
               LIMIT 1
            `, [userId]).catch(() => ({ rows: [{ file_url: null }] }));
                    cvUrl = row?.file_url ?? null;
                }
                catch (uploadErr) {
                    console.warn(`[apply] CV upload failed for user=${userId}:`, uploadErr?.message);
                    // Non-fatal — application still gets submitted, employer can request CV later
                }
            }
            // ── 6. Upsert application — re-applying updates instead of duplicating ──
            const { rows: [appRow] } = await db_1.pool.query(`
          INSERT INTO local_job_applications (
            job_id, applicant_user_id, applicant_name, phone, email, cv_url, cover_note, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted')
          ON CONFLICT (job_id, applicant_user_id) DO UPDATE
             SET cv_url     = COALESCE(EXCLUDED.cv_url, local_job_applications.cv_url),
                 cover_note = COALESCE(EXCLUDED.cover_note, local_job_applications.cover_note),
                 updated_at = NOW()
          RETURNING id
        `, [jobId, userId, applicantName.trim() || user.email, user.phone, user.email, cvUrl, coverNote])
                .catch(async (err) => {
                // First-deploy guard: if the ON CONFLICT constraint doesn't exist yet,
                // add it idempotently and retry once. Phase 1 created the table
                // without the (job_id, applicant_user_id) unique constraint.
                if (err?.code === "42P10") {
                    await db_1.pool.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS uq_local_app_job_user
                ON local_job_applications(job_id, applicant_user_id)
                WHERE applicant_user_id IS NOT NULL
              `).catch(() => { });
                    return db_1.pool.query(`
                INSERT INTO local_job_applications (
                  job_id, applicant_user_id, applicant_name, phone, email, cv_url, cover_note, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted')
                RETURNING id
              `, [jobId, userId, applicantName.trim() || user.email, user.phone, user.email, cvUrl, coverNote]);
                }
                throw err;
            });
            // ── 7. Confirmation email (non-blocking, best-effort) ──────────────
            (async () => {
                try {
                    const { sendEmail } = await Promise.resolve().then(() => __importStar(require("./email")));
                    const firstName = (user.firstName || user.first_name || "there").trim() || "there";
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
                }
                catch (emailErr) {
                    console.warn(`[apply] confirmation email failed for ${user.email}:`, emailErr?.message);
                }
            })();
            res.json({
                success: true,
                applicationId: appRow.id,
                message: `Application sent to ${job.company_name}. Check your email — we sent you a confirmation.`,
                dailyLimit: limit,
                appsToday: Number(count) + 1,
            });
        }
        catch (err) {
            console.error("[POST /api/local-jobs/jobs/:id/apply]", err?.message, err?.stack?.split("\n").slice(0, 3).join(" | "));
            res.status(500).json({ message: "Could not submit your application right now. Please try again." });
        }
    });
    // ─── GET /api/local-jobs/me/applications ─────────────────────────────────
    // Returns the signed-in user's submitted applications with current status
    // + the job + company they applied to. Powers /kenya-careers/my-applications.
    app.get("/api/local-jobs/me/applications", async (req, res) => {
        try {
            const userId = req.user?.claims?.sub ?? req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: "Please sign in." });
            }
            const { rows } = await db_1.pool.query(`
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
      `, [userId]).catch(() => ({ rows: [] }));
            res.json({
                applications: rows.map((r) => ({
                    id: r.id,
                    status: r.status,
                    appliedAt: r.applied_at,
                    updatedAt: r.updated_at,
                    coverNote: r.cover_note,
                    cvUrl: r.cv_url,
                    job: {
                        id: r.job_id,
                        title: r.job_title,
                        county: r.job_county,
                        town: r.job_town,
                        status: r.job_status,
                    },
                    company: {
                        name: r.company_name,
                        verified: !!r.company_verified_at,
                    },
                })),
            });
        }
        catch (err) {
            console.error("[GET /api/local-jobs/me/applications]", err?.message);
            res.status(500).json({ message: "Could not load your applications." });
        }
    });
}
// Tiny HTML escape — only used by the confirmation email template
function escapeHtmlSafe(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c] || c));
}
