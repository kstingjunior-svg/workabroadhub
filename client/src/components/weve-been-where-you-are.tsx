/**
 * "We've been where you are" trust section.
 *
 * Sits on the landing page and on the dashboard below the founder note. The
 * point isn't to sell — it's to establish that this was built by people who
 * went through the same nonsense as the visitor.
 *
 * 2026-06: added during the app-wide voice humanization pass.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Heart, Sparkles } from "lucide-react";

export function WeveBeenWhereYouAre() {
  return (
    <Card className="mb-4 border-2 border-amber-200 dark:border-amber-800/60 bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-red-50/30 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-red-950/10">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="h-4 w-4 text-rose-600" />
          <span className="text-[10px] uppercase tracking-wider font-bold text-rose-700 dark:text-rose-300">
            We've been where you are
          </span>
        </div>
        <h3 className="text-lg font-bold mb-3 leading-tight">
          We started this because we got tired of all of it.
        </h3>
        <ul className="text-sm text-foreground/80 space-y-1.5 mb-3 leading-relaxed">
          <li>— Paying brokers for information we could find ourselves.</li>
          <li>— Getting ghosted after handing over a "facilitation fee."</li>
          <li>— Lying awake wondering if we were doing the right thing.</li>
        </ul>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          So we built the guide we wish we'd had. Every fee, every form, every
          mistake — we've made them <em>so you don't have to</em>.
        </p>
        <div className="text-xs text-muted-foreground italic flex items-start gap-1.5">
          <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-amber-600" />
          <span>
            — The WorkAbroad Hub team · Built in Nairobi · 9 countries covered ·
            1,200+ Kenyans helped (and counting)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Small "honest mistake" line — drop into the fees breakdown or
 * passport section so visitors see a candid moment of admission.
 */
export function HonestMistakeLine() {
  return (
    <div className="text-xs italic text-foreground/70 border-l-2 border-amber-400 pl-3 py-1 my-3">
      <strong className="not-italic text-foreground">Honest mistake we made:</strong>{" "}
      we paid KES 5,000 for a "police clearance" through a broker that we could've
      done ourselves at the DCI for KES 1,050. That's the kind of thing we
      flag on every page from here on.
    </div>
  );
}
