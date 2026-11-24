/**
 * useFeatureGate — the ONLY way UI code should ask for payment (2026-11).
 *
 *   const gate = useFeatureGate();
 *   <button onClick={() => gate.run("ai_auto_apply", startAutoApply)}>…</button>
 *   // or, after a server call: if (gate.handleResponse("premium_job_links", res.status, body)) return;
 *
 * Rules (docs/architecture/FREEMIUM_RULES.md — EXPLORE FIRST. PAY WHEN NECESSARY.):
 *   - call it from a user's deliberate tap only — never from useEffect, timers,
 *     page-view counts, login/registration handlers or route changes;
 *   - while plan data is loading or errored, let the action run and let the
 *     SERVER decide (it re-checks every premium request) — never prompt on a guess;
 *   - prompts name the feature and can always be closed ("Maybe later").
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpgradeModal } from "@/contexts/upgrade-modal-context";
import { openJobUnlock } from "@/components/job-unlock-dialog";
import { FEATURES, decideAccess, checkoutUrl, type FeatureId, type FeatureDef } from "@shared/feature-access";

export function useFeatureGate() {
  const qc = useQueryClient();
  const { openUpgradeModal } = useUpgradeModal();

  const prompt = useCallback((feature: FeatureId, body?: any) => {
    const f = FEATURES[feature] as FeatureDef;
    const here = window.location.pathname + window.location.search;
    if (f.offer === "monthly_only") openJobUnlock({ payUrl: body?.payUrl ?? checkoutUrl(feature, "monthly", here) });
    else openUpgradeModal("locked_feature", f.label);
  }, [openUpgradeModal]);

  const signIn = useCallback(() => {
    const here = window.location.pathname + window.location.search;
    window.location.href = `/signup?redirect=${encodeURIComponent(here)}`;
  }, []);

  /** Run `action` if allowed; otherwise show the right prompt. Deliberate taps only. */
  const run = useCallback((feature: FeatureId, action: () => void) => {
    const user = qc.getQueryData<any>(["/api/auth/user"]);
    const planResp = qc.getQueryData<any>(["/api/user/plan"]);
    const plan = planResp?.planId ?? user?.plan ?? null;
    // Unknown plan (still loading / failed) → don't guess; the server will enforce.
    if (user && plan == null) return action();
    const d = decideAccess(feature, { authenticated: !!user?.id, plan, isAdmin: user?.isAdmin === true });
    if (d.allowed) return action();
    if (d.reason === "SIGNIN") return signIn();
    if (d.reason === "UPGRADE") return prompt(feature);
    return action(); // PURCHASE / ADMIN_ONLY: the feature's own flow handles it
  }, [qc, prompt, signIn]);

  /** Interpret a server reply. Returns true if it was handled (caller should stop). */
  const handleResponse = useCallback((feature: FeatureId, status: number, body?: any) => {
    if (status === 401) { signIn(); return true; }
    if (status === 402 || (status === 403 && (body?.upgradeRequired || body?.code === "PAYWALL"))) {
      prompt((body?.feature && body.feature in FEATURES ? body.feature : feature) as FeatureId, body);
      return true;
    }
    return false;
  }, [prompt, signIn]);

  return { run, handleResponse, prompt };
}
