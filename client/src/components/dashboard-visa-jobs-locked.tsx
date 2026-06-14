/**
 * Locked visa-sponsored jobs list — replaces the social-proof "live activity"
 * widgets at the top of the dashboard with a high-value conversion driver.
 *
 * SECURITY (Pro-gated):
 *   - The job catalog is fetched from /api/visa-jobs which returns metadata
 *     only — no applyUrl is ever sent to the client.
 *   - The "Apply" button hits /api/visa-jobs/:id/apply which:
 *       • 302-redirects Pro users to the real portal
 *       • returns 403 with upgradeUrl for everyone else
 *   - Inspecting devtools / view-source won't expose any portal URL because
 *     no portal URL exists in the client bundle.
 *
 * Conversion psychology:
 *   - User sees specific jobs they could apply to NOW
 *   - The lock creates immediate FOMO (real opportunity, blocked by KES 4,500)
 *   - Different from price-anchor cards — these are PROOF the platform works
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useUpgradeModal } from "@/contexts/upgrade-modal-context";
import { Lock, ExternalLink, MapPin, DollarSign, Plane, ChevronRight, Briefcase, Loader2 } from "lucide-react";
import { isPaidUser } from "@/lib/plan";
import { useQuery } from "@tanstack/react-query";

interface VisaJob {
  id: string;
  title: string;
  employer: string;
  country: string;
  countryFlag: string;
  city: string;
  salary: string;
  visaType: string;
  postedAgo: string;
  category: "Casual" | "Skilled" | "Healthcare" | "Hospitality" | "Construction" | "Transport";
  // NOTE: no applyUrl — never sent by the server to non-Pro clients, and never
  //       needed by the client because the Apply CTA hits a server redirect.
}

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

  // 2026-06 EMERGENCY: paying KES 99 / 1000 customers were seeing the lock
  // because useAuth's /api/auth/user cache could be up to 5 min stale after
  // payment. Now we ALSO check /api/user/plan which polls every 30s — so
  // even if useAuth still has plan="free", a fresh plan check unlocks the UI.
  const { data: freshPlan } = useQuery<{ planId: string } | null>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const isPro =
    isPaidUser((user as any)?.plan) ||
    isPaidUser(freshPlan?.planId) ||
    (user as any)?.subscriptionStatus === "active" ||
    (user as any)?.isAdmin === true ||
    (user as any)?.role === "ADMIN" ||
    (user as any)?.role === "SUPER_ADMIN";

  // Use the project's default queryFn (handles auth, CSRF, retries, cold-start).
  // queryKey becomes the fetch URL: ["/api/visa-jobs"] → fetch("/api/visa-jobs").
  const { data, isLoading, isError, refetch } = useQuery<{ jobs: VisaJob[]; total: number }>({
    queryKey: ["/api/visa-jobs"],
    staleTime: 5 * 60_000,
    retry: 3,             // resilient to Render free-tier cold starts
    retryDelay: (i) => Math.min(1500 * (i + 1), 6000),
  });

  const jobs: VisaJob[] = data?.jobs ?? [];

  const filtered = useMemo(
    () => (filter === "All" ? jobs : jobs.filter((j) => j.category === filter)),
    [filter, jobs],
  );
  const visible = showAll ? filtered : filtered.slice(0, 6);

  return (
    <section className="mb-6" aria-label="Visa-sponsored jobs">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Plane className="h-5 w-5 text-blue-500" /> Visa-Sponsored Jobs · Live Now
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {jobs.length > 0 ? `${jobs.length}+ real openings` : "Loading openings"} · Visa & flight included · Updated daily
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

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-sm">Loading visa-sponsored jobs…</span>
        </div>
      )}

      {/* Error state — Render free tier can take 30–60s to wake up */}
      {isError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
          <span>Couldn't load jobs right now. The server may be waking up.</span>
          <button
            onClick={() => refetch()}
            className="shrink-0 px-3 py-1 rounded-md bg-rose-600 text-white text-xs font-bold hover:bg-rose-700"
            data-testid="retry-visa-jobs"
          >
            Try again
          </button>
        </div>
      )}

      {/* Job cards grid */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((job) => (
            <JobCard key={job.id} job={job} isPro={isPro} />
          ))}
        </div>
      )}

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

      {!isPro && jobs.length > 0 && (
        <div className="mt-4 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 text-white p-4 flex items-center gap-4">
          <div className="shrink-0 w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <Lock className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold mb-0.5">All {jobs.length} jobs unlock with Pro</p>
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
  const { openUpgradeModal } = useUpgradeModal();
  const CategoryBadge = (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[job.category]}`}>
      {job.category}
    </span>
  );

  /**
   * Apply handler — opens the server redirect endpoint in a new tab.
   * The server validates Pro status server-side and either 302-redirects
   * to the real portal or returns 403. Either way, no portal URL ever
   * lives in the client bundle.
   */
  const handleApply = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isPro) return;
    window.open(`/api/visa-jobs/${encodeURIComponent(job.id)}/apply`, "_blank", "noopener,noreferrer");
  };

  const content = (
    <div
      className={`relative rounded-xl border bg-card p-4 transition-all ${
        isPro ? "hover:shadow-md hover:border-blue-300 cursor-pointer" : "opacity-95"
      }`}
      data-testid={`job-card-${job.id}`}
      onClick={isPro ? handleApply : undefined}
      role={isPro ? "button" : undefined}
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

      {/* Lock overlay for non-Pro — opens the in-page upgrade modal (4-tier
          picker → M-Pesa STK push) instead of detouring to /pricing. */}
      {!isPro && (
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent rounded-xl flex items-end p-3 pointer-events-none">
          <div className="w-full text-center">
            <button
              type="button"
              onClick={() => openUpgradeModal("jobs_locked", job.title)}
              className="inline-flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md pointer-events-auto transition-transform hover:scale-105"
              data-testid={`lock-cta-${job.id}`}
            >
              <Lock className="h-3 w-3" /> Upgrade to apply
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // For Pro users, the whole card is the clickable apply trigger.
  // For non-Pro, the card is static with a locked overlay.
  return content;
}
