/**
 * Scout Jobs — Post a job (paid, KES 200).
 *
 * Auth required. Scout fills the form, then chooses M-Pesa (STK push) or
 * PayPal (redirect). On payment success the row moves to 'pending_review'
 * and admin approves before it goes live on /scout-jobs.
 *
 * PayPal return handled via ?paypalReturn=1&token=... query param.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Briefcase, Globe, User, Phone, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { fetchCsrfToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const COUNTRIES = [
  "UK", "UAE", "Canada", "Australia", "Saudi Arabia", "Qatar", "Bahrain",
  "Germany", "USA", "Luxembourg", "Kuwait", "Oman", "Ireland", "Netherlands",
  "Turkey", "Other",
];
const INDUSTRIES = [
  "hospitality", "care", "nursing", "farming", "driving", "construction",
  "cleaning", "chef", "trade", "security", "office", "other",
];

interface FormState {
  scoutName:      string;
  scoutCountry:   string;
  scoutWhatsapp:  string;
  scoutEmail:     string;
  jobTitle:       string;
  jobCountry:     string;
  jobCity:        string;
  jobIndustry:    string;
  jobDescription: string;
  salaryText:     string;
  howToApply:     string;
  mpesaPhone:     string;
}

const EMPTY: FormState = {
  scoutName: "", scoutCountry: "", scoutWhatsapp: "", scoutEmail: "",
  jobTitle: "", jobCountry: "", jobCity: "", jobIndustry: "",
  jobDescription: "", salaryText: "", howToApply: "", mpesaPhone: "",
};

type Stage = "form" | "stk-sent" | "success" | "error";

export default function ScoutJobPostPage() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [form, setForm]     = useState<FormState>(EMPTY);
  const [stage, setStage]   = useState<Stage>("form");
  const [busy, setBusy]     = useState<"mpesa" | "paypal" | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");
  const [scoutJobId, setScoutJobId]     = useState<string | null>(null);
  const [checkoutId, setCheckoutId]     = useState<string | null>(null);

  // ── PayPal return handler ────────────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("paypalReturn") !== "1") return;
    const orderId = p.get("token") || p.get("paymentId");
    const savedId = sessionStorage.getItem("scout:paypalJobId");
    if (!orderId || !savedId) return;
    (async () => {
      setBusy("paypal");
      setStage("stk-sent");
      try {
        const csrf = await fetchCsrfToken();
        const res = await fetch(`/api/scout-jobs/${savedId}/paypal-capture`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({ paypalOrderId: orderId }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? "PayPal capture failed");
        setStage("success");
        sessionStorage.removeItem("scout:paypalJobId");
        // Strip query so a refresh doesn't re-capture
        window.history.replaceState({}, "", "/scout-jobs/post");
      } catch (err: any) {
        setErrMsg(err?.message ?? "PayPal capture failed");
        setStage("error");
      } finally {
        setBusy(null);
      }
    })();
  }, []);

  // ── Poll status when STK is out ─────────────────────────────────────
  useEffect(() => {
    if (stage !== "stk-sent" || !scoutJobId) return;
    let cancelled = false;
    let polls = 0;
    const tick = async () => {
      polls++;
      try {
        const res = await fetch(`/api/scout-jobs/${scoutJobId}/status`, { credentials: "include" });
        const j = await res.json();
        if (cancelled) return;
        if (j.status === "pending_review" || j.status === "active") {
          setStage("success");
          return;
        }
        if (j.status === "flagged") {
          setErrMsg(j.note ?? "Payment failed. Please try again.");
          setStage("error");
          return;
        }
        if (polls > 45) {  // ~90s
          setErrMsg("Timed out waiting for payment. If you completed the M-Pesa prompt, refresh in a minute.");
          setStage("error");
          return;
        }
        setTimeout(tick, 2000);
      } catch {
        if (!cancelled) setTimeout(tick, 2500);
      }
    };
    const t = setTimeout(tick, 2000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [stage, scoutJobId]);

  function updateField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function validate(): string | null {
    if (!form.scoutName.trim())      return "Your name is required";
    if (!form.scoutCountry.trim())   return "The country you live in is required";
    if (!form.scoutWhatsapp.trim())  return "WhatsApp number is required";
    if (!form.jobTitle.trim())       return "Job title is required";
    if (!form.jobCountry)            return "Job country is required";
    if (!form.jobIndustry)           return "Industry is required";
    if (form.jobDescription.trim().length < 30) return "Job description needs at least 30 characters";
    return null;
  }

  async function submitMpesa() {
    if (!user) { navigate("/login?returnTo=/scout-jobs/post"); return; }
    const err = validate();
    if (err) { setErrMsg(err); toast({ title: err, variant: "destructive" }); return; }
    if (!form.mpesaPhone.trim() || form.mpesaPhone.trim().length < 9) {
      setErrMsg("Enter the M-Pesa phone to charge KES 200 to.");
      toast({ title: "M-Pesa phone required", variant: "destructive" });
      return;
    }
    setBusy("mpesa"); setErrMsg("");
    try {
      const csrf = await fetchCsrfToken();
      const { mpesaPhone, ...body } = form;
      const res = await fetch("/api/scout-jobs/init", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ ...body, phone: mpesaPhone.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Could not send M-Pesa prompt");
      setScoutJobId(j.scoutJobId);
      setCheckoutId(j.mpesaCheckoutId);
      setStage("stk-sent");
    } catch (err: any) {
      setErrMsg(err?.message ?? "Could not send M-Pesa prompt");
      setStage("error");
    } finally {
      setBusy(null);
    }
  }

  async function submitPayPal() {
    if (!user) { navigate("/login?returnTo=/scout-jobs/post"); return; }
    const err = validate();
    if (err) { setErrMsg(err); toast({ title: err, variant: "destructive" }); return; }
    setBusy("paypal"); setErrMsg("");
    try {
      const csrf = await fetchCsrfToken();
      const { mpesaPhone, ...body } = form;
      const res = await fetch("/api/scout-jobs/paypal-init", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Could not start PayPal");
      sessionStorage.setItem("scout:paypalJobId", j.scoutJobId);
      window.location.href = j.approvalUrl;
    } catch (err: any) {
      setErrMsg(err?.message ?? "Could not start PayPal");
      setStage("error");
      setBusy(null);
    }
  }

  if (authLoading) {
    return <div className="mx-auto max-w-2xl px-4 py-8 text-sm text-gray-500">Loading...</div>;
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-3">
        <p className="text-sm text-gray-700">Please sign in to post a scout job.</p>
        <Button onClick={() => navigate("/login?returnTo=/scout-jobs/post")}>Sign in</Button>
      </div>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────
  if (stage === "success") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-5">
        <Card className="border-green-200 dark:border-green-900">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Payment received</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Your scout job is now pending admin review. This is usually done
              within a few hours. Once approved it will appear on the public
              /scout-jobs page for 60 days.
            </p>
            <div className="pt-2 flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate("/scout-jobs")}>View all scout jobs</Button>
              <Button onClick={() => { setForm(EMPTY); setStage("form"); setScoutJobId(null); }}>
                Post another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── STK-sent (waiting for PIN) ──────────────────────────────────────
  if (stage === "stk-sent") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-5">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <Loader2 className="h-14 w-14 text-teal-500 mx-auto animate-spin" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Check your phone</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Enter your M-Pesa PIN to confirm <strong>KES 200</strong>. This usually takes 10 to 20 seconds.
            </p>
            {checkoutId && (
              <div className="text-[10px] text-gray-400 font-mono">Ref: {checkoutId}</div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Error screen ────────────────────────────────────────────────────
  if (stage === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-5">
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertCircle className="h-14 w-14 text-red-500 mx-auto" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Payment did not go through</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{errMsg || "Please try again."}</p>
            <Button onClick={() => setStage("form")}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── The form ────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-5" data-testid="page-scout-post">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-teal-500" />
            Post a scout job (KES 200)
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Real jobs only. Admin will review before your listing goes live. Do NOT
            ask candidates to pay for placement or visa; that would be a scam
            and your listing will be removed without refund.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* ── Scout details ────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Your details (the scout)
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sc-name">Your name</Label>
                <Input id="sc-name" value={form.scoutName} onChange={(e) => updateField("scoutName", e.target.value)}
                       data-testid="input-scout-name" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sc-country">Country you live in</Label>
                <Select value={form.scoutCountry} onValueChange={(v) => updateField("scoutCountry", v)}>
                  <SelectTrigger id="sc-country" data-testid="select-scout-country">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sc-wa">Your WhatsApp (with country code)</Label>
                <Input id="sc-wa" placeholder="+971 50 123 4567" value={form.scoutWhatsapp}
                       onChange={(e) => updateField("scoutWhatsapp", e.target.value)}
                       data-testid="input-scout-whatsapp" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sc-email">Your email (optional)</Label>
                <Input id="sc-email" type="email" value={form.scoutEmail}
                       onChange={(e) => updateField("scoutEmail", e.target.value)}
                       data-testid="input-scout-email" />
              </div>
            </div>
          </div>

          {/* ── Job details ──────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
              The job
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="j-title">Job title</Label>
                <Input id="j-title" placeholder="Farm hand, dairy cattle" value={form.jobTitle}
                       onChange={(e) => updateField("jobTitle", e.target.value)}
                       data-testid="input-job-title" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="j-country">Job country</Label>
                <Select value={form.jobCountry} onValueChange={(v) => updateField("jobCountry", v)}>
                  <SelectTrigger id="j-country" data-testid="select-job-country">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="j-city">Job city (optional)</Label>
                <Input id="j-city" placeholder="e.g. Toronto, Doha" value={form.jobCity}
                       onChange={(e) => updateField("jobCity", e.target.value)}
                       data-testid="input-job-city" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="j-ind">Industry</Label>
                <Select value={form.jobIndustry} onValueChange={(v) => updateField("jobIndustry", v)}>
                  <SelectTrigger id="j-ind" data-testid="select-job-industry">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((i) => (
                      <SelectItem key={i} value={i}>{i[0].toUpperCase() + i.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="j-salary">Salary (optional)</Label>
                <Input id="j-salary" placeholder="e.g. USD 2,500/mo + accommodation" value={form.salaryText}
                       onChange={(e) => updateField("salaryText", e.target.value)}
                       data-testid="input-job-salary" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="j-desc">Job description</Label>
                <Textarea id="j-desc" rows={5}
                          placeholder="What is the job, who is the employer, when does it start, what does the day look like..."
                          value={form.jobDescription}
                          onChange={(e) => updateField("jobDescription", e.target.value)}
                          data-testid="textarea-job-description" />
                <p className="text-[11px] text-gray-500">{form.jobDescription.length}/4000</p>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="j-apply">How should candidates apply? (optional)</Label>
                <Textarea id="j-apply" rows={3}
                          placeholder="e.g. Send a short intro on WhatsApp with your years of experience, then I will pass your CV to the employer."
                          value={form.howToApply}
                          onChange={(e) => updateField("howToApply", e.target.value)}
                          data-testid="textarea-how-to-apply" />
              </div>
            </div>
          </div>

          {/* ── Payment ──────────────────────────────────────────────── */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-4">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Payment (KES 200)
            </div>

            <div className="space-y-2">
              <Label htmlFor="mpesa-phone">M-Pesa phone</Label>
              <div className="relative">
                <Phone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input id="mpesa-phone" placeholder="0712 345 678" className="pl-9"
                       value={form.mpesaPhone}
                       onChange={(e) => updateField("mpesaPhone", e.target.value)}
                       data-testid="input-mpesa-phone" />
              </div>
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
                disabled={!!busy}
                onClick={submitMpesa}
                data-testid="button-pay-mpesa"
              >
                {busy === "mpesa" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending prompt...</>
                ) : (
                  "Pay KES 200 with M-Pesa"
                )}
              </Button>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
              <span>or</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
            </div>

            <Button
              variant="outline"
              className="w-full border-blue-300 text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/30"
              disabled={!!busy}
              onClick={submitPayPal}
              data-testid="button-pay-paypal"
            >
              {busy === "paypal" ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Redirecting to PayPal...</>
              ) : (
                <>Pay with PayPal (for scouts outside Kenya)</>
              )}
            </Button>

            {errMsg && (
              <div className="text-sm text-red-600 dark:text-red-400" data-testid="text-error">
                {errMsg}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
