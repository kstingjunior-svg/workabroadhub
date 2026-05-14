import { QueryClient, QueryFunction } from "@tanstack/react-query";

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
      queryClient.invalidateQueries({
        queryKey: ["/api/auth/user"],
      });

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
    const controller = new AbortController();

    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const endpoint = queryKey.join("/");

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
      queryFn: getQueryFn({ on401: "throw" }),
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

queryClient.setQueryDefaults(["/api/auth/user"], {
  staleTime: 30000,
  refetchOnWindowFocus: true,
});

export function prefetchCriticalData() {
  prefetchCsrfToken();

  queryClient.prefetchQuery({
    queryKey: ["/api/countries"],
    staleTime: STALE_TIMES.STATIC,
  });
}
