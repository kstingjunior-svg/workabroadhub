import { Lock, Crown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpgradeModal } from "@/contexts/upgrade-modal-context";
import { cn } from "@/lib/utils";

interface LockedJob {
  title: string;
  country: string;
  flag: string;
  salary: string;
  type: string;
}

const LOCKED_JOBS: LockedJob[] = [
  { title: "Senior Care Worker", country: "United Kingdom", flag: "🇬🇧", salary: "£24,000/yr", type: "Full-time" },
  { title: "CDL Truck Driver", country: "Canada", flag: "🇨🇦", salary: "CAD $55,000/yr", type: "Full-time" },
  { title: "Hotel Receptionist", country: "Dubai, UAE", flag: "🇦🇪", salary: "AED 4,500/mo", type: "Full-time" },
  { title: "Warehouse Operative", country: "Germany", flag: "🇩🇪", salary: "€28,000/yr", type: "Full-time" },
  { title: "Registered Nurse", country: "United Kingdom", flag: "🇬🇧", salary: "£32,000/yr", type: "Full-time" },
];

interface LockedContentPreviewProps {
  title?: string;
  description?: string;
  plan?: "free" | "pro";
  className?: string;
  jobCount?: number;
}

export function LockedContentPreview({
  title = "🔒 Unlock Verified Jobs",
  description = "Upgrade to access exclusive high-demand overseas jobs not available to free users.",
  plan = "pro",
  className,
  jobCount = 3,
}: LockedContentPreviewProps) {
  const { openUpgradeModal } = useUpgradeModal();

  const visibleJobs = LOCKED_JOBS.slice(0, jobCount);

  return (
    <div className={cn("relative rounded-2xl overflow-hidden border border-border", className)} data-testid="locked-content-preview">
      {/* Blurred job previews */}
      <div className="select-none pointer-events-none" aria-hidden="true">
        {visibleJobs.map((job, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card"
            style={{ filter: `blur(${3 + i * 0.5}px)`, opacity: 1 - i * 0.15 }}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-lg flex-shrink-0">
                {job.flag}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{job.title}</p>
                <p className="text-xs text-muted-foreground">{job.country} · {job.type}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-green-600">{job.salary}</p>
              <p className="text-xs text-muted-foreground">Verified ✅</p>
            </div>
          </div>
        ))}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-background/60 via-background/85 to-background/95 px-5 py-6 text-center">
        <div className="p-3 rounded-2xl bg-primary/10 mb-3 border border-primary/20">
          <Lock className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-base font-extrabold text-foreground mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-xs">{description}</p>

        <Button
          size="sm"
          className={cn(
            "font-bold px-6 shadow-md",
            plan === "pro"
              ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              : "bg-primary hover:bg-primary/90 text-primary-foreground"
          )}
          onClick={() => openUpgradeModal("feature_locked", "Verified Jobs", plan)}
          data-testid="btn-unlock-jobs"
        >
          {plan === "pro" ? (
            <><Crown className="h-3.5 w-3.5 mr-1.5" />Unlock with Pro</>
          ) : (
            <><Zap className="h-3.5 w-3.5 mr-1.5" />Unlock Now — Upgrade via secure payment page</>
          )}
        </Button>
      </div>
    </div>
  );
}
