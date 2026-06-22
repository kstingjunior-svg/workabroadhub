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
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapLocalJobs = bootstrapLocalJobs;
/**
 * Local Jobs Bootstrap — Kenya Careers Phase 1
 *
 * 2026-06: founder asked for a "Kenya Careers" employer portal alongside the
 * existing visa-sponsored overseas jobs board, without touching the live
 * payment / auth / visa / subscription systems.
 *
 * This module:
 *   1. Creates 4 new tables on boot (IF NOT EXISTS) — strictly additive.
 *      Zero FK back into the existing users/jobs/payments schema for now,
 *      so a misbehaving migration can't take down the live overseas board.
 *   2. Seeds ~6 sample companies and ~15 sample jobs on first boot so the
 *      public /kenya-careers page isn't empty when Tony shows it to early
 *      employers (Naivas, Quickmart, etc).
 *   3. Idempotent — running it a second time is a no-op.
 *
 * The applications table is defined here so the schema is consistent with
 * future phases, but no API exposes it yet — Phase 1 is read-only public
 * browse only. The Apply button on the job detail page is a "Coming soon"
 * placeholder until Phase 2 ships the application form + CV upload.
 *
 * Phases (for context):
 *   • Phase 1 (this) — additive schema + public read API + landing/detail pages
 *   • Phase 2       — job-seeker apply form + CV upload
 *   • Phase 3       — employer accounts (separate auth) + post-job CRUD
 *   • Phase 4       — admin approval queue + Verified Employer badge
 *   • Phase 5       — monetization (featured jobs, employer plans)
 */
const db_1 = require("../db");
let _ranOnce = false;
async function bootstrapLocalJobs() {
    if (_ranOnce)
        return;
    _ranOnce = true;
    try {
        // ── 0. Ensure UUID generator is available ──────────────────────────────
        // Postgres 13+ has gen_random_uuid() built in. Older deployments need
        // pgcrypto. Try the extension idempotently; if it fails (insufficient
        // privilege on managed Postgres), fall through — newer Postgres will
        // still work because the function is core.
        await db_1.pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).catch((err) => {
            console.warn("[local-jobs] could not enable pgcrypto (may be unnecessary):", err?.message);
        });
        // ── 1. DDL (idempotent — IF NOT EXISTS) ────────────────────────────────
        await db_1.pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(160) NOT NULL,
        slug            VARCHAR(160) UNIQUE,
        logo_url        TEXT,
        industry        VARCHAR(80),
        county          VARCHAR(60),
        address         TEXT,
        contact_name    VARCHAR(120),
        phone           VARCHAR(40),
        email           VARCHAR(160),
        description     TEXT,
        website         TEXT,
        verified_at     TIMESTAMP,
        status          VARCHAR(24) NOT NULL DEFAULT 'pending',  -- pending|approved|suspended
        is_featured     BOOLEAN DEFAULT false,                    -- Phase 5 hook
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
        await db_1.pool.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name            VARCHAR(160) NOT NULL,
        county          VARCHAR(60),
        town            VARCHAR(80),
        location_detail TEXT,
        manager_name    VARCHAR(120),
        contact_phone   VARCHAR(40),
        created_at      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
        await db_1.pool.query(`
      CREATE TABLE IF NOT EXISTS local_jobs (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
        title           VARCHAR(200) NOT NULL,
        department      VARCHAR(120),
        vacancies       INTEGER NOT NULL DEFAULT 1,
        employment_type VARCHAR(40),    -- full_time|part_time|contract|internship|casual
        salary_min      INTEGER,        -- KES, nullable (optional per spec)
        salary_max      INTEGER,
        requirements    TEXT,
        responsibilities TEXT,
        deadline        DATE,
        county          VARCHAR(60),
        town            VARCHAR(80),
        experience_level VARCHAR(40),   -- entry|mid|senior|any
        category        VARCHAR(60),    -- retail|hospitality|healthcare|construction|transport|security|cleaning|education|logistics|other
        status          VARCHAR(24) NOT NULL DEFAULT 'open',     -- open|closed|draft
        is_featured     BOOLEAN DEFAULT false,                    -- Phase 5 hook
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
        // Defined now so Phase 2 can wire up applications without another migration.
        // No API exposes this table yet.
        await db_1.pool.query(`
      CREATE TABLE IF NOT EXISTS local_job_applications (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id            UUID NOT NULL REFERENCES local_jobs(id) ON DELETE CASCADE,
        applicant_user_id UUID,                            -- nullable for guest applies
        applicant_name    VARCHAR(160) NOT NULL,
        phone             VARCHAR(40) NOT NULL,
        email             VARCHAR(160) NOT NULL,
        cv_url            TEXT,
        cover_note        TEXT,
        status            VARCHAR(24) NOT NULL DEFAULT 'submitted',  -- submitted|shortlisted|rejected|hired
        applied_at        TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
        // Indexes for the filters we'll hit on the public list page
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_local_jobs_status   ON local_jobs(status)`);
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_local_jobs_county   ON local_jobs(county)`);
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_local_jobs_category ON local_jobs(category)`);
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_local_jobs_company  ON local_jobs(company_id)`);
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_companies_status    ON companies(status)`);
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_branches_company    ON branches(company_id)`);
        // Phase 2: unique application per (job, user) so re-applying updates
        // instead of duplicating + countering the daily-limit gate.
        // Also a per-user index for the /me/applications page.
        await db_1.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_local_app_job_user
      ON local_job_applications(job_id, applicant_user_id)
      WHERE applicant_user_id IS NOT NULL
    `);
        await db_1.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_local_app_user_time
      ON local_job_applications(applicant_user_id, applied_at DESC)
    `);
        // Phase 2.5: extra applicant fields. Founder asked for county / highest
        // education / years of experience / certificates upload so employers can
        // pre-filter on the basics. All nullable to keep Phase 2 backfill simple
        // — early applications without these still work.
        await db_1.pool.query(`ALTER TABLE local_job_applications ADD COLUMN IF NOT EXISTS applicant_county    VARCHAR(60)`);
        await db_1.pool.query(`ALTER TABLE local_job_applications ADD COLUMN IF NOT EXISTS highest_education   VARCHAR(80)`);
        await db_1.pool.query(`ALTER TABLE local_job_applications ADD COLUMN IF NOT EXISTS years_experience    INTEGER`);
        await db_1.pool.query(`ALTER TABLE local_job_applications ADD COLUMN IF NOT EXISTS certificates_url    TEXT`);
        // Direct company_id stamp on the application row, so employer-side queries
        // (Phase 3) don't need to join through local_jobs every time.
        // Backfilled via a simple UPDATE for any pre-Phase-2.5 applications.
        await db_1.pool.query(`ALTER TABLE local_job_applications ADD COLUMN IF NOT EXISTS company_id UUID`);
        await db_1.pool.query(`
      UPDATE local_job_applications a
         SET company_id = j.company_id
        FROM local_jobs j
       WHERE a.job_id = j.id AND a.company_id IS NULL
    `).catch(() => { });
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_local_app_company ON local_job_applications(company_id)`);
        // Phase 3a: claim-company table. Anyone can submit a claim ("I'm the HR
        // manager at Naivas — can I take over this profile?"). Admin reviews
        // each one before granting access. No FK to users table — claims can
        // come from non-signed-in visitors too.
        await db_1.pool.query(`
      CREATE TABLE IF NOT EXISTS company_claims (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        claimant_name VARCHAR(160) NOT NULL,
        claimant_email VARCHAR(160) NOT NULL,
        claimant_phone VARCHAR(40),
        role_at_company VARCHAR(120),
        message       TEXT,
        evidence_url  TEXT,                            -- future: link to verification email/document
        status        VARCHAR(24) NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
        reviewed_by   UUID,                            -- admin userId when actioned
        reviewed_at   TIMESTAMP,
        review_note   TEXT,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_company_claims_company ON company_claims(company_id)`);
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_company_claims_status  ON company_claims(status)`);
        // ── 2. Phase 3a expansion: 36 employers, 60+ branches, 100+ jobs ────────
        // Catalogue lives in ./local-jobs-seed-data.ts so it can grow without
        // bloating this file. Inserts are IDEMPOTENT — we use ON CONFLICT(slug)
        // for companies and unique-constraint guards for branches/jobs, so
        // re-running on every boot just adds whatever's missing.
        const { SEED_COMPANIES } = await Promise.resolve().then(() => __importStar(require("./local-jobs-seed-data")));
        // Ensure the unique constraints needed for ON CONFLICT to work.
        // companies.slug is already UNIQUE from CREATE TABLE. Branches and jobs
        // get partial-unique indexes so we can detect duplicates without forcing
        // a hard constraint that would break manual inserts.
        await db_1.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_company_name
      ON branches(company_id, name)
    `).catch(() => { });
        await db_1.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_local_jobs_seed_dedup
      ON local_jobs(company_id, title, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
    `).catch(() => { });
        console.log(`[local-jobs] Syncing catalogue of ${SEED_COMPANIES.length} employers (idempotent)…`);
        let companiesAdded = 0, branchesAdded = 0, jobsAdded = 0;
        const companyIds = {};
        // Companies — upsert on slug. Existing rows keep their current data so
        // founder edits via admin panel aren't overwritten by the seed.
        for (const c of SEED_COMPANIES) {
            const { rows } = await db_1.pool.query(`INSERT INTO companies (name, slug, industry, county, description, website, status, verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'approved', NOW())
         ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
         RETURNING id, (xmax = 0) AS was_inserted`, [c.name, c.slug, c.industry, c.hqCounty, c.description, c.website]);
            companyIds[c.slug] = rows[0].id;
            if (rows[0].was_inserted)
                companiesAdded++;
        }
        // Branches — upsert on (company_id, name). Existing branches keep their data.
        const branchIds = {};
        for (const c of SEED_COMPANIES) {
            const companyId = companyIds[c.slug];
            if (!companyId)
                continue;
            for (const b of c.branches) {
                const { rows } = await db_1.pool.query(`INSERT INTO branches (company_id, name, county, town)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id, (xmax = 0) AS was_inserted`, [companyId, b.name, b.county, b.town]);
                // Key by name only — names like "Naivas Thika Road Mall" are unique
                // enough across the catalogue (and the catalogue authors avoid collisions).
                branchIds[b.name] = rows[0].id;
                if (rows[0].was_inserted)
                    branchesAdded++;
            }
        }
        // Jobs — one role × one branch per company. Idempotent on
        // (company_id, title, branch_id). Existing jobs keep their data.
        const today = new Date();
        const deadline = new Date(today);
        deadline.setMonth(deadline.getMonth() + 1);
        const deadlineStr = deadline.toISOString().slice(0, 10);
        for (const c of SEED_COMPANIES) {
            const companyId = companyIds[c.slug];
            if (!companyId)
                continue;
            // For each role × each branch the company has, create one job. That
            // gives small companies (1-2 branches) ~4 jobs and larger ones (Naivas,
            // Safaricom) 8-12 jobs. Total across 36 employers lands around 110-130
            // jobs, comfortably over the 100+ target Tony asked for.
            for (const role of c.roles) {
                for (const branch of c.branches) {
                    const branchId = branchIds[branch.name];
                    if (!branchId)
                        continue;
                    const { rowCount } = await db_1.pool.query(`INSERT INTO local_jobs (
                company_id, branch_id, title, department, vacancies, employment_type,
                salary_min, salary_max, requirements, responsibilities, deadline,
                county, town, experience_level, category, status
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'open')
             ON CONFLICT DO NOTHING`, [
                        companyId, branchId, role.title, role.department, role.vacancies, role.type,
                        role.salaryMin, role.salaryMax, role.requirements, role.responsibilities,
                        deadlineStr, branch.county, branch.town, role.experience, role.category,
                    ]).catch((err) => {
                        // ON CONFLICT may not yet have the index if this is a fresh deploy
                        // racing with the index creation — just continue.
                        console.warn(`[local-jobs] job insert non-fatal: ${err?.message}`);
                        return { rowCount: 0 };
                    });
                    if ((rowCount ?? 0) > 0)
                        jobsAdded++;
                }
            }
        }
        console.log(`[local-jobs] Catalogue sync: +${companiesAdded} companies, +${branchesAdded} branches, +${jobsAdded} jobs.`);
        return;
        /* legacy hand-written 15-job array below — superseded by SEED_COMPANIES
           catalogue. Kept commented out so we have an easy rollback path if the
           catalogue-driven seed ever breaks. Safe to delete after a clean deploy.
        const _legacyJobs: any[] = [
          { companySlug: "naivas", branchName: "Naivas Thika Road Mall", title: "Store Manager",
            department: "Operations", vacancies: 1, type: "full_time",
            salaryMin: 80_000, salaryMax: 120_000, county: "Nairobi", town: "Thika Road",
            category: "retail", experience: "senior",
            requirements: "5+ years retail management experience. Bachelor's degree in business or related field. Strong leadership and inventory control skills.",
            responsibilities: "Oversee daily branch operations. Lead a team of 40+ staff. Hit monthly sales targets. Manage stock, shrinkage, and customer experience." },
          { companySlug: "naivas", branchName: "Naivas Kahawa Wendani", title: "Cashier",
            department: "Front End", vacancies: 6, type: "full_time",
            salaryMin: 22_000, salaryMax: 28_000, county: "Kiambu", town: "Kahawa Wendani",
            category: "retail", experience: "entry",
            requirements: "KCSE certificate. Good numeracy. Customer-friendly attitude. Previous till experience is a plus but we train.",
            responsibilities: "Process customer payments accurately. Handle cash and M-Pesa. Reconcile till at end of shift. Greet every customer." },
          { companySlug: "naivas", branchName: "Naivas Kisumu Central", title: "Security Guard",
            department: "Security", vacancies: 4, type: "full_time",
            salaryMin: 18_000, salaryMax: 22_000, county: "Kisumu", town: "Kisumu CBD",
            category: "security", experience: "entry",
            requirements: "KCSE. PSRA-licensed preferred. Physically fit. Clean criminal record.",
            responsibilities: "Patrol the premises. Operate metal detectors at entry. Monitor CCTV. Respond to incidents." },
          { companySlug: "naivas", branchName: "Naivas Eldoret Zion", title: "Warehouse Assistant",
            department: "Logistics", vacancies: 3, type: "full_time",
            salaryMin: 20_000, salaryMax: 25_000, county: "Uasin Gishu", town: "Eldoret",
            category: "logistics", experience: "entry",
            requirements: "KCSE. Physically capable of lifting 25kg. Forklift licence is a bonus.",
            responsibilities: "Receive deliveries. Stack stock. Pick orders for branch transfers. Maintain warehouse cleanliness." },
          { companySlug: "quickmart", branchName: "Quickmart Kilimani", title: "Department Supervisor — Fresh Foods",
            department: "Fresh Foods", vacancies: 1, type: "full_time",
            salaryMin: 45_000, salaryMax: 60_000, county: "Nairobi", town: "Kilimani",
            category: "retail", experience: "mid",
            requirements: "Diploma in food technology or related. 3+ years supervising a fresh foods section in a supermarket. Food-safety certification.",
            responsibilities: "Run the bakery, butchery and fresh produce sections. Manage waste and cold-chain. Lead a team of 12." },
          { companySlug: "quickmart", branchName: "Quickmart Ruaka", title: "Cleaner",
            department: "Housekeeping", vacancies: 5, type: "full_time",
            salaryMin: 14_000, salaryMax: 18_000, county: "Kiambu", town: "Ruaka",
            category: "cleaning", experience: "entry",
            requirements: "Able to read and write. Reliable, punctual, willing to work shifts.",
            responsibilities: "Clean store aisles, washrooms and back-of-house. Empty bins. Report spills immediately." },
          { companySlug: "carrefour", branchName: "Carrefour Two Rivers Mall", title: "Customer Service Representative",
            department: "Customer Service", vacancies: 2, type: "full_time",
            salaryMin: 32_000, salaryMax: 42_000, county: "Nairobi", town: "Runda",
            category: "retail", experience: "mid",
            requirements: "Diploma. 2+ years in front-line customer service. Fluent English and Swahili.",
            responsibilities: "Handle customer enquiries, returns and complaints at the service desk. Process refunds. Escalate where needed." },
          { companySlug: "carrefour", branchName: "Carrefour Nyali Centre", title: "Delivery Driver",
            department: "Online Fulfilment", vacancies: 4, type: "full_time",
            salaryMin: 28_000, salaryMax: 35_000, county: "Mombasa", town: "Nyali",
            category: "transport", experience: "entry",
            requirements: "Valid BCE driving licence with 3+ years' clean record. Knowledge of Mombasa & Kilifi.",
            responsibilities: "Deliver online grocery orders to customer doorsteps. Maintain the cold-chain. Handle cash on delivery." },
          { companySlug: "magunas", branchName: "Magunas Ngong Road", title: "Butchery Attendant",
            department: "Butchery", vacancies: 2, type: "full_time",
            salaryMin: 22_000, salaryMax: 30_000, county: "Nairobi", town: "Ngong Road",
            category: "retail", experience: "mid",
            requirements: "Food-handling certificate. 1+ years experience in a supermarket butchery.",
            responsibilities: "Cut and pack meat to customer specifications. Maintain hygiene standards. Stock the display fridge." },
          { companySlug: "java-house", branchName: "Java House Junction Mall", title: "Barista",
            department: "Bar", vacancies: 3, type: "full_time",
            salaryMin: 25_000, salaryMax: 32_000, county: "Nairobi", town: "Ngong Road",
            category: "hospitality", experience: "entry",
            requirements: "KCSE. Food-handling certificate. Friendly demeanour. We train you on the espresso machine.",
            responsibilities: "Prepare hot and cold drinks to spec. Maintain bar cleanliness. Upsell daily features." },
          { companySlug: "java-house", branchName: "Java House Westside", title: "Restaurant Supervisor",
            department: "Front of House", vacancies: 1, type: "full_time",
            salaryMin: 50_000, salaryMax: 65_000, county: "Nairobi", town: "Westlands",
            category: "hospitality", experience: "senior",
            requirements: "Diploma in hospitality management. 4+ years in a busy restaurant. Strong people-management skills.",
            responsibilities: "Run the front-of-house shift. Lead a team of 18 servers and hosts. Drive guest satisfaction scores." },
          { companySlug: "java-house", branchName: "Java House Junction Mall", title: "Cook — Hot Kitchen",
            department: "Kitchen", vacancies: 2, type: "full_time",
            salaryMin: 28_000, salaryMax: 36_000, county: "Nairobi", town: "Ngong Road",
            category: "hospitality", experience: "mid",
            requirements: "Diploma in culinary arts or 3+ years equivalent kitchen experience. Food-safety certification.",
            responsibilities: "Prepare menu items to standard. Maintain station cleanliness. Manage stock rotation." },
          { companySlug: "aga-khan", branchName: "Aga Khan Hospital Nairobi (Parklands)", title: "Registered Nurse — Outpatient",
            department: "Outpatient Services", vacancies: 3, type: "full_time",
            salaryMin: 85_000, salaryMax: 120_000, county: "Nairobi", town: "Parklands",
            category: "healthcare", experience: "mid",
            requirements: "BScN or KRCHN. Active Nursing Council of Kenya licence. BLS-certified. 2+ years post-internship.",
            responsibilities: "Provide patient assessment and care in the outpatient clinics. Administer medications. Document electronically." },
          { companySlug: "aga-khan", branchName: "Aga Khan Hospital Nairobi (Parklands)", title: "Hospital Cleaner",
            department: "Environmental Services", vacancies: 6, type: "full_time",
            salaryMin: 18_000, salaryMax: 24_000, county: "Nairobi", town: "Parklands",
            category: "cleaning", experience: "entry",
            requirements: "KCSE preferred but not required. Able to follow infection-prevention protocols. Willing to work shifts.",
            responsibilities: "Clean and disinfect wards, theatres and public areas. Handle medical waste per protocol. Restock supplies." },
          { companySlug: "aga-khan", branchName: "Aga Khan Hospital Nairobi (Parklands)", title: "Pharmacy Technologist",
            department: "Pharmacy", vacancies: 2, type: "full_time",
            salaryMin: 50_000, salaryMax: 70_000, county: "Nairobi", town: "Parklands",
            category: "healthcare", experience: "mid",
            requirements: "Diploma in Pharmaceutical Technology. Active PPB licence. 2+ years hospital pharmacy experience.",
            responsibilities: "Dispense outpatient prescriptions. Maintain inventory accuracy. Counsel patients on medication use." },
        ];
        */
    }
    catch (err) {
        // 2026-06: critical that bootstrap failure NEVER takes down the live
        // overseas board. Log loudly but always return — the rest of the server
        // boots regardless and `/api/local-jobs` simply returns an empty list
        // (which the client handles gracefully).
        console.error("[local-jobs] bootstrap failed (non-fatal):", err?.message);
    }
}
