import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "@/components/error-boundary";

// ─── Service Worker Cleanup ───────────────────────────────────────────────────
// This app does not use a service worker. Any previously registered SW (from an
// earlier version or a third-party script) would intercept network requests and
// serve stale assets, breaking cache-busting. Unregister all and clear caches.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
      console.info("[WAH] Service worker unregistered:", registration.scope);
    }
  });

  caches.keys().then((cacheNames) => {
    cacheNames.forEach((cacheName) => {
      caches.delete(cacheName);
      console.info("[WAH] Cache cleared:", cacheName);
    });
  });
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Global Frontend Error Handler ───────────────────────────────────────────
// Catches errors that escape the React ErrorBoundary (script load failures,
// third-party code, etc.) and logs them to the backend for Firebase monitoring.

// Errors that are always safe to ignore — browser quirks, extensions, background blips
const NOISE_PATTERNS = [
  "resizeobserver",
  "script error",
  "permission denied",
  "extension",
  "non-error promise rejection",
  "aborted",
  "aborterror",
  "abort",
  "cancelled",
  "network request failed",
  "failed to fetch",
  "networkerror",
  "load failed",
  "firebase",
  "elevenlabs",
  "timeout",
  "the operation was aborted",
  "signal is aborted",
  "failed to connect to websocket",
  "websocket",
  "vite-hmr",
  "hmr",
  "cannot read properties of null",
  "usecontext",
  "reading 'usecontext'",
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
