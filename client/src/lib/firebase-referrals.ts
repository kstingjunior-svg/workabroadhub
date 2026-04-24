/**
 * Firebase Realtime Database — Referral Code System
 *
 * Schema (RTDB):
 *   referralCodes/{code}  → { userId, createdAt, uses, maxUses }
 *   users/{userId}        → { discount, referredBy, referralCredits }
 */

import { ref, get, set, runTransaction, serverTimestamp, increment } from "firebase/database";
import { rtdb } from "./firebase";

export const REFERRAL_PREFIX = "WAH";
export const REFERRAL_DISCOUNT_PCT = 20;        // 20 % off
export const REFERRAL_CREDIT_KES  = 500;        // KES 500 to referrer
export const REFERRAL_MAX_USES    = 10;

// ─── Code generation ──────────────────────────────────────────────────────────

/**
 * Derive the referral code string for a userId (no DB write).
 * WAH + first 6 chars of userId, uppercased.
 */
export function buildReferralCode(userId: string): string {
  return REFERRAL_PREFIX + userId.substring(0, 6).toUpperCase();
}

/**
 * Ensure the code exists in Firebase RTDB for this user.
 * Idempotent — safe to call on every page load.
 */
export async function generateReferralCode(userId: string): Promise<string> {
  const code = buildReferralCode(userId);
  const codeRef = ref(rtdb, `referralCodes/${code}`);

  const snap = await get(codeRef);
  if (!snap.exists()) {
    await set(codeRef, {
      userId,
      createdAt: Date.now(),
      uses: 0,
      maxUses: REFERRAL_MAX_USES,
    });
  }

  return code;
}

// ─── Code lookup ──────────────────────────────────────────────────────────────

export interface ReferralCodeData {
  userId: string;
  createdAt: number;
  uses: number;
  maxUses: number;
}

export async function getReferralCodeData(code: string): Promise<ReferralCodeData | null> {
  const snap = await get(ref(rtdb, `referralCodes/${code.toUpperCase()}`));
  if (!snap.exists()) return null;
  return snap.val() as ReferralCodeData;
}

// ─── Apply code ───────────────────────────────────────────────────────────────

export type ApplyResult =
  | { ok: true;  referrerId: string }
  | { ok: false; reason: "not_found" | "expired" | "self_referral" | "already_used" | "transaction_aborted" };

/**
 * Atomically apply a referral code for a new user.
 *   • increments uses counter on the code
 *   • writes discount + referredBy to the new user's Firebase node
 *   • increments referralCredits on the referrer's Firebase node
 *
 * Returns { ok: true } on success, or { ok: false, reason } on failure.
 */
export async function applyReferralCode(
  code: string,
  newUserId: string,
): Promise<ApplyResult> {
  const normalizedCode = code.trim().toUpperCase();

  // Pre-flight check — avoids unnecessary transaction on obvious errors
  const data = await getReferralCodeData(normalizedCode);
  if (!data) return { ok: false, reason: "not_found" };
  if (data.uses >= data.maxUses) return { ok: false, reason: "expired" };
  if (data.userId === newUserId) return { ok: false, reason: "self_referral" };

  // Check if this user already had a code applied
  const userSnap = await get(ref(rtdb, `users/${newUserId}`));
  if (userSnap.exists() && userSnap.val()?.referredBy) {
    return { ok: false, reason: "already_used" };
  }

  // Atomic transaction on the code node
  let referrerId = "";
  const codeRef = ref(rtdb, `referralCodes/${normalizedCode}`);

  const result = await runTransaction(codeRef, (current) => {
    if (!current) return; // abort — code disappeared
    if (current.uses >= current.maxUses) return; // abort — exhausted
    current.uses = (current.uses ?? 0) + 1;
    return current;
  });

  if (!result.committed) {
    return { ok: false, reason: "transaction_aborted" };
  }

  referrerId = result.snapshot.val()?.userId ?? "";

  // Write discount to the new user's Firebase profile
  const userRef = ref(rtdb, `users/${newUserId}`);
  await runTransaction(userRef, (current) => {
    const base = current ?? {};
    if (base.referredBy) return; // already applied — abort
    return {
      ...base,
      discount: REFERRAL_DISCOUNT_PCT,
      referredBy: referrerId,
    };
  });

  // Credit the referrer (+KES 500)
  if (referrerId) {
    const referrerRef = ref(rtdb, `users/${referrerId}/referralCredits`);
    await runTransaction(referrerRef, (current) => (current ?? 0) + REFERRAL_CREDIT_KES);
  }

  return { ok: true, referrerId };
}

// ─── User discount lookup ─────────────────────────────────────────────────────

export interface UserReferralProfile {
  discount: number;          // e.g. 20 (%)
  referredBy: string | null; // userId of referrer
  referralCredits: number;   // KES credits earned as referrer
}

export async function getUserReferralProfile(userId: string): Promise<UserReferralProfile> {
  const snap = await get(ref(rtdb, `users/${userId}`));
  if (!snap.exists()) return { discount: 0, referredBy: null, referralCredits: 0 };
  const val = snap.val() ?? {};
  return {
    discount: val.discount ?? 0,
    referredBy: val.referredBy ?? null,
    referralCredits: val.referralCredits ?? 0,
  };
}
