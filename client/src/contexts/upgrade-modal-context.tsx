import { createContext, useContext, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isPaidUser } from "@/lib/plan";
import { useToast } from "@/hooks/use-toast";

export type UpgradeModalTrigger =
  | "locked_feature"
  | "limit_hit"
  | "country_locked"
  | "jobs_locked"
  | "tracker_locked"
  | "consultation_locked"
  | "ai_locked"
  | "manual";

interface UpgradeModalState {
  open: boolean;
  trigger: UpgradeModalTrigger;
  featureName?: string;
  defaultPlan?: "basic" | "pro";
}

interface UpgradeModalContextValue {
  state: UpgradeModalState;
  openUpgradeModal: (trigger?: UpgradeModalTrigger, featureName?: string, defaultPlan?: "basic" | "pro") => void;
  closeUpgradeModal: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextValue | null>(null);

export function UpgradeModalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UpgradeModalState>({
    open: false,
    trigger: "manual",
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const openUpgradeModal = useCallback(
    (trigger: UpgradeModalTrigger = "manual", featureName?: string, defaultPlan?: "basic" | "pro") => {
      // 2026-06 FIX: don't show the upgrade modal to users who are ALREADY on
      // a paid plan. The previous version would unconditionally open it, which
      // trapped admin-granted Pro users behind a "Pay again" wall because the
      // /api/auth/user cache or React Query cache hadn't refreshed yet.
      //
      // We read straight from the React Query cache (no extra fetch). Both
      // /api/auth/user (carries `plan`) and /api/user/plan (carries `planId`)
      // are checked — whichever is fresher wins. If either says paid, we
      // refuse to open AND we force a refetch so the gating UI updates.
      const authUser   = queryClient.getQueryData<any>(["/api/auth/user"]);
      const planResp   = queryClient.getQueryData<any>(["/api/user/plan"]);
      const candidatePlan =
        planResp?.planId ??
        authUser?.plan ??
        authUser?.planId ??
        null;
      const alreadyPaid =
        isPaidUser(candidatePlan) ||
        authUser?.subscriptionStatus === "active" ||
        authUser?.isAdmin === true ||
        authUser?.isAdminBypass === true;

      if (alreadyPaid) {
        // Force a fresh fetch so any stale UI showing "Upgrade to Pro" CTAs
        // updates and the user sees their unlocked content next click.
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/plan"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/services"] });
        toast({
          title: "You're already on a paid plan",
          description: `${featureName ? featureName + " " : ""}is unlocked. Refreshing the page…`,
        });
        // Give React a tick to repaint with the refetched data
        setTimeout(() => window.location.reload(), 1200);
        return;
      }

      // 2026-08 (Tony's "no pricing until verified" mandate): never show the
      // KES 99 / 1000 / 4500 tiers to an unverified account. Users signing up
      // with fake emails should never see prices — they must verify first,
      // then get offered plans. Applies to every trigger source (exit-intent
      // popup, jobs-locked banner, freemium gate, country-locked card, etc).
      //
      // Anonymous users (no session) still see the pricing modal — that's
      // required so first-time visitors browsing landing pages can see
      // pricing and decide whether to sign up.
      const isAnonymous = !authUser?.id;
      const isVerified = authUser?.emailVerified === true;
      if (!isAnonymous && !isVerified) {
        toast({
          title: "Please verify your email first",
          description: "You'll see pricing and can pay once your account is verified. Check the red banner at the top of the page for your code.",
          duration: 8000,
        });
        // Nudge them straight to the verify page so they can act on it now.
        setTimeout(() => {
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/account/verify")) {
            window.location.href = "/account/verify";
          }
        }, 600);
        return;
      }

      setState({ open: true, trigger, featureName, defaultPlan });
    },
    [queryClient, toast]
  );

  const closeUpgradeModal = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  return (
    <UpgradeModalContext.Provider value={{ state, openUpgradeModal, closeUpgradeModal }}>
      {children}
    </UpgradeModalContext.Provider>
  );
}

export function useUpgradeModal() {
  const ctx = useContext(UpgradeModalContext);
  if (!ctx) throw new Error("useUpgradeModal must be used within UpgradeModalProvider");
  return ctx;
}
