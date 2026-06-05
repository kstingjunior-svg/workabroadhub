"use strict";
/**
 * Visa-Sponsored Jobs — server-authoritative catalog + Pro-gated apply flow.
 *
 * Security design:
 *   - The catalog of 50+ jobs is held server-side; the client never sees the
 *     real apply URLs. We expose them only via /api/visa-jobs/:id/apply, which
 *     302-redirects ONLY for Pro users / admins.
 *   - Non-Pro users see card metadata (title, country, salary, visa type) but
 *     cannot extract the real portal URL from the page — they get 403 on click.
 *   - Inspecting devtools won't help — there is no URL in the bundle.
 *
 * Endpoints:
 *   GET  /api/visa-jobs                   public — returns jobs without applyUrl
 *   GET  /api/visa-jobs/:id/apply         pro-only — 302 to the real portal
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VISA_JOBS = void 0;
exports.registerVisaJobsRoutes = registerVisaJobsRoutes;
const db_1 = require("./db");
// ── 50+ curated visa-sponsored jobs ──────────────────────────────────────────
// Mix tuned for Kenyan audience: heavy on Gulf casual work + skilled trades,
// plus Western healthcare/transport that sponsor visas. Updated as needed.
exports.VISA_JOBS = [
    // ── TRANSPORT ─────────────────────────────────────────────────────────────
    { id: "tr-01", title: "Long-Haul Truck Driver", employer: "Bison Transport", country: "Canada", countryFlag: "🇨🇦", city: "Calgary", salary: "CAD 65,000–80,000/yr", visaType: "TFW Program · LMIA", postedAgo: "2 days ago", category: "Transport", applyUrl: "https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=truck+driver+lmia" },
    { id: "tr-02", title: "Class 1 HGV Driver", employer: "Eddie Stobart", country: "United Kingdom", countryFlag: "🇬🇧", city: "Manchester", salary: "£35,000–42,000/yr", visaType: "Skilled Worker Visa", postedAgo: "1 day ago", category: "Transport", applyUrl: "https://www.indeed.co.uk/jobs?q=HGV+driver+visa+sponsorship" },
    { id: "tr-03", title: "Heavy Truck Driver", employer: "Saudi Aramco", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Dammam", salary: "SAR 3,500–4,800/month", visaType: "Iqama · Housing Included", postedAgo: "3 days ago", category: "Transport", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/heavy-driver-jobs/" },
    { id: "tr-04", title: "Bus Driver", employer: "RTA Dubai", country: "UAE", countryFlag: "🇦🇪", city: "Dubai", salary: "AED 3,000–4,000/month", visaType: "Employment Visa · Free Flight", postedAgo: "4 days ago", category: "Transport", applyUrl: "https://www.bayt.com/en/uae/jobs/bus-driver-jobs/" },
    { id: "tr-05", title: "Delivery Driver", employer: "Talabat", country: "Qatar", countryFlag: "🇶🇦", city: "Doha", salary: "QAR 2,200–3,000/month + tips", visaType: "Work Visa Sponsored", postedAgo: "Today", category: "Transport", applyUrl: "https://www.bayt.com/en/qatar/jobs/delivery-driver-jobs/" },
    { id: "tr-06", title: "Taxi Driver (Uber/Bolt)", employer: "Careem Saudi", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Riyadh", salary: "SAR 4,000–6,500/month earnings", visaType: "Work Visa Available", postedAgo: "Today", category: "Transport", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/taxi-driver-jobs/" },
    // ── CASUAL / DOMESTIC ─────────────────────────────────────────────────────
    { id: "cs-01", title: "Domestic Worker / Housekeeper", employer: "Private Household", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Riyadh", salary: "SAR 1,500–2,200/month", visaType: "Domestic Worker Visa", postedAgo: "Today", category: "Casual", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/domestic-jobs/" },
    { id: "cs-02", title: "Live-In Nanny", employer: "Au Pair Family Network", country: "Australia", countryFlag: "🇦🇺", city: "Sydney", salary: "AUD 600–800/week + room", visaType: "Working Holiday / Sponsor", postedAgo: "4 days ago", category: "Casual", applyUrl: "https://www.seek.com.au/nanny-jobs/visa-sponsorship" },
    { id: "cs-03", title: "Security Guard", employer: "Securitas", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Jeddah", salary: "SAR 2,000–2,800/month", visaType: "Work Visa · Housing", postedAgo: "1 day ago", category: "Casual", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/security-guard-jobs/" },
    { id: "cs-04", title: "Farm Worker (Greenhouse)", employer: "Niagara Farms", country: "Canada", countryFlag: "🇨🇦", city: "Niagara, ON", salary: "CAD 16–20/hour", visaType: "SAWP Visa", postedAgo: "3 days ago", category: "Casual", applyUrl: "https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=farm+worker+sawp" },
    { id: "cs-05", title: "Cleaner (Office Buildings)", employer: "EFS Facilities", country: "UAE", countryFlag: "🇦🇪", city: "Dubai", salary: "AED 1,500–1,800/month + housing", visaType: "Employment Visa", postedAgo: "2 days ago", category: "Casual", applyUrl: "https://www.bayt.com/en/uae/jobs/cleaner-jobs/" },
    { id: "cs-06", title: "Babysitter / Childminder", employer: "Private Family", country: "UAE", countryFlag: "🇦🇪", city: "Abu Dhabi", salary: "AED 2,500–3,500/month + room", visaType: "Domestic Worker Visa", postedAgo: "Today", category: "Casual", applyUrl: "https://www.bayt.com/en/uae/jobs/babysitter-jobs/" },
    { id: "cs-07", title: "Cook (Domestic)", employer: "Private Villa", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Riyadh", salary: "SAR 2,500–3,500/month", visaType: "Domestic Worker Visa", postedAgo: "2 days ago", category: "Casual", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/cook-jobs/" },
    { id: "cs-08", title: "Hospital Cleaner", employer: "King Faisal Hospital", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Riyadh", salary: "SAR 1,800–2,300/month", visaType: "Iqama + Accommodation", postedAgo: "5 days ago", category: "Casual", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/hospital-cleaner-jobs/" },
    { id: "cs-09", title: "Mall Cleaner", employer: "City Centre Doha", country: "Qatar", countryFlag: "🇶🇦", city: "Doha", salary: "QAR 1,600–2,000/month + housing", visaType: "Work Visa Sponsored", postedAgo: "3 days ago", category: "Casual", applyUrl: "https://www.bayt.com/en/qatar/jobs/cleaner-jobs/" },
    { id: "cs-10", title: "Gardener / Landscaper", employer: "Royal Estates", country: "UAE", countryFlag: "🇦🇪", city: "Dubai", salary: "AED 1,800–2,400/month + housing", visaType: "Employment Visa", postedAgo: "1 day ago", category: "Casual", applyUrl: "https://www.bayt.com/en/uae/jobs/gardener-jobs/" },
    { id: "cs-11", title: "Warehouse Worker", employer: "Amazon Fulfillment", country: "United Kingdom", countryFlag: "🇬🇧", city: "Coventry", salary: "£24,000–28,000/yr", visaType: "Skilled Worker Visa", postedAgo: "Today", category: "Casual", applyUrl: "https://www.indeed.co.uk/jobs?q=warehouse+visa+sponsorship" },
    { id: "cs-12", title: "Driver Cum Office Boy", employer: "Al Futtaim Group", country: "UAE", countryFlag: "🇦🇪", city: "Sharjah", salary: "AED 2,200–2,800/month", visaType: "Work Visa · Health Insurance", postedAgo: "2 days ago", category: "Casual", applyUrl: "https://www.bayt.com/en/uae/jobs/office-boy-jobs/" },
    // ── HOSPITALITY ───────────────────────────────────────────────────────────
    { id: "hs-01", title: "Hotel Housekeeper", employer: "Atlantis The Palm", country: "UAE", countryFlag: "🇦🇪", city: "Dubai", salary: "AED 1,800–2,500/month + accom", visaType: "Employment Visa · Flight", postedAgo: "1 day ago", category: "Hospitality", applyUrl: "https://www.bayt.com/en/uae/jobs/housekeeping-jobs/" },
    { id: "hs-02", title: "Restaurant Server / Waiter", employer: "Marriott Hotels", country: "UAE", countryFlag: "🇦🇪", city: "Abu Dhabi", salary: "AED 2,000–2,800/month + tips", visaType: "2-Year Employment Visa", postedAgo: "6 days ago", category: "Hospitality", applyUrl: "https://www.bayt.com/en/uae/jobs/waiter-jobs/" },
    { id: "hs-03", title: "Kitchen Helper / Commis", employer: "Hilton Doha", country: "Qatar", countryFlag: "🇶🇦", city: "Doha", salary: "QAR 1,800–2,400/month", visaType: "Work Visa Sponsored", postedAgo: "Today", category: "Hospitality", applyUrl: "https://www.bayt.com/en/qatar/jobs/kitchen-helper-jobs/" },
    { id: "hs-04", title: "Bartender", employer: "Four Seasons Riyadh", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Riyadh", salary: "SAR 3,500–5,000/month + tips", visaType: "Iqama Sponsored", postedAgo: "4 days ago", category: "Hospitality", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/bartender-jobs/" },
    { id: "hs-05", title: "Hotel Receptionist", employer: "Movenpick Hotels", country: "Bahrain", countryFlag: "🇧🇭", city: "Manama", salary: "BHD 400–550/month + housing", visaType: "Work Visa · Family Visa Eligible", postedAgo: "3 days ago", category: "Hospitality", applyUrl: "https://www.bayt.com/en/bahrain/jobs/receptionist-jobs/" },
    { id: "hs-06", title: "Barista", employer: "Costa Coffee Doha", country: "Qatar", countryFlag: "🇶🇦", city: "Doha", salary: "QAR 2,000–2,800/month", visaType: "Employment Visa", postedAgo: "Today", category: "Hospitality", applyUrl: "https://www.bayt.com/en/qatar/jobs/barista-jobs/" },
    { id: "hs-07", title: "Chef de Partie", employer: "InterContinental Dubai", country: "UAE", countryFlag: "🇦🇪", city: "Dubai", salary: "AED 4,500–6,500/month + accom", visaType: "Employment Visa + Flight", postedAgo: "5 days ago", category: "Hospitality", applyUrl: "https://www.bayt.com/en/uae/jobs/chef-jobs/" },
    { id: "hs-08", title: "Room Service Attendant", employer: "Ritz-Carlton Riyadh", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Riyadh", salary: "SAR 2,200–3,000/month + tips", visaType: "Iqama · 30 days leave", postedAgo: "2 days ago", category: "Hospitality", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/room-service-jobs/" },
    // ── CONSTRUCTION ──────────────────────────────────────────────────────────
    { id: "co-01", title: "Construction Worker", employer: "Bechtel Qatar", country: "Qatar", countryFlag: "🇶🇦", city: "Doha", salary: "QAR 2,500–3,500/month + housing", visaType: "Work Visa · Free Accommodation", postedAgo: "5 days ago", category: "Construction", applyUrl: "https://www.bayt.com/en/qatar/jobs/construction-jobs/" },
    { id: "co-02", title: "Welder / Steel Fabricator", employer: "TAV Construction", country: "Qatar", countryFlag: "🇶🇦", city: "Lusail", salary: "QAR 3,000–4,500/month", visaType: "Work Visa · 30 days leave", postedAgo: "Today", category: "Construction", applyUrl: "https://www.bayt.com/en/qatar/jobs/welder-jobs/" },
    { id: "co-03", title: "Mason / Bricklayer", employer: "Saudi Binladin Group", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Jeddah", salary: "SAR 2,200–3,200/month + housing", visaType: "Iqama + Health Insurance", postedAgo: "1 day ago", category: "Construction", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/mason-jobs/" },
    { id: "co-04", title: "Plumber", employer: "Emrill Services", country: "UAE", countryFlag: "🇦🇪", city: "Dubai", salary: "AED 2,500–3,500/month + accom", visaType: "Employment Visa", postedAgo: "3 days ago", category: "Construction", applyUrl: "https://www.bayt.com/en/uae/jobs/plumber-jobs/" },
    { id: "co-05", title: "Electrician (Industrial)", employer: "ABB Saudi", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Dammam", salary: "SAR 3,500–5,500/month", visaType: "Iqama · Family Visa Available", postedAgo: "2 days ago", category: "Construction", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/electrician-jobs/" },
    { id: "co-06", title: "Painter", employer: "ALEC Construction", country: "UAE", countryFlag: "🇦🇪", city: "Dubai", salary: "AED 1,800–2,500/month + housing", visaType: "Work Visa Sponsored", postedAgo: "4 days ago", category: "Construction", applyUrl: "https://www.bayt.com/en/uae/jobs/painter-jobs/" },
    { id: "co-07", title: "Carpenter", employer: "Hyundai E&C", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "NEOM", salary: "SAR 2,800–4,000/month + housing", visaType: "Iqama · Vision 2030 project", postedAgo: "Today", category: "Construction", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/carpenter-jobs/" },
    { id: "co-08", title: "Scaffolder", employer: "Petrofac Oman", country: "Oman", countryFlag: "🇴🇲", city: "Muscat", salary: "OMR 280–380/month + accom", visaType: "Work Visa Sponsored", postedAgo: "5 days ago", category: "Construction", applyUrl: "https://www.bayt.com/en/oman/jobs/scaffolder-jobs/" },
    { id: "co-09", title: "Heavy Equipment Operator", employer: "Mammoet", country: "Qatar", countryFlag: "🇶🇦", city: "Ras Laffan", salary: "QAR 3,500–5,000/month", visaType: "Work Visa · Camp Accom", postedAgo: "2 days ago", category: "Construction", applyUrl: "https://www.bayt.com/en/qatar/jobs/heavy-equipment-operator-jobs/" },
    // ── HEALTHCARE ────────────────────────────────────────────────────────────
    { id: "hc-01", title: "Nursing Assistant (NHS)", employer: "Bupa Care UK", country: "United Kingdom", countryFlag: "🇬🇧", city: "Manchester", salary: "£22,000–28,000/yr", visaType: "Tier 2 Health & Care Visa", postedAgo: "3 days ago", category: "Healthcare", applyUrl: "https://www.indeed.co.uk/jobs?q=care+assistant+visa+sponsorship" },
    { id: "hc-02", title: "Aged Care Worker", employer: "BUPA Aged Care", country: "Australia", countryFlag: "🇦🇺", city: "Melbourne", salary: "AUD 55,000–68,000/yr", visaType: "482 Skilled Visa · Sponsorship", postedAgo: "2 days ago", category: "Healthcare", applyUrl: "https://www.seek.com.au/aged-care-jobs/visa-sponsorship" },
    { id: "hc-03", title: "Caregiver (Elderly)", employer: "Home Instead", country: "United Kingdom", countryFlag: "🇬🇧", city: "Birmingham", salary: "£23,000–27,000/yr", visaType: "Skilled Worker Visa", postedAgo: "1 day ago", category: "Healthcare", applyUrl: "https://www.indeed.co.uk/jobs?q=caregiver+visa+sponsorship" },
    { id: "hc-04", title: "Registered Nurse (Critical Care)", employer: "Mediclinic Saudi", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Riyadh", salary: "SAR 9,000–14,000/month + perks", visaType: "Iqama · Annual Flight · Family", postedAgo: "Today", category: "Healthcare", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/registered-nurse-jobs/" },
    { id: "hc-05", title: "Pharmacist", employer: "Boots Healthcare UK", country: "United Kingdom", countryFlag: "🇬🇧", city: "Birmingham", salary: "£40,000–55,000/yr", visaType: "Skilled Worker Visa", postedAgo: "3 days ago", category: "Healthcare", applyUrl: "https://www.indeed.co.uk/jobs?q=pharmacist+visa+sponsorship" },
    { id: "hc-06", title: "Physiotherapist", employer: "NMC Healthcare", country: "UAE", countryFlag: "🇦🇪", city: "Dubai", salary: "AED 12,000–18,000/month", visaType: "DHA-licensed · Employment Visa", postedAgo: "5 days ago", category: "Healthcare", applyUrl: "https://www.bayt.com/en/uae/jobs/physiotherapist-jobs/" },
    { id: "hc-07", title: "Healthcare Assistant", employer: "HCA Healthcare", country: "United Kingdom", countryFlag: "🇬🇧", city: "London", salary: "£23,500–26,500/yr", visaType: "Health & Care Visa", postedAgo: "Today", category: "Healthcare", applyUrl: "https://www.indeed.co.uk/jobs?q=healthcare+assistant+visa+sponsorship" },
    { id: "hc-08", title: "Laboratory Technician", employer: "Cleveland Clinic AD", country: "UAE", countryFlag: "🇦🇪", city: "Abu Dhabi", salary: "AED 8,000–12,500/month", visaType: "Employment Visa · Insurance", postedAgo: "4 days ago", category: "Healthcare", applyUrl: "https://www.bayt.com/en/uae/jobs/lab-technician-jobs/" },
    { id: "hc-09", title: "Dental Assistant", employer: "Dr. Sulaiman Al Habib", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Riyadh", salary: "SAR 4,500–6,500/month", visaType: "Iqama · Housing Allowance", postedAgo: "2 days ago", category: "Healthcare", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/dental-assistant-jobs/" },
    // ── SKILLED ───────────────────────────────────────────────────────────────
    { id: "sk-01", title: "Mechanical Technician", employer: "Siemens Saudi", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Dammam", salary: "SAR 4,500–6,500/month", visaType: "Iqama · Family Visa", postedAgo: "4 days ago", category: "Skilled", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/mechanical-technician-jobs/" },
    { id: "sk-02", title: "HVAC Technician", employer: "Carrier UAE", country: "UAE", countryFlag: "🇦🇪", city: "Dubai", salary: "AED 3,500–5,000/month + accom", visaType: "Employment Visa", postedAgo: "Today", category: "Skilled", applyUrl: "https://www.bayt.com/en/uae/jobs/hvac-technician-jobs/" },
    { id: "sk-03", title: "Auto Mechanic", employer: "Al-Futtaim Motors", country: "UAE", countryFlag: "🇦🇪", city: "Dubai", salary: "AED 3,000–4,500/month + housing", visaType: "Work Visa", postedAgo: "2 days ago", category: "Skilled", applyUrl: "https://www.bayt.com/en/uae/jobs/auto-mechanic-jobs/" },
    { id: "sk-04", title: "IT Support Technician", employer: "STC Kuwait", country: "Kuwait", countryFlag: "🇰🇼", city: "Kuwait City", salary: "KWD 350–500/month", visaType: "Work Visa · Health Insurance", postedAgo: "3 days ago", category: "Skilled", applyUrl: "https://www.bayt.com/en/kuwait/jobs/it-support-jobs/" },
    { id: "sk-05", title: "CNC Machine Operator", employer: "FAGOR Industries", country: "Germany", countryFlag: "🇩🇪", city: "Stuttgart", salary: "EUR 2,800–3,800/month", visaType: "EU Skilled Worker Visa", postedAgo: "Today", category: "Skilled", applyUrl: "https://www.stepstone.de/jobs/cnc-operator" },
    { id: "sk-06", title: "Quality Control Inspector", employer: "Sadara Chemical", country: "Saudi Arabia", countryFlag: "🇸🇦", city: "Jubail", salary: "SAR 5,500–7,500/month", visaType: "Iqama · Camp Accommodation", postedAgo: "5 days ago", category: "Skilled", applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/quality-control-jobs/" },
];
function applyUrlForJob(jobId) {
    return exports.VISA_JOBS.find((j) => j.id === jobId)?.applyUrl ?? null;
}
/** Resolve whether the requesting user is Pro (or admin) — same logic as elsewhere. */
async function isUserPro(userId) {
    if (!userId)
        return false;
    try {
        const { rows } = await db_1.pool.query(`SELECT plan, subscription_status, is_admin, role FROM users WHERE id = $1`, [userId]);
        const u = rows[0];
        if (!u)
            return false;
        if (u.is_admin || u.role === "ADMIN" || u.role === "SUPER_ADMIN")
            return true;
        return u.plan === "pro" && u.subscription_status === "active";
    }
    catch {
        return false;
    }
}
function registerVisaJobsRoutes(app, isAuthenticated) {
    // GET /api/visa-jobs — public list, no applyUrl leaked
    app.get("/api/visa-jobs", (_req, res) => {
        const sanitised = exports.VISA_JOBS.map(({ applyUrl, ...rest }) => rest);
        res.json({ jobs: sanitised, total: sanitised.length });
    });
    // GET /api/visa-jobs/:id/apply — Pro-gated redirect
    app.get("/api/visa-jobs/:id/apply", isAuthenticated, async (req, res) => {
        const userId = req.user?.claims?.sub ?? req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Please sign in." });
        }
        const pro = await isUserPro(userId);
        if (!pro) {
            return res.status(403).json({
                message: "Pro membership required to apply.",
                upgradeUrl: "/pricing",
            });
        }
        const url = applyUrlForJob(String(req.params.id || ""));
        if (!url)
            return res.status(404).json({ message: "Job not found." });
        res.redirect(302, url);
    });
    console.log(`[VisaJobs] Routes registered: GET /api/visa-jobs (${exports.VISA_JOBS.length} jobs), GET /api/visa-jobs/:id/apply (Pro-gated)`);
}
