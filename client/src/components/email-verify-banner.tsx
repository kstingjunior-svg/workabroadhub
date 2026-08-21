/**
 * EmailVerifyBanner
 *
 * 2026-08 (Tony's fake-email report): a persistent sticky banner shown at
 * the top of every page for authenticated users whose email_verified=false.
 * Tells them what to do (check inbox + spam folder), lets them resend the
 * code with one tap, and links to /verify-email to enter the code.
 *
 * The server-side wall (server/middleware/requireEmailVerifiedApi.ts)
 * already blocks every non-allowlisted /api/* call for unverified users;
 * this component ensures they see a clear message instead of getting
 * silent 403s from every button they try.
 *
 * Rendering rules
 * ───────────────
 *   • Hidden entirely for anonymous / not-loaded / verified / admin users.
 *   • Hidden on the /verify-email page itself (would be annoying to have a
 *     "please verify" banner on the page telling you exactly how to verify).
 *   • Hidden on auth pages (login/register/forgot-password) so first-time
 *     load isn't visually noisy.
 *   • Uses fixed positioning at the very top so nav bars, drawers, and
 *     modals all sit below it.
 */

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Mail, RefreshCw, X } from "lucide-react";

const HIDE_ON_PATHS = new Set<string>([
  "/verify-email",
  "/verify-phone",
  "/login",
  "/signup",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

export function EmailVerifyBanner() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const shouldHide = useMemo(() => {
    if (isLoading) return true;
    if (!user) return true;
    // Admins bypass everywhere.
    if ((user as any).isAdmin || (user as any).role === "ADMIN" || (user as any).role === "SUPER_ADMIN") return true;
    // Verified users don't need the nag.
    if ((user as any).emailVerified === true) return true;
    // Don't nag on the verify page itself.
    if (HIDE_ON_PATHS.has(location)) return true;
    return false;
  }, [user, isLoading, location]);

  if (shouldHide || dismissed) return null;

  const resend = async () => {
    if (resending) return;
    setResending(true);
    try {
      const res = await fetch("/api/auth/send-email-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({
          title: "Verification code sent",
          description: `Check your inbox and spam folder for a code from WorkAbroadHub. It expires in 15 minutes.`,
        });
      } else {
        toast({
          title: "Couldn't send code",
          description: data?.message ?? "Please try again in a minute or contact support on WhatsApp.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Network error",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-[100] w-full bg-amber-500 text-amber-950 shadow-md"
      data-testid="email-verify-banner"
    >
      <div className="max-w-6xl mx-auto px-3 py-2 flex items-center gap-2 sm:gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0 leading-snug">
          <span className="font-semibold">Verify your email to continue.</span>{" "}
          <span className="hidden sm:inline">
            We sent a code to <b className="break-all">{(user as any)?.email ?? "your inbox"}</b>. Check your inbox <b>and spam folder</b>.
          </span>
          <span className="sm:hidden">Check inbox + spam folder.</span>
        </div>
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="inline-flex items-center gap-1 rounded-md bg-amber-950 text-amber-50 px-2.5 py-1 text-xs font-semibold hover:bg-black transition disabled:opacity-60"
          data-testid="btn-resend-verify-code"
        >
          {resending
            ? (<><RefreshCw className="h-3 w-3 animate-spin" /> Sending…</>)
            : (<><Mail className="h-3 w-3" /> Resend</>)
          }
        </button>
        <Link
          href="/verify-email"
          className="inline-flex items-center gap-1 rounded-md bg-white text-amber-950 px-2.5 py-1 text-xs font-semibold hover:bg-amber-100 transition"
          data-testid="btn-verify-now"
        >
          Enter code
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss for this session"
          className="p-1 rounded hover:bg-amber-600/50 transition"
          data-testid="btn-dismiss-verify-banner"
          title="Hide until next page load"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
