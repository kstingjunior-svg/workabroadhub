import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "@/components/error-boundary";
import { initClientSentry } from "@/lib/sentry";

// Initialise Sentry as early as possible — before React renders, so import
// errors and React-internal crashes are captured. No-op when
// VITE_SENTRY_DSN isn't set (local dev / preview / DSN missing).
initClientSentry();

// ─── Service Worker Registration ──────────────────────────────────────────────
// 2026-07: Registering /sw.js so Play Store's TWA reviewer and PWABuilder can
// detect the SW (both require it for "installable" status). Previously this
// block was ACTIVELY UNREGISTERING any SW to avoid stale-cache issues from an
// old SW version — but the current sw.js in client/public is well-designed:
// it version-tags its caches ("v5") and its activate handler deletes any
// cache whose name doesn't match the current version, so a deploy can't get
// stuck on stale assets.
//
// Kept the "network-first for /api/" pattern (implemented inside sw.js) so
// data reads always hit the server. Static shell (index.html, /logo.png,
// /site.webmanifest) is precached for offline-open, which is what Play Store
// wants to see for a TWA install prompt.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.info("[WAH] Service worker registered:", reg.scope);
        // Auto-reload once a new SW takes control. Prevents users being stuck
        // on the pre-update shell after we ship a new build.
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      })
      .catch((err) => {
        console.warn("[WAH] Service worker registration failed:", err?.message);
      });
  });
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Global Frontend Error Handler ───────────────────────────────────────────
// Catches errors that escape the React ErrorBoundary (script load failures,
// third-party code, etc.) and logs them to the backend for Firebase monitoring.

// Errors that are always safe to ignore — browser quirks, extensions, background blips
const NOISE_PATTERNS = [
  // Genuine browser/environment noise — keep ignoring these.
  "resizeobserver",
  "script error",
  "permission denied",
  "extension",
  "non-error promise rejection",
  "aborted",
  "aborterror",
  "abort",
  "cancelled",
  "vite-hmr",
  "hmr",
  // NOTE: previously this list also silenced:
  //   "cannot read properties of null", "usecontext", "reading 'usecontext'",
  //   "failed to fetch", "load failed", "network request failed",
  //   "firebase", "elevenlabs", "timeout", "websocket", ...
  // Those are real application errors (especially the null-property ones,
  // which are exactly what fires when a service page reads user.firstName
  // while user is briefly null). Suppressing them meant the actual cause of
  // the "We're fixing this" loop never reached our error log. Now they get
  // logged so we can diagnose the real failure instead of treating every
  // crash as background noise.
];

// Chunk-load failures — Vite lazy imports that can't be fetched (new deploy, CDN miss)
// The correct fix is a clean reload to get the latest bundle, not an error page.
const CHUNK_PATTERNS = [
  "loading chunk",
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  "cannot find module",
  "chunkloaderror",
];

function isNoiseError(message: string): boolean {
  const lower = message.toLowerCase();
  return NOISE_PATTERNS.some((p) => lower.includes(p));
}

function isChunkError(message: string): boolean {
  const lower = message.toLowerCase();
  return CHUNK_PATTERNS.some((p) => lower.includes(p));
}

function determineErrorType(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch"))
    return "network";
  if (m.includes("auth") || m.includes("unauthorized") || m.includes("403"))
    return "auth";
  if (m.includes("validation") || m.includes("required")) return "validation";
  if (m.includes("payment") || m.includes("mpesa") || m.includes("stk")) return "payment";
  return "client";
}

async function logClientError(data: Record<string, unknown>): Promise<void> {
  try {
    await fetch("/api/log/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, userAgent: navigator.userAgent, timestamp: new Date().toISOString() }),
    });
  } catch {
    // Silent fail — logging must never trigger another error
  }
}

window.addEventListener("error", (event) => {
  const error = event.error as Error | null;
  const message = error?.message ?? event.message ?? "Unknown error";

  // Always ignore noise
  if (isNoiseError(message)) return;

  // Chunk-load failures: stale bundle after a new deploy — reload to get fresh chunks
  if (isChunkError(message)) {
    console.warn("[WAH] Chunk load failure — reloading for fresh bundle");
    window.location.reload();
    return;
  }

  // Log for observability, but DO NOT redirect — the React ErrorBoundary handles
  // render crashes in-place; background/event-handler errors are usually recoverable
  // and a full-page redirect creates a far worse experience than a brief error state.
  logClientError({
    type: determineErrorType(message),
    message,
    stack: error?.stack,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    url: window.location.href,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as Error | string | null;
  const message =
    typeof reason === "string"
      ? reason
      : (reason as Error)?.message ?? "Unhandled promise rejection";

  // Suppress noise and abort signals — these are expected from fetch timeouts,
  // TanStack Query cancellations, and other controlled teardowns
  if (isNoiseError(message)) {
    event.preventDefault();
    return;
  }

  // Chunk failures from dynamically-imported pages
  if (isChunkError(message)) {
    event.preventDefault();
    console.warn("[WAH] Chunk load failure (promise) — reloading for fresh bundle");
    window.location.reload();
    return;
  }

  event.preventDefault(); // Suppress default browser console noise

  // Log only — never redirect for promise rejections; TanStack Query / Firebase
  // surface their own error states and these are almost always recoverable.
  logClientError({
    type: determineErrorType(message),
    message,
    stack: (reason as Error)?.stack,
    url: window.location.href,
  });
});
// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
