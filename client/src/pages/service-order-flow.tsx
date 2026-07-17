/**
 * Unified service-order flow — handles every paid AI service via one component.
 *
 * Route: /services/order/:slug   (e.g. /services/order/cv_fix_lite)
 *
 * Three stages:
 *   1. UPLOAD     — pick CV + optional inputs (job desc, target country)
 *   2. PROCESSING — AI is generating; polls /status every 2.5s
 *   3. DONE       — download buttons (PDF + Word)
 */
import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  FileText,
  Loader2,
  Download,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";

interface ServiceMeta {
  name: string;
  needsCv: boolean;
  needsCountry: boolean;
  needsJobDescription: boolean;
  description: string;
}

const SERVICE_META: Record<string, ServiceMeta> = {
  cv_fix_lite: {
    name: "CV Fix Lite",
    needsCv: true,
    needsCountry: false,
    needsJobDescription: false,
    description: "We'll clean up grammar, formatting and structure on your CV. Same content — sharper presentation.",
  },
  ats_cv_optimization: {
    name: "ATS CV Optimization",
    needsCv: true,
    needsCountry: false,
    needsJobDescription: true,
    description: "We'll rewrite your CV with industry keywords + clean ATS-safe format so it passes recruiter filters.",
  },
  cv_rewrite: {
    name: "Country-Specific CV Rewrite",
    needsCv: true,
    needsCountry: true,
    needsJobDescription: false,
    description: "We'll restructure your CV to match the format and conventions of your target country.",
  },
  cover_letter: {
    name: "Cover Letter",
    needsCv: true,
    needsCountry: false,
    needsJobDescription: true,
    description: "A custom 300-word cover letter tailored to your CV and the job you're applying for.",
  },
  sop_writing: {
    name: "Statement of Purpose",
    needsCv: false,
    needsCountry: true,
    needsJobDescription: true,
    description: "A compelling 800-1000 word SOP for university or scholarship applications.",
  },
  motivation_letter: {
    name: "Motivation Letter",
    needsCv: false,
    needsCountry: true,
    needsJobDescription: true,
    description: "A formal motivation letter for EU programs, scholarships, or work permit applications.",
  },
  linkedin_optimization: {
    name: "LinkedIn Profile Optimization",
    needsCv: true,
    needsCountry: false,
    needsJobDescription: false,
    description: "Optimised headline, summary, skill keywords and experience bullets for your LinkedIn profile.",
  },
  interview_coaching: {
    name: "Interview Coaching Pack",
    needsCv: true,
    needsCountry: false,
    needsJobDescription: true,
    description: "Likely questions, STAR-method sample answers, and what to ask the interviewer.",
  },
  ats_cover_bundle: {
    name: "ATS + Cover Letter Bundle",
    needsCv: true,
    needsCountry: false,
    needsJobDescription: true,
    description: "An ATS-optimized CV plus a matching cover letter — one package, best value deal.",
  },
};

type Stage = "upload" | "paying" | "processing" | "done" | "failed";

export default function ServiceOrderFlow() {
  const [match, params] = useRoute<{ slug: string }>("/services/order/:slug");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const slug = params?.slug ?? "";
  const meta = SERVICE_META[slug];

  const [stage, setStage] = useState<Stage>("upload");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState<string>("");
  const [estSeconds, setEstSeconds] = useState<number>(60);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [targetCountry, setTargetCountry] = useState("");
  const [extraInput, setExtraInput] = useState("");

  // ── Payment-stage state (standalone M-Pesa STK on the same page) ─────────
  const [amount, setAmount] = useState<number>(0);
  const [mpesaPhone, setMpesaPhone] = useState<string>("");
  const [payingNow, setPayingNow] = useState<boolean>(false);
  const [stkSent, setStkSent] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  // Resume a returning user (after payment redirect) if URL has ?order=<id>
  useEffect(() => {
    const urlOrder = new URLSearchParams(window.location.search).get("order");
    if (urlOrder && !orderId) {
      setOrderId(urlOrder);
      setStage("processing");
      startPolling(urlOrder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!match || !meta) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold">Service not found</h2>
        <p className="text-sm text-muted-foreground mb-4">We couldn't find the service "{slug}".</p>
        <Button variant="outline" onClick={() => navigate("/services")}>Browse services</Button>
      </div>
    );
  }

  function handleFile(f: File) {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];
    if (!allowed.includes(f.type)) {
      toast({ title: "File type not supported", description: "Please upload a PDF or Word file.", variant: "destructive" });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 5 MB.", variant: "destructive" });
      return;
    }
    setCvFile(f);
  }

  function startPolling(id: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    // 2026-06 RESILIENCE: track when polling started so we can show a clear
    // "still working — we'll email you" message after 2 min instead of
    // letting the user stare at an infinite spinner if the AI step hangs.
    const startedAt = Date.now();
    let slowMessageShown = false;
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/services/order/${id}/status`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "completed") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          setServiceName(data.serviceName || meta.name);
          setStage("done");
        } else if (data.status === "failed") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          setErrorMsg(data.error ?? "Processing failed. We'll keep retrying and email you when it's ready — or contact support and we'll regenerate it immediately.");
          setStage("failed");
        } else {
          // Still pending or processing — surface a softer message after 2 min
          // so the user knows we haven't forgotten them.
          const elapsedSec = (Date.now() - startedAt) / 1000;
          if (elapsedSec > 120 && !slowMessageShown) {
            slowMessageShown = true;
            toast({
              title: "Still working on it",
              description: "Taking longer than usual. We'll keep trying in the background and email/WhatsApp you the moment it's ready. You can safely close this tab.",
              duration: 12000,
            });
          }
        }
      } catch {
        /* transient — keep polling */
      }
    }, 2500);
  }

  async function handleSubmit() {
    if (meta.needsCv && !cvFile) {
      toast({ title: "Upload your CV", description: "We need your CV to generate the document.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const csrf = await fetchCsrfToken();
      const form = new FormData();
      if (cvFile) form.append("cv", cvFile);
      if (jobDescription) form.append("jobDescription", jobDescription);
      if (targetCountry)  form.append("targetCountry", targetCountry);
      if (extraInput)     form.append("extraInput", extraInput);

      // 2026-06: was failing as "Failed to fetch" (raw browser TypeError) on
      // flaky mobile networks + Render cold starts. Now we retry once with
      // a 2.5s wait on the specific TypeError, and surface a HUMAN error
      // message with an actionable next step if both attempts fail. Susan
      // reported this on a 24KB file — clearly network, not size. Reported
      // by founder via screenshot 2026-06.
      async function postOnce(): Promise<Response> {
        return fetch(`/api/services/order/${slug}`, {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRF-Token": csrf },
          body: form,
        });
      }

      // 2026-07: 3 attempts with exponential backoff (1s, 4s, 8s) so cold
      // starts (Render can take 20-40s) no longer surface as user errors.
      let res: Response | null = null;
      const backoffs = [0, 1000, 4000, 8000];
      let lastNetErr: any = null;
      for (let attempt = 0; attempt < backoffs.length; attempt++) {
        if (backoffs[attempt] > 0) {
          console.warn(`[service-order] attempt ${attempt + 1}: waiting ${backoffs[attempt]}ms before retry (last error: ${lastNetErr?.message ?? "unknown"})`);
          await new Promise((r) => setTimeout(r, backoffs[attempt]));
        }
        try {
          res = await postOnce();
          break; // success — got a Response (even 4xx/5xx is a Response, not a network error)
        } catch (netErr: any) {
          lastNetErr = netErr;
          const isNet = netErr?.name === "TypeError" || /failed to fetch|networkerror|network request failed/i.test(netErr?.message ?? "");
          if (!isNet || attempt === backoffs.length - 1) {
            throw netErr;
          }
          // else: fall through and retry
        }
      }
      if (!res) throw lastNetErr ?? new Error("Failed to reach server after multiple attempts");
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && /verify/i.test(data?.message ?? "")) {
          toast({ title: "Verify your account", description: "Redirecting…" });
          setTimeout(() => navigate("/account/verify"), 1200);
          return;
        }
        throw new Error(data?.message || "Could not create order.");
      }

      setOrderId(data.orderId);
      setServiceName(data.serviceName);
      setEstSeconds(data.estSeconds || 60);
      setAmount(data.price ?? 0);

      if (data.needsPayment && data.price > 0) {
        // Stay on the SAME page — show the inline M-Pesa STK pay UI so the
        // user pays for THIS service (not pushed to the Pro Plan upgrade).
        setStage("paying");
      } else {
        setStage("processing");
        startPolling(data.orderId);
      }
    } catch (err: any) {
      // 2026-06: friendlier copy. Founder reported "Failed to fetch" was
      // surfacing as-is to users. Translate it into a Kenyan-friendly line.
      const isNetwork =
        err?.name === "TypeError" ||
        /failed to fetch|networkerror|network request failed/i.test(err?.message ?? "");
      toast({
        title: isNetwork ? "Couldn't reach our server after 3 attempts" : "Order couldn't be created",
        description: isNetwork
          ? "Your connection may be unstable or our server is warming up. Please wait 30 seconds and try again. If it still fails, WhatsApp us on +254 742 619 777 or email support@workabroadhub.tech and we'll fix it immediately."
          : (err?.message || "Something went wrong. Please try again."),
        variant: "destructive",
        duration: 12_000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── STANDALONE M-PESA STK PUSH ──────────────────────────────────────────────
  // Triggered by the "Pay KES X via M-Pesa" button on the paying stage. Calls
  // /api/payments/initiate with the service slug as the serviceId so the
  // payment pipeline knows to mark THIS service order as paid (and not treat
  // it as a Pro Plan upgrade). On success we transition to processing and
  // poll the order status — once the M-Pesa callback marks it 'paid', the
  // server's processOrder() runs the AI generation, and status flips to
  // 'completed', at which point this same page shows the download buttons.
  async function payForService() {
    if (!orderId) return;
    const phoneClean = mpesaPhone.replace(/\s+/g, "").trim();
    if (!/^(?:0|254|\+254)?7\d{8}$/.test(phoneClean) && !/^(?:0|254|\+254)?1\d{8}$/.test(phoneClean)) {
      toast({
        title: "Invalid M-Pesa number",
        description: "Use 07XXXXXXXX, 01XXXXXXXX, or +254XXXXXXXXX",
        variant: "destructive",
      });
      return;
    }
    setPayingNow(true);
    try {
      const csrf = await fetchCsrfToken();

      // ─── STEP 1: create the pending payment row (DB) ────────────────────
      // Returns paymentId / checkoutRequestId — but does NOT send STK push yet.
      const initRes = await fetch("/api/payments/initiate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          method: "mpesa",
          phoneNumber: phoneClean,
          serviceId: slug,
          serviceName: serviceName || meta.name,
          serviceOrderId: orderId,            // payment pipeline reads this to mark THIS order paid
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok || initData?.success === false) {
        if (initRes.status === 403 && /verify/i.test(initData?.message ?? "")) {
          toast({ title: "Verify your account first", description: "Redirecting…" });
          setTimeout(() => navigate("/account/verify"), 1200);
          return;
        }
        throw new Error(initData?.message || initData?.error || "Could not create payment record.");
      }
      const paymentId = initData?.paymentId ?? initData?.checkoutRequestId ?? initData?.checkout_request_id;
      if (!paymentId) {
        throw new Error("Server did not return a paymentId. Cannot trigger STK push.");
      }

      // ─── STEP 2: actually trigger the Safaricom STK push ────────────────
      // This is what makes the M-Pesa prompt appear on the user's phone.
      const stkRes = await fetch("/api/mpesa/stk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ checkoutRequestId: paymentId }),
      });
      const stkData = await stkRes.json();
      if (!stkRes.ok || stkData?.success === false) {
        throw new Error(stkData?.message || stkData?.error || "Safaricom STK push failed. Try again.");
      }

      setStkSent(true);
      toast({
        title: "STK push sent to your phone",
        description: "Check your phone now — enter your M-Pesa PIN to complete payment.",
      });
      // Transition to processing. The M-Pesa callback marks the order paid
      // which triggers AI generation. We poll for status="completed".
      setStage("processing");
      startPolling(orderId);
    } catch (err: any) {
      toast({ title: "Payment failed", description: err.message, variant: "destructive" });
    } finally {
      setPayingNow(false);
    }
  }

  // ── PAYPAL FLOW (any country) ────────────────────────────────────────────
  // For users outside Kenya (Zimbabwe, Tanzania, South Africa, Egypt, etc.)
  // where M-Pesa isn't available. Creates a PayPal order, redirects the
  // user to PayPal's approval page, then processes the return via
  // /api/service-orders/:id/paypal-complete.
  async function payWithPayPal() {
    if (!orderId) return;
    setPayingNow(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/paypal/create-order", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          amount:     amount,
          serviceId:  slug,
          serviceOrderId: orderId,
          description: serviceName || meta.name,
          returnUrl: window.location.origin + window.location.pathname + `?paypalReturn=1&orderId=${orderId}`,
          cancelUrl: window.location.origin + window.location.pathname,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Could not start PayPal payment. Please try again or use M-Pesa.");
      }
      if (!data?.approvalUrl) {
        throw new Error("PayPal did not return an approval URL. Please try again.");
      }
      // Redirect the whole tab to PayPal — user will complete payment there,
      // then PayPal redirects them back to the returnUrl above.
      window.location.href = data.approvalUrl;
    } catch (err: any) {
      toast({ title: "PayPal error", description: err.message, variant: "destructive" });
      setPayingNow(false);
    }
  }

  // On mount: if we're returning from PayPal (?paypalReturn=1), capture the payment.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paypalReturn") !== "1") return;
    const returnOrderId = params.get("orderId");
    const paypalOrderId = params.get("token") || params.get("paymentId");
    if (!returnOrderId || !paypalOrderId) return;

    (async () => {
      try {
        const csrf = await fetchCsrfToken();
        const captureRes = await fetch(`/api/paypal/capture-order`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({ paypalOrderId }),
        });
        const cap = await captureRes.json();
        if (!captureRes.ok) throw new Error(cap?.message || "PayPal capture failed");
        // Then confirm at the service-order level
        await fetch(`/api/service-orders/${returnOrderId}/paypal-complete`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({ transactionId: cap?.transactionId ?? paypalOrderId }),
        });
        toast({
          title: "PayPal payment received",
          description: "Your document is being generated now — this page will update in a few seconds.",
        });
        setStage("processing");
        startPolling(returnOrderId);
        // Clean the URL so a refresh doesn't re-capture
        window.history.replaceState({}, "", window.location.pathname);
      } catch (err: any) {
        toast({ title: "PayPal capture failed", description: err.message, variant: "destructive" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate("/services")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> All services
        </button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              {meta.name}
            </CardTitle>
            <CardDescription>{meta.description}</CardDescription>
          </CardHeader>

          {stage === "upload" && (
            <CardContent className="space-y-4">
              {meta.needsCv && (
                <div>
                  <Label className="block mb-2">Your CV (PDF or Word)</Label>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleFile(f);
                    }}
                    className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      accept=".pdf,.docx,.doc"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                      }}
                    />
                    {cvFile ? (
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <FileText className="h-5 w-5 text-green-600" />
                        <span className="font-medium">{cvFile.name}</span>
                        <span className="text-muted-foreground">({Math.round(cvFile.size / 1024)} KB)</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                        <p className="text-sm font-medium">Click to upload or drag & drop</p>
                        <p className="text-xs text-muted-foreground">PDF or .docx, up to 5 MB</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {meta.needsCountry && (
                <div>
                  <Label htmlFor="country">Target country</Label>
                  <Input
                    id="country"
                    placeholder="e.g. UK, Canada, Germany, UAE"
                    value={targetCountry}
                    onChange={(e) => setTargetCountry(e.target.value)}
                  />
                </div>
              )}

              {meta.needsJobDescription && (
                <div>
                  <Label htmlFor="jd">Job description / role details</Label>
                  <Textarea
                    id="jd"
                    placeholder="Paste the job posting or describe the role you're targeting…"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    rows={4}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="extra">Anything else? (optional)</Label>
                <Textarea
                  id="extra"
                  placeholder="Special preferences, must-mention experiences, target salary, etc."
                  value={extraInput}
                  onChange={(e) => setExtraInput(e.target.value)}
                  rows={2}
                />
              </div>

              <Button onClick={handleSubmit} disabled={submitting} size="lg" className="w-full">
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating order…</>
                ) : (
                  <>Continue to payment →</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                We'll have your CV back to you in under {Math.ceil(estSeconds / 60) || 1} minute{estSeconds > 60 ? "s" : ""}. Your file stays private — we don't share it.
              </p>
            </CardContent>
          )}

          {/* ── PAYING STAGE — inline M-Pesa STK for THIS service (no Pro plan needed) ── */}
          {stage === "paying" && orderId && (
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  ✅ Order created. Pay <strong>KES {amount.toLocaleString()}</strong> to start generation.
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                  This is a one-off payment for {serviceName || meta.name}. No subscription, no Pro Plan required.
                  Once payment confirms, your document is generated in ~{Math.round(estSeconds / 60) || 1} minute and
                  you'll download it from this same page.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mpesa-phone">Safaricom M-Pesa number</Label>
                <Input
                  id="mpesa-phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="07XXXXXXXX"
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  disabled={payingNow || stkSent}
                  data-testid="input-mpesa-phone"
                />
                <p className="text-[11px] text-muted-foreground">
                  Must be a Safaricom line (07XX or 01XX). M-Pesa STK push only works on Safaricom.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <span>🇰🇪 M-Pesa (Safaricom lines only)</span>
              </div>

              <Button
                onClick={payForService}
                disabled={payingNow || stkSent || !mpesaPhone}
                size="lg"
                className="w-full bg-green-600 hover:bg-green-700"
                data-testid="button-pay-mpesa"
              >
                {payingNow
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending STK push…</>
                  : stkSent
                  ? <>Waiting for M-Pesa PIN entry…</>
                  : <>Pay KES {amount.toLocaleString()} via M-Pesa</>}
              </Button>

              <p className="text-[11px] text-center text-muted-foreground">
                You'll receive an STK push on your phone. Enter your M-Pesa PIN to confirm.
                You stay on this page — the document downloads here once it's ready.
              </p>

              {/* ─── PayPal (any country) ─────────────────────────────────── */}
              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or, not in Kenya?</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-[11px] text-blue-800 dark:text-blue-200 flex items-center gap-2">
                <span>🌍 Not in Kenya? Use PayPal — works with any card (Visa, Mastercard, PayPal balance)</span>
              </div>

              <Button
                onClick={payWithPayPal}
                disabled={payingNow}
                size="lg"
                className="w-full bg-gradient-to-r from-[#0070ba] to-[#003087] hover:from-[#005a99] hover:to-[#00246b] text-white font-bold"
                data-testid="button-pay-paypal"
              >
                {payingNow ? "Opening PayPal…" : "🌍 Pay with PayPal (any country)"}
              </Button>

              <p className="text-[11px] text-center text-muted-foreground">
                You'll be redirected to PayPal to complete payment, then brought back here automatically.
              </p>
            </CardContent>
          )}

          {stage === "processing" && (
            <CardContent className="text-center py-12 space-y-3">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto" />
              <h3 className="font-semibold text-lg">Generating your {serviceName || meta.name}…</h3>
              <p className="text-sm text-muted-foreground">
                <Clock className="inline h-3.5 w-3.5 mr-1" />
                Usually takes under {Math.ceil(estSeconds / 60) || 1} minute. Keep this tab open.
              </p>
              {/* 2026-06 RESILIENCE: tell users they can safely close the tab —
                  the server's recovery sweep keeps retrying and we'll notify
                  them. No more "infinite spinner" panic. */}
              <p className="text-xs text-muted-foreground/80 pt-3 max-w-xs mx-auto">
                Safe to close — we'll email you and post it to your{" "}
                <button
                  onClick={() => navigate("/my-documents")}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  My Documents
                </button>{" "}
                page the moment it's ready.
              </p>
            </CardContent>
          )}

          {stage === "done" && orderId && (
            <CardContent className="text-center py-8 space-y-4">
              <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto" />
              <div>
                <h3 className="font-semibold text-lg">Done! Your {serviceName || meta.name} is ready.</h3>
                <p className="text-sm text-muted-foreground mt-1">Download in the format that suits you best.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                <a
                  href={`/api/services/order/${orderId}/download/pdf`}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm"
                >
                  <Download className="h-4 w-4" /> PDF
                </a>
                <a
                  href={`/api/services/order/${orderId}/download/docx`}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm"
                >
                  <Download className="h-4 w-4" /> Word
                </a>
              </div>
              <div className="pt-3">
                <Button variant="outline" size="sm" onClick={() => navigate("/my-documents")}>
                  See all my documents
                </Button>
              </div>
            </CardContent>
          )}

          {stage === "failed" && (
            <CardContent className="text-center py-12 space-y-3">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <h3 className="font-semibold text-lg">Something went wrong</h3>
              <p className="text-sm text-muted-foreground">{errorMsg || "Please try again or contact support."}</p>
              <Button variant="outline" onClick={() => { setStage("upload"); setErrorMsg(null); }}>
                Try again
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
