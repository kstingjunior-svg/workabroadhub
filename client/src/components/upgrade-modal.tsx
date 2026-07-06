import { useState, useEffect, useCallback, useRef } from "react";
import { X, Check, Crown, Shield, ArrowRight, Phone, Loader2, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { useUpgradeModal, UpgradeModalTrigger } from "@/contexts/upgrade-modal-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FeeBreakdown } from "@/components/fee-breakdown";
import { UPGRADE_MODAL_FREE, UPGRADE_MODAL_PRO } from "@/lib/plan-features";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { isPaidUser } from "@/lib/plan";

interface PublicStats {
  scamReportsThisMonth: number;
  expiredAgencies: number;
  recentUpgradesThisWeek: number;
  totalUsers: number;
}

const TRIGGER_HEADLINES: Record<UpgradeModalTrigger, string> = {
  locked_feature: "Unlock This Feature 🔓",
  limit_hit: "⚠️ Don't Risk Paying Fake Agents",
  country_locked: "Unlock Global Destinations 🌍",
  jobs_locked: "Unlock Premium Career Tools 💼",
  tracker_locked: "Track All Your Applications 📊",
  consultation_locked: "Book a WhatsApp Consultation 💬",
  ai_locked: "Unlock Unlimited AI Tools 🤖",
  manual: "Unlock Premium Opportunities 🌍",
};

const TRIGGER_SUBHEADLINES: Record<UpgradeModalTrigger, string> = {
  locked_feature: "This feature is available on the Pro plan. Upgrade below to get instant access.",
  limit_hit: "Fake agents cost Kenyans millions yearly. Our Pro plan flags every fraudulent agency before you pay.",
  country_locked: "Get full access to all 6 destination countries with verified job portals.",
  jobs_locked: "Access 30+ verified job portals, AI-powered search tools, scam protection, and expert career guidance.",
  tracker_locked: "Keep track of every application, status, and deadline in one place.",
  consultation_locked: "Get 1-on-1 guidance from an expert career advisor on WhatsApp.",
  ai_locked: "Generate unlimited AI cover letters, CV optimizations, and job suggestions.",
  manual: "Get full access to every tool, job listing, and career resource on WorkAbroad Hub.",
};

const UPGRADE_MODAL_FREE_LIST = [
  "NEAIMS checks (3 per day)",
  "5 verified portals",
  "Basic CV template",
];

const UPGRADE_MODAL_PRO_LIST = [
  "Unlimited NEAIMS checks",
  "All 30+ portals",
  "ATS CV scanner",
  "WhatsApp consultation",
  "Application tracking",
  "Priority support",
];

const MAX_POLL_MS = 70_000;

type Step = "compare" | "pay" | "pending" | "success";

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}

function isValidSafaricomNumber(phone: string): boolean {
  return /^(?:254|\+254|0)?[71]\d{8}$/.test(phone.replace(/\s+/g, ""));
}

export function UpgradeModal() {
  const { state, closeUpgradeModal } = useUpgradeModal();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("compare");
  // 2026-06: modal now offers all 3 paid tiers. Founder feedback — too many
  // signups cancelled when only KES 4,500 was shown. Default to Monthly
  // (Kenya's most-loved entry point), let user click through to Trial or Yearly.
  const [selectedPlan, setSelectedPlan] = useState<"trial" | "monthly" | "pro">("monthly");
  const [phone, setPhone] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(70);
  const [pollStart, setPollStart] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: stats } = useQuery<PublicStats>({
    queryKey: ["/api/public/stats"],
    staleTime: 5 * 60 * 1000,
    enabled: state.open,
  });

  // Resolve canonical prices for all 3 paid tiers from the server pricing
  // engine. /api/plans is a public endpoint returning the live DB rows.
  // Drizzle returns camelCase keys (planId, not plan_id) — accept both
  // shapes defensively in case the API surface ever changes.
  const { data: allPlans } = useQuery<Array<{ planId?: string; plan_id?: string; price: number }>>({
    queryKey: ["/api/plans"],
    staleTime: 30_000,
    enabled: state.open,
  });
  const planPrice = (id: string): number | undefined =>
    allPlans?.find((p) => (p.planId ?? p.plan_id) === id)?.price;
  const trialPrice   = planPrice("trial");
  const monthlyPrice = planPrice("monthly");
  const yearlyPrice  = planPrice("pro");

  const { data: profile } = useQuery<{ phone?: string }>({
    queryKey: ["/api/profile"],
    staleTime: 60_000,
    enabled: state.open,
  });

  // 2026-06 FIX: read the user's CURRENT plan so we can label the right card
  // as "Current" (the old hard-coded label always said "Current" on Free,
  // which lied to paying customers and made them think the system forgot
  // their payment).
  const { data: livePlan } = useQuery<{ planId: string } | null>({
    queryKey: ["/api/user/plan"],
    enabled: state.open && !!user,
    staleTime: 30_000,
  });
  const currentPlanId: string = (livePlan?.planId ?? (user as any)?.plan ?? "free").toLowerCase();
  const isCurrent = (cardPlanId: "free" | "trial" | "monthly" | "yearly" | "pro") => {
    if (cardPlanId === "free") return currentPlanId === "free";
    if (cardPlanId === "yearly" || cardPlanId === "pro")
      return currentPlanId === "yearly" || currentPlanId === "pro" || currentPlanId === "pro_referral";
    return currentPlanId === cardPlanId;
  };

  // Single price used by FeeBreakdown + receipt summary. Tracks the selected
  // tier so the breakdown updates when the user toggles between plans.
  const proFinalPrice =
    selectedPlan === "trial"   ? trialPrice :
    selectedPlan === "monthly" ? monthlyPrice :
                                 yearlyPrice;

  useEffect(() => {
    if (state.open && profile?.phone && !phone) {
      const raw = profile.phone;
      const digits = raw.replace(/\D/g, "");
      if (digits.startsWith("254")) setPhone("0" + digits.slice(3));
      else if (digits.startsWith("7") || digits.startsWith("1")) setPhone("0" + digits);
      else setPhone(raw);
    }
  }, [state.open, profile?.phone]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    if (step !== "pending" || !paymentId || !pollStart) return;

    const tick = () => {
      const elapsed = Date.now() - pollStart;
      const remaining = Math.max(0, Math.ceil((MAX_POLL_MS - elapsed) / 1000));
      setSecondsLeft(remaining);
      if (elapsed >= MAX_POLL_MS) {
        stopPolling();
        setStep("compare");
        toast({ title: "Prompt Timed Out", description: "No response from Safaricom. Please try again.", variant: "destructive" });
      }
    };

    pollRef.current = setInterval(tick, 1000);
    return stopPolling;
  }, [step, paymentId, pollStart, stopPolling, toast]);

  const pollMutation = useMutation({
    mutationFn: async (pid: string) => {
      const res = await apiRequest("GET", `/api/subscriptions/poll/${pid}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.status === "success" || data.status === "completed") {
        stopPolling();
        setReceipt(data.receipt || null);
        setStep("success");
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/plan"] });
      } else if (data.status === "failed" || data.status === "cancelled") {
        stopPolling();
        setStep("compare");
        toast({ title: "Payment Cancelled", description: "M-Pesa payment was cancelled or failed. Please try again.", variant: "destructive" });
      }
    },
  });

  useEffect(() => {
    if (step !== "pending" || !paymentId) return;
    const interval = setInterval(() => {
      pollMutation.mutate(paymentId);
    }, 4000);
    return () => clearInterval(interval);
  }, [step, paymentId]);

  const payMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscriptions/upgrade", {
        planId: selectedPlan,
        phoneNumber: formatPhone(phone),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setPaymentId(data.paymentId);
      setPollStart(Date.now());
      setSecondsLeft(70);
      setStep("pending");
    },
    onError: (error: any) => {
      if (error?.isCsrfError) {
        toast({ title: "Security token refreshed", description: "Please tap 'Send Prompt' again.", variant: "destructive" });
        return;
      }
      if (error?.status === 409 || error?.message?.includes("pending")) {
        toast({ title: "Payment Already In Progress", description: "Check your phone for the M-Pesa prompt.", variant: "destructive" });
        return;
      }
      toast({ title: "Could Not Send Prompt", description: error.message || "Something went wrong. Please try again.", variant: "destructive" });
    },
  });

  const handleUpgradeClick = () => {
    setStep("pay");
  };

  const handleSendPrompt = () => {
    if (!isValidSafaricomNumber(phone)) {
      toast({ title: "Invalid Phone Number", description: "Enter a valid Safaricom number: 07XXXXXXXX or +254XXXXXXXXX", variant: "destructive" });
      return;
    }
    payMutation.mutate();
  };

  const handleClose = () => {
    stopPolling();
    setStep("compare");
    setPhone("");
    setPaymentId(null);
    setReceipt(null);
    closeUpgradeModal();
  };

  if (!state.open) return null;

  const headline = TRIGGER_HEADLINES[state.trigger];
  const subheadline = TRIGGER_SUBHEADLINES[state.trigger];
  const totalUsers = stats?.totalUsers ?? null;
  const recentUpgrades = stats?.recentUpgradesThisWeek ?? null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center px-2 pb-2 sm:px-4 sm:pb-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div
        className="relative w-full max-w-3xl bg-background border border-border rounded-2xl shadow-2xl z-10 animate-in slide-in-from-bottom-4 duration-300 max-h-[95vh] overflow-y-auto"
        data-testid="upgrade-modal"
      >
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80 transition-colors"
          data-testid="btn-close-upgrade-modal"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header — always visible */}
        <div className="bg-gradient-to-br from-primary/10 via-background to-amber-500/10 p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Crown className="h-4 w-4 text-amber-600" />
            </div>
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">WorkAbroad Hub Premium</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-1" data-testid="text-upgrade-headline">
            {state.featureName ? `Unlock: ${state.featureName}` : headline}
          </h2>
          <p className="text-sm text-muted-foreground">{subheadline}</p>
        </div>

        {/* ── STEP: compare (4-tier picker) ──────────────────────────────────
            Founder feedback (2026-06): when only Free + Pro (KES 4,500) were
            visible, 80%+ of users canceled the M-Pesa STK because they
            couldn't see the KES 99 + KES 1,000 options. Now shows all 4
            tiers as clickable cards. Default selection = Monthly KES 1,000
            (the strongest entry-level commitment). */}
        {step === "compare" && (
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
              {/* Free plan — informational */}
              <div className="relative rounded-xl border-2 border-border overflow-hidden flex flex-col" data-testid="plan-card-free">
                <div className="bg-muted/50 px-2 py-3 text-center">
                  <div className="font-bold text-sm text-foreground">Free</div>
                  <div className="text-base sm:text-lg font-black mt-1 text-foreground">KES 0</div>
                  <div className="text-[9px] text-muted-foreground">Browse & preview</div>
                </div>
                <div className="p-2 flex-1 text-center text-[10px] text-muted-foreground">
                  Limited preview
                </div>
                <div className="p-2 pt-0">
                  <div className="w-full text-center text-[10px] text-muted-foreground py-1.5 font-medium">
                    {isCurrent("free") ? "Current" : " "}
                  </div>
                </div>
              </div>

              {/* Trial plan — KES 99 / 1 day */}
              <button
                type="button"
                onClick={() => setSelectedPlan("trial")}
                className={`relative rounded-xl border-2 overflow-hidden flex flex-col text-left transition-all ${
                  selectedPlan === "trial"
                    ? "border-green-500 shadow-lg shadow-green-200/60 dark:shadow-green-900/40 ring-2 ring-green-300/40"
                    : "border-border hover:border-green-300"
                }`}
                data-testid="plan-card-trial"
              >
                <div className={`px-2 py-3 text-center ${selectedPlan === "trial" ? "bg-green-500 text-white" : "bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-200"}`}>
                  <div className="font-bold text-sm">1 Day Trial</div>
                  <div className="text-base sm:text-lg font-black mt-1">
                    {trialPrice ? `KES ${trialPrice.toLocaleString("en-KE")}` : "—"}
                  </div>
                  <div className={`text-[9px] ${selectedPlan === "trial" ? "text-white/80" : "text-green-700/80 dark:text-green-300/80"}`}>24-hour access</div>
                </div>
                <div className="p-2 flex-1 text-[10px] text-muted-foreground text-center">
                  Try everything for a day
                </div>
                <div className="p-2 pt-0 text-center text-[10px] font-bold text-green-700 dark:text-green-300">
                  {selectedPlan === "trial" ? "✓ Selected" : "Tap to pick"}
                </div>
              </button>

              {/* Monthly plan — KES 1,000 / 30 days — DEFAULT */}
              <button
                type="button"
                onClick={() => setSelectedPlan("monthly")}
                className={`relative rounded-xl border-2 overflow-hidden flex flex-col text-left transition-all ${
                  selectedPlan === "monthly"
                    ? "border-blue-500 shadow-xl shadow-blue-200/60 dark:shadow-blue-900/40 ring-2 ring-blue-300/40 scale-[1.03] z-10"
                    : "border-border hover:border-blue-300"
                }`}
                data-testid="plan-card-monthly"
              >
                <div className={`px-2 py-3 text-center ${selectedPlan === "monthly" ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white" : "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200"}`}>
                  <span className="inline-block text-[8px] font-bold px-1.5 py-0.5 rounded-full mb-1 bg-white/20 backdrop-blur-sm border border-white/30">⭐ POPULAR</span>
                  <div className="font-bold text-sm">Monthly</div>
                  <div className="text-base sm:text-lg font-black mt-1">
                    {monthlyPrice ? `KES ${monthlyPrice.toLocaleString("en-KE")}` : "—"}
                  </div>
                  <div className={`text-[9px] ${selectedPlan === "monthly" ? "text-white/80" : "text-blue-700/80 dark:text-blue-300/80"}`}>30 days · cancel anytime</div>
                </div>
                <div className="p-2 flex-1 text-[10px] text-muted-foreground text-center">
                  Full Pro access
                </div>
                <div className="p-2 pt-0 text-center text-[10px] font-bold text-blue-700 dark:text-blue-300">
                  {selectedPlan === "monthly" ? "✓ Selected" : "Tap to pick"}
                </div>
              </button>

              {/* Yearly plan — KES 4,500 / year */}
              <button
                type="button"
                onClick={() => setSelectedPlan("pro")}
                className={`relative rounded-xl border-2 overflow-hidden flex flex-col text-left transition-all ${
                  selectedPlan === "pro"
                    ? "border-amber-500 shadow-xl shadow-amber-200/60 dark:shadow-amber-900/40 ring-2 ring-amber-300/40"
                    : "border-border hover:border-amber-300"
                }`}
                data-testid="plan-card-pro"
              >
                <div className={`px-2 py-3 text-center ${selectedPlan === "pro" ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white" : "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200"}`}>
                  <span className="inline-block text-[8px] font-bold px-1.5 py-0.5 rounded-full mb-1 bg-white/20 backdrop-blur-sm border border-white/30">👑 SAVE 7,500</span>
                  <div className="font-bold text-sm">Yearly</div>
                  <div className="text-base sm:text-lg font-black mt-1">
                    {yearlyPrice ? `KES ${yearlyPrice.toLocaleString("en-KE")}` : "—"}
                  </div>
                  <div className={`text-[9px] ${selectedPlan === "pro" ? "text-white/80" : "text-amber-700/80 dark:text-amber-300/80"}`}>365 days · best value</div>
                </div>
                <div className="p-2 flex-1 text-[10px] text-muted-foreground text-center">
                  Pay once, done
                </div>
                <div className="p-2 pt-0 text-center text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  {selectedPlan === "pro" ? "✓ Selected" : "Tap to pick"}
                </div>
              </button>
            </div>

            {/* Single proceed button at full width — uses whichever tier the user picked */}
            <button
              onClick={handleUpgradeClick}
              disabled={!proFinalPrice}
              className={`w-full text-sm font-bold py-3 rounded-xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mb-5 ${
                selectedPlan === "trial"   ? "bg-gradient-to-r from-green-600 to-emerald-600 shadow-green-200 dark:shadow-green-900/40" :
                selectedPlan === "monthly" ? "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-200 dark:shadow-blue-900/40" :
                                             "bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-200 dark:shadow-amber-900/40"
              }`}
              data-testid="btn-upgrade-proceed"
            >
              {proFinalPrice
                ? `Continue with ${selectedPlan === "trial" ? "1 Day Trial" : selectedPlan === "monthly" ? "Monthly" : "Yearly"} — KES ${proFinalPrice.toLocaleString("en-KE")}`
                : "Loading prices…"}
            </button>

            {/* Tiny what-you-get bullets (shared across paid tiers) */}
            <div className="mb-4 p-3 rounded-xl bg-muted/30 grid grid-cols-2 gap-1.5">
              {UPGRADE_MODAL_PRO.map((f) => (
                <div key={f.label} className="flex items-start gap-1.5">
                  <Check className="h-3 w-3 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-[10px] leading-tight text-foreground">{f.label}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {["Instant access after payment", "360 days full access", "M-Pesa & PayPal accepted", "No hidden fees"].map((item) => (
                <div key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3 text-green-500 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>

            <FeeBreakdown className="mb-4" total={proFinalPrice} />

            {(totalUsers !== null || recentUpgrades !== null) && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-center gap-3">
                <ArrowRight className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  {recentUpgrades !== null && recentUpgrades > 0 ? `${recentUpgrades} people upgraded this week · ` : ""}
                  {totalUsers !== null && totalUsers > 0 ? `${totalUsers.toLocaleString()} members on the platform` : "Join other Kenyans working abroad"}
                </p>
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground mt-3">
              🔒 Secure payment via M-Pesa or PayPal · No hidden fees
            </p>
          </div>
        )}

        {/* ── STEP: pay ─────────────────────────────────────────────────────── */}
        {step === "pay" && (
          <div className="p-6 space-y-5">
            <div className="text-center">
              <div className="text-3xl mb-1">📱</div>
              <h3 className="text-lg font-bold text-foreground">Pay via M-Pesa</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Enter your Safaricom number and we'll send an STK push to your phone instantly.
              </p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-center">
              <div className="text-xs text-amber-700 dark:text-amber-400 mb-1 font-medium">Amount to pay</div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {proFinalPrice ? `KES ${proFinalPrice.toLocaleString("en-KE")}` : "—"}
              </div>
              <div className="text-xs text-amber-600/70 dark:text-amber-500 mt-0.5">360 days Pro access</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="modal-phone">
                Safaricom phone number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="modal-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XXXXXXXX"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background text-foreground text-base focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
                  data-testid="input-mpesa-phone"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSendPrompt(); }}
                />
              </div>
              <p className="text-xs text-muted-foreground">You'll receive a PIN prompt on this number</p>
            </div>


            <button
              onClick={handleSendPrompt}
              disabled={payMutation.isPending || !proFinalPrice}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-green-200 dark:shadow-green-900/30 flex items-center justify-center gap-2"
              data-testid="btn-send-mpesa-prompt"
            >
              {payMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Sending prompt…</>
              ) : (
                <>📲 Send M-Pesa Prompt</>
              )}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <button
              onClick={() => { handleClose(); window.location.href = "/payment?plan=pro"; }}
              className="w-full py-2.5 rounded-xl font-medium text-sm border border-border text-muted-foreground hover:bg-muted transition-colors"
              data-testid="btn-pay-other-methods"
            >
              Pay with PayPal or other methods →
            </button>

            <button
              onClick={() => setStep("compare")}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              ← Back to plans
            </button>
          </div>
        )}

        {/* ── STEP: pending ─────────────────────────────────────────────────── */}
        {step === "pending" && (
          <div className="p-8 flex flex-col items-center text-center space-y-5">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <span className="text-4xl">📲</span>
              </div>
              <span className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-amber-400 flex items-center justify-center">
                <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
              </span>
            </div>

            <div>
              <h3 className="text-lg font-bold text-foreground">Check Your Phone</h3>
              <p className="text-sm text-muted-foreground mt-1">
                An M-Pesa prompt has been sent to <span className="font-semibold text-foreground">{phone}</span>.<br />
                Enter your M-Pesa PIN to complete payment.
              </p>
            </div>

            <div className="bg-muted/50 rounded-xl px-6 py-4 w-full">
              <div className="text-xs text-muted-foreground mb-1">Waiting for confirmation</div>
              <div className="text-2xl font-black text-foreground">{secondsLeft}s</div>
              <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-1000"
                  style={{ width: `${(secondsLeft / 70) * 100}%` }}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Don't close this window — we'll confirm automatically when payment completes.
            </p>

            <button
              onClick={() => { stopPolling(); setStep("pay"); setPaymentId(null); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" /> Didn't receive prompt? Try again
            </button>
          </div>
        )}

        {/* ── STEP: success ─────────────────────────────────────────────────── */}
        {step === "success" && (
          <div className="p-8 flex flex-col items-center text-center space-y-5">
            <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">You're now Pro! 🎉</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Your WorkAbroad Hub Pro access is active. All premium features are unlocked.
              </p>
              {receipt && (
                <p className="text-xs text-muted-foreground mt-2">
                  M-Pesa receipt: <span className="font-mono font-semibold text-foreground">{receipt}</span>
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 transition-all shadow-md"
              data-testid="btn-close-success"
            >
              Start Using Pro Features →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
