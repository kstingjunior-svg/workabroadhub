import { useState, useEffect } from "react";
import {
  X,
  Eye,
  EyeOff,
  Loader2,
  Check,
  AlertCircle,
  UserPlus,
  LogIn,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";

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
}

interface FieldErrors {
  firstName?: string;
  email?: string;
  password?: string;
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

  if (!password) return null;

  return (
    <div className="flex gap-3 mt-1">
      {checks.map((c) => (
        <span
          key={c.label}
          className={`flex items-center gap-1 text-[11px] ${
            c.ok
              ? "text-green-600"
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

export function AuthModal({
  open,
  onClose,
  defaultTab = "login",
  redirectPath,
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

  const [showPassword, setShowPassword] =
    useState(false);

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

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setServerError("");
    setServerRecovery(null);
    setFieldErrors({});
    setSuccessMsg("");
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    resetForm();
  };

  const validate = (): boolean => {
    const errs: FieldErrors = {};

    if (
      tab === "signup" &&
      firstName.trim().length < 2
    ) {
      errs.firstName =
        "Name must be at least 2 characters";
    }

    if (
      !email.includes("@") ||
      !email.includes(".")
    ) {
      errs.email =
        "Please enter a valid email";
    }

    if (tab === "signup") {
      if (password.length < 8) {
        errs.password =
          "Password must be at least 8 characters";
      } else if (
        !/[A-Z]/.test(password)
      ) {
        errs.password =
          "Must include an uppercase letter";
      } else if (
        !/[0-9]/.test(password)
      ) {
        errs.password =
          "Must include a number";
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

      const referral_code =
        localStorage.getItem(
          "referral_code"
        ) || undefined;

      const body =
        tab === "signup"
          ? {
              firstName:
                firstName.trim(),
              lastName:
                lastName.trim(),
              email: email.trim(),
              password,
              ...(referral_code
                ? { referral_code }
                : {}),
            }
          : {
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
        setServerError(
          data.message ||
            "Something went wrong. Please try again."
        );
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

      const finalDest =
        redirectPath ||
        localStorage.getItem("auth_redirect") ||
        "/dashboard";

      if (tab === "signup") {
        // 2026-07 (Tony's inline-verify request): stay INSIDE the modal.
        // Server already fired a 6-digit code to the user's email during
        // signup. Switch to the "verify" stage — user sees the code on
        // their phone's email notification, types it right here, and only
        // then are they redirected. No page navigation away from signup.
        setPendingDest(finalDest);
        setStage("verify");
        // clear the auth_redirect intent for later
        localStorage.removeItem("auth_redirect");
        setLoading(false);
        return;
      }

      // Login path — unchanged, straight to destination
      setTimeout(() => {
        onClose();
        resetForm();
        localStorage.removeItem("auth_redirect");
        navigate(finalDest);
      }, 400);
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
  const submitVerify = async () => {
    setVerifyError("");
    const clean = verifyCode.replace(/\D/g, "");
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
        `${apiBase}/api/auth/verify-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({ code: clean }),
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
      // Success — close modal + go to destination
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
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const csrfRes = await fetch(
        `${apiBase}/api/csrf-token`,
        { credentials: "include" },
      );
      const { csrfToken } = await csrfRes.json();
      await fetch(
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
      setResendCooldown(30);
    } catch {
      setVerifyError(
        "Could not resend the code. Please try again in a moment.",
      );
    }
  };

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
              ? "Verify your email"
              : tab === "login"
              ? "Welcome back"
              : "Create your free account"}
          </h2>

          <p className="text-sm text-muted-foreground mt-0.5">
            {stage === "verify"
              ? `We sent a 6-digit code to ${email}. Check your inbox and spam folder.`
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
              <Label htmlFor="verify-code" className="mb-2 block">
                Enter the 6-digit code
              </Label>
              <Input
                id="verify-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                autoFocus
                placeholder="123456"
                value={verifyCode}
                onChange={(e) =>
                  setVerifyCode(
                    e.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                disabled={verifying}
                data-testid="input-verify-code"
              />
              {verifyError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                  {verifyError}
                </p>
              )}
            </div>

            <Button
              onClick={submitVerify}
              disabled={
                verifying ||
                verifyCode.replace(/\D/g, "").length !== 6
              }
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              size="lg"
              data-testid="button-verify-code"
            >
              {verifying ? "Verifying..." : "Verify & continue"}
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

            <div className="text-[11px] text-muted-foreground text-center leading-relaxed">
              The code should appear on your phone within seconds as an
              email notification. Pull down your notification bar to see
              it — you don't have to open Gmail. On iPhone the code appears
              right above your keyboard when you tap the box above.
            </div>
          </div>
        )}

        {stage !== "verify" && (<>
        {/* ── Tabs + login/signup form (hidden during verify stage) ── */}

        <div className="flex mx-6 mt-4 rounded-lg bg-muted p-1 gap-1">
          <button
            onClick={() =>
              switchTab("login")
            }
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-md transition-all ${
              tab === "login"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign In
          </button>

          <button
            onClick={() =>
              switchTab("signup")
            }
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-md transition-all ${
              tab === "signup"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Sign Up
          </button>
        </div>

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
                {/* 2026-06: when the server flags a recovery path, surface
                    real clickable buttons. Locked users get a prominent
                    "Reset password now" CTA — biggest unlock the founder
                    asked for: "let them smoothly log in back." */}
                {serverRecovery?.forgotPasswordUrl && (
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
                  Last name
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
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="auth-email">
              Email address{" "}
              <span className="text-red-500">
                *
              </span>
            </Label>

            <Input
              id="auth-email"
              type="email"
              placeholder="grace@example.com"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
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
              <a
                href="/forgot-password"
                className="text-primary hover:underline"
                data-testid="link-forgot-password"
              >
                Forgot your password?
              </a>
            </p>
          )}

          <p className="text-center text-sm text-muted-foreground">
            {tab === "login" ? (
              <>
                Don't have an account?{" "}

                <button
                  type="button"
                  onClick={() =>
                    switchTab(
                      "signup"
                    )
                  }
                  className="text-primary font-medium hover:underline"
                >
                  Sign up free
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}

                <button
                  type="button"
                  onClick={() =>
                    switchTab(
                      "login"
                    )
                  }
                  className="text-primary font-medium hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </form>
        </>)}
      </div>
    </div>
  );
}