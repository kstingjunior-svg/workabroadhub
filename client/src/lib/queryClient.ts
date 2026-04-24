import { QueryClient, QueryFunction } from "@tanstack/react-query";

// =============================================================================
// PERFORMANCE: Optimized Query Client Configuration
// - Retry with exponential backoff for network resilience
// - Smart caching to reduce API calls
// - Graceful error handling
// =============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;

    // 403 can mean either a stale CSRF token OR a plan/auth rejection.
    // Peek at the body to distinguish: only treat it as a CSRF error when the
    // message explicitly mentions the CSRF token. Plan gates (requireAnyPaidPlan,
    // requireProPlan) return 403 with a plan-specific message — surface that
    // directly so the user sees "PRO required" instead of "Security token refreshed".
    if (res.status === 403) {
      let bodyJson: any = {};
      try { bodyJson = JSON.parse(text); } catch { /* ignore */ }

      const msg: string = bodyJson?.message ?? bodyJson?.error ?? text ?? "";
      const isCsrf = !msg || msg.toLowerCase().includes("csrf") ||
                     msg.toLowerCase().includes("missing csrf") ||
                     msg.toLowerCase().includes("invalid or missing");

      if (isCsrf) {
        clearCsrfToken();
        const err = new Error("Security token refreshed — please tap again") as any;
        err.status = 403;
        err.isCsrfError = true;
        throw err;
      }

      // Plan / auth 403 — throw the real server message
      const err = new Error(msg || "Access denied") as any;
      err.status = 403;
      throw err;
    }

    // Try to extract a human-readable message from JSON error responses
    try {
      const json = JSON.parse(text);
      if (json?.message) {
        const err = new Error(json.message) as any;
        err.status = res.status;
        throw err;
      }
      if (json?.error) {
        const err = new Error(json.error) as any;
        err.status = res.status;
        throw err;
      }
    } catch (e) {
      if (e instanceof Error && !e.message.includes(text)) throw e;
    }
    const err = new Error(`${res.status}: ${text}`) as any;
    err.status = res.status;
    throw err;
  }
}

// Extract HTTP status code from error message (format: "STATUS: message")
function getStatusCodeFromError(error: Error): number | null {
  const match = error.message.match(/^(\d{3}):/);
  return match ? parseInt(match[1], 10) : null;
}

// Retry with exponential backoff - only retry on 5xx errors or network issues
function shouldRetry(failureCount: number, error: Error): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  
  const statusCode = getStatusCodeFromError(error);
  
  // If we have a status code, only retry on 5xx server errors
  if (statusCode !== null) {
    return statusCode >= 500 && statusCode < 600;
  }
  
  // Retry network errors (no status code means network failure)
  return true;
}

function getRetryDelay(attemptIndex: number): number {
  return Math.min(RETRY_DELAY_BASE * 2 ** attemptIndex, 10000);
}

// =============================================================================
// CSRF TOKEN MANAGEMENT
// One token per session. Fetched once on first mutating request and cached
// in memory for the lifetime of the page. Token is sent via X-CSRF-Token
// header — external services (M-Pesa, PayPal webhooks) are exempt server-side.
// =============================================================================

let csrfTokenCache: string | null = null;
let csrfFetchPromise: Promise<string> | null = null;

export async function fetchCsrfToken(): Promise<string> {
  // Return cached token immediately if available
  if (csrfTokenCache) return csrfTokenCache;

  // Deduplicate concurrent fetches (e.g. multiple mutations fired at once)
  if (csrfFetchPromise) return csrfFetchPromise;

  csrfFetchPromise = fetch("/api/csrf-token", { credentials: "include" })
    .then(async (res) => {
      if (!res.ok) throw new Error("Failed to fetch CSRF token");
      const { csrfToken } = await res.json();
      csrfTokenCache = csrfToken as string;
      csrfFetchPromise = null;
      return csrfTokenCache;
    })
    .catch((err) => {
      csrfFetchPromise = null;
      console.warn("[CSRF] Could not fetch token:", err);
      return "";
    });

  return csrfFetchPromise;
}

// Call this early (e.g. in App.tsx) to warm the CSRF token before the first mutation.
export function prefetchCsrfToken(): void {
  fetchCsrfToken();
}

// Invalidate the cached token (e.g. after session expiry / re-login).
export function clearCsrfToken(): void {
  csrfTokenCache = null;
  csrfFetchPromise = null;
}

// =============================================================================
// API REQUEST
// =============================================================================

// Mirrors the Axios interceptor pattern: on 401, attempt a session refresh
// then retry the original request once. On second 401 the error propagates.
// "Refresh" for session-cookie auth means clearing stale CSRF state and
// invalidating cached auth so the next query re-checks with the server.
async function refreshSession(): Promise<boolean> {
  try {
    clearCsrfToken();
    const res = await fetch("/api/auth/user", { credentials: "include" });
    if (res.ok) {
      // Session is still alive — invalidate stale auth cache
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/plan"] });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());

  async function attempt(isRetry = false): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const headers: Record<string, string> = data
      ? { "Content-Type": "application/json" }
      : {};

    if (isMutating) {
      const token = await fetchCsrfToken();
      if (token) headers["X-CSRF-Token"] = token;
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
        signal: controller.signal,
      });

      // Mirrors axios interceptor: on 401 try once to refresh then retry
      if (res.status === 401 && !isRetry) {
        const recovered = await refreshSession();
        if (recovered) return attempt(true);
      }

      await throwIfResNotOk(res);
      return res;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return attempt();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const res = await fetch(queryKey.join("/") as string, {
        credentials: "include",
        signal: controller.signal,
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  };

// =============================================================================
// Cache Configuration
// - Static data: 10 minutes (countries, services)
// - Dynamic data: 1 minute (user data, subscriptions)
// - Real-time data: No cache (payments, live status)
// =============================================================================

export const STALE_TIMES = {
  STATIC: 10 * 60 * 1000, // 10 minutes for rarely changing data
  DYNAMIC: 1 * 60 * 1000, // 1 minute for user-specific data
  REALTIME: 0, // No cache for real-time data
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: STALE_TIMES.DYNAMIC, // Default 1 minute
      gcTime: 5 * 60 * 1000, // Garbage collect after 5 minutes
      retry: shouldRetry,
      retryDelay: getRetryDelay,
      networkMode: "offlineFirst", // Use cached data when offline
    },
    mutations: {
      retry: (failureCount, error) => {
        // Retry mutations on network errors only
        if (error instanceof Error && error.name === "AbortError") {
          return failureCount < 2;
        }
        return false;
      },
      retryDelay: getRetryDelay,
    },
  },
});

// Plan queries must stay reasonably fresh — feature gates depend on them being
// accurate. 30-second staleTime prevents hammering the API on every tab-switch
// while still reflecting admin upgrades within half a minute.
// Mutations (payments, plan activations) call queryClient.invalidateQueries so
// plan changes from within the app are always reflected immediately.
queryClient.setQueryDefaults(["/api/user/plan"], {
  staleTime: 30_000, // 30 seconds — mutations invalidate instantly
  refetchOnWindowFocus: true,
});

// Auth/user: same 30-second window.  Profile plan badge stays in sync after
// the brief grace period; login/logout mutations invalidate immediately.
queryClient.setQueryDefaults(["/api/auth/user"], {
  staleTime: 30_000, // 30 seconds
  refetchOnWindowFocus: true,
});

// Prefetch critical data after auth
export function prefetchCriticalData() {
  // Warm the CSRF token so the first mutation fires without extra round-trip
  prefetchCsrfToken();

  // Prefetch countries (most common first action)
  queryClient.prefetchQuery({
    queryKey: ["/api/countries"],
    staleTime: STALE_TIMES.STATIC,
  });
}
