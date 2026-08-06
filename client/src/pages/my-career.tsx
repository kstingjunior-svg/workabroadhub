/**
 * /my-career — Phase 3 MY CAREER dashboard
 *
 * Consolidated career stats page. Renders 6 headline tiles + a recent
 * applications tracker table. Data source: GET /api/me/career-overview.
 *
 * The page is fully additive — it doesn't replace any existing page. Users
 * can still visit /my-documents, /my-orders, /kenya-careers/my-applications
 * for the drill-down views; this is the birds-eye consolidation.
 *
 * 2026-08 Phase 3.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  Target,
  Award,
  Trophy,
  Globe,
  FileText,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Calendar,
  MapPin,
  BadgeCheck,
} from "lucide-react";
import { SeoHead } from "@/components/seo-head";

interface CareerStats {
  applications: number;
  cvScore:      number | null;
  interviews:   number;
  offers:       number;
  countries:    number;
  cvRevamps:    number;
}

interface RecentApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  companyVerified: boolean;
  status: string;
  appliedAt: string;
  county: string | null;
  town: string | null;
}

interface OverviewResponse {
  stats: CareerStats;
  recentApplications: RecentApplication[];
}

function statusPill(status: string) {
  const s = status.toLowerCase();
  if (["hired", "offer", "accepted"].includes(s))
    return "border-emerald-300 text-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-700";
  if (["shortlisted", "interviewing", "interview_scheduled"].includes(s))
    return "border-blue-300 text-blue-800 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700";
  if (["rejected", "closed"].includes(s))
    return "border-rose-300 text-rose-800 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-700";
  return "border-amber-300 text-amber-800 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700";
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  href,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  accent: string;
}) {
  const body = (
    <Card className={`hover:shadow-md transition-shadow ${href ? "cursor-pointer" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-3xl font-black mt-1 ${accent}`}>{value}</p>
            {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${accent.replace("text-", "bg-").replace("-600", "-100")} dark:bg-opacity-20`}>
            <Icon className={`h-5 w-5 ${accent}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function MyCareer() {
  const { user, isLoading: authLoading } = useAuth();

  const { data, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ["/api/me/career-overview"],
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <Trophy className="h-12 w-12 text-blue-600 mx-auto" />
            <h1 className="text-xl font-bold">My Career Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to see your applications, CV scores, interviews and offers all in one place.
            </p>
            <Link href="/api/login">
              <Button className="w-full">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = data?.stats ?? {
    applications: 0,
    cvScore: null,
    interviews: 0,
    offers: 0,
    countries: 0,
    cvRevamps: 0,
  };
  const apps = data?.recentApplications ?? [];

  return (
    <div className="min-h-screen bg-muted/20">
      <SeoHead
        title="My Career — WorkAbroad Hub"
        description="Your career at a glance: applications, CV scores, interviews, offers, and country reach — all in one dashboard."
      />

      {/* Header */}
      <div className="bg-gradient-to-br from-blue-900 to-blue-800 text-white">
        <div className="max-w-5xl mx-auto p-4 sm:p-6">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 mb-3">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">My Career</h1>
              <p className="text-sm text-blue-100">Applications, CV performance, and interview progress — all in one place.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Couldn't load your career overview. Please refresh.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stat tiles */}
        {!isLoading && !error && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatTile
                icon={Briefcase}
                label="Applications"
                value={stats.applications}
                href="/kenya-careers/my-applications"
                accent="text-blue-600"
              />
              <StatTile
                icon={Target}
                label="CV Score"
                value={stats.cvScore ?? "—"}
                hint={stats.cvScore != null ? "Highest ATS score" : "Run an ATS check"}
                href="/tools/ats-cv-checker"
                accent={
                  stats.cvScore == null ? "text-slate-500" :
                  stats.cvScore >= 68 ? "text-emerald-600" : "text-amber-600"
                }
              />
              <StatTile
                icon={Award}
                label="Interviews"
                value={stats.interviews}
                hint={stats.interviews === 0 ? "None yet" : undefined}
                accent="text-violet-600"
              />
              <StatTile
                icon={Trophy}
                label="Offers"
                value={stats.offers}
                hint={stats.offers === 0 ? "Keep applying" : "Well done!"}
                accent="text-emerald-600"
              />
              <StatTile
                icon={Globe}
                label="Countries"
                value={stats.countries}
                hint="Distinct destinations"
                accent="text-teal-600"
              />
              <StatTile
                icon={FileText}
                label="CV Revamps"
                value={stats.cvRevamps}
                href="/my-documents"
                accent="text-orange-600"
              />
            </div>

            {/* Application tracker */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-blue-600" />
                    Recent Applications
                    {apps.length > 0 && (
                      <Badge variant="outline" className="ml-1 text-xs">{apps.length}</Badge>
                    )}
                  </CardTitle>
                  {apps.length > 0 && (
                    <Link href="/kenya-careers/my-applications">
                      <Button variant="ghost" size="sm" className="text-xs">
                        See all <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {apps.length === 0 ? (
                  <div className="text-center py-8 space-y-3">
                    <Briefcase className="h-10 w-10 text-muted-foreground/50 mx-auto" />
                    <div>
                      <p className="text-sm font-medium">No applications yet</p>
                      <p className="text-xs text-muted-foreground">Browse Kenya jobs and start applying — your progress will show up here.</p>
                    </div>
                    <Link href="/kenya-careers">
                      <Button size="sm" className="mt-2">
                        Browse jobs <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {apps.map((a) => (
                      <Link key={a.id} href={`/kenya-careers/job/${a.jobId}`}>
                        <div className="border rounded-lg p-3 hover:bg-muted/30 transition-colors cursor-pointer">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="font-semibold text-sm truncate">{a.jobTitle}</h4>
                                {a.companyVerified && (
                                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {a.companyName}
                                {(a.county || a.town) && (
                                  <>
                                    {" · "}
                                    <MapPin className="inline h-2.5 w-2.5 mr-0.5" />
                                    {[a.town, a.county].filter(Boolean).join(", ")}
                                  </>
                                )}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                                <Calendar className="h-2.5 w-2.5" />
                                {new Date(a.appliedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                            </div>
                            <Badge variant="outline" className={`${statusPill(a.status)} shrink-0 capitalize`}>
                              {a.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick actions */}
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Quick actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Link href="/tools/ats-cv-checker">
                    <Button variant="outline" size="sm" className="w-full">
                      <Target className="h-3.5 w-3.5 mr-1.5" /> Check my CV
                    </Button>
                  </Link>
                  <Link href="/kenya-careers">
                    <Button variant="outline" size="sm" className="w-full">
                      <Briefcase className="h-3.5 w-3.5 mr-1.5" /> Browse jobs
                    </Button>
                  </Link>
                  <Link href="/services">
                    <Button variant="outline" size="sm" className="w-full">
                      <FileText className="h-3.5 w-3.5 mr-1.5" /> Revamp CV
                    </Button>
                  </Link>
                  <Link href="/my-documents">
                    <Button variant="outline" size="sm" className="w-full">
                      <FileText className="h-3.5 w-3.5 mr-1.5" /> My documents
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
