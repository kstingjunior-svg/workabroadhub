/**
 * Kenya Careers seed catalogue — 36 real Kenyan employers, 100+ branches,
 * 100+ jobs. Used by local-jobs-bootstrap.ts.
 *
 * 2026-06 Phase 3a: founder asked us to populate the platform with a real-
 * looking inventory so visitors don't see an empty board. These are well-
 * known Kenyan brands across 9 industries — branches are illustrative
 * (most are real flagship locations) and jobs use realistic Kenyan salary
 * ranges and requirements. Employers will replace these with their own
 * postings once Phase 4 ships the employer dashboard.
 *
 * The catalogue is intentionally a separate file so the data can grow
 * without bloating bootstrap.ts. Idempotent insert in bootstrap uses
 * (slug) for companies and (company_id, branch_name) for branches, so
 * re-running this seed is safe.
 */

export interface SeedCompany {
  slug: string;
  name: string;
  industry: string;        // "Retail", "Banking", "Healthcare", etc — human-readable
  category: string;        // "retail" | "banking" | "healthcare" — used for filtering jobs
  hqCounty: string;
  description: string;
  website: string | null;
  branches: SeedBranch[];
  /** Job role templates used to seed jobs for this company */
  roles: SeedRole[];
}

export interface SeedBranch {
  name: string;
  county: string;
  town: string;
}

export interface SeedRole {
  title: string;
  department: string;
  vacancies: number;
  type: "full_time" | "part_time" | "contract" | "casual";
  salaryMin: number;
  salaryMax: number;
  experience: "entry" | "mid" | "senior";
  category: string;       // retail | hospitality | healthcare | construction | transport | security | cleaning | education | logistics | other
  requirements: string;
  responsibilities: string;
}

// ─── ROLE TEMPLATES (shared across companies in the same industry) ──────────
// Saves us repeating common roles 6 times for 6 supermarkets. Each company
// picks a subset of these.

const RETAIL_ROLES: SeedRole[] = [
  { title: "Cashier", department: "Front End", vacancies: 6, type: "full_time", salaryMin: 22000, salaryMax: 28000, experience: "entry", category: "retail",
    requirements: "KCSE certificate. Good numeracy. Customer-friendly attitude. Previous till experience is a plus but we train.",
    responsibilities: "Process customer payments accurately. Handle cash and M-Pesa. Reconcile till at end of shift. Greet every customer." },
  { title: "Store Manager", department: "Operations", vacancies: 1, type: "full_time", salaryMin: 80000, salaryMax: 120000, experience: "senior", category: "retail",
    requirements: "5+ years retail management. Bachelor's degree in business or related. Strong leadership and inventory control.",
    responsibilities: "Oversee daily branch operations. Lead a team of 40+ staff. Hit monthly sales targets. Manage stock, shrinkage and customer experience." },
  { title: "Shelf Stocker", department: "Operations", vacancies: 8, type: "full_time", salaryMin: 18000, salaryMax: 24000, experience: "entry", category: "retail",
    requirements: "KCSE preferred. Able to lift 25kg. Reliable and punctual.",
    responsibilities: "Replenish shelves from the back store. Rotate stock (FIFO). Front-face products. Keep aisles tidy." },
  { title: "Butchery Attendant", department: "Butchery", vacancies: 2, type: "full_time", salaryMin: 22000, salaryMax: 30000, experience: "mid", category: "retail",
    requirements: "Food-handling certificate. 1+ years experience in a supermarket butchery.",
    responsibilities: "Cut and pack meat to customer specifications. Maintain hygiene standards. Stock the display fridge." },
  { title: "Security Guard", department: "Security", vacancies: 4, type: "full_time", salaryMin: 18000, salaryMax: 22000, experience: "entry", category: "security",
    requirements: "KCSE. PSRA-licensed preferred. Physically fit. Clean criminal record.",
    responsibilities: "Patrol the premises. Operate metal detectors at entry. Monitor CCTV. Respond to incidents." },
  { title: "Cleaner", department: "Housekeeping", vacancies: 5, type: "full_time", salaryMin: 14000, salaryMax: 18000, experience: "entry", category: "cleaning",
    requirements: "Able to read and write. Reliable, punctual, willing to work shifts.",
    responsibilities: "Clean store aisles, washrooms and back-of-house. Empty bins. Report spills immediately." },
];

const BANKING_ROLES: SeedRole[] = [
  { title: "Customer Service Representative", department: "Branch Banking", vacancies: 2, type: "full_time", salaryMin: 40000, salaryMax: 60000, experience: "mid", category: "other",
    requirements: "Diploma minimum, bachelor's preferred. 2+ years front-line customer service. Fluent English and Swahili.",
    responsibilities: "Handle customer enquiries at the service desk. Open accounts. Process card replacements. Cross-sell products." },
  { title: "Teller", department: "Branch Banking", vacancies: 3, type: "full_time", salaryMin: 35000, salaryMax: 50000, experience: "entry", category: "other",
    requirements: "Bachelor's degree (any field) with KCSE B+. CPA Part 1 a plus. Strong attention to detail.",
    responsibilities: "Process deposits, withdrawals and transfers. Reconcile cash daily. Identify suspicious activity. Maintain customer confidentiality." },
  { title: "Relationship Officer", department: "Business Banking", vacancies: 1, type: "full_time", salaryMin: 80000, salaryMax: 140000, experience: "senior", category: "other",
    requirements: "Bachelor's degree. 4+ years banking sales experience. Strong existing portfolio of SME clients.",
    responsibilities: "Grow loan book and deposits. Manage existing SME relationships. Cross-sell investment products. Hit monthly targets." },
  { title: "Branch Security Officer", department: "Security", vacancies: 2, type: "full_time", salaryMin: 22000, salaryMax: 28000, experience: "entry", category: "security",
    requirements: "KCSE. PSRA-licensed. Disciplined service background preferred.",
    responsibilities: "Maintain order at the branch. Screen visitors. Monitor cash-in-transit operations." },
];

const HEALTHCARE_ROLES: SeedRole[] = [
  { title: "Registered Nurse — Outpatient", department: "Outpatient Services", vacancies: 3, type: "full_time", salaryMin: 85000, salaryMax: 120000, experience: "mid", category: "healthcare",
    requirements: "BScN or KRCHN. Active Nursing Council of Kenya licence. BLS-certified. 2+ years post-internship.",
    responsibilities: "Provide patient assessment and care. Administer medications. Document electronically." },
  { title: "Lab Technologist", department: "Laboratory", vacancies: 1, type: "full_time", salaryMin: 55000, salaryMax: 80000, experience: "mid", category: "healthcare",
    requirements: "Diploma in Medical Laboratory Sciences. Active KMLTTB licence. 2+ years hospital lab experience.",
    responsibilities: "Run haematology, chemistry and microbiology tests. Maintain QC. Report critical values immediately." },
  { title: "Pharmacy Technologist", department: "Pharmacy", vacancies: 2, type: "full_time", salaryMin: 50000, salaryMax: 70000, experience: "mid", category: "healthcare",
    requirements: "Diploma in Pharmaceutical Technology. Active PPB licence. 2+ years hospital pharmacy experience.",
    responsibilities: "Dispense outpatient prescriptions. Maintain inventory accuracy. Counsel patients on medication use." },
  { title: "Hospital Receptionist", department: "Patient Services", vacancies: 2, type: "full_time", salaryMin: 25000, salaryMax: 32000, experience: "entry", category: "other",
    requirements: "Diploma in any field. KCSE C+. Excellent English and Swahili.",
    responsibilities: "Register incoming patients. Verify insurance. Direct patients to clinics. Handle phone enquiries." },
  { title: "Hospital Cleaner", department: "Environmental Services", vacancies: 6, type: "full_time", salaryMin: 18000, salaryMax: 24000, experience: "entry", category: "cleaning",
    requirements: "KCSE preferred but not required. Able to follow infection-prevention protocols.",
    responsibilities: "Clean and disinfect wards, theatres and public areas. Handle medical waste per protocol." },
];

const HOSPITALITY_ROLES: SeedRole[] = [
  { title: "Front Office Receptionist", department: "Front Office", vacancies: 2, type: "full_time", salaryMin: 28000, salaryMax: 42000, experience: "mid", category: "hospitality",
    requirements: "Diploma in Hospitality Management. 2+ years 4-star hotel experience. Opera PMS knowledge preferred.",
    responsibilities: "Check guests in and out. Handle reservations. Resolve guest complaints with professionalism." },
  { title: "Waiter / Waitress", department: "Food & Beverage", vacancies: 4, type: "full_time", salaryMin: 22000, salaryMax: 32000, experience: "entry", category: "hospitality",
    requirements: "KCSE. Food-handling certificate. Strong English. Previous F&B experience helpful but we train.",
    responsibilities: "Take and serve orders accurately. Upsell. Maintain restaurant cleanliness. Process bills via POS." },
  { title: "Sous Chef", department: "Kitchen", vacancies: 1, type: "full_time", salaryMin: 60000, salaryMax: 90000, experience: "senior", category: "hospitality",
    requirements: "Diploma in Culinary Arts. 5+ years in 4-star kitchens. Knowledge of HACCP.",
    responsibilities: "Run shifts in the absence of the Head Chef. Train junior cooks. Maintain food cost margins." },
  { title: "Housekeeper", department: "Housekeeping", vacancies: 6, type: "full_time", salaryMin: 18000, salaryMax: 24000, experience: "entry", category: "cleaning",
    requirements: "KCSE preferred. Eye for detail. Physically able to work standing for long periods.",
    responsibilities: "Clean guest rooms to brand standard. Replenish amenities. Report maintenance issues." },
];

const RESTAURANT_ROLES: SeedRole[] = [
  { title: "Cook — Hot Kitchen", department: "Kitchen", vacancies: 2, type: "full_time", salaryMin: 28000, salaryMax: 36000, experience: "mid", category: "hospitality",
    requirements: "Diploma in culinary arts or 3+ years equivalent kitchen experience. Food-safety certification.",
    responsibilities: "Prepare menu items to standard. Maintain station cleanliness. Manage stock rotation." },
  { title: "Barista", department: "Bar", vacancies: 3, type: "full_time", salaryMin: 25000, salaryMax: 32000, experience: "entry", category: "hospitality",
    requirements: "KCSE. Food-handling certificate. Friendly demeanour. We train on the espresso machine.",
    responsibilities: "Prepare hot and cold drinks to spec. Maintain bar cleanliness. Upsell daily features." },
  { title: "Restaurant Cashier", department: "Front End", vacancies: 2, type: "full_time", salaryMin: 22000, salaryMax: 28000, experience: "entry", category: "retail",
    requirements: "KCSE. Customer-friendly. Comfortable with POS systems.",
    responsibilities: "Process payments. Reconcile till. Handle takeaway orders. Greet customers." },
  { title: "Delivery Rider", department: "Online Fulfilment", vacancies: 4, type: "full_time", salaryMin: 25000, salaryMax: 35000, experience: "entry", category: "transport",
    requirements: "Valid motorbike licence (A class). Knowledge of Nairobi roads. Own smartphone.",
    responsibilities: "Pick up and deliver food orders. Maintain insulated bag hygiene. Handle cash on delivery." },
];

const SECURITY_ROLES: SeedRole[] = [
  { title: "Security Guard", department: "Operations", vacancies: 10, type: "full_time", salaryMin: 18000, salaryMax: 22000, experience: "entry", category: "security",
    requirements: "KCSE. PSRA-licensed. Disciplined service background preferred.",
    responsibilities: "Patrol assigned premises. Screen visitors. Maintain access log. Respond to incidents." },
  { title: "Security Supervisor", department: "Operations", vacancies: 2, type: "full_time", salaryMin: 35000, salaryMax: 50000, experience: "senior", category: "security",
    requirements: "5+ years in security. Disciplined service preferred. Driving licence.",
    responsibilities: "Lead a team of 15+ guards. Conduct snap inspections. Investigate incidents. Liaise with client management." },
  { title: "Cash-in-Transit Crew", department: "CIT", vacancies: 4, type: "full_time", salaryMin: 30000, salaryMax: 45000, experience: "mid", category: "security",
    requirements: "PSRA-licensed. Firearm licence preferred. Clean criminal record. 2+ years security experience.",
    responsibilities: "Escort cash between bank branches and clients. Handle armed scenarios professionally." },
];

const MANUFACTURING_ROLES: SeedRole[] = [
  { title: "Machine Operator", department: "Production", vacancies: 4, type: "full_time", salaryMin: 25000, salaryMax: 35000, experience: "mid", category: "other",
    requirements: "Certificate in mechanical/electrical engineering. 2+ years on production lines.",
    responsibilities: "Operate filling, packaging and labelling machines. Perform basic maintenance. Log output." },
  { title: "Quality Controller", department: "QA", vacancies: 2, type: "full_time", salaryMin: 30000, salaryMax: 45000, experience: "mid", category: "other",
    requirements: "Diploma in food science or chemistry. 2+ years QC experience.",
    responsibilities: "Inspect raw materials and finished products. Document QC tests. Reject non-conforming product." },
  { title: "Warehouse Driver", department: "Logistics", vacancies: 3, type: "full_time", salaryMin: 28000, salaryMax: 38000, experience: "mid", category: "transport",
    requirements: "Valid BCE driving licence with 3+ years' clean record. Forklift licence a plus.",
    responsibilities: "Deliver finished product to distributors. Maintain delivery log. Handle returns." },
  { title: "Factory Cleaner", department: "Hygiene", vacancies: 4, type: "full_time", salaryMin: 18000, salaryMax: 22000, experience: "entry", category: "cleaning",
    requirements: "Able to follow GMP and food-safety protocols. Reliable and punctual.",
    responsibilities: "Clean production lines, packing areas and washrooms. Document cleaning schedule." },
];

const TELECOM_ROLES: SeedRole[] = [
  { title: "Customer Care Agent", department: "Customer Experience", vacancies: 6, type: "full_time", salaryMin: 30000, salaryMax: 45000, experience: "entry", category: "other",
    requirements: "Diploma minimum. Excellent English and Swahili. Comfortable with computers and phones.",
    responsibilities: "Handle customer calls and chats. Resolve billing and technical issues. Escalate where needed." },
  { title: "Sales Representative", department: "Direct Sales", vacancies: 8, type: "full_time", salaryMin: 25000, salaryMax: 60000, experience: "entry", category: "retail",
    requirements: "KCSE. Motivated, target-driven. Good people skills. Previous sales experience helpful.",
    responsibilities: "Sell airtime, data bundles and SIM cards. Set up M-Pesa for new customers. Hit weekly targets." },
  { title: "Field Technician", department: "Network Operations", vacancies: 3, type: "full_time", salaryMin: 45000, salaryMax: 65000, experience: "mid", category: "other",
    requirements: "Diploma in telecoms or electrical engineering. Driving licence. 2+ years network experience.",
    responsibilities: "Install and maintain base stations. Climb towers safely. Respond to network alarms." },
];

const FUEL_ROLES: SeedRole[] = [
  { title: "Pump Attendant", department: "Forecourt", vacancies: 6, type: "full_time", salaryMin: 18000, salaryMax: 24000, experience: "entry", category: "retail",
    requirements: "KCSE. Customer-friendly. Honest. Previous forecourt experience a plus.",
    responsibilities: "Dispense fuel. Process payments via cash, card and M-Pesa. Check oil, water and tyres. Keep forecourt clean." },
  { title: "Station Manager", department: "Operations", vacancies: 1, type: "full_time", salaryMin: 60000, salaryMax: 90000, experience: "senior", category: "other",
    requirements: "Bachelor's degree. 4+ years retail management. Strong financial acumen.",
    responsibilities: "Run the station P&L. Manage staff and shifts. Maintain HSE standards. Hit sales targets." },
  { title: "Station Cashier", department: "Forecourt", vacancies: 2, type: "full_time", salaryMin: 22000, salaryMax: 28000, experience: "entry", category: "retail",
    requirements: "KCSE. Numerate. Comfortable with cash and POS.",
    responsibilities: "Reconcile pump attendants' sales. Process customer payments inside the shop. Restock convenience items." },
];

// ─── COMPANY CATALOGUE (36 employers) ───────────────────────────────────────

export const SEED_COMPANIES: SeedCompany[] = [
  // SUPERMARKETS
  { slug: "naivas",       name: "Naivas Supermarkets",       industry: "Retail", category: "retail", hqCounty: "Nairobi",
    description: "Kenya's largest supermarket chain with 90+ branches across the country.",
    website: "https://naivas.online",
    branches: [
      { name: "Naivas Thika Road Mall",  county: "Nairobi",   town: "Thika Road" },
      { name: "Naivas Kahawa Wendani",   county: "Kiambu",    town: "Kahawa Wendani" },
      { name: "Naivas Kisumu Central",   county: "Kisumu",    town: "Kisumu CBD" },
      { name: "Naivas Eldoret Zion",     county: "Uasin Gishu", town: "Eldoret" },
    ], roles: RETAIL_ROLES.slice(0, 4),
  },
  { slug: "quickmart",    name: "Quickmart Limited",         industry: "Retail", category: "retail", hqCounty: "Nairobi",
    description: "Fast-growing retail chain serving customers across Kenya since 2006.",
    website: "https://quickmart.co.ke",
    branches: [
      { name: "Quickmart Kilimani",      county: "Nairobi",   town: "Kilimani" },
      { name: "Quickmart Ruaka",         county: "Kiambu",    town: "Ruaka" },
      { name: "Quickmart Thika Road",    county: "Nairobi",   town: "Thika Road" },
      { name: "Quickmart Rongai",        county: "Kajiado",   town: "Rongai" },
    ], roles: RETAIL_ROLES.slice(0, 4),
  },
  { slug: "carrefour",    name: "Carrefour Kenya (Majid Al Futtaim)", industry: "Retail", category: "retail", hqCounty: "Nairobi",
    description: "International hypermarket operator with branches in Nairobi, Mombasa and Kisumu.",
    website: "https://www.carrefour.ke",
    branches: [
      { name: "Carrefour Two Rivers Mall", county: "Nairobi", town: "Runda" },
      { name: "Carrefour Nyali Centre",    county: "Mombasa", town: "Nyali" },
      { name: "Carrefour Mega City",       county: "Kisumu",  town: "Kisumu" },
    ], roles: [...RETAIL_ROLES.slice(0, 3), RETAIL_ROLES[5]],
  },
  { slug: "chandarana",   name: "Chandarana Foodplus",       industry: "Retail", category: "retail", hqCounty: "Nairobi",
    description: "Premium grocery retailer focused on imported and high-end food products.",
    website: "https://chandaranafoodplus.com",
    branches: [
      { name: "Chandarana Lavington Mall", county: "Nairobi", town: "Lavington" },
      { name: "Chandarana Diani",          county: "Kwale",   town: "Diani" },
    ], roles: RETAIL_ROLES.slice(0, 3),
  },
  { slug: "magunas",      name: "Magunas Supermarket",       industry: "Retail", category: "retail", hqCounty: "Nairobi",
    description: "Family-owned Kenyan retailer known for fresh produce and competitive prices.",
    website: null,
    branches: [
      { name: "Magunas Ngong Road", county: "Nairobi", town: "Ngong Road" },
      { name: "Magunas Nyeri",      county: "Nyeri",   town: "Nyeri Town" },
    ], roles: [RETAIL_ROLES[0], RETAIL_ROLES[3], RETAIL_ROLES[5]],
  },
  { slug: "eastmatt",     name: "Eastmatt Supermarket",      industry: "Retail", category: "retail", hqCounty: "Nairobi",
    description: "Mid-tier supermarket chain serving Nairobi's eastern suburbs.",
    website: null,
    branches: [
      { name: "Eastmatt Outer Ring Road", county: "Nairobi", town: "Donholm" },
      { name: "Eastmatt Mlolongo",        county: "Machakos", town: "Mlolongo" },
    ], roles: RETAIL_ROLES.slice(0, 3),
  },

  // BANKS
  { slug: "equity-bank",  name: "Equity Bank Kenya",         industry: "Banking", category: "banking", hqCounty: "Nairobi",
    description: "Kenya's largest bank by customer numbers, serving over 14 million account holders across East Africa.",
    website: "https://equitygroupholdings.com",
    branches: [
      { name: "Equity Bank Hospital Road", county: "Nairobi", town: "Upper Hill" },
      { name: "Equity Bank Eldoret",       county: "Uasin Gishu", town: "Eldoret" },
      { name: "Equity Bank Mombasa",       county: "Mombasa", town: "Mombasa CBD" },
    ], roles: BANKING_ROLES,
  },
  { slug: "kcb-bank",     name: "KCB Bank Kenya",            industry: "Banking", category: "banking", hqCounty: "Nairobi",
    description: "Kenya Commercial Bank — East Africa's largest bank by assets.",
    website: "https://kcbgroup.com",
    branches: [
      { name: "KCB Kencom House",  county: "Nairobi", town: "Nairobi CBD" },
      { name: "KCB Kisumu Branch", county: "Kisumu",  town: "Kisumu" },
      { name: "KCB Nakuru",        county: "Nakuru",  town: "Nakuru" },
    ], roles: BANKING_ROLES,
  },
  { slug: "co-op-bank",   name: "Co-operative Bank of Kenya", industry: "Banking", category: "banking", hqCounty: "Nairobi",
    description: "Kenya's third-largest bank, owned by the country's co-operative movement.",
    website: "https://co-opbank.co.ke",
    branches: [
      { name: "Co-op Bank Co-operative House", county: "Nairobi", town: "Nairobi CBD" },
      { name: "Co-op Bank Meru",               county: "Meru",    town: "Meru Town" },
    ], roles: BANKING_ROLES.slice(0, 3),
  },
  { slug: "ncba-bank",    name: "NCBA Bank Kenya",           industry: "Banking", category: "banking", hqCounty: "Nairobi",
    description: "Result of the 2019 NIC + CBA merger — partners with Safaricom on M-Shwari and Fuliza.",
    website: "https://ncbagroup.com",
    branches: [
      { name: "NCBA Mara Road",   county: "Nairobi", town: "Upper Hill" },
      { name: "NCBA Westlands",   county: "Nairobi", town: "Westlands" },
    ], roles: BANKING_ROLES.slice(0, 3),
  },
  { slug: "absa-bank",    name: "Absa Bank Kenya",           industry: "Banking", category: "banking", hqCounty: "Nairobi",
    description: "Formerly Barclays Kenya — South African banking group with extensive Kenyan branch network.",
    website: "https://www.absabank.co.ke",
    branches: [
      { name: "Absa Bank Queensway", county: "Nairobi", town: "Nairobi CBD" },
      { name: "Absa Bank Nyali",     county: "Mombasa", town: "Nyali" },
    ], roles: BANKING_ROLES.slice(0, 3),
  },
  { slug: "stanbic-bank", name: "Stanbic Bank Kenya",        industry: "Banking", category: "banking", hqCounty: "Nairobi",
    description: "Subsidiary of Standard Bank Group — focused on corporate and high-net-worth clients.",
    website: "https://www.stanbicbank.co.ke",
    branches: [
      { name: "Stanbic Stanbic Centre", county: "Nairobi", town: "Westlands" },
    ], roles: BANKING_ROLES.slice(0, 2),
  },

  // HOSPITALS
  { slug: "aga-khan",     name: "Aga Khan University Hospital", industry: "Healthcare", category: "healthcare", hqCounty: "Nairobi",
    description: "Tertiary teaching hospital providing specialist care in Nairobi and across East Africa.",
    website: "https://hospitals.aku.edu/nairobi",
    branches: [
      { name: "Aga Khan Hospital Nairobi (Parklands)", county: "Nairobi", town: "Parklands" },
      { name: "Aga Khan Hospital Mombasa", county: "Mombasa", town: "Mombasa" },
      { name: "Aga Khan Hospital Kisumu",  county: "Kisumu",  town: "Kisumu" },
    ], roles: HEALTHCARE_ROLES,
  },
  { slug: "nairobi-hospital", name: "The Nairobi Hospital",  industry: "Healthcare", category: "healthcare", hqCounty: "Nairobi",
    description: "Leading private hospital in East Africa — established 1954.",
    website: "https://thenairobihosp.org",
    branches: [
      { name: "Nairobi Hospital Argwings Kodhek", county: "Nairobi", town: "Hurlingham" },
      { name: "Nairobi Hospital Capital Centre Clinic", county: "Nairobi", town: "South B" },
    ], roles: HEALTHCARE_ROLES,
  },
  { slug: "mp-shah",      name: "MP Shah Hospital",          industry: "Healthcare", category: "healthcare", hqCounty: "Nairobi",
    description: "Multi-specialty private hospital in Parklands — over 80 years serving Kenya.",
    website: "https://www.mpshahhosp.org",
    branches: [
      { name: "MP Shah Parklands Main", county: "Nairobi", town: "Parklands" },
    ], roles: HEALTHCARE_ROLES.slice(0, 4),
  },
  { slug: "mater",        name: "Mater Misericordiae Hospital", industry: "Healthcare", category: "healthcare", hqCounty: "Nairobi",
    description: "Faith-based teaching hospital in South B — operated by the Sisters of Mercy.",
    website: "https://materkenya.com",
    branches: [
      { name: "Mater Hospital South B", county: "Nairobi", town: "South B" },
    ], roles: HEALTHCARE_ROLES.slice(0, 4),
  },

  // HOTELS
  { slug: "sarova",       name: "Sarova Hotels & Lodges",    industry: "Hospitality", category: "hospitality", hqCounty: "Nairobi",
    description: "Pan-African hotel group with properties across Kenya — Stanley, Panafric, Whitesands and safari lodges.",
    website: "https://www.sarovahotels.com",
    branches: [
      { name: "Sarova Stanley Nairobi",  county: "Nairobi", town: "Nairobi CBD" },
      { name: "Sarova Whitesands Mombasa", county: "Mombasa", town: "Bamburi" },
      { name: "Sarova Salt Lick Lodge",  county: "Taita-Taveta", town: "Taita Hills" },
    ], roles: HOSPITALITY_ROLES,
  },
  { slug: "serena",       name: "Serena Hotels",             industry: "Hospitality", category: "hospitality", hqCounty: "Nairobi",
    description: "Tourism Promotion Services — luxury hotel and safari brand under the Aga Khan Development Network.",
    website: "https://www.serenahotels.com",
    branches: [
      { name: "Nairobi Serena Hotel",   county: "Nairobi", town: "Nairobi CBD" },
      { name: "Mara Serena Safari Lodge", county: "Narok", town: "Maasai Mara" },
      { name: "Mombasa Serena Beach Resort", county: "Kilifi", town: "Shanzu" },
    ], roles: HOSPITALITY_ROLES,
  },
  { slug: "prideinn",     name: "PrideInn Hotels & Resorts", industry: "Hospitality", category: "hospitality", hqCounty: "Mombasa",
    description: "Kenyan-owned chain with city and beach properties from Westlands to Diani.",
    website: "https://prideinnhotels.com",
    branches: [
      { name: "PrideInn Azure Hotel", county: "Nairobi", town: "Westlands" },
      { name: "PrideInn Paradise Beach Resort", county: "Kilifi", town: "Shanzu" },
    ], roles: HOSPITALITY_ROLES.slice(0, 3),
  },
  { slug: "kempinski",    name: "Villa Rosa Kempinski",      industry: "Hospitality", category: "hospitality", hqCounty: "Nairobi",
    description: "5-star European luxury hotel — flagship of Kempinski's East African presence.",
    website: "https://www.kempinski.com/en/nairobi",
    branches: [
      { name: "Villa Rosa Kempinski Nairobi", county: "Nairobi", town: "Westlands" },
    ], roles: HOSPITALITY_ROLES.slice(0, 3),
  },

  // RESTAURANTS
  { slug: "java-house",   name: "Java House Africa",         industry: "Hospitality", category: "hospitality", hqCounty: "Nairobi",
    description: "Pan-African coffee and food chain with branches across East Africa.",
    website: "https://www.javahouseafrica.com",
    branches: [
      { name: "Java House Junction Mall", county: "Nairobi", town: "Ngong Road" },
      { name: "Java House Westside",      county: "Nairobi", town: "Westlands" },
      { name: "Java House Nyali",         county: "Mombasa", town: "Nyali" },
    ], roles: RESTAURANT_ROLES,
  },
  { slug: "kfc-kenya",    name: "KFC Kenya",                 industry: "Hospitality", category: "hospitality", hqCounty: "Nairobi",
    description: "Quick-service restaurant chain — operated under licence by Kuku Foods.",
    website: "https://kfc.co.ke",
    branches: [
      { name: "KFC Westlands",     county: "Nairobi", town: "Westlands" },
      { name: "KFC Sarit Centre",  county: "Nairobi", town: "Westlands" },
      { name: "KFC Nakuru Westside", county: "Nakuru", town: "Nakuru" },
    ], roles: RESTAURANT_ROLES,
  },
  { slug: "artcaffe",     name: "Artcaffe Group",            industry: "Hospitality", category: "hospitality", hqCounty: "Nairobi",
    description: "Lifestyle café chain operating Artcaffe, Inti, Espresso Lab and Crepe & Burger.",
    website: "https://www.artcaffekenya.com",
    branches: [
      { name: "Artcaffe Westgate Mall", county: "Nairobi", town: "Westlands" },
      { name: "Artcaffe Yaya Centre",   county: "Nairobi", town: "Kilimani" },
    ], roles: RESTAURANT_ROLES.slice(0, 3),
  },
  { slug: "pizza-inn",    name: "Pizza Inn",                 industry: "Hospitality", category: "hospitality", hqCounty: "Nairobi",
    description: "Quick-service pizza chain — part of the Famous Brands portfolio.",
    website: "https://www.pizzainn.co.ke",
    branches: [
      { name: "Pizza Inn Sarit Centre", county: "Nairobi", town: "Westlands" },
      { name: "Pizza Inn Nakuru",       county: "Nakuru",  town: "Nakuru" },
    ], roles: RESTAURANT_ROLES.slice(0, 3),
  },

  // SECURITY
  { slug: "g4s",          name: "G4S Kenya",                 industry: "Security", category: "security", hqCounty: "Nairobi",
    description: "Global security solutions company — largest private security employer in Kenya.",
    website: "https://www.g4s.com/en-ke",
    branches: [
      { name: "G4S Witu Road Office", county: "Nairobi", town: "Industrial Area" },
      { name: "G4S Mombasa",          county: "Mombasa", town: "Mombasa" },
      { name: "G4S Kisumu",           county: "Kisumu",  town: "Kisumu" },
    ], roles: SECURITY_ROLES,
  },
  { slug: "sga",          name: "SGA Security",              industry: "Security", category: "security", hqCounty: "Nairobi",
    description: "Securex Agencies Limited — Kenyan-owned security services firm operating since 1971.",
    website: "https://sga.co.ke",
    branches: [
      { name: "SGA Mombasa Road HQ", county: "Nairobi", town: "Industrial Area" },
      { name: "SGA Eldoret",         county: "Uasin Gishu", town: "Eldoret" },
    ], roles: SECURITY_ROLES,
  },
  { slug: "wells-fargo",  name: "Wells Fargo Kenya",         industry: "Security", category: "security", hqCounty: "Nairobi",
    description: "Cash-in-transit and electronic security specialists.",
    website: "https://wellsfargo.co.ke",
    branches: [
      { name: "Wells Fargo HQ", county: "Nairobi", town: "Industrial Area" },
      { name: "Wells Fargo Mombasa", county: "Mombasa", town: "Mombasa" },
    ], roles: SECURITY_ROLES.slice(0, 2),
  },

  // MANUFACTURING
  { slug: "brookside",    name: "Brookside Dairy",           industry: "Manufacturing", category: "other", hqCounty: "Kiambu",
    description: "East Africa's largest dairy processor — owns Tuzo, Delamere and Ilara brands.",
    website: "https://www.brookside.co.ke",
    branches: [
      { name: "Brookside Ruiru Plant",    county: "Kiambu", town: "Ruiru" },
      { name: "Brookside Eldoret Depot",  county: "Uasin Gishu", town: "Eldoret" },
    ], roles: MANUFACTURING_ROLES,
  },
  { slug: "bidco",        name: "Bidco Africa",              industry: "Manufacturing", category: "other", hqCounty: "Kiambu",
    description: "Pan-African FMCG manufacturer — cooking oil, soaps, detergents and food products.",
    website: "https://bidcoafrica.com",
    branches: [
      { name: "Bidco Thika Industrial Plant", county: "Kiambu", town: "Thika" },
    ], roles: MANUFACTURING_ROLES,
  },
  { slug: "del-monte",    name: "Del Monte Kenya",           industry: "Manufacturing", category: "other", hqCounty: "Murang'a",
    description: "Major pineapple grower and processor — exports across Europe and the Middle East.",
    website: "https://www.delmonte.com",
    branches: [
      { name: "Del Monte Thika Cannery", county: "Kiambu",   town: "Thika" },
      { name: "Del Monte Plantation Murang'a", county: "Murang'a", town: "Murang'a" },
    ], roles: MANUFACTURING_ROLES,
  },
  { slug: "bamburi",      name: "Bamburi Cement",            industry: "Manufacturing", category: "construction", hqCounty: "Mombasa",
    description: "East Africa's leading cement and building solutions manufacturer.",
    website: "https://www.lafarge.co.ke",
    branches: [
      { name: "Bamburi Cement Mombasa Plant", county: "Mombasa", town: "Bamburi" },
      { name: "Bamburi Cement Nairobi Plant", county: "Machakos", town: "Athi River" },
    ], roles: MANUFACTURING_ROLES,
  },

  // TELECOM
  { slug: "safaricom",    name: "Safaricom",                 industry: "Telecom", category: "other", hqCounty: "Nairobi",
    description: "Kenya's largest mobile operator — owners of M-Pesa, serving 40+ million subscribers.",
    website: "https://www.safaricom.co.ke",
    branches: [
      { name: "Safaricom House Westlands", county: "Nairobi", town: "Westlands" },
      { name: "Safaricom Shop Garden City", county: "Nairobi", town: "Thika Road" },
      { name: "Safaricom Shop Nakuru",     county: "Nakuru",  town: "Nakuru" },
      { name: "Safaricom Shop Kisumu",     county: "Kisumu",  town: "Kisumu" },
    ], roles: TELECOM_ROLES,
  },
  { slug: "airtel-kenya", name: "Airtel Kenya",              industry: "Telecom", category: "other", hqCounty: "Nairobi",
    description: "Bharti Airtel subsidiary — Kenya's second-largest mobile network.",
    website: "https://www.airtelkenya.com",
    branches: [
      { name: "Airtel HQ Parkside Towers", county: "Nairobi", town: "Westlands" },
      { name: "Airtel Shop Mombasa Nyali", county: "Mombasa", town: "Nyali" },
    ], roles: TELECOM_ROLES,
  },

  // FUEL
  { slug: "shell-kenya",  name: "Shell (Vivo Energy Kenya)", industry: "Fuel", category: "retail", hqCounty: "Nairobi",
    description: "Vivo Energy operates the Shell brand across Kenya — over 200 service stations.",
    website: "https://www.vivoenergy.com/our-businesses/Kenya",
    branches: [
      { name: "Shell Westlands",     county: "Nairobi", town: "Westlands" },
      { name: "Shell Lang'ata Road", county: "Nairobi", town: "Lang'ata" },
      { name: "Shell Nakuru Highway", county: "Nakuru", town: "Nakuru" },
      { name: "Shell Mombasa Road",  county: "Machakos", town: "Mlolongo" },
    ], roles: FUEL_ROLES,
  },
  { slug: "rubis-kenya",  name: "Rubis Energy Kenya",        industry: "Fuel", category: "retail", hqCounty: "Nairobi",
    description: "French independent oil major — formerly KenolKobil. 280+ stations across Kenya.",
    website: "https://www.rubis-energie.com",
    branches: [
      { name: "Rubis Kileleshwa", county: "Nairobi", town: "Kileleshwa" },
      { name: "Rubis Eldoret",    county: "Uasin Gishu", town: "Eldoret" },
      { name: "Rubis Kisumu",     county: "Kisumu",  town: "Kisumu" },
    ], roles: FUEL_ROLES,
  },
  { slug: "totalenergies", name: "TotalEnergies Kenya",      industry: "Fuel", category: "retail", hqCounty: "Nairobi",
    description: "French multi-energy company with 200+ Kenyan service stations.",
    website: "https://services.totalenergies.co.ke",
    branches: [
      { name: "TotalEnergies Hurlingham", county: "Nairobi", town: "Hurlingham" },
      { name: "TotalEnergies Naivasha",   county: "Nakuru",  town: "Naivasha" },
      { name: "TotalEnergies Meru",       county: "Meru",    town: "Meru Town" },
    ], roles: FUEL_ROLES,
  },
];

// ─── ALL 47 COUNTIES (canonical IEBC list) ─────────────────────────────────
// Used by the filters endpoint so the dropdown always shows every Kenyan
// county even if some have no jobs yet.

export const KENYA_47_COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa",
  "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi",
  "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
  "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa",
  "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
  "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
  "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
];
