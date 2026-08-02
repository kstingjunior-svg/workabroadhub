import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { fetchCsrfToken } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

const INTERVAL_MS = 60_000; // heartbeat cadence — every 60 seconds

/**
 * Two complementary signals sent to the server:
 *
 * 1. POST /api/heartbeat  — fires every 60 s + on tab focus.
 *    Refreshes the session TTL, updates users.last_seen / is_online,
 *    and upserts the active_sessions row with the current page.
 *
 * 2. POST /api/track { page }  — fires immediately on every route change.
 *    Only updates active_sessions.current_page so the admin dashboard
 *    sees the real-time page without waiting for the next heartbeat.
 */
export function useHeartbeat(): void {
  const [location] = useLocation();
  const { user } = useAuth();
  const locationRef = useRef(location);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Keep ref current so the interval always reads the latest page ──────────
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // ── Heartbeat — periodic, keeps session alive ──────────────────────────────
  useEffect(() => {
    async function ping() {
      if (document.visibilityState !== "visible") return;
      try {
        const csrf = await fetchCsrfToken();
        await fetch("/api/heartbeat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          },
          body: JSON.stringify({ page: locationRef.current }),
          credentials: "include",
        });
      } catch {
        // non-fatal
      }
    }

    ping();
    timer.current = setInterval(ping, INTERVAL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") ping();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // ── Page tracker — fires instantly on every navigation ────────────────────
  useEffect(() => {
    async function track() {
      try {
        const csrf = await fetchCsrfToken();
        await fetch("/api/track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          },
          body: JSON.stringify({ page: location }),
          credentials: "include",
        });
      } catch {
        // non-fatal
      }
    }

    track();
  }, [location]);

  // ── Live presence — fires every 30 s, updates live_users table ─────────────
  // 2026-08 (Tony): reduced from 5 s → 30 s. Presence is a "who's online now"
  // signal — 30-second freshness is fine. 5-second polling was hammering the
  // DB (one write per user every 5 s × N users), draining Kenyan mobile
  // batteries, and wasted M-Pesa/Nano compute for no user benefit. The DB
  // presence widget already has a 5-minute cutoff, so a slightly stale entry
  // isn't user-visible.
  useEffect(() => {
    if (!user?.id) return;

    const liveTimer = setInterval(async () => {
      try {
        const csrf = await fetchCsrfToken();
        await fetch("/api/track-live", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          },
          body: JSON.stringify({ userId: user.id, page: window.location.pathname }),
          credentials: "include",
        });
      } catch {
        // non-fatal
      }
    }, 30_000);

    return () => clearInterval(liveTimer);
  }, [user?.id]);
}
