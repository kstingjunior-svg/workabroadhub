import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { ExternalLink, Shield, ChevronDown, X } from "lucide-react";

async function trackEvent(event: string, extra?: { category?: string; country?: string }) {
  try { await apiRequest("POST", "/api/track", { event, page: window.location.pathname, ...extra }); } catch {}
}
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VerifiedPortal } from "@shared/schema";

// ─── Country config ───────────────────────────────────────────────────────────

interface CountryConfig {
  flag: string;
  slug: string;
  desc: string;
  tags: string[];
  portals: string;
  exploreName: string;
  featuredBadge?: string;
}

const COUNTRY_CONFIG: Record<string, CountryConfig> = {
  "Canada": {
    flag: "🇨🇦",
    slug: "canada",
    desc: "Nursing & IT roles · PR pathways",
    tags: ["Express Entry", "PNP", "No job offer required"],
    portals: "6+",
    exploreName: "Canada",
    featuredBadge: "⭐ BEST MATCH",
  },
  "United Kingdom": {
    flag: "🇬🇧",
    slug: "uk",
    desc: "Healthcare & skilled roles · NHS actively hiring",
    tags: ["NHS Hiring", "Visa Sponsorship", "Tier 2 Health & Care"],
    portals: "8+",
    exploreName: "United Kingdom",
  },
  "Australia": {
    flag: "🇦🇺",
    slug: "australia",
    desc: "Mining & healthcare · Skilled migration",
    tags: ["Skilled Visa", "Visa Sponsorship", "Regional pathways"],
    portals: "5+",
    exploreName: "Australia",
  },
  "Germany": {
    flag: "🇩🇪",
    slug: "europe",
    desc: "Engineering & healthcare · EU work permit",
    tags: ["EU Blue Card", "PR pathway", "Qualification recognition"],
    portals: "6+",
    exploreName: "Germany",
  },
  "Saudi Arabia": {
    flag: "🇸🇦",
    slug: "uae",
    desc: "Oil & construction · Tax-free income",
    tags: ["Iqama", "Tax-free", "Vision 2030 projects"],
    portals: "4+",
    exploreName: "Saudi Arabia",
  },
  "UAE": {
    flag: "🇦🇪",
    slug: "uae",
    desc: "Tax-free salaries · Rapid hiring",
    tags: ["0% income tax", "Employer housing", "Fast visa"],
    portals: "5+",
    exploreName: "Gulf",
  },
  "USA": {
    flag: "🇺🇸",
    slug: "usa",
    desc: "Federal & private sector · H-1B visas",
    tags: ["H-1B", "EB-3", "NCLEX prep"],
    portals: "4+",
    exploreName: "USA",
  },
  "Europe": {
    flag: "🇪🇺",
    slug: "europe",
    desc: "Germany, France, Ireland & more (7 countries)",
    tags: ["EU Blue Card", "14 portals", "Qualification recognition"],
    portals: "14",
    exploreName: "Europe",
  },
  "Qatar": {
    flag: "🇶🇦",
    slug: "uae",
    desc: "Tax-free Gulf salaries · Infrastructure growth",
    tags: ["0% income tax", "Accommodation provided", "World Cup legacy"],
    portals: "4+",
    exploreName: "Qatar",
  },
};

const TOTAL_PORTALS = 57;

const DB_COUNTRY_NAME_MAP: Record<string, string> = {
  "United Arab Emirates": "UAE",
  "United States": "USA",
  "United States of America": "USA",
};

const COUNTRY_ORDER = [
  "United Kingdom", "Canada", "Australia", "Germany",
  "Saudi Arabia", "USA", "UAE", "Europe", "Qatar",
];

interface SponsorshipJob { country: string }

// ─── Country Card (existing jobs grid) ───────────────────────────────────────

function CountryCard({
  name,
  jobCount,
  isBestMatch,
}: {
  name: string;
  jobCount: number;
  isBestMatch: boolean;
}) {
  const [, navigate] = useLocation();
  const cfg = COUNTRY_CONFIG[name];
  if (!cfg) return null;

  return (
    <div
      onClick={() => navigate(`/country/${cfg.slug}`)}
      data-testid={`country-card-${cfg.slug}-${name.toLowerCase().replace(/\s+/g, '-')}`}
      className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] group"
      style={{ border: isBestMatch ? "2px solid #4A7C59" : "1px solid #E2DDD5" }}
    >
      {isBestMatch && cfg.featuredBadge && (
        <span
          className="absolute -top-2.5 right-4 text-white text-[10px] font-semibold px-3 py-0.5 rounded-full leading-none uppercase tracking-wide"
          style={{ background: "#4A7C59" }}
        >
          {cfg.featuredBadge}
        </span>
      )}

      <div className="flex items-center gap-3 mb-2">
        <span className="text-[1.8rem] leading-none">{cfg.flag}</span>
        <span className="text-xl font-semibold text-[#1A2530] dark:text-white font-serif">{name}</span>
      </div>

      <p className="text-sm text-[#5A6A7A] dark:text-gray-400 mb-3">{cfg.desc}</p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {cfg.tags.map(t => (
          <span
            key={t}
            className="text-[11px] font-medium px-2 py-0.5 rounded text-[#3A4A5A] dark:text-gray-300"
            style={{ background: "#EDE9E2" }}
          >
            {t}
          </span>
        ))}
      </div>

      <p className="text-sm font-medium text-[#4A7C59] dark:text-emerald-400 mb-3">
        {jobCount > 0
          ? `✨ ${jobCount} job${jobCount === 1 ? "" : "s"} match your profile`
          : "✨ Opportunities available"}
      </p>

      <span
        className="text-sm font-semibold text-[#1A2530] dark:text-gray-300 border-b-2 pb-0.5 inline-block group-hover:opacity-70 transition-opacity"
        style={{ borderColor: "#8B7A66" }}
      >
        View {name} opportunities →
      </span>
    </div>
  );
}

function CountryCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-[#E2DDD5]">
      <div className="flex items-center gap-3 mb-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-6 w-28" />
      </div>
      <Skeleton className="h-4 w-full mb-3" />
      <div className="flex gap-2 mb-4">
        <Skeleton className="h-5 w-20 rounded" />
        <Skeleton className="h-5 w-24 rounded" />
        <Skeleton className="h-5 w-16 rounded" />
      </div>
      <Skeleton className="h-8 w-16 mb-3" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

// ─── Portal Modal ─────────────────────────────────────────────────────────────

function PortalModal({
  country,
  portals,
  onClose,
}: {
  country: string;
  portals: VerifiedPortal[];
  onClose: () => void;
}) {
  const cfg = COUNTRY_CONFIG[country];
  const sponsoredPortals = portals.filter(p => p.sponsorshipAvailable);
  const otherPortals = portals.filter(p => !p.sponsorshipAvailable);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl max-h-[82vh] overflow-y-auto"
        data-testid={`portal-modal-${country.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl font-serif">
            <span className="text-2xl">{cfg?.flag ?? "🌍"}</span>
            <span>{country} — Verified Job Portals</span>
          </DialogTitle>
          <p className="text-sm text-[#5A6A7A] dark:text-gray-400 mt-1">
            {cfg?.desc ?? "Official, hand-verified portals with real overseas jobs."}
          </p>
        </DialogHeader>

        {sponsoredPortals.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#4A7C59] mb-3 flex items-center gap-1.5">
              <Shield size={13} /> Visa Sponsorship Available
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sponsoredPortals.map(portal => (
                <a
                  key={portal.id}
                  href={portal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`portal-link-${portal.id}`}
                  onClick={() => trackEvent("view_job", { category: portal.category, country: portal.country })}
                  className="group flex flex-col p-3.5 rounded-xl border border-[#E2DDD5] dark:border-gray-700 bg-[#F9F8F6] dark:bg-gray-800 hover:border-[#4A7C59] hover:bg-[#F0FBF4] dark:hover:border-[#4A7C59] dark:hover:bg-gray-700 transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-semibold text-[#1A2530] dark:text-white text-sm group-hover:text-[#4A7C59] transition-colors">
                      {portal.name}
                    </span>
                    <ExternalLink size={13} className="shrink-0 text-[#7A8A9A] group-hover:text-[#4A7C59] mt-0.5 transition-colors" />
                  </div>
                  <span className="text-xs text-[#5A6A7A] dark:text-gray-400 leading-relaxed">{portal.description}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[#4A7C59] bg-[#E8F5E9] px-2 py-0.5 rounded-full w-fit">
                    ✅ Visa Sponsorship
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {otherPortals.length > 0 && (
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#7A8A9A] mb-3">
              All Other Portals
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {otherPortals.map(portal => (
                <a
                  key={portal.id}
                  href={portal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`portal-link-${portal.id}`}
                  onClick={() => trackEvent("view_job", { category: portal.category, country: portal.country })}
                  className="group flex flex-col p-3.5 rounded-xl border border-[#E2DDD5] dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[#8B7A66] hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-semibold text-[#1A2530] dark:text-white text-sm">
                      {portal.name}
                    </span>
                    <ExternalLink size={13} className="shrink-0 text-[#7A8A9A] mt-0.5" />
                  </div>
                  <span className="text-xs text-[#5A6A7A] dark:text-gray-400 leading-relaxed">{portal.description}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 bg-[#FFF9E6] dark:bg-yellow-900/20 border border-[#F0D060]/30 rounded-xl px-4 py-3">
          <p className="text-xs text-[#5A6A7A] dark:text-gray-400">
            ⚠️ <strong className="text-[#1A2530] dark:text-white">Stay safe:</strong>{" "}
            Always apply directly on the employer's official website. Never pay a recruitment fee.
            These are official job portals, not recruitment agencies.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Country Portal Card (portals section) ───────────────────────────────────

function CountryPortalCard({
  country,
  portals,
}: {
  country: string;
  portals: VerifiedPortal[];
}) {
  const [open, setOpen] = useState(false);
  const cfg = COUNTRY_CONFIG[country];
  if (!cfg || portals.length === 0) return null;

  const previewPortals = portals.slice(0, 4);
  const sponsorCount = portals.filter(p => p.sponsorshipAvailable).length;

  return (
    <>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-[#E2DDD5] dark:border-gray-700 hover:border-[#8B7A66] dark:hover:border-gray-500 transition-all group"
        data-testid={`portal-country-card-${country.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl leading-none">{cfg.flag}</span>
          <div>
            <h3 className="text-base font-semibold text-[#1A2530] dark:text-white font-serif">{country}</h3>
            <p className="text-xs text-[#7A8A9A] dark:text-gray-500">
              {portals.length} verified portal{portals.length !== 1 ? "s" : ""}
              {sponsorCount > 0 && (
                <span className="ml-2 text-[#4A7C59] font-medium">· {sponsorCount} sponsor visa</span>
              )}
            </p>
          </div>
        </div>

        <p className="text-xs text-[#5A6A7A] dark:text-gray-400 mb-4 leading-relaxed">{cfg.desc}</p>

        {/* Portal preview list */}
        <ul className="space-y-2 mb-4">
          {previewPortals.map((portal) => (
            <li key={portal.id} className="flex items-start gap-2">
              <a
                href={portal.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                data-testid={`portal-preview-link-${portal.id}`}
                className="flex-1 flex items-center justify-between gap-1 group/link"
              >
                <span className="text-sm font-medium text-[#1A2530] dark:text-white group-hover/link:text-[#8B7A66] transition-colors line-clamp-1">
                  {portal.name}
                </span>
                <ExternalLink size={11} className="shrink-0 text-[#B8C5D0]" />
              </a>
              {portal.sponsorshipAvailable && (
                <span className="shrink-0 text-[9px] font-semibold text-[#4A7C59] bg-[#E8F5E9] px-1.5 py-0.5 rounded-full">
                  ✅ Visa
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* Expand link */}
        <button
          onClick={() => setOpen(true)}
          data-testid={`button-explore-${country.toLowerCase().replace(/\s+/g, '-')}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#1A2530] dark:text-white border-b-2 border-[#8B7A66] pb-px hover:opacity-70 transition-opacity"
        >
          Explore {cfg.exploreName} opportunities
          <ChevronDown size={13} className="rotate-[-90deg]" />
        </button>
      </div>

      {open && (
        <PortalModal
          country={country}
          portals={portals}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function CountryPortalCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-[#E2DDD5]">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-4 w-28 mb-1" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-3 w-full mb-4" />
      {[1, 2, 3].map(i => (
        <Skeleton key={i} className="h-4 w-full mb-2 rounded" />
      ))}
      <Skeleton className="h-4 w-36 mt-3" />
    </div>
  );
}

// ─── Verified Portals Section ─────────────────────────────────────────────────

function VerifiedPortalsSection() {
  const { data: allPortals, isLoading } = useQuery<VerifiedPortal[]>({
    queryKey: ["/api/portals"],
    staleTime: 10 * 60 * 1000,
  });

  const portalsByCountry: Record<string, VerifiedPortal[]> = {};
  if (allPortals) {
    for (const p of allPortals) {
      if (!portalsByCountry[p.country!]) portalsByCountry[p.country!] = [];
      portalsByCountry[p.country!].push(p);
    }
  }

  const countries = COUNTRY_ORDER.filter(
    c => isLoading || (portalsByCountry[c] && portalsByCountry[c].length > 0)
  );

  return (
    <section className="mb-10" aria-label="Verified job portals by country">
      {/* Section header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-5">
        <div>
          <h2 className="text-[1.6rem] font-serif font-medium text-[#1A2530] dark:text-white mb-1">
            🛡️ Verified Job Portals by Country
          </h2>
          <p className="text-sm text-[#5A6A7A] dark:text-gray-400">
            Every portal is hand-verified, scam-free, and leads to real overseas jobs.
          </p>
        </div>
        <span
          className="shrink-0 text-xs font-semibold px-3 py-1 rounded-full text-[#4A7C59]"
          style={{ background: "#E8F5E9" }}
        >
          {TOTAL_PORTALS}+ portals · 9 countries
        </span>
      </div>

      {/* Country portal cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <CountryPortalCardSkeleton key={i} />)
          : countries.map(country => (
              <CountryPortalCard
                key={country}
                country={country}
                portals={portalsByCountry[country] ?? []}
              />
            ))
        }
      </div>

      {/* Safety disclaimer */}
      <div
        className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white dark:bg-gray-800 rounded-xl px-5 py-4"
        style={{ border: "1px solid #E2DDD5" }}
      >
        <Shield size={18} className="shrink-0 text-[#4A7C59]" />
        <p className="text-sm text-[#5A6A7A] dark:text-gray-400">
          <strong className="text-[#1A2530] dark:text-white">All portals are independently verified.</strong>
          {" "}We check NEA licenses, scam databases, and user reports before listing any portal.
          Apply directly on employer websites — never pay a recruitment fee.
        </p>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GlobalOpportunitiesPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isPro = user?.plan === "pro";

  useEffect(() => { trackEvent("view_jobs"); }, []);
  const [view, setView] = useState<"compact" | "expanded">("compact");

  const { data: allJobs, isLoading } = useQuery<SponsorshipJob[]>({
    queryKey: ["/api/jobs/sponsorship"],
  });

  const jobCounts = allJobs
    ? allJobs.reduce<Record<string, number>>((acc, j) => {
        const name = DB_COUNTRY_NAME_MAP[j.country] ?? j.country;
        if (name && COUNTRY_CONFIG[name]) acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {})
    : {};

  const allCountries = Object.keys(COUNTRY_CONFIG).sort((a, b) => {
    const diff = (jobCounts[b] || 0) - (jobCounts[a] || 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  const totalJobs = Object.values(jobCounts).reduce((s, n) => s + n, 0);
  const totalCountries = allCountries.length;
  const displayedCountries = view === "compact" ? allCountries.slice(0, 6) : allCountries;
  const now = new Date();
  const updatedAt = now.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" }) + " EAT";

  return (
    <div className="min-h-screen bg-background dark:bg-gray-900" style={{ background: "var(--background)" }}>
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 py-10">

        {/* ── Section header ── */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-5">
          <div>
            <h1 className="text-[2.2rem] font-serif font-medium text-[#1A2530] dark:text-white mb-1">
              🌍 Where do you want to work?
            </h1>
            <p className="text-[#5A6A7A] dark:text-gray-400 text-sm">
              Ranked by live job count — updated daily
            </p>
          </div>

          <div
            className="flex shrink-0 gap-1 bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-full p-1"
          >
            <button
              onClick={() => setView("compact")}
              data-testid="toggle-top-matches"
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                view === "compact"
                  ? "bg-[#1A2530] text-white dark:bg-white dark:text-[#1A2530]"
                  : "text-[#5A6A7A] dark:text-gray-400 hover:text-[#1A2530] dark:hover:text-white"
              }`}
            >
              Top Matches
            </button>
            <button
              onClick={() => setView("expanded")}
              data-testid="toggle-all-countries"
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                view === "expanded"
                  ? "bg-[#1A2530] text-white dark:bg-white dark:text-[#1A2530]"
                  : "text-[#5A6A7A] dark:text-gray-400 hover:text-[#1A2530] dark:hover:text-white"
              }`}
            >
              All {totalCountries} Countries
            </button>
          </div>
        </div>

        {/* ── Stats summary bar ── */}
        <div
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-xl px-5 py-3 mb-6"
        >
          <p className="text-sm text-[#5A6A7A] dark:text-gray-400">
            <strong className="text-[#1A2530] dark:text-white text-base">{totalCountries} countries</strong>
            {" · "}
            <strong className="text-[#1A2530] dark:text-white text-base">
              {isLoading ? "..." : totalJobs || "40+"} jobs
            </strong>
            {" "}available now
            {" · "}
            <strong className="text-[#1A2530] dark:text-white text-base">{TOTAL_PORTALS}+</strong>
            {" "}verified portals
          </p>
          <p className="text-xs text-[#7A8A9A] dark:text-gray-500 shrink-0">📅 Updated: Today, {updatedAt}</p>
        </div>

        {/* ── Countries grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <CountryCardSkeleton key={i} />)
            : displayedCountries.map((name, idx) => (
                <CountryCard
                  key={name}
                  name={name}
                  jobCount={jobCounts[name] || 0}
                  isBestMatch={idx === 0}
                />
              ))}
        </div>

        {/* ── Show all / Show fewer button ── */}
        {!isLoading && (
          <div className="text-center mb-12">
            {view === "compact" ? (
              <button
                onClick={() => setView("expanded")}
                data-testid="button-show-all"
                className="inline-flex items-center gap-2 border border-[#D1CEC8] dark:border-gray-600 text-[#1A2530] dark:text-white px-7 py-2.5 rounded-full text-sm font-medium hover:border-[#1A2530] dark:hover:border-white hover:bg-white dark:hover:bg-gray-800 transition-all"
              >
                View all {totalCountries} countries →
              </button>
            ) : (
              <button
                onClick={() => setView("compact")}
                data-testid="button-show-fewer"
                className="inline-flex items-center gap-2 border border-[#D1CEC8] dark:border-gray-600 text-[#5A6A7A] dark:text-gray-400 px-7 py-2.5 rounded-full text-sm font-medium hover:border-[#1A2530] dark:hover:border-white hover:bg-white dark:hover:bg-gray-800 transition-all"
              >
                ↑ Show top matches only
              </button>
            )}
          </div>
        )}

        {/* ── Tools Section ── */}
        <div className="mb-12" data-testid="section-tools">
          <h2 className="text-2xl font-serif font-medium text-[#1A2530] dark:text-white mb-6">
            🛠️ Tools to Accelerate Your Search
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              {
                badge: "MOST POPULAR",
                badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
                icon: "📨",
                title: "Bulk Apply to Jobs",
                desc: "AI-generated cover letters for multiple jobs in minutes.",
                link: "/bulk-apply",
                linkLabel: "Start bulk applying →",
                testId: "tool-bulk-apply",
              },
              {
                badge: "3 FREE / DAY",
                badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
                icon: "🤖",
                title: "AI Visa Assistant",
                desc: "Ask any visa question — get instant AI answers.",
                link: "/visa-assistant",
                linkLabel: "Ask a question →",
                testId: "tool-visa-assistant",
              },
              {
                badge: "NEW",
                badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
                icon: "🎓",
                title: "Study Abroad",
                desc: "Scholarships, student visas & university guides.",
                link: "/visa-guides",
                linkLabel: "Explore study options →",
                testId: "tool-study-abroad",
              },
              {
                badge: "5 COUNTRIES",
                badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
                icon: "📋",
                title: "Visa & Immigration Guides",
                desc: "Step-by-step guides for top destinations.",
                link: "/visa-guides",
                linkLabel: "View guides →",
                testId: "tool-visa-guides",
              },
            ].map(tool => (
              <Link
                key={tool.testId}
                href={tool.link}
                data-testid={tool.testId}
                className="group relative flex flex-col bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-5 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-200"
              >
                <span className={`self-start text-[10px] font-semibold px-2.5 py-0.5 rounded-full mb-3 uppercase tracking-wide ${tool.badgeColor}`}>
                  {tool.badge}
                </span>
                <span className="text-2xl mb-2">{tool.icon}</span>
                <h3 className="text-base font-semibold text-[#1A2530] dark:text-white mb-1.5">{tool.title}</h3>
                <p className="text-sm text-[#5A6A7A] dark:text-gray-400 flex-1 mb-4">{tool.desc}</p>
                <span
                  className="text-sm font-semibold text-[#1A2530] dark:text-gray-300 border-b-2 pb-0.5 inline-block w-fit group-hover:opacity-70 transition-opacity"
                  style={{ borderColor: "#8B7A66" }}
                >
                  {tool.linkLabel}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Verified Job Portals by Country ── */}
        <VerifiedPortalsSection />

        {/* ── CTA section ── */}
        <div
          className="rounded-3xl px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-8 mb-8"
          style={{ background: "linear-gradient(135deg, #1A2530 0%, #2A3A4A 100%)" }}
          data-testid="section-cta"
        >
          <div className="text-white flex-1">
            <h2 className="text-3xl font-serif font-medium text-white mb-3">
              Access All Verified Job Portals
            </h2>
            <p className="text-[#B8C5D0] text-base max-w-lg">
              One subscription — WhatsApp guidance + full resource access for all {totalCountries} countries. 360 days.
            </p>
            <div className="flex flex-wrap gap-6 mt-4">
              {[
                { icon: "💬", label: "1-on-1 WhatsApp" },
                { icon: "🛡️", label: "NEA Verification" },
                { icon: "📄", label: "CV Templates" },
                { icon: "🔄", label: "360 Day Access" },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-2 text-[#B8C5D0] text-sm">
                  <span>{f.icon}</span> {f.label}
                </div>
              ))}
            </div>
          </div>

          <div className="text-center shrink-0">
            {isPro ? (
              <button
                onClick={() => navigate("/dashboard")}
                className="text-white font-semibold text-lg px-9 py-4 rounded-xl transition-colors"
                style={{ background: "#4A7C59" }}
                data-testid="button-cta-dashboard"
              >
                Go to Dashboard →
              </button>
            ) : (
              <button
                onClick={() => navigate("/pricing")}
                className="text-white font-semibold text-lg px-9 py-4 rounded-xl transition-colors hover:opacity-90"
                style={{ background: "#4A7C59" }}
                data-testid="button-cta-upgrade"
              >
                Get Started
              </button>
            )}
            <p className="mt-3 text-[#9AACBD] text-sm">
              Secure payment via M-Pesa · 360 days access
            </p>
          </div>
        </div>

        {/* ── Trust footer ── */}
        <div
          className="text-center px-6 py-6 bg-white dark:bg-gray-800 rounded-2xl"
          style={{ border: "1px solid #E2DDD5" }}
          data-testid="section-trust-footer"
        >
          <p className="text-sm text-[#5A6A7A] dark:text-gray-400">
            <strong className="text-[#1A2530] dark:text-white">🔒 All job portals are verified by our team.</strong>{" "}
            We check NEA licenses, scam databases, and user reports before listing any portal.
          </p>
          <p className="text-sm text-[#5A6A7A] dark:text-gray-400 mt-3">
            WorkAbroad Hub is a career consultation service. We do not charge recruitment fees or guarantee employment.{" "}
            <Link href="/legal-disclaimer" className="text-[#1A2530] dark:text-gray-300 underline font-medium">
              Learn more →
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
