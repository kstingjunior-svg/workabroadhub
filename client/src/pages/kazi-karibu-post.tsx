/**
 * /kazi-karibu/post — Post a job (poster flow).
 *
 * Multi-step:
 *   1. Sign-in gate (redirect to /login if anonymous)
 *   2. Category selection
 *   3. Details form (title, description, county, sub-county, budget, duration)
 *   4. Draft submission (Layer 3 rules run server-side) — shows any rule hits
 *   5. Submit-for-payment (M-Pesa STK OR first-post-free short-circuit)
 *   6. Status polling until final state (live | held)
 *   7. Success page
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, ArrowRight, Loader2, Check, X, AlertCircle, Sparkles,
  ChevronRight, Home, Utensils, Wrench, Truck, Brush, Sprout, GraduationCap,
  ShieldQuestion, Briefcase,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { KAZI_KARIBU_CATEGORIES, KAZI_KARIBU_DURATIONS, KAZI_KARIBU_BUDGET_PERIODS } from "@shared/kazi-karibu";

const KENYAN_COUNTIES = [
  "Nairobi","Mombasa","Kisumu","Nakuru","Uasin Gishu","Kiambu","Kajiado","Machakos",
  "Kilifi","Kwale","Meru","Nyeri","Muranga","Kirinyaga","Embu","Tharaka Nithi",
  "Laikipia","Nyandarua","Trans Nzoia","Bungoma","Kakamega","Vihiga","Busia",
  "Siaya","Kisii","Nyamira","Migori","Homa Bay","Bomet","Kericho","Nandi",
  "Elgeyo Marakwet","Baringo","West Pokot","Turkana","Samburu","Isiolo","Marsabit",
  "Wajir","Mandera","Garissa","Tana River","Lamu","Taita Taveta","Makueni","Kitui","Narok",
];

const CATEGORY_ICONS: Record<string, any> = {
  house_help: Home, cleaner: Brush, cook_caterer: Utensils, driver: Truck,
  fundi_mason: Wrench, fundi_plumber: Wrench, fundi_electrician: Wrench,
  fundi_painter: Wrench, fundi_carpenter: Wrench, delivery_errand: Truck,
  security_guard: ShieldQuestion, gardener: Sprout, tutor: GraduationCap,
  event_promoter: Sparkles,
};

type Step = "category" | "details" | "submitting" | "payment" | "polling" | "done";

interface RuleHit {
  ruleId: string;
  severity: "reject" | "flag";
  posterReason: string;
}

export default function KaziKaribuPost() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState<Step>("category");

  // ── Form state ─────────────────────────────────────────────────────────
  const [category, setCategory] = useState("");
  const [county, setCounty] = useState("");
  const [subCounty, setSubCounty] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [budgetPeriod, setBudgetPeriod] = useState("month");
  const [duration, setDuration] = useState("permanent");

  // ── Submission state ───────────────────────────────────────────────────
  const [postId, setPostId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ruleHits, setRuleHits] = useState<RuleHit[]>([]);
  const [needsPayment, setNeedsPayment] = useState(false);
  const [isFree, setIsFree] = useState(false);
  const [transactionRef, setTransactionRef] = useState<string | null>(null);
  const [amountKes, setAmountKes] = useState<number>(0);
  const [finalState, setFinalState] = useState<string | null>(null);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Post a job — Kazi Karibu · WorkAbroad Hub";
  }, []);

  // ── Auth gate ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <Briefcase className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Sign in to post</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Every Kazi Karibu post is tied to a verified account so applicants can trust it's real.
            </p>
            <Button onClick={() => navigate("/login?redirect=/kazi-karibu/post")} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              Sign in
            </Button>
            <p className="mt-3 text-xs text-slate-500">
              No account? <Link href="/signup"><span className="underline text-emerald-700">Create one in 30 seconds</span></Link>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step handlers ──────────────────────────────────────────────────────
  async function saveDraft() {
    setSubmitError(null);
    setRuleHits([]);
    setStep("submitting");
    try {
      const r = await fetch("/api/kazi-karibu/posts/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category, county,
          subCounty: subCounty || null,
          title, description,
          budgetMinKes: budgetMin ? Number(budgetMin) : null,
          budgetMaxKes: budgetMax ? Number(budgetMax) : null,
          budgetPeriod,
          duration,
        }),
      });
      const body = await r.json();
      if (r.status === 422 && body?.decision === "reject") {
        setRuleHits(body.hits ?? []);
        setStep("details");
        return;
      }
      if (!r.ok) {
        setSubmitError(body?.error || `Draft failed (${r.status})`);
        setStep("details");
        return;
      }
      setPostId(body.postId);
      // Immediately move to submit-for-payment — no need for user to click twice.
      await submitForPayment(body.postId);
    } catch (err: any) {
      setSubmitError(err?.message ?? "Could not save the draft. Please retry.");
      setStep("details");
    }
  }

  async function submitForPayment(id: string) {
    try {
      const r = await fetch(`/api/kazi-karibu/posts/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      const body = await r.json();
      if (!r.ok) {
        setSubmitError(body?.error || `Submit failed (${r.status})`);
        setStep("details");
        return;
      }
      // Two paths: free (isFirstPostFree) — server already ran Nanjila, state=live/held
      //            paid  (needsPayment)   — client polls /status until transition
      if (!body.needsPayment) {
        setIsFree(true);
        setFinalState(body.state);
        setFinalMessage(
          body.state === "live"
            ? "Your job is live! Applicants can now express interest."
            : "Your post has been received. Our team is reviewing it — you'll hear back within a few hours.",
        );
        setStep("done");
        return;
      }
      setNeedsPayment(true);
      setTransactionRef(body.transactionRef);
      setAmountKes(body.amountKes);
      setStep("payment");
      pollStatus(id);
    } catch (err: any) {
      setSubmitError(err?.message ?? "Could not submit. Please retry.");
      setStep("details");
    }
  }

  async function pollStatus(id: string) {
    const deadline = Date.now() + 5 * 60 * 1000; // Poll for up to 5 minutes
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const r = await fetch(`/api/kazi-karibu/posts/${id}/status`, { credentials: "include" });
        const body = await r.json();
        if (body.state === "live") {
          setFinalState("live");
          setFinalMessage("Payment received! Your job is live for the next 7 days.");
          setStep("done");
          return;
        }
        if (body.state === "held") {
          setFinalState("held");
          setFinalMessage("Payment received. Our team is reviewing your post — you'll hear back soon.");
          setStep("done");
          return;
        }
        if (body.state === "draft") {
          setFinalState("draft");
          setFinalMessage(body.message || "Payment didn't go through. Please try again.");
          setStep("details");
          return;
        }
      } catch { /* keep polling */ }
    }
    setSubmitError("Payment is taking longer than expected. Check your M-Pesa messages, then refresh /kazi-karibu/my-posts.");
    setStep("details");
  }

  // ── Step: category selection ──────────────────────────────────────────
  if (step === "category") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Link href="/kazi-karibu"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
          <Card>
            <CardContent className="p-6 md:p-8">
              <div className="mb-2 text-xs uppercase font-semibold text-emerald-700">Step 1 of 2</div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">What kind of job?</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">Pick the category that best matches the work.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {KAZI_KARIBU_CATEGORIES.map((cat) => {
                  const Icon = CATEGORY_ICONS[cat.id] ?? Briefcase;
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={`p-4 rounded-lg border text-left transition ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400"
                      }`}
                      data-testid={`cat-btn-${cat.id}`}
                    >
                      <Icon className={`h-6 w-6 mb-2 ${isSelected ? "text-emerald-700" : "text-slate-500"}`} />
                      <div className="text-sm font-medium">{cat.label}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-end">
                <Button
                  onClick={() => setStep("details")}
                  disabled={!category}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="btn-cat-next"
                >
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Step: details ─────────────────────────────────────────────────────
  if (step === "details" || step === "submitting") {
    const canSubmit = title.trim().length >= 5 && description.trim().length >= 30 && county;
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => setStep("category")}><ArrowLeft className="h-4 w-4 mr-1" /> Change category</Button>
          <Card>
            <CardContent className="p-6 md:p-8 space-y-4">
              <div>
                <div className="mb-2 text-xs uppercase font-semibold text-emerald-700">Step 2 of 2</div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Post details</h1>
                <p className="text-sm text-slate-600 dark:text-slate-300">Category: <strong>{KAZI_KARIBU_CATEGORIES.find(c => c.id === category)?.label}</strong></p>
              </div>

              {ruleHits.length > 0 && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-rose-800 dark:text-rose-200 mb-1">Please fix these before posting:</div>
                      <ul className="text-xs text-rose-700 dark:text-rose-300 space-y-1 list-disc list-inside">
                        {ruleHits.map((h) => (<li key={h.ruleId}>{h.posterReason}</li>))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {submitError && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 p-3 text-sm text-rose-700 dark:text-rose-300">
                  {submitError}
                </div>
              )}

              <div>
                <label className="text-sm font-medium block mb-1">County</label>
                <select
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-900"
                  data-testid="input-county"
                >
                  <option value="">Select county</option>
                  {KENYAN_COUNTIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Sub-county or estate <span className="text-slate-400">(recommended)</span></label>
                <Input
                  value={subCounty}
                  onChange={(e) => setSubCounty(e.target.value)}
                  placeholder="e.g. Kileleshwa, Ruaka, South B"
                  data-testid="input-subcounty"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Job title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. House help needed for 3-person family"
                  maxLength={120}
                  data-testid="input-title"
                />
                <p className="text-xs text-slate-500 mt-1">{title.length}/120</p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what you need done, any qualifications required, hours, and anything an applicant should know."
                  rows={5}
                  maxLength={4000}
                  data-testid="input-description"
                />
                <p className="text-xs text-slate-500 mt-1">{description.length}/4000 · minimum 30 characters</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Budget minimum (KES)</label>
                  <Input
                    type="number"
                    value={budgetMin}
                    onChange={(e) => setBudgetMin(e.target.value)}
                    placeholder="e.g. 15000"
                    data-testid="input-budget-min"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Budget maximum (KES)</label>
                  <Input
                    type="number"
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(e.target.value)}
                    placeholder="e.g. 18000"
                    data-testid="input-budget-max"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Budget period</label>
                  <select
                    value={budgetPeriod}
                    onChange={(e) => setBudgetPeriod(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-900"
                    data-testid="input-budget-period"
                  >
                    {KAZI_KARIBU_BUDGET_PERIODS.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Duration</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-900"
                    data-testid="input-duration"
                  >
                    {KAZI_KARIBU_DURATIONS.map((d) => (<option key={d.id} value={d.id}>{d.label}</option>))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="mb-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-200">
                  <strong>First post is free.</strong> Subsequent posts are KES 100 each, valid for 7 days. Applicants apply free.
                </div>
                <Button
                  onClick={saveDraft}
                  disabled={!canSubmit || step === "submitting"}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  size="lg"
                  data-testid="btn-post"
                >
                  {step === "submitting" ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>
                  ) : (
                    <>Post job <ChevronRight className="h-4 w-4 ml-1" /></>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Step: payment (awaiting M-Pesa) ───────────────────────────────────
  if (step === "payment" || step === "polling") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <Loader2 className="h-10 w-10 text-emerald-600 mx-auto animate-spin mb-3" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Check your phone</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              We've sent an M-Pesa prompt for <strong>KES {amountKes}</strong> to pay for your post.
              Approve it, then wait here — we'll publish your job the moment payment lands.
            </p>
            {transactionRef && (
              <p className="text-xs text-slate-400">Reference: {transactionRef}</p>
            )}
            <p className="mt-4 text-xs text-slate-500">Don't close this page. Nanjila will review your post in seconds after payment.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step: done ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          {finalState === "live" ? (
            <>
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 mb-4">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Your job is live!</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">{finalMessage}</p>
              <div className="space-y-2">
                <Link href={`/kazi-karibu/job/${postId}`}>
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">View my post</Button>
                </Link>
                <Link href="/kazi-karibu/my-posts">
                  <Button variant="outline" className="w-full">My posts</Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 mb-4">
                <Sparkles className="h-8 w-8 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Under review</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">{finalMessage}</p>
              <Link href="/kazi-karibu/my-posts">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">My posts</Button>
              </Link>
            </>
          )}
          {isFree && (
            <p className="mt-4 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              🎁 First post free — welcome to Kazi Karibu.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
