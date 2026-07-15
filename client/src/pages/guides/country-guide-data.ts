// ─────────────────────────────────────────────────────────────────────────────
// Country/Visa Guide content — drives the 5 SEO landing pages.
//
// Each entry is hand-tuned for a specific high-intent Google query that
// Kenyan jobseekers run constantly but where competition is weak. The
// idea: own the SERP for these queries with a single really-good page per
// topic. Schema.org FAQPage + BreadcrumbList markup is generated from this
// data by the renderer at /guides/[slug].
// ─────────────────────────────────────────────────────────────────────────────

export interface GuideStep {
  title: string;
  body: string;
}

export interface GuideFAQ {
  q: string;
  a: string;
}

export interface CountryGuide {
  slug: string;
  flag: string;
  country: string;
  pageTitle: string;          // <title> + h1
  metaDescription: string;    // <meta name="description">
  primaryKeyword: string;
  searchVolume: string;       // approximate KE monthly volume
  heroHeadline: string;
  heroSubhead: string;
  costEstimate: string;       // e.g. "KES 50,000 – 150,000 total"
  timeframe: string;
  topRoles: string[];
  steps: GuideStep[];
  faqs: GuideFAQ[];
  recommendedServices: Array<{ slug: string; reason: string }>;
  countrySlug: string;        // for the "view all jobs" CTA -> /country/<slug>
}

export const GUIDES: Record<string, CountryGuide> = {
  "uk-nhs-kenya": {
    slug: "uk-nhs-kenya",
    flag: "🇬🇧",
    country: "United Kingdom",
    countrySlug: "uk",
    pageTitle: "How a Kenyan Nurse Gets to the NHS in 2026 — Step-by-Step Guide",
    metaDescription: "Complete 2026 guide for Kenyan nurses applying to the UK NHS: OSCE, IELTS, NMC registration, Health & Care Worker visa, salary, and cost breakdown.",
    primaryKeyword: "uk nhs jobs for kenyan nurses",
    searchVolume: "~2,400/mo",
    heroHeadline: "From Nairobi to the NHS — the real Kenyan nurse's roadmap",
    heroSubhead: "Every step a Kenyan nurse needs to take to land an NHS Band 5 role in 2026, with real costs in KES and the official links that actually work from Kenya.",
    costEstimate: "KES 280,000 – 420,000 total (mostly recoverable in your first 2 months of UK salary)",
    timeframe: "8–14 months end-to-end",
    topRoles: ["Registered Nurse (Adult)", "Mental Health Nurse", "Midwife", "Paediatric Nurse"],
    steps: [
      {
        title: "1. Confirm your Kenyan nursing license is current",
        body: "You need an active Nursing Council of Kenya (NCK) registration certificate plus 6+ months post-registration experience. NHS trusts won't shortlist new graduates. Renew via NCK's online portal (KES 2,000).",
      },
      {
        title: "2. Pass IELTS Academic (or OET Nursing)",
        body: "NHS requires IELTS 7.0 overall, 6.5 in writing, 7.0 in listening/reading/speaking. OET is an easier alternative for clinical staff — aim for B in all four sections. Test centres in Nairobi & Mombasa. Cost: KES 32,000 (IELTS) or KES 45,000 (OET).",
      },
      {
        title: "3. Apply for NMC (Nursing & Midwifery Council UK) registration",
        body: "Submit your CBT (Computer-Based Test) application via NMC online. Eligibility check + CBT booking: ~£140. You'll sit Part 1 of the OSCE remotely. Once you pass, you're 'NMC-decision ready'.",
      },
      {
        title: "4. Apply to NHS trusts (visa sponsorship required)",
        body: "Use jobs.nhs.uk, NHS Professionals, or trust websites directly. Filter for 'Tier 2 / Health & Care Worker visa sponsored'. Top recruiters for Kenyans: Manchester Foundation Trust, Mid-Yorkshire, Royal Free London, Birmingham Women's & Children's. Most offer relocation + accommodation packages.",
      },
      {
        title: "5. Receive Certificate of Sponsorship + apply for Health & Care visa",
        body: "Once a trust offers you a job, they issue your CoS (Certificate of Sponsorship). Apply for the Health & Care Worker visa online — fee is £247 (one of the lowest UK visa fees, plus IHS is waived for healthcare). Decision usually within 3 weeks.",
      },
      {
        title: "6. Travel + complete OSCE Part 2 in the UK",
        body: "Most trusts pay for your flight and arrange a study house for OSCE prep. You'll sit Part 2 of the OSCE in the UK (Manchester, Northampton, or Oxford Brookes). Pass rate for prepared candidates: 75%+. You then receive your NMC PIN and start work as a registered nurse.",
      },
    ],
    faqs: [
      {
        q: "What's the starting NHS Band 5 salary for a Kenyan nurse in 2026?",
        a: "£29,970 per year (about KES 4.8M) plus shift enhancements that typically add 15–25% — bringing total take-home to £36,000–£42,000. After tax and accommodation deductions, expect KES 320,000–380,000/month to remit home.",
      },
      {
        q: "Will the NHS pay for my OSCE training and flight?",
        a: "Most NHS trusts now offer full relocation packages worth £2,500–£4,000: covers the visa fee, flight, 30-day accommodation, and OSCE training. Always confirm this is in writing before accepting the job offer — don't take 'we'll sort it out' as enough.",
      },
      {
        q: "How long until I can bring my family on dependent visas?",
        a: "Family members (spouse + children under 18) can apply for dependent visas as soon as your Health & Care visa is granted. They can travel with you. Cost: £247 each, also IHS-waived. Spouse has full work rights on arrival.",
      },
      {
        q: "Can I avoid the OSCE and skip straight to working?",
        a: "No. Every internationally trained nurse must complete OSCE Part 2 in the UK before getting an NMC PIN. There are no shortcuts. However, you can work as a pre-registration nurse on a lower band while you prepare, which most trusts allow.",
      },
      {
        q: "Are unlicensed Kenyan recruitment agencies a problem?",
        a: "Yes — every year hundreds of Kenyan nurses are scammed by agencies that take KES 100,000+ for fake 'NHS placement' that doesn't exist. Verify any agency on the licensed list before paying anything. NHS trusts never use intermediary agencies for direct hire — apply on jobs.nhs.uk yourself.",
      },
    ],
    recommendedServices: [
      { slug: "ats_cv_optimization", reason: "NHS trusts use Trac.jobs ATS — your CV must be ATS-optimized to even reach a recruiter" },
      { slug: "cover_letter", reason: "NHS application requires a tailored supporting statement — generic doesn't get shortlisted" },
      { slug: "visa_guidance", reason: "Step-by-step walkthrough of Health & Care visa documents — avoid the 30% rejection rate from preventable mistakes" },
    ],
  },

  "canada-express-entry-kenya": {
    slug: "canada-express-entry-kenya",
    flag: "🇨🇦",
    country: "Canada",
    countrySlug: "canada",
    pageTitle: "Canada Express Entry for Kenyans — 2026 Step-by-Step Guide",
    metaDescription: "Full 2026 guide to Canadian Express Entry from Kenya: CRS score, IELTS, ECA, profile creation, ITA timelines, real costs, and PR pathway.",
    primaryKeyword: "canada express entry kenya",
    searchVolume: "~1,800/mo",
    heroHeadline: "Canada Express Entry from Kenya — the 2026 roadmap that works",
    heroSubhead: "Everything a Kenyan professional needs to enter the Canadian Express Entry pool and convert it into Permanent Residence, with real KES costs and current CRS cutoffs.",
    costEstimate: "KES 220,000 – 380,000 total (you remain in Kenya until your PR landing date)",
    timeframe: "6–18 months from profile to PR",
    topRoles: ["Software Developer", "Registered Nurse", "Civil Engineer", "Accountant", "Truck Driver (Class 1)"],
    steps: [
      {
        title: "1. Get your Educational Credential Assessment (ECA)",
        body: "Required for every Express Entry candidate. WES (World Education Services) is the most common for Kenyans — KES 30,000, takes 3–6 weeks. They assess your Kenyan degree against the Canadian standard and issue an official report.",
      },
      {
        title: "2. Take IELTS General Training (or CELPIP)",
        body: "Aim for CLB 9 in all four sections — that's IELTS 7.0 listening/reading/writing/speaking. Higher scores = more CRS points = faster ITA. IELTS test in Nairobi: KES 32,000. Re-test allowed if scores are below target.",
      },
      {
        title: "3. Calculate your CRS score and identify your NOC code",
        body: "Use the official IRCC CRS calculator. Most Kenyans without Canadian work experience or job offers land between 380–470 points. The 2026 average ITA cutoff for general draws is ~485, but category-based draws (healthcare, STEM, trades, French) clear at 425–470.",
      },
      {
        title: "4. Create your Express Entry profile",
        body: "Submit your profile on the IRCC portal (free). You enter the pool for 12 months. IRCC runs draws every 2 weeks — if your CRS is at or above the cutoff for the draw type you're eligible for, you receive an Invitation to Apply (ITA).",
      },
      {
        title: "5. Boost your CRS — provincial nominee, French, or Canadian job offer",
        body: "Below the cutoff? Three reliable boosters: (a) Apply to a Provincial Nominee Program (PNP) — Saskatchewan SINP and Ontario OINP are friendliest to Kenyans (+600 CRS), (b) learn French to TEF B2 (+50 CRS), (c) secure a valid Canadian job offer with LMIA (+50–200 CRS).",
      },
      {
        title: "6. Receive ITA → submit PR application → land in Canada",
        body: "After ITA, you have 60 days to submit the full PR application (~KES 145,000 in fees + medicals + police clearance + biometrics). Processing: 5–8 months. Once approved, you receive a Confirmation of PR (COPR) and have up to 1 year to land in Canada.",
      },
    ],
    faqs: [
      {
        q: "What's the minimum CRS score Kenyans realistically need in 2026?",
        a: "For general draws, 485+. For category-based draws (Healthcare, STEM, Skilled Trades, French language, Agriculture, Transport), 425–470 is enough. Without a PNP nomination or French, getting above 480 from a typical Kenyan profile is hard — most successful candidates use PNP.",
      },
      {
        q: "Do I need a job offer to apply?",
        a: "No. The majority of Kenyan Express Entry applicants enter the pool without a Canadian job offer. A job offer with LMIA adds 50–200 CRS points but is not required.",
      },
      {
        q: "How long does the full Express Entry process take from Kenya?",
        a: "Best case: 6 months (strong profile, fast ITA, smooth PR processing). Realistic average for Kenyan applicants: 9–12 months. Worst case with re-tests or PNP route: 18–24 months.",
      },
      {
        q: "What are the total cost breakdown in KES?",
        a: "ECA: KES 30,000. IELTS: KES 32,000 (allow KES 64,000 for two attempts). Government PR fees: KES 145,000 for a single applicant (KES 215,000 with spouse). Medical exams: KES 14,000–20,000. Police clearance (KE + any other country you've lived in): KES 1,500–4,000. Biometrics: KES 11,000. Total realistic: KES 235,000–380,000 single, KES 320,000–470,000 with spouse.",
      },
      {
        q: "Can I include my spouse and children?",
        a: "Yes. Spouses can claim CRS points for their own education + language. Children under 22 can be included as dependents. The whole family lands together as Permanent Residents, with the spouse having full work rights and children eligible for free public school.",
      },
    ],
    recommendedServices: [
      { slug: "cv_rewrite", reason: "Canadian CV format is strict — no photos, achievements over duties, max 2 pages" },
      { slug: "linkedin_optimization", reason: "Canadian recruiters source 70% of candidates from LinkedIn — your profile needs Canadian keywords" },
      { slug: "visa_guidance", reason: "Express Entry document submission has zero tolerance for mistakes — one wrong NOC code rejects the whole application" },
    ],
  },

  "uae-hospitality-kenya": {
    slug: "uae-hospitality-kenya",
    flag: "🇦🇪",
    country: "UAE",
    countrySlug: "uae",
    pageTitle: "UAE Hospitality Jobs for Kenyans 2026 — Real Salaries & How to Apply",
    metaDescription: "Hotel, F&B, and aviation hospitality jobs in Dubai & Abu Dhabi for Kenyans: tax-free salary ranges, employer-sponsored visas, and direct application links.",
    primaryKeyword: "uae hospitality jobs for kenyans",
    searchVolume: "~2,100/mo",
    heroHeadline: "Dubai & Abu Dhabi hospitality jobs — what Kenyans actually earn in 2026",
    heroSubhead: "Real tax-free salary ranges, visa sponsorship terms, and the verified portals to apply on for hotel, F&B, cabin crew, and ground-staff roles.",
    costEstimate: "KES 0 – 15,000 (employer pays visa + flight; you only pay for documents)",
    timeframe: "4–10 weeks from offer to arrival",
    topRoles: ["Hotel Receptionist", "Waiter / Bartender", "Housekeeping", "Cabin Crew (Emirates, Etihad, flydubai)", "Airport Ground Staff"],
    steps: [
      {
        title: "1. Match your experience to UAE hospitality bands",
        body: "Entry: 0–2 years (KES 65,000–110,000/mo + accommodation). Mid: 2–5 years supervisor (KES 110,000–180,000/mo). Senior: 5+ years duty manager (KES 180,000–280,000/mo). All tax-free. Cabin crew at Emirates/Etihad starts ~KES 200,000/mo for new hires.",
      },
      {
        title: "2. Polish your CV in UAE format",
        body: "UAE CVs INCLUDE a photo, nationality, marital status, visa status, and date of birth — opposite of Western format. Keep it 2 pages, list nationality at top. Use formal English. Recruiters in Dubai screen 200+ CVs/day; clarity wins.",
      },
      {
        title: "3. Apply directly on UAE job portals (avoid Kenyan intermediaries)",
        body: "Top portals: Bayt.com, Naukrigulf.com, GulfTalent.com, LinkedIn UAE, Laimoon. For airlines: emiratesgroupcareers.com, etihad.com/careers, careers.flydubai.com. NEVER pay any 'agency' in Kenya for UAE jobs — every legitimate employer pays your visa themselves.",
      },
      {
        title: "4. Attend interviews (often video / WhatsApp first)",
        body: "Major employers do open recruitment days in Nairobi 2–4× per year (especially Emirates Group, Marriott, Hilton, IHG). Otherwise expect 2 video interviews — initial HR screening + final hiring manager. Dress in uniform-style smart attire for video.",
      },
      {
        title: "5. Receive offer + employer applies for your employment visa",
        body: "The employer applies for an entry permit (pink visa) — takes 5–10 working days. They send you the e-visa, you book your flight (most employers reimburse), arrive Dubai/Abu Dhabi, complete medical fitness, biometrics, and Emirates ID. Your residence visa is stamped within 14 days of arrival.",
      },
      {
        title: "6. Start work + understand your contract terms",
        body: "Standard UAE hospitality contract: 2 years, 30 days paid leave per year, 1 return ticket home per year (or every 2 years), shared employer accommodation, transport, and meals. Probation is 6 months. Always read the clauses on salary deductions, gratuity (end-of-service), and notice period.",
      },
    ],
    faqs: [
      {
        q: "Do I need to pay anything to get a UAE hospitality job?",
        a: "Zero. Every legitimate UAE employer pays for your visa, flight to UAE, accommodation deposit, and medical fitness test. If anyone in Kenya is asking for KES 50,000–200,000 to 'secure' you a UAE job, it's a scam. The only thing you legitimately pay for is your passport renewal, attestation of certificates (KES 4,500–8,000), and getting to Nairobi for interviews.",
      },
      {
        q: "What's the realistic monthly salary for a Kenyan starting in Dubai hospitality?",
        a: "KES 75,000–110,000/month plus FREE shared accommodation, transport to work, and one meal per shift. Tax-free, so what you get is what you take home. Tips in F&B can add 20–40%. Cabin crew at Emirates starts higher: ~KES 200,000–230,000/mo with flying allowances.",
      },
      {
        q: "How long is the contract and can I leave early?",
        a: "Standard UAE employment contracts are 2 years. You can leave early but will lose your gratuity (end-of-service benefit, typically 1 month salary per year of service) and may need to repay your relocation costs (around KES 100,000) if you leave within the first year. Always check the specific clause before signing.",
      },
      {
        q: "Will I get a UAE residence visa, and can I bring my family?",
        a: "Yes. Once you complete medical + Emirates ID, you receive a 2-year residence visa tied to your employer. You can sponsor your spouse and children if your monthly salary is above AED 4,000 (~KES 145,000/mo). Many entry-level hospitality roles start below this threshold, so plan for 2–3 years before family sponsorship.",
      },
      {
        q: "Are airline cabin crew jobs (Emirates, Etihad) actually open to Kenyans?",
        a: "Yes — Emirates, Etihad, and flydubai actively recruit Kenyans. Emirates holds open days in Nairobi annually. Requirements: minimum age 21, height 160cm (female) / 174cm (male), able to reach 212cm with feet flat, fluent English, KCSE certificate, no visible tattoos. Application is at emiratesgroupcareers.com directly — no agency needed.",
      },
    ],
    recommendedServices: [
      { slug: "cv_rewrite", reason: "UAE CV format requires photo + personal details — opposite of UK/CA — gets you shortlisted by Gulf recruiters" },
      { slug: "interview_coaching", reason: "Hotel + airline interviews follow STAR + competency formats — coaching triples callback rate" },
      { slug: "employer_verification", reason: "Verify the UAE employer before signing — protects you from gratuity-stealing 2-year contracts" },
    ],
  },

  "saudi-nursing-kenya": {
    slug: "saudi-nursing-kenya",
    flag: "🇸🇦",
    country: "Saudi Arabia",
    countrySlug: "uae",
    pageTitle: "Saudi Arabia Nursing Jobs for Kenyans 2026 — Salary, Iqama & Process",
    metaDescription: "Complete 2026 guide for Kenyan nurses moving to Saudi Arabia: Prometric exam, DataFlow, MOH license, Iqama, real tax-free salaries, and top hospitals hiring.",
    primaryKeyword: "saudi arabia nursing jobs kenya",
    searchVolume: "~1,600/mo",
    heroHeadline: "Saudi Arabia nursing jobs for Kenyans — the real 2026 guide",
    heroSubhead: "Tax-free salaries, employer-paid visa + flight + housing, and the step-by-step Prometric + DataFlow + MOH process every Kenyan nurse needs to pass.",
    costEstimate: "KES 25,000 – 60,000 (you pay for documents; employer pays visa + flight + housing)",
    timeframe: "4–9 months from application to arrival",
    topRoles: ["Staff Nurse (Med-Surg)", "ICU/Critical Care Nurse", "OR Nurse", "Pediatric Nurse", "Dialysis Nurse"],
    steps: [
      {
        title: "1. Confirm you meet Saudi MOH baseline",
        body: "Required: BSN or Diploma in Nursing (3 years), valid Nursing Council of Kenya license, minimum 2 years post-registration experience in your specialty. Critical care specialties (ICU, CCU, ER, OR, NICU) command higher salaries and faster processing.",
      },
      {
        title: "2. Submit DataFlow verification",
        body: "DataFlow verifies your Kenyan nursing license, degree, and work experience with the issuing bodies. Cost: ~USD 320 (KES 41,000). Processing: 30–60 days. Apply via dataflowgroup.com — this MUST be done before you can sit the Prometric exam.",
      },
      {
        title: "3. Pass the Saudi Prometric exam (SCFHS)",
        body: "Computer-based clinical exam covering pharmacology, nursing process, and specialty-specific knowledge. 100 MCQ over 2 hours, pass mark ~60%. Test centres in Nairobi (Prometric center, Westlands). Cost: USD 100 (KES 13,000). Most candidates pass on first attempt with 3 months of focused prep.",
      },
      {
        title: "4. Apply to Saudi hospitals (employer applies for your MOH license)",
        body: "Top Kenya-friendly employers: Ministry of Health hospitals (largest, formal pay scale), King Faisal Specialist Hospital (Riyadh, Jeddah), Saudi German Hospital Group, Dr. Sulaiman Al Habib (private), Aramco Medical (oilfield workers — premium pay). Apply via their official career portals.",
      },
      {
        title: "5. Receive offer + Saudi MOH classification letter",
        body: "Once the hospital hires you, they apply for your MOH classification on your behalf. You receive an offer letter detailing salary, allowances, accommodation, and contract length. Sign + return. Hospital then applies for your work visa from the Saudi Embassy.",
      },
      {
        title: "6. Visa stamping + travel + Iqama (residence permit)",
        body: "Visit Saudi Embassy in Nairobi for medical exam + visa stamping (employer pays). Once issued, you have 90 days to enter Saudi. On arrival: orientation, Iqama (residence card) issued within 30 days, MOH license activated. Start work — typically 12-hour shifts, 5 days/week.",
      },
    ],
    faqs: [
      {
        q: "What's the real monthly salary for a Kenyan nurse in Saudi Arabia?",
        a: "Staff Nurse (general ward): SAR 6,500–9,000/month (KES 225,000–310,000). Critical Care (ICU/CCU): SAR 9,000–12,000/month (KES 310,000–415,000). OR / Specialty: SAR 10,000–14,000/month (KES 345,000–485,000). All tax-free. PLUS free housing or housing allowance (SAR 1,500–2,500), free transport, free annual ticket home, and end-of-service benefit equal to 1 month salary per year worked.",
      },
      {
        q: "How long is the typical contract and can I leave early?",
        a: "Standard contract is 24 months, renewable. You can leave after the contract by giving 90-day notice. Breaking the contract early forfeits your end-of-service benefit and you may need to refund relocation costs. Most Kenyan nurses renew at least once because the savings are substantial.",
      },
      {
        q: "Can I bring my family to Saudi on a nurse's salary?",
        a: "Yes — once your Iqama is issued, you can sponsor your spouse and children. Family visa requires your salary to be above SAR 5,000/mo (most nursing roles qualify). Wife can apply to work; school fees for international schools are SAR 15,000–40,000/yr per child (factor this in).",
      },
      {
        q: "Is Saudi safe for a single female Kenyan nurse?",
        a: "Yes. Hospitals provide secured female-only accommodation with transport to/from work. Female nurses must wear abaya in public spaces but no longer need a male guardian to work or open a bank account (post-2019 reforms). Major cities (Riyadh, Jeddah, Dammam) have established expat nurse communities — many Kenyan nurses have been there 10+ years.",
      },
      {
        q: "How much can I realistically save and send home per month?",
        a: "Entry-level (KES 225,000/mo gross): KES 130,000–160,000 sent home after personal expenses. ICU/specialty (KES 350,000+/mo): KES 230,000–280,000 sent home. Most Kenyan nurses build a 2-bedroom house in Kenya within 3–4 years of saving, plus contribute to family expenses.",
      },
    ],
    recommendedServices: [
      { slug: "ats_cv_optimization", reason: "Saudi MOH hospitals use ATS — your CV needs Prometric scores, DataFlow status, and specialty experience highlighted" },
      { slug: "interview_coaching", reason: "Saudi clinical interviews focus on patient safety scenarios + adapting to single-payer culture — coaching tunes your answers" },
      { slug: "visa_guidance", reason: "Saudi visa stamping + medicals + Iqama is paperwork-heavy — one wrong document delays you by months" },
    ],
  },

  "germany-blue-card-kenya": {
    slug: "germany-blue-card-kenya",
    flag: "🇩🇪",
    country: "Germany",
    countrySlug: "europe",
    pageTitle: "Germany EU Blue Card for Kenyans 2026 — Eligibility, Salary, PR",
    metaDescription: "Complete 2026 guide to the EU Blue Card for Kenyan professionals: salary threshold, recognition of Kenyan degrees, work visa, PR after 21 months.",
    primaryKeyword: "germany blue card kenya",
    searchVolume: "~1,400/mo",
    heroHeadline: "Germany EU Blue Card from Kenya — the 2026 fast track to EU PR",
    heroSubhead: "How a Kenyan engineer, IT specialist, doctor, or skilled professional qualifies for an EU Blue Card, the salary threshold to meet, and the 21-month path to German PR.",
    costEstimate: "KES 45,000 – 95,000 (visa fee + apostilles + Blocked Account is repaid as salary)",
    timeframe: "5–9 months from job search to landing",
    topRoles: ["Software Engineer", "Electrical / Mechanical Engineer", "Medical Doctor", "Data Scientist", "Civil Engineer"],
    steps: [
      {
        title: "1. Verify your Kenyan degree is recognised by Germany",
        body: "Check your university + degree on the official Anabin database (anabin.kmk.org). Most Kenyan public universities (UoN, JKUAT, KU, Moi, Egerton) are listed as H+ — directly recognised. Private universities may need a Zeugnisbewertung (statement of comparability, ~KES 25,000, 4 weeks).",
      },
      {
        title: "2. Confirm you meet the Blue Card salary threshold",
        body: "2026 EU Blue Card minimum gross salary: €45,300/year (~KES 6.5M) for general professions, €41,041/year (~KES 5.9M) for shortage occupations (IT, engineering, healthcare, math/science). The salary in your job offer must hit this — there's no way around it.",
      },
      {
        title: "3. Find a German employer + job offer",
        body: "Top portals: Stepstone.de, LinkedIn DE, Make-it-in-Germany.com (official), Indeed.de, Honeypot (tech only). German employers often interview in English for shortage occupations. Tech, engineering, and healthcare are easiest — most have explicit Blue Card sponsorship programmes.",
      },
      {
        title: "4. Sign contract + apply for Blue Card visa at German Embassy Nairobi",
        body: "Once you have a signed job offer meeting the salary threshold, book a visa appointment at the German Embassy in Nairobi (gicc.diplo.de). Visa fee: €75 (~KES 11,000). Bring: passport, contract, degree + Anabin printout, CV, motivation letter, health insurance proof, 3 biometric photos. Processing: 4–12 weeks.",
      },
      {
        title: "5. Arrive in Germany + register address (Anmeldung) within 14 days",
        body: "Land in Germany on your entry visa. Within 14 days you MUST register your address (Anmeldung) at the local Bürgeramt — without this you can't get a bank account, tax ID, health insurance, or convert your visa to a Blue Card. This trips up 50% of new arrivals.",
      },
      {
        title: "6. Receive Blue Card + path to PR in 21 months",
        body: "After Anmeldung you visit the Ausländerbehörde (immigration office) with your contract + Anmeldung + health insurance, and they issue your physical Blue Card (valid up to 4 years). After 21 months with B1 German (or 27 months with A1 German), you can apply for German Permanent Residence. After 6 years you can apply for German citizenship.",
      },
    ],
    faqs: [
      {
        q: "How much does an EU Blue Card holder earn in Germany after tax?",
        a: "Gross €45,000–80,000 for most Kenyan professionals on Blue Card. After income tax (~30%), health insurance (~7.5%), and pension contributions (~9.3%), take-home is roughly 50–55% of gross. So €60,000 gross = ~€2,750/month net (~KES 400,000/mo). Higher salaries in tech (€70,000–95,000) net €3,200–4,200/month.",
      },
      {
        q: "Do I need to speak German to get a Blue Card?",
        a: "No, not initially. Many international roles in tech, science, and healthcare are conducted in English. However: (a) you'll need A1 German to apply for PR after 21 months, (b) B1 German cuts the PR wait to 21 months instead of 27, (c) German social life is much easier with B1+. Start learning before you land.",
      },
      {
        q: "Can I bring my family on a Blue Card?",
        a: "Yes, and Germany has one of the most family-friendly EU work visas. Your spouse can join on a family reunion visa and has FULL work rights from day 1 (no waiting period). Children under 18 join automatically. Spouse doesn't need to prove German skills for the initial visa.",
      },
      {
        q: "What jobs are easiest for a Kenyan to get a Blue Card for?",
        a: "Shortage occupations have the lower salary threshold AND faster processing: software development, mechanical engineering, electrical engineering, civil engineering, mathematics, natural sciences, medical doctors, IT specialists. Healthcare nursing is NOT a Blue Card occupation — nurses use a different visa pathway.",
      },
      {
        q: "How is Germany different from the UK or Canada for Kenyans?",
        a: "Germany has stronger worker protections (28+ vacation days, strong job security), lower cost of living outside Munich/Frankfurt, fastest path to EU PR (21 months), and German PR lets you work in 27 EU countries. Trade-off: harder integration without German, smaller existing Kenyan community than UK/Canada, higher tax burden.",
      },
    ],
    recommendedServices: [
      { slug: "cv_rewrite", reason: "German CV (Lebenslauf) is highly structured with a chronological table format — Western/UK CVs get rejected" },
      { slug: "motivation_letter", reason: "German employers expect a formal motivation letter (Anschreiben) — generic ones lose to local applicants" },
      { slug: "visa_guidance", reason: "Anabin verification + Embassy appointment booking is the single biggest hurdle — guidance prevents 3-month delays" },
    ],
  },

  // ─── Work Permit landing pages (drive paid work_permit_* SKUs) ──────────────
  "uk-work-permit-kenya": {
    slug: "uk-work-permit-kenya",
    flag: "🇬🇧",
    country: "United Kingdom",
    countrySlug: "uk",
    pageTitle: "How to Get a UK Work Permit from Kenya — 2026 Step-by-Step Guide",
    metaDescription: "Complete 2026 guide for Kenyans applying for a UK Skilled Worker Visa: Certificate of Sponsorship, IELTS, fees, timeline, and document checklist.",
    primaryKeyword: "uk work permit for kenyans",
    searchVolume: "~1,800/mo",
    heroHeadline: "How a Kenyan gets a UK work permit in 2026 — every step, real costs",
    heroSubhead: "The UK Skilled Worker Visa is the only realistic legal route for most Kenyan professionals. Here is exactly what you need, in what order, with the fees in KES.",
    costEstimate: "KES 180,000 – 320,000 total (Health & Care role = lower; standard Skilled Worker = higher)",
    timeframe: "3–6 months from job offer to visa decision",
    topRoles: ["Care Worker / Senior Care Worker", "Nurse (Band 5)", "Software Engineer", "Construction Site Manager", "Driver (HGV)"],
    steps: [
      { title: "1. Confirm the right visa route", body: "For most Kenyans, this is the Skilled Worker Visa. Health & Care Worker Visa (a Skilled Worker sub-route) has cheaper fees and no IHS — use that if your role is on the eligible list (nurses, care workers, doctors, paramedics, social workers). Global Talent and Graduate visas exist but are rare paths." },
      { title: "2. Find a UK employer with a sponsor licence", body: "You CANNOT apply for the Skilled Worker visa alone — a licensed UK employer must first issue you a Certificate of Sponsorship (CoS). Check sponsors at gov.uk's published 'Register of Licensed Sponsors'. Care homes, NHS trusts, tech scaleups, and construction firms sponsor most Kenyans." },
      { title: "3. Pass English (IELTS UKVI / OET / approved equivalent)", body: "Skilled Worker visa requires B1 CEFR. Easiest route from Kenya: IELTS for UKVI Academic at the British Council in Nairobi (KES 32,000). Healthcare roles often need higher (IELTS 7.0 / OET grade B). Book early — slots in Nairobi book out 6–8 weeks ahead." },
      { title: "4. Receive your CoS + gather supporting documents", body: "Once the employer issues your CoS, gather: valid Kenyan passport (10+ months left), TB test certificate (KES 12,000 at IOM Nairobi), proof of savings (£1,270 in your account for 28 consecutive days unless your sponsor confirms maintenance), and English test certificate. The CoS reference number goes into your visa application." },
      { title: "5. Submit the Skilled Worker visa application", body: "Apply online at gov.uk. Fees in 2026 (approx KES): Standard Skilled Worker — £719 visa + £1,035/year Immigration Health Surcharge (~KES 360k total for 3 years). Health & Care Worker — £247 visa, IHS waived (~KES 38k total). Biometric appointment at VFS Nairobi or Mombasa is part of the flow." },
      { title: "6. Decision + travel", body: "Standard processing: 3 weeks (priority: 5 working days for ~£500 extra). Once approved you collect your visa vignette, then your BRP card after arrival. Your visa is tied to your sponsor — switching employers requires a new CoS." },
    ],
    faqs: [
      { q: "Can I apply for a UK work permit without a job offer?", a: "No. The Skilled Worker visa REQUIRES a Certificate of Sponsorship from a UK-licensed employer. Anyone telling you they can get you a UK work permit before you have a job offer is scamming you." },
      { q: "What's the difference between Skilled Worker and Health & Care Worker visa?", a: "Health & Care Worker is a Skilled Worker sub-route with much lower fees (£247 vs £719), no IHS, and faster processing. Eligible only for specific health/social-care occupation codes — your sponsor confirms eligibility." },
      { q: "Will my Kenyan degree be accepted?", a: "Most UK employers accept Kenyan degrees directly. For regulated roles (nursing, medicine, teaching) you need a UK-equivalent assessment (NMC for nurses, GMC for doctors, NCTL/QTS for teachers). For most other Skilled Worker roles, no formal equivalence is needed — the CoS itself is the eligibility certificate." },
      { q: "How long can I stay on a Skilled Worker visa?", a: "Up to 5 years per CoS, renewable indefinitely. After 5 years continuous residence you qualify for Indefinite Leave to Remain (ILR / UK PR). Dependants (spouse + children under 18) can join you on dependant visas with full work rights." },
      { q: "What is the cheapest route — total budget in KES?", a: "Health & Care Worker visa is the cheapest: roughly KES 38,000 visa fee + KES 12,000 TB test + KES 32,000 IELTS UKVI = KES 82,000 total before travel. Standard Skilled Worker is roughly KES 360,000 including 3 years IHS." },
    ],
    recommendedServices: [
      { slug: "work_permit_uk_pro", reason: "Full hand-holding through the CoS process and visa application — for users who want a person between them and the paperwork" },
      { slug: "work_permit_uk_mid", reason: "Light guide + we pre-fill your VAF using your CV/intake — saves 4-6 hours of form-filling" },
      { slug: "work_permit_uk_light", reason: "KES 249 entry — country-specific checklist + fees breakdown in your inbox today" },
    ],
  },

  "uae-work-permit-kenya": {
    slug: "uae-work-permit-kenya",
    flag: "🇦🇪",
    country: "UAE",
    countrySlug: "uae",
    pageTitle: "How to Get a UAE Work Permit from Kenya — 2026 Step-by-Step Guide",
    metaDescription: "Complete 2026 guide for Kenyans applying for a UAE work permit (MOHRE / Tasheel): Employment Visa, Emirates ID, attestation, fees, and timeline.",
    primaryKeyword: "uae work permit for kenyans",
    searchVolume: "~2,200/mo",
    heroHeadline: "How a Kenyan gets a UAE work permit in 2026 — MOHRE, Tasheel, Emirates ID",
    heroSubhead: "Your UAE employer drives most of the process — but you must arrive in Kenya with the right attested documents or you will be stuck. Here is exactly what to do.",
    costEstimate: "KES 30,000 – 80,000 from your side (most fees are employer-paid for mainland roles)",
    timeframe: "4–10 weeks from job offer to landed in UAE",
    topRoles: ["Customer Service / Retail", "Hospitality (Hotel, F&B)", "Construction & Skilled Trades", "Driver (Light + Heavy)", "Domestic Worker / Nanny"],
    steps: [
      { title: "1. Understand who issues your permit (mainland vs free-zone)", body: "Mainland jobs: MOHRE (Ministry of Human Resources & Emiratisation) issues your work permit via the Tasheel system. Free-zone jobs (e.g. DMCC, JAFZA): the free-zone authority itself issues the permit. Either way, it follows an Employment Visa + Emirates ID. Your employer's HR/PRO knows which applies." },
      { title: "2. Have your documents attested in Kenya BEFORE you fly", body: "This is the step Kenyans get wrong. Your highest academic certificate AND a Police Clearance Certificate (Good Conduct, KES 1,050 at DCI Nairobi) must be attested by: (1) the Kenyan Ministry of Foreign Affairs, then (2) the UAE Embassy in Nairobi. Total cost: KES 8,000–12,000. Without UAE-side attestation, you cannot work in licensed roles." },
      { title: "3. Receive your offer letter + work permit approval", body: "Your UAE employer registers you on Tasheel and applies for the initial Work Permit (Pink Permit). MOHRE approval typically lands in 5–10 working days. Your employer emails you the e-visa / entry permit PDF — this is what you travel on." },
      { title: "4. Travel to UAE on the entry permit", body: "You enter UAE on the 60-day Employment Entry Permit. From day one your employer takes you through: medical fitness test (Dubai Health Authority approved centre — about AED 320), Emirates ID enrollment (biometrics), and the Tawjeeh labour-rights orientation (free, 1 day). All three are required to issue the Residence Visa." },
      { title: "5. Residence Visa stamped + Emirates ID issued", body: "Once medical + biometrics + Tawjeeh are done, your residence visa is stamped in your passport and Emirates ID is issued (5–10 days after biometrics). You are now legally resident and can open a bank account, get a driver's licence transfer, and rent." },
      { title: "6. Annual renewal", body: "UAE residence visas are typically 2 years (mainland) or 2-3 years (free-zone). Your employer handles renewal but you sign and undergo the medical again. If you switch jobs, the new employer cancels the old visa and issues a new one — there's no gap if done correctly." },
    ],
    faqs: [
      { q: "Can I get a UAE work permit without a sponsor?", a: "Generally no — except for the Green Visa (5-year residence) and Golden Visa (10-year), both of which require very high salary thresholds (AED 30k+/month) or skill categories you must meet on paper. For 99% of Kenyans, you need an UAE employer as your sponsor." },
      { q: "What documents need attestation from Kenya?", a: "Your highest academic certificate (degree or diploma) AND your Police Clearance Certificate (Good Conduct). Both via Kenyan MFA → UAE Embassy Nairobi. Attestation is non-negotiable for any licensed mainland role." },
      { q: "How much do I actually pay vs the employer?", a: "Mainland jobs: most UAE employers cover the work permit, medical, Emirates ID, and residence visa fees by law. You typically only pay for: passport, Good Conduct cert + attestation (KES 12k), travel docs, your medical-fitness retest if needed. Free-zone or recruitment-agent routes sometimes shift costs to you — always ask in writing." },
      { q: "Is the UAE free-zone route faster?", a: "Free-zone permits are typically issued in 7–14 days once you arrive vs 10–20 days for mainland MOHRE. But free-zone employers cannot have you work outside the free-zone area without a Mission Visa for each gig. For most full-time hires this doesn't matter." },
      { q: "Can my spouse join me?", a: "Yes if you earn AED 4,000+/month (with accommodation) or AED 4,500+/month otherwise. You sponsor them on a Family Visa once your own residence is stamped. Children under 18 join the same way." },
    ],
    recommendedServices: [
      { slug: "work_permit_uae_pro", reason: "Our team coordinates with your UAE PRO and handles attestation logistics on the Nairobi side — for users who want hand-holding" },
      { slug: "work_permit_uae_mid", reason: "Light guide + we pre-fill your Tasheel forms and lay out attestation step-by-step" },
      { slug: "work_permit_uae_light", reason: "KES 249 entry — complete checklist + attestation flow + medical centre list" },
    ],
  },

  "saudi-work-permit-kenya": {
    slug: "saudi-work-permit-kenya",
    flag: "🇸🇦",
    country: "Saudi Arabia",
    countrySlug: "saudi",
    pageTitle: "How to Get a Saudi Work Permit (Iqama) from Kenya — 2026 Step-by-Step Guide",
    metaDescription: "Complete 2026 guide for Kenyans applying for a Saudi work permit and Iqama: Block Visa, Enjazit, Wakalah, MoFA attestation, fees, and timeline.",
    primaryKeyword: "saudi work permit for kenyans",
    searchVolume: "~3,100/mo",
    heroHeadline: "How a Kenyan gets a Saudi work permit + Iqama in 2026 — Block Visa to Iqama",
    heroSubhead: "Saudi work routes go through a licensed Kenyan recruitment agency in 90% of cases. Here is the full Block Visa → Work Visa → Iqama path, what each step costs, and how to avoid the agencies that steal money.",
    costEstimate: "KES 18,000 – 40,000 from your side (most fees are employer-paid; agency fees ABOVE KES 35,000 are illegal in Kenya)",
    timeframe: "6–14 weeks end-to-end (Block Visa allocation is the slowest step)",
    topRoles: ["Domestic Worker / Housekeeper", "Driver (Personal / Heavy)", "Nurse (KSA Ministry of Health)", "Hospitality (Hotel, Catering)", "Construction & Skilled Trades"],
    steps: [
      { title: "1. Go through a licensed Kenyan recruitment agency (mandatory)", body: "By Kenyan law, you can only travel to Saudi Arabia for work via a licensed recruitment agency listed in Kenya's public licence register. Verify any agency using WorkAbroadHub's free agency checker. If they ask for more than KES 35,000 in total agency fees, walk away — that's the legal cap." },
      { title: "2. Saudi employer obtains a Block Visa from KSA Ministry of Labour", body: "Your prospective Saudi employer applies for a Block Visa (a quota allocation) from MoL Riyadh. This is invisible to you — your agency tells you when the Block Visa lands. Typical wait: 3–8 weeks." },
      { title: "3. Wakalah (Power of Attorney) drafted in KSA + attested at MoFA", body: "The Saudi employer drafts a Wakalah/Power of Attorney authorising you specifically. This document goes through MoFA Saudi → Saudi Embassy in Nairobi → MFA Kenya. Your agency handles the Nairobi side." },
      { title: "4. Apply for the Work Visa via Enjazit", body: "With the Wakalah, your agency submits your Work Visa application via Enjazit (the Saudi e-government visa system). You submit: passport (12+ months left), academic cert + Good Conduct (both MoFA-attested), KES medical fitness from a Saudi-approved centre (Gulf Approved Medical Centres — list on agency's wall), and 4 photos. Visa fee paid via Enjazit." },
      { title: "5. Travel + Iqama issuance in KSA", body: "You travel on the Work Visa (6 months single-entry validity, you must enter within 60 days of issue). Upon arrival, your employer/sponsor takes you for: re-medical (Saudi side, usually free for legal hires), fingerprints, and the Iqama application at Jawazat. Iqama is normally issued within 30 days of arrival." },
      { title: "6. Iqama renewal + repatriation rights", body: "Iqama is typically 1 year, renewed annually by your sponsor (kafala system). You have legal rights: wages paid via WPS (Wages Protection System), end-of-service benefits, and the right to repatriate flight on contract end. Kenyan embassy in Riyadh (+966 11 488 2484) handles emergencies." },
    ],
    faqs: [
      { q: "Why must I go through a licensed Kenyan recruitment agency?", a: "Kenyan law (Labour Institutions Act) requires this for all Gulf placements. Going via informal channels is illegal AND removes your repatriation + dispute rights. The fee cap is KES 35,000 — agencies charging more are breaking Kenyan law." },
      { q: "How do I verify the Saudi employer is real?", a: "Ask the agency for the employer's Saudi commercial registration number (CR / 'Sijill Tijari') and check it at moic.gov.sa. Also confirm the job offer letter has Wage Protection System (WPS) commitments. WorkAbroad Hub's Employer Verification service does this for KES 99." },
      { q: "What does the Iqama actually let me do?", a: "The Iqama is your Saudi resident ID + work permit. It lets you legally work for your sponsor only, open a bank account, register a SIM, and use government services. It does NOT let you change employers freely — that needs your sponsor's approval ('Naqal Kafala' transfer), though 2021+ reforms made transfers easier." },
      { q: "Can I bring my family?", a: "Yes if you earn SAR 5,000+/month and your role is eligible (most professional roles are; many domestic worker roles are not). You sponsor them on Family Iqamas." },
      { q: "What happens if my employer doesn't pay me?", a: "File a complaint via the Musaned platform or directly to the Ministry of Human Resources. WPS automatically flags missed payments. The Kenyan Embassy can also help. Do NOT just stop working without filing — that can void your protections." },
    ],
    recommendedServices: [
      { slug: "work_permit_saudi_pro", reason: "Our team liaises with your Saudi employer / agency and handles MoFA attestation — high-touch for the highest-stakes route" },
      { slug: "work_permit_saudi_mid", reason: "Light guide + Enjazit form pre-fill + licensed recruitment agency vetting checklist" },
      { slug: "work_permit_saudi_light", reason: "KES 249 entry — Block Visa to Iqama timeline + Wakalah + agency-scam watchlist" },
    ],
  },

  "canada-work-permit-kenya": {
    slug: "canada-work-permit-kenya",
    flag: "🇨🇦",
    country: "Canada",
    countrySlug: "canada",
    pageTitle: "How to Get a Canada Work Permit from Kenya — 2026 Step-by-Step Guide",
    metaDescription: "Complete 2026 guide for Kenyans applying for a Canada work permit: LMIA, IEC, Express Entry, NOC codes, ECA, IELTS, fees, and timeline.",
    primaryKeyword: "canada work permit for kenyans",
    searchVolume: "~2,500/mo",
    heroHeadline: "How a Kenyan gets a Canada work permit in 2026 — LMIA, IEC, or Express Entry",
    heroSubhead: "There are three real routes for Kenyans into Canadian work. Pick the right one based on your NOC code, age, and CRS score — getting this wrong wastes a year.",
    costEstimate: "KES 120,000 – 250,000 total (Express Entry is the most expensive; closed work permits via LMIA are cheaper)",
    timeframe: "6–14 months (LMIA route: 4–8 months; Express Entry PR: 6–14 months after profile)",
    topRoles: ["Registered Nurse", "Software Developer", "Truck Driver (NOC 73300)", "Personal Support Worker", "Mechanical Engineer"],
    steps: [
      { title: "1. Identify your NOC code (the foundation of every Canadian permit)", body: "Canada classifies every job by a National Occupation Classification (NOC) code. Find yours at noc.esdc.gc.ca. Your NOC TEER level (0–5) and code determine which permit route you qualify for. TEER 0–3 occupations (managerial, professional, skilled trades) qualify for Express Entry; TEER 4–5 (low-skilled) need LMIA." },
      { title: "2. Pick your route: LMIA, IEC, or Express Entry", body: "LMIA: a Canadian employer proves no Canadian can fill the role, then you get a closed work permit. Fastest if you have a job offer. IEC (International Experience Canada): a youth-mobility programme — currently NOT open to Kenyan passport holders, but worth checking annually. Express Entry: a PR-first route — you apply for permanent residence before arriving, no job offer required." },
      { title: "3. Get your Educational Credential Assessment (ECA)", body: "Required for Express Entry. Submit your highest Kenyan degree/diploma to a designated organisation (WES, IQAS, ICAS, ICES, CES). Cost: CAD 250–400 (KES 30,000–55,000). Takes 6–12 weeks. WES is the most common — apply at wes.org." },
      { title: "4. Pass IELTS General Training (or CELPIP, or TEF for French)", body: "Express Entry requires CLB 7+ in each band (IELTS General: 6.0 listening/writing, 6.0 reading, 6.0 speaking minimum). Higher CRS points for CLB 9+. Test in Nairobi via British Council. Cost: KES 32,000. Validity 2 years." },
      { title: "5. Build your Express Entry profile (or apply for closed LMIA permit)", body: "For Express Entry: build your IRCC profile (free), get a CRS score, wait for draws. Recent draws have cut at CRS 480–540. Add provincial nomination (Ontario, BC, Manitoba) for an extra 600 points. For LMIA route: your employer files the LMIA, you receive a positive decision, you apply for the closed work permit (~CAD 155 + biometrics CAD 85)." },
      { title: "6. Biometrics + IRCC decision + landing", body: "Submit biometrics at VAC Nairobi (CAD 85). Express Entry processing: typically 6 months from Invitation To Apply. Closed work permit: 4–12 weeks. On arrival you 'land' as a PR or worker — your COPR / work permit is activated by CBSA at the port of entry." },
    ],
    faqs: [
      { q: "Do I need a job offer to move to Canada?", a: "For Express Entry — no. You can apply for PR based on your CRS score alone (age, education, language, work experience). For LMIA-based work permits — yes, you need a Canadian employer who can secure a positive LMIA. IEC requires no job offer but is currently unavailable to Kenyan citizens." },
      { q: "What's a competitive CRS score?", a: "Recent Express Entry draws have cut around CRS 480–540 depending on category-based selection. Solo applicants under 30 with a master's degree and CLB 9 English typically land at 470–510. Provincial nominations add 600 points and almost guarantee an ITA." },
      { q: "How much do I actually pay end-to-end?", a: "Express Entry typical total: ECA KES 50k + IELTS KES 32k + IRCC fees CAD 1,365 (KES 165k) + Biometrics KES 10k + medical KES 22k = roughly KES 280,000 for a single applicant. LMIA route is cheaper if the employer covers some fees." },
      { q: "Can I work for ANY employer once I have PR?", a: "Yes. PR is unconditional — you can change jobs, change provinces, study, anything. A closed LMIA work permit binds you to a single employer; you must apply for a new permit to switch. Open work permits (e.g. PGWP for students) are unrestricted." },
      { q: "What's the realistic timeline from start to landing?", a: "Express Entry: 9–14 months from starting paperwork to landing (ECA + IELTS + profile + 6-month processing). LMIA route: 4–8 months from job offer to arrival. IEC was historically 4–6 months but is closed to Kenyans currently." },
    ],
    recommendedServices: [
      { slug: "work_permit_canada_pro", reason: "Full Express Entry profile build + LMIA support drafting — the route is complex and one mistake costs you 6 months" },
      { slug: "work_permit_canada_mid", reason: "Light guide + we pre-fill your IMM 5710/1295 forms and map your work history to NOC codes" },
      { slug: "work_permit_canada_light", reason: "KES 249 entry — LMIA / IEC / Express Entry compared + NOC matching worksheet + IRCC checklist" },
    ],
  },

  "qatar-work-permit-kenya": {
    slug: "qatar-work-permit-kenya",
    flag: "🇶🇦",
    country: "Qatar",
    countrySlug: "qatar",
    pageTitle: "How to Get a Qatar Work Permit from Kenya — 2026 Step-by-Step Guide",
    metaDescription: "Complete 2026 guide for Kenyans applying for a Qatar work permit: MOI Work Visa, Qatar Visa Center Nairobi, QID, attestation, fees, and timeline.",
    primaryKeyword: "qatar work permit for kenyans",
    searchVolume: "~1,500/mo",
    heroHeadline: "How a Kenyan gets a Qatar work permit in 2026 — MOI Work Visa to QID",
    heroSubhead: "Qatar centralised the process at the Qatar Visa Center in Nairobi — your fingerprints and medical now happen BEFORE you fly. Here is exactly how it works.",
    costEstimate: "KES 25,000 – 55,000 from your side (most fees are employer-paid; QVC biometrics + medical are typically employer-covered for legal hires)",
    timeframe: "5–10 weeks from job offer to landed in Qatar",
    topRoles: ["Hospitality (Hotel, Catering)", "Security Guard", "Driver (Light + Heavy)", "Construction & Skilled Trades", "Nurse (Hamad Medical Corp)"],
    steps: [
      { title: "1. Confirm your Qatari employer + job offer in writing", body: "Your Qatari employer (the 'sponsor') drives the entire process. Make sure the offer letter is on company letterhead with: role title, monthly salary (in QAR), accommodation/transport status, contract length, and start date. Without this you cannot proceed." },
      { title: "2. Employer applies for the Work Visa via MOI Qatar", body: "Your sponsor applies for a Work Visa (Visa No. 4) through Qatar's Ministry of Interior via the Hukoomi portal. Approval typically takes 2–4 weeks. Your sponsor emails you the visa approval — this is your trigger to go to the Qatar Visa Center in Nairobi." },
      { title: "3. Visit Qatar Visa Center Nairobi for biometrics + medical", body: "Qatar uniquely requires you to complete biometrics + medical fitness + contract signing IN your home country before the visa is stamped. The Qatar Visa Center (QVC) is at Westlands, Nairobi. Bring: passport, visa approval letter, academic certificate, Good Conduct cert, 4 photos. The medical (chest X-ray + blood tests) happens at the centre. Cost: typically employer-paid (~QAR 1,300 / KES 47,000)." },
      { title: "4. Document attestation in parallel", body: "Your highest academic certificate AND Good Conduct cert must be attested by: (1) Kenyan Ministry of Foreign Affairs, then (2) the Qatari Embassy office (handled via QVC for most hires). Total attestation cost from your side: KES 4,000–8,000 if you do it before QVC visit." },
      { title: "5. Travel to Qatar on the activated Work Visa", body: "After your QVC visit, your Work Visa is activated by MOI Qatar (5–10 days). You receive the visa printout and fly. On arrival at Doha airport, immigration stamps you in — you are now a legal worker with a 30-day window to obtain your QID." },
      { title: "6. Qatar ID (QID / Residence Permit) issuance", body: "Within 30 days of arrival, your sponsor takes you for fingerprinting at MOI Doha and applies for your QID. The QID is your Qatari resident card — it's required for everything: bank, SIM, driving licence, healthcare. Typical issuance: 10–15 days. Your sponsor renews it annually." },
    ],
    faqs: [
      { q: "Why do I have to do medical + biometrics IN Kenya?", a: "Qatar moved this step to home-country processing in 2022 to reduce fraud and ensure medical fitness before travel. The Qatar Visa Center Nairobi is the only authorised centre in Kenya — do NOT use 'agents' claiming to do this elsewhere." },
      { q: "What does the kafala (sponsorship) system mean for me?", a: "Your QID is tied to your sponsor — you can only legally work for them initially. Since 2020 labour reforms, you can change jobs after your probation period without sponsor permission by giving notice and getting a new contract. Qatar's reforms are stronger than most Gulf states." },
      { q: "How much do I actually pay vs the employer?", a: "Reputable Qatari employers pay: Work Visa fees, QVC biometrics + medical (~QAR 1,300), travel, QID. You typically pay only: passport, Good Conduct cert (KES 1,050), some attestation (KES 4-8k), and your own medical-retest if needed. Total from your side: KES 25,000–55,000." },
      { q: "Can my spouse join me on a family visa?", a: "Yes if you earn QAR 10,000+/month (the salary threshold varies by role and changes annually). Family Residence Permits are issued for spouse and children under 25. Domestic workers and lower-wage roles typically don't qualify." },
      { q: "What's the cheapest legitimate route?", a: "Direct hire by a reputable Qatari company (e.g. Qatar Airways, Hamad Medical Corp, large construction firms like ASTAD or Vinci Construction) means almost everything is employer-paid. You spend KES 15-25k on your side. Going via informal agents is illegal and almost always more expensive." },
    ],
    recommendedServices: [
      { slug: "work_permit_qatar_pro", reason: "Our team coordinates with your Qatari sponsor + QVC and handles attestation logistics — for users who want full hand-holding" },
      { slug: "work_permit_qatar_mid", reason: "Light guide + we pre-fill your Hukoomi / MOI forms and prep your QVC appointment" },
      { slug: "work_permit_qatar_light", reason: "KES 249 entry — Qatar Visa Center process + QID flow + sponsorship rules briefing" },
    ],
  },
};

export const GUIDE_SLUGS = Object.keys(GUIDES);
