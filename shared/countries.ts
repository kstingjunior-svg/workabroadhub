/**
 * shared/countries.ts — canonical country registry.
 *
 * 2026-07: after Turkey was added, we realised the app had ~30 places where
 * countries were defined. This is the single source of truth for future
 * countries. When you add a new supported country (Japan, Korea, Croatia,
 * Romania, Serbia, Malta, Hungary, Czech, Slovakia, Baltics, Finland, etc.),
 * add it here. Every consumer that reads from SUPPORTED_COUNTRIES gets it
 * automatically.
 *
 * Migration strategy: legacy files still have hardcoded lists. New surfaces
 * (Job Destinations grid, LinkedIn Optimizer, Scout Jobs) read from here.
 * Migrate the legacy files over time.
 */

export interface SupportedCountry {
  /** Human name, e.g. "Turkey" — the label shown to users everywhere. */
  name: string;
  /** ISO 3166-1 alpha-2, e.g. "TR". Used as short label chips. */
  code: string;
  /** URL slug for /country/:slug — usually lowercase name. */
  slug: string;
  /** Emoji flag. */
  flag: string;
  /** Region for grouping. */
  region: "Europe" | "North America" | "Oceania" | "Middle East" | "Asia" | "Africa";
  /** Local currency code (ISO 4217), e.g. "TRY". */
  currency: string;
  /** Capital city. */
  capital: string;
  /** One-line dashboard tile description. Keep short. */
  tagline: string;
  /** Approximate KES conversion rate per 1 unit local currency (for salary tooltips). */
  kesPerUnit: number;
  /** Whether we currently support the country in prod (false = coming soon). */
  isActive: boolean;
  /** Alphabetical order key; also used for grid sort. */
  order: number;
  /** Optional Tailwind gradient for dashboard tile tone. */
  tileTone?: string;
  /** Optional: rich country page data (used by /country/:slug page). */
  countryPage?: CountryPageContent;
}

export interface CountryPageContent {
  heroTagline:   string;
  overview:      string;
  popularJobs:   Array<{ title: string; monthlyLocal: string; monthlyKes: string }>;
  visa: {
    types: string[];
    process: string;
    processingTime: string;
    documents: string[];
    warnings: string[];
  };
  benefits:      string[];
  requirements:  string[];
  applicationProcess: string[];
  faqs: Array<{ q: string; a: string }>;
  seo: {
    title:       string;
    description: string;
    keywords:    string[];
  };
}

// ─────────────────────────────────────────────────────────────────────────
// The registry. Order determines display order.
// ─────────────────────────────────────────────────────────────────────────

export const SUPPORTED_COUNTRIES: SupportedCountry[] = [
  {
    name: "Australia", code: "AU", slug: "australia", flag: "🇦🇺",
    region: "Oceania", currency: "AUD", capital: "Canberra",
    tagline: "482 Skilled visa", kesPerUnit: 85, isActive: true, order: 1,
    tileTone: "from-blue-500/10 to-yellow-500/10",
  },
  {
    name: "Bahrain", code: "BH", slug: "uae", flag: "🇧🇭",
    region: "Middle East", currency: "BHD", capital: "Manama",
    tagline: "Hospitality + GCC", kesPerUnit: 340, isActive: true, order: 2,
    tileTone: "from-red-500/10 to-white/0",
  },
  {
    name: "Canada", code: "CA", slug: "canada", flag: "🇨🇦",
    region: "North America", currency: "CAD", capital: "Ottawa",
    tagline: "PR pathway", kesPerUnit: 95, isActive: true, order: 3,
    tileTone: "from-red-500/10 to-white/0",
  },
  {
    name: "Germany", code: "DE", slug: "europe", flag: "🇩🇪",
    region: "Europe", currency: "EUR", capital: "Berlin",
    tagline: "EU Blue Card", kesPerUnit: 140, isActive: true, order: 4,
    tileTone: "from-black/10 to-yellow-500/10",
  },
  {
    name: "Luxembourg", code: "LU", slug: "luxembourg", flag: "🇱🇺",
    region: "Europe", currency: "EUR", capital: "Luxembourg",
    tagline: "Skilled only · 800k+/mo", kesPerUnit: 140, isActive: true, order: 5,
    tileTone: "from-sky-500/10 to-red-500/10",
  },
  {
    name: "Qatar", code: "QA", slug: "uae", flag: "🇶🇦",
    region: "Middle East", currency: "QAR", capital: "Doha",
    tagline: "Tax-free Gulf", kesPerUnit: 35, isActive: true, order: 6,
    tileTone: "from-purple-700/10 to-amber-500/10",
  },
  {
    name: "Saudi Arabia", code: "SA", slug: "uae", flag: "🇸🇦",
    region: "Middle East", currency: "SAR", capital: "Riyadh",
    tagline: "Vision 2030 hiring", kesPerUnit: 34, isActive: true, order: 7,
    tileTone: "from-green-700/10 to-emerald-500/10",
  },
  {
    name: "Turkey", code: "TR", slug: "turkey", flag: "🇹🇷",
    region: "Europe", currency: "TRY", capital: "Ankara",
    tagline: "Hospitality + Tourism", kesPerUnit: 3.9, isActive: true, order: 8,
    tileTone: "from-red-600/15 to-red-400/5",
    countryPage: {
      heroTagline: "Real overseas jobs in Turkey — hospitality, factories, farming, care, tourism, and skilled trades. Direct portal links, salary bands, and step-by-step visa help.",
      overview: "Turkey is one of the fastest-growing employment markets bordering Europe and the Middle East, with strong demand for foreign workers in hospitality, construction, textiles, factory work, agriculture, care, and technology. Istanbul, Ankara, Antalya, and Izmir account for most vacancies. Salaries are paid in Turkish Lira (TRY) and vary widely between formal-sector jobs (with contracts + residence permits) and informal work (which we do not recommend).",
      popularJobs: [
        { title: "Hotel Housekeeper (Antalya, Istanbul)",     monthlyLocal: "TRY 18,000 to 26,000", monthlyKes: "KES 70,200 to 101,400" },
        { title: "Hotel Front-Desk / Receptionist",           monthlyLocal: "TRY 22,000 to 34,000", monthlyKes: "KES 85,800 to 132,600" },
        { title: "Restaurant Cook / Chef de Partie",          monthlyLocal: "TRY 25,000 to 42,000", monthlyKes: "KES 97,500 to 163,800" },
        { title: "Textile / Garment Factory Worker (Bursa)",  monthlyLocal: "TRY 20,000 to 28,000", monthlyKes: "KES 78,000 to 109,200" },
        { title: "Construction Labourer",                     monthlyLocal: "TRY 22,000 to 30,000", monthlyKes: "KES 85,800 to 117,000" },
        { title: "Warehouse / Logistics Operative",           monthlyLocal: "TRY 20,000 to 28,000", monthlyKes: "KES 78,000 to 109,200" },
        { title: "Agricultural Harvest Worker (seasonal)",    monthlyLocal: "TRY 18,000 to 25,000", monthlyKes: "KES 70,200 to 97,500" },
        { title: "Care Assistant / Elderly Home Support",     monthlyLocal: "TRY 24,000 to 32,000", monthlyKes: "KES 93,600 to 124,800" },
        { title: "English Teacher (ELT)",                     monthlyLocal: "TRY 35,000 to 55,000", monthlyKes: "KES 136,500 to 214,500" },
        { title: "Registered Nurse (private hospital)",       monthlyLocal: "TRY 40,000 to 65,000", monthlyKes: "KES 156,000 to 253,500" },
        { title: "IT / Software Developer",                   monthlyLocal: "TRY 55,000 to 120,000", monthlyKes: "KES 214,500 to 468,000" },
        { title: "Airport Ground Handler",                    monthlyLocal: "TRY 24,000 to 34,000", monthlyKes: "KES 93,600 to 132,600" },
        { title: "Security Officer",                          monthlyLocal: "TRY 22,000 to 30,000", monthlyKes: "KES 85,800 to 117,000" },
      ],
      visa: {
        types: [
          "Work Visa (Çalışma Vizesi) — issued by a Turkish embassy after your Turkish employer secures a work permit for you",
          "Work Permit (Çalışma İzni) — issued by the Ministry of Labour and Social Security (ÇSGB) on the employer's application",
          "Short-Term Residence Permit (İkamet İzni) — sometimes issued alongside the work permit",
          "Turquoise Card — long-term for highly qualified skilled workers, investors, and academics",
        ],
        process: "The Turkish EMPLOYER applies for your work permit through the Ministry of Labour's e-Devlet portal. Once approved, you receive a reference and can then book a work-visa appointment at the Turkish embassy in Nairobi. On arrival in Turkey you must register with the Directorate General of Migration Management (DGMM) within 20 working days to receive your residence permit card. Never travel to Turkey on a tourist visa expecting to convert it — this is not permitted for work.",
        processingTime: "Work permit: 30 to 60 days after employer submission. Visa appointment in Nairobi: usually 2 to 4 weeks after permit approval.",
        documents: [
          "Valid Kenyan passport with at least 12 months validity and 2 blank pages",
          "Signed employment contract from the Turkish employer, translated + notarised",
          "University / college certificates translated into Turkish and apostilled",
          "Certificate of Good Conduct from the DCI",
          "Passport-size photos on white background (biometric spec)",
          "Proof of accommodation in Turkey (employer letter is usually acceptable)",
          "Yellow fever certificate + full vaccination record",
        ],
        warnings: [
          "Never pay a Turkish employer, recruiter, or 'processing agent' upfront for a job. Legitimate Turkish employers pay for your work permit — you do not pay them.",
          "Reject any 'guaranteed visa in 3 days' offer. The Ministry of Labour timeline is 30 to 60 days and cannot be shortened.",
          "If someone asks you to send your passport to a Nairobi 'agent' before the embassy appointment, walk away. The Turkish embassy is the only body that takes your passport.",
          "The Turkish tourist visa is NOT a bridge to work. Working on a tourist visa can lead to deportation, an entry ban, and losing your KES savings.",
        ],
      },
      benefits: [
        "Turkey is visa-processed from Nairobi (Turkish embassy on Runda Road) so no third-country trip needed.",
        "Cost of living in Antalya, Bursa, and Konya is significantly lower than Istanbul, letting you save more of your salary.",
        "Direct Turkish Airlines flights Nairobi to Istanbul make family visits realistic.",
        "Kenyan community in Istanbul (Aksaray, Kumkapı, Fatih) is growing, with WhatsApp groups for accommodation and job leads.",
        "Turkish employers in hospitality, textiles, and hotels routinely hire foreign workers with existing English-speaking staff.",
      ],
      requirements: [
        "Valid Kenyan passport (12+ months validity).",
        "Signed employment contract from a Turkish-registered employer.",
        "Educational credentials translated and apostilled.",
        "Certificate of Good Conduct (DCI, Nairobi).",
        "Vaccination records including yellow fever.",
        "For nursing and healthcare roles: Turkish Ministry of Health equivalence assessment.",
        "For teaching roles: TEFL or equivalent + degree.",
      ],
      applicationProcess: [
        "1. Find and apply to a Turkish employer via the portals below (Kariyer.net, Eleman.net, İŞKUR, LinkedIn Turkey).",
        "2. Complete interviews (often video) with the Turkish employer.",
        "3. Sign an employment contract in Turkish + English.",
        "4. Employer applies for your work permit through the Turkish Ministry of Labour's e-Devlet portal.",
        "5. Once the work permit is approved, book a work-visa appointment at the Turkish embassy in Nairobi.",
        "6. Attend the appointment with all documents. Visa issued in 2-4 weeks.",
        "7. Travel to Turkey. Register with the DGMM within 20 working days for your residence permit.",
      ],
      faqs: [
        { q: "Can I get a job in Turkey from Kenya without a degree?",
          a: "Yes. Hospitality (housekeeping, front desk, kitchen), textile factory work, agriculture, and construction do not require a degree. You will need a signed employment contract and a work permit before travel." },
        { q: "Is Turkey safe for Kenyan workers?",
          a: "Turkey has a growing African expatriate community and is generally safe. Istanbul, Antalya, Bursa, Konya, and Izmir are the most common destinations. As in any country, avoid informal work arrangements and always keep your residence permit card on you." },
        { q: "How long does the work permit take?",
          a: "The Turkish Ministry of Labour takes 30 to 60 days after the employer submits your application. Anyone promising 3 to 7 days is running a scam." },
        { q: "Do I need to speak Turkish?",
          a: "Most tourism, hospitality, and international factory roles operate in English. Learning basic Turkish (Merhaba, Teşekkürler, Ne kadar) will make your life easier and impress your employer." },
        { q: "What is the minimum wage in Turkey in 2026?",
          a: "The 2026 Turkish minimum wage is TRY 22,104 per month gross (approximately KES 86,200). Foreign workers should not accept below this by law." },
        { q: "Can I bring my family to Turkey?",
          a: "Yes, once you have a residence permit and a stable income, you can apply for family reunification for your spouse and children under 18." },
      ],
      seo: {
        title:       "Turkey Jobs for Kenyans | Work Visa, Salaries & Portals — WorkAbroad Hub",
        description: "Real overseas jobs in Turkey for Kenyans. Hospitality, factory, farming, care, and skilled trades. Salaries in TRY + KES, visa process, and verified Turkish job portals (Kariyer.net, İŞKUR, EURES).",
        keywords: [
          "Turkey jobs for Kenyans", "work in Turkey", "Turkey work visa Kenya",
          "Kariyer.net", "İŞKUR jobs", "Turkey hotel jobs", "Turkey factory jobs",
          "Turkish work permit", "jobs in Istanbul", "jobs in Antalya",
        ],
      },
    },
  },
  {
    name: "UAE", code: "AE", slug: "uae", flag: "🇦🇪",
    region: "Middle East", currency: "AED", capital: "Abu Dhabi",
    tagline: "Tax-free salary", kesPerUnit: 35, isActive: true, order: 9,
    tileTone: "from-green-500/10 to-red-500/10",
  },
  {
    name: "UK", code: "GB", slug: "uk", flag: "🇬🇧",
    region: "Europe", currency: "GBP", capital: "London",
    tagline: "NHS hiring", kesPerUnit: 165, isActive: true, order: 10,
    tileTone: "from-blue-500/10 to-red-500/10",
  },
  {
    name: "USA", code: "US", slug: "usa", flag: "🇺🇸",
    region: "North America", currency: "USD", capital: "Washington DC",
    tagline: "H-1B / EB-3", kesPerUnit: 129, isActive: true, order: 11,
    tileTone: "from-blue-500/10 to-red-500/10",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────

export const SUPPORTED_COUNTRY_NAMES: string[] = SUPPORTED_COUNTRIES
  .filter((c) => c.isActive)
  .map((c) => c.name);

export function findCountryBySlug(slug: string): SupportedCountry | undefined {
  const s = slug.toLowerCase();
  return SUPPORTED_COUNTRIES.find((c) => c.slug === s);
}

export function findCountryByName(name: string): SupportedCountry | undefined {
  const n = name.toLowerCase();
  return SUPPORTED_COUNTRIES.find((c) => c.name.toLowerCase() === n);
}
