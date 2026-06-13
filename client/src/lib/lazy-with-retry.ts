// ─────────────────────────────────────────────────────────────────────────────
// lazy-with-retry — robust replacement for React.lazy.
//
// Why this exists:
//   Vite hashes chunk filenames (e.g. `revenue-live-DLtzewG6.js`). After a
//   deploy, the hashes change. Any user with the OLD shell already loaded
//   in their browser will try to fetch the OLD chunk URLs when navigating
//   to a lazy route — and those URLs now 404. The dynamic import throws,
//   the error boundary catches it, and the user sees "Just a small detour"
//   on every navigation until they hard-refresh.
//
//   This wrapper:
//     1. Retries the failed import up to 3 times with exponential backoff
//        (handles flaky connections — common on Kenyan 3G).
//     2. If retries exhaust because the chunk genuinely doesn't exist
//        (post-deploy hash mismatch), it triggers a one-time hard reload
//        of the page so the user picks up the new shell.
//     3. Persists the "we reloaded already" flag in sessionStorage so we
//        never infinite-loop reload.
//
// Use it exactly like React.lazy:
//   const Page = lazyWithRetry(() => import("@/pages/foo"));
// ─────────────────────────────────────────────────────────────────────────────

import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "wah:lazy-retry-reloaded-at";
const RELOAD_COOLDOWN_MS = 60_000; // don't auto-reload more than once per minute

async function importWithRetry<T>(
  factory: () => Promise<T>,
  attempt = 1,
  maxAttempts = 3,
): Promise<T> {
  try {
    return await factory();
  } catch (err: any) {
    const isChunkLoadError =
      err?.name === "ChunkLoadError" ||
      /Loading chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
        String(err?.message ?? ""),
      );

    if (attempt < maxAttempts) {
      // Exponential backoff: 200ms, 600ms, 1500ms
      const delay = 200 * Math.pow(3, attempt - 1);
      console.warn(
        `[lazy-with-retry] import failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms`,
        err?.message,
      );
      await new Promise((r) => setTimeout(r, delay));
      return importWithRetry(factory, attempt + 1, maxAttempts);
    }

    // Out of retries. If it looks like a chunk-load failure (hash mismatch
    // after deploy), reload the page so the user picks up the fresh shell.
    if (isChunkLoadError) {
      try {
        const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - lastReload > RELOAD_COOLDOWN_MS) {
          console.warn(
            "[lazy-with-retry] persistent chunk-load failure — reloading to pick up fresh shell",
          );
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
          // Return a never-resolving promise so React doesn't immediately
          // render the error boundary during the reload.
          return new Promise<T>(() => {});
        }
      } catch {}
    }

    // Either not a chunk-load error, or we already auto-reloaded once in the
    // last minute. Let the error propagate so the boundary can show the
    // friendly fallback.
    throw err;
  }
}

/**
 * Drop-in replacement for React.lazy with chunk-load retry + auto-reload.
 *
 *   const Foo = lazyWithRetry(() => import("@/pages/foo"));
 *   <Route component={Foo} />  // still needs to be inside a Suspense boundary
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() => importWithRetry(factory));
}

export default lazyWithRetry;
