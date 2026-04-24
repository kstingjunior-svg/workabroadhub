import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

// ── Typed shapes matching the /api/user/overview response ───────────────────

export type UserPayment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  plan_id: string | null;
  service_id: string | null;
  service_name: string | null;
  delivery_status: string | null;   // null | "pending" | "delivered" | "needs_review"
  transaction_ref: string | null;
  mpesa_receipt_number: string | null;
  fail_reason: string | null;
  created_at: string;
};

export type UserService = {
  id: string;
  service_id: string | null;
  payment_id: string | null;
  expires_at: string | null;
  created_at: string;
};

export type ServiceRequest = {
  id: string;
  service_id: string | null;
  payment_id: string | null;
  status: string;
  created_at: string;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
};

export type Commission = {
  id: string;
  referrer_user_id: string;
  payment_id: string | null;
  amount: number;
  status: string;
  created_at: string;
};

export type UserData = {
  payments: UserPayment[];
  purchases: UserService[];
  services: ServiceRequest[];
  referrals: Commission[];
};

// ── Derived helpers ──────────────────────────────────────────────────────────

export function totalCommissionKES(commissions: Commission[]): number {
  return commissions.reduce((sum, c) => sum + (c.amount ?? 0), 0);
}

export function pendingCommissionKES(commissions: Commission[]): number {
  return commissions
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + (c.amount ?? 0), 0);
}

export function paidCommissionKES(commissions: Commission[]): number {
  return commissions
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + (c.amount ?? 0), 0);
}

export function completedPaymentsKES(payments: UserPayment[]): number {
  return payments
    .filter((p) => p.status === "completed" || p.status === "success")
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);
}

export function activeServices(purchases: UserService[]): UserService[] {
  const now = new Date();
  return purchases.filter(
    (s) => s.expires_at === null || new Date(s.expires_at) > now,
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetches all user-scoped data from the app's REST API in a single request.
 * Uses the local database (not Supabase direct) so it works regardless of
 * whether VITE_SUPABASE_URL is configured.
 */
export function useUserData(userId: string | undefined) {
  const qKey = ["user-data-snapshot", userId] as const;

  const query = useQuery<UserData>({
    queryKey: qKey,
    enabled: !!userId,
    staleTime: 1000 * 60 * 3,
    queryFn: async () => {
      const res = await fetch("/api/user/overview", { credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Overview fetch failed: ${res.status} ${text}`);
      }
      return res.json() as Promise<UserData>;
    },
  });

  return query;
}
