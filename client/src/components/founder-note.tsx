/**
 * Founder note — small handwritten-feeling message that sits at the bottom of
 * the dashboard. Always shows a short "built by Kenyans who left Kenya" line.
 *
 * Between 10pm and 5am Kenya time, swaps in a personal late-night PS — the
 * idea is the user is stress-scrolling at 2am and the founder gently shows up.
 * Nobody on a generic dashboard would think to do this.
 *
 * 2026-06: built when humanizing the dashboard copy.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, MessageCircle } from "lucide-react";

// Kenya is UTC+3 year-round. Get the hour in Kenya time regardless of where
// the user actually is.
function getKenyaHour(): number {
  const d = new Date();
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const kenyaMinutes = (utcMinutes + 3 * 60) % (24 * 60);
  return Math.floor(kenyaMinutes / 60);
}

export function FounderNote() {
  const { user } = useAuth();
  const [hour, setHour] = useState<number>(() => getKenyaHour());

  // Re-check hour every minute so the late-night PS appears/disappears
  // without a full page refresh.
  useEffect(() => {
    const id = setInterval(() => setHour(getKenyaHour()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isLateNight = hour >= 22 || hour < 5;
  const firstName = (user as any)?.firstName?.split(" ")?.[0] || "";

  return (
    <div className="mt-8 mb-4 space-y-3">
      {/* Always-on founder note */}
      <Card className="border-dashed border-2 bg-gradient-to-br from-amber-50/40 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <MessageCircle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <p className="leading-relaxed">
                Built by Kenyans who left Kenya, came back, and watched friends
                get burnt by every shortcut in this business. Stuck on something
                or just want to chat? Tap the chat icon at the bottom right — that's
                me <span className="font-bold">Tony</span> 👋
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                — Tony Mulaa &amp; the WorkAbroad Hub team, Nairobi
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Late-night PS — only between 10pm and 5am Kenya time */}
      {isLateNight && (
        <Card className="border-2 border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50/40 to-purple-50/30 dark:from-indigo-950/30 dark:to-purple-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                <Heart className="h-4 w-4 text-indigo-700 dark:text-indigo-300" />
              </div>
              <div className="flex-1 text-sm leading-relaxed italic">
                <strong className="not-italic">P.S.</strong> — if you're reading
                this at {hour < 12 ? "this hour" : "2am"} because you can't sleep
                thinking about all of it{firstName ? `, ${firstName}` : ""}, take
                a breath. You're already doing the hardest part. Tomorrow morning,
                do one small thing on your list. Just one.
                <div className="not-italic text-xs text-muted-foreground mt-2">— Tony</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
