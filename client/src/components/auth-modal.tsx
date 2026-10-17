import { useState, useEffect } from "react";
import {
  X,
  Eye,
  EyeOff,
  Loader2,
  Check,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/phone-input";
import { Label } from "@/components/ui/label";
import { useLocation, Link } from "wouter";
import { queryClient } from "@/lib/queryClient";
import OtpInput from "@/components/otp-input";

type Tab = "login" | "signup";
// 2026-07 (Tony's inline-verify request): "verify" is a stage the modal
// SWITCHES to after signup succeeds. User stays in the same modal on the
// same page, enters the 6-digit code from their email (which iOS/Android
// will auto-suggest above the keyboard thanks to autoComplete="one-time-code"),
// and only then are they redirected to their destination. No page-hop
// to /account/verify while they hunt for the code in Gmail.
type Stage = Tab | "verify";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: Tab;
  redirectPath?: string;
  /** 2026-10: prefill the email box (e.g. "Create account with this email"). */
  prefillEmail?: string;
}

interface FieldErrors {
  firstName?: string;
  email?: string;
  password?: string;
  phone?: string;
}

function PasswordStrength({
  password,
}: {
  password: string;
}) {
  const checks = [
    {
      label: "8+ characters",
      ok: password.length >= 8,
    },
    {
      label: "Uppercase letter",
      ok: /[A-Z]/.test(password),
    },
    {
      label: "Number",
      ok: /[0-9]/.test(password),
    },
  ];

  // 2026-07 UX FIX: previously hidden until user typed — meant users hit
  // 3 sequential errors before figuring out the rules. Now ALWAYS visible
  // in signup mode so rules are seen BEFORE typing starts. Muted colour when
  // empty, filled/green as each rule passes.
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
      {checks.map((c) => (
        <span
          key={c.label}
          className={`flex items-center gap-1 text-[11px] ${
            c.ok
              ? "text-green-600 font-medium"
              : "text-muted-foreground"
          }`}
        >
          <Check
            className={`h-3 w-3 ${
              c.ok
                ? "opacity-100"
                : "opacity-30"
            }`}
          />

          {c.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Detect common email typos (gmial.com, hotmial.com, yahho.com, etc.) and
 * suggest a fix. Kenya-heavy user base means Gmail is the dominant provider
 * so we bias toward gmail-typo detection. Returns null when the email looks
 * fine OR is too short to judge.
 */
function suggestEmailFix(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) return null;
  const [local, domain] = trimmed.split("@");
  if (!local || !domain || domain.length < 4) return null;

  // 2026-10: keep in sync with server/utils/email-validator.ts
  // COMMON_TYPO_DOMAINS. Server is the authoritative gate (will reject
  // typos we miss here), but doing it client-side lets us show the
  // suggestion live as the user types instead of after signup submit.
  const typos: Record<string, string> = {
    // Gmail (dominant provider for KE user base)
    "gmial.com": "gmail.com", "gnail.com": "gmail.com", "gamil.com": "gmail.com",
    "gmai.com": "gmail.com",  "gmal.com": "gmail.com",  "gmailc.om": "gmail.com",
    "gmail.co": "gmail.com",  "gmail.cm": "gmail.com",  "gmail.con": "gmail.com",
    "gmailcom": "gmail.com",  "gmil.com": "gmail.com",  "gmaill.com": "gmail.com",
    "gmaail.com": "gmail.com","gmaio.com": "gmail.com", "gmaik.com": "gmail.com",
    "gmali.com": "gmail.com", "gmain.com": "gmail.com", "gmsil.com": "gmail.com",
    "gnmail.com": "gmail.com","gemail.com": "gmail.com","gmail.om": "gmail.com",
    "gmail.cim": "gmail.com", "gmail.vom": "gmail.com",
    // Yahoo
    "yahho.com": "yahoo.com", "yaho.com": "yahoo.com",   "yahoo.co": "yahoo.com",
    "yahoocom": "yahoo.com",  "yahooo.com": "yahoo.com", "yaoo.com": "yahoo.com",
    "yhoo.com": "yahoo.com",  "yahhoo.com": "yahoo.com", "yahoo.con": "yahoo.com",
    "yahoo.cm": "yahoo.com",
    // Outlook / Hotmail
    "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.co": "hotmail.com",
    "outlok.com": "outlook.com",  "outloo.com": "outlook.com", "outllook.com": "outlook.com",
    "outlook.con": "outlook.com", "hotnail.com": "hotmail.com","hotmaill.com": "hotmail.com",
    "hotmil.com": "hotmail.com",  "hotmali.com": "hotmail.com","hotmail.con": "hotmail.com",
    "hotmail.cm": "hotmail.com",
    // iCloud
    "iclod.com": "icloud.com",  "icoud.com": "icloud.com",  "icloud.con": "icloud.com",
    // Proton
    "protonmai.com": "protonmail.com", "protomail.com": "protonmail.com", "proton.co": "proton.me",
  };
  const fix = typos[domain];
  if (fix && fix !== domain) return `${local}@${fix}`;
  return null;
}

export function AuthModal({
  open,
  onClose,
  defaultTab = "login",
  redirectPath,
  prefillEmail,
}: AuthModalProps) {
  const [tab, setTab] =
    useState<Tab>(defaultTab);

  // 2026-07: inline verification stage state
  const [stage, setStage] =
    useState<Stage>(defaultTab);
  const [verifyCode, setVerifyCode] =
    useState("");
  const [verifying, setVerifying] =
    useState(false);
  const [verifyError, setVerifyError] =
    useState("");
  const [resendCooldown, setResendCooldown] =
    useState(0);
  const [pendingDest, setPendingDest] =
    useState<string>("/dashboard");

  const [, navigate] = useLocation();

  const [firstName, setFirstName] =
    useState("");

  const [lastName, setLastName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  // 2026-07 (Tony's pan-African phone brief): capture phone at signup so
  // every user gets OTP + WhatsApp delivery from day one.
  const [phoneValue, setPhoneValue] =
    useState<{
      e164: string;
      countryIso: string;
      dialCode: string;
      national: string;
      valid: boolean;
    }>({ e164: "", countryIso: "KE", dialCode: "254", national: "", valid: false });

  const [showPassword, setShowPassword] =
    useState(false);

  // 2026-09 (Tony's referral audit): optional Referral Code input on the
  // signup form. Pre-fills from localStorage (populated when user clicked
  // a `?ref=CODE` invite link) but stays editable so a user who typed a
  // shared code by hand can enter it here directly. Field is OPTIONAL —
  // an empty value never blocks signup.
  const [referralCodeInput, setReferralCodeInput] = useState<string>(() => {
    try {
      return (localStorage.getItem("referral_code") || "").toUpperCase();
    } catch { return ""; }
  });

  const [loading, setLoading] =
    useState(false);

  const [serverError, setServerError] =
    useState("");
  // 2026-06 friendly-login pass: when the server tells us a recovery path
  // exists (wrong password / locked / unknown email), capture it so the
  // error box can render a real clickable "Reset password" button instead
  // of just words on a screen the user shrugs at.
  const [serverRecovery, setServerRecovery] = useState<{
    forgotPasswordUrl?: string;
    locked?: boolean;
    supportEmail?: string;
  } | null>(null);

  const [fieldErrors, setFieldErrors] =
    useState<FieldErrors>({});

  const [successMsg, setSuccessMsg] =
    useState("");

  // 2026-10 (Tony: "sign up is everything"): honest no-account answer with a
  // one-tap create path, and passwordless "email me a code" sign-in.
  const [noAccountInfo, setNoAccountInfo] = useState<{ message: string; hint: string | null } | null>(null);
  const [codeOffer, setCodeOffer] = useState(false);
  const [codeLogin, setCodeLogin] = useState(false);       // verify stage is a sign-in code, not signup verify
  const [codeIdentifier, setCodeIdentifier] = useState(""); // what the user typed (email or phone)
  const [codeMasked, setCodeMasked] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  // 2026-10 (Tony: "standard expiry, stop resend spam"): codes last 10 min.
  // Show the exact expiry so people use the code they have instead of
  // hammering Resend; Resend waits 60 s and reuses a just-sent code.
  const CODE_TTL_MIN = 10;
  const RESEND_WAIT_S = 60;
  const [codeExpiresAt, setCodeExpiresAt] = useState<number>(0);
  const [codeInfo, setCodeInfo] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setServerError("");
    setServerRecovery(null);
    setFieldErrors({});
    setSuccessMsg("");
    setNoAccountInfo(null);
    setCodeOffer(false);
    setCodeLogin(false);
    setCodeIdentifier("");
    setCodeMasked("");
    setVerifyCode("");
    setVerifyError("");
    setCodeExpiresAt(0);
    setCodeInfo("");
  };

  // 2026-09 (Tony's "Login brings Sign Up too" fix): Login and Sign Up are
  // now fully separate — no in-modal toggle between them. This same
  // <AuthModal> instance stays mounted for the whole page (see landing.tsx),
  // so `tab`/`stage` only picked up `defaultTab` on the very first mount.
  // Previously, once a user opened Sign Up once, the internal `tab` state
  // stayed "signup" forever — reopening via the "Login" button would still
  // show the Sign Up form, because nothing re-synced state to the new
  // `defaultTab` prop. Now every time the modal is opened, we force it back
  // to whichever tab the caller asked for and clear any leftover form state.
  useEffect(() => {
    if (open) {
      setTab(defaultTab);
      setStage(defaultTab);
      resetForm();
      if (prefillEmail) setEmail(prefillEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTab, prefillEmail]);

  const validate = (): boolean => {
    const errs: FieldErrors = {};

    if (
      tab === "signup" &&
      firstName.trim().length < 2
    ) {
      errs.firstName =
        "Please enter your first name";
    }

    // 2026-07 (pan-African phone): required at signup, must be valid E.164
    // for the selected country. PhoneInput enforces this live but we
    // double-check here so a form submitted before phone was typed shows
    // a clear error instead of a confusing server 400.
    if (tab === "signup" && !phoneValue.valid) {
      errs.phone = phoneValue.national
        ? "Please enter a valid mobile number for the selected country."
        : "Please enter your mobile number so we can send you an OTP and updates.";
    }

    // 2026-07 UX: stricter email validation. Was accepting "a@b" (missing
    // any domain suffix character), which triggers a confusing server 400
    // AFTER submit instead of a friendly inline error BEFORE submit.
    // New regex catches: missing @, missing dot in domain, dot at end,
    // trailing spaces (auto-trimmed), and doubles like grace@gmail..com.
    const emailTrimmed = email.trim();
    const loginByPhone = tab === "login" && !emailTrimmed.includes("@") && emailTrimmed.replace(/\D/g, "").length >= 9;
    if (!emailTrimmed) {
      errs.email = tab === "login" ? "Enter your email or phone number" : "Please enter your email";
    } else if (!loginByPhone && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTrimmed)) {
      errs.email = tab === "login"
        ? "Enter a valid email, or the phone number you signed up with"
        : "Please enter a valid email address";
    }

    if (tab === "signup") {
      // Show ALL failing password rules at once so user can fix everything
      // in one edit instead of hitting 3 sequential errors.
      const missing: string[] = [];
      if (password.length < 8)   missing.push("at least 8 characters");
      if (!/[A-Z]/.test(password)) missing.push("an uppercase letter");
      if (!/[0-9]/.test(password)) missing.push("a number");
      if (missing.length > 0) {
        errs.password = `Password needs ${missing.join(", ")}`;
      }
    } else {
      if (!password) {
        errs.password =
          "Password is required";
      }
    }

    setFieldErrors(errs);

    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setServerError("");
    setServerRecovery(null);
    setSuccessMsg("");
    setNoAccountInfo(null);
    setCodeOffer(false);

    if (!validate()) return;

    setLoading(true);

    try {
      const apiBase =
        import.meta.env.VITE_API_URL || "";

      const csrfRes = await fetch(
        `${apiBase}/api/csrf-token`,
        {
          credentials: "include",
        }
      );

      const { csrfToken } =
        await csrfRes.json();

      const endpoint =
        tab === "signup"
          ? `${apiBase}/api/auth/register`
          : `${apiBase}/api/auth/login`;

      // 2026-09 (Tony's referral audit): prefer the value the user just
      // typed on the form; fall back to whatever a `?ref=CODE` link stored
      // in localStorage. Either way — empty is fine, server drops silently.
      const referral_code =
        referralCodeInput.trim().toUpperCase() ||
        (localStorage.getItem("referral_code") || "").toUpperCase() ||
        undefined;

      const body =
        tab === "signup"
          ? {
              firstName:
                firstName.trim(),
              lastName:
                lastName.trim(),
              email: email.trim(),
              password,
              // 2026-07 (pan-African phone): send E.164 + structured fields.
              // Server accepts either full E.164 or the country+national parts
              // (whichever it can validate) and rejects with a clear message.
              ...(phoneValue.valid
                ? {
                    phoneNumberE164: phoneValue.e164,
                    countryIso:      phoneValue.countryIso,
                    dialCode:        phoneValue.dialCode,
                    nationalNumber:  phoneValue.national,
                    // Legacy `phone` field also populated for backward compat
                    phone:           phoneValue.e164,
                  }
                : {}),
              ...(referral_code
                ? { referral_code }
                : {}),
            }
          : {
              identifier: email.trim(),
              email: email.trim(),
              password,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          "X-CSRF-Token":
            csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        // 2026-09 (Tony's "code loop" fix): server signals unverified
        // account with unverifiedAccount:true. Instead of showing a
        // scary "invalid password / reset it" error, switch straight
        // to the code-entry stage — same UI the signup flow uses —
        // so the user can type the fresh code that was just emailed.
        if (data.unverifiedAccount === true || data.verificationRequired === true) {
          const params = new URLSearchParams(window.location.search);
          const returnTo = params.get("returnTo");
          const isSafeReturn = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//");
          const dest = (isSafeReturn ? returnTo : (localStorage.getItem("auth_redirect") || "/dashboard")) as string;
          setPendingDest(dest);
          setStage("verify");
          setLoading(false);
          return;
        }

        // 2026-10 (Tony's duplicate-cleanup follow-up): if the server
        // tells us this phone / email already has an account, flip the
        // user to the Login tab with a prefilled hint instead of showing
        // a dead-end error. One-tap recovery.
        // 2026-10: no account → say so and offer one-tap create.
        if (data.noAccount === true) {
          setNoAccountInfo({ message: data.message, hint: data.similarAccountHint ?? null });
          setLoading(false);
          return;
        }

        if (data.code === "PHONE_TAKEN" || data.code === "EMAIL_TAKEN" || data.suggestSignIn === true) {
          setServerError(data.message || "That account already exists — sign in instead.");
          // Flip to login tab. If the server told us the masked email,
          // leave the user's typed email in place so they can edit it;
          // the masked hint stays visible in the error banner.
          setLoading(false);
          setTimeout(() => setTab("login"), 400);
          return;
        }

        setServerError(
          data.message ||
            "Something went wrong. Please try again."
        );
        if (data.offerCode === true) setCodeOffer(true);
        // 2026-06: capture the recovery breadcrumbs the server now ships
        // (forgotPasswordUrl, locked flag, supportEmail) so the error box
        // can render a clickable Reset Password button instead of dead text.
        if (data.forgotPasswordUrl || data.locked || data.supportEmail || data.accountDeleted) {
          setServerRecovery({
            forgotPasswordUrl: data.forgotPasswordUrl,
            locked: !!data.locked,
            supportEmail: data.supportEmail,
          });
        }

        return;
      }

      if (tab === "signup") {
        localStorage.removeItem(
          "referral_code"
        );
      }

      setSuccessMsg(
        tab === "signup"
          ? "Account created! Taking you to your dashboard…"
          : "Signed in! Redirecting…"
      );

      sessionStorage.clear();

      // 2026-08 (Tony's "app keeps jumping after login" report): the redirect
      // race was this — App.tsx has a useEffect([user]) that reads
      // `auth_redirect` from localStorage and navigates the moment the auth
      // query cache flips truthy. Meanwhile THIS modal waits 400ms, then
      // reads the SAME key and navigates. Result: page bounces between the
      // intended destination and /dashboard. Fix: consume + clear the
      // localStorage entry HERE, snapshot it, but DO NOT delete yet — that
      // way if the modal's own setTimeout navigate fails (unmount mid-flight,
      // browser tab freeze, ancestor unmount, etc.) App.tsx's post-login
      // useEffect can still recover and land the user on the right page.
      // The cleanup happens in the setTimeout callback below, or in the
      // App.tsx effect (whichever fires first) — both check + remove.
      const preConsumedRedirect =
        redirectPath ||
        localStorage.getItem("auth_redirect") ||
        null;

      // Pre-populate the auth-user query cache so the dashboard mounts
      // already-authenticated.
      //
      // STEP 1 (always): trust the login response. It contains { id, email }
      //   at minimum, which is enough for useAuth.isAuthenticated = !!user
      //   to return true. The authenticated route tree will render and the
      //   dashboard's own queries will fetch any extra fields they need.
      //
      // STEP 2 (bonus): try to fetch the full user record so the cache has
      //   firstName/plan/role/etc populated immediately. Failure here is
      //   non-fatal — we keep the minimal user from STEP 1, log a warning,
      //   and let useAuth's normal staleTime/refetch eventually populate
      //   the full record.
      //
      // Previously this block called queryClient.clear() on any non-200
      // response, which wiped the just-set minimal user along with every
      // other cached query — that's what made post-login behave like
      // "not logged in" and bounced users to the home page.
      const minimalUser = { id: data.id, email: data.email } as any;
      queryClient.setQueryData(["/api/auth/user"], minimalUser);

      try {
        const userRes = await fetch(`${apiBase}/api/auth/user`, {
          credentials: "include",
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          queryClient.setQueryData(["/api/auth/user"], userData);
        } else {
          console.warn(
            `[Auth] verify /api/auth/user returned ${userRes.status}; keeping minimal user from login response`
          );
        }
      } catch (e: any) {
        console.warn(
          "[Auth] verify /api/auth/user network error; keeping minimal user from login response:",
          e?.message ?? e
        );
      }

      // NOTE: do NOT invalidateQueries here. That marks the cache stale and
      // triggers an immediate background refetch (because useAuth is already
      // mounted in App.tsx with an active observer). If that refetch hits a
      // transient 401 (cookie-acknowledgement race) or 5xx, useAuth's fetchUser
      // returns null/throws, the cache flips to null, App.tsx's `if (!user)`
      // becomes true, the unauthenticated Switch renders, and the user gets
      // bounced to /. Better to let the staleTime (30 s) carry the user past
      // the initial dashboard mount; any extra fields the dashboard needs are
      // fetched by its own queries.

      // 2026-08 (Tony's "app keeps jumping" fix): use the pre-consumed
      // value we snapshotted BEFORE setQueryData. Reading localStorage
      // again here would give the same answer, but doing it once above
      // makes the ordering guarantee obvious.
      const finalDest = preConsumedRedirect || "/dashboard";

      if (tab === "signup") {
        // 2026-07 (Tony's inline-verify request): stay INSIDE the modal.
        // Server already fired a 6-digit code to the user's email during
        // signup. Switch to the "verify" stage — user sees the code on
        // their phone's email notification, types it right here, and only
        // then are they redirected. No page navigation away from signup.
        setPendingDest(finalDest);
        setStage("verify");
        setLoading(false);
        return;
      }

      // Login path — straight to destination. Shortened the 400ms delay to
      // 150ms; the old 400ms window was long enough for a stray effect to
      // navigate first and cause the visible "flash" users reported.
      //
      // 2026-08 (Tony's "AutoApply lands on dashboard" fix): only clear
      // localStorage AFTER navigate fires. If this timeout never fires
      // (unmount / freeze), the App-level useEffect can still recover.
      setTimeout(() => {
        try { localStorage.removeItem("auth_redirect"); } catch {}
        onClose();
        resetForm();
        navigate(finalDest);
      }, 150);
    } catch {
      setServerError(
        "Network error. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // ── 2026-07: inline-verify handlers ───────────────────────────────────
  //
  // submitVerify — POST /api/auth/verify-email with the code. On success,
  // close the modal + navigate to pendingDest (the same dest we would have
  // gone to had verification not been required). On failure, show the
  // error inline in the modal.
  // 2026-10: passwordless sign-in. Sends a 6-digit code to the account's
  // email, then reuses the verify stage UI. Works with email OR phone typed.
  const requestLoginCode = async (opts?: { resend?: boolean }) => {
    const ident = (opts?.resend ? codeIdentifier : email).trim();
    if (!ident) {
      setFieldErrors({ email: "Enter your email or phone number first" });
      return;
    }
    setSendingCode(true);
    setServerError("");
    setServerRecovery(null);
    setNoAccountInfo(null);
    setVerifyError("");
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const { csrfToken } = await (await fetch(`${apiBase}/api/csrf-token`, { credentials: "include" })).json();
      const res = await fetch(`${apiBase}/api/auth/login-code/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        credentials: "include",
        body: JSON.stringify({ identifier: ident }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.noAccount) {
        setNoAccountInfo({ message: data.message, hint: data.similarAccountHint ?? null });
        return;
      }
      if (!res.ok) {
        if (opts?.resend) setVerifyError(data?.message || "Couldn't send a code. Try again.");
        else setServerError(data?.message || "Couldn't send a code. Try again.");
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("returnTo");
      const isSafeReturn = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//");
      setPendingDest((isSafeReturn ? returnTo : (redirectPath || localStorage.getItem("auth_redirect") || "/dashboard")) as string);
      setCodeIdentifier(ident);
      setCodeMasked(data.maskedEmail || "");
      setCodeLogin(true);
      if (!opts?.resend) setVerifyCode("");
      setCodeExpiresAt(data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + CODE_TTL_MIN * 60_000);
      setCodeInfo(data.reused ? "We sent you a code moments ago — use that one, it still works." : (opts?.resend ? "New code sent. Your earlier code also still works until it expires." : ""));
      setStage("verify");
      setResendCooldown(RESEND_WAIT_S);
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setSendingCode(false);
    }
  };

  const submitVerify = async (explicitCode?: string) => {
    setVerifyError("");
    // 2026-10 fix: accept an explicit code so the OTP input's
    // auto-submit (fires right after setVerifyCode) doesn't race
    // the React state flush.
    const clean = (explicitCode ?? verifyCode).replace(/\D/g, "");
    if (clean.length !== 6) {
      setVerifyError("Enter the 6-digit code from your email.");
      return;
    }
    setVerifying(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const csrfRes = await fetch(
        `${apiBase}/api/csrf-token`,
        { credentials: "include" },
      );
      const { csrfToken } = await csrfRes.json();
      const res = await fetch(
        codeLogin ? `${apiBase}/api/auth/login-code/verify` : `${apiBase}/api/auth/verify-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          // 2026-10: send the email we know belongs to the pending
          // verification so the server can resolve the user even if the
          // session cookie got dropped between signup and verification.
          body: JSON.stringify(codeLogin ? { code: clean, identifier: codeIdentifier } : { code: clean, email }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVerifyError(
          data?.message ??
            "That code didn't match. Check your inbox (and spam) or resend a new one.",
        );
        return;
      }
      // 2026-10: make sure the app sees the fresh session before navigating
      // (code sign-in has no prior session; signup verify flips emailVerified).
      try {
        const userRes = await fetch(`${apiBase}/api/auth/user`, { credentials: "include" });
        if (userRes.ok) queryClient.setQueryData(["/api/auth/user"], await userRes.json());
        else if (codeLogin && data?.id) queryClient.setQueryData(["/api/auth/user"], { id: data.id, email: data.email } as any);
      } catch { /* non-fatal */ }
      // Success — close modal + go to destination
      // 2026-08: clear localStorage AFTER navigating, so if this path also
      // races the App-level effect the redirect is still recoverable.
      try { localStorage.removeItem("auth_redirect"); } catch {}
      onClose();
      resetForm();
      navigate(pendingDest);
    } catch (err: any) {
      setVerifyError(
        "Could not reach the server. Please try again.",
      );
    } finally {
      setVerifying(false);
    }
  };

  const resendCode = async () => {
    if (resendCooldown > 0) return;
    setVerifyError("");
    if (codeLogin) { await requestLoginCode({ resend: true }); return; }
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const csrfRes = await fetch(
        `${apiBase}/api/csrf-token`,
        { credentials: "include" },
      );
      const { csrfToken } = await csrfRes.json();
      const rr = await fetch(
        `${apiBase}/api/auth/send-email-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({}),
        },
      );
      const rd = await rr.json().catch(() => ({}));
      if (!rr.ok) {
        setVerifyError(rd?.message || "Could not resend the code. Please try again in a moment.");
      } else {
        if (rd?.expiresAt) setCodeExpiresAt(new Date(rd.expiresAt).getTime());
        setCodeInfo(rd?.reused ? "We sent you a code moments ago — use that one, it still works." : "New code sent. Your earlier code also still works until it expires.");
      }
      setResendCooldown(RESEND_WAIT_S);
    } catch {
      setVerifyError(
        "Could not resend the code. Please try again in a moment.",
      );
    }
  };

  // Start the 10-min clock whenever we land on the code screen without one.
  useEffect(() => {
    if (stage === "verify") {
      setCodeExpiresAt((t) => (t > Date.now() ? t : Date.now() + CODE_TTL_MIN * 60_000));
      setResendCooldown((c) => (c > 0 ? c : RESEND_WAIT_S));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);
  useEffect(() => {
    if (stage !== "verify") return;
    const id = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [stage]);

  // Countdown for the resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(
      () => setResendCooldown((c) => c - 1),
      1000,
    );
    return () => clearTimeout(id);
  }, [resendCooldown]);

  // Auto-submit when 6 digits entered — same UX as iOS mail apps
  useEffect(() => {
    if (
      stage === "verify" &&
      verifyCode.replace(/\D/g, "").length === 6 &&
      !verifying
    ) {
      submitVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyCode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl z-10"
        data-testid="auth-modal"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 pb-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="text-base">
                🌍
              </span>
            </div>

            <span className="text-sm font-semibold text-primary">
              WorkAbroad Hub
            </span>
          </div>

          <h2 className="text-xl font-bold text-foreground mt-2">
            {stage === "verify"
              ? (codeLogin ? "Enter your sign-in code" : "Verify your email")
              : tab === "login"
              ? "Welcome back"
              : "Create your free account"}
          </h2>

          <p className="text-sm text-muted-foreground mt-0.5">
            {stage === "verify"
              ? `We sent a 6-digit code to ${codeLogin ? (codeMasked || "your email") : email}. Check your inbox and spam folder.`
              : tab === "login"
              ? "Sign in to access your overseas career tools"
              : "Join professionals worldwide building overseas careers"}
          </p>
        </div>

        {/* 2026-07: inline verify stage — replaces the form when user
            just signed up. iOS + Android auto-suggest the code above
            the keyboard thanks to autoComplete="one-time-code" so users
            never leave the page. */}
        {stage === "verify" && (
          <div className="p-6 pt-4 space-y-4" data-testid="stage-verify">
            <div>
              <Label className="mb-3 block text-center">
                Paste or type the 6-digit code
              </Label>
              <OtpInput
                value={verifyCode}
                onChange={setVerifyCode}
                onComplete={(code) => {
                  // Netflix-style auto-submit the moment all 6 digits
                  // land. 2026-10 fix: pass code explicitly so we
                  // don't race the React state flush of setVerifyCode.
                  if (!verifying) {
                    setVerifyCode(code);
                    submitVerify(code);
                  }
                }}
                disabled={verifying}
                autoFocus
                data-testid="input-verify-code"
              />
              {verifyError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-3 text-center">
                  {verifyError}
                </p>
              )}
              {codeExpiresAt > 0 && (() => {
                const msLeft = codeExpiresAt - nowTick;
                const until = new Date(codeExpiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                return msLeft > 0 ? (
                  <p className="text-xs text-muted-foreground mt-3 text-center" data-testid="text-code-expiry">
                    Code works for {CODE_TTL_MIN} minutes — until <strong>{until}</strong>
                    {" "}({Math.max(1, Math.ceil(msLeft / 60_000))} min left)
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 mt-3 text-center" data-testid="text-code-expired">
                    This code has expired. Tap Resend below for a new one.
                  </p>
                );
              })()}
              {codeInfo && !verifyError && (
                <p className="text-xs text-green-700 mt-2 text-center">{codeInfo}</p>
              )}
            </div>

            <Button
              // 2026-10 (sign-in QA): was onClick={submitVerify}, which passed
              // the click event as `explicitCode` → event.replace() threw →
              // tapping Verify silently did nothing. Call with no args.
              onClick={() => submitVerify()}
              disabled={
                verifying ||
                verifyCode.replace(/\D/g, "").length !== 6
              }
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              size="lg"
              data-testid="button-verify-code"
            >
              {verifying ? (codeLogin ? "Signing in..." : "Verifying...") : (codeLogin ? "Sign in" : "Verify & continue")}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={resendCode}
                disabled={resendCooldown > 0}
                className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
                data-testid="button-resend-code"
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : "Didn't get it? Resend code"}
              </button>
            </div>

            {codeLogin && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setCodeLogin(false); setStage("login"); setVerifyCode(""); setVerifyError(""); }}
                  className="text-xs text-muted-foreground hover:underline"
                  data-testid="button-use-password-instead"
                >
                  Use my password instead
                </button>
              </div>
            )}

            <div className="text-[11px] text-muted-foreground text-center leading-relaxed">
              The code should appear on your phone within seconds as an
              email notification. Pull down your notification bar to see
              it — you don't have to open Gmail. On iPhone the code appears
              right above your keyboard when you tap the box above.
            </div>
          </div>
        )}

        {stage !== "verify" && (<>
        {/* 2026-09 (Tony's "separate Login from Sign Up" request): no more
            in-modal Sign In / Sign Up toggle. This modal now only ever shows
            the single form matching whichever button opened it (`defaultTab`,
            synced above). Switching means closing this modal and clicking
            the other button (Login vs Sign Up) in the nav. */}

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4"
        >
          {successMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
              <Check className="h-4 w-4 flex-shrink-0" />
              {successMsg}
            </div>
          )}

          {serverError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />

              <div className="flex-1">
                <div>{serverError}</div>
                {/* 2026-10: one tap → 6-digit code → signed in. No reset link. */}
                {codeOffer && tab === "login" && (
                  <Button
                    type="button"
                    onClick={() => requestLoginCode()}
                    disabled={sendingCode}
                    className="mt-3 w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                    data-testid="button-email-me-code"
                  >
                    {sendingCode ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending code…</> : "Email me a sign-in code"}
                  </Button>
                )}
                {/* 2026-06: when the server flags a recovery path, surface
                    real clickable buttons. Locked users get a prominent
                    "Reset password now" CTA — biggest unlock the founder
                    asked for: "let them smoothly log in back." */}
                {serverRecovery?.forgotPasswordUrl && !codeOffer && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={serverRecovery.forgotPasswordUrl}
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                        serverRecovery.locked
                          ? "bg-red-600 hover:bg-red-700 text-white"
                          : "bg-white border border-red-300 text-red-700 hover:bg-red-100"
                      }`}
                      data-testid="link-reset-password-from-error"
                    >
                      {serverRecovery.locked ? "Reset password & get straight back in" : "Reset password"}
                    </a>
                    {serverRecovery.supportEmail && (
                      <a
                        href={`mailto:${serverRecovery.supportEmail}`}
                        className="text-xs text-red-700 hover:underline"
                      >
                        Or email support
                      </a>
                    )}
                  </div>
                )}
                {serverRecovery?.supportEmail && !serverRecovery?.forgotPasswordUrl && (
                  <div className="mt-3">
                    <a
                      href={`mailto:${serverRecovery.supportEmail}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md bg-white border border-red-300 text-red-700 hover:bg-red-100"
                    >
                      Contact support
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {noAccountInfo && tab === "login" && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm space-y-3" data-testid="box-no-account">
              <div>{noAccountInfo.message}</div>
              <Button
                type="button"
                onClick={() => {
                  setNoAccountInfo(null);
                  setServerError("");
                  setPassword("");
                  if (!email.includes("@")) setEmail("");
                  setTab("signup");
                  setStage("signup");
                }}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                data-testid="button-create-from-no-account"
              >
                {email.includes("@") ? "Create my free account with this email" : "Create my free account"}
              </Button>
              {noAccountInfo.hint && (
                <p className="text-xs text-amber-800">
                  Signed up with {noAccountInfo.hint}? Type that email above instead.
                </p>
              )}
            </div>
          )}

          {tab === "signup" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="auth-firstName">
                  First name{" "}
                  <span className="text-red-500">
                    *
                  </span>
                </Label>

                <Input
                  id="auth-firstName"
                  placeholder="Grace"
                  value={firstName}
                  onChange={(e) =>
                    setFirstName(
                      e.target.value
                    )
                  }
                  // 2026-07 UX: autofocus first field + browser autofill hints
                  autoFocus={tab === "signup"}
                  autoComplete="given-name"
                  autoCapitalize="words"
                  data-testid="input-firstName"
                  className={
                    fieldErrors.firstName
                      ? "border-red-500"
                      : ""
                  }
                />

                {fieldErrors.firstName && (
                  <p className="text-xs text-red-500">
                    {
                      fieldErrors.firstName
                    }
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="auth-lastName">
                  Last name{" "}
                  <span className="text-muted-foreground text-xs font-normal">
                    (optional)
                  </span>
                </Label>

                <Input
                  id="auth-lastName"
                  placeholder="Wanjiku"
                  value={lastName}
                  onChange={(e) =>
                    setLastName(
                      e.target.value
                    )
                  }
                  autoComplete="family-name"
                  autoCapitalize="words"
                  data-testid="input-lastName"
                />
              </div>
            </div>
          )}

          {/* 2026-07 (pan-African phone): required at signup so every user
              gets OTP + WhatsApp delivery from day one. Supports all 54
              African countries via server/shared/african-countries.ts. */}
          {tab === "signup" && (
            <PhoneInput
              onChange={(v) => setPhoneValue({
                e164:       v.e164,
                countryIso: v.country.iso,
                dialCode:   v.country.dialCode,
                national:   v.national,
                valid:      v.valid,
              })}
              label="Mobile number"
              required
              disabled={loading}
              testId="signup-phone"
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="auth-email">
              {tab === "login" ? "Email or phone number" : "Email address"}{" "}
              <span className="text-red-500">
                *
              </span>
            </Label>

            <Input
              id="auth-email"
              // 2026-10: login accepts email OR phone, so plain text there.
              type={tab === "login" ? "text" : "email"}
              // 2026-07 UX: Kenya-common placeholder + mobile-optimized keyboard hints
              placeholder={tab === "login" ? "grace@gmail.com or 0712 345 678" : "grace@gmail.com"}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (noAccountInfo) setNoAccountInfo(null);
              }}
              autoComplete={tab === "login" ? "username" : "email"}
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              data-testid="input-email"
              className={
                fieldErrors.email
                  ? "border-red-500"
                  : ""
              }
            />

            {fieldErrors.email && (
              <p className="text-xs text-red-500">
                {fieldErrors.email}
              </p>
            )}

            {/* Email typo suggestion — one-tap fix for gmial.com / yahho.com etc. */}
            {(() => {
              const suggested = suggestEmailFix(email);
              if (!suggested || fieldErrors.email) return null;
              return (
                <button
                  type="button"
                  onClick={() => setEmail(suggested)}
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                  data-testid="button-email-typo-fix"
                >
                  <span>Did you mean</span>
                  <strong className="font-semibold">{suggested}</strong>
                  <span>? Tap to fix</span>
                </button>
              );
            })()}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-password">
              Password{" "}
              <span className="text-red-500">
                *
              </span>
            </Label>

            <div className="relative">
              <Input
                id="auth-password"
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                placeholder={
                  tab === "signup"
                    ? "Min 8 chars, 1 uppercase, 1 number"
                    : "Your password"
                }
                value={password}
                onChange={(e) =>
                  setPassword(
                    e.target.value
                  )
                }
                // 2026-07 UX: correct autocomplete hint lets password managers
                // offer to save new passwords on signup + auto-fill on login.
                autoComplete={tab === "signup" ? "new-password" : "current-password"}
                autoFocus={tab === "login"}
                data-testid="input-password"
                className={`pr-10 ${
                  fieldErrors.password
                    ? "border-red-500"
                    : ""
                }`}
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword(
                    !showPassword
                  )
                }
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {fieldErrors.password && (
              <p className="text-xs text-red-500">
                {fieldErrors.password}
              </p>
            )}

            {tab === "signup" && (
              <PasswordStrength
                password={password}
              />
            )}
          </div>

          {/* 2026-09 (Tony's referral audit): optional Referral Code input.
              Someone shared a code with the user via WhatsApp / SMS / word
              of mouth? They paste it here. Empty is fine — signup succeeds
              either way. Server drops invalid or self-referral codes
              silently, never blocks the account. */}
          {tab === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-referral" className="flex items-center gap-2">
                Referral code
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="auth-referral"
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={32}
                placeholder="e.g. TONY123"
                value={referralCodeInput}
                onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase().trim())}
                data-testid="input-referral-code"
              />
              <p className="text-xs text-muted-foreground">
                Got a code from a friend? Enter it here and they earn 10% when you upgrade.
              </p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-11"
            disabled={
              loading || !!successMsg
            }
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />

                {tab === "login"
                  ? "Signing in…"
                  : "Creating account…"}
              </>
            ) : tab === "login" ? (
              "Sign In"
            ) : (
              "Create Free Account"
            )}
          </Button>

          {tab === "login" && (
            <p className="text-center text-sm text-muted-foreground -mt-1">
              {/* 2026-10: "Forgot password" now signs you in with an emailed
                  code right here — no reset link, no new password needed.
                  The classic reset page is still one tap away. */}
              <button
                type="button"
                onClick={() => requestLoginCode()}
                disabled={sendingCode}
                className="text-primary font-medium hover:underline disabled:opacity-60"
                data-testid="link-forgot-password"
              >
                {sendingCode ? "Sending code…" : "Forgot password? Sign in with an email code"}
              </button>
              <br />
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:underline">
                or reset my password
              </Link>
            </p>
          )}
          {/* 2026-10 (sign-in QA): small text switch, not the old toggle.
              People who never registered kept hitting "Invalid email or
              password" with no route to sign-up except closing the modal. */}
          {tab === "login" && (
            <p className="text-center text-sm text-muted-foreground -mt-2">
              New here?{" "}
              <button type="button" className="text-primary font-medium hover:underline"
                onClick={() => { setTab("signup"); setStage("signup"); }}
                data-testid="link-switch-to-signup">
                Create a free account
              </button>
            </p>
          )}
          {tab === "signup" && (
            <p className="text-center text-sm text-muted-foreground -mt-1">
              Already have an account?{" "}
              <button type="button" className="text-primary font-medium hover:underline"
                onClick={() => { setTab("login"); setStage("login"); }}
                data-testid="link-switch-to-login">
                Sign in
              </button>
            </p>
          )}
        </form>
        </>)}
      </div>
    </div>
  );
}