/**
 * Dashboard widget — "Practice your interview" CTA. Sits below the salary
 * teaser, leads users into the mock interview flow.
 *
 * 2026-06 retention #3.
 */
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, ArrowRight } from "lucide-react";

export function DashboardInterviewCard() {
  return (
    <Link href="/interview">
      <Card
        className="mb-4 cursor-pointer hover:shadow-md transition-all overflow-hidden bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 border-indigo-200 dark:border-indigo-900"
        data-testid="card-interview"
      >
        <CardContent className="p-4 flex items-center gap-3">
          <div className="shrink-0 p-2.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
            <Mic className="h-5 w-5 text-indigo-700 dark:text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm mb-0.5">Practice your interview · 5 questions</div>
            <div className="text-xs text-muted-foreground line-clamp-2">
              AI plays the interviewer, scores your answers, and tells you exactly what to improve.
              Speak or type — your call.
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}
