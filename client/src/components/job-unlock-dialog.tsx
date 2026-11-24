/**
 * "Talk to {employer} directly today" — KES 1,000 job-contact unlock (2026-11 redesign).
 *
 * Shown when a job seeker without an active plan taps Call / WhatsApp / Apply on a
 * Kazi Karibu or Kenyan Jobs listing. ONE option only: Monthly, KES 1,000 / 30 days
 * (Tony's rule — no Yearly here). Mounted once in App.tsx as <JobUnlockHost/>.
 *
 * Usage from any button handler (deliberate taps only — see FREEMIUM_RULES.md):
 *   openJobUnlock(serverBody, {
 *     employer: "Verons Restaurant", title: "Cook", place: "Thika Road, Nairobi",
 *     payMin: 18000, payMax: 21000, period: "month", type: "Permanent",
 *   });
 *
 * ── Easy customisation ─────────────────────────────────────────────────────────
 *   PRICE_KES / ACCESS_DAYS ........ the offer (must match the server plan price)
 *   ACCENT classes (emerald-*) ..... colour theme
 *   COPY object below .............. every visible sentence in one place
 *
 * ── Honesty rules (docs/architecture/FREEMIUM_RULES.md) ───────────────────────
 *   • The price anchor is CALCULATED from the job's real pay — never hard-coded.
 *   • Social proof uses LIVE counts from /api/public/stats and the job APIs.
 *   • No claims we can't verify (e.g. "interviews within days"), no job guarantees.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Phone, MessageCircle, Briefcase, Headphones, ShieldCheck, Smartphone, MapPin, Users, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// ── Offer ────────────────────────────────────────────────────────────────────
const PRICE_KES = 1000;
const ACCESS_DAYS = 30;
const EVT = "wah:job-unlock";
export const JOB_UNLOCK_DEFAULT_URL = "/payment?plan=monthly&only=1&method=mpesa";

/** Job details shown in the modal. Every field is optional — copy falls back gracefully. */
export interface UnlockJob {
  employer?: string | null;      // "Verons Restaurant"
  title?: string | null;         // "Cook"
  place?: string | null;         // "Thika Road, Nairobi"
  payMin?: number | null;        // 18000
  payMax?: number | null;        // 21000
  period?: string | null;        // "month" | "day" | "week" | "hour" | "project" | "job" | "year"
  type?: string | null;          // "Permanent", "Casual", …
}

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const PERIOD_WORD: Record<string, string> = { month: "per month", day: "per day", week: "per week", hour: "per hour", year: "per year", project: "for the job", job: "for the job" };

/** Turn the job's pay into an honest comparison with the KES 1,000 price. */
export function priceAnchor(job?: UnlockJob | null): string | null {
  const low = job?.payMin ?? job?.payMax;
  if (!low || low <= 0) return null;
  const p = String(job?.period ?? "").toLowerCase();
  if (p === "month") {
    const pct = (PRICE_KES / low) * 100;
    // 18,000/month → "about 6% of one month's pay"
    return pct < 1 ? "less than 1% of one month's pay" : `about ${Math.ceil(pct)}% of one month's pay`;
  }
  if (p === "year") return `about ${Math.ceil((PRICE_KES / low) * 100)}% of one year's pay`;
  if (p === "week") { const w = PRICE_KES / low; return w <= 1 ? "less than one week's pay" : `about ${w.toFixed(1).replace(/\.0$/, "")} weeks' pay`; }
  if (p === "day") { const d = PRICE_KES / low; return d <= 1 ? "less than one day's pay" : `about ${Math.ceil(d)} days' pay`; }
  return null; // hour / project: no fair comparison — say nothing rather than mislead
}

export function openJobUnlock(body?: { payUrl?: string } | null, job?: UnlockJob | null) {
  const ret = window.location.pathname + window.location.search;
  const payUrl = body?.payUrl && body.payUrl.startsWith("/payment")
    ? (body.payUrl.includes("method=") ? body.payUrl : `${body.payUrl}&method=mpesa`)
    : `${JOB_UNLOCK_DEFAULT_URL}&return=${encodeURIComponent(ret)}`;
  window.dispatchEvent(new CustomEvent(EVT, { detail: { payUrl, job: job ?? null } }));
}

export function JobUnlockHost() {
  const [state, setState] = useState<{ payUrl: string; job: UnlockJob | null } | null>(null);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      setState({ payUrl: d.payUrl ?? JOB_UNLOCK_DEFAULT_URL, job: d.job ?? null });
    };
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return <JobUnlockModal open={!!state} payUrl={state?.payUrl ?? JOB_UNLOCK_DEFAULT_URL} job={state?.job ?? null} onClose={() => setState(null)} />;
}

/** Presentational modal — exported so it can be previewed/tested on its own. */
export function JobUnlockModal({ open, payUrl, job, onClose }: { open: boolean; payUrl: string; job: UnlockJob | null; onClose: () => void }) {
  // Live numbers for social proof (cached; only fetched while the modal is open).
  const stats = useQuery<{ totalUsers?: number }>({ queryKey: ["/api/public/stats"], enabled: open, staleTime: 5 * 60_000 });
  const kk = useQuery<{ total?: number }>({ queryKey: ["/api/kazi-karibu/posts?limit=1"], enabled: open, staleTime: 60_000 });
  const lj = useQuery<{ total?: number }>({ queryKey: ["/api/lj/jobs?limit=1"], enabled: open, staleTime: 60_000 });
  const liveJobs = (kk.data?.total ?? 0) + (lj.data?.total ?? 0);
  const users = stats.data?.totalUsers ?? 0;
  const usersLabel = users >= 1000 ? `${(Math.floor(users / 1000) * 1000).toLocaleString("en-KE")}+` : null;

  const [busy, setBusy] = useState(false);
  const anchor = priceAnchor(job);
  const employer = job?.employer?.trim() || null;
  const role = job?.title?.trim() || null;
  const pay = job?.payMin || job?.payMax
    ? `${kes(job!.payMin ?? job!.payMax!)}${job?.payMin && job?.payMax && job.payMax !== job.payMin ? ` – ${Math.round(job.payMax).toLocaleString("en-KE")}` : ""} ${PERIOD_WORD[String(job?.period ?? "")] ?? ""}`.trim()
    : null;

  // ── COPY — edit wording here ────────────────────────────────────────────────
  const COPY = useMemo(() => ({
    eyebrow: "Direct employer contact",
    headline: employer ? `Talk to ${employer} directly today` : "Talk to the employer directly today",
    subhead: [
      role && pay ? `This ${role.toLowerCase()} role pays ${pay}.` : pay ? `This job pays ${pay}.` : null,
      `For ${kes(PRICE_KES)}${anchor ? ` (${anchor})` : ""}, get the employer's phone & WhatsApp and reach them before the role is filled.`,
    ].filter(Boolean).join(" "),
    priceNote: `${ACCESS_DAYS} days full access · M-Pesa`,
    benefits: [
      { icon: Phone, text: employer ? `Call or WhatsApp ${employer} directly — no middleman` : "Call or WhatsApp the employer directly — no middleman" },
      { icon: Briefcase, text: liveJobs > 1
          ? `Contact every employer in Kenyan Jobs + Kazi Karibu (${liveJobs} open now, new listings added as they come in)`
          : "Contact every employer in Kenyan Jobs + Kazi Karibu for 30 days" },
      { icon: Headphones, text: "Help on WhatsApp from the WorkAbroad Hub team if anything goes wrong" },
    ],
    proof: usersLabel ? `Trusted by ${usersLabel} registered job seekers` : null,
    cta: `Pay ${kes(PRICE_KES)} with M-Pesa & Unlock Now`,
    ctaHint: "Confirm your number → STK push to your phone → enter your PIN. Usually under a minute.",
    footer: "Your payment goes only to WorkAbroad Hub. We never ask you to pay an employer to get a job.",
  }), [employer, role, pay, anchor, liveJobs, usersLabel]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        // Dark, rounded, trustworthy. [&>button]:hidden hides the default shadcn close so we render our own.
        className="max-w-[420px] w-[calc(100vw-24px)] p-0 overflow-hidden rounded-3xl border border-emerald-500/20 bg-[#0b1512] text-slate-100 shadow-2xl shadow-emerald-950/50 [&>button]:hidden max-h-[92vh] overflow-y-auto"
        data-testid="dialog-job-unlock"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-emerald-500/15 to-transparent">
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="absolute right-3 top-3 h-9 w-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition"
            data-testid="btn-job-unlock-close"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
            <Zap className="h-3 w-3" /> {COPY.eyebrow}
          </div>
          <DialogTitle className="mt-3 pr-8 text-[22px] leading-tight font-extrabold text-white">{COPY.headline}</DialogTitle>
          {(role || job?.place || job?.type) && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
              {role && <span className="inline-flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{role}</span>}
              {job?.place && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.place}</span>}
              {job?.type && <span>{job.type}</span>}
            </div>
          )}
          <DialogDescription className="mt-3 text-[15px] leading-relaxed text-slate-300">{COPY.subhead}</DialogDescription>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* ── Price card with "Best value" badge + salary anchor ─────────── */}
          <div className="relative rounded-2xl border-2 border-emerald-500 bg-emerald-500/[0.07] p-4">
            <span className="absolute -top-2.5 left-4 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-950">Best value · 30 days</span>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[34px] leading-none font-extrabold text-white">{kes(PRICE_KES)}</div>
                <div className="mt-1 text-sm text-slate-400">{COPY.priceNote}</div>
              </div>
              {anchor && (
                <div className="text-right text-xs font-semibold text-emerald-300 max-w-[140px]" data-testid="unlock-anchor">
                  ≈ {anchor}
                </div>
              )}
            </div>
          </div>

          {/* ── Outcome-focused benefits ───────────────────────────────────── */}
          <ul className="space-y-2.5">
            {COPY.benefits.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-sm text-slate-200">
                <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <Icon className="h-3.5 w-3.5 text-emerald-400" />
                </span>
                <span className="leading-snug">{text}</span>
              </li>
            ))}
          </ul>

          {/* ── Light social proof (live count) ────────────────────────────── */}
          {COPY.proof && (
            <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-slate-300" data-testid="unlock-proof">
              <Users className="h-4 w-4 text-emerald-400 shrink-0" /> {COPY.proof}
            </div>
          )}

          {/* ── Primary CTA: M-Pesa STK push ───────────────────────────────── */}
          <div>
            <button
              type="button" disabled={busy}
              onClick={() => { setBusy(true); const u = payUrl; window.location.href = u; }}
              className="w-full h-14 rounded-2xl bg-[#22c55e] hover:bg-[#16a34a] active:scale-[0.99] disabled:opacity-70 text-emerald-950 text-base font-extrabold shadow-lg shadow-emerald-500/25 transition inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/40"
              data-testid="btn-job-unlock-pay"
            >
              <Smartphone className="h-5 w-5" /> {busy ? "Opening M-Pesa…" : COPY.cta}
            </button>
            <p className="mt-2 text-center text-xs text-slate-400">{COPY.ctaHint}</p>
          </div>

          {/* ── Trust / risk reversal ──────────────────────────────────────── */}
          <div className="flex gap-2 border-t border-white/10 pt-3 text-[12px] leading-snug text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{COPY.footer}</span>
          </div>
          <button type="button" onClick={onClose} className="block mx-auto text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2">
            Maybe later — keep browsing
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
