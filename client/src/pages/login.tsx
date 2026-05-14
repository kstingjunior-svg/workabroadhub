import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, Loader2, Check, ExternalLink, ArrowLeft } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

async function trackEvent(event: string, extra?: { category?: string; country?: string }) {
  try { await apiRequest("POST", "/api/track", { event, page: window.location.pathname, ...extra }); } catch {}
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
      {checks.map(c => (
        <span key={c.label} className={`flex items-center gap-1 text-[11px] ${c.ok ? "text-green-600" : "text-[#7A8A9A]"}`}>
          <Check className={`h-3 w-3 ${c.ok ? "opacity-100" : "opacity-25"}`} />
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
    return r && r !== "/" && r !== "/dashboard" ? r : "/dashboard";
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
    setFirstName(""); setLastName(""); setEmail(""); setPassword("");
    setError(""); setSuccess("");
  };

  const switchTab = (t: Tab) => { setTab(t); resetForm(); };

  const validate = (): string | null => {
    if (tab === "signup" && firstName.trim().length < 2) return "First name must be at least 2 characters";
    if (!email.includes("@") || !email.includes(".")) return "Please enter a valid email address";
    if (tab === "signup") {
      if (password.length < 8) return "Password must be at least 8 characters";
      if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
      if (!/[0-9]/.test(password)) return "Password must include a number";
    } else {
      if (!password) return "Password is required";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    try {
      // Fetch CSRF token first
      const csrfRes = await fetch("/api/csrf-token", {
        credentials: "include",
      });
      const { csrfToken } = await csrfRes.json();

      const endpoint = tab === "signup" ? "/api/auth/register" : "/api/auth/login";
      const referral_code = localStorage.getItem("referral_code") || undefined;
      const body = tab === "signup"
        ? { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password, ...(referral_code ? { referral_code } : {}) }
        : { email: email.trim(), password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "USE_REPLIT_AUTH") {
          setError("This account uses Replit login — click 'Continue with Replit' below.");
        } else {
          setError(data.message || "Something went wrong. Please try again.");
        }
        return;
      }

      if (tab === "signup") localStorage.removeItem("referral_code");

      setSuccess(tab === "signup" ? "Account created! Redirecting…" : "Signed in! Redirecting…");
      if (tab === "signup") trackEvent("signup");
      queryClient.clear();
      sessionStorage.clear();

      setTimeout(() => {
        const dest = localStorage.getItem("auth_redirect") || redirectTo;
        localStorage.removeItem("auth_redirect");
        navigate(dest, { replace: true });
      }, 700);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #F4F2EE 0%, #FFFFFF 100%)" }}>
        <Loader2 className="h-6 w-6 animate-spin text-[#1A2530]" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "linear-gradient(135deg, #F4F2EE 0%, #FFFFFF 100%)" }}
    >
      <div className="w-full max-w-[420px]">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm text-[#7A8A9A] hover:text-[#1A2530] mb-6 transition-colors"
          data-testid="link-back-home"
        >
          <ArrowLeft className="h-4 w-4" />
          WorkAbroad Hub
        </button>

        <div
          className="bg-white rounded-[24px] p-10 border border-[#E2DDD5]"
          style={{ boxShadow: "0 20px 40px -10px rgba(0,0,0,0.05)" }}
          data-testid="login-card"
        >
          <div className="mb-7">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">🌍</span>
              <span className="text-sm font-semibold text-[#1A2530]">WorkAbroad Hub</span>
            </div>
            <h1
              className="text-[2rem] font-semibold text-[#1A2530] leading-tight mb-1"
              style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
              data-testid="heading-login"
            >
              {tab === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-[#5A6A7A] text-sm">
              {tab === "signin"
                ? "Sign in to your WorkAbroad Hub account"
                : "Join professionals building overseas careers"}
            </p>
          </div>

          <div className="flex gap-0.5 bg-[#F4F2EE] rounded-[10px] p-1 mb-6">
            {(["signin", "signup"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`flex-1 py-2 text-sm font-medium rounded-[8px] transition-all ${
                  tab === t
                    ? "bg-white text-[#1A2530] shadow-sm"
                    : "text-[#7A8A9A] hover:text-[#1A2530]"
                }`}
                data-testid={`tab-${t}`}
              >
                {t === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          {error && (
            <div
              className="bg-[#FEF3F2] text-[#D92D20] px-4 py-3 rounded-[8px] text-sm mb-5 leading-snug"
              data-testid="login-error"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              className="bg-green-50 text-green-700 px-4 py-3 rounded-[8px] text-sm mb-5 flex items-center gap-2"
              data-testid="login-success"
            >
              <Check className="h-4 w-4 flex-shrink-0" />
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {tab === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#1A2530] mb-1.5">
                    First name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Grace"
                    disabled={loading}
                    autoComplete="given-name"
                    data-testid="input-firstName"
                    className="w-full px-[14px] py-[14px] border-[1.5px] border-[#E2DDD5] rounded-[12px] font-[Inter,sans-serif] text-base text-[#1A2530] placeholder:text-[#B0BAC4] focus:outline-none focus:border-[#1A2530] disabled:opacity-60 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1A2530] mb-1.5">Last name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Wanjiku"
                    disabled={loading}
                    autoComplete="family-name"
                    data-testid="input-lastName"
                    className="w-full px-[14px] py-[14px] border-[1.5px] border-[#E2DDD5] rounded-[12px] font-[Inter,sans-serif] text-base text-[#1A2530] placeholder:text-[#B0BAC4] focus:outline-none focus:border-[#1A2530] disabled:opacity-60 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#1A2530] mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                autoComplete="email"
                required
                data-testid="input-email"
                className="w-full px-[14px] py-[14px] border-[1.5px] border-[#E2DDD5] rounded-[12px] font-[Inter,sans-serif] text-base text-[#1A2530] placeholder:text-[#B0BAC4] focus:outline-none focus:border-[#1A2530] disabled:opacity-60 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-[#1A2530]">
                  Password <span className="text-red-500">*</span>
                </label>
                {tab === "signin" && (
                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="text-xs text-[#1A6AFF] hover:text-[#0050CC] font-medium transition-colors"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={tab === "signup" ? "Min 8 chars, 1 uppercase, 1 number" : "••••••••"}
                  disabled={loading}
                  autoComplete={tab === "signup" ? "new-password" : "current-password"}
                  required
                  data-testid="input-password"
                  className="w-full px-[14px] py-[14px] pr-11 border-[1.5px] border-[#E2DDD5] rounded-[12px] font-[Inter,sans-serif] text-base text-[#1A2530] placeholder:text-[#B0BAC4] focus:outline-none focus:border-[#1A2530] disabled:opacity-60 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7A8A9A] hover:text-[#1A2530] transition-colors"
                  data-testid="btn-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {tab === "signup" && <PasswordStrength password={password} />}
            </div>

            <button
              type="submit"
              disabled={loading || !!success}
              data-testid={tab === "signin" ? "btn-signin-submit" : "btn-signup-submit"}
              className="w-full py-[14px] bg-[#1A2530] text-white font-semibold text-base rounded-[12px] hover:bg-[#2A3A4A] active:bg-[#0F1A24] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 mt-1"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {tab === "signin" ? "Signing in…" : "Creating account…"}</>
                : tab === "signin" ? "Sign In →" : "Create Free Account →"}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E2DDD5]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-[#7A8A9A]">or</span>
            </div>
          </div>

          
            href="/api/login"
            onClick={() => {
              if (redirectTo && redirectTo !== "/" && redirectTo !== "/dashboard") {
                localStorage.setItem("auth_redirect", redirectTo);
              }
            }}
            className="flex items-center justify-center gap-2 w-full py-[12px] border-[1.5px] border-[#E2DDD5] rounded-[12px] text-sm text-[#5A6A7A] hover:border-[#1A2530] hover:text-[#1A2530] transition-colors"
            data-testid="btn-replit-login"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Continue with Replit
          </a>

          <p className="text-center text-sm text-[#5A6A7A] mt-5">
            {tab === "signin" ? (
              <>Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchTab("signup")}
                  className="text-[#1A2530] font-medium hover:underline"
                  data-testid="link-switch-to-signup"
                >
                  Sign up free
                </button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchTab("signin")}
                  className="text-[#1A2530] font-medium hover:underline"
                  data-testid="link-switch-to-signin"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        <p className="text-center text-xs text-[#7A8A9A] mt-5 space-x-3">
          <a href="/privacy-policy" className="hover:text-[#1A2530] transition-colors">Privacy Policy</a>
          <span>·</span>
          <a href="/terms-of-service" className="hover:text-[#1A2530] transition-colors">Terms</a>
          <span>·</span>
          <a href="/contact" className="hover:text-[#1A2530] transition-colors">Help</a>
        </p>
      </div>
    </div>
  );
}
