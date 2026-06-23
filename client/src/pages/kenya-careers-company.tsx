/**
 * /kenya-careers/company/:slug — Company profile page (Phase 3 expansion).
 *
 * 2026-06: shows everything about an employer in one place — logo, industry,
 * description, headquarters, counties served, all branches, all open jobs.
 * Includes the honest "Sample listings — not yet onboarded" disclosure when
 * every job is a seed, and a prominent "Claim this profile" CTA so real
 * HR managers can take over.
 *
 * Loaded by `/kenya-careers/company/:slug` (slug or UUID accepted).
 */
import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft, BadgeCheck, Briefcase, MapPin, Globe, Building2, Loader2,
  AlertCircle, ChevronRight, Users, ExternalLink, Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/kenya-careers-company-logo";
import { KenyaCareersClaimSheet } from "@/components/kenya-careers-claim-sheet";
import { KenyaFlag, KenyaFlagStripe } from "@/components/kenya-flag";

interface CompanyDetail {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  industry: string | null;
  description: string | null;
  website: string | null;
  headquarters: { county: string | null; address: string | null };
  verified: boolean;
  allJobsAreSeed: boolean;
  realJobCount: number;
  countiesServed: string[];
  branches: { id: string; name: string; county: string | null; town: string | null; location: string | null }[];
  jobs: {
    id: string; title: string; department: string | null; vacancies: number;
    employmentType: string | null;
    salaryMin: number | null; salaryMax: number | null;
    county: string | null; town: string | null;
    experienceLevel: string | null; category: string | null;
    deadline: string | null; createdAt: string; isSeed: boolean;
    branch: { id: string; name: string } | null;
  }[];
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: "Full-time", part_time: "Part-time", contract: "Contract",
  internship: "Internship", casual: "Casual",
};

function formatSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) return `KES ${min.toLocaleString()}–${max.toLocaleString()}`;
  return `KES ${(min ?? max)!.toLocaleString()}+`;
}

export default function KenyaCareersCompany() {
  const [, params] = useRoute<{ slug: string }>("/kenya-careers/company/:slug");
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);

  useEffect(() => {
    if (!params?.slug) return;
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/local-jobs/companies/${encodeURIComponent(params.slug)}`, { signal: ac.signal });
        if (res.status === 404) {
          if (!cancelled) { setError("This company isn't on our platform yet."); setLoading(false); }
          return;
        }
        const ct = res.headers.get("content-type") || "";
        if (!res.ok || !ct.includes("application/json")) {
          if (!cancelled) { setError("Could not load this company right now."); setLoading(false); }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        // Defensive shape coercion so any missing field can't crash the render
        setCompany({
          id:          String(data?.id ?? ""),
          name:        String(data?.name ?? "Employer"),
          slug:        data?.slug ?? null,
          logoUrl:     data?.logoUrl ?? null,
          industry:    data?.industry ?? null,
          description: data?.description ?? null,
          website:     data?.website ?? null,
          headquarters: {
            county:  data?.headquarters?.county ?? null,
            address: data?.headquarters?.address ?? null,
          },
          verified:       !!data?.verified,
          allJobsAreSeed: data?.allJobsAreSeed !== false,   // default to true for safety
          realJobCount:   Number(data?.realJobCount ?? 0),
          countiesServed: Array.isArray(data?.countiesServed) ? data.countiesServed : [],
          branches:       Array.isArray(data?.branches) ? data.branches : [],
          jobs:           Array.isArray(data?.jobs) ? data.jobs : [],
        });
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Could not load this company.");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [params?.slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading company…
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="max-w-2xl mx-auto">
          <Link href="/kenya-careers">
            <Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Kenya Careers</Button>
          </Link>
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
              <h2 className="font-semibold mb-1">Company unavailable</h2>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Link href="/kenya-careers"><Button>Browse all employers</Button></Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header ribbon */}
      <div className="relative bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white px-4 pt-4 pb-12">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/kenya-careers">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> All Kenya Careers
            </Button>
          </Link>
          {/* Small Kenya flag in the header — present but unobtrusive */}
          <KenyaFlag size="md" />
        </div>
        {/* Kenyan-flag accent stripe along the bottom of the ribbon */}
        <div className="absolute bottom-0 left-0 right-0">
          <KenyaFlagStripe height={3} withFimbriations />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-8">
        {/* Hero card with logo + name + verification */}
        <Card className="shadow-md">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <CompanyLogo name={company.name} logoUrl={company.logoUrl} size="xl" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold leading-tight">{company.name}</h1>
                  {company.verified && (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                      <BadgeCheck className="h-3.5 w-3.5 mr-0.5" /> Verified employer
                    </Badge>
                  )}
                </div>
                {company.industry && (
                  <p className="text-sm text-muted-foreground mt-1">{company.industry}</p>
                )}
                {company.headquarters.county && (
                  <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Headquarters: {company.headquarters.county}
                  </p>
                )}
              </div>
            </div>

            {/* Honest sample-listings disclosure for unclaimed companies */}
            {company.allJobsAreSeed && (
              <div className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-300 dark:ring-amber-800 p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
                      Sample profile — {company.name} hasn't claimed this page yet
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                      These are illustrative listings showing what roles at {company.name} typically look like. Real openings will appear here once {company.name} claims this profile and starts posting.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Headline counts */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                <strong className="text-foreground">{company.jobs.length}</strong>
                {" "}listing{company.jobs.length === 1 ? "" : "s"}
                {company.realJobCount > 0 && (
                  <span className="text-emerald-700 dark:text-emerald-300">
                    {" "}({company.realJobCount} real)
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                <strong className="text-foreground">{company.branches.length}</strong>
                {" "}branch{company.branches.length === 1 ? "" : "es"}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                <strong className="text-foreground">{company.countiesServed.length}</strong>
                {" "}count{company.countiesServed.length === 1 ? "y" : "ies"}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {company.website && (
                <Button asChild variant="outline" size="sm">
                  <a href={company.website} target="_blank" rel="noopener noreferrer">
                    <Globe className="h-3.5 w-3.5 mr-1.5" />
                    Visit website <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => setClaimOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="btn-claim-company-from-profile"
              >
                Are you {company.name}? Claim this profile
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* About */}
        {company.description && (
          <Card className="mt-4">
            <CardContent className="p-5">
              <h2 className="font-semibold mb-2">About {company.name}</h2>
              <p className="text-sm leading-relaxed text-foreground/90">{company.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Counties served */}
        {company.countiesServed.length > 0 && (
          <Card className="mt-4">
            <CardContent className="p-5">
              <h2 className="font-semibold mb-2 flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> Counties served
              </h2>
              <div className="flex flex-wrap gap-2">
                {company.countiesServed.map((c) => (
                  <Link key={c} href={`/kenya-careers?county=${encodeURIComponent(c)}`}>
                    <Badge variant="outline" className="cursor-pointer hover:border-emerald-400">
                      {c}
                    </Badge>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Branches */}
        {company.branches.length > 0 && (
          <Card className="mt-4">
            <CardContent className="p-5">
              <h2 className="font-semibold mb-3 flex items-center gap-1.5">
                <Building2 className="h-4 w-4" /> Branches ({company.branches.length})
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {company.branches.map((b) => (
                  <li key={b.id} className="text-sm">
                    <p className="font-medium">{b.name}</p>
                    {(b.town || b.county) && (
                      <p className="text-xs text-muted-foreground">
                        {[b.town, b.county].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Open jobs */}
        <Card className="mt-4">
          <CardContent className="p-5">
            <h2 className="font-semibold mb-3 flex items-center gap-1.5">
              <Briefcase className="h-4 w-4" /> Open positions ({company.jobs.length})
            </h2>
            {company.jobs.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No open positions right now.</p>
                <p className="text-xs mt-1">Be the first to know when {company.name} posts — tap "Claim this profile" above.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {company.jobs.map((j) => (
                  <li key={j.id}>
                    <Link href={`/kenya-careers/job/${j.id}`}>
                      <div className="flex items-start justify-between gap-3 p-3 -mx-3 rounded-lg hover:bg-muted/40 cursor-pointer" data-testid={`profile-job-${j.id}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-medium text-sm">{j.title}</p>
                            {j.isSeed && (
                              <span className="text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-1.5 py-0.5 rounded uppercase tracking-wide ring-1 ring-amber-300 dark:ring-amber-800">
                                Sample
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                            {j.branch && <span>{j.branch.name}</span>}
                            {(j.county || j.town) && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {[j.town, j.county].filter(Boolean).join(", ")}
                              </span>
                            )}
                            {j.employmentType && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="h-3 w-3" />
                                {EMPLOYMENT_LABEL[j.employmentType] ?? j.employmentType}
                              </span>
                            )}
                            {j.vacancies > 1 && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" /> {j.vacancies} positions
                              </span>
                            )}
                            {formatSalary(j.salaryMin, j.salaryMax) && (
                              <span className="font-medium text-emerald-700 dark:text-emerald-300">
                                {formatSalary(j.salaryMin, j.salaryMax)}
                              </span>
                            )}
                            {j.deadline && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Apply by {new Date(j.deadline).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Bottom claim CTA — repeats the prompt so HR managers who scroll always see it */}
        <Card className="mt-4 border-dashed bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-300 dark:border-emerald-800">
          <CardContent className="p-5 text-center">
            <Building2 className="h-8 w-8 text-emerald-700 dark:text-emerald-300 mx-auto mb-2" />
            <h3 className="font-semibold">Work at {company.name}?</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              Claim this profile to take over the listings and post real openings directly.
            </p>
            <Button
              onClick={() => setClaimOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Claim {company.name}
            </Button>
          </CardContent>
        </Card>
      </div>

      <KenyaCareersClaimSheet
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        companyId={company.id}
        companyName={company.name}
      />
    </div>
  );
}
