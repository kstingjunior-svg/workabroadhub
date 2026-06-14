// ─────────────────────────────────────────────────────────────────────────────
// GlobalBackButton — animated, always-visible "go back" arrow.
//
// FOUNDER ASK (verbatim):
//   "Each individual page has a return arrow ... animate it in a way that it is
//    clearly seen that somebody can click to go back."
//
// DESIGN:
//   - Mounted once in App.tsx so it appears on every route automatically.
//     No per-page wiring; new pages get it for free.
//   - HIDDEN on routes that already have their own primary nav:
//       • "/" (Landing has its own header)
//       • "/dashboard" (the signed-in home — nowhere to go "back" from)
//       • "/admin/*" (admin pages have the AdminLayout sidebar + Go Back)
//   - VISIBLE everywhere else.
//   - Behavior on click:
//       1. If the browser has session history, window.history.back() — feels
//          natural (back to previous page in the flow)
//       2. Otherwise wouter setLocation("/") — sends them home.
//   - Animation strategy (to satisfy "animate it so it's clearly seen"):
//       • Idle: subtle breathing pulse every 3s using the `pulse-soft` keyframes
//         defined below — draws the eye without being distracting.
//       • Hover/focus: scale 1.1 + brightness shift + ring grows
//       • Active (mid-click): scale 0.92 — tactile feedback
//       • First mount on a new route: small "tada" wiggle so users notice
//         the button is fresh / available.
//
// ACCESSIBILITY:
//   - aria-label="Go back"
//   - focus-visible ring for keyboard users
//   - 44×44 hit target (Apple HIG mobile minimum)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

// Routes where the global back button MUST NOT render.
// All other routes get it automatically.
const HIDDEN_PREFIXES = [
  "/admin",          // admin pages have their own back nav inside AdminLayout
];
const HIDDEN_EXACT = new Set([
  "/",               // Landing — no "back" makes sense
  "/dashboard",      // signed-in home
]);

function shouldHide(pathname: string): boolean {
  if (HIDDEN_EXACT.has(pathname)) return true;
  return HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function GlobalBackButton() {
  const [location, setLocation] = useLocation();
  // Wiggle once on every route change so users notice the button is alive.
  const [wiggleKey, setWiggleKey] = useState(0);

  useEffect(() => {
    setWiggleKey((k) => k + 1);
  }, [location]);

  if (shouldHide(location)) return null;

  const handleBack = () => {
    // Prefer browser history (natural feel inside an SPA flow)
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    setLocation("/");
  };

  return (
    <>
      {/* Inline keyframes so this component is self-contained.
          Doesn't depend on tailwind config or global CSS. */}
      <style>{`
        @keyframes wah-pulse-soft {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.45); }
          50%      { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0); }
        }
        @keyframes wah-tada {
          0%   { transform: scale(1) rotate(0deg); }
          15%  { transform: scale(0.94) rotate(-6deg); }
          30%  { transform: scale(1.08) rotate(6deg); }
          45%  { transform: scale(1.04) rotate(-3deg); }
          60%  { transform: scale(1.06) rotate(3deg); }
          75%  { transform: scale(1.02) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        .wah-back-btn {
          animation: wah-pulse-soft 3s ease-out infinite, wah-tada 0.7s ease-out;
        }
        .wah-back-btn:hover {
          animation-play-state: paused;
        }
      `}</style>

      <button
        key={wiggleKey}
        type="button"
        onClick={handleBack}
        aria-label="Go back"
        data-testid="global-back-button"
        className="wah-back-btn fixed left-3 z-[1000] flex items-center justify-center
                   h-11 w-11 rounded-full
                   bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm
                   text-indigo-700 dark:text-indigo-300
                   border border-indigo-200 dark:border-indigo-700
                   shadow-md
                   transition-all duration-150
                   hover:scale-110 hover:shadow-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/40
                   active:scale-95
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                   pointer-events-auto"
        style={{
          // Sit just below the iOS safe-area / notch on mobile; sensible default on desktop.
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        }}
      >
        <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
      </button>
    </>
  );
}

export default GlobalBackButton;
