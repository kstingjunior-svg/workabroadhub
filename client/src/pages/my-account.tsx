import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import {
  useUserCredits,
  useUserSubscriptionsFB,
  useUserPaymentsFB,
  useUserApplicationsFB,
  type CreditType,
} from "@/lib/firebase-credits";
import {
  Briefcase,
  FileText,
  GraduationCap,
  Shield,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Receipt,
  ArrowRight,
  ChevronRight,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(ts: number) {
  return new Date(ts).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtKES(amount: number) {
  return `KES ${amount.toLocaleString()}`;
}

function daysLeft(expiryMs: number) {
  const diff = Math.floor((expiryMs - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

// ─── Credit type meta ─────────────────────────────────────────────────────────

const CREDIT_META: Record<
  CreditType,
  { label: string; icon: React.ReactNode; color: string; route: string }
> = {
  job_applications: {
    label: "Job Applications",
    icon: <Briefcase className="h-5 w-5" />,
    color: "#4A7C59",
    route: "/assisted-apply",
  },
  cv_services: {
    label: "CV Services",
    icon: <FileText className="h-5 w-5" />,
    color: "#1A2530",
    route: "/career-match",
  },
  university_applications: {
    label: "University Applications",
    icon: <GraduationCap className="h-5 w-5" />,
    color: "#5A6A7A",
    route: "/bulk-apply",
  },
  employer_verification: {
    label: "Employer Verification",
    icon: <Shield className="h-5 w-5" />,
    color: "#C47A1E",
    route: "/nea-agencies",
  },
};

const CREDIT_CTA: Record<CreditType, string> = {
  job_applications: "Use Application Credit",
  cv_services: "Use CV Credit",
  university_applications: "Use University Credit",
  employer_verification: "Verify Employer",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  label,
  children,
  subtext,
}: {
  label: string;
  children: React.ReactNode;
  subtext?: React.ReactNode;
}) {
  return (
    <div
      className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-6"
      data-testid={`summary-card-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-[#7A8A9A] dark:text-gray-400 mb-2">
        {label}
      </p>
      <div className="text-3xl font-bold text-[#1A2530] dark:text-white mb-1">
        {children}
      </div>
      {subtext && (
        <p className="text-xs text-[#5A6A7A] dark:text-gray-400 mt-1">{subtext}</p>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  daysRemaining,
}: {
  status: "active" | "expiring" | "expired" | "pending";
  daysRemaining?: number | null;
}) {
  const cfg = {
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    expiring: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    pending: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  };
  const label: Record<typeof status, string> = {
    active: "Active",
    expiring:
      daysRemaining != null && daysRemaining >= 0
        ? `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} left`
        : "Expiring Soon",
    expired: "Expired",
    pending: "Pending",
  };
  return (
    <span
      className={`inline-block px-3 py-0.5 rounded-full text-xs font-semibold ${cfg[status]}`}
    >
      {label[status]}
    </span>
  );
}

function AppStatusBadge({
  status,
}: {
  status: string;
}) {
  const cfg: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    in_progress: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  const label: Record<string, string> = {
    submitted: "Submitted",
    in_progress: "In Progress",
    accepted: "Accepted",
    rejected: "Rejected",
  };
  return (
    <span
      className={`inline-block px-3 py-0.5 rounded-full text-xs font-semibold ${cfg[status] || "bg-gray-100 text-gray-700"}`}
    >
      {label[status] || status}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyAccountPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const credits = useUserCredits(user?.id);
  const subscriptions = useUserSubscriptionsFB(user?.id);
  const fbPayments = useUserPaymentsFB(user?.id);
  const applications = useUserApplicationsFB(user?.id);

  // DB-backed subscription (primary source — always reliable even when Firebase is unavailable)
  const { data: dbSubscription } = useQuery<any | null>({
    queryKey: ["/api/subscription"],
    enabled: !!user,
    staleTime: 30_000,
  });

  // Also fetch DB-backed payment history as fallback
  const { data: dbPayments } = useQuery<any[]>({
    queryKey: ["/api/payments/history"],
    enabled: !!user,
  });

  // Latest M-Pesa payment status — seeded from REST, kept live via Supabase realtime
  const { data: initialPayment } = useQuery<any | null>({
    queryKey: ["/api/user/payment-status"],
    enabled: !!user,
    staleTime: 60_000,
  });

  const [latestPayment, setLatestPayment] = useState<any | null>(null);

  // Seed state from query on first load
  useEffect(() => {
    if (initialPayment) setLatestPayment(initialPayment);
  }, [initialPayment]);

  // Realtime subscription — scoped to this user's rows only
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`payments:user:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            setLatestPayment(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // ── Derived data ────────────────────────────────────────────────────────────

  // Pro plan — Firebase is preferred (real-time), DB subscription is the reliable fallback
  const proSub = subscriptions["pro_plan"];

  // Is the DB subscription active? (plan='pro', status='active', not expired)
  const dbProActive =
    dbSubscription &&
    dbSubscription.plan === "pro" &&
    dbSubscription.status === "active" &&
    (dbSubscription.endDate == null || new Date(dbSubscription.endDate) > new Date());

  const proStatus: "active" | "expiring" | "expired" =
    proSub
      ? proSub.status === "expired"
        ? "expired"
        : proSub.expiryDate && daysLeft(proSub.expiryDate) <= 30
        ? "expiring"
        : "active"
      : dbProActive
      ? dbSubscription?.endDate && daysLeft(new Date(dbSubscription.endDate).getTime()) <= 30
        ? "expiring"
        : "active"
      : user?.plan === "pro"
      ? "active"
      : "expired";

  // Days remaining on the Pro plan (for the status badge)
  const proExpiryDays: number | null = proSub?.expiryDate
    ? daysLeft(proSub.expiryDate)
    : dbProActive && dbSubscription?.endDate
    ? daysLeft(new Date(dbSubscription.endDate).getTime())
    : dbProActive && dbSubscription?.startDate
    ? daysLeft(new Date(dbSubscription.startDate).getTime() + 360 * 86_400_000)
    : null;

  // Days since the user upgraded to Pro (shown in subtext)
  const proStartMs: number | null = proSub?.startDate != null
    ? proSub.startDate
    : dbSubscription?.startDate
    ? new Date(dbSubscription.startDate).getTime()
    : null;
  const daysSinceUpgrade: number | null = proStartMs != null
    ? Math.floor((Date.now() - proStartMs) / (1000 * 60 * 60 * 24))
    : null;

  // Job applications credit
  const jobCredit = credits["job_applications"];
  const cvCredit = credits["cv_services"];

  // Total spent: sum all Firebase payments; fall back to DB
  const fbTotalSpent = fbPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const dbTotalSpent = dbPayments
    ? dbPayments
        .filter((p: any) => p.status === "completed" || p.status === "success")
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
    : 0;
  const totalSpent = fbTotalSpent || dbTotalSpent;

  // Merge payments (Firebase preferred, DB fallback)
  const mergedPayments: Array<{
    id: string;
    service: string;
    reference: string;
    amount: number;
    date: number;
    status: string;
  }> =
    fbPayments.length > 0
      ? fbPayments
      : (dbPayments || []).map((p: any) => ({
          id: String(p.id),
          service: p.description || p.serviceName || "Payment",
          reference: p.reference || p.transactionId || "-",
          amount: Number(p.amount),
          date: new Date(p.createdAt || p.date).getTime(),
          status: p.status,
        }));

  const creditEntries = Object.entries(credits) as [
    CreditType,
    NonNullable<(typeof credits)[CreditType]>
  ][];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F4F2EE] dark:bg-gray-950 px-4 py-8">
      <div className="max-w-6xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-[#D1CEC8] dark:border-gray-800 pb-6 mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#4A7C59] mb-1">
              WORKABROAD HUB
            </p>
            <h1 className="text-3xl font-semibold text-[#1A2530] dark:text-white" style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}>
              My Account
            </h1>
            <p className="text-sm text-[#5A6A7A] dark:text-gray-400 mt-0.5">
              Track your subscriptions, credits and application history
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-[#1A2530] dark:text-white">
                {user?.firstName
                  ? `${user.firstName} ${user.lastName || ""}`.trim()
                  : user?.email?.split("@")[0] || "Member"}
              </p>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  user?.plan === "pro"
                    ? "bg-[#4A7C59] text-white"
                    : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                {user?.plan === "pro" ? "Pro Member" : "Free Member"}
              </span>
            </div>
            <div className="h-10 w-10 rounded-full bg-[#1A2530] dark:bg-gray-700 flex items-center justify-center text-white font-bold text-sm">
              {(user?.firstName?.[0] || user?.email?.[0] || "U").toUpperCase()}
            </div>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <SummaryCard
            label="Pro Plan Status"
            subtext={(() => {
              const parts: string[] = [];
              // Days since upgrade (always show when available)
              if (daysSinceUpgrade != null && daysSinceUpgrade >= 0) {
                parts.push(`${daysSinceUpgrade} day${daysSinceUpgrade !== 1 ? "s" : ""} since upgrade`);
              }
              // Expiry date or days remaining
              if (proSub?.expiryDate) {
                parts.push(`Expires ${fmt(proSub.expiryDate)}`);
              } else if (dbSubscription?.endDate) {
                parts.push(
                  `Expires ${new Date(dbSubscription.endDate).toLocaleDateString("en-KE", {
                    day: "numeric", month: "short", year: "numeric",
                  })}`
                );
              } else if (proExpiryDays != null && proExpiryDays > 0) {
                parts.push(`${proExpiryDays} days remaining`);
              }
              return parts.length > 0 ? parts.join(" · ") : user?.plan === "pro" ? "Active" : "Not subscribed";
            })()}
          >
            <StatusBadge status={proStatus} daysRemaining={proExpiryDays} />
          </SummaryCard>

          <SummaryCard
            label="Job Applications"
            subtext={
              jobCredit
                ? `of ${jobCredit.total} total • ${jobCredit.used} used`
                : "No credits yet"
            }
          >
            {jobCredit ? jobCredit.remaining : 0}
          </SummaryCard>

          <SummaryCard
            label="CV Services"
            subtext={cvCredit ? cvCredit.packName || cvCredit.serviceType || "credits available" : "No credits yet"}
          >
            {cvCredit ? cvCredit.remaining : 0}
          </SummaryCard>

          <SummaryCard
            label="Total Spent"
            subtext={(() => {
              // Show when the Pro plan expires (startDate + 360 days)
              if (proSub?.startDate) {
                const expiryMs = proSub.expiryDate
                  ? proSub.expiryDate
                  : proSub.startDate + 360 * 24 * 60 * 60 * 1000;
                return `Expires ${fmt(expiryMs)}`;
              }
              return totalSpent > 0 ? "paid" : "";
            })()}
          >
            {totalSpent > 0 ? fmtKES(totalSpent) : "KES 0"}
          </SummaryCard>
        </div>

        {/* ── Payment Status ── */}
        {latestPayment && (
          <div
            className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-6 mb-6"
            data-testid="payment-status-section"
          >
            <h2
              className="text-xl font-semibold text-[#1A2530] dark:text-white mb-4"
              style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
            >
              💳 Payment Status
            </h2>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm text-[#5A6A7A] dark:text-gray-400 mb-1">
                  Latest payment
                </p>
                <p
                  className="text-2xl font-bold text-[#1A2530] dark:text-white"
                  data-testid="payment-status-amount"
                >
                  {fmtKES(Number(latestPayment.amount))}
                </p>
                {latestPayment.mpesa_code && (
                  <p className="text-xs text-[#7A8A9A] dark:text-gray-500 mt-0.5">
                    Ref: {latestPayment.mpesa_code}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {latestPayment.auto_upgraded && (
                  <span
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    data-testid="payment-status-pro"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> PRO Activated
                  </span>
                )}
                {latestPayment.refund_requested && (
                  <span
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                    data-testid="payment-status-refund"
                  >
                    <Receipt className="h-3.5 w-3.5" /> Refund Requested
                  </span>
                )}
                {latestPayment.needs_review && !latestPayment.refund_requested && (
                  <span
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                    data-testid="payment-status-review"
                  >
                    <Clock className="h-3.5 w-3.5" /> Under Review
                  </span>
                )}
                {!latestPayment.matched && !latestPayment.auto_upgraded && (
                  <span
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                    data-testid="payment-status-unlinked"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Not Linked Yet
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Active Subscriptions ── */}
        {Object.keys(subscriptions).length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-6 mb-6">
            <h2
              className="text-xl font-semibold text-[#1A2530] dark:text-white mb-4"
              style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
            >
              📋 Active Subscriptions
            </h2>

            <div className="divide-y divide-[#EAE5DE] dark:divide-gray-700">
              {Object.entries(subscriptions).map(([key, sub]) => {
                const days = daysLeft(sub.expiryDate);
                const status: "active" | "expiring" | "expired" =
                  sub.status === "expired"
                    ? "expired"
                    : days <= 30
                    ? "expiring"
                    : "active";
                const subLabel =
                  key === "pro_plan"
                    ? "Pro Plan — Full Access"
                    : key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

                return (
                  <div
                    key={key}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 first:pt-0 last:pb-0"
                    data-testid={`subscription-${key}`}
                  >
                    <div className="flex-1">
                      <h4 className="font-semibold text-[#1A2530] dark:text-white mb-0.5">
                        {subLabel}
                      </h4>
                      {key === "pro_plan" && (
                        <p className="text-sm text-[#5A6A7A] dark:text-gray-400">
                          Unlimited NEA checks · 30+ portals · ATS scanner · WhatsApp consultation
                        </p>
                      )}
                      {sub.paidAmount > 0 && (
                        <p className="text-sm text-[#5A6A7A] dark:text-gray-400 mt-1">
                          💰 Paid {fmtKES(sub.paidAmount)} on {fmt(sub.startDate)}
                          {sub.paymentRef ? ` · ${sub.paymentRef}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="text-left sm:text-right flex-shrink-0">
                      <StatusBadge status={status} />
                      <p className="text-xs text-[#5A6A7A] dark:text-gray-400 mt-1">
                        {status !== "expired"
                          ? `Renews: ${fmt(sub.expiryDate)}`
                          : `Expired: ${fmt(sub.expiryDate)}`}
                      </p>
                      <p className="text-xs text-[#7A8A9A] dark:text-gray-500">
                        {status !== "expired" ? `${days} days remaining` : "Please renew"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Service Credits ── */}
        {creditEntries.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-6 mb-6">
            <h2
              className="text-xl font-semibold text-[#1A2530] dark:text-white mb-1"
              style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
            >
              🎯 My Service Credits
            </h2>
            <p className="text-sm text-[#5A6A7A] dark:text-gray-400 mb-5">
              Track your purchased services and remaining credits · updates live
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {creditEntries.map(([type, credit]) => {
                const meta = CREDIT_META[type];
                const pct =
                  credit.total > 0
                    ? Math.round((credit.used / credit.total) * 100)
                    : 0;
                const expired =
                  credit.expiryDate && credit.expiryDate < Date.now();
                const days = credit.expiryDate ? daysLeft(credit.expiryDate) : null;
                const expiringSoon = days !== null && days >= 0 && days <= 7;

                return (
                  <div
                    key={type}
                    className="bg-[#F9F8F6] dark:bg-gray-700/40 rounded-xl p-5 border border-[#EAE5DE] dark:border-gray-600 flex flex-col"
                    data-testid={`credit-card-${type}`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span style={{ color: meta.color }}>{meta.icon}</span>
                        <span className="font-semibold text-[#1A2530] dark:text-white text-sm">
                          {meta.label}
                        </span>
                      </div>
                      {credit.packName && (
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            expired
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : expiringSoon
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          }`}
                        >
                          {credit.packName}
                        </span>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="mb-0.5">
                      <span className="text-4xl font-bold text-[#1A2530] dark:text-white">
                        {credit.remaining}
                      </span>
                      <span className="text-base text-[#5A6A7A] dark:text-gray-400 ml-2">
                        remaining
                      </span>
                    </div>
                    {credit.serviceType ? (
                      <p className="text-xs text-[#7A8A9A] dark:text-gray-500 mb-3">
                        {credit.serviceType}
                      </p>
                    ) : (
                      <p className="text-xs text-[#7A8A9A] dark:text-gray-500 mb-3">
                        of {credit.total} total
                      </p>
                    )}

                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-[#E2DDD5] dark:bg-gray-600 rounded-full overflow-hidden mb-3">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: expired ? "#9A9A9A" : meta.color,
                        }}
                      />
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between text-xs text-[#5A6A7A] dark:text-gray-400 mb-3">
                      <span>✅ {credit.used} used</span>
                      {expired ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          ❌ Expired
                        </span>
                      ) : days !== null ? (
                        expiringSoon ? (
                          <span className="text-orange-600 dark:text-orange-400 font-medium">
                            ⚠️ Expires: {fmt(credit.expiryDate!)} ({days}d)
                          </span>
                        ) : (
                          <span>
                            ⏰ Expires: {fmt(credit.expiryDate!)}
                          </span>
                        )
                      ) : (
                        <span>⏰ No expiry</span>
                      )}
                    </div>

                    {/* Payment info */}
                    {(credit.paidAmount || credit.paymentRef) && (
                      <p className="text-xs text-[#7A8A9A] dark:text-gray-500 mb-3">
                        💰{" "}
                        {credit.paidAmount ? fmtKES(credit.paidAmount) : ""}
                        {credit.paymentRef ? ` · ${credit.paymentRef}` : ""}
                        {credit.purchasedDate ? ` · ${fmt(credit.purchasedDate)}` : ""}
                      </p>
                    )}

                    {/* CTA Button */}
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full mt-auto text-sm"
                      style={{ background: "#1A2530", color: "#fff" }}
                      disabled={!!(expired || credit.remaining <= 0)}
                      onClick={() => navigate(meta.route)}
                      data-testid={`btn-use-credit-${type}`}
                    >
                      {CREDIT_CTA[type]} →
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Recent Applications ── */}
        {applications.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-6 mb-6">
            <h2
              className="text-xl font-semibold text-[#1A2530] dark:text-white mb-4"
              style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
            >
              📋 Recent Applications
            </h2>

            {/* Table — hidden on small screens */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full" data-testid="table-applications">
                <thead>
                  <tr className="border-b border-[#E2DDD5] dark:border-gray-700">
                    {["Job Title", "Employer", "Country", "Status", "Date"].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left pb-3 text-xs font-semibold uppercase tracking-widest text-[#7A8A9A] dark:text-gray-500"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EDE8] dark:divide-gray-700">
                  {applications.slice(0, 8).map((app) => (
                    <tr key={app.id}>
                      <td className="py-3 pr-4">
                        <span className="font-semibold text-[#1A2530] dark:text-white text-sm">
                          {app.jobTitle}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-sm text-[#5A6A7A] dark:text-gray-400">
                        {app.employer}
                      </td>
                      <td className="py-3 pr-4 text-sm text-[#5A6A7A] dark:text-gray-400">
                        {app.country}
                      </td>
                      <td className="py-3 pr-4">
                        <AppStatusBadge status={app.status} />
                      </td>
                      <td className="py-3 text-sm text-[#7A8A9A] dark:text-gray-500">
                        {fmt(app.submittedDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="md:hidden space-y-3">
              {applications.slice(0, 8).map((app) => (
                <div
                  key={app.id}
                  className="bg-[#F9F8F6] dark:bg-gray-700/40 rounded-xl p-4 border border-[#EAE5DE] dark:border-gray-600"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-[#1A2530] dark:text-white">
                        {app.jobTitle}
                      </p>
                      <p className="text-xs text-[#5A6A7A] dark:text-gray-400">
                        {app.employer} · {app.country}
                      </p>
                      <p className="text-xs text-[#7A8A9A] dark:text-gray-500 mt-1">
                        {fmt(app.submittedDate)}
                      </p>
                    </div>
                    <AppStatusBadge status={app.status} />
                  </div>
                </div>
              ))}
            </div>

            {applications.length > 8 && (
              <p className="mt-4 text-right">
                <Link
                  href="/application-tracker"
                  className="text-sm font-semibold text-[#1A2530] dark:text-white hover:underline inline-flex items-center gap-1"
                >
                  View all applications <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </p>
            )}
          </div>
        )}

        {/* ── Payment History ── */}
        {mergedPayments.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-6 mb-6">
            <h2
              className="text-xl font-semibold text-[#1A2530] dark:text-white mb-4"
              style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
            >
              💰 Payment History
            </h2>

            <div className="divide-y divide-[#F0EDE8] dark:divide-gray-700">
              {mergedPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-4 first:pt-0"
                  data-testid={`payment-row-${p.id}`}
                >
                  <div>
                    <p className="text-sm text-[#5A6A7A] dark:text-gray-300">
                      {p.service}
                    </p>
                    <p className="text-xs font-mono text-[#7A8A9A] dark:text-gray-500 mt-0.5">
                      {p.reference}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="font-bold text-[#1A2530] dark:text-white">
                      {fmtKES(p.amount)}
                    </p>
                    <p className="text-xs text-[#7A8A9A] dark:text-gray-500">
                      {p.date ? fmt(p.date) : "—"} ·{" "}
                      <span className="capitalize">{p.status}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="mt-4 pt-4 border-t-2 border-[#E2DDD5] dark:border-gray-600 flex items-center justify-between">
              <span className="font-bold text-[#1A2530] dark:text-white">
                Total Spent
              </span>
              <span className="text-xl font-bold text-[#1A2530] dark:text-white">
                {fmtKES(totalSpent)}
              </span>
            </div>
          </div>
        )}

        {/* ── No data state (fresh user) ── */}
        {creditEntries.length === 0 &&
          Object.keys(subscriptions).length === 0 &&
          mergedPayments.length === 0 && (
            <div className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-10 text-center">
              <Wallet className="h-12 w-12 text-[#4A7C59] mx-auto mb-4 opacity-60" />
              <h3 className="text-lg font-semibold text-[#1A2530] dark:text-white mb-2">
                No services purchased yet
              </h3>
              <p className="text-sm text-[#5A6A7A] dark:text-gray-400 mb-5">
                Browse our plans and service packs to get started on your journey abroad.
              </p>
              <Button asChild>
                <Link href="/pricing">View Plans &amp; Pricing</Link>
              </Button>
            </div>
          )}

        {/* ── Footer note ── */}
        <p className="mt-6 text-center text-xs text-[#7A8A9A] dark:text-gray-500">
          Need help with your services?{" "}
          <Link href="/contact" className="text-[#1A2530] dark:text-gray-300 font-semibold hover:underline">
            Contact support
          </Link>{" "}
          · All payments processed securely via M-Pesa &amp; PayPal
        </p>
      </div>
    </div>
  );
}
