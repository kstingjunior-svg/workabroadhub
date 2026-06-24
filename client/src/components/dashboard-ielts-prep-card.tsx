/**
 * Dashboard IELTS Prep card (Phase 0).
 *
 * 2026-06: lightweight demand-validation surface. Sits on the main
 * dashboard alongside Visa-Sponsored Jobs and Kenya Careers. Click →
 * opens the IeltsInterestModal which captures email + target band +
 * test timing. No commitments, no payment — just signal.
 */
import { useState } from "react";
import { BookOpen, ChevronRight, Sparkles, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { IeltsInterestModal } from "@/components/ielts-interest-modal";

export function DashboardIeltsPrepCard() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  return (
    <>
      <Card
        data-testid="dashboard-ielts-prep-card"
        className="cursor-pointer overflow-hidden border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-amber-900/20 dark:via-gray-900 dark:to-orange-900/20 hover:shadow-md transition-all"
        onClick={() => setOpen(true)}
      >
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                  <BookOpen className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded">
                  Coming soon
                </span>
              </div>

              <h3 className="font-semibold text-base leading-tight">
                IELTS Prep — KES 10,000 <span className="text-xs font-normal text-muted-foreground">(less than ⅓ of the competition)</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Full mock tests, AI essay feedback, personal study plan. Built for Kenyans heading to the UK,
                Canada, Australia, Gulf. Drop your email — we'll notify you the day it launches.
              </p>

              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  10+ full mock tests
                </span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Unlimited essay grading
                </span>
                <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  AI speaking practice
                </span>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>

      <IeltsInterestModal
        open={open}
        onClose={() => setOpen(false)}
        defaultEmail={(user as any)?.email ?? ""}
      />
    </>
  );
}
