/**
 * /signup — passwordless, mobile-first registration (2026-11).
 *
 * Tony's signup redesign: only TWO fields (full name + email). No phone,
 * no password, no country picker. We email a 6-digit code; entering it
 * verifies the email, signs the person in and opens the dashboard.
 *
 * Server: POST /api/auth/signup/start + /api/auth/signup/verify, which
 * reuse the existing verification-code system (no second OTP system).
 * Existing password users still sign in from the normal Login screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MailCheck, ShieldCheck, ChevronDown, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import OtpInput from "@/components/otp-input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { SeoHead } from "@/components/seo-head";

const apiBase = import.meta.env.VITE_API_URL || "";

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function safeRedirect(raw: string | null): string {
  return raw && /^\/(?![/\\])/.test(raw) ? raw : "/dashboard";
}

const inputCls =
  "block w-full h-12 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-4 " +
  "text-base text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary";

export default function SignupPage() {
  const { user, isLoading } = useAuth() as any;
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const redirectTo = safeRedirect(params.get("redirect"));

  const [step, setStep] = useState<"details" | "code">("details");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(() => (params.get("email") || "").slice(0, 254));
  const [referral, setReferral] = useState(() => {
    const fromUrl = (params.get("ref") || "").toUpperCase();
    if (fromUrl) { try { localStorage.setItem("referral_code", fromUrl); } catch { /* ignore */ } return fromUrl; }
    try { return (localStorage.getItem("referral_code") || "").toUpperCase(); } catch { return ""; }
  });
  const [showReferral, setShowReferral] = useState(() => !!referral);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; message: string; suggestion?: string } | null>(null);

  const [sentTo, setSentTo] = useState<{ email: string; masked: string; existing: boolean; hint?: string } | null>(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const verifyingRef = useRef(false);

  // 2026-11 Name Guard: live feedback while typing (the server re-checks on Continue).
  const [nameCheck, setNameCheck] = useState<{ status: "idle" | "checking" | "ok" | "warn" | "error"; message?: string | null }>({ status: "idle" });
  useEffect(() => {
    const n = fullName.replace(/\s+/g, " ").trim();
    if (n.length < 2) { setNameCheck({ status: "idle" }); return; }
    setNameCheck((c) => (c.status === "idle" ? c : { ...c, status: "checking" }));
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/api/auth/name-check`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: n }), signal: ctrl.signal,
        });
        const j = await res.json().catch(() => ({}));
        if (j.decision === "accept") setNameCheck({ status: "ok" });
        else if (j.decision === "reject") setNameCheck({ status: j.message?.startsWith("Please check") ? "warn" : "error", message: j.message });
        else setNameCheck({ status: "idle" }); // review / unknown: say nothing, never scare a real person
      } catch { /* offline or aborted: the server checks again on Continue */ }
    }, 650);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [fullName]);

  // Already signed in → straight to the dashboard.
  useEffect(() => {
    if (!isLoading && user?.id && step === "details" && !busy) navigate(redirectTo, { replace: true });
  }, [isLoading, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function start(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    const name = fullName.replace(/\s+/g, " ").trim();
    const mail = email.trim().toLowerCase();
    if (name.length < 2) return setErr({ field: "fullName", message: "Please enter your full name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return setErr({ field: "email", message: "Please enter a valid email address." });
    setBusy(true);
    try {
      const r = await postJson("/api/auth/signup/start", { fullName: name, email: mail, referralCode: showReferral ? referral.trim() : "" });
      if (!r.ok) {
        setErr({ field: r.data?.field, message: r.data?.message || "Something went wrong. Please try again.", suggestion: r.data?.suggestion });
        return;
      }
      setSentTo({ email: r.data.email, masked: r.data.maskedEmail, existing: !!r.data.existing, hint: r.data.codeHint });
      setCode("");
      setCooldown(60);
      setStep("code");
      window.scrollTo({ top: 0 });
    } catch {
      setErr({ message: "No connection. Check your internet and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!sentTo || cooldown > 0) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await postJson("/api/auth/signup/start", { fullName: fullName.trim() || "Member", email: sentTo.email, referralCode: showReferral ? referral.trim() : "" });
      if (!r.ok) { setErr({ message: r.data?.message || "Couldn't resend right now." }); return; }
      setSentTo((s) => (s ? { ...s, hint: r.data.codeHint } : s));
      setCooldown(60);
      toast({ title: r.data.reused ? "Your code is still valid" : "New code sent", description: `Check ${r.data.maskedEmail} (and your Spam folder).` });
    } catch {
      setErr({ message: "No connection. Check your internet and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (!sentTo || verifyingRef.current || value.length !== 6) return;
    verifyingRef.current = true;
    setErr(null);
    setBusy(true);
    try {
      const r = await postJson("/api/auth/signup/verify", { email: sentTo.email, code: value });
      if (!r.ok) {
        setErr({ message: r.data?.message || "That code doesn't match." });
        setCode("");
        return;
      }
      try { localStorage.removeItem("referral_code"); } catch { /* ignore */ }
      try {
        const u = await fetch(`${apiBase}/api/auth/user`, { credentials: "include" });
        if (u.ok) qc.setQueryData(["/api/auth/user"], await u.json());
      } catch { /* the dashboard refetches anyway */ }
      await qc.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: r.data.isNew ? `Welcome to WorkAbroad Hub${r.data.firstName ? `, ${r.data.firstName}` : ""}!` : `Welcome back${r.data.firstName ? `, ${r.data.firstName}` : ""}!`,
        description: r.data.isNew ? "Your account is ready." : "You're signed in.",
      });
      navigate(redirectTo, { replace: true });
    } catch {
      setErr({ message: "No connection. Check your internet and try again." });
    } finally {
      verifyingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-[100dvh] bg-gray-50 dark:bg-gray-950 flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <SeoHead
        title="Create your free account — WorkAbroad Hub"
        description="Create your free WorkAbroad Hub account with just your name and email."
        keywords="create account, sign up, WorkAbroad Hub, jobs abroad"
        canonical="https://workabroadhub.tech/signup"
      />
      <header className="px-4 pt-4 flex items-center justify-between max-w-md w-full mx-auto">
        <Link href="/" className="flex items-center gap-2 text-gray-900 dark:text-white" data-testid="link-home">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded" />
          <span className="font-bold">WorkAbroad Hub</span>
        </Link>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 py-6 sm:py-10">
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm p-5 sm:p-7">
          {step === "details" ? (
            <form onSubmit={start} noValidate className="space-y-5" data-testid="form-signup">
              <div className="text-center space-y-2">
                <span className="inline-block rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 px-3 py-1 text-xs font-bold tracking-wide">FREE REGISTRATION</span>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Start your journey abroad</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Create your free WorkAbroad Hub account and explore verified overseas career opportunities.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="signup-name" className="block text-sm font-medium text-gray-800 dark:text-gray-200">Full name</label>
                <div className="relative">
                <input id="signup-name" className={`${inputCls} pr-10 ${nameCheck.status === "error" ? "border-red-400 focus:ring-red-400" : nameCheck.status === "ok" ? "border-green-500" : ""}`} value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name" autoComplete="name" autoCapitalize="words" enterKeyHint="next" maxLength={100}
                  aria-invalid={err?.field === "fullName" || nameCheck.status === "error"} aria-describedby="signup-name-hint" data-testid="input-fullname" />
                  {nameCheck.status === "ok" && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-600" aria-label="Looks good" data-testid="name-ok" />}
                  {nameCheck.status === "checking" && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
                </div>
                <div id="signup-name-hint" aria-live="polite">
                  {err?.field === "fullName" ? <p className="text-sm text-red-600">{err.message}</p>
                    : nameCheck.status === "error" ? <p className="text-sm text-red-600 flex gap-1.5" data-testid="name-error"><AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />{nameCheck.message}</p>
                    : nameCheck.status === "warn" ? <p className="text-sm text-amber-700" data-testid="name-warn">{nameCheck.message}</p> : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="signup-email" className="block text-sm font-medium text-gray-800 dark:text-gray-200">Email address</label>
                <input id="signup-email" type="email" inputMode="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  enterKeyHint="go" maxLength={254} aria-invalid={err?.field === "email"} data-testid="input-email" />
                {err?.field === "email" && (
                  <p className="text-sm text-red-600">
                    {err.message}
                    {err.suggestion && (
                      <> <button type="button" className="underline font-semibold" onClick={() => { setEmail(err.suggestion!); setErr(null); }}>Use {err.suggestion}</button></>
                    )}
                  </p>
                )}
              </div>

              {!showReferral ? (
                <button type="button" onClick={() => setShowReferral(true)} className="inline-flex items-center gap-1 text-sm font-medium text-primary" data-testid="button-show-referral">
                  Have a referral code? <ChevronDown className="h-4 w-4" />
                </button>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="signup-ref" className="block text-sm font-medium text-gray-800 dark:text-gray-200">Referral code <span className="text-gray-500 font-normal">(optional)</span></label>
                  <input id="signup-ref" className={inputCls} value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())}
                    placeholder="e.g. WAH-1234" autoCapitalize="characters" autoCorrect="off" maxLength={32} data-testid="input-referral" />
                </div>
              )}

              <div className="flex gap-3 rounded-xl bg-green-50 dark:bg-green-950/30 p-3">
                <ShieldCheck className="h-5 w-5 text-green-700 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-gray-900 dark:text-white">Your account is protected</p>
                  <p className="text-gray-600 dark:text-gray-400">We'll send a secure 6-digit code to your email. No password required.</p>
                </div>
              </div>

              {err && !err.field && <p className="text-sm text-red-600" role="alert">{err.message}</p>}

              <Button type="submit" disabled={busy} className="w-full h-12 text-base font-semibold rounded-xl" data-testid="button-continue">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
              </Button>

              <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                Already have an account?{" "}
                <Link href={`/login${redirectTo !== "/dashboard" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`} className="font-semibold text-gray-900 dark:text-white underline" data-testid="link-signin">Sign in</Link>
              </p>
              <p className="text-center text-xs text-gray-500">
                By continuing you agree to our <Link href="/terms-of-service" className="underline">Terms and Conditions</Link> and <Link href="/privacy-policy" className="underline">Privacy Policy</Link>.
              </p>
            </form>
          ) : (
            <div className="space-y-5 text-center" data-testid="step-code">
              <MailCheck className="h-10 w-10 text-green-700 mx-auto" />
              <div className="space-y-1.5">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Check your email</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {sentTo?.existing ? "You already have an account with this email. " : ""}
                  We sent a 6-digit code to <span className="font-semibold text-gray-900 dark:text-white break-all">{sentTo?.masked}</span>.
                  {sentTo?.hint ? <> Look for the code ending in <b>{sentTo.hint}</b>.</> : null}
                </p>
              </div>

              <div className="flex justify-center">
                <OtpInput value={code} onChange={(v) => { setCode(v); if (err) setErr(null); }} onComplete={verify} disabled={busy} autoFocus data-testid="input-otp" />
              </div>

              {err && <p className="text-sm text-red-600" role="alert">{err.message}</p>}

              <Button type="button" onClick={() => verify(code)} disabled={busy || code.length !== 6} className="w-full h-12 text-base font-semibold rounded-xl" data-testid="button-verify">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : sentTo?.existing ? "Sign in" : "Verify email"}
              </Button>

              <p className="text-sm text-gray-600 dark:text-gray-400">
                Didn't receive your code?{" "}
                {cooldown > 0 ? (
                  <span className="text-gray-500 tabular-nums">Resend in {cooldown}s</span>
                ) : (
                  <button type="button" onClick={resend} disabled={busy} className="font-semibold text-primary underline" data-testid="button-resend">Resend code</button>
                )}
              </p>
              <p className="text-xs text-gray-500">The code works for 10 minutes. Check your Spam or Promotions folder too.</p>

              <button type="button" onClick={() => { setStep("details"); setErr(null); setCode(""); }}
                className="inline-flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300 underline" data-testid="button-change-email">
                <ArrowLeft className="h-4 w-4" /> Use a different email
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
