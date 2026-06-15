"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Salary Intelligence content — what Kenyans can realistically earn in each
// destination country, by role.
//
// Numbers are 2026 ranges sourced from:
//   • Active NEA agency contract postings (visible to all members)
//   • Public salary surveys (Numbeo, payscale, gov.uk visa salary thresholds)
//   • Kenyan diaspora reports submitted via /api/success-stories
//
// "monthlyMin"/"monthlyMax" are GROSS amounts in the destination's local
// currency. "sendHomeMonthlyKes" is a conservative net-after-living-costs
// estimate of what a typical worker remits to Kenya — used to anchor the
// "after living costs you keep X" framing on the page.
//
// 2026-06: built as retention feature #2. Anchors users to specific salary
// aspirations by role + country, which drives daily return visits ("am I
// any closer to that UAE nurse salary yet?").
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.NAIROBI_BENCHMARK_KES = exports.SUPPORTED_SALARY_COUNTRIES = exports.SALARY_ROLES = void 0;
exports.getRoleByKey = getRoleByKey;
exports.getSalaryEntry = getSalaryEntry;
exports.compareRoleAcrossCountries = compareRoleAcrossCountries;
// FX (2026 approximate)
const FX = {
    AED: 35,
    SAR: 35,
    QAR: 36,
    BHD: 345,
    GBP: 165,
    CAD: 95,
    AUD: 85,
    EUR: 140,
    USD: 130,
};
exports.SALARY_ROLES = [
    // ─── HEALTHCARE ───────────────────────────────────────────────────────────
    {
        key: "nurse",
        label: "Registered Nurse",
        category: "healthcare",
        description: "BSc/Diploma nurses placed in hospitals, clinics, or care homes.",
        entries: [
            { countryCode: "AE", monthlyMin: 6000, monthlyMax: 15000, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 90000, experienceFor: "5+ yrs", vsKenyaMultiplier: 5, note: "Most Nairobi-trained nurses start at AED 6-8k. Major hospital chains (NMC, Mediclinic) pay best." },
            { countryCode: "SA", monthlyMin: 5000, monthlyMax: 12000, currency: "SAR", fxToKes: FX.SAR, sendHomeMonthlyKes: 80000, experienceFor: "3+ yrs", vsKenyaMultiplier: 4, note: "Ministry of Health hospitals are the most reliable employer." },
            { countryCode: "QA", monthlyMin: 5500, monthlyMax: 12000, currency: "QAR", fxToKes: FX.QAR, sendHomeMonthlyKes: 85000, experienceFor: "3+ yrs", vsKenyaMultiplier: 4, note: "Hamad Medical Corporation is the largest employer." },
            { countryCode: "BH", monthlyMin: 500, monthlyMax: 1200, currency: "BHD", fxToKes: FX.BHD, sendHomeMonthlyKes: 90000, experienceFor: "3+ yrs", vsKenyaMultiplier: 5, note: "Salmaniya Medical Complex is a common employer." },
            { countryCode: "GB", monthlyMin: 2400, monthlyMax: 3700, currency: "GBP", fxToKes: FX.GBP, sendHomeMonthlyKes: 160000, experienceFor: "5+ yrs", vsKenyaMultiplier: 12, note: "NHS Band 5 starts ~£29k/yr. OSCE exam required to register with NMC." },
            { countryCode: "CA", monthlyMin: 5500, monthlyMax: 8500, currency: "CAD", fxToKes: FX.CAD, sendHomeMonthlyKes: 220000, experienceFor: "5+ yrs", vsKenyaMultiplier: 14, note: "Provincial nursing exams (NCLEX-RN) required. Ontario, Alberta hire most." },
            { countryCode: "AU", monthlyMin: 5500, monthlyMax: 8500, currency: "AUD", fxToKes: FX.AUD, sendHomeMonthlyKes: 200000, experienceFor: "3+ yrs", vsKenyaMultiplier: 12, note: "AHPRA registration + English test (OET preferred)." },
            { countryCode: "DE", monthlyMin: 2500, monthlyMax: 3800, currency: "EUR", fxToKes: FX.EUR, sendHomeMonthlyKes: 140000, experienceFor: "3+ yrs", vsKenyaMultiplier: 10, note: "Recognition of Kenyan qualifications takes 3-4 months. B1 German required." },
            { countryCode: "US", monthlyMin: 5000, monthlyMax: 7500, currency: "USD", fxToKes: FX.USD, sendHomeMonthlyKes: 250000, experienceFor: "5+ yrs", vsKenyaMultiplier: 15, note: "EB-3 visa pathway — sponsor required. NCLEX-RN exam." },
        ],
    },
    {
        key: "care_worker",
        label: "Care Worker / Caregiver",
        category: "healthcare",
        description: "Care home, home-care, or hospital support roles. Lower barrier than nursing.",
        entries: [
            { countryCode: "AE", monthlyMin: 2500, monthlyMax: 4500, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 45000, experienceFor: "1-3 yrs", vsKenyaMultiplier: 3, note: "Hospital ward assistants, elderly home staff." },
            { countryCode: "SA", monthlyMin: 1800, monthlyMax: 3500, currency: "SAR", fxToKes: FX.SAR, sendHomeMonthlyKes: 40000, experienceFor: "1-3 yrs", vsKenyaMultiplier: 3 },
            { countryCode: "GB", monthlyMin: 1800, monthlyMax: 2400, currency: "GBP", fxToKes: FX.GBP, sendHomeMonthlyKes: 120000, experienceFor: "2+ yrs", vsKenyaMultiplier: 9, note: "Skilled Worker visa minimum is now £23,200/yr for care workers." },
            { countryCode: "CA", monthlyMin: 2700, monthlyMax: 4200, currency: "CAD", fxToKes: FX.CAD, sendHomeMonthlyKes: 150000, experienceFor: "2+ yrs", vsKenyaMultiplier: 10, note: "Home Child Care Provider Pilot is a popular pathway." },
            { countryCode: "AU", monthlyMin: 4000, monthlyMax: 5500, currency: "AUD", fxToKes: FX.AUD, sendHomeMonthlyKes: 160000, experienceFor: "2+ yrs", vsKenyaMultiplier: 10 },
            { countryCode: "DE", monthlyMin: 2200, monthlyMax: 3000, currency: "EUR", fxToKes: FX.EUR, sendHomeMonthlyKes: 110000, experienceFor: "2+ yrs", vsKenyaMultiplier: 8, note: "Ausbildung apprenticeship pathway available." },
        ],
    },
    // ─── HOSPITALITY ──────────────────────────────────────────────────────────
    {
        key: "hotel_staff",
        label: "Hotel Server / Receptionist / Housekeeper",
        category: "hospitality",
        description: "Front-of-house, food service, or housekeeping in hotels & restaurants.",
        entries: [
            { countryCode: "AE", monthlyMin: 2000, monthlyMax: 4000, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 40000, experienceFor: "Entry-Mid", vsKenyaMultiplier: 3, note: "Major chains (Marriott, Hilton) often add tips + service charge." },
            { countryCode: "SA", monthlyMin: 1500, monthlyMax: 3500, currency: "SAR", fxToKes: FX.SAR, sendHomeMonthlyKes: 35000, experienceFor: "Entry-Mid", vsKenyaMultiplier: 3 },
            { countryCode: "QA", monthlyMin: 1800, monthlyMax: 4000, currency: "QAR", fxToKes: FX.QAR, sendHomeMonthlyKes: 45000, experienceFor: "Entry-Mid", vsKenyaMultiplier: 3 },
            { countryCode: "BH", monthlyMin: 180, monthlyMax: 450, currency: "BHD", fxToKes: FX.BHD, sendHomeMonthlyKes: 60000, experienceFor: "Entry-Mid", vsKenyaMultiplier: 4 },
            { countryCode: "GB", monthlyMin: 1900, monthlyMax: 2800, currency: "GBP", fxToKes: FX.GBP, sendHomeMonthlyKes: 110000, experienceFor: "1-3 yrs", vsKenyaMultiplier: 8, note: "Skilled Worker visa for hospitality manager roles needs £30k+." },
            { countryCode: "CA", monthlyMin: 2800, monthlyMax: 4500, currency: "CAD", fxToKes: FX.CAD, sendHomeMonthlyKes: 130000, experienceFor: "1-3 yrs", vsKenyaMultiplier: 9 },
        ],
    },
    {
        key: "chef_cook",
        label: "Chef / Cook",
        category: "hospitality",
        description: "Restaurant or hotel kitchen roles. Higher pay with culinary diploma.",
        entries: [
            { countryCode: "AE", monthlyMin: 3000, monthlyMax: 7000, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 55000, experienceFor: "3+ yrs", vsKenyaMultiplier: 4 },
            { countryCode: "SA", monthlyMin: 2500, monthlyMax: 6000, currency: "SAR", fxToKes: FX.SAR, sendHomeMonthlyKes: 50000, experienceFor: "3+ yrs", vsKenyaMultiplier: 4 },
            { countryCode: "GB", monthlyMin: 2400, monthlyMax: 3800, currency: "GBP", fxToKes: FX.GBP, sendHomeMonthlyKes: 140000, experienceFor: "5+ yrs", vsKenyaMultiplier: 10 },
            { countryCode: "CA", monthlyMin: 3500, monthlyMax: 5500, currency: "CAD", fxToKes: FX.CAD, sendHomeMonthlyKes: 150000, experienceFor: "3+ yrs", vsKenyaMultiplier: 11 },
            { countryCode: "AU", monthlyMin: 4200, monthlyMax: 6500, currency: "AUD", fxToKes: FX.AUD, sendHomeMonthlyKes: 160000, experienceFor: "3+ yrs", vsKenyaMultiplier: 10 },
        ],
    },
    // ─── CONSTRUCTION ─────────────────────────────────────────────────────────
    {
        key: "construction_skilled",
        label: "Mason / Plumber / Electrician / Carpenter",
        category: "construction",
        description: "Skilled-trade roles with a Kenyan technical certificate.",
        entries: [
            { countryCode: "AE", monthlyMin: 2500, monthlyMax: 5500, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 50000, experienceFor: "3+ yrs", vsKenyaMultiplier: 4, note: "Major contractors (Arabtec, ALEC) pay best." },
            { countryCode: "SA", monthlyMin: 2000, monthlyMax: 4500, currency: "SAR", fxToKes: FX.SAR, sendHomeMonthlyKes: 45000, experienceFor: "3+ yrs", vsKenyaMultiplier: 4, note: "Vision 2030 mega-projects (NEOM, Red Sea) actively hire." },
            { countryCode: "QA", monthlyMin: 2200, monthlyMax: 5000, currency: "QAR", fxToKes: FX.QAR, sendHomeMonthlyKes: 55000, experienceFor: "3+ yrs", vsKenyaMultiplier: 4 },
            { countryCode: "CA", monthlyMin: 4500, monthlyMax: 7500, currency: "CAD", fxToKes: FX.CAD, sendHomeMonthlyKes: 180000, experienceFor: "5+ yrs", vsKenyaMultiplier: 14, note: "Provincial trade certification (Red Seal) recommended." },
            { countryCode: "AU", monthlyMin: 5500, monthlyMax: 9000, currency: "AUD", fxToKes: FX.AUD, sendHomeMonthlyKes: 200000, experienceFor: "5+ yrs", vsKenyaMultiplier: 14, note: "TRA skills assessment required." },
        ],
    },
    {
        key: "construction_laborer",
        label: "Construction Labourer",
        category: "construction",
        description: "General-purpose site labour — lower barrier to entry.",
        entries: [
            { countryCode: "AE", monthlyMin: 1500, monthlyMax: 2500, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 30000, experienceFor: "Entry", vsKenyaMultiplier: 2 },
            { countryCode: "SA", monthlyMin: 1500, monthlyMax: 2800, currency: "SAR", fxToKes: FX.SAR, sendHomeMonthlyKes: 35000, experienceFor: "Entry", vsKenyaMultiplier: 3 },
            { countryCode: "QA", monthlyMin: 1500, monthlyMax: 2800, currency: "QAR", fxToKes: FX.QAR, sendHomeMonthlyKes: 35000, experienceFor: "Entry", vsKenyaMultiplier: 3 },
        ],
    },
    // ─── TRANSPORT ────────────────────────────────────────────────────────────
    {
        key: "driver",
        label: "Truck Driver / Heavy-Duty Driver",
        category: "transport",
        description: "Long-haul truck, container, or fleet driving. Valid heavy-duty licence required.",
        entries: [
            { countryCode: "AE", monthlyMin: 2500, monthlyMax: 4500, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 45000, experienceFor: "3+ yrs", vsKenyaMultiplier: 3, note: "RTA licence test required on arrival." },
            { countryCode: "SA", monthlyMin: 3000, monthlyMax: 5500, currency: "SAR", fxToKes: FX.SAR, sendHomeMonthlyKes: 60000, experienceFor: "3+ yrs", vsKenyaMultiplier: 4, note: "Saudi heavy-licence conversion is straightforward for Kenyans." },
            { countryCode: "QA", monthlyMin: 2800, monthlyMax: 5000, currency: "QAR", fxToKes: FX.QAR, sendHomeMonthlyKes: 55000, experienceFor: "3+ yrs", vsKenyaMultiplier: 4 },
            { countryCode: "CA", monthlyMin: 4500, monthlyMax: 7500, currency: "CAD", fxToKes: FX.CAD, sendHomeMonthlyKes: 170000, experienceFor: "5+ yrs", vsKenyaMultiplier: 13, note: "EB-3 / LMIA pathway. Class 1 licence + clean driving record." },
            { countryCode: "US", monthlyMin: 3500, monthlyMax: 6000, currency: "USD", fxToKes: FX.USD, sendHomeMonthlyKes: 220000, experienceFor: "5+ yrs", vsKenyaMultiplier: 15, note: "EB-3 truck driver visa — long wait but high pay-off." },
        ],
    },
    // ─── DOMESTIC ─────────────────────────────────────────────────────────────
    {
        key: "domestic_worker",
        label: "Housekeeper / Nanny / Domestic Worker",
        category: "domestic",
        description: "Live-in or live-out home worker. Most common Saudi/Gulf entry pathway.",
        entries: [
            { countryCode: "SA", monthlyMin: 1500, monthlyMax: 2500, currency: "SAR", fxToKes: FX.SAR, sendHomeMonthlyKes: 50000, experienceFor: "Entry", vsKenyaMultiplier: 3, note: "Via Musaned platform. Contract MUST be bilingual." },
            { countryCode: "QA", monthlyMin: 1500, monthlyMax: 2200, currency: "QAR", fxToKes: FX.QAR, sendHomeMonthlyKes: 45000, experienceFor: "Entry", vsKenyaMultiplier: 3 },
            { countryCode: "BH", monthlyMin: 100, monthlyMax: 180, currency: "BHD", fxToKes: FX.BHD, sendHomeMonthlyKes: 35000, experienceFor: "Entry", vsKenyaMultiplier: 2 },
            { countryCode: "AE", monthlyMin: 1500, monthlyMax: 3000, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 35000, experienceFor: "Entry", vsKenyaMultiplier: 2, note: "Tadbeer centres are the only legal route — vet your sponsor." },
        ],
    },
    // ─── SKILLED / WHITE COLLAR ───────────────────────────────────────────────
    {
        key: "software_developer",
        label: "Software Developer / IT Professional",
        category: "skilled",
        description: "Backend, frontend, mobile, DevOps, cybersecurity, data engineering.",
        entries: [
            { countryCode: "AE", monthlyMin: 12000, monthlyMax: 25000, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 150000, experienceFor: "3-5 yrs", vsKenyaMultiplier: 4, note: "Dubai Internet City has the highest concentration of tech employers." },
            { countryCode: "GB", monthlyMin: 3500, monthlyMax: 7500, currency: "GBP", fxToKes: FX.GBP, sendHomeMonthlyKes: 200000, experienceFor: "3-5 yrs", vsKenyaMultiplier: 7, note: "Skilled Worker visa easy if you have CS degree + 3 yrs experience." },
            { countryCode: "CA", monthlyMin: 5500, monthlyMax: 11000, currency: "CAD", fxToKes: FX.CAD, sendHomeMonthlyKes: 200000, experienceFor: "3-5 yrs", vsKenyaMultiplier: 7, note: "Express Entry strong — high CRS score from CS degree." },
            { countryCode: "AU", monthlyMin: 6500, monthlyMax: 12000, currency: "AUD", fxToKes: FX.AUD, sendHomeMonthlyKes: 220000, experienceFor: "3-5 yrs", vsKenyaMultiplier: 8 },
            { countryCode: "DE", monthlyMin: 3750, monthlyMax: 7500, currency: "EUR", fxToKes: FX.EUR, sendHomeMonthlyKes: 200000, experienceFor: "3-5 yrs", vsKenyaMultiplier: 7, note: "EU Blue Card threshold €45,300/yr in 2026." },
            { countryCode: "US", monthlyMin: 7000, monthlyMax: 12500, currency: "USD", fxToKes: FX.USD, sendHomeMonthlyKes: 350000, experienceFor: "3-5 yrs", vsKenyaMultiplier: 9, note: "H-1B lottery in March. Big Tech sponsors most reliably." },
        ],
    },
    {
        key: "accountant",
        label: "Accountant / Auditor",
        category: "skilled",
        description: "CPA / ACCA / CA-qualified accountants. Audit, tax, or industry roles.",
        entries: [
            { countryCode: "AE", monthlyMin: 7000, monthlyMax: 18000, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 110000, experienceFor: "3-5 yrs", vsKenyaMultiplier: 4 },
            { countryCode: "SA", monthlyMin: 6000, monthlyMax: 15000, currency: "SAR", fxToKes: FX.SAR, sendHomeMonthlyKes: 90000, experienceFor: "3-5 yrs", vsKenyaMultiplier: 4 },
            { countryCode: "GB", monthlyMin: 2800, monthlyMax: 5500, currency: "GBP", fxToKes: FX.GBP, sendHomeMonthlyKes: 160000, experienceFor: "3-5 yrs", vsKenyaMultiplier: 6 },
            { countryCode: "CA", monthlyMin: 4500, monthlyMax: 8500, currency: "CAD", fxToKes: FX.CAD, sendHomeMonthlyKes: 170000, experienceFor: "3-5 yrs", vsKenyaMultiplier: 6 },
        ],
    },
    // ─── EDUCATION ────────────────────────────────────────────────────────────
    {
        key: "teacher",
        label: "Teacher (Primary / Secondary)",
        category: "education",
        description: "Subject teachers, TEFL, or special-needs roles. PGDE/B.Ed required.",
        entries: [
            { countryCode: "AE", monthlyMin: 8000, monthlyMax: 18000, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 130000, experienceFor: "3+ yrs", vsKenyaMultiplier: 5, note: "British/American/IB schools pay best. KHDA-approved schools only." },
            { countryCode: "SA", monthlyMin: 7000, monthlyMax: 15000, currency: "SAR", fxToKes: FX.SAR, sendHomeMonthlyKes: 110000, experienceFor: "3+ yrs", vsKenyaMultiplier: 5 },
            { countryCode: "GB", monthlyMin: 2400, monthlyMax: 4200, currency: "GBP", fxToKes: FX.GBP, sendHomeMonthlyKes: 140000, experienceFor: "3+ yrs", vsKenyaMultiplier: 6, note: "QTS (Qualified Teacher Status) needed. Maths/Science shortage subjects." },
        ],
    },
    // ─── CASUAL / ENTRY ──────────────────────────────────────────────────────
    {
        key: "warehouse_worker",
        label: "Warehouse / Picker / Packer",
        category: "casual",
        description: "Logistics, e-commerce fulfilment, factory work. Entry-level.",
        entries: [
            { countryCode: "AE", monthlyMin: 1800, monthlyMax: 3000, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 35000, experienceFor: "Entry", vsKenyaMultiplier: 2 },
            { countryCode: "CA", monthlyMin: 2800, monthlyMax: 4200, currency: "CAD", fxToKes: FX.CAD, sendHomeMonthlyKes: 110000, experienceFor: "Entry", vsKenyaMultiplier: 9 },
            { countryCode: "GB", monthlyMin: 1900, monthlyMax: 2600, currency: "GBP", fxToKes: FX.GBP, sendHomeMonthlyKes: 100000, experienceFor: "Entry", vsKenyaMultiplier: 8 },
        ],
    },
    {
        key: "security_guard",
        label: "Security Guard",
        category: "casual",
        description: "Hotels, malls, corporate buildings. Local certification often provided on arrival.",
        entries: [
            { countryCode: "AE", monthlyMin: 2000, monthlyMax: 3500, currency: "AED", fxToKes: FX.AED, sendHomeMonthlyKes: 40000, experienceFor: "1-3 yrs", vsKenyaMultiplier: 3 },
            { countryCode: "SA", monthlyMin: 1800, monthlyMax: 3000, currency: "SAR", fxToKes: FX.SAR, sendHomeMonthlyKes: 35000, experienceFor: "1-3 yrs", vsKenyaMultiplier: 3 },
            { countryCode: "QA", monthlyMin: 2000, monthlyMax: 3500, currency: "QAR", fxToKes: FX.QAR, sendHomeMonthlyKes: 45000, experienceFor: "1-3 yrs", vsKenyaMultiplier: 3 },
        ],
    },
];
exports.SUPPORTED_SALARY_COUNTRIES = [
    { code: "AE", name: "UAE", flag: "🇦🇪" },
    { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
    { code: "QA", name: "Qatar", flag: "🇶🇦" },
    { code: "BH", name: "Bahrain", flag: "🇧🇭" },
    { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
    { code: "CA", name: "Canada", flag: "🇨🇦" },
    { code: "AU", name: "Australia", flag: "🇦🇺" },
    { code: "DE", name: "Germany", flag: "🇩🇪" },
    { code: "US", name: "USA", flag: "🇺🇸" },
];
// Reference Nairobi salary for the "vs Kenya" comparison anchor.
// These are typical mid-career gross monthly KES amounts as of 2026.
exports.NAIROBI_BENCHMARK_KES = {
    nurse: 90000,
    care_worker: 40000,
    hotel_staff: 35000,
    chef_cook: 55000,
    construction_skilled: 55000,
    construction_laborer: 25000,
    driver: 50000,
    domestic_worker: 20000,
    software_developer: 180000,
    accountant: 120000,
    teacher: 65000,
    warehouse_worker: 30000,
    security_guard: 28000,
};
function getRoleByKey(key) {
    return exports.SALARY_ROLES.find((r) => r.key === key);
}
/**
 * Look up the salary entry for a specific (role, country) pair.
 */
function getSalaryEntry(roleKey, countryCode) {
    const role = getRoleByKey(roleKey);
    if (!role)
        return undefined;
    return role.entries.find((e) => e.countryCode === countryCode.toUpperCase());
}
/**
 * For a role, return its salary across every country sorted highest-to-lowest
 * by KES-equivalent midpoint. Drives the comparison view.
 */
function compareRoleAcrossCountries(roleKey) {
    const role = getRoleByKey(roleKey);
    if (!role)
        return [];
    return role.entries
        .map((e) => {
        const countryMeta = exports.SUPPORTED_SALARY_COUNTRIES.find((c) => c.code === e.countryCode);
        const monthlyMinKes = Math.round(e.monthlyMin * e.fxToKes);
        const monthlyMaxKes = Math.round(e.monthlyMax * e.fxToKes);
        const monthlyMidKes = Math.round((monthlyMinKes + monthlyMaxKes) / 2);
        return {
            ...e,
            countryName: countryMeta?.name ?? e.countryCode,
            countryFlag: countryMeta?.flag ?? "🌍",
            monthlyMinKes,
            monthlyMaxKes,
            monthlyMidKes,
        };
    })
        .sort((a, b) => b.monthlyMidKes - a.monthlyMidKes);
}
