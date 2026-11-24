import { useState, useEffect } from "react";
import { AlertTriangle, X, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

const DISMISS_KEY = "wah_agency_alert_dismissed";

// 2026-11 AUTHENTIC DATA POLICY: figures come from server/lib/platform-stats.ts.
// Expired = agencies on the CURRENT NEA register marked expired / past expiry
// (records NEA no longer lists are NOT counted). Shown with the check date.
interface PublicStats {
  scamReportsThisMonth: number | null;
  expiredAgencies: number | null;
  agenciesOnRegister?: number | null;
  agencyDataCheckedAt?: string | null;
}
const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : null;

interface AgencyAlertBannerProps {
  className?: string;
  dismissable?: boolean;
  showLink?: boolean;
}

export function AgencyAlertBanner({ className, dismissable = true, showLink = true }: AgencyAlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [, navigate] = useLocation();

  const { data: stats } = useQuery<PublicStats>({
    queryKey: ["/api/public/stats"],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY)) setDismissed(true);
  }, []);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, "1");
  };

  if (dismissed) return null;
  if (!stats) return null;

  const expiredCount = stats.expiredAgencies ?? 0;
  const scamCount = stats.scamReportsThisMonth ?? 0;
  const checked = shortDate(stats.agencyDataCheckedAt);

  if (expiredCount === 0 && scamCount === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border animate-slide-up",
        "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
        className
      )}
      role="alert"
      data-testid="agency-alert-banner"
    >
      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {scamCount > 0 && (
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            ⚠️ {scamCount} community scam {scamCount === 1 ? "report" : "reports"} approved in the last 30 days
          </p>
        )}
        {expiredCount > 0 && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5" data-testid="agency-alert-expired">
            {expiredCount.toLocaleString()}
            {stats.agenciesOnRegister ? ` of ${stats.agenciesOnRegister.toLocaleString()}` : ""} agencies on the NEA register show an expired licence
            {checked ? ` (checked ${checked})` : ""} — verify before paying
          </p>
        )}
      </div>
      {showLink && (
        <button
          onClick={() => navigate("/nea-agencies")}
          className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-0.5 flex-shrink-0 hover:underline"
          data-testid="btn-agency-alert-verify"
        >
          Verify <ChevronRight className="h-3 w-3" />
        </button>
      )}
      {dismissable && (
        <button
          onClick={handleDismiss}
          className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
          data-testid="btn-dismiss-agency-alert"
        >
          <X className="h-3.5 w-3.5 text-red-500" />
        </button>
      )}
    </div>
  );
}
