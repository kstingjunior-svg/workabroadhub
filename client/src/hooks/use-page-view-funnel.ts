import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useUpgradeModal } from "@/contexts/upgrade-modal-context";
import { useAuth } from "@/hooks/use-auth";

const STORAGE_KEY = "wah_page_views";
const PROMPT_AFTER = 2;
const PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours between prompts
const COOLDOWN_KEY = "wah_upgrade_last_prompt";

// Pages that should NOT count toward the view trigger
const EXCLUDED_PATHS = ["/payment", "/profile", "/pricing", "/admin"];

export function usePageViewFunnel() {
  const [location] = useLocation();
  const { openUpgradeModal } = useUpgradeModal();
  const { user } = useAuth();
  const lastLocation = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Admins never see the funnel prompt
    if ((user as any).isAdmin) return;
    // Paid users skip it too
    if ((user as any).plan && (user as any).plan !== "free") return;
    // Skip excluded paths
    if (EXCLUDED_PATHS.some((p) => location.startsWith(p))) return;
    // Don't count same path twice in a row
    if (location === lastLocation.current) return;
    lastLocation.current = location;

    // Increment view count
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const views = raw ? parseInt(raw, 10) : 0;
    const newViews = views + 1;
    sessionStorage.setItem(STORAGE_KEY, String(newViews));

    // Check cooldown to avoid spamming
    const lastPrompt = localStorage.getItem(COOLDOWN_KEY);
    const cooldownExpired = !lastPrompt || Date.now() - parseInt(lastPrompt, 10) > PROMPT_COOLDOWN_MS;

    if (newViews >= PROMPT_AFTER && cooldownExpired) {
      // Reset session counter and record prompt time
      sessionStorage.setItem(STORAGE_KEY, "0");
      localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      // Small delay so the page renders first
      setTimeout(() => openUpgradeModal("limit_hit"), 1200);
    }
  }, [location, user, openUpgradeModal]);
}
