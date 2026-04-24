/**
 * Firebase RTDB — Server-side REST client.
 * Uses VITE_FIREBASE_DATABASE_URL (shared with frontend).
 * No Firebase Admin SDK needed — plain fetch() to the RTDB REST API.
 *
 * Schema paths written here:
 *   signups/{pushId}              — live signup/upgrade feed
 *   users/{userId}/subscriptions  — plan subscription mirror
 *   users/{userId}/credits/...    — credit balances per service
 *   users/{userId}/payments/{id}  — payment history mirror
 *   users/{userId}/applications/  — job application tracking
 *   revenue/daily/{YYYY-MM-DD}    — daily revenue aggregates
 *   revenue/monthly/{YYYY-MM}     — monthly revenue aggregates
 */

const DB_URL = process.env.VITE_FIREBASE_DATABASE_URL;

/**
 * Firebase Database Secret — used to authenticate server-side REST calls.
 * Set FIREBASE_DATABASE_SECRET in Replit Secrets (Firebase Console →
 * Project Settings → Service Accounts → Database Secrets).
 * When set, the server bypasses security rules (admin write privileges).
 * When absent, writes are unauthenticated (only open paths succeed).
 */
const DB_SECRET = process.env.FIREBASE_DATABASE_SECRET ?? "";

/** Appends ?auth=<secret> when the database secret is configured */
function authParam() {
  return DB_SECRET ? `?auth=${DB_SECRET}` : "";
}

/** Generic REST helpers ─────────────────────────────────────────────────── */

export async function fbPut(path: string, data: unknown) {
  if (!DB_URL) return;
  try {
    const res = await fetch(`${DB_URL}/${path}.json${authParam()}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) console.warn(`[RTDB] PUT ${path} failed:`, res.status, await res.text());
  } catch (err) {
    console.warn(`[RTDB] PUT ${path} error:`, err);
  }
}

export async function fbPost(path: string, data: unknown) {
  if (!DB_URL) return;
  try {
    const res = await fetch(`${DB_URL}/${path}.json${authParam()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) console.warn(`[RTDB] POST ${path} failed:`, res.status, await res.text());
  } catch (err) {
    console.warn(`[RTDB] POST ${path} error:`, err);
  }
}

/**
 * Log an application error to Firebase RTDB for monitoring.
 * @param origin - "backend" (default) or "frontend" — controls the RTDB path
 * Silently swallowed — never throws, never blocks the response.
 */
export async function logErrorToFirebase(
  errorData: {
    type: string;
    code: number | string;
    message: string;
    stack?: string;
    url?: string;
    method?: string;
    user?: string;
    timestamp: string;
    environment?: string;
    [key: string]: unknown;
  },
  origin: "backend" | "frontend" = "backend"
): Promise<void> {
  try {
    await fbPost(`errors/${origin}`, {
      ...errorData,
      resolved: false,
      environment: errorData.environment ?? process.env.NODE_ENV ?? "unknown",
    });
  } catch (e) {
    console.warn("[RTDB] Failed to log error:", e);
  }
}

// ── CV Upload Funnel Tracker ──────────────────────────────────────────────────

export type CvFunnelEvent =
  | "uploaded"      // CV file received & text extracted
  | "analyzed"      // AI insights + job matching complete
  | "viewed_jobs"   // User opened their job results
  | "clicked_apply" // User clicked an Apply link
  | "upgraded";     // User completed a Pro upgrade

export type CvFunnelMeta = Record<string, string | number | boolean | null | undefined>;

/**
 * Track a CV-upload funnel event in Firebase RTDB.
 * Path: analytics/cvFunnel/{userId}/{auto-push-key}
 * Safe to call fire-and-forget — never throws.
 */
export async function trackCvFunnelEvent(
  userId: string,
  event:  CvFunnelEvent,
  meta:   CvFunnelMeta = {}
): Promise<void> {
  if (!DB_URL) return;
  try {
    await fbPost(`analytics/cvFunnel/${encodeURIComponent(userId)}`, {
      event,
      timestamp: Date.now(),
      ...meta,
    });
  } catch (err) {
    console.warn(`[RTDB][CvFunnel] Failed to track '${event}' for ${userId}:`, err);
  }
}

async function fbGet<T = unknown>(path: string): Promise<T | null> {
  if (!DB_URL) return null;
  try {
    const res = await fetch(`${DB_URL}/${path}.json${authParam()}`);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function fbPatch(path: string, data: unknown) {
  if (!DB_URL) return;
  try {
    const res = await fetch(`${DB_URL}/${path}.json${authParam()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) console.warn(`[RTDB] PATCH ${path} failed:`, res.status, await res.text());
  } catch (err) {
    console.warn(`[RTDB] PATCH ${path} error:`, err);
  }
}

/**
 * Atomic multi-path update — equivalent to `database.ref().update(updates)`.
 * All paths are written together in a single REST PATCH to the root.
 * Firebase applies every key atomically: either all writes succeed or none do.
 *
 * @param updates  Flat object keyed by full RTDB paths, e.g.:
 *   { "users/42/payments/REF123": { amount: 4500, ... } }
 */
async function fbMultiPathUpdate(updates: Record<string, unknown>): Promise<void> {
  if (!DB_URL) return;
  try {
    const res = await fetch(`${DB_URL}/.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      console.warn(`[RTDB] multi-path update failed:`, res.status, await res.text());
    }
  } catch (err) {
    console.warn(`[RTDB] multi-path update error:`, err);
  }
}

/**
 * Atomic read-modify-write using Firebase REST ETag transactions.
 * Equivalent to the client SDK's .transaction() — reads current value,
 * applies `updateFn`, and writes back only if nothing changed in between.
 * Retries automatically on concurrent-write conflicts (HTTP 412).
 *
 * @param path      RTDB path (no leading slash)
 * @param updateFn  Pure function: (current) => next
 * @param maxRetries  Number of retry attempts on conflict (default 5)
 */
async function fbTransaction<T>(
  path: string,
  updateFn: (current: T | null) => T,
  maxRetries = 5
): Promise<void> {
  if (!DB_URL) return;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 1. GET with ETag header
      const getRes = await fetch(`${DB_URL}/${path}.json`, {
        headers: { "X-Firebase-ETag": "true" },
      });
      const etag = getRes.headers.get("ETag") ?? "*";
      const current: T | null = getRes.ok ? await getRes.json() : null;

      // 2. Compute next value
      const next = updateFn(current);

      // 3. Conditional PUT — Firebase rejects with 412 if data changed since our GET
      const putRes = await fetch(`${DB_URL}/${path}.json`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": etag,
        },
        body: JSON.stringify(next),
      });

      if (putRes.ok) return; // success

      if (putRes.status === 412) {
        // Concurrent write detected — retry after a short back-off
        const delay = 50 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Any other error — log and bail
      console.warn(`[RTDB] transaction PUT ${path} failed:`, putRes.status, await putRes.text());
      return;
    } catch (err) {
      console.warn(`[RTDB] transaction ${path} error (attempt ${attempt + 1}):`, err);
      if (attempt === maxRetries - 1) return;
    }
  }

  console.warn(`[RTDB] transaction ${path} gave up after ${maxRetries} retries`);
}

/** ── 1. Live signup/upgrade feed ─────────────────────────────────────────── */

export async function pushActivityEvent(
  type: "signup" | "upgrade",
  location: string | null,
  extra?: { firstName?: string; destination?: string }
) {
  if (!DB_URL) return;
  await fbPost("signups", {
    type,
    location: location ?? "Kenya",
    joined: Date.now(),
    ...(extra?.firstName ? { firstName: extra.firstName } : {}),
    ...(extra?.destination ? { destination: extra.destination } : {}),
  });
}

/** ── 2. Mirror subscription into Firebase ───────────────────────────────── */

export async function mirrorSubscription(
  userId: string | number,
  planKey: string,
  opts: {
    status: "active" | "expired";
    startDate: number;
    expiryDate: number;
    paidAmount: number;
    paymentRef: string;
  }
) {
  await fbPut(`users/${userId}/subscriptions/${planKey}`, {
    ...opts,
    autoRenew: false,
  });
}

/** ── 3. Mirror payment into Firebase ────────────────────────────────────── */

export async function mirrorPayment(
  userId: string | number,
  paymentId: string,
  opts: {
    amount: number;
    service: string;
    date: number;
    method: string;
    reference: string;
    status: string;
  }
) {
  await fbPut(`users/${userId}/payments/${paymentId}`, opts);
}

/** ── 4. Allocate credits ─────────────────────────────────────────────────── */

/**
 * Amount-based service routing table — fallback credit allocation.
 * All prices mirror the live `services` table exactly.
 * The primary resolution path uses explicit opts passed to recordPaymentEvent;
 * this map is only consulted when those opts are absent.
 *
 * ⚠️  Keep in sync with: services table (slug, price columns)
 */
export const AMOUNT_SERVICE_MAP: Record<
  number,
  {
    creditType: CreditType;
    credits: number;
    expiryDays: number | null;
    packName: string;
    revenueCategory: string;
  }
> = {
  // ── CV & Document Services ─────────────────────────────────────────────
  99: {
    creditType:      "cv_services",
    credits:         1,
    expiryDays:      null,
    packName:        "CV Fix Lite",
    revenueCategory: "cv_services",
  },
  149: {
    creditType:      "cv_services",
    credits:         1,
    expiryDays:      null,
    packName:        "Cover Letter Writing",
    revenueCategory: "cv_services",
  },
  499: {
    creditType:      "cv_services",
    credits:         1,
    expiryDays:      null,
    packName:        "ATS CV Optimization",
    revenueCategory: "cv_services",
  },
  699: {
    creditType:      "cv_services",
    credits:         1,
    expiryDays:      null,
    packName:        "CV / Motivation Letter",
    revenueCategory: "cv_services",
  },
  799: {
    creditType:      "cv_services",
    credits:         1,
    expiryDays:      null,
    packName:        "ATS + Cover Letter Bundle",
    revenueCategory: "cv_services",
  },
  999: {
    creditType:      "cv_services",
    credits:         1,
    expiryDays:      null,
    packName:        "SOP / Employer Verification",
    revenueCategory: "cv_services",
  },
  // ── Job Applications ───────────────────────────────────────────────────
  500: {
    creditType:      "job_applications",
    credits:         0,
    expiryDays:      365,
    packName:        "Premium Job Alerts",
    revenueCategory: "job_packs",
  },
  1299: {
    creditType:      "job_applications",
    credits:         5,
    expiryDays:      30,
    packName:        "Job Pack — 5 Applications",
    revenueCategory: "job_packs",
  },
  1499: {
    creditType:      "job_applications",
    credits:         1,
    expiryDays:      null,
    packName:        "Assisted Apply Lite",
    revenueCategory: "job_packs",
  },
  1999: {
    creditType:      "job_applications",
    credits:         8,
    expiryDays:      30,
    packName:        "Job Pack — 8 Applications",
    revenueCategory: "job_packs",
  },
  2999: {
    creditType:      "job_applications",
    credits:         15,
    expiryDays:      30,
    packName:        "Job Pack — 15 Applications",
    revenueCategory: "job_packs",
  },
  // ── Coaching & Consulting ──────────────────────────────────────────────
  300: {
    creditType:      "cv_services",
    credits:         0,
    expiryDays:      null,
    packName:        "Emergency Support",
    revenueCategory: "consultation_fees",
  },
  1000: {
    creditType:      "cv_services",
    credits:         0,
    expiryDays:      null,
    packName:        "Premium WhatsApp Support",
    revenueCategory: "consultation_fees",
  },
  1200: {
    creditType:      "cv_services",
    credits:         0,
    expiryDays:      null,
    packName:        "Employment Contract Review",
    revenueCategory: "consultation_fees",
  },
  1500: {
    creditType:      "cv_services",
    credits:         0,
    expiryDays:      null,
    packName:        "Interview Coaching",
    revenueCategory: "consultation_fees",
  },
  2000: {
    creditType:      "cv_services",
    credits:         0,
    expiryDays:      null,
    packName:        "Interview Prep Pack",
    revenueCategory: "consultation_fees",
  },
  2500: {
    creditType:      "cv_services",
    credits:         0,
    expiryDays:      null,
    packName:        "Guided Apply Mode",
    revenueCategory: "consultation_fees",
  },
  3000: {
    creditType:      "cv_services",
    credits:         0,
    expiryDays:      null,
    packName:        "LinkedIn / Visa Guidance",
    revenueCategory: "consultation_fees",
  },
  // ── Subscription Plans ────────────────────────────────────────────────
  4500: {
    creditType:      "job_applications",
    credits:         0,          // handled separately via mirrorSubscription
    expiryDays:      365,        // Yearly Access (365 days)
    packName:        "Yearly Access",
    revenueCategory: "subscription_fees",
  },
};

/**
 * recordPaymentEvent — the single function that should be called after every
 * confirmed M-Pesa / PayPal payment.  It does everything your snippet's
 * `processMpesaPayment` did but fully server-side and race-safe:
 *
 *   1. Allocates credits via atomic ETag transaction (no double-spend)
 *   2. Writes payment record + (optional) subscription atomically via
 *      multi-path update — either both land or neither does
 *   3. Updates daily + monthly revenue counters via atomic transactions
 *
 * @param opts.creditType      Override auto-detected credit type if needed
 * @param opts.creditCount     Override auto-detected credit count if needed
 * @param opts.expiryDays      Override expiry; pass 0 for no expiry
 * @param opts.packName        Label shown in the credits widget
 * @param opts.serviceLabel    Human-readable name for payment history
 * @param opts.subscriptionKey If set, writes users/{id}/subscriptions/{key} too
 */
export async function recordPaymentEvent(opts: {
  userId: string | number;
  paymentId: string;
  amountKes: number;
  reference: string;
  method: "mpesa" | "paypal" | string;
  creditType?: CreditType;
  creditCount?: number;
  expiryDays?: number | null;
  packName?: string;
  serviceType?: string;
  serviceLabel?: string;
  serviceId?: string | null;
  subscriptionKey?: string;
  subscriptionExpiryMs?: number;
}): Promise<void> {
  const {
    userId, paymentId, amountKes, reference, method,
    serviceId, subscriptionKey, subscriptionExpiryMs,
  } = opts;

  const now = Date.now();

  // Resolve credit params — use explicit overrides, fall back to amount map
  const mapped = AMOUNT_SERVICE_MAP[amountKes];
  const creditType  = opts.creditType  ?? mapped?.creditType  ?? "job_applications";
  const creditCount = opts.creditCount ?? mapped?.credits     ?? 0;
  const expiryDays  = opts.expiryDays  !== undefined ? opts.expiryDays : (mapped?.expiryDays ?? null);
  const packName    = opts.packName    ?? mapped?.packName    ?? "";
  const serviceLabel = opts.serviceLabel ?? packName;
  const expiryDate  = expiryDays != null ? now + expiryDays * 86_400_000 : null;

  // ── Step 1: Allocate credits (atomic transaction per type) ──────────────
  if (creditCount > 0) {
    await allocateCredits(userId, creditType, {
      total: creditCount,
      purchasedDate: now,
      expiryDate,
      paidAmount: amountKes,
      paymentRef: reference,
      ...(packName     ? { packName }               : {}),
      ...(opts.serviceType ? { serviceType: opts.serviceType } : {}),
    });
  }

  // ── Step 2: Write payment record + optional subscription atomically ─────
  const writes: Record<string, unknown> = {
    [`users/${userId}/payments/${paymentId}`]: {
      amount:    amountKes,
      service:   serviceLabel,
      date:      now,
      method:    method === "mpesa" ? "M-Pesa" : method,
      reference,
      status:    "completed",
    },
  };

  if (subscriptionKey && subscriptionExpiryMs) {
    writes[`users/${userId}/subscriptions/${subscriptionKey}`] = {
      status:     "active",
      startDate:  now,
      expiryDate: subscriptionExpiryMs,
      paidAmount: amountKes,
      paymentRef: reference,
      autoRenew:  false,
    };
  }

  await fbMultiPathUpdate(writes);

  // ── Step 3: Revenue counters (atomic transactions) ──────────────────────
  await trackRevenue({
    userId,
    amountKes,
    serviceId: serviceId ?? subscriptionKey ?? packName,
    method,
    reference,
  });

  // ── Step 4: Increment totalSpent for this user (atomic) ─────────────────
  await fbTransaction<number>(`users/${userId}/totalSpent`, (current) => {
    return (current ?? 0) + amountKes;
  });

  console.log(
    `[RTDB][recordPaymentEvent] userId=${userId} | KES ${amountKes} | ` +
    `credits=${creditCount}×${creditType} | ref=${reference}`
  );
}

export type CreditType =
  | "job_applications"
  | "student_applications"
  | "cv_services"
  | "university_applications"
  | "employer_verification";

interface CreditData {
  total: number;
  used: number;
  remaining: number;
  packName?: string;
  serviceType?: string;
  purchasedDate: number;
  expiryDate?: number | null;
  paidAmount: number;
  paymentRef: string;
}

export async function allocateCredits(
  userId: string | number,
  creditType: CreditType,
  data: Omit<CreditData, "used" | "remaining">
) {
  const path = `users/${userId}/credits/${creditType}`;

  // Atomic — uses ETag transaction so concurrent purchases never overwrite each other
  await fbTransaction<CreditData>(path, (existing) => {
    const prev = existing || { total: 0, used: 0, remaining: 0 } as CreditData;
    const newTotal = prev.total + data.total;
    const newRemaining = prev.remaining + data.total;
    return {
      ...data,
      total: newTotal,
      used: prev.used,
      remaining: newRemaining,
    };
  });

  console.log(`[RTDB][Credits] userId=${userId} | type=${creditType} | +${data.total} allocated`);
}

/** ── 5. Decrement a credit ──────────────────────────────────────────────── */

export async function decrementCredit(
  userId: string | number,
  creditType: CreditType
): Promise<{ ok: boolean; remaining: number }> {
  const path = `users/${userId}/credits/${creditType}`;
  const existing = await fbGet<CreditData>(path);

  if (!existing || existing.remaining <= 0) {
    return { ok: false, remaining: 0 };
  }

  const updated = {
    ...existing,
    used: existing.used + 1,
    remaining: existing.remaining - 1,
  };

  await fbPut(path, updated);
  return { ok: true, remaining: updated.remaining };
}

/** ── 6. Record a job application ────────────────────────────────────────── */

export async function recordJobApplicationFB(
  userId: string | number,
  app: {
    jobTitle: string;
    employer: string;
    country: string;
    status?: string;
  }
) {
  const result = await decrementCredit(userId, "job_applications");
  if (!result.ok) throw new Error("No job application credits remaining");

  await fbPost(`users/${userId}/applications`, {
    ...app,
    status: app.status || "submitted",
    submittedDate: Date.now(),
    creditUsed: true,
    creditType: "job_applications",
  });

  return result.remaining;
}

/** ── 7. Revenue tracking ─────────────────────────────────────────────────── */

type RevenueCategory =
  | "consultation_fees"
  | "job_packs"
  | "cv_services"
  | "university_applications"
  | "other";

function inferRevenueCategory(serviceId: string | null | undefined): RevenueCategory {
  if (!serviceId) return "other";
  const s = serviceId.toLowerCase();
  if (s.includes("plan_") || s.includes("subscription") || s.includes("pro")) return "consultation_fees";
  if (s.includes("job") || s.includes("application")) return "job_packs";
  if (s.includes("cv")) return "cv_services";
  if (s.includes("university") || s.includes("student")) return "university_applications";
  return "other";
}

export async function trackRevenue(opts: {
  userId: string | number;
  amountKes: number;
  serviceId?: string | null;
  method: string;
  reference: string;
  date?: Date; // optional override for backfilling historical payments
}) {
  const { amountKes, serviceId, reference, date } = opts;
  const category = inferRevenueCategory(serviceId);
  const now = date ?? new Date();
  const dateKey = now.toISOString().slice(0, 10);   // YYYY-MM-DD
  const monthKey = now.toISOString().slice(0, 7);   // YYYY-MM

  type DailyRecord = {
    total: number;
    consultation_fees: number;
    job_packs: number;
    cv_services: number;
    university_applications: number;
    other: number;
    transactions: number;
    [key: string]: number;
  };

  type MonthlyRecord = {
    total: number;
    transactions: number;
    consultation_fees: number;
    job_packs: number;
    cv_services: number;
    university_applications: number;
    other: number;
    [key: string]: number;
  };

  // Atomic daily update — equivalent to client SDK .transaction()
  await fbTransaction<DailyRecord>(
    `revenue/daily/${dateKey}`,
    (current) => {
      const day = current ?? {
        total: 0,
        consultation_fees: 0,
        job_packs: 0,
        cv_services: 0,
        university_applications: 0,
        other: 0,
        transactions: 0,
      };
      return {
        ...day,
        total: (day.total || 0) + amountKes,
        [category]: (day[category] || 0) + amountKes,
        transactions: (day.transactions || 0) + 1,
      };
    }
  );

  // Atomic monthly rollup — same pattern
  await fbTransaction<MonthlyRecord>(
    `revenue/monthly/${monthKey}`,
    (current) => {
      const month = current ?? {
        total: 0,
        transactions: 0,
        consultation_fees: 0,
        job_packs: 0,
        cv_services: 0,
        university_applications: 0,
        other: 0,
      };
      return {
        ...month,
        total: (month.total || 0) + amountKes,
        transactions: (month.transactions || 0) + 1,
        [category]: (month[category] || 0) + amountKes,
      };
    }
  );

  console.log(`[RTDB][Revenue] ${dateKey} | ${category} +KES ${amountKes} | ref=${reference}`);
}

/** ── 8. Subscription expiry mirror ──────────────────────────────────────── */

export async function expireSubscriptionFB(userId: string | number, planKey: string) {
  await fbPatch(`users/${userId}/subscriptions/${planKey}`, { status: "expired" });
}

/** ── 9. Expose fbPatch for external callers (e.g. status callbacks) ─────── */
export { fbPatch };

/** ── 10a. CV Analysis — store WhatsApp CV scan results ─────────────────── */

export interface CvAnalysisRecord {
  phoneNumber: string;
  userId?: string | number;
  analyzedAt: number;
  // Core matching fields
  skills: string[];
  jobTitles: string[];
  experienceYears: number;
  education: string[];
  industries: string[];
  // Extended profile fields
  profession?: string;
  seniority?: string;
  certifications?: string[];
  languages?: string[];
  visaEligibility?: string;
  recommendedCountries?: string[];
  salaryExpectation?: string;
  summary?: string;
  topMatches: Array<{
    id: string;
    title: string;
    company: string;
    country: string;
    matchScore: number;
    matchReason: string;
    salary: string | null;
  }>;
  rawTextLength: number;
  fileName?: string | null;
}

/**
 * Store CV analysis result in Firebase RTDB at /cvAnalysis/{phoneKey}.
 * Phone key: non-alphanumeric chars replaced with underscores so it is a
 * valid Firebase path segment (e.g. +254712345678 → _254712345678).
 */
export async function storeCvAnalysis(
  phoneNumber: string,
  record: Omit<CvAnalysisRecord, "phoneNumber">
): Promise<void> {
  const safeKey = phoneNumber.replace(/[^a-zA-Z0-9]/g, "_");
  await fbPut(`cvAnalysis/${safeKey}`, { ...record, phoneNumber });
}

/** ── 10. Nanjila conversation logging + daily analytics ─────────────────── */

/**
 * Log every Nanjila WhatsApp conversation to Firebase RTDB.
 *
 * Writes to TWO paths in one operation:
 *   • nanjila/conversations/{pushId}  — full conversation record
 *   • nanjila/daily/{YYYY-MM-DD}      — daily metric counters
 *
 * Also maintains the legacy whatsappConversations path for backwards compat.
 */
export async function logWhatsAppMessage(opts: {
  phoneNumber: string;
  userMessage: string;
  aiResponse:  string;
  intent:      string;
  escalated:   boolean;
  audioSent?:  boolean;
}) {
  const { phoneNumber, userMessage, aiResponse, intent, escalated, audioSent = false } = opts;
  const resolved = !escalated;
  const now = Date.now();
  const dateKey = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // 1. Push full conversation record to nanjila/conversations
  await fbPost("nanjila/conversations", {
    phoneNumber,
    userMessage,
    nanjilaResponse: aiResponse,
    audioSent,
    intent,
    timestamp: now,
    escalated,
    resolved,
  });

  // 2. Atomic daily counters at nanjila/daily/{YYYY-MM-DD}
  type NanjilaDaily = {
    total: number;
    resolved: number;
    escalated: number;
    [intent: string]: number;
  };

  await fbTransaction<NanjilaDaily>(
    `nanjila/daily/${dateKey}`,
    (current) => {
      const day = current ?? { total: 0, resolved: 0, escalated: 0 };
      return {
        ...day,
        total:     (day.total     ?? 0) + 1,
        resolved:  (day.resolved  ?? 0) + (resolved  ? 1 : 0),
        escalated: (day.escalated ?? 0) + (escalated ? 1 : 0),
        [intent]:  ((day[intent]  ?? 0) + 1),
      };
    }
  );

}

/**
 * Read daily Nanjila metrics from Firebase RTDB.
 * Returns today's stats plus the last N days for trending.
 */
export async function getNanjilaMetrics(days = 7): Promise<{
  today: { total: number; resolved: number; escalated: number; resolutionRate: string };
  history: { date: string; total: number; resolved: number; escalated: number; resolutionRate: string }[];
}> {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86_400_000);
    dates.push(d.toISOString().split("T")[0]);
  }

  const records = await Promise.all(
    dates.map(async (date) => {
      const data = await fbGet<{ total: number; resolved: number; escalated: number }>(`nanjila/daily/${date}`);
      const total     = data?.total     ?? 0;
      const resolved  = data?.resolved  ?? 0;
      const escalated = data?.escalated ?? 0;
      const resolutionRate = total > 0 ? ((resolved / total) * 100).toFixed(1) + "%" : "N/A";
      return { date, total, resolved, escalated, resolutionRate };
    })
  );

  const [todayRecord, ...historyRest] = records;
  return { today: todayRecord, history: records };
}

/** ── 11. Scheduled cleanup — prune unbounded Firebase collections ────────── */

/**
 * Delete entries older than `maxAgeDays` from an append-only Firebase path.
 * Works by reading the whole collection and issuing multi-path deletions for
 * any entry whose timestamp field is older than the cutoff.
 *
 * Paths cleaned:
 *   signups/              — timestamped by `joined`
 *   errors/backend        — timestamped by `timestamp`
 *   errors/frontend       — timestamped by `timestamp`
 *   nanjila/conversations — timestamped by `timestamp`
 *   pendingIntake/        — expires via `expiresAt` field (1-hour TTL set at write time)
 */
export async function pruneFirebaseCollections(maxAgeDays = 30): Promise<void> {
  if (!DB_URL) return;

  const now    = Date.now();
  const cutoff = now - maxAgeDays * 86_400_000;

  // Age-based paths: delete entries whose tsField < cutoff
  const agePaths: Array<{ path: string; tsField: string }> = [
    { path: "signups",               tsField: "joined"    },
    { path: "errors/backend",        tsField: "timestamp" },
    { path: "errors/frontend",       tsField: "timestamp" },
    { path: "nanjila/conversations", tsField: "timestamp" },
  ];

  for (const { path, tsField } of agePaths) {
    try {
      const data = await fbGet<Record<string, Record<string, unknown>>>(path);
      if (!data) continue;

      const deletions: Record<string, null> = {};
      for (const [key, entry] of Object.entries(data)) {
        const ts = Number((entry as any)[tsField] ?? 0);
        if (ts > 0 && ts < cutoff) {
          deletions[`${path}/${key}`] = null;
        }
      }

      const count = Object.keys(deletions).length;
      if (count === 0) continue;

      await fbMultiPathUpdate(deletions);
      console.log(`[RTDB][Prune] ${path}: deleted ${count} records older than ${maxAgeDays}d`);
    } catch (err: any) {
      console.warn(`[RTDB][Prune] ${path} failed:`, err.message);
    }
  }

  // Expiry-based paths: delete entries whose expiresAt field < now
  // (TTL is set at write time per record — not a fixed max age)
  const expiryPaths: Array<{ path: string; expiresField: string }> = [
    { path: "pendingIntake", expiresField: "expiresAt" },
  ];

  for (const { path, expiresField } of expiryPaths) {
    try {
      const data = await fbGet<Record<string, Record<string, unknown>>>(path);
      if (!data) continue;

      const deletions: Record<string, null> = {};
      for (const [key, entry] of Object.entries(data)) {
        const exp = Number((entry as any)[expiresField] ?? 0);
        if (exp > 0 && exp < now) {
          deletions[`${path}/${key}`] = null;
        }
      }

      const count = Object.keys(deletions).length;
      if (count === 0) continue;

      await fbMultiPathUpdate(deletions);
      console.log(`[RTDB][Prune] ${path}: deleted ${count} expired records`);
    } catch (err: any) {
      console.warn(`[RTDB][Prune] ${path} failed:`, err.message);
    }
  }
}

let _pruneTimer: NodeJS.Timeout | null = null;

/**
 * Start a daily scheduler that prunes old records from unbounded Firebase paths.
 * Safe to call multiple times — only starts one timer.
 */
export function startFirebasePruneScheduler(maxAgeDays = 30): void {
  if (_pruneTimer) return;

  const RUN_EVERY_MS = 24 * 60 * 60 * 1000; // once per day

  // Run once at startup (deferred by 2 min so server is fully warm)
  const warmup = setTimeout(() => {
    pruneFirebaseCollections(maxAgeDays).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
  }, 2 * 60 * 1000);

  _pruneTimer = setInterval(() => {
    pruneFirebaseCollections(maxAgeDays).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
  }, RUN_EVERY_MS);

  console.log(`[RTDB][Prune] Daily scheduler started — retention=${maxAgeDays}d`);
}
