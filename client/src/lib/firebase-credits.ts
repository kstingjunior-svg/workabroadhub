/**
 * Firebase RTDB — User Credits
 *
 * Schema (RTDB):
 *   users/{userId}/credits/{creditType}
 *     total        : number
 *     used         : number
 *     remaining    : number
 *     packName     : string
 *     purchasedDate: number (ms)
 *     expiryDate   : number | null (ms)
 *     paidAmount   : number
 *     paymentRef   : string
 *     serviceType  : string (for cv_services)
 *
 *   users/{userId}/subscriptions/{planKey}
 *     status       : "active" | "expired"
 *     startDate    : number (ms)
 *     expiryDate   : number (ms)
 *     paidAmount   : number
 *     paymentRef   : string
 *     autoRenew    : false
 *
 *   users/{userId}/applications/{appId}
 *     jobTitle     : string
 *     employer     : string
 *     country      : string
 *     status       : "submitted" | "in_progress" | "accepted" | "rejected"
 *     submittedDate: number (ms)
 *     creditUsed   : boolean
 *     creditType   : string
 *
 *   users/{userId}/payments/{payId}
 *     amount       : number
 *     service      : string
 *     date         : number (ms)
 *     method       : string
 *     reference    : string
 *     status       : "completed"
 */

import {
  ref,
  get,
  set,
  update,
  push,
  onValue,
  off,
  runTransaction,
  serverTimestamp,
} from "firebase/database";
import { rtdb } from "./firebase";
import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreditType =
  | "job_applications"
  | "cv_services"
  | "university_applications"
  | "employer_verification";

export interface CreditBalance {
  total: number;
  used: number;
  remaining: number;
  packName?: string;
  serviceType?: string;
  purchasedDate?: number;
  expiryDate?: number | null;
  paidAmount?: number;
  paymentRef?: string;
}

export type CreditBalances = Partial<Record<CreditType, CreditBalance>>;

export interface UserSubscriptionFB {
  status: "active" | "expired";
  startDate: number;
  expiryDate: number;
  paidAmount: number;
  paymentRef: string;
  autoRenew: boolean;
}

export interface UserPaymentFB {
  id: string;
  amount: number;
  service: string;
  date: number;
  method: string;
  reference: string;
  status: string;
}

export interface UserApplicationFB {
  id: string;
  jobTitle: string;
  employer: string;
  country: string;
  status: "submitted" | "in_progress" | "accepted" | "rejected";
  submittedDate: number;
  creditUsed: boolean;
  creditType: CreditType;
}

// ─── Credit Reads ─────────────────────────────────────────────────────────────

export function useUserCredits(userId: string | number | undefined): CreditBalances {
  const [credits, setCredits] = useState<CreditBalances>({});

  useEffect(() => {
    if (!userId) return;
    const creditsRef = ref(rtdb, `users/${userId}/credits`);

    const unsub = onValue(creditsRef, (snap) => {
      setCredits((snap.val() as CreditBalances) || {});
    });

    return () => off(creditsRef, "value", unsub as any);
  }, [userId]);

  return credits;
}

export function useUserSubscriptionsFB(userId: string | number | undefined) {
  const [subs, setSubs] = useState<Record<string, UserSubscriptionFB>>({});

  useEffect(() => {
    if (!userId) return;
    const subsRef = ref(rtdb, `users/${userId}/subscriptions`);

    const unsub = onValue(subsRef, (snap) => {
      setSubs((snap.val() as Record<string, UserSubscriptionFB>) || {});
    });

    return () => off(subsRef, "value", unsub as any);
  }, [userId]);

  return subs;
}

export function useUserPaymentsFB(userId: string | number | undefined): UserPaymentFB[] {
  const [payments, setPayments] = useState<UserPaymentFB[]>([]);

  useEffect(() => {
    if (!userId) return;
    const paymentsRef = ref(rtdb, `users/${userId}/payments`);

    const unsub = onValue(paymentsRef, (snap) => {
      const raw = snap.val() || {};
      const list = Object.entries(raw).map(([id, v]: [string, any]) => ({ id, ...v }));
      list.sort((a, b) => (b.date || 0) - (a.date || 0));
      setPayments(list);
    });

    return () => off(paymentsRef, "value", unsub as any);
  }, [userId]);

  return payments;
}

export function useUserApplicationsFB(userId: string | number | undefined): UserApplicationFB[] {
  const [apps, setApps] = useState<UserApplicationFB[]>([]);

  useEffect(() => {
    if (!userId) return;
    const appsRef = ref(rtdb, `users/${userId}/applications`);

    const unsub = onValue(appsRef, (snap) => {
      const raw = snap.val() || {};
      const list = Object.entries(raw).map(([id, v]: [string, any]) => ({ id, ...v }));
      list.sort((a, b) => (b.submittedDate || 0) - (a.submittedDate || 0));
      setApps(list);
    });

    return () => off(appsRef, "value", unsub as any);
  }, [userId]);

  return apps;
}

// ─── Credit Writes ────────────────────────────────────────────────────────────

/**
 * Allocate credits for a user after a successful payment.
 * Called server-side via the Firebase REST API (firebaseRtdb.ts).
 * This client version is for direct calls (e.g. from admin tools).
 *
 * Uses runTransaction to prevent lost-update races when multiple tabs or
 * concurrent requests try to top-up the same credit bucket at the same time.
 */
export async function allocateCredits(
  userId: string | number,
  creditType: CreditType,
  data: Omit<CreditBalance, "used" | "remaining">
) {
  const creditsRef = ref(rtdb, `users/${userId}/credits/${creditType}`);

  await runTransaction(creditsRef, (current: CreditBalance | null) => {
    const prev = current || { total: 0, used: 0, remaining: 0 } as CreditBalance;
    const newTotal     = prev.total     + data.total;
    const newRemaining = prev.remaining + data.total;
    return {
      ...data,
      total:     newTotal,
      used:      prev.used,
      remaining: newRemaining,
    };
  });
}

/**
 * Decrement a credit. Returns the new remaining count, or -1 if insufficient.
 */
export async function useCredit(
  userId: string | number,
  creditType: CreditType
): Promise<number> {
  const creditsRef = ref(rtdb, `users/${userId}/credits/${creditType}`);

  let newRemaining = -1;

  await runTransaction(creditsRef, (current: CreditBalance | null) => {
    if (!current || current.remaining <= 0) return; // abort
    const updated = {
      ...current,
      used: (current.used || 0) + 1,
      remaining: current.remaining - 1,
    };
    newRemaining = updated.remaining;
    return updated;
  });

  return newRemaining;
}

/**
 * Record a job application submission and decrement job_applications credit.
 */
export async function recordJobApplication(
  userId: string | number,
  app: {
    jobTitle: string;
    employer: string;
    country: string;
  }
) {
  const remaining = await useCredit(userId, "job_applications");
  if (remaining < 0) throw new Error("No job application credits remaining");

  const appsRef = ref(rtdb, `users/${userId}/applications`);
  await push(appsRef, {
    ...app,
    status: "submitted",
    submittedDate: Date.now(),
    creditUsed: true,
    creditType: "job_applications",
  });

  return remaining;
}

// ─── Subscription & Payment Writes ───────────────────────────────────────────

export async function mirrorSubscription(
  userId: string | number,
  planKey: string,
  data: Omit<UserSubscriptionFB, "autoRenew">
) {
  const subsRef = ref(rtdb, `users/${userId}/subscriptions/${planKey}`);
  await set(subsRef, { ...data, autoRenew: false });
}

export async function mirrorPayment(
  userId: string | number,
  paymentId: string,
  data: Omit<UserPaymentFB, "id">
) {
  const paymentsRef = ref(rtdb, `users/${userId}/payments/${paymentId}`);
  await set(paymentsRef, data);
}
