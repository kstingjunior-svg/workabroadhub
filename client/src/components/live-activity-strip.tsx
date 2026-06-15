/**
 * Compact live activity strip — shows online count + total registered members.
 *
 * 2026-06: subscribes to /ws/presence-count (the public real-time presence
 * channel). The number updates the instant any browser joins or leaves —
 * authenticated users AND anonymous landing-page visitors are all counted.
 * Landing page banner and this widget read from the SAME source, so the
 * two screens always show the EXACT same number.
 */
import { useQuery } from "@tanstack/react-query";
import { Users, Wifi } from "lucide-react";
import { useLiveVisitorCount } from "@/hooks/use-live-visitor-count";

interface PublicStats {
  totalUsers: number;
  activeNow: number;
  activeAuthenticated: number;
}

export function LiveActivityStrip() {
  const { data } = useQuery<PublicStats>({
    queryKey: ["/api/public/stats"],
    queryFn: async () => {
      const res = await fetch("/api/public/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load live stats");
      return res.json();
    },
    refetchInterval: 60_000, // backup poll only — WS push is the live source
    staleTime: 30_000,
  });

  const liveOnline = useLiveVisitorCount();

  // Prefer the live WebSocket count; fall back to REST snapshot only until
  // the first message arrives (typically <200ms).
  const online = liveOnline ?? data?.activeNow ?? 0;
  const total = data?.totalUsers ?? 0;

  // Show even before first load — gives the bar a stable height so the page
  // doesn't jump when stats arrive. We just hide the numbers until ready.
  return (
    <div
      className="mb-3 flex items-center justify-between gap-2 rounded-full border border-border bg-card/60 backdrop-blur-sm px-3 py-1.5 text-[11px] sm:text-xs"
      data-testid="live-activity-strip"
    >
      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
        <span className="relative inline-flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
        </span>
        <Wifi className="h-3 w-3" />
        <span className="font-semibold">
          {online > 0 ? online.toLocaleString() : "—"}
        </span>
        <span className="text-muted-foreground">online now</span>
      </div>

      <div className="hidden sm:block h-3 w-px bg-border" />

      <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
        <Users className="h-3 w-3" />
        <span className="font-semibold">
          {total > 0 ? total.toLocaleString() : "—"}
        </span>
        <span className="text-muted-foreground">members registered</span>
      </div>
    </div>
  );
}
