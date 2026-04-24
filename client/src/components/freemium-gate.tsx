import { Lock, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpgradeModal } from "@/contexts/upgrade-modal-context";

interface FreemiumGateProps {
  title?: string;
  description?: string;
  ctaText?: string;
  blurHeight?: number;
  children: React.ReactNode;
  compact?: boolean;
  featureName?: string;
}

export function FreemiumGate({
  title = "Unlock Full Report",
  description = "Get the complete analysis with keywords, detailed suggestions, and AI-powered improvements.",
  ctaText = "Upgrade to Unlock",
  blurHeight = 180,
  children,
  compact = false,
  featureName,
}: FreemiumGateProps) {
  const { openUpgradeModal } = useUpgradeModal();

  const handleUnlock = () => {
    openUpgradeModal("locked_feature", featureName || title, "pro");
  };

  return (
    <div className="relative">
      <div
        className="overflow-hidden pointer-events-none select-none"
        style={{ maxHeight: blurHeight }}
      >
        {children}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            background: "linear-gradient(to bottom, transparent 0%, var(--background, white) 80%)",
            height: blurHeight * 0.75,
          }}
        />
      </div>

      <div className={`relative z-10 flex flex-col items-center text-center ${compact ? "py-4 px-4" : "py-6 px-4"} bg-background border border-border rounded-xl shadow-sm mt-2`}>
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <Lock className="h-5 w-5 text-primary" />
        </div>
        <h3 className="font-bold text-base text-foreground mb-1">{title}</h3>
        {!compact && (
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">{description}</p>
        )}
        {compact && <p className="text-xs text-muted-foreground mb-3">{description}</p>}
        <Button
          className="gap-2"
          size={compact ? "sm" : "default"}
          onClick={handleUnlock}
          data-testid="btn-freemium-unlock"
        >
          <Sparkles className="h-4 w-4" />
          {ctaText}
          <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="text-xs text-muted-foreground mt-2">Full access · 360 days · secure payment page</p>
      </div>
    </div>
  );
}
