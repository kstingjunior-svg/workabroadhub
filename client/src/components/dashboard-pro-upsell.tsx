/**
 * Dashboard Pro Upsell card — KES 4,500/year framed three different ways
 * to engage different parts of the buyer's brain:
 *   1. Yearly total (anchor)         → "KES 4,500 / year"
 *   2. Daily cost (relatability)     → "Just KES 12/day — less than mandazi"
 *   3. Monthly saved (loss aversion) → "Save KES 7,500 vs monthly"
 *
 * Hides automatically for users who already have Pro.
 */
import { Link } from "wouter";
import { isPaidUser } from "@/lib/plan";
import { useAuth } from "@/hooks/use-auth";
import { Crown, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const PRO_FEATURES = [
  "Unlimited NEA agency checks",
  "All 30+ verified job portals",
  "ATS CV scanner — unlimited",
  "WhatsApp Nanjila — direct line",
  "Priority placement in job alerts",
  "All paid services discounted",
];

export function DashboardProUpsell() {
  const { user } = useAuth();
  // 2026-06 LAG FIX: was 30s. Shares queryKey with dashboard-visa-jobs-locked
  // so React Query dedupes the fetch across both widgets. 2 min interval +
  // refetchOnFocus catches post-payment unlocks within seconds of the user
  // switching back to the tab, without hammering the server every 30s.
  const { data: freshPlan } = useQuery<{ planId: string } | null>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  const isAlreadyPro =
    isPaidUser((user as any)?.plan) ||
    isPaidUser(freshPlan?.planId) ||
    (user as any)?.subscriptionStatus === "active" ||
    (user as any)?.isAdmin === true;

  if (isAlreadyPro) return null;

  return (
    <section className="mb-6" aria-label="Pro Plan upgrade">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 text-white p-5 sm:p-6 shadow-lg">
        {/* decorative sparkle pattern */}
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center gap-5">
          {/* LEFT: pitch */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="h-5 w-5" />
              <span className="text-xs font-bold tracking-wider uppercase">WorkAbroad Hub Pro</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-bold mb-1.5 leading-tight">
              Unlock everything for KES 12/day
            </h3>
            <p className="text-sm text-white/90 leading-snug mb-3 max-w-md">
              Less than mandazi. One year of full access — every tool, every job portal,
              every service unlocked. Pay once via M-Pesa.
            </p>

            {/* Feature list */}
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mb-4">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-200" />
                  <span className="text-white/95">{f}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-baseline gap-3 mb-1">
              <span className="text-3xl sm:text-4xl font-bold">KES 4,500</span>
              <span className="text-sm text-white/80">per year</span>
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-semibold">
                Save KES 7,500 vs monthly
              </span>
            </div>
            <p className="text-xs text-white/70">
              Works out to KES 375/month or about KES 12/day. One-time M-Pesa payment.
            </p>
          </div>

          {/* RIGHT: CTA */}
          <div className="flex flex-col items-stretch gap-2 w-full lg:w-auto lg:min-w-[200px]">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 bg-white text-amber-700 hover:bg-amber-50 font-bold py-3 px-5 rounded-xl shadow-md transition-all hover:scale-[1.02]"
              data-testid="button-upgrade-pro"
            >
              <Sparkles className="h-4 w-4" /> Upgrade to Pro <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-[11px] text-center text-white/80">
              💳 M-Pesa Paybill 4153025 · activates instantly
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
