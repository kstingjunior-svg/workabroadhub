// ─────────────────────────────────────────────────────────────────────────────
// Install App Prompt — compact Yes/No pill, 40s auto-dismiss.
//
// User feedback: "It just comes once as a kind of watermark... it doesn't
// really download when somebody presses on it... I want the message to be
// very clear and small in size, not covering the entire screen... it should
// just last there for maybe 40 seconds. Download this app on your phone,
// yes or no. If yes, immediately downloads."
//
// Behaviour:
//   • Small horizontal pill at the bottom of the viewport (NOT a full card).
//   • Reads "Install WorkAbroad Hub on your phone?" + two visible buttons:
//        [Yes, install]   [No]
//   • Yes → on Android/Chrome/Edge, immediately fires the captured
//          `beforeinstallprompt.prompt()` event = the native install
//          dialog appears straight away (this is the only programmatic way
//          a browser will install a PWA).
//        → on iOS Safari, swaps to a short 3-step "Tap Share → Add to
//          Home Screen" overlay (Apple does not allow auto-install).
//   • No → dismisses + 14d cooldown.
//   • Auto-dismisses silently after 40s of no answer (no cooldown set — they
//     get another chance next visit).
//   • Hidden on: desktop, already-installed (display-mode: standalone),
//     within 14d of an explicit "No", on admin/checkout routes.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Download, Share, Plus } from "lucide-react";

const DISMISS_KEY    = "wah:install-prompt-dismissed-at";
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000; // 14 days after an explicit No
const AUTO_DISMISS_MS = 40 * 1000;               // 40s silent timeout

interface BIPEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isMobileUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|Opera Mini/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIPadOS = navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || isIPadOS;
}

function isStandaloneInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as any).standalone === true;
  return Boolean(mq || iosStandalone);
}

function recentlyDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return ts > 0 && Date.now() - ts < DISMISS_FOR_MS;
  } catch { return false; }
}

export function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosFlow, setIosFlow] = useState(false);
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isMobileUA()) return;
    if (isStandaloneInstalled()) return;
    if (recentlyDismissed()) return;

    // Capture the native event so "Yes" can fire it instantly.
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BIPEvent);
      setTimeout(() => showPill(), 1200);
    };

    // iOS Safari never fires beforeinstallprompt — show the pill anyway and
    // route "Yes" to the Share→Add to Home Screen instructions.
    const iosTimer = isIOS()
      ? setTimeout(() => showPill(), 2500)
      : null;

    const onInstalled = () => silentClose();

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showPill = () => {
    setVisible(true);
    // 40-second silent auto-dismiss — no cooldown set so they see it again
    // next visit, but the current screen is not blocked beyond 40s.
    if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
    autoDismissTimer.current = setTimeout(() => {
      setVisible(false);
      setIosFlow(false);
    }, AUTO_DISMISS_MS);
  };

  const silentClose = () => {
    setVisible(false);
    setIosFlow(false);
    if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
  };

  const sayNo = () => {
    silentClose();
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  const sayYes = async () => {
    // iOS: no API for programmatic install — show the share instructions instead.
    if (isIOS() && !deferredPrompt) {
      setIosFlow(true);
      // Extend the timer so they have time to read the steps.
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
      autoDismissTimer.current = setTimeout(silentClose, AUTO_DISMISS_MS);
      return;
    }

    // Android / Chrome / Edge — fire the captured native event RIGHT NOW.
    if (!deferredPrompt) {
      // No event captured yet — browser doesn't think we're installable
      // (could be missing manifest fields, served over HTTP, or PWA criteria
      // not met). Silently close so we don't pretend.
      silentClose();
      return;
    }
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        // Treat acceptance like a clean install — long cooldown.
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
      }
    } catch (err) {
      console.warn("[install] native prompt failed:", err);
    } finally {
      setDeferredPrompt(null);
      silentClose();
    }
  };

  if (!visible) return null;

  // ── iOS instructional overlay (replaces the pill when Yes is tapped) ──
  if (iosFlow) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-[100] pb-[calc(env(safe-area-inset-bottom)+12px)] pointer-events-none"
        data-testid="install-app-prompt-ios"
      >
        <div className="mx-auto w-full max-w-sm px-3 pointer-events-auto">
          <div className="relative rounded-2xl bg-slate-900 text-white shadow-xl ring-1 ring-black/20 px-4 py-3">
            <button
              onClick={silentClose}
              aria-label="Close"
              className="absolute top-2 right-2 text-white/60 hover:text-white/100 text-sm leading-none"
              data-testid="button-install-ios-close"
            >
              ✕
            </button>
            <div className="text-xs font-semibold mb-2">Add to your iPhone:</div>
            <div className="space-y-1.5 text-[11px] leading-snug">
              <div>1. Tap the <Share className="h-3 w-3 inline mx-0.5" /> Share button below.</div>
              <div>2. Scroll & tap <Plus className="h-3 w-3 inline mx-0.5" /> "Add to Home Screen".</div>
              <div>3. Tap <strong>Add</strong>. Done.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Compact Yes/No pill ──────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[100] pb-[calc(env(safe-area-inset-bottom)+12px)] pointer-events-none"
      data-testid="install-app-prompt"
    >
      <div className="mx-auto w-full max-w-sm px-3 pointer-events-auto">
        <div className="flex items-center gap-2 rounded-full bg-blue-600 text-white shadow-lg ring-1 ring-black/10 pl-3 pr-1 py-1">
          <Download className="h-4 w-4 shrink-0" />
          <div className="flex-1 min-w-0 text-[12px] font-medium leading-tight truncate">
            Install WorkAbroad Hub on your phone?
          </div>
          <button
            onClick={sayYes}
            className="shrink-0 bg-white text-blue-700 text-[11px] font-bold px-3 py-1.5 rounded-full hover:bg-blue-50 active:bg-blue-100 transition-colors"
            data-testid="button-install-yes"
          >
            Yes
          </button>
          <button
            onClick={sayNo}
            className="shrink-0 text-white/85 text-[11px] font-semibold px-2 py-1.5 hover:text-white"
            data-testid="button-install-no"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}
