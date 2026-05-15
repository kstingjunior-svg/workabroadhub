
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Eye,
  EyeOff,
  Loader2,
  Check,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";

import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

async function trackEvent(
  event: string,
  extra?: { category?: string; country?: string }
) {
  try {
    await apiRequest("POST", "/api/track", {
      event,
      page: window.location.pathname,
      ...extra,
    });
  } catch {}
}

type Tab = "signin" | "signup";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ chars", ok: password.length >= 8 },
    { label: "Uppercase", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /[0-9]/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="flex gap-3 mt-1.5">
      {checks.map((c) => (
        <span
          key={c.label}
          className={`flex items-center gap-1 text-[11px] ${
            c.ok ? "text-green-600" : "text-[#7A8A9A]"
          }`}
        >
          <Check
            className={`h-3 w-3 ${
              c.ok ? "opacity-100" : "opacity-25"
            }`}
          />
          {c.label}
        </span>
      ))}
    </div>
  );
}

export default function LoginPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const [tab, setTab] = useState<Tab>("signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const redirectTo = (() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("redirect");

    return r && r !== "/" && r !== "/dashboard"
      ? r
      : "/dashboard";
  })();

  useEffect(() => {
    if (!authLoading && user) {
      const stored = localStorage.getItem("auth_redirect");

      if (stored && stored !== "/" && stored !== "/dashboard") {
        localStorage.removeItem("auth_redirect");
        navigate(stored, { replace: true });
      } else {
        navigate(redirectTo, { replace: true });
      }
    }
  }, [user, authLoading]);

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setError("");
    setSuccess("");
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    resetForm();
  };

  const validate = (): string | null => {
    if (tab === "signup" && firstName.trim().length < 2) {
      return "First name must be at least 2 characters";
    }

    if (!email.includes("@") || !email.includes(".")) {
      return "Please enter a valid email address";
    }

    if (tab === "signup") {
      if (password.length < 8) {
        return "Password must be at least 8 characters";
      }

      if (!/[A-Z]/.test(password)) {
        return "Password must include an uppercase letter";
      }

      if (!/[0-9]/.test(password)) {
        return "Password must include a number";
      }
    } else {
      if (!password) {
        return "Password is required";
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    const err = validate();

    if (err) {
      setError(err);
      return;
    }

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

      const csrfData = await csrfRes.json();

      const endpoint =
        tab === "signup"
          ? `${apiBase}/api/auth/register`
          : `${apiBase}/api/auth/login`;

      const referral_code =
        localStorage.getItem("referral_code") ||
        undefined;

      const body =
        tab === "signup"
          ? {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
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
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfData.csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(
          data.message ||
            "Something went wrong. Please try again."
        );

        return;
      }

      setSuccess(
        tab === "signup"
          ? "Account created! Redirecting..."
          : "Signed in! Redirecting..."
      );

      queryClient.clear();

      setTimeout(() => {
        navigate(redirectTo, { replace: true });
      }, 700);
    } catch (err) {
      console.error(err);

      setError(
        "Network error. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[420px]">

        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          WorkAbroad Hub
        </button>

        <div className="bg-white rounded-[24px] p-10 border">

          <div className="mb-7">
            <h1 className="text-3xl font-semibold mb-2">
              {tab === "signin"
                ? "Welcome back"
                : "Create your account"}
            </h1>

            <p className="text-sm text-gray-500">
              {tab === "signin"
                ? "Sign in to your account"
                : "Join professionals worldwide"}
            </p>
          </div>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => switchTab("signin")}
              className="flex-1 border rounded p-2"
            >
              Sign In
            </button>

            <button
              onClick={() => switchTab("signup")}
              className="flex-1 border rounded p-2"
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-100 text-green-700 p-3 rounded mb-4 text-sm">
              {success}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >

            {tab === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) =>
                    setFirstName(e.target.value)
                  }
                  className="border rounded p-3"
                />

                <input
                  type="text"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) =>
                    setLastName(e.target.value)
                  }
                  className="border rounded p-3"
                />
              </div>
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              className="w-full border rounded p-3"
            />

            <div className="relative">
              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                placeholder="Password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                className="w-full border rounded p-3 pr-10"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword(!showPassword)
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

            {tab === "signup" && (
              <PasswordStrength password={password} />
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white rounded p-3"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : tab === "signin" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div className="my-6 text-center text-sm text-gray-500">
            or
          </div>

          <a
            href="/api/login"
            className="flex items-center justify-center gap-2 w-full border rounded p-3"
          >
            <ExternalLink className="h-4 w-4" />
            Continue with Replit
          </a>

        </div>
      </div>
    </div>
  );
}