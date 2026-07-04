/**
 * Dashboard Kazi Karibu card.
 *
 * Sits alongside the Kenya Careers card on the main dashboard. Positions
 * Kazi Karibu as the "close to home, start tomorrow" companion to the
 * overseas + Kenya Careers surfaces.
 *
 * Feature-flag aware: if /api/kazi-karibu/posts returns 404 (backend flag
 * off), the card silently doesn't render — safer than showing a dead link.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Home, MapPin, Sparkles, ChevronRight, Briefcase } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function DashboardKaziKaribuCard() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [postCount, setPostCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/kazi-karibu/posts?limit=1", { signal: ac.signal });
        if (res.status === 404) {
          // Feature flag OFF on server → don't render the card.
          if (!cancelled) setAvailable(false);
          return;
        }
        if (!res.ok) return;
        const ct = res.headers.get("content-type") || "";
        if (!ct.toLowerCase().includes("application/json")) return;
        const data = await res.json();
        if (cancelled || !data) return;
        setAvailable(true);
        setPostCount(Number(data.total ?? 0));
      } catch { /* silent — card stays hidden if we can't reach the API */ }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, []);

  // Feature flag OFF or fetch failed → render nothing.
  if (available === false || available === null) return null;

  return (
    <Link href="/kazi-karibu">
      <Card
        data-testid="dashboard-kazi-karibu-card"
        className="cursor-pointer overflow-hidden border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-white via-emerald-50 to-white dark:from-slate-900 dark:via-emerald-900/20 dark:to-slate-900 hover:shadow-md transition-all"
      >
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <Home className="h-4 w-4 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                  New · Nearby
                </span>
              </div>

              <h3 className="font-semibold text-base leading-tight">Kazi Karibu</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Jobs you can start tomorrow — house helps, fundis, cooks, drivers, tutors.
                Free to apply. First post is free too.
              </p>

              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  <strong className="text-foreground">{postCount}</strong> live posts
                </span>
                <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  <Sparkles className="h-3 w-3" />
                  AI-moderated
                </span>
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <MapPin className="h-3 w-3" />
                  Local to you
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
