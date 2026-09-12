/**
 * Dashboard IELTS Prep card — Phase 1 (2026-09).
 *
 * 2026-06: started as a "Coming soon" demand-validation card (opened
 * IeltsInterestModal, just captured an email).
 * 2026-09: the real product shipped — AI Writing feedback + one full
 * Reading mock test, gated behind a KES 10,000 one-time unlock. This card
 * now links straight to the /ielts-prep hub instead of the waitlist modal.
 *
 * Copy deliberately matches what v1 actually ships (see server/seed.ts's
 * ielts_prep row) — NOT the old "10+ full mock tests / AI speaking
 * practice" pitch from the waitlist era, which would overclaim.
 */
import { Link } from "wouter";
import { BookOpen, ChevronRight, Sparkles, ClipboardCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function DashboardIeltsPrepCard() {
  return (
    <Link href="/ielts-prep">
      <Card
        data-testid="dashboard-ielts-prep-card"
        className="cursor-pointer overflow-hidden border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-amber-900/20 dark:via-gray-900 dark:to-orange-900/20 hover:shadow-md transition-all"
      >
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                  <BookOpen className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                  New
                </span>
              </div>

              <h3 className="font-semibold text-base leading-tight">
                IELTS Prep — KES 10,000 <span className="text-xs font-normal text-muted-foreground">one-time</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                AI-graded Writing feedback (band scores + detailed comments) and a full-length Reading mock test with
                instant scoring. Built for Kenyans heading to the UK, Canada, Australia, Gulf.
              </p>

              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Unlimited Writing grading
                </span>
                <span className="flex items-center gap-1">
                  <ClipboardCheck className="h-3 w-3" />
                  Reading mock test
                </span>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
