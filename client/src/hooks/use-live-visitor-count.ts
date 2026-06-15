/**
 * useLiveVisitorCount — one number, one source of truth, every surface.
 *
 * Opens the public /ws/presence-count WebSocket and yields the live count of
 * distinct browsers currently on the site (anonymous + authenticated). Used
 * by the landing page banner AND the home dashboard "online now" widget so
 * both screens always show the EXACT same number.
 *
 * Deduplication: each browser is identified by a UUID stored in
 * localStorage("visitorId") so multiple tabs from the same user count as
 * 1 visitor. Cleared by the browser only when the user clears site data.
 *
 * Disconnection is immediate — when the user closes the tab, the WebSocket
 * close event fires server-side and the count decrements within 200 ms (the
 * server's coalesce window). No 30-second polling lag, no "ghost online"
 * leftovers.
 */
import { useEffect, useState } from "react";

const VISITOR_ID_KEY = "wah_visitor_id";

function getOrCreateVisitorId(): string {
  try {
    let v = localStorage.getItem(VISITOR_ID_KEY);
    if (v && v.length >= 8) return v;
    // Generate a stable per-browser UUID
    v = (crypto.randomUUID?.() ?? (Math.random().toString(36).slice(2) + Date.now().toString(36)));
    localStorage.setItem(VISITOR_ID_KEY, v);
    return v;
  } catch {
    // Private mode / storage disabled — fall back to per-session UUID
    return `transient-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

export function useLiveVisitorCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const visitorId = getOrCreateVisitorId();
    const proto = window.location.protocol === "https:" ? "wss" : "ws";

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closedIntentionally = false;

    function connect() {
      try {
        ws = new WebSocket(`${proto}://${window.location.host}/ws/presence-count`);
      } catch {
        // WebSocket constructor itself threw — retry in 5s
        reconnectTimer = window.setTimeout(connect, 5000);
        return;
      }

      ws.onopen = () => {
        try { ws?.send(JSON.stringify({ type: "identify", visitorId })); } catch { /* ignore */ }
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg?.type === "presence_count" && typeof msg.total === "number") {
            setCount(msg.total);
          }
        } catch { /* malformed */ }
      };
      ws.onclose = () => {
        if (closedIntentionally) return;
        // Auto-reconnect with a small backoff so flaky 3G doesn't lose the
        // counter for the rest of the session
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, 5000);
      };
      ws.onerror = () => { /* close handler will reconnect */ };
    }

    connect();
    return () => {
      closedIntentionally = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      try { ws?.close(); } catch { /* ignore */ }
    };
  }, []);

  return count;
}
