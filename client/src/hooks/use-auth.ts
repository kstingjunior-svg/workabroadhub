import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

async function fetchUser(): Promise<User | null> {
  // 2026-06 PERF: 3 s timeout (was 8 s). With the new server-side cache and
  // slim SELECT, /api/auth/user responds in <50ms on a warm dyno. If the call
  // is still taking >3 s, the dyno is overloaded — return null so the UI can
  // render the logged-out shell immediately rather than blocking on a hang.
  // The next page-load or focus refetch will retry.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch("/api/auth/user", {
      credentials: "include",
      signal: controller.signal,
    });

    if (response.status === 401) return null;
    if (response.status === 404) return null; // user not in DB → treat as logged out
    if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
    return response.json();
  } catch (err: any) {
    if (err?.name === "AbortError") return null; // timeout → treat as unauthenticated
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Keys that are user-session-specific and must be wiped on logout.
// Device preferences (theme, age-gate, consent) are intentionally kept.
const USER_LOCALSTORAGE_KEYS = [
  "auth_redirect",
  "ref",               // referral code captured during payment flow
  "firebase_portal_id",
  "upgrade_funnel_cooldown",
];

function clearUserStorage(): void {
  // Remove user-specific localStorage keys
  USER_LOCALSTORAGE_KEYS.forEach((key) => localStorage.removeItem(key));

  // Session storage is entirely user-session data — clear it all
  sessionStorage.clear();
}

async function logoutFn(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch { /* ignore network errors — session is being destroyed regardless */ }

  clearUserStorage();
}

export function useAuth() {
  const queryClient = useQueryClient();
  // 2026-06 LAG FIX: refetch-on-focus was firing too often (every tab switch
  // triggered a fresh /api/auth/user call, and at 300+ users that's a lot of
  // session-table reads). Tuned to:
  //   staleTime 2 min — still picks up post-payment plan changes within
  //     a couple minutes, no refetch needed if the cache is fresh
  //   refetchOnWindowFocus true — still triggers on focus, but most focuses
  //     hit the 2 min stale-time fast path and skip the actual fetch
  //   refetchOnReconnect false — network blips no longer flood the server
  // fetchUser still returns null on 401 (no logout), so a transient blip
  // can never log anyone out.
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false,
  });

  const logoutMutation = useMutation({
    mutationFn: logoutFn,
    onSuccess: () => {
      // Wipe the entire query cache so no stale user data leaks to the next session
      queryClient.clear();
      // Hard redirect to root — ensures a clean page load with no lingering state
      window.location.href = "/";
    },
    onError: () => {
      // Even on error, clear local state and redirect
      queryClient.clear();
      window.location.href = "/";
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
