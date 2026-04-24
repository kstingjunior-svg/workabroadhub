import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, Loader2, Shield, Square, CheckSquare, PhoneCall, RefreshCw, AlertCircle, Copy, Info, Star } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, getQueryFn, fetchCsrfToken } from "@/lib/queryClient";
import { fireSuccessConfetti } from "@/lib/confetti";
import type { UserSubscription } from "@shared/schema";
import { trackPaymentStarted, trackPaymentCompleted, trackServerEvent } from "@/lib/analytics";
import { formatPhone } from "@/lib/phone";
import { PRO_FEATURES } from "@/lib/plan-features";
import {
  applyReferralCode,
  getUserReferralProfile,
  REFERRAL_DISCOUNT_PCT,
} from "@/lib/firebase-referrals";

const PAYBILL_NUMBER = "4153025";

const MAX_POLL_DURATION_MS = 60000;

type PayMethod = "mpesa" | "paypal";

interface PaymentOptions {
  recommended: PayMethod;
  available: PayMethod[];
  country: string;
  countryName: string;
  fromHistory: boolean;
  alternativeOnFailure: PayMethod;
}

interface AlternativeSuggestion {
  alternative: PayMethod;
  message: string;
}

interface PayPalConfig {
  enabled: boolean;
  clientId: string | null;
  mode: "sandbox" | "live" | null;
}

const makeMpesaLabel = (amount: number) => ({
  label: "Pay with M-Pesa 🇰🇪",
  sublabel: `KES ${amount.toLocaleString()} · Safaricom STK Push`,
  icon: <span className="text-green-600 font-bold text-xs tracking-tight">M-PESA</span>,
});

interface Plan {
  planId: string;
  planName: string;
  price: number;
  features?: string[];
}

export default function Payment() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const paymentIdRef = useRef<string | null>(null);
  useEffect(() => { paymentIdRef.current = paymentId; }, [paymentId]);
  const [isPolling, setIsPolling] = useState(false);
  const [pollStartTime, setPollStartTime] = useState<number | null>(null);
  const [manualTxCode, setManualTxCode] = useState("");
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const [showManualPaybill, setShowManualPaybill] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [timedOut, setTimedOut] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [activatedPlanId, setActivatedPlanId] = useState<string | null>(null);
  const [mpesaReceipt, setMpesaReceipt] = useState<string | null>(null);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PayMethod | null>(null);
  const [showFailover, setShowFailover] = useState(false);
  const [paypalScriptReady, setPaypalScriptReady] = useState(false);
  const [paypalButtonRendered, setPaypalButtonRendered] = useState(false);
  const [paypalPending, setPaypalPending] = useState(false);
  const paypalPaymentIdRef = useRef<string | null>(null);
  const [receiptInput, setReceiptInput] = useState("");
  const [receiptPhone, setReceiptPhone] = useState("");
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptVerified, setReceiptVerified] = useState(false);
  const [pendingSecondsLeft, setPendingSecondsLeft] = useState(0);
  const [cancelledByUser, setCancelledByUser] = useState(false);
  const [resendUnlockSeconds, setResendUnlockSeconds] = useState(0);

  const [referralInput, setReferralInput] = useState("");
  const [referralApplying, setReferralApplying] = useState(false);
  const [referralApplied, setReferralApplied] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);

  const urlPlanId = new URLSearchParams(window.location.search).get("plan");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get("ref") || localStorage.getItem("ref");
    if (ref) {
      setRefCode(ref);
      localStorage.setItem("ref", ref);
    }
  }, []);

  // Auto-load any Firebase referral discount already applied to this user
  useEffect(() => {
    if (!user?.id) return;
    getUserReferralProfile(user.id)
      .then((profile) => {
        if (profile.discount >= REFERRAL_DISCOUNT_PCT) {
          setReferralApplied(true);
        }
      })
      .catch(console.error);
  }, [user?.id]);

  const handleApplyReferralCode = async () => {
    if (!user?.id) return;
    const code = referralInput.trim().toUpperCase();
    if (!code) return;
    setReferralApplying(true);
    setReferralError(null);
    const result = await applyReferralCode(code, user.id);
    setReferralApplying(false);
    if (result.ok) {
      setReferralApplied(true);
      setReferralInput("");
      toast({
        title: "Referral code applied! 🎉",
        description: basePaymentAmount
          ? `You got ${REFERRAL_DISCOUNT_PCT}% off — KES ${Math.round(basePaymentAmount * (1 - REFERRAL_DISCOUNT_PCT / 100)).toLocaleString()} total.`
          : `You got ${REFERRAL_DISCOUNT_PCT}% off your upgrade!`,
      });
    } else {
      const msg: Record<string, string> = {
        not_found: "That code doesn't exist. Double-check and try again.",
        expired: "This code has reached its maximum uses.",
        self_referral: "You can't use your own referral code.",
        already_used: "You've already applied a referral code.",
        transaction_aborted: "Code was used up by someone else just now. Try another.",
      };
      setReferralError(msg[result.reason] ?? "Could not apply code. Please try again.");
    }
  };

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 10 * 60 * 1000,
  });

  // Effective planId — "pro_referral" tells the pricing engine to apply the 20% referral discount.
  // Must be defined before the /api/price query so the query key is correct from the start.
  const effectivePlanId = referralApplied && urlPlanId === "pro" ? "pro_referral" : (urlPlanId ?? "pro");

  // Resolve the canonical price via the pricing engine.
  // Re-fetches automatically when effectivePlanId or country changes (e.g. referral applied, country detected).
  // Applies country PPP adjustments and referral/promo discounts — no hardcoded amounts.
  const { data: resolvedPrice, isLoading: priceLoading } = useQuery<{
    finalPrice: number;
    basePrice: number;
    countryPrice: number;
    discountType: string | null;
    discountValue: number;
    appliedPromo: string | null;
  } | null>({
    queryKey: ["/api/price", effectivePlanId, paymentOptions?.country],
    queryFn: async () => {
      const res = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: effectivePlanId,
          country: paymentOptions?.country,
        }),
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!effectivePlanId,
    staleTime: 30_000,
  });

  // Amount is always derived from the pricing engine — never hardcoded.
  const paymentAmount: number = resolvedPrice?.finalPrice ?? 0;
  const basePaymentAmount: number | null = resolvedPrice?.basePrice ?? null;
  const priceReady = !priceLoading && paymentAmount > 0;

  const { data: paypalConfig } = useQuery<PayPalConfig>({
    queryKey: ["/api/paypal/config"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 10 * 60 * 1000,
  });

  // Check for an in-flight STK push so we can block duplicate requests.
  const { data: pendingPayment, refetch: refetchPending } = useQuery<{
    hasPending: boolean;
    paymentId?: string;
    expiresAt?: string;
  }>({
    queryKey: ["/api/payments/pending"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 0,
    refetchInterval: 10_000,
    enabled: !!user,
  });

  // Countdown timer showing how many seconds until the pending STK expires.
  useEffect(() => {
    if (!pendingPayment?.hasPending || !pendingPayment.expiresAt) {
      setPendingSecondsLeft(0);
      return;
    }
    const update = () => {
      const secs = Math.max(0, Math.ceil((new Date(pendingPayment.expiresAt!).getTime() - Date.now()) / 1000));
      setPendingSecondsLeft(secs);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [pendingPayment]);

  // Load PayPal JS SDK when method is selected and config is ready
  useEffect(() => {
    if (!paypalConfig?.enabled || !paypalConfig.clientId) return;
    if (document.getElementById("paypal-sdk")) {
      setPaypalScriptReady(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "paypal-sdk";
    script.src = `https://www.paypal.com/sdk/js?client-id=${paypalConfig.clientId}&currency=USD&intent=capture`;
    script.async = true;
    script.onload = () => setPaypalScriptReady(true);
    document.body.appendChild(script);
  }, [paypalConfig]);

  const paymentAmountRef = { current: paymentAmount };

  const METHOD_LABELS: Record<string, { label: string; sublabel: string; icon: React.ReactNode }> = {
    mpesa: makeMpesaLabel(paymentAmount),
    paypal: {
      label: "Pay with PayPal 🌍",
      sublabel: `$${Math.max(1, Math.round(paymentAmount / 130 * 100) / 100).toFixed(2)} USD · Cards, PayPal balance`,
      icon: <span className="text-blue-700 font-bold text-xs tracking-tight">PAY<span className="text-blue-400">PAL</span></span>,
    },
  };

  // ── Step 5: Fetch payment options (recommendation + available methods) ──────
  const { data: paymentOptions, isLoading: optionsLoading } = useQuery<PaymentOptions>({
    queryKey: ["/api/payments/options"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Set selectedMethod to recommended once options load
  useEffect(() => {
    if (paymentOptions?.recommended && !selectedMethod) {
      setSelectedMethod(paymentOptions.recommended);
    }
  }, [paymentOptions, selectedMethod]);

  const { data: subscription } = useQuery<UserSubscription | null>({
    queryKey: ["/api/subscription"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (subscription?.status === "active") navigate("/dashboard");
  }, [subscription, navigate]);

  const pollEndpoint = urlPlanId
    ? `/api/subscriptions/poll/${paymentId}`
    : `/api/payments/${paymentId}/status`;

  const { data: paymentStatus } = useQuery<{ status: string; receipt?: string | null; planId?: string | null }>({
    queryKey: urlPlanId ? ["/api/subscriptions/poll", paymentId] : ["/api/payments", paymentId, "status"],
    queryFn: () => fetch(pollEndpoint, { credentials: "include" }).then((r) => r.json()),
    enabled: !!paymentId && isPolling,
    refetchInterval: 2000,
  });

  // ── Step 8: Failover suggestion ─────────────────────────────────────────────
  const { data: alternative } = useQuery<AlternativeSuggestion>({
    queryKey: ["/api/payments/suggest-alternative", { failedMethod: selectedMethod, country: paymentOptions?.country }],
    queryFn: () =>
      fetch(
        `/api/payments/suggest-alternative?failedMethod=${selectedMethod}&country=${paymentOptions?.country || "KE"}`,
      ).then((r) => r.json()),
    enabled: showFailover && !!selectedMethod,
  });

  useEffect(() => {
    if (paymentStatus?.status === "success") {
      setIsPolling(false);
      setPollStartTime(null);
      setPaymentSuccess(true);
      if (paymentStatus.receipt) setMpesaReceipt(paymentStatus.receipt);

      // Store the activated plan for the success screen
      const planId = paymentStatus.planId ?? urlPlanId ?? null;
      if (planId) setActivatedPlanId(planId);

      fireSuccessConfetti();
      trackPaymentCompleted(paymentAmount, "mpesa");
      trackServerEvent("payment_success", { amount: paymentAmount, method: "mpesa" });

      // Refresh plan + services so gated features unlock in the UI
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/plan"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

      const planLabel = planId
        ? planId.charAt(0).toUpperCase() + planId.slice(1)
        : selectedPlan?.planName ?? "Your";
      toast({
        title: `Payment Successful ✅`,
        description: `Your ${planLabel} plan is now active. All features are unlocked.`,
      });

      if (refCode && phoneNumber) {
        apiRequest("POST", "/api/referrals", {
          refCode,
          referredPhone: phoneNumber,
          paymentAmount: paymentAmount,
          commission: Math.round(paymentAmount * 0.10),
        }).then(() => localStorage.removeItem("ref")).catch(console.error);
      }

      setTimeout(() => navigate("/dashboard"), 3000);
    }
  }, [paymentStatus, navigate, toast, queryClient, refCode, phoneNumber]);

  // ── Real-time WebSocket: instant plan activation signal ──────────────────
  // Opens a /ws/user connection when a payment is in-flight OR on the timeout
  // screen. The server calls notifyUserPlanActivated() right after DB commit,
  // including from the orphan recovery path, so this fires instantly.
  useEffect(() => {
    if ((!isPolling && !timedOut) || !user?.id || paymentSuccess) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/user`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "identify", userId: user.id }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "plan_activated") {
          setIsPolling(false);
          setPollStartTime(null);
          setPaymentSuccess(true);
          if (msg.planId) setActivatedPlanId(msg.planId);
          fireSuccessConfetti();
          trackPaymentCompleted(paymentAmount, "mpesa");
          trackServerEvent("payment_success", { amount: paymentAmount, method: "mpesa" });
          queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
          queryClient.invalidateQueries({ queryKey: ["/api/user/plan"] });
          queryClient.invalidateQueries({ queryKey: ["/api/user/services"] });
          queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          const planLabel = msg.planId
            ? msg.planId.charAt(0).toUpperCase() + msg.planId.slice(1)
            : selectedPlan?.planName ?? "Your";
          toast({
            title: `Payment Successful ✅`,
            description: `Your ${planLabel} plan is now active. All features are unlocked.`,
          });
          setTimeout(() => navigate("/dashboard"), 3000);
        } else if (msg.type === "payment_failed") {
          // Safaricom sent back a failure — show the retry screen immediately
          // instead of waiting for the 30-second STK recovery poller.
          setIsPolling(false);
          setPollStartTime(null);
          setTimedOut(true);
          setShowFailover(true);
          setShowManualPaybill(true);
          if (msg.isCancelledByUser) setCancelledByUser(true);
        }
      } catch (_e) { /* ignore malformed messages */ }
    };

    ws.onerror = () => { /* non-fatal — polling handles fallback */ };

    return () => { ws.close(); };
  }, [isPolling, timedOut, user?.id, paymentSuccess]);

  // ── Background poll on timeout screen ────────────────────────────────────
  // When the user is on the timeout/failover screen and a paymentId exists,
  // silently poll every 5 seconds for up to 90 seconds. This catches server-side
  // auto-retries (orphan recovery) that succeed AFTER the frontend gave up.
  useEffect(() => {
    if (!timedOut || !paymentId || paymentSuccess || !urlPlanId) return;
    let attempts = 0;
    const MAX_ATTEMPTS = 18; // 18 × 5s = 90 seconds
    const id = setInterval(async () => {
      attempts++;
      if (attempts > MAX_ATTEMPTS) { clearInterval(id); return; }
      try {
        const res = await fetch(`/api/subscriptions/poll/${paymentId}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "success") {
          clearInterval(id);
          setPaymentSuccess(true);
          setTimedOut(false);
          setShowFailover(false);
          if (data.receipt) setMpesaReceipt(data.receipt);
          const planId = data.planId ?? urlPlanId ?? null;
          if (planId) setActivatedPlanId(planId);
          fireSuccessConfetti();
          trackPaymentCompleted(paymentAmount, "mpesa");
          queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
          queryClient.invalidateQueries({ queryKey: ["/api/user/plan"] });
          queryClient.invalidateQueries({ queryKey: ["/api/user/services"] });
          queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          const planLabel = planId ? planId.charAt(0).toUpperCase() + planId.slice(1) : "Your";
          toast({ title: "Payment Successful ✅", description: `Your ${planLabel} plan is now active. All features are unlocked.` });
          setTimeout(() => navigate("/dashboard"), 3000);
        }
      } catch { /* ignore — WS is the primary mechanism */ }
    }, 5000);
    return () => clearInterval(id);
  }, [timedOut, paymentId, paymentSuccess]);

  // Called automatically when the 60-second countdown reaches zero.
  // 1. Stops polling and shows the failover card.
  // 2. Attempts a last-chance STK Query to recover a payment the user already confirmed.
  // 3. If Safaricom doesn't confirm success, marks the DB payment as failed so it can be retried.
  const handleTimerExpire = useCallback(async () => {
    setIsPolling(false);
    setPollStartTime(null);
    setTimedOut(true);
    setShowFailover(true);
    setShowManualPaybill(true);

    const pid = paymentIdRef.current;
    if (!pid) return;

    // Last-chance STK Query — recovers real payments where callback was delayed
    try {
      const qRes = await apiRequest("POST", "/api/payments/query", { paymentId: pid });
      const qData = await qRes.json();

      if (qData.status === "completed") {
        // Payment actually went through — activate the plan
        setPaymentSuccess(true);
        setTimedOut(false);
        setShowFailover(false);
        queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/plan"] });
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        fireSuccessConfetti();
        toast({ title: "Payment Confirmed ✅", description: qData.receipt ? `Receipt: ${qData.receipt} — your plan is now active.` : "Your plan is now active." });
        setTimeout(() => navigate("/dashboard"), 3000);
        return; // Don't mark as failed
      }
    } catch {
      // STK Query unavailable — still proceed to mark as failed
    }

    // No confirmation from Safaricom — mark DB payment as failed
    apiRequest("POST", `/api/payments/${pid}/timeout`, {}).catch(() => {});
  }, [queryClient, navigate, toast]);

  // Countdown timer + timeout logic
  useEffect(() => {
    if (!isPolling || !pollStartTime) return;
    const ticker = setInterval(() => {
      const elapsed = Date.now() - pollStartTime;
      const remaining = Math.max(0, Math.ceil((MAX_POLL_DURATION_MS - elapsed) / 1000));
      setSecondsLeft(remaining);
      if (elapsed >= MAX_POLL_DURATION_MS) {
        handleTimerExpire();
      }
    }, 500);
    return () => clearInterval(ticker);
  }, [isPolling, pollStartTime, handleTimerExpire]);

  // Resend-unlock delay — "Resend Prompt" is hidden for the first 18 seconds.
  // This stops users reflexively tapping resend before the first prompt even arrives.
  useEffect(() => {
    if (!isPolling || !pollStartTime) {
      setResendUnlockSeconds(0);
      return;
    }
    setResendUnlockSeconds(18);
    const ticker = setInterval(() => {
      const elapsed = Math.floor((Date.now() - pollStartTime) / 1000);
      const remaining = Math.max(0, 18 - elapsed);
      setResendUnlockSeconds(remaining);
      if (remaining === 0) clearInterval(ticker);
    }, 1000);
    return () => clearInterval(ticker);
  }, [isPolling, pollStartTime]);

  // ── Step 7: Track method selection ──────────────────────────────────────────
  const trackSelection = useCallback((method: PayMethod) => {
    apiRequest("POST", "/api/payments/track-selection", {
      paymentMethod: method,
      country: paymentOptions?.country,
    }).catch(() => {});
  }, [paymentOptions]);

  const handleMethodSelect = (method: PayMethod) => {
    setSelectedMethod(method);
    trackSelection(method);
  };

  const paymentMutation = useMutation({
    mutationFn: async (data: { method: string; phoneNumber?: string }) => {
      if (urlPlanId) {
        const response = await apiRequest("POST", "/api/subscriptions/upgrade", {
          planId: effectivePlanId,
          phoneNumber: data.phoneNumber,
        });
        return response;
      }
      const response = await apiRequest("POST", "/api/payments/initiate", data);
      return response;
    },
    onSuccess: (data: any) => {
      setPaymentId(data.paymentId);
      setIsPolling(true);
      setTimedOut(false);
      setShowFailover(false);
      setSecondsLeft(60);
      setPollStartTime(Date.now());
    },
    onError: (error: any) => {
      // 409 = duplicate STK push blocked by the server — refetch pending and inform user
      if (error?.status === 409 || error?.message?.includes("pending")) {
        refetchPending();
        toast({
          title: "Payment Already In Progress",
          description: "Complete your previous M-Pesa payment first. Check your phone for the prompt.",
          variant: "destructive",
        });
        return;
      }
      setShowFailover(true);
      setShowManualPaybill(true);
      toast({
        title: "Payment Failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const manualConfirmMutation = useMutation({
    mutationFn: async (txCode: string) => {
      if (!paymentId) throw new Error("No payment reference. Please try sending the M-Pesa prompt first.");
      return apiRequest("POST", `/api/payments/${paymentId}/manual-confirm`, { transactionCode: txCode });
    },
    onSuccess: () => {
      setManualConfirmed(true);
      toast({
        title: "Payment Submitted",
        description: "We received your M-Pesa reference. We'll confirm within 30 minutes.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Could not submit your reference. Please contact support.",
        variant: "destructive",
      });
    },
  });

  const verifyReceiptMutation = useMutation({
    mutationFn: async ({ receipt, planId, phone }: { receipt: string; planId: string; phone: string }) => {
      const res = await apiRequest("POST", "/api/mpesa/verify-receipt", { receipt, planId, phone });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Verification failed");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      const plan = data?.plan || urlPlanId || null;
      if (plan) setActivatedPlanId(plan);
      setReceiptVerified(true);
      setPaymentSuccess(true);
      fireSuccessConfetti();
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/plan"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      const planLabel = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "Your";
      toast({ title: "Payment Successful ✅", description: `Your ${planLabel} plan is now active. All features are unlocked.` });
      setTimeout(() => navigate("/dashboard"), 3000);
    },
    onError: (error: Error) => {
      toast({ title: "Verification Failed", description: error.message, variant: "destructive" });
    },
  });

  // Clean STK retry — cancels the old payment, gets a fresh CheckoutRequestID.
  const retryMutation = useMutation({
    mutationFn: async (oldPaymentId: string) => {
      const res = await apiRequest("POST", `/api/payments/${oldPaymentId}/stk-retry`, {});
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.message || "Retry failed"), { status: res.status });
      return data as { success: boolean; paymentId: string; checkoutRequestId?: string; message: string };
    },
    onSuccess: (data) => {
      // Switch polling to the new payment ID — old CheckoutRequestID is discarded
      setPaymentId(data.paymentId);
      setIsPolling(true);
      setTimedOut(false);
      setShowFailover(false);
      setShowManualPaybill(false);
      setSecondsLeft(60);
      setPollStartTime(Date.now());
      refetchPending();
      toast({ title: "Prompt Resent", description: "Check your phone for the new M-Pesa PIN request." });
    },
    onError: (error: any) => {
      // Phone missing → fall back to fresh payment form so user can re-enter
      if (error?.status === 400) {
        setPaymentId(null);
        setIsPolling(false);
        setTimedOut(false);
        setShowFailover(false);
        toast({ title: "Please Re-enter Phone", description: error.message, variant: "destructive" });
        return;
      }
      setShowFailover(true);
      setShowManualPaybill(true);
      toast({ title: "Retry Failed", description: error.message || "Could not resend prompt. Try again.", variant: "destructive" });
    },
  });

  // STK Query — asks Safaricom directly if the payment went through.
  // Recovers stuck payments where the callback was never delivered.
  const queryPaymentMutation = useMutation({
    mutationFn: async () => {
      const body: any = {};
      if (paymentId) body.paymentId = paymentId;
      const res = await apiRequest("POST", "/api/payments/query", body);
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.message || "Query failed"), { status: res.status });
      return data as { status: string; recovered?: boolean; receipt?: string; plan?: string; expiresAt?: string; resultCode?: number; message: string };
    },
    onSuccess: (data) => {
      if (data.status === "completed") {
        setPaymentSuccess(true);
        setIsPolling(false);
        setTimedOut(false);
        setShowFailover(false);
        fireSuccessConfetti();
        queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/plan"] });
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        toast({ title: "Payment Confirmed ✅", description: data.receipt ? `Receipt: ${data.receipt} — your plan is now active.` : "Your plan is now active." });
        setTimeout(() => navigate("/dashboard"), 3000);
      } else if (data.status === "failed") {
        setIsPolling(false);
        setShowFailover(true);
        toast({ title: "Payment Failed", description: data.message || "The payment was not completed. Please try again.", variant: "destructive" });
      } else {
        // Still pending
        toast({ title: "Still Processing", description: data.message || "M-Pesa hasn't confirmed yet. Wait a moment and try again." });
      }
    },
    onError: (error: any) => {
      if (error?.status === 502) {
        toast({ title: "Safaricom Unreachable", description: "Could not contact Safaricom. Check your connection and try again.", variant: "destructive" });
      } else if (error?.status === 400) {
        toast({ title: "No STK Request Found", description: "No active M-Pesa prompt to check. Please start a new payment.", variant: "destructive" });
      } else {
        toast({ title: "Status Check Failed", description: error.message || "Could not verify payment status.", variant: "destructive" });
      }
    },
  });

  const handleMpesaPayment = useCallback(() => {
    if (!priceReady) {
      toast({ title: "Loading price…", description: "Plan price is still loading. Please wait a moment.", variant: "destructive" });
      return;
    }
    if (!phoneNumber.replace(/\s+/g, "").match(/^(?:254|\+254|0)?[71]\d{8}$/)) {
      toast({
        title: "Invalid Phone Number",
        description: "Enter a valid Safaricom number: 07XXXXXXXX, 01XXXXXXXX, or +254XXXXXXXXX",
        variant: "destructive",
      });
      return;
    }
    // Block if user already has a live STK push in flight (different from the one being tracked)
    if (pendingPayment?.hasPending && pendingPayment.paymentId !== paymentId) {
      toast({
        title: "Payment Already In Progress",
        description: `Complete your previous M-Pesa payment first. It expires in ${pendingSecondsLeft > 0 ? `${pendingSecondsLeft}s` : "a moment"}.`,
        variant: "destructive",
      });
      return;
    }
    trackPaymentStarted(paymentAmount, "mpesa");
    trackServerEvent("click_pay", { amount: paymentAmount, method: "mpesa" });
    paymentMutation.mutate({ method: "mpesa", phoneNumber });
  }, [phoneNumber, paymentMutation, toast, pendingPayment, pendingSecondsLeft, paymentId, priceReady, basePaymentAmount]);

  const handleRetry = () => {
    setManualTxCode("");
    setManualConfirmed(false);
    setCancelledByUser(false);
    if (paymentId) {
      // Has an existing payment — cancel it cleanly and issue a fresh STK
      retryMutation.mutate(paymentId);
    } else {
      // No payment yet — just kick off a fresh initiation
      setTimedOut(false);
      setShowFailover(false);
      setShowManualPaybill(false);
      handleMpesaPayment();
    }
  };

  const switchToAlternative = () => {
    if (alternative?.alternative) {
      handleMethodSelect(alternative.alternative);
      setTimedOut(false);
      setShowFailover(false);
      setShowManualPaybill(false);
      setManualTxCode("");
      setManualConfirmed(false);
    }
  };

  const isRetrying = retryMutation.isPending;
  const isProcessing = paymentMutation.isPending || isPolling;
  const effectiveMethod = (selectedMethod ?? paymentOptions?.recommended ?? "mpesa") as PayMethod;

  // Update the paymentAmountRef on every render so PayPal callbacks get the fresh value
  paymentAmountRef.current = paymentAmount;

  // ── PayPal button renderer ───────────────────────────────────────────────────
  // Runs whenever method switches to "paypal" or the SDK loads
  useEffect(() => {
    if (effectiveMethod !== "paypal" || !paypalScriptReady) return;
    const container = document.getElementById("paypal-button-container");
    if (!container) return;
    // Clear previous render
    container.innerHTML = "";
    setPaypalButtonRendered(false);

    const win = window as any;
    if (!win.paypal) return;

    win.paypal.Buttons({
      style: { layout: "vertical", color: "blue", shape: "rect", label: "pay" },
      createOrder: async () => {
        if (!priceReady) throw new Error("Plan price not yet loaded. Please try again.");
        const csrfToken = await fetchCsrfToken();
        const serviceId = `plan_${effectivePlanId}`;
        const res = await fetch("/api/paypal/create-order", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          body: JSON.stringify({
            amount: paymentAmountRef.current,
            description: "WorkAbroad Hub — Career Consultation",
            serviceId,
            refCode: refCode || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "PayPal order failed");
        // Store the DB paymentId so we can pass it to capture for instant unlock
        paypalPaymentIdRef.current = data.paymentId || null;
        return data.paypalOrderId;
      },
      onApprove: async (data: any) => {
        setPaypalPending(true);
        try {
          const csrfToken = await fetchCsrfToken();
          const res = await fetch("/api/paypal/capture-order", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
            body: JSON.stringify({
              paypalOrderId: data.orderID,
              paymentId: paypalPaymentIdRef.current,
            }),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.message || "Capture failed");
          const plan = result.planActivated || urlPlanId || "pro";
          setActivatedPlanId(plan);
          setPaymentSuccess(true);
          fireSuccessConfetti();
          trackPaymentCompleted(paymentAmountRef.current, "paypal" as any);
          queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
          queryClient.invalidateQueries({ queryKey: ["/api/user/plan"] });
          queryClient.invalidateQueries({ queryKey: ["/api/user/services"] });
          queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
          toast({
            title: `Payment Successful ✅`,
            description: `Your ${planLabel} plan is now active. PayPal Ref: ${result.transactionId}`,
          });
          setTimeout(() => navigate("/dashboard"), 3000);
        } catch (err: any) {
          toast({ title: "Payment Failed", description: err.message, variant: "destructive" });
        } finally {
          setPaypalPending(false);
        }
      },
      onError: (err: any) => {
        toast({ title: "PayPal Error", description: err?.message ?? "PayPal encountered an error.", variant: "destructive" });
      },
      onCancel: () => {
        toast({ title: "Payment Cancelled", description: "You cancelled the PayPal payment." });
      },
    })
      .render("#paypal-button-container")
      .then(() => setPaypalButtonRendered(true))
      .catch(() => {});
  }, [effectiveMethod, paypalScriptReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 6: Payment method selector ─────────────────────────────────────────
  const renderMethodSelector = () => {
    const methods = paymentOptions?.available ?? ["mpesa"];
    const recommended = paymentOptions?.recommended ?? "mpesa";
    if (methods.length <= 1) return null;

    return (
      <div className="space-y-2" role="radiogroup" aria-label="Choose payment method">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Choose payment method:
        </p>
        {methods.map((method) => {
          const isSelected = effectiveMethod === method;
          const isRecommended = recommended === method;
          const info = METHOD_LABELS[method] ?? METHOD_LABELS.mpesa;

          return (
            <button
              key={method}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleMethodSelect(method as PayMethod)}
              data-testid={`button-select-${method}`}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                isSelected
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <div className={`flex items-center justify-center h-9 w-9 rounded-full shrink-0 ${
                isSelected ? "bg-green-100 dark:bg-green-800" : "bg-gray-100 dark:bg-gray-700"
              }`}>
                {info.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm ${isSelected ? "text-green-700 dark:text-green-300" : "text-gray-800 dark:text-gray-200"}`}>
                    {info.label}
                  </span>
                  {isRecommended && (
                    <span
                      className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full font-medium"
                      data-testid={`badge-recommended-${method}`}
                    >
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden="true" />
                      {paymentOptions?.fromHistory ? "Your usual method" : "Recommended"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{info.sublabel}</p>
              </div>
              {isSelected && (
                <CheckCircle className="h-5 w-5 text-green-500 shrink-0" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  // ── Step 8: Failover suggestion banner ───────────────────────────────────────
  const renderFailoverBanner = () => {
    if (!showFailover || !alternative) return null;
    return (
      <div
        className="mt-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200"
        role="alert"
        data-testid="section-failover-suggestion"
      >
        <p className="font-semibold mb-1">Having trouble?</p>
        <p className="text-xs leading-relaxed mb-2">{alternative.message}</p>
        <button
          type="button"
          onClick={switchToAlternative}
          className="text-xs font-semibold text-blue-700 dark:text-blue-300 underline hover:no-underline"
          data-testid="button-switch-alternative"
        >
          Switch to {METHOD_LABELS[alternative.alternative]?.label ?? alternative.alternative} instead
        </button>
      </div>
    );
  };

  // ── Manual PayBill fallback ────────────────────────────────────────────────
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    toast({ title: `${label} copied`, description: text });
  };

  const accountRef = paymentId ? paymentId.substring(0, 8).toUpperCase() : "CONSULT";

  const renderManualPaybillBox = () => {
    if (!showManualPaybill) return null;

    if (manualConfirmed) {
      return (
        <div
          className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-sm"
          data-testid="section-manual-payment-confirmed"
          role="status"
        >
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
            <p className="font-semibold text-green-800 dark:text-green-300">Reference submitted!</p>
          </div>
          <p className="text-green-700 dark:text-green-400 text-xs leading-relaxed">
            We'll verify your M-Pesa payment and confirm your consultation within 30 minutes during business hours (Mon–Fri 8am–6pm EAT). Check your WhatsApp for updates.
          </p>
        </div>
      );
    }

    return (
      <div
        className="mt-4 border border-orange-200 dark:border-orange-800 rounded-xl overflow-hidden"
        data-testid="section-manual-paybill"
      >
        <div className="bg-orange-50 dark:bg-orange-900/20 px-4 py-3 border-b border-orange-200 dark:border-orange-800">
          <p className="font-semibold text-orange-800 dark:text-orange-300 text-sm flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" />
            Pay manually via M-Pesa PayBill
          </p>
          <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">
            If the automatic prompt didn't work, you can pay directly from your M-Pesa menu.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 px-4 py-3 space-y-3">
          {/* PayBill steps */}
          <ol className="text-xs text-gray-700 dark:text-gray-300 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>Go to <strong>M-Pesa</strong> → <strong>Lipa na M-Pesa</strong> → <strong>Pay Bill</strong></li>
            <li>Enter Business Number: <strong className="font-mono text-orange-700 dark:text-orange-400">{PAYBILL_NUMBER}</strong></li>
            <li>Enter Account Number: <strong className="font-mono text-orange-700 dark:text-orange-400">{accountRef}</strong></li>
            <li>Enter Amount: <strong>KES {paymentAmount.toLocaleString()}</strong></li>
            <li>Enter your M-Pesa PIN and confirm</li>
          </ol>

          {/* Copy buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => copyToClipboard(PAYBILL_NUMBER, "PayBill number")}
              className="flex items-center justify-center gap-1.5 text-xs border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-lg py-2 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
              data-testid="button-copy-paybill"
            >
              <Copy className="h-3.5 w-3.5" /> Copy {PAYBILL_NUMBER}
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard(accountRef, "Account reference")}
              className="flex items-center justify-center gap-1.5 text-xs border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-lg py-2 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
              data-testid="button-copy-account-ref"
            >
              <Copy className="h-3.5 w-3.5" /> Copy {accountRef}
            </button>
          </div>

          {/* Transaction code submission */}
          <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              After paying, enter your M-Pesa confirmation code:
            </p>
            <div className="flex gap-2">
              <Input
                value={manualTxCode}
                onChange={e => setManualTxCode(e.target.value.toUpperCase())}
                placeholder="e.g. NXX123456789"
                className="font-mono text-sm h-9 flex-1"
                maxLength={15}
                data-testid="input-manual-tx-code"
              />
              <button
                type="button"
                onClick={() => manualConfirmMutation.mutate(manualTxCode)}
                disabled={manualTxCode.length < 8 || manualConfirmMutation.isPending}
                className="flex items-center gap-1.5 px-3 text-xs font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors whitespace-nowrap"
                data-testid="button-submit-manual-tx"
              >
                {manualConfirmMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : "Submit"}
              </button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Your code is in the SMS M-Pesa sends after payment (e.g. <span className="font-mono">NXX123456789</span>)
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      className="min-h-screen flex items-center bg-gray-100 dark:bg-gray-900 px-4 py-8 pb-bottom-nav"
      aria-labelledby="payment-heading"
    >
      <div className="w-full max-w-md mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-6"
          aria-label="Go back to home page"
          data-testid="link-back-home"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to home
        </Link>

        <Card className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <CardContent className="p-6 space-y-6">

            {/* ── Success state ── */}
            {paymentSuccess ? (
              <div
                className="text-center py-8 space-y-5"
                role="status"
                aria-live="polite"
                data-testid="section-payment-success"
              >
                {/* Success icon */}
                <div className="relative mx-auto h-20 w-20">
                  <div className="h-20 w-20 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                    <CheckCircle className="h-12 w-12 text-green-600" />
                  </div>
                </div>

                {/* Headline */}
                <div>
                  <h2 className="text-2xl font-bold text-green-600 dark:text-green-400">Payment Successful!</h2>
                  {activatedPlanId ? (
                    <p className="text-base font-semibold text-gray-800 dark:text-gray-100 mt-1">
                      Your account is now upgraded to{" "}
                      <span className={`${activatedPlanId === "pro" ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"}`}>
                        {activatedPlanId.charAt(0).toUpperCase() + activatedPlanId.slice(1)} Plan
                      </span>
                    </p>
                  ) : (
                    <p className="text-base font-semibold text-gray-800 dark:text-gray-100 mt-1">
                      Your account is now upgraded
                    </p>
                  )}
                </div>

                {/* Details */}
                <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="text-success-message">
                  All features are now unlocked. Redirecting you to the dashboard…
                </p>

                {/* Receipt */}
                {mpesaReceipt && (
                  <div
                    className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-2 mx-auto"
                    data-testid="text-mpesa-receipt"
                  >
                    <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="text-sm text-green-800 dark:text-green-300">
                      M-Pesa receipt: <strong className="font-mono tracking-wide">{mpesaReceipt}</strong>
                    </span>
                  </div>
                )}

                {/* Manual go-to-dashboard button (in case auto-redirect is slow) */}
                <button
                  onClick={() => navigate("/dashboard")}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-semibold transition-colors"
                  data-testid="button-go-to-dashboard"
                >
                  <CheckCircle className="h-4 w-4" />
                  Go to Dashboard
                </button>
              </div>

            /* ── Timeout / Cancelled state ── */
            ) : timedOut ? (
              <div
                className="text-center py-6 space-y-4"
                role="alert"
                aria-live="assertive"
                data-testid="section-payment-timeout"
              >
                <div className={`h-14 w-14 rounded-full flex items-center justify-center mx-auto ${cancelledByUser ? "bg-red-100" : "bg-amber-100"}`}>
                  <AlertCircle className={`h-8 w-8 ${cancelledByUser ? "text-red-600" : "text-amber-600"}`} />
                </div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                  {cancelledByUser ? "Payment Cancelled" : "No response received"}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {cancelledByUser
                    ? "You cancelled the M-Pesa PIN prompt. That's okay — tap below to send a new prompt and try again."
                    : "The M-Pesa prompt may still be on its way, or it may have expired. Check your M-Pesa messages — if you received a confirmation, your payment went through."}
                </p>
                <div className="flex flex-col gap-3 pt-2">
                  <button
                    onClick={handleRetry}
                    disabled={paymentMutation.isPending || isRetrying || queryPaymentMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition-colors"
                    data-testid="button-retry-payment"
                  >
                    {(paymentMutation.isPending || isRetrying) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {isRetrying ? "Sending New Prompt…" : "Resend M-Pesa Prompt"}
                  </button>

                  {/* STK Query — check Safaricom directly if the callback was missed */}
                  {paymentId && (
                    <button
                      onClick={() => queryPaymentMutation.mutate()}
                      disabled={queryPaymentMutation.isPending || isRetrying || paymentMutation.isPending}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition-colors"
                      data-testid="button-check-payment-status"
                    >
                      {queryPaymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      {queryPaymentMutation.isPending ? "Checking with Safaricom…" : "Check Payment Status"}
                    </button>
                  )}

                  {/* Receipt verification fallback */}
                  {urlPlanId && !showReceiptForm && (
                    <button
                      onClick={() => setShowReceiptForm(true)}
                      className="w-full text-sm text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700 rounded-xl py-2.5 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                      data-testid="button-show-receipt-form"
                    >
                      Already paid? Enter your M-Pesa receipt
                    </button>
                  )}

                  {urlPlanId && showReceiptForm && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-3 text-left">
                      <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                        Enter your M-Pesa receipt to unlock access
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300">
                        Find it in your M-Pesa SMS — it looks like "QHJ8QKXYZ" (10–12 letters and numbers)
                      </p>
                      <Input
                        value={receiptInput}
                        onChange={e => setReceiptInput(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                        placeholder="e.g. QHJ8QKXYZ12"
                        className="font-mono uppercase text-sm"
                        maxLength={20}
                        data-testid="input-mpesa-receipt"
                      />
                      <Input
                        value={receiptPhone}
                        onChange={e => setReceiptPhone(formatPhone(e.target.value))}
                        placeholder="Phone that paid (07XXXXXXXX)"
                        className="text-sm"
                        data-testid="input-receipt-phone"
                      />
                      <button
                        onClick={() => {
                          if (!receiptInput || receiptInput.length < 8) {
                            toast({ title: "Invalid receipt", description: "Enter the receipt from your M-Pesa SMS", variant: "destructive" });
                            return;
                          }
                          if (!receiptPhone) {
                            toast({ title: "Phone required", description: "Enter the phone number that made the payment", variant: "destructive" });
                            return;
                          }
                          verifyReceiptMutation.mutate({ receipt: receiptInput, planId: urlPlanId, phone: receiptPhone });
                        }}
                        disabled={verifyReceiptMutation.isPending}
                        className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-2.5 rounded-lg font-semibold text-sm transition-colors"
                        data-testid="button-verify-receipt"
                      >
                        {verifyReceiptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                        Verify & Unlock Access
                      </button>
                    </div>
                  )}

                  {/* Step 8: Failover suggestion */}
                  {renderFailoverBanner()}
                  {/* Manual PayBill fallback */}
                  {renderManualPaybillBox()}
                  <Link
                    href="/"
                    className="text-sm text-gray-500 dark:text-gray-400 underline text-center"
                    data-testid="link-home-from-timeout"
                  >
                    Back to home
                  </Link>
                </div>
              </div>

            /* ── Processing / waiting for PIN ── */
            ) : isProcessing ? (
              <div
                className="text-center py-6 space-y-4"
                role="status"
                aria-live="polite"
                aria-busy="true"
                data-testid="section-payment-processing"
              >
                {/* Pulsing phone icon */}
                <div className="relative h-20 w-20 mx-auto">
                  <div className="absolute inset-0 rounded-full bg-green-100 dark:bg-green-900/30 animate-ping opacity-40" />
                  <div className="relative h-20 w-20 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                    <PhoneCall className="h-9 w-9 text-green-600" />
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">M-Pesa Prompt Sent!</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Sent to <span className="font-semibold text-gray-700 dark:text-gray-300">{phoneNumber}</span>
                  </p>
                </div>

                {/* ⚠️ Critical instruction — most prominent element */}
                <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-400 dark:border-amber-600 rounded-xl p-4 text-left">
                  <p className="font-bold text-amber-900 dark:text-amber-200 text-sm flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Action required on your phone
                  </p>
                  <ol className="space-y-2">
                    <li className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                      <span className="flex items-center justify-center bg-amber-400 dark:bg-amber-600 text-white rounded-full h-5 w-5 text-xs font-bold shrink-0 mt-0.5">1</span>
                      <span>A <strong>pop-up from M-Pesa</strong> will appear on your phone screen</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                      <span className="flex items-center justify-center bg-amber-400 dark:bg-amber-600 text-white rounded-full h-5 w-5 text-xs font-bold shrink-0 mt-0.5">2</span>
                      <span><strong>Enter your M-Pesa PIN</strong> — do not press Cancel</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                      <span className="flex items-center justify-center bg-amber-400 dark:bg-amber-600 text-white rounded-full h-5 w-5 text-xs font-bold shrink-0 mt-0.5">3</span>
                      <span>Wait for the <strong>M-Pesa confirmation SMS</strong> — your access will unlock automatically</span>
                    </li>
                  </ol>
                </div>

                {/* Countdown ring */}
                <div className="flex flex-col items-center gap-1" aria-live="polite">
                  <div className="relative h-16 w-16">
                    <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
                      <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-gray-200 dark:text-gray-700" />
                      <circle
                        cx="32" cy="32" r="28"
                        fill="none" stroke="currentColor" strokeWidth="4"
                        strokeDasharray={`${2 * Math.PI * 28}`}
                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - secondsLeft / 60)}`}
                        strokeLinecap="round"
                        className="text-green-500 transition-all duration-500"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-800 dark:text-gray-100">
                      {secondsLeft}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">seconds to enter your PIN</p>
                </div>

                {/* Action buttons */}
                <div className="w-full space-y-2 pt-1">
                  {/* Check status — available immediately once we have a paymentId */}
                  {paymentId && (
                    <button
                      onClick={() => queryPaymentMutation.mutate()}
                      disabled={queryPaymentMutation.isPending || isRetrying}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors"
                      data-testid="button-check-payment-status-polling"
                    >
                      {queryPaymentMutation.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <CheckCircle className="h-4 w-4" />}
                      {queryPaymentMutation.isPending ? "Checking with Safaricom…" : "I already entered my PIN"}
                    </button>
                  )}

                  {/* Resend prompt — locked for first 18s to stop impulse taps */}
                  {resendUnlockSeconds > 0 ? (
                    <div
                      className="w-full flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600 py-2.5 rounded-xl text-sm cursor-not-allowed select-none"
                      data-testid="button-retry-payment-polling-locked"
                      aria-disabled="true"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resend available in {resendUnlockSeconds}s
                    </div>
                  ) : (
                    <button
                      onClick={handleRetry}
                      disabled={isRetrying || queryPaymentMutation.isPending}
                      className="w-full flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 py-2.5 rounded-xl font-medium text-sm transition-colors"
                      data-testid="button-retry-payment-polling"
                    >
                      {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {isRetrying ? "Sending New Prompt…" : "Didn't get a prompt? Resend"}
                    </button>
                  )}
                </div>
              </div>

            /* ── Payment form ── */
            ) : (
              <div className="space-y-5">
                <div>
                  <h2 id="payment-heading" className="text-2xl font-bold mb-2">
                    {selectedPlan ? `${selectedPlan.planName} Plan` : "Premium Access"}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-3">
                    Pay{" "}
                    {referralApplied && (
                      <span className="line-through opacity-50 text-sm mr-1">KES {basePaymentAmount.toLocaleString()}</span>
                    )}
                    <strong className={referralApplied ? "text-green-600 dark:text-green-400" : "text-foreground"}>
                      KES {paymentAmount.toLocaleString()}
                    </strong>
                    {referralApplied && (
                      <span className="ml-1.5 text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                        {REFERRAL_DISCOUNT_PCT}% off
                      </span>
                    )}{" "}
                    {selectedPlan ? `to activate ${selectedPlan.planName} plan.` : "to unlock full career consultation access."}
                  </p>

                  <div
                    className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200 mb-3"
                    data-testid="text-payment-disclaimer"
                  >
                    <p className="font-semibold mb-1">Important:</p>
                    <p className="leading-relaxed">
                      This fee covers a professional career consultation service — 1-on-1 WhatsApp session, document preparation assistance, and verified resources. We do not guarantee employment, visa approval, or job placement.
                    </p>
                  </div>

                  <div
                    className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm space-y-1 mb-3"
                    role="list"
                    aria-label="What's included"
                  >
                    <p className="font-semibold text-blue-900 dark:text-blue-100">What you unlock:</p>
                    <ul className="text-blue-800 dark:text-blue-200 space-y-1">
                      {PRO_FEATURES.map((item) => (
                        <li key={item} className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* ── Referral code input ── */}
                {!referralApplied ? (
                  <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20 p-3">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">
                      Have a referral code? Get {REFERRAL_DISCOUNT_PCT}% off
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={referralInput}
                        onChange={(e) => {
                          setReferralInput(e.target.value.toUpperCase());
                          setReferralError(null);
                        }}
                        placeholder="e.g. WAH1A2B3C"
                        className="text-sm h-9 uppercase"
                        maxLength={12}
                        data-testid="input-referral-code"
                        onKeyDown={(e) => e.key === "Enter" && handleApplyReferralCode()}
                      />
                      <button
                        type="button"
                        onClick={handleApplyReferralCode}
                        disabled={referralApplying || !referralInput.trim()}
                        className="shrink-0 px-3 h-9 rounded-md bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-1"
                        data-testid="button-apply-referral"
                      >
                        {referralApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                      </button>
                    </div>
                    {referralError && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1" data-testid="text-referral-error">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {referralError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20 p-3 flex items-center justify-between" data-testid="referral-discount-applied">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                          Referral discount applied — {REFERRAL_DISCOUNT_PCT}% off!
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-400">
                          <span className="line-through opacity-60">KES {basePaymentAmount.toLocaleString()}</span>
                          {" → "}
                          <strong>KES {paymentAmount.toLocaleString()}</strong>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 6: Payment method selector — recommended first */}
                {optionsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500" data-testid="loading-payment-options">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Finding best payment method for you…
                  </div>
                ) : (
                  renderMethodSelector()
                )}

                {/* ── M-Pesa form (shown when mpesa is selected) ── */}
                {(effectiveMethod === "mpesa") && (
                  <form onSubmit={(e) => { e.preventDefault(); handleMpesaPayment(); }} aria-label="M-Pesa payment form">

                    {/* Pending payment warning — shown when another STK is already in flight */}
                    {pendingPayment?.hasPending && pendingPayment.paymentId !== paymentId && (
                      <div
                        className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl px-4 py-3 mb-4"
                        data-testid="alert-pending-payment"
                        role="alert"
                      >
                        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                            Complete previous payment first
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                            You already have an M-Pesa prompt in progress. Check your phone and enter your PIN.
                            {pendingSecondsLeft > 0 && (
                              <> Expires in <span className="font-semibold tabular-nums">{Math.floor(pendingSecondsLeft / 60)}:{String(pendingSecondsLeft % 60).padStart(2, "0")}</span>.</>
                            )}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label htmlFor="phone" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Safaricom M-Pesa Number
                      </label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="07XXXXXXXX"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(formatPhone(e.target.value))}
                        className="w-full px-4 py-3 text-base rounded-lg"
                        data-testid="input-phone"
                        aria-label="Enter your M-Pesa Safaricom phone number"
                        autoComplete="tel"
                        inputMode="tel"
                        required
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Must be a Safaricom number (07XX). M-Pesa only works on Safaricom lines.
                      </p>
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => setAgreedToTerms(!agreedToTerms)}
                        className="flex items-start gap-3 text-left w-full"
                        data-testid="button-agree-terms"
                        aria-pressed={agreedToTerms}
                      >
                        {agreedToTerms
                          ? <CheckSquare className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                          : <Square className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />}
                        <span className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                          I confirm I am 18+ and agree to the{" "}
                          <a href="/terms-of-service" target="_blank" className="text-blue-600 underline" data-testid="link-terms-payment">Terms of Service</a>,{" "}
                          <a href="/privacy-policy" target="_blank" className="text-blue-600 underline" data-testid="link-privacy-payment">Privacy Policy</a>,{" "}
                          <a href="/refund-policy" target="_blank" className="text-blue-600 underline" data-testid="link-refund-payment">Refund Policy</a>, and{" "}
                          <a href="/legal-disclaimer" target="_blank" className="text-blue-600 underline" data-testid="link-disclaimer-payment">Legal Disclaimer</a>.
                          I understand this is a career consultation fee and does not guarantee employment.
                        </span>
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={!phoneNumber || !agreedToTerms || paymentMutation.isPending || (!!pendingPayment?.hasPending && pendingPayment.paymentId !== paymentId)}
                      className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed text-white py-4 rounded-xl text-lg font-semibold transition-colors mt-4 flex items-center justify-center gap-2"
                      data-testid="button-pay-mpesa"
                      aria-label={`Pay ${paymentAmount.toLocaleString()} Kenyan Shillings with M-Pesa`}
                    >
                      {paymentMutation.isPending ? (
                        <><Loader2 className="h-5 w-5 animate-spin" />Sending prompt…</>
                      ) : (
                        `Pay KES ${paymentAmount.toLocaleString()} via M-Pesa`
                      )}
                    </button>

                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-3">
                      You'll receive an STK push on your phone. Enter your PIN to confirm.
                    </p>

                    {renderFailoverBanner()}
                    {renderManualPaybillBox()}

                    <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t mt-3">
                      <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Secured by Safaricom M-Pesa. Your information is protected.</span>
                    </div>
                  </form>
                )}

                {/* ── PayPal section (shown when paypal is selected) ── */}
                {effectiveMethod === "paypal" && (
                  <div className="space-y-4" data-testid="section-paypal">

                    {/* Sandbox testing notice */}
                    {paypalConfig?.mode === "sandbox" && (
                      <div
                        className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg px-3 py-2 text-xs text-yellow-800 dark:text-yellow-300"
                        data-testid="badge-paypal-sandbox"
                      >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span><strong>Sandbox / Test Mode</strong> — No real money will be charged. Use PayPal sandbox test credentials.</span>
                      </div>
                    )}

                    {/* Info box */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-200">
                      <p className="font-semibold mb-1">PayPal Secure Checkout</p>
                      <p className="leading-relaxed">
                        You will be charged approximately{" "}
                        <strong>
                          ${Math.max(1, Math.round((paymentAmount / 130) * 100) / 100).toFixed(2)} USD
                        </strong>{" "}
                        (≈ KES {paymentAmount.toLocaleString()}). Pay with your PayPal balance, debit card, or credit card.
                      </p>
                    </div>

                    {/* Not configured warning */}
                    {!paypalConfig?.enabled && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300">
                        <p className="font-semibold">PayPal not yet configured</p>
                        <p className="mt-0.5">Please switch to M-Pesa or contact support.</p>
                      </div>
                    )}

                    {/* SDK loading */}
                    {paypalConfig?.enabled && !paypalScriptReady && (
                      <div className="flex items-center justify-center gap-2 py-5 text-sm text-gray-500 dark:text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading PayPal…
                      </div>
                    )}

                    {/* Capture in progress */}
                    {paypalPending && (
                      <div className="flex items-center justify-center gap-2 py-5 text-sm text-blue-700 dark:text-blue-300">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Confirming your payment…
                      </div>
                    )}

                    {/* PayPal Smart Button rendered here by SDK */}
                    <div
                      id="paypal-button-container"
                      data-testid="container-paypal-buttons"
                      className="min-h-[50px]"
                    />

                    <div className="flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-800">
                      <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>256-bit SSL secured by PayPal. We never see your card details.</span>
                    </div>
                  </div>
                )}

              </div>
            )}
          </CardContent>
        </Card>

        {!paymentSuccess && !isProcessing && !timedOut && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4 px-4" role="note">
            This is a professional career consultation service fee. We do NOT sell jobs or guarantee employment.
          </p>
        )}
      </div>
    </section>
  );
}
