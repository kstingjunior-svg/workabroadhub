import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExitIntentPopup } from "@/components/exit-intent-popup";
import { LiveActivityFeed } from "@/components/live-activity-feed";
import { AgencyAlertBanner } from "@/components/agency-alert-banner";
import {
  Check, Shield, BadgeCheck, Globe, Zap, Crown,
  ArrowRight, ChevronDown, ChevronUp, Users, TrendingUp,
  Flame, Rocket, Lock, Wallet, CheckCircle2, X, Clock, Calendar,
} from "lucide-react";
import { FeeBreakdown } from "@/components/fee-breakdown";
import { FREE_FEATURES, PRO_FEATURES, PLAN_COMPARISON } from "@/lib/plan-features";

async function trackEvent(event: string, extra?: { category?: string; country?: string }) {
  try { await apiRequest("POST", "/api/track", { event, page: window.location.pathname, ...extra }); } catch {}
}

const FREE_FEATURE_ROWS = FREE_FEATURES.map((text) => ({ icon: "✅", text, included: true }));
const PRO_FEATURE_ROWS  = PRO_FEATURES.map((text)  => ({ icon: "✅", text, included: true }));

const TRUST_ITEMS = [
  { icon: Wallet,     label: "Secure Payments",    desc: "M-Pesa & PayPal — fully encrypted",     color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
  { icon: BadgeCheck, label: "Verified Platform",  desc: "NEAIMS-registered agencies only",           color: "text-blue-600",  bg: "bg-blue-50 dark:bg-blue-950/30" },
  { icon: Shield,     label: "Zero Scams",         desc: "Every listing is manually checked",      color: "text-red-500",   bg: "bg-red-50 dark:bg-red-950/30" },
  { icon: Zap,        label: "Instant Access",     desc: "Plan activates within 60 seconds",       color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" },
];

const FAQ_ITEMS = [
  {
    q: "What's the difference between the 4 plans?",
    a: "Free is self-service — you can look up 3 NEAIMS agencies per day, browse a preview of jobs, and read all visa guides. The paid plans are personal career-consultation packages with a human advisor. 1-Day Consultation Trial (KES 99) gives you 24 hours of WhatsApp advisor access. Monthly Consultation (KES 1,000) covers 30 days with your personal advisor. Yearly Career Consultation (KES 4,500) is the best value — a full 365-day career-advisory relationship with 1-on-1 WhatsApp support, personal CV review, and personalised agency verification.",
  },
  {
    q: "How does M-Pesa payment work?",
    a: "Select your plan, enter your Safaricom number, and you'll receive an STK Push prompt on your phone. Enter your M-Pesa PIN and your plan activates within 60 seconds. Paybill: 4153025.",
  },
  {
    q: "Can I pay with PayPal?",
    a: "Yes! On the payment page, choose PayPal. The amount is automatically converted to USD at the daily rate. Both M-Pesa and PayPal are available for all plans.",
  },
  {
    q: "Is there a money-back guarantee?",
    a: "Yes — 7-day refund policy. If the platform didn't work as described, contact support@workabroadhub.tech within 7 days for a full refund.",
  },
  {
    q: "What happens when my plan expires?",
    a: "Your account reverts to the free tier. You keep your profile, application history, and saved jobs. You can re-subscribe at any time.",
  },
  {
    q: "What can I do for free?",
    a: "Free is self-service — you can look up 3 NEAIMS agencies per day, browse a preview of job listings, read all visa and country guides, and try each tool once. Any paid plan gives you a personal WhatsApp career advisor — a real human who verifies agencies for you, reviews your CV before submission, and follows up on your applications.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden" data-testid="faq-item">
      <button
        className="w-full flex items-center justify-between p-4 text-left text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
        data-testid="faq-toggle"
      >
        <span>{q}</span>
        {open ? <ChevronUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 text-sm text-muted-foreground leading-relaxed border-t border-border">
          {a}
        </div>
      )}
    </div>
  );
}

interface PlanConfig {
  id:          string;
  name:        string;
  price:       number;
  period:      string;
  duration:    string;
  badge?:      string;
  badgeColor?: string;
  icon:        typeof Crown;
  iconBg:      string;
  iconColor:   string;
  cardClass:   string;
  btnClass:    string;
  highlight:   boolean;
  urgency?:    string;
  perMonth?:   string;
}

const PLAN_UI: Omit<PlanConfig, "price">[] = [
  {
    id:        "trial",
    name:      "1 Day Trial",
    period:    "one-time",
    duration:  "24-hour access",
    badge:     "Try It",
    badgeColor:"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    icon:      Clock,
    iconBg:    "bg-green-100 dark:bg-green-900/30",
    iconColor: "text-green-600",
    cardClass: "border-green-300 dark:border-green-700",
    btnClass:  "bg-green-600 hover:bg-green-700 text-white",
    highlight: false,
    urgency:   "Try before you commit",
  },
  // 2026-06 reframe (founder decision): monthly is now the DEFAULT door.
  // Kenyans think weekly, not yearly — KES 1,000 survives a bad week. Yearly
  // is reframed as a savings play for those who already trust the platform.
  {
    id:        "monthly",
    name:      "Monthly Access",
    period:    "/ month",
    duration:  "30 days full access · renew when you want",
    badge:     "MOST POPULAR ⭐",
    badgeColor:"bg-blue-600 text-white",
    icon:      Calendar,
    iconBg:    "bg-blue-100 dark:bg-blue-900/30",
    iconColor: "text-blue-600",
    cardClass: "border-blue-400 shadow-2xl shadow-blue-200/60 dark:shadow-blue-900/30",
    btnClass:  "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-200 dark:shadow-blue-900/30",
    highlight: true,
    urgency:   "Pay as you go — cancel any time",
  },
  {
    id:        "pro",
    name:      "Yearly Access",
    period:    "/ year",
    duration:  "365 days full access · pay once, done",
    badge:     "Save KES 7,500",
    badgeColor:"bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    icon:      Crown,
    iconBg:    "bg-amber-100 dark:bg-amber-900/30",
    iconColor: "text-amber-600",
    cardClass: "border-amber-300 dark:border-amber-800",
    btnClass:  "bg-amber-600 hover:bg-amber-700 text-white",
    highlight: false,
    urgency:   "Save KES 7,500 vs paying month-by-month",
  },
];

export default function PricingPage() {
  const { user }     = useAuth();
  const [, navigate] = useLocation();

  const { data: userPlan } = useQuery<{ planId: string }>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
  });

  const { data: publicStats } = useQuery<{ totalUsers: number }>({
    queryKey: ["/api/public/stats"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: dbPlans, isLoading: plansLoading } = useQuery<{ plan_id: string; price: number }[]>({
    queryKey: ["/api/plans"],
    staleTime: 30 * 1000,
  });

  const PLANS: PlanConfig[] = PLAN_UI.map((ui) => {
    const dbRow = dbPlans?.find((p) => p.plan_id === ui.id);
    const price = dbRow?.price ?? 0;
    const extra: Pick<PlanConfig, "perMonth" | "urgency"> = { urgency: ui.urgency };
    if (ui.id === "pro" && price > 0) {
      extra.perMonth = `KES ${Math.round(price / 12).toLocaleString("en-KE")}/mo`;
      extra.urgency  = `Save KES ${(1000 * 12 - price).toLocaleString("en-KE")} vs paying month-by-month`;
    }
    if (ui.id === "trial" && price > 0) {
      extra.urgency = `Try before you commit — just KES ${price}`;
    }
    return { ...ui, price, ...extra };
  });

  const currentPlanId = userPlan?.planId ?? "free";
  const fmt = (n: number) => n.toLocaleString("en-KE");

  function goToPayment(planId: string, method?: "mpesa" | "paypal") {
    trackEvent(`click_upgrade_${planId}${method ? "_" + method : ""}`);
    if (!user) {
      // Send users to the landing page with a redirect param so the
      // login modal auto-opens and brings them back here after sign-in.
      // (Replaces the broken "/api/login" — a Replit-OIDC leftover that
      // doesn't exist as a route in the current Render/Supabase build.)
      const back = "/pricing" + (method ? "?method=" + method : "");
      window.location.href = "/?redirect=" + encodeURIComponent(back);
      return;
    }
    const qs = new URLSearchParams({ plan: planId });
    if (method) qs.set("method", method);
    navigate(`/payment?${qs.toString()}`);
  }

  const heroRef = useRef<HTMLDivElement>(null);
  const [stickyVisible, setStickyVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const bottom = heroRef.current?.getBoundingClientRect().bottom ?? 0;
      setStickyVisible(bottom < 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = currentPlanId !== "free";

  return (
    <div className="min-h-screen bg-background pb-32 md:pb-24">
      <ExitIntentPopup enabled={!user || !isActive} />

      {/* ── HERO ── */}
      <div
        ref={heroRef}
        className="relative bg-gradient-to-br from-amber-600 via-orange-600 to-red-700 text-white pt-14 pb-14 px-4 text-center overflow-hidden"
        data-testid="pricing-hero"
      >
        <div className="absolute -top-16 -left-16 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -right-8 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-2xl mx-auto">
          <Badge className="mb-5 bg-white/20 text-white border-white/30 text-xs font-semibold uppercase tracking-widest px-4 py-1.5" data-testid="hero-badge">
            <Globe className="h-3.5 w-3.5 mr-1.5" /> Kenya's #1 Overseas Job Platform
          </Badge>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-4 leading-tight tracking-tight" data-testid="hero-headline">
            Full Access from KES 99 🌍
          </h1>

          <p className="text-orange-100 text-base md:text-lg mb-3 max-w-lg mx-auto" data-testid="hero-subtext">
            Verified overseas jobs, smart tools, scam protection, and someone real to talk to.{" "}
            {publicStats?.totalUsers
              ? <>Trusted by <strong className="text-white">{publicStats.totalUsers.toLocaleString()}+ members</strong> across UK, Canada, UAE & beyond.</>
              : "Choose the plan that fits your timeline."}
          </p>

          {/* 2026-06 update: surface all 4 tiers in the hero so users see
              they have options below KES 4,500. Founder feedback: too many
              people canceled the M-Pesa STK when only the KES 4,500 figure
              was visible — they couldn't see the KES 99 / KES 1,000 entry
              points. */}
          <p className="text-white/85 text-sm mb-6 max-w-md mx-auto leading-snug">
            <strong className="text-white">Free</strong> to browse · <strong className="text-white">KES 99</strong> for a day · <strong className="text-white">KES 1,000</strong> for a month · <strong className="text-white">KES 4,500</strong> for a year
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl mx-auto mb-8 text-[11px]">
            <div className="rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2">
              <div className="font-bold text-base text-white">Free</div>
              <div className="text-white/70">Browse & preview</div>
            </div>
            <div className="rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2">
              <div className="font-bold text-base text-white">KES 99</div>
              <div className="text-white/70">1 Day full access</div>
            </div>
            <div className="rounded-xl bg-blue-500/30 backdrop-blur-sm border-2 border-blue-300 px-3 py-2 ring-2 ring-blue-300/40">
              <div className="font-bold text-base text-white">KES 1,000</div>
              <div className="text-white/85">1 Month — most popular</div>
            </div>
            <div className="rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2">
              <div className="font-bold text-base text-white">KES 4,500</div>
              <div className="text-white/70">1 Year · save 7,500</div>
            </div>
          </div>

          {isActive ? (
            <div className="inline-flex items-center gap-2 bg-green-500/20 border border-green-400/40 rounded-full px-6 py-3 text-green-200 font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              Your plan is active — enjoy full access!
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                variant="outline"
                className="border-white/50 text-white bg-white/10 hover:bg-white/20 font-semibold h-12 px-6 text-sm"
                onClick={() => goToPayment("trial")}
                data-testid="btn-hero-trial"
              >
                <Clock className="h-4 w-4 mr-2" />
                Try 1 Day — KES 99
              </Button>
              <Button
                size="lg"
                className="bg-white text-amber-700 hover:bg-amber-50 font-bold shadow-xl shadow-amber-900/30 px-8 text-base h-12"
                onClick={() => goToPayment("pro")}
                data-testid="btn-hero-cta"
              >
                <Crown className="h-5 w-5 mr-2" />
                Start Yearly Consultation — KES 4,500
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-8 text-sm text-orange-100">
            <span className="flex items-center gap-1.5"><Shield className="h-4 w-4 text-green-300" /> <strong className="text-white">NEAIMS verified</strong> agencies</span>
            <span className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-yellow-300" /> <strong className="text-white">365 days</strong> full access</span>
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> <strong className="text-white">30+</strong> verified job portals</span>
          </div>
        </div>
      </div>

      {/* ── PRICING SECTION ── */}
      <section className="max-w-5xl mx-auto px-4 -mt-6" data-testid="pricing-section">

        <div className="space-y-2 mb-6">
          <AgencyAlertBanner showLink />
          <LiveActivityFeed inline />
        </div>

        {/* ── PAYMENT METHODS BANNER — 2026-07 ──────────────────────────────
            Non-Kenyan users were dropping off because PayPal was buried in
            tiny grey text under each card. Big banner surfaces both options
            at eye level so international visitors know they're welcome. */}
        <div className="mb-5 rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 px-4 py-3.5" data-testid="payment-methods-banner">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🇰🇪</span>
              <div>
                <div className="font-bold text-foreground leading-tight">M-Pesa</div>
                <div className="text-xs text-muted-foreground leading-tight">for Kenya · Paybill 4153025</div>
              </div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-emerald-300 dark:bg-emerald-800" />
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌍</span>
              <div>
                <div className="font-bold text-foreground leading-tight">PayPal</div>
                <div className="text-xs text-muted-foreground leading-tight">worldwide · Visa, Mastercard, PayPal balance</div>
              </div>
            </div>
          </div>
          <p className="text-center text-[11px] text-muted-foreground mt-2">
            No Safaricom line required — international users pay via PayPal in USD.
          </p>
        </div>

        {/* ── 3-TIER PLAN CARDS ── */}
        {plansLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-start mb-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border-2 border-border bg-card p-6 h-80 animate-pulse" />
            ))}
          </div>
        )}
        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-5 items-start ${plansLoading ? "hidden" : ""}`} data-testid="plan-cards">
          {PLANS.map((plan) => {
            const Icon      = plan.icon;
            const isCurrent = currentPlanId === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 ${plan.cardClass} bg-card p-6 flex flex-col ${plan.highlight ? "md:scale-[1.04] md:-translate-y-2" : ""}`}
                data-testid={`plan-card-${plan.id}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className={`${plan.badgeColor} text-xs font-extrabold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-md`}>
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4 mt-2">
                  <div className={`p-2.5 rounded-xl ${plan.iconBg}`}>
                    <Icon className={`h-6 w-6 ${plan.iconColor}`} />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-foreground">{plan.name}</h2>
                    <p className="text-xs text-muted-foreground">{plan.duration}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-extrabold text-foreground" data-testid={`price-${plan.id}`}>
                      {fmt(plan.price)}
                    </span>
                    <span className="text-muted-foreground text-sm mb-1.5">KES{plan.period}</span>
                  </div>
                  {plan.perMonth && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">{plan.perMonth}</p>
                  )}
                  {plan.urgency && (
                    <p className="text-xs text-muted-foreground mt-1">{plan.urgency}</p>
                  )}
                </div>

                <ul className="space-y-2.5 flex-1 mb-5">
                  {PRO_FEATURE_ROWS.slice(0, plan.id === "trial" ? 4 : plan.id === "monthly" ? 7 : PRO_FEATURE_ROWS.length).map((f) => (
                    <li key={f.text} className="flex items-center gap-2.5 text-xs" data-testid={`feature-${plan.id}-${f.text.slice(0, 10)}`}>
                      <div className={`h-4.5 w-4.5 rounded-full flex items-center justify-center flex-shrink-0 ${plan.highlight ? "bg-amber-100 dark:bg-amber-900/40" : "bg-green-100 dark:bg-green-900/40"}`}>
                        <Check className={`h-3 w-3 ${plan.highlight ? "text-amber-600" : "text-green-600"}`} />
                      </div>
                      <span className="text-foreground/90">{f.text}</span>
                    </li>
                  ))}
                  {plan.id === "trial" && (
                    <li className="flex items-center gap-2.5 text-xs text-muted-foreground/60">
                      <X className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Expires after 24 hours</span>
                    </li>
                  )}
                </ul>

                {isCurrent ? (
                  <div className="flex justify-center">
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-700 gap-1 py-1.5 px-4">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Active Plan
                    </Badge>
                  </div>
                ) : (
                  <>
                    {/* 2026-07: Split single CTA into two branded buttons.
                        Users outside Kenya were dropping off because M-Pesa was
                        the only obvious option. Now green M-Pesa + blue PayPal
                        sit side-by-side with brand colors + explicit country
                        hints. Each routes to /payment with method preselected. */}
                    <div className="text-center text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                      Choose how to pay — KES {fmt(plan.price)}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => goToPayment(plan.id, "mpesa")}
                        className="h-14 rounded-xl bg-[#00b74a] hover:bg-[#009c3d] active:bg-[#008533] text-white font-bold text-sm shadow-md shadow-emerald-200 dark:shadow-emerald-900/30 transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col items-center justify-center leading-tight"
                        data-testid={`btn-${plan.id}-mpesa`}
                        aria-label={`Pay ${plan.name} with M-Pesa`}
                      >
                        <span className="text-base font-black tracking-wide">M-PESA</span>
                        <span className="text-[10px] font-medium opacity-90">🇰🇪 Kenya</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => goToPayment(plan.id, "paypal")}
                        className="h-14 rounded-xl bg-gradient-to-b from-[#0070ba] to-[#003087] hover:from-[#005a99] hover:to-[#00246b] text-white font-bold text-sm shadow-md shadow-blue-200 dark:shadow-blue-900/30 transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col items-center justify-center leading-tight"
                        data-testid={`btn-${plan.id}-paypal`}
                        aria-label={`Pay ${plan.name} with PayPal`}
                      >
                        <span className="text-base font-black tracking-wide">
                          <span className="italic text-[#009cde]">Pay</span>Pal
                        </span>
                        <span className="text-[10px] font-medium opacity-90">🌍 Worldwide</span>
                      </button>
                    </div>
                    <p className="text-center text-[10px] text-muted-foreground mt-2">
                      Instant activation · No hidden fees · Cancel any time
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ── FREE PLAN NOTE ── */}
        <div className="mt-4 text-center text-sm text-muted-foreground" data-testid="free-plan-note">
          Not ready to pay? <span className="font-medium text-foreground">Free access</span> is always available — limited features, no payment needed.
        </div>

        {/* ── TRUST BADGES ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10" data-testid="trust-section">
          {TRUST_ITEMS.map((t) => (
            <div key={t.label} className={`rounded-xl p-4 flex flex-col items-center text-center gap-2 border border-border ${t.bg}`}>
              <div className={`h-9 w-9 rounded-full flex items-center justify-center ${t.bg}`}>
                <t.icon className={`h-5 w-5 ${t.color}`} />
              </div>
              <p className="text-xs font-bold text-foreground">{t.label}</p>
              <p className="text-[10px] text-muted-foreground">{t.desc}</p>
            </div>
          ))}
        </div>

        {/* ── WHERE DOES KES 4,500 GO? ── */}
        <div className="mt-14" data-testid="fee-breakdown-section">
          <h2 className="text-2xl font-extrabold text-center text-foreground mb-2">
            Where Does KES 4,500 Go?
          </h2>
          <p className="text-center text-sm text-muted-foreground mb-6">
            Every shilling is allocated to a specific service — no hidden margins, no fluff.
          </p>
          <FeeBreakdown alwaysOpen />
        </div>

        {/* ── FEATURE COMPARISON TABLE ── */}
        <div className="mt-14" data-testid="comparison-table">
          <h2 className="text-2xl font-extrabold text-center text-foreground mb-8">
            Free vs Paid — Full Comparison
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="px-5 py-4 text-left font-semibold text-foreground">Feature</th>
                  <th className="px-5 py-4 text-center font-semibold text-muted-foreground">Free</th>
                  <th className="px-5 py-4 text-center font-semibold text-amber-600">Any Paid Plan</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ...PLAN_COMPARISON,
                  { label: "Price", free: "Free forever", pro: "From KES 99" },
                ] as { label: string; free: boolean | string; pro: boolean | string }[]).map((row) => (
                  <tr key={row.label} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-3.5 font-medium text-foreground">{row.label}</td>
                    <td className="px-5 py-3.5 text-center">
                      {row.free === true
                        ? <Check className="h-4 w-4 text-green-500 mx-auto" />
                        : row.free === false
                          ? <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                          : <span className="text-xs text-muted-foreground">{row.free}</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {row.pro === true
                        ? <Check className="h-4 w-4 text-amber-500 mx-auto" />
                        : row.pro === false
                          ? <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                          : <span className="text-xs font-semibold text-amber-600">{row.pro}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isActive && (
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
              <Button
                size="lg"
                variant="outline"
                className="border-green-500 text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 font-semibold h-12 px-8"
                onClick={() => goToPayment("trial")}
                data-testid="btn-cta-trial"
              >
                <Clock className="h-4 w-4 mr-2" />
                Try 1 Day — KES 99
              </Button>
              <Button
                size="lg"
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg px-10 text-base h-12"
                onClick={() => goToPayment("pro")}
                data-testid="btn-cta2"
              >
                <Rocket className="h-5 w-5 mr-2" />
                Start Yearly Consultation — KES 4,500
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          )}
        </div>

        {/* ── TRUST SIGNALS ── */}
        <div className="mt-16" data-testid="trust-signals-section">
          <h2 className="text-2xl font-extrabold text-center text-foreground mb-2">
            Built for Real Protection
          </h2>
          <p className="text-center text-muted-foreground text-sm mb-8 max-w-lg mx-auto">
            Every feature exists to protect you from scams and connect you with verified opportunities.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: <Shield className="h-6 w-6 text-emerald-600" />,
                bg: "bg-emerald-50 dark:bg-emerald-950/30",
                border: "border-emerald-200 dark:border-emerald-800",
                title: "Recruitment Agency Verification",
                body: "Check any recruitment agency's license status before paying them a single shilling. Our database covers all NEAIMS-registered agencies in Kenya.",
              },
              {
                icon: <BadgeCheck className="h-6 w-6 text-blue-600" />,
                bg: "bg-blue-50 dark:bg-blue-950/30",
                border: "border-blue-200 dark:border-blue-800",
                title: "Scam & Fraud Reporting",
                body: "Community-powered scam database. See reported fraudulent recruiters before they reach you. Add your own reports to protect others.",
              },
              {
                icon: <Globe className="h-6 w-6 text-violet-600" />,
                bg: "bg-violet-50 dark:bg-violet-950/30",
                border: "border-violet-200 dark:border-violet-800",
                title: "Verified Job Portals Only",
                body: "Every job portal in our database is manually verified. We link directly to official government and employer portals — no third-party middlemen.",
              },
            ].map((card) => (
              <div key={card.title} className={`rounded-2xl border ${card.border} ${card.bg} p-5 flex flex-col gap-3`} data-testid={`trust-card-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white dark:bg-card flex items-center justify-center shadow-sm border border-border">
                    {card.icon}
                  </div>
                  <p className="font-bold text-sm text-foreground">{card.title}</p>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── FAQ ── */}
        <div className="mt-16" data-testid="faq-section">
          <h2 className="text-2xl font-extrabold text-center text-foreground mb-8">
            Frequently Asked Questions
          </h2>
          <div className="max-w-2xl mx-auto space-y-3">
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>

        {/* ── BOTTOM CTA ── */}
        {!isActive && (
          <div className="mt-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-8 text-center text-white shadow-xl shadow-amber-200/40 dark:shadow-amber-900/30" data-testid="bottom-cta">
            <Crown className="h-10 w-10 mx-auto mb-3 opacity-90" />
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-2">Ready to work abroad?</h2>
            <p className="text-white/80 mb-6 max-w-sm mx-auto text-sm">
              {publicStats?.totalUsers
                ? `Join ${publicStats.totalUsers.toLocaleString()}+ members. Start with a 1-day trial for just KES 99.`
                : "Start with KES 99 — upgrade to yearly when you're ready. Instant activation."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                variant="outline"
                className="border-white/60 text-white bg-white/15 hover:bg-white/25 font-semibold h-12 px-7"
                onClick={() => goToPayment("trial")}
                data-testid="btn-bottom-trial"
              >
                <Clock className="h-4 w-4 mr-2" />
                Try 1 Day — KES 99
              </Button>
              <Button
                size="lg"
                className="bg-white text-amber-700 hover:bg-amber-50 font-bold shadow-xl px-10 text-base h-12"
                onClick={() => goToPayment("pro")}
                data-testid="btn-bottom-cta"
              >
                <Crown className="h-5 w-5 mr-2" />
                Start Yearly Consultation — KES 4,500
              </Button>
            </div>
            <p className="text-white/60 text-xs mt-3">
              🔒 Secure payment · Instant access · 7-day money-back guarantee
            </p>
          </div>
        )}
      </section>

      {/* ── STICKY BOTTOM BAR ── */}
      {stickyVisible && !isActive && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3 px-4 flex items-center justify-between shadow-2xl"
          data-testid="sticky-cta"
        >
          <div className="flex flex-col">
            <span className="text-sm font-bold flex items-center gap-1.5">
              <Flame className="h-4 w-4" /> From KES 99 — limited access remaining
            </span>
            <span className="text-white/70 text-xs">Verified jobs · Smart tools · Real guidance</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              className="bg-white/20 border border-white/40 text-white hover:bg-white/30 font-semibold h-9 px-4 text-xs"
              onClick={() => goToPayment("trial")}
              data-testid="btn-sticky-trial"
            >
              Try KES 99
            </Button>
            <Button
              className="bg-white text-amber-700 hover:bg-amber-50 font-bold h-9 px-4 text-xs"
              onClick={() => goToPayment("pro")}
              data-testid="btn-sticky-cta"
            >
              <Crown className="h-3.5 w-3.5 mr-1" /> KES 4,500/yr
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
