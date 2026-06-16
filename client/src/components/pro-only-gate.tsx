/**
 * <ProOnlyGate> — drop-in wrapper that hides children from free users and
 * shows an upgrade paywall instead.
 *
 * Accepts ANY paid tier:
 *   - trial    (KES 99, 24h access)
 *   - basic    (KES 99, alias)
 *   - monthly  (KES 1,000, 30 days)
 *   - yearly   (KES 4,500, 360 days)
 *   - pro / pro_referral (admin-granted)
 *
 * Admins and the `isAdminBypass` flag both pass automatically because the
 * server already returns planId="pro" for them via /api/user/plan.
 *
 * 2026-06: built when founder asked to gate the Canada hub behind Pro.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Sparkles, CheckCircle2, Loader2, ArrowRight, Zap, Crown } from "lucide-react";

const PAID_TIERS = new Set(["trial", "basic", "monthly", "yearly", "pro", "pro_referral"]);

interface ProOnlyGateProps {
  /** What's being gated — used in the paywall headline. */
  featureName: string;
  /** Short pitch for why this feature is worth paying for. */
  pitch: string;
  /** Bullet points showing what's behind the wall (3-5). */
  bullets: string[];
  /** Optional path users land on after upgrading. Defaults to current URL. */
  returnTo?: string;
  /** Content shown to Pro users. */
  children: React.ReactNode;
}

export function ProOnlyGate({ featureName, pitch, bullets, returnTo, children }: ProOnlyGateProps) {
  const { user } = useAuth();

  const { data: plan, isLoading } = useQuery<{ planId: string } | null>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
    // Refetch on focus so a fresh-paid user sees the unlock immediately
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  // While we check, show a tiny spinner instead of flashing the paywall at a
  // paid user (which would look wrong and trigger support tickets).
  if (user && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const planId = (plan?.planId || "free").toLowerCase();
  const isPaid = PAID_TIERS.has(planId);

  if (isPaid) {
    return <>{children}</>;
  }

  // ── Paywall ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="bg-gradient-to-br from-red-600 via-rose-600 to-red-700 text-white">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-4 w-4" />
            <Badge className="bg-white/20 text-white border-0">Pro feature</Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">{featureName}</h1>
          <p className="text-sm md:text-base text-red-50 max-w-xl">{pitch}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* What you unlock */}
        <Card>
          <CardContent className="p-5">
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-red-600" /> What you unlock
            </h2>
            <ul className="space-y-2">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Three pricing tiers — same as /pricing page */}
        <div>
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-600" /> Pick a plan that fits
          </h2>
          <div className="grid md:grid-cols-3 gap-3">
            <Card className="border-2 hover:border-blue-300 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-4 w-4 text-blue-600" />
                  <div className="font-bold text-sm">24-hour Trial</div>
                </div>
                <div className="text-2xl font-bold tabular-nums">KES 99</div>
                <div className="text-[11px] text-muted-foreground mb-3">Full access for 24 hours</div>
                <ul className="text-xs space-y-1 mb-3">
                  <li>✓ All Pro features</li>
                  <li>✓ Canada Express Entry hub</li>
                  <li>✓ Test before committing</li>
                </ul>
                <Link href={`/pricing${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ""}`}>
                  <Button size="sm" variant="outline" className="w-full">Start trial</Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-2 border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-950/20 relative">
              <Badge className="absolute -top-2 left-3 bg-red-600 text-white text-[10px]">Most popular</Badge>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-4 w-4 text-red-600" />
                  <div className="font-bold text-sm">Monthly</div>
                </div>
                <div className="text-2xl font-bold tabular-nums">KES 1,000</div>
                <div className="text-[11px] text-muted-foreground mb-3">30 days of access</div>
                <ul className="text-xs space-y-1 mb-3">
                  <li>✓ All Pro features</li>
                  <li>✓ Canada Express Entry hub</li>
                  <li>✓ Country journey roadmaps</li>
                  <li>✓ AI mock interviews</li>
                </ul>
                <Link href={`/pricing${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ""}`}>
                  <Button size="sm" className="w-full bg-red-600 hover:bg-red-700 text-white">Get monthly</Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-2 border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="h-4 w-4 text-amber-600" />
                  <div className="font-bold text-sm">Yearly</div>
                </div>
                <div className="text-2xl font-bold tabular-nums">KES 4,500</div>
                <div className="text-[11px] text-muted-foreground mb-3">360 days · best value</div>
                <ul className="text-xs space-y-1 mb-3">
                  <li>✓ Everything in monthly</li>
                  <li>✓ Save KES 7,500 vs monthly</li>
                  <li>✓ Priority support</li>
                </ul>
                <Link href={`/pricing${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ""}`}>
                  <Button size="sm" variant="outline" className="w-full border-amber-500 text-amber-700 hover:bg-amber-100">
                    Get yearly
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-2 border-dashed">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex-1">
              <div className="font-bold text-sm">Ready to unlock?</div>
              <p className="text-xs text-muted-foreground">
                One payment, instant access. Pay via M-Pesa STK push — done in 60 seconds.
              </p>
            </div>
            <Link href={`/pricing${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ""}`}>
              <Button className="bg-red-600 hover:bg-red-700 text-white shrink-0">
                See all plans <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
