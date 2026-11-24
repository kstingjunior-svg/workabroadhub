/**
 * Dashboard Pro card (2026-11 redesign) — "Your personal career advisor, KES 12 a day".
 *
 * Choice architecture: two options only (Monthly vs Yearly). Yearly is pre-selected
 * and labelled SMART CHOICE; the daily price (KES 12) is the visual anchor and the
 * monthly route is shown honestly as the costlier one (KES 12,000 a year).
 *
 * Honesty rules (docs/architecture/AUTHENTIC_DATA_POLICY.md):
 *   • Prices come from /api/plans (authoritative), with the canonical KES 1,000 / 4,500 fallback.
 *   • KES 12/day, KES 375/month and "save KES 7,500" are CALCULATED from those prices.
 *   • Social proof is the live registered-member count — never a fixed number.
 *   • Plans are one-off payments with no auto-renewal, so we say that (not "cancel anytime").
 *
 * Hidden for users who already have a paid plan or are admins.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { isPaidUser } from "@/lib/plan";
import { useAuth } from "@/hooks/use-auth";
import { Crown, Check, ArrowRight, ShieldCheck, Users } from "lucide-react";
import { conv, CONV } from "@/lib/conversion-events";

const PRO_FEATURES = [
  "1-on-1 WhatsApp career advisor",
  "Personal agency verification",
  "Human CV review before you apply",
  "Advisor-curated jobs for your country",
  "Advisor follows up on applications",
  "Priority WhatsApp response",
];

// Fine film-grain texture (inline SVG noise — no external asset).
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

export function DashboardProUpsell() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [plan, setPlan] = useState<"pro" | "monthly">("pro");

  const { data: freshPlan } = useQuery<{ planId: string } | null>({
    queryKey: ["/api/user/plan"], enabled: !!user, refetchOnWindowFocus: true, refetchOnMount: true,
    refetchInterval: 2 * 60_000, staleTime: 60_000,
  });
  const { data: plans } = useQuery<Array<{ planId?: string; plan_id?: string; price: number }>>({ queryKey: ["/api/plans"], staleTime: 5 * 60_000 });
  const { data: stats } = useQuery<{ registeredMembers?: number | null }>({ queryKey: ["/api/public/stats"], staleTime: 5 * 60_000 });

  const isAlreadyPro = isPaidUser((user as any)?.plan) || isPaidUser(freshPlan?.planId)
    || (user as any)?.subscriptionStatus === "active" || (user as any)?.isAdmin === true;
  if (isAlreadyPro) return null;

  const price = (id: string, fallback: number) => plans?.find((p) => (p.planId ?? p.plan_id) === id)?.price ?? fallback;
  const yearly = price("pro", 4500);
  const monthly = price("monthly", 1000);
  const monthlyYear = monthly * 12;                    // 12,000
  const saving = Math.max(0, monthlyYear - yearly);    // 7,500
  const perMonth = Math.round(yearly / 12);            // 375
  const perDay = Math.round(yearly / 365);             // 12
  const members = stats?.registeredMembers ?? null;
  const membersLabel = members && members >= 1000 ? `${(Math.floor(members / 1000) * 1000).toLocaleString("en-KE")}+` : null;

  const go = () => {
    conv(CONV.UPGRADE_PLAN, { plan: plan === "pro" ? "yearly" : "monthly", feature: "dashboard_pro_card", trigger: "dashboard_card" });
    const ret = window.location.pathname + window.location.search;
    navigate(`/payment?plan=${plan}&return=${encodeURIComponent(ret)}`);
  };

  return (
    <section className="mb-6" aria-label="WorkAbroad Hub Pro">
      <div
        className="relative overflow-hidden rounded-[28px] text-[#2b1408] shadow-[0_30px_60px_-25px_rgba(0,0,0,.7)] ring-1 ring-black/10"
        style={{ background: "linear-gradient(155deg,#f6b25a 0%,#ee8a34 38%,#dc6a26 72%,#c4561f 100%)" }}
        data-testid="pro-card"
      >
        {/* grain + soft vignette for a printed, non-plastic feel */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.22] mix-blend-multiply" style={{ backgroundImage: GRAIN }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 0%,rgba(255,236,200,.35),transparent 60%)" }} />

        <div className="relative px-5 py-7 sm:px-9 sm:py-9 max-w-3xl mx-auto">
          {/* Eyebrow */}
          <div className="flex items-center justify-center gap-2 text-[#4a2410]">
            <Crown className="h-5 w-5" />
            <span className="text-[13px] font-semibold tracking-[0.22em] uppercase">WorkAbroad Hub <span className="text-[#8a2a12]">Pro</span></span>
          </div>
          <div className="mx-auto mt-3 flex items-center justify-center gap-2 opacity-60"><span className="h-px w-16 bg-[#4a2410]" /><span className="h-1.5 w-1.5 rounded-full bg-[#4a2410]" /><span className="h-px w-16 bg-[#4a2410]" /></div>

          {/* Anchor */}
          <h3 className="mt-5 text-center font-serif text-[26px] sm:text-[34px] leading-tight text-[#2b1408]">Your personal career advisor</h3>
          <div className="mt-1 flex items-baseline justify-center gap-2" aria-label={`About ${kes(perDay)} a day`}>
            <span className="font-serif font-bold tracking-tight text-[#fff6ea] drop-shadow-[0_2px_0_rgba(120,40,10,.25)] text-[64px] sm:text-[92px] leading-none">{kes(perDay)}</span>
            <span className="font-serif text-2xl sm:text-3xl text-[#fff6ea]/90">/day</span>
          </div>
          <p className="mt-2 text-center text-[15px] sm:text-base text-[#3a1a0a]">
            Less than a mandazi per day. <b>Full access for one year.</b>
          </p>

          {/* Features */}
          <ul className="mt-6 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[15px] text-[#2b1408]">
                <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-[#7a2e12] text-[#ffe9cf] flex items-center justify-center"><Check className="h-3 w-3" strokeWidth={3} /></span>
                <span className="leading-snug">{f}</span>
              </li>
            ))}
          </ul>

          {/* Two-option choice: Monthly vs Yearly (Yearly = smart choice) */}
          <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-4" role="radiogroup" aria-label="Choose your plan">
            <button
              type="button" role="radio" aria-checked={plan === "monthly"} onClick={() => setPlan("monthly")}
              className={`rounded-2xl border-2 p-3 sm:p-4 text-left transition active:scale-[0.99] ${plan === "monthly" ? "border-[#2b1408] bg-[#fff1df]/40" : "border-[#2b1408]/25 hover:border-[#2b1408]/50 bg-transparent"}`}
              data-testid="pro-plan-monthly"
            >
              <div className="text-sm font-semibold text-[#4a2410]">Monthly</div>
              <div className="mt-1 font-serif text-2xl sm:text-3xl text-[#2b1408] whitespace-nowrap">{kes(monthly)}<span className="text-sm font-sans">/mo</span></div>
              <div className="mt-1 text-xs text-[#4a2410]/80">{kes(monthlyYear)} a year if you keep paying monthly</div>
            </button>
            <button
              type="button" role="radio" aria-checked={plan === "pro"} onClick={() => setPlan("pro")}
              className={`relative rounded-2xl border-2 p-3 sm:p-4 text-left transition active:scale-[0.99] ${plan === "pro" ? "border-[#ffe2b8] bg-[#5a1f0c] text-[#fff3e3] shadow-[0_12px_30px_-12px_rgba(90,31,12,.9)]" : "border-[#5a1f0c]/40 bg-[#5a1f0c]/80 text-[#fff3e3] hover:border-[#ffe2b8]/70"}`}
              data-testid="pro-plan-yearly"
            >
              {saving > 0 && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#ffcf86] px-2.5 py-0.5 text-[11px] font-bold text-[#4a1a08] shadow">
                  Save {kes(saving)}
                </span>
              )}
              <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#ffcf86]">Smart choice</div>
              <div className="mt-1 font-serif text-2xl sm:text-3xl whitespace-nowrap">{kes(yearly)}<span className="text-sm font-sans">/year</span></div>
              <div className="mt-1 text-xs text-[#ffe9cf]/90">Works out to <b>{kes(perMonth)}/month</b></div>
            </button>
          </div>

          {/* Loss-aversion comparison */}
          {saving > 0 && (
            <div className="mt-4 rounded-xl border border-[#2b1408]/20 bg-[#fff6ea]/25 px-4 py-2.5 text-center text-sm text-[#3a1a0a]">
              Paying monthly would cost you <b>{kes(monthlyYear)}</b> a year — choose yearly and avoid losing <b>{kes(saving)}</b>.
            </div>
          )}

          {/* CTA */}
          <button
            type="button" onClick={go}
            className="mt-5 w-full h-14 rounded-2xl bg-[#fff6ea] text-[#2b1408] text-lg font-bold shadow-[0_10px_24px_-10px_rgba(60,20,5,.8)] hover:bg-white active:scale-[0.99] transition inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#fff6ea]/60"
            data-testid="button-upgrade-pro"
          >
            Upgrade to Pro <ArrowRight className="h-5 w-5" />
          </button>
          <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[13px] text-[#3a1a0a]">
            <ShieldCheck className="h-4 w-4" /> One payment, no auto-renewal · Activates as soon as payment confirms
          </p>

          {/* Payment methods + trust */}
          <div className="mt-5 border-t border-[#2b1408]/20 pt-4 flex items-center justify-center gap-5 text-[15px] font-bold">
            <span className="text-[#0f7a3d]">M-PESA</span>
            <span className="h-5 w-px bg-[#2b1408]/25" />
            <span><span className="text-[#1d3d8f]">Pay</span><span className="text-[#2a8bd8]">Pal</span></span>
          </div>
          <p className="mt-1 text-center text-[11px] text-[#3a1a0a]/80">M-Pesa Paybill 4153025 · PayPal for payments from outside Kenya</p>
          {membersLabel && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-[#3a1a0a]" data-testid="pro-card-proof">
              <Users className="h-4 w-4" /> Trusted by {membersLabel} registered members
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
