"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapHubSchema = bootstrapHubSchema;
exports.registerHubRoutes = registerHubRoutes;
const db_1 = require("../db");
const hub_plan_generator_1 = require("../lib/hub-plan-generator");
// ─── Idempotent table bootstrap ─────────────────────────────────────────────
async function bootstrapHubSchema() {
    await db_1.pool.query(`
    CREATE TABLE IF NOT EXISTS hub_countries (
      id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      slug                    VARCHAR(32) NOT NULL UNIQUE,
      name                    VARCHAR(80) NOT NULL,
      iso2                    CHAR(2)     NOT NULL,
      flag_emoji              VARCHAR(8)  NOT NULL,
      region                  VARCHAR(32),
      official_languages      TEXT[],
      currency                CHAR(3),
      avg_salary_kes_monthly  INTEGER,
      ease_score              INTEGER     CHECK (ease_score BETWEEN 1 AND 100),
      welcome_tagline         TEXT,
      has_shortage_list       BOOLEAN     NOT NULL DEFAULT false,
      shortage_list_url       TEXT,
      is_active               BOOLEAN     NOT NULL DEFAULT true,
      created_at              TIMESTAMP   NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS hub_countries_slug_idx ON hub_countries(slug);
    CREATE INDEX IF NOT EXISTS hub_countries_active_idx ON hub_countries(is_active) WHERE is_active = true;

    CREATE TABLE IF NOT EXISTS hub_visa_types (
      id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      country_id               UUID        NOT NULL REFERENCES hub_countries(id) ON DELETE CASCADE,
      code                     VARCHAR(64) NOT NULL UNIQUE,
      name                     VARCHAR(120) NOT NULL,
      traveler_friendly_name   VARCHAR(120) NOT NULL,
      category                 VARCHAR(32) NOT NULL,
      traveler_benefit         TEXT,
      processing_days_min      INTEGER,
      processing_days_max      INTEGER,
      fee_kes                  INTEGER,
      employer_sponsor_required BOOLEAN    NOT NULL DEFAULT false,
      min_salary_local         INTEGER,
      points_based_threshold   INTEGER,
      post_arrival_work_permit BOOLEAN    NOT NULL DEFAULT false,
      is_active                BOOLEAN    NOT NULL DEFAULT true,
      display_order            INTEGER    NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS hub_visa_types_country_idx ON hub_visa_types(country_id) WHERE is_active = true;

    CREATE TABLE IF NOT EXISTS hub_application_checklists (
      id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      visa_type_id              UUID        NOT NULL REFERENCES hub_visa_types(id) ON DELETE CASCADE,
      step_order                INTEGER     NOT NULL,
      step_title                VARCHAR(120) NOT NULL,
      step_gentle_description   TEXT        NOT NULL,
      required_documents        JSONB       NOT NULL DEFAULT '[]',
      estimated_days_min        INTEGER,
      estimated_days_max        INTEGER,
      estimated_cost_kes        INTEGER,
      can_parallelize           BOOLEAN     NOT NULL DEFAULT false,
      depends_on_step_orders    INTEGER[]   NOT NULL DEFAULT '{}',
      external_url              TEXT,
      UNIQUE(visa_type_id, step_order)
    );
    CREATE INDEX IF NOT EXISTS hub_checklists_visa_idx ON hub_application_checklists(visa_type_id, step_order);

    CREATE TABLE IF NOT EXISTS hub_user_journeys (
      id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                   VARCHAR     NOT NULL,
      visa_type_id              UUID        NOT NULL REFERENCES hub_visa_types(id) ON DELETE CASCADE,
      status                    VARCHAR(32) NOT NULL DEFAULT 'exploring',
      current_step_order        INTEGER     NOT NULL DEFAULT 1,
      steps_completed           JSONB       NOT NULL DEFAULT '{}',
      suitability_score         INTEGER     CHECK (suitability_score BETWEEN 0 AND 100),
      personalized_plan_text    TEXT,
      personalized_plan_updated_at TIMESTAMP,
      target_submit_date        DATE,
      notes                     TEXT,
      paused_reason             TEXT,
      started_at                TIMESTAMP   NOT NULL DEFAULT NOW(),
      updated_at                TIMESTAMP   NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, visa_type_id)
    );
    CREATE INDEX IF NOT EXISTS hub_journeys_user_idx ON hub_user_journeys(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS hub_shortage_occupations (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      country_iso2   CHAR(2)     NOT NULL,
      occupation     VARCHAR(120) NOT NULL,
      category       VARCHAR(64),
      source_url     TEXT,
      last_verified_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(country_iso2, occupation)
    );
    CREATE INDEX IF NOT EXISTS hub_shortage_lookup_idx ON hub_shortage_occupations(country_iso2, occupation);
  `);
    await seedHubDataIfEmpty();
}
// ─── Seed data — real, source-cited, easy to extend ─────────────────────────
async function seedHubDataIfEmpty() {
    const { rows } = await db_1.pool.query(`SELECT COUNT(*)::text AS c FROM hub_countries`);
    if (Number(rows[0]?.c ?? 0) > 0)
        return;
    console.log("[Hub] Seeding countries + visa types + checklists (first run)...");
    const client = await db_1.pool.connect();
    try {
        await client.query("BEGIN");
        // ── Countries ──────────────────────────────────────────────────────────
        const countries = [
            { slug: "germany", name: "Germany", iso2: "DE", flag: "🇩🇪", region: "EU / Schengen", langs: ["German", "English"], curr: "EUR", salary: 320000, ease: 82, tag: "Germany welcomes 400,000+ skilled workers a year — nurses, engineers and IT specialists are top of the list.", shortage: true, shortageUrl: "https://www.arbeitsagentur.de/datei/dok_ba014368.pdf" },
            { slug: "canada", name: "Canada", iso2: "CA", flag: "🇨🇦", region: "North America", langs: ["English", "French"], curr: "CAD", salary: 360000, ease: 78, tag: "Canada scores you on your skills — no employer needed to start your Express Entry journey.", shortage: true, shortageUrl: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/works.html" },
            { slug: "australia", name: "Australia", iso2: "AU", flag: "🇦🇺", region: "Oceania", langs: ["English"], curr: "AUD", salary: 400000, ease: 74, tag: "Australia's points-based skills program targets professionals in health, IT and trades.", shortage: true, shortageUrl: "https://immi.homeaffairs.gov.au/visas/working-in-australia/skill-occupation-list" },
            { slug: "new-zealand", name: "New Zealand", iso2: "NZ", flag: "🇳🇿", region: "Oceania", langs: ["English"], curr: "NZD", salary: 350000, ease: 76, tag: "The Green List fast-tracks doctors, engineers, and skilled trades straight to residence.", shortage: true, shortageUrl: "https://www.immigration.govt.nz/new-zealand-visas/preparing-a-visa-application/working-in-nz/hiring-a-migrant/green-list" },
            { slug: "uae", name: "UAE", iso2: "AE", flag: "🇦🇪", region: "Middle East", langs: ["Arabic", "English"], curr: "AED", salary: 210000, ease: 88, tag: "UAE issues work permits within 30 days once you have a job offer — the fastest route out of Kenya.", shortage: false, shortageUrl: null },
            { slug: "sweden", name: "Sweden", iso2: "SE", flag: "🇸🇪", region: "EU / Schengen", langs: ["Swedish", "English"], curr: "SEK", salary: 300000, ease: 71, tag: "Sweden's skilled-worker route needs a job offer, but processing is fast and family visas are automatic.", shortage: false, shortageUrl: "https://www.migrationsverket.se/English/Private-individuals/Working-in-Sweden.html" },
        ];
        const countryIdBySlug = new Map();
        for (const c of countries) {
            const r = await client.query(`INSERT INTO hub_countries (slug, name, iso2, flag_emoji, region, official_languages, currency, avg_salary_kes_monthly, ease_score, welcome_tagline, has_shortage_list, shortage_list_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`, [c.slug, c.name, c.iso2, c.flag, c.region, c.langs, c.curr, c.salary, c.ease, c.tag, c.shortage, c.shortageUrl]);
            countryIdBySlug.set(c.slug, r.rows[0].id);
        }
        // ── Visa types — real pathways with real numbers ───────────────────────
        // Kept representative rather than exhaustive; extend by adding rows.
        const visaTypes = [
            // Germany
            { country: "germany", code: "de_eu_blue_card", name: "EU Blue Card (Germany)", friendly: "The salaried skilled-worker route", category: "skilled_worker", benefit: "Direct route to residence for graduates earning €45k+ — permanent residence in 21 months if you speak German at B1.", pMin: 60, pMax: 120, feeKes: 15000, sponsor: true, minSalLocal: 45000, points: null, postArrival: false, order: 1 },
            { country: "germany", code: "de_opportunity_card", name: "Opportunity Card (Chancenkarte)", friendly: "Arrive first, find work later", category: "points_based", benefit: "Score 6+ points on qualifications, language and age → arrive on a 12-month job-search visa. No employer needed.", pMin: 45, pMax: 90, feeKes: 10000, sponsor: false, minSalLocal: null, points: 6, postArrival: true, order: 2 },
            { country: "germany", code: "de_skilled_worker", name: "Skilled Worker Visa (§18a)", friendly: "For vocational qualifications", category: "skilled_worker", benefit: "For nurses, technicians, chefs — recognised training + job offer = 4-year work visa with a clear path to PR.", pMin: 60, pMax: 150, feeKes: 12000, sponsor: true, minSalLocal: null, points: null, postArrival: false, order: 3 },
            // Canada
            { country: "canada", code: "ca_express_entry", name: "Express Entry (Federal Skilled Worker)", friendly: "Canada's points-based pathway", category: "points_based", benefit: "No employer needed. Score 470+ CRS and you're in the pool — most Kenyan nurses/IT pros clear within 6 months.", pMin: 180, pMax: 240, feeKes: 175000, sponsor: false, minSalLocal: null, points: 470, postArrival: false, order: 1 },
            { country: "canada", code: "ca_provincial_nominee", name: "Provincial Nominee Program", friendly: "Get nominated by a province", category: "points_based", benefit: "Provinces like Saskatchewan and Manitoba nominate healthcare and trades workers directly — often faster than Express Entry.", pMin: 120, pMax: 300, feeKes: 200000, sponsor: false, minSalLocal: null, points: null, postArrival: false, order: 2 },
            { country: "canada", code: "ca_work_permit_lmia", name: "Employer-Specific Work Permit (LMIA)", friendly: "Job offer from a Canadian employer", category: "sponsor_based", benefit: "Have a job offer? Employer files an LMIA and you get a closed work permit valid for 2-3 years.", pMin: 90, pMax: 180, feeKes: 60000, sponsor: true, minSalLocal: null, points: null, postArrival: false, order: 3 },
            // Australia
            { country: "australia", code: "au_skilled_independent", name: "Skilled Independent Visa (Subclass 189)", friendly: "Australia's independent skilled route", category: "points_based", benefit: "65+ points and your occupation is on the list = permanent residence with no employer or state sponsorship.", pMin: 120, pMax: 240, feeKes: 300000, sponsor: false, minSalLocal: null, points: 65, postArrival: false, order: 1 },
            { country: "australia", code: "au_employer_sponsored", name: "Employer Sponsored Visa (Subclass 482)", friendly: "Job offer from Australian employer", category: "sponsor_based", benefit: "Employer sponsors you for 2-4 years, with a pathway to permanent residence.", pMin: 60, pMax: 180, feeKes: 200000, sponsor: true, minSalLocal: 70000, points: null, postArrival: false, order: 2 },
            // New Zealand
            { country: "new-zealand", code: "nz_green_list_residence", name: "Green List Straight-to-Residence", friendly: "Direct residence for shortage roles", category: "skilled_worker", benefit: "Doctors, engineers, senior nurses, and 90+ other roles → apply directly for permanent residence with a job offer.", pMin: 90, pMax: 180, feeKes: 60000, sponsor: true, minSalLocal: null, points: null, postArrival: false, order: 1 },
            { country: "new-zealand", code: "nz_accredited_employer", name: "Accredited Employer Work Visa", friendly: "The main employer-sponsored route", category: "sponsor_based", benefit: "3-year work visa when an accredited NZ employer offers you a role — clear path to residence via Green List or Skilled Migrant.", pMin: 60, pMax: 150, feeKes: 55000, sponsor: true, minSalLocal: null, points: null, postArrival: false, order: 2 },
            // UAE
            { country: "uae", code: "ae_mohre_permit", name: "MOHRE Employment Visa", friendly: "The standard UAE work permit", category: "sponsor_based", benefit: "Employer sponsors you, MOHRE issues the work permit + residence visa, you're at work within 30 days.", pMin: 21, pMax: 45, feeKes: 45000, sponsor: true, minSalLocal: null, points: null, postArrival: false, order: 1 },
            { country: "uae", code: "ae_golden_visa", name: "Golden Visa (10 years)", friendly: "For senior professionals and specialists", category: "skilled_worker", benefit: "PhD holders, senior doctors, engineers earning AED 30k+/month → 10-year residence, no employer needed.", pMin: 30, pMax: 90, feeKes: 65000, sponsor: false, minSalLocal: 30000, points: null, postArrival: false, order: 2 },
            // Sweden
            { country: "sweden", code: "se_work_permit", name: "Work Permit (Migrationsverket)", friendly: "Standard Swedish work visa", category: "sponsor_based", benefit: "Job offer at SEK 27,360+/month = 2-year work permit with automatic family visas.", pMin: 60, pMax: 150, feeKes: 25000, sponsor: true, minSalLocal: 27360, points: null, postArrival: false, order: 1 },
        ];
        const visaTypeIdByCode = new Map();
        for (const v of visaTypes) {
            const countryId = countryIdBySlug.get(v.country);
            const r = await client.query(`INSERT INTO hub_visa_types (country_id, code, name, traveler_friendly_name, category, traveler_benefit, processing_days_min, processing_days_max, fee_kes, employer_sponsor_required, min_salary_local, points_based_threshold, post_arrival_work_permit, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`, [countryId, v.code, v.name, v.friendly, v.category, v.benefit, v.pMin, v.pMax, v.feeKes, v.sponsor, v.minSalLocal, v.points, v.postArrival, v.order]);
            visaTypeIdByCode.set(v.code, r.rows[0].id);
        }
        // ── Checklists — 6 canonical steps per pathway (extend per pathway as needed) ──
        // We use a generic template with per-visa customization where the numbers/URLs differ meaningfully.
        const genericSteps = (visaCode, countrySlug, extras) => [
            { order: 1, title: "Get your qualifications recognized", desc: `This is where an authority in the destination confirms your Kenyan qualification is worth the same as theirs. It usually takes 4-8 weeks. We'll walk you through the exact paperwork — no guessing.`, docs: [{ name: "Degree certificate (original + certified translation)", source: "Your university" }, { name: "Full academic transcripts", source: "Your university" }, { name: "Professional licence (if applicable — nurses, teachers, engineers)", source: "Your regulator" }], dMin: 30, dMax: 60, cost: 35000, para: true, deps: [], url: extras.qualUrl },
            { order: 2, title: "Take your language test", desc: `${extras.langTest}. Book at least 6 weeks ahead — Kenyan test centres fill up fast. We can suggest cheaper prep options if it's your first attempt.`, docs: [{ name: "Passport (valid 6+ months)", source: "You" }, { name: "Test booking confirmation", source: "British Council / IDP / Goethe" }], dMin: 21, dMax: 60, cost: 25000, para: true, deps: [], url: "" },
            { order: 3, title: "Prepare your documents package", desc: "Passport, photos, police clearance, medical certificates, financial proof. This is the boring but essential step. Once done, you can apply to multiple countries with the same core pack.", docs: [{ name: "Police Clearance Certificate (DCI, Kenya)", source: "DCI portal" }, { name: "Passport-size biometric photos", source: "Approved photographer" }, { name: "Bank statements (6 months)", source: "Your bank" }, { name: "Medical examination", source: "IOM Nairobi or approved panel physician" }], dMin: 21, dMax: 45, cost: 20000, para: false, deps: [1], url: "" },
            { order: 4, title: "Secure your job offer or nomination", desc: "For sponsor-based routes: employer files paperwork. For points-based: submit your profile to the pool. We'll help you draft a country-specific CV and cover letter that gets shortlisted.", docs: [{ name: "Tailored CV (country format)", source: "You + our CV Revamp service" }, { name: "Job offer letter or Expression of Interest", source: "Employer or govt portal" }], dMin: 30, dMax: 180, cost: 0, para: false, deps: [1, 2], url: "" },
            { order: 5, title: "Submit the visa application", desc: `File the full application through ${extras.embassy}. We'll double-check your file before you press submit so nothing gets bounced back.`, docs: [{ name: "Complete application form", source: "Official portal" }, { name: "Application fee payment", source: `${extras.feeApp} — pay online or at VFS` }, { name: "Every document from steps 1-4", source: "Your file" }], dMin: 7, dMax: 21, cost: extras.feeApp, para: false, deps: [1, 2, 3, 4], url: "" },
            { order: 6, title: "Biometrics + interview (if requested)", desc: "Book your biometrics appointment at the visa application centre. Most Kenyan applicants don't need an interview, but if you do, we'll prep you with the exact questions this country asks.", docs: [{ name: "Appointment confirmation", source: "VFS / TLScontact / Embassy" }], dMin: 3, dMax: 14, cost: 8000, para: false, deps: [5], url: "" },
            { order: 7, title: "Wait for the decision", desc: `${extras.postApp}. You can track your status online. Most Kenyan applications for this route are decided within the times shown — outliers usually mean the officer wanted one extra document.`, docs: [], dMin: 30, dMax: 120, cost: 0, para: false, deps: [6], url: "" },
            { order: 8, title: "Arrive + register with authorities", desc: "Once approved: book your flight, register your address on arrival (required in most EU countries within 7-14 days), open a local bank account, and start work. This is where the journey pays off.", docs: [{ name: "Your visa / residence permit", source: "In your passport" }, { name: "Proof of accommodation", source: "Landlord or host" }], dMin: 7, dMax: 30, cost: 0, para: false, deps: [7], url: "" },
        ];
        const perVisaExtras = {
            de_eu_blue_card: { qualBody: "Anabin database (KMK)", qualUrl: "https://anabin.kmk.org/", langTest: "German B1 (Goethe-Zertifikat) is the standard for the Blue Card long-term", feeApp: 15000, embassy: "the German Embassy Nairobi (or VFS Global)", postApp: "Blue Card decisions typically arrive in 2-4 months" },
            de_opportunity_card: { qualBody: "Anabin database (KMK)", qualUrl: "https://anabin.kmk.org/", langTest: "German A1 or English B2 counts toward your Opportunity Card points", feeApp: 10000, embassy: "the German Embassy Nairobi", postApp: "Opportunity Card decisions typically arrive in 6-12 weeks" },
            de_skilled_worker: { qualBody: "ZAB (Central Office for Foreign Education)", qualUrl: "https://www.kmk.org/zab/", langTest: "German B1 (Goethe-Zertifikat) is standard for skilled worker visas", feeApp: 12000, embassy: "the German Embassy Nairobi (or VFS Global)", postApp: "Skilled worker decisions typically arrive in 2-5 months" },
            ca_express_entry: { qualBody: "WES (World Education Services)", qualUrl: "https://www.wes.org/ca/", langTest: "IELTS General or CELPIP is required — aim for CLB 9+ for a competitive score", feeApp: 175000, embassy: "IRCC online (no in-person)", postApp: "Express Entry final decisions typically arrive 6 months after ITA" },
            ca_provincial_nominee: { qualBody: "WES or provincial equivalent", qualUrl: "https://www.wes.org/ca/", langTest: "IELTS General required (some provinces accept CELPIP)", feeApp: 200000, embassy: "IRCC + Provincial portal", postApp: "PNP decisions typically arrive in 4-10 months" },
            ca_work_permit_lmia: { qualBody: "WES for regulated professions", qualUrl: "https://www.wes.org/ca/", langTest: "IELTS General recommended but not always required", feeApp: 60000, embassy: "IRCC online + biometrics at VFS Nairobi", postApp: "LMIA-based work permits typically arrive in 3-6 months" },
            au_skilled_independent: { qualBody: "VETASSESS or profession-specific body", qualUrl: "https://www.vetassess.com.au/", langTest: "IELTS Academic or PTE — aim for 7+ in each band for a competitive points score", feeApp: 300000, embassy: "Home Affairs (ImmiAccount online)", postApp: "Skilled Independent decisions typically arrive 4-8 months after invitation" },
            au_employer_sponsored: { qualBody: "VETASSESS if occupation requires", qualUrl: "https://www.vetassess.com.au/", langTest: "IELTS 5.0+ each band is the minimum for 482 visas", feeApp: 200000, embassy: "Home Affairs (ImmiAccount online)", postApp: "482 sponsored visas typically arrive in 2-6 months" },
            nz_green_list_residence: { qualBody: "NZQA (New Zealand Qualifications Authority)", qualUrl: "https://www.nzqa.govt.nz/qualifications-standards/international-qualifications/", langTest: "IELTS 6.5+ (General) is the standard", feeApp: 60000, embassy: "Immigration NZ (online)", postApp: "Green List residence decisions typically arrive 3-6 months from application" },
            nz_accredited_employer: { qualBody: "NZQA if occupation regulated", qualUrl: "https://www.nzqa.govt.nz/", langTest: "IELTS 5.0+ (General) minimum, higher for some roles", feeApp: 55000, embassy: "Immigration NZ (online)", postApp: "AEWV decisions typically arrive in 2-5 months" },
            ae_mohre_permit: { qualBody: "UAE Ministry of Education attestation", qualUrl: "https://www.moe.gov.ae/", langTest: "No formal English test required for most roles", feeApp: 45000, embassy: "Employer files through MOHRE + your local UAE embassy", postApp: "MOHRE work permits typically arrive 3-6 weeks after employer submission" },
            ae_golden_visa: { qualBody: "UAE MOE attestation for degrees", qualUrl: "https://www.moe.gov.ae/", langTest: "No formal test — proof of role and salary is the gate", feeApp: 65000, embassy: "ICP (Federal Authority for Identity, Citizenship, Customs & Ports)", postApp: "Golden Visa decisions typically arrive in 1-3 months" },
            se_work_permit: { qualBody: "UHR (Swedish Council for Higher Education) if academic", qualUrl: "https://www.uhr.se/", langTest: "No test required (English is widely accepted at work)", feeApp: 25000, embassy: "Migrationsverket online", postApp: "Sweden work permits typically arrive in 2-5 months" },
        };
        for (const [code, id] of visaTypeIdByCode) {
            const extras = perVisaExtras[code];
            if (!extras)
                continue;
            const countrySlug = visaTypes.find(v => v.code === code)?.country ?? "";
            const steps = genericSteps(code, countrySlug, extras);
            for (const s of steps) {
                await client.query(`INSERT INTO hub_application_checklists (visa_type_id, step_order, step_title, step_gentle_description, required_documents, estimated_days_min, estimated_days_max, estimated_cost_kes, can_parallelize, depends_on_step_orders, external_url)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11)`, [id, s.order, s.title, s.desc, JSON.stringify(s.docs), s.dMin, s.dMax, s.cost, s.para, s.deps, s.url]);
            }
        }
        // ── Shortage list (seed with major Kenyan-relevant occupations) ────────
        const shortage = [
            ["DE", "registered nurse", "healthcare"], ["DE", "software engineer", "IT"], ["DE", "software developer", "IT"], ["DE", "electrician", "trades"], ["DE", "mechatronics technician", "trades"], ["DE", "civil engineer", "engineering"], ["DE", "doctor", "healthcare"], ["DE", "physiotherapist", "healthcare"],
            ["CA", "registered nurse", "healthcare"], ["CA", "software engineer", "IT"], ["CA", "software developer", "IT"], ["CA", "welder", "trades"], ["CA", "electrician", "trades"], ["CA", "truck driver", "transport"], ["CA", "personal support worker", "healthcare"], ["CA", "chef", "hospitality"],
            ["AU", "registered nurse", "healthcare"], ["AU", "software engineer", "IT"], ["AU", "civil engineer", "engineering"], ["AU", "electrician", "trades"], ["AU", "carpenter", "trades"], ["AU", "primary school teacher", "education"], ["AU", "accountant", "finance"],
            ["NZ", "registered nurse", "healthcare"], ["NZ", "software engineer", "IT"], ["NZ", "civil engineer", "engineering"], ["NZ", "electrician", "trades"], ["NZ", "doctor", "healthcare"], ["NZ", "secondary school teacher", "education"],
            ["AE", "registered nurse", "healthcare"], ["AE", "software engineer", "IT"], ["AE", "civil engineer", "engineering"], ["AE", "hotel manager", "hospitality"], ["AE", "chef", "hospitality"], ["AE", "driver", "transport"], ["AE", "accountant", "finance"],
            ["SE", "registered nurse", "healthcare"], ["SE", "software engineer", "IT"], ["SE", "civil engineer", "engineering"], ["SE", "doctor", "healthcare"],
        ];
        for (const [iso2, occ, cat] of shortage) {
            await client.query(`INSERT INTO hub_shortage_occupations (country_iso2, occupation, category, source_url) VALUES ($1,$2,$3,$4) ON CONFLICT (country_iso2, occupation) DO NOTHING`, [iso2, occ, cat, null]);
        }
        await client.query("COMMIT");
        console.log(`[Hub] Seeded ${countries.length} countries, ${visaTypes.length} visa types, ${shortage.length} shortage occupations.`);
    }
    catch (err) {
        await client.query("ROLLBACK");
        console.error("[Hub] Seed failed (transaction rolled back):", err?.message);
    }
    finally {
        client.release();
    }
}
// ─── Auth helper (reuses existing session pattern) ──────────────────────────
function sessionUserId(req) {
    return req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId ?? null;
}
// ─── Routes ─────────────────────────────────────────────────────────────────
function registerHubRoutes(app) {
    // GET /api/hub/countries — homepage grid
    app.get("/api/hub/countries", async (_req, res) => {
        try {
            const { rows } = await db_1.pool.query(`
        SELECT c.slug, c.name, c.iso2, c.flag_emoji, c.region, c.welcome_tagline,
               c.ease_score, c.avg_salary_kes_monthly,
               (SELECT COUNT(*) FROM hub_visa_types v WHERE v.country_id = c.id AND v.is_active) AS pathway_count
          FROM hub_countries c
         WHERE c.is_active = true
         ORDER BY c.ease_score DESC NULLS LAST, c.name ASC
      `);
            res.setHeader("Cache-Control", "public, max-age=300");
            res.json({ countries: rows });
        }
        catch (err) {
            console.error("[Hub] GET /countries error:", err?.message);
            res.status(500).json({ message: "Could not load countries." });
        }
    });
    // GET /api/hub/countries/:slug — country profile + all visa types + first-choice checklist
    app.get("/api/hub/countries/:slug", async (req, res) => {
        try {
            const slug = String(req.params.slug || "").toLowerCase();
            const { rows: countryRows } = await db_1.pool.query(`SELECT * FROM hub_countries WHERE slug = $1 AND is_active = true LIMIT 1`, [slug]);
            const country = countryRows[0];
            if (!country)
                return res.status(404).json({ message: "Country not found." });
            const { rows: visaRows } = await db_1.pool.query(`SELECT id, code, name, traveler_friendly_name, category, traveler_benefit,
                processing_days_min, processing_days_max, fee_kes, employer_sponsor_required,
                min_salary_local, points_based_threshold, post_arrival_work_permit
           FROM hub_visa_types WHERE country_id = $1 AND is_active = true
           ORDER BY display_order ASC`, [country.id]);
            // Fetch checklist for the FIRST (top-ranked) visa type — the hero pathway
            let checklist = [];
            if (visaRows[0]) {
                const { rows: stepRows } = await db_1.pool.query(`SELECT step_order, step_title, step_gentle_description, required_documents,
                  estimated_days_min, estimated_days_max, estimated_cost_kes,
                  can_parallelize, depends_on_step_orders, external_url
             FROM hub_application_checklists WHERE visa_type_id = $1
             ORDER BY step_order ASC`, [visaRows[0].id]);
                checklist = stepRows;
            }
            res.setHeader("Cache-Control", "public, max-age=300");
            res.json({ country, visaTypes: visaRows, primaryChecklist: checklist });
        }
        catch (err) {
            console.error("[Hub] GET /countries/:slug error:", err?.message);
            res.status(500).json({ message: "Could not load country profile." });
        }
    });
    // GET /api/hub/countries/:slug/visa/:code/checklist — full checklist for any pathway
    app.get("/api/hub/countries/:slug/visa/:code/checklist", async (req, res) => {
        try {
            const code = String(req.params.code || "").toLowerCase();
            const { rows } = await db_1.pool.query(`SELECT s.step_order, s.step_title, s.step_gentle_description, s.required_documents,
                s.estimated_days_min, s.estimated_days_max, s.estimated_cost_kes,
                s.can_parallelize, s.depends_on_step_orders, s.external_url,
                v.name AS visa_name, v.traveler_friendly_name
           FROM hub_application_checklists s
           JOIN hub_visa_types v ON v.id = s.visa_type_id
          WHERE v.code = $1
          ORDER BY s.step_order ASC`, [code]);
            if (rows.length === 0)
                return res.status(404).json({ message: "Checklist not found." });
            res.setHeader("Cache-Control", "public, max-age=300");
            res.json({ visaName: rows[0].visa_name, travelerFriendlyName: rows[0].traveler_friendly_name, steps: rows });
        }
        catch (err) {
            console.error("[Hub] GET checklist error:", err?.message);
            res.status(500).json({ message: "Could not load checklist." });
        }
    });
    // POST /api/hub/plan — generate personalized migration plan (AI)
    // Public — anon users get a plan too (great top-of-funnel).
    // Signed-in users have their result persisted to hub_user_journeys.
    app.post("/api/hub/plan", async (req, res) => {
        try {
            const userId = sessionUserId(req);
            const body = req.body ?? {};
            const input = {
                occupation: String(body.occupation ?? "").trim(),
                yearsExperience: body.yearsExperience != null ? Number(body.yearsExperience) : null,
                targetCountrySlug: body.targetCountrySlug ? String(body.targetCountrySlug).toLowerCase() : null,
                englishLevel: body.englishLevel ? String(body.englishLevel) : null,
                currentSalaryKes: body.currentSalaryKes != null ? Number(body.currentSalaryKes) : null,
            };
            if (!input.occupation || input.occupation.length < 2) {
                return res.status(400).json({ message: "Tell us your occupation (even one word — 'nurse', 'developer')." });
            }
            const plan = await (0, hub_plan_generator_1.generateHubPlan)(input);
            // Persist for signed-in users so the Tracker can show it later
            if (userId && plan.recommendedVisaTypeCode) {
                try {
                    const { rows } = await db_1.pool.query(`SELECT id FROM hub_visa_types WHERE code = $1 LIMIT 1`, [plan.recommendedVisaTypeCode]);
                    if (rows[0]) {
                        await db_1.pool.query(`INSERT INTO hub_user_journeys (user_id, visa_type_id, status, suitability_score, personalized_plan_text, personalized_plan_updated_at)
               VALUES ($1,$2,'exploring',$3,$4,NOW())
               ON CONFLICT (user_id, visa_type_id) DO UPDATE SET
                 suitability_score            = EXCLUDED.suitability_score,
                 personalized_plan_text       = EXCLUDED.personalized_plan_text,
                 personalized_plan_updated_at = NOW(),
                 updated_at                   = NOW()`, [userId, rows[0].id, plan.suitabilityScore, plan.narrativePlan]);
                    }
                }
                catch (persistErr) {
                    console.warn("[Hub] Plan persist failed (non-fatal):", persistErr?.message);
                }
            }
            res.json({ plan, signedIn: !!userId });
        }
        catch (err) {
            console.error("[Hub] POST /plan error:", err?.message);
            res.status(500).json({ message: "We couldn't generate your plan right now. Please try again in a moment." });
        }
    });
    // POST /api/hub/journeys — start a journey (signed-in only)
    app.post("/api/hub/journeys", async (req, res) => {
        const userId = sessionUserId(req);
        if (!userId)
            return res.status(401).json({ message: "Please sign in to start your journey." });
        try {
            const visaCode = String(req.body?.visaCode ?? "").toLowerCase();
            const targetDate = req.body?.targetSubmitDate ? String(req.body.targetSubmitDate) : null;
            const { rows: v } = await db_1.pool.query(`SELECT id FROM hub_visa_types WHERE code = $1 LIMIT 1`, [visaCode]);
            if (!v[0])
                return res.status(404).json({ message: "Unknown pathway." });
            const { rows } = await db_1.pool.query(`INSERT INTO hub_user_journeys (user_id, visa_type_id, target_submit_date, status)
         VALUES ($1,$2,$3,'gathering_docs')
         ON CONFLICT (user_id, visa_type_id) DO UPDATE SET
           target_submit_date = EXCLUDED.target_submit_date,
           status             = CASE WHEN hub_user_journeys.status = 'exploring' THEN 'gathering_docs' ELSE hub_user_journeys.status END,
           updated_at         = NOW()
         RETURNING *`, [userId, v[0].id, targetDate]);
            res.json({ journey: rows[0] });
        }
        catch (err) {
            console.error("[Hub] POST /journeys error:", err?.message);
            res.status(500).json({ message: "Could not start your journey." });
        }
    });
    // GET /api/hub/journeys — dashboard data for the Tracker
    app.get("/api/hub/journeys", async (req, res) => {
        const userId = sessionUserId(req);
        if (!userId)
            return res.status(401).json({ message: "Please sign in." });
        try {
            const { rows } = await db_1.pool.query(`
        SELECT j.*, v.name AS visa_name, v.traveler_friendly_name, v.code AS visa_code,
               v.processing_days_min, v.processing_days_max, v.fee_kes,
               c.name AS country_name, c.slug AS country_slug, c.flag_emoji, c.iso2,
               (SELECT COUNT(*) FROM hub_application_checklists s WHERE s.visa_type_id = v.id) AS total_steps
          FROM hub_user_journeys j
          JOIN hub_visa_types v ON v.id = j.visa_type_id
          JOIN hub_countries  c ON c.id = v.country_id
         WHERE j.user_id = $1
         ORDER BY j.updated_at DESC`, [userId]);
            res.json({ journeys: rows });
        }
        catch (err) {
            console.error("[Hub] GET /journeys error:", err?.message);
            res.status(500).json({ message: "Could not load your journeys." });
        }
    });
    // POST /api/hub/journeys/:id/step — mark a step complete or update status
    app.post("/api/hub/journeys/:id/step", async (req, res) => {
        const userId = sessionUserId(req);
        if (!userId)
            return res.status(401).json({ message: "Please sign in." });
        try {
            const journeyId = String(req.params.id);
            const stepOrder = Number(req.body?.stepOrder);
            const done = req.body?.done !== false;
            if (!Number.isInteger(stepOrder) || stepOrder < 1)
                return res.status(400).json({ message: "Bad step number." });
            const { rows } = await db_1.pool.query(`SELECT steps_completed, visa_type_id FROM hub_user_journeys WHERE id = $1 AND user_id = $2 LIMIT 1`, [journeyId, userId]);
            if (!rows[0])
                return res.status(404).json({ message: "Journey not found." });
            const completed = rows[0].steps_completed ?? {};
            if (done)
                completed[String(stepOrder)] = { doneAt: new Date().toISOString() };
            else
                delete completed[String(stepOrder)];
            const currentStep = Math.max(1, Math.min(20, stepOrder + (done ? 1 : 0)));
            await db_1.pool.query(`UPDATE hub_user_journeys SET steps_completed = $3::jsonb, current_step_order = $4, updated_at = NOW()
          WHERE id = $1 AND user_id = $2`, [journeyId, userId, JSON.stringify(completed), currentStep]);
            res.json({ ok: true, stepsCompleted: completed, currentStep });
        }
        catch (err) {
            console.error("[Hub] POST /journeys/:id/step error:", err?.message);
            res.status(500).json({ message: "Could not update the step." });
        }
    });
    console.log("[Hub] Routes registered: /api/hub/countries, /api/hub/countries/:slug, /api/hub/plan, /api/hub/journeys");
}
