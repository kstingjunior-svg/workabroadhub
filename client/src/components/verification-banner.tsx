/**
 * Verification banner — shows on dashboard when the signed-in user has
 * not yet verified their email and/or phone. Links to /account/verify.
 *
 * Hides itself silently when:
 *   - user is not signed in (no banner for anonymous)
 *   - user is an admin (admin bypass)
 *   - both email AND phone are verified
 *   - the status query is still loading (don't flash)
 *
 * Uses useQuery so it auto-refreshes whenever the user comes back from
 * /account/verify (queryClient.invalidate is fired there too).
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ShieldAlert, ArrowRight, Mail, Phone, CheckCircle2 } from "lucide-react";

interface VerificationStatus {
  email: string;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  isAdmin: boolean;
}

export function VerificationBanner() {
  const { user } = useAuth();

  const { data: status, isLoading } = useQuery<VerificationStatus | null>({
    queryKey: ["/api/auth/verification-status"],
    queryFn: async () => {
      const res = await fetch("/api/auth/verification-status", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
    staleTime: 60_000,
    // Silently fail rather than throwing into ErrorBoundary
    retry: false,
  });

  if (!user || isLoading || !status) return null;
  if (status.isAdmin) return null;
  if (status.emailVerified && status.phoneVerified) return null;

  const bothMissing = !status.emailVerified && !status.phoneVerified;
  const emailOnly = !status.emailVerified && status.phoneVerified;
  const phoneOnly = status.emailVerified && !status.phoneVerified;

  return (
    <div
      className="mb-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      data-testid="banner-verification"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {bothMissing && "Verify your account to unlock payments"}
            {emailOnly && "One step left — verify your email"}
            {phoneOnly && "One step left — verify your phone"}
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
            {bothMissing &&
              "We need a real email and phone before you can make a payment. It takes under a minute."}
            {emailOnly && "Check your inbox for a 6-digit code and enter it on the verification page."}
            {phoneOnly && "We'll text you a 6-digit code to confirm your number."}
          </p>

          {/* Mini status pills — show progress when one is already done */}
          {(emailOnly || phoneOnly) && (
            <div className="flex items-center gap-2 mt-2 text-[11px]">
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
                  status.emailVerified
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-white text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700"
                }`}
              >
                {status.emailVerified ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Mail className="h-3 w-3" />
                )}
                Email
              </span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
                  status.phoneVerified
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-white text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700"
                }`}
              >
                {status.phoneVerified ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Phone className="h-3 w-3" />
                )}
                Phone
              </span>
            </div>
          )}
        </div>
      </div>

      <Link
        href="/account/verify"
        className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors whitespace-nowrap"
        data-testid="btn-verify-now"
      >
        Verify now
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
