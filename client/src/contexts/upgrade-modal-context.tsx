import { createContext, useContext, useState, useCallback } from "react";

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

  const openUpgradeModal = useCallback(
    (trigger: UpgradeModalTrigger = "manual", featureName?: string, defaultPlan?: "basic" | "pro") => {
      setState({ open: true, trigger, featureName, defaultPlan });
    },
    []
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
