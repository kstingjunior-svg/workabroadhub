/**
 * PlanStatusBanner — small persistent banner shown to PAID users so they
 * always know what tier they're on and when it expires.
 *
 * Especially important for KES 99 / 24-hour trial users: without this they
 * mistake "my trial ended" for "the app forgot my payment" and re-pay
 * unnecessarily. With it, they see "Trial · expires in 14 hours" and know
 * exactly what to do next (extend to Monthly/Yearly).
 *
 * Hidden for free users (they get the upsell cards instead) and for admins.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { isPaidUser } from "@/lib/plan";
import { Crown, Clock, ArrowUpCircle } from "lucide-react";

interface UserPlanResponse {
  planId: string;
  plan?: { planName?: string; price?: number };
  subscription?: { endDate?: string | null; plan?: string } | null;
}

function humanRemaining(endDateIso: string | null | undefined): {
  text: string;
  urgency: "ok" | "soon" | "now";
} | null {
  if (!endDateIso) return null;
  const end = new Date(endDateIso).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return { text: "expired", urgency: "now" };
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (days >= 2)  return { text: `${days} days left`, urgency: "ok" };
  if (days === 1) return { text: `1 day left`, urgency: "ok" };
  if (hrs >= 2)   return { text: `${hrs} hours left`, urgency: hrs < 6 ? "soon" : "ok" };
  if (hrs === 1)  return { text: `1 hour left`, urgency: "soon" };
  return { text: `${mins} min left`, urgency: "now" };
}

const PLAN_LABEL: Record<string, string> = {
  trial:        "1-Day Trial",
  basic:        "Basic",
  monthly:      "Monthly",
  yearly:       "Yearly",
  pro:          "Pro (Yearly)",
  pro_referral: "Pro (Referral)",
};

export function PlanStatusBanner() {
  const { user } = useAuth();
  const { data } = useQuery<UserPlanResponse | null>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  if (!user || (user as any).isAdmin) return null;
  const planId = data?.planId;
  if (!planId || !isPaidUser(planId)) return null;

  const remaining = humanRemaining(data?.subscription?.endDate);
  const label = PLAN_LABEL[planId] ?? planId;

  // Color scheme by urgency
  const urgency = remaining?.urgency ?? "ok";
  const bgClass =
    urgency === "now"
      ? "bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-200"
      : urgency === "soon"
        ? "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200"
        : "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200";

  // Trial users get the most prominent CTA to extend — they're the most likely
  // to re-pay unnecessarily because their tier IS short by design.
  const isTrial = planId === "trial" || planId === "basic";

  return (
    <div
      className={`rounded-xl border px-4 py-2.5 mb-4 flex flex-wrap items-center gap-3 text-sm ${bgClass}`}
      role="status"
      data-testid="plan-status-banner"
    >
      <Crown className="h-4 w-4 shrink-0" />
      <span className="font-semibold">{label} active</span>
      {remaining && (
        <span className="inline-flex items-center gap-1 text-xs opacity-90">
          <Clock className="h-3.5 w-3.5" />
          {remaining.text}
        </span>
      )}
      <span className="ml-auto" />
      {isTrial && (
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1 text-xs font-semibold underline decoration-dotted underline-offset-2 hover:no-underline"
          data-testid="link-extend-plan"
        >
          <ArrowUpCircle className="h-3.5 w-3.5" />
          Extend to Monthly (KES 1,000) or Yearly (KES 4,500)
        </Link>
      )}
    </div>
  );
}
