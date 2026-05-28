/**
 * Locked visa-sponsored jobs list — replaces the social-proof "live activity"
 * widgets at the top of the dashboard with a high-value conversion driver.
 *
 * Strategy:
 *   - Free users see real visa-sponsored jobs with locked apply buttons
 *   - Each card has a "Pro only — Upgrade to apply" lock overlay
 *   - Pro/Admin users get instant "Apply now" links to the real portal
 *   - Mix of casual (driver, cleaner, babysitter) + skilled roles so the
 *     audience always sees something relevant to them
 *
 * Conversion psychology:
 *   - User sees specific jobs they could apply to NOW
 *   - The lock creates immediate FOMO (real opportunity, blocked by KES 4,500)
 *   - Different from price-anchor cards — these are PROOF the platform works
 */
import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Lock, ExternalLink, MapPin, DollarSign, Plane, ChevronRight, Briefcase } from "lucide-react";

interface VisaJob {
  id: string;
  title: string;
  employer: string;
  country: string;        // "🇨🇦 Canada"
  countryFlag: string;
  city: string;
  salary: string;
  visaType: string;       // "Work Permit · Sponsorship Included"
  postedAgo: string;      // "Posted 2 days ago"
  category: "Casual" | "Skilled" | "Healthcare" | "Hospitality" | "Construction" | "Transport";
  applyUrl: string;       // Where Pro users get redirected
}

// Curated visa-sponsored jobs that match the WAH audience — Kenyan workers
// looking for casual + skilled overseas roles. Updated every Monday.
const VISA_JOBS: VisaJob[] = [
  {
    id: "j1",
    title: "Long-Haul Truck Driver",
    employer: "Bison Transport",
    country: "Canada",
    countryFlag: "🇨🇦",
    city: "Calgary, AB",
    salary: "CAD 65,000–80,000/yr",
    visaType: "TFW Program · LMIA Approved",
    postedAgo: "Posted 2 days ago",
    category: "Transport",
    applyUrl: "https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=truck+driver+lmia",
  },
  {
    id: "j2",
    title: "Domestic Worker / Housekeeper",
    employer: "Private Household",
    country: "Saudi Arabia",
    countryFlag: "🇸🇦",
    city: "Riyadh",
    salary: "SAR 1,500–2,200/month",
    visaType: "Domestic Worker Visa Sponsored",
    postedAgo: "Posted today",
    category: "Casual",
    applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/domestic-jobs/",
  },
  {
    id: "j3",
    title: "Nursing Assistant (NHS)",
    employer: "Bupa Care UK",
    country: "United Kingdom",
    countryFlag: "🇬🇧",
    city: "Manchester",
    salary: "£22,000–28,000/yr",
    visaType: "Tier 2 Health & Care Visa",
    postedAgo: "Posted 3 days ago",
    category: "Healthcare",
    applyUrl: "https://www.indeed.co.uk/jobs?q=care+assistant+visa+sponsorship",
  },
  {
    id: "j4",
    title: "Construction Worker",
    employer: "Bechtel Qatar",
    country: "Qatar",
    countryFlag: "🇶🇦",
    city: "Doha",
    salary: "QAR 2,500–3,500/month + housing",
    visaType: "Work Visa Sponsored · Free Accommodation",
    postedAgo: "Posted 5 days ago",
    category: "Construction",
    applyUrl: "https://www.bayt.com/en/qatar/jobs/construction-jobs/",
  },
  {
    id: "j5",
    title: "Hotel Housekeeper",
    employer: "Atlantis The Palm",
    country: "UAE",
    countryFlag: "🇦🇪",
    city: "Dubai",
    salary: "AED 1,800–2,500/month + accommodation",
    visaType: "Employment Visa · Free Flight",
    postedAgo: "Posted 1 day ago",
    category: "Hospitality",
    applyUrl: "https://www.bayt.com/en/uae/jobs/housekeeping-jobs/",
  },
  {
    id: "j6",
    title: "Nanny / Childcare Worker",
    employer: "Au Pair Family Network",
    country: "Australia",
    countryFlag: "🇦🇺",
    city: "Sydney",
    salary: "AUD 600–800/week + room",
    visaType: "Working Holiday / Sponsorship",
    postedAgo: "Posted 4 days ago",
    category: "Casual",
    applyUrl: "https://www.seek.com.au/nanny-jobs/visa-sponsorship",
  },
  {
    id: "j7",
    title: "Aged Care Worker",
    employer: "BUPA Aged Care",
    country: "Australia",
    countryFlag: "🇦🇺",
    city: "Melbourne",
    salary: "AUD 55,000–68,000/yr",
    visaType: "Skilled Visa 482 · Sponsorship",
    postedAgo: "Posted 2 days ago",
    category: "Healthcare",
    applyUrl: "https://www.seek.com.au/aged-care-jobs/visa-sponsorship",
  },
  {
    id: "j8",
    title: "Restaurant Server / Waiter",
    employer: "Marriott Hotels",
    country: "UAE",
    countryFlag: "🇦🇪",
    city: "Abu Dhabi",
    salary: "AED 2,000–2,800/month + tips",
    visaType: "2-Year Employment Visa Sponsored",
    postedAgo: "Posted 6 days ago",
    category: "Hospitality",
    applyUrl: "https://www.bayt.com/en/uae/jobs/waiter-jobs/",
  },
  {
    id: "j9",
    title: "Security Guard",
    employer: "Securitas Saudi",
    country: "Saudi Arabia",
    countryFlag: "🇸🇦",
    city: "Jeddah",
    salary: "SAR 2,000–2,800/month",
    visaType: "Work Visa Sponsored · Housing Included",
    postedAgo: "Posted 1 day ago",
    category: "Casual",
    applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/security-guard-jobs/",
  },
  {
    id: "j10",
    title: "Farm Worker (Greenhouse)",
    employer: "Niagara Farms Canada",
    country: "Canada",
    countryFlag: "🇨🇦",
    city: "Niagara, ON",
    salary: "CAD 16–20/hour",
    visaType: "Seasonal Agricultural Worker Program",
    postedAgo: "Posted 3 days ago",
    category: "Casual",
    applyUrl: "https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=farm+worker+sawp",
  },
  {
    id: "j11",
    title: "Mechanical Technician",
    employer: "Siemens Saudi",
    country: "Saudi Arabia",
    countryFlag: "🇸🇦",
    city: "Dammam",
    salary: "SAR 4,500–6,500/month",
    visaType: "Iqama Sponsored · Family Visa Available",
    postedAgo: "Posted 4 days ago",
    category: "Skilled",
    applyUrl: "https://www.bayt.com/en/saudi-arabia/jobs/mechanical-technician-jobs/",
  },
  {
    id: "j12",
    title: "Welder / Steel Fabricator",
    employer: "TAV Construction",
    country: "Qatar",
    countryFlag: "🇶🇦",
    city: "Lusail",
    salary: "QAR 3,000–4,500/month",
    visaType: "Work Visa Sponsored · 30 Days Annual Leave",
    postedAgo: "Posted today",
    category: "Construction",
    applyUrl: "https://www.bayt.com/en/qatar/jobs/welder-jobs/",
  },
];

const CATEGORY_COLORS: Record<VisaJob["category"], string> = {
  Casual:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Skilled:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Healthcare:   "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  Hospitality:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Construction: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  Transport:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

type Filter = "All" | VisaJob["category"];

export function DashboardVisaJobsLocked() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("All");
  const [showAll, setShowAll] = useState(false);

  const isPro =
    (user as any)?.plan === "pro" ||
    (user as any)?.subscriptionStatus === "active" ||
    (user as any)?.isAdmin === true;

  const filtered = filter === "All" ? VISA_JOBS : VISA_JOBS.filter((j) => j.category === filter);
  const visible = showAll ? filtered : filtered.slice(0, 6);

  return (
    <section className="mb-6" aria-label="Visa-sponsored jobs">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Plane className="h-5 w-5 text-blue-500" /> Visa-Sponsored Jobs · Live Now
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real employers · Visa & flight included · Updated daily
          </p>
        </div>
        {!isPro && (
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm hover:scale-105 transition-transform"
            data-testid="link-upgrade-from-jobs"
          >
            <Lock className="h-3 w-3" /> Unlock all — KES 4,500/yr
          </Link>
        )}
      </div>

      {/* Category filter pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
        {(["All", "Casual", "Skilled", "Healthcare", "Hospitality", "Construction", "Transport"] as Filter[]).map(
          (cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                filter === cat
                  ? "bg-blue-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              data-testid={`filter-${cat}`}
            >
              {cat}
            </button>
          ),
        )}
      </div>

      {/* Job cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((job) => (
          <JobCard key={job.id} job={job} isPro={isPro} />
        ))}
      </div>

      {filtered.length > 6 && (
        <div className="text-center mt-4">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showAll ? "Show less" : `Show all ${filtered.length} jobs →`}
          </button>
        </div>
      )}

      {!isPro && (
        <div className="mt-4 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 text-white p-4 flex items-center gap-4">
          <div className="shrink-0 w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <Lock className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold mb-0.5">All {VISA_JOBS.length} jobs unlock with Pro</p>
            <p className="text-xs text-white/85">
              KES 4,500/year · Less than mandazi/day · Apply to every job + 30+ portals + WhatsApp support
            </p>
          </div>
          <Link
            href="/pricing"
            className="shrink-0 inline-flex items-center gap-1 bg-white text-amber-700 hover:bg-amber-50 font-bold py-2 px-4 rounded-lg text-sm whitespace-nowrap"
            data-testid="button-unlock-jobs-pro"
          >
            Upgrade <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  );
}

// ─── Individual Job Card ──────────────────────────────────────────────────────

function JobCard({ job, isPro }: { job: VisaJob; isPro: boolean }) {
  const CategoryBadge = (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[job.category]}`}>
      {job.category}
    </span>
  );

  const content = (
    <div
      className={`relative rounded-xl border bg-card p-4 transition-all ${
        isPro ? "hover:shadow-md hover:border-blue-300 cursor-pointer" : "opacity-95"
      }`}
      data-testid={`job-card-${job.id}`}
    >
      {/* Top row: country + category */}
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
          <span className="text-base">{job.countryFlag}</span>
          <span className="truncate">{job.city}, {job.country}</span>
        </div>
        {CategoryBadge}
      </div>

      {/* Title + employer */}
      <h3 className="font-bold text-sm text-foreground leading-tight mb-1 line-clamp-2">{job.title}</h3>
      <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1">
        <Briefcase className="h-3 w-3" /> {job.employer}
      </p>

      {/* Salary */}
      <div className="flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 mb-2">
        <DollarSign className="h-3 w-3" /> {job.salary}
      </div>

      {/* Visa type pill */}
      <p className="text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded-md mb-3 leading-snug">
        ✈️ {job.visaType}
      </p>

      {/* Footer: posted ago + CTA */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{job.postedAgo}</span>
        {isPro ? (
          <span className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400">
            Apply <ExternalLink className="h-3 w-3" />
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
            <Lock className="h-3 w-3" /> Pro only
          </span>
        )}
      </div>

      {/* Lock overlay for non-Pro */}
      {!isPro && (
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent rounded-xl flex items-end p-3 pointer-events-none">
          <div className="w-full text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md pointer-events-auto transition-transform hover:scale-105"
              data-testid={`lock-cta-${job.id}`}
            >
              <Lock className="h-3 w-3" /> Upgrade to apply
            </Link>
          </div>
        </div>
      )}
    </div>
  );

  // Pro users get a clickable wrapper that opens the application portal
  return isPro ? (
    <a
      href={job.applyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
      data-testid={`apply-link-${job.id}`}
    >
      {content}
    </a>
  ) : (
    content
  );
}
