/**
 * /canada — Canada Express Entry + Jobs hub.
 *
 * Real production content built from shared/canada-immigration.ts:
 *   - 7 immigration programs (FSW, CEC, FST, PNP, AIP, RNIP, Caregiver)
 *   - 8 NOC categories with 45+ real NOC 2021 codes
 *   - Real ECA providers + fees
 *   - Verified job portals
 *   - Recent Express Entry draws
 *   - Working CRS calculator link
 *   - Fee estimate in KES
 *
 * 2026-06: built in response to user demand ("many clients are asking Canada
 * Express Entry and jobs in Canada").
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calculator, Briefcase, GraduationCap, Stethoscope, Wrench, Truck, Wheat,
  Users, Cpu, Globe, ExternalLink, CheckCircle2, AlertCircle, ArrowRight,
  TrendingUp, FileText, MapPin, Building2, Plane, Sparkles, ChevronRight,
} from "lucide-react";
import {
  CANADA_PROGRAMS, CANADA_FEES, NOC_CATEGORIES, ECA_PROVIDERS,
  CANADA_JOB_PORTALS, RECENT_DRAWS_SEED, estimateCanadaTotalCAD, cadToKes,
} from "@shared/canada-immigration";

const CAT_ICONS: Record<string, any> = {
  healthcare: Stethoscope,
  stem: Cpu,
  trades: Wrench,
  education: GraduationCap,
  transport: Truck,
  business: Briefcase,
  agriculture: Wheat,
  social: Users,
};

function fmtKes(n: number): string {
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `KES ${Math.round(n / 1000)}K`;
  return `KES ${n.toLocaleString("en-KE")}`;
}

interface DrawsResponse {
  draws: Array<{
    date: string; roundNumber: number; programType: string;
    invitationsIssued: number; crsCutoff: number; relative: string;
  }>;
}

export default function CanadaPage() {
  const [activeSection, setActiveSection] = useState<"overview" | "programs" | "jobs" | "costs" | "draws">("overview");

  const drawsQuery = useQuery<DrawsResponse>({
    queryKey: ["/api/canada/draws"],
    staleTime: 60_000,
  });

  const totalKes = useMemo(() => cadToKes(estimateCanadaTotalCAD()), []);
  const draws = drawsQuery.data?.draws ?? RECENT_DRAWS_SEED.slice(0, 6).map((d) => ({
    ...d,
    relative: "recent",
  }));

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Hero */}
      <div className="bg-gradient-to-br from-red-600 via-rose-600 to-red-700 text-white">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-3xl">🇨🇦</span>
            <Badge className="bg-white/20 text-white border-0">Express Entry + Jobs</Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            Move to Canada — for real.
          </h1>
          <p className="text-sm md:text-base text-red-50 max-w-2xl mb-5">
            Permanent residence in 6-18 months. Bring your family. Real IRCC fees, real CRS math,
            verified Government of Canada job portals — everything you need to start, in one place.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/canada/crs">
              <Button size="lg" className="bg-white text-red-700 hover:bg-red-50">
                <Calculator className="h-4 w-4 mr-2" />
                Score yourself — free
              </Button>
            </Link>
            <Link href="/canada/jobs">
              <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white/10">
                <Briefcase className="h-4 w-4 mr-2" />
                Verified Canadian jobs
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div className="border-b sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <div className="max-w-5xl mx-auto px-4 overflow-x-auto">
          <div className="flex gap-1 py-2 min-w-max">
            {([
              { key: "overview", label: "Overview" },
              { key: "programs", label: "7 Programs" },
              { key: "jobs",     label: "Find Jobs" },
              { key: "costs",    label: "Costs + Fees" },
              { key: "draws",    label: "Recent Draws" },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveSection(t.key)}
                className={`text-xs md:text-sm font-medium px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
                  activeSection === t.key
                    ? "bg-red-600 text-white"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                data-testid={`tab-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* OVERVIEW */}
        {activeSection === "overview" && (
          <>
            {/* Quick stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Avg processing</div>
                  <div className="text-xl font-bold">6 months</div>
                  <div className="text-[10px] text-muted-foreground">Once you get an ITA</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Total Kenya fees</div>
                  <div className="text-xl font-bold">{fmtKes(totalKes)}</div>
                  <div className="text-[10px] text-muted-foreground">Single applicant</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Recent draws</div>
                  <div className="text-xl font-bold">CRS 410-783</div>
                  <div className="text-[10px] text-muted-foreground">Across all categories</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Min IELTS</div>
                  <div className="text-xl font-bold">6.0 / CLB 7</div>
                  <div className="text-[10px] text-muted-foreground">All 4 abilities</div>
                </CardContent>
              </Card>
            </div>

            {/* The 4 steps */}
            <Card>
              <CardContent className="p-4">
                <h2 className="font-bold mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-red-600" />
                  How it works — 4 steps
                </h2>
                <div className="space-y-3">
                  {[
                    {
                      n: 1,
                      title: "Take IELTS General Training",
                      body: "Book at the British Council or IDP Nairobi. Aim for CLB 7+ (IELTS 6.0 in all 4 abilities) — language is the biggest CRS lever.",
                      cta: { href: "https://www.britishcouncil.co.ke/exam/ielts", label: "Book IELTS Nairobi" },
                    },
                    {
                      n: 2,
                      title: "Get your education assessed (ECA)",
                      body: "Send your Kenyan transcripts to WES Canada. 4-6 weeks, ~KES 27,000. Required for FSW.",
                      cta: { href: "https://www.wes.org/ca/", label: "Apply via WES" },
                    },
                    {
                      n: 3,
                      title: "Submit your Express Entry profile",
                      body: "Free to submit. You enter the pool with a CRS score. If your score matches a recent cutoff, you get an Invitation to Apply (ITA).",
                      cta: { href: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/submit-profile.html", label: "Start your profile" },
                    },
                    {
                      n: 4,
                      title: "Submit your PR application",
                      body: "After ITA you have 60 days to submit. IRCC promises a 6-month decision. Then book your flight.",
                      cta: { href: "/journey/CA", label: "Get the full roadmap" },
                    },
                  ].map((s) => (
                    <div key={s.n} className="flex gap-3 items-start">
                      <div className="shrink-0 w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-bold text-sm flex items-center justify-center">
                        {s.n}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">{s.title}</div>
                        <p className="text-xs text-muted-foreground mb-1">{s.body}</p>
                        {s.cta.href.startsWith("/") ? (
                          <Link href={s.cta.href}>
                            <a className="text-xs font-medium text-red-700 dark:text-red-300 hover:underline inline-flex items-center gap-1">
                              {s.cta.label} <ArrowRight className="h-3 w-3" />
                            </a>
                          </Link>
                        ) : (
                          <a
                            href={s.cta.href} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-medium text-red-700 dark:text-red-300 hover:underline inline-flex items-center gap-1"
                          >
                            {s.cta.label} <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* CTA card */}
            <Card className="border-2 border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Calculator className="h-6 w-6 text-red-600 shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-bold text-sm mb-1">
                      Will you get an ITA? Find out in 2 minutes.
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Our CRS calculator uses the official IRCC formula — age, education,
                      language, work experience, transferability. We compare your score to
                      the last 12 months of draws and tell you exactly what to improve.
                    </p>
                    <Link href="/canada/crs">
                      <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white">
                        Calculate my CRS score — free
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* NOC categories grid */}
            <div>
              <h2 className="font-bold mb-2 flex items-center gap-2">
                <Globe className="h-4 w-4 text-red-600" />
                Find your occupation (NOC 2021)
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                Canada invites people based on their occupation. Pick yours to see if it's
                in a recent category-based draw.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {NOC_CATEGORIES.map((cat) => {
                  const Icon = CAT_ICONS[cat.key] || Briefcase;
                  return (
                    <Link key={cat.key} href={`/canada/jobs?category=${cat.key}`}>
                      <a
                        className="block p-3 rounded-lg border hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50/40 dark:hover:bg-red-950/20 transition-colors"
                        data-testid={`category-${cat.key}`}
                      >
                        <Icon className="h-5 w-5 text-red-600 mb-2" />
                        <div className="font-bold text-xs">{cat.label}</div>
                      </a>
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* PROGRAMS */}
        {activeSection === "programs" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Canada has 7 main pathways for permanent residence. Most Kenyans use{" "}
              <strong>Federal Skilled Worker (FSW)</strong>. If you can secure a job offer, the
              Atlantic and PNP programs are faster.
            </p>
            {CANADA_PROGRAMS.map((p) => (
              <Card key={p.key} data-testid={`program-${p.key}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h3 className="font-bold text-base">{p.name}</h3>
                      <div className="text-xs text-muted-foreground">{p.fullName}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {p.processingMonths} mo
                    </Badge>
                  </div>
                  <p className="text-sm mb-2">{p.shortDescription}</p>
                  <div className="text-xs bg-muted/50 rounded-md p-2 mb-2">
                    <strong className="text-foreground">Best for you if:</strong>{" "}
                    <span className="text-muted-foreground">{p.whoForKenya}</span>
                  </div>

                  <div className="grid md:grid-cols-2 gap-2 my-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">Pros</div>
                      <ul className="text-xs space-y-1">
                        {p.pros.map((pr, i) => (
                          <li key={i} className="flex gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" /><span>{pr}</span></li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400 mb-1">Watch out</div>
                      <ul className="text-xs space-y-1">
                        {p.cons.map((c, i) => (
                          <li key={i} className="flex gap-1.5"><AlertCircle className="h-3 w-3 text-rose-600 shrink-0 mt-0.5" /><span>{c}</span></li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center text-xs">
                    <Badge variant="secondary">
                      Recent CRS: {p.recentCrsCutoffRange}
                    </Badge>
                    <a
                      href={p.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-red-700 dark:text-red-300 hover:underline inline-flex items-center gap-1"
                    >
                      Official IRCC page <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* JOBS */}
        {activeSection === "jobs" && (
          <>
            <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20">
              <CardContent className="p-4 text-sm">
                <strong>Start with Job Bank.</strong> The Government of Canada's official
                job board lets you filter for <em>LMIA-approved</em> jobs only — these are
                positions where the employer has already proven they need a foreign worker.
                That's the fastest path to a Canadian work permit.
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-3">
              {CANADA_JOB_PORTALS.map((portal) => (
                <Card key={portal.key} data-testid={`portal-${portal.key}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <h3 className="font-bold text-sm">{portal.name}</h3>
                          {portal.governmentRun && (
                            <Badge className="text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                              Government
                            </Badge>
                          )}
                          {portal.lmiaFilter && (
                            <Badge className="text-[9px] bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                              LMIA filter
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">{portal.description}</p>
                        <div className="text-[11px] bg-muted/60 rounded p-1.5 mb-2">
                          <strong>For Kenyans:</strong> {portal.bestFor}
                        </div>
                      </div>
                    </div>
                    <a
                      href={portal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-red-700 dark:text-red-300 hover:underline"
                      data-testid={`open-${portal.key}`}
                    >
                      Open portal <ExternalLink className="h-3 w-3" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Link href="/canada/jobs">
              <Button variant="outline" className="w-full">
                Open the full job portals page with NOC filter <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </>
        )}

        {/* COSTS */}
        {activeSection === "costs" && (
          <>
            <Card>
              <CardContent className="p-4">
                <h2 className="font-bold mb-1">Total cost from Kenya</h2>
                <div className="text-3xl font-bold text-red-700 dark:text-red-300 mb-1">
                  {fmtKes(totalKes)}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  ≈ {estimateCanadaTotalCAD()} CAD for a single applicant. Add 950 CAD per spouse + 260 CAD per child.
                </p>
                <p className="text-xs">
                  Plus <strong>proof of funds: KES 1.5M</strong> in your bank account
                  (required by FSW — settlement money you bring to Canada).
                </p>
              </CardContent>
            </Card>

            <div>
              <h3 className="font-bold mb-2">Fee breakdown</h3>
              <div className="space-y-2">
                {CANADA_FEES.map((fee) => (
                  <Card key={fee.key}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-bold text-sm">{fee.label}</h4>
                            {fee.required ? (
                              <Badge className="text-[9px] bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">Required</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px]">If applicable</Badge>
                            )}
                          </div>
                          {fee.notes && <p className="text-xs text-muted-foreground mt-0.5">{fee.notes}</p>}
                          {fee.url && (
                            <a
                              href={fee.url} target="_blank" rel="noopener noreferrer"
                              className="text-[11px] text-red-700 dark:text-red-300 hover:underline inline-flex items-center gap-1 mt-1"
                            >
                              Official link <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold tabular-nums">{fmtKes(cadToKes(fee.amountCAD))}</div>
                          <div className="text-[10px] text-muted-foreground">{fee.amountCAD} CAD</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-bold mb-2">ECA providers (pick one)</h3>
              <p className="text-xs text-muted-foreground mb-2">
                Your Kenyan education must be assessed by an IRCC-designated body. WES is the fastest for Kenyan transcripts.
              </p>
              <div className="grid md:grid-cols-2 gap-2">
                {ECA_PROVIDERS.map((p) => (
                  <Card key={p.key}>
                    <CardContent className="p-3">
                      <h4 className="font-bold text-sm mb-1">{p.name}</h4>
                      <div className="text-xs text-muted-foreground mb-1">{p.scope}</div>
                      <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                        <Badge variant="outline" className="text-[10px]">{fmtKes(cadToKes(p.feeCAD))}</Badge>
                        <Badge variant="outline" className="text-[10px]">{p.timelineWeeks} weeks</Badge>
                      </div>
                      <p className="text-xs">{p.bestFor}</p>
                      <a
                        href={p.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-bold text-red-700 dark:text-red-300 hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        Apply <ExternalLink className="h-3 w-3" />
                      </a>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}

        {/* DRAWS */}
        {activeSection === "draws" && (
          <>
            <Card>
              <CardContent className="p-4">
                <h2 className="font-bold mb-1">Recent Express Entry draws</h2>
                <p className="text-xs text-muted-foreground mb-3">
                  IRCC runs draws every 1-2 weeks. The CRS cutoff is the lowest score that got an
                  Invitation to Apply (ITA) in that round.{" "}
                  <strong>Healthcare and Trades</strong> draws have the lowest cutoffs.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-2 font-bold">Date</th>
                        <th className="py-2 px-2 font-bold">Category</th>
                        <th className="py-2 px-2 font-bold text-right">ITAs</th>
                        <th className="py-2 pl-2 font-bold text-right">CRS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draws.map((d) => (
                        <tr key={`${d.date}-${d.roundNumber}`} className="border-b last:border-0">
                          <td className="py-2 pr-2 whitespace-nowrap">{d.date}</td>
                          <td className="py-2 px-2">{d.programType}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{d.invitationsIssued.toLocaleString()}</td>
                          <td className="py-2 pl-2 text-right tabular-nums font-bold">
                            <span className={
                              d.crsCutoff < 450 ? "text-emerald-700 dark:text-emerald-400" :
                              d.crsCutoff < 530 ? "text-amber-700 dark:text-amber-400" :
                              "text-rose-700 dark:text-rose-400"
                            }>{d.crsCutoff}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Baseline data. For the latest round, see{" "}
                  <a
                    href="https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html"
                    target="_blank" rel="noopener noreferrer"
                    className="text-red-700 dark:text-red-300 hover:underline"
                  >
                    canada.ca Express Entry rounds
                  </a>.
                </p>
              </CardContent>
            </Card>

            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20">
              <CardContent className="p-4 text-sm">
                <strong>Reading the table:</strong> Healthcare cutoffs around 420-440 mean a nurse
                with CLB 9, a bachelor's, and 3 years' experience easily clears the bar. STEM
                cutoffs around 490 mean a software engineer needs CLB 9 + 3+ years + strong
                transferability. PNP cutoffs at 720+ mean the only way in via PNP is{" "}
                <em>with</em> a 600-point provincial nomination.
              </CardContent>
            </Card>
          </>
        )}

        {/* Floating CRS CTA at bottom */}
        <Card className="border-2 border-dashed border-red-300 dark:border-red-700">
          <CardContent className="p-4 flex items-center gap-3">
            <Calculator className="h-8 w-8 text-red-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">Know your CRS score in 2 minutes</div>
              <p className="text-xs text-muted-foreground">Working calculator with the official IRCC formula.</p>
            </div>
            <Link href="/canada/crs">
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white shrink-0">
                Start <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
