/**
 * /salary — Salary Intelligence explorer.
 *
 * Pick a role (Nurse, Care Worker, Truck Driver, etc.) and see what you'd
 * earn across every destination — local currency, KES equivalent, send-home
 * potential, and how it compares to a Nairobi salary in the same role.
 *
 * Built entirely from local content (shared/salary-intelligence.ts) so the
 * page renders instantly with zero network dependency. The /api/salary
 * endpoint exists for any future B2B / mobile-app consumers.
 *
 * 2026-06 retention #2.
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SALARY_ROLES,
  NAIROBI_BENCHMARK_KES,
  compareRoleAcrossCountries,
} from "@shared/salary-intelligence";
import {
  Banknote, ArrowRight, TrendingUp, Stethoscope, ChefHat, HardHat, Truck,
  Code, Calculator, BookOpen, Home, Package, Shield, Heart, Sparkles,
} from "lucide-react";

const CATEGORY_META: Record<string, { icon: any; label: string; tint: string }> = {
  healthcare:   { icon: Stethoscope, label: "Healthcare",   tint: "from-rose-500/20 to-pink-500/20" },
  hospitality:  { icon: ChefHat,     label: "Hospitality",  tint: "from-amber-500/20 to-orange-500/20" },
  construction: { icon: HardHat,     label: "Construction", tint: "from-orange-500/20 to-yellow-500/20" },
  transport:    { icon: Truck,       label: "Transport",    tint: "from-blue-500/20 to-cyan-500/20" },
  skilled:      { icon: Code,        label: "Skilled",      tint: "from-indigo-500/20 to-violet-500/20" },
  domestic:     { icon: Home,        label: "Domestic",     tint: "from-emerald-500/20 to-teal-500/20" },
  education:    { icon: BookOpen,    label: "Education",    tint: "from-purple-500/20 to-fuchsia-500/20" },
  casual:       { icon: Package,     label: "Entry-Level",  tint: "from-slate-500/20 to-gray-500/20" },
};

const ROLE_ICON: Record<string, any> = {
  nurse: Stethoscope, care_worker: Heart, hotel_staff: ChefHat,
  chef_cook: ChefHat, construction_skilled: HardHat, construction_laborer: HardHat,
  driver: Truck, domestic_worker: Home, software_developer: Code,
  accountant: Calculator, teacher: BookOpen, warehouse_worker: Package,
  security_guard: Shield,
};

function fmtKes(n: number): string {
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `KES ${(n / 1000).toFixed(0)}K`;
  return `KES ${n.toLocaleString("en-KE")}`;
}

function fmtKesFull(n: number): string {
  return `KES ${n.toLocaleString("en-KE")}`;
}

export default function SalaryExplorerPage() {
  const [, navigate] = useLocation();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  // Group roles by category for the picker
  const rolesByCategory = useMemo(() => {
    const map = new Map<string, typeof SALARY_ROLES>();
    for (const r of SALARY_ROLES) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    return map;
  }, []);

  if (selectedRole) {
    return <RoleDetailView roleKey={selectedRole} onBack={() => setSelectedRole(null)} />;
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-primary mb-2">
            <Banknote className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">Salary Intelligence</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">What can you really earn abroad?</h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Pick your role. We'll show you what every destination pays — in local currency, in KES,
            and how much you could send home each month.
          </p>
        </div>

        {/* Role picker — grouped by category */}
        <div className="space-y-5">
          {Array.from(rolesByCategory.entries()).map(([category, roles]) => {
            const meta = CATEGORY_META[category];
            const CategoryIcon = meta?.icon ?? Banknote;
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <CategoryIcon className="h-4 w-4" />
                  {meta?.label ?? category}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {roles.map((role) => {
                    const RoleIcon = ROLE_ICON[role.key] ?? Banknote;
                    const best = compareRoleAcrossCountries(role.key)[0];
                    return (
                      <button
                        key={role.key}
                        onClick={() => setSelectedRole(role.key)}
                        className={`text-left rounded-xl border bg-card p-4 hover:shadow-md hover:border-primary/40 transition-all bg-gradient-to-br ${meta?.tint ?? ""}`}
                        data-testid={`role-card-${role.key}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 p-2 rounded-lg bg-background/60">
                            <RoleIcon className="h-5 w-5 text-foreground/80" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm mb-0.5">{role.label}</div>
                            <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">
                              {role.description}
                            </p>
                            {best && (
                              <div className="flex items-center gap-1.5 text-xs">
                                <span>{best.countryFlag}</span>
                                <span className="text-muted-foreground">Best:</span>
                                <span className="font-semibold text-foreground">
                                  {fmtKes(best.monthlyMidKes)}/mo
                                </span>
                              </div>
                            )}
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="mt-8 text-xs text-muted-foreground text-center max-w-md mx-auto">
          Figures are 2026 ranges from active NEAIMS-agency contracts, public salary surveys, and
          diaspora reports. Your contract may differ — verify with your recruiter before signing.
        </div>
      </div>
    </div>
  );
}

// ─── Detail view: one role across every country ──────────────────────────

function RoleDetailView({ roleKey, onBack }: { roleKey: string; onBack: () => void }) {
  const [, navigate] = useLocation();
  const role = SALARY_ROLES.find((r) => r.key === roleKey);
  const compared = useMemo(() => compareRoleAcrossCountries(roleKey), [roleKey]);
  const nairobiBenchmark = NAIROBI_BENCHMARK_KES[roleKey] ?? null;

  if (!role) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-sm"><CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">Role not found.</p>
          <Button onClick={onBack}>Back</Button>
        </CardContent></Card>
      </div>
    );
  }

  // The highest country sets the scale for the comparison bars
  const maxKes = Math.max(...compared.map((c) => c.monthlyMaxKes), 1);
  const RoleIcon = ROLE_ICON[role.key] ?? Banknote;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          ← All roles
        </button>

        {/* Role header card */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="shrink-0 p-2.5 rounded-lg bg-primary/10">
                <RoleIcon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold mb-0.5">{role.label}</h1>
                <p className="text-sm text-muted-foreground">{role.description}</p>
              </div>
            </div>

            {nairobiBenchmark && (
              <div className="text-xs bg-muted/50 rounded-lg p-2.5 flex items-center justify-between gap-3 mt-2">
                <span className="text-muted-foreground">Reference Nairobi salary for this role:</span>
                <span className="font-semibold tabular-nums">{fmtKesFull(nairobiBenchmark)}/mo</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Country comparison */}
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5" />
            Ranked by KES-equivalent salary
          </div>

          {compared.length === 0 && (
            <Card><CardContent className="p-4 text-sm text-muted-foreground text-center">
              We don't have salary data for this role yet.
            </CardContent></Card>
          )}

          {compared.map((c, idx) => {
            const vsKenyaPercent = nairobiBenchmark
              ? Math.round(((c.monthlyMidKes - nairobiBenchmark) / nairobiBenchmark) * 100)
              : null;
            const widthPct = Math.round((c.monthlyMaxKes / maxKes) * 100);
            const minWidthPct = Math.round((c.monthlyMinKes / maxKes) * 100);

            return (
              <Card key={c.countryCode} className="overflow-hidden" data-testid={`salary-row-${c.countryCode}`}>
                <CardContent className="p-4">
                  {/* Header */}
                  <div className="flex flex-wrap items-baseline gap-2 mb-2">
                    <span className="text-2xl">{c.countryFlag}</span>
                    <span className="font-bold">{c.countryName}</span>
                    {idx === 0 && (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-[10px]">
                        <Sparkles className="h-3 w-3 mr-0.5" />Highest
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">{c.experienceFor}</span>
                  </div>

                  {/* Salary range */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Local currency</div>
                      <div className="text-base font-bold tabular-nums">
                        {c.currency} {c.monthlyMin.toLocaleString()}–{c.monthlyMax.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground">per month, gross</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">In Kenyan Shillings</div>
                      <div className="text-base font-bold tabular-nums">
                        {fmtKes(c.monthlyMinKes)}–{fmtKes(c.monthlyMaxKes)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Mid: <span className="font-mono">{fmtKesFull(c.monthlyMidKes)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Visual bar comparing to highest */}
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden mb-3">
                    <div className="absolute inset-y-0 left-0 bg-muted-foreground/30 rounded-full" style={{ width: `${minWidthPct}%` }} />
                    <div
                      className="absolute inset-y-0 bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-500 rounded-full"
                      style={{ left: `${minWidthPct}%`, width: `${widthPct - minWidthPct}%` }}
                    />
                  </div>

                  {/* Send home + vs Kenya */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-2.5 border border-emerald-200 dark:border-emerald-800">
                      <div className="text-[10px] uppercase tracking-wide text-emerald-900 dark:text-emerald-300 mb-0.5">
                        Could send home
                      </div>
                      <div className="font-bold text-emerald-900 dark:text-emerald-200 tabular-nums">
                        {fmtKesFull(c.sendHomeMonthlyKes)}
                      </div>
                      <div className="text-[10px] text-emerald-800/70 dark:text-emerald-300/70">monthly, after living costs</div>
                    </div>
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-2.5 border border-blue-200 dark:border-blue-800">
                      <div className="text-[10px] uppercase tracking-wide text-blue-900 dark:text-blue-300 mb-0.5">
                        vs Nairobi
                      </div>
                      <div className="font-bold text-blue-900 dark:text-blue-200 tabular-nums">
                        {vsKenyaPercent !== null
                          ? <>{vsKenyaPercent > 0 ? "+" : ""}{vsKenyaPercent}%</>
                          : `${c.vsKenyaMultiplier}×`}
                      </div>
                      <div className="text-[10px] text-blue-800/70 dark:text-blue-300/70">same role, mid salary</div>
                    </div>
                  </div>

                  {/* Note */}
                  {c.note && (
                    <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                      💡 {c.note}
                    </p>
                  )}

                  {/* CTA: open the journey */}
                  <button
                    onClick={() => navigate(`/journey/${c.countryCode}`)}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    data-testid={`open-journey-${c.countryCode}`}
                  >
                    See the roadmap to land a job in {c.countryName}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
