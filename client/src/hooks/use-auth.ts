import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

async function fetchUser(): Promise<User | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8 s max wait

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
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 30_000, // 30 s — mutations invalidate immediately; window-focus refetches keep badge in sync
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
