"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDatabase = seedDatabase;
exports.promoteFirstUserToAdmin = promoteFirstUserToAdmin;
exports.seedStudentVisas = seedStudentVisas;
exports.seedApplicationPacks = seedApplicationPacks;
exports.seedFraudDetectionRules = seedFraudDetectionRules;
exports.seedVisaJobs = seedVisaJobs;
exports.seedUsaVisaJobs = seedUsaVisaJobs;
exports.seedPlans = seedPlans;
exports.ensureIndexes = ensureIndexes;
exports.syncNeaAgencies = syncNeaAgencies;
exports.deduplicateNeaAgencies = deduplicateNeaAgencies;
exports.syncServicePrices = syncServicePrices;
exports.seedCountryPortals = seedCountryPortals;
exports.syncPlanPrices = syncPlanPrices;
exports.ensureServiceOrderStatusCheck = ensureServiceOrderStatusCheck;
// @ts-nocheck
const db_1 = require("./db");
const schema_1 = require("@shared/schema");
const auth_1 = require("@shared/models/auth");
const drizzle_orm_1 = require("drizzle-orm");
async function seedDatabase() {
    const existingCountries = await db_1.db.select().from(schema_1.countries);
    if (existingCountries.length > 0) {
        console.log("Database already seeded");
        return;
    }
    console.log("Seeding database...");
    const [usa, canada, uae, uk, europe] = await db_1.db
        .insert(schema_1.countries)
        .values([
        { name: "USA", code: "usa", flagEmoji: "🇺🇸", isActive: true },
        { name: "Canada", code: "canada", flagEmoji: "🇨🇦", isActive: true },
        { name: "UAE / Arab Countries", code: "uae", flagEmoji: "🇦🇪", isActive: true },
        { name: "United Kingdom", code: "uk", flagEmoji: "🇬🇧", isActive: true },
        { name: "Europe", code: "europe", flagEmoji: "🇪🇺", isActive: true },
    ])
        .returning();
    await db_1.db.insert(schema_1.countryGuides).values([
        { countryId: usa.id, section: "before_apply", content: "Technical proficiency in your field, strong communication skills, adaptability to American work culture. STEM fields are in high demand. English fluency is essential. TOEFL or IELTS scores may be required for visa applications." },
        { countryId: usa.id, section: "cv_tips", content: "Use a resume format (1-2 pages max). Include professional summary, work experience with achievements and metrics, education, and skills. Avoid photos and personal information like age or marital status." },
        { countryId: usa.id, section: "visa_warning", content: "Apply only through official USCIS channels. Be wary of agents promising guaranteed visas. H-1B lottery has limited slots - timing is crucial. Never pay upfront fees for job placement. Legitimate US employers don't ask for visa processing fees." },
        { countryId: canada.id, section: "before_apply", content: "Skills matching Express Entry criteria score highly. French language ability is a plus. Healthcare, IT, and trades are in demand. English or French proficiency required. IELTS or CELPIP for English, TEF for French." },
        { countryId: canada.id, section: "cv_tips", content: "Canadian resume format: 2 pages max, no photos, no personal details. Focus on achievements and Canadian equivalencies of qualifications." },
        { countryId: canada.id, section: "visa_warning", content: "Use official IRCC website only. Work permits require job offers from LMIA-approved employers. Immigration consultants must be registered with ICCRC. Never pay for guaranteed job offers." },
        { countryId: uae.id, section: "before_apply", content: "Industry-specific expertise, cross-cultural adaptability, and professional certifications valued. Construction, hospitality, healthcare, and finance sectors are active. English is the business language." },
        { countryId: uae.id, section: "cv_tips", content: "Include photo, nationality, and visa status. Highlight international experience. Emirates employers prefer detailed CVs (2-3 pages acceptable)." },
        { countryId: uae.id, section: "visa_warning", content: "Employment visa requires employer sponsorship. Free zone companies have different visa rules. Legitimate employers never ask for recruitment fees. Verify company license on UAE government portals." },
        { countryId: uk.id, section: "before_apply", content: "Skills on the Shortage Occupation List have advantages. Healthcare workers, engineers, and tech professionals are in demand. English proficiency required. IELTS UKVI or equivalent test needed." },
        { countryId: uk.id, section: "cv_tips", content: "UK CV format: 2 pages, no photo, include nationality/work authorization status. Use British English spelling." },
        { countryId: uk.id, section: "visa_warning", content: "Skilled Worker visa requires sponsorship from licensed employer. Check employer's sponsor license on gov.uk. Use only gov.uk for visa applications. Never pay agencies for visa guarantees." },
        { countryId: europe.id, section: "before_apply", content: "EU Blue Card available for skilled workers. Language requirements vary by country - German for Germany, French for France, etc. Technical skills and qualifications highly valued. Recognition of foreign qualifications may be required." },
        { countryId: europe.id, section: "cv_tips", content: "European CV format (Europass) widely accepted. Include photo in Germany, France, and Southern Europe. 2 pages recommended. Highlight language skills prominently. Include date of birth and nationality." },
        { countryId: europe.id, section: "visa_warning", content: "Work permits vary by country. EU Blue Card requires job offer with minimum salary threshold. Beware of fake job offers from unverified companies. Always verify employer registration with local authorities." },
    ]);
    await db_1.db.insert(schema_1.jobLinks).values([
        // NOTE: Some Western job portals (Monster, TotalJobs, CareerBuilder, Workopolis)
        // use aggressive WAFs (Akamai etc.) that block non-local visitors — including
        // users browsing from Kenya. We intentionally exclude them and seed only
        // portals that are reliably reachable from any IP.
        { countryId: usa.id, name: "Indeed USA", url: "https://www.indeed.com", isActive: true, order: 1 },
        { countryId: usa.id, name: "LinkedIn Jobs", url: "https://www.linkedin.com/jobs", isActive: true, order: 2 },
        { countryId: usa.id, name: "USAJOBS (Government)", url: "https://www.usajobs.gov", isActive: true, order: 3 },
        { countryId: usa.id, name: "Dice (Tech)", url: "https://www.dice.com", isActive: true, order: 4 },
        { countryId: usa.id, name: "SimplyHired", url: "https://www.simplyhired.com", isActive: true, order: 5 },
        { countryId: canada.id, name: "Job Bank Canada", url: "https://www.jobbank.gc.ca", isActive: true, order: 1 },
        { countryId: canada.id, name: "Indeed Canada", url: "https://ca.indeed.com", isActive: true, order: 2 },
        { countryId: canada.id, name: "LinkedIn Jobs Canada", url: "https://www.linkedin.com/jobs/?location=Canada", isActive: true, order: 3 },
        { countryId: canada.id, name: "Adzuna Canada", url: "https://www.adzuna.ca", isActive: true, order: 4 },
        { countryId: canada.id, name: "Eluta", url: "https://www.eluta.ca", isActive: true, order: 5 },
        { countryId: uae.id, name: "Bayt", url: "https://www.bayt.com", isActive: true, order: 1 },
        { countryId: uae.id, name: "XpatJobs UAE", url: "https://unitedarabemirates.xpatjobs.com", isActive: true, order: 2 },
        { countryId: uae.id, name: "Indeed UAE", url: "https://www.indeed.ae", isActive: true, order: 3 },
        { countryId: uae.id, name: "LinkedIn Jobs", url: "https://www.linkedin.com/jobs", isActive: true, order: 4 },
        { countryId: uae.id, name: "Naukri Gulf", url: "https://www.naukrigulf.com", isActive: true, order: 5 },
        { countryId: uae.id, name: "GulfTalent", url: "https://www.gulftalent.com", isActive: true, order: 6 },
        { countryId: uk.id, name: "Indeed UK", url: "https://www.indeed.co.uk", isActive: true, order: 1 },
        { countryId: uk.id, name: "Reed", url: "https://www.reed.co.uk", isActive: true, order: 2 },
        { countryId: uk.id, name: "LinkedIn Jobs UK", url: "https://www.linkedin.com/jobs/?location=United+Kingdom", isActive: true, order: 3 },
        { countryId: uk.id, name: "CV-Library", url: "https://www.cv-library.co.uk", isActive: true, order: 4 },
        { countryId: uk.id, name: "Adzuna UK", url: "https://www.adzuna.co.uk", isActive: true, order: 5 },
        // Europe - Germany
        { countryId: europe.id, name: "🇩🇪 Make it in Germany", url: "https://www.make-it-in-germany.com", isActive: true, order: 1 },
        { countryId: europe.id, name: "🇩🇪 Arbeitsagentur", url: "https://www.arbeitsagentur.de", isActive: true, order: 2 },
        // Europe - France
        { countryId: europe.id, name: "🇫🇷 Pole Emploi", url: "https://www.pole-emploi.fr", isActive: true, order: 3 },
        { countryId: europe.id, name: "🇫🇷 Indeed France", url: "https://www.indeed.fr", isActive: true, order: 4 },
        // Europe - Netherlands
        { countryId: europe.id, name: "🇳🇱 IamExpat Jobs", url: "https://www.iamexpat.nl/jobs-netherlands", isActive: true, order: 5 },
        { countryId: europe.id, name: "🇳🇱 Glassdoor Netherlands", url: "https://www.glassdoor.nl", isActive: true, order: 6 },
        // Europe - Italy
        { countryId: europe.id, name: "🇮🇹 Cliclavoro", url: "https://www.cliclavoro.gov.it", isActive: true, order: 7 },
        { countryId: europe.id, name: "🇮🇹 Indeed Italy", url: "https://www.indeed.it", isActive: true, order: 8 },
        // Europe - Spain
        { countryId: europe.id, name: "🇪🇸 SEPE", url: "https://www.sepe.es", isActive: true, order: 9 },
        { countryId: europe.id, name: "🇪🇸 Indeed Spain", url: "https://www.indeed.es", isActive: true, order: 10 },
        // Europe - Poland
        { countryId: europe.id, name: "🇵🇱 Praca.gov.pl", url: "https://www.praca.gov.pl", isActive: true, order: 11 },
        { countryId: europe.id, name: "🇵🇱 Indeed Poland", url: "https://www.indeed.pl", isActive: true, order: 12 },
        // Europe - Sweden
        { countryId: europe.id, name: "🇸🇪 Arbetsformedlingen", url: "https://arbetsformedlingen.se", isActive: true, order: 13 },
        { countryId: europe.id, name: "🇸🇪 Indeed Sweden", url: "https://www.indeed.se", isActive: true, order: 14 },
    ]);
    await db_1.db.insert(schema_1.services).values([
        // --- CV & Documents ---
        {
            slug: "cv_check",
            name: "CV Health Check",
            description: "Free instant analysis of your CV — see what recruiters and ATS systems think before you apply",
            price: 0, currency: "KES", isActive: true, order: 0,
            category: "CV & Documents",
            features: ["ATS compatibility score", "Missing keyword report", "Format & length check", "Instant AI feedback", "No payment required"],
        },
        {
            slug: "cv_fix_lite",
            name: "CV Fix Lite",
            description: "Quick CV polish — fix formatting, grammar, and structure so your CV looks professional fast",
            price: 99, currency: "KES", isActive: true, order: 1,
            category: "CV & Documents",
            features: ["Grammar & spelling fix", "Professional formatting", "Structure improvement", "Delivered in 3 minutes", "Best for entry-level CVs"],
        },
        {
            slug: "ats_cv_optimization",
            name: "ATS CV Optimization",
            description: "Get your CV optimized to pass Applicant Tracking Systems used by major employers",
            price: 499, currency: "KES", isActive: true, order: 4,
            category: "CV & Documents", badge: "Popular",
            features: ["ATS keyword analysis & scoring", "Format optimized for recruiter systems", "Industry-specific keyword injection", "Before/after comparison report", "Delivered in Word & PDF"],
        },
        {
            slug: "cv_rewrite",
            name: "Country-Specific CV Rewrite",
            description: "Professional CV rewrite tailored to your target country's format and expectations",
            price: 699, currency: "KES", isActive: true, order: 5,
            category: "CV & Documents", badge: "Best Value",
            features: ["Target country format (UAE, UK, Canada, EU)", "Professional rewrite by career expert", "Highlight transferable skills", "ATS-safe formatting", "Word & PDF formats"],
        },
        {
            slug: "cover_letter",
            name: "Cover Letter Writing",
            description: "Custom cover letter that highlights your strengths for international employers",
            price: 149, currency: "KES", isActive: true, order: 3,
            category: "CV & Documents",
            features: ["Custom cover letter per role/country", "Tailored tone for target employer", "Addresses visa/relocation questions", "Highlights your strongest selling points", "⚡ Instant AI delivery — under 3 minutes"],
        },
        {
            slug: "sop_writing",
            name: "SOP / Statement of Purpose",
            description: "University and scholarship SOP writing tailored to your course and institution",
            price: 999, currency: "KES", isActive: true, order: 8,
            category: "CV & Documents",
            features: ["University & scholarship SOP writing", "Tailored to your course and institution", "Highlights academic motivation", "Proofread for grammar & flow", "Word & PDF delivery"],
        },
        {
            slug: "motivation_letter",
            name: "Motivation Letter Writing",
            description: "Formal motivation letter for EU jobs and scholarships, professionally structured",
            price: 699, currency: "KES", isActive: true, order: 9,
            category: "CV & Documents",
            features: ["Formal motivation letter (EU/scholarship use)", "Professionally structured & compelling", "Country & role specific tone", "Proofread & formatted", "⚡ Instant AI delivery — under 3 minutes"],
        },
        {
            slug: "ats_cover_bundle",
            name: "ATS + Cover Letter Bundle",
            description: "ATS-optimized CV and a matching cover letter in one package — best value deal",
            price: 799, currency: "KES", isActive: true, order: 10,
            category: "CV & Documents", badge: "Best Value",
            features: ["ATS-optimized CV + matching cover letter", "Single-package pricing", "Both tailored to same role/country", "Word & PDF formats", "⚡ Instant AI delivery — under 3 minutes"],
        },
        // --- Interview & Profile ---
        {
            slug: "interview_coaching",
            name: "Interview Coaching",
            description: "One-on-one interview preparation with live mock interviews and expert feedback",
            price: 1500, currency: "KES", isActive: true, order: 6,
            category: "Interview & Profile", badge: "Popular",
            features: ["Live mock interview session (WhatsApp)", "30 tailored Q&A for your role", "Salary negotiation coaching", "Common trap questions & red flags", "Follow-up email template included"],
        },
        {
            slug: "interview_prep_pack",
            name: "Interview Preparation Pack",
            description: "Get job-ready with a tailored question bank and coaching guide for your target role and country",
            price: 2000, currency: "KES", isActive: true, order: 14,
            category: "Interview & Profile", badge: "New",
            features: ["30 tailored interview Q&A for your role", "Behavioral (STAR method) coaching guide", "Common trap questions & how to answer", "Salary negotiation scripts", "Delivered as PDF + WhatsApp summary"],
        },
        {
            slug: "linkedin_optimization",
            name: "LinkedIn Profile Optimization",
            description: "Optimize your LinkedIn profile to attract international recruiters and hiring managers",
            price: 3000, currency: "KES", isActive: true, order: 6,
            category: "Interview & Profile", badge: "New",
            features: ["Full profile rewrite (headline, summary, skills)", "Keyword optimization for recruiter search", "International recruiter-focused positioning", "Profile strength score guide", "Connection strategy tips"],
        },
        // --- Legal & Verification ---
        {
            slug: "visa_guidance",
            name: "Visa Guidance Session",
            description: "Detailed guidance on visa requirements and the application process for your target country",
            price: 3000, currency: "KES", isActive: true, order: 5,
            category: "Legal & Verification",
            features: ["Step-by-step visa application walkthrough", "Documents checklist for target country", "Common rejection reasons & how to avoid", "Consulate & embassy contacts", "⚡ Instant AI delivery — under 3 minutes"],
        },
        {
            slug: "contract_review",
            name: "Employment Contract Review",
            description: "Have your overseas job offer contract reviewed for hidden clauses, red flags, and legal risks",
            price: 1200, currency: "KES", isActive: true, order: 15,
            category: "Legal & Verification", badge: "New",
            features: ["Full contract review (up to 15 pages)", "Red flag & hidden clause identification", "Salary, overtime & leave clause analysis", "Written report with risk ratings", "WhatsApp follow-up Q&A session"],
        },
        {
            slug: "employer_verification",
            name: "Employer Verification Report",
            description: "We verify the legitimacy of your prospective overseas employer before you sign",
            price: 999, currency: "KES", isActive: true, order: 16,
            category: "Legal & Verification", badge: "New",
            features: ["NEA license & government registry check", "Online reputation & reviews scan", "Complaints & fraud database check", "Business registration verification", "⚡ Instant AI delivery — under 3 minutes"],
        },
        // --- Job Search Tools ---
        {
            slug: "job_pack_5",
            name: "Job Pack — 5 Applications",
            description: "AI-tailored CV + cover letter for 5 jobs in one pack — apply to more, faster",
            price: 1299, currency: "KES", isActive: true, order: 11,
            category: "Job Search Tools", badge: "Most Popular",
            features: ["Tailored CV for each of 5 jobs", "Matching cover letter per application", "ATS-optimized per job description", "Application tracking dashboard", "⚡ AI delivery — under 10 minutes"],
        },
        {
            slug: "assisted_apply_lite",
            name: "Assisted Apply Lite",
            description: "We build and submit 5 job applications for you — just share your CV and target role",
            price: 1499, currency: "KES", isActive: true, order: 12,
            category: "Job Search Tools", badge: "New",
            features: ["5 job applications built for you", "Custom CV & cover letter per job", "ATS-optimized applications", "Application status tracking", "WhatsApp progress update"],
        },
        {
            slug: "guided_apply",
            name: "Guided Apply Mode",
            description: "We apply to 5 verified overseas jobs on your behalf with custom CV and cover letters",
            price: 2500, currency: "KES", isActive: true, order: 13,
            category: "Job Search Tools", badge: "Premium",
            features: ["We apply to 5 verified jobs on your behalf", "Custom CV & cover letter per application", "Application tracking dashboard", "Weekly progress WhatsApp report", "Refund policy if no interviews in 30 days"],
        },
        {
            slug: "application_tracking",
            name: "Application Tracking Pro",
            description: "Personal application tracker set up and configured for your job search journey",
            price: 2000, currency: "KES", isActive: true, order: 12,
            category: "Job Search Tools",
            features: ["Personalized application tracker setup", "Track status: Applied, Interview, Offer", "Deadline & follow-up reminders", "Integrated with job portals", "Export progress report"],
        },
        {
            slug: "deadline_alerts",
            name: "Reminder & Deadline Alerts",
            description: "Never miss an application window — get alerts for job postings, visa dates, and deadlines",
            price: 1500, currency: "KES", isActive: true, order: 13,
            category: "Job Search Tools",
            features: ["Deadline alerts for job postings & visas", "WhatsApp & email reminder options", "Customizable reminder frequency", "Never miss an application window", "Works with any job portal"],
        },
        {
            slug: "pre_departure_pack",
            name: "Pre-Departure Orientation Pack",
            description: "Everything you need to know before flying out — housing, banking, culture, legal rights and safety",
            price: 1500, currency: "KES", isActive: true, order: 19,
            category: "Job Search Tools", badge: "New",
            features: ["Country-specific housing & cost guide", "Banking & money transfer setup tips", "Worker rights & labor law overview", "Cultural dos and don'ts", "Emergency contacts & embassy details"],
        },
        // --- Support Plans (subscriptions) ---
        {
            slug: "whatsapp_support",
            name: "Premium WhatsApp Support",
            description: "30 days of priority WhatsApp support for all your job search and application questions",
            price: 1000, currency: "KES", isActive: true, order: 7,
            category: "Support Plans",
            isSubscription: true, subscriptionPeriod: "monthly",
            features: ["30 days priority WhatsApp access", "Answer all application questions", "CV & cover letter quick reviews", "Scam/agency verification on demand", "Response within 2 hours"],
        },
        {
            slug: "job_alerts",
            name: "Premium Job Alerts",
            description: "Weekly curated, verified job listings sent directly to your WhatsApp matched to your skills",
            price: 500, currency: "KES", isActive: true, order: 17,
            category: "Support Plans", badge: "Popular",
            isSubscription: true, subscriptionPeriod: "monthly",
            features: ["Weekly verified job listings via WhatsApp", "Matched to your skills & target country", "Only NEA-licensed agency postings", "Scam-filtered & legitimacy-scored jobs", "Cancel anytime"],
        },
        {
            slug: "emergency_support",
            name: "Abroad Worker Emergency Support",
            description: "Already working overseas? Get 24/7 WhatsApp support for workplace disputes and emergencies",
            price: 300, currency: "KES", isActive: true, order: 18,
            category: "Support Plans", badge: "New",
            isSubscription: true, subscriptionPeriod: "monthly",
            features: ["24/7 WhatsApp emergency response line", "Workplace dispute & rights guidance", "Embassy & consulate contact referrals", "Repatriation assistance coordination", "Priority response within 1 hour"],
        },
    ]);
    console.log("Database seeded successfully!");
}
async function promoteFirstUserToAdmin() {
    const allUsers = await db_1.db.select().from(auth_1.users).limit(1);
    if (allUsers.length > 0 && !allUsers[0].isAdmin) {
        await db_1.db.update(auth_1.users).set({ isAdmin: true }).where((0, drizzle_orm_1.eq)(auth_1.users.id, allUsers[0].id));
        console.log(`Promoted user ${allUsers[0].email} to admin`);
    }
}
async function seedStudentVisas() {
    const existingVisas = await db_1.db.select().from(schema_1.studentVisas);
    if (existingVisas.length > 0) {
        console.log("Student visas already seeded");
        return;
    }
    console.log("Seeding student visas...");
    // USA Student Visas
    const [usaF1] = await db_1.db.insert(schema_1.studentVisas).values({
        countryCode: "usa",
        visaName: "F-1 Student Visa",
        visaType: "Student",
        description: "The most common visa for international students studying at US universities, colleges, and language programs. Allows full-time academic study.",
        processingTime: "3-8 weeks",
        applicationFee: "$185 (SEVIS $350)",
        validityPeriod: "Duration of study + 60 days",
        workRights: "20 hrs/week on-campus",
        isActive: true,
    }).returning();
    await db_1.db.insert(schema_1.visaRequirements).values([
        { visaId: usaF1.id, category: "academic", requirement: "Form I-20 from SEVP-certified school", isRequired: true, order: 1 },
        { visaId: usaF1.id, category: "academic", requirement: "Acceptance letter from accredited institution", isRequired: true, order: 2 },
        { visaId: usaF1.id, category: "academic", requirement: "Previous academic transcripts and diplomas", isRequired: true, order: 3 },
        { visaId: usaF1.id, category: "financial", requirement: "Proof of funds covering tuition + living expenses for 1 year", isRequired: true, order: 4 },
        { visaId: usaF1.id, category: "financial", requirement: "Bank statements (last 3-6 months)", isRequired: true, order: 5 },
        { visaId: usaF1.id, category: "financial", requirement: "Financial sponsor letter (if applicable)", isRequired: false, order: 6 },
        { visaId: usaF1.id, category: "english", requirement: "TOEFL iBT (minimum 80) or IELTS (minimum 6.5)", isRequired: true, order: 7 },
        { visaId: usaF1.id, category: "english", requirement: "Duolingo English Test (minimum 105) accepted by some schools", isRequired: false, order: 8 },
        { visaId: usaF1.id, category: "other", requirement: "Valid passport (6+ months validity)", isRequired: true, order: 9 },
        { visaId: usaF1.id, category: "other", requirement: "DS-160 online application form", isRequired: true, order: 10 },
        { visaId: usaF1.id, category: "other", requirement: "Passport-sized photographs (2x2 inches)", isRequired: true, order: 11 },
    ]);
    await db_1.db.insert(schema_1.visaSteps).values([
        { visaId: usaF1.id, stepNumber: 1, title: "Apply to Schools", description: "Research and apply to SEVP-certified schools in the US. Submit applications well before deadlines.", estimatedTime: "3-6 months", tips: "Apply to multiple schools to increase acceptance chances" },
        { visaId: usaF1.id, stepNumber: 2, title: "Receive I-20", description: "Once accepted, the school will issue Form I-20. Review it carefully for accuracy.", estimatedTime: "2-4 weeks", tips: "Sign the form and keep copies" },
        { visaId: usaF1.id, stepNumber: 3, title: "Pay SEVIS Fee", description: "Pay the I-901 SEVIS fee online at fmjfee.com before scheduling your visa interview.", estimatedTime: "Same day", tips: "Keep the receipt - you'll need it at the interview" },
        { visaId: usaF1.id, stepNumber: 4, title: "Complete DS-160", description: "Fill out the DS-160 online visa application form. Upload your photo and print confirmation.", estimatedTime: "1-2 hours", tips: "Save frequently - the form times out after 20 minutes" },
        { visaId: usaF1.id, stepNumber: 5, title: "Schedule Interview", description: "Create an account on the embassy website and schedule your visa interview appointment.", estimatedTime: "Varies by embassy", tips: "Book early during peak seasons (Apr-Jul)" },
        { visaId: usaF1.id, stepNumber: 6, title: "Attend Interview", description: "Bring all required documents to your visa interview. Answer questions honestly and confidently.", estimatedTime: "15-30 minutes", tips: "Prepare to explain your study plans and ties to home country" },
    ]);
    // Canada Student Visas
    const [canadaStudy] = await db_1.db.insert(schema_1.studentVisas).values({
        countryCode: "canada",
        visaName: "Study Permit",
        visaType: "Student",
        description: "Required for international students studying in Canada for programs longer than 6 months. Allows work during and after studies.",
        processingTime: "8-16 weeks",
        applicationFee: "CAD $150",
        validityPeriod: "Duration of study + 90 days",
        workRights: "20 hrs/week off-campus",
        isActive: true,
    }).returning();
    await db_1.db.insert(schema_1.visaRequirements).values([
        { visaId: canadaStudy.id, category: "academic", requirement: "Letter of Acceptance from DLI (Designated Learning Institution)", isRequired: true, order: 1 },
        { visaId: canadaStudy.id, category: "academic", requirement: "Previous academic transcripts", isRequired: true, order: 2 },
        { visaId: canadaStudy.id, category: "financial", requirement: "Proof of funds: CAD $10,000/year + tuition", isRequired: true, order: 3 },
        { visaId: canadaStudy.id, category: "financial", requirement: "GIC (Guaranteed Investment Certificate) from participating bank", isRequired: false, order: 4 },
        { visaId: canadaStudy.id, category: "english", requirement: "IELTS Academic (minimum 6.0) or TOEFL iBT (minimum 80)", isRequired: true, order: 5 },
        { visaId: canadaStudy.id, category: "english", requirement: "TEF/TCF for French-language programs", isRequired: false, order: 6 },
        { visaId: canadaStudy.id, category: "health", requirement: "Medical exam (if required based on country)", isRequired: false, order: 7 },
        { visaId: canadaStudy.id, category: "health", requirement: "Police clearance certificate", isRequired: true, order: 8 },
        { visaId: canadaStudy.id, category: "other", requirement: "Valid passport", isRequired: true, order: 9 },
        { visaId: canadaStudy.id, category: "other", requirement: "Digital photos meeting specifications", isRequired: true, order: 10 },
    ]);
    await db_1.db.insert(schema_1.visaSteps).values([
        { visaId: canadaStudy.id, stepNumber: 1, title: "Apply to DLI", description: "Apply to a Designated Learning Institution in Canada. Ensure the school is on the DLI list.", estimatedTime: "2-4 months", tips: "Check if school qualifies for PGWP eligibility" },
        { visaId: canadaStudy.id, stepNumber: 2, title: "Get Acceptance Letter", description: "Receive your official letter of acceptance with your DLI number.", estimatedTime: "2-6 weeks", tips: "Verify the DLI number on IRCC website" },
        { visaId: canadaStudy.id, stepNumber: 3, title: "Get Proof of Funds", description: "Prepare financial documents. Consider opening a GIC account for faster processing.", estimatedTime: "1-2 weeks", tips: "GIC + first year tuition paid = Student Direct Stream eligibility" },
        { visaId: canadaStudy.id, stepNumber: 4, title: "Apply Online", description: "Create a GCKey account and submit your study permit application online.", estimatedTime: "2-3 hours", tips: "Use the document checklist specific to your country" },
        { visaId: canadaStudy.id, stepNumber: 5, title: "Biometrics", description: "Schedule and complete biometrics appointment at a VAC near you.", estimatedTime: "1-2 weeks", tips: "Book early - appointments can fill up quickly" },
        { visaId: canadaStudy.id, stepNumber: 6, title: "Wait for Decision", description: "Monitor your application status online. You may be asked for additional documents.", estimatedTime: "8-16 weeks", tips: "Apply at least 4 months before your program starts" },
    ]);
    // UK Student Visas
    const [ukStudent] = await db_1.db.insert(schema_1.studentVisas).values({
        countryCode: "uk",
        visaName: "Student Visa (Tier 4)",
        visaType: "Student",
        description: "For international students studying at licensed UK institutions. Replaced the Tier 4 visa in 2020.",
        processingTime: "3-4 weeks",
        applicationFee: "£363 + IHS £470/year",
        validityPeriod: "Duration of course + 4 months",
        workRights: "20 hrs/week term-time",
        isActive: true,
    }).returning();
    await db_1.db.insert(schema_1.visaRequirements).values([
        { visaId: ukStudent.id, category: "academic", requirement: "CAS (Confirmation of Acceptance for Studies) from licensed sponsor", isRequired: true, order: 1 },
        { visaId: ukStudent.id, category: "academic", requirement: "Academic qualifications as specified in CAS", isRequired: true, order: 2 },
        { visaId: ukStudent.id, category: "financial", requirement: "£1,334/month for London or £1,023/month outside London (9 months)", isRequired: true, order: 3 },
        { visaId: ukStudent.id, category: "financial", requirement: "Tuition fees for first year (or remaining balance)", isRequired: true, order: 4 },
        { visaId: ukStudent.id, category: "english", requirement: "IELTS for UKVI (minimum B2 level - 5.5 overall)", isRequired: true, order: 5 },
        { visaId: ukStudent.id, category: "english", requirement: "Degree-level: minimum B2 (5.5); Below degree: minimum B1 (4.0)", isRequired: true, order: 6 },
        { visaId: ukStudent.id, category: "health", requirement: "TB test (if from listed country)", isRequired: false, order: 7 },
        { visaId: ukStudent.id, category: "other", requirement: "Valid passport", isRequired: true, order: 8 },
        { visaId: ukStudent.id, category: "other", requirement: "ATAS certificate (for sensitive subjects)", isRequired: false, order: 9 },
    ]);
    await db_1.db.insert(schema_1.visaSteps).values([
        { visaId: ukStudent.id, stepNumber: 1, title: "Get CAS", description: "Apply and get accepted by a licensed UK institution. They will issue your CAS.", estimatedTime: "1-3 months", tips: "CAS is valid for 6 months - apply promptly" },
        { visaId: ukStudent.id, stepNumber: 2, title: "Take IELTS UKVI", description: "Book and complete the IELTS for UKVI test at an approved center.", estimatedTime: "2-4 weeks", tips: "Must be UKVI version, not regular IELTS" },
        { visaId: ukStudent.id, stepNumber: 3, title: "Prepare Finances", description: "Ensure funds are held for 28 consecutive days before application.", estimatedTime: "28+ days", tips: "Use a bank account in your name or parent's" },
        { visaId: ukStudent.id, stepNumber: 4, title: "Apply Online", description: "Complete the online application form on gov.uk and pay fees.", estimatedTime: "1-2 hours", tips: "Pay IHS fee as part of application" },
        { visaId: ukStudent.id, stepNumber: 5, title: "Biometrics", description: "Visit a visa application centre for biometrics and document submission.", estimatedTime: "1 week", tips: "Book appointment in advance" },
        { visaId: ukStudent.id, stepNumber: 6, title: "Receive Decision", description: "Wait for visa decision. You'll get a vignette in your passport.", estimatedTime: "3-4 weeks", tips: "BRP card collected within 10 days of arrival" },
    ]);
    // Australia Student Visas
    const [ausStudent] = await db_1.db.insert(schema_1.studentVisas).values({
        countryCode: "australia",
        visaName: "Student Visa (Subclass 500)",
        visaType: "Student",
        description: "For international students studying full-time at registered Australian institutions. Includes post-study work rights.",
        processingTime: "4-8 weeks",
        applicationFee: "AUD $710",
        validityPeriod: "Duration of course + 2 months",
        workRights: "48 hrs/fortnight during term",
        isActive: true,
    }).returning();
    await db_1.db.insert(schema_1.visaRequirements).values([
        { visaId: ausStudent.id, category: "academic", requirement: "CoE (Confirmation of Enrolment) from CRICOS-registered provider", isRequired: true, order: 1 },
        { visaId: ausStudent.id, category: "academic", requirement: "Previous academic transcripts and qualifications", isRequired: true, order: 2 },
        { visaId: ausStudent.id, category: "financial", requirement: "AUD $24,505/year living costs + tuition + travel", isRequired: true, order: 3 },
        { visaId: ausStudent.id, category: "financial", requirement: "Evidence of genuine temporary entrant (GTE)", isRequired: true, order: 4 },
        { visaId: ausStudent.id, category: "english", requirement: "IELTS Academic (minimum 5.5) or equivalent", isRequired: true, order: 5 },
        { visaId: ausStudent.id, category: "english", requirement: "PTE Academic (minimum 42) accepted", isRequired: false, order: 6 },
        { visaId: ausStudent.id, category: "health", requirement: "Overseas Student Health Cover (OSHC) for duration of visa", isRequired: true, order: 7 },
        { visaId: ausStudent.id, category: "health", requirement: "Medical examination (if required)", isRequired: false, order: 8 },
        { visaId: ausStudent.id, category: "other", requirement: "Valid passport", isRequired: true, order: 9 },
        { visaId: ausStudent.id, category: "other", requirement: "Character declaration / police clearance", isRequired: true, order: 10 },
    ]);
    await db_1.db.insert(schema_1.visaSteps).values([
        { visaId: ausStudent.id, stepNumber: 1, title: "Apply to Institution", description: "Apply to a CRICOS-registered education provider in Australia.", estimatedTime: "2-4 months", tips: "Check CRICOS code to verify registration" },
        { visaId: ausStudent.id, stepNumber: 2, title: "Get CoE", description: "Accept offer and pay deposit to receive your Confirmation of Enrolment.", estimatedTime: "1-2 weeks", tips: "CoE contains your course details and dates" },
        { visaId: ausStudent.id, stepNumber: 3, title: "Get OSHC", description: "Purchase Overseas Student Health Cover for your entire visa period.", estimatedTime: "Same day", tips: "Compare providers: Medibank, Allianz, BUPA, NIB" },
        { visaId: ausStudent.id, stepNumber: 4, title: "Apply via ImmiAccount", description: "Create ImmiAccount and submit visa application online.", estimatedTime: "2-3 hours", tips: "Prepare GTE statement explaining genuine study intent" },
        { visaId: ausStudent.id, stepNumber: 5, title: "Biometrics & Health", description: "Complete biometrics and health examination if requested.", estimatedTime: "1-3 weeks", tips: "Use approved panel doctors only" },
        { visaId: ausStudent.id, stepNumber: 6, title: "Receive Grant", description: "Visa grant notification sent electronically to ImmiAccount.", estimatedTime: "4-8 weeks", tips: "Apply at least 6 weeks before course starts" },
    ]);
    // UAE Student Visas
    const [uaeStudent] = await db_1.db.insert(schema_1.studentVisas).values({
        countryCode: "uae",
        visaName: "Student Residence Visa",
        visaType: "Student",
        description: "For international students studying at licensed universities and colleges in the UAE.",
        processingTime: "2-4 weeks",
        applicationFee: "AED 500-1,500",
        validityPeriod: "1 year (renewable)",
        workRights: "Part-time allowed with permit",
        isActive: true,
    }).returning();
    await db_1.db.insert(schema_1.visaRequirements).values([
        { visaId: uaeStudent.id, category: "academic", requirement: "Acceptance letter from UAE-licensed institution", isRequired: true, order: 1 },
        { visaId: uaeStudent.id, category: "academic", requirement: "Attested academic certificates", isRequired: true, order: 2 },
        { visaId: uaeStudent.id, category: "academic", requirement: "Equivalency certificate for foreign qualifications", isRequired: true, order: 3 },
        { visaId: uaeStudent.id, category: "financial", requirement: "Proof of tuition payment or scholarship", isRequired: true, order: 4 },
        { visaId: uaeStudent.id, category: "financial", requirement: "Bank statements showing sufficient funds", isRequired: true, order: 5 },
        { visaId: uaeStudent.id, category: "english", requirement: "IELTS or TOEFL (requirements vary by institution)", isRequired: false, order: 6 },
        { visaId: uaeStudent.id, category: "health", requirement: "Medical fitness test in UAE", isRequired: true, order: 7 },
        { visaId: uaeStudent.id, category: "other", requirement: "Valid passport (6+ months validity)", isRequired: true, order: 8 },
        { visaId: uaeStudent.id, category: "other", requirement: "Passport photos (white background)", isRequired: true, order: 9 },
        { visaId: uaeStudent.id, category: "other", requirement: "Emirates ID application", isRequired: true, order: 10 },
    ]);
    await db_1.db.insert(schema_1.visaSteps).values([
        { visaId: uaeStudent.id, stepNumber: 1, title: "Apply to University", description: "Apply to a UAE-licensed university or college. Get your acceptance letter.", estimatedTime: "1-2 months", tips: "Check institution license on KHDA/MOHESR website" },
        { visaId: uaeStudent.id, stepNumber: 2, title: "Get Entry Permit", description: "University sponsors your entry permit. Enter UAE on this permit.", estimatedTime: "1-2 weeks", tips: "Entry permit valid for 60 days" },
        { visaId: uaeStudent.id, stepNumber: 3, title: "Medical Test", description: "Complete medical fitness test at approved center in UAE.", estimatedTime: "2-3 days", tips: "Includes blood test and chest X-ray" },
        { visaId: uaeStudent.id, stepNumber: 4, title: "Apply for Emirates ID", description: "Apply for Emirates ID at typing center or online.", estimatedTime: "1 week", tips: "Required for residence visa stamping" },
        { visaId: uaeStudent.id, stepNumber: 5, title: "Visa Stamping", description: "Submit passport for residence visa stamping through university.", estimatedTime: "1-2 weeks", tips: "Don't travel during processing" },
    ]);
    // Europe (Germany) Student Visas
    const [germanyStudent] = await db_1.db.insert(schema_1.studentVisas).values({
        countryCode: "europe",
        visaName: "German Student Visa (National Visa)",
        visaType: "Student",
        description: "For non-EU students studying at German universities. Germany offers tuition-free education at public universities.",
        processingTime: "4-12 weeks",
        applicationFee: "€75",
        validityPeriod: "Duration of course (renewable)",
        workRights: "120 full days or 240 half days/year",
        isActive: true,
    }).returning();
    await db_1.db.insert(schema_1.visaRequirements).values([
        { visaId: germanyStudent.id, category: "academic", requirement: "Admission letter (Zulassungsbescheid) from German university", isRequired: true, order: 1 },
        { visaId: germanyStudent.id, category: "academic", requirement: "University entrance qualification (Hochschulzugangsberechtigung)", isRequired: true, order: 2 },
        { visaId: germanyStudent.id, category: "financial", requirement: "Blocked account (Sperrkonto) with €11,208/year or equivalent", isRequired: true, order: 3 },
        { visaId: germanyStudent.id, category: "financial", requirement: "Scholarship letter or sponsorship declaration", isRequired: false, order: 4 },
        { visaId: germanyStudent.id, category: "english", requirement: "German language certificate (B1-C1 depending on program)", isRequired: false, order: 5 },
        { visaId: germanyStudent.id, category: "english", requirement: "IELTS/TOEFL for English-taught programs", isRequired: false, order: 6 },
        { visaId: germanyStudent.id, category: "health", requirement: "Health insurance valid in Germany", isRequired: true, order: 7 },
        { visaId: germanyStudent.id, category: "other", requirement: "Valid passport", isRequired: true, order: 8 },
        { visaId: germanyStudent.id, category: "other", requirement: "Completed visa application form", isRequired: true, order: 9 },
        { visaId: germanyStudent.id, category: "other", requirement: "Biometric photos", isRequired: true, order: 10 },
    ]);
    await db_1.db.insert(schema_1.visaSteps).values([
        { visaId: germanyStudent.id, stepNumber: 1, title: "Apply via uni-assist", description: "Most universities require application through uni-assist portal.", estimatedTime: "2-4 months", tips: "Some universities accept direct applications" },
        { visaId: germanyStudent.id, stepNumber: 2, title: "Get Admission Letter", description: "Receive Zulassungsbescheid (admission letter) from university.", estimatedTime: "4-8 weeks", tips: "May need to complete Studienkolleg first" },
        { visaId: germanyStudent.id, stepNumber: 3, title: "Open Blocked Account", description: "Open a blocked account with German bank (Fintiba, Expatrio, etc.)", estimatedTime: "1-2 weeks", tips: "Deposit €11,208 minimum for one year" },
        { visaId: germanyStudent.id, stepNumber: 4, title: "Get Health Insurance", description: "Arrange German health insurance (public or private).", estimatedTime: "Same day", tips: "TK, AOK for public; Mawista, DR-WALTER for private" },
        { visaId: germanyStudent.id, stepNumber: 5, title: "Book Embassy Appointment", description: "Schedule visa appointment at German embassy/consulate.", estimatedTime: "2-8 weeks wait", tips: "Book early - appointments fill quickly" },
        { visaId: germanyStudent.id, stepNumber: 6, title: "Visa Interview", description: "Attend visa interview with all original documents.", estimatedTime: "15-30 minutes", tips: "Basic German knowledge may be tested" },
    ]);
    // Add useful links for all countries
    await db_1.db.insert(schema_1.visaLinks).values([
        // USA Links
        { countryCode: "usa", linkType: "official", name: "US Embassy Visa Information", url: "https://travel.state.gov/content/travel/en/us-visas/study.html", description: "Official US Department of State visa information" },
        { countryCode: "usa", linkType: "official", name: "SEVP School Search", url: "https://studyinthestates.dhs.gov/school-search", description: "Find SEVP-certified schools" },
        { countryCode: "usa", linkType: "scholarship", name: "EducationUSA", url: "https://educationusa.state.gov", description: "Free advising for study in USA" },
        // Canada Links
        { countryCode: "canada", linkType: "official", name: "IRCC Study Permit", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada.html", description: "Official study permit information" },
        { countryCode: "canada", linkType: "official", name: "DLI List", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/prepare/designated-learning-institutions-list.html", description: "List of Designated Learning Institutions" },
        { countryCode: "canada", linkType: "scholarship", name: "EduCanada", url: "https://www.educanada.ca", description: "Official Canadian education portal" },
        // UK Links
        { countryCode: "uk", linkType: "official", name: "UK Student Visa", url: "https://www.gov.uk/student-visa", description: "Official UK Government visa page" },
        { countryCode: "uk", linkType: "official", name: "UKVI Sponsor List", url: "https://www.gov.uk/government/publications/register-of-licensed-sponsors-students", description: "Licensed sponsor institutions" },
        { countryCode: "uk", linkType: "university", name: "UCAS", url: "https://www.ucas.com", description: "University admissions service" },
        // Australia Links
        { countryCode: "australia", linkType: "official", name: "Student Visa (500)", url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500", description: "Official visa information" },
        { countryCode: "australia", linkType: "official", name: "CRICOS Search", url: "https://cricos.education.gov.au", description: "Find registered institutions and courses" },
        { countryCode: "australia", linkType: "scholarship", name: "Study Australia", url: "https://www.studyaustralia.gov.au", description: "Official Australian education portal" },
        // UAE Links
        { countryCode: "uae", linkType: "official", name: "MOHRE", url: "https://www.mohre.gov.ae", description: "Ministry of Human Resources and Emiratisation" },
        { countryCode: "uae", linkType: "official", name: "MOHESR", url: "https://www.mohesr.gov.ae", description: "Ministry of Higher Education" },
        { countryCode: "uae", linkType: "university", name: "Study Dubai", url: "https://www.studydubai.gov.ae", description: "Dubai education portal" },
        // Europe Links
        { countryCode: "europe", linkType: "official", name: "Make it in Germany", url: "https://www.make-it-in-germany.com/en/study-training", description: "Official German immigration portal" },
        { countryCode: "europe", linkType: "official", name: "DAAD", url: "https://www.daad.de/en", description: "German Academic Exchange Service" },
        { countryCode: "europe", linkType: "scholarship", name: "Study in Europe", url: "https://ec.europa.eu/education/study-in-europe", description: "EU education portal" },
        { countryCode: "europe", linkType: "university", name: "uni-assist", url: "https://www.uni-assist.de/en", description: "German university application portal" },
    ]);
    console.log("Student visas seeded successfully!");
}
// Seed Application Packs for Assisted Apply Mode
async function seedApplicationPacks() {
    const existingPacks = await db_1.db.select().from(schema_1.applicationPacks);
    const hasJobPacks = existingPacks.some((p) => p.packType === "job");
    const hasStudentPacks = existingPacks.some((p) => p.packType === "student");
    const jobPacksToInsert = hasJobPacks ? [] : [
        {
            name: "Starter Pack",
            description: "Perfect for targeted job hunting",
            price: 1299,
            currency: "KES",
            applicationCount: 3,
            packType: "job",
            features: JSON.stringify([
                "3 tailored job applications",
                "Custom CV for each job",
                "Personalized cover letter",
                "ATS-optimized formatting",
                "3-day turnaround",
                "Email support"
            ]),
            turnaroundDays: 3,
            isPopular: false,
            isActive: true,
            order: 1,
        },
        {
            name: "Pro Pack",
            description: "Best value for active job seekers",
            price: 1999,
            currency: "KES",
            applicationCount: 8,
            packType: "job",
            features: JSON.stringify([
                "8 tailored job applications",
                "Custom CV for each job",
                "Personalized cover letter",
                "ATS-optimized formatting",
                "2-day priority turnaround",
                "Unlimited revisions",
                "WhatsApp support",
                "Application tracking dashboard"
            ]),
            turnaroundDays: 2,
            isPopular: true,
            isActive: true,
            order: 2,
        },
        {
            name: "Premium Pack",
            description: "Maximum support for serious candidates",
            price: 2999,
            currency: "KES",
            applicationCount: 15,
            packType: "job",
            features: JSON.stringify([
                "15 tailored job applications",
                "Custom CV for each job",
                "Personalized cover letter",
                "ATS-optimized formatting",
                "24-hour express turnaround",
                "Unlimited revisions",
                "Priority WhatsApp support",
                "Application tracking dashboard",
                "LinkedIn profile review",
                "Interview prep tips per company"
            ]),
            turnaroundDays: 1,
            isPopular: false,
            isActive: true,
            order: 3,
        },
    ];
    const studentPacksToInsert = hasStudentPacks ? [] : [
        {
            name: "Student Starter",
            description: "Perfect for students applying to universities",
            price: 1299,
            currency: "KES",
            applicationCount: 3,
            packType: "student",
            features: JSON.stringify([
                "3 university applications",
                "Custom Statement of Purpose",
                "Tailored motivation letter",
                "Document checklist",
                "5-day turnaround",
                "Email support"
            ]),
            turnaroundDays: 5,
            isPopular: false,
            isActive: true,
            order: 4,
        },
        {
            name: "Student Pro",
            description: "Maximize your chances with multiple applications",
            price: 1999,
            currency: "KES",
            applicationCount: 6,
            packType: "student",
            features: JSON.stringify([
                "6 university applications",
                "Custom Statement of Purpose",
                "Tailored motivation letter",
                "Scholarship essay support",
                "Document checklist & review",
                "3-day priority turnaround",
                "WhatsApp support",
                "Application tracking"
            ]),
            turnaroundDays: 3,
            isPopular: true,
            isActive: true,
            order: 5,
        },
        {
            name: "Student Premium",
            description: "Complete application support for dream universities",
            price: 2999,
            currency: "KES",
            applicationCount: 10,
            packType: "student",
            features: JSON.stringify([
                "10 university applications",
                "Custom Statement of Purpose",
                "Tailored motivation letter",
                "Scholarship essay support",
                "Full document preparation",
                "2-day express turnaround",
                "Priority WhatsApp support",
                "Application tracking",
                "Interview preparation guide",
                "Post-offer document support"
            ]),
            turnaroundDays: 2,
            isPopular: false,
            isActive: true,
            order: 6,
        },
    ];
    const toInsert = [...jobPacksToInsert, ...studentPacksToInsert];
    if (toInsert.length === 0) {
        console.log("Application packs already seeded");
        return;
    }
    console.log(`Seeding ${toInsert.length} application pack(s)...`);
    await db_1.db.insert(schema_1.applicationPacks).values(toInsert);
    console.log("Application packs seeded successfully!");
}
async function seedFraudDetectionRules() {
    const { storage } = await Promise.resolve().then(() => __importStar(require("./storage")));
    await storage.seedDefaultFraudDetectionRules();
    console.log("Fraud detection rules seeded");
}
async function seedVisaJobs() {
    const { jobs } = await Promise.resolve().then(() => __importStar(require("@shared/schema")));
    const existing = await db_1.db.select().from(jobs).limit(1);
    if (existing.length > 0) {
        console.log("Visa jobs already seeded");
        return;
    }
    const jobListings = [
        // ── United Kingdom ─────────────────────────────────────────────────────
        {
            title: "Registered Nurse (Band 5)",
            company: "NHS Trusts — Multiple Locations",
            country: "United Kingdom",
            salary: "£28,407 – £34,581/year",
            jobCategory: "Healthcare",
            visaSponsorship: true,
            applyLink: "https://www.jobs.nhs.uk",
            description: "NHS is actively recruiting internationally educated nurses from Kenya and East Africa. Full visa sponsorship under the Health & Care Worker visa. OSCE support provided. Relocation allowance included.",
            isActive: true,
        },
        {
            title: "Social Care Worker",
            company: "Carebridge UK Ltd",
            country: "United Kingdom",
            salary: "£23,000 – £26,000/year",
            jobCategory: "Healthcare",
            visaSponsorship: true,
            applyLink: "https://www.carehome.co.uk/jobs",
            description: "Support elderly and vulnerable adults with daily living activities. Visa sponsorship via Health & Care Worker visa. No experience required — full training provided.",
            isActive: true,
        },
        {
            title: "Software Engineer (Full Stack)",
            company: "Fintech Startup — London",
            country: "United Kingdom",
            salary: "£55,000 – £80,000/year",
            jobCategory: "Technology",
            visaSponsorship: true,
            applyLink: "https://www.linkedin.com/jobs",
            description: "Build scalable fintech products using React, Node.js, and AWS. Skilled Worker visa sponsored. 2+ years experience required.",
            isActive: true,
        },
        {
            title: "Civil Engineer",
            company: "Mott MacDonald UK",
            country: "United Kingdom",
            salary: "£38,000 – £52,000/year",
            jobCategory: "Engineering",
            visaSponsorship: true,
            applyLink: "https://www.mottmac.com/careers",
            description: "Infrastructure and civil engineering projects across the UK. Degree in Civil Engineering required. Skilled Worker visa sponsored.",
            isActive: true,
        },
        {
            title: "Hospitality Supervisor",
            company: "Marriott Hotels UK",
            country: "United Kingdom",
            salary: "£24,000 – £30,000/year",
            jobCategory: "Hospitality",
            visaSponsorship: true,
            applyLink: "https://careers.marriott.com",
            description: "Oversee front-of-house operations at a premium London hotel. Experience in hotel management required. Visa sponsorship provided.",
            isActive: true,
        },
        {
            title: "Accountant (ACCA/CPA)",
            company: "Deloitte UK",
            country: "United Kingdom",
            salary: "£42,000 – £58,000/year",
            jobCategory: "Finance",
            visaSponsorship: true,
            applyLink: "https://www2.deloitte.com/uk/en/pages/careers",
            description: "Financial reporting and audit work with global clients. ACCA or CPA qualification required. Skilled Worker visa sponsored.",
            isActive: true,
        },
        // ── Canada ─────────────────────────────────────────────────────────────
        {
            title: "Personal Support Worker (PSW)",
            company: "Extendicare Canada",
            country: "Canada",
            salary: "CAD $22 – $28/hour",
            jobCategory: "Healthcare",
            visaSponsorship: true,
            applyLink: "https://www.extendicare.com/careers",
            description: "Provide personal care to elderly residents in long-term care facilities across Ontario. LMIA-supported work permit. Pathway to permanent residence.",
            isActive: true,
        },
        {
            title: "Registered Nurse (RN)",
            company: "Vancouver Coastal Health",
            country: "Canada",
            salary: "CAD $42 – $55/hour",
            jobCategory: "Healthcare",
            visaSponsorship: true,
            applyLink: "https://www.vch.ca/careers",
            description: "Acute care nursing positions in British Columbia. NCLEX-RN required. Employer-supported LMIA work permit. Express Entry-eligible role.",
            isActive: true,
        },
        {
            title: "IT Systems Analyst",
            company: "RBC Technology",
            country: "Canada",
            salary: "CAD $75,000 – $100,000/year",
            jobCategory: "Technology",
            visaSponsorship: true,
            applyLink: "https://jobs.rbc.com",
            description: "Analyse and improve enterprise IT systems for Canada's largest bank. 3+ years experience. Global Talent Stream work permit sponsored.",
            isActive: true,
        },
        {
            title: "Electrical Engineer",
            company: "SNC-Lavalin Group",
            country: "Canada",
            salary: "CAD $80,000 – $110,000/year",
            jobCategory: "Engineering",
            visaSponsorship: true,
            applyLink: "https://www.snclavalin.com/careers",
            description: "Electrical design for large infrastructure and energy projects across Canada. P.Eng or equivalent required. LMIA work permit sponsored.",
            isActive: true,
        },
        {
            title: "Hotel Front Desk Supervisor",
            company: "Fairmont Hotels & Resorts",
            country: "Canada",
            salary: "CAD $45,000 – $55,000/year",
            jobCategory: "Hospitality",
            visaSponsorship: true,
            applyLink: "https://careers.fairmont.com",
            description: "Lead front desk operations at luxury properties in Banff and Toronto. 2+ years hotel experience. LMIA work permit provided.",
            isActive: true,
        },
        {
            title: "Financial Analyst (CFA)",
            company: "TD Bank Group",
            country: "Canada",
            salary: "CAD $70,000 – $90,000/year",
            jobCategory: "Finance",
            visaSponsorship: true,
            applyLink: "https://jobs.td.com",
            description: "Investment analysis and financial modelling for Canada's second-largest bank. CFA or CPA preferred. Work permit sponsorship available.",
            isActive: true,
        },
        // ── United Arab Emirates ───────────────────────────────────────────────
        {
            title: "Nurse (DHA Licensed)",
            company: "Mediclinic Middle East",
            country: "United Arab Emirates",
            salary: "AED 8,000 – 14,000/month",
            jobCategory: "Healthcare",
            visaSponsorship: true,
            applyLink: "https://www.mediclinic.ae/careers",
            description: "Nursing positions in Dubai clinics and hospitals. DHA/HAAD license required or assistance obtaining it provided. Full residence visa, housing allowance, and flights included.",
            isActive: true,
        },
        {
            title: "Construction Project Manager",
            company: "ALEC Engineering & Contracting",
            country: "United Arab Emirates",
            salary: "AED 18,000 – 30,000/month",
            jobCategory: "Engineering",
            visaSponsorship: true,
            applyLink: "https://www.alec.ae/careers",
            description: "Manage large commercial construction projects in Dubai. 8+ years experience in project management. Residence visa and housing provided.",
            isActive: true,
        },
        {
            title: "Sous Chef",
            company: "Jumeirah Group",
            country: "United Arab Emirates",
            salary: "AED 6,000 – 10,000/month",
            jobCategory: "Hospitality",
            visaSponsorship: true,
            applyLink: "https://careers.jumeirah.com",
            description: "Lead kitchen operations at award-winning Jumeirah hotels in Dubai. 5-star hotel experience required. Residence visa, accommodation and flights provided.",
            isActive: true,
        },
        {
            title: "Cybersecurity Engineer",
            company: "du Telecom UAE",
            country: "United Arab Emirates",
            salary: "AED 20,000 – 35,000/month",
            jobCategory: "Technology",
            visaSponsorship: true,
            applyLink: "https://www.du.ae/careers",
            description: "Protect critical telecom infrastructure. CISSP or CEH certification preferred. Residence visa and family sponsorship available.",
            isActive: true,
        },
        {
            title: "Structural Engineer",
            company: "Atkins Global — Abu Dhabi",
            country: "United Arab Emirates",
            salary: "AED 15,000 – 22,000/month",
            jobCategory: "Engineering",
            visaSponsorship: true,
            applyLink: "https://careers.atkinsrealis.com",
            description: "Structural design for iconic UAE infrastructure and building projects. Degree in Civil/Structural Engineering required. Full residence visa package.",
            isActive: true,
        },
        {
            title: "Investment Analyst",
            company: "Abu Dhabi Investment Authority (ADIA)",
            country: "United Arab Emirates",
            salary: "AED 25,000 – 45,000/month",
            jobCategory: "Finance",
            visaSponsorship: true,
            applyLink: "https://www.adia.ae/careers",
            description: "Manage global portfolio investments for one of the world's largest sovereign wealth funds. CFA required. Comprehensive expat package.",
            isActive: true,
        },
        // ── Australia ──────────────────────────────────────────────────────────
        {
            title: "Enrolled Nurse (EN)",
            company: "Bupa Aged Care Australia",
            country: "Australia",
            salary: "AUD $60,000 – $75,000/year",
            jobCategory: "Healthcare",
            visaSponsorship: true,
            applyLink: "https://careers.bupa.com.au",
            description: "Provide quality nursing care to aged care residents across Victoria and NSW. AHPRA registration required. Employer-sponsored 482 visa. Regional placements available.",
            isActive: true,
        },
        {
            title: "Mining Engineer",
            company: "BHP Group",
            country: "Australia",
            salary: "AUD $120,000 – $160,000/year",
            jobCategory: "Engineering",
            visaSponsorship: true,
            applyLink: "https://careers.bhp.com",
            description: "Underground and open-cut mining engineering in Western Australia. 3+ years experience. TSS 482 visa sponsored. FIFO roster available.",
            isActive: true,
        },
        {
            title: "Cloud Solutions Architect",
            company: "Telstra",
            country: "Australia",
            salary: "AUD $130,000 – $170,000/year",
            jobCategory: "Technology",
            visaSponsorship: true,
            applyLink: "https://careers.telstra.com",
            description: "Design enterprise cloud solutions for Australia's largest telecom. AWS/Azure certification required. Skilled Worker 482 visa sponsored.",
            isActive: true,
        },
        {
            title: "Chef de Partie",
            company: "Crown Resorts Melbourne",
            country: "Australia",
            salary: "AUD $65,000 – $80,000/year",
            jobCategory: "Hospitality",
            visaSponsorship: true,
            applyLink: "https://careers.crownresorts.com.au",
            description: "Work in award-winning hotel kitchens in Melbourne. 3+ years experience in a 5-star kitchen. TSS 482 visa sponsored.",
            isActive: true,
        },
        {
            title: "Auditor (CA/CPA)",
            company: "PwC Australia",
            country: "Australia",
            salary: "AUD $85,000 – $115,000/year",
            jobCategory: "Finance",
            visaSponsorship: true,
            applyLink: "https://www.pwc.com.au/careers",
            description: "External audit services for ASX-listed companies. CA or CPA qualification required. Skilled Worker 482 visa available for strong candidates.",
            isActive: true,
        },
        // ── Germany ────────────────────────────────────────────────────────────
        {
            title: "Geriatric Nurse (Altenpfleger/in)",
            company: "Johanniter-Unfall-Hilfe",
            country: "Germany",
            salary: "€2,800 – €3,600/month",
            jobCategory: "Healthcare",
            visaSponsorship: true,
            applyLink: "https://www.johanniter.de/karriere",
            description: "Care for elderly patients in German care facilities. German language A2 minimum (B2 preferred). Recognition of Kenyan nursing qualifications supported. Skilled Immigration Act visa.",
            isActive: true,
        },
        {
            title: "Mechanical Engineer",
            company: "Siemens AG",
            country: "Germany",
            salary: "€55,000 – €75,000/year",
            jobCategory: "Engineering",
            visaSponsorship: true,
            applyLink: "https://www.siemens.com/careers",
            description: "Design and develop industrial machinery and automation systems. Degree in Mechanical Engineering and English fluency required. EU Blue Card visa sponsored.",
            isActive: true,
        },
        {
            title: "Data Engineer",
            company: "SAP SE",
            country: "Germany",
            salary: "€60,000 – €90,000/year",
            jobCategory: "Technology",
            visaSponsorship: true,
            applyLink: "https://jobs.sap.com",
            description: "Build data pipelines and analytics infrastructure on SAP's cloud platform. Python, Spark, and SQL required. EU Blue Card visa for non-EU nationals.",
            isActive: true,
        },
        {
            title: "Hotel Operations Manager",
            company: "Hilton Hotels Germany",
            country: "Germany",
            salary: "€42,000 – €58,000/year",
            jobCategory: "Hospitality",
            visaSponsorship: true,
            applyLink: "https://jobs.hilton.com",
            description: "Manage day-to-day operations of a 4-star hotel in Frankfurt. Hospitality management degree and English required. Skilled immigration visa sponsored.",
            isActive: true,
        },
        {
            title: "Risk Analyst",
            company: "Deutsche Bank",
            country: "Germany",
            salary: "€65,000 – €85,000/year",
            jobCategory: "Finance",
            visaSponsorship: true,
            applyLink: "https://careers.db.com",
            description: "Credit risk analysis and Basel III compliance reporting. FRM or CFA preferred. English-speaking role. EU Blue Card visa for qualified candidates.",
            isActive: true,
        },
        // ── Saudi Arabia ───────────────────────────────────────────────────────
        {
            title: "ICU Nurse",
            company: "King Faisal Specialist Hospital",
            country: "Saudi Arabia",
            salary: "SAR 8,000 – 14,000/month",
            jobCategory: "Healthcare",
            visaSponsorship: true,
            applyLink: "https://www.kfshrc.edu.sa/careers",
            description: "Intensive care nursing in one of the Middle East's premier hospitals. BSc Nursing and 2+ years ICU experience required. Full employment visa, housing, flights and food allowance included.",
            isActive: true,
        },
        {
            title: "Piping Engineer",
            company: "Saudi Aramco",
            country: "Saudi Arabia",
            salary: "SAR 18,000 – 28,000/month",
            jobCategory: "Engineering",
            visaSponsorship: true,
            applyLink: "https://careers.aramco.com",
            description: "Design and oversee piping systems for oil & gas facilities. B.Eng in Mechanical or Chemical Engineering. Full expat package with housing and education allowance.",
            isActive: true,
        },
        {
            title: "Executive Chef",
            company: "Hilton Riyadh Hotel & Residences",
            country: "Saudi Arabia",
            salary: "SAR 15,000 – 22,000/month",
            jobCategory: "Hospitality",
            visaSponsorship: true,
            applyLink: "https://jobs.hilton.com",
            description: "Lead culinary operations for a 5-star hotel in Riyadh. 10+ years experience in luxury hospitality. Full visa package with housing, flights and meals.",
            isActive: true,
        },
        {
            title: "Network Security Engineer",
            company: "Saudi Telecom Company (STC)",
            country: "Saudi Arabia",
            salary: "SAR 16,000 – 25,000/month",
            jobCategory: "Technology",
            visaSponsorship: true,
            applyLink: "https://www.stc.com.sa/careers",
            description: "Implement and monitor network security for the Kingdom's largest telecom. CCNP Security or CISSP required. Iqama (residence permit) fully sponsored.",
            isActive: true,
        },
        {
            title: "Treasury Analyst",
            company: "SABIC (Saudi Basic Industries)",
            country: "Saudi Arabia",
            salary: "SAR 14,000 – 20,000/month",
            jobCategory: "Finance",
            visaSponsorship: true,
            applyLink: "https://www.sabic.com/careers",
            description: "Cash management and financial risk reporting for a Fortune 500 petrochemical company. CPA or ACCA required. Full expat benefits package.",
            isActive: true,
        },
    ];
    await db_1.db.insert(jobs).values(jobListings);
    console.log(`Visa jobs seeded: ${jobListings.length} listings`);
}
async function seedUsaVisaJobs() {
    const { jobs } = await Promise.resolve().then(() => __importStar(require("@shared/schema")));
    const existing = await db_1.db.select().from(jobs).where((0, drizzle_orm_1.eq)(jobs.country, "United States")).limit(1);
    if (existing.length > 0) {
        return;
    }
    const usaJobs = [
        {
            title: "Software Engineer (H-1B Sponsorship)",
            company: "Google LLC",
            country: "United States",
            salary: "$130,000 – $180,000/year",
            jobCategory: "Technology",
            visaSponsorship: true,
            applyLink: "https://careers.google.com",
            description: "Full-stack or backend engineering roles at Google. H-1B visa sponsorship provided. Strong CS fundamentals, LeetCode-style problem solving, and 2+ years experience required. Relocation support included.",
            isActive: true,
        },
        {
            title: "Registered Nurse — EB-3 Visa Sponsored",
            company: "Houston Methodist Hospital",
            country: "United States",
            salary: "$70,000 – $95,000/year",
            jobCategory: "Healthcare",
            visaSponsorship: true,
            applyLink: "https://www.houstonmethodist.org/careers",
            description: "BSN-qualified nurses for ICU, Med-Surg, and ED units. Employer sponsors full EB-3 green card petition. NCLEX-RN, IELTS 7.0+, and 2 years hospital experience required. Relocation and housing stipend included.",
            isActive: true,
        },
        {
            title: "Data Scientist (H-1B Visa Sponsorship)",
            company: "Amazon Web Services",
            country: "United States",
            salary: "$140,000 – $200,000/year",
            jobCategory: "Technology",
            visaSponsorship: true,
            applyLink: "https://amazon.jobs",
            description: "Machine learning and data science roles across AWS teams. H-1B sponsorship for qualified candidates. Python, SQL, and ML framework experience (TensorFlow, PyTorch) required. Master's or PhD preferred.",
            isActive: true,
        },
        {
            title: "Civil Engineer — Infrastructure (H-1B)",
            company: "AECOM",
            country: "United States",
            salary: "$80,000 – $115,000/year",
            jobCategory: "Engineering",
            visaSponsorship: true,
            applyLink: "https://aecom.com/careers",
            description: "Structural and civil engineering roles on major US infrastructure projects. H-1B visa sponsorship available for eligible candidates. PE license or EIT preferred. AutoCAD, Civil 3D proficiency required.",
            isActive: true,
        },
        {
            title: "Financial Analyst (H-1B Sponsorship)",
            company: "JPMorgan Chase & Co.",
            country: "United States",
            salary: "$90,000 – $130,000/year",
            jobCategory: "Finance",
            visaSponsorship: true,
            applyLink: "https://careers.jpmorgan.com",
            description: "Investment banking and corporate finance analyst roles. H-1B sponsorship provided for top candidates. CFA or MBA preferred. Excel, Bloomberg, and financial modelling skills required.",
            isActive: true,
        },
        {
            title: "Physical Therapist — H-1B & Green Card",
            company: "Kaiser Permanente",
            country: "United States",
            salary: "$85,000 – $110,000/year",
            jobCategory: "Healthcare",
            visaSponsorship: true,
            applyLink: "https://jobs.kp.org",
            description: "Licensed Physical Therapists for outpatient and hospital settings. H-1B visa and EB-3 green card sponsorship. NPTE licensing required. 1+ year clinical experience. IELTS 7.0 minimum.",
            isActive: true,
        },
    ];
    await db_1.db.insert(jobs).values(usaJobs);
    console.log(`USA visa jobs seeded: ${usaJobs.length} listings`);
}
async function seedPlans() {
    const existing = await db_1.db.select().from(schema_1.plans);
    if (existing.length > 0) {
        return;
    }
    console.log("Seeding plans...");
    await db_1.db.insert(schema_1.plans).values([
        {
            planId: "free",
            planName: "Free",
            price: 0,
            features: ["limited_ats", "limited_jobs", "visa_info", "country_guides"],
            description: "Explore the platform at no cost",
            badge: null,
            currency: "KES",
            billingPeriod: "annual",
            isActive: true,
            displayOrder: 1,
            metadata: null,
        },
        {
            planId: "basic",
            planName: "Basic",
            price: 2500,
            features: ["ats_cv_checker", "job_access", "limited_ai", "country_guides", "visa_info", "application_tracker"],
            description: "For active job seekers ready to go",
            badge: "Most Popular",
            currency: "KES",
            billingPeriod: "annual",
            isActive: false,
            displayOrder: 2,
            metadata: null,
        },
        {
            planId: "pro",
            planName: "Pro",
            price: 4500,
            features: ["full_tools", "ai_job_assistant", "job_matching", "priority_listings", "unlimited_access", "whatsapp_consultation", "ats_cv_checker", "application_tracker"],
            description: "Full access for 360 days",
            badge: "Best Value",
            currency: "KES",
            billingPeriod: "yearly",
            isActive: true,
            displayOrder: 3,
            metadata: null,
        },
    ]);
    console.log("Plans seeded: free, basic (inactive), pro");
}
/**
 * Idempotent index creation — runs on every startup via `CREATE INDEX IF NOT EXISTS`.
 * Ensures production database has optimal indexes even after fresh deploys.
 * Safe to run multiple times; each statement is a no-op if the index already exists.
 */
async function ensureIndexes() {
    const indexes = [
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
        "CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL",
        "CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan)",
        "CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_service_orders_user_id ON service_orders(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders(status)",
        "CREATE INDEX IF NOT EXISTS idx_service_orders_user_status ON service_orders(user_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_service_orders_created_at ON service_orders(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)",
        "CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_address)",
    ];
    let created = 0;
    for (const sql of indexes) {
        try {
            await db_1.pool.query(sql);
            created++;
        }
        catch (_err) {
            // Non-fatal: index may not apply to this schema version
        }
    }
    console.log(`[DB] Indexes ensured: ${created}/${indexes.length} applied`);
}
// Sentinel license number used to track whether the current NEA data version
// has been applied. Bump the version suffix to force a re-sync on next deploy.
const NEA_SYNC_SENTINEL = "SYNC_V2_2026_04_09";
/**
 * Upserts all 1,294 NEA-licensed agencies from the official registry into the DB.
 * Idempotent — skips if this version was already applied (checked via sentinel record).
 * Preserves any existing extra fields (lat/lng, claimedByUserId, notes, etc.).
 */
async function syncNeaAgencies() {
    // Check sentinel
    const existing = await db_1.db
        .select({ id: schema_1.neaAgencies.id })
        .from(schema_1.neaAgencies)
        .where((0, drizzle_orm_1.eq)(schema_1.neaAgencies.licenseNumber, NEA_SYNC_SENTINEL))
        .limit(1);
    if (existing.length > 0) {
        return; // Already synced this version
    }
    const { NEA_AGENCIES_DATA } = await Promise.resolve().then(() => __importStar(require("./data/nea-agencies-data.js")));
    const rows = NEA_AGENCIES_DATA.map((r) => ({
        licenseNumber: r.licenseNumber,
        agencyName: r.agencyName,
        email: r.email ?? null,
        website: r.website ?? null,
        serviceType: r.serviceType,
        issueDate: new Date(r.issueDate),
        expiryDate: new Date(r.expiryDate),
        statusOverride: r.statusOverride ?? null,
        isPublished: true,
    }));
    const BATCH = 100;
    let upserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        await db_1.db
            .insert(schema_1.neaAgencies)
            .values(batch)
            .onConflictDoUpdate({
            target: schema_1.neaAgencies.licenseNumber,
            set: {
                agencyName: (0, drizzle_orm_1.sql) `excluded.agency_name`,
                email: (0, drizzle_orm_1.sql) `excluded.email`,
                website: (0, drizzle_orm_1.sql) `excluded.website`,
                serviceType: (0, drizzle_orm_1.sql) `excluded.service_type`,
                issueDate: (0, drizzle_orm_1.sql) `excluded.issue_date`,
                expiryDate: (0, drizzle_orm_1.sql) `excluded.expiry_date`,
                statusOverride: (0, drizzle_orm_1.sql) `excluded.status_override`,
                isPublished: (0, drizzle_orm_1.sql) `excluded.is_published`,
                lastUpdated: (0, drizzle_orm_1.sql) `now()`,
            },
        });
        upserted += batch.length;
    }
    // Insert sentinel to mark this version as applied
    await db_1.db
        .insert(schema_1.neaAgencies)
        .values({
        licenseNumber: NEA_SYNC_SENTINEL,
        agencyName: "__SYNC_SENTINEL__",
        issueDate: new Date(),
        expiryDate: new Date("2099-01-01"),
        isPublished: false,
    })
        .onConflictDoNothing();
    console.log(`[NEA] Agency sync complete: ${upserted} upserted`);
}
const NEA_DEDUP_SENTINEL = "DEDUP_V1_2026_04_09";
async function deduplicateNeaAgencies() {
    // Check sentinel
    const existing = await db_1.db
        .select({ id: schema_1.neaAgencies.id })
        .from(schema_1.neaAgencies)
        .where((0, drizzle_orm_1.eq)(schema_1.neaAgencies.licenseNumber, NEA_DEDUP_SENTINEL))
        .limit(1);
    if (existing.length > 0) {
        return;
    }
    // Find name duplicates and delete older entries (keep the most recently updated row)
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    DELETE FROM nea_agencies
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY LOWER(TRIM(agency_name))
                 ORDER BY last_updated DESC, expiry_date DESC
               ) AS rn
        FROM nea_agencies
        WHERE agency_name != '__SYNC_SENTINEL__'
          AND is_published = true
      ) ranked
      WHERE rn > 1
    )
  `);
    // Insert sentinel
    await db_1.db
        .insert(schema_1.neaAgencies)
        .values({
        licenseNumber: NEA_DEDUP_SENTINEL,
        agencyName: "__DEDUP_SENTINEL__",
        issueDate: new Date(),
        expiryDate: new Date("2099-01-01"),
        isPublished: false,
    })
        .onConflictDoNothing();
    console.log("[NEA] Deduplication complete");
}
// ── Canonical service list — single source of truth for prices ────────────────
// Called on EVERY server startup (bypasses the "already seeded" skip).
// Uses ON CONFLICT (slug) DO UPDATE so production DB always reflects these values.
const CANONICAL_SERVICES = [
    // --- CV & Documents ---
    { slug: "cv_check", name: "CV Health Check", price: 0, currency: "KES", isActive: true, order: 0, category: "CV & Documents", badge: null, isSubscription: false, subscriptionPeriod: null, description: "Free instant analysis of your CV — see what recruiters and ATS systems think before you apply", features: ["ATS compatibility score", "Missing keyword report", "Format & length check", "Instant AI feedback", "No payment required"] },
    { slug: "cv_fix_lite", name: "CV Fix Lite", price: 99, currency: "KES", isActive: true, order: 1, category: "CV & Documents", badge: null, isSubscription: false, subscriptionPeriod: null, description: "Quick CV polish — fix formatting, grammar, and structure so your CV looks professional fast", features: ["Grammar & spelling fix", "Professional formatting", "Structure improvement", "Delivered in 3 minutes", "Best for entry-level CVs"] },
    { slug: "ats_cv_optimization", name: "ATS CV Optimization", price: 499, currency: "KES", isActive: true, order: 4, category: "CV & Documents", badge: "Popular", isSubscription: false, subscriptionPeriod: null, description: "Get your CV optimized to pass Applicant Tracking Systems used by major employers", features: ["ATS keyword analysis & scoring", "Format optimized for recruiter systems", "Industry-specific keyword injection", "Before/after comparison report", "Delivered in Word & PDF"] },
    { slug: "cv_rewrite", name: "Country-Specific CV Rewrite", price: 699, currency: "KES", isActive: true, order: 5, category: "CV & Documents", badge: "Best Value", isSubscription: false, subscriptionPeriod: null, description: "Professional CV rewrite tailored to your target country's format and expectations", features: ["Target country format (UAE, UK, Canada, EU)", "Professional rewrite by career expert", "Highlight transferable skills", "ATS-safe formatting", "Word & PDF formats"] },
    { slug: "cover_letter", name: "Cover Letter Writing", price: 149, currency: "KES", isActive: true, order: 3, category: "CV & Documents", badge: null, isSubscription: false, subscriptionPeriod: null, description: "Custom cover letter that highlights your strengths for international employers", features: ["Custom cover letter per role/country", "Tailored tone for target employer", "Addresses visa/relocation questions", "Highlights your strongest selling points", "⚡ Instant AI delivery — under 3 minutes"] },
    { slug: "sop_writing", name: "SOP / Statement of Purpose", price: 999, currency: "KES", isActive: true, order: 8, category: "CV & Documents", badge: null, isSubscription: false, subscriptionPeriod: null, description: "University and scholarship SOP writing tailored to your course and institution", features: ["University & scholarship SOP writing", "Tailored to your course and institution", "Highlights academic motivation", "Proofread for grammar & flow", "Word & PDF delivery"] },
    { slug: "motivation_letter", name: "Motivation Letter Writing", price: 699, currency: "KES", isActive: true, order: 9, category: "CV & Documents", badge: null, isSubscription: false, subscriptionPeriod: null, description: "Formal motivation letter for EU jobs and scholarships, professionally structured", features: ["Formal motivation letter (EU/scholarship use)", "Professionally structured & compelling", "Country & role specific tone", "Proofread & formatted", "⚡ Instant AI delivery — under 3 minutes"] },
    { slug: "ats_cover_bundle", name: "ATS + Cover Letter Bundle", price: 799, currency: "KES", isActive: true, order: 10, category: "CV & Documents", badge: "Best Value", isSubscription: false, subscriptionPeriod: null, description: "ATS-optimized CV and a matching cover letter in one package — best value deal", features: ["ATS-optimized CV + matching cover letter", "Single-package pricing saves KES 1,500", "Both tailored to same role/country", "Word & PDF formats", "Delivered in 24 hours"] },
    // --- Interview & Profile ---
    { slug: "interview_coaching", name: "Interview Coaching", price: 1500, currency: "KES", isActive: true, order: 6, category: "Interview & Profile", badge: "Popular", isSubscription: false, subscriptionPeriod: null, description: "One-on-one interview preparation with live mock interviews and expert feedback", features: ["Live mock interview session (WhatsApp)", "30 tailored Q&A for your role", "Salary negotiation coaching", "Common trap questions & red flags", "Follow-up email template included"] },
    { slug: "interview_prep_pack", name: "Interview Preparation Pack", price: 2000, currency: "KES", isActive: true, order: 14, category: "Interview & Profile", badge: "New", isSubscription: false, subscriptionPeriod: null, description: "Get job-ready with a tailored question bank and coaching guide for your target role and country", features: ["30 tailored interview Q&A for your role", "Behavioral (STAR method) coaching guide", "Common trap questions & how to answer", "Salary negotiation scripts", "Delivered as PDF + WhatsApp summary"] },
    { slug: "linkedin_optimization", name: "LinkedIn Profile Optimization", price: 3000, currency: "KES", isActive: true, order: 6, category: "Interview & Profile", badge: "New", isSubscription: false, subscriptionPeriod: null, description: "Optimize your LinkedIn profile to attract international recruiters and hiring managers", features: ["Full profile rewrite (headline, summary, skills)", "Keyword optimization for recruiter search", "International recruiter-focused positioning", "Profile strength score guide", "Connection strategy tips"] },
    // --- Legal & Verification ---
    { slug: "visa_guidance", name: "Visa Guidance Session", price: 3000, currency: "KES", isActive: true, order: 5, category: "Legal & Verification", badge: null, isSubscription: false, subscriptionPeriod: null, description: "Detailed guidance on visa requirements and the application process for your target country", features: ["Step-by-step visa application walkthrough", "Documents checklist for target country", "Common rejection reasons & how to avoid", "Consulate & embassy contacts", "⚡ Instant AI delivery — under 3 minutes"] },
    { slug: "contract_review", name: "Employment Contract Review", price: 1200, currency: "KES", isActive: true, order: 15, category: "Legal & Verification", badge: "New", isSubscription: false, subscriptionPeriod: null, description: "Have your overseas job offer contract reviewed for hidden clauses, red flags, and legal risks", features: ["Full contract review (up to 15 pages)", "Red flag & hidden clause identification", "Salary, overtime & leave clause analysis", "Written report with risk ratings", "WhatsApp follow-up Q&A session"] },
    { slug: "employer_verification", name: "Employer Verification Report", price: 999, currency: "KES", isActive: true, order: 16, category: "Legal & Verification", badge: "New", isSubscription: false, subscriptionPeriod: null, description: "We verify the legitimacy of your prospective overseas employer before you sign", features: ["NEA license & government registry check", "Online reputation & reviews scan", "Complaints & fraud database check", "Business registration verification", "⚡ Instant AI delivery — under 3 minutes"] },
    // --- Job Search Tools ---
    { slug: "job_pack_5", name: "Job Pack — 5 Applications", price: 1299, currency: "KES", isActive: true, order: 11, category: "Job Search Tools", badge: "Most Popular", isSubscription: false, subscriptionPeriod: null, description: "AI-tailored CV + cover letter for 5 jobs in one pack — apply to more, faster", features: ["Tailored CV for each of 5 jobs", "Matching cover letter per application", "ATS-optimized per job description", "Application tracking dashboard", "⚡ AI delivery — under 10 minutes"] },
    { slug: "assisted_apply_lite", name: "Assisted Apply Lite", price: 1499, currency: "KES", isActive: true, order: 12, category: "Job Search Tools", badge: "New", isSubscription: false, subscriptionPeriod: null, description: "We build and submit 5 job applications for you — just share your CV and target role", features: ["5 job applications built for you", "Custom CV & cover letter per job", "ATS-optimized applications", "Application status tracking", "WhatsApp progress update"] },
    { slug: "guided_apply", name: "Guided Apply Mode", price: 2500, currency: "KES", isActive: true, order: 13, category: "Job Search Tools", badge: "Premium", isSubscription: false, subscriptionPeriod: null, description: "We apply to 5 verified overseas jobs on your behalf with custom CV and cover letters", features: ["We apply to 5 verified jobs on your behalf", "Custom CV & cover letter per application", "Application tracking dashboard", "Weekly progress WhatsApp report", "Refund policy if no interviews in 30 days"] },
    { slug: "application_tracking", name: "Application Tracking Pro", price: 2000, currency: "KES", isActive: true, order: 12, category: "Job Search Tools", badge: null, isSubscription: false, subscriptionPeriod: null, description: "Personal application tracker set up and configured for your job search journey", features: ["Personalized application tracker setup", "Track status: Applied, Interview, Offer", "Deadline & follow-up reminders", "Integrated with job portals", "Export progress report"] },
    { slug: "deadline_alerts", name: "Reminder & Deadline Alerts", price: 1500, currency: "KES", isActive: true, order: 13, category: "Job Search Tools", badge: null, isSubscription: false, subscriptionPeriod: null, description: "Never miss an application window — get alerts for job postings, visa dates, and deadlines", features: ["Deadline alerts for job postings & visas", "WhatsApp & email reminder options", "Customizable reminder frequency", "Never miss an application window", "Works with any job portal"] },
    { slug: "pre_departure_pack", name: "Pre-Departure Orientation Pack", price: 1500, currency: "KES", isActive: true, order: 19, category: "Job Search Tools", badge: "New", isSubscription: false, subscriptionPeriod: null, description: "Everything you need to know before flying out — housing, banking, culture, legal rights and safety", features: ["Country-specific housing & cost guide", "Banking & money transfer setup tips", "Worker rights & labor law overview", "Cultural dos and don'ts", "Emergency contacts & embassy details"] },
    // --- Support Plans ---
    { slug: "whatsapp_support", name: "Premium WhatsApp Support", price: 1000, currency: "KES", isActive: true, order: 7, category: "Support Plans", badge: null, isSubscription: true, subscriptionPeriod: "monthly", description: "30 days of priority WhatsApp support for all your job search and application questions", features: ["30 days priority WhatsApp access", "Answer all application questions", "CV & cover letter quick reviews", "Scam/agency verification on demand", "Response within 2 hours"] },
    { slug: "job_alerts", name: "Premium Job Alerts", price: 500, currency: "KES", isActive: true, order: 17, category: "Support Plans", badge: "Popular", isSubscription: true, subscriptionPeriod: "monthly", description: "Weekly curated, verified job listings sent directly to your WhatsApp matched to your skills", features: ["Weekly verified job listings via WhatsApp", "Matched to your skills & target country", "Only NEA-licensed agency postings", "Scam-filtered & legitimacy-scored jobs", "Cancel anytime"] },
    { slug: "emergency_support", name: "Abroad Worker Emergency Support", price: 300, currency: "KES", isActive: true, order: 18, category: "Support Plans", badge: "New", isSubscription: true, subscriptionPeriod: "monthly", description: "Already working overseas? Get 24/7 WhatsApp support for workplace disputes and emergencies", features: ["24/7 WhatsApp emergency response line", "Workplace dispute & rights guidance", "Embassy & consulate contact referrals", "Repatriation assistance coordination", "Priority response within 1 hour"] },
    // --- Work Permit Assistance (v1 — UK, UAE, Saudi, Canada, Qatar × Light/Mid/Pro) ---
    // Three tiers per country:
    //   Light (KES 249) — AI-generated country-specific guide + checklist, instant.
    //   Mid   (KES 599) — Light + pre-filled application forms using their CV/intake.
    //   Pro   (KES 2999) — Manual hand-holding: document review, employer liaison,
    //                      status check-ins until permit is issued. Lands in admin queue.
    // United Kingdom — Skilled Worker Visa (with Certificate of Sponsorship)
    { slug: "work_permit_uk_light", name: "UK Work Permit Guide (Skilled Worker)", price: 249, currency: "KES", isActive: true, order: 30, category: "Work Permits", badge: "New", isSubscription: false, subscriptionPeriod: null, description: "Country-specific Skilled Worker Visa guide for Kenyans — which permit class, full document checklist, fees, timeline, English test & TB test details", features: ["Tailored to Skilled Worker / Health & Care Visa", "Full document checklist (CoS, IELTS/UKVI, TB test, savings)", "UK fees breakdown in KES", "Realistic timeline & priority service options", "Common rejection reasons + how to avoid them", "Instant AI delivery in PDF & WhatsApp"] },
    { slug: "work_permit_uk_mid", name: "UK Work Permit Assist + Form Pre-fill", price: 599, currency: "KES", isActive: true, order: 31, category: "Work Permits", badge: "Best Value", isSubscription: false, subscriptionPeriod: null, description: "Everything in the Light guide PLUS we pre-fill your VAF (Visa Application Form) using your CV and intake data, validate your Certificate of Sponsorship, and prep your biometric appointment", features: ["All Light guide content included", "VAF form pre-filled from your CV + intake", "CoS validation checklist", "Biometric appointment booking guide", "Pre-flight document binder (PDF)", "Delivered within 24h"] },
    { slug: "work_permit_uk_pro", name: "UK Work Permit — Full Hand-Holding", price: 2999, currency: "KES", isActive: true, order: 32, category: "Work Permits", badge: "Premium", isSubscription: false, subscriptionPeriod: null, description: "Full white-glove service: our team reviews every document, drafts your employer CoS-liaison emails, checks the sponsor licence is live, and follows up until the visa decision lands", features: ["Document-by-document review by our team", "Employer CoS liaison email drafts", "Sponsor licence live-status verification", "Status follow-up until decision", "Refund policy if we mis-advise on permit class", "Lands in admin queue — human-delivered"] },
    // UAE — Employer-Sponsored Work Permit + Residency Visa (MOHRE / Tasheel)
    { slug: "work_permit_uae_light", name: "UAE Work Permit Guide (MOHRE)", price: 249, currency: "KES", isActive: true, order: 33, category: "Work Permits", badge: "New", isSubscription: false, subscriptionPeriod: null, description: "Step-by-step guide to the UAE Employment Visa + Emirates ID + MOHRE work permit process — including attestation, medical fitness, and free-zone vs mainland differences", features: ["MOHRE work permit + Employment Visa explained", "Document attestation flow (KE → UAE)", "Emirates ID & medical fitness booking", "Free-zone vs mainland visa differences", "Realistic fees & timeline in KES", "Instant AI delivery"] },
    { slug: "work_permit_uae_mid", name: "UAE Work Permit Assist + Form Pre-fill", price: 599, currency: "KES", isActive: true, order: 34, category: "Work Permits", badge: "Best Value", isSubscription: false, subscriptionPeriod: null, description: "Light guide + we pre-fill your Tasheel forms using your CV and intake data, give you the attestation checklist for Kenyan documents, and prep your medical fitness booking", features: ["All Light guide content included", "Tasheel form pre-filled", "KE document attestation step-by-step (MFA → UAE embassy)", "Medical fitness pre-booking instructions", "Free-zone routing recommendations", "Delivered within 24h"] },
    { slug: "work_permit_uae_pro", name: "UAE Work Permit — Full Hand-Holding", price: 2999, currency: "KES", isActive: true, order: 35, category: "Work Permits", badge: "Premium", isSubscription: false, subscriptionPeriod: null, description: "Full service: our team coordinates with your UAE employer/PRO, handles attestation logistics, and follows your file through Tasheel to Emirates ID issuance", features: ["Employer / PRO direct communication", "Attestation logistics coordination (Nairobi side)", "Tasheel + Emirates ID file tracking", "Status check-ins via WhatsApp until ID issued", "Refund policy if we mis-advise on permit class", "Lands in admin queue — human-delivered"] },
    // Saudi Arabia — Iqama (Block Visa → Work Visa → Iqama)
    { slug: "work_permit_saudi_light", name: "Saudi Work Permit Guide (Iqama)", price: 249, currency: "KES", isActive: true, order: 36, category: "Work Permits", badge: "New", isSubscription: false, subscriptionPeriod: null, description: "Complete guide to Saudi Block Visa → Work Visa → Iqama timeline — including MoFA Enjazit, Wakalah, medical fitness, and attestation for Kenyan documents", features: ["Block Visa → Work Visa → Iqama timeline", "MoFA Enjazit & Wakalah explained", "Medical fitness centre list (Nairobi-approved)", "Document attestation flow for KE → KSA", "Common Iqama delays + how to avoid", "Instant AI delivery"] },
    { slug: "work_permit_saudi_mid", name: "Saudi Work Permit Assist + Form Pre-fill", price: 599, currency: "KES", isActive: true, order: 37, category: "Work Permits", badge: "Best Value", isSubscription: false, subscriptionPeriod: null, description: "Light guide + we pre-fill your Enjazit visa application and give you the full agency-vetting checklist so you only deal with NEA-licensed agencies for Saudi placements", features: ["All Light guide content included", "Enjazit visa application pre-filled", "NEA-licensed Saudi-route agency vetting checklist", "Wakalah document binder", "Medical-centre pre-booking", "Delivered within 24h"] },
    { slug: "work_permit_saudi_pro", name: "Saudi Work Permit — Full Hand-Holding", price: 2999, currency: "KES", isActive: true, order: 38, category: "Work Permits", badge: "Premium", isSubscription: false, subscriptionPeriod: null, description: "Full service: our team coordinates with your Saudi employer / Saudi-route agency, handles MoFA + attestation logistics, and follows the file through to Iqama issuance", features: ["Saudi employer / agency direct liaison", "MoFA + Saudi embassy attestation handling", "File tracking through Iqama issuance", "Repatriation rights briefing", "Refund policy if we mis-advise on permit class", "Lands in admin queue — human-delivered"] },
    // Canada — LMIA-supported Work Permit / Express Entry route
    { slug: "work_permit_canada_light", name: "Canada Work Permit Guide (LMIA)", price: 249, currency: "KES", isActive: true, order: 39, category: "Work Permits", badge: "New", isSubscription: false, subscriptionPeriod: null, description: "Complete guide to Canadian work permit routes for Kenyans — LMIA-based, IEC, Express Entry CRS, and NOC-code matching for in-demand occupations", features: ["LMIA, IEC, Express Entry routes compared", "NOC code matching for your role", "CRS score self-calculation worksheet", "IRCC document checklist", "Province-specific PNP shortlists", "Instant AI delivery"] },
    { slug: "work_permit_canada_mid", name: "Canada Work Permit Assist + Form Pre-fill", price: 599, currency: "KES", isActive: true, order: 40, category: "Work Permits", badge: "Best Value", isSubscription: false, subscriptionPeriod: null, description: "Light guide + we pre-fill your IMM forms using your CV/intake, map your work history to NOC codes, and lay out your ECA & IELTS preparation timeline", features: ["All Light guide content included", "IMM forms pre-filled (5710 / 1295 as applicable)", "NOC code mapping for your work history", "ECA + IELTS prep timeline", "CRS optimisation tips", "Delivered within 24h"] },
    { slug: "work_permit_canada_pro", name: "Canada Work Permit — Full Hand-Holding", price: 2999, currency: "KES", isActive: true, order: 41, category: "Work Permits", badge: "Premium", isSubscription: false, subscriptionPeriod: null, description: "Full service: end-to-end Express Entry profile review, employer LMIA support drafting, biometric appointment booking, and IRCC file follow-up until decision", features: ["End-to-end Express Entry profile build", "Employer LMIA support drafting", "Biometric appointment booking guidance", "IRCC file follow-up until decision", "Refund policy if we mis-advise on route", "Lands in admin queue — human-delivered"] },
    // Qatar — Work Visa via MOI (Ministry of Interior)
    { slug: "work_permit_qatar_light", name: "Qatar Work Permit Guide (MOI)", price: 249, currency: "KES", isActive: true, order: 42, category: "Work Permits", badge: "New", isSubscription: false, subscriptionPeriod: null, description: "Complete guide to the Qatar Work Visa via MOI — including pre-departure attestation, medical fitness at Qatar Visa Center Nairobi, and post-arrival Residence Permit (QID)", features: ["Qatar Work Visa via MOI explained", "Qatar Visa Center Nairobi process", "Medical fitness + biometrics step-by-step", "Residence Permit (QID) post-arrival", "Sponsorship rules & job-change implications", "Instant AI delivery"] },
    { slug: "work_permit_qatar_mid", name: "Qatar Work Permit Assist + Form Pre-fill", price: 599, currency: "KES", isActive: true, order: 43, category: "Work Permits", badge: "Best Value", isSubscription: false, subscriptionPeriod: null, description: "Light guide + we pre-fill your Hukoomi / MOI forms using your CV/intake, give you the attestation flow for Kenyan documents, and prep your Qatar Visa Center appointment", features: ["All Light guide content included", "Hukoomi / MOI forms pre-filled", "KE document attestation step-by-step", "Qatar Visa Center appointment prep", "Sponsorship rules briefing", "Delivered within 24h"] },
    { slug: "work_permit_qatar_pro", name: "Qatar Work Permit — Full Hand-Holding", price: 2999, currency: "KES", isActive: true, order: 44, category: "Work Permits", badge: "Premium", isSubscription: false, subscriptionPeriod: null, description: "Full service: our team coordinates with your Qatari employer, handles attestation logistics, and follows the file through MOI to Residence Permit issuance", features: ["Qatari employer direct liaison", "Attestation logistics (Nairobi side)", "MOI file tracking through QID", "Status check-ins via WhatsApp until QID issued", "Refund policy if we mis-advise on permit class", "Lands in admin queue — human-delivered"] },
];
/**
 * syncServicePrices — runs on every server startup.
 * Upserts the canonical service list into the DB by slug.
 * This ensures production pricing always matches the codebase definition
 * even when the seed was previously skipped ("already seeded").
 */
async function syncServicePrices() {
    try {
        let updated = 0;
        let inserted = 0;
        for (const svc of CANONICAL_SERVICES) {
            const { slug, name, price, currency, isActive, order, category, badge, isSubscription, subscriptionPeriod, description, features } = svc;
            const code = slug; // code mirrors slug — used in WHERE code = $1 payment lookups
            const existing = await db_1.db.select({ id: schema_1.services.id }).from(schema_1.services).where((0, drizzle_orm_1.eq)(schema_1.services.slug, slug));
            if (existing.length > 0) {
                await db_1.db.update(schema_1.services)
                    .set({ code, name, price, currency, isActive, order, category, badge, isSubscription, subscriptionPeriod, description, features: features })
                    .where((0, drizzle_orm_1.eq)(schema_1.services.slug, slug));
                updated++;
            }
            else {
                await db_1.db.insert(schema_1.services).values({ slug, code, name, price, currency, isActive, order, category, badge, isSubscription, subscriptionPeriod, description, features: features });
                inserted++;
            }
        }
        console.log(`[ServiceSync] Prices synced — ${updated} updated, ${inserted} inserted`);
    }
    catch (err) {
        console.error("[ServiceSync] Failed to sync service prices:", err.message);
    }
}
// ─── Country portals self-healer ─────────────────────────────────────────────
// CRITICAL: Migration 0004 used UPPERCASE country codes ('UK', 'CA', 'AU' etc.)
// but the original seed inserts countries with LOWERCASE codes ('uk', 'canada',
// 'uae'…). Result: the migration's INSERTs matched zero rows, leaving every
// country's "Apply on Platforms" tab empty. On top of that, 'australia' was
// never seeded at all, so /api/countries/australia 404s and the page shows
// "Access Required".
//
// This seed runs on every boot. It is fully idempotent — uses ON CONFLICT
// for countries and INSERT…WHERE NOT EXISTS for job_links so click counts
// and lastVerified timestamps are preserved across reboots.
async function seedCountryPortals() {
    try {
        // 1. Ensure all six destination countries exist (lowercase codes).
        const wantedCountries = [
            { code: "usa", name: "USA", flag: "🇺🇸" },
            { code: "canada", name: "Canada", flag: "🇨🇦" },
            { code: "uae", name: "UAE / Arab Countries", flag: "🇦🇪" },
            { code: "uk", name: "United Kingdom", flag: "🇬🇧" },
            { code: "europe", name: "Europe", flag: "🇪🇺" },
            { code: "australia", name: "Australia", flag: "🇦🇺" },
        ];
        for (const c of wantedCountries) {
            await db_1.pool.query(`INSERT INTO countries (name, code, flag_emoji, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (code) DO NOTHING`, [c.name, c.code, c.flag]);
        }
        // 2. Curated portal list lives in server/lib/country-portals.ts (the
        //    single source of truth). Importing it ensures the seed AND the
        //    synthetic fallback in /api/countries/:code stay in lockstep.
        const { COUNTRY_PORTALS: portalsByCode } = await Promise.resolve().then(() => __importStar(require("./lib/country-portals")));
        // 3. Upsert each portal — INSERT only when (country_id, url) is new, so
        //    we never wipe click_count or last_verified on existing portals.
        //    Per-portal logging so failures are visible in Render logs.
        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        for (const [code, portals] of Object.entries(portalsByCode)) {
            const cRes = await db_1.pool.query(`SELECT id FROM countries WHERE code = $1 LIMIT 1`, [code]);
            const countryId = cRes.rows[0]?.id;
            if (!countryId) {
                console.warn(`[Portals] No country row for code='${code}' — skipping ${portals.length} portals`);
                continue;
            }
            for (const p of portals) {
                try {
                    // First: INSERT if URL not present yet (preserves click_count for existing rows).
                    // 2026-06: explicit ::type casts on the SELECT side. Without them
                    // Postgres throws "inconsistent types deduced for parameter $1"
                    // because $1 appears bare in SELECT $1 AND typed in WHERE country_id = $1.
                    const ins = await db_1.pool.query(`INSERT INTO job_links (country_id, name, url, description, is_active, "order")
             SELECT $1::varchar, $2::text, $3::text, $4::text, true, $5::int
             WHERE NOT EXISTS (
               SELECT 1 FROM job_links WHERE country_id = $1 AND url = $3
             )`, [countryId, p.name, p.url, p.description, p.order]);
                    if (ins.rowCount && ins.rowCount > 0) {
                        inserted++;
                    }
                    else {
                        // URL already exists — refresh name/description/order in case they drifted.
                        const upd = await db_1.pool.query(`UPDATE job_links
                  SET name = $2, description = $3, "order" = $4, is_active = true
                WHERE country_id = $1 AND url = $5`, [countryId, p.name, p.description, p.order, p.url]);
                        if (upd.rowCount && upd.rowCount > 0)
                            updated++;
                        else
                            skipped++;
                    }
                }
                catch (rowErr) {
                    console.error(`[Portals] insert/update failed for ${code}/${p.name}:`, rowErr?.message ?? rowErr);
                }
            }
        }
        console.log(`[Portals] Self-heal complete — inserted ${inserted}, refreshed ${updated}, unchanged ${skipped}`);
    }
    catch (err) {
        console.error("[Portals] Self-heal failed:", err?.message ?? err);
    }
}
// ─── Plan price sync — idempotent, runs on every boot ────────────────────────
// Phase-1 conversion optimisation: monthly plan dropped from KES 1,000 → 600
// per user feedback. Lower monthly anchor drives more signups while preserving
// the strong yearly incentive (KES 4,500 vs KES 7,200 if paying monthly).
//
// Existing plan rows are UPDATEd in place — no inserts (those are handled by
// seedPlans on cold start). Safe to re-run; only changes rows whose price
// actually drifted.
async function syncPlanPrices() {
    try {
        // FULL plan definitions — used for both UPDATE (price drift) and INSERT
        // (when a deployment has been running since before a tier existed).
        //
        // 2026-06: founder decision — monthly is the default door now. Kenyans
        // think weekly, not yearly. Pro yearly stays but is framed as a savings
        // play ("Save KES 2,700 — pay once, done") rather than the primary tier.
        const targets = [
            {
                planId: "trial",
                price: 99,
                name: "1 Day Trial",
                description: "24-hour full access — perfect for testing",
                badge: "Try It",
                features: ["full_tools", "ai_job_assistant", "job_matching", "ats_cv_checker", "application_tracker"],
                billingPeriod: "one-time",
                displayOrder: 2,
            },
            {
                planId: "monthly",
                price: 1000,
                name: "Monthly Access",
                description: "30 days full access — renew when you want",
                badge: "Most Flexible",
                features: ["full_tools", "ai_job_assistant", "job_matching", "priority_listings", "unlimited_access", "whatsapp_consultation", "ats_cv_checker", "application_tracker"],
                billingPeriod: "monthly",
                displayOrder: 3,
            },
            {
                planId: "pro",
                price: 4500,
                name: "Yearly Access",
                description: "365 days full access — save KES 7,500 vs paying monthly",
                badge: "Save KES 7,500",
                features: ["full_tools", "ai_job_assistant", "job_matching", "priority_listings", "unlimited_access", "whatsapp_consultation", "ats_cv_checker", "application_tracker"],
                billingPeriod: "yearly",
                displayOrder: 4,
            },
        ];
        let inserted = 0, updated = 0;
        for (const t of targets) {
            // Try UPDATE first (preserves all fields not touched here).
            const upd = await db_1.pool.query(`UPDATE plans
            SET price = $1,
                plan_name = $2,
                description = $3,
                badge = $4,
                billing_period = $5,
                display_order = $6,
                is_active = true,
                updated_at = NOW()
          WHERE plan_id = $7`, [t.price, t.name, t.description, t.badge, t.billingPeriod, t.displayOrder, t.planId]);
            if (upd.rowCount && upd.rowCount > 0) {
                updated += upd.rowCount;
                continue;
            }
            // No existing row → INSERT.
            try {
                await db_1.pool.query(`INSERT INTO plans
             (plan_id, plan_name, price, currency, features, description, badge,
              billing_period, is_active, display_order)
           VALUES ($1, $2, $3, 'KES', $4, $5, $6, $7, true, $8)
           ON CONFLICT (plan_id) DO NOTHING`, [t.planId, t.name, t.price, JSON.stringify(t.features), t.description, t.badge, t.billingPeriod, t.displayOrder]);
                inserted++;
            }
            catch (err) {
                console.warn(`[Plans] insert ${t.planId} failed:`, err?.message);
            }
        }
        console.log(`[Plans] Price sync complete — ${updated} updated, ${inserted} inserted`);
    }
    catch (err) {
        console.error("[Plans] Price sync failed:", err?.message ?? err);
    }
}
// ─── Service-orders status CHECK constraint widener ─────────────────────────
// Migration 0005 declared:
//   CHECK (status IN ('pending_payment','paid','processing','completed','failed','cancelled'))
// but storage.expireStaleServiceOrders writes status='expired' every cleanup
// cycle, which crashes with: 'new row for relation "service_orders" violates
// check constraint "service_orders_status_check"'. The background loop has
// been silently dying in prod since launch.
//
// This boot-time helper drops the old constraint (if it exists with the
// outdated value set) and re-creates it with 'expired' added. Idempotent —
// re-running with the correct constraint in place is a no-op.
async function ensureServiceOrderStatusCheck() {
    try {
        // Check if the constraint already includes 'expired' — if so, do nothing.
        const probe = await db_1.pool.query(`
      SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conname = 'service_orders_status_check'
       LIMIT 1
    `);
        const def = probe.rows[0]?.pg_get_constraintdef ?? "";
        if (def.includes("'expired'")) {
            return; // already widened
        }
        console.log("[ServiceOrders] Widening status CHECK to include 'expired'…");
        await db_1.pool.query(`
      ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_status_check;
    `);
        await db_1.pool.query(`
      ALTER TABLE service_orders
        ADD CONSTRAINT service_orders_status_check
        CHECK (status IN (
          'pending_payment',
          'paid',
          'processing',
          'completed',
          'failed',
          'cancelled',
          'expired'
        ));
    `);
        console.log("[ServiceOrders] status CHECK widened — expireStaleServiceOrders will now succeed");
    }
    catch (err) {
        console.error("[ServiceOrders] ensureServiceOrderStatusCheck failed:", err?.message ?? err);
    }
}
