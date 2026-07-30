/**
 * salary-benchmarks.ts — realistic salary bands per country + occupation.
 *
 * Sources cross-checked 2026-07 against:
 *   - Numbeo cost-of-living / salary indexes
 *   - Kenya MFA overseas-jobs desk pay ranges (2026 update)
 *   - Country labour ministry minimum wage publications
 *   - GCC standard employment contract salary caps
 *
 * All values are MONTHLY GROSS in the destination country's local currency,
 * converted to a normalised KES-equivalent band for consistent scoring.
 *
 * The analyzer uses this to answer three questions:
 *   1. Is the offered salary within a plausible range for the role/country?
 *   2. Is it suspiciously HIGH (classic "too good to be true" scam)?
 *   3. Is it suspiciously LOW (exploitation / wage theft indicator)?
 */

export interface SalaryBand {
  /** Occupation family this band covers. */
  occupationKey: string;
  /** Human-readable label shown to users. */
  label: string;
  /** Realistic monthly gross band in local currency. */
  localMonthlyMin: number;
  localMonthlyMax: number;
  /** Currency code (ISO 4217) for the min/max above. */
  currency: string;
  /** Rough KES-equivalent band (2026 mid-year rates) for cross-country compare. */
  kesMonthlyMin: number;
  kesMonthlyMax: number;
  /** Notes shown in the analyzer's finding when this band matches. */
  note?: string;
}

export interface CountrySalaryTable {
  countryCode: string;   // ISO alpha-2
  countryName: string;
  bands: SalaryBand[];
}

// Rough FX rates used in the source data (2026 mid-year, approximate):
// 1 USD ≈ 130 KES · 1 GBP ≈ 165 KES · 1 EUR ≈ 145 KES · 1 AED ≈ 35 KES
// 1 SAR ≈ 35 KES · 1 QAR ≈ 36 KES · 1 CAD ≈ 96 KES · 1 AUD ≈ 87 KES

// Common occupation families we recognize from the extracted job title.
// The analyzer maps free-text job titles to these keys via keyword matching.
export const OCCUPATION_KEYS = [
  "domestic_worker",
  "care_worker",
  "nurse",
  "driver",
  "security_guard",
  "cleaner_janitor",
  "hospitality_waiter",
  "hospitality_chef",
  "hospitality_manager",
  "construction_labourer",
  "construction_skilled",
  "warehouse_operative",
  "farm_worker",
  "office_admin",
  "sales",
  "it_professional",
  "engineer",
  "teacher",
  "medical_technician",
  "unskilled_general",
  "skilled_general",
] as const;
export type OccupationKey = typeof OCCUPATION_KEYS[number];

// ═══════════════════════════════════════════════════════════════════════
// PER-COUNTRY SALARY TABLES
// ═══════════════════════════════════════════════════════════════════════

export const SALARY_TABLES: CountrySalaryTable[] = [
  // ─── GULF ────────────────────────────────────────────────────────────
  {
    countryCode: "AE",
    countryName: "United Arab Emirates",
    bands: [
      { occupationKey: "domestic_worker",    label: "Domestic worker (housemaid, nanny)", localMonthlyMin: 1200, localMonthlyMax: 2000,  currency: "AED", kesMonthlyMin: 42000,  kesMonthlyMax: 70000,  note: "MOHRE standard domestic worker contract range."},
      { occupationKey: "care_worker",        label: "Care worker (elderly / home care)",  localMonthlyMin: 1800, localMonthlyMax: 3500,  currency: "AED", kesMonthlyMin: 63000,  kesMonthlyMax: 122000 },
      { occupationKey: "nurse",              label: "Nurse (DHA/HAAD licensed)",          localMonthlyMin: 5000, localMonthlyMax: 12000, currency: "AED", kesMonthlyMin: 175000, kesMonthlyMax: 420000, note: "Requires DHA, HAAD or MOH license." },
      { occupationKey: "driver",             label: "Driver (LMV licence)",                localMonthlyMin: 2000, localMonthlyMax: 3500,  currency: "AED", kesMonthlyMin: 70000,  kesMonthlyMax: 122000 },
      { occupationKey: "security_guard",     label: "Security guard (SIRA licensed)",      localMonthlyMin: 1800, localMonthlyMax: 2800,  currency: "AED", kesMonthlyMin: 63000,  kesMonthlyMax: 98000 },
      { occupationKey: "cleaner_janitor",    label: "Cleaner / janitor",                   localMonthlyMin: 1000, localMonthlyMax: 1800,  currency: "AED", kesMonthlyMin: 35000,  kesMonthlyMax: 63000 },
      { occupationKey: "hospitality_waiter", label: "Waiter / F&B server",                 localMonthlyMin: 1500, localMonthlyMax: 3000,  currency: "AED", kesMonthlyMin: 52000,  kesMonthlyMax: 105000 },
      { occupationKey: "hospitality_chef",   label: "Chef / cook",                         localMonthlyMin: 3000, localMonthlyMax: 8000,  currency: "AED", kesMonthlyMin: 105000, kesMonthlyMax: 280000 },
      { occupationKey: "construction_labourer", label: "Construction labourer",           localMonthlyMin: 1200, localMonthlyMax: 2200,  currency: "AED", kesMonthlyMin: 42000,  kesMonthlyMax: 77000 },
      { occupationKey: "warehouse_operative", label: "Warehouse operative",                localMonthlyMin: 1800, localMonthlyMax: 3200,  currency: "AED", kesMonthlyMin: 63000,  kesMonthlyMax: 112000 },
      { occupationKey: "office_admin",       label: "Office admin / secretary",            localMonthlyMin: 3000, localMonthlyMax: 7000,  currency: "AED", kesMonthlyMin: 105000, kesMonthlyMax: 245000 },
      { occupationKey: "it_professional",    label: "IT professional",                     localMonthlyMin: 6000, localMonthlyMax: 20000, currency: "AED", kesMonthlyMin: 210000, kesMonthlyMax: 700000 },
      { occupationKey: "unskilled_general",  label: "Unskilled general worker",            localMonthlyMin: 900,  localMonthlyMax: 1600,  currency: "AED", kesMonthlyMin: 31000,  kesMonthlyMax: 56000 },
    ],
  },
  {
    countryCode: "SA",
    countryName: "Saudi Arabia",
    bands: [
      { occupationKey: "domestic_worker",    label: "Domestic worker",                     localMonthlyMin: 1000, localMonthlyMax: 1800,  currency: "SAR", kesMonthlyMin: 35000,  kesMonthlyMax: 63000, note: "Musaned standard contract range." },
      { occupationKey: "nurse",              label: "Nurse (SCFHS certified)",             localMonthlyMin: 4000, localMonthlyMax: 12000, currency: "SAR", kesMonthlyMin: 140000, kesMonthlyMax: 420000 },
      { occupationKey: "driver",             label: "Driver",                              localMonthlyMin: 1500, localMonthlyMax: 3000,  currency: "SAR", kesMonthlyMin: 52000,  kesMonthlyMax: 105000 },
      { occupationKey: "security_guard",     label: "Security guard",                      localMonthlyMin: 1500, localMonthlyMax: 2500,  currency: "SAR", kesMonthlyMin: 52000,  kesMonthlyMax: 87000 },
      { occupationKey: "construction_labourer", label: "Construction labourer",           localMonthlyMin: 1200, localMonthlyMax: 2200,  currency: "SAR", kesMonthlyMin: 42000,  kesMonthlyMax: 77000 },
      { occupationKey: "hospitality_waiter", label: "Waiter / F&B",                        localMonthlyMin: 1500, localMonthlyMax: 3000,  currency: "SAR", kesMonthlyMin: 52000,  kesMonthlyMax: 105000 },
      { occupationKey: "unskilled_general",  label: "Unskilled general worker",            localMonthlyMin: 900,  localMonthlyMax: 1500,  currency: "SAR", kesMonthlyMin: 31000,  kesMonthlyMax: 52000 },
    ],
  },
  {
    countryCode: "QA",
    countryName: "Qatar",
    bands: [
      { occupationKey: "domestic_worker",    label: "Domestic worker",                     localMonthlyMin: 1200, localMonthlyMax: 2000,  currency: "QAR", kesMonthlyMin: 43000,  kesMonthlyMax: 72000, note: "Qatar minimum wage law: 1000 QAR + housing + food allowance." },
      { occupationKey: "nurse",              label: "Nurse",                               localMonthlyMin: 5000, localMonthlyMax: 12000, currency: "QAR", kesMonthlyMin: 180000, kesMonthlyMax: 432000 },
      { occupationKey: "driver",             label: "Driver",                              localMonthlyMin: 2000, localMonthlyMax: 3500,  currency: "QAR", kesMonthlyMin: 72000,  kesMonthlyMax: 126000 },
      { occupationKey: "hospitality_waiter", label: "Waiter / F&B",                        localMonthlyMin: 1800, localMonthlyMax: 3500,  currency: "QAR", kesMonthlyMin: 65000,  kesMonthlyMax: 126000 },
      { occupationKey: "construction_labourer", label: "Construction labourer",           localMonthlyMin: 1500, localMonthlyMax: 2500,  currency: "QAR", kesMonthlyMin: 54000,  kesMonthlyMax: 90000 },
      { occupationKey: "unskilled_general",  label: "Unskilled general worker",            localMonthlyMin: 1000, localMonthlyMax: 1800,  currency: "QAR", kesMonthlyMin: 36000,  kesMonthlyMax: 65000 },
    ],
  },
  {
    countryCode: "OM",
    countryName: "Oman",
    bands: [
      { occupationKey: "domestic_worker",    label: "Domestic worker",                     localMonthlyMin: 100,  localMonthlyMax: 180,   currency: "OMR", kesMonthlyMin: 34000,  kesMonthlyMax: 61000 },
      { occupationKey: "nurse",              label: "Nurse",                               localMonthlyMin: 500,  localMonthlyMax: 1200,  currency: "OMR", kesMonthlyMin: 170000, kesMonthlyMax: 408000 },
      { occupationKey: "hospitality_waiter", label: "Waiter / F&B",                        localMonthlyMin: 150,  localMonthlyMax: 300,   currency: "OMR", kesMonthlyMin: 51000,  kesMonthlyMax: 102000 },
      { occupationKey: "unskilled_general",  label: "Unskilled general worker",            localMonthlyMin: 90,   localMonthlyMax: 160,   currency: "OMR", kesMonthlyMin: 30000,  kesMonthlyMax: 54000 },
    ],
  },
  {
    countryCode: "KW",
    countryName: "Kuwait",
    bands: [
      { occupationKey: "domestic_worker",    label: "Domestic worker",                     localMonthlyMin: 90,   localMonthlyMax: 150,   currency: "KWD", kesMonthlyMin: 38000,  kesMonthlyMax: 63000, note: "Kuwait minimum: 60 KWD (~KES 25k)." },
      { occupationKey: "nurse",              label: "Nurse",                               localMonthlyMin: 400,  localMonthlyMax: 900,   currency: "KWD", kesMonthlyMin: 168000, kesMonthlyMax: 378000 },
      { occupationKey: "unskilled_general",  label: "Unskilled general worker",            localMonthlyMin: 75,   localMonthlyMax: 130,   currency: "KWD", kesMonthlyMin: 31000,  kesMonthlyMax: 54000 },
    ],
  },
  {
    countryCode: "BH",
    countryName: "Bahrain",
    bands: [
      { occupationKey: "domestic_worker",    label: "Domestic worker",                     localMonthlyMin: 120,  localMonthlyMax: 200,   currency: "BHD", kesMonthlyMin: 41000,  kesMonthlyMax: 69000 },
      { occupationKey: "nurse",              label: "Nurse",                               localMonthlyMin: 500,  localMonthlyMax: 1000,  currency: "BHD", kesMonthlyMin: 172000, kesMonthlyMax: 344000 },
      { occupationKey: "unskilled_general",  label: "Unskilled general worker",            localMonthlyMin: 100,  localMonthlyMax: 180,   currency: "BHD", kesMonthlyMin: 34000,  kesMonthlyMax: 62000 },
    ],
  },

  // ─── COMMONWEALTH + WESTERN ──────────────────────────────────────────
  {
    countryCode: "GB",
    countryName: "United Kingdom",
    bands: [
      { occupationKey: "care_worker",        label: "Care worker (Skilled Worker visa)",  localMonthlyMin: 1900, localMonthlyMax: 2600,  currency: "GBP", kesMonthlyMin: 313000, kesMonthlyMax: 429000, note: "UK 2026 care worker minimum salary: £23,200/year (£1,933/mo)." },
      { occupationKey: "nurse",              label: "Registered Nurse (NMC)",              localMonthlyMin: 2400, localMonthlyMax: 4200,  currency: "GBP", kesMonthlyMin: 396000, kesMonthlyMax: 693000, note: "NHS Band 5 starting ≈ £28,000." },
      { occupationKey: "hospitality_chef",   label: "Chef",                                localMonthlyMin: 2200, localMonthlyMax: 3500,  currency: "GBP", kesMonthlyMin: 363000, kesMonthlyMax: 577000 },
      { occupationKey: "driver",             label: "HGV / LGV driver",                    localMonthlyMin: 2600, localMonthlyMax: 3800,  currency: "GBP", kesMonthlyMin: 429000, kesMonthlyMax: 627000, note: "HGV shortage occupation — sponsored." },
      { occupationKey: "warehouse_operative", label: "Warehouse operative",                localMonthlyMin: 1900, localMonthlyMax: 2400,  currency: "GBP", kesMonthlyMin: 313000, kesMonthlyMax: 396000 },
      { occupationKey: "it_professional",    label: "IT professional",                     localMonthlyMin: 3500, localMonthlyMax: 6500,  currency: "GBP", kesMonthlyMin: 577000, kesMonthlyMax: 1072000 },
      { occupationKey: "unskilled_general",  label: "Unskilled general (minimum wage)",    localMonthlyMin: 1750, localMonthlyMax: 2000,  currency: "GBP", kesMonthlyMin: 288000, kesMonthlyMax: 330000, note: "UK 2026 minimum wage: £11.44/hr." },
    ],
  },
  {
    countryCode: "CA",
    countryName: "Canada",
    bands: [
      { occupationKey: "care_worker",        label: "Home Support Worker (NOC 44101)",     localMonthlyMin: 2600, localMonthlyMax: 3800,  currency: "CAD", kesMonthlyMin: 250000, kesMonthlyMax: 365000 },
      { occupationKey: "nurse",              label: "Registered Nurse",                    localMonthlyMin: 4800, localMonthlyMax: 8500,  currency: "CAD", kesMonthlyMin: 461000, kesMonthlyMax: 816000 },
      { occupationKey: "driver",             label: "Long-haul truck driver",              localMonthlyMin: 4500, localMonthlyMax: 6500,  currency: "CAD", kesMonthlyMin: 432000, kesMonthlyMax: 624000 },
      { occupationKey: "farm_worker",        label: "Farm worker (SAWP)",                  localMonthlyMin: 2400, localMonthlyMax: 3200,  currency: "CAD", kesMonthlyMin: 230000, kesMonthlyMax: 307000 },
      { occupationKey: "hospitality_chef",   label: "Cook / chef",                         localMonthlyMin: 2800, localMonthlyMax: 4500,  currency: "CAD", kesMonthlyMin: 269000, kesMonthlyMax: 432000 },
      { occupationKey: "it_professional",    label: "IT professional",                     localMonthlyMin: 5500, localMonthlyMax: 10500, currency: "CAD", kesMonthlyMin: 528000, kesMonthlyMax: 1008000 },
    ],
  },
  {
    countryCode: "US",
    countryName: "United States",
    bands: [
      { occupationKey: "nurse",              label: "Registered Nurse",                    localMonthlyMin: 4800, localMonthlyMax: 8500,  currency: "USD", kesMonthlyMin: 624000, kesMonthlyMax: 1105000 },
      { occupationKey: "farm_worker",        label: "H-2A seasonal farm worker",           localMonthlyMin: 1800, localMonthlyMax: 2800,  currency: "USD", kesMonthlyMin: 234000, kesMonthlyMax: 364000 },
      { occupationKey: "it_professional",    label: "IT professional (H-1B)",              localMonthlyMin: 6500, localMonthlyMax: 15000, currency: "USD", kesMonthlyMin: 845000, kesMonthlyMax: 1950000 },
    ],
  },
  {
    countryCode: "DE",
    countryName: "Germany",
    bands: [
      { occupationKey: "care_worker",        label: "Care worker (Pflegekraft)",           localMonthlyMin: 2500, localMonthlyMax: 3500,  currency: "EUR", kesMonthlyMin: 362000, kesMonthlyMax: 507000 },
      { occupationKey: "nurse",              label: "Registered Nurse",                    localMonthlyMin: 3000, localMonthlyMax: 4500,  currency: "EUR", kesMonthlyMin: 435000, kesMonthlyMax: 652000 },
      { occupationKey: "engineer",           label: "Engineer (Blue Card threshold)",      localMonthlyMin: 4500, localMonthlyMax: 8500,  currency: "EUR", kesMonthlyMin: 652000, kesMonthlyMax: 1232000, note: "EU Blue Card minimum: €45,300/year (2026)." },
      { occupationKey: "it_professional",    label: "IT professional (Blue Card)",         localMonthlyMin: 4500, localMonthlyMax: 8500,  currency: "EUR", kesMonthlyMin: 652000, kesMonthlyMax: 1232000 },
    ],
  },
  {
    countryCode: "PL",
    countryName: "Poland",
    bands: [
      { occupationKey: "warehouse_operative", label: "Warehouse operative",                localMonthlyMin: 4500, localMonthlyMax: 6500,  currency: "PLN", kesMonthlyMin: 143000, kesMonthlyMax: 207000 },
      { occupationKey: "construction_labourer", label: "Construction labourer",           localMonthlyMin: 5000, localMonthlyMax: 7500,  currency: "PLN", kesMonthlyMin: 159000, kesMonthlyMax: 238000 },
      { occupationKey: "care_worker",        label: "Care worker",                         localMonthlyMin: 4500, localMonthlyMax: 6000,  currency: "PLN", kesMonthlyMin: 143000, kesMonthlyMax: 191000 },
    ],
  },
  {
    countryCode: "AU",
    countryName: "Australia",
    bands: [
      { occupationKey: "care_worker",        label: "Aged care worker",                    localMonthlyMin: 4500, localMonthlyMax: 5800,  currency: "AUD", kesMonthlyMin: 391000, kesMonthlyMax: 505000 },
      { occupationKey: "nurse",              label: "Registered Nurse",                    localMonthlyMin: 5500, localMonthlyMax: 9500,  currency: "AUD", kesMonthlyMin: 479000, kesMonthlyMax: 827000 },
      { occupationKey: "farm_worker",        label: "Farm worker (WHV)",                   localMonthlyMin: 4000, localMonthlyMax: 5500,  currency: "AUD", kesMonthlyMin: 348000, kesMonthlyMax: 479000 },
    ],
  },
  {
    countryCode: "TR",
    countryName: "Turkey",
    bands: [
      { occupationKey: "hospitality_waiter", label: "Hospitality staff",                   localMonthlyMin: 15000, localMonthlyMax: 25000, currency: "TRY", kesMonthlyMin: 55000,  kesMonthlyMax: 92000 },
      { occupationKey: "unskilled_general",  label: "Unskilled general worker (minimum)",  localMonthlyMin: 17000, localMonthlyMax: 22000, currency: "TRY", kesMonthlyMin: 63000,  kesMonthlyMax: 81000, note: "Turkey 2026 minimum wage: 17,002 TRY/month." },
    ],
  },
];

/**
 * Find the salary table for a given ISO country code.
 */
export function getSalaryTable(countryCode: string): CountrySalaryTable | null {
  if (!countryCode) return null;
  return SALARY_TABLES.find((t) => t.countryCode === countryCode.toUpperCase()) ?? null;
}

/**
 * Map a free-text job title to one of our occupation keys via keyword match.
 * Returns null when nothing matches — analyzer treats that as "unable to
 * benchmark" (info finding, doesn't affect score).
 */
export function classifyJobTitle(jobTitle: string): OccupationKey | null {
  if (!jobTitle) return null;
  const t = jobTitle.toLowerCase();
  if (/nurse|nursing|rn\b/.test(t)) return "nurse";
  if (/care\s?(giver|worker|assistant|aide)|carer|senior\s?carer/.test(t)) return "care_worker";
  if (/domestic|housemaid|nanny|maid|househelp/.test(t)) return "domestic_worker";
  if (/driver|chauffeur|hgv|lgv/.test(t)) return "driver";
  if (/security|guard/.test(t)) return "security_guard";
  if (/cleaner|janitor|housekeep/.test(t)) return "cleaner_janitor";
  if (/waiter|waitress|server|f&b|barista/.test(t)) return "hospitality_waiter";
  if (/chef|cook|kitchen/.test(t)) return "hospitality_chef";
  if (/manager|supervisor/.test(t) && /hospitality|restaurant|hotel/.test(t)) return "hospitality_manager";
  if (/construction|labourer|labor(er)?|mason|carpenter|welder|plumber|electrician/.test(t)) {
    return /skilled|welder|electrician|plumber|carpenter|mason/.test(t) ? "construction_skilled" : "construction_labourer";
  }
  if (/warehouse|forklift|picker|packer|operative/.test(t)) return "warehouse_operative";
  if (/farm|harvest|agri|picker\b.*fruit/.test(t)) return "farm_worker";
  if (/office|admin|secretary|clerk|reception/.test(t)) return "office_admin";
  if (/sales|business development/.test(t)) return "sales";
  if (/it\b|software|developer|engineer(?!ing)|programmer|analyst\b.*data|it\s?professional/.test(t)) return "it_professional";
  if (/engineer/.test(t)) return "engineer";
  if (/teacher|tutor|instructor|lecturer/.test(t)) return "teacher";
  if (/technician|lab\b/.test(t)) return "medical_technician";
  return null;
}
