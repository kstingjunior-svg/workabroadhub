import { useState } from "react";
import { X, Sparkles, ArrowRight, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpgradeModal } from "@/contexts/upgrade-modal-context";

interface UpgradePromptProps {
  triggerType?: "limit_hit" | "action_complete" | "tool_used";
  title?: string;
  description?: string;
  onDismiss?: () => void;
  compact?: boolean;
  featureName?: string;
}

const MESSAGES = {
  limit_hit: {
    title: "You've reached the free limit",
    description: "Upgrade to get unlimited access to all tools, AI assistance, and premium career support.",
  },
  action_complete: {
    title: "Great work! Take the next step",
    description: "Unlock your full career potential with AI-powered guidance and expert support.",
  },
  tool_used: {
    title: "Want the complete analysis?",
    description: "Premium members get detailed breakdowns, AI suggestions, and priority support.",
  },
};

export function UpgradePrompt({
  triggerType = "tool_used",
  title,
  description,
  onDismiss,
  compact = false,
  featureName,
}: UpgradePromptProps) {
  const [dismissed, setDismissed] = useState(false);
  const { openUpgradeModal } = useUpgradeModal();
  const msg = MESSAGES[triggerType];
  const displayTitle = title || msg.title;
  const displayDesc = description || msg.description;

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const handleUpgrade = () => {
    openUpgradeModal("locked_feature", featureName, "pro");
  };

  if (compact) {
    return (
      <div className="relative bg-gradient-to-r from-primary/5 to-amber-500/5 border border-primary/20 rounded-xl p-4 flex items-center gap-3" data-testid="upgrade-prompt-compact">
        <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
          <Crown className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{displayTitle}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{displayDesc}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="sm" className="gap-1 text-xs" onClick={handleUpgrade} data-testid="btn-upgrade-prompt">
            Upgrade <ArrowRight className="h-3 w-3" />
          </Button>
          <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-br from-primary/5 via-background to-amber-500/5 border border-primary/20 rounded-2xl p-6 text-center" data-testid="upgrade-prompt">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="h-12 w-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
        <Sparkles className="h-6 w-6 text-amber-600" />
      </div>
      <h3 className="font-bold text-lg text-foreground mb-2">{displayTitle}</h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-xs mx-auto">{displayDesc}</p>
      <Button className="gap-2 w-full max-w-xs" onClick={handleUpgrade} data-testid="btn-upgrade-prompt-full">
        <Sparkles className="h-4 w-4" />
        View Pro Plan
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
