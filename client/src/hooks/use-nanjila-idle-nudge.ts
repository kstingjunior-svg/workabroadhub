// ─────────────────────────────────────────────────────────────────────────────
// useNanjilaIdleNudge — proactive 10-minute intervention.
//
// User feedback: "if a person spends 10 minutes on the site without deciding
// what they want to do, Nanjila can automatically intervene and ask them,
// how can she help?"
//
// Behaviour:
//   • Resets a 10-minute timer on every user activity (mousemove, click,
//     keydown, touch, scroll, route change).
//   • When the timer expires AND no nudge has fired in this session, opens
//     Nanjila by dispatching a window CustomEvent("nanjila:open") with a
//     context-aware opener message based on the current route.
//   • Skips: when Nanjila is already open, when the user has chatted in
//     this tab, on /admin pages, when the user is mid-checkout.
//   • Once nudged this session, won't fire again. localStorage cooldown of
//     24h to prevent daily annoyance across return visits.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

const IDLE_MS          = 10 * 60 * 1000;        // 10 minutes
const SESSION_NUDGED   = "wah:nanjila-nudged-session";
const LAST_NUDGE_KEY   = "wah:nanjila-last-nudge-at";
const NUDGE_COOLDOWN   = 24 * 60 * 60 * 1000;   // 24h between nudges
const SKIP_PATH_RES    = [/^\/admin/, /^\/payment/, /^\/services\/order\//, /^\/login/, /^\/auth/];
const ACTIVITY_EVENTS  = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];

// Build a route-specific opening message Nanjila will say when she pops up
// proactively. Each one references where the user actually is so it doesn't
// feel like a generic chatbot pop-up — it feels like someone noticed them.
function openerFor(path: string): string {
  if (path.startsWith("/country/")) {
    const slug = path.split("/")[2] || "";
    const name = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/[-_]/g, " ");
    return `Hey — I noticed you've been on the ${name} dashboard for a while. Want me to walk you through how Kenyans actually land jobs there? I can show you the visa pathway, the highest-paying roles, and which portals to apply on first.`;
  }
  if (path.startsWith("/guides/")) {
    return `Hey, I see you're reading through one of our guides — pretty thorough one, that. Quick question: are you most interested in the visa side, the CV/application side, or how to vet the employer? I can save you the scrolling.`;
  }
  if (path.startsWith("/services") || path.startsWith("/pricing")) {
    return `Hey, I saw you looking at services. Mind if I ask what you're trying to fix? Sometimes the right answer isn't the most expensive one — I'd rather point you to a KES 99 CV polish if that's all you need.`;
  }
  if (path.startsWith("/tools/")) {
    return `Quick one — I noticed you're using one of our free tools. If anything's confusing or your result didn't make sense, just tell me what you got and I'll explain plainly.`;
  }
  if (path.startsWith("/nea-agencies") || path.startsWith("/verify-us") || path.startsWith("/report-scam")) {
    return `I see you're checking the agency verification side — smart move. If you have a specific agency name or licence number in mind, paste it and I'll tell you everything I know about them.`;
  }
  if (path === "/" || path.startsWith("/landing")) {
    return `Hey — I've been watching you browse around. I'm Nanjila, the overseas-careers advisor here. What's the actual goal: a job abroad, a CV fix, or you just exploring? Tell me in one line and I'll point you the right way.`;
  }
  return `Hey — I noticed you've been here a while. I'm Nanjila, the advisor on WorkAbroad Hub. Anything I can help you find or figure out? One question is enough to get started.`;
}

export function useNanjilaIdleNudge(): void {
  const [location] = useLocation();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedThisSession = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Hard-skip on routes where a popup would be hostile (mid-checkout etc).
    if (SKIP_PATH_RES.some((re) => re.test(location))) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Session-level latch — once nudged in this tab, leave them alone.
    try {
      if (sessionStorage.getItem(SESSION_NUDGED) === "1") {
        firedThisSession.current = true;
        return;
      }
    } catch {}

    // 24h cooldown across visits.
    try {
      const last = Number(localStorage.getItem(LAST_NUDGE_KEY) || 0);
      if (last && Date.now() - last < NUDGE_COOLDOWN) return;
    } catch {}

    const fire = () => {
      if (firedThisSession.current) return;
      firedThisSession.current = true;
      try {
        sessionStorage.setItem(SESSION_NUDGED, "1");
        localStorage.setItem(LAST_NUDGE_KEY, String(Date.now()));
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent("nanjila:open", {
          detail: { reason: "idle-10min", opener: openerFor(location), path: location },
        }));
      } catch {}
    };

    const reset = () => {
      if (firedThisSession.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fire, IDLE_MS);
    };

    // Start the timer + listen for activity.
    reset();
    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, reset, { passive: true });

    return () => {
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, reset);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [location]);
}
