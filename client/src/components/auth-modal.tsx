import { useState } from "react";
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

      queryClient.clear();

      sessionStorage.clear();

      setTimeout(() => {
        onClose();

        resetForm();

        const dest =
          redirectPath ||
          localStorage.getItem(
            "auth_redirect"
          ) ||
          "/dashboard";

        localStorage.removeItem(
          "auth_redirect"
        );

        navigate(dest);
      }, 800);
    } catch {
      setServerError(
        "Network error. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

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
            {tab === "login"
              ? "Welcome back"
              : "Create your free account"}
          </h2>

          <p className="text-sm text-muted-foreground mt-0.5">
            {tab === "login"
              ? "Sign in to access your overseas career tools"
              : "Join professionals worldwide building overseas careers"}
          </p>
        </div>

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

              <div>
                {serverError}

                {serverError.includes(
                  "Replit"
                ) && (
                  <a
                    href="/api/login"
                    className="flex items-center gap-1 mt-1 font-medium underline"
                  >
                    Continue with Replit

                    <ExternalLink className="h-3 w-3" />
                  </a>
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

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>

            <div className="relative flex justify-center text-xs text-muted-foreground">
              <span className="bg-background px-2">
                or
              </span>
            </div>
          </div>

          <a
            href="/api/login"
            onClick={() => {
              const dest =
                redirectPath || "";

              if (
                dest &&
                dest !== "/" &&
                dest !== "/dashboard"
              ) {
                localStorage.setItem(
                  "auth_redirect",
                  dest
                );
              }
            }}
            className="flex items-center justify-center gap-2 w-full h-10 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            data-testid="btn-replit-login"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Continue with Replit
          </a>

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
      </div>
    </div>
  );
}