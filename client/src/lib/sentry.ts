// ─────────────────────────────────────────────────────────────────────────────
// Sentry client initialisation.
//
// Captures uncaught JS errors, unhandled promise rejections, and React
// component errors (via Sentry.ErrorBoundary in App.tsx). Also tracks
// route changes and slow page loads via BrowserTracing.
//
// Gated on VITE_SENTRY_DSN — when not set, every Sentry function is a
// no-op. Add the DSN to your Render Environment as a build-time variable
// (Vite picks up VITE_*-prefixed vars at build time).
// ─────────────────────────────────────────────────────────────────────────────

import * as Sentry from "@sentry/react";

let initialised = false;

export function initClientSentry(): boolean {
  if (initialised) return true;
  const dsn = (import.meta.env.VITE_SENTRY_DSN || "").trim();
  if (!dsn) {
    // Silent in browser — no console noise for users.
    return false;
  }

  const env = (import.meta.env.MODE || "development").trim();
  const isProd = env === "production";

  Sentry.init({
    dsn,
    environment: env,
    // BrowserTracing tracks route changes + slow page loads.
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Session replay — only on error to keep cost down. Trade-off:
        // privacy. We mask all user text input by default.
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: isProd ? 0.1 : 1.0,
    // Replay sample rates: 0% normally, 100% when an error occurs. The
    // session replay only records the 30 seconds before the error.
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    release: (import.meta.env.VITE_RENDER_GIT_COMMIT || "").trim() || undefined,
  });

  initialised = true;
  return true;
}

/**
 * Tag the current Sentry scope with the user ID. Call from useAuth() or
 * wherever you first know the signed-in user.
 */
export function tagClientUser(userId: string | null | undefined, email?: string | null): void {
  if (!initialised || !userId) return;
  Sentry.setUser({ id: userId, email: email ?? undefined });
}

/**
 * Re-export the React error boundary so App.tsx can wrap the app root.
 * Usage:
 *   <SentryErrorBoundary fallback={<ErrorScreen />}>
 *     <App />
 *   </SentryErrorBoundary>
 */
export const SentryErrorBoundary = Sentry.ErrorBoundary;
