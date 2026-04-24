import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingDown } from "lucide-react";

const FEE_SERVICES = [
  {
    name: "WhatsApp Consultation",
    description: "1-hour session with an overseas career advisor",
    value: 1500,
    color: "bg-emerald-500",
    lightBg: "bg-emerald-50 dark:bg-emerald-950/30",
    textColor: "text-emerald-700 dark:text-emerald-400",
  },
  {
    name: "Portal Database Access",
    description: "30+ verified overseas job portals (UK, Canada, UAE & more)",
    value: 1000,
    color: "bg-blue-500",
    lightBg: "bg-blue-50 dark:bg-blue-950/30",
    textColor: "text-blue-700 dark:text-blue-400",
  },
  {
    name: "NEA Verification Tool",
    description: "Real-time agency license checking before you pay anyone",
    value: 800,
    color: "bg-violet-500",
    lightBg: "bg-violet-50 dark:bg-violet-950/30",
    textColor: "text-violet-700 dark:text-violet-400",
  },
  {
    name: "CV Templates & Review",
    description: "ATS-optimized templates + AI-powered CV feedback",
    value: 700,
    color: "bg-amber-500",
    lightBg: "bg-amber-50 dark:bg-amber-950/30",
    textColor: "text-amber-700 dark:text-amber-400",
  },
  {
    name: "Ongoing Support",
    description: "3 months WhatsApp support after your job search begins",
    value: 500,
    color: "bg-rose-500",
    lightBg: "bg-rose-50 dark:bg-rose-950/30",
    textColor: "text-rose-700 dark:text-rose-400",
  },
];

// Derive the total from the service breakdown so there is no hardcoded number.
const BASE_TOTAL = FEE_SERVICES.reduce((sum, s) => sum + s.value, 0);
const SAVINGS_MESSAGE = "Save KES 85,000+ in potential scam losses";

interface FeeBreakdownProps {
  /** When true the breakdown is always visible — no toggle button */
  alwaysOpen?: boolean;
  /** Extra classes applied to the outer wrapper */
  className?: string;
  /** Override the displayed total — pass the finalPrice from /api/price for accurate country-adjusted pricing */
  total?: number;
}

export function FeeBreakdown({ alwaysOpen = false, className = "", total }: FeeBreakdownProps) {
  const TOTAL = total ?? BASE_TOTAL;
  const [open, setOpen] = useState(alwaysOpen);

  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden ${className}`} data-testid="fee-breakdown">

      {/* Toggle header — hidden when alwaysOpen */}
      {!alwaysOpen && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
          data-testid="btn-why-kes"
          aria-expanded={open}
        >
          <span>💡 Why KES {TOTAL.toLocaleString()}? See exact fee breakdown</span>
          {open
            ? <ChevronUp className="h-4 w-4 flex-shrink-0" />
            : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
        </button>
      )}

      {/* Body */}
      {(open || alwaysOpen) && (
        <div className="p-4 space-y-3" data-testid="fee-breakdown-body">

          {/* Service rows */}
          {FEE_SERVICES.map((svc) => {
            const pct = Math.round((svc.value / TOTAL) * 100);
            return (
              <div key={svc.name} className={`rounded-lg p-3 ${svc.lightBg}`} data-testid={`fee-item-${svc.name.toLowerCase().replace(/\s+/g, "-")}`}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className={`text-xs font-bold leading-tight ${svc.textColor}`}>{svc.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{svc.description}</p>
                  </div>
                  <span className={`text-xs font-extrabold whitespace-nowrap ${svc.textColor}`}>
                    KES {svc.value.toLocaleString()}
                  </span>
                </div>
                {/* Proportional bar */}
                <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${svc.color} transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                    aria-label={`${pct}% of total`}
                  />
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5 text-right">{pct}% of total</p>
              </div>
            );
          })}

          {/* Total row */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-foreground/5 border border-border mt-1">
            <span className="text-sm font-bold text-foreground">Total (360-day Pro access)</span>
            <span className="text-sm font-extrabold text-amber-600" data-testid="fee-total">
              KES {TOTAL.toLocaleString()}
            </span>
          </div>

          {/* Savings callout */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
            <TrendingDown className="h-4 w-4 text-green-600 flex-shrink-0" />
            <p className="text-xs font-semibold text-green-700 dark:text-green-400" data-testid="fee-savings">
              {SAVINGS_MESSAGE}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
