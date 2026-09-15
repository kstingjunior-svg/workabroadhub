import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { isEmailVerificationExempt } from "@shared/email-verification-gate";

// =============================================================================
// PERFORMANCE: Optimized Query Client Configuration
// =============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000;

// BACKEND API URL
const API_URL = import.meta.env.VITE_API_URL || "";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;

    if (res.status === 403) {
      let bodyJson: any = {};
      try {
        bodyJson = JSON.parse(text);
      } catch {}

      const msg: string = bodyJson?.message ?? bodyJson?.error ?? text ?? "";

      const isCsrf =
        !msg ||
        msg.toLowerCase().includes("csrf") ||
        msg.toLowerCase().includes("missing csrf") ||
        msg.toLowerCase().includes("invalid or missing");

      if (isCsrf) {
        clearCsrfToken();

        const err = new Error(
          "Security token refreshed — please tap again"
        ) as any;

        err.status = 403;
        err.isCsrfError = true;

        throw err;
      }

      const err = new Error(msg || "Access denied") as any;
      err.status = 403;

      throw err;
    }

    try {
      const json = JSON.parse(text);

      if (json?.message) {
        const err = new Error(json.message) as any;
        err.status = res.status;
        // 2026-06: also attach the full body so callers can read rich
        // structured fields like { title, nextStep, paybillFallback,
        // retrySafe, badPhone } that the server now ships on M-Pesa
        // failures. The M-Pesa error card needs these to render the
        // friendly Kenyan-language guidance + Paybill fallback.
        err.body = json;
        throw err;
      }

      if (json?.error) {
        // 2026-08 FIX: some endpoints (e.g. AutoApply 404 handler) return
        // { success:false, error:{ type, message } } — an object, not a
        // string. new Error(obj).message becomes "[object Object]" which
        // then surfaces in user-facing toasts as gibberish. Extract the
        // nested message first.
        const errMsg =
          typeof json.error === "string"
            ? json.error
            : (json.error?.message ?? json.error?.type ?? JSON.stringify(json.error));
        const err = new Error(errMsg) as any;
        err.status = res.status;
        err.body = json;
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

function getStatusCodeFromError(error: Error): number | null {
  const match = error.message.match(/^(\d{3}):/);
  return match ? parseInt(match[1], 10) : null;
}

function shouldRetry(failureCount: number, error: Error): boolean {
  if (failureCount >= MAX_RETRIES) return false;

  const statusCode = getStatusCodeFromError(error);

  if (statusCode !== null) {
    return statusCode >= 500 && statusCode < 600;
  }

  return true;
}

function getRetryDelay(attemptIndex: number): number {
  return Math.min(RETRY_DELAY_BASE * 2 ** attemptIndex, 10000);
}

// =============================================================================
// CSRF TOKEN MANAGEMENT
// =============================================================================

let csrfTokenCache: string | null = null;
let csrfFetchPromise: Promise<string> | null = null;

export async function fetchCsrfToken(): Promise<string> {
  if (csrfTokenCache) return csrfTokenCache;

  if (csrfFetchPromise) return csrfFetchPromise;

  csrfFetchPromise = fetch(`${API_URL}/api/csrf-token`, {
    credentials: "include",
  })
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

export function prefetchCsrfToken(): void {
  fetchCsrfToken();
}

export function clearCsrfToken(): void {
  csrfTokenCache = null;
  csrfFetchPromise = null;
}

// =============================================================================
// SESSION REFRESH
// =============================================================================

async function refreshSession(): Promise<boolean> {
  try {
    clearCsrfToken();

    const res = await fetch(`${API_URL}/api/auth/user`, {
      credentials: "include",
    });

    if (res.ok) {
      // Don't invalidate /api/auth/user here — that triggers a refetch race
      // with the just-restored session. If the session was actually refreshed,
      // useAuth will see the fresh data on its own normal refetch cycle.
      // Only invalidate the user's plan so any cached "free" state updates.
      queryClient.invalidateQueries({
        queryKey: ["/api/user/plan"],
      });
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// =============================================================================
// API REQUEST
// =============================================================================

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined
): Promise<Response> {
  const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(
    method.toUpperCase()
  );

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
      const res = await fetch(`${API_URL}${url}`, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
        signal: controller.signal,
      });

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
    const endpoint = queryKey.join("/");

    // 2026-09 (Tony's 403-storm investigation): the server's
    // requireEmailVerifiedApi middleware blocks every non-allowlisted
    // /api/* call for an authenticated-but-unverified user with a 403 —
    // this is correct, by-design behavior. But dozens of dashboard widgets
    // (subscription, orders, job alerts, referrals, notifications, etc.)
    // poll on their own timers with no awareness of that wall, so an
    // unverified user sitting on the dashboard for their whole 72h grace
    // window kept re-asking the server the same "no" over and over —
    // every poll costs a live Postgres round-trip inside that middleware
    // just to say no again. Once we already know the answer (from the
    // cached /api/auth/user payload), skip the network call entirely
    // instead of manufacturing a real 403 the server is guaranteed to
    // send back anyway.
    if (endpoint.startsWith("/api") && !isEmailVerificationExempt(endpoint)) {
      const cachedUser = queryClient.getQueryData<any>(["/api/auth/user"]);
      const isExemptUser =
        !cachedUser ||
        cachedUser.emailVerified !== false ||
        cachedUser.isAdmin === true ||
        cachedUser.role === "ADMIN" ||
        cachedUser.role === "SUPER_ADMIN";

      if (!isExemptUser) {
        if (unauthorizedBehavior === "returnNull") return null as any;
        const err = new Error(
          "Please verify your email address to continue using WorkAbroadHub. Check your inbox and spam folder for the verification code."
        ) as any;
        err.status = 403;
        throw err;
      }
    }

    const controller = new AbortController();

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
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
// CACHE CONFIG
// =============================================================================

export const STALE_TIMES = {
  STATIC: 10 * 60 * 1000,
  DYNAMIC: 1 * 60 * 1000,
  REALTIME: 0,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),  // graceful null instead of throwing into ErrorBoundary
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: STALE_TIMES.DYNAMIC,
      gcTime: 5 * 60 * 1000,
      retry: shouldRetry,
      retryDelay: getRetryDelay,
      networkMode: "offlineFirst",
    },

    mutations: {
      retry: (failureCount, error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return failureCount < 2;
        }

        return false;
      },

      retryDelay: getRetryDelay,
    },
  },
});

queryClient.setQueryDefaults(["/api/user/plan"], {
  staleTime: 30000,
  refetchOnWindowFocus: true,
});

// (Removed: previously this override fought use-auth.ts settings, causing
// the auth query to refetch on every window-focus event. A single transient
// failure would then null the user and bounce them through ProtectedRedirect.)

export function prefetchCriticalData() {
  prefetchCsrfToken();

  queryClient.prefetchQuery({
    queryKey: ["/api/countries"],
    staleTime: STALE_TIMES.STATIC,
  });
}
