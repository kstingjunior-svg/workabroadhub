/**
 * IELTS Prep hub — Phase 1 (2026-09).
 *
 * Replaces the old "Coming soon" waitlist card as the landing point for the
 * feature. Two states:
 *   - Locked: pricing + honest feature list + M-Pesa unlock flow (PayPal is
 *     intentionally NOT wired here yet — see the note near payWithPayPal()
 *     for why, this is a deliberate scope decision, not an oversight).
 *   - Unlocked: two tool cards — AI Writing feedback, Reading mock test.
 *
 * Access is checked server-side via GET /api/ielts/access, which resolves
 * the "ielts_prep" service unlock the same way every other one-off paid
 * service on this platform does (services table + userServices, see
 * server/routes/ielts-routes.ts for the full trace).
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, PenLine, Loader2, Phone, CheckCircle2, AlertCircle,
  ArrowLeft, Sparkles, ClipboardCheck, MessageCircle,
} from "lucide-react";

const SUPPORT_WHATSAPP = "254111467601";

interface AccessResponse {
  hasAccess: boolean;
  signedIn: boolean;
  price: number;
  currency: string;
}

type PayStage = "idle" | "sending-stk" | "waiting-pin" | "success" | "error";

export default function IeltsPrepHub() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: access, isLoading } = useQuery<AccessResponse>({
    queryKey: ["/api/ielts/access"],
  });

  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<PayStage>("idle");
  const [errMsg, setErrMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if ((user as any)?.phone) setPhone((user as any).phone);
  }, [user]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  function normalisedPhone(): string {
    const raw = phone.replace(/\s+/g, "").replace(/^\+/, "");
    if (/^0[17]\d{8}$/.test(raw)) return "254" + raw.slice(1);
    if (/^[17]\d{8}$/.test(raw)) return "254" + raw;
    if (/^254[17]\d{8}$/.test(raw)) return raw;
    return raw;
  }
  function phoneValid(): boolean {
    return /^254[17]\d{8}$/.test(normalisedPhone());
  }

  async function startMpesaFlow() {
    if (!user) {
      const returnTo = encodeURIComponent("/ielts-prep");
      localStorage.setItem("auth_redirect", "/ielts-prep");
      navigate(`/?redirect=${returnTo}`);
      return;
    }
    if (!phoneValid()) {
      toast({ title: "Phone number doesn't look right", description: "Use the M-Pesa number you'll pay from (e.g. 0712345678).", variant: "destructive" });
      return;
    }

    setStage("sending-stk");
    setErrMsg("");
    let checkoutId = "";
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          method: "mpesa",
          phoneNumber: normalisedPhone(),
          serviceId: "ielts_prep",
          serviceName: "IELTS Prep",
          amount: access?.price ?? 10000,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const verifNeeded = data?.verificationRequired === true || res.status === 403;
        throw new Error(verifNeeded
          ? "Please verify your email first (we sent you a code on signup)."
          : (data?.message ?? "Could not send M-Pesa prompt"));
      }
      checkoutId = data.checkoutRequestId ?? data.CheckoutRequestID ?? "";
      if (!checkoutId) throw new Error("Did not receive a checkout reference.");
    } catch (err: any) {
      setErrMsg(err?.message ?? "Could not start payment");
      setStage("error");
      return;
    }

    try {
      const csrf = await fetchCsrfToken();
      const stkRes = await fetch("/api/mpesa/stk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ checkoutRequestId: checkoutId }),
      });
      const stkData = await stkRes.json().catch(() => ({}));
      if (!stkRes.ok) throw new Error(stkData?.message ?? stkData?.error ?? "Could not send M-Pesa prompt.");
      const safaricomId = stkData?.checkoutRequestId ?? stkData?.CheckoutRequestID;
      if (safaricomId && typeof safaricomId === "string") checkoutId = safaricomId;
    } catch (err: any) {
      setErrMsg(err?.message ?? "Could not send M-Pesa prompt");
      setStage("error");
      return;
    }

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
            queryClient.invalidateQueries({ queryKey: ["/api/ielts/access"] });
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
      if (polls > 30) {
        if (pollRef.current) clearInterval(pollRef.current);
        setErrMsg("Timed out waiting for payment. If you completed the M-Pesa prompt, refresh this page in a minute.");
        setStage("error");
      }
    }, 2000);
  }

  // 2026-09: PayPal is deliberately NOT wired here. I traced the generic
  // /api/paypal/create-order + /api/paypal/capture-order pair and found
  // capture-order always calls upgradeUserAccount() — it hard-codes a
  // SUBSCRIPTION PLAN upgrade (defaulting to "pro" if it can't resolve a
  // tier) rather than unlocking a one-off service. Reusing it here would
  // either silently grant a Pro subscription instead of IELTS access, or
  // require changing shared, live-money payment code without sign-off.
  // Other one-off services get PayPal via a DIFFERENT endpoint
  // (/api/service-orders/:id/paypal-complete) that's tied to the document-
  // generation order flow IELTS doesn't use. Safer v1 scope: M-Pesa only,
  // WhatsApp fallback for everyone else.
  const whatsappPayLink = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent("Hi, I'm outside Kenya and want to pay for IELTS Prep via PayPal.")}`;

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-amber-500" />
      </div>
    );
  }

  if (access?.hasAccess) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>

        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
            <BookOpen className="h-5 w-5" />
          </span>
          <Badge className="bg-emerald-600 text-white border-0">Unlocked</Badge>
        </div>
        <h1 className="text-2xl font-bold">IELTS Prep</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          Pick a tool below. More Reading tests get added over time.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/ielts-prep/writing">
            <Card className="cursor-pointer hover:shadow-md transition-all h-full">
              <CardContent className="p-5">
                <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 mb-3">
                  <PenLine className="h-5 w-5" />
                </span>
                <h3 className="font-semibold text-base">Writing Feedback</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Submit a Task 1 or Task 2 essay and get AI band scores (Task Response, Coherence, Lexical Resource, Grammar) plus detailed feedback in under a minute.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/ielts-prep/reading/reading-test-1">
            <Card className="cursor-pointer hover:shadow-md transition-all h-full">
              <CardContent className="p-5">
                <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 mb-3">
                  <ClipboardCheck className="h-5 w-5" />
                </span>
                <h3 className="font-semibold text-base">Reading Mock Test</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  A full-length, original Academic-style passage — Matching Headings, True/False/Not Given and Multiple Choice — with instant scoring and a full review.
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-10">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <Card className="overflow-hidden border-amber-200 dark:border-amber-800">
        <CardHeader className="bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-amber-900/20 dark:via-gray-900 dark:to-orange-900/20">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
              <BookOpen className="h-5 w-5" />
            </span>
            <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">New</Badge>
          </div>
          <CardTitle className="text-xl">IELTS Prep</CardTitle>
          <CardDescription>
            One-time unlock — no subscription. Built for Kenyans prepping for study or work visas abroad.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 space-y-5">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">KES {(access?.price ?? 10000).toLocaleString()}</span>
            <span className="text-sm text-muted-foreground">one-time</span>
          </div>

          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              Unlimited AI Writing Task 1 &amp; 2 grading, with band-by-band feedback
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              A full-length Reading mock test with instant scoring and review
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              More Reading tests added regularly at no extra cost
            </li>
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Note: this is a practice tool with AI-estimated band scores, not an official IELTS result. Listening and Speaking practice aren't part of this release yet.
          </p>

          {stage === "idle" || stage === "error" ? (
            <div className="space-y-3 pt-1">
              {stage === "error" && (
                <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 text-sm">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <span>{errMsg}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="ielts-phone">M-Pesa phone</Label>
                <div className="relative">
                  <Phone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="ielts-phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="0712 345 678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-9"
                    data-testid="input-ielts-phone"
                  />
                </div>
              </div>
              <Button
                onClick={startMpesaFlow}
                disabled={!phoneValid()}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold"
                size="lg"
                data-testid="button-unlock-ielts"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                🇰🇪 Unlock with M-Pesa — KES {(access?.price ?? 10000).toLocaleString()}
              </Button>

              <div className="flex items-center gap-3 pt-1">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] text-muted-foreground">not in Kenya?</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <a
                href={whatsappPayLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-all"
                data-testid="link-ielts-whatsapp-paypal"
              >
                <MessageCircle className="h-4 w-4" />
                Message us on WhatsApp to pay via PayPal
              </a>
            </div>
          ) : null}

          {(stage === "sending-stk") && (
            <div className="py-6 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-amber-500" />
              <p className="text-sm font-medium">Asking Safaricom to ping your phone…</p>
            </div>
          )}

          {stage === "waiting-pin" && (
            <div className="py-4 text-center space-y-3">
              <div className="inline-flex h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 items-center justify-center">
                <Phone className="h-7 w-7 text-green-600 dark:text-green-400 animate-pulse" />
              </div>
              <h3 className="font-bold text-base">Check your phone</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Enter your M-Pesa PIN to confirm <strong>KES {(access?.price ?? 10000).toLocaleString()}</strong>.
              </p>
              <p className="text-[11px] text-muted-foreground">Waiting for confirmation… (usually 10-20 seconds)</p>
            </div>
          )}

          {stage === "success" && (
            <div className="py-4 text-center space-y-3">
              <div className="inline-flex h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="font-bold text-base">Payment confirmed</h3>
              <p className="text-sm text-muted-foreground">IELTS Prep is unlocked. Reloading your tools…</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
