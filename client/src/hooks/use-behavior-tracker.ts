// ─────────────────────────────────────────────────────────────────────────────
// useBehaviorTracker — passive site-wide navigation + dwell-time logger.
//
// Every wouter route change is sent to /api/track-event with the page path,
// previous page, and dwell-time on the previous page. The server persists
// these into funnel_events. Later, /api/me/recent-activity reads them so
// Nanjila can answer questions like:
//   "I see you were checking Australia portals 3 minutes ago — want help?"
//
// Designed to be cheap and non-blocking:
//   • Uses navigator.sendBeacon when available (survives page unload)
//   • Falls back to fetch with keepalive
//   • Throttled: max 1 ping per route change, ignores < 500ms revisits
//   • No PII — just route + dwell + a session id from localStorage
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

const SESSION_KEY = "wah:beh-session-id";
const API = "/api/track-event";

function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return `s_${Date.now().toString(36)}_anon`;
  }
}

function emit(payload: Record<string, unknown>): void {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(API, blob);
      return;
    }
    void fetch(API, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
    });
  } catch {
    // swallow — analytics must never crash the app
  }
}

export function useBehaviorTracker(): void {
  const [location] = useLocation();
  const sessionId = useRef<string>("");
  const lastPath = useRef<string | null>(null);
  const lastEnterAt = useRef<number>(0);

  // Initialise the session id once.
  useEffect(() => {
    sessionId.current = getOrCreateSessionId();
  }, []);

  // Page-change ping.
  useEffect(() => {
    if (!sessionId.current) return;
    const now = Date.now();

    // Ignore microsecond-level revisits (often React strict-mode double mounts).
    if (lastPath.current === location && now - lastEnterAt.current < 500) return;

    const dwellMs = lastPath.current ? now - lastEnterAt.current : 0;
    emit({
      event:    "page_view",
      page:     location,
      metadata: {
        sessionId: sessionId.current,
        prev:      lastPath.current,
        dwellMs,
        referrer:  typeof document !== "undefined" ? document.referrer : "",
        ts:        new Date().toISOString(),
      },
    });

    lastPath.current = location;
    lastEnterAt.current = now;
  }, [location]);

  // On unload, send a final dwell event for the current page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnload = () => {
      if (!lastPath.current) return;
      emit({
        event:    "page_leave",
        page:     lastPath.current,
        metadata: {
          sessionId: sessionId.current,
          dwellMs:   Date.now() - lastEnterAt.current,
        },
      });
    };
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);
}
