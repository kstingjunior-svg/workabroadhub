/**
 * GlobalPlanListener — mounted once at the app root.
 *
 * Opens a /ws/user WebSocket whenever a user is logged in and listens for
 * server-pushed `plan_activated` events. When one fires, every plan-related
 * React Query cache key is invalidated so the user's UI updates instantly:
 * locked job widgets unlock, the Pro upsell card disappears, paid services
 * become accessible — all without a refresh.
 *
 * 2026-06: built after a manual admin grant didn't take effect for the user
 * because (a) the /api/auth/user server cache was stale, (b) the dashboard
 * only polls /api/user/plan every 2 min. This listener short-circuits both
 * by reacting to the WebSocket push the server emits right after the grant.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function GlobalPlanListener() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const userId = (user as any)?.id;
    if (!userId) {
      // No user — make sure any prior socket is closed and we don't try to
      // reconnect to a stale identity.
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      return;
    }

    let closedIntentionally = false;

    function connect() {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/user`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "identify", userId }));
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "plan_activated") {
            // Wipe every plan-sensitive cache so the UI re-reads fresh state.
            queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            queryClient.invalidateQueries({ queryKey: ["/api/user/plan"] });
            queryClient.invalidateQueries({ queryKey: ["/api/user/services"] });
            queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
            queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

            const planLabel = msg.planId
              ? String(msg.planId).charAt(0).toUpperCase() + String(msg.planId).slice(1)
              : "Pro";
            toast({
              title: `${planLabel} plan activated`,
              description: "All your Pro features are now unlocked. Welcome aboard!",
              duration: 8000,
            });
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (closedIntentionally) return;
        // Auto-reconnect with a small backoff so flaky 3G doesn't lose the
        // realtime channel for the rest of the session.
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = window.setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        // The close handler will fire next; reconnect is wired there.
      };
    }

    connect();

    return () => {
      closedIntentionally = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
    };
  }, [(user as any)?.id, queryClient, toast]);

  return null;
}
