import { useState } from "react";
import { useLocation, Link } from "wouter";
import { ArrowLeft, Loader2, Check, Mail } from "lucide-react";

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  // 2026-10: honest "no account" answer + masked destination on success.
  const [noAccount, setNoAccount] = useState<{ message: string; hint: string | null } | null>(null);
  const [sentMsg, setSentMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNoAccount(null);
    const v = email.trim();
    const looksPhone = !v.includes("@") && v.replace(/\D/g, "").length >= 9;
    if (!looksPhone && (!v.includes("@") || !v.includes("."))) {
      setError("Enter your email address or the phone number you signed up with.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier: v.toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.noAccount) {
        setNoAccount({ message: data.message, hint: data.similarAccountHint ?? null });
        return;
      }
      if (!res.ok || data?.ok === false) {
        setError(data.message || "Something went wrong. Please try again.");
        return;
      }
      setSentMsg(data.message || "");
      setSent(true);
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
          data-testid="forgot-password-card"
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
              Reset your password
            </h1>
            <p className="text-[#5A6A7A] text-sm">
              Enter your email or phone number. We'll send a reset link to the email on your account.
            </p>
          </div>

          {sent ? (
            <div className="text-center py-6" data-testid="reset-sent">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-green-50 rounded-full mb-4">
                <Mail className="h-7 w-7 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-[#1A2530] mb-2">Check your inbox</h2>
              <p className="text-sm text-[#5A6A7A] mb-6">
                {sentMsg || "Reset link sent. Check your inbox (and spam)."}
              </p>
              {/* 2026-10: faster path — no new password needed. */}
              <button
                onClick={() => navigate(`/login?code=1&email=${encodeURIComponent(email.trim().toLowerCase())}`)}
                className="w-full mb-3 py-[14px] bg-[#C2461E] text-white font-semibold text-base rounded-[12px] hover:opacity-90 transition-opacity"
                data-testid="btn-forgot-use-code"
              >
                Faster: sign in with a 6-digit code instead
              </button>
              <button
                onClick={() => navigate("/login")}
                className="w-full py-[14px] bg-[#1A2530] text-white font-semibold text-base rounded-[12px] hover:bg-[#2A3A4A] transition-colors"
                data-testid="btn-back-to-login"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div
                  className="bg-[#FEF3F2] text-[#D92D20] px-4 py-3 rounded-[8px] text-sm"
                  data-testid="forgot-error"
                >
                  {error}
                </div>
              )}

              {noAccount && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-[8px] text-sm space-y-3" data-testid="forgot-no-account">
                  <div>{noAccount.message}</div>
                  <button
                    type="button"
                    onClick={() => navigate(`/signup${email.includes("@") ? `?email=${encodeURIComponent(email.trim().toLowerCase())}` : ""}`)}
                    className="w-full py-2.5 bg-[#1A2530] text-white font-semibold rounded-[10px] hover:bg-[#2A3A4A]"
                    data-testid="btn-forgot-create-account"
                  >
                    Create my free account
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#1A2530] mb-1.5">
                  Email or phone number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="grace@gmail.com or 0712 345 678"
                  disabled={loading}
                  required
                  autoComplete="username"
                  data-testid="input-forgot-email"
                  className="w-full px-[14px] py-[14px] border-[1.5px] border-[#E2DDD5] rounded-[12px] text-base text-[#1A2530] placeholder:text-[#B0BAC4] focus:outline-none focus:border-[#1A2530] disabled:opacity-60 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                data-testid="btn-send-reset"
                className="w-full py-[14px] bg-[#1A2530] text-white font-semibold text-base rounded-[12px] hover:bg-[#2A3A4A] active:bg-[#0F1A24] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : "Send Reset Instructions →"}
              </button>

              <p className="text-center text-sm text-[#5A6A7A]">
                Remembered it?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="text-[#1A2530] font-medium hover:underline"
                  data-testid="link-back-to-login"
                >
                  Sign in
                </button>
              </p>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-[#7A8A9A] mt-5 space-x-3">
          <Link href="/privacy-policy" className="hover:text-[#1A2530] transition-colors">Privacy Policy</Link>
          <span>·</span>
          <Link href="/terms-of-service" className="hover:text-[#1A2530] transition-colors">Terms</Link>
          <span>·</span>
          <Link href="/contact" className="hover:text-[#1A2530] transition-colors">Help</Link>
        </p>
      </div>
    </div>
  );
}
