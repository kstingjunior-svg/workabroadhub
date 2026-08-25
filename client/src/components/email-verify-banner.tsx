/**
 * EmailVerifyBanner
 *
 * 2026-08 (Tony's fake-email report): a persistent sticky banner shown at
 * the top of every page for authenticated users whose email_verified=false.
 * Tells them what to do (check inbox + spam folder), lets them resend the
 * code with one tap, and links to /account/verify to enter the code.
 *
 * The server-side wall (server/middleware/requireEmailVerifiedApi.ts)
 * already blocks every non-allowlisted /api/* call for unverified users;
 * this component ensures they see a clear message instead of getting
 * silent 403s from every button they try.
 *
 * Rendering rules
 * ───────────────
 *   • Hidden entirely for anonymous / not-loaded / verified / admin users.
 *   • Hidden on the /account/verify page itself (would be annoying to have a
 *     "please verify" banner on the page telling you exactly how to verify).
 *   • Hidden on auth pages (login/register/forgot-password) so first-time
 *     load isn't visually noisy.
 *   • Uses fixed positioning at the very top so nav bars, drawers, and
 *     modals all sit below it.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Mail, RefreshCw, X } from "lucide-react";

const HIDE_ON_PATHS = new Set<string>([
  "/account/verify",   // real email OTP page
  "/verify-phone",     // legacy phone OTP page
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
  const queryClient = useQueryClient();
  const [resending, setResending] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // 2026-08 (Tony's "banner scares verified users" fix): if the auth payload
  // is missing the emailVerified field entirely (i.e. `undefined`, not
  // `false`), the response came from the OLD buggy server that dropped
  // verification flags. In that case, don't render the banner AND kick off
  // an auth-cache invalidation so the browser refetches the corrected
  // payload. Treating undefined as "unverified" was the exact bug that
  // kept the red "Final warning" stuck on fully-verified accounts.
  const emailVerifiedRaw = (user as any)?.emailVerified;
  const emailVerifiedFieldMissing = user != null && emailVerifiedRaw === undefined;

  useEffect(() => {
    if (emailVerifiedFieldMissing) {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    }
  }, [emailVerifiedFieldMissing, queryClient]);

  const shouldHide = useMemo(() => {
    if (isLoading) return true;
    if (!user) return true;
    // Admins bypass everywhere.
    if ((user as any).isAdmin || (user as any).role === "ADMIN" || (user as any).role === "SUPER_ADMIN") return true;
    // Verified users don't need the nag.
    if (emailVerifiedRaw === true) return true;
    // 2026-08: field missing = old cached payload from buggy server. Don't
    // show the alarming red banner until we know for sure the user is
    // unverified. The useEffect above triggers a refetch — next render
    // will have the truth.
    if (emailVerifiedFieldMissing) return true;
    // Don't nag on the verify page itself.
    if (HIDE_ON_PATHS.has(location)) return true;
    return false;
  }, [user, isLoading, location, emailVerifiedRaw, emailVerifiedFieldMissing]);

  // 2026-08 (Tony's 72h auto-delete policy): compute remaining time from
  // users.created_at so the banner escalates urgency as the deadline nears.
  // Server-side sweep also deletes at 72h; this just shows the same countdown.
  const countdown = useMemo(() => {
    const createdRaw =
      (user as any)?.createdAt ??
      (user as any)?.created_at ??
      null;
    if (!createdRaw) return null;
    const created = new Date(createdRaw).getTime();
    if (Number.isNaN(created)) return null;
    const deletionAtMs = created + 72 * 60 * 60 * 1000;
    const hoursLeft = (deletionAtMs - Date.now()) / (60 * 60 * 1000);
    if (hoursLeft <= 0) return { text: "less than 1 hour", tone: "final" as const };
    if (hoursLeft <= 6)  return { text: `${Math.max(1, Math.ceil(hoursLeft))} hour${Math.ceil(hoursLeft) === 1 ? "" : "s"}`, tone: "final"   as const };
    if (hoursLeft <= 24) return { text: `${Math.ceil(hoursLeft)} hours`, tone: "warning" as const };
    if (hoursLeft <= 48) return { text: `${Math.ceil(hoursLeft / 24 * 10) / 10} days`, tone: "reminder" as const };
    return { text: `${Math.ceil(hoursLeft / 24)} days`, tone: "gentle" as const };
  }, [user]);

  if (shouldHide || dismissed) return null;

  // Escalate color as the deadline approaches.
  const bg =
    countdown?.tone === "final"    ? "bg-red-600 text-white" :
    countdown?.tone === "warning"  ? "bg-orange-500 text-white" :
    countdown?.tone === "reminder" ? "bg-amber-500 text-amber-950" :
                                     "bg-amber-400 text-amber-950";

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
        // 2026-08 (deliverability): tell users EXACTLY what to look for in
        // their inbox — from name, subject, and last-2-digits of the code.
        // Prevents "I can't find the email" tickets even when Gmail routes
        // us to Spam or Promotions.
        const hint = (data as any)?.codeHint;
        toast({
          title: "Code sent — check inbox AND spam folder",
          description: hint
            ? `Look for an email from Tony · code ending in ${hint} · Subject: 'Your sign-in code from Tony'. It works for 30 minutes.`
            : "Look for an email from Tony · Subject: 'Your sign-in code from Tony'. Check spam if you don't see it.",
          duration: 15000,
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
      className={`sticky top-0 z-[100] w-full shadow-md ${bg}`}
      data-testid="email-verify-banner"
    >
      <div className="max-w-6xl mx-auto px-3 py-2 flex items-center gap-2 sm:gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0 leading-snug">
          <span className="font-semibold">
            {countdown?.tone === "final"
              ? "Final warning — verify your email now."
              : "Verify your email to continue."}
          </span>{" "}
          <span className="hidden sm:inline">
            We sent a code to <b className="break-all">{(user as any)?.email ?? "your inbox"}</b>. Check your <b>inbox and spam folder</b>.
          </span>
          <span className="sm:hidden">Check inbox + spam folder.</span>
          {countdown && (
            <div className="text-xs font-semibold mt-0.5 opacity-90">
              Your account will be automatically deleted in <b>{countdown.text}</b> if not verified.
            </div>
          )}
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
          href="/account/verify"
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
