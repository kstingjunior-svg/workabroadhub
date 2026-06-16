/**
 * Dashboard widget — Canada Express Entry hub teaser.
 *
 * Always rendered (Canada is a high-demand destination for our audience).
 * Rotates between three teaser angles based on day-of-week so returning users
 * see varied copy:
 *   - CRS calculator angle
 *   - Job portals angle
 *   - Cost/fees angle
 *
 * 2026-06: built in response to user demand for production Canada feature.
 */
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Calculator, Briefcase, Coins, ArrowRight, Sparkles } from "lucide-react";

// 2026-06: copy rewritten to sound human and Kenyan. No "AI", no
// "algorithm", no "generated". We talk like we've been through it,
// because we have.
const ANGLES = [
  {
    icon: Calculator,
    badge: "We've been there 🇨🇦",
    title: "Will Canada actually accept you?",
    body: "Two minutes with our score check tells you where you stand and exactly what to fix. Same math the Canadian government uses — we just made it less painful to figure out.",
    cta: "Check my score",
    href: "/canada/crs",
  },
  {
    icon: Briefcase,
    badge: "The job bank nobody told you about",
    title: "Canadian employers willing to sponsor you",
    body: "Canada's own government job board lets you filter for employers who already have permission to hire foreigners. We added 13 more boards too — the ones our community actually got hired through.",
    cta: "Open the list",
    href: "/canada/jobs",
  },
  {
    icon: Coins,
    badge: "We counted every shilling 💸",
    title: "How much does Canada PR really cost?",
    body: "The agencies tell you \"around 2,000 CAD.\" Then you actually start — IELTS, ECA, medicals, police clearance, biometrics. We tracked it all the first time so you can see it in KES, upfront.",
    cta: "Show me the receipts",
    href: "/canada",
  },
];

export function DashboardCanadaCard() {
  // Rotate based on day-of-year for a stable but daily-changing pick
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400_000);
  const angle = ANGLES[dayOfYear % ANGLES.length];
  const Icon = angle.icon;

  return (
    <Link href={angle.href}>
      <Card
        className="mb-4 cursor-pointer hover:shadow-md transition-all overflow-hidden border-2 border-red-200 dark:border-red-800/60 bg-gradient-to-br from-red-50/60 to-rose-50/40 dark:from-red-950/30 dark:to-rose-950/20"
        data-testid="card-canada-teaser"
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-full bg-red-600/10 shrink-0">
              <Icon className="h-5 w-5 text-red-700 dark:text-red-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] uppercase tracking-wider font-bold text-red-700 dark:text-red-300">
                  {angle.badge}
                </span>
                <Sparkles className="h-3 w-3 text-red-600" />
              </div>
              <div className="font-bold text-sm leading-tight">{angle.title}</div>
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{angle.body}</div>
              <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-red-700 dark:text-red-300">
                {angle.cta} <ArrowRight className="h-3 w-3" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
