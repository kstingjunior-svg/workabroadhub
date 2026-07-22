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

export interface PortalLink {
  name: string;
  url: string;
  description: string;
  order: number;
}

export const COUNTRY_PORTALS: Record<string, PortalLink[]> = {
  uk: [
    { name: "NHS Jobs",          url: "https://www.jobs.nhs.uk",                                       description: "Official NHS recruitment — Health & Care Worker visa, top destination for Kenyan nurses", order: 1 },
    { name: "Indeed UK",         url: "https://www.indeed.co.uk",                                      description: "Largest UK job board — filter by 'visa sponsorship'",          order: 2 },
    { name: "Reed",              url: "https://www.reed.co.uk",                                        description: "UK-wide jobs across every sector",                             order: 3 },
    { name: "LinkedIn Jobs UK",  url: "https://www.linkedin.com/jobs/?location=United+Kingdom",       description: "Professional network — recruiters reach out directly",         order: 4 },
    { name: "CV-Library",        url: "https://www.cv-library.co.uk",                                  description: "Large UK CV-sharing board, visa-sponsor friendly",             order: 5 },
    { name: "Adzuna UK",         url: "https://www.adzuna.co.uk",                                      description: "Aggregator pulling listings from across the UK web",           order: 6 },
    { name: "Glassdoor UK",      url: "https://www.glassdoor.co.uk",                                   description: "Salaries + reviews + jobs — research employers before applying", order: 7 },
    { name: "TipTopJob (Visa)",  url: "https://www.tiptopjob.com/search/jobs.asp?keywords=visa+sponsor&location=United+Kingdom", description: "Pre-filtered to visa-sponsoring UK roles",   order: 8 },
  ],

  canada: [
    { name: "Job Bank Canada",       url: "https://www.jobbank.gc.ca",                            description: "Government Portal of Canada job board, supports LMIA",     order: 1 },
    { name: "Indeed Canada",         url: "https://ca.indeed.com",                                description: "Indeed CA — broad coverage, visa-friendly filters",          order: 2 },
    { name: "LinkedIn Jobs Canada",  url: "https://www.linkedin.com/jobs/?location=Canada",       description: "Largest professional job network",                            order: 3 },
    { name: "Adzuna Canada",         url: "https://www.adzuna.ca",                                description: "Aggregator covering Canadian listings",                       order: 4 },
    { name: "Eluta",                 url: "https://www.eluta.ca",                                 description: "Top-100 employer search backed by Mediacorp",                 order: 5 },
    { name: "Talent.com Canada",     url: "https://ca.talent.com",                                description: "Large CA aggregator — strong for skilled trades & healthcare", order: 6 },
    { name: "HealthForceOntario",    url: "https://www.healthforceontario.ca",                    description: "Official Ontario healthcare recruitment portal",              order: 7 },
  ],

  uae: [
    { name: "Bayt",              url: "https://www.bayt.com",                                                              description: "Middle East largest job board — strong Kenya-to-Gulf pipeline",   order: 1 },
    { name: "Naukri Gulf",       url: "https://www.naukrigulf.com",                                                        description: "Major Gulf board — India + Africa friendly",                     order: 2 },
    { name: "GulfTalent",        url: "https://www.gulftalent.com",                                                        description: "Mid-to-senior Gulf roles",                                       order: 3 },
    { name: "LinkedIn Jobs UAE", url: "https://www.linkedin.com/jobs/?location=United+Arab+Emirates",                     description: "Professional Gulf roles, recruiters source directly",             order: 4 },
    { name: "Indeed UAE",        url: "https://www.indeed.ae",                                                             description: "Indeed AE — Gulf coverage",                                       order: 5 },
    { name: "XpatJobs UAE",      url: "https://unitedarabemirates.xpatjobs.com",                                           description: "Expat-focused UAE roles",                                         order: 6 },
    { name: "Laimoon",           url: "https://jobs.laimoon.com/uae",                                                      description: "UAE-focused aggregator — Kenya-friendly",                         order: 7 },
    { name: "Dubizzle Jobs",     url: "https://dubai.dubizzle.com/jobs/",                                                  description: "Classifieds-style UAE jobs",                                     order: 8 },
  ],

  usa: [
    { name: "MyVisaJobs",      url: "https://www.myvisajobs.com",          description: "THE database for H-1B / EB-3 visa-sponsoring employers — essential for Kenyan applicants", order: 1 },
    { name: "Indeed USA",      url: "https://www.indeed.com",              description: "Largest US job board — filter by visa sponsorship",         order: 2 },
    { name: "LinkedIn Jobs",   url: "https://www.linkedin.com/jobs",       description: "Professional network — H-1B sponsorship listings tagged",   order: 3 },
    { name: "Dice (Tech)",     url: "https://www.dice.com",                description: "Tech-focused — strong H-1B sponsorship listings",           order: 4 },
    { name: "Glassdoor USA",   url: "https://www.glassdoor.com",           description: "Salaries + reviews + jobs",                                  order: 5 },
    { name: "SimplyHired",     url: "https://www.simplyhired.com",         description: "Aggregator with friendly international access",              order: 6 },
    { name: "ZipRecruiter",    url: "https://www.ziprecruiter.com",        description: "AI-matched US jobs",                                         order: 7 },
    { name: "H1BGrader",       url: "https://h1bgrader.com",               description: "Search H-1B sponsors by company / role / location",         order: 8 },
  ],

  // ── AUSTRALIA — expanded list specifically for African / Kenyan applicants ──
  // Every entry is a portal that visibly sponsors foreign workers via Subclass
  // 482 (Temporary Skill Shortage) or 186 (Employer Nomination Scheme).
  // Includes specialty recruiters that handle African nurse/skilled migration.
  australia: [
    { name: "SEEK",                       url: "https://www.seek.com.au/jobs?worktype=242&salaryrange=0-0&salarytype=annual&sortmode=KeywordRelevance&keywords=visa+sponsorship",  description: "Largest AU board — direct link to roles tagged 'visa sponsorship'. Best starting point for African applicants",       order: 1 },
    { name: "Indeed Australia (Sponsorship)", url: "https://au.indeed.com/jobs?q=visa+sponsorship",                                  description: "Indeed AU pre-filtered to 'visa sponsorship' listings",       order: 2 },
    { name: "LinkedIn Jobs AU",           url: "https://www.linkedin.com/jobs/?location=Australia",                                description: "Australian professional roles — visa sponsorship filter in advanced search",                                  order: 3 },
    { name: "Workforce Australia (Gov)",  url: "https://www.workforceaustralia.gov.au/individuals/jobs",                           description: "Official Australian Government job platform — all employers are verified",                                     order: 4 },
    { name: "Hays Australia",             url: "https://www.hays.com.au/jobs",                                                     description: "Major recruitment agency — handles 482 visa sponsorship for skilled hires",                                    order: 5 },
    { name: "NSW Health Careers",         url: "https://www.health.nsw.gov.au/careers",                                            description: "New South Wales public health system — actively hires African nurses via 482/186 visas",                       order: 6 },
    { name: "Queensland Health Careers",  url: "https://www.health.qld.gov.au/employment",                                         description: "Queensland Health — strong international recruitment pipeline for African nurses & allied health",            order: 7 },
    { name: "Healthcare Australia",       url: "https://www.healthcareaustralia.com.au/careers/",                                  description: "Largest healthcare recruiter in Australia — sponsors visas for nurses, care workers & AINs from Africa",     order: 8 },
    { name: "Adecco Australia",           url: "https://www.adecco.com.au/job-search",                                             description: "Global recruitment agency — manages full visa sponsorship for skilled migrants",                              order: 9 },
    { name: "Adzuna Australia",           url: "https://www.adzuna.com.au/search?q=visa+sponsorship",                              description: "Aggregator pre-filtered to visa-sponsoring roles in Australia",                                                order: 10 },
    { name: "CareerOne",                  url: "https://www.careerone.com.au",                                                     description: "AU job search platform with strong skilled-trade & hospitality coverage",                                      order: 11 },
    { name: "Jora Australia",             url: "https://au.jora.com/Visa-Sponsorship-jobs-in-Australia",                           description: "Lightweight aggregator pre-filtered to visa-sponsorship jobs",                                                 order: 12 },
    { name: "Glassdoor Australia",        url: "https://www.glassdoor.com.au",                                                     description: "Research Australian employers' culture, salary, and sponsorship history before applying",                      order: 13 },
    { name: "SkillSelect (Gov)",          url: "https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect",           description: "Official skilled migration Expression of Interest system — required to apply for 189/190/482 visas",          order: 14 },
  ],

  europe: [
    { name: "EURES (EU Official)",   url: "https://eures.europa.eu/eures-services/eures-portal_en",       description: "Official EU Job Mobility Portal — best starting point for non-EU workers",  order: 1 },
    { name: "🇩🇪 Make it in Germany", url: "https://www.make-it-in-germany.com/en/jobs",                  description: "Official German immigration job portal — EU Blue Card listings",            order: 2 },
    { name: "🇩🇪 Arbeitsagentur",     url: "https://www.arbeitsagentur.de",                              description: "German Federal Employment Agency",                                          order: 3 },
    { name: "🇩🇪 Stepstone",          url: "https://www.stepstone.de",                                   description: "Largest German job board, English filter available",                        order: 4 },
    { name: "🇩🇪 LinkedIn Germany",   url: "https://www.linkedin.com/jobs/?location=Germany",            description: "Tech + skilled roles in Germany",                                           order: 5 },
    { name: "🇩🇪 Indeed Germany",     url: "https://de.indeed.com",                                      description: "Indeed DE — broad coverage",                                                order: 6 },
    { name: "🇳🇱 IamExpat Jobs NL",   url: "https://www.iamexpat.nl/career/jobs-netherlands",            description: "Expat-friendly Dutch jobs — sponsors 30% ruling visa",                      order: 7 },
    { name: "🇳🇱 Glassdoor NL",       url: "https://www.glassdoor.nl",                                   description: "Salaries + reviews + jobs (NL)",                                            order: 8 },
    { name: "🇫🇷 Pole Emploi",        url: "https://candidat.pole-emploi.fr",                           description: "Official French employment service",                                        order: 9 },
    { name: "🇫🇷 Indeed France",      url: "https://www.indeed.fr",                                      description: "Indeed FR — broad coverage",                                                order: 10 },
    { name: "🇮🇪 IrishJobs",          url: "https://www.irishjobs.ie",                                    description: "Largest Irish job board — Critical Skills Employment Permit eligible",      order: 11 },
    { name: "🇮🇪 Indeed Ireland",     url: "https://ie.indeed.com",                                       description: "Indeed IE — broad coverage",                                                order: 12 },
    { name: "🇪🇸 Indeed Spain",       url: "https://www.indeed.es",                                       description: "Indeed ES — broad coverage",                                                order: 13 },
    { name: "🇸🇪 Arbetsformedlingen", url: "https://arbetsformedlingen.se/platsbanken",                    description: "Swedish Public Employment Service",                                         order: 14 },
    { name: "🇩🇰 WorkInDenmark",     url: "https://www.workindenmark.dk",                               description: "Official Danish portal for international workers",                          order: 15 },
    { name: "🇫🇮 TE-palvelut",       url: "https://www.te-palvelut.fi/en/jobseekers",                    description: "Finnish Public Employment Service",                                         order: 16 },
    { name: "🇵🇱 EURES Poland",      url: "https://eures.praca.gov.pl",                                  description: "EU jobs portal for Poland — non-EU workers eligible",                       order: 17 },
  ],

  // 2026-07: Turkey added as a supported destination (Tony's request).
  // Every URL verified accessible from Kenyan IPs and open to non-Turkish
  // applicants. Kariyer.net + Eleman.net are the two dominant Turkish job
  // boards; İŞKUR is the government employment agency; EURES-Turkey covers
  // EU-adjacent listings.
  turkey: [
    { name: "Kariyer.net",            url: "https://www.kariyer.net",                                    description: "Turkey's largest job board — hospitality, factory, IT, teaching, healthcare",      order: 1 },
    { name: "Eleman.net",             url: "https://www.eleman.net",                                     description: "Major Turkish jobs portal — strong for hotel, restaurant, retail, and factory roles", order: 2 },
    { name: "İŞKUR (Government)",     url: "https://esube.iskur.gov.tr/Istihdam/AcikIsIlanAra.aspx",     description: "Turkish Employment Agency — official government job listings incl. work-permit roles", order: 3 },
    { name: "Indeed Turkey",          url: "https://tr.indeed.com",                                      description: "Indeed TR — English-friendly interface, aggregates listings across Turkey",         order: 4 },
    { name: "LinkedIn Jobs Turkey",   url: "https://www.linkedin.com/jobs/?location=Turkey",             description: "Professional Turkish roles — recruiters actively source international candidates",  order: 5 },
    { name: "Yenibiris.com",          url: "https://www.yenibiris.com",                                  description: "Popular Turkish job platform — broad coverage, easy Turkish + English filters",   order: 6 },
    { name: "SecretCV",               url: "https://www.secretcv.com",                                   description: "Executive + skilled roles across Turkey with anonymous CV features",              order: 7 },
    { name: "Glassdoor Turkey",       url: "https://www.glassdoor.com/Job/turkey-jobs-SRCH_IL.0,6_IN220.htm", description: "Turkish job listings with employer reviews + salary benchmarks",              order: 8 },
    { name: "EURES Turkey",           url: "https://ec.europa.eu/eures/portal/jv-se/search?lang=en&countryCodes=TR", description: "European Employment Services portal — EU-adjacent listings in Turkey",       order: 9 },
    { name: "Turkish Airlines Careers", url: "https://careers.turkishairlines.com",                      description: "Major Turkish employer — cabin crew, ground handling, engineering, corporate",     order: 10 },
    { name: "HotelJobs.com.tr",       url: "https://www.oteljobs.com.tr",                                description: "Turkish hotel-industry-specific board — Antalya, Bodrum, Istanbul resorts",       order: 11 },
    { name: "Neuvoo Turkey",          url: "https://tr.neuvoo.com",                                      description: "Aggregator pulling Turkish listings from company sites + boards",                order: 12 },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // 2026-07 TIER 1: highest Kenya-to-country hiring pipelines
  // Every URL verified accessible from Kenyan IPs.
  // ═══════════════════════════════════════════════════════════════════════

  ireland: [
    { name: "IrishJobs.ie",              url: "https://www.irishjobs.ie",                                    description: "Ireland's leading job board — nurse, care, hospitality, tech, construction",         order: 1 },
    { name: "Jobs.ie",                   url: "https://www.jobs.ie",                                         description: "Popular Irish jobs site — broad coverage across sectors",                             order: 2 },
    { name: "HSE Jobs (Health Service)", url: "https://www.hse.ie/eng/staff/jobs/",                          description: "Official Irish public health service — nurses, doctors, HCAs, allied health",         order: 3 },
    { name: "Indeed Ireland",            url: "https://ie.indeed.com",                                       description: "Indeed IE — search 'visa sponsorship' or 'critical skills' for eligible roles",       order: 4 },
    { name: "LinkedIn Jobs Ireland",     url: "https://www.linkedin.com/jobs/?location=Ireland",             description: "Professional Irish roles — many multinationals recruit Kenyans directly",             order: 5 },
    { name: "Nurse Recruitment Ireland", url: "https://www.threeq.com",                                      description: "Three Q agency — specialises in international nurses for HSE + private hospitals",    order: 6 },
    { name: "EURES Ireland",             url: "https://ec.europa.eu/eures/portal/jv-se/search?lang=en&countryCodes=IE", description: "European Employment Services — verified Irish jobs open to international candidates", order: 7 },
    { name: "Critical Skills List (Gov)",url: "https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/employment-permit-eligibility/highly-skilled-eligible-occupations-list/", description: "Official Critical Skills Occupations List — these roles get fast-track visas", order: 8 },
    { name: "Recruit Ireland",           url: "https://www.recruitireland.com",                              description: "Recruit Ireland — general job listings with visa sponsorship filter",                order: 9 },
  ],

  netherlands: [
    { name: "IamExpat Jobs",             url: "https://www.iamexpat.nl/career/jobs-netherlands",             description: "Netherlands #1 board for international/expat hires — English-friendly, sponsor-friendly", order: 1 },
    { name: "Indeed Netherlands",        url: "https://nl.indeed.com/jobs?q=english&l=Netherlands",          description: "Indeed NL pre-filtered to English-speaking roles",                                     order: 2 },
    { name: "LinkedIn Jobs Netherlands", url: "https://www.linkedin.com/jobs/?location=Netherlands",         description: "Professional Dutch roles — highly skilled migrant recruiters source directly",         order: 3 },
    { name: "Nationale Vacaturebank",    url: "https://www.nationalevacaturebank.nl",                        description: "Major Dutch job board — broad coverage, some English roles",                          order: 4 },
    { name: "Werk.nl (Government)",      url: "https://www.werk.nl/werkzoekenden/",                          description: "Dutch UWV government employment portal — official job listings",                       order: 5 },
    { name: "IND — Highly Skilled Migrant", url: "https://ind.nl/en/residence-permits/work/highly-skilled-migrant", description: "Official IND page — how the highly-skilled migrant sponsor system works",         order: 6 },
    { name: "Recognized Sponsor List (IND)", url: "https://ind.nl/en/public-register-recognised-sponsors",   description: "Search here for IND-approved employers — the ONLY companies that can sponsor you",     order: 7 },
    { name: "TogetherAbroad",            url: "https://www.togetherabroad.nl",                               description: "Netherlands expat jobs + relocation support",                                          order: 8 },
    { name: "EURES Netherlands",         url: "https://ec.europa.eu/eures/portal/jv-se/search?lang=en&countryCodes=NL", description: "European Employment Services — verified NL jobs open internationally",       order: 9 },
    { name: "Undutchables",              url: "https://www.undutchables.nl",                                 description: "Recruiter specialising in placing multilingual international candidates in NL",         order: 10 },
  ],

  "new-zealand": [
    { name: "Seek New Zealand",          url: "https://www.seek.co.nz",                                      description: "New Zealand's largest job board — care, farming, trades, engineering",                order: 1 },
    { name: "Trade Me Jobs",             url: "https://www.trademe.co.nz/a/jobs",                            description: "Trade Me — second-largest NZ job board with strong regional coverage",                 order: 2 },
    { name: "New Zealand Now (Gov)",     url: "https://www.newzealandnow.govt.nz/work-in-nz",                description: "Official NZ Government immigration + jobs portal — Skilled Migrant guide",             order: 3 },
    { name: "Immigration NZ — Green List", url: "https://www.immigration.govt.nz/new-zealand-visas/preparing-a-visa-application/working-in-nz/hiring-migrant-workers/lists-of-occupations-in-demand/green-list-occupations", description: "Green List occupations — fast-track residence for these skills", order: 4 },
    { name: "Indeed New Zealand",        url: "https://nz.indeed.com/jobs?q=visa+sponsorship",               description: "Indeed NZ pre-filtered to visa-sponsoring roles",                                     order: 5 },
    { name: "LinkedIn Jobs NZ",          url: "https://www.linkedin.com/jobs/?location=New+Zealand",         description: "Professional NZ roles — many employers accredited to sponsor visas",                  order: 6 },
    { name: "Kiwi Health Jobs",          url: "https://kiwihealthjobs.com",                                  description: "New Zealand's health sector jobs — Health New Zealand / Te Whatu Ora recruiter",       order: 7 },
    { name: "MyJobSpace NZ",             url: "https://www.myjobspace.co.nz",                                description: "NZ-owned jobs site — strong for trades, hospitality, farm work",                       order: 8 },
    { name: "Working In NZ",             url: "https://www.workingin-newzealand.com",                        description: "Working In NZ — dedicated portal for skilled migrants",                                order: 9 },
    { name: "Farm Source Careers",       url: "https://www.fonterra.com/nz/en/careers.html",                 description: "Fonterra + dairy farm careers — top employer for agricultural skilled migrants",       order: 10 },
  ],

  poland: [
    { name: "Pracuj.pl",                 url: "https://www.pracuj.pl",                                       description: "Poland's largest job board — IT, logistics, factory, construction, hospitality",       order: 1 },
    { name: "OLX Praca",                 url: "https://www.olx.pl/praca/",                                   description: "OLX Poland jobs section — hands-on labour, factory, warehouse listings",              order: 2 },
    { name: "LinkedIn Jobs Poland",      url: "https://www.linkedin.com/jobs/?location=Poland",              description: "Professional Polish roles — international recruiters source Kenyans for IT and engineering", order: 3 },
    { name: "EURES Poland",              url: "https://eures.praca.gov.pl",                                  description: "Official EU Employment Services portal for Poland — non-EU workers eligible",         order: 4 },
    { name: "Praca.gov.pl (Government)", url: "https://www.praca.gov.pl",                                    description: "Polish Ministry of Family, Labour and Social Policy job portal",                       order: 5 },
    { name: "Indeed Poland",             url: "https://pl.indeed.com",                                       description: "Indeed PL — broad Polish coverage with English filters",                              order: 6 },
    { name: "NoFluffJobs (IT)",          url: "https://nofluffjobs.com/pl",                                  description: "Polish IT jobs board — every listing shows salary + tech stack; English-friendly",     order: 7 },
    { name: "JustJoin.it (IT)",          url: "https://justjoin.it",                                         description: "Polish tech jobs board — strong for developer + engineering roles",                     order: 8 },
    { name: "Praca.pl",                  url: "https://www.praca.pl",                                        description: "Praca.pl — broad Polish job aggregator",                                              order: 9 },
    { name: "Work Permit Info (Poland)", url: "https://www.gov.pl/web/gov/apply-for-a-work-permit",          description: "Official Polish work permit application guide from the government",                    order: 10 },
  ],

  kuwait: [
    { name: "Bayt Kuwait",               url: "https://www.bayt.com/en/kuwait/",                             description: "Middle East's largest job board — Kuwait section, strong Kenya-to-Gulf pipeline",     order: 1 },
    { name: "Naukri Gulf Kuwait",        url: "https://www.naukrigulf.com/jobs-in-kuwait",                   description: "Major Gulf board — India + Africa friendly listings",                                  order: 2 },
    { name: "GulfTalent Kuwait",         url: "https://www.gulftalent.com/kuwait/jobs",                      description: "Mid-to-senior Gulf roles — Kuwait section",                                            order: 3 },
    { name: "LinkedIn Jobs Kuwait",      url: "https://www.linkedin.com/jobs/?location=Kuwait",              description: "Professional Kuwait roles, recruiters actively source international candidates",       order: 4 },
    { name: "Indeed Kuwait",             url: "https://kw.indeed.com",                                       description: "Indeed KW — Gulf coverage",                                                            order: 5 },
    { name: "PACI (Government)",         url: "https://www.paci.gov.kw",                                     description: "Public Authority for Civil Information — Kuwaiti government sites incl. Civil ID info", order: 6 },
    { name: "Kuwait Airways Careers",    url: "https://www.kuwaitairways.com/en/about-us/careers",           description: "Major Kuwaiti employer — cabin crew, ground handling, engineering",                    order: 7 },
    { name: "Manpower Kuwait",           url: "https://www.manpower.com.kw",                                 description: "Manpower Kuwait — staffing agency with African hires pipeline",                        order: 8 },
    { name: "Laimoon Kuwait",            url: "https://jobs.laimoon.com/kuwait",                             description: "Kuwait-focused aggregator — Kenya-friendly",                                          order: 9 },
  ],

  oman: [
    { name: "Bayt Oman",                 url: "https://www.bayt.com/en/oman/",                               description: "Middle East's largest job board — Oman section, hospitality/oil/care roles",           order: 1 },
    { name: "Naukri Gulf Oman",          url: "https://www.naukrigulf.com/jobs-in-oman",                     description: "Major Gulf board — India + Africa friendly listings for Oman",                        order: 2 },
    { name: "GulfTalent Oman",           url: "https://www.gulftalent.com/oman/jobs",                        description: "Mid-to-senior Gulf roles — Oman section",                                              order: 3 },
    { name: "LinkedIn Jobs Oman",        url: "https://www.linkedin.com/jobs/?location=Oman",                description: "Professional Oman roles — recruiters actively source Kenyan candidates",              order: 4 },
    { name: "Indeed Oman",               url: "https://om.indeed.com",                                       description: "Indeed OM — Gulf coverage",                                                            order: 5 },
    { name: "Oman Manpower Ministry",    url: "https://www.manpower.gov.om",                                 description: "Ministry of Labour Oman — official work permit + labour law information",              order: 6 },
    { name: "Oman Air Careers",          url: "https://careers.omanair.com",                                 description: "Major Omani employer — cabin crew, ground handling, engineering",                      order: 7 },
    { name: "Petroleum Development Oman", url: "https://www.pdo.co.om/en/careers",                           description: "PDO — Oman's largest employer in oil & gas, engineering roles for international staff", order: 8 },
    { name: "Laimoon Oman",              url: "https://jobs.laimoon.com/oman",                               description: "Oman-focused aggregator — Kenya-friendly",                                            order: 9 },
  ],
};

// ─── Synthetic ID helpers ───────────────────────────────────────────────────
// Stable scheme so /api/go/job/:id can reverse-parse the URL without DB lookup
// when the country isn't seeded. Format: syn-<code>-<1-based-index>.

export function makeSyntheticPortalId(code: string, index1Based: number): string {
  return `syn-${code}-${index1Based}`;
}

const SYN_ID_RE = /^syn-([a-z]+)-(\d+)$/;

export function resolveSyntheticPortal(id: string): PortalLink | null {
  const m = SYN_ID_RE.exec(id);
  if (!m) return null;
  const [, code, idxStr] = m;
  const list = COUNTRY_PORTALS[code];
  if (!list) return null;
  const idx = parseInt(idxStr, 10) - 1;
  if (idx < 0 || idx >= list.length) return null;
  return list[idx];
}
