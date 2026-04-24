import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "https://pvsxecrqfexgwspuqvlp.supabase.co";

// Use the service role key on the server — bypasses RLS for trusted server-to-server writes.
// Falls back to anon key if service key is not yet configured.
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!supabaseKey) return null;
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

// Log connection status at startup
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("[Supabase] Client initialised ✓ (service role) — project: pvsxecrqfexgwspuqvlp.supabase.co");
} else if (process.env.SUPABASE_ANON_KEY) {
  console.warn("[Supabase] Using anon key — inserts may fail if RLS is enabled. Set SUPABASE_SERVICE_ROLE_KEY for server-side writes.");
} else {
  console.warn("[Supabase] No key configured — user sync disabled.");
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    if (!client) {
      if (prop === "from") {
        return () => ({
          insert: () => Promise.resolve({ error: new Error("SUPABASE_ANON_KEY not configured") }),
          upsert: () => Promise.resolve({ error: new Error("SUPABASE_ANON_KEY not configured") }),
        });
      }
      return undefined;
    }
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export interface SupabaseUserRecord {
  id: string | number;
  email: string;
  phone?: string | null;
}

export interface SupabasePaymentRecord {
  user_id: string | number;
  phone?: string | null;
  amount: number;
  mpesa_code?: string | null;
  status: string;
  service_id?: string | null;
  plan_id?: string | null;
  base_amount?: number | null;
  currency?: string | null;
  discount_data?: Record<string, unknown> | null;
}

/** Resolve a Supabase user UUID from a phone number. Returns null if not found. */
export async function resolveSupabaseUuidFromPhone(phone: string): Promise<string | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const { data: userData } = await client
      .from("users")
      .select("*")
      .eq("phone", phone)
      .single();
    if (userData?.id) {
      console.log(`[Supabase] Resolved phone ${phone} → UUID ${userData.id}`);
      return userData.id;
    }
    console.warn(`[Supabase] No user found for phone ${phone}`);
    return null;
  } catch {
    return null;
  }
}

/**
 * Write (or overwrite) a subscription row in the Supabase `subscriptions` table.
 * Called after every confirmed payment so the mirror reflects the true state.
 * Upserts on user_id — only one active subscription row per user.
 */
export async function syncSubscriptionToSupabase(opts: {
  user_id: string | number;
  plan_id: string;
  provider: "mpesa" | "paypal" | "direct";
  status: "active" | "expired" | "cancelled";
  auto_renew: boolean;
  expires_at: Date;
  purchase_token?: string | null;
  product_id?: string | null;
}): Promise<void> {
  try {
    const client = getClient();
    if (!client) {
      console.warn("[Supabase] No key configured — skipping subscription sync.");
      return;
    }

    const { error } = await client
      .from("subscriptions")
      .upsert([
        {
          user_id:        String(opts.user_id),
          plan_id:        opts.plan_id,
          provider:       opts.provider,
          status:         opts.status,
          auto_renew:     opts.auto_renew,
          expires_at:     opts.expires_at.toISOString(),
          purchase_token: opts.purchase_token ?? null,
          product_id:     opts.product_id ?? null,
        },
      ])
      .select();

    if (error) {
      console.error("[Supabase] syncSubscriptionToSupabase error:", error.message);
    } else {
      console.log(
        `[Supabase] Subscription synced: user=${opts.user_id} plan=${opts.plan_id} provider=${opts.provider} auto_renew=${opts.auto_renew}`
      );
    }
  } catch (err) {
    console.error("[Supabase] syncSubscriptionToSupabase crash:", err);
  }
}

export async function upgradeUserToPro(user_id: string): Promise<void> {
  try {
    console.log("🚀 Upgrading user to PRO:", user_id);

    const client = getClient();
    if (!client) {
      console.warn("[Supabase] No key configured — skipping PRO upgrade sync.");
      return;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 360);

    await syncSubscriptionToSupabase({
      user_id,
      plan_id:    "pro",
      provider:   "direct",
      status:     "active",
      auto_renew: false,
      expires_at: expiresAt,
    });

    await client.from("user_events").insert([
      {
        user_id: String(user_id),
        event: "payment_success",
        page: "payment",
      },
    ]);
  } catch (err) {
    console.error("🔥 Upgrade crash:", err);
  }
}

/** Check whether a user currently has an active, non-expired PRO subscription in Supabase. */
export async function isUserPro(user_id: string | number): Promise<boolean> {
  try {
    const client = getClient();
    if (!client) return false;

    const { data, error } = await client
      .from("subscriptions")
      .select("*")
      .eq("user_id", String(user_id))
      .single();

    if (error || !data) return false;

    const now = new Date();
    const expiry = new Date(data.expires_at);

    if (data.status === "active" && expiry > now) return true;

    return false;
  } catch (err) {
    console.error("[Supabase] PRO check error:", err);
    return false;
  }
}

/** Mark a single user's active Supabase subscription as expired (lazy per-user downgrade). */
export async function downgradeSupabaseUser(user_id: string): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    const { error } = await client
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("user_id", user_id)
      .eq("status", "active");
    if (error) console.error("[Supabase] downgradeSupabaseUser error:", error);
    else console.log(`[Supabase] Subscription expired for user ${user_id}`);
  } catch (err) {
    console.error("[Supabase] downgradeSupabaseUser crash:", err);
  }
}

/** Bulk sweep: expire all Supabase subscriptions where expires_at < now(). Returns count expired. */
export async function downgradeExpiredSupabaseSubscriptions(): Promise<number> {
  try {
    const client = getClient();
    if (!client) return 0;
    const now = new Date().toISOString();
    const { data, error } = await client
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("status", "active")
      .lt("expires_at", now)
      .select();
    if (error) {
      console.error("[Supabase] Bulk expiry sweep error:", error);
      return 0;
    }
    const count = data?.length ?? 0;
    if (count > 0) console.log(`[Supabase] Bulk sweep: expired ${count} subscription(s)`);
    return count;
  } catch (err) {
    console.error("[Supabase] Bulk expiry sweep crash:", err);
    return 0;
  }
}

/** Confirm a completed Safaricom payment by stamping the existing pending row. */
export async function confirmPaymentInSupabase(
  mpesaCode: string,
  phone: string,
  amount: number,
): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;

    // Primary match: by mpesa_code (fastest, exact)
    const { data: byCode } = await client
      .from("payments")
      .update({ status: "completed", mpesa_code: mpesaCode, processed: true })
      .eq("mpesa_code", mpesaCode)
      .select("id");

    if (byCode && byCode.length > 0) {
      console.log(`✅ Supabase payment confirmed by mpesa_code: ${mpesaCode}`);
      return;
    }

    // Fallback: match the most recent pending row for this phone + amount
    const { data: pending } = await client
      .from("payments")
      .select("id")
      .eq("phone", phone)
      .eq("amount", amount)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!pending?.length) {
      // Before inserting, confirm this mpesa_code isn't already present in any row.
      // A second callback or replay could reach this fallback path after the first
      // callback already inserted a completed row.
      const { data: dupCheck } = await client
        .from("payments")
        .select("id")
        .eq("mpesa_code", mpesaCode)
        .limit(1)
        .maybeSingle();
      if (dupCheck) {
        console.warn(`⚠️ confirmPaymentInSupabase: fallback insert skipped — mpesa_code already exists (id=${dupCheck.id})`);
        return;
      }
      console.warn(`⚠️ No pending Supabase row found for phone=${phone} amount=${amount} — inserting fallback`);
      await client.from("payments").insert([{
        phone, amount, mpesa_code: mpesaCode, status: "completed", processed: true,
      }]);
      return;
    }

    await client
      .from("payments")
      .update({ status: "completed", mpesa_code: mpesaCode, processed: true })
      .eq("id", pending[0].id);

    console.log(`✅ Supabase payment confirmed by phone fallback: ${mpesaCode}`);
  } catch (err) {
    console.error("🔥 confirmPaymentInSupabase crash:", err);
  }

  // ── Auto-unlock ───────────────────────────────────────────────────────────
  // After confirmation, fetch the full row and unlock the service if not done yet.
  try {
    const client = getClient();
    if (!client) return;

    const { data: payment } = await client
      .from("payments")
      .select("id, user_id, service_id, auto_upgraded")
      .eq("mpesa_code", mpesaCode)
      .single();

    if (payment?.service_id && !payment.auto_upgraded) {
      await client.from("user_services").insert({
        user_id:    String(payment.user_id),
        service_id: payment.service_id,
        payment_id: String(payment.id),
      });

      await client
        .from("payments")
        .update({ auto_upgraded: true })
        .eq("id", payment.id);

      console.log(`🔓 Auto-unlocked service=${payment.service_id} for user=${payment.user_id}`);
    }
  } catch (err) {
    console.error("🔥 Auto-unlock crash:", err);
  }
}

/**
 * Insert a commission row into Supabase after a payment is confirmed + matched.
 * Looks up the payer's `referred_by` field — if set, inserts 10% into `commissions`.
 * Idempotent — silently skips if no referrer or if a commission row already exists
 * for this payment_id.
 *
 * @param userId     The confirmed payer's user id (local or Supabase)
 * @param paymentId  Stable ID for the payment (used as dedup key)
 * @param amount     The KES amount paid
 * @param rate       Commission rate as a fraction, default 0.10 (10%)
 */
export async function recordCommission(
  userId: string,
  paymentId: string,
  amount: number,
  rate = 0.10,
): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    // 1. Fetch the payer to check referred_by
    const { data: user, error: userErr } = await client
      .from("users")
      .select("referred_by")
      .eq("id", userId)
      .single();

    if (userErr || !user?.referred_by) return; // no referrer — nothing to do

    const commissionAmount = Math.floor(amount * rate);
    if (commissionAmount <= 0) return;

    // 2. Insert commission row — idempotent on payment_id unique constraint
    const { error: insertErr } = await client.from("commissions").insert({
      referrer_user_id: user.referred_by,
      payment_id:       paymentId,
      amount:           commissionAmount,
      status:           "pending",
    });

    if (insertErr) {
      if (insertErr.code === "23505") {
        console.log(`[Commission] Already recorded for payment=${paymentId}`);
        return;
      }
      console.error("[Commission] Insert error:", insertErr.message);
      return;
    }

    console.log(
      `[Commission] KES ${commissionAmount} (${rate * 100}%) pending for referrer=${user.referred_by} | payment=${paymentId}`
    );
  } catch (err) {
    console.error("[Commission] recordCommission crash:", err);
  }
}

/**
 * Match an unmatched Supabase payment to a user, unlock the service, and
 * record commission + service request.
 *
 * Safe to call multiple times — guards via `payment.matched` and
 * `payment.auto_upgraded`. Returns a typed result so callers can reply to
 * the user with the right message (success / already-done / error).
 *
 * @param payment  Full payment row from Supabase (must include id, service_id,
 *                 amount, mpesa_code, matched, auto_upgraded)
 * @param user     Resolved user row (must include id)
 */
export async function matchPaymentToUser(
  payment: Record<string, any>,
  user:    Record<string, any>,
): Promise<{ success: boolean; alreadyMatched: boolean; serviceName?: string; error?: string }> {
  const client = getClient();
  if (!client) return { success: false, alreadyMatched: false, error: "Supabase client unavailable" };

  // ── Guard: already matched ────────────────────────────────────────────────
  if (payment.matched || payment.auto_upgraded) {
    console.log(`[matchPaymentToUser] payment=${payment.id} already matched — skipping`);
    return { success: true, alreadyMatched: true };
  }

  const paymentId = String(payment.id ?? payment.mpesa_code ?? "");
  const userId    = String(user.id);
  const serviceId: string | null = payment.service_id ?? payment.serviceId ?? null;
  const amount    = Number(payment.amount ?? 0);

  try {
    // 1 — Stamp user_id, matched=true, status=completed on the payment
    const { error: stampErr } = await client
      .from("payments")
      .update({
        user_id:       userId,
        matched:       true,
        auto_upgraded: true,
        status:        "completed",
      })
      .eq("id", payment.id);

    if (stampErr) {
      console.error("[matchPaymentToUser] Stamp error:", stampErr.message);
      return { success: false, alreadyMatched: false, error: stampErr.message };
    }

    // 2 — Resolve service name (for the reply message)
    let serviceName: string | undefined;
    if (serviceId) {
      const { data: svc } = await client.from("services").select("name").eq("id", serviceId).single();
      serviceName = svc?.name;
    }

    // 3 — Unlock the service (insert into user_services, idempotent via unique key)
    if (serviceId) {
      const { error: unlockErr } = await client.from("user_services").insert({
        user_id:    userId,
        service_id: serviceId,
        payment_id: paymentId,
      });
      if (unlockErr && unlockErr.code !== "23505") {
        // 23505 = unique violation (already inserted) — safe to ignore
        console.error("[matchPaymentToUser] user_services insert error:", unlockErr.message);
      } else {
        console.log(`[matchPaymentToUser] ✅ Unlocked service=${serviceId} for user=${userId}`);
      }
    }

    // 4 — Commission (fire-and-forget, never blocks)
    recordCommission(userId, paymentId, amount).catch(
      (e) => console.error("[matchPaymentToUser] Commission error:", e?.message)
    );

    // 5 — Service request (fire-and-forget)
    createServiceRequest(userId, serviceId, paymentId).catch(
      (e) => console.error("[matchPaymentToUser] ServiceRequest error:", e?.message)
    );

    console.log(
      `[matchPaymentToUser] ✅ payment=${payment.id} → user=${userId} ` +
      `service=${serviceId ?? "none"} amount=${amount}`
    );
    return { success: true, alreadyMatched: false, serviceName };

  } catch (err: any) {
    console.error("[matchPaymentToUser] Unexpected error:", err?.message);
    return { success: false, alreadyMatched: false, error: err?.message ?? "Unknown error" };
  }
}

/**
 * Insert a service_requests row in Supabase after a payment is confirmed.
 * Idempotent on (user_id, service_id, payment_id) — skips duplicate inserts.
 * Skips silently if service_id is absent (e.g. plain subscription with no
 * specific service attached).
 */
export async function createServiceRequest(
  userId: string,
  serviceId: string | undefined | null,
  paymentId: string,
): Promise<void> {
  if (!serviceId) return; // subscription-only payments carry no service_id
  const client = getClient();
  if (!client) return;

  try {
    const { error } = await client.from("service_requests").insert({
      user_id:    userId,
      service_id: serviceId,
      payment_id: paymentId,
      status:     "pending",
    });

    if (error) {
      if (error.code === "23505") {
        console.log(`[ServiceRequest] Already exists for payment=${paymentId} service=${serviceId}`);
        return;
      }
      console.error("[ServiceRequest] Insert error:", error.message);
      return;
    }

    console.log(`[ServiceRequest] Created: user=${userId} service=${serviceId} payment=${paymentId}`);
  } catch (err) {
    console.error("[ServiceRequest] createServiceRequest crash:", err);
  }
}

/**
 * Check whether a user is flagged as suspected fraud in Supabase.
 *
 * Returns true  → payments and payouts must be blocked.
 * Returns false → user is clean (or Supabase is unreachable — fail open).
 *
 * Always queries the `users` table by `id` rather than trusting the in-memory
 * session object, so a flag set during a concurrent request is always caught.
 */
export async function isFraudUser(userId: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false; // fail open — never block a legitimate user on a DB outage

  try {
    const { data, error } = await client
      .from("users")
      .select("suspected_fraud")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[isFraudUser] Supabase error:", error.message);
      return false; // fail open
    }

    return data?.suspected_fraud === true;
  } catch (err: any) {
    console.error("[isFraudUser] Crash:", err?.message);
    return false;
  }
}

/**
 * Upload a CV file buffer to Supabase Storage and write a `cv_uploads` row.
 *
 * Returns the new row's id so callers can pass it downstream (e.g. store in
 * service_requests.input_data so the AI scheduler can stamp improved_cv/score).
 *
 * Falls back gracefully if Storage is not configured — the row is still created,
 * just without a file_url.
 */
export async function logCvUpload(opts: {
  userId:     string;
  fileName?:  string;
  buffer?:    Buffer;
  mimeType?:  string;
  parsedText: string;
}): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  let fileUrl: string | null = null;

  // ── 1. Upload raw file to Supabase Storage ───────────────────────────────
  if (opts.buffer && opts.buffer.length > 0) {
    try {
      const safeName    = (opts.fileName ?? "cv").replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${opts.userId}/${Date.now()}-${safeName}`;
      const { error: uploadErr } = await client.storage
        .from("cv-files")
        .upload(storagePath, opts.buffer, {
          contentType: opts.mimeType ?? "application/octet-stream",
          upsert:      false,
        });

      if (uploadErr) {
        console.warn("[logCvUpload] Storage upload failed:", uploadErr.message);
      } else {
        const { data } = client.storage.from("cv-files").getPublicUrl(storagePath);
        fileUrl = data?.publicUrl ?? null;
      }
    } catch (storageErr: any) {
      console.warn("[logCvUpload] Storage error:", storageErr?.message);
    }
  }

  // ── 2. Insert cv_uploads row ─────────────────────────────────────────────
  try {
    const { data, error } = await client
      .from("cv_uploads")
      .insert({
        user_id:     opts.userId,
        file_name:   opts.fileName  ?? null,
        file_url:    fileUrl,
        parsed_text: opts.parsedText,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[logCvUpload] Insert error:", error.message);
      return null;
    }
    console.log(`[logCvUpload] ✅ id=${data?.id} user=${opts.userId} chars=${opts.parsedText.length} url=${fileUrl ?? "none"}`);
    return data?.id ?? null;
  } catch (err: any) {
    console.error("[logCvUpload] Crash:", err?.message);
    return null;
  }
}

/**
 * Stamp the AI-generated result onto an existing cv_uploads row.
 * Called by the service processor after ATS CV Optimization / CV Rewrite completes.
 */
export async function updateCvUpload(
  cvUploadId: string,
  improvedCv: string,
  score:      number | null,
): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    const { error } = await client
      .from("cv_uploads")
      .update({
        improved_cv: improvedCv,
        score:       score ?? null,
        updated_at:  new Date().toISOString(),
      })
      .eq("id", cvUploadId);

    if (error) {
      console.error("[updateCvUpload] Error:", error.message);
      return;
    }
    console.log(`[updateCvUpload] ✅ id=${cvUploadId} score=${score ?? "n/a"}`);
  } catch (err: any) {
    console.error("[updateCvUpload] Crash:", err?.message);
  }
}

/**
 * Convenience: update the most-recent cv_uploads row for a user.
 * Used when the service_requests row was created without a cv_upload_id link.
 */
export async function updateLatestCvUpload(
  userId:     string,
  improvedCv: string,
  score:      number | null,
): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    const { data: rows } = await client
      .from("cv_uploads")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    const id = rows?.[0]?.id;
    if (!id) {
      console.warn(`[updateLatestCvUpload] No cv_uploads row found for user=${userId}`);
      return;
    }
    await updateCvUpload(id, improvedCv, score);
  } catch (err: any) {
    console.error("[updateLatestCvUpload] Crash:", err?.message);
  }
}

/**
 * Write one row to the `payouts` table immediately after a B2C send attempt.
 * Called by both the commission scheduler and the referral scheduler so every
 * B2C fire has an audit record that the result/timeout callbacks can reconcile.
 *
 * Returns the new row's `id` so the caller can pass it back to Safaricom via
 * the `Occasion` field or store it for later lookup.
 */
export async function logPayout(opts: {
  userId?:                   string;
  phone:                     string;
  amount:                    number;
  occasion?:                 string;
  conversationId?:           string;
  originatorConversationId?: string;
  commissionId?:             string;
  referralId?:               string;
}): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("payouts")
      .insert({
        user_id:                       opts.userId    ?? null,
        phone:                         opts.phone,
        amount:                        opts.amount,
        occasion:                      opts.occasion  ?? null,
        status:                        "sent",
        conversation_id:               opts.conversationId             ?? null,
        originator_conversation_id:    opts.originatorConversationId   ?? null,
        commission_id:                 opts.commissionId               ?? null,
        referral_id:                   opts.referralId                 ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[logPayout] Insert error:", error.message);
      return null;
    }
    console.log(
      `[logPayout] ✅ id=${data?.id} phone=${opts.phone} amount=${opts.amount} ` +
      `convId=${opts.conversationId ?? "?"}`
    );
    return data?.id ?? null;
  } catch (err: any) {
    console.error("[logPayout] Crash:", err?.message);
    return null;
  }
}

/**
 * Reconcile a payout row after Safaricom's B2C result or timeout callback.
 * Finds the row by conversationId and stamps the final status + receipt.
 */
export async function reconcilePayout(
  conversationId: string,
  status: "confirmed" | "failed" | "timed_out",
  opts: { resultCode?: number; receipt?: string; errorMsg?: string } = {},
): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    const { error } = await client
      .from("payouts")
      .update({
        status,
        result_code:  opts.resultCode ?? null,
        receipt:      opts.receipt    ?? null,
        error_msg:    opts.errorMsg   ?? null,
        updated_at:   new Date().toISOString(),
      })
      .eq("conversation_id", conversationId);

    if (error) {
      console.error("[reconcilePayout] Update error:", error.message);
      return;
    }
    console.log(`[reconcilePayout] ${conversationId} → ${status}`);
  } catch (err: any) {
    console.error("[reconcilePayout] Crash:", err?.message);
  }
}

/**
 * Record a referral in Supabase after a new user signs up via a referral link.
 * Idempotent — silently skips if:
 *   • the ref_code does not match any user
 *   • a referral row already exists for this referred_user_id
 *
 * @param refCodeFromURL  The ?ref= value captured from the signup URL
 * @param newUserId       The newly created user's id
 * @param newUserPhone    Optional — stored on the referral row for commission matching
 */
export async function trackReferral(
  refCodeFromURL: string,
  newUserId: string,
  newUserPhone?: string,
): Promise<void> {
  const client = getClient();
  if (!client || !refCodeFromURL?.trim()) return;

  try {
    // 1. Find the referrer by their referral_code
    const { data: referrer } = await client
      .from("users")
      .select("id")
      .eq("referral_code", refCodeFromURL.trim().toUpperCase())
      .single();

    if (!referrer) {
      console.warn(`[Referral] ref_code="${refCodeFromURL}" did not match any user — skipping`);
      return;
    }

    // Self-referral guard
    if (referrer.id === newUserId) {
      console.warn(`[Referral] Self-referral blocked for user=${newUserId}`);
      return;
    }

    // 2. Insert referral row (idempotent via DO NOTHING on referred_user_id)
    const { error: insertErr } = await client.from("referrals").insert({
      referrer_user_id: referrer.id,
      referred_user_id: newUserId,
      ref_code:         refCodeFromURL.trim().toUpperCase(),
      ...(newUserPhone ? { referred_phone: newUserPhone } : {}),
      status: "pending",
    });

    if (insertErr) {
      // Unique constraint violation = already tracked — safe to ignore
      if (insertErr.code === "23505") {
        console.log(`[Referral] Already tracked for referred_user=${newUserId}`);
        return;
      }
      console.error("[Referral] Insert error:", insertErr.message);
      return;
    }

    // 3. Stamp referred_by on the new user row (graceful — column may not exist yet)
    await client
      .from("users")
      .update({ referred_by: referrer.id })
      .eq("id", newUserId)
      .then(({ error }) => {
        if (error) console.warn("[Referral] referred_by update skipped:", error.message);
      });

    console.log(`[Referral] Tracked: referrer=${referrer.id} → referred=${newUserId} code=${refCodeFromURL}`);
  } catch (err) {
    console.error("[Referral] trackReferral crash:", err);
  }
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
  const client = getClient();
  if (!client) return null;
  const MS = days * 24 * 60 * 60 * 1000;
  try {
    const { data: rows } = await client
      .from("user_services")
      .select("id, expires_at")
      .eq("user_id", userId)
      .eq("service_id", serviceId)
      .limit(1);

    const existing = rows?.[0];

    if (existing) {
      const base = existing.expires_at
        ? Math.max(new Date(existing.expires_at).getTime(), Date.now())
        : Date.now();
      const newExpiry = new Date(base + MS);
      const { error } = await client
        .from("user_services")
        .update({ expires_at: newExpiry.toISOString() })
        .eq("id", existing.id);
      if (error) { console.error("extendOrCreate update error:", error.message); return null; }
      console.log(`📅 Extended service=${serviceId} for user=${userId} → ${newExpiry.toISOString()}`);
      return newExpiry;
    }

    const newExpiry = new Date(Date.now() + MS);
    const { error } = await client.from("user_services").insert({
      user_id:    userId,
      service_id: serviceId,
      payment_id: paymentId,
      expires_at: newExpiry.toISOString(),
    });
    if (error) { console.error("extendOrCreate insert error:", error.message); return null; }
    console.log(`🆕 Created service=${serviceId} for user=${userId} → ${newExpiry.toISOString()}`);
    return newExpiry;
  } catch (err) {
    console.error("extendOrCreate crash:", err);
    return null;
  }
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
  const client = getClient();
  if (!client) return false;
  try {
    const { error } = await client.from("user_services").insert({
      user_id:    userId,
      service_id: serviceId,
      payment_id: paymentId,
      expires_at: expiresAt?.toISOString() ?? null,
    });
    if (error) { console.error("grantAccess error:", error.message); return false; }
    return true;
  } catch (err) {
    console.error("grantAccess crash:", err);
    return false;
  }
}

/**
 * Check whether a user has an active time-limited subscription to a service.
 * Requires expires_at to be a real future date — null (lifetime) returns false.
 */
export async function hasSubscription(userId: string, serviceId: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    const { data, error } = await client
      .from("user_services")
      .select("expires_at")
      .eq("user_id", userId)
      .eq("service_id", serviceId);
    if (error) { console.error("hasSubscription error:", error.message); return false; }
    if (!data?.length) return false;
    return new Date(data[0].expires_at) > new Date();
  } catch (err) {
    console.error("hasSubscription crash:", err);
    return false;
  }
}

/**
 * Check whether a user has active access to a service.
 * Active = row exists in user_services AND (expires_at IS NULL OR expires_at > now)
 */
export async function hasAccess(userId: string, serviceId: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    const now = new Date().toISOString();
    const { data, error } = await client
      .from("user_services")
      .select("id, expires_at")
      .eq("user_id", userId)
      .eq("service_id", serviceId)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    if (error) { console.error("hasAccess error:", error.message); return false; }
    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.error("hasAccess crash:", err);
    return false;
  }
}

/**
 * Mirror a promo-code redemption to Supabase.
 * Reads the current `used_count` then writes +1 — acceptable for a mirror
 * because the local DB (storage.usePromoCode) is the atomic source of truth.
 */
export async function incrementPromoUsageInSupabase(code: string): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;

    const { data: promo, error: fetchErr } = await client
      .from("promotions")
      .select("used_count, max_uses")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (fetchErr) {
      console.error("[Supabase] incrementPromoUsageInSupabase fetch error:", fetchErr.message);
      return;
    }
    if (!promo) {
      console.warn(`[Supabase] Promo not found in Supabase mirror: ${code}`);
      return;
    }

    if (promo.max_uses && promo.used_count >= promo.max_uses) {
      console.warn(`[Supabase] Promo ${code.toUpperCase()} already at cap (${promo.used_count}/${promo.max_uses}) — skipping mirror increment`);
      return;
    }

    const { error: updateErr } = await client
      .from("promotions")
      .update({ used_count: (promo.used_count ?? 0) + 1 })
      .eq("code", code.toUpperCase());

    if (updateErr) {
      console.error("[Supabase] incrementPromoUsageInSupabase update error:", updateErr.message);
    } else {
      console.log(`[Supabase] Promo usage incremented: ${code.toUpperCase()} → ${(promo.used_count ?? 0) + 1}`);
    }
  } catch (err) {
    console.error("[Supabase] incrementPromoUsageInSupabase crashed:", err);
  }
}

export async function syncPaymentToSupabase(payment: SupabasePaymentRecord): Promise<void> {
  try {
    console.log("💰 Sending payment to Supabase:", payment);

    const client = getClient();
    if (!client) {
      console.warn("[Supabase] SUPABASE_ANON_KEY is not set — skipping payment sync.");
      return;
    }

    const { data, error } = await client
      .from("payments")
      .insert([
        {
          user_id:       String(payment.user_id),
          phone:         payment.phone       || null,
          amount:        payment.amount,
          mpesa_code:    payment.mpesa_code  || null,
          status:        payment.status,
          service_id:    payment.service_id  || null,
          plan_id:       payment.plan_id     || null,
          base_amount:   payment.base_amount ?? null,
          currency:      payment.currency    || "KES",
          discount_data: payment.discount_data ?? null,
        },
      ])
      .select();

    if (error) {
      console.error("❌ Payment insert error:", error);
    } else {
      console.log("✅ Payment insert success:", data);
    }
  } catch (err) {
    console.error("🔥 Payment sync crash:", err);
  }
}

export async function syncUserToSupabase(user: SupabaseUserRecord): Promise<void> {
  try {
    console.log("🚀 Sending user to Supabase:", user);

    const client = getClient();
    if (!client) {
      console.warn("[Supabase] SUPABASE_ANON_KEY is not set — skipping user sync.");
      return;
    }

    const { data, error } = await client
      .from("users")
      .insert([
        {
          id: String(user.id),
          email: user.email,
          phone: user.phone || null,
        },
      ])
      .select();

    if (error) {
      console.error("❌ Supabase insert error:", error);
    } else {
      console.log("✅ Supabase insert success:", data);
    }
  } catch (err) {
    console.error("🔥 Sync crash:", err);
  }
}
