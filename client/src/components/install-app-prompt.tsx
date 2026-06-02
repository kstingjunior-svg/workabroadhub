// ─────────────────────────────────────────────────────────────────────────────
// Install App Prompt — compact Yes/No pill, 40s auto-dismiss.
//
// 2026-06 upgrade: also detects "they installed it before and then removed it"
// and swaps the copy to "Looks like you removed the app — reinstall it?".
//
// HOW THE DETECTION WORKS (browsers limit what we can ask):
//   1. On mount we check `display-mode: standalone`. If true → they're using
//      the installed PWA RIGHT NOW. We tell the server (POST /api/pwa/event
//      type=standalone-open), set localStorage `wah:pwa-installed=true`, and
//      hide the prompt entirely.
//   2. Otherwise we listen for `beforeinstallprompt`. Chrome/Edge/Android
//      only fire it when the PWA is installable in this profile. If it fires,
//      the PWA is NOT currently installed in this browser profile.
//   3. We then check whether we KNOW the user installed it before — either via
//      localStorage flag, OR the server endpoint /api/pwa/status. If yes →
//      this is a re-install scenario; show "reinstall" copy and POST
//      uninstall-detected so the server knows too.
//   4. If `appinstalled` fires (install completes) we record it both client
//      and server side, then close the pill.
//
// iOS Safari fires none of these events. There we just show the pill on a
// short delay and route Yes → "Add to Home Screen" instructions, same as before.
//
// User-facing behaviour stays the same: small pill at the bottom, 40s silent
// timeout, 14-day cooldown after explicit No. Only the COPY changes when the
// reinstall heuristic trips.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Download, Share, Plus, RotateCcw } from "lucide-react";

const DISMISS_KEY      = "wah:install-prompt-dismissed-at";
const INSTALLED_KEY    = "wah:pwa-installed";          // "true" once we've ever seen install or standalone
const LAST_STANDALONE  = "wah:pwa-last-standalone";    // ms timestamp
const DISMISS_FOR_MS   = 14 * 24 * 60 * 60 * 1000;     // 14 days after an explicit No
const AUTO_DISMISS_MS  = 40 * 1000;                    // 40s silent timeout

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

function localStorageSaysInstalled(): boolean {
  try { return localStorage.getItem(INSTALLED_KEY) === "true"; }
  catch { return false; }
}

function markInstalledLocally(): void {
  try { localStorage.setItem(INSTALLED_KEY, "true"); } catch {}
}

function markStandaloneSeenLocally(): void {
  try { localStorage.setItem(LAST_STANDALONE, String(Date.now())); } catch {}
}

// Fire-and-forget telemetry to the server. Never throws — if the user is
// signed out the endpoint silently returns 200.
function pingServer(type: "installed" | "standalone-open" | "uninstall-detected"): void {
  try {
    void fetch("/api/pwa/event", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    }).catch(() => {});
  } catch {}
}

interface ServerPwaStatus {
  installedAt: string | null;
  lastStandaloneAt: string | null;
  uninstallSeenAt: string | null;
  likelyUninstalled: boolean;
  signedIn: boolean;
}

async function fetchServerStatus(): Promise<ServerPwaStatus | null> {
  try {
    const res = await fetch("/api/pwa/status", { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as ServerPwaStatus;
  } catch { return null; }
}

export function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosFlow, setIosFlow] = useState(false);
  // When true, the pill copy switches from "Install" to "Reinstall".
  const [reinstallMode, setReinstallMode] = useState(false);
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against firing the same telemetry event twice in one mount.
  const recordedRef = useRef<Set<string>>(new Set());

  // Wrapper to ensure each event fires at most once per session.
  const recordOnce = (type: "installed" | "standalone-open" | "uninstall-detected") => {
    if (recordedRef.current.has(type)) return;
    recordedRef.current.add(type);
    pingServer(type);
  };

  const showPill = () => {
    setVisible(true);
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

  useEffect(() => {
    // Step 1: are we running INSIDE the installed PWA right now?
    if (isStandaloneInstalled()) {
      markInstalledLocally();
      markStandaloneSeenLocally();
      recordOnce("standalone-open");
      return;
    }

    if (!isMobileUA()) return;
    if (recentlyDismissed()) return;

    // Step 2: parallel server-status fetch.
    let serverSaysInstalled = localStorageSaysInstalled();
    void fetchServerStatus().then((s) => {
      if (!s) return;
      if (s.installedAt) {
        serverSaysInstalled = true;
        markInstalledLocally();
      }
      if (s.likelyUninstalled) {
        setReinstallMode(true);
      }
    });

    // Step 3: native install event listeners.
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BIPEvent);
      if (serverSaysInstalled || localStorageSaysInstalled()) {
        setReinstallMode(true);
        recordOnce("uninstall-detected");
      }
      setTimeout(() => showPill(), 1200);
    };

    const iosTimer = isIOS()
      ? setTimeout(() => {
          if (localStorageSaysInstalled()) setReinstallMode(true);
          showPill();
        }, 2500)
      : null;

    const onInstalled = () => {
      markInstalledLocally();
      recordOnce("installed");
      silentClose();
    };

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

  const sayNo = () => {
    silentClose();
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  const sayYes = async () => {
    if (isIOS() && !deferredPrompt) {
      setIosFlow(true);
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
      autoDismissTimer.current = setTimeout(silentClose, AUTO_DISMISS_MS);
      return;
    }

    if (!deferredPrompt) {
      silentClose();
      return;
    }
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
        markInstalledLocally();
        recordOnce("installed");
      }
    } catch (err) {
      console.warn("[install] native prompt failed:", err);
    } finally {
      setDeferredPrompt(null);
      silentClose();
    }
  };

  if (!visible) return null;

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
              X
            </button>
            <div className="text-xs font-semibold mb-2">
              {reinstallMode ? "Add it back to your iPhone:" : "Add to your iPhone:"}
            </div>
            <div className="space-y-1.5 text-[11px] leading-snug">
              <div>1. Tap the <Share className="h-3 w-3 inline mx-0.5" /> Share button below.</div>
              <div>2. Scroll and tap <Plus className="h-3 w-3 inline mx-0.5" /> "Add to Home Screen".</div>
              <div>3. Tap <strong>Add</strong>. Done.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const Icon = reinstallMode ? RotateCcw : Download;
  const message = reinstallMode
    ? "Looks like you removed the app — reinstall it?"
    : "Install WorkAbroad Hub on your phone?";
  const yesLabel = reinstallMode ? "Reinstall" : "Yes";

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[100] pb-[calc(env(safe-area-inset-bottom)+12px)] pointer-events-none"
      data-testid="install-app-prompt"
    >
      <div className="mx-auto w-full max-w-sm px-3 pointer-events-auto">
        <div className="flex items-center gap-2 rounded-full bg-blue-600 text-white shadow-lg ring-1 ring-black/10 pl-3 pr-1 py-1">
          <Icon className="h-4 w-4 shrink-0" />
          <div className="flex-1 min-w-0 text-[12px] font-medium leading-tight truncate">
            {message}
          </div>
          <button
            onClick={sayYes}
            className="shrink-0 bg-white text-blue-700 text-[11px] font-bold px-3 py-1.5 rounded-full hover:bg-blue-50 active:bg-blue-100 transition-colors"
            data-testid="button-install-yes"
          >
            {yesLabel}
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
