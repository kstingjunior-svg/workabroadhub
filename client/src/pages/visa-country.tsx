import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Calendar,
  Globe,
  FileText,
  Shield,
  ArrowRight,
  Clock,
  DollarSign,
  ChevronRight,
  Landmark,
  Users,
  Star,
  Briefcase,
  Sparkles,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// ─── Country Data ─────────────────────────────────────────────────────────────
interface Requirement {
  title: string;
  detail: string;
}
interface Step {
  step: number;
  title: string;
  description: string;
  tip?: string;
}
interface OfficialLink {
  label: string;
  url: string;
  note: string;
}
interface FAQ {
  q: string;
  a: string;
}
interface CountryData {
  slug: string;
  name: string;
  flag: string;
  gradient: string;
  heroText: string;
  visaTypes: { name: string; description: string }[];
  overview: string;
  requirements: Requirement[];
  steps: Step[];
  processingTime: string;
  processingNote: string;
  costs: { item: string; amount: string; note?: string }[];
  officialLinks: OfficialLink[];
  faqs: FAQ[];
  keywordTags: string[];
}

const COUNTRIES: Record<string, CountryData> = {
  canada: {
    slug: "canada",
    name: "Canada",
    flag: "🇨🇦",
    gradient: "from-red-600 to-red-700",
    heroText: "Express Entry, LMIA work permits & Provincial Nominee Programs — Canada's multiple immigration pathways make it one of the most accessible destinations for skilled African workers.",
    visaTypes: [
      { name: "Express Entry (Permanent Residence)", description: "Points-based system for skilled workers. Includes Federal Skilled Worker, Canadian Experience Class, and Federal Skilled Trades programs." },
      { name: "LMIA Work Permit (Temporary)", description: "Employer obtains a Labour Market Impact Assessment (LMIA) to hire a foreign worker. Once approved, you apply for a work permit." },
      { name: "Provincial Nominee Program (PNP)", description: "Individual Canadian provinces nominate skilled workers to meet local labour market needs. Often easier to qualify than Express Entry." },
    ],
    overview: "Canada welcomes over 400,000 immigrants per year and actively recruits skilled workers in healthcare, IT, engineering, and trades. The Express Entry system uses a Comprehensive Ranking System (CRS) score to rank candidates — those with the highest scores receive Invitations to Apply (ITAs) in regular draws. For temporary work, an employer must first obtain an LMIA from Employment and Social Development Canada (ESDC) confirming no Canadian worker is available.",
    requirements: [
      { title: "Language Proficiency", detail: "IELTS Academic/General or CELPIP test. Minimum CLB 7 for most Express Entry programs. Test must be within 2 years of your application." },
      { title: "Educational Credential Assessment (ECA)", detail: "Your foreign degree must be assessed by a designated organisation (e.g. WES, ICAS). This is mandatory for Express Entry applications." },
      { title: "Work Experience", detail: "At least 1 year of full-time skilled work experience in the past 10 years (FSWP). Experience must be at NOC TEER 0, 1, 2, or 3." },
      { title: "Job Offer (bonus)", detail: "Not required for Express Entry but adds significant CRS points. LMIA work permits require a confirmed job offer with an approved LMIA." },
      { title: "Proof of Funds", detail: "If applying under FSWP without a Canadian job offer, you must show sufficient settlement funds (e.g. CAD 13,757 for a single applicant in 2024)." },
      { title: "Medical Exam & Police Certificate", detail: "Required for all immigration streams. Medical exam must be performed by a designated panel physician. Police certificates required from each country lived in for 6+ months in the past 10 years." },
    ],
    steps: [
      { step: 1, title: "Take Language Test", description: "Book and write IELTS or CELPIP. Aim for CLB 9+ to maximise your CRS score. Results are valid for 2 years.", tip: "Higher language scores give you significantly more CRS points. Consider retaking if your score is below CLB 9." },
      { step: 2, title: "Get Educational Credential Assessment", description: "Submit your transcripts and degree to WES (World Education Services) or another designated organisation. Takes 7–10 weeks.", tip: "Start this early — it is often the longest step in the process." },
      { step: 3, title: "Create Express Entry Profile", description: "Log in to IRCC and create your profile. Enter your language scores, work experience, ECA results, and other details. Your CRS score is calculated immediately.", tip: "Update your profile whenever your situation changes (new job, higher test score) to maximise your CRS score." },
      { step: 4, title: "Receive Invitation to Apply (ITA)", description: "IRCC runs regular Express Entry draws and invites the highest-scoring candidates. Scores fluctuate — the lowest score invited in 2024 ranged from 470–540+.", tip: "Consider provincial streams which often have lower score requirements than federal draws." },
      { step: 5, title: "Submit Permanent Residence Application", description: "After receiving an ITA, you have 60 days to submit a complete PR application including police certificates, medical exam results, and all supporting documents.", tip: "Prepare all documents before your ITA — 60 days goes fast." },
      { step: 6, title: "Biometrics & Medical Exam", description: "You will be required to provide biometrics at a local Visa Application Centre (VAC). Your panel physician will provide a sealed medical report directly to IRCC." },
      { step: 7, title: "Receive Confirmation of Permanent Residence (COPR)", description: "Once approved, you receive a COPR and a permanent resident visa (if outside Canada). You must land in Canada before the visa expiry date.", tip: "After landing, apply for your PR card. Protect this as it is your proof of residency status." },
    ],
    processingTime: "6–12 months (Express Entry); 2–4 months (LMIA work permit)",
    processingNote: "Express Entry processing targets 6 months for 80% of complete applications. LMIA processing varies by stream (10–15 business days for Global Talent Stream).",
    costs: [
      { item: "Express Entry PR Application (principal applicant)", amount: "CAD 1,325", note: "Includes right of permanent residence fee" },
      { item: "Spouse / partner", amount: "CAD 1,325" },
      { item: "Dependent child", amount: "CAD 230 each" },
      { item: "IELTS / CELPIP test", amount: "KES 28,000–32,000" },
      { item: "WES ECA", amount: "CAD 239" },
      { item: "Medical exam", amount: "~KES 15,000–25,000", note: "Varies by panel physician" },
      { item: "Biometrics fee", amount: "CAD 85 per person (max CAD 170 per family)" },
    ],
    officialLinks: [
      { label: "IRCC — Check Your Eligibility", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility.html", note: "Official Express Entry eligibility tool" },
      { label: "Express Entry — How It Works", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry.html", note: "IRCC main Express Entry page" },
      { label: "WES — Education Assessment", url: "https://www.wes.org/ca/", note: "Most widely accepted ECA provider" },
      { label: "LMIA — For Employers & Workers", url: "https://www.canada.ca/en/employment-social-development/services/foreign-workers.html", note: "ESDC Labour Market Impact Assessment" },
      { label: "Check Draw Results", url: "https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html", note: "Latest Express Entry draw history" },
    ],
    faqs: [
      { q: "Can I apply for Express Entry without a job offer?", a: "Yes. A job offer is not required for Express Entry FSWP or Canadian Experience Class applications, though it does add significant CRS points (50–200 points depending on NOC level)." },
      { q: "How long does it take to get a Canadian PR?", a: "Express Entry targets 6 months for 80% of complete applications from the date of ITA. PNP streams can take 12–18 months total when combined with the Express Entry pool." },
      { q: "Is Kenya eligible for Express Entry?", a: "Yes. Kenya is not on any restricted list and Kenyan applicants are welcome to apply through Express Entry provided they meet the program requirements." },
      { q: "What is the minimum CRS score needed?", a: "The minimum CRS score varies each draw. In 2024, Federal Skilled Worker draws ranged from around 470 to 540+. Category-based draws (e.g. healthcare, STEM) often have lower cut-offs." },
    ],
    keywordTags: ["canada work visa", "express entry kenya", "LMIA work permit", "canadian immigration", "canada PR application"],
  },

  uk: {
    slug: "uk",
    name: "United Kingdom",
    flag: "🇬🇧",
    gradient: "from-blue-700 to-blue-900",
    heroText: "The UK Skilled Worker Visa replaced the Tier 2 visa and allows employers to recruit from anywhere in the world. It is the main work route to the UK for non-EU nationals.",
    visaTypes: [
      { name: "Skilled Worker Visa", description: "For people who have a job offer from a UK Home Office licensed sponsor. Main route for employment in the UK." },
      { name: "Health and Care Worker Visa", description: "For doctors, nurses, and health professionals. Lower visa fees and exempt from Immigration Health Surcharge." },
      { name: "Global Talent Visa", description: "For exceptional talent or promise in academia, research, arts, or digital technology. Requires endorsement from a UK body." },
    ],
    overview: "Since the end of the EU free movement in January 2021, the UK has operated a points-based immigration system. The Skilled Worker Visa requires a job offer from a Home Office licensed sponsor, a role at an eligible skill level (RQF 3+), and a salary meeting the minimum threshold. In 2024, the general salary threshold was raised to £38,700 for most roles (with lower thresholds for shortage occupations and new entrants). The list of licensed sponsors is publicly available on the UK government website.",
    requirements: [
      { title: "Job Offer from Licensed Sponsor", detail: "Your employer must be on the UK government's register of licensed sponsors. They must issue you a Certificate of Sponsorship (CoS) which contains a unique reference number you use in your visa application." },
      { title: "Salary Threshold", detail: "From April 2024, the general salary threshold is £38,700 per year (or the going rate for the specific occupation, whichever is higher). Shortage occupations and new entrants may have lower thresholds. Health & Care visa roles have different thresholds." },
      { title: "Skill Level", detail: "The job must be at RQF Level 3 or above (A-level equivalent). The Standard Occupational Classification (SOC) code for your role must be eligible." },
      { title: "English Language", detail: "Must demonstrate English at B1 level on the CEFR scale or above. Accepted via IELTS for UKVI, degree taught in English, or nationality exemption." },
      { title: "Criminal Record Certificate", detail: "For certain roles (healthcare, working with children), you will need a criminal record check from Kenya and any country where you have lived." },
      { title: "Tuberculosis Test", detail: "Kenya is on the list of countries requiring a TB test certificate from an UKHSA-approved clinic before applying." },
    ],
    steps: [
      { step: 1, title: "Find a Licensed Sponsor Employer", description: "Search the UK government's Register of Licensed Sponsors (available at GOV.UK) for employers who can sponsor Skilled Workers. Apply for jobs directly. Note that the employer — not you — pays the sponsorship licence fee.", tip: "NHS trusts, large UK companies, and universities are common sponsors. Search job boards specifically filtering for 'visa sponsorship'." },
      { step: 2, title: "Receive Certificate of Sponsorship (CoS)", description: "Once hired, your employer assigns you a CoS from their sponsorship allocation. This document contains a unique reference number, start date, job details, and salary. You need this to apply.", tip: "Confirm with your employer that they have enough CoS allocation before accepting the job offer." },
      { step: 3, title: "Apply for Skilled Worker Visa Online", description: "Apply at GOV.UK. You will need your CoS reference number, passport, proof of English, financial evidence (unless employer certified), and payment. The visa application fee varies by duration.", tip: "You can apply up to 3 months before your start date listed on the CoS." },
      { step: 4, title: "Enrol Biometrics at VAC", description: "Book an appointment at the UK Visa Application Centre in Nairobi. Provide fingerprints and a photo. Also submit your TB test certificate and any required supporting documents.", tip: "Book your biometrics appointment as soon as you submit your online application to avoid delays." },
      { step: 5, title: "Receive Decision", description: "Standard applications are decided within 3 weeks of biometrics. Priority (5 working days) and Super Priority (24 hours) services are available at additional cost.", tip: "Track your application online. The decision is sent to the VAC — collect your passport with visa vignette from there." },
      { step: 6, title: "Travel to the UK & Collect BRP", description: "Enter the UK before the start date on your visa. Within 10 days, collect your Biometric Residence Permit (BRP) from a Post Office. This is your proof of right to work." },
    ],
    processingTime: "3–8 weeks (standard). Priority: 5 working days. Super Priority: 24 hours.",
    processingNote: "Decision times vary. The UK government targets 3 weeks for most straightforward applications. Premium services available at additional cost.",
    costs: [
      { item: "Visa application fee (up to 3 years)", amount: "£719", note: "Outside UK" },
      { item: "Visa application fee (over 3 years)", amount: "£1,420", note: "Outside UK" },
      { item: "Immigration Health Surcharge (IHS)", amount: "£1,035 per year", note: "Paid upfront for full visa duration" },
      { item: "Certificate of Sponsorship", amount: "Paid by employer (£239–£1,828)" },
      { item: "IELTS for UKVI", amount: "~KES 30,000" },
      { item: "TB test certificate", amount: "~KES 10,000–15,000" },
      { item: "Priority processing (optional)", amount: "£500 extra" },
    ],
    officialLinks: [
      { label: "UK Skilled Worker Visa — Apply", url: "https://www.gov.uk/skilled-worker-visa", note: "Official GOV.UK application page" },
      { label: "Register of Licensed Sponsors", url: "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers", note: "Find employers who can sponsor you" },
      { label: "Eligible Occupations List", url: "https://www.gov.uk/government/publications/skilled-worker-visa-eligible-occupations", note: "Check if your job qualifies" },
      { label: "Immigration Health Surcharge Calculator", url: "https://www.immigration-health-surcharge.service.gov.uk/checker/type-of-visa", note: "Calculate your IHS payment" },
      { label: "UK Visa Application Centre — Nairobi", url: "https://www.vfsglobal.com/en/individuals/united-kingdom.html", note: "VFS Global — book your biometrics appointment" },
    ],
    faqs: [
      { q: "Does my employer have to pay anything?", a: "Yes. Employers pay the sponsorship licence fee (£536 for small sponsors, £1,476 for large) and the Certificate of Sponsorship fee (£239 per worker for small, £239–£1,828 for large). The Immigration Skills Charge is also usually paid by the employer (£364/yr small, £1,000/yr large)." },
      { q: "Can I bring my family on a Skilled Worker Visa?", a: "Yes. Eligible family members (spouse, civil partner, children under 18) can apply as your dependants. They pay their own visa fee and IHS surcharge. Your salary must meet the financial requirement for dependants (currently £29,000+ for dependants from April 2024)." },
      { q: "Can I switch to another visa or apply for settlement?", a: "After 5 years on a Skilled Worker Visa, you can apply for Indefinite Leave to Remain (ILR — settlement). You must not have spent more than 180 days outside the UK in any 12-month period." },
      { q: "Is my Kenyan degree recognised?", a: "UK employers and the Home Office recognise foreign degrees when they meet the skill level requirement. You do not need a formal credential assessment for the Skilled Worker Visa, but individual employers may require UK NARIC / ENIC verification." },
    ],
    keywordTags: ["uk work visa", "skilled worker visa uk", "uk visa sponsorship", "tier 2 visa kenya", "work in uk from kenya"],
  },

  usa: {
    slug: "usa",
    name: "United States",
    flag: "🇺🇸",
    gradient: "from-blue-600 to-indigo-700",
    heroText: "Multiple US work visa pathways exist — from the H-1B specialty occupation visa to the EB-3 employment-based green card. Understanding which route applies to you is the critical first step.",
    visaTypes: [
      { name: "H-1B (Specialty Occupation)", description: "For professional jobs requiring at least a bachelor's degree or equivalent. Subject to annual lottery cap (85,000 per year)." },
      { name: "O-1 (Extraordinary Ability)", description: "For individuals with exceptional ability in sciences, arts, business, or athletics. No cap and no degree requirement — evidence of extraordinary achievement required." },
      { name: "L-1 (Intracompany Transferee)", description: "For employees transferring within a multinational company to a US branch. Requires 1 year of qualifying employment abroad." },
      { name: "EB-3 (Employment-Based PR)", description: "Employer-sponsored permanent residency for skilled workers, professionals, and unskilled workers. Leads directly to a green card." },
      { name: "DV Lottery (Green Card Lottery)", description: "55,000 diversity immigrant visas issued yearly to eligible nationalities by random draw. See our dedicated Green Card Guide." },
    ],
    overview: "The US immigration system is employer-driven — for most work visas, you need a US employer to file a petition on your behalf. The H-1B is the most common work visa for professionals but is capped at 85,000 annually and oversubscribed (lottery applies). Alternatives include the O-1 for exceptional talent and L-1 for multinationals. The EB-3 leads to permanent residency but processing can take years due to per-country backlogs. Kenyan nationals generally have shorter EB-3 wait times than Indian or Chinese nationals.",
    requirements: [
      { title: "Employer Sponsorship", detail: "Required for H-1B, L-1, and EB-3. The US employer files the petition with USCIS. You cannot self-petition for H-1B. Finding a US employer willing to sponsor is the biggest barrier." },
      { title: "H-1B: Bachelor's Degree in Specialty", detail: "Your job must be a 'specialty occupation' requiring a bachelor's degree or higher in a specific field. IT, engineering, finance, and healthcare are common eligible fields." },
      { title: "H-1B Lottery Registration", detail: "If cap-subject, USCIS runs a lottery in March each year. Your employer's attorney registers you electronically (fee: $10). Selected registrants are invited to file full H-1B petitions." },
      { title: "Prevailing Wage", detail: "Employer must pay at least the prevailing wage for the role and location as determined by the Department of Labor. This prevents wage suppression of US workers." },
      { title: "EB-3: PERM Labour Certification", detail: "Before sponsoring you for EB-3, the employer must complete PERM (Programme Electronic Review Management) — advertising the job to prove no qualified US worker is available." },
      { title: "No Immigrant Intent (Non-Immigrant Visas)", detail: "For H-1B and other non-immigrant visas, you must demonstrate ties to your home country. However, H-1B has 'dual intent' — you can have immigrant intent while on H-1B." },
    ],
    steps: [
      { step: 1, title: "Find a US Employer Willing to Sponsor", description: "Search US job boards (LinkedIn, Indeed, H1BGrader) filtering for 'visa sponsorship'. Large tech companies, hospitals, and universities are the most common H-1B sponsors.", tip: "Target companies with a history of H-1B sponsorship. H1BGrader.com shows public USCIS sponsorship data." },
      { step: 2, title: "H-1B: Employer Registers in March Lottery", description: "Your employer's immigration attorney registers your profile in the USCIS H-1B lottery between March 1–18 (approximate). Results are announced in April.", tip: "If not selected in the H-1B lottery, explore O-1, L-1 (if eligible), TN (for Canadians/Mexicans), or EB-3 pathways with your employer." },
      { step: 3, title: "Employer Files I-129 Petition with USCIS", description: "If selected, the employer has 90 days to file the full H-1B petition (Form I-129) with supporting documents. Standard processing: 3–6 months. Premium processing (I-907): 15 business days for $2,805 extra.", tip: "Premium processing is strongly recommended to get certainty on your start date." },
      { step: 4, title: "USCIS Approves Petition", description: "USCIS issues an I-797 Approval Notice. This is not a visa — it is the approval for the employer to employ you. You still need to obtain the actual H-1B visa stamp at a US consulate." },
      { step: 5, title: "Apply for H-1B Visa at US Embassy Nairobi", description: "Complete DS-160 online. Pay IVI fee ($185). Schedule and attend visa interview at the US Embassy in Nairobi with your I-797, job offer, degree certificates, and supporting documents.", tip: "Interview wait times at US Embassy Nairobi can vary — book your interview as soon as USCIS approves your petition." },
      { step: 6, title: "Travel to the USA & Begin Work", description: "Enter the US on or after your H-1B start date (usually October 1 for cap-subject H-1Bs). Your I-94 arrival record is your authorisation to remain and work.", tip: "Ensure your employer has everything ready for your start — I-9 employment eligibility verification must be completed within 3 days of starting." },
    ],
    processingTime: "H-1B: 3–6 months (standard) / 15 business days (premium). EB-3: 1–10+ years depending on priority date.",
    processingNote: "H-1B lottery selection is in April, petitions filed April–June, standard processing 3–6 months, cap-subject H-1Bs start October 1. EB-3 timelines depend heavily on the Visa Bulletin priority dates.",
    costs: [
      { item: "H-1B I-129 filing fee", amount: "$460–$730", note: "Paid by employer" },
      { item: "ACWIA Training Fee", amount: "$750–$1,500", note: "Paid by employer" },
      { item: "Fraud Prevention & Detection Fee", amount: "$500", note: "Paid by employer" },
      { item: "Premium Processing (I-907) — optional", amount: "$2,805", note: "15 business days USCIS processing" },
      { item: "DS-160 Visa Application Fee (MRV)", amount: "$185" },
      { item: "SEVIS fee (if applicable)", amount: "$200" },
      { item: "EB-3 PERM + I-140 (employer)", amount: "$700–$5,000+", note: "Legal + government fees" },
    ],
    officialLinks: [
      { label: "USCIS — H-1B Specialty Occupation Workers", url: "https://www.uscis.gov/working-in-the-united-states/temporary-workers/h-1b-specialty-occupation-workers", note: "Official H-1B program information" },
      { label: "US Embassy Nairobi — Visa Appointments", url: "https://ke.usembassy.gov/visas/", note: "Book your nonimmigrant visa interview" },
      { label: "DS-160 Visa Application Form", url: "https://ceac.state.gov/genniv/", note: "Online nonimmigrant visa application" },
      { label: "DV Lottery — Official Entry", url: "https://dvprogram.state.gov", note: "Free DV Lottery entry — see our full Green Card Guide" },
      { label: "Department of Labor — Prevailing Wage", url: "https://flag.dol.gov/wage-data/wage-library", note: "Check the prevailing wage for your occupation and location" },
    ],
    faqs: [
      { q: "What if I don't get selected in the H-1B lottery?", a: "Consider cap-exempt employers (universities, non-profits, government research labs), the O-1 visa for exceptional ability, L-1 (if you work for a multinational), or the EB-3 employment-based green card path which bypasses the H-1B cap." },
      { q: "Can I change jobs on an H-1B?", a: "Yes — this is called 'H-1B portability' (AC21). Once your I-485 has been pending for 180+ days, or using H-1B transfer, you can change employers within the same or similar occupational category." },
      { q: "How long does H-1B last?", a: "Initial period of 3 years, extendable to 6 years. After 6 years, you can get extensions if an EB-3 or EB-2 I-140 has been approved for you." },
      { q: "Is the USA work visa process too hard for Kenyans?", a: "The H-1B lottery makes it competitive, but it is possible — especially for IT, healthcare, and engineering professionals. Many Kenyan professionals are successfully working in the US on H-1B visas. Alternatively, the DV Lottery is free and gives 55,000 green cards yearly." },
    ],
    keywordTags: ["usa work visa kenya", "h1b visa africa", "us immigration guide", "america work permit", "green card application"],
  },

  germany: {
    slug: "germany",
    name: "Germany",
    flag: "🇩🇪",
    gradient: "from-gray-800 to-yellow-600",
    heroText: "Germany is actively tackling a skilled worker shortage through new laws that make it easier than ever for non-EU nationals to live and work there. The Job Seeker Visa lets you move to Germany and find work before you even have a job offer.",
    visaTypes: [
      { name: "Job Seeker Visa", description: "6-month visa to travel to Germany and search for work on the ground. You must have a recognised qualification and proof of funds. No job offer required to enter." },
      { name: "EU Blue Card", description: "For highly qualified professionals with a German university degree or recognised foreign degree. Job offer required with a salary of at least €45,300/year (€41,041.80 for shortage occupations in 2024)." },
      { name: "General Employment Visa (§ 18 AufenthG)", description: "For skilled workers with a recognised qualification and a concrete job offer from a German employer. Covers most trades and technical professions." },
      { name: "Opportunity Card (Chancenkarte)", description: "New from June 2024 — a points-based system allowing skilled workers to enter Germany for 1 year to look for work, even without a fully recognised qualification." },
    ],
    overview: "Germany introduced major immigration reforms with the Skilled Immigration Act (Fachkräfteeinwanderungsgesetz) that came into full force in 2024. The most important change is the Opportunity Card (Chancenkarte) — a points-based system allowing individuals with relevant skills to enter Germany and job-search for up to a year, even without a recognised qualification. The Job Seeker Visa (6 months) remains an option for those with recognised qualifications. For those who already have a job offer, the EU Blue Card (for high earners) or General Employment Visa are the fastest routes.",
    requirements: [
      { title: "Recognised Qualification", detail: "Your degree or vocational qualification must be recognised in Germany. Use anabin database (anabin.kmk.org) or ANABIN status, or apply for recognition through the Recognition in Germany portal. Process can take 3–6 months." },
      { title: "Job Offer (Employment Visa & EU Blue Card)", detail: "The General Employment Visa and EU Blue Card require a signed employment contract or binding job offer from a German employer. The role must be commensurate with your qualification." },
      { title: "EU Blue Card Salary", detail: "Job offer salary must be at least €45,300 gross/year (2024). For shortage occupations (IT, engineering, medicine, mathematics) the threshold is lower: €41,041.80." },
      { title: "German Language (Job Seeker)", detail: "Not required at the visa stage but strongly recommended for your job search in Germany. Most employers outside tech multinationals expect conversational German (B1–B2)." },
      { title: "Proof of Funds", detail: "Job Seeker Visa and Opportunity Card: you must show you can finance yourself for the stay (~€1,027/month, equivalent to BAföG rate). Bank statements or a blocked account (Sperrkonto) accepted." },
      { title: "Health Insurance", detail: "You must have comprehensive health insurance valid in Germany for the duration of your stay. German statutory health insurance (GKV) kicks in when you start employed work." },
    ],
    steps: [
      { step: 1, title: "Check and Apply for Qualification Recognition", description: "Go to www.anerkennung-in-deutschland.de to check if your profession requires recognition and start the process. Some professions (doctor, nurse, engineer) are regulated and require official recognition before you can work.", tip: "This is often the longest step — start it months before you plan to travel. Keep all original certificates." },
      { step: 2, title: "Open a Blocked Sperrkonto (if no job offer yet)", description: "For Job Seeker Visa or Opportunity Card, you need proof of financial capacity. A German Sperrkonto (blocked account) held at Coracle, Expatrio, or Deutsche Bank satisfies this requirement.", tip: "Coracle and Expatrio offer online Sperrkonto setup for non-residents. Takes about 1 week." },
      { step: 3, title: "Apply at German Embassy Nairobi", description: "Book an appointment at the German Embassy in Nairobi. Submit your national visa application form, passport, proof of qualification recognition (or pending recognition), proof of funds, health insurance, and motivation letter.", tip: "Appointment slots fill up fast. Book as early as possible — sometimes months in advance." },
      { step: 4, title: "Receive National Visa (D-Visa)", description: "The national visa is valid for 6 months and allows entry into Germany. Travel to Germany and register your address (Anmeldung) at your local Residents' Registration Office (Einwohnermeldeamt) within 14 days of arrival.", tip: "You cannot start working until you have the correct permit — make sure your visa allows employment before accepting a job." },
      { step: 5, title: "Apply for Residence Permit at Local Foreigners' Authority", description: "Within the validity of your national visa, apply at the local Ausländerbehörde for the appropriate residence title (EU Blue Card, Skilled Worker, etc.). Present your employment contract and other documents.", tip: "Join the queue early — Ausländerbehörde offices in cities like Berlin and Frankfurt can have long waiting times." },
      { step: 6, title: "Begin Work with Residence Permit", description: "Once your residence permit is issued, you are authorised to work in Germany in the specified field. EU Blue Card holders gain the right to permanent residence after 27 months (21 months with B1 German)." },
    ],
    processingTime: "German Embassy: 2–8 weeks. EU Blue Card residence permit (after arrival): 4–8 weeks.",
    processingNote: "Embassy processing varies by application type and current workload. Qualification recognition processes should be started 3–6 months before your planned travel date.",
    costs: [
      { item: "National Visa (D-Visa) application", amount: "€75" },
      { item: "Qualification recognition application", amount: "€100–€600", note: "Varies by authority and profession" },
      { item: "Sperrkonto (blocked account) deposit", amount: "~€12,000–€14,000", note: "Your money — released monthly once you arrive" },
      { item: "Translation of documents (certified)", amount: "~KES 5,000–20,000 per document" },
      { item: "Health insurance (during job search)", amount: "~€120–€200/month" },
      { item: "Opportunity Card application", amount: "€100", note: "New from June 2024" },
    ],
    officialLinks: [
      { label: "Make It in Germany — Official Portal", url: "https://www.make-it-in-germany.com/en/", note: "German government's official skilled immigration portal" },
      { label: "Recognition in Germany", url: "https://www.anerkennung-in-deutschland.de/en/", note: "Check and apply for qualification recognition" },
      { label: "German Embassy Nairobi — Visas", url: "https://nairobi.diplo.de/ke-en/services/01-visa/-/2399628", note: "Official visa page for German Embassy in Nairobi" },
      { label: "anabin — Qualification Database", url: "https://anabin.kmk.org/", note: "Check the recognition status of your foreign degree" },
      { label: "EU Blue Card Germany", url: "https://www.make-it-in-germany.com/en/visa-residence/types/eu-blue-card", note: "Official EU Blue Card information and eligibility" },
    ],
    faqs: [
      { q: "Do I need to speak German to work in Germany?", a: "For many IT and international companies: no — English is often sufficient. However, for most other sectors (nursing, engineering, trades), German language skills at B1–B2 level are expected by employers. Learning German significantly expands your options." },
      { q: "What is the Opportunity Card?", a: "Introduced June 2024, the Opportunity Card (Chancenkarte) is a 1-year residence permit for job searching in Germany. It uses a points system (qualification, age, language skills, work experience). You do not need a recognised qualification if you score enough points through other factors." },
      { q: "Can my family come with me?", a: "Yes. Spouses and children can join you under family reunification provisions. EU Blue Card holders can bring family immediately. For other permits, family reunification is possible but subject to conditions including accommodation and sufficient income." },
      { q: "How long until I can get permanent residency?", a: "EU Blue Card holders: 27 months (or 21 months with B1 German). General Skilled Worker visa holders: usually 4 years. After 8 years, you can apply for German citizenship." },
    ],
    keywordTags: ["germany work visa", "EU blue card", "job seeker visa germany", "work in germany from kenya", "german immigration guide"],
  },

  uae: {
    slug: "uae",
    name: "United Arab Emirates",
    flag: "🇦🇪",
    gradient: "from-green-600 to-emerald-700",
    heroText: "The UAE is the most popular destination for Kenyan professionals. Tax-free salaries, modern infrastructure, and a streamlined employer-sponsored visa process make it accessible for skilled workers across all sectors.",
    visaTypes: [
      { name: "Employment Visa (Sponsored by Employer)", description: "Standard work visa tied to your employer. The employer (company or individual) sponsors you. Valid for 2 years, renewable." },
      { name: "Green Visa (Self-Sponsored)", description: "5-year renewable residence visa for skilled employees, freelancers, and self-employed individuals. No employer sponsor required after approval. Minimum salary AED 15,000/month for employees." },
      { name: "Golden Visa (10-Year)", description: "Long-term residence for investors, entrepreneurs, specialists, outstanding students, and humanitarians. Most skilled workers qualify through the 'specialists' or 'skilled employees' categories." },
    ],
    overview: "The UAE does not have a points-based immigration system — the standard route is via an employer who sponsors your employment visa. The Federal Authority for Identity, Citizenship, Customs and Ports Security (ICP) and the Ministry of Human Resources and Emiratisation (MoHRE) jointly manage work permits. In recent years, the UAE introduced the Green Visa and Golden Visa as self-sponsored long-term options. Kenya has a large professional community in the UAE — healthcare workers, engineers, teachers, hospitality professionals, and domestic workers are all present in large numbers.",
    requirements: [
      { title: "Job Offer from UAE Employer", detail: "For the Employment Visa, you need a signed job offer or employment contract from a UAE company or individual. The employer initiates the Entry Permit application on your behalf." },
      { title: "Educational Certificate Attestation", detail: "Your degree and relevant certificates must be attested by the Kenyan Government (Ministry of Foreign Affairs) AND the UAE Embassy in Nairobi before use in the UAE." },
      { title: "Medical Fitness Test", detail: "Required in the UAE after arrival. Tests for TB, hepatitis B, leprosy, and HIV. Conducted at approved government health centres. You receive a Medical Fitness Certificate." },
      { title: "Emirates ID Application", detail: "All residents must register for an Emirates ID (national identity card) with the ICP. Required for almost all official transactions in the UAE." },
      { title: "Green Visa: Salary & Skill Level", detail: "For employed residents: salary of at least AED 15,000/month AND employment at skill level 1, 2, or 3 (per the UAE's classification). Or you can qualify as a freelancer with a freelance permit and income proof." },
      { title: "Clean Criminal Record", detail: "UAE authorities conduct background checks. A criminal record can result in visa denial. Some employers also require a police clearance certificate from Kenya before offering a job." },
    ],
    steps: [
      { step: 1, title: "Secure a Job Offer in the UAE", description: "Apply for UAE-based jobs through LinkedIn, Bayt.com, GulfTalent, and Naukrigulf. UAE employers are accustomed to hiring from abroad. Confirm the role is above-board — verify the company using the UAE government's business registry (DED website).", tip: "Verify any job offer before signing. Scammers impersonate real UAE companies. See our Job Scam Checker tool." },
      { step: 2, title: "Employer Applies for Entry Permit", description: "Your employer's PRO (Public Relations Officer) applies for an Employment Entry Permit through the ICP or MOHRE portal. This is the pre-visa that allows you to enter the UAE.", tip: "Entry permits are typically valid for 60 days from issue. Travel before it expires." },
      { step: 3, title: "Attest Your Documents in Kenya", description: "Get your degree, police clearance, and other documents attested: (1) Kenya Ministry of Foreign Affairs, (2) UAE Embassy in Nairobi. This is mandatory before submitting them in the UAE.", tip: "Use a professional attestation agent in Nairobi to save time. Budget 1–2 weeks for attestation." },
      { step: 4, title: "Travel to the UAE on Entry Permit", description: "Fly to the UAE. At the port of entry, your Entry Permit is used. You now have 60 days to complete your medical test, Emirates ID registration, and convert to a full residency visa.", tip: "Bring original attested documents and passport copies — you'll need them at multiple government offices." },
      { step: 5, title: "Complete Medical Fitness Test", description: "Book a medical test at a MOHAP-approved health centre in the UAE. Bring passport, Entry Permit copy, and passport-size photos. Results in 1–3 days.", tip: "Some employers arrange this for you. Confirm with your HR before booking." },
      { step: 6, title: "Apply for Emirates ID & Residency Visa", description: "Your employer's PRO submits your biometrics, medical certificate, and documents to ICP for residency visa stamping in your passport and Emirates ID issuance. Residency visa valid for 2 years, renewable.", tip: "Keep your Emirates ID safe — it is required to open a bank account, get a SIM card, sign a lease, and much more." },
    ],
    processingTime: "Entry Permit: 3–7 business days. Full residency visa: 2–4 weeks after arrival.",
    processingNote: "Processing is generally fast in the UAE. Some free zones (DMCC, DIFC) have their own visa procedures which can be faster. The Medical Fitness Certificate typically takes 1–3 days.",
    costs: [
      { item: "Employment Entry Permit", amount: "AED 220–350", note: "Usually paid by employer" },
      { item: "Medical Fitness Test", amount: "AED 320–380", note: "Government health centre" },
      { item: "Emirates ID", amount: "AED 370 (2 years)" },
      { item: "Residency Visa Stamping", amount: "AED 500–1,000", note: "Includes visa fees and services" },
      { item: "Document Attestation (Kenya)", amount: "~KES 5,000–20,000 per document" },
      { item: "Green Visa (self-sponsored)", amount: "AED 2,850 (5 years)" },
      { item: "Golden Visa", amount: "AED 2,800–5,000" },
    ],
    officialLinks: [
      { label: "ICP — Federal Authority for Identity & Citizenship", url: "https://icp.gov.ae/", note: "Apply for residency, Emirates ID and entry permits" },
      { label: "MoHRE — Ministry of Human Resources", url: "https://www.mohre.gov.ae/", note: "Work permits, labour rights, and employment contracts" },
      { label: "GDRFA Dubai — Residency Services", url: "https://gdrfad.gov.ae/", note: "Dubai-specific residency and visa services" },
      { label: "UAE Embassy Nairobi", url: "https://www.mofaic.gov.ae/en/embassies/nairobi", note: "Document attestation and visa information from Kenya" },
      { label: "Verify UAE Companies (DED)", url: "https://www.dubaided.gov.ae/", note: "Check legitimacy of a Dubai company before accepting an offer" },
    ],
    faqs: [
      { q: "Can I change jobs in the UAE?", a: "Yes. Under UAE labour law reform in 2022, workers can change jobs without their employer's consent after completing 6 months of employment, provided they give notice as required by their contract. The old 'employer ban' system has been largely abolished." },
      { q: "What is the difference between a Green Visa and an Employment Visa?", a: "The Employment Visa ties you to your employer — if you lose or change jobs, you have a grace period (typically 60 days) to find a new sponsor. The Green Visa (5 years) is not tied to any employer — it gives you freedom to work for anyone, freelance, or even be between jobs." },
      { q: "Is there income tax in the UAE?", a: "No personal income tax in the UAE for most individuals. This is a major draw — your gross salary is effectively your take-home pay. A 9% corporate tax was introduced in 2023 but does not affect employee salaries." },
      { q: "Can domestic workers get UAE visas?", a: "Yes. Domestic workers (housemaids, nannies, drivers) are sponsored under a separate domestic worker visa by the individual household employer. The UAE has introduced minimum wage protections and a standard contract for domestic workers." },
    ],
    keywordTags: ["uae work visa", "dubai visa kenya", "UAE employment visa", "work in dubai from kenya", "green visa UAE"],
  },
};

const conversionServices = [
  { icon: FileText, title: "CV Rewrite for This Country", href: "/services", badge: "Career Service", badgeColor: "bg-blue-100 text-blue-700" },
  { icon: Users, title: "1-on-1 WhatsApp Consultation", href: "/services", badge: "Consultation", badgeColor: "bg-teal-100 text-teal-700" },
  { icon: Sparkles, title: "Pro Plan — All Tools", href: "/pricing", badge: "KES 4,500", badgeColor: "bg-purple-100 text-purple-700" },
];

export default function VisaCountryPage() {
  const params = useParams<{ country: string }>();
  const { user } = useAuth();
  const country = COUNTRIES[params.country?.toLowerCase() ?? ""];

  // ── 404 for unknown countries ────────────────────────────────────────────
  if (!country) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <Globe className="h-12 w-12 text-gray-400" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Country Not Found</h1>
        <p className="text-gray-500">We don't have a visa guide for that country yet.</p>
        <Link href="/visa-guides">
          <Button className="bg-blue-600 text-white hover:bg-blue-700">
            Browse All Visa Guides <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  const seoTitle = `${country.name} Work Visa Guide 2025 | WorkAbroad Hub`;
  const seoDesc = `Complete ${country.name} work visa guide: eligibility, application steps, processing times, costs, and official embassy links. Free resource for Kenyan applicants.`;

  return (
    <>
      <title>{seoTitle}</title>
      <meta name="description" content={seoDesc} />
      <meta name="keywords" content={country.keywordTags.join(", ")} />
      <meta property="og:title" content={seoTitle} />
      <meta property="og:description" content={seoDesc} />
      <meta property="og:type" content="article" />
      <meta name="robots" content="index, follow" />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <div className={`bg-gradient-to-br ${country.gradient} text-white`}>
          <div className="max-w-4xl mx-auto px-4 py-12 md:py-20">
            <nav className="flex items-center gap-2 text-white/70 text-sm mb-6" aria-label="Breadcrumb">
              <Link href="/">
                <span className="hover:text-white transition-colors cursor-pointer">Home</span>
              </Link>
              <ChevronRight className="h-3 w-3" />
              <Link href="/visa-guides">
                <span className="hover:text-white transition-colors cursor-pointer">Visa Guides</span>
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-white font-medium">{country.name}</span>
            </nav>

            <div className="flex items-center gap-4 mb-5">
              <span className="text-5xl" role="img" aria-label={country.name}>{country.flag}</span>
              <Badge className="bg-white/20 text-white border-white/30 text-sm px-3 py-1">
                Work Visa & Immigration Guide
              </Badge>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-3">
              {country.name} Visa Guide
            </h1>
            <p className="text-2xl font-medium opacity-80 mb-4">{country.visaTypes[0].name}</p>
            <p className="text-white/80 text-lg max-w-2xl leading-relaxed mb-8">{country.heroText}</p>

            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2 text-white/80">
                <Clock className="h-4 w-4 text-white/60" />
                <span className="text-sm">Processing: <strong className="text-white">{country.processingTime.split(";")[0]}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-white/80">
                <DollarSign className="h-4 w-4 text-white/60" />
                <span className="text-sm">From: <strong className="text-white">{country.costs[0].amount}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Disclaimer ───────────────────────────────────────── */}
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 font-medium">
              <strong>Disclaimer:</strong> This platform is not affiliated with any embassy or government.
              Information is for guidance only — verify all details with the official government website for {country.name}.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-10 space-y-12">

          {/* ── Visa Types Overview ───────────────────────────── */}
          <section aria-labelledby="overview-heading">
            <h2 id="overview-heading" className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Globe className="h-6 w-6 text-blue-600" />
              Overview — {country.name} Work Visa Options
            </h2>
            <Card className="mb-6">
              <CardContent className="p-6 text-gray-700 dark:text-gray-300 leading-relaxed text-sm">
                {country.overview}
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
              {country.visaTypes.map((vt) => (
                <Card key={vt.name} className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">{vt.name}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed">{vt.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Requirements ─────────────────────────────────── */}
          <section aria-labelledby="requirements-heading">
            <h2 id="requirements-heading" className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              Eligibility Requirements
            </h2>
            <div className="space-y-3">
              {country.requirements.map((req) => (
                <Card key={req.title} className="border-l-4 border-l-green-500">
                  <CardContent className="p-5">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1 text-sm">{req.title}</h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{req.detail}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Application Steps ────────────────────────────── */}
          <section aria-labelledby="steps-heading">
            <h2 id="steps-heading" className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <FileText className="h-6 w-6 text-blue-600" />
              Application Steps
            </h2>
            <div className="space-y-4">
              {country.steps.map((s) => (
                <Card key={s.step}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                        {s.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{s.title}</h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-3">{s.description}</p>
                        {s.tip && (
                          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                            <p className="text-amber-800 dark:text-amber-200 text-xs font-medium">{s.tip}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Processing Time & Cost ────────────────────────── */}
          <section>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    Processing Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-semibold text-gray-900 dark:text-white mb-1">{country.processingTime}</p>
                  <p className="text-sm text-gray-500">{country.processingNote}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    Cost Estimate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {country.costs.map((c) => (
                      <div key={c.item} className="flex items-start justify-between gap-2 text-sm">
                        <span className="text-gray-600 dark:text-gray-400 flex-1 min-w-0">{c.item}</span>
                        <span className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">{c.amount}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-3">* Costs are approximate and subject to change. Verify with official sources.</p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── Official Links ────────────────────────────────── */}
          <section aria-labelledby="official-links-heading">
            <h2 id="official-links-heading" className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Landmark className="h-6 w-6 text-teal-600" />
              Official Government Links
            </h2>
            <div className="space-y-3">
              {country.officialLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group"
                  data-testid={`link-official-${link.label.toLowerCase().replace(/\s+/g, "-").slice(0, 30)}`}
                >
                  <div>
                    <p className="font-medium text-blue-600 group-hover:text-blue-700 text-sm">{link.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{link.note}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-blue-500 flex-shrink-0 transition-colors" />
                </a>
              ))}
            </div>
          </section>

          {/* ── FAQ ──────────────────────────────────────────── */}
          <section aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-teal-600" />
              Frequently Asked Questions
            </h2>
            <Card>
              <CardContent className="p-0">
                <Accordion type="single" collapsible>
                  {country.faqs.map((faq, i) => (
                    <AccordionItem key={i} value={`faq-${i}`}>
                      <AccordionTrigger className="px-6 text-left font-medium text-gray-900 dark:text-white hover:no-underline text-sm">
                        {faq.q}
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-4 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </section>

          {/* ── Conversion: Need Help? ───────────────────────── */}
          <section>
            <div className="bg-gradient-to-r from-blue-600 to-teal-600 rounded-2xl p-8 text-white mb-6">
              <Badge className="bg-white/20 text-white border-white/30 mb-4">Need Help Applying?</Badge>
              <h2 className="text-xl font-bold mb-2">Let Our Experts Help You Land in {country.name}</h2>
              <p className="text-blue-100 text-sm mb-5 max-w-md">
                Our consultants have helped thousands of Kenyan professionals navigate the visa process.
                From CV optimisation to interview coaching — we've got you covered.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/services">
                  <Button className="bg-white text-blue-700 hover:bg-blue-50 font-bold" data-testid="button-country-services">
                    Browse Services <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button variant="outline" className="border-white/50 text-white hover:bg-white/10" data-testid="button-country-pricing">
                    View Plans
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {conversionServices.map((svc) => (
                <Link key={svc.title} href={svc.href}>
                  <Card
                    className="cursor-pointer hover:shadow-md hover:border-blue-300 transition-all h-full"
                    data-testid={`card-service-${svc.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <CardContent className="p-5 flex flex-col h-full">
                      <div className="flex items-start justify-between mb-3">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                          <svc.icon className="h-5 w-5 text-blue-600" />
                        </div>
                        <Badge className={`text-xs ${svc.badgeColor}`}>{svc.badge}</Badge>
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1 text-sm">{svc.title}</h3>
                      <div className="flex items-center gap-1 mt-auto pt-3 text-blue-600 text-sm font-medium">
                        Get started <ArrowRight className="h-4 w-4" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {!user && (
              <div className="mt-6 text-center">
                <p className="text-gray-500 text-sm mb-3">Create a free account to access all career tools</p>
                <a href="/api/login">
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8" data-testid="button-signup-visa-country">
                    Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              </div>
            )}
          </section>

          {/* ── Other Country Guides ──────────────────────────── */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Other Country Guides</h2>
            <div className="flex flex-wrap gap-2">
              {Object.values(COUNTRIES)
                .filter((c) => c.slug !== country.slug)
                .map((c) => (
                  <Link key={c.slug} href={`/visa/${c.slug}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-sm"
                      data-testid={`link-other-country-${c.slug}`}
                    >
                      {c.flag} {c.name}
                    </Button>
                  </Link>
                ))}
              <Link href="/green-card">
                <Button variant="outline" size="sm" className="text-sm" data-testid="link-other-green-card">
                  🇺🇸 Green Card (DV Lottery)
                </Button>
              </Link>
            </div>
          </section>

          {/* ── Legal Disclaimer ──────────────────────────────── */}
          <section className="bg-gray-100 dark:bg-gray-900 rounded-xl p-5 text-sm text-gray-500 dark:text-gray-400">
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Important Disclaimer
            </p>
            <p>
              WorkAbroad Hub is not affiliated with the {country.name} government, its immigration authorities, or any embassy or consulate.
              This guide is for general informational purposes only and may not reflect the most recent policy changes.
              Always consult the official {country.name} government immigration website and seek qualified immigration legal advice before submitting any visa application.
              Use of this page does not create a consultant or legal advisory relationship.
            </p>
          </section>

        </div>
      </div>
    </>
  );
}
