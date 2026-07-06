/**
 * Landing-page NEA agency verification widget.
 *
 * Replaces the static "sample agency" card with a real, server-backed
 * search box. Hitting /api/nea-agencies?search=<query> returns matching
 * rows from the live 1,293-agency table; we render the first match with
 * a clear ACTIVE / EXPIRED / REVOKED badge.
 *
 * Strategic role:
 *   This widget IS the landing page's primary conversion hook. The
 *   "verify before you pay" framing turns a passive marketing page into
 *   an active tool. Users land → type an agency name → see a real result
 *   → trust the platform. That's the single strongest reason to come back.
 *
 * Visual treatment:
 *   • Soft elevated card with rounded corners (no harsh borders)
 *   • Green pill stats row underneath (495 active · 798 expired · 1,293 total)
 *   • Green CTA button (matches the "safe agency" framing)
 *   • Red border + warning copy when the searched agency is expired/revoked
 */
import { useState, useEffect } from "react";
import { Search, Shield, AlertTriangle, CheckCircle2, Database, Loader2, XCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface Agency {
  id: string;
  // DB column is `agency_name` → API serializes as `agencyName`
  agencyName: string;
  licenseNumber?: string | null;
  // The DB has NO `status` column — status is computed:
  //   1) if statusOverride is set, use that (admin override)
  //   2) else if expiryDate is in the past → expired
  //   3) else → active/licensed
  statusOverride?: string | null;
  isPublished?: boolean;
  expiryDate?: string | null;
  issueDate?: string | null;
  email?: string | null;
  website?: string | null;
  country?: string | null;
}

interface PublicStats {
  totalAgencies?: number;
  expiredAgencies?: number;
}

function statusBadge(statusOverride: string | null | undefined, expiryDate: string | null | undefined) {
  // The NEA database has NO `status` field. Compute it:
  //   1. If statusOverride is set, admin has marked the agency manually
  //      (e.g. "suspended", "revoked", "verified"). Use that as the truth.
  //   2. Otherwise the status is purely a function of expiryDate:
  //        expiryDate < today  → EXPIRED  (red)
  //        expiryDate >= today → ACTIVE & LICENSED  (green)
  //   3. Only fall through to "UNKNOWN" if expiryDate is missing entirely.
  const override = (statusOverride ?? "").trim().toLowerCase();
  const now = Date.now();
  const expiryTime = expiryDate ? new Date(expiryDate).getTime() : null;
  const hasExpiry = expiryTime !== null && !isNaN(expiryTime);
  const isExpiredByDate = hasExpiry && expiryTime! < now;
  const isValidByDate = hasExpiry && expiryTime! >= now;

  // Admin overrides take precedence
  if (override === "revoked")   return { kind: "danger"  as const, label: "REVOKED",   icon: XCircle };
  if (override === "suspended") return { kind: "danger"  as const, label: "SUSPENDED", icon: AlertTriangle };
  if (override === "verified")  return { kind: "ok"      as const, label: "VERIFIED",  icon: CheckCircle2 };
  if (override === "blacklisted") return { kind: "danger" as const, label: "BLACKLISTED", icon: XCircle };

  // Time-based status (the standard case for most agencies)
  if (isExpiredByDate)  return { kind: "danger" as const, label: "EXPIRED",            icon: AlertTriangle };
  if (isValidByDate)    return { kind: "ok"     as const, label: "ACTIVE & LICENSED",  icon: CheckCircle2 };

  // No expiry date AND no override → truly unknown
  return { kind: "neutral" as const, label: "STATUS UNKNOWN", icon: Shield };
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

export function LandingNeaSearch() {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState(""); // committed on Verify click / Enter
  const [hasSearched, setHasSearched] = useState(false);

  // Live platform stats — same source as the live activity strip
  const { data: stats } = useQuery<PublicStats>({
    queryKey: ["/api/public/stats"],
    staleTime: 60_000,
  });

  // Agency search — only fires once the user clicks Verify (activeQuery set)
  const { data: agencies, isLoading: searching, isError } = useQuery<Agency[]>({
    queryKey: ["/api/nea-agencies", activeQuery],
    enabled: activeQuery.length > 1,
    queryFn: async () => {
      const res = await fetch(`/api/nea-agencies?search=${encodeURIComponent(activeQuery)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to verify");
      return res.json();
    },
    staleTime: 30_000,
  });

  const firstMatch = agencies?.[0];
  const matchCount = agencies?.length ?? 0;

  function runVerify() {
    const v = query.trim();
    if (!v) return;
    setActiveQuery(v);
    setHasSearched(true);
  }

  // Auto-run a demo on first mount so the widget isn't empty
  useEffect(() => {
    const demoTimer = window.setTimeout(() => {
      if (!hasSearched && !query) {
        setQuery("ABC");
        setActiveQuery("ABC");
      }
    }, 800);
    return () => window.clearTimeout(demoTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badge = firstMatch
    ? statusBadge(firstMatch.statusOverride, firstMatch.expiryDate)
    : null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-emerald-100 dark:border-emerald-900/30 overflow-hidden">
      {/* Header strip */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 px-6 py-4 border-b border-emerald-100 dark:border-emerald-900/30">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
          <h3 className="font-bold text-lg text-emerald-900 dark:text-emerald-100">Verify any agency before you pay</h3>
        </div>
        <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80 mt-1">
          Live NEAIMS-registry check · Updated daily
        </p>
      </div>

      {/* Search input */}
      <div className="px-6 py-5 space-y-3">
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide block">
          Agency name or license number
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runVerify(); }}
            placeholder="e.g. ABC Recruitment Ltd. or RA/2024/01/123"
            className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none transition-colors text-sm bg-white dark:bg-gray-800"
            data-testid="input-nea-search"
            aria-label="Search NEAIMS-registered agencies"
          />
          <button
            onClick={runVerify}
            disabled={searching || !query.trim()}
            className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 dark:disabled:bg-emerald-900/50 text-white font-bold text-sm transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm"
            data-testid="button-nea-verify"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Verify
          </button>
        </div>

        {/* Result card — three states: loading, found, not-found / error */}
        {activeQuery && (
          <div className="pt-2">
            {searching ? (
              <div className="text-center py-6 text-gray-500 text-sm">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Checking the NEAIMS registry…
              </div>
            ) : isError ? (
              <div className="rounded-xl p-4 bg-rose-50 dark:bg-rose-950/30 border-2 border-rose-200 dark:border-rose-800">
                <p className="text-sm text-rose-800 dark:text-rose-200 font-semibold">
                  Couldn't reach the registry right now. Please try again.
                </p>
              </div>
            ) : !firstMatch ? (
              <div className="rounded-xl p-4 bg-rose-50 dark:bg-rose-950/30 border-2 border-rose-200 dark:border-rose-800" data-testid="result-not-found">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-rose-900 dark:text-rose-100">
                      Not found in NEAIMS active database
                    </p>
                    <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">
                      "{activeQuery}" doesn't match any licensed agency. <strong>Don't pay them.</strong> Many fake recruiters use names similar to real ones — verify by exact license number before sending money.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`rounded-xl p-4 border-2 ${
                  badge?.kind === "ok"
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                    : badge?.kind === "danger"
                    ? "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
                    : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                }`}
                data-testid="result-found"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-base">{firstMatch.agencyName}</p>
                    {firstMatch.licenseNumber && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">{firstMatch.licenseNumber}</p>
                    )}
                  </div>
                  {badge && (
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                        badge.kind === "ok"
                          ? "bg-emerald-600 text-white"
                          : badge.kind === "danger"
                          ? "bg-rose-600 text-white"
                          : "bg-amber-500 text-white"
                      }`}
                    >
                      <badge.icon className="h-3 w-3" />
                      {badge.label}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 uppercase tracking-wide">Issued</p>
                    <p className="font-semibold">{formatDate(firstMatch.issueDate)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 uppercase tracking-wide">Expires</p>
                    <p className={`font-semibold ${badge?.kind === "danger" ? "text-rose-700 dark:text-rose-300" : ""}`}>
                      {formatDate(firstMatch.expiryDate)}
                    </p>
                  </div>
                </div>

                {badge?.kind === "danger" && (
                  <p className="text-xs text-rose-800 dark:text-rose-200 mt-3 pt-3 border-t border-rose-200 dark:border-rose-800 font-semibold">
                    ⚠️ This agency cannot legally charge placement fees. Don't pay them.
                  </p>
                )}
                {badge?.kind === "ok" && (
                  <p className="text-xs text-emerald-800 dark:text-emerald-200 mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-800 font-semibold">
                    ✅ Safe to engage with — license is current as of latest NEAIMS sync.
                  </p>
                )}

                {matchCount > 1 && (
                  <p className="text-[11px] text-gray-500 mt-2">
                    {matchCount - 1} more match{matchCount > 2 ? "es" : ""} for this search.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats footer — green pills row */}
      <div className="px-6 py-4 bg-slate-50 dark:bg-gray-950/50 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3 flex-wrap text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-semibold">
            <CheckCircle2 className="h-3 w-3" />
            {stats ? `${(stats.totalAgencies ?? 0) - (stats.expiredAgencies ?? 0)}` : "—"} active
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 font-semibold">
            <AlertTriangle className="h-3 w-3" />
            {stats?.expiredAgencies ?? "—"} expired
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
            <Database className="h-3 w-3" />
            {stats?.totalAgencies ?? "—"} tracked
          </span>
        </div>
        <a
          href="/nea-agencies"
          className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
          data-testid="link-browse-all-agencies"
        >
          Browse all →
        </a>
      </div>
    </div>
  );
}
