/**
 * /calculator — Working-abroad income calculator.
 *
 * Pick a role + country, choose a lifestyle tier, set your send-home %, and
 * watch the numbers update live: what you'd net after living costs, what you
 * could send home each month, what you'd save personally, and how that
 * compares to staying in Nairobi.
 *
 * 100% client-side — no backend roundtrip. Data lives in
 * shared/salary-intelligence.ts + shared/cost-of-living.ts.
 *
 * 2026-06 retention #6.
 */
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Calculator, Banknote, HomeIcon, ShoppingCart, Bus, Phone, HeartPulse,
  Coins, Plane, TrendingUp, TrendingDown, ArrowRight, ArrowLeft, Sparkles,
} from "lucide-react";
import {
  SALARY_ROLES, SUPPORTED_SALARY_COUNTRIES, compareRoleAcrossCountries,
  NAIROBI_BENCHMARK_KES,
} from "@shared/salary-intelligence";
import {
  COST_OF_LIVING, NAIROBI_BASELINE_KES, sumCosts, type LifestyleTier,
  type CostBreakdown,
} from "@shared/cost-of-living";

const TIER_META: Record<LifestyleTier, { label: string; sub: string; color: string }> = {
  lean: {
    label: "Lean",
    sub: "Share a room, cook mostly, public transit",
    color: "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30",
  },
  typical: {
    label: "Typical",
    sub: "Own studio or small share, mixed lifestyle",
    color: "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30",
  },
  comfortable: {
    label: "Comfortable",
    sub: "Own 1-bed, restaurants, weekend outings",
    color: "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30",
  },
};

function fmtKes(n: number): string {
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `KES ${Math.round(n / 1000)}K`;
  return `KES ${n.toLocaleString("en-KE")}`;
}

function fmtKesFull(n: number): string {
  return `KES ${Math.round(n).toLocaleString("en-KE")}`;
}

export default function CalculatorPage() {
  const [, navigate] = useLocation();

  // Defaults — Registered Nurse + UAE + typical lifestyle + 60% send-home
  const [roleKey, setRoleKey]   = useState("nurse");
  const [country, setCountry]   = useState("AE");
  const [tier, setTier]         = useState<LifestyleTier>("typical");
  const [salarySlider, setSalarySlider] = useState<number | null>(null);
  const [sendHomePct, setSendHomePct]   = useState(60);
  const [housingProvided, setHousingProvided] = useState(false);

  const role = SALARY_ROLES.find((r) => r.key === roleKey);
  const salaryEntry = role?.entries.find((e) => e.countryCode === country);
  const costEntry = COST_OF_LIVING[country];

  // If the user picks an unsupported (role, country) pair, surface the closest
  // alternatives so the calculator never shows "no data". For now we just
  // warn — they can still tweak the controls.
  const dataMissing = !salaryEntry || !costEntry;

  // Default the salary slider midpoint when role+country changes
  const effectiveSalaryLocal = useMemo(() => {
    if (!salaryEntry) return 0;
    if (salarySlider !== null) return salarySlider;
    return Math.round((salaryEntry.monthlyMin + salaryEntry.monthlyMax) / 2);
  }, [salaryEntry, salarySlider]);

  // ── Live math ───────────────────────────────────────────────────────────
  const calculations = useMemo(() => {
    if (!salaryEntry || !costEntry) return null;

    const breakdown = costEntry.tiers[tier];
    // If housing+food provided, zero those categories
    const effectiveBreakdown: CostBreakdown = {
      ...breakdown,
      rent: housingProvided ? 0 : breakdown.rent,
      food: housingProvided ? 0 : breakdown.food,
    };
    const totalCostsLocal = sumCosts(effectiveBreakdown);
    const grossLocal      = effectiveSalaryLocal;
    const netLocal        = Math.max(0, grossLocal - totalCostsLocal);

    // Convert to KES
    const fx = salaryEntry.fxToKes;
    const grossKes  = grossLocal * fx;
    const costsKes  = totalCostsLocal * fx;
    const netKes    = netLocal * fx;

    // Allocate net between send-home and personal save
    const sendHomeKes = netKes * (sendHomePct / 100);
    const personalKes = netKes - sendHomeKes;

    // 12-month + 24-month projections (just multiplied; not assuming raises)
    const annualNetKes  = netKes * 12;
    const biennialNetKes = netKes * 24;

    // vs Nairobi: take what they'd net in the same role in Nairobi
    const nairobiGross  = NAIROBI_BENCHMARK_KES[roleKey] ?? 0;
    const nairobiCosts  = sumCosts(NAIROBI_BASELINE_KES[tier]);
    const nairobiNet    = Math.max(0, nairobiGross - nairobiCosts);
    const vsNairobiMonthlyKes = netKes - nairobiNet;
    const vsNairobiAnnualKes  = vsNairobiMonthlyKes * 12;
    const vsNairobiPct = nairobiNet > 0
      ? Math.round(((netKes - nairobiNet) / nairobiNet) * 100)
      : null;

    return {
      breakdown: effectiveBreakdown,
      totalCostsLocal,
      grossLocal,
      netLocal,
      grossKes,
      costsKes,
      netKes,
      sendHomeKes,
      personalKes,
      annualNetKes,
      biennialNetKes,
      nairobiNet,
      vsNairobiMonthlyKes,
      vsNairobiAnnualKes,
      vsNairobiPct,
    };
  }, [salaryEntry, costEntry, tier, effectiveSalaryLocal, sendHomePct, housingProvided, roleKey]);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Back nav */}
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </button>

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-primary mb-2">
            <Calculator className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">Income Calculator</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">What would you really keep?</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Pick a job and country. We'll show you what you'd net after rent and food,
            how much you could send home, and how it compares to Nairobi.
          </p>
        </div>

        {/* ── INPUTS ─────────────────────────────────────────────────────── */}

        {/* Role + country pickers */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Role</div>
              <select
                value={roleKey}
                onChange={(e) => { setRoleKey(e.target.value); setSalarySlider(null); }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                data-testid="select-role"
              >
                {SALARY_ROLES.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Country</div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {SUPPORTED_SALARY_COUNTRIES.map((c) => {
                  const hasData = !!SALARY_ROLES
                    .find((r) => r.key === roleKey)
                    ?.entries.find((e) => e.countryCode === c.code);
                  return (
                    <button
                      key={c.code}
                      onClick={() => { setCountry(c.code); setSalarySlider(null); }}
                      disabled={!hasData}
                      className={`rounded-lg border p-2 text-center transition ${
                        country === c.code
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border hover:border-primary/40"
                      } ${!hasData ? "opacity-40 cursor-not-allowed" : ""}`}
                      data-testid={`pick-country-${c.code}`}
                    >
                      <div className="text-xl">{c.flag}</div>
                      <div className="text-[10px] font-medium">{c.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {dataMissing ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              We don't have salary or cost-of-living data for this role + country combo yet.
              Try a different pair — the disabled flag icons above show which countries are missing.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Salary slider */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your salary</div>
                  <div className="text-xs text-muted-foreground">
                    range: {salaryEntry!.currency} {salaryEntry!.monthlyMin.toLocaleString()}–{salaryEntry!.monthlyMax.toLocaleString()}
                  </div>
                </div>
                <div className="text-xl font-bold tabular-nums mb-2">
                  {salaryEntry!.currency} {effectiveSalaryLocal.toLocaleString()}
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    ≈ {fmtKesFull(effectiveSalaryLocal * salaryEntry!.fxToKes)}/mo
                  </span>
                </div>
                <Slider
                  value={[effectiveSalaryLocal]}
                  min={salaryEntry!.monthlyMin}
                  max={salaryEntry!.monthlyMax}
                  step={Math.max(50, Math.floor((salaryEntry!.monthlyMax - salaryEntry!.monthlyMin) / 50))}
                  onValueChange={(v) => setSalarySlider(v[0])}
                  data-testid="slider-salary"
                />
              </CardContent>
            </Card>

            {/* Lifestyle tier picker */}
            <Card>
              <CardContent className="p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Lifestyle</div>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(TIER_META) as LifestyleTier[]).map((key) => {
                    const m = TIER_META[key];
                    const active = tier === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setTier(key)}
                        className={`rounded-lg border-2 p-2.5 text-left transition ${
                          active ? m.color + " ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                        }`}
                        data-testid={`tier-${key}`}
                      >
                        <div className="font-bold text-sm">{m.label}</div>
                        <div className="text-[10px] text-muted-foreground line-clamp-2 leading-snug mt-0.5">{m.sub}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Housing-provided toggle (Gulf contracts often include it) */}
                {(country === "SA" || country === "QA" || country === "BH" || country === "AE") && (
                  <label
                    className="mt-3 flex items-center gap-2 text-xs cursor-pointer rounded-md bg-muted/40 p-2.5"
                    data-testid="toggle-housing"
                  >
                    <input
                      type="checkbox"
                      checked={housingProvided}
                      onChange={(e) => setHousingProvided(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span>My contract includes housing + food (common for domestic / construction Gulf placements)</span>
                  </label>
                )}
              </CardContent>
            </Card>

            {/* Send-home % slider */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Send home</div>
                  <div className="text-xl font-bold tabular-nums">{sendHomePct}%</div>
                </div>
                <Slider
                  value={[sendHomePct]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(v) => setSendHomePct(v[0])}
                  data-testid="slider-sendhome"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>Save it all</span>
                  <span>Send it all home</span>
                </div>
              </CardContent>
            </Card>

            {/* ── RESULTS ────────────────────────────────────────────────── */}

            {calculations && (
              <>
                {/* Headline net */}
                <Card className="border-2 border-emerald-300 dark:border-emerald-800 overflow-hidden">
                  <CardContent className="p-5">
                    <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">
                      You'd net
                    </div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-3xl sm:text-4xl font-bold tabular-nums">
                        {fmtKesFull(calculations.netKes)}
                      </span>
                      <span className="text-xs text-muted-foreground">/month</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      After {salaryEntry!.currency} {calculations.totalCostsLocal.toLocaleString()} in living costs.
                      Gross salary {salaryEntry!.currency} {calculations.grossLocal.toLocaleString()}.
                    </div>
                  </CardContent>
                </Card>

                {/* Allocation: send-home vs personal */}
                <div className="grid grid-cols-2 gap-3">
                  <Card className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-1">
                        <Plane className="h-3.5 w-3.5" />
                        Send home
                      </div>
                      <div className="text-lg font-bold tabular-nums">{fmtKesFull(calculations.sendHomeKes)}</div>
                      <div className="text-[10px] text-muted-foreground">{sendHomePct}% of net</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
                        <Coins className="h-3.5 w-3.5" />
                        Keep for you
                      </div>
                      <div className="text-lg font-bold tabular-nums">{fmtKesFull(calculations.personalKes)}</div>
                      <div className="text-[10px] text-muted-foreground">{100 - sendHomePct}% of net</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Cost breakdown */}
                <Card>
                  <CardContent className="p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Monthly costs</div>
                    <div className="space-y-1.5 text-sm">
                      <CostRow icon={HomeIcon}   label="Rent"        local={calculations.breakdown.rent}      currency={salaryEntry!.currency} fx={salaryEntry!.fxToKes} />
                      <CostRow icon={ShoppingCart} label="Food"       local={calculations.breakdown.food}      currency={salaryEntry!.currency} fx={salaryEntry!.fxToKes} />
                      <CostRow icon={Bus}        label="Transport"    local={calculations.breakdown.transport} currency={salaryEntry!.currency} fx={salaryEntry!.fxToKes} />
                      <CostRow icon={Phone}      label="Phone & data" local={calculations.breakdown.phoneData} currency={salaryEntry!.currency} fx={salaryEntry!.fxToKes} />
                      <CostRow icon={HeartPulse} label="Healthcare"   local={calculations.breakdown.healthcare} currency={salaryEntry!.currency} fx={salaryEntry!.fxToKes} />
                      <CostRow icon={Coins}      label="Other"        local={calculations.breakdown.misc}      currency={salaryEntry!.currency} fx={salaryEntry!.fxToKes} />
                      <div className="flex items-center justify-between pt-2 mt-2 border-t font-bold text-sm">
                        <span>Total</span>
                        <span className="tabular-nums">{fmtKesFull(calculations.costsKes)}</span>
                      </div>
                    </div>
                    {costEntry!.notes && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed mt-3 italic">💡 {costEntry!.notes}</p>
                    )}
                  </CardContent>
                </Card>

                {/* Annual + vs-Nairobi */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        12-month projection
                      </div>
                      <div className="text-2xl font-bold tabular-nums">{fmtKes(calculations.annualNetKes)}</div>
                      <div className="text-[11px] text-muted-foreground">Total net (excluding raises)</div>
                      <div className="mt-2 pt-2 border-t flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">2 years</span>
                        <span className="text-sm font-semibold tabular-nums">{fmtKes(calculations.biennialNetKes)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={
                    calculations.vsNairobiMonthlyKes >= 0
                      ? "border-emerald-200 dark:border-emerald-800"
                      : "border-rose-200 dark:border-rose-800"
                  }>
                    <CardContent className="p-4">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        {calculations.vsNairobiMonthlyKes >= 0
                          ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                          : <TrendingDown className="h-3.5 w-3.5 text-rose-600" />}
                        vs Nairobi
                      </div>
                      <div className={`text-2xl font-bold tabular-nums ${
                        calculations.vsNairobiMonthlyKes >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
                      }`}>
                        {calculations.vsNairobiMonthlyKes >= 0 ? "+" : ""}{fmtKes(calculations.vsNairobiMonthlyKes)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        per month vs same role in Nairobi
                        {calculations.vsNairobiPct !== null && (
                          <> ({calculations.vsNairobiPct > 0 ? "+" : ""}{calculations.vsNairobiPct}%)</>
                        )}
                      </div>
                      <div className="mt-2 pt-2 border-t text-[11px] text-muted-foreground">
                        Over 1 year:{" "}
                        <span className={`font-bold ${calculations.vsNairobiAnnualKes >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                          {calculations.vsNairobiAnnualKes >= 0 ? "+" : ""}{fmtKes(calculations.vsNairobiAnnualKes)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Cross-feature CTAs */}
                <Card className="bg-gradient-to-br from-primary/5 to-accent/5">
                  <CardContent className="p-4 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      <Sparkles className="h-3.5 w-3.5 inline mr-1" /> Next steps
                    </div>
                    <Link href={`/journey/${country}`}>
                      <Button variant="outline" size="sm" className="w-full justify-between">
                        See the roadmap to land this job in {SUPPORTED_SALARY_COUNTRIES.find((c) => c.code === country)?.name}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link href="/interview">
                      <Button variant="outline" size="sm" className="w-full justify-between">
                        Practice a {role!.label.toLowerCase()} interview
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link href="/salary">
                      <Button variant="outline" size="sm" className="w-full justify-between">
                        Compare {role!.label.toLowerCase()} salaries across all 9 destinations
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}

        {/* Disclaimer */}
        <p className="text-[10px] text-muted-foreground text-center max-w-md mx-auto leading-relaxed">
          Estimates for planning only — actual income depends on your contract, taxes, FX rates, and lifestyle.
          Costs are 2026 city averages; expensive cities (Dubai, London, Sydney) can run 25–50% higher.
        </p>
      </div>
    </div>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────

function CostRow({ icon: Icon, label, local, currency, fx }: {
  icon: any; label: string; local: number; currency: string; fx: number;
}) {
  if (local === 0) {
    return (
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {label}</span>
        <span className="text-xs italic">Provided / 0</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {label}</span>
      <span className="tabular-nums text-xs">
        {currency} {local.toLocaleString()} <span className="text-muted-foreground">· {fmtKesFull(local * fx)}</span>
      </span>
    </div>
  );
}
