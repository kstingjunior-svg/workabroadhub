"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Country portal catalogue — single source of truth.
//
// Used by:
//   1. server/seed.ts          → INSERTs into job_links on every boot
//   2. server/routes.ts        → synthetic fallback in /api/countries/:code
//                                when the DB row is missing
//   3. server/routes.ts        → /api/go/job/:jobId resolves synthetic-* IDs
//                                from this catalogue
//
// Every URL hand-audited for:
//   (a) accessibility from Kenyan IPs (no Akamai/Imperva WAF block),
//   (b) genuine acceptance of non-citizen / African / visa-sponsorship
//       applications,
//   (c) listings updated within the last 90 days as of the audit.
//
// Add new entries only after personally verifying the URL loads from a
// Kenyan IP AND that the portal is open to African applicants.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNTRY_PORTALS = void 0;
exports.makeSyntheticPortalId = makeSyntheticPortalId;
exports.resolveSyntheticPortal = resolveSyntheticPortal;
exports.COUNTRY_PORTALS = {
    uk: [
        { name: "NHS Jobs", url: "https://www.jobs.nhs.uk", description: "Official NHS recruitment — Health & Care Worker visa, top destination for Kenyan nurses", order: 1 },
        { name: "Indeed UK", url: "https://www.indeed.co.uk", description: "Largest UK job board — filter by 'visa sponsorship'", order: 2 },
        { name: "Reed", url: "https://www.reed.co.uk", description: "UK-wide jobs across every sector", order: 3 },
        { name: "LinkedIn Jobs UK", url: "https://www.linkedin.com/jobs/?location=United+Kingdom", description: "Professional network — recruiters reach out directly", order: 4 },
        { name: "CV-Library", url: "https://www.cv-library.co.uk", description: "Large UK CV-sharing board, visa-sponsor friendly", order: 5 },
        { name: "Adzuna UK", url: "https://www.adzuna.co.uk", description: "Aggregator pulling listings from across the UK web", order: 6 },
        { name: "Glassdoor UK", url: "https://www.glassdoor.co.uk", description: "Salaries + reviews + jobs — research employers before applying", order: 7 },
        { name: "TipTopJob (Visa)", url: "https://www.tiptopjob.com/search/jobs.asp?keywords=visa+sponsor&location=United+Kingdom", description: "Pre-filtered to visa-sponsoring UK roles", order: 8 },
    ],
    canada: [
        { name: "Job Bank Canada", url: "https://www.jobbank.gc.ca", description: "Government Portal of Canada job board, supports LMIA", order: 1 },
        { name: "Indeed Canada", url: "https://ca.indeed.com", description: "Indeed CA — broad coverage, visa-friendly filters", order: 2 },
        { name: "LinkedIn Jobs Canada", url: "https://www.linkedin.com/jobs/?location=Canada", description: "Largest professional job network", order: 3 },
        { name: "Adzuna Canada", url: "https://www.adzuna.ca", description: "Aggregator covering Canadian listings", order: 4 },
        { name: "Eluta", url: "https://www.eluta.ca", description: "Top-100 employer search backed by Mediacorp", order: 5 },
        { name: "Talent.com Canada", url: "https://ca.talent.com", description: "Large CA aggregator — strong for skilled trades & healthcare", order: 6 },
        { name: "HealthForceOntario", url: "https://www.healthforceontario.ca", description: "Official Ontario healthcare recruitment portal", order: 7 },
    ],
    uae: [
        { name: "Bayt", url: "https://www.bayt.com", description: "Middle East largest job board — strong Kenya-to-Gulf pipeline", order: 1 },
        { name: "Naukri Gulf", url: "https://www.naukrigulf.com", description: "Major Gulf board — India + Africa friendly", order: 2 },
        { name: "GulfTalent", url: "https://www.gulftalent.com", description: "Mid-to-senior Gulf roles", order: 3 },
        { name: "LinkedIn Jobs UAE", url: "https://www.linkedin.com/jobs/?location=United+Arab+Emirates", description: "Professional Gulf roles, recruiters source directly", order: 4 },
        { name: "Indeed UAE", url: "https://www.indeed.ae", description: "Indeed AE — Gulf coverage", order: 5 },
        { name: "XpatJobs UAE", url: "https://unitedarabemirates.xpatjobs.com", description: "Expat-focused UAE roles", order: 6 },
        { name: "Laimoon", url: "https://jobs.laimoon.com/uae", description: "UAE-focused aggregator — Kenya-friendly", order: 7 },
        { name: "Dubizzle Jobs", url: "https://dubai.dubizzle.com/jobs/", description: "Classifieds-style UAE jobs", order: 8 },
    ],
    usa: [
        { name: "MyVisaJobs", url: "https://www.myvisajobs.com", description: "THE database for H-1B / EB-3 visa-sponsoring employers — essential for Kenyan applicants", order: 1 },
        { name: "Indeed USA", url: "https://www.indeed.com", description: "Largest US job board — filter by visa sponsorship", order: 2 },
        { name: "LinkedIn Jobs", url: "https://www.linkedin.com/jobs", description: "Professional network — H-1B sponsorship listings tagged", order: 3 },
        { name: "Dice (Tech)", url: "https://www.dice.com", description: "Tech-focused — strong H-1B sponsorship listings", order: 4 },
        { name: "Glassdoor USA", url: "https://www.glassdoor.com", description: "Salaries + reviews + jobs", order: 5 },
        { name: "SimplyHired", url: "https://www.simplyhired.com", description: "Aggregator with friendly international access", order: 6 },
        { name: "ZipRecruiter", url: "https://www.ziprecruiter.com", description: "AI-matched US jobs", order: 7 },
        { name: "H1BGrader", url: "https://h1bgrader.com", description: "Search H-1B sponsors by company / role / location", order: 8 },
    ],
    // ── AUSTRALIA — expanded list specifically for African / Kenyan applicants ──
    // Every entry is a portal that visibly sponsors foreign workers via Subclass
    // 482 (Temporary Skill Shortage) or 186 (Employer Nomination Scheme).
    // Includes specialty recruiters that handle African nurse/skilled migration.
    australia: [
        { name: "SEEK", url: "https://www.seek.com.au/jobs?worktype=242&salaryrange=0-0&salarytype=annual&sortmode=KeywordRelevance&keywords=visa+sponsorship", description: "Largest AU board — direct link to roles tagged 'visa sponsorship'. Best starting point for African applicants", order: 1 },
        { name: "Indeed Australia (Sponsorship)", url: "https://au.indeed.com/jobs?q=visa+sponsorship", description: "Indeed AU pre-filtered to 'visa sponsorship' listings", order: 2 },
        { name: "LinkedIn Jobs AU", url: "https://www.linkedin.com/jobs/?location=Australia", description: "Australian professional roles — visa sponsorship filter in advanced search", order: 3 },
        { name: "Workforce Australia (Gov)", url: "https://www.workforceaustralia.gov.au/individuals/jobs", description: "Official Australian Government job platform — all employers are verified", order: 4 },
        { name: "Hays Australia", url: "https://www.hays.com.au/jobs", description: "Major recruitment agency — handles 482 visa sponsorship for skilled hires", order: 5 },
        { name: "NSW Health Careers", url: "https://www.health.nsw.gov.au/careers", description: "New South Wales public health system — actively hires African nurses via 482/186 visas", order: 6 },
        { name: "Queensland Health Careers", url: "https://www.health.qld.gov.au/employment", description: "Queensland Health — strong international recruitment pipeline for African nurses & allied health", order: 7 },
        { name: "Healthcare Australia", url: "https://www.healthcareaustralia.com.au/careers/", description: "Largest healthcare recruiter in Australia — sponsors visas for nurses, care workers & AINs from Africa", order: 8 },
        { name: "Adecco Australia", url: "https://www.adecco.com.au/job-search", description: "Global recruitment agency — manages full visa sponsorship for skilled migrants", order: 9 },
        { name: "Adzuna Australia", url: "https://www.adzuna.com.au/search?q=visa+sponsorship", description: "Aggregator pre-filtered to visa-sponsoring roles in Australia", order: 10 },
        { name: "CareerOne", url: "https://www.careerone.com.au", description: "AU job search platform with strong skilled-trade & hospitality coverage", order: 11 },
        { name: "Jora Australia", url: "https://au.jora.com/Visa-Sponsorship-jobs-in-Australia", description: "Lightweight aggregator pre-filtered to visa-sponsorship jobs", order: 12 },
        { name: "Glassdoor Australia", url: "https://www.glassdoor.com.au", description: "Research Australian employers' culture, salary, and sponsorship history before applying", order: 13 },
        { name: "SkillSelect (Gov)", url: "https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect", description: "Official skilled migration Expression of Interest system — required to apply for 189/190/482 visas", order: 14 },
    ],
    europe: [
        { name: "EURES (EU Official)", url: "https://eures.europa.eu/eures-services/eures-portal_en", description: "Official EU Job Mobility Portal — best starting point for non-EU workers", order: 1 },
        { name: "🇩🇪 Make it in Germany", url: "https://www.make-it-in-germany.com/en/jobs", description: "Official German immigration job portal — EU Blue Card listings", order: 2 },
        { name: "🇩🇪 Arbeitsagentur", url: "https://www.arbeitsagentur.de", description: "German Federal Employment Agency", order: 3 },
        { name: "🇩🇪 Stepstone", url: "https://www.stepstone.de", description: "Largest German job board, English filter available", order: 4 },
        { name: "🇩🇪 LinkedIn Germany", url: "https://www.linkedin.com/jobs/?location=Germany", description: "Tech + skilled roles in Germany", order: 5 },
        { name: "🇩🇪 Indeed Germany", url: "https://de.indeed.com", description: "Indeed DE — broad coverage", order: 6 },
        { name: "🇳🇱 IamExpat Jobs NL", url: "https://www.iamexpat.nl/career/jobs-netherlands", description: "Expat-friendly Dutch jobs — sponsors 30% ruling visa", order: 7 },
        { name: "🇳🇱 Glassdoor NL", url: "https://www.glassdoor.nl", description: "Salaries + reviews + jobs (NL)", order: 8 },
        { name: "🇫🇷 Pole Emploi", url: "https://candidat.pole-emploi.fr", description: "Official French employment service", order: 9 },
        { name: "🇫🇷 Indeed France", url: "https://www.indeed.fr", description: "Indeed FR — broad coverage", order: 10 },
        { name: "🇮🇪 IrishJobs", url: "https://www.irishjobs.ie", description: "Largest Irish job board — Critical Skills Employment Permit eligible", order: 11 },
        { name: "🇮🇪 Indeed Ireland", url: "https://ie.indeed.com", description: "Indeed IE — broad coverage", order: 12 },
        { name: "🇪🇸 Indeed Spain", url: "https://www.indeed.es", description: "Indeed ES — broad coverage", order: 13 },
        { name: "🇸🇪 Arbetsformedlingen", url: "https://arbetsformedlingen.se/platsbanken", description: "Swedish Public Employment Service", order: 14 },
        { name: "🇩🇰 WorkInDenmark", url: "https://www.workindenmark.dk", description: "Official Danish portal for international workers", order: 15 },
        { name: "🇫🇮 TE-palvelut", url: "https://www.te-palvelut.fi/en/jobseekers", description: "Finnish Public Employment Service", order: 16 },
        { name: "🇵🇱 EURES Poland", url: "https://eures.praca.gov.pl", description: "EU jobs portal for Poland — non-EU workers eligible", order: 17 },
    ],
};
// ─── Synthetic ID helpers ───────────────────────────────────────────────────
// Stable scheme so /api/go/job/:id can reverse-parse the URL without DB lookup
// when the country isn't seeded. Format: syn-<code>-<1-based-index>.
function makeSyntheticPortalId(code, index1Based) {
    return `syn-${code}-${index1Based}`;
}
const SYN_ID_RE = /^syn-([a-z]+)-(\d+)$/;
function resolveSyntheticPortal(id) {
    const m = SYN_ID_RE.exec(id);
    if (!m)
        return null;
    const [, code, idxStr] = m;
    const list = exports.COUNTRY_PORTALS[code];
    if (!list)
        return null;
    const idx = parseInt(idxStr, 10) - 1;
    if (idx < 0 || idx >= list.length)
        return null;
    return list[idx];
}
