/**
 * /agencies-reported — public searchable directory of agencies reported
 * for recruitment fraud by the WorkAbroadHub community.
 *
 * Uses GET /api/agency-profiles (list) which only returns agencies with
 * at least one APPROVED report. Everything else stays private in the
 * moderation queue.
 *
 * Search: agency name substring, country filter, risk-band chip filter.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, ShieldAlert, AlertTriangle, Building2, Flag, Info } from "lucide-react";

interface AgencyListItem {
  slug: string;
  displayName: string;
  country: string | null;
  riskBand: "low" | "medium" | "high" | "critical";
  reportCount: number;
  approvedReportCount: number;
  totalReportedLossKes: number;
  lastReportAt: string | null;
}

const RISK_CHIP_STYLES = {
  low:      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  medium:   "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  high:     "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
} as const;

const RISK_LABELS = {
  low: "Low",
  medium: "Verify first",
  high: "Multiple reports",
  critical: "High risk",
} as const;

export default function AgenciesReportedIndex() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState<"" | "low" | "medium" | "high" | "critical">("");
  const [agencies, setAgencies] = useState<AgencyListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (search) params.set("q", search);
        if (countryFilter) params.set("country", countryFilter);
        if (riskFilter) params.set("risk", riskFilter);
        params.set("limit", "60");
        const res = await fetch(`/api/agency-profiles?${params.toString()}`);
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok) {
          setAgencies(data.agencies ?? []);
          setError(null);
        } else {
          setError("Could not load the directory.");
        }
      } catch {
        if (!cancelled) setError("Network error. Please refresh.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [search, countryFilter, riskFilter]);

  const totalStats = useMemo(() => {
    if (!agencies) return null;
    const reports = agencies.reduce((n, a) => n + (a.approvedReportCount || a.reportCount), 0);
    const loss = agencies.reduce((n, a) => n + (a.totalReportedLossKes || 0), 0);
    return { agencies: agencies.length, reports, loss };
  }, [agencies]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-semibold">
            <ShieldAlert className="h-3.5 w-3.5" /> FRAUD INTELLIGENCE DIRECTORY
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reported recruitment agencies</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-lg mx-auto leading-relaxed">
            Agencies, recruiters and websites the Kenyan community has flagged for suspected fraud. Every listing was reviewed by moderators before appearing here.
          </p>
        </div>

        {/* Stats row */}
        {totalStats && (
          <div className="grid grid-cols-3 gap-2">
            <Card><CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{totalStats.agencies}</p>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Agencies tracked</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{totalStats.reports}</p>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Community reports</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-extrabold text-red-600 dark:text-red-400">
                {totalStats.loss > 0 ? `KES ${(totalStats.loss / 1000).toFixed(0)}k` : "—"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Total reported loss</p>
            </CardContent></Card>
          </div>
        )}

        {/* Search + filters */}
        <Card>
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search agency name, recruiter, or website…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-11"
                data-testid="input-search-agency"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={riskFilter === ""} onClick={() => setRiskFilter("")}>All risks</FilterChip>
              {(["critical", "high", "medium", "low"] as const).map((r) => (
                <FilterChip key={r} active={riskFilter === r} onClick={() => setRiskFilter(r)}>
                  {RISK_LABELS[r]}
                </FilterChip>
              ))}
            </div>
            <Input
              placeholder="Country filter — e.g. Kenya, UAE, Saudi Arabia"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="h-10"
              data-testid="input-country-filter"
            />
          </CardContent>
        </Card>

        {/* Report CTA banner */}
        <Card className="border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/10">
          <CardContent className="pt-4 pb-4 flex items-start gap-3">
            <Flag className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Been scammed by an agency not listed here?</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Your report protects the next job seeker.</p>
            </div>
            <Button
              onClick={() => navigate("/report-scam")}
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white font-semibold flex-shrink-0"
              data-testid="button-report-new"
            >
              Report an agency
            </Button>
          </CardContent>
        </Card>

        {/* List */}
        {loading && (
          <div className="flex flex-col items-center py-12 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm">Loading community reports…</p>
          </div>
        )}
        {error && !loading && (
          <Card className="border-red-300 dark:border-red-900">
            <CardContent className="pt-6 pb-6 text-center">
              <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-gray-700 dark:text-gray-300">{error}</p>
            </CardContent>
          </Card>
        )}
        {!loading && !error && agencies?.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="pt-8 pb-8 text-center space-y-2">
              <Info className="h-8 w-8 text-gray-400 mx-auto" />
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {search || countryFilter || riskFilter
                  ? "No reported agencies match your filters. Try clearing them."
                  : "No published community reports yet. Be the first to help protect other Kenyans."}
              </p>
              {(search || countryFilter || riskFilter) && (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setCountryFilter(""); setRiskFilter(""); }}>
                  Clear filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}
        {!loading && agencies && agencies.length > 0 && (
          <div className="grid gap-2">
            {agencies.map((a) => (
              <button
                key={a.slug}
                onClick={() => navigate(`/agencies-reported/${a.slug}`)}
                className="text-left group"
                data-testid={`agency-card-${a.slug}`}
              >
                <Card className="hover:border-teal-500 dark:hover:border-teal-600 transition">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-gray-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400">
                            {a.displayName}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            {a.country || "Unknown country"} · {a.approvedReportCount || a.reportCount} report{(a.approvedReportCount || a.reportCount) === 1 ? "" : "s"}
                            {a.totalReportedLossKes > 0 && ` · KES ${(a.totalReportedLossKes / 1000).toFixed(0)}k reported loss`}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${RISK_CHIP_STYLES[a.riskBand]}`}>
                        {RISK_LABELS[a.riskBand].toUpperCase()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}

        {/* Legal footer */}
        <div className="bg-gray-100 dark:bg-gray-900 rounded-md p-3 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
            Community reports are allegations reviewed by our moderation team, not court findings. Always verify agencies through the Kenya National Employment Authority (neaims.nea.go.ke) before making decisions. For urgent fraud, contact Kenya DCI at reportscam@dci.go.ke.
          </p>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full font-semibold transition ${
        active
          ? "bg-teal-600 text-white"
          : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
