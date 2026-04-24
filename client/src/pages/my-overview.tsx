import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  ArrowLeft, CreditCard, Zap, Gift, Star,
  CheckCircle2, Clock, XCircle, AlertCircle,
  Download, FileText, Eye, ExternalLink,
  Users, TrendingUp, Wallet, ChevronRight,
  Sparkles, RefreshCw, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import {
  useUserData,
  completedPaymentsKES,
  pendingCommissionKES,
  paidCommissionKES,
  totalCommissionKES,
  activeServices,
  type UserService,
  type ServiceRequest,
} from "@/hooks/use-user-data";

// ── Types ────────────────────────────────────────────────────────────────────

type Plan = { planId: string; plan: { planName: string; price: number } | null };

type ReferralStats = {
  refCode: string;
  totalReferrals: number;
  pendingCommission: number;
  paidCommission: number;
};


type ServiceMeta = { id: string; name: string; slug: string | null };

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtKES(n: number) {
  return `KES ${n.toLocaleString()}`;
}

function fmtDate(s: string) {
  try { return format(new Date(s), "dd MMM yyyy, HH:mm"); }
  catch { return s; }
}

function serviceLabel(serviceId: string | null | undefined, serviceMap: Map<string, string>): string {
  if (!serviceId) return "Service";
  if (serviceMap.has(serviceId)) return serviceMap.get(serviceId)!;
  const slug = serviceId.toLowerCase();
  if (slug.includes("cv") || slug.includes("ats"))          return "CV Rewrite";
  if (slug.includes("cover"))                               return "Cover Letter";
  if (slug.includes("consult"))                             return "Consultation";
  if (slug.includes("visa"))                                return "Visa Guide";
  if (slug.includes("interview"))                           return "Interview Coaching";
  if (slug.includes("linkedin"))                            return "LinkedIn Optimisation";
  if (slug.includes("job") || slug.includes("apply"))       return "Job Application";
  if (slug.includes("verify") || slug.includes("employer")) return "Employer Verification";
  return "Service";
}

function serviceRoute(serviceId: string | null | undefined): string {
  if (!serviceId) return "/services";
  const slug = serviceId.toLowerCase();
  if (slug.includes("cv") || slug.includes("ats"))    return "/upload-cv";
  if (slug.includes("cover"))                         return "/career-match";
  if (slug.includes("consult"))                       return "/dashboard";
  if (slug.includes("visa"))                          return "/visa-guides";
  if (slug.includes("interview"))                     return "/career-match";
  if (slug.includes("linkedin"))                      return "/career-match";
  if (slug.includes("job") || slug.includes("apply")) return "/assisted-apply";
  if (slug.includes("verify"))                        return "/nea-agencies";
  return "/services";
}

function serviceExpiry(s: UserService): { status: "active" | "expired"; label: string } {
  if (!s.expires_at) return { status: "active", label: "Lifetime" };
  const exp = new Date(s.expires_at);
  if (exp > new Date()) {
    const days = Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
    return { status: "active", label: `${days}d left` };
  }
  return { status: "expired", label: "Expired" };
}

/** Supabase returns JSON columns as objects; but some workers store them as strings.
 *  This helper normalises both into a plain object (or null). */
function parseOutputData(raw: Record<string, unknown> | string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, unknown>; }
    catch { return null; }
  }
  return raw;
}

function isProcessing(status: string) {
  return status === "processing" || status === "in_progress" || status === "pending";
}

function paymentStatusConfig(status: string) {
  if (status === "completed" || status === "success")
    return { label: "Paid", icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30" };
  if (status === "failed")
    return { label: "Failed", icon: <XCircle className="h-3.5 w-3.5" />, cls: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30" };
  if (status === "retry_available")
    return { label: "Not Completed", icon: <XCircle className="h-3.5 w-3.5" />, cls: "text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/30" };
  if (status === "pending" || status === "awaiting_payment")
    return { label: "Awaiting M-Pesa", icon: <Clock className="h-3.5 w-3.5" />, cls: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30" };
  return { label: "Pending", icon: <Clock className="h-3.5 w-3.5" />, cls: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30" };
}

function requestStatusConfig(status: string) {
  if (status === "completed")   return { label: "Completed", cls: "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30" };
  if (status === "in_progress") return { label: "Processing", cls: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30" };
  if (status === "failed")      return { label: "Failed", cls: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30" };
  return { label: "Pending", cls: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30" };
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, icon, children, linkHref, linkLabel }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  linkHref?: string;
  linkLabel?: string;
}) {
  return (
    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400">{icon}</span>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
        </div>
        {linkHref && (
          <Link href={linkHref}>
            <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-0.5">
              {linkLabel ?? "View all"} <ChevronRight className="h-3 w-3" />
            </span>
          </Link>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">{message}</p>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MyOverview() {
  const { user } = useAuth();

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: userData, isLoading: userDataLoading, refetch } = useUserData(user?.id);

  const { data: plan } = useQuery<Plan | null>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: referralStats } = useQuery<ReferralStats>({
    queryKey: ["/api/my-referrals"],
    enabled: !!user,
    staleTime: 1000 * 60 * 3,
  });

  const { data: servicesData } = useQuery<ServiceMeta[]>({
    queryKey:        ["/api/services"],
    queryFn:         () => import("@/lib/services").then(m => m.loadServices()) as Promise<ServiceMeta[]>,
    staleTime:       1000 * 60 * 30,
  });

  // Service id → name lookup map
  const serviceMap = new Map<string, string>(
    (servicesData ?? []).map((s) => [s.id, s.name]),
  );

  // Latest CV upload with a score

  // ── Derived ───────────────────────────────────────────────────────────────

  const totalSpent   = userData ? completedPaymentsKES(userData.payments)  : null;
  const activeCount  = userData ? activeServices(userData.purchases).length : null;
  const earnedKES    = userData?.referrals.length
    ? totalCommissionKES(userData.referrals)
    : referralStats
    ? referralStats.pendingCommission + referralStats.paidCommission
    : null;

  const isPro       = plan?.planId === "pro";
  const planLabel   = isPro ? "Pro" : plan?.planId === "basic" ? "Basic" : "Free";
  const planColor   = isPro
    ? "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30"
    : "text-gray-600 bg-gray-100 dark:text-gray-300 dark:bg-gray-800";

  // AI results — most recent completed/processing service requests
  const cvRequest = userData?.services.find(
    (s) => {
      const nameLower = serviceLabel(s.service_id, serviceMap).toLowerCase();
      const idLower   = s.service_id?.toLowerCase() ?? "";
      return (idLower.match(/cv|ats|rewrite/) || nameLower.match(/cv|ats|rewrite/))
        && s.status === "completed" && s.output_data;
    },
  );
  const coverLetterRequest = userData?.services.find(
    (s) => {
      const nameLower = serviceLabel(s.service_id, serviceMap).toLowerCase();
      const idLower   = s.service_id?.toLowerCase() ?? "";
      return (idLower.includes("cover") || nameLower.includes("cover"))
        && s.status === "completed" && s.output_data;
    },
  );

  // All requests currently being processed (in_progress / processing / pending)
  const processingRequests = (userData?.services ?? []).filter(
    (s) => isProcessing(s.status),
  );

  const cvOutputText: string | null = (() => {
    const d = parseOutputData(cvRequest?.output_data);
    return (d?.improved_cv as string) ?? (d?.result as string) ?? null;
  })();

  const coverLetterText: string | null = (() => {
    const d = parseOutputData(coverLetterRequest?.output_data);
    if (!d) return null;
    return (d.content ?? d.cover_letter ?? d.result ?? null) as string | null;
  })();

  const cvScore: number | null = (() => {
    const d = parseOutputData(cvRequest?.output_data);
    return (d?.score as number) ?? null;
  })();

  // Referral breakdown — prefer REST (it uses the referrals table for totalReferrals)
  const totalReferrals  = referralStats?.totalReferrals ?? userData?.referrals.length ?? 0;
  const pendingEarnings = referralStats?.pendingCommission ?? (userData ? pendingCommissionKES(userData.referrals) : 0);
  const paidEarnings    = referralStats?.paidCommission    ?? (userData ? paidCommissionKES(userData.referrals)   : 0);

  // ── Top cards config ──────────────────────────────────────────────────────
  const topCards = [
    {
      label: "Total Spent",
      value: totalSpent != null ? fmtKES(totalSpent) : "—",
      sub: `${userData?.payments.filter(p => p.status === "completed" || p.status === "success").length ?? 0} payments`,
      icon: <Wallet className="h-5 w-5 text-green-600 dark:text-green-400" />,
      bg: "bg-green-50 dark:bg-green-900/20",
      href: "/my-payments",
      testId: "card-total-spent",
    },
    {
      label: "Active Services",
      value: activeCount != null ? String(activeCount) : "—",
      sub: "Unlocked services",
      icon: <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />,
      bg: "bg-purple-50 dark:bg-purple-900/20",
      href: "/my-documents",
      testId: "card-active-services",
    },
    {
      label: "Referral Earnings",
      value: earnedKES != null && earnedKES > 0 ? fmtKES(earnedKES) : "—",
      sub: totalReferrals > 0 ? `${totalReferrals} referral${totalReferrals !== 1 ? "s" : ""}` : "Invite & earn KES 450",
      icon: <Gift className="h-5 w-5 text-orange-600 dark:text-orange-400" />,
      bg: "bg-orange-50 dark:bg-orange-900/20",
      href: "/referrals",
      testId: "card-referral-earnings",
    },
    {
      label: "Subscription",
      value: planLabel,
      sub: isPro ? "Full access" : "Upgrade for more",
      icon: <Star className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
      bg: "bg-blue-50 dark:bg-blue-900/20",
      href: isPro ? "/my-account" : "/payment",
      testId: "card-subscription-status",
    },
  ];

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (userDataLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-40 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 pb-28">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" /> Dashboard
            </Button>
          </Link>
          <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label="Refresh" data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>

        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50" data-testid="text-page-title">My Overview</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {user?.firstName ?? user?.email ?? "Your account"} · Live from Supabase
          </p>
        </div>

        {/* ── TOP CARDS ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3" data-testid="section-top-cards">
          {topCards.map((c) => (
            <Link key={c.label} href={c.href}>
              <div
                className={`${c.bg} rounded-2xl p-4 flex flex-col gap-2 border border-transparent shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 cursor-pointer`}
                data-testid={c.testId}
              >
                <div className="w-9 h-9 rounded-xl bg-white/70 dark:bg-black/20 flex items-center justify-center">
                  {c.icon}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{c.label}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-50 leading-tight mt-0.5">{c.value}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{c.sub}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* ── PAYMENTS ───────────────────────────────────────────────── */}
        <Section
          title="Payments"
          icon={<CreditCard className="h-4 w-4" />}
          linkHref="/my-payments"
          linkLabel="All payments"
        >
          {!userData?.payments.length ? (
            <EmptyState message="No payments yet." />
          ) : (
            <div className="space-y-2" data-testid="list-payments">
              {userData.payments.slice(0, 6).map((p) => {
                const sc = paymentStatusConfig(p.status);
                const isFailed = p.status === "failed" || p.status === "retry_available";
                const displayName = p.service_name
                  || (p.plan_id === "pro" ? "WorkAbroad Pro Upgrade" : null)
                  || (p.plan_id ? `${p.plan_id.charAt(0).toUpperCase()}${p.plan_id.slice(1)} Plan` : null)
                  || "Payment";
                return (
                  <div
                    key={p.id}
                    className={`py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0 ${isFailed ? "bg-red-50/40 dark:bg-red-950/10 rounded-lg px-2 -mx-2" : ""}`}
                    data-testid={`item-payment-${p.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate" data-testid={`text-service-name-${p.id}`}>
                          {displayName}
                        </p>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                          {p.currency} {Number(p.amount).toLocaleString()}
                          {p.method === "mpesa" ? " · M-Pesa" : p.method === "paypal" ? " · PayPal" : ""}
                        </p>
                        {p.mpesa_receipt_number && (
                          <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 truncate mt-0.5" data-testid={`text-mpesa-${p.id}`}>
                            {p.mpesa_receipt_number}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{fmtDate(p.created_at)}</p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 ${sc.cls}`}
                        data-testid={`badge-payment-status-${p.id}`}
                      >
                        {sc.icon} {sc.label}
                      </span>
                    </div>
                    {isFailed && p.fail_reason && (
                      <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1" data-testid={`text-fail-reason-user-${p.id}`}>
                        <XCircle className="h-3 w-3 shrink-0" />
                        {p.fail_reason.includes("cancelled_by_user")
                          ? "You cancelled this M-Pesa prompt. Tap retry to try again."
                          : p.fail_reason.includes("plan_price_mismatch")
                            ? "Amount mismatch — please contact support."
                            : p.fail_reason.replace(/_/g, " ").slice(0, 80)}
                      </p>
                    )}
                    {isFailed && !p.fail_reason && (
                      <p className="mt-1.5 text-[11px] text-orange-600 dark:text-orange-400 flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        Payment did not complete — you can retry this payment.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── MY SERVICES ────────────────────────────────────────────── */}
        <Section
          title="My Services"
          icon={<Zap className="h-4 w-4" />}
          linkHref="/my-documents"
          linkLabel="All documents"
        >
          {!userData?.purchases.length ? (
            <EmptyState message="No services unlocked yet." />
          ) : (
            <div className="space-y-2" data-testid="list-services">
              {userData.purchases.map((s) => {
                const { status, label: expiryLabel } = serviceExpiry(s);
                const name = serviceLabel(s.service_id, serviceMap);
                const route = serviceRoute(s.service_id);
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0"
                    data-testid={`item-service-${s.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{name}</p>
                      <span
                        className={`inline-block mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          status === "active"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                        data-testid={`badge-service-status-${s.id}`}
                      >
                        {status === "active" ? "Active" : "Expired"} · {expiryLabel}
                      </span>
                    </div>
                    {status === "active" && (
                      <Link href={route}>
                        <Button size="sm" variant="outline" className="text-xs shrink-0" data-testid={`button-use-service-${s.id}`}>
                          Use now <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── AI RESULTS ─────────────────────────────────────────────── */}
        <Section
          title="AI Results"
          icon={<Sparkles className="h-4 w-4" />}
          linkHref="/upload-cv"
          linkLabel="Upload CV"
        >
          {!cvOutputText && !coverLetterText && processingRequests.length === 0 &&
              !(userData?.services.some((s) => s.status === "completed" && s.output_data)) ? (
            <div className="text-center py-4" data-testid="text-no-ai-results">
              <Sparkles className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-400 dark:text-gray-500">No AI results yet.</p>
              <Link href="/upload-cv">
                <Button size="sm" className="mt-3" data-testid="button-upload-cv-cta">Upload your CV →</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3" data-testid="section-ai-results">

              {/* ── PROCESSING: spinner rows (live via Realtime) ─────────── */}
              {processingRequests.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl"
                  data-testid={`card-processing-${s.id}`}
                >
                  <Loader2 className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-spin shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                      {serviceLabel(s.service_id, serviceMap)} — Processing…
                    </p>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                      AI is working on your request · result will appear here automatically
                    </p>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">
                    {s.status.replace("_", " ").toUpperCase()}
                  </span>
                </div>
              ))}

              {/* ── COMPLETED: CV Score ──────────────────────────────────── */}
              {cvScore != null && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl" data-testid="card-cv-score">
                  <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-lg">{cvScore}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">ATS CV Score</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {cvScore >= 80 ? "Excellent — ready to apply!" : cvScore >= 60 ? "Good — minor improvements recommended" : "Needs work — let AI rewrite it"}
                    </p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-green-500 ml-auto shrink-0" />
                </div>
              )}

              {/* ── COMPLETED: Download improved CV ─────────────────────── */}
              {cvOutputText && (
                <button
                  onClick={() => downloadText(cvOutputText, `WorkAbroad-CV-${Date.now()}.txt`)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border border-green-200 dark:border-green-700/40 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
                  data-testid="button-download-cv"
                >
                  <Download className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Download Improved CV</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">AI-rewritten · ATS-optimised · ready</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto shrink-0" />
                </button>
              )}

              {/* ── COMPLETED: Cover Letter ──────────────────────────────── */}
              {coverLetterText && (
                <Link href="/my-documents">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border border-green-200 dark:border-green-700/40 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
                    data-testid="button-view-cover-letter"
                  >
                    <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">View Cover Letter</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">AI-generated · ready to send</p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto shrink-0" />
                  </button>
                </Link>
              )}

              {/* ── COMPLETED: Other service results ────────────────────── */}
              {userData?.services
                .filter((s) => {
                  if (s.status !== "completed" || !s.output_data) return false;
                  const name = serviceLabel(s.service_id, serviceMap).toLowerCase();
                  const id   = s.service_id?.toLowerCase() ?? "";
                  return !id.match(/cv|ats|cover|rewrite/) && !name.match(/cv|ats|cover|rewrite/);
                })
                .slice(0, 3)
                .map((s) => (
                  <Link key={s.id} href="/my-documents">
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border border-green-200 dark:border-green-700/40 rounded-xl hover:bg-gray-50 transition-colors text-left"
                      data-testid={`button-ai-result-${s.id}`}
                    >
                      <Eye className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                          {serviceLabel(s.service_id, serviceMap)} — Result ready
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{fmtDate(s.created_at)}</p>
                      </div>
                      <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto shrink-0" />
                    </button>
                  </Link>
                ))}
            </div>
          )}
        </Section>

        {/* ── REFERRALS ──────────────────────────────────────────────── */}
        <Section
          title="Referrals"
          icon={<Users className="h-4 w-4" />}
          linkHref="/referrals"
          linkLabel="Full details"
        >
          <div className="grid grid-cols-3 gap-3 mb-4" data-testid="section-referral-stats">
            {[
              { label: "Total Referrals", value: String(totalReferrals), color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-900/20" },
              { label: "Pending", value: pendingEarnings > 0 ? fmtKES(pendingEarnings) : "—", color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-900/20" },
              { label: "Paid Out", value: paidEarnings > 0 ? fmtKES(paidEarnings) : "—", color: "text-green-700 dark:text-green-300", bg: "bg-green-50 dark:bg-green-900/20" },
            ].map((stat) => (
              <div key={stat.label} className={`${stat.bg} rounded-xl p-3 text-center`} data-testid={`stat-referral-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{stat.label}</p>
              </div>
            ))}
          </div>

          {totalReferrals === 0 ? (
            <div className="text-center py-2" data-testid="text-no-referrals">
              <p className="text-sm text-gray-400 dark:text-gray-500">No referrals yet.</p>
              <Link href="/referrals">
                <Button size="sm" variant="outline" className="mt-2 text-xs" data-testid="button-share-referral-link">
                  <Gift className="h-3.5 w-3.5 mr-1.5" /> Share your link · Earn KES 450
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />
              <p className="text-xs text-gray-600 dark:text-gray-300">
                You've referred <strong>{totalReferrals}</strong> {totalReferrals === 1 ? "person" : "people"}.
                {pendingEarnings > 0 && ` ${fmtKES(pendingEarnings)} is pending payout.`}
              </p>
            </div>
          )}
        </Section>

      </div>
    </div>
  );
}
