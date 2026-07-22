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

  // ── LUXEMBOURG — 2026-07 (Tony's request) ──────────────────────────────
  luxembourg: {
    slug: "luxembourg",
    name: "Luxembourg",
    flag: "🇱🇺",
    gradient: "from-sky-500 to-red-600",
    heroText: "One of the highest-paying EU markets with the highest minimum wage in Europe. Luxembourg's Salaried Worker Permit and EU Blue Card give Kenyan professionals a clear route to legal residence in an English-friendly, multilingual financial hub.",
    visaTypes: [
      { name: "Authorisation to Stay for Salaried Work", description: "Standard employer-sponsored work permit for non-EU workers. Requires a signed employment contract from a Luxembourg employer and labour-market test approval." },
      { name: "EU Blue Card (Luxembourg)", description: "For highly qualified workers with a recognised university degree AND a salary offer of at least €78,336/year (2025 threshold, updated yearly). Faster route to permanent residence than the standard permit." },
      { name: "Investor Visa (Highly Qualified / Self-Employed)", description: "For entrepreneurs and self-employed professionals with a viable business plan and sufficient capital. Application via the Ministry of Foreign Affairs." },
    ],
    overview: "Luxembourg is one of the wealthiest countries per capita in the world with the highest minimum wage in the EU (approximately €2,637/month for qualified workers in 2025). The workforce is 47% foreign, meaning employers are experienced with third-country hires. English is widely used in finance, tech, and international institutions, but French, German, and Luxembourgish are the official languages. The main route is employer sponsorship: a Luxembourg employer must offer you a job, pass a labour-market test (the role must first be offered to EU candidates), and apply for your authorisation to stay before you travel. Once approved, you enter Luxembourg on a Type D visa and register with the local commune within 3 days of arrival.",
    requirements: [
      { title: "Signed Job Offer from Luxembourg Employer", detail: "A written employment contract from a Luxembourg-registered company or public body is mandatory before starting the process. The employer initiates most of the paperwork." },
      { title: "Recognised Educational Qualifications", detail: "Your degree must be recognised in Luxembourg. For regulated professions (medicine, law, teaching, engineering) apply for recognition via the Ministry of Higher Education. For the EU Blue Card, a university degree of at least 3 years is required." },
      { title: "Salary Threshold (Blue Card Route)", detail: "For the EU Blue Card in 2025: €78,336 gross per year for standard roles; €62,668/year for shortage occupations (IT, science, engineering, medicine). Check the latest thresholds on guichet.lu." },
      { title: "Health Insurance", detail: "Luxembourg has mandatory health insurance (CNS). Employees are auto-enrolled through their employer. Bring proof of any existing coverage for the visa application." },
      { title: "Certificate of Good Conduct (Kenya DCI)", detail: "Required from the Kenyan Directorate of Criminal Investigations. Must be translated into French or German and legalised (apostille + Luxembourg embassy if needed)." },
      { title: "Proof of Accommodation", detail: "You must show where you will live in Luxembourg — usually a signed rental contract or a signed accommodation certificate from your employer. Required at commune registration within 3 days of arrival." },
    ],
    steps: [
      { step: 1, title: "Secure a Job Offer with a Luxembourg Employer", description: "Apply for roles through JobFinder.lu, LinkedIn Luxembourg, Moovijob, and directly on employer career pages. Finance (banks, funds), IT, healthcare, engineering, and shared-services roles have the strongest hiring pipeline for third-country candidates.", tip: "Luxembourg has a small population (~660k) — hiring managers respond faster than in the UK or Germany. Tailor every CV to the specific role." },
      { step: 2, title: "Employer Requests a Certificate of Non-Objection", description: "Your employer applies to the Immigration Directorate (Direction de l'Immigration, MAEE) for a temporary authorisation to stay (autorisation de séjour). The Luxembourg labour agency ADEM first checks whether an EU candidate is available for the role.", tip: "Blue Card applications skip the labour-market test if the salary meets the threshold — significantly faster." },
      { step: 3, title: "Apply for Type D Visa at Luxembourg Consular Point", description: "Once the temporary authorisation is granted, you apply for a Type D long-stay visa. Kenya has no Luxembourg embassy — the nearest is the Belgian embassy in Nairobi (which represents Luxembourg for visa services) or you can apply at the Luxembourg embassy in Addis Ababa or Pretoria.", tip: "Book the appointment at the Belgian embassy Nairobi as early as possible — slots fill up 4-6 weeks ahead." },
      { step: 4, title: "Travel to Luxembourg and Register with the Commune", description: "Enter Luxembourg on your Type D visa. Within 3 working days of arrival, register at the commune (town hall) where you live with your passport, visa, employment contract, and accommodation proof.", tip: "The 3-day window is enforced. Register the day after you arrive if possible." },
      { step: 5, title: "Complete Medical Examination", description: "Book a medical check within 3 months of arrival at a Luxembourg-approved doctor. The medical certificate is required to get your residence permit issued.", tip: "Your employer's HR team usually helps arrange this — ask on day one." },
      { step: 6, title: "Receive Residence Permit Card", description: "Submit biometrics at the Immigration Directorate. Your residence permit is issued within a few weeks and is valid for the duration of your contract (up to 3 years initially, renewable). After 5 years of legal residence you can apply for permanent residence.", tip: "Keep the residence permit on you at all times — Luxembourg police can request ID checks." },
    ],
    processingTime: "Authorisation to Stay: 2–4 months (standard) or 1–2 months (Blue Card). Type D visa: 2–4 weeks after authorisation. Residence permit card: 4–6 weeks after arrival + biometrics.",
    processingNote: "Blue Card applications are noticeably faster because they skip the labour-market test. Standard work permit timelines can vary depending on ADEM's workload and how quickly your employer submits documents.",
    costs: [
      { item: "Temporary Authorisation to Stay",        amount: "€80",                    note: "Paid by employer or applicant" },
      { item: "Type D Long-Stay Visa",                   amount: "€99 (approx)",           note: "Paid at Belgian embassy Nairobi (Luxembourg representative)" },
      { item: "Commune Registration",                     amount: "Free to €25",            note: "Varies by commune" },
      { item: "Medical Examination",                     amount: "€50–€150",               note: "At approved doctor in Luxembourg" },
      { item: "Residence Permit Card",                   amount: "€80",                    note: "First issue; €80 for renewals" },
      { item: "Document Translation (French/German)",    amount: "€40–€100 per document",  note: "Certified translator" },
      { item: "Certificate of Good Conduct (Kenya)",     amount: "KES 1,050",              note: "DCI Nairobi" },
      { item: "Apostille / Legalisation",                amount: "KES 5,000–15,000",       note: "Ministry of Foreign Affairs Kenya" },
    ],
    officialLinks: [
      { label: "guichet.lu — Official Immigration Guide",   url: "https://guichet.public.lu/en/citoyens/immigration.html", note: "The definitive Luxembourg government portal for immigration" },
      { label: "Direction de l'Immigration (MAEE)",         url: "https://maee.gouvernement.lu/en/directions-du-ministere/immigration.html", note: "Immigration Directorate — approves authorisations to stay" },
      { label: "ADEM — Luxembourg Employment Agency",       url: "https://adem.public.lu/en.html", note: "Labour-market test authority + public job board" },
      { label: "JobFinder.lu",                              url: "https://www.jobfinder.lu",     note: "Curated Luxembourg job board — many English-speaking roles" },
      { label: "Belgian Embassy Nairobi (visa services)",   url: "https://kenya.diplomatie.belgium.be", note: "Represents Luxembourg for visa applications in Kenya" },
      { label: "Recognition of Foreign Qualifications",     url: "https://mesr.gouvernement.lu",  note: "Ministry of Higher Education — for degree recognition" },
    ],
    faqs: [
      { q: "Do I need to speak French, German, or Luxembourgish?",
        a: "English is widely used in Luxembourg's finance, tech, EU institution, and shared-services sectors. Most Blue Card and skilled-worker roles operate in English. However, French is very useful for daily life (shops, doctors, admin) and German is common in Trier-border communes. For roles in retail, hospitality, or teaching, French is usually required." },
      { q: "How does the EU Blue Card differ from a standard work permit?",
        a: "The Blue Card skips the ADEM labour-market test (which normally requires the job to be offered to EU candidates first) and gives a faster path to permanent residence (33 months instead of 5 years for standard permits). It requires a recognised university degree AND a salary of at least €78,336/year in 2025 (or €62,668/year for shortage occupations)." },
      { q: "Can my family come with me?",
        a: "Yes. Once you have your Luxembourg residence permit and stable income, your spouse and children under 18 can apply for family reunification. Spouses of Blue Card holders get immediate work authorisation. Standard-permit spouses can also work but need their own residence permit." },
      { q: "How is the cost of living in Luxembourg?",
        a: "High — one of the most expensive EU countries. Rent in Luxembourg City can consume 30-45% of a mid-range salary. Salaries are correspondingly high, and there's no wealth tax. Many workers live in neighbouring France, Germany, or Belgium and commute (cross-border workers)." },
      { q: "Is there a route from Luxembourg to permanent residence?",
        a: "Yes. Standard-permit holders can apply for permanent residence after 5 years of continuous legal residence. Blue Card holders can apply after 33 months (or 21 months with sufficient French/German). After permanent residence, citizenship is possible after 5 more years." },
      { q: "Are there labour shortages I can target?",
        a: "Yes — Luxembourg regularly publishes shortage occupations. In 2025 these include: IT specialists (developers, cybersecurity, cloud engineers), healthcare (nurses, GPs, specialists), engineers (civil, electrical, mechanical), finance specialists (fund accounting, risk, compliance), and skilled trades." },
    ],
    keywordTags: ["luxembourg work visa", "luxembourg blue card kenya", "work in luxembourg", "luxembourg salaried worker permit", "highest paying EU visa"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TIER 1 (2026-07): highest Kenya-to-country hiring pipelines
  // ══════════════════════════════════════════════════════════════════════════

  ireland: {
    slug: "ireland",
    name: "Ireland",
    flag: "🇮🇪",
    gradient: "from-green-600 to-orange-500",
    heroText: "English-speaking EU nation with the strongest active nurse and care worker recruitment pipeline for Kenyans in Europe. Critical Skills Employment Permit fast-tracks eligible roles to permanent residence in 2 years.",
    visaTypes: [
      { name: "Critical Skills Employment Permit", description: "For high-demand roles on Ireland's Critical Skills Occupations List (nurses, doctors, engineers, IT specialists). Salary threshold €38,000+ (or €64,000+ for non-list roles). Family can join immediately + fast-track to permanent residence." },
      { name: "General Employment Permit", description: "For roles NOT on the Critical Skills list. Requires a labour market needs test (job must be advertised to EU citizens first for 28 days). Minimum salary €34,000. Path to residency after 5 years." },
      { name: "Stamp 1G (Post-Study)", description: "For graduates of Irish institutions. Allows 24 months of open work after graduation while looking for sponsored role." },
      { name: "Atypical Working Scheme", description: "Short-term (up to 90 days) work permit for locum medical staff and highly skilled specialists. Commonly used for locum nurses." },
    ],
    overview: "Ireland has the fastest-growing economy in the EU and a documented shortage of nurses, care workers, doctors, IT professionals, and construction workers. The Health Service Executive (HSE) and private hospitals actively recruit internationally. The Critical Skills route is the fastest — 2 years to Stamp 4 (permanent residence). Most roles are conducted in English so language is not a barrier for Kenyan applicants. Ireland's Department of Enterprise, Trade and Employment (DETE) processes work permits; applications go via the online EPOS portal.",
    requirements: [
      { title: "Signed Job Offer from Irish Employer", detail: "An Irish-registered employer must offer you a job. The employer is responsible for applying for your Employment Permit through the EPOS portal. You cannot apply yourself." },
      { title: "Salary Threshold", detail: "Critical Skills: €38,000/year (or €32,000 for STEM shortage roles). General Employment: €34,000/year minimum. The higher salary you're offered, the faster the residency route." },
      { title: "Recognised Qualifications", detail: "Your degree must be recognised in Ireland. For regulated professions (nursing, medicine, teaching, engineering) apply for recognition first: NMBI for nurses, Medical Council for doctors." },
      { title: "IELTS / OET (for regulated professions)", detail: "Nurses: OET B in all 4 sections or IELTS 7.0 (7.0 in speaking + listening, 6.5 in reading + writing). Doctors: same. Not needed for non-regulated jobs." },
      { title: "Garda Clearance Equivalent", detail: "Certificate of Good Conduct from the Kenyan Directorate of Criminal Investigations (DCI Nairobi). Must be legalised (apostille or embassy)." },
      { title: "Passport with 12+ Months Validity", detail: "Valid Kenyan passport with at least 2 blank pages." },
    ],
    steps: [
      { step: 1, title: "Secure a Job Offer in Ireland",                 description: "Apply through IrishJobs.ie, Jobs.ie, HSE Jobs, LinkedIn Ireland, Three Q for nurses. Confirm the employer is legitimate and can sponsor permits.",                                                     estimatedTime: "1-4 months", tips: "Nurses: Three Q, Cpl Healthcare, and RCSI Hospitals recruit Kenyans in cohorts." },
      { step: 2, title: "Sign Employment Contract + NMBI/Medical Council Registration", description: "Sign the contract. Nurses concurrently begin NMBI decision-application (Nursing and Midwifery Board of Ireland). Doctors register with the Irish Medical Council.",                             estimatedTime: "3-6 months", tips: "NMBI decision typically requires an adaptation programme (aptitude test or 6-week clinical placement)." },
      { step: 3, title: "Employer Applies for Employment Permit (EPOS)", description: "Your Irish employer submits your Critical Skills or General Employment Permit application via the EPOS portal. Government processes it in 4-8 weeks.",                                                        estimatedTime: "4-8 weeks",  tips: "Critical Skills applications are prioritised — bump ahead of General Employment queue." },
      { step: 4, title: "Apply for Long-Stay 'D' Employment Visa",      description: "Once the permit is issued, apply for a Long-Stay D visa at the Embassy of Ireland in Pretoria (which handles Kenya). Submit permit, passport, biometrics, insurance, and finances.",                          estimatedTime: "4-8 weeks",  tips: "Book your Pretoria appointment early. Ireland does not have an embassy in Nairobi." },
      { step: 5, title: "Travel to Ireland + Register with GNIB",        description: "Fly to Ireland. Within 90 days of arrival, register with the Garda National Immigration Bureau (GNIB) / Irish Immigration Service to get your Irish Residence Permit (IRP) card.",                             estimatedTime: "1-2 weeks",  tips: "Book your GNIB appointment online BEFORE you fly. Slots go 2-3 months out." },
      { step: 6, title: "Apply for PPSN + Bank Account",                  description: "Get your PPS Number (like a national ID) from MyWelfare.ie. Open a bank account (AIB, BOI, PTSB, or online banks Revolut/N26).",                                                                              estimatedTime: "2-4 weeks",  tips: "You need PPSN before your first payslip. Book PPSN appointment on day one." },
    ],
    processingTime: "Employment Permit: 4-8 weeks (Critical Skills faster). Long-Stay visa: 4-8 weeks after permit. Total: 3-6 months from job offer to arrival.",
    processingNote: "Critical Skills applications are processed on a priority track. General Employment Permits require an additional labour-market test which adds 4-6 weeks.",
    costs: [
      { item: "Critical Skills Employment Permit",     amount: "€1,000",                note: "Paid by employer usually" },
      { item: "General Employment Permit",             amount: "€1,000 (2 yr) / €1,500 (>2 yr)", note: "Paid by employer usually" },
      { item: "Long-Stay 'D' Visa",                     amount: "€60",                    note: "Paid at Embassy of Ireland Pretoria" },
      { item: "GNIB / IRP Card",                        amount: "€300",                    note: "Per year, paid on registration in Ireland" },
      { item: "NMBI Nurse Registration",                amount: "€350",                    note: "First-time registration + annual fees" },
      { item: "Medical Council Doctor Registration",    amount: "€700",                    note: "First registration + annual €600" },
      { item: "OET / IELTS Exam",                        amount: "KES 30,000-40,000",      note: "Booked in Kenya" },
      { item: "Legalised Documents (Kenya)",             amount: "KES 5,000-15,000",       note: "Foreign Affairs + Irish embassy" },
    ],
    officialLinks: [
      { label: "Enterprise Ireland — Employment Permits", url: "https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/", note: "Official government portal for employer permit applications" },
      { label: "Critical Skills Occupations List",         url: "https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/employment-permit-eligibility/highly-skilled-eligible-occupations-list/", note: "The exact roles that qualify for the fast-track" },
      { label: "Irish Immigration Service",                url: "https://www.irishimmigration.ie",              note: "GNIB registration + IRP card + immigration policies" },
      { label: "NMBI — Nursing Board",                     url: "https://www.nmbi.ie",                          note: "Nurse registration in Ireland" },
      { label: "Embassy of Ireland Pretoria (KE visas)",   url: "https://www.dfa.ie/irish-embassy/south-africa/", note: "Kenya is under this embassy — visa appointments here" },
      { label: "HSE Careers",                              url: "https://www.hse.ie/eng/staff/jobs/",           note: "Health Service Executive — largest employer of Kenyan nurses in Ireland" },
    ],
    faqs: [
      { q: "Can I bring my family with me on a Critical Skills permit?", a: "Yes, immediately. Spouses/partners get an unrestricted right to work (no separate permit needed). Children under 18 join as dependents. This is a major advantage over the General Employment Permit which requires 12 months of wait." },
      { q: "How fast is the route to permanent residence?",              a: "Critical Skills holders can apply for Stamp 4 (long-term residency) after just 2 years. General Employment holders need 5 years. Stamp 4 gives you the right to work in any job without a permit + apply for Irish citizenship after 3 more years." },
      { q: "Do I need to pay for my own visa?",                            a: "The Employment Permit is normally paid by the employer. You pay for the Long-Stay D visa (€60), the GNIB/IRP card (€300/year), and any professional-registration fees (NMBI, Medical Council). Total out-of-pocket is usually under €1,500 for the first year." },
      { q: "What's the process for Kenyan nurses specifically?",           a: "1) Apply to Three Q, Cpl Healthcare, or the HSE directly. 2) Take OET (B) or IELTS 7.0. 3) Register with NMBI (€350) and complete their decision, usually a 6-week adaptation programme in an Irish hospital. 4) Your employer applies for the Critical Skills Permit. 5) You apply for the Long-Stay D visa in Pretoria. Full timeline: 6-12 months." },
      { q: "Is English required?",                                          a: "For regulated professions (nursing, medicine) yes — OET B or IELTS 7.0. For most other roles, English is not formally tested but you'll need it to work day-to-day. Kenyan applicants generally exceed the required standard." },
    ],
    keywordTags: ["ireland work visa kenya", "critical skills permit ireland", "irish nurse visa", "HSE Kenya nurse recruitment", "work in ireland from kenya"],
  },

  netherlands: {
    slug: "netherlands",
    name: "Netherlands",
    flag: "🇳🇱",
    gradient: "from-orange-600 to-blue-600",
    heroText: "One of the most English-friendly EU markets. The Highly Skilled Migrant scheme lets IND-recognised employers hire international workers in 4-6 weeks with no labour market test.",
    visaTypes: [
      { name: "Highly Skilled Migrant (Kennismigrant)", description: "The fastest route into the Netherlands. Requires an IND-recognised sponsor and a salary of €5,331/month (age 30+) or €3,909/month (under 30). No labour market test. Application processed in 2-4 weeks." },
      { name: "EU Blue Card (Netherlands)", description: "For workers with a recognised bachelor's degree and a salary of at least €6,245/month (2025). Slightly higher threshold than the Kennismigrant route but easier route to EU mobility." },
      { name: "Search Year (Orientation Year)", description: "For graduates of Dutch and top-200 world universities. 12-month open work visa to find a Kennismigrant sponsor." },
      { name: "Intra-Corporate Transferee (ICT)", description: "For employees transferring within a multinational to a Dutch branch. Requires 6+ months prior employment at the parent company." },
    ],
    overview: "The Netherlands is often the fastest EU country to enter for skilled Kenyan workers. Only IND-recognised sponsors can apply for Highly Skilled Migrant visas — search the official register before accepting any job offer. English is the working language for most tech, finance, and international roles. Amsterdam, Utrecht, The Hague, Rotterdam, and Eindhoven are the main employer hubs. The Netherlands offers a partial tax exemption (30% ruling) for the first 5 years for eligible highly skilled migrants, which effectively boosts your net pay significantly.",
    requirements: [
      { title: "Job Offer from IND-Recognised Sponsor", detail: "Only Dutch companies on the IND's official 'recognised sponsor' register can apply for Highly Skilled Migrant visas. Always verify BEFORE accepting an offer using ind.nl/en/public-register-recognised-sponsors." },
      { title: "Salary Threshold", detail: "Highly Skilled Migrant: €5,331/month (age 30+) or €3,909/month (under 30) in 2025. EU Blue Card: €6,245/month. Adjusted every January." },
      { title: "Recognised Educational Qualifications", detail: "For the Blue Card and regulated professions your degree needs a Nuffic (IDW) recognition. For Highly Skilled Migrant most roles don't require degree recognition — the sponsor's judgment is what matters." },
      { title: "BSN (Citizen Service Number)", detail: "You must register at the local municipality within 5 days of arrival to get a BSN. Without a BSN you cannot open a bank account, sign a rental contract, or receive salary." },
      { title: "TB Test", detail: "Applicants from certain countries including Kenya must undergo TB screening within 3 months of arrival at the GGD (municipal health office). Free." },
      { title: "Health Insurance (Zorgverzekering)", detail: "Mandatory basic health insurance within 4 months of arrival. Costs €130-€170/month. Compare providers on Zorgwijzer.nl." },
    ],
    steps: [
      { step: 1, title: "Find an IND-Recognised Sponsor",                description: "Apply through IamExpat, LinkedIn Netherlands, TogetherAbroad, Undutchables. Always cross-check the company on the IND recognised sponsors register before signing.",                                estimatedTime: "1-3 months", tips: "'Recognised sponsor' status is what makes the Highly Skilled Migrant fast-track possible. Non-recognised companies must use the slower + more expensive General Employment path." },
      { step: 2, title: "Sign Employment Contract + Sponsor Submits Application", description: "Your Dutch employer submits your Highly Skilled Migrant application to the IND. Application fee €380 (2025) usually paid by employer.",                                                            estimatedTime: "2-4 weeks",  tips: "The IND publishes typical response times weekly at ind.nl. Track your application there." },
      { step: 3, title: "Approval + MVV (Provisional Residence Permit)", description: "Once IND approves, you get an MVV (a stamp in your passport authorising entry). Book collection at the Dutch embassy in Nairobi.",                                                                          estimatedTime: "2-4 weeks",  tips: "The Dutch embassy in Nairobi processes MVV pickup — take passport, IND approval letter, and payment." },
      { step: 4, title: "Travel + Municipality Registration",             description: "Fly to the Netherlands. Within 5 working days, register at the local gemeente (municipality) with your passport, MVV, rental contract, and employment contract. Get your BSN.",                                estimatedTime: "1-5 days",   tips: "Book your gemeente appointment BEFORE flying. Amsterdam slots go 2-3 weeks out." },
      { step: 5, title: "Collect Residence Permit Card",                   description: "The IND sends your physical residence permit card to the IND office nearest you within 2 weeks of arrival. Collection is by appointment.",                                                                estimatedTime: "1-3 weeks",  tips: "You cannot leave the Schengen area until you have the physical card." },
      { step: 6, title: "Open Bank + Health Insurance + BSN",              description: "With your BSN, open a bank account (ING, ABN AMRO, Rabobank, Bunq, N26). Sign up for basic health insurance within 4 months (mandatory, €130-€170/month).",                                                 estimatedTime: "1-2 weeks",  tips: "The 30% Tax Ruling can save you significant tax — ask your employer to apply within 4 months of arrival." },
    ],
    processingTime: "Highly Skilled Migrant: 2-4 weeks. MVV: 2-4 weeks. Total: 6-10 weeks from application to arrival. General Employment (non-recognised sponsor): 3-5 months.",
    processingNote: "The IND publishes real processing times weekly. Recognised sponsor applications are prioritised. Non-recognised sponsors trigger a labour-market test which slows things by 2-3 months.",
    costs: [
      { item: "Highly Skilled Migrant Application",     amount: "€380",                   note: "Paid by employer usually" },
      { item: "EU Blue Card Application",                amount: "€380",                   note: "Same fee as HSM" },
      { item: "MVV (Provisional Residence Permit)",      amount: "€380 (included above)",  note: "Combined MVV+VVR fee" },
      { item: "Residence Permit Card",                    amount: "Included",               note: "In the €380 fee" },
      { item: "Municipality Registration + BSN",          amount: "Free",                    note: "" },
      { item: "TB Screening",                             amount: "Free",                    note: "GGD" },
      { item: "Health Insurance (Basic)",                 amount: "€130-€170/month",         note: "Mandatory within 4 months" },
      { item: "Nuffic Degree Recognition (if needed)",    amount: "€218",                   note: "Only for Blue Card + regulated professions" },
    ],
    officialLinks: [
      { label: "IND — Highly Skilled Migrant",             url: "https://ind.nl/en/residence-permits/work/highly-skilled-migrant", note: "The official rules + application process" },
      { label: "IND Recognised Sponsors Register",         url: "https://ind.nl/en/public-register-recognised-sponsors",           note: "CHECK EVERY EMPLOYER HERE before accepting an offer" },
      { label: "IND — EU Blue Card",                        url: "https://ind.nl/en/residence-permits/work/eu-blue-card",           note: "Blue Card eligibility and process" },
      { label: "Nuffic (Degree Recognition)",               url: "https://www.nuffic.nl/en",                                        note: "Get your degree evaluated for Dutch equivalence" },
      { label: "Netherlands Embassy Nairobi",               url: "https://www.netherlandsworldwide.nl/countries/kenya",             note: "Visa collection + Kenya-specific requirements" },
      { label: "30% Tax Ruling",                            url: "https://www.belastingdienst.nl/wps/wcm/connect/en/individuals/content/coming-to-work-in-netherlands", note: "Major tax exemption for skilled migrants" },
    ],
    faqs: [
      { q: "What's the 30% Tax Ruling and can I get it?",   a: "The 30% ruling exempts 30% of your gross salary from Dutch income tax for the first 5 years — a huge boost to net pay. To qualify: you must be recruited from abroad (not already in NL), have specific expertise not readily available in the Dutch labour market, and earn above the annual threshold (~€46,000/year in 2025). Your employer applies for you within 4 months of your arrival." },
      { q: "Do I need to speak Dutch?",                      a: "For most Highly Skilled Migrant roles in tech, finance, and international companies: no. English is the working language at Booking.com, Adyen, ASML, ING International, and most Amsterdam startups. For daily life (shopping, doctors) some Dutch helps but is not essential in Amsterdam/The Hague/Rotterdam." },
      { q: "How do I check if a Dutch company can sponsor me?", a: "Search their name on the IND public register: ind.nl/en/public-register-recognised-sponsors. Only listed companies can apply for Highly Skilled Migrant visas. If they're not there, either the offer isn't real or the timeline will be 3-5 months instead of 6-10 weeks." },
      { q: "Can my spouse work in the Netherlands?",           a: "Yes, immediately and without restriction. Spouses of Highly Skilled Migrants get a full unrestricted right to work in the Netherlands — no separate permit required. This is a major advantage over many other EU countries." },
      { q: "Is housing hard to find?",                          a: "Yes — especially in Amsterdam, Utrecht, and The Hague. Rents are high (€1,500-€2,500/month for a 1-bedroom) and demand exceeds supply. Look on Pararius, Funda, and Kamernet. Many employers provide 1-month temporary housing while you search." },
    ],
    keywordTags: ["netherlands work visa kenya", "dutch highly skilled migrant", "netherlands EU blue card", "amsterdam job kenya", "IND sponsor list"],
  },

  "new-zealand": {
    slug: "new-zealand",
    name: "New Zealand",
    flag: "🇳🇿",
    gradient: "from-blue-700 to-red-600",
    heroText: "English-speaking Commonwealth country with a Green List fast-track to residence for nurses, doctors, teachers, engineers, and trades. The Accredited Employer Work Visa (AEWV) is the main employer-sponsored route.",
    visaTypes: [
      { name: "Accredited Employer Work Visa (AEWV)", description: "The main work visa. Requires a job offer from an Accredited Employer (list on Immigration NZ website). Valid up to 5 years." },
      { name: "Skilled Migrant Category (Residence)", description: "Points-based permanent residency. Requires 6+ points from qualifications, skilled employment, and NZ registration where applicable. Direct to permanent residency." },
      { name: "Green List Fast-Track", description: "Occupations on the Green List (nurses, doctors, teachers, engineers, plumbers, electricians, etc) get accelerated residency in 2 years or Straight to Residence in some cases." },
      { name: "Working Holiday Visa (Under 30)", description: "For Kenyans under 30, a 12-month working holiday visa to travel and work in NZ. Limited slots — apply early January each year." },
    ],
    overview: "New Zealand has a documented shortage of nurses, doctors, teachers, engineers, and skilled trades. The Green List (Tier 1 = Straight to Residence; Tier 2 = Work to Residence in 2 years) is the government's official list of most-wanted occupations. Immigration New Zealand publishes the Green List roles and their exact requirements. English is the sole official working language. Auckland, Wellington, and Christchurch host most employer HQs, but rural regions actively recruit for healthcare, farming, and trades roles.",
    requirements: [
      { title: "Job Offer from Accredited Employer", detail: "Only NZ employers on the Immigration NZ accredited employer register can hire foreign workers. Check the register at immigration.govt.nz." },
      { title: "Skills Assessment / Registration", detail: "For regulated professions: Nurses need Nursing Council of New Zealand (NCNZ) registration. Doctors need Medical Council NZ (MCNZ) registration. Teachers need Teaching Council NZ registration. Engineers register with Engineering NZ." },
      { title: "IELTS / OET / PTE", detail: "For most skilled visa applications: IELTS 6.5+ overall (7.0 for regulated professions). NCNZ requires IELTS Academic 7.0 or OET B in all sections." },
      { title: "Medical + X-Ray Certificate", detail: "Full medical exam + chest X-ray at an Immigration NZ panel doctor. Nairobi has approved panel physicians." },
      { title: "Police Certificate", detail: "Certificate of Good Conduct from the Kenyan DCI PLUS from any country you've lived in for 12+ months in the last 10 years." },
      { title: "Passport with 3+ Years Validity", detail: "Recommended. Minimum 3 months beyond intended stay." },
    ],
    steps: [
      { step: 1, title: "Find an Accredited Employer",                        description: "Search Seek NZ, Trade Me Jobs, LinkedIn NZ, Kiwi Health Jobs. Verify the employer is on the Immigration NZ Accredited Employer list before signing.",                                                                estimatedTime: "1-4 months", tips: "'Accredited Employer' is prerequisite. Non-accredited employers cannot sponsor you." },
      { step: 2, title: "Get Skills Assessment / Professional Registration", description: "Nurses register with NCNZ (fees NZ$550, plus Competence Assessment Programme up to NZ$8,500). Doctors register with MCNZ. Teachers with Teaching Council. Engineers get Chartered Professional Engineer if senior.",                estimatedTime: "3-9 months",  tips: "NCNZ nurse assessment can take 6-9 months. Start early." },
      { step: 3, title: "Apply for AEWV",                                       description: "Once you have the offer + registration, apply for the Accredited Employer Work Visa online at immigration.govt.nz. Application fee NZ$770-$1,540.",                                                                        estimatedTime: "4-8 weeks",   tips: "Green List occupations get priority processing (often 4 weeks)." },
      { step: 4, title: "Medical + Police Clearance",                          description: "Complete the medical + X-ray at a NZ panel doctor in Nairobi. Order Certificate of Good Conduct from the DCI. Upload both to your INZ application.",                                                                       estimatedTime: "2-4 weeks",   tips: "The DCI certificate takes 2-3 weeks — order it as soon as you get a job offer." },
      { step: 5, title: "Visa Grant + Travel",                                 description: "Once approved, you receive an eVisa via email. You do NOT need to submit your passport. Book flights to New Zealand.",                                                                                                    estimatedTime: "1-2 weeks",   tips: "Direct flights from Nairobi via Dubai (Emirates) or Doha (Qatar) with 1 stop." },
      { step: 6, title: "IRD Number + Bank + Rentals on Arrival",              description: "Apply for your IRD number (tax ID) at ird.govt.nz. Open a bank account (ANZ, ASB, BNZ, Kiwibank). Sign a tenancy agreement. Register with a GP.",                                                                          estimatedTime: "2-4 weeks",   tips: "Some employers help with airport pickup and first-week accommodation. Ask." },
    ],
    processingTime: "AEWV: 4-8 weeks. Skills Assessment (NCNZ nurses): 6-9 months. Total: 6-12 months for nurses/doctors, 3-6 months for tech/trades.",
    processingNote: "Green List Tier 1 occupations (Straight to Residence) can go from job offer to residence in 4-6 months. Tier 2 (Work to Residence) requires 2 years of NZ work first.",
    costs: [
      { item: "AEWV Application",                       amount: "NZ$770-1,540",           note: "Depends on nationality + processing tier" },
      { item: "NCNZ Nurse Registration",                amount: "NZ$550 + up to NZ$8,500", note: "Registration + Competence Assessment Programme" },
      { item: "MCNZ Doctor Registration",               amount: "NZ$1,000+",              note: "Varies by specialty" },
      { item: "Medical + X-Ray in Nairobi",             amount: "KES 15,000-25,000",      note: "Panel doctors only" },
      { item: "Certificate of Good Conduct (Kenya)",    amount: "KES 1,050",              note: "DCI Nairobi" },
      { item: "IELTS / OET",                             amount: "KES 30,000-40,000",      note: "Booked in Kenya" },
      { item: "Skilled Migrant Residence Application", amount: "NZ$4,290",                note: "For PR after 2 years on AEWV" },
    ],
    officialLinks: [
      { label: "Immigration New Zealand",                     url: "https://www.immigration.govt.nz",                                          note: "Official immigration authority — visa applications" },
      { label: "Green List Occupations",                       url: "https://www.immigration.govt.nz/new-zealand-visas/preparing-a-visa-application/working-in-nz/hiring-migrant-workers/lists-of-occupations-in-demand/green-list-occupations", note: "The exact roles on the fast-track" },
      { label: "Accredited Employer Register",                 url: "https://www.immigration.govt.nz/employ-migrants/employer-accreditation/",  note: "Search here to verify your employer is accredited" },
      { label: "NCNZ (Nursing Council New Zealand)",           url: "https://www.nursingcouncil.org.nz",                                        note: "Nurse registration for internationally qualified nurses" },
      { label: "Medical Council of NZ",                         url: "https://www.mcnz.org.nz",                                                  note: "Doctor registration" },
      { label: "New Zealand High Commission Pretoria",         url: "https://www.mfat.govt.nz/en/countries-and-regions/africa/south-africa/",   note: "The NZ mission responsible for Kenyan applicants (no NZ embassy in Nairobi)" },
    ],
    faqs: [
      { q: "How long does the NCNZ nurse registration take?",              a: "Registration itself: 6-12 weeks. But most Kenyan nurses need the Competence Assessment Programme (CAP), which is an 8-12 week bridging programme done IN New Zealand. Some hospitals sponsor and pay for the CAP as part of a job offer package. Start the NCNZ decision-application before you apply for jobs." },
      { q: "Is New Zealand cheaper than Australia or the UK?",              a: "Slightly. Auckland is expensive (comparable to Melbourne). Wellington, Christchurch, and regional cities are noticeably cheaper. Salaries are moderate but the pace of life, natural environment, and English-speaking workplace are the main draws." },
      { q: "Can I bring my family?",                                          a: "Yes. Spouses/partners get open work rights (any employer, any role). Children get access to state schools. On the Green List Tier 1 route, families can arrive with you and get residency together." },
      { q: "What jobs are on the Green List right now?",                     a: "Constantly updated. As of 2025: Registered Nurses, Midwives, Doctors, Radiographers, Physiotherapists, Teachers (secondary + primary), Civil/Mechanical/Electrical Engineers, ICT Security Specialists, Auditors, Plumbers, Electricians, Automotive Technicians, Diesel Mechanics. Check immigration.govt.nz for the current list." },
      { q: "Do I need job experience or can new graduates apply?",             a: "You need relevant work experience for most Green List roles: nurses typically 1-2 years post-qualification, engineers 2-5 years. New graduates can enter via the Post-Study Work Visa if they studied in NZ." },
    ],
    keywordTags: ["new zealand work visa kenya", "accredited employer work visa", "green list occupation NZ", "nurse job new zealand", "AEWV Kenya"],
  },

  poland: {
    slug: "poland",
    name: "Poland",
    flag: "🇵🇱",
    gradient: "from-red-600 to-white",
    heroText: "The fastest-growing EU work permit market. Employer-sponsored Work Permit A gets non-EU workers legally employed in 6-12 weeks. Growing IT, logistics, factory, and construction opportunities.",
    visaTypes: [
      { name: "Work Permit A (Type A)", description: "The standard employer-sponsored work permit for foreigners working in Poland for a Polish employer. Valid up to 3 years. Extendable." },
      { name: "EU Blue Card (Poland)", description: "For workers with a bachelor's degree + salary at least 150% of Poland's average (~PLN 12,000/month in 2025). Faster path to EU mobility." },
      { name: "National Visa (Type D)", description: "Long-stay visa allowing entry to Poland. Application at the Polish embassy in Nairobi after your Work Permit is approved by the Voivode." },
      { name: "Temporary Residence Permit for Work", description: "For workers already in Poland with a job offer. Combined work + residence permit, valid up to 3 years." },
    ],
    overview: "Poland is the largest new economy in the EU and has been aggressively recruiting foreign workers since 2020. Warehouse, logistics, factory, IT, construction, and hospitality roles all have shortages. English works in Warsaw and Kraków for IT + BPO roles, but Polish helps significantly elsewhere. The process is: employer applies to the local Voivode (regional governor) for a Work Permit A, you receive the permit, then apply for a National Visa (Type D) at the Polish embassy in Nairobi. Upon arrival in Poland you convert to a Temporary Residence Permit for Work.",
    requirements: [
      { title: "Job Offer from Polish Employer",         detail: "A Polish-registered employer must offer you a job. The employer applies to the local Voivode for your Work Permit A." },
      { title: "Labour Market Test",                     detail: "The employer must first advertise the role via the local Powiat Employment Office (Powiatowy Urząd Pracy) for 14 days. If no suitable EU/Polish candidate applies, the labour market test is passed." },
      { title: "Signed Employment Contract",              detail: "The contract must specify job title, salary, hours, and location. Minimum wage 2025 is PLN 4,666/month gross." },
      { title: "Valid Kenyan Passport",                    detail: "At least 12 months validity beyond intended stay + 2 blank pages." },
      { title: "Educational Certificates + Translations", detail: "For skilled roles: degrees translated into Polish by a sworn translator + apostilled. For unskilled roles (warehouse, factory) not usually required." },
      { title: "Health Insurance",                         detail: "Public health insurance (NFZ) via your employer is automatic once you start work. For visa application you need travel insurance of €30,000 minimum coverage." },
    ],
    steps: [
      { step: 1, title: "Find a Polish Employer",                        description: "Apply through Pracuj.pl, OLX Praca, LinkedIn Poland, NoFluffJobs (IT), JustJoin.it (IT). Verify the company is registered on the KRS (National Court Register) before signing.",                                                       estimatedTime: "1-3 months", tips: "IT roles in Warsaw + Kraków are the easiest for Kenyan applicants — English-speaking, well-paid, established sponsor process." },
      { step: 2, title: "Sign Contract + Employer Applies for Work Permit A", description: "Your Polish employer applies to the local Voivode office (Wojewoda). They first run a 14-day labour market test via the Powiat Employment Office, then submit the Work Permit A application.",                                          estimatedTime: "4-8 weeks",  tips: "This step depends entirely on the Voivode office you're in. Warsaw is faster than Kraków; Katowice can be slower." },
      { step: 3, title: "Apply for National Visa (Type D)",              description: "Once the Work Permit A is issued, apply for a Long-Stay National Visa at the Polish embassy in Nairobi. Submit permit, passport, biometrics, insurance, and finances.",                                                                    estimatedTime: "2-4 weeks",  tips: "Book the Nairobi embassy appointment as soon as your Work Permit is approved. Slots go 3-4 weeks out." },
      { step: 4, title: "Travel to Poland + Register Residence",           description: "Fly to Poland. Within 4 days of arrival, register your residence at the local Urząd Miasta (city hall).",                                                                                                                                     estimatedTime: "1 day",       tips: "Your employer's HR can help — this is a common step for foreign hires." },
      { step: 5, title: "Apply for PESEL (National ID)",                    description: "Apply for your PESEL number (like a national ID) at the local Urząd Miasta. Required for bank accounts, health insurance, phone contracts.",                                                                                                     estimatedTime: "1-2 weeks",  tips: "Some cities require an appointment. Book online at obywatel.gov.pl." },
      { step: 6, title: "Apply for Temporary Residence Permit for Work",   description: "Within 3 months, apply for a Temporary Residence Permit for Work — this combines work + residence for up to 3 years. Application at the local Voivode.",                                                                                          estimatedTime: "3-6 months",  tips: "The National Visa lasts 12 months. Apply for the Temporary Residence Permit before it expires." },
    ],
    processingTime: "Work Permit A: 4-8 weeks. National Visa (Type D): 2-4 weeks. Temporary Residence Permit: 3-6 months after arrival. Total: 3-4 months from application to arrival.",
    processingNote: "Poland's timelines vary significantly by Voivode office. Warsaw, Wrocław, and Kraków are generally the fastest. The Blue Card route skips the labour market test.",
    costs: [
      { item: "Work Permit A",                          amount: "PLN 100",                 note: "Paid by employer usually" },
      { item: "National Visa (Type D)",                  amount: "€80",                     note: "Paid at Polish embassy Nairobi" },
      { item: "Temporary Residence Permit",              amount: "PLN 340 + PLN 100 card",  note: "Once in Poland" },
      { item: "PESEL Registration",                       amount: "Free",                    note: "" },
      { item: "Sworn Document Translation (Polish)",      amount: "PLN 40-80 per page",     note: "Only for degrees + regulated professions" },
      { item: "Certificate of Good Conduct (Kenya)",      amount: "KES 1,050",              note: "DCI Nairobi" },
      { item: "Health Insurance (initial travel cover)", amount: "€30-€80/month",           note: "Until NFZ kicks in via employer" },
      { item: "EU Blue Card",                             amount: "PLN 340 + PLN 100 card", note: "Faster route if you qualify" },
    ],
    officialLinks: [
      { label: "Polish Government — Work Permit Info",      url: "https://www.gov.pl/web/gov/apply-for-a-work-permit",            note: "Official government portal for employer + applicant" },
      { label: "Polish Ministry of Foreign Affairs",         url: "https://www.gov.pl/web/diplomacy",                              note: "Visa information, embassy contacts, and consular services" },
      { label: "Polish Embassy Nairobi",                     url: "https://www.gov.pl/web/kenya/consular-service",                 note: "Visa applications for Kenya" },
      { label: "EURES Poland",                                url: "https://eures.praca.gov.pl",                                    note: "Official EU jobs portal for Poland with English filters" },
      { label: "Migrant.info.pl (Government)",                url: "https://www.migrant.info.pl/en",                                note: "Practical guide for migrants working + living in Poland" },
      { label: "Central Statistical Office (Salaries)",       url: "https://stat.gov.pl/en/",                                       note: "Official Polish salary + labour statistics" },
    ],
    faqs: [
      { q: "Can I get an English-speaking job in Poland?",        a: "Yes, in tech (developer, DevOps, cybersecurity) and BPO (banking operations, customer support) — Warsaw and Kraków have hundreds of English-only roles. For factory, warehouse, and construction, basic Polish is very useful and often expected." },
      { q: "How does the Blue Card differ from Work Permit A?",   a: "Blue Card skips the 14-day labour market test (faster by 2-3 weeks), gives EU mobility rights, and provides direct path to permanent residence after 33 months. Requires a bachelor's degree + salary ~150% of Polish average (~PLN 12,000/month gross in 2025)." },
      { q: "Is Poland safe and welcoming to Kenyan workers?",     a: "Yes, generally. Warsaw, Kraków, and Wrocław have growing international communities. Kenyan diaspora is small but growing. Warsaw's Polish African diaspora community can help with settling in. As with any country, avoid isolated informal work arrangements." },
      { q: "What is the minimum wage in Poland?",                  a: "PLN 4,666/month gross in 2025 (approximately KES 165,000). Foreign workers cannot legally be paid less than this. Skilled IT roles pay PLN 15,000-30,000/month gross." },
      { q: "Can my family come with me?",                          a: "Yes. Once you have a valid Work Permit + Temporary Residence Permit, your spouse and children under 18 can apply for family reunification. Spouses can also apply for their own work permits." },
    ],
    keywordTags: ["poland work visa kenya", "polish work permit A", "work in poland", "poland IT job kenya", "warsaw kraków job"],
  },

  kuwait: {
    slug: "kuwait",
    name: "Kuwait",
    flag: "🇰🇼",
    gradient: "from-green-700 to-red-600",
    heroText: "Tax-free Gulf salaries with strong Kenyan hiring for care workers, drivers, hotel staff, and hospital roles. Article 18 employment visa is the standard sponsored route.",
    visaTypes: [
      { name: "Article 18 (Private Sector Work Visa)", description: "The standard employer-sponsored work visa for private-sector jobs — hospitals, hotels, malls, construction companies. Employer applies via the Public Authority for Manpower (PAM)." },
      { name: "Article 17 (Domestic Worker Visa)", description: "For household staff — housemaids, nannies, drivers, cooks. Sponsored by an individual Kuwaiti family, not a company. Different (weaker) legal protections than Article 18." },
      { name: "Article 20 (Government Sector)", description: "For roles in Kuwaiti ministries or government-owned entities. Rarely available to non-Arab foreigners except for teachers + healthcare specialists." },
    ],
    overview: "Kuwait is one of the wealthiest Gulf states with a large private-sector expat workforce (~70% of workers are non-Kuwaitis). Kenyans work primarily in healthcare (nurses at Al-Adan, Farwaniya, Amiri hospitals), hospitality (Hilton, Marriott, Sheraton Kuwait), retail (malls), drivers, and household staff. Salaries are tax-free. The Kuwaiti kafala (sponsorship) system means your employer is your sponsor and you cannot change jobs freely without your sponsor's release — this is a critical thing to understand before signing.",
    requirements: [
      { title: "Job Offer from Kuwaiti Employer",     detail: "A Kuwaiti company must apply for your Article 18 visa through the Public Authority for Manpower (PAM). You cannot apply yourself." },
      { title: "Attested Educational Certificates",    detail: "Your degree/diploma/certificate MUST be attested by: (1) the Kenyan Ministry of Foreign Affairs, then (2) the Kuwaiti Embassy in Nairobi. Both stamps required. Budget 1-2 weeks." },
      { title: "Attested Employment Contract",         detail: "Your employment contract must be attested by the Kuwaiti Ministry of Labour before you travel. Your employer handles this." },
      { title: "Medical Fitness Test",                  detail: "Full medical + chest X-ray at a GCC-approved centre in Nairobi (Gamca). Tests for TB, hepatitis B/C, HIV, syphilis, malaria, pregnancy. Fail = visa refused." },
      { title: "Certificate of Good Conduct (DCI)",     detail: "Kenyan Directorate of Criminal Investigations. Must be attested + translated into Arabic." },
      { title: "Valid Kenyan Passport (12+ months)",   detail: "Minimum 6 months validity — but Kuwait strongly prefers 12+ months and 2 blank pages." },
    ],
    steps: [
      { step: 1, title: "Secure Job Offer in Kuwait",                    description: "Apply through Bayt Kuwait, Naukri Gulf Kuwait, GulfTalent, LinkedIn Kuwait, or licensed Kenyan recruitment agencies (NEA-verified only). Verify the company on the Kuwait Chamber of Commerce & Industry website.",                       estimatedTime: "1-4 months", tips: "Avoid any recruiter asking you to pay upfront — legitimate Kuwaiti employers pay recruitment fees, not you." },
      { step: 2, title: "Sign Employment Contract + Attest Documents", description: "Sign the contract. Concurrently, attest your degree + certificates at the Kenya Foreign Affairs office AND the Kuwaiti Embassy Nairobi.",                                                                                                estimatedTime: "1-2 weeks",  tips: "Use a Nairobi attestation agent to save time — the offices' queues are long." },
      { step: 3, title: "Employer Applies for Work Permit (PAM)",        description: "Your Kuwaiti employer's PRO applies for your Article 18 work permit through the Public Authority for Manpower. Once approved, the Kuwaiti Immigration sends your entry visa (NOC) to the embassy in Nairobi.",                                estimatedTime: "4-8 weeks",  tips: "Track the application via your employer — timing varies by PAM office." },
      { step: 4, title: "Kenya Medical + Fingerprints (GAMCA)",           description: "Complete the Gulf-approved medical at a GAMCA-authorised centre in Nairobi. Fingerprints for police clearance also required.",                                                                                                                estimatedTime: "1-2 weeks",  tips: "Book GAMCA appointment online at gamca.com.sa. Results in 3-5 days." },
      { step: 5, title: "Collect Entry Visa + Travel",                    description: "Collect your Entry Visa from the Kuwaiti Embassy in Nairobi (with the NOC number from your employer). Fly to Kuwait — must arrive within 60 days of visa issue.",                                                                              estimatedTime: "1-2 weeks",  tips: "Book flights to Kuwait International Airport (KWI) via Emirates, Qatar, or Kuwait Airways." },
      { step: 6, title: "Kuwait Medical + Civil ID",                       description: "Within 30 days of arrival, complete a second medical in Kuwait (organised by employer). Register for Civil ID at the Public Authority for Civil Information (PACI) — required for everything in Kuwait.",                                    estimatedTime: "2-4 weeks",  tips: "Do NOT leave Kuwait without your Civil ID card in hand — you may be blocked from re-entry." },
    ],
    processingTime: "Work Permit (PAM): 4-8 weeks. Entry Visa: 1-2 weeks. Total: 2-4 months from job offer to arrival.",
    processingNote: "Timelines depend heavily on your employer's PRO team and the current PAM workload. Some employers process in 3 weeks; some take 3 months.",
    costs: [
      { item: "Work Permit Fee (Article 18)",           amount: "KWD 10-50",              note: "Paid by employer typically" },
      { item: "Entry Visa Stamping",                     amount: "KWD 3-10",                note: "Kuwait embassy Nairobi" },
      { item: "GAMCA Medical (Kenya)",                    amount: "KES 12,000-18,000",      note: "GAMCA-approved centres only" },
      { item: "Kuwait Medical Fitness Test",               amount: "KWD 10-20",              note: "In Kuwait, usually arranged by employer" },
      { item: "Certificate of Good Conduct (Kenya)",     amount: "KES 1,050",              note: "DCI Nairobi" },
      { item: "Document Attestation (Kenya + Embassy)",  amount: "KES 5,000-15,000",       note: "Per document" },
      { item: "Civil ID Card",                            amount: "KWD 5",                   note: "First issue, in Kuwait" },
      { item: "Health Insurance",                          amount: "Included with visa",      note: "" },
    ],
    officialLinks: [
      { label: "Public Authority for Manpower (PAM)",       url: "https://www.pam.gov.kw",                                       note: "Official work permit authority" },
      { label: "PACI — Civil ID",                            url: "https://www.paci.gov.kw",                                      note: "Public Authority for Civil Information — Civil ID registration" },
      { label: "Kuwaiti Embassy Nairobi",                    url: "https://kenya.mofa.gov.kw",                                    note: "Document attestation + visa collection" },
      { label: "Kuwait Ministry of Foreign Affairs",         url: "https://www.mofa.gov.kw",                                      note: "General consular info" },
      { label: "GAMCA (Gulf medical)",                       url: "https://www.gamca.com.sa",                                     note: "Book your Kenya medical here" },
      { label: "Chamber of Commerce Kuwait (verify employer)", url: "https://www.kuwaitchamber.org.kw",                          note: "Confirm your employer is a real registered company" },
    ],
    faqs: [
      { q: "What is kafala and should I be worried?",      a: "Kafala is the sponsorship system that ties your visa to your employer. In Kuwait it means you cannot switch employers without your current sponsor's written release (an NOC). Reforms have introduced some grace periods (up to 60 days after termination), but always understand: your employer holds significant power. Read your contract carefully and never surrender your passport to an employer — that is illegal in Kuwait as of 2023." },
      { q: "Is Kuwait safe for Kenyan workers?",            a: "Yes generally. Kuwait has a large Kenyan community (nurses, hotel staff, domestic workers). The Kenyan embassy in Kuwait provides support to distressed workers. Article 18 workers (private sector, formal employers) have significantly better legal protection than Article 17 (domestic) workers." },
      { q: "How much can I save in Kuwait?",                a: "Salaries are tax-free. A nurse earning KWD 500/month (~KES 213,000) with employer-provided housing and meals can save 40-60% of gross. Hotel staff earning KWD 250-350/month can save 30-50%. Domestic workers usually earn KWD 100-160 with room + board included." },
      { q: "Should I use a Kenyan recruitment agency?",     a: "Only if they're licensed by the National Employment Authority (NEA). Check the license number on nea.go.ke. NEVER pay upfront placement fees — legitimate agencies are paid by the Kuwaiti employer." },
      { q: "Can I bring my family?",                         a: "Article 18 workers can sponsor family (spouse, children) IF their salary meets the threshold (KWD 450+/month for spouse; higher for children). Domestic workers (Article 17) cannot sponsor family." },
    ],
    keywordTags: ["kuwait work visa kenya", "article 18 kuwait", "kuwait nurse hiring", "work in kuwait", "kuwait employment permit"],
  },

  oman: {
    slug: "oman",
    name: "Oman",
    flag: "🇴🇲",
    gradient: "from-red-600 to-green-600",
    heroText: "The most peaceful Gulf country with strong hospitality, healthcare, engineering, and oil & gas hiring. Employment Visa is standard employer-sponsored route.",
    visaTypes: [
      { name: "Employment Visa (Standard)", description: "The main employer-sponsored work visa for private and government-sector jobs. Sponsored by an Omani employer. Valid 2 years, renewable." },
      { name: "Investor / Entrepreneur Visa", description: "For business owners investing in an Omani-registered company. Requires minimum capital investment (varies by sector)." },
      { name: "Family Joining Visa", description: "Spouse + children under 21 can join once the main worker has a valid Employment Visa + salary threshold." },
    ],
    overview: "Oman is often called the most peaceful and welcoming Gulf country. Government-led Omanisation policies mean many jobs are reserved for locals, but healthcare (Sultan Qaboos University Hospital, Royal Hospital, Muscat Private Hospitals), hospitality (major international chains in Muscat + Salalah), engineering (oil & gas, PDO, Occidental Oman), and education (international schools) actively recruit internationally. Kenyan nurses, hotel staff, and engineers have a growing presence. The visa process is similar to other Gulf states — employer sponsors, you attest documents in Kenya, complete GAMCA medical, and travel on Entry Visa.",
    requirements: [
      { title: "Job Offer from Omani Employer",             detail: "An Omani-registered company must offer you a job. The employer applies for your work permit through the Ministry of Labour." },
      { title: "Attested Educational Certificates",          detail: "Degree/diploma attested by (1) Kenya Ministry of Foreign Affairs, then (2) Omani Embassy in Nairobi. Both stamps required." },
      { title: "GAMCA Medical Certificate",                   detail: "Full medical + chest X-ray at a GAMCA-approved centre in Nairobi. Tests for TB, hepatitis B/C, HIV, pregnancy." },
      { title: "Certificate of Good Conduct (DCI)",            detail: "Kenyan Directorate of Criminal Investigations. Must be attested." },
      { title: "Passport with 6+ Months Validity",             detail: "Valid Kenyan passport with 2 blank pages." },
      { title: "Signed Employment Contract",                    detail: "Contract in English and/or Arabic. Must specify salary, hours, benefits, accommodation, and return-ticket entitlement." },
    ],
    steps: [
      { step: 1, title: "Secure Job Offer in Oman",                     description: "Apply through Bayt Oman, Naukri Gulf Oman, GulfTalent, LinkedIn Oman, or verified Kenyan agencies (NEA-licensed only). Verify the employer on the Oman Chamber of Commerce & Industry website.",                                                estimatedTime: "1-4 months", tips: "Muscat + Salalah host most jobs. Nurses: apply to Sultan Qaboos Univ Hospital, Royal Hospital, and Muscat Private Hospitals directly." },
      { step: 2, title: "Attest Documents in Kenya",                    description: "Attest degree + Good Conduct at Foreign Affairs + Omani Embassy Nairobi.",                                                                                                                                                                              estimatedTime: "1-2 weeks",  tips: "Use a professional Nairobi attestation service to save time." },
      { step: 3, title: "Employer Applies for Employment Visa (MOL)",   description: "Your Omani employer applies for your Employment Visa through the Ministry of Manpower / Ministry of Labour. Once approved, the Entry Permit is sent to the Omani Embassy in Nairobi.",                                                                estimatedTime: "3-6 weeks",  tips: "Track through your employer's HR/PRO. Timing varies by ministry workload." },
      { step: 4, title: "GAMCA Medical (Nairobi)",                       description: "Complete the Gulf-approved medical at a GAMCA-authorised centre. Results in 3-5 days.",                                                                                                                                                                    estimatedTime: "1 week",       tips: "Book on gamca.com.sa. Repeats needed if you fail or expire." },
      { step: 5, title: "Collect Entry Visa + Travel",                    description: "Collect your Entry Visa from the Omani Embassy in Nairobi. Fly to Oman — must arrive within 90 days of visa issue.",                                                                                                                                          estimatedTime: "1-2 weeks",  tips: "Oman Air, Emirates, and Qatar fly Nairobi-Muscat." },
      { step: 6, title: "Oman Medical + Resident Card",                   description: "Within 30 days of arrival, complete a second medical in Oman (organised by employer). Register for your Resident Card (بطاقة مقيم) at the Royal Oman Police.",                                                                                                estimatedTime: "2-4 weeks",  tips: "Your employer's PRO handles most of this — do not surrender your passport unnecessarily." },
    ],
    processingTime: "Employment Visa (MOL): 3-6 weeks. Entry Visa: 1-2 weeks. Total: 6-10 weeks from job offer to arrival.",
    processingNote: "Oman's process is generally faster than Kuwait or Saudi. Larger employers (hospitals, hotel chains, oil companies) have experienced PRO teams that can process in 4-6 weeks.",
    costs: [
      { item: "Employment Visa Fee",                     amount: "OMR 20-100",             note: "Paid by employer typically" },
      { item: "Entry Visa Stamping",                      amount: "OMR 15-25",               note: "Omani embassy Nairobi" },
      { item: "GAMCA Medical (Kenya)",                    amount: "KES 12,000-18,000",      note: "GAMCA-approved centres only" },
      { item: "Oman Medical Test",                         amount: "OMR 15-30",               note: "Usually arranged by employer" },
      { item: "Certificate of Good Conduct (Kenya)",     amount: "KES 1,050",              note: "DCI Nairobi" },
      { item: "Document Attestation (Kenya + Embassy)",  amount: "KES 5,000-15,000",       note: "Per document" },
      { item: "Resident Card (Bataqa Muqeem)",           amount: "OMR 8-15",                note: "First issue + annual renewal" },
      { item: "Health Insurance",                          amount: "Included with visa",      note: "" },
    ],
    officialLinks: [
      { label: "Ministry of Labour Oman",                   url: "https://www.manpower.gov.om",                                   note: "Official work permit + labour law info" },
      { label: "Royal Oman Police (Visas)",                 url: "https://www.rop.gov.om",                                        note: "Entry, residency, and visa services" },
      { label: "Omani Embassy Nairobi",                     url: "https://www.mofa.gov.om",                                       note: "Document attestation + visa collection" },
      { label: "Oman Chamber of Commerce",                   url: "https://www.chamberoman.com",                                  note: "Verify your employer is a real registered Omani company" },
      { label: "GAMCA (Gulf medical)",                       url: "https://www.gamca.com.sa",                                     note: "Book your Kenya medical here" },
      { label: "Invest in Oman",                              url: "https://invest.oman.om",                                       note: "Investor/entrepreneur visa route + incentives" },
    ],
    faqs: [
      { q: "Is Oman safer than other Gulf countries?",       a: "Yes — Oman is widely regarded as the most peaceful, welcoming, and stable Gulf country. Crime is very low. The Omani culture is famously polite and hospitable. Kenyan diaspora is small but growing, especially in Muscat and Salalah." },
      { q: "How much can I save in Oman?",                    a: "Salaries are tax-free. A nurse earning OMR 400-600/month (~KES 135,000-200,000) with employer-provided housing + transport + meals can save 40-60% of gross. Hotel staff earning OMR 200-350/month save 30-50%." },
      { q: "What is Omanisation?",                             a: "Oman's government policy to reserve certain jobs for Omani nationals. Some sectors (banking, retail management) have quotas requiring 30-70% Omani employees. This mainly affects entry-level office roles. Nursing, hospitality, engineering, and oil & gas remain open to international hires because of skill shortages." },
      { q: "Should I use a Kenyan recruitment agency?",       a: "Only if they're licensed by the NEA (nea.go.ke). Never pay upfront placement fees. Legitimate agencies get paid by the Omani employer, not the worker." },
      { q: "Can I bring my family?",                            a: "Yes, once you have a valid Employment Visa + salary of at least OMR 600/month (varies by nationality and role). Spouse + children under 21 can join. Spouses can apply for their own work visa once in Oman." },
    ],
    keywordTags: ["oman work visa kenya", "muscat nurse hiring", "work in oman", "oman employment visa", "omanisation"],
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
            Browse All Educational Guides <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  const seoTitle = `${country.name} Educational Guide 2025 | WorkAbroad Hub`;
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
                <span className="hover:text-white transition-colors cursor-pointer">Educational Guides</span>
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

            <div className="mb-4 rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-900 dark:text-blue-100">
              <strong>Educational Guide:</strong> This guide is for educational purposes only. Visa requirements may change. Always confirm the latest requirements with the relevant embassy or immigration authority.
            </div>
                        <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-3">
              {country.name} — Educational Guide
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
              Government Portal Links
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
                <a href="/">
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
