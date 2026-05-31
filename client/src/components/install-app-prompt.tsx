// ─────────────────────────────────────────────────────────────────────────────
// Install App Prompt
//
// Shows a friendly bottom-sheet that lets mobile users install WorkAbroad Hub
// to their home screen as a PWA. No Play Store / App Store detour needed —
// just one tap and the icon appears on their phone.
//
// • Android / Chrome / Edge:  uses the native `beforeinstallprompt` event so
//   tapping "Install" triggers the browser's real install dialog.
// • iOS Safari:               can't auto-install, so we show step-by-step
//   "Tap Share → Add to Home Screen" instructions with arrow icons.
// • Desktop:                  hidden completely (user asked for mobile only).
// • Already installed?         hidden (detect via display-mode: standalone or
//   navigator.standalone).
// • User dismissed?            remember in localStorage for 14 days so we
//   don't nag.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { X, Download, Share, Plus, Smartphone } from "lucide-react";

const DISMISS_KEY = "wah:install-prompt-dismissed-at";
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// BeforeInstallPromptEvent isn't in lib.dom typing — minimal shape we use.
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
  // iPad on iOS 13+ pretends to be Mac, so also check touch points.
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

function wasRecentlyDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (!ts) return false;
    return Date.now() - ts < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

export function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosFlow, setIosFlow] = useState(false);

  useEffect(() => {
    // Skip if desktop / already installed / recently dismissed.
    if (!isMobileUA()) return;
    if (isStandaloneInstalled()) return;
    if (wasRecentlyDismissed()) return;

    // Android / Chrome / Edge path — wait for browser to say "installable".
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BIPEvent);
      // Slight delay so the prompt doesn't slam in on page load.
      setTimeout(() => setVisible(true), 1500);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // If installation finishes (user accepted in our prompt or elsewhere),
    // hide ourselves and remember.
    const onInstalled = () => {
      setVisible(false);
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari fallback — never fires beforeinstallprompt. We show our own
    // step-by-step Share → Add to Home Screen card after a short delay.
    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIOS()) {
      iosTimer = setTimeout(() => {
        setIosFlow(true);
        setVisible(true);
      }, 2500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  const install = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setVisible(false);
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
      }
    } catch (err) {
      console.warn("[install] prompt failed:", err);
    } finally {
      setDeferredPrompt(null);
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[100] pb-[calc(env(safe-area-inset-bottom)+12px)] pointer-events-none"
      data-testid="install-app-prompt"
    >
      <div className="mx-auto w-full max-w-md px-3 pointer-events-auto">
        <div className="relative rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-2xl ring-1 ring-black/10 overflow-hidden">
          {/* Decorative dot pattern */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.45) 1px, transparent 0)",
              backgroundSize: "14px 14px",
            }}
          />

          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="absolute top-2 right-2 z-10 p-1.5 rounded-lg hover:bg-white/15 active:bg-white/25 transition-colors"
            data-testid="button-install-dismiss"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative px-5 pt-5 pb-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
                <Smartphone className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0 pr-7">
                <h3 className="text-base font-bold leading-tight">
                  Install WorkAbroad Hub
                </h3>
                <p className="text-xs text-white/85 mt-1 leading-relaxed">
                  {iosFlow
                    ? "Add it to your home screen for one-tap access — works offline, no Play Store needed."
                    : "Get the app on your phone in 2 seconds. No Play Store download — just tap Install."}
                </p>
              </div>
            </div>

            {iosFlow ? (
              <div className="space-y-2.5 mb-3">
                <div className="flex items-center gap-2 text-xs bg-white/10 rounded-lg px-3 py-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                    1
                  </span>
                  <span className="flex-1">
                    Tap the <Share className="h-3.5 w-3.5 inline mx-0.5" /> Share button at the bottom of Safari
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs bg-white/10 rounded-lg px-3 py-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                    2
                  </span>
                  <span className="flex-1">
                    Scroll down and tap <Plus className="h-3.5 w-3.5 inline mx-0.5" /> Add to Home Screen
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs bg-white/10 rounded-lg px-3 py-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                    3
                  </span>
                  <span className="flex-1">Tap <strong>Add</strong> — the icon appears on your home screen</span>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 mt-1">
                <button
                  onClick={install}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-white text-blue-700 font-bold text-sm py-2.5 px-3 rounded-xl hover:bg-blue-50 active:bg-blue-100 transition-colors shadow-sm"
                  data-testid="button-install-now"
                >
                  <Download className="h-4 w-4" />
                  Install App
                </button>
                <button
                  onClick={dismiss}
                  className="px-3 py-2.5 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                  data-testid="button-install-later"
                >
                  Maybe later
                </button>
              </div>
            )}

            {iosFlow && (
              <button
                onClick={dismiss}
                className="w-full text-xs font-medium text-white/80 hover:text-white py-2 mt-1"
                data-testid="button-install-ios-close"
              >
                Got it
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
