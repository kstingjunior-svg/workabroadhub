/**
 * Firebase RTDB — Real-Time Presence & Live Stats
 *
 * Schema (RTDB):
 *   activeVisitors/{visitorId}
 *     initial    : string  (first letter of firstName)
 *     firstName  : string
 *     lastSeen   : number  (server timestamp)
 *
 *   signups/{pushId}
 *     type       : "signup" | "upgrade"
 *     firstName  : string
 *     location   : string
 *     destination: string
 *     joined     : number
 */

import {
  ref,
  set,
  remove,
  onValue,
  off,
  serverTimestamp,
  query,
  orderByChild,
  limitToLast,
  onDisconnect,
} from "firebase/database";
import { rtdb } from "./firebase";
import { useEffect, useState, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveVisitor {
  id: string;
  initial: string;
  firstName: string;
  lastSeen: number;
}

export interface RecentSignup {
  id: string;
  firstName: string;
  location: string;
  destination?: string;
  joined: number;
  type: "signup" | "upgrade";
}

// ─── Presence Tracking ────────────────────────────────────────────────────────

// 5-minute activity window — matches useFirebasePresence in use-firebase-presence.ts
const STALE_MS = 5 * 60 * 1000;

let _presenceId: string | null = null;

export function trackPresence(userId: string | number, firstName: string) {
  // Stable ID derived from userId — same user in multiple tabs reuses the same
  // activeVisitors slot instead of creating a duplicate entry per tab.
  const id = `user_${userId}`;
  _presenceId = id;

  const visitorRef = ref(rtdb, `activeVisitors/${id}`);
  const connRef = ref(rtdb, ".info/connected");

  const makeEntry = () => ({
    initial:   (firstName || "?").charAt(0).toUpperCase(),
    firstName: firstName || "Member",
    // Write both `joined` AND `lastSeen` so the entry is visible to BOTH
    // the dashboard hooks (filter by lastSeen) and the landing page hook
    // (filter by joined). Without `joined`, this user is invisible to the
    // landing page counter, and vice-versa.
    joined:    Date.now(),
    lastSeen:  serverTimestamp(),
  });

  const handler = (snap: any) => {
    if (!snap.val()) return;
    set(visitorRef, makeEntry());
    onDisconnect(visitorRef).remove();
  };

  onValue(connRef, handler);

  // Heartbeat every 30 s to stay "active" — refreshes both timestamps
  const heartbeat = setInterval(() => {
    set(visitorRef, makeEntry()).catch(() => {});
  }, 30_000);

  return () => {
    clearInterval(heartbeat);
    off(connRef, "value", handler);
    if (_presenceId === id) {
      remove(visitorRef).catch(() => {});
      _presenceId = null;
    }
  };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useActiveVisitors(): ActiveVisitor[] {
  const [visitors, setVisitors] = useState<ActiveVisitor[]>([]);

  useEffect(() => {
    const visitorsRef = ref(rtdb, "activeVisitors");

    const unsub = onValue(visitorsRef, (snap) => {
      const raw = snap.val() || {};
      const now = Date.now();
      const list: ActiveVisitor[] = Object.entries(raw)
        .map(([id, v]: [string, any]) => ({
          id,
          // Support both schemas:
          // - trackPresence() writes: { initial, firstName, joined, lastSeen }
          // - useFirebasePresence() writes: { country, city, region, currentPage, joined, lastSeen }
          initial:   v.initial   || (v.country?.[0] ?? "?"),
          firstName: v.firstName || v.country || "Visitor",
          lastSeen:  v.lastSeen  || v.joined  || 0,
          joined:    v.joined    || v.lastSeen || 0,
        }))
        // Accept entry if EITHER timestamp is within the 5-minute window
        .filter((v) => {
          const ts = Math.max(v.joined || 0, v.lastSeen || 0);
          return !ts || now - ts < STALE_MS;
        });
      setVisitors(list);
    });

    return () => off(visitorsRef, "value", unsub as any);
  }, []);

  return visitors;
}

export function useRecentSignups(limit = 5): RecentSignup[] {
  const [signups, setSignups] = useState<RecentSignup[]>([]);

  useEffect(() => {
    const signupsRef = query(
      ref(rtdb, "signups"),
      orderByChild("joined"),
      limitToLast(limit)
    );

    const unsub = onValue(signupsRef, (snap) => {
      const raw = snap.val() || {};
      const list: RecentSignup[] = Object.entries(raw)
        .map(([id, v]: [string, any]) => ({ id, ...v }))
        .sort((a, b) => (b.joined || 0) - (a.joined || 0))
        .slice(0, limit);
      setSignups(list);
    });

    return () => off(signupsRef as any, "value", unsub as any);
  }, [limit]);

  return signups;
}

/**
 * Returns the real registered-user count from the PostgreSQL stats API.
 * Replaced the old Firebase `signups.numChildren()` count which counted all
 * signup + upgrade events (not unique users) and grew unboundedly.
 */
export function useTotalMembers(): number {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/stats")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && typeof data?.totalUsers === "number") {
          setTotal(data.totalUsers);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return total;
}

export function useLatestSignupFeed(): string {
  const [feed, setFeed] = useState("Welcome to WorkAbroad Hub");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    const signupsRef = query(
      ref(rtdb, "signups"),
      orderByChild("joined"),
      limitToLast(1)
    );

    const unsub = onValue(signupsRef, (snap) => {
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
      }
      const raw = snap.val() || {};
      const entries = Object.values(raw) as any[];
      if (entries.length === 0) return;

      const latest = entries[0];
      const name = latest.firstName || "Someone";
      const loc = latest.location || "Kenya";
      const dest = latest.destination || "abroad";

      setFeed(`${name} from ${loc} just joined — looking for work ${dest}`);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setFeed("Welcome to WorkAbroad Hub");
      }, 30_000);
    });

    return () => {
      off(signupsRef as any, "value", unsub as any);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return feed;
}
