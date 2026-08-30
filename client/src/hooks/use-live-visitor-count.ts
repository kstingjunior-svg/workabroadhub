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
    // 2026-08 FIX (Tony's live audit): if the WS server is unreachable (e.g.
    // Render proxy misconfig), the old fixed 5s retry created 16+ console
    // errors per minute per visitor. Now we exponential-backoff up to 5 min
    // and stop entirely after 10 failed attempts — the "live count" widget
    // just shows nothing rather than spamming errors forever.
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    let openedOnce = false;

    function connect() {
      if (attempts >= MAX_ATTEMPTS) return;
      attempts++;
      try {
        ws = new WebSocket(`${proto}://${window.location.host}/ws/presence-count`);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        openedOnce = true;
        attempts = 0; // reset backoff on successful connect
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
        scheduleReconnect();
      };
      ws.onerror = () => { /* close handler will reconnect */ };
    }

    function scheduleReconnect() {
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      // If we've never successfully opened, back off aggressively — most
      // likely a server-side outage, not flaky 3G. If we DID open before,
      // treat this as a transient hiccup and reconnect faster.
      const base = openedOnce ? 5000 : 15000;
      const delay = Math.min(300000, base * Math.pow(2, Math.max(0, attempts - 1)));
      reconnectTimer = window.setTimeout(connect, delay);
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
