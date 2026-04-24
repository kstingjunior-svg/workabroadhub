import { Lock } from "lucide-react";
import { useUpgradeModal, UpgradeModalTrigger } from "@/contexts/upgrade-modal-context";

interface LockedFeatureProps {
  children: React.ReactNode;
  featureName?: string;
  trigger?: UpgradeModalTrigger;
  locked?: boolean;
  className?: string;
  showBadge?: boolean;
}

/**
 * Wraps any element/card. When `locked` is true:
 * - Renders children behind a blur/lock overlay
 * - Clicking anywhere on the card opens the upgrade modal
 */
export function LockedFeature({
  children,
  featureName,
  trigger = "locked_feature",
  locked = true,
  className = "",
  showBadge = true,
}: LockedFeatureProps) {
  const { openUpgradeModal } = useUpgradeModal();

  if (!locked) return <>{children}</>;

  return (
    <div
      className={`relative cursor-pointer select-none ${className}`}
      onClick={() => openUpgradeModal(trigger, featureName, "pro")}
      data-testid={`locked-feature-${featureName?.toLowerCase().replace(/\s+/g, "-") ?? "unknown"}`}
    >
      {/* Content with blur + dim */}
      <div className="pointer-events-none opacity-50 blur-[1px]">
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-center justify-center rounded-inherit">
        {showBadge && (
          <div className="flex flex-col items-center gap-1.5 bg-background/90 backdrop-blur-sm border border-border rounded-xl px-4 py-3 shadow-lg">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xs font-semibold text-foreground text-center leading-tight">
              {featureName ? `Unlock ${featureName}` : "Premium Feature"}
            </span>
            <span className="text-[10px] text-primary font-medium">Tap to upgrade →</span>
          </div>
        )}
      </div>
    </div>
  );
}
