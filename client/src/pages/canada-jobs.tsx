/**
 * /canada/jobs — Verified Canadian job portals + NOC 2021 occupation finder.
 *
 * Two side-by-side tools:
 *   1. NOC finder — search/filter the 45+ NOC codes most relevant to Kenyans.
 *      Tells you if your occupation was in a recent category-based draw.
 *   2. Portal list — verified Canadian job boards with deep links and Kenyan-
 *      specific guidance. Job Bank (Government of Canada) is highlighted as
 *      the LMIA-friendly starting point.
 *
 * No mockup — every portal is a real, currently-operating Canadian job board.
 *
 * 2026-06: production Canada hub.
 */
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Briefcase, Search, ArrowLeft, ExternalLink, Stethoscope, Cpu, Wrench,
  GraduationCap, Truck, Wheat, Users, MapPin, ShieldCheck, Globe, Sparkles,
} from "lucide-react";
import {
  NOC_OCCUPATIONS, NOC_CATEGORIES, CANADA_JOB_PORTALS,
} from "@shared/canada-immigration";
import { ProOnlyGate } from "@/components/pro-only-gate";

const CAT_ICONS: Record<string, any> = {
  healthcare: Stethoscope, stem: Cpu, trades: Wrench, education: GraduationCap,
  transport: Truck, business: Briefcase, agriculture: Wheat, social: Users,
};

const PORTAL_CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  healthcare: "Healthcare",
  tech: "Tech",
  trades: "Trades",
  atlantic: "Atlantic Canada",
  newcomer: "Newcomer-focused",
};

export default function CanadaJobsPage() {
  return (
    <ProOnlyGate
      featureName="🇨🇦 Canadian Jobs"
      pitch="14 verified Canadian job boards plus the official NOC 2021 finder. Job Bank's LMIA filter shows employers ready to sponsor you — work permit, then PR."
      bullets={[
        "Government of Canada Job Bank with LMIA-only filter (jobs where employers ALREADY have permission to hire foreigners)",
        "45+ NOC 2021 codes searchable by title, code, or category — flagged when in recent draws",
        "13 other verified portals: Indeed Canada, LinkedIn, Magnet (newcomer-focused), CareerBeacon (Atlantic), HealthCareCAN, more",
        "Kenya-specific guidance on each portal — what filters to use, what to avoid",
      ]}
      returnTo="/canada/jobs"
    >
      <CanadaJobsPageContent />
    </ProOnlyGate>
  );
}

function CanadaJobsPageContent() {
  const [location] = useLocation();
  const initialCategory = new URLSearchParams(location.split("?")[1] || "").get("category") || "";

  const [nocSearch, setNocSearch] = useState("");
  const [nocCategory, setNocCategory] = useState<string>(initialCategory);
  const [portalCategory, setPortalCategory] = useState<string>("");

  const filteredNoc = useMemo(() => {
    const q = nocSearch.trim().toLowerCase();
    return NOC_OCCUPATIONS.filter((noc) => {
      if (nocCategory && noc.category !== nocCategory) return false;
      if (q && !noc.title.toLowerCase().includes(q) && !noc.code.includes(q)) return false;
      return true;
    });
  }, [nocSearch, nocCategory]);

  const filteredPortals = useMemo(() => {
    return portalCategory
      ? CANADA_JOB_PORTALS.filter((p) => p.category === portalCategory)
      : CANADA_JOB_PORTALS;
  }, [portalCategory]);

  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="bg-gradient-to-br from-red-600 to-rose-700 text-white">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <Link href="/canada">
            <a className="text-xs text-red-100 hover:text-white inline-flex items-center gap-1 mb-2">
              <ArrowLeft className="h-3 w-3" /> Back to Canada hub
            </a>
          </Link>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-5 w-5" /> Canadian Jobs
          </h1>
          <p className="text-xs md:text-sm text-red-50 mt-1">
            Find your NOC code, then start applying on verified Canadian job boards.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-6">
        {/* ──── Job Bank highlight ─────────────────────────────────────── */}
        <Card className="border-2 border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-8 w-8 text-emerald-700 dark:text-emerald-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <h2 className="font-bold text-base">Start with Job Bank</h2>
                  <Badge className="text-[10px] bg-emerald-700 text-white">
                    Government of Canada
                  </Badge>
                </div>
                <p className="text-xs text-foreground/80 mb-3">
                  Job Bank lets you filter for <strong>LMIA-approved jobs only</strong> — these
                  are positions where the employer has already proven they need a foreign worker.
                  That's the fastest path to a Canadian work permit, and the most reliable place
                  to start as a Kenyan applicant.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="https://www.jobbank.gc.ca/jobsearch/jobsearch?fsrc=32&lang=en"
                    target="_blank" rel="noopener noreferrer"
                  >
                    <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white">
                      LMIA-only jobs <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </a>
                  <a
                    href="https://www.jobbank.gc.ca/jobsearch/jobsearch?lang=en"
                    target="_blank" rel="noopener noreferrer"
                  >
                    <Button size="sm" variant="outline">
                      All Job Bank jobs <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ──── NOC Finder ───────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-bold">Find your NOC 2021 code</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Canada classifies every job by NOC code. Pick yours to see if it qualifies
            for a category-based Express Entry draw (lower CRS cutoffs).
          </p>

          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title or code (e.g. nurse, 21231)"
                value={nocSearch}
                onChange={(e) => setNocSearch(e.target.value)}
                className="pl-8"
                data-testid="input-noc-search"
              />
            </div>
            <select
              value={nocCategory}
              onChange={(e) => setNocCategory(e.target.value)}
              className="text-sm rounded-md border border-input bg-background px-3 py-2"
              data-testid="select-noc-category"
            >
              <option value="">All categories</option>
              {NOC_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Category quick-pills */}
          <div className="flex flex-wrap gap-1 mb-3">
            <button
              onClick={() => setNocCategory("")}
              className={`text-[11px] px-2.5 py-1 rounded-full border ${
                nocCategory === "" ? "bg-red-600 text-white border-red-600" : "hover:bg-muted"
              }`}
            >
              All
            </button>
            {NOC_CATEGORIES.map((c) => {
              const Icon = CAT_ICONS[c.key];
              return (
                <button
                  key={c.key}
                  onClick={() => setNocCategory(c.key)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border inline-flex items-center gap-1 ${
                    nocCategory === c.key ? "bg-red-600 text-white border-red-600" : "hover:bg-muted"
                  }`}
                  data-testid={`pill-noc-${c.key}`}
                >
                  {Icon && <Icon className="h-3 w-3" />} {c.label}
                </button>
              );
            })}
          </div>

          <div className="text-xs text-muted-foreground mb-2">
            Showing <strong>{filteredNoc.length}</strong> occupation{filteredNoc.length === 1 ? "" : "s"}
          </div>

          <div className="grid md:grid-cols-2 gap-2">
            {filteredNoc.map((noc) => {
              const Icon = CAT_ICONS[noc.category] || Briefcase;
              return (
                <Card key={noc.code} data-testid={`noc-${noc.code}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <Icon className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">NOC {noc.code}</span>
                          <Badge variant="outline" className="text-[9px]">TEER {noc.teer}</Badge>
                          {noc.recentCategoryDraw && (
                            <Badge className="text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                              {noc.recentCategoryDraw} draw
                            </Badge>
                          )}
                        </div>
                        <div className="font-bold text-sm mt-0.5 leading-tight">{noc.title}</div>
                        <a
                          href={`https://noc.esdc.gc.ca/Structure/NocProfile?objectid=${noc.code}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-red-700 dark:text-red-300 hover:underline inline-flex items-center gap-1 mt-1"
                        >
                          Official NOC description <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredNoc.length === 0 && (
            <Card><CardContent className="p-4 text-xs text-muted-foreground text-center">
              No occupations match your search. Try a broader term or clear the filter.
            </CardContent></Card>
          )}
        </section>

        {/* ──── Portals ──────────────────────────────────────────────── */}
        <section className="border-t pt-6">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-bold">Verified job portals ({CANADA_JOB_PORTALS.length})</h2>
          </div>

          <div className="flex flex-wrap gap-1 mb-3">
            <button
              onClick={() => setPortalCategory("")}
              className={`text-[11px] px-2.5 py-1 rounded-full border ${
                portalCategory === "" ? "bg-red-600 text-white border-red-600" : "hover:bg-muted"
              }`}
            >
              All ({CANADA_JOB_PORTALS.length})
            </button>
            {Object.entries(PORTAL_CATEGORY_LABELS).map(([key, label]) => {
              const count = CANADA_JOB_PORTALS.filter((p) => p.category === key).length;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setPortalCategory(key)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border ${
                    portalCategory === key ? "bg-red-600 text-white border-red-600" : "hover:bg-muted"
                  }`}
                  data-testid={`pill-portal-${key}`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>

          <div className="grid md:grid-cols-2 gap-2">
            {filteredPortals.map((portal) => (
              <Card key={portal.key} data-testid={`portal-${portal.key}`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
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
                    {portal.freeToUse && (
                      <Badge variant="outline" className="text-[9px]">Free</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{portal.description}</p>
                  <div className="text-[11px] bg-muted/60 rounded p-1.5 mb-2">
                    <strong>For Kenyans:</strong> {portal.bestFor}
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
        </section>

        {/* Bottom CTAs */}
        <div className="border-t pt-4 flex flex-wrap gap-2">
          <Link href="/canada/crs">
            <Button variant="outline">
              Calculate your CRS score
            </Button>
          </Link>
          <Link href="/canada">
            <Button variant="outline">
              Back to Canada hub
            </Button>
          </Link>
          <Link href="/journey/CA">
            <Button className="bg-red-600 hover:bg-red-700 text-white">
              Full Canada roadmap
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
