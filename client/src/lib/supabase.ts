import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

/**
 * Record a referral in Supabase immediately after a new user signs up via a referral link.
 * Call this once, right after successful registration, passing the ?ref= value from the URL.
 * Idempotent — silently skips duplicate rows and unknown ref codes.
 */
export async function trackReferral(
  refCodeFromURL: string,
  newUserId: string,
  newUserPhone?: string,
): Promise<void> {
  if (!refCodeFromURL?.trim()) return;

  // 1. Find the referrer by their referral_code
  const { data: referrer } = await supabase
    .from("users")
    .select("id")
    .eq("referral_code", refCodeFromURL.trim().toUpperCase())
    .single();

  if (!referrer || referrer.id === newUserId) return; // unknown code or self-referral

  // 2. Insert referral row
  const { error: insertErr } = await supabase.from("referrals").insert({
    referrer_user_id: referrer.id,
    referred_user_id: newUserId,
    ref_code:         refCodeFromURL.trim().toUpperCase(),
    ...(newUserPhone ? { referred_phone: newUserPhone } : {}),
    status: "pending",
  });

  if (insertErr && insertErr.code !== "23505") {
    console.error("trackReferral insert error:", insertErr.message);
    return;
  }

  // 3. Stamp referred_by on the new user (graceful — column may not exist)
  await supabase
    .from("users")
    .update({ referred_by: referrer.id })
    .eq("id", newUserId);
}

/**
 * Extend an existing subscription by `days` from the later of (now, current expiry),
 * or create a new one if none exists.
 * Returns the new expires_at date.
 */
export async function extendOrCreate(
  userId: string,
  serviceId: string,
  days = 30,
  paymentId = "manual",
): Promise<Date | null> {
  const MS = days * 24 * 60 * 60 * 1000;

  const { data: rows } = await supabase
    .from("user_services")
    .select("id, expires_at")
    .eq("user_id", userId)
    .eq("service_id", serviceId)
    .limit(1);

  const existing = rows?.[0];

  if (existing) {
    // Extend from the later of now or current expiry — never shorten
    const base = existing.expires_at
      ? Math.max(new Date(existing.expires_at).getTime(), Date.now())
      : Date.now();
    const newExpiry = new Date(base + MS);

    const { error } = await supabase
      .from("user_services")
      .update({ expires_at: newExpiry.toISOString() })
      .eq("id", existing.id);

    if (error) { console.error("extendOrCreate update error:", error.message); return null; }
    return newExpiry;
  }

  // No existing row — create fresh
  const newExpiry = new Date(Date.now() + MS);
  const { error } = await supabase.from("user_services").insert({
    user_id:    userId,
    service_id: serviceId,
    payment_id: paymentId,
    expires_at: newExpiry.toISOString(),
  });
  if (error) { console.error("extendOrCreate insert error:", error.message); return null; }
  return newExpiry;
}

/**
 * Grant a user access to a service by inserting into user_services.
 * expiresAt = undefined means lifetime access.
 */
export async function grantAccess(
  userId: string,
  serviceId: string,
  expiresAt?: Date,
  paymentId = "manual",
): Promise<boolean> {
  const { error } = await supabase.from("user_services").insert({
    user_id:    userId,
    service_id: serviceId,
    payment_id: paymentId,
    expires_at: expiresAt?.toISOString() ?? null,
  });
  if (error) {
    console.error("grantAccess error:", error.message);
    return false;
  }
  return true;
}

/**
 * Check whether a user has an active time-limited subscription to a service.
 * Requires expires_at to be a real future date — null (lifetime) returns false.
 */
export async function hasSubscription(userId: string, serviceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_services")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("service_id", serviceId);

  if (error) {
    console.error("hasSubscription error:", error.message);
    return false;
  }
  if (!data?.length) return false;
  return new Date(data[0].expires_at) > new Date();
}

/**
 * Check whether a user has active access to a service.
 * Active = row exists in user_services AND (expires_at IS NULL OR expires_at > now)
 */
export async function hasAccess(userId: string, serviceId: string): Promise<boolean> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_services")
    .select("id, expires_at")
    .eq("user_id", userId)
    .eq("service_id", serviceId)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (error) {
    console.error("hasAccess error:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
