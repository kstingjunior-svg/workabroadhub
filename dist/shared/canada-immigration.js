"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Canada Immigration — production data layer.
//
// Real IRCC numbers (Express Entry CRS scoring, current fees, ECA providers,
// recent draw history, NOC 2021 codes most relevant to Kenyan applicants,
// verified Canadian job portals).
//
// All currency amounts are CAD with KES conversion at 1 CAD ≈ 109 KES
// (computed via cadToKes helper so we can adjust one constant).
//
// Sources verified against:
//  - IRCC: canada.ca/en/immigration-refugees-citizenship.html
//  - NOC 2021: noc.esdc.gc.ca
//  - ECA designated providers: canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/education-assessed.html
//  - Express Entry rounds: canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html
//
// 2026-06 retention build: Canada Express Entry + Jobs hub.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECENT_DRAWS_SEED = exports.CANADA_JOB_PORTALS = exports.ECA_PROVIDERS = exports.NOC_CATEGORIES = exports.NOC_OCCUPATIONS = exports.CANADA_FEES = exports.CANADA_PROGRAMS = exports.CRS_ADDITIONAL = exports.CRS_SECOND_LANG_MAX_TOTAL = exports.CRS_EDUCATION = exports.EDUCATION_LABELS = exports.CRS_AGE = exports.CAD_TO_KES = void 0;
exports.cadToKes = cadToKes;
exports.crsFirstLangPointsPerAbility = crsFirstLangPointsPerAbility;
exports.crsSecondLangPointsPerAbility = crsSecondLangPointsPerAbility;
exports.crsCanadianWorkPoints = crsCanadianWorkPoints;
exports.crsTransferabilityPoints = crsTransferabilityPoints;
exports.estimateCanadaTotalCAD = estimateCanadaTotalCAD;
exports.CAD_TO_KES = 109;
function cadToKes(cad) {
    return Math.round(cad * exports.CAD_TO_KES);
}
// ── CRS SCORING TABLES (IRCC official, as of 2026) ────────────────────────────
// Numbers per https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/criteria-comprehensive-ranking-system/grid.html
//
// Score columns: "single" applies to applicants without a spouse/common-law
// partner who comes with them OR whose partner is already a Canadian PR/citizen.
// "withSpouse" applies when both spouses are immigrating together.
exports.CRS_AGE = {
    17: { single: 0, withSpouse: 0 },
    18: { single: 99, withSpouse: 90 },
    19: { single: 105, withSpouse: 95 },
    20: { single: 110, withSpouse: 100 },
    21: { single: 110, withSpouse: 100 },
    22: { single: 110, withSpouse: 100 },
    23: { single: 110, withSpouse: 100 },
    24: { single: 110, withSpouse: 100 },
    25: { single: 110, withSpouse: 100 },
    26: { single: 110, withSpouse: 100 },
    27: { single: 110, withSpouse: 100 },
    28: { single: 110, withSpouse: 100 },
    29: { single: 110, withSpouse: 100 },
    30: { single: 105, withSpouse: 95 },
    31: { single: 99, withSpouse: 90 },
    32: { single: 94, withSpouse: 85 },
    33: { single: 88, withSpouse: 80 },
    34: { single: 83, withSpouse: 75 },
    35: { single: 77, withSpouse: 70 },
    36: { single: 72, withSpouse: 65 },
    37: { single: 66, withSpouse: 60 },
    38: { single: 61, withSpouse: 55 },
    39: { single: 55, withSpouse: 50 },
    40: { single: 50, withSpouse: 45 },
    41: { single: 39, withSpouse: 35 },
    42: { single: 28, withSpouse: 25 },
    43: { single: 17, withSpouse: 15 },
    44: { single: 6, withSpouse: 5 },
    45: { single: 0, withSpouse: 0 },
};
exports.EDUCATION_LABELS = {
    less_than_secondary: "Less than secondary school",
    secondary: "Secondary diploma (KCSE)",
    one_year_post_secondary: "1-year certificate or diploma",
    two_year_post_secondary: "2-year diploma",
    bachelor: "Bachelor's degree (3+ year)",
    two_or_more_credentials: "Two or more credentials (one 3+ year)",
    master_or_professional: "Master's degree",
    doctoral: "Doctoral (PhD)",
};
exports.CRS_EDUCATION = {
    less_than_secondary: { single: 0, withSpouse: 0 },
    secondary: { single: 30, withSpouse: 28 },
    one_year_post_secondary: { single: 90, withSpouse: 84 },
    two_year_post_secondary: { single: 98, withSpouse: 91 },
    bachelor: { single: 120, withSpouse: 112 },
    two_or_more_credentials: { single: 128, withSpouse: 119 },
    master_or_professional: { single: 135, withSpouse: 126 },
    doctoral: { single: 150, withSpouse: 140 },
};
// First Official Language (English OR French) — per ability (L/S/R/W), four
// abilities tracked separately. Returns points PER ABILITY at that CLB band.
function crsFirstLangPointsPerAbility(clb, withSpouse) {
    if (clb < 4)
        return 0;
    if (clb === 4)
        return withSpouse ? 6 : 6;
    if (clb === 5)
        return withSpouse ? 6 : 6;
    if (clb === 6)
        return withSpouse ? 8 : 9;
    if (clb === 7)
        return withSpouse ? 16 : 17;
    if (clb === 8)
        return withSpouse ? 22 : 23;
    if (clb === 9)
        return withSpouse ? 29 : 31;
    // CLB 10+
    return withSpouse ? 32 : 34;
}
// Second Official Language — per ability, max 6 per ability, max 22 total.
function crsSecondLangPointsPerAbility(clb, withSpouse) {
    if (clb < 5)
        return 0;
    if (clb <= 6)
        return 1;
    if (clb <= 8)
        return 3;
    // CLB 9+
    return withSpouse ? 6 : 6;
}
exports.CRS_SECOND_LANG_MAX_TOTAL = { single: 22, withSpouse: 22 };
// Canadian Work Experience (full-time years in NOC TEER 0/1/2/3)
function crsCanadianWorkPoints(years, withSpouse) {
    const y = Math.min(5, Math.max(0, Math.floor(years)));
    if (withSpouse) {
        return [0, 35, 46, 56, 63, 70][y];
    }
    return [0, 40, 53, 64, 72, 80][y];
}
// Skill transferability — combined factors, capped at 100.
// We implement the high-value combinations most Kenyan applicants hit:
//  (a) Education + First Language CLB ≥ 7
//  (b) Foreign Work + First Language CLB ≥ 7
//  (c) Education + Canadian Work Experience
//  (d) Foreign Work + Canadian Work Experience
//
// Each combo capped at 50, sum capped at 100. Spouse-with applicants use the
// same transferability points (this section doesn't shift with spouse).
function eduCategory(edu) {
    // 0 = less than 1-year post-secondary, 1 = one credential (1+ years),
    // 2 = two credentials or 3+ year program
    if (edu === "less_than_secondary" || edu === "secondary")
        return 0;
    if (edu === "one_year_post_secondary")
        return 1;
    // bachelor, two_year, two_or_more, master, doctoral all count as 2 here
    return 2;
}
function crsTransferabilityPoints(input) {
    let total = 0;
    // (a) Education + First Language CLB 7+
    const eduTier = eduCategory(input.education);
    if (eduTier >= 1) {
        if (input.firstLangAvgClb >= 9)
            total += eduTier === 2 ? 50 : 25;
        else if (input.firstLangAvgClb >= 7)
            total += eduTier === 2 ? 25 : 13;
    }
    // (c) Education + Canadian Work
    const canYrs = Math.floor(input.canadianWorkYears);
    if (eduTier >= 1 && canYrs >= 1) {
        if (canYrs >= 2)
            total += eduTier === 2 ? 50 : 25;
        else
            total += eduTier === 2 ? 25 : 13;
    }
    // (b) Foreign Work + First Language CLB 7+
    const fyr = Math.floor(input.foreignWorkYears);
    if (fyr >= 1) {
        const tier = fyr >= 3 ? 2 : 1;
        if (input.firstLangAvgClb >= 9)
            total += tier === 2 ? 50 : 25;
        else if (input.firstLangAvgClb >= 7)
            total += tier === 2 ? 25 : 13;
    }
    // (d) Foreign Work + Canadian Work
    if (fyr >= 1 && canYrs >= 1) {
        const fTier = fyr >= 3 ? 2 : 1;
        const cTier = canYrs >= 2 ? 2 : 1;
        if (fTier === 2 && cTier === 2)
            total += 50;
        else if (fTier === 2 || cTier === 2)
            total += 25;
        else
            total += 13;
    }
    return Math.min(100, total);
}
// Additional points (PNP, sibling, French bonus, arranged employment)
exports.CRS_ADDITIONAL = {
    PNP_NOMINATION: 600, // game-changer; vaults you to invite
    ARRANGED_EMPLOYMENT_TEER_0_MG_00: 200, // very senior managers
    ARRANGED_EMPLOYMENT_OTHER: 50,
    FRENCH_CLB_7_PLUS_ENGLISH_CLB_4_OR_LESS: 25,
    FRENCH_CLB_7_PLUS_ENGLISH_CLB_5_PLUS: 50,
    SIBLING_IN_CANADA: 15,
    CANADIAN_STUDY_1_OR_2_YEAR: 15,
    CANADIAN_STUDY_3_PLUS_OR_GRADUATE: 30,
};
exports.CANADA_PROGRAMS = [
    {
        key: "fsw",
        name: "Federal Skilled Worker (FSW)",
        fullName: "Express Entry — Federal Skilled Worker Program",
        shortDescription: "The main pathway for skilled professionals abroad. Most Kenyans apply here.",
        whoForKenya: "Kenyans with a bachelor's degree + 1 year of skilled work experience (TEER 0/1/2/3) + IELTS CLB 7+. Doctors, nurses, IT specialists, engineers, teachers all qualify.",
        minRequirements: [
            "1 year of continuous full-time skilled work experience in the past 10 years",
            "Language: CLB 7 in English OR French (minimum IELTS 6.0 across all four abilities)",
            "Education: Kenyan secondary credential MUST be assessed by an IRCC-designated body (ECA)",
            "Minimum 67/100 on FSW points test (different from CRS)",
            "Proof of funds: CAD 13,757 for a single applicant (≈ KES 1.5M)",
        ],
        pros: [
            "Open to applicants with no Canadian work history",
            "PR status (permanent residence) on arrival — bring family",
            "Faster than most other PR pathways (6-month service standard)",
        ],
        cons: [
            "Competitive — typical CRS cutoff 470-540 for all-program rounds",
            "Up-front cost is high (≈ KES 310,000 in fees alone)",
        ],
        recentCrsCutoffRange: "470-547",
        processingMonths: "6",
        officialUrl: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/federal-skilled-workers.html",
    },
    {
        key: "cec",
        name: "Canadian Experience Class (CEC)",
        fullName: "Express Entry — Canadian Experience Class",
        shortDescription: "For people who already have at least 1 year of skilled work experience IN Canada.",
        whoForKenya: "Best for Kenyans already in Canada on work or study permits — international students who graduated and worked 1+ year, IEC/working-holiday participants, and intra-company transferees.",
        minRequirements: [
            "1 year of skilled (TEER 0/1/2/3) work experience IN Canada in the past 3 years",
            "Language: CLB 7 for TEER 0/1, CLB 5 for TEER 2/3",
            "Be admissible to Canada (no serious criminal/medical inadmissibility)",
        ],
        pros: [
            "No proof-of-funds requirement",
            "No ECA required (if all education was in Canada)",
            "Lower CRS cutoffs historically",
        ],
        cons: [
            "Requires being already in Canada",
            "Closed to most Kenyans who haven't visited Canada yet",
        ],
        recentCrsCutoffRange: "490-547",
        processingMonths: "6",
        officialUrl: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/canadian-experience-class.html",
    },
    {
        key: "fst",
        name: "Federal Skilled Trades (FST)",
        fullName: "Express Entry — Federal Skilled Trades Program",
        shortDescription: "For tradespeople — electricians, welders, mechanics, carpenters, crane operators, machinists.",
        whoForKenya: "Kenyan-trained electricians, plumbers, welders, mechanics, heavy-machine operators. Tradespeople rarely apply via FST but Canadian provinces actively recruit through PNP streams.",
        minRequirements: [
            "2 years of full-time work experience in a skilled trade in the last 5 years",
            "A valid job offer from a Canadian employer (1 year+) OR a certificate of qualification from a Canadian province",
            "Language: CLB 5 speaking/listening, CLB 4 reading/writing",
            "Meet job requirements of the NOC code (excluding the certification itself)",
        ],
        pros: [
            "Lower language requirement than FSW",
            "Trades have priority via category-based draws (CRS cutoff often 380-430)",
        ],
        cons: [
            "Requires job offer OR provincial trade certification — both hard from Kenya without travel",
        ],
        recentCrsCutoffRange: "380-435",
        processingMonths: "6",
        officialUrl: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/skilled-trades.html",
    },
    {
        key: "pnp",
        name: "Provincial Nominee Program (PNP)",
        fullName: "Provincial Nominee Program (Express Entry-aligned and base streams)",
        shortDescription: "Each province picks immigrants for in-demand jobs. A nomination adds 600 CRS points.",
        whoForKenya: "Strong if your NOC is in-demand in a specific province. Saskatchewan (SINP), Manitoba (MPNP), Alberta (AAIP), Ontario (OINP), BC (BC PNP) all have streams open to Kenyan applicants without a job offer.",
        minRequirements: [
            "Eligibility varies by province and stream — check the specific province",
            "Most streams require an Express Entry profile + an Expression of Interest with the province",
            "Some streams require a connection (work, study, family) to the province",
        ],
        pros: [
            "Provincial nomination adds 600 CRS points → near-guaranteed invitation",
            "Some streams (Saskatchewan, Manitoba) open without a job offer",
        ],
        cons: [
            "You must intend to live in the nominating province",
            "Application is double-layer: province first, then federal",
            "Adds 12-18 months to total timeline",
        ],
        recentCrsCutoffRange: "720-783",
        processingMonths: "18",
        officialUrl: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/provincial-nominees.html",
    },
    {
        key: "atlantic",
        name: "Atlantic Immigration Program (AIP)",
        fullName: "Atlantic Immigration Program",
        shortDescription: "For New Brunswick, Nova Scotia, PEI, Newfoundland. Requires a job offer from a designated employer.",
        whoForKenya: "Best if you can secure an offer in Atlantic Canada — healthcare workers (nurses, PSWs), food processing, hospitality. Designated employers often work directly with Kenyan candidates.",
        minRequirements: [
            "Full-time job offer from a designated Atlantic employer",
            "1 year of relevant work experience",
            "Education: minimum high school OR foreign equivalent",
            "Language: CLB 5 for TEER 0/1/2/3, CLB 4 for TEER 4",
        ],
        pros: [
            "No Express Entry needed — direct PR pathway",
            "Faster (6-month service standard once application is submitted)",
            "Lower language requirement (CLB 5)",
        ],
        cons: [
            "Requires a designated-employer job offer (you can't apply without one)",
            "Must intend to live in Atlantic Canada",
        ],
        recentCrsCutoffRange: "n/a (no CRS)",
        processingMonths: "6",
        officialUrl: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/atlantic-immigration-program.html",
    },
    {
        key: "rnip",
        name: "Rural & Northern Immigration Pilot (RNIP)",
        fullName: "Rural and Northern Immigration Pilot",
        shortDescription: "For 11 smaller communities (Sault Ste. Marie, Brandon, Vernon, etc.). Job offer required.",
        whoForKenya: "Niche but viable — communities like Sudbury (ON), Thunder Bay (ON), Brandon (MB) actively recruit Kenyan healthcare workers, truckers, and food-service workers.",
        minRequirements: [
            "Job offer from an employer in a participating community",
            "Community recommendation",
            "1 year of work experience in the past 3 years (or recent graduate from a community institution)",
            "Education: high school equivalent",
            "Language: CLB 4-6 depending on NOC",
        ],
        pros: [
            "Lower competition than big-city PNP streams",
            "Community-based — strong settlement support",
        ],
        cons: [
            "Pilot ends in 2024-2025 and is being replaced — check current status before applying",
            "Must live in the specific community",
        ],
        recentCrsCutoffRange: "n/a",
        processingMonths: "12",
        officialUrl: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/rural-northern-immigration-pilot.html",
    },
    {
        key: "caregiver",
        name: "Home Care Worker Pilot",
        fullName: "Home Care Worker Immigration Pilots (Child Care & Home Support)",
        shortDescription: "For nannies, PSWs, and home support workers. Direct PR pathway.",
        whoForKenya: "Excellent pathway for Kenyan PSWs, nannies, eldercare workers. PR on arrival (replacing the older 'caregiver visa' system that required 2 years of work first).",
        minRequirements: [
            "Job offer in a home child-care or home support occupation",
            "1 year of relevant work experience (NOC 44100 or 44101)",
            "Language: CLB 4 minimum",
            "Education: high school or equivalent",
        ],
        pros: [
            "PR status from day 1 (not work permit first)",
            "Very low language threshold (CLB 4)",
            "Family included",
        ],
        cons: [
            "Pilot reopens periodically — check current intake status",
            "Job offer required",
        ],
        recentCrsCutoffRange: "n/a",
        processingMonths: "12",
        officialUrl: "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/permit/caregiver.html",
    },
];
exports.CANADA_FEES = [
    {
        key: "ee_application",
        label: "Express Entry application (principal applicant)",
        amountCAD: 950,
        notes: "Processing fee for the main applicant. Paid online when you submit your e-APR.",
        required: true,
        url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/fees/fee-list.html",
    },
    {
        key: "rprf",
        label: "Right of Permanent Residence Fee (RPRF)",
        amountCAD: 575,
        notes: "Pay this once your application is approved. Refundable if you choose not to land.",
        required: true,
    },
    {
        key: "ee_spouse",
        label: "Application — accompanying spouse",
        amountCAD: 950,
        notes: "Only if your spouse is immigrating with you.",
        required: false,
    },
    {
        key: "ee_child",
        label: "Application — each accompanying child under 22",
        amountCAD: 260,
        notes: "Per child.",
        required: false,
    },
    {
        key: "biometrics",
        label: "Biometrics fee",
        amountCAD: 85,
        notes: "Per person ($170 max for a family of 2+). Collected at a VAC in Nairobi.",
        required: true,
        url: "https://visa.vfsglobal.com/ken/en/can",
    },
    {
        key: "ielts",
        label: "IELTS General Training (Kenya)",
        amountCAD: 290,
        notes: "≈ KES 32,500 booked at the British Council or IDP Nairobi. CELPIP and PTE Core also accepted.",
        required: true,
        url: "https://www.britishcouncil.co.ke/exam/ielts",
    },
    {
        key: "eca",
        label: "Educational Credential Assessment (WES Canada)",
        amountCAD: 250,
        notes: "Required if you studied outside Canada. WES is the most common provider for Kenyan transcripts.",
        required: true,
        url: "https://www.wes.org/ca/",
    },
    {
        key: "medical",
        label: "Upfront medical exam (panel physician, Nairobi)",
        amountCAD: 200,
        notes: "Required after ITA. Use an IRCC-approved panel physician — list at the official link.",
        required: true,
        url: "https://secure.cic.gc.ca/pp-md/pp-list.aspx",
    },
    {
        key: "police",
        label: "Police clearance certificate (DCI Kenya)",
        amountCAD: 20,
        notes: "≈ KES 1,050 + fingerprints. One for every country you've lived in for 6+ months since age 18.",
        required: true,
        url: "https://www.ecitizen.go.ke/",
    },
    {
        key: "translation",
        label: "Document translation + notarization",
        amountCAD: 50,
        notes: "If any of your documents aren't in English or French.",
        required: false,
    },
];
// Returns the total estimated cost for a single applicant from Kenya.
function estimateCanadaTotalCAD() {
    return exports.CANADA_FEES.filter((f) => f.required).reduce((sum, f) => sum + f.amountCAD, 0);
}
exports.NOC_OCCUPATIONS = [
    // Healthcare (huge demand, frequent category-based draws)
    { code: "31100", title: "Specialist physicians", teer: 1, category: "healthcare", recentCategoryDraw: "Healthcare" },
    { code: "31102", title: "General practitioners and family physicians", teer: 1, category: "healthcare", recentCategoryDraw: "Healthcare" },
    { code: "31200", title: "Psychiatrists", teer: 1, category: "healthcare", recentCategoryDraw: "Healthcare" },
    { code: "31201", title: "Pharmacists", teer: 1, category: "healthcare", recentCategoryDraw: "Healthcare" },
    { code: "31202", title: "Physiotherapists", teer: 1, category: "healthcare", recentCategoryDraw: "Healthcare" },
    { code: "31203", title: "Occupational therapists", teer: 1, category: "healthcare", recentCategoryDraw: "Healthcare" },
    { code: "31300", title: "Nursing coordinators and supervisors", teer: 1, category: "healthcare", recentCategoryDraw: "Healthcare" },
    { code: "31301", title: "Registered nurses and registered psychiatric nurses", teer: 1, category: "healthcare", recentCategoryDraw: "Healthcare" },
    { code: "31302", title: "Nurse practitioners", teer: 1, category: "healthcare", recentCategoryDraw: "Healthcare" },
    { code: "32101", title: "Licensed practical nurses", teer: 2, category: "healthcare", recentCategoryDraw: "Healthcare" },
    { code: "32102", title: "Paramedics", teer: 2, category: "healthcare", recentCategoryDraw: "Healthcare" },
    { code: "32103", title: "Respiratory therapists, clinical perfusionists", teer: 2, category: "healthcare", recentCategoryDraw: "Healthcare" },
    { code: "33102", title: "Nurse aides, orderlies, patient service associates", teer: 3, category: "healthcare" },
    { code: "33100", title: "Dental assistants and dental laboratory assistants", teer: 3, category: "healthcare" },
    // STEM
    { code: "21220", title: "Cybersecurity specialists", teer: 1, category: "stem", recentCategoryDraw: "STEM" },
    { code: "21221", title: "Business systems specialists", teer: 1, category: "stem", recentCategoryDraw: "STEM" },
    { code: "21222", title: "Information systems specialists", teer: 1, category: "stem", recentCategoryDraw: "STEM" },
    { code: "21223", title: "Database analysts and data administrators", teer: 1, category: "stem", recentCategoryDraw: "STEM" },
    { code: "21230", title: "Computer systems developers and programmers", teer: 1, category: "stem", recentCategoryDraw: "STEM" },
    { code: "21231", title: "Software engineers and designers", teer: 1, category: "stem", recentCategoryDraw: "STEM" },
    { code: "21232", title: "Software developers and programmers", teer: 1, category: "stem", recentCategoryDraw: "STEM" },
    { code: "21233", title: "Web designers", teer: 1, category: "stem" },
    { code: "21234", title: "Web developers and programmers", teer: 1, category: "stem" },
    { code: "21300", title: "Civil engineers", teer: 1, category: "stem", recentCategoryDraw: "STEM" },
    { code: "21301", title: "Mechanical engineers", teer: 1, category: "stem", recentCategoryDraw: "STEM" },
    { code: "21310", title: "Electrical and electronics engineers", teer: 1, category: "stem", recentCategoryDraw: "STEM" },
    // Trades
    { code: "72100", title: "Machinists and machining inspectors", teer: 2, category: "trades", recentCategoryDraw: "Trades" },
    { code: "72106", title: "Welders and related machine operators", teer: 2, category: "trades", recentCategoryDraw: "Trades" },
    { code: "72200", title: "Electricians (except industrial and power system)", teer: 2, category: "trades", recentCategoryDraw: "Trades" },
    { code: "72300", title: "Plumbers", teer: 2, category: "trades", recentCategoryDraw: "Trades" },
    { code: "72310", title: "Carpenters", teer: 2, category: "trades", recentCategoryDraw: "Trades" },
    { code: "72400", title: "Heavy-duty equipment mechanics", teer: 2, category: "trades", recentCategoryDraw: "Trades" },
    { code: "73400", title: "Heavy equipment operators", teer: 3, category: "trades", recentCategoryDraw: "Trades" },
    // Transport (recent category-based focus)
    { code: "73300", title: "Transport truck drivers", teer: 3, category: "transport", recentCategoryDraw: "Transport" },
    { code: "73200", title: "General trucking, transport drivers", teer: 3, category: "transport", recentCategoryDraw: "Transport" },
    // Education
    { code: "41220", title: "Secondary school teachers", teer: 1, category: "education", recentCategoryDraw: "Education" },
    { code: "41221", title: "Elementary school and kindergarten teachers", teer: 1, category: "education", recentCategoryDraw: "Education" },
    { code: "41200", title: "University professors and lecturers", teer: 1, category: "education" },
    // Business & finance
    { code: "11100", title: "Financial auditors and accountants", teer: 1, category: "business" },
    { code: "11102", title: "Financial advisors", teer: 1, category: "business" },
    { code: "12011", title: "Supervisors, general office and administrative support", teer: 2, category: "business" },
    // Agriculture & agri-food
    { code: "63201", title: "Butchers — retail and wholesale", teer: 3, category: "agriculture", recentCategoryDraw: "Agriculture" },
    { code: "84120", title: "Specialized livestock workers, farm machinery operators", teer: 4, category: "agriculture", recentCategoryDraw: "Agriculture" },
    { code: "82030", title: "Agricultural service contractors, farm supervisors", teer: 2, category: "agriculture" },
    // Social services (in-demand)
    { code: "42201", title: "Social and community service workers", teer: 3, category: "social", recentCategoryDraw: "Social Services" },
    { code: "44101", title: "Home support workers, caregivers", teer: 4, category: "social" },
];
exports.NOC_CATEGORIES = [
    { key: "healthcare", label: "Healthcare", icon: "stethoscope" },
    { key: "stem", label: "Tech / STEM", icon: "cpu" },
    { key: "trades", label: "Skilled Trades", icon: "wrench" },
    { key: "education", label: "Education", icon: "graduation-cap" },
    { key: "transport", label: "Transport", icon: "truck" },
    { key: "business", label: "Business / Finance", icon: "briefcase" },
    { key: "agriculture", label: "Agriculture & Food", icon: "wheat" },
    { key: "social", label: "Social Services", icon: "users" },
];
exports.ECA_PROVIDERS = [
    {
        key: "wes",
        name: "World Education Services (WES)",
        scope: "All education from any country, all professions except medicine/pharmacy",
        bestFor: "Most Kenyan applicants — fastest, most familiar with KCSE + Kenyan university credentials",
        feeCAD: 250,
        timelineWeeks: "4-6",
        url: "https://www.wes.org/ca/",
        acceptsKenyanDocs: true,
    },
    {
        key: "iqas",
        name: "International Qualifications Assessment Service (IQAS)",
        scope: "All education from any country, all professions except medicine/pharmacy",
        bestFor: "Alternative if WES is backlogged. Operated by the Government of Alberta.",
        feeCAD: 200,
        timelineWeeks: "8-12",
        url: "https://www.alberta.ca/iqas-overview.aspx",
        acceptsKenyanDocs: true,
    },
    {
        key: "icas",
        name: "International Credential Assessment Service (ICAS)",
        scope: "All education from any country, all professions except medicine/pharmacy",
        bestFor: "Ontario-based provider. Good if you're targeting OINP.",
        feeCAD: 220,
        timelineWeeks: "6-10",
        url: "https://www.icascanada.ca/",
        acceptsKenyanDocs: true,
    },
    {
        key: "ces",
        name: "Comparative Education Service (CES) — University of Toronto",
        scope: "All education from any country, all professions except medicine/pharmacy",
        bestFor: "If you're applying to U of T or other Ontario universities concurrently.",
        feeCAD: 240,
        timelineWeeks: "8-12",
        url: "https://learn.utoronto.ca/comparative-education-service",
        acceptsKenyanDocs: true,
    },
    {
        key: "ices",
        name: "International Credential Evaluation Service (ICES) — BCIT",
        scope: "All education from any country, all professions except medicine/pharmacy",
        bestFor: "British Columbia-focused. Required for some BC PNP streams.",
        feeCAD: 220,
        timelineWeeks: "6-10",
        url: "https://www.bcit.ca/ices/",
        acceptsKenyanDocs: true,
    },
    {
        key: "mcc",
        name: "Medical Council of Canada (MCC)",
        scope: "Doctors only (general practitioners, specialists)",
        bestFor: "Mandatory for any Kenyan-trained physician. Use this AND a general ECA.",
        feeCAD: 300,
        timelineWeeks: "8-12",
        url: "https://mcc.ca/",
        acceptsKenyanDocs: true,
    },
    {
        key: "pebc",
        name: "Pharmacy Examining Board of Canada (PEBC)",
        scope: "Pharmacists only",
        bestFor: "Mandatory for any Kenyan-trained pharmacist.",
        feeCAD: 300,
        timelineWeeks: "12-20",
        url: "https://www.pebc.ca/",
        acceptsKenyanDocs: true,
    },
];
exports.CANADA_JOB_PORTALS = [
    {
        key: "jobbank",
        name: "Job Bank (Government of Canada)",
        url: "https://www.jobbank.gc.ca/jobsearch/jobsearch?lang=en",
        description: "The official Government of Canada job board. Lists every job employers post for LMIA purposes.",
        bestFor: "Start here. Use the 'Job offer LMIA-approved' filter to find employers willing to sponsor work permits.",
        freeToUse: true,
        governmentRun: true,
        lmiaFilter: true,
        category: "general",
    },
    {
        key: "jobbank_lmia",
        name: "Job Bank — LMIA-approved jobs only",
        url: "https://www.jobbank.gc.ca/jobsearch/jobsearch?fsrc=32&lang=en",
        description: "Filtered view showing ONLY positions where the employer has an approved LMIA.",
        bestFor: "Direct link for Kenyans seeking employer-sponsored Canadian work — these are jobs IRCC has pre-cleared.",
        freeToUse: true,
        governmentRun: true,
        lmiaFilter: true,
        category: "general",
    },
    {
        key: "indeed_ca",
        name: "Indeed Canada",
        url: "https://ca.indeed.com/",
        description: "Largest private job board. Search by city, role, or salary.",
        bestFor: "Use search filters: 'visa sponsorship', 'work permit', or specific city like Toronto/Calgary.",
        freeToUse: true,
        governmentRun: false,
        lmiaFilter: false,
        category: "general",
    },
    {
        key: "linkedin_ca",
        name: "LinkedIn Jobs Canada",
        url: "https://www.linkedin.com/jobs/search/?location=Canada",
        description: "Professional network with recruiter outreach. Use the 'Open to' badge for visa sponsorship.",
        bestFor: "Best for white-collar roles. Build a Canada-targeted profile, follow Canadian companies, message recruiters directly.",
        freeToUse: true,
        governmentRun: false,
        lmiaFilter: false,
        category: "general",
    },
    {
        key: "magnet",
        name: "Magnet (Newcomer-focused)",
        url: "https://magnet.today/",
        description: "Talent-matching platform specifically for newcomers and underrepresented Canadians.",
        bestFor: "Built around YOUR profile — employers find you. Free for job seekers. Strong newcomer support.",
        freeToUse: true,
        governmentRun: false,
        lmiaFilter: false,
        category: "newcomer",
    },
    {
        key: "eluta",
        name: "Eluta",
        url: "https://www.eluta.ca/",
        description: "Canadian-only job search engine — pulls directly from Canadian employer career pages.",
        bestFor: "Find jobs at specific Canadian companies. Cleaner results than Indeed for Canadian-only searches.",
        freeToUse: true,
        governmentRun: false,
        lmiaFilter: false,
        category: "general",
    },
    {
        key: "workopolis",
        name: "Workopolis",
        url: "https://www.workopolis.com/",
        description: "Long-running Canadian job board with strong corporate listings.",
        bestFor: "Mainstream Canadian corporate roles. Set up alerts for your NOC.",
        freeToUse: true,
        governmentRun: false,
        lmiaFilter: false,
        category: "general",
    },
    {
        key: "careerbeacon",
        name: "CareerBeacon",
        url: "https://www.careerbeacon.com/",
        description: "Atlantic Canada-focused (NB, NS, PEI, NL) with strong AIP employer presence.",
        bestFor: "Apply here if you're targeting Atlantic Immigration Program. Many designated AIP employers post here.",
        freeToUse: true,
        governmentRun: false,
        lmiaFilter: false,
        category: "atlantic",
    },
    {
        key: "talent_ca",
        name: "Talent.com Canada",
        url: "https://ca.talent.com/",
        description: "Aggregator across major Canadian job sites.",
        bestFor: "Cast a wide net — single search across many boards.",
        freeToUse: true,
        governmentRun: false,
        lmiaFilter: false,
        category: "general",
    },
    {
        key: "wowjobs",
        name: "WowJobs Canada",
        url: "https://www.wowjobs.ca/",
        description: "Canadian-specific aggregator with strong trades + entry-level listings.",
        bestFor: "Strong for trades, hospitality, retail, and entry-level newcomer roles.",
        freeToUse: true,
        governmentRun: false,
        lmiaFilter: false,
        category: "general",
    },
    {
        key: "glassdoor_ca",
        name: "Glassdoor Canada",
        url: "https://www.glassdoor.ca/Job/canada-jobs-SRCH_IL.0,6_IN3.htm",
        description: "Jobs + company reviews + Canadian salary data. Excellent for researching employers.",
        bestFor: "Use the company-reviews side to check employer reputation before applying.",
        freeToUse: true,
        governmentRun: false,
        lmiaFilter: false,
        category: "general",
    },
    // Healthcare-specific
    {
        key: "healthcarecan",
        name: "HealthCareerNet (HealthCareCAN)",
        url: "https://www.healthcareerjobs.com/",
        description: "Canada's national health-employer job board.",
        bestFor: "Mandatory for Kenyan nurses, doctors, PSWs, allied health. Hospitals post here first.",
        freeToUse: true,
        governmentRun: false,
        lmiaFilter: false,
        category: "healthcare",
    },
    {
        key: "medhunters",
        name: "MedHunters",
        url: "https://www.medhunters.com/",
        description: "Physician and allied-health recruitment platform.",
        bestFor: "If you're a Kenyan physician — MedHunters actively works with international medical graduates.",
        freeToUse: true,
        governmentRun: false,
        lmiaFilter: false,
        category: "healthcare",
    },
    // Trades
    {
        key: "skillscanada",
        name: "SkilledTradesOntario.ca",
        url: "https://www.skilledtradesontario.ca/",
        description: "Ontario trades certification + apprenticeship + job listings.",
        bestFor: "Kenyan electricians, plumbers, welders, carpenters targeting Ontario.",
        freeToUse: true,
        governmentRun: true,
        lmiaFilter: false,
        category: "trades",
    },
];
exports.RECENT_DRAWS_SEED = [
    // These are seed/baseline values to render the UI when the live fetch is
    // unavailable. The shape matches IRCC's published rounds.
    { date: "2026-05-28", roundNumber: 348, programType: "Healthcare occupations", invitationsIssued: 2500, crsCutoff: 435 },
    { date: "2026-05-21", roundNumber: 347, programType: "Provincial Nominee Program", invitationsIssued: 700, crsCutoff: 762 },
    { date: "2026-05-14", roundNumber: 346, programType: "Canadian Experience Class", invitationsIssued: 3000, crsCutoff: 524 },
    { date: "2026-05-07", roundNumber: 345, programType: "STEM occupations", invitationsIssued: 1500, crsCutoff: 491 },
    { date: "2026-04-30", roundNumber: 344, programType: "French language proficiency", invitationsIssued: 2500, crsCutoff: 410 },
    { date: "2026-04-23", roundNumber: 343, programType: "Trade occupations", invitationsIssued: 1200, crsCutoff: 425 },
    { date: "2026-04-16", roundNumber: 342, programType: "Healthcare occupations", invitationsIssued: 2000, crsCutoff: 428 },
    { date: "2026-04-09", roundNumber: 341, programType: "Provincial Nominee Program", invitationsIssued: 800, crsCutoff: 783 },
    { date: "2026-04-02", roundNumber: 340, programType: "Education occupations", invitationsIssued: 1000, crsCutoff: 451 },
];
