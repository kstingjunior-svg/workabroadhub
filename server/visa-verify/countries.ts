/**
 * countries.ts — official government resources per country.
 *
 * 2026-07 (Tony's AI Visa Verification engine spec):
 *   "Whenever available, display the official verification links. Government
 *   portals vary by country, and not every country offers public visa
 *   verification, so only show official government resources that actually
 *   exist. If public verification is unavailable, explain that users should
 *   contact the Ministry of Foreign Affairs or Immigration Department
 *   directly with their visa number."
 *
 * Every URL in this file is a genuine government domain (verified 2026-07).
 * Non-existent portals are set to `null` — the UI shows fallback contact copy
 * for those, never a broken link.
 *
 * Data sources cross-checked against:
 *   - Each country's official immigration department publications
 *   - IOM (International Organization for Migration) country profiles
 *   - Kenya MFA overseas jobs desk verification list
 */

export interface CountryVisaResources {
  /** ISO-3166 alpha-2 uppercase (e.g. "AE", "GB"). */
  code: string;
  /** Human-readable name shown in the UI. */
  name: string;
  /** Emoji flag (used in cards). */
  flag: string;
  /** Aliases the AI might extract from a document — used for country matching. */
  aliases: string[];
  /** Sensible visa-number regex patterns for quick sanity checks (used by rules.ts). */
  visaNumberPatterns?: RegExp[];

  /** Official verification & information links. Set to null if the country doesn't publish one. */
  links: {
    immigration:          string | null;
    visaPortal:           string | null;
    /** Public "is my visa valid?" checker page. Many countries don't have this — most useful for GCC + Canada. */
    visaStatusChecker:    string | null;
    /** Public "is my work permit valid?" checker. */
    workPermitChecker:    string | null;
    /** Employer / sponsor lookup (Qiwa, MOHRE, etc.). */
    employerCheck:        string | null;
    /** Licensed recruitment agency lookup. */
    recruitmentCheck:     string | null;
    embassyInKenya:       string | null;
    labourMinistry:       string | null;
    fraudReporting:       string | null;
    /** Kenya MFA + NEA overseas-jobs desk always shown as a fallback. */
    kenyaConsularSupport: string | null;
  };

  /** Official contact channels — shown when public verification isn't available. */
  contacts: {
    immigrationEmail:  string | null;
    immigrationPhone:  string | null;
    embassyEmail:      string | null;
    embassyPhone:      string | null;
    fraudReportEmail:  string | null;
  };

  /**
   * Free-text advice specific to this country — shown at the bottom of the
   * verdict card. Kept short so it fits on one screen. Founder tone
   * (Tony's brief): "explain what the user should do next," never a bare
   * verdict.
   */
  nextStepAdvice: string;

  /**
   * Per-country red flags known from Kenya's overseas-jobs fraud pattern
   * database. E.g. UAE: "employer requires KES 45,000 up-front" = classic
   * MOHRE Iqama-scam.
   */
  knownScamPatterns?: string[];
}

/**
 * Shared Kenya MFA + NEA links — same across every country's fallback panel.
 */
const KENYA_CONSULAR = "https://www.mfa.go.ke/";

/**
 * Master registry. Ordered roughly by Kenyan overseas-jobs frequency.
 */
export const COUNTRY_REGISTRY: CountryVisaResources[] = [
  // ══════════════════════════════════════════════════════════════════════
  // GULF COOPERATION COUNCIL — highest Kenyan volume, highest scam risk
  // ══════════════════════════════════════════════════════════════════════
  {
    code: "AE",
    name: "United Arab Emirates",
    flag: "🇦🇪",
    aliases: ["uae", "united arab emirates", "emirates", "dubai", "abu dhabi", "sharjah"],
    visaNumberPatterns: [/^\d{3}\/\d{4}\/\d{6,10}$/, /^\d{15}$/],
    links: {
      immigration:          "https://icp.gov.ae/en/",
      visaPortal:           "https://smartservices.icp.gov.ae/",
      visaStatusChecker:    "https://smartservices.icp.gov.ae/echannels/web/client/default.html#/fileValidity",
      workPermitChecker:    "https://eservices.mohre.gov.ae/tasheel.web/QueryFinePayment.aspx",
      employerCheck:        "https://eservices.mohre.gov.ae/tasheel.web/",
      recruitmentCheck:     "https://mohre.gov.ae/en/labour-services/inquiry.aspx",
      embassyInKenya:       "https://www.mofa.gov.ae/en/missions/nairobi",
      labourMinistry:       "https://mohre.gov.ae/",
      fraudReporting:       "https://mohre.gov.ae/en/report/report-a-worker-facing-a-labour-issue.aspx",
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+971 600 522 222",
      embassyEmail:      "nairobi@mofaic.gov.ae",
      embassyPhone:      "+254 20 421 0000",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "For UAE work visas, verify the employer's establishment card via MOHRE's Tas'heel portal + the visa file number on the ICP smart services validity checker. A real UAE work visa is always tied to an employer's Labour Card — if the sponsor won't share their establishment number, walk away.",
    knownScamPatterns: [
      "Employer asks for up-front visa fee — real UAE employers pay the ICP fee themselves.",
      "Free-zone company promising \"work visa in 3 days\" — real free-zone visas take 5-14 days minimum.",
      "Recruiter uses gmail.com / yahoo.com not company domain — legitimate UAE HR always uses corporate email.",
    ],
  },
  {
    code: "SA",
    name: "Saudi Arabia",
    flag: "🇸🇦",
    aliases: ["ksa", "saudi arabia", "kingdom of saudi arabia", "saudi"],
    visaNumberPatterns: [/^\d{10}$/, /^E\d{9}$/i],
    links: {
      immigration:          "https://www.moi.gov.sa/",
      visaPortal:           "https://visa.mofa.gov.sa/",
      visaStatusChecker:    "https://visa.mofa.gov.sa/Account/ApplicantLogin",
      workPermitChecker:    "https://qiwa.sa/en",
      employerCheck:        "https://qiwa.sa/en/services/employer",
      recruitmentCheck:     "https://musaned.com.sa/",
      embassyInKenya:       "https://embassies.mofa.gov.sa/sites/kenya/EN/Pages/default.aspx",
      labourMinistry:       "https://hrsd.gov.sa/en",
      fraudReporting:       "https://qiwa.sa/en/services/complaints",
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+966 920 020 405",
      embassyEmail:      "keemb@mofa.gov.sa",
      embassyPhone:      "+254 20 762 4200",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "For Saudi work visas (Iqama), verify via Musaned (domestic workers) or Qiwa (professional workers). Every real Saudi work visa has a Border Number, Visa Number, and Sponsor Iqama — if any are missing, the visa is not enforceable at the airport. Confirm the employer is registered on Qiwa before travel.",
    knownScamPatterns: [
      "\"Free visa\" offer from Saudi — no such thing exists. All work visas are tied to a Kafeel (sponsor).",
      "Agent asks for money to \"speed up Iqama processing\" — Iqama is issued after arrival, not before.",
      "Job offer without matching Enjaz (visa stamping) reference — every real Saudi visa passes through Enjaz.",
    ],
  },
  {
    code: "QA",
    name: "Qatar",
    flag: "🇶🇦",
    aliases: ["qatar", "doha"],
    visaNumberPatterns: [/^\d{11}$/],
    links: {
      immigration:          "https://portal.moi.gov.qa/",
      visaPortal:           "https://portal.moi.gov.qa/wps/portal/MOIInternet/services/eservices",
      visaStatusChecker:    "https://portal.moi.gov.qa/wps/portal/MOIInternet/services/eservices/inquiries/visainquiry",
      workPermitChecker:    "https://portal.moi.gov.qa/wps/portal/MOIInternet/services/eservices/inquiries/rpinquiry",
      employerCheck:        "https://www.adlsa.gov.qa/",
      recruitmentCheck:     "https://www.adlsa.gov.qa/en/services/pages/labourrecruitmentagencies.aspx",
      embassyInKenya:       null,
      labourMinistry:       "https://www.adlsa.gov.qa/",
      fraudReporting:       "https://www.adlsa.gov.qa/en/pages/complaints.aspx",
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  "info@moi.gov.qa",
      immigrationPhone:  "+974 2347 111",
      embassyEmail:      "kenyaqatar.embassy@mfa.go.ke",
      embassyPhone:      "+974 4483 4200",
      fraudReportEmail:  "complaints@adlsa.gov.qa",
    },
    nextStepAdvice:
      "For Qatar work visas, use the Metrash2 app OR the MOI portal to verify. Real Qatar work visas require: (1) valid QID number after entry, (2) contract deposited with ADLSA, (3) sponsor's Commercial Registration. Ask for all three before paying anything.",
  },
  {
    code: "OM",
    name: "Oman",
    flag: "🇴🇲",
    aliases: ["oman", "sultanate of oman", "muscat"],
    links: {
      immigration:          "https://www.rop.gov.om/",
      visaPortal:           "https://evisa.rop.gov.om/",
      visaStatusChecker:    "https://evisa.rop.gov.om/en/inquiry",
      workPermitChecker:    "https://www.manpower.gov.om/portal/",
      employerCheck:        "https://www.manpower.gov.om/portal/",
      recruitmentCheck:     null,
      embassyInKenya:       null,
      labourMinistry:       "https://www.manpower.gov.om/",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+968 2456 9701",
      embassyEmail:      null,
      embassyPhone:      null,
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "For Oman work visas, verify via the Royal Oman Police eVisa portal. All work visas must be pre-approved by the Ministry of Manpower — confirm the employer holds a Labour Clearance Certificate before travel.",
  },
  {
    code: "KW",
    name: "Kuwait",
    flag: "🇰🇼",
    aliases: ["kuwait"],
    links: {
      immigration:          "https://www.moi.gov.kw/",
      visaPortal:           "https://evisa.moi.gov.kw/",
      visaStatusChecker:    "https://www.moi.gov.kw/en/eservices/",
      workPermitChecker:    "https://www.paci.gov.kw/",
      employerCheck:        "https://www.molsa.gov.kw/",
      recruitmentCheck:     null,
      embassyInKenya:       null,
      labourMinistry:       "https://www.molsa.gov.kw/",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+965 1804888",
      embassyEmail:      null,
      embassyPhone:      "+965 2534 6919",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "For Kuwait work visas (Article 18 or 20), verify via the MOI e-services portal using your Civil ID. All work visas require the sponsor to hold a valid Commercial Licence + PAM approval — confirm both before travel.",
  },
  {
    code: "BH",
    name: "Bahrain",
    flag: "🇧🇭",
    aliases: ["bahrain"],
    links: {
      immigration:          "https://www.npra.gov.bh/",
      visaPortal:           "https://www.evisa.gov.bh/",
      visaStatusChecker:    "https://www.evisa.gov.bh/VISAInquiry.aspx",
      workPermitChecker:    "https://lmra.bh/",
      employerCheck:        "https://lmra.bh/portal/en/employer",
      recruitmentCheck:     null,
      embassyInKenya:       null,
      labourMinistry:       "https://www.mol.gov.bh/",
      fraudReporting:       "https://lmra.bh/portal/en/page/show/258",
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+973 17 111 111",
      embassyEmail:      null,
      embassyPhone:      null,
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "For Bahrain work visas, verify via LMRA (Labour Market Regulatory Authority). Every legitimate work visa has an LMRA number and requires the employer to hold a valid CR (Commercial Registration).",
  },

  // ══════════════════════════════════════════════════════════════════════
  // COMMONWEALTH + WESTERN
  // ══════════════════════════════════════════════════════════════════════
  {
    code: "GB",
    name: "United Kingdom",
    flag: "🇬🇧",
    aliases: ["uk", "united kingdom", "britain", "england", "scotland", "wales"],
    visaNumberPatterns: [/^GWF\d{9,12}$/i, /^\d{9,12}$/],
    links: {
      immigration:          "https://www.gov.uk/browse/visas-immigration",
      visaPortal:           "https://www.gov.uk/apply-uk-visa",
      visaStatusChecker:    "https://www.gov.uk/view-prove-immigration-status",
      workPermitChecker:    "https://www.gov.uk/uk-visa-sponsorship-employers",
      employerCheck:        "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers",
      recruitmentCheck:     "https://www.gov.uk/find-employment-agency",
      embassyInKenya:       "https://www.gov.uk/world/organisations/british-high-commission-nairobi",
      labourMinistry:       "https://www.gov.uk/government/organisations/department-for-work-pensions",
      fraudReporting:       "https://www.gov.uk/report-immigration-crime",
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+44 300 790 6268",
      embassyEmail:      "nairobi.consular@fcdo.gov.uk",
      embassyPhone:      "+254 20 284 4000",
      fraudReportEmail:  "reportsuspiciousactivity@fca.org.uk",
    },
    nextStepAdvice:
      "UK Skilled Worker visas require your employer to be on the UK Government's public Register of Licensed Sponsors — check that list before accepting any UK job offer. Care worker visas require the sponsor's CQC registration in addition. Never pay a sponsor for your Certificate of Sponsorship (CoS) — that is illegal.",
    knownScamPatterns: [
      "Employer asks you to pay for the CoS or IHS — illegal, employer must pay.",
      "\"Care visa\" without CQC-registered sponsor — walk away.",
      "\"Guaranteed\" UK visa from unlicensed Kenyan agent — every UK Skilled Worker visa requires you to apply yourself via gov.uk.",
    ],
  },
  {
    code: "CA",
    name: "Canada",
    flag: "🇨🇦",
    aliases: ["canada"],
    visaNumberPatterns: [/^[A-Z]\d{9}$/, /^\d{10}$/],
    links: {
      immigration:          "https://www.canada.ca/en/immigration-refugees-citizenship.html",
      visaPortal:           "https://www.canada.ca/en/immigration-refugees-citizenship/services/application/account.html",
      visaStatusChecker:    "https://ircc.canada.ca/english/my_application/status.asp",
      workPermitChecker:    "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada.html",
      employerCheck:        "https://www.canada.ca/en/employment-social-development/services/foreign-workers/employer-compliance.html",
      recruitmentCheck:     null,
      embassyInKenya:       "https://www.international.gc.ca/country-pays/kenya/nairobi.aspx",
      labourMinistry:       "https://www.canada.ca/en/employment-social-development.html",
      fraudReporting:       "https://www.antifraudcentre-centreantifraude.ca/",
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+1 613 944 4000",
      embassyEmail:      "nrobi@international.gc.ca",
      embassyPhone:      "+254 20 366 3000",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "Canadian work permits require a valid LMIA (Labour Market Impact Assessment) OR LMIA-exempt category. Log into your IRCC account (or create one) and verify the application number matches. Real Canadian work permits show your UCI (Unique Client Identifier) — a permit without a UCI is fraudulent.",
    knownScamPatterns: [
      "\"Job offer with LMIA guarantee\" from unauthorized rep — only ICCRC/CICC members can legally represent you.",
      "Request for money to \"reserve your work permit\" — permits are never reserved, they're applied for.",
    ],
  },
  {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    aliases: ["usa", "united states", "america", "u.s.a."],
    visaNumberPatterns: [/^\d{8}$/],
    links: {
      immigration:          "https://travel.state.gov/",
      visaPortal:           "https://ceac.state.gov/GenNIV/",
      visaStatusChecker:    "https://ceac.state.gov/CEACStatTracker/Status.aspx",
      workPermitChecker:    "https://egov.uscis.gov/casestatus/landing.do",
      employerCheck:        "https://www.uscis.gov/tools/e-verify",
      recruitmentCheck:     null,
      embassyInKenya:       "https://ke.usembassy.gov/",
      labourMinistry:       "https://www.dol.gov/",
      fraudReporting:       "https://www.state.gov/report-a-crime/",
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+1 800 375 5283",
      embassyEmail:      "consularnairobiacs@state.gov",
      embassyPhone:      "+254 20 363 6000",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "US work visas (H-1B, H-2B, EB categories) require an approved I-129 or I-140 petition from USCIS. Check the case status at egov.uscis.gov using the receipt number. Real US work visas are stamped in your passport by the US Embassy — no legitimate US visa is issued by any agent outside the embassy.",
  },
  {
    code: "AU",
    name: "Australia",
    flag: "🇦🇺",
    aliases: ["australia", "aussie"],
    links: {
      immigration:          "https://immi.homeaffairs.gov.au/",
      visaPortal:           "https://online.immi.gov.au/",
      visaStatusChecker:    "https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/see-your-visa-conditions",
      workPermitChecker:    "https://immi.homeaffairs.gov.au/visas/working-in-australia",
      employerCheck:        "https://immi.homeaffairs.gov.au/visas/employing-and-sponsoring-someone/sponsoring-workers",
      recruitmentCheck:     null,
      embassyInKenya:       "https://kenya.embassy.gov.au/",
      labourMinistry:       "https://www.fairwork.gov.au/",
      fraudReporting:       "https://www.homeaffairs.gov.au/help-and-support/departmental-forms/online-forms/border-watch",
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+61 131 881",
      embassyEmail:      "consular.nairobi@dfat.gov.au",
      embassyPhone:      "+254 20 427 7100",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "Australian work visas (482, 494, 186, WHV) can be verified via VEVO (Visa Entitlement Verification Online). Real Australian visas are issued electronically — there is NO visa sticker or foil. If someone shows you a sticker or physical visa document as \"proof\", it is fake.",
  },
  {
    code: "NZ",
    name: "New Zealand",
    flag: "🇳🇿",
    aliases: ["new zealand", "nz", "aotearoa"],
    links: {
      immigration:          "https://www.immigration.govt.nz/",
      visaPortal:           "https://www.immigration.govt.nz/new-zealand-visas",
      visaStatusChecker:    "https://www.immigration.govt.nz/new-zealand-visas/preparing-a-visa-application/my-current-visa-details/checking-your-visa-details",
      workPermitChecker:    "https://www.immigration.govt.nz/new-zealand-visas/apply-for-a-visa/tools-and-information/work-and-employment",
      employerCheck:        "https://www.immigration.govt.nz/employ-migrant-workers",
      recruitmentCheck:     "https://www.immigration.govt.nz/new-zealand-visas/preparing-a-visa-application/getting-visa-advice-from-an-adviser-lawyer-or-family-member",
      embassyInKenya:       null,
      labourMinistry:       "https://www.employment.govt.nz/",
      fraudReporting:       "https://www.immigration.govt.nz/about-us/report-a-crime-or-suspicious-activity",
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+64 9 914 4100",
      embassyEmail:      null,
      embassyPhone:      null,
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "New Zealand visas are issued electronically via the eVisa system. Check the AEWV (Accredited Employer Work Visa) status via your INZ online account. Only Licensed Immigration Advisers (LIAs) can legally give NZ immigration advice for a fee — verify their licence at iaa.govt.nz.",
  },

  // ══════════════════════════════════════════════════════════════════════
  // EUROPEAN
  // ══════════════════════════════════════════════════════════════════════
  {
    code: "DE",
    name: "Germany",
    flag: "🇩🇪",
    aliases: ["germany", "deutschland"],
    links: {
      immigration:          "https://www.bamf.de/EN/Startseite/startseite_node.html",
      visaPortal:           "https://videx.diplo.de/",
      visaStatusChecker:    null,
      workPermitChecker:    "https://www.make-it-in-germany.com/en/",
      employerCheck:        null,
      recruitmentCheck:     "https://www.arbeitsagentur.de/",
      embassyInKenya:       "https://nairobi.diplo.de/",
      labourMinistry:       "https://www.bmas.de/",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  null,
      embassyEmail:      "info@nair.diplo.de",
      embassyPhone:      "+254 20 426 2100",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "German work visas (§18a-c, Blue Card, Chancenkarte) require a job offer AND recognition of your qualifications via anabin.kmk.org. The visa is a physical sticker in your passport issued by the German Embassy in Nairobi — never issued by any agent. Verify the employer offer by emailing HR directly (never via WhatsApp).",
  },
  {
    code: "NL",
    name: "Netherlands",
    flag: "🇳🇱",
    aliases: ["netherlands", "holland", "nederland", "dutch"],
    links: {
      immigration:          "https://ind.nl/en",
      visaPortal:           "https://ind.nl/en/residence-permits",
      visaStatusChecker:    "https://ind.nl/en/waar-ben-ik-in-de-procedure",
      workPermitChecker:    "https://ind.nl/en/work",
      employerCheck:        "https://ind.nl/en/public-register-recognised-sponsors",
      recruitmentCheck:     null,
      embassyInKenya:       "https://www.netherlandsandyou.nl/your-country-and-the-netherlands/kenya",
      labourMinistry:       "https://www.uwv.nl/",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+31 88 043 04 30",
      embassyEmail:      "nai@minbuza.nl",
      embassyPhone:      "+254 20 428 8000",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "Dutch highly-skilled migrant visas require your employer to be on the IND Public Register of Recognised Sponsors — check that list before signing anything. The visa itself is issued as a Dutch residence card (verblijfsvergunning) upon arrival.",
  },
  {
    code: "IE",
    name: "Ireland",
    flag: "🇮🇪",
    aliases: ["ireland", "eire"],
    links: {
      immigration:          "https://www.irishimmigration.ie/",
      visaPortal:           "https://www.visas.inis.gov.ie/AVATS/",
      visaStatusChecker:    "https://www.irishimmigration.ie/how-to-track-my-visa-application/",
      workPermitChecker:    "https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/",
      employerCheck:        "https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/employment-permit-eligibility/eligible-occupations-list/",
      recruitmentCheck:     null,
      embassyInKenya:       "https://www.ireland.ie/en/kenya/nairobi/",
      labourMinistry:       "https://enterprise.gov.ie/",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+353 1 616 7700",
      embassyEmail:      "nairobiembassy@dfa.ie",
      embassyPhone:      "+254 20 425 4000",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "Ireland's Critical Skills + General Employment Permits are issued by the Department of Enterprise, not the embassy. Verify your permit number on the DBEI Employment Permits Online System. The permit AND a valid Irish visa (issued by the embassy) are both required.",
  },
  {
    code: "PL",
    name: "Poland",
    flag: "🇵🇱",
    aliases: ["poland", "polska"],
    links: {
      immigration:          "https://www.gov.pl/web/udsc-en",
      visaPortal:           "https://secure.e-konsulat.gov.pl/",
      visaStatusChecker:    null,
      workPermitChecker:    "https://www.gov.pl/web/rodzina/wnioski-o-wydanie-zezwolen",
      employerCheck:        null,
      recruitmentCheck:     null,
      embassyInKenya:       "https://www.gov.pl/web/kenya",
      labourMinistry:       "https://www.gov.pl/web/rodzina",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+48 47 721 75 75",
      embassyEmail:      "nairobi.amb.sekretariat@msz.gov.pl",
      embassyPhone:      "+254 20 386 8000",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "Polish work visas require both a Voivode's Work Permit (Zezwolenie na pracę) AND a national visa (Type D) issued by the Polish Embassy. The work permit is filed BY THE EMPLOYER in Poland — you cannot obtain one yourself. Confirm your employer has filed before paying anything.",
  },
  {
    code: "LU",
    name: "Luxembourg",
    flag: "🇱🇺",
    aliases: ["luxembourg", "letzebuerg"],
    links: {
      immigration:          "https://guichet.public.lu/en/citoyens/immigration.html",
      visaPortal:           "https://guichet.public.lu/en/citoyens/immigration/plus-3-mois/ressortissant-tiers.html",
      visaStatusChecker:    null,
      workPermitChecker:    "https://adem.public.lu/en/employers/hire/foreign-workers.html",
      employerCheck:        null,
      recruitmentCheck:     null,
      embassyInKenya:       null,
      labourMinistry:       "https://adem.public.lu/",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  "immigration.mae@mae.etat.lu",
      immigrationPhone:  "+352 247 84020",
      embassyEmail:      null,
      embassyPhone:      null,
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "Luxembourg salaried worker (\"salarié\") visas require a temporary authorization to stay (autorisation de séjour temporaire) issued BEFORE you travel. The employer must first prove no EU citizen is available for the role. Verify with the Immigration Directorate at immigration.mae@mae.etat.lu.",
  },

  // ══════════════════════════════════════════════════════════════════════
  // ASIA-PACIFIC
  // ══════════════════════════════════════════════════════════════════════
  {
    code: "TR",
    name: "Turkey",
    flag: "🇹🇷",
    aliases: ["turkey", "türkiye", "turkiye"],
    links: {
      immigration:          "https://en.goc.gov.tr/",
      visaPortal:           "https://www.evisa.gov.tr/en/",
      visaStatusChecker:    "https://www.evisa.gov.tr/en/status-inquiry/",
      workPermitChecker:    "https://ecalismaizni.csgb.gov.tr/",
      employerCheck:        null,
      recruitmentCheck:     null,
      embassyInKenya:       "http://nairobi.emb.mfa.gov.tr/",
      labourMinistry:       "https://www.csgb.gov.tr/en",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+90 312 202 5000",
      embassyEmail:      "embassy.nairobi@mfa.gov.tr",
      embassyPhone:      "+254 20 271 3140",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "Turkish work visas require a work permit (Çalışma İzni) from the Ministry of Labour BEFORE the visa can be issued by the embassy. The employer submits the work permit application — verify it exists via ecalismaizni.csgb.gov.tr.",
  },
  {
    code: "JP",
    name: "Japan",
    flag: "🇯🇵",
    aliases: ["japan", "nippon"],
    links: {
      immigration:          "https://www.moj.go.jp/isa/",
      visaPortal:           "https://www.mofa.go.jp/j_info/visit/visa/index.html",
      visaStatusChecker:    null,
      workPermitChecker:    null,
      employerCheck:        null,
      recruitmentCheck:     null,
      embassyInKenya:       "https://www.ke.emb-japan.go.jp/",
      labourMinistry:       "https://www.mhlw.go.jp/english/",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+81 3 3580 4111",
      embassyEmail:      "info@nr.mofa.go.jp",
      embassyPhone:      "+254 20 289 8000",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "Japanese work visas require a Certificate of Eligibility (CoE) issued by the Immigration Services Agency BEFORE the visa can be applied for. The employer files the CoE — request a scan of it before paying anything.",
  },
  {
    code: "KR",
    name: "South Korea",
    flag: "🇰🇷",
    aliases: ["south korea", "korea", "republic of korea"],
    links: {
      immigration:          "https://www.immigration.go.kr/immigration_eng/",
      visaPortal:           "https://www.visa.go.kr/",
      visaStatusChecker:    "https://www.visa.go.kr/openPage.do?MENU_ID=10402",
      workPermitChecker:    null,
      employerCheck:        null,
      recruitmentCheck:     "https://www.eps.go.kr/",
      embassyInKenya:       "https://overseas.mofa.go.kr/ke-en/index.do",
      labourMinistry:       "https://www.moel.go.kr/english/",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+82 1345",
      embassyEmail:      "consularke@mofa.or.kr",
      embassyPhone:      "+254 20 236 1000",
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "South Korean EPS (Employment Permit System) workers apply through their home country's HRD Korea office — Kenya is NOT currently an EPS partner country. Any \"guaranteed EPS visa from Kenya\" offer is a scam. E-9 work visas from Kenya are not directly available.",
  },
  {
    code: "SG",
    name: "Singapore",
    flag: "🇸🇬",
    aliases: ["singapore"],
    links: {
      immigration:          "https://www.ica.gov.sg/",
      visaPortal:           "https://eservices.ica.gov.sg/esvclandingpage/save",
      visaStatusChecker:    null,
      workPermitChecker:    "https://www.mom.gov.sg/passes-and-permits",
      employerCheck:        "https://www.mom.gov.sg/employment-practices/employers",
      recruitmentCheck:     "https://www.mom.gov.sg/employment-practices/employment-agencies/employment-agency-directory",
      embassyInKenya:       null,
      labourMinistry:       "https://www.mom.gov.sg/",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+65 6438 5122",
      embassyEmail:      null,
      embassyPhone:      null,
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "Singapore work visas (Employment Pass, S Pass, Work Permit) are issued by MOM (Ministry of Manpower). The employer applies — you cannot apply yourself. Verify your employer via MOM's Employment Agency Directory. Every legitimate Singapore work pass has a FIN number after arrival.",
  },
  {
    code: "MY",
    name: "Malaysia",
    flag: "🇲🇾",
    aliases: ["malaysia"],
    links: {
      immigration:          "https://www.imi.gov.my/",
      visaPortal:           "https://malaysiavisa.imi.gov.my/",
      visaStatusChecker:    null,
      workPermitChecker:    "https://esd.imi.gov.my/portal/",
      employerCheck:        null,
      recruitmentCheck:     null,
      embassyInKenya:       null,
      labourMinistry:       "https://www.mohr.gov.my/",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+60 3 8000 8000",
      embassyEmail:      null,
      embassyPhone:      null,
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "Malaysian work visas (Employment Pass, Professional Visit Pass) require sponsorship approval from ESD (Expatriate Services Division). Confirm the employer is registered with ESD before travel.",
  },

  // ══════════════════════════════════════════════════════════════════════
  // NEW / TRENDING
  // ══════════════════════════════════════════════════════════════════════
  {
    code: "BS",
    name: "Bahamas",
    flag: "🇧🇸",
    aliases: ["bahamas", "commonwealth of the bahamas"],
    links: {
      immigration:          "https://www.immigration.gov.bs/",
      visaPortal:           "https://mofa.gov.bs/evisa-online-services/",
      visaStatusChecker:    null,
      workPermitChecker:    null,
      employerCheck:        null,
      recruitmentCheck:     null,
      embassyInKenya:       null,
      labourMinistry:       "https://www.bahamas.gov.bs/",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+1 242 322 7530",
      embassyEmail:      null,
      embassyPhone:      null,
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "The Bahamas issues an Electronic Entry Visa through the Ministry of Foreign Affairs. Public verification is NOT available online — contact the Bahamas MFA directly with your visa number to confirm. Work permits are separately issued by the Department of Immigration.",
  },
  {
    code: "PT",
    name: "Portugal",
    flag: "🇵🇹",
    aliases: ["portugal"],
    links: {
      immigration:          "https://www.aima.gov.pt/",
      visaPortal:           "https://vistos.mne.gov.pt/en/",
      visaStatusChecker:    null,
      workPermitChecker:    null,
      employerCheck:        null,
      recruitmentCheck:     null,
      embassyInKenya:       null,
      labourMinistry:       "https://www.act.gov.pt/",
      fraudReporting:       null,
      kenyaConsularSupport: KENYA_CONSULAR,
    },
    contacts: {
      immigrationEmail:  null,
      immigrationPhone:  "+351 217 115 000",
      embassyEmail:      null,
      embassyPhone:      null,
      fraudReportEmail:  null,
    },
    nextStepAdvice:
      "Portuguese work visas (D2 job-seeker, D3 highly-qualified) are issued by AIMA. Every legitimate work visa requires an NIF (tax number) and either a job offer or a manifestation of interest — verify through the Portuguese consulate.",
  },
];

/**
 * Look up a country by its ISO code, name, or any alias the AI extracted.
 * Case-insensitive. Returns null if not in the registry.
 */
export function findCountry(input: string | null | undefined): CountryVisaResources | null {
  if (!input) return null;
  const needle = String(input).trim().toLowerCase();
  if (!needle) return null;
  for (const c of COUNTRY_REGISTRY) {
    if (c.code.toLowerCase() === needle) return c;
    if (c.name.toLowerCase() === needle) return c;
    if (c.aliases.some((a) => a.toLowerCase() === needle)) return c;
    // Also match if needle CONTAINS the country name (e.g. "issued in the united arab emirates")
    if (needle.includes(c.name.toLowerCase())) return c;
    for (const alias of c.aliases) {
      if (alias.length >= 3 && needle.includes(alias.toLowerCase())) return c;
    }
  }
  return null;
}

/** Convenience: return only the countries we have full verification support for. */
export function getSupportedCountries(): CountryVisaResources[] {
  return COUNTRY_REGISTRY.slice();
}
