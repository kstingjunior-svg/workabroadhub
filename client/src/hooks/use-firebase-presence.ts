import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ref, set, update, onValue, onDisconnect, serverTimestamp,
  push, query, orderByChild, limitToLast, remove,
} from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useInactivityTimer } from "@/hooks/use-inactivity-timer";

export interface ActiveVisitor {
  id: string;
  country: string;
  city: string;
  region: string;
  joined: number;
  currentPage?: string;
}

export interface RecentSignup {
  id: string;
  type: "signup" | "upgrade";
  location: string;
  joined: number;
}

interface GeoData {
  country: string;
  city: string;
  region: string;
}

const PAGE_NAMES: Record<string, string> = {
  "/": "Home",
  "/nea-agencies": "NEA Agencies",
  "/jobs": "Job Listings",
  "/visa-guides": "Visa Guides",
  "/pricing": "Pricing",
  "/dashboard": "Dashboard",
  "/admin": "Admin",
  "/profile": "Profile",
  "/scam-alerts": "Scam Alerts",
};

function friendlyPage(path: string): string {
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  const segment = path.split("/")[1];
  if (!segment) return "Home";
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

async function fetchGeo(): Promise<GeoData> {
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    return {
      country: data.country_name || "Kenya",
      city: data.city || "Nairobi",
      region: data.region || "",
    };
  } catch {
    return { country: "Kenya", city: "Nairobi", region: "" };
  }
}

export function useFirebasePresence() {
  const [location] = useLocation();
  const [activeVisitors, setActiveVisitors] = useState<number | null>(null);
  const [visitorList, setVisitorList] = useState<ActiveVisitor[]>([]);
  const [recentSignups, setRecentSignups] = useState<RecentSignup[]>([]);
  const [sessionExpired, setSessionExpired] = useState(false);
  const myIdRef = useRef<string>(Math.random().toString(36).slice(2));
  const readyRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Called by the inactivity timer after 30 minutes of no activity.
  // Removes this visitor from Firebase and stops the heartbeat —
  // matching: visitorsRef.remove() + alert('Session ended...')
  const handleIdle = useCallback(() => {
    const visitorRef = ref(rtdb, `activeVisitors/${myIdRef.current}`);
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    remove(visitorRef).catch(() => {});
    setSessionExpired(true);
    console.info("[Firebase] Visitor removed — idle for 30 minutes.");
  }, []);

  useInactivityTimer({ onIdle: handleIdle, enabled: true });

  useEffect(() => {
    const visitorId = myIdRef.current;
    const visitorRef = ref(rtdb, `activeVisitors/${visitorId}`);
    let unsubVisitors: (() => void) | null = null;
    let unsubSignups: (() => void) | null = null;

    async function init() {
      try {
        const geo = await fetchGeo();

        const initialData = {
          id: visitorId,
          country: geo.country,
          city: geo.city,
          region: geo.region,
          currentPage: friendlyPage(location),
          joined: Date.now(),
          lastSeen: serverTimestamp(),
        };

        await set(visitorRef, initialData);
        onDisconnect(visitorRef).remove();
        readyRef.current = true;

        heartbeatRef.current = setInterval(() => {
          update(visitorRef, {
            joined: Date.now(),
            lastSeen: serverTimestamp(),
          }).catch(() => {});
        }, 30_000);

        const visitorsListRef = ref(rtdb, "activeVisitors");
        unsubVisitors = onValue(visitorsListRef, (snapshot) => {
          const val = snapshot.val() as Record<string, ActiveVisitor & { joined: number }> | null;
          if (val) {
            const cutoff = Date.now() - 5 * 60 * 1000;
            const active = Object.entries(val)
              .filter(([, v]) => v.joined > cutoff)
              .map(([id, v]) => ({
                id,
                country: v.country || "Kenya",
                city: v.city || "",
                region: v.region || "",
                joined: v.joined,
                currentPage: v.currentPage || "Home",
              }))
              .sort((a, b) => a.joined - b.joined);
            setVisitorList(active);
            setActiveVisitors(active.length);
          } else {
            setVisitorList([]);
            setActiveVisitors(1);
          }
        });

        const signupsRef = query(
          ref(rtdb, "signups"),
          orderByChild("joined"),
          limitToLast(8)
        );
        unsubSignups = onValue(signupsRef, (snapshot) => {
          const val = snapshot.val();
          if (val) {
            const items: RecentSignup[] = Object.entries(
              val as Record<string, Omit<RecentSignup, "id">>
            )
              .map(([id, data]) => ({ id, ...data }))
              .sort((a, b) => b.joined - a.joined);
            setRecentSignups(items);
          }
        });
      } catch (err) {
        console.warn("[Firebase] Presence init failed:", err);
      }
    }

    init();

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (unsubVisitors) unsubVisitors();
      if (unsubSignups) unsubSignups();
      remove(visitorRef).catch(() => {});
    };
  }, []);

  // Update currentPage in Firebase whenever the route changes
  useEffect(() => {
    if (!readyRef.current) return;
    const visitorRef = ref(rtdb, `activeVisitors/${myIdRef.current}`);
    update(visitorRef, {
      currentPage: friendlyPage(location),
      lastSeen: serverTimestamp(),
    }).catch(() => {});
  }, [location]);

  return { activeVisitors, visitorList, myVisitorId: myIdRef.current, recentSignups, sessionExpired };
}

export async function pushSignupToFirebase(
  location: string,
  type: "signup" | "upgrade" = "signup"
) {
  try {
    const signupsRef = ref(rtdb, "signups");
    await push(signupsRef, {
      type,
      location,
      joined: Date.now(),
    });
  } catch (err) {
    console.warn("[Firebase] pushSignup failed:", err);
  }
}
