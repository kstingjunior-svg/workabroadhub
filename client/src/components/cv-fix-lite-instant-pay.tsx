// ─────────────────────────────────────────────────────────────────────────────
// CV Fix Lite — Instant-Pay Modal
//
// Closes the highest-leverage conversion loop on the platform: the moment
// someone sees their CV score on /tools/ats-cv-checker, they should be able
// to tap "Fix it for KES 99" and have an M-Pesa STK push fire on their
// phone in two clicks. No re-upload, no second page, no friction.
//
// FLOW:
//   1. Modal opens with phone pre-filled from /api/auth/user.
//   2. User taps "Send M-Pesa prompt" -> POST /api/services/order/cv_fix_lite
//      with the cv FILE they already uploaded for the check (passed in props).
//   3. Server returns orderId + price.
//   4. POST /api/payments/initiate with { orderId, method: "mpesa", phoneNumber }.
//   5. Server triggers STK push to their phone.
//   6. UI shows "Check your phone for the M-Pesa prompt — enter your PIN".
//   7. Poll /api/mpesa/status/:checkoutRequestId every 2s.
//   8. On success -> redirect to /service-orders/:orderId where the AI is
//      already processing the fix.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone, CheckCircle2, AlertCircle, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The CV file the user already uploaded for the free check. */
  cvFile: File | null;
  /** Optional: their CV score, used in the headline. */
  score?: number;
}

type Stage = "intro" | "creating-order" | "sending-stk" | "waiting-pin" | "success" | "error";

export function CvFixLiteInstantPayModal({ open, onOpenChange, cvFile, score }: Props) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [phone, setPhone] = useState<string>("");
  const [stage, setStage] = useState<Stage>("intro");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-fill phone from session when modal opens.
  useEffect(() => {
    if (!open) return;
    setStage("intro");
    setOrderId(null);
    setCheckoutRequestId(null);
    setErrMsg("");
    fetch("/api/auth/user", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((u) => { if (u?.phone) setPhone(u.phone); })
      .catch(() => {});
  }, [open]);

  // Cleanup poller when modal closes.
  useEffect(() => () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  function normalisedPhone(): string {
    const raw = phone.replace(/\s+/g, "").replace(/^\+/, "");
    // Kenyan numbers: convert 07xx... or 7xx... → 2547xx... for M-Pesa.
    if (/^0[17]\d{8}$/.test(raw)) return "254" + raw.slice(1);
    if (/^[17]\d{8}$/.test(raw))  return "254" + raw;
    if (/^254[17]\d{8}$/.test(raw)) return raw;
    return raw;
  }

  function phoneValid(): boolean {
    return /^254[17]\d{8}$/.test(normalisedPhone());
  }

  async function startPaymentFlow() {
    if (!cvFile) {
      toast({ title: "CV file missing", description: "Please re-upload your CV first.", variant: "destructive" });
      return;
    }
    if (!phoneValid()) {
      toast({ title: "Phone number doesn't look right", description: "Use the M-Pesa number you'll pay from (e.g. 0712345678).", variant: "destructive" });
      return;
    }

    // ── Step 1: create the service order with the CV file ─────────────────
    setStage("creating-order");
    let createdOrderId: string;
    try {
      const csrf = await fetchCsrfToken();
      const fd = new FormData();
      fd.append("cv", cvFile);
      const res = await fetch("/api/services/order/cv_fix_lite", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
        body: fd,
      });
      const data = await res.json();
      if (res.status === 401) {
        setErrMsg("Please sign in first.");
        setStage("error");
        return;
      }
      if (!res.ok) throw new Error(data?.message ?? "Could not create order");
      createdOrderId = data.orderId as string;
      setOrderId(createdOrderId);
    } catch (err: any) {
      setErrMsg(err?.message ?? "Could not create order");
      setStage("error");
      return;
    }

    // ── Step 2: trigger STK push ──────────────────────────────────────────
    setStage("sending-stk");
    let checkoutId: string;
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          method: "mpesa",
          phoneNumber: normalisedPhone(),
          serviceId: "cv_fix_lite",
          serviceName: "CV Fix Lite",
          orderId: createdOrderId,
          amount: 99,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const verifNeeded = (data?.verificationRequired === true) || res.status === 403;
        setErrMsg(verifNeeded
          ? "Please verify your email first (we just sent you a code on signup)."
          : (data?.message ?? "Could not send M-Pesa prompt"));
        setStage("error");
        return;
      }
      checkoutId = data.checkoutRequestId ?? data.CheckoutRequestID ?? "";
      if (!checkoutId) throw new Error("Did not receive checkout reference");
      setCheckoutRequestId(checkoutId);
    } catch (err: any) {
      setErrMsg(err?.message ?? "Could not send M-Pesa prompt");
      setStage("error");
      return;
    }

    // ── Step 3: poll for payment success ──────────────────────────────────
    setStage("waiting-pin");
    let polls = 0;
    pollRef.current = setInterval(async () => {
      polls++;
      try {
        const res = await fetch(`/api/mpesa/status/${encodeURIComponent(checkoutId)}`, { credentials: "include" });
        if (res.ok) {
          const status = await res.json();
          const paid = status?.status === "success" || status?.status === "completed" || status?.resultCode === "0";
          if (paid) {
            if (pollRef.current) clearInterval(pollRef.current);
            setStage("success");
            // Give the success state a beat to render, then jump to the order
            // detail page where the AI is already processing the fix.
            setTimeout(() => {
              navigate(`/service-orders/${createdOrderId}`);
            }, 1500);
            return;
          }
          if (status?.status === "failed" || status?.resultCode === "1032") {
            if (pollRef.current) clearInterval(pollRef.current);
            setErrMsg("Payment was cancelled or the PIN timed out. Try again.");
            setStage("error");
            return;
          }
        }
      } catch {}
      if (polls > 30) { // ~60s
        if (pollRef.current) clearInterval(pollRef.current);
        setErrMsg("Timed out waiting for payment. If you completed the M-Pesa prompt, check your orders page in a minute.");
        setStage("error");
      }
    }, 2000);
  }

  function resetForRetry() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setStage("intro");
    setErrMsg("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && (stage === "creating-order" || stage === "sending-stk")) return; // don't allow close mid-action
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Fix my CV for KES 99
          </DialogTitle>
          <DialogDescription>
            {score != null && stage === "intro"
              ? `Your CV scored ${score}/100. We'll fix everything we flagged — delivered in 3 minutes.`
              : "Delivered in 3 minutes. Costs less than a mandazi."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Intro: phone form ─────────────────────────────────────────── */}
        {stage === "intro" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
              <span className="text-sm font-medium">CV Fix Lite</span>
              <Badge className="bg-amber-500 text-white border-0">KES 99</Badge>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ipay-phone">M-Pesa phone</Label>
              <div className="relative">
                <Phone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="ipay-phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="0712 345 678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-9"
                  data-testid="input-instant-pay-phone"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                We'll send an M-Pesa prompt to this number. Enter your PIN to confirm.
              </p>
            </div>
            <Button
              onClick={startPaymentFlow}
              disabled={!phoneValid() || !cvFile}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold"
              size="lg"
              data-testid="button-send-stk"
            >
              <Zap className="h-4 w-4 mr-2" />
              Send M-Pesa prompt
            </Button>
            <p className="text-[10px] text-center text-muted-foreground">
              By tapping above you agree to our terms. No subscription — one-off.
            </p>
          </div>
        )}

        {/* ── Loading states ────────────────────────────────────────────── */}
        {(stage === "creating-order" || stage === "sending-stk") && (
          <div className="py-6 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-amber-500" />
            <p className="text-sm font-medium">
              {stage === "creating-order" ? "Locking in your order…" : "Asking Safaricom to ping your phone…"}
            </p>
          </div>
        )}

        {/* ── Waiting for PIN ───────────────────────────────────────────── */}
        {stage === "waiting-pin" && (
          <div className="py-4 text-center space-y-3">
            <div className="inline-flex h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 items-center justify-center">
              <Phone className="h-7 w-7 text-green-600 dark:text-green-400 animate-pulse" />
            </div>
            <h3 className="font-bold text-base">Check your phone</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Enter your M-Pesa PIN to confirm <strong>KES 99</strong>.
              We'll start fixing your CV the moment you confirm.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Waiting for confirmation… (this usually takes 10-20 seconds)
            </p>
          </div>
        )}

        {/* ── Success ───────────────────────────────────────────────────── */}
        {stage === "success" && (
          <div className="py-4 text-center space-y-3">
            <div className="inline-flex h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="font-bold text-base">Payment confirmed</h3>
            <p className="text-sm text-muted-foreground">
              Your fixed CV will be ready in about 3 minutes. Taking you to your order…
            </p>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {stage === "error" && (
          <div className="py-4 space-y-3">
            <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm">{errMsg || "Something went wrong."}</p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={resetForRetry}>Try again</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
