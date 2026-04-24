import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Eye, EyeOff, Check, ShieldCheck } from "lucide-react";

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

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setError("Invalid reset link. Please request a new one.");
    } else {
      setToken(t);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Invalid reset link. Please request a new one.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError("Password must include at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError("Password must include at least one number.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to reset password. Please try again.");
        return;
      }
      setDone(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "linear-gradient(135deg, #F4F2EE 0%, #FFFFFF 100%)" }}
    >
      <div className="w-full max-w-[420px]">
        <button
          onClick={() => navigate("/login")}
          className="flex items-center gap-1.5 text-sm text-[#7A8A9A] hover:text-[#1A2530] mb-6 transition-colors"
          data-testid="link-back-login"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </button>

        <div
          className="bg-white rounded-[24px] p-10 border border-[#E2DDD5]"
          style={{ boxShadow: "0 20px 40px -10px rgba(0,0,0,0.05)" }}
          data-testid="reset-password-card"
        >
          <div className="mb-7">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">🌍</span>
              <span className="text-sm font-semibold text-[#1A2530]">WorkAbroad Hub</span>
            </div>
            <h1
              className="text-[2rem] font-semibold text-[#1A2530] leading-tight mb-1"
              style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
            >
              Choose a new password
            </h1>
            <p className="text-[#5A6A7A] text-sm">
              Make it strong — you won't need to change it again soon.
            </p>
          </div>

          {done ? (
            <div className="text-center py-6" data-testid="reset-done">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-green-50 rounded-full mb-4">
                <ShieldCheck className="h-7 w-7 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-[#1A2530] mb-2">Password updated</h2>
              <p className="text-sm text-[#5A6A7A]">
                Your password has been changed. Redirecting to sign in…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div
                  className="bg-[#FEF3F2] text-[#D92D20] px-4 py-3 rounded-[8px] text-sm"
                  data-testid="reset-error"
                >
                  {error}
                  {error.includes("expired") && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => navigate("/forgot-password")}
                        className="text-[#D92D20] underline text-xs font-medium"
                      >
                        Request a new link →
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#1A2530] mb-1.5">
                  New password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                    disabled={loading || !token}
                    required
                    autoComplete="new-password"
                    data-testid="input-new-password"
                    className="w-full px-[14px] py-[14px] pr-11 border-[1.5px] border-[#E2DDD5] rounded-[12px] text-base text-[#1A2530] placeholder:text-[#B0BAC4] focus:outline-none focus:border-[#1A2530] disabled:opacity-60 transition-colors"
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
                <PasswordStrength password={password} />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A2530] mb-1.5">
                  Confirm new password <span className="text-red-500">*</span>
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your new password"
                  disabled={loading || !token}
                  required
                  autoComplete="new-password"
                  data-testid="input-confirm-password"
                  className={`w-full px-[14px] py-[14px] border-[1.5px] rounded-[12px] text-base text-[#1A2530] placeholder:text-[#B0BAC4] focus:outline-none disabled:opacity-60 transition-colors ${
                    confirmPassword && confirmPassword !== password
                      ? "border-[#D92D20] focus:border-[#D92D20]"
                      : "border-[#E2DDD5] focus:border-[#1A2530]"
                  }`}
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="text-[11px] text-[#D92D20] mt-1">Passwords don't match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !token}
                data-testid="btn-reset-submit"
                className="w-full py-[14px] bg-[#1A2530] text-white font-semibold text-base rounded-[12px] hover:bg-[#2A3A4A] active:bg-[#0F1A24] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating password…</>
                  : "Set New Password →"}
              </button>
            </form>
          )}
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
