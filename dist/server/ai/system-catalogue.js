"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// System Catalogue — the platform mental model Nanjila carries.
//
// Without this, she only knows "I sell CV services". With it, she knows every
// free tool, every paid service, every country dashboard, every visa pathway,
// every credibility / trust feature, every admin surface — and can route a
// confused visitor to the exact page that solves their problem.
//
// Kept structured (not free-form) so the prompt formatter can decide which
// sections to emit per request and how compact to make them. Token budget
// matters because she pre-loads live prices + activity + WA_BASE_PROMPT
// already.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_CATALOGUE = void 0;
exports.formatCatalogueBlock = formatCatalogueBlock;
exports.SYSTEM_CATALOGUE = [
    {
        title: "FREE TOOLS (anyone can use — no signup required)",
        entries: [
            { label: "ATS CV Health Check", path: "/tools/ats-cv-checker", purpose: "User wants to know if their CV is good enough for overseas employers — uploads PDF/DOCX, gets a 0-100 score" },
            { label: "Job Scam Checker", path: "/tools/job-scam-checker", purpose: "User got a job offer or saw a posting and isn't sure if it's a scam" },
            { label: "Visa Sponsorship Jobs feed", path: "/tools/visa-sponsorship-jobs", purpose: "User just wants to browse real overseas jobs with visa sponsorship — entry-level + skilled" },
            { label: "Free CV Templates", path: "/tools/cv-templates", purpose: "User doesn't have a CV yet and needs a starting template" },
            { label: "NEA Agency Verifier", path: "/nea-agencies", purpose: "User wants to check if a Kenyan recruitment agency is licensed — critical anti-scam tool" },
            { label: "Scam Wall (community reports)", path: "/scam-wall", purpose: "User wants to see scam reports from other Kenyans to learn the red flags" },
        ],
    },
    {
        title: "COUNTRY DASHBOARDS (paid users — gated)",
        entries: [
            { label: "United Kingdom", path: "/country/uk", purpose: "NHS, Skilled Worker visa, Care Worker pathway. Top destination for Kenyan nurses", audience: "paid" },
            { label: "Canada", path: "/country/canada", purpose: "Express Entry, PNP, LMIA. Strong nursing + tech + trades pathway", audience: "paid" },
            { label: "UAE / Arab Countries", path: "/country/uae", purpose: "Tax-free salaries, hospitality, drivers, hotel jobs. Also covers Saudi, Qatar, Bahrain via this same dashboard", audience: "paid" },
            { label: "Australia", path: "/country/australia", purpose: "Subclass 482 / 186 / 189 skilled migration. 14 verified portals including NHS-style state health systems", audience: "paid" },
            { label: "USA", path: "/country/usa", purpose: "H-1B sponsorship, EB-3 unskilled-worker route, Green Card DV Lottery", audience: "paid" },
            { label: "Europe", path: "/country/europe", purpose: "EU Blue Card, Germany / Ireland / Netherlands / France / Nordic countries", audience: "paid" },
            { label: "Turkey", path: "/country/turkey", purpose: "Turkish work visa + permit. Hospitality, factory, textile, agriculture, care, IT. Kariyer.net + İŞKUR portals", audience: "paid" },
        ],
    },
    {
        title: "STEP-BY-STEP GUIDES (free, public, SEO content)",
        entries: [
            { label: "UK NHS for Kenyan Nurses", path: "/guides/uk-nhs-kenya", purpose: "OSCE, IELTS, NMC registration, Health & Care Worker visa, real costs in KES" },
            { label: "Canada Express Entry from Kenya", path: "/guides/canada-express-entry-kenya", purpose: "CRS scoring, ECA, IELTS targets, PR pathway" },
            { label: "UAE Hospitality for Kenyans", path: "/guides/uae-hospitality-kenya", purpose: "Hotel, F&B, cabin crew, ground staff — real salary bands + visa terms" },
            { label: "Saudi Nursing for Kenyans", path: "/guides/saudi-nursing-kenya", purpose: "DataFlow, Prometric exam, MOH license, Iqama, real salaries" },
            { label: "Germany EU Blue Card for Kenyans", path: "/guides/germany-blue-card-kenya", purpose: "Salary threshold, Anabin degree recognition, 21-month PR path" },
            { label: "All guides hub", path: "/guides", purpose: "Top-level page listing every guide — for the browsing user" },
        ],
    },
    {
        title: "REVENUE FEATURES (subscriptions + one-off services)",
        entries: [
            { label: "Pricing & subscription plans", path: "/pricing", purpose: "Show plans (Trial 99 / Monthly 600 / Yearly 4500). Live prices in LIVE PRICE OVERRIDE" },
            { label: "Services catalogue", path: "/services", purpose: "Show all one-off paid services (CV Fix Lite, ATS CV Optimization, Cover Letter, Interview Coaching, etc.)" },
            { label: "Service order flow", path: "/services/order/<slug>", purpose: "Direct deep-link to start a specific paid service. Slugs: cv_fix_lite, ats_cv_optimization, cv_rewrite, cover_letter, interview_coaching, etc." },
            { label: "Payment page", path: "/payment", purpose: "M-Pesa STK push / PayPal — when user has already chosen a plan or service" },
            { label: "Referrals — earn 10% per signup", path: "/referrals", purpose: "Affiliate program. Anyone can refer; instant M-Pesa payout per paid signup. Referred users get 20% off Pro" },
        ],
    },
    {
        title: "ACCOUNT / DASHBOARD (logged-in users)",
        entries: [
            { label: "Main dashboard", path: "/dashboard", purpose: "Logged-in landing — Visa Application + Green Card widgets + 9-country grid + visa-sponsored jobs feed", audience: "logged-in" },
            { label: "My Overview", path: "/my-overview", purpose: "Total paid, services unlocked, requests submitted, payment history", audience: "logged-in" },
            { label: "My Account", path: "/my-account", purpose: "Profile, phone, plan status, password", audience: "logged-in" },
            { label: "My Documents", path: "/my-documents", purpose: "All AI-generated CVs / cover letters / SOPs the user has bought", audience: "logged-in" },
            { label: "My Orders", path: "/my-orders", purpose: "Service order history with status (pending_payment, processing, completed, failed)", audience: "logged-in" },
            { label: "My Payments", path: "/my-payments", purpose: "M-Pesa + PayPal receipts and history", audience: "logged-in" },
            { label: "Application Tracker", path: "/application-tracker", purpose: "Track every job the user has applied to externally — status, callbacks, deadlines", audience: "paid" },
        ],
    },
    {
        title: "TRUST & VERIFICATION",
        entries: [
            { label: "Verify Us page", path: "/verify-us", purpose: "Show our own credentials: business reg, NEA license, KRA PIN, refund policy, contact details — for anti-scam-skeptic visitors" },
            { label: "About Us", path: "/about", purpose: "Who runs WorkAbroad Hub" },
            { label: "Refund Policy", path: "/refund-policy", purpose: "7-day money-back + 30-day callback guarantee" },
            { label: "Report a scam", path: "/report-scam", purpose: "User wants to warn other Kenyans about an agency / employer that scammed them" },
            { label: "Report fraud / abuse", path: "/report-abuse", purpose: "Internal abuse reporting" },
        ],
    },
    {
        title: "VISA / IMMIGRATION TOOLS",
        entries: [
            { label: "Visa Guides hub", path: "/visa-guides", purpose: "Country-by-country work visa walkthroughs" },
            { label: "Visa Assistant (AI)", path: "/visa-assistant", purpose: "AI Q&A about visa requirements for a specific country" },
            { label: "Green Card / DV Lottery", path: "/green-card", purpose: "USA Diversity Visa Lottery — free eligibility check, photo specs, timeline. Big draw for Kenyans" },
            { label: "Student Visas", path: "/student-visas", purpose: "F-1, Study Permit, UK Student visa, Subclass 500. SOP + uni applications" },
            { label: "Country forum", path: "/forum/:country", purpose: "Community Q&A per country — shares experience between Kenyans" },
        ],
    },
    {
        title: "ADMIN SURFACES (only when talking to an admin)",
        entries: [
            { label: "Admin home", path: "/admin", purpose: "Overall admin command center", audience: "admin" },
            { label: "Revenue dashboard", path: "/admin/revenue", purpose: "Per-service revenue breakdown — which services are top sellers", audience: "admin" },
            { label: "Live revenue stream", path: "/admin/revenue-live", purpose: "Real-time payments + alerts", audience: "admin" },
            { label: "Service orders", path: "/admin/service-orders", purpose: "All paid orders + their status + manual delivery if AI failed", audience: "admin" },
            { label: "Payments + reconciliation", path: "/admin/payments", purpose: "M-Pesa STK confirmations, refunds", audience: "admin" },
            { label: "Unmatched payments", path: "/admin/unmatched-payments", purpose: "Payments that couldn't be auto-linked to a user — needs manual triage", audience: "admin" },
            { label: "Users", path: "/admin/users", purpose: "Search/edit any user, promote to admin, fix plan", audience: "admin" },
            { label: "NEA agencies", path: "/admin/agencies", purpose: "Curate the agency verification list", audience: "admin" },
            { label: "Push notifications", path: "/admin/push-notifications", purpose: "Send WhatsApp/SMS broadcast to users", audience: "admin" },
            { label: "Analytics", path: "/admin/analytics", purpose: "Funnel, signups, conversions", audience: "admin" },
        ],
    },
];
/**
 * Render the catalogue as a compact text block for system-prompt injection.
 * Honours an `audience` filter so we don't waste tokens telling a free user
 * about admin pages.
 */
function formatCatalogueBlock(opts) {
    const lines = [];
    for (const group of exports.SYSTEM_CATALOGUE) {
        const visible = group.entries.filter((e) => {
            if (!e.audience || e.audience === "all")
                return true;
            if (e.audience === "logged-in")
                return opts.isLoggedIn;
            if (e.audience === "paid")
                return opts.isPaid;
            if (e.audience === "admin")
                return opts.isAdmin;
            return true;
        });
        if (visible.length === 0)
            continue;
        lines.push(`▸ ${group.title}`);
        for (const e of visible) {
            lines.push(`   • ${e.label} (${e.path}) — ${e.purpose}`);
        }
    }
    return lines.join("\n");
}
