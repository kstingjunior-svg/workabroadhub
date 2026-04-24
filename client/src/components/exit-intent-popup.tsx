import { useState, useEffect, useRef } from "react";
import { X, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpgradeModal } from "@/contexts/upgrade-modal-context";
import { PRO_FEATURES } from "@/lib/plan-features";

interface ExitIntentPopupProps {
  enabled?: boolean;
}

export function ExitIntentPopup({ enabled = true }: ExitIntentPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const triggered = useRef(false);
  const { openUpgradeModal } = useUpgradeModal();

  useEffect(() => {
    if (!enabled || dismissed) return;
    const sessionKey = "exit_popup_shown";
    if (sessionStorage.getItem(sessionKey)) return;

    const handleMouseLeave = (e: MouseEvent) => {
      if (triggered.current) return;
      if (e.clientY <= 5) {
        triggered.current = true;
        sessionStorage.setItem(sessionKey, "1");
        setIsVisible(true);
      }
    };

    const handleMobile = () => {
      if (triggered.current) return;
      const scrolled = window.scrollY;
      setTimeout(() => {
        if (window.scrollY < scrolled - 80) {
          triggered.current = true;
          sessionStorage.setItem(sessionKey, "1");
          setIsVisible(true);
        }
      }, 100);
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("scroll", handleMobile, { passive: true });
    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("scroll", handleMobile);
    };
  }, [enabled, dismissed]);

  if (!isVisible || dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setDismissed(true); setIsVisible(false); }} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 z-10 animate-in slide-in-from-bottom-4 duration-300">
        <button
          onClick={() => { setDismissed(true); setIsVisible(false); }}
          className="absolute top-3 right-3 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
          data-testid="btn-close-exit-popup"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-center">
          <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-1">Before you go…</h2>
          <p className="text-muted-foreground text-sm mb-5">
            Thousands of Kenyans have already landed overseas jobs with WorkAbroad Hub Pro. Here's what you get:
          </p>

          <div className="space-y-2 text-left mb-5">
            {PRO_FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-foreground/80">
                <div className="h-5 w-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-green-600 text-xs font-bold">✓</span>
                </div>
                {f}
              </div>
            ))}
          </div>

          <Button
            className="w-full gap-2"
            onClick={() => {
              setDismissed(true);
              setIsVisible(false);
              openUpgradeModal("manual", undefined, "pro");
            }}
            data-testid="btn-exit-popup-upgrade"
          >
            View Pro Plan
            <ArrowRight className="h-4 w-4" />
          </Button>
          <button
            className="mt-3 text-xs text-muted-foreground underline"
            onClick={() => { setDismissed(true); setIsVisible(false); }}
          >
            No thanks, continue with Free
          </button>
        </div>
      </div>
    </div>
  );
}
