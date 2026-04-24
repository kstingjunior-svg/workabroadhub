import { useState, useEffect, useRef, useCallback } from "react";
import { TrendingUp, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface ActivityEvent {
  id: number;
  type: "signup" | "upgrade";
  location: string | null;
  createdAt: string;
}

function buildMessage(event: ActivityEvent): string {
  if (event.type === "upgrade") {
    return event.location
      ? `A user from ${event.location} just upgraded to Pro`
      : "A user just upgraded to Pro";
  }
  return event.location
    ? `A new user from ${event.location} just signed up`
    : "A new user just signed up";
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const SHOW_DELAY_MS = 4000;
const DISPLAY_MS = 6000;
const CYCLE_MS = 12000;

interface LiveActivityFeedProps {
  className?: string;
  inline?: boolean;
}

export function LiveActivityFeed({ className, inline = false }: LiveActivityFeedProps) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const [age, setAge] = useState("");
  const cycleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ageRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();

  const { data: events } = useQuery<ActivityEvent[]>({
    queryKey: ["/api/notifications/recent"],
    staleTime: 0,
    refetchInterval: 30_000,
  });

  const pool = events && events.length > 0 ? events : null;

  // ── Real-time WebSocket push ──────────────────────────────────────────────
  // When a new_user or payment_confirmed event arrives, invalidate the pool
  // immediately so the brand-new event appears at the top without waiting 30s.
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/ws/analytics`;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "new_user" || msg.type === "payment_confirmed") {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications/recent"] });
          }
        } catch {}
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 5000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [queryClient]);

  // ── Start cycling after initial delay ─────────────────────────────────────
  useEffect(() => {
    if (!pool) return;
    const t = setTimeout(() => setStarted(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [!!pool]);

  // ── Show / hide / advance cycle ───────────────────────────────────────────
  useEffect(() => {
    if (!started || !pool) return;
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), DISPLAY_MS);
    cycleRef.current = setTimeout(() => {
      setIdx((i) => (i + 1) % pool.length);
    }, CYCLE_MS);
    return () => {
      clearTimeout(hide);
      if (cycleRef.current) clearTimeout(cycleRef.current);
    };
  }, [started, idx, pool?.length]);

  // ── Live "X minutes ago" ticker ───────────────────────────────────────────
  const currentEvent = pool ? pool[idx % pool.length] : null;
  useEffect(() => {
    if (!currentEvent) return;
    setAge(timeAgo(currentEvent.createdAt));
    if (ageRef.current) clearInterval(ageRef.current);
    ageRef.current = setInterval(() => {
      setAge(timeAgo(currentEvent.createdAt));
    }, 30_000);
    return () => { if (ageRef.current) clearInterval(ageRef.current); };
  }, [currentEvent?.id, currentEvent?.createdAt]);

  if (!started || !pool || !currentEvent) return null;

  const isUpgrade = currentEvent.type === "upgrade";
  const bg = isUpgrade
    ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800"
    : "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800";
  const color = isUpgrade
    ? "text-amber-700 dark:text-amber-400"
    : "text-green-700 dark:text-green-400";
  const muted = isUpgrade
    ? "text-amber-500 dark:text-amber-600"
    : "text-green-500 dark:text-green-600";
  const Icon = isUpgrade ? TrendingUp : User;

  if (inline) {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all duration-500",
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
          bg,
          className
        )}
        role="status"
        aria-live="polite"
        data-testid="activity-feed-inline"
      >
        <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", color)} aria-hidden="true" />
        <span className={color}>{buildMessage(currentEvent)}</span>
        <span className={cn("ml-auto pl-2 text-[10px] tabular-nums", muted)}>{age}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-24 left-4 z-[var(--z-modal)] max-w-[calc(100vw-2rem)] sm:max-w-xs",
        "flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-xs font-medium",
        "transition-all duration-500 ease-out",
        visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8 pointer-events-none",
        bg,
        className
      )}
      role="status"
      aria-live="polite"
      data-testid="activity-feed-toast"
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", color)} aria-hidden="true" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className={cn(color, "leading-snug")}>{buildMessage(currentEvent)}</span>
        <span className={cn("text-[10px] tabular-nums", muted)}>{age}</span>
      </div>
    </div>
  );
}
