import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, jsonb, serial, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

// Chat conversations (for AI integrations)
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ─── Payment pipeline status lifecycle ──────────────────────────────────────
// Canonical states (required for every payment record):
//   "pending"   — record created; waiting for gateway confirmation
//   "success"   — gateway confirmed payment; plan upgraded; audit trail stamped
//   "completed" — legacy alias for "success" (kept for backward compat with old rows)
//   "failed"    — payment rejected, underpayment, fraud, or user not found
//
// Internal transit states (set by M-Pesa STK push only, not exposed externally):
//   "awaiting_payment" — STK push sent, waiting for user PIN
//   "retry_available"  — failed but eligible for auto-retry (M-Pesa only)
//   "expired"          — STK push timed out before user confirmed
//   "refund_pending"   — overpayment detected, refund queued
//   "refunded"         — refund completed
export const PAYMENT_STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  COMPLETED: "completed", // legacy — use SUCCESS for new payments
  FAILED: "failed",
} as const;

/** Returns true for any confirmed-payment status (success or legacy "completed"). */
export function isPaymentSuccess(status: string | null | undefined): boolean {
  return status === "success" || status === "completed";
}

export const payments = pgTable("payments", {
  // ── Required identity fields ──────────────────────────────────────────────
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),     // session user — always present
  email: varchar("email"),                   // payer email — captured at initiation from users.email
  amount: integer("amount").notNull(),       // KES amount
  currency: varchar("currency").notNull().default("KES"),

  // ── Plan / Service identifier ────────────────────────────────────────────
  // Canonical slug for what was purchased — set at initiation, never changes.
  // Subscription plans:  "pro" | "basic" | "standard"
  // Individual services: "ats_cv_optimization" | "visa_consultation" | any service slug
  planId: varchar("plan_id"),
  // Discount audit — populated at payment creation from resolveCanonicalPlanPrice().
  // baseAmount = pre-discount DB price; discountType = "referral_20" | null.
  // null on both means no discount applied (or non-plan payment).
  baseAmount: integer("base_amount"),       // raw plan price before any discount
  discountType: varchar("discount_type"),   // "referral_20" | null

  // ── Gateway ───────────────────────────────────────────────────────────────
  method: varchar("method").notNull(),       // "mpesa" | "paypal"
  phone: varchar("phone"),                   // payer phone — E.164 e.g. 254712345678 (M-Pesa); null for PayPal
  paymentSource: varchar("payment_source"),  // "web" — origin platform; null = web
  transactionRef: varchar("transaction_ref"), // legacy: CheckoutRequestID (M-Pesa) or PayPal order ID
  checkoutRequestId: varchar("checkout_request_id"), // Safaricom STK CheckoutRequestID — used to match callbacks
  mpesaCode: varchar("mpesa_code"),          // confirmed M-Pesa receipt/transaction code e.g. "RBN123ABC456"
  mpesaReceiptNumber: varchar("mpesa_receipt_number"), // legacy alias for mpesaCode

  // ── Status ────────────────────────────────────────────────────────────────
  status: varchar("status").notNull().default("pending"), // see PAYMENT_STATUS above
  // ── Delivery ─────────────────────────────────────────────────────────────
  // Tracks whether the purchased service/plan was actually delivered after payment.
  // Set independently of `status` so a payment can be "success" but "needs_review".
  //   null / "pending"      — payment succeeded; delivery not yet attempted or confirmed
  //   "delivered"           — plan activated or service unlocked successfully
  //   "needs_review"        — could not be matched/delivered automatically; admin action required
  deliveryStatus: varchar("delivery_status"),

  // ── Audit ─────────────────────────────────────────────────────────────────
  serviceId: varchar("service_id"),          // "plan_basic" | "plan_pro" | service UUID
  serviceName: varchar("service_name"),      // human-readable label, e.g. "ATS CV Optimization" — stored at creation, never requires a JOIN
  metadata: varchar("metadata"),             // JSON: phone, checkoutRequestId, refCode, etc.
  failReason: varchar("fail_reason"),        // human-readable failure reason
  isSuspicious: boolean("is_suspicious").notNull().default(false),
  fraudReason: varchar("fraud_reason"),
  paymentMethod: varchar("payment_method").default("mpesa"), // "mpesa" | "paypal"
  reference: varchar("reference"),                           // human-readable reference / receipt alias

  // ── Provider Verification ─────────────────────────────────────────────────
  // Set by verifyPayment.ts after querying the gateway (M-Pesa STK Query / PayPal Get Order)
  verifiedAt: timestamp("verified_at"),
  verificationStatus: varchar("verification_status"),
  // "verified"        — gateway confirmed payment is COMPLETED and amounts match
  // "suspicious"      — gateway returned non-zero / status mismatch — isSuspicious=true, NO upgrade
  // "mismatch"        — amounts or capture status don't match stored record
  // "api_unavailable" — gateway could not be reached; upgrade proceeds with warning
  // "skipped"         — verification not attempted (e.g. manual payments)
  verificationNote: varchar("verification_note", { length: 500 }),

  // ── Retry (M-Pesa only) ───────────────────────────────────────────────────
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  lastRetryAt: timestamp("last_retry_at"),

  // ── Timing audit ─────────────────────────────────────────────────────────
  callbackReceivedAt: timestamp("callback_received_at"),  // when Safaricom callback arrived
  statusLastChecked: timestamp("status_last_checked"),    // last STK Query API call time
  queryAttempts: integer("query_attempts").notNull().default(0), // number of STK Query attempts

  // ── Idempotency ───────────────────────────────────────────────────────────
  // Set atomically by markPaymentProcessed() — UPDATE WHERE processed = false RETURNING id.
  // Any callback that loses the race gets false back and returns immediately,
  // preventing duplicate plan activations on Safaricom retries or parallel webhooks.
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at"),

  // ── Pricing engine audit ─────────────────────────────────────────────────
  // Populated at payment creation from resolvePrice(). Null when not applicable.
  promoCode: varchar("promo_code"),      // promo code submitted by the user at checkout
  country: varchar("country", { length: 5 }), // ISO-3166 country code passed at initiation
  // Flash sale / discount breakdown
  originalPrice:   integer("original_price"),   // base price before flash sale
  paidPrice:       integer("paid_price"),        // actual amount charged (=finalPrice)
  discountApplied: integer("discount_applied"),  // KES saved (originalPrice - paidPrice)

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payment Retry Logs — one row per retry attempt
export const paymentRetryLogs = pgTable("payment_retry_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentId: varchar("payment_id").notNull(),
  attempt: integer("attempt").notNull(),           // 1-based retry number
  gateway: varchar("gateway").notNull(),            // "mpesa" | "paypal"
  result: varchar("result").notNull(),              // "success" | "failed" | "error"
  gatewayRef: varchar("gateway_ref"),               // CheckoutRequestID or PayPal order ID
  errorMessage: text("error_message"),              // Error detail when result != success
  metadata: varchar("metadata"),                    // JSON: phone, amount, etc.
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertPaymentRetryLogSchema = createInsertSchema(paymentRetryLogs).omit({ id: true, createdAt: true });
export type PaymentRetryLog = typeof paymentRetryLogs.$inferSelect;
export type InsertPaymentRetryLog = z.infer<typeof insertPaymentRetryLogSchema>;

// Payment audit log — structured record of every security event in the payment lifecycle.
// Each STK push, callback, validation failure, and query result gets a row here.
export const paymentAuditLogs = pgTable("payment_audit_logs", {
  id: serial("id").primaryKey(),
  paymentId: varchar("payment_id"),         // FK to payments.id (nullable for orphan callbacks)
  event: varchar("event", { length: 60 }).notNull(), // stk_push_initiated | awaiting_payment | callback_received | suspicious_callback | duplicate_receipt | phone_mismatch | amount_mismatch | stk_query_confirmed | stk_query_failed | payment_confirmed | payment_failed | payment_expired
  ip: varchar("ip", { length: 60 }),
  metadata: varchar("metadata"),             // JSON string — amounts, phones, IDs, result codes
  createdAt: timestamp("created_at").defaultNow(),
});
export type PaymentAuditLog = typeof paymentAuditLogs.$inferSelect;

// Refund requests — users submit these when they believe they are owed a refund.
// Admin reviews, approves/rejects, then marks as processed after B2C payout.
export const refundRequests = pgTable("refund_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentId: varchar("payment_id").notNull(),   // FK to payments.id
  userId: varchar("user_id").notNull(),
  reason: text("reason").notNull(),             // User's stated reason
  // Valid states: pending | approved | rejected | processed
  status: varchar("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),              // Admin's internal notes
  reviewedBy: varchar("reviewed_by"),           // Admin userId who acted
  reviewedAt: timestamp("reviewed_at"),
  processedAt: timestamp("processed_at"),       // When B2C payout was sent
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertRefundRequestSchema = createInsertSchema(refundRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRefundRequest = z.infer<typeof insertRefundRequestSchema>;
export type RefundRequest = typeof refundRequests.$inferSelect;

// M-Pesa transactions tracking
export const mpesaUsers = pgTable("mpesa_users", {
  id: serial("id").primaryKey(),
  phone: varchar("phone", { length: 15 }).notNull(),
  amount: integer("amount").notNull(),
  mpesaReceipt: varchar("mpesa_receipt", { length: 50 }).unique(), // Prevent duplicate receipts
  transactionDate: timestamp("transaction_date"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
});

export const insertMpesaUserSchema = createInsertSchema(mpesaUsers).omit({ id: true });
export type InsertMpesaUser = z.infer<typeof insertMpesaUserSchema>;
export type MpesaUser = typeof mpesaUsers.$inferSelect;

export const countries = pgTable("countries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  code: varchar("code").notNull().unique(),
  flagEmoji: varchar("flag_emoji").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const countryGuides = pgTable("country_guides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryId: varchar("country_id").notNull(),
  section: varchar("section").notNull(),
  content: text("content").notNull(),
});

export const jobLinks = pgTable("job_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryId: varchar("country_id").notNull(),
  name: varchar("name").notNull(),
  url: varchar("url").notNull(),
  description: varchar("description"), // Brief description of the portal
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0), // Track popularity
  lastVerified: timestamp("last_verified").defaultNow(), // When we last checked this portal
});

export const scamAlerts = pgTable("scam_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  countryId: varchar("country_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Human-readable stable identifier used in payment flows (e.g. "ats_cv_optimization").
  // Unique where set; rows inserted before this column existed will have null.
  slug: varchar("slug").unique(),
  // Canonical payment code — mirrors slug, used in all price lookups: WHERE code = $1
  code: varchar("code").unique(),
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(),
  currency: varchar("currency").notNull().default("KES"),
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
  // Enhanced display fields
  category: varchar("category").default("General"), // CV & Documents, Interview & Profile, Legal & Verification, Subscriptions
  badge: varchar("badge"), // Popular, New, Best Value, etc.
  features: jsonb("features").$type<string[]>(), // bullet points shown on card
  isSubscription: boolean("is_subscription").notNull().default(false),
  subscriptionPeriod: varchar("subscription_period"), // monthly, annual
  // Flash sale / discount engine
  flashSale:       boolean("flash_sale").notNull().default(false),
  discountPercent: integer("discount_percent").notNull().default(0), // 1–80
  saleStart:       timestamp("sale_start", { withTimezone: true }),
  saleEnd:         timestamp("sale_end",   { withTimezone: true }),
});

// Subscription plan tiers
export const plans = pgTable("plans", {
  planId: varchar("plan_id").primaryKey(),
  planName: varchar("plan_name").notNull(),
  price: integer("price").notNull().default(0),
  features: jsonb("features").notNull().default([]),
  description: text("description"),
  badge: varchar("badge"),
  currency: varchar("currency").notNull().default("KES"),
  billingPeriod: varchar("billing_period").notNull().default("annual"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertPlanSchema = createInsertSchema(plans).omit({ createdAt: true, updatedAt: true });
export const updatePlanSchema = insertPlanSchema.partial().omit({ planId: true });
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type UpdatePlan = z.infer<typeof updatePlanSchema>;

// ─── Promo Codes ────────────────────────────────────────────────────────────
// DB-driven discount codes redeemable at checkout.
// Supports two discount models:
//   "pct"       — percentage off  (discountValue = 0-100, e.g. 15 = 15% off)
//   "fixed_kes" — flat KES deduction (discountValue = amount, e.g. 500 = KES 500 off)
// appliesToPlan null  = code works for any plan
//              non-null = code is plan-specific (e.g. "pro")
export const promoCodes = pgTable("promo_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  discountType: varchar("discount_type", { length: 20 }).notNull(), // "pct" | "fixed_kes"
  discountValue: integer("discount_value").notNull(),
  appliesToPlan: varchar("applies_to_plan", { length: 100 }), // null = all plans
  maxUses: integer("max_uses"),            // null = unlimited
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),      // null = never expires
  active: boolean("active").notNull().default(true),
  createdBy: varchar("created_by"),        // admin userId who created it
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({
  id: true, usedCount: true, createdAt: true, updatedAt: true,
});
export const updatePromoCodeSchema = insertPromoCodeSchema.partial().omit({ code: true });
export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;

export const userSubscriptions = pgTable("user_subscriptions", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:    varchar("user_id").notNull(),
  paymentId: varchar("payment_id"),                                         // nullable — admin grants have no payment
  plan:      varchar("plan").notNull().default("free"),                      // "free" | "basic" | "pro"
  status:    varchar("status").notNull().default("active"),                  // "active" | "expired" | "canceled" | "trialing"
  startDate: timestamp("start_date").defaultNow(),
  endDate:   timestamp("end_date"),                                          // null = lifetime / no expiry
  autoRenew: boolean("auto_renew").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Per-service unlock records — one row per service unlocked per user
// serviceId "main_subscription" = core Career Consultation Access (KES 4,500)
export const userServices = pgTable("user_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  serviceId: varchar("service_id").notNull(),   // FK to services.id or "main_subscription"
  paymentId: varchar("payment_id").notNull(),   // FK to payments.id
  unlockedAt: timestamp("unlocked_at").defaultNow(),
  expiresAt: timestamp("expires_at"),           // null = lifetime access
  metadata: varchar("metadata"),                // JSON — extra context (receipt, method, etc.)
});
export const insertUserServiceSchema = createInsertSchema(userServices).omit({ id: true, unlockedAt: true });
export type UserService = typeof userServices.$inferSelect;
export type InsertUserService = z.infer<typeof insertUserServiceSchema>;

// Tracks service fulfilment work items raised after a successful payment.
// status: pending → in_progress → completed | cancelled
export const serviceRequests = pgTable("service_requests", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:      varchar("user_id").notNull(),
  serviceId:   varchar("service_id").notNull(),
  paymentId:   varchar("payment_id"),           // traceability back to the payment
  status:      varchar("status", { length: 20 }).notNull().default("pending"),
  notes:       varchar("notes"),                // admin / fulfilment notes
  inputData:   varchar("input_data"),           // JSON: intake fields from the user
  outputData:  varchar("output_data"),          // JSON: AI-generated result
  errorMsg:    varchar("error_msg"),            // last error message if failed
  retryCount:  integer("retry_count").notNull().default(0),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
});
export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type ServiceRequest    = typeof serviceRequests.$inferSelect;
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;

// Audit log for every B2C send attempt (referral + commission payouts).
// status: sent → confirmed | failed | timed_out
export const payouts = pgTable("payouts", {
  id:                         varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:                     varchar("user_id"),
  phone:                      varchar("phone").notNull(),
  amount:                     integer("amount").notNull(),
  occasion:                   varchar("occasion"),
  status:                     varchar("status", { length: 20 }).notNull().default("sent"),
  conversationId:             varchar("conversation_id"),
  originatorConversationId:   varchar("originator_conversation_id"),
  commissionId:               varchar("commission_id"),
  referralId:                 varchar("referral_id"),
  resultCode:                 integer("result_code"),
  receipt:                    varchar("receipt"),
  errorMsg:                   varchar("error_msg"),
  createdAt:                  timestamp("created_at").defaultNow(),
  updatedAt:                  timestamp("updated_at").defaultNow(),
});
export const insertPayoutSchema = createInsertSchema(payouts).omit({ id: true, createdAt: true, updatedAt: true });
export type Payout       = typeof payouts.$inferSelect;
export type InsertPayout = z.infer<typeof insertPayoutSchema>;

// Permanent record of every uploaded CV — links raw text, Storage URL,
// and (once the paid service runs) the AI-improved version + ATS score.
export const cvUploads = pgTable("cv_uploads", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:      varchar("user_id").notNull(),
  fileName:    varchar("file_name"),
  fileUrl:     varchar("file_url"),
  parsedText:  text("parsed_text").notNull(),
  improvedCv:  text("improved_cv"),
  score:       integer("score"),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
});
export const insertCvUploadSchema = createInsertSchema(cvUploads).omit({ id: true, createdAt: true, updatedAt: true });
export type CvUpload       = typeof cvUploads.$inferSelect;
export type InsertCvUpload = z.infer<typeof insertCvUploadSchema>;

export const adminLogs = pgTable("admin_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  action: varchar("action").notNull(),
  target: varchar("target"),
  timestamp: timestamp("timestamp").defaultNow(),
  ipAddress: varchar("ip_address"),
});

export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  event: varchar("event", { length: 64 }).notNull(),
  userId: varchar("user_id"),
  email: varchar("email"),
  meta: jsonb("meta"),
  ip: varchar("ip"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export const neaAgencies = pgTable("nea_agencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyName: varchar("agency_name").notNull(),
  licenseNumber: varchar("license_number").notNull().unique(),
  email: varchar("email"),
  website: varchar("website"),
  serviceType: varchar("service_type"),
  issueDate: timestamp("issue_date").notNull(),
  expiryDate: timestamp("expiry_date").notNull(),
  statusOverride: varchar("status_override"),
  notes: text("notes"),
  isPublished: boolean("is_published").notNull().default(true),
  lastUpdated: timestamp("last_updated").defaultNow(),
  updatedBy: varchar("updated_by"),
  lastNotified30Days: timestamp("last_notified_30_days"),
  lastNotified7Days: timestamp("last_notified_7_days"),
  lastNotifiedExpired: timestamp("last_notified_expired"),
  claimedByUserId: varchar("claimed_by_user_id"),
  claimedAt: timestamp("claimed_at"),
  isVerifiedOwner: boolean("is_verified_owner").notNull().default(false),
  verifiedOwnerAt: timestamp("verified_owner_at"),
  latitude: varchar("latitude"),
  longitude: varchar("longitude"),
  country: varchar("country"),
  city: varchar("city"),
});

export const agencyReports = pgTable("agency_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id"),
  agencyName: varchar("agency_name").notNull(),
  reporterEmail: varchar("reporter_email"),
  reporterPhone: varchar("reporter_phone"),
  description: text("description").notNull(),
  status: varchar("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agencyClaims = pgTable("agency_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  agencyName: varchar("agency_name").notNull(),
  licenseNumber: varchar("license_number").notNull(),
  userId: varchar("user_id").notNull(),
  contactName: varchar("contact_name").notNull(),
  contactEmail: varchar("contact_email").notNull(),
  contactPhone: varchar("contact_phone"),
  role: varchar("role").notNull(), // 'owner', 'director', 'manager', 'authorized_rep'
  status: varchar("status").notNull().default("pending"), // pending, approved, rejected
  proofFiles: jsonb("proof_files").default([]), // [{filename, path, mimetype, size}]
  proofDescription: text("proof_description"),
  reviewedBy: varchar("reviewed_by"),
  reviewNotes: text("review_notes"),
  reviewedAt: timestamp("reviewed_at"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAgencyClaimSchema = createInsertSchema(agencyClaims).omit({ id: true, submittedAt: true, updatedAt: true, reviewedAt: true });
export type AgencyClaim = typeof agencyClaims.$inferSelect;
export type InsertAgencyClaim = z.infer<typeof insertAgencyClaimSchema>;

export const agencyNotifications = pgTable("agency_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  agencyName: varchar("agency_name").notNull(),
  licenseNumber: varchar("license_number").notNull(),
  type: varchar("type").notNull(), // 'expiring_soon' (30 days), 'expiring_very_soon' (7 days), 'expired'
  expiryDate: timestamp("expiry_date").notNull(),
  daysLeft: integer("days_left").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminSettings = pgTable("admin_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Agency premium add-ons
export const agencyAddOns = pgTable("agency_add_ons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  addOnType: varchar("add_on_type").notNull(), // 'homepage_banner', 'country_exposure', 'verified_badge', 'profile_page', 'click_analytics'
  price: integer("price").notNull(),
  countryId: varchar("country_id"), // For country-specific exposure
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  paymentRef: varchar("payment_ref"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by"),
});

// Agency click tracking for analytics
export const agencyClicks = pgTable("agency_clicks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  source: varchar("source").notNull(), // 'homepage_banner', 'search_result', 'country_page', 'profile_page'
  ipHash: varchar("ip_hash"), // Hashed for privacy
  userAgent: text("user_agent"),
  referrer: varchar("referrer"),
  clickedAt: timestamp("clicked_at").defaultNow(),
});

// Agency profile pages for premium subscribers
export const agencyProfiles = pgTable("agency_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull().unique(),
  description: text("description"),
  phone: varchar("phone"),
  email: varchar("email"),
  website: varchar("website"),
  address: text("address"),
  services: text("services"), // JSON array of services offered
  countries: text("countries"), // JSON array of destination countries
  bannerImageUrl: varchar("banner_image_url"),
  logoUrl: varchar("logo_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Service orders for career services
export const serviceOrders = pgTable("service_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  serviceId: varchar("service_id").notNull(),
  serviceName: varchar("service_name").notNull(),
  amount: integer("amount").notNull(),
  currency: varchar("currency").notNull().default("KES"),
  status: varchar("status").notNull().default("pending"), // pending, paid, intake_required, processing, completed, cancelled
  paymentMethod: varchar("payment_method"),
  paymentRef: varchar("payment_ref"),
  intakeData: jsonb("intake_data"), // JSON with form responses
  adminNotes: text("admin_notes"),
  assignedTo: varchar("assigned_to"),
  completedAt: timestamp("completed_at"),
  userNotifiedAt: timestamp("user_notified_at"),
  // AI Processing fields
  aiProcessedAt: timestamp("ai_processed_at"),
  aiOutput: jsonb("ai_output"), // AI-generated content (CV, cover letter, etc.)
  qualityScore: integer("quality_score"), // 0-100 quality score
  qualityPassed: boolean("quality_passed"),
  qualityCheckData: jsonb("quality_check_data"), // Detailed quality check results
  needsHumanReview: boolean("needs_human_review").notNull().default(false),
  humanReviewNotes: text("human_review_notes"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  abandonedCartAlertSentAt: timestamp("abandoned_cart_alert_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Service order deliverables (completed files for download)
export const serviceDeliverables = pgTable("service_deliverables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  fileName: varchar("file_name").notNull(),
  fileType: varchar("file_type").notNull(),
  fileSize: integer("file_size"),
  fileUrl: varchar("file_url").notNull(), // Base64 or URL to stored file
  description: text("description"),
  downloadCount: integer("download_count").notNull().default(0),
  uploadedBy: varchar("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User notifications for order updates
export const userNotifications = pgTable("user_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  orderId: varchar("order_id"),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  type: varchar("type").notNull().default("info"), // info, success, warning, order_update
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// User notification preferences
export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  pushNotifications: boolean("push_notifications").notNull().default(true),
  applicationUpdates: boolean("application_updates").notNull().default(true),
  jobAlerts: boolean("job_alerts").notNull().default(true),
  marketingEmails: boolean("marketing_emails").notNull().default(false),
  weeklyDigest: boolean("weekly_digest").notNull().default(true),
  quietHoursStart: varchar("quiet_hours_start").default("22:00"), // Don't send after 10 PM
  quietHoursEnd: varchar("quiet_hours_end").default("08:00"), // Until 8 AM
  maxDailyNotifications: integer("max_daily_notifications").notNull().default(5),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Notification templates for consistent, non-intrusive copy
export const notificationTemplates = pgTable("notification_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateKey: varchar("template_key").notNull().unique(), // e.g., "application_submitted", "materials_ready"
  category: varchar("category").notNull(), // "application", "job_alert", "reminder", "promotional"
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  pushTitle: varchar("push_title"), // Shorter version for push
  pushMessage: text("push_message"), // Shorter version for push
  priority: varchar("priority").notNull().default("normal"), // low, normal, high
  cooldownMinutes: integer("cooldown_minutes").notNull().default(0), // Min time between same notification type
  isActive: boolean("is_active").notNull().default(true),
});

// Push notification subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Job counts per country for real-time alerts
export const jobCounts = pgTable("job_counts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryCode: varchar("country_code").notNull().unique(),
  countryName: varchar("country_name").notNull(),
  jobCount: integer("job_count").notNull().default(0),
  previousCount: integer("previous_count").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
  updatedBy: varchar("updated_by"),
});

// Scheduled notifications for job postings
export const scheduledNotifications = pgTable("scheduled_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  body: text("body").notNull(),
  url: varchar("url"),
  countryId: varchar("country_id"),
  type: varchar("type").notNull().default("job_posting"), // job_posting, deadline, announcement
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  recipientCount: integer("recipient_count").default(0),
  status: varchar("status").notNull().default("pending"), // pending, sent, cancelled
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Student Visa Information
export const studentVisas = pgTable("student_visas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryCode: varchar("country_code").notNull(),
  visaType: varchar("visa_type").notNull(),
  visaName: varchar("visa_name").notNull(),
  description: text("description").notNull(),
  processingTime: varchar("processing_time"),
  validityPeriod: varchar("validity_period"),
  applicationFee: varchar("application_fee"),
  ageRequirement: varchar("age_requirement"),
  workRights: varchar("work_rights"),
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
});

// Student Visa Requirements/Documents
export const visaRequirements = pgTable("visa_requirements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  visaId: varchar("visa_id").notNull(),
  category: varchar("category").notNull(), // academic, financial, english, health, other
  requirement: text("requirement").notNull(),
  isRequired: boolean("is_required").notNull().default(true),
  order: integer("order").notNull().default(0),
});

// Student Visa Application Steps
export const visaSteps = pgTable("visa_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  visaId: varchar("visa_id").notNull(),
  stepNumber: integer("step_number").notNull(),
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  estimatedTime: varchar("estimated_time"),
  tips: text("tips"),
});

// Useful Links for Student Visas
export const visaLinks = pgTable("visa_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  visaId: varchar("visa_id"),
  countryCode: varchar("country_code"),
  linkType: varchar("link_type").notNull(), // official, university, scholarship, embassy
  name: varchar("name").notNull(),
  url: varchar("url").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
});

export const countriesRelations = relations(countries, ({ many }) => ({
  guides: many(countryGuides),
  jobLinks: many(jobLinks),
  scamAlerts: many(scamAlerts),
}));

export const countryGuidesRelations = relations(countryGuides, ({ one }) => ({
  country: one(countries, {
    fields: [countryGuides.countryId],
    references: [countries.id],
  }),
}));

export const jobLinksRelations = relations(jobLinks, ({ one }) => ({
  country: one(countries, {
    fields: [jobLinks.countryId],
    references: [countries.id],
  }),
}));

export const scamAlertsRelations = relations(scamAlerts, ({ one }) => ({
  country: one(countries, {
    fields: [scamAlerts.countryId],
    references: [countries.id],
  }),
}));

// Referral tracking
export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  refCode: varchar("ref_code", { length: 50 }).notNull(),
  referredPhone: varchar("referred_phone", { length: 15 }).notNull().unique(), // Prevent duplicate referrals
  paymentAmount: integer("payment_amount").notNull().default(4500),
  commission: integer("commission").notNull().default(450),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  transactionId: varchar("transaction_id", { length: 100 }),
  retryCount: integer("retry_count").notNull().default(0),
  lastPayoutAttempt: timestamp("last_payout_attempt"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReferralSchema = createInsertSchema(referrals).omit({ id: true, createdAt: true, paidAt: true, transactionId: true });
export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = z.infer<typeof insertReferralSchema>;

// Influencer program (invite-only)
export const influencers = pgTable("influencers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 15 }).notNull(),
  email: varchar("email", { length: 255 }),
  refCode: varchar("ref_code", { length: 50 }).notNull().unique(),
  commissionRate: integer("commission_rate").notNull().default(10), // Percentage
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, approved, rejected, suspended
  inviteCode: varchar("invite_code", { length: 50 }),
  totalReferrals: integer("total_referrals").notNull().default(0),
  totalEarnings: integer("total_earnings").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
});

export const insertInfluencerSchema = createInsertSchema(influencers).omit({ id: true, createdAt: true, approvedAt: true, totalReferrals: true, totalEarnings: true });
export type Influencer = typeof influencers.$inferSelect;
export type InsertInfluencer = z.infer<typeof insertInfluencerSchema>;

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertCountrySchema = createInsertSchema(countries).omit({ id: true });
export const insertCountryGuideSchema = createInsertSchema(countryGuides).omit({ id: true });
export const insertJobLinkSchema = createInsertSchema(jobLinks).omit({ id: true });
export const insertScamAlertSchema = createInsertSchema(scamAlerts).omit({ id: true, createdAt: true });
export const insertServiceSchema = createInsertSchema(services).omit({ id: true });
export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions).omit({ id: true, createdAt: true, updatedAt: true, startDate: true });
export const insertAdminLogSchema = createInsertSchema(adminLogs).omit({ id: true, timestamp: true });
export const insertNeaAgencySchema = createInsertSchema(neaAgencies).omit({ id: true, lastUpdated: true });
export const insertAgencyReportSchema = createInsertSchema(agencyReports).omit({ id: true, createdAt: true });
export const insertAgencyNotificationSchema = createInsertSchema(agencyNotifications).omit({ id: true, createdAt: true });
export const insertAgencyAddOnSchema = createInsertSchema(agencyAddOns).omit({ id: true, createdAt: true });
export const insertAgencyClickSchema = createInsertSchema(agencyClicks).omit({ id: true, clickedAt: true });
export const insertAgencyProfileSchema = createInsertSchema(agencyProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServiceOrderSchema = createInsertSchema(serviceOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServiceDeliverableSchema = createInsertSchema(serviceDeliverables).omit({ id: true, createdAt: true });
export const insertUserNotificationSchema = createInsertSchema(userNotifications).omit({ id: true, createdAt: true });
export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNotificationTemplateSchema = createInsertSchema(notificationTemplates).omit({ id: true });
export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScheduledNotificationSchema = createInsertSchema(scheduledNotifications).omit({ id: true, createdAt: true });
export const insertJobCountSchema = createInsertSchema(jobCounts).omit({ id: true, lastUpdated: true });
export const insertStudentVisaSchema = createInsertSchema(studentVisas).omit({ id: true });
export const insertVisaRequirementSchema = createInsertSchema(visaRequirements).omit({ id: true });
export const insertVisaStepSchema = createInsertSchema(visaSteps).omit({ id: true });
export const insertVisaLinkSchema = createInsertSchema(visaLinks).omit({ id: true });

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Country = typeof countries.$inferSelect;
export type InsertCountry = z.infer<typeof insertCountrySchema>;
export type CountryGuide = typeof countryGuides.$inferSelect;
export type InsertCountryGuide = z.infer<typeof insertCountryGuideSchema>;
export type JobLink = typeof jobLinks.$inferSelect;
export type InsertJobLink = z.infer<typeof insertJobLinkSchema>;
export type ScamAlert = typeof scamAlerts.$inferSelect;
export type InsertScamAlert = z.infer<typeof insertScamAlertSchema>;
export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;
export type AdminLog = typeof adminLogs.$inferSelect;
export type InsertAdminLog = z.infer<typeof insertAdminLogSchema>;
export type NeaAgency = typeof neaAgencies.$inferSelect;
export type InsertNeaAgency = z.infer<typeof insertNeaAgencySchema>;
export type AgencyReport = typeof agencyReports.$inferSelect;
export type InsertAgencyReport = z.infer<typeof insertAgencyReportSchema>;
export type AgencyNotification = typeof agencyNotifications.$inferSelect;
export type InsertAgencyNotification = z.infer<typeof insertAgencyNotificationSchema>;
export type AgencyAddOn = typeof agencyAddOns.$inferSelect;
export type InsertAgencyAddOn = z.infer<typeof insertAgencyAddOnSchema>;
export type AgencyClick = typeof agencyClicks.$inferSelect;
export type InsertAgencyClick = z.infer<typeof insertAgencyClickSchema>;
export type AgencyProfile = typeof agencyProfiles.$inferSelect;
export type InsertAgencyProfile = z.infer<typeof insertAgencyProfileSchema>;
export type ServiceOrder = typeof serviceOrders.$inferSelect;
export type InsertServiceOrder = z.infer<typeof insertServiceOrderSchema>;
export type ServiceDeliverable = typeof serviceDeliverables.$inferSelect;
export type InsertServiceDeliverable = z.infer<typeof insertServiceDeliverableSchema>;
export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = z.infer<typeof insertUserNotificationSchema>;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;
export type NotificationTemplate = typeof notificationTemplates.$inferSelect;
export type InsertNotificationTemplate = z.infer<typeof insertNotificationTemplateSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type ScheduledNotification = typeof scheduledNotifications.$inferSelect;
export type InsertScheduledNotification = z.infer<typeof insertScheduledNotificationSchema>;
export type JobCount = typeof jobCounts.$inferSelect;
export type InsertJobCount = z.infer<typeof insertJobCountSchema>;

export type CountryWithDetails = Country & {
  guides: CountryGuide[];
  jobLinks: JobLink[];
  scamAlerts: ScamAlert[];
};
export type StudentVisa = typeof studentVisas.$inferSelect;
export type InsertStudentVisa = z.infer<typeof insertStudentVisaSchema>;
export type VisaRequirement = typeof visaRequirements.$inferSelect;
export type InsertVisaRequirement = z.infer<typeof insertVisaRequirementSchema>;
export type VisaStep = typeof visaSteps.$inferSelect;
export type InsertVisaStep = z.infer<typeof insertVisaStepSchema>;
export type VisaLink = typeof visaLinks.$inferSelect;
export type InsertVisaLink = z.infer<typeof insertVisaLinkSchema>;

export type StudentVisaWithDetails = StudentVisa & {
  requirements: VisaRequirement[];
  steps: VisaStep[];
  links: VisaLink[];
};

// ============================================
// COUNTRY INSIGHTS - Unique Value Data
// ============================================

export const countryInsights = pgTable("country_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryCode: varchar("country_code").notNull().unique(),
  // Salary data
  avgSalaryUsd: integer("avg_salary_usd"), // Average annual salary in USD
  minWageUsd: integer("min_wage_usd"), // Minimum wage in USD/month
  topPayingJobs: jsonb("top_paying_jobs"), // Array of { job: string, salaryRange: string }
  // Cost of living
  costOfLivingIndex: integer("cost_of_living_index"), // Index (100 = baseline)
  rentAvgUsd: integer("rent_avg_usd"), // Average monthly rent
  mealCostUsd: integer("meal_cost_usd"), // Average meal cost
  // Visa & Work permits
  workVisaTypes: jsonb("work_visa_types"), // Array of { name, processingTime, cost, requirements }
  visaDifficulty: varchar("visa_difficulty"), // easy, moderate, difficult
  processingTimeWeeks: integer("processing_time_weeks"),
  // Job market
  unemploymentRate: varchar("unemployment_rate"),
  demandSectors: jsonb("demand_sectors"), // Array of high-demand sectors
  growthRate: varchar("growth_rate"), // Job market growth
  // Living conditions
  qualityOfLifeScore: integer("quality_of_life_score"), // 1-100
  safetyScore: integer("safety_score"), // 1-100
  healthcareScore: integer("healthcare_score"), // 1-100
  languages: jsonb("languages"), // Official/business languages
  timezone: varchar("timezone"),
  // Tips
  proTips: jsonb("pro_tips"), // Array of insider tips
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================
// ADVISORS & CONSULTATION BOOKING
// ============================================

export const advisors = pgTable("advisors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  title: varchar("title").notNull(), // e.g., "Senior Career Consultant"
  specialization: varchar("specialization"), // e.g., "Canada Immigration", "Healthcare Jobs"
  bio: text("bio"),
  photoUrl: varchar("photo_url"),
  experience: integer("experience"), // Years of experience
  successRate: integer("success_rate"), // Percentage
  consultationsCompleted: integer("consultations_completed").default(0),
  rating: integer("rating").default(50), // 1-50 (5.0 stars * 10)
  languages: jsonb("languages"), // Array of languages spoken
  availability: jsonb("availability"), // Weekly availability schedule
  whatsappNumber: varchar("whatsapp_number"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const consultationBookings = pgTable("consultation_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  advisorId: varchar("advisor_id"),
  userName: varchar("user_name"),
  userEmail: varchar("user_email"),
  userPhone: varchar("user_phone"),
  scheduledDate: timestamp("scheduled_date").notNull(),
  duration: integer("duration").default(30),
  status: varchar("status").default("pending"), // pending, confirmed, completed, cancelled, no_show
  topic: varchar("topic"),
  notes: text("notes"),
  advisorNotes: text("advisor_notes"),
  reminderSent: boolean("reminder_sent").default(false),
  whatsappSent: boolean("whatsapp_sent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================
// SUCCESS STORIES & TESTIMONIALS
// ============================================

export const successStories = pgTable("success_stories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  location: varchar("location"), // e.g., "Nairobi → Toronto"
  countryCode: varchar("country_code"), // Destination country
  jobTitle: varchar("job_title"),
  company: varchar("company"),
  photoUrl: varchar("photo_url"),
  story: text("story").notNull(),
  quote: text("quote"), // Short testimonial quote
  rating: integer("rating").default(5), // 1-5 stars
  salaryIncrease: varchar("salary_increase"), // e.g., "3x salary increase"
  timeToJob: varchar("time_to_job"), // e.g., "Got job in 2 months"
  isVerified: boolean("is_verified").default(false),
  isFeatured: boolean("is_featured").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas and types for new tables
export const insertCountryInsightsSchema = createInsertSchema(countryInsights).omit({ id: true, updatedAt: true });
export const insertAdvisorSchema = createInsertSchema(advisors).omit({ id: true, createdAt: true, consultationsCompleted: true });
export const insertConsultationBookingSchema = createInsertSchema(consultationBookings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSuccessStorySchema = createInsertSchema(successStories).omit({ id: true, createdAt: true });

export type CountryInsights = typeof countryInsights.$inferSelect;
export type InsertCountryInsights = z.infer<typeof insertCountryInsightsSchema>;
export type Advisor = typeof advisors.$inferSelect;
export type InsertAdvisor = z.infer<typeof insertAdvisorSchema>;
export type ConsultationBooking = typeof consultationBookings.$inferSelect;
export type InsertConsultationBooking = z.infer<typeof insertConsultationBookingSchema>;
export type SuccessStory = typeof successStories.$inferSelect;
export type InsertSuccessStory = z.infer<typeof insertSuccessStorySchema>;

// ============================================
// ASSISTED APPLY MODE TABLES
// ============================================

// Application Packs - Pricing tiers for assisted application service
export const applicationPacks = pgTable("application_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(),
  currency: varchar("currency").notNull().default("KES"),
  applicationCount: integer("application_count").notNull(), // Number of job applications included
  features: jsonb("features").notNull(), // Array of feature strings
  turnaroundDays: integer("turnaround_days").notNull().default(3),
  isPopular: boolean("is_popular").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
  packType: varchar("pack_type").notNull().default("job"), // "job" or "student"
  targetAudience: text("target_audience"), // Description of who this pack is for
  successRate: varchar("success_rate"), // e.g., "85% interview rate"
  createdAt: timestamp("created_at").defaultNow(),
});

// User Application Pack Purchases
export const userApplicationPacks = pgTable("user_application_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  packId: varchar("pack_id").notNull(),
  packName: varchar("pack_name").notNull(),
  totalApplications: integer("total_applications").notNull(),
  usedApplications: integer("used_applications").notNull().default(0),
  amount: integer("amount").notNull(),
  currency: varchar("currency").notNull().default("KES"),
  paymentMethod: varchar("payment_method"),
  paymentRef: varchar("payment_ref"),
  status: varchar("status").notNull().default("pending"), // pending, paid, active, exhausted, expired
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User Job Applications - Individual application tracking
export const userJobApplications = pgTable("user_job_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  userPackId: varchar("user_pack_id").notNull(), // Links to purchased pack
  // Job details (collected during intake)
  jobTitle: varchar("job_title").notNull(),
  companyName: varchar("company_name").notNull(),
  jobUrl: varchar("job_url").notNull(),
  targetCountry: varchar("target_country").notNull(),
  jobDescription: text("job_description"),
  applicationDeadline: timestamp("application_deadline"),
  // Application materials
  intakeData: jsonb("intake_data"), // User's profile info, resume, etc.
  preparedMaterials: jsonb("prepared_materials"), // CV, cover letter prepared by team
  // Status tracking
  status: varchar("status").notNull().default("submitted"), // submitted, queued, analyzing, generating, preparing, materials_ready, downloaded, failed, user_action_required, applied, confirmed, rejected, interview_scheduled
  statusMessage: text("status_message"),
  adminNotes: text("admin_notes"),
  assignedTo: varchar("assigned_to"),
  // Timestamps
  userAppliedAt: timestamp("user_applied_at"), // When user marked as applied
  confirmedAt: timestamp("confirmed_at"), // When we confirmed application received
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Application Status History - For notifications and tracking
export const applicationStatusHistory = pgTable("application_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").notNull(),
  previousStatus: varchar("previous_status"),
  newStatus: varchar("new_status").notNull(),
  message: text("message"),
  changedBy: varchar("changed_by"), // admin user id or 'system'
  notificationSent: boolean("notification_sent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas for Assisted Apply Mode
export const insertApplicationPackSchema = createInsertSchema(applicationPacks).omit({ id: true, createdAt: true });
export const insertUserApplicationPackSchema = createInsertSchema(userApplicationPacks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserJobApplicationSchema = createInsertSchema(userJobApplications).omit({ id: true, createdAt: true, updatedAt: true });
export const insertApplicationStatusHistorySchema = createInsertSchema(applicationStatusHistory).omit({ id: true, createdAt: true });

// Types for Assisted Apply Mode
export type ApplicationPack = typeof applicationPacks.$inferSelect;
export type InsertApplicationPack = z.infer<typeof insertApplicationPackSchema>;
export type UserApplicationPack = typeof userApplicationPacks.$inferSelect;
export type InsertUserApplicationPack = z.infer<typeof insertUserApplicationPackSchema>;
export type UserJobApplication = typeof userJobApplications.$inferSelect;
export type InsertUserJobApplication = z.infer<typeof insertUserJobApplicationSchema>;
export type ApplicationStatusHistory = typeof applicationStatusHistory.$inferSelect;
export type InsertApplicationStatusHistory = z.infer<typeof insertApplicationStatusHistorySchema>;

// Application status constants
export const APPLICATION_STATUSES = {
  SUBMITTED: "submitted",
  PREPARING: "preparing",
  MATERIALS_READY: "materials_ready",
  USER_ACTION_REQUIRED: "user_action_required",
  APPLIED: "applied",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
  INTERVIEW_SCHEDULED: "interview_scheduled",
} as const;

export type ApplicationStatus = typeof APPLICATION_STATUSES[keyof typeof APPLICATION_STATUSES];

// Security: Account lockout tracking for failed payment attempts
export const accountLockouts = pgTable("account_lockouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  identifier: varchar("identifier").notNull(), // IP address or user ID
  identifierType: varchar("identifier_type").notNull(), // 'ip' or 'user'
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lastFailedAt: timestamp("last_failed_at"),
  lockedUntil: timestamp("locked_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAccountLockoutSchema = createInsertSchema(accountLockouts).omit({ id: true, createdAt: true, updatedAt: true });
export type AccountLockout = typeof accountLockouts.$inferSelect;
export type InsertAccountLockout = z.infer<typeof insertAccountLockoutSchema>;

// Security: Webhook idempotency - prevent duplicate processing
export const webhookProcessingLocks = pgTable("webhook_processing_locks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lockKey: varchar("lock_key").notNull().unique(), // Unique identifier (e.g., CheckoutRequestID)
  webhookType: varchar("webhook_type").notNull(), // 'mpesa_stk', 'mpesa_b2c', etc.
  status: varchar("status").notNull().default("processing"), // 'processing', 'completed', 'failed'
  processedAt: timestamp("processed_at"),
  expiresAt: timestamp("expires_at").notNull(), // Lock expiry for stale locks
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWebhookProcessingLockSchema = createInsertSchema(webhookProcessingLocks).omit({ id: true, createdAt: true });
export type WebhookProcessingLock = typeof webhookProcessingLocks.$inferSelect;
export type InsertWebhookProcessingLock = z.infer<typeof insertWebhookProcessingLockSchema>;

// Self-tracked applications - Users manually track jobs they apply to
export const trackedApplications = pgTable("tracked_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  // Job details
  jobTitle: varchar("job_title").notNull(),
  companyName: varchar("company_name").notNull(),
  jobUrl: varchar("job_url"),
  targetCountry: varchar("target_country").notNull(),
  salary: varchar("salary"), // Expected/listed salary
  location: varchar("location"), // Specific city/region
  jobType: varchar("job_type"), // full-time, part-time, contract
  source: varchar("source"), // Where they found it (platform name)
  // Status tracking
  status: varchar("status").notNull().default("saved"), // saved, applied, interviewing, offered, accepted, rejected, withdrawn
  appliedAt: timestamp("applied_at"),
  // User notes and reminders
  notes: text("notes"),
  deadline: timestamp("deadline"),              // Application/submission deadline set by user
  nextFollowUp: timestamp("next_follow_up"),
  reminderSent: boolean("reminder_sent").notNull().default(false),
  // Bulk apply enrichment
  coverLetter: text("cover_letter"),
  applicationAnswers: jsonb("application_answers"), // [{question, answer}]
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tracked application status constants (simpler than Assisted Apply)
export const TRACKED_APP_STATUSES = {
  SAVED: "saved",
  APPLIED: "applied",
  INTERVIEWING: "interviewing",
  OFFERED: "offered",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  WITHDRAWN: "withdrawn",
} as const;

export type TrackedAppStatus = typeof TRACKED_APP_STATUSES[keyof typeof TRACKED_APP_STATUSES];

export const insertTrackedApplicationSchema = createInsertSchema(trackedApplications).omit({ id: true, createdAt: true, updatedAt: true });
export type TrackedApplication = typeof trackedApplications.$inferSelect;
export type InsertTrackedApplication = z.infer<typeof insertTrackedApplicationSchema>;

// ==================== ANALYTICS ====================

// Analytics events - tracks all user actions
export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"), // null for anonymous users
  sessionId: varchar("session_id").notNull(), // browser session tracking
  eventType: varchar("event_type").notNull(), // page_view, button_click, form_submit, etc.
  eventName: varchar("event_name").notNull(), // specific event name
  eventCategory: varchar("event_category").notNull(), // navigation, conversion, engagement
  eventData: jsonb("event_data"), // additional context as JSON
  page: varchar("page"), // current page path
  referrer: varchar("referrer"), // where user came from
  userAgent: varchar("user_agent"),
  deviceType: varchar("device_type"), // mobile, tablet, desktop
  country: varchar("country"), // geo location if available
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({ id: true, createdAt: true });
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;

// Conversion funnel tracking
export const conversionEvents = pgTable("conversion_events", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  sessionId: varchar("session_id").notNull(),
  funnelStep: varchar("funnel_step").notNull(), // landing_view, signup, payment_started, payment_completed, dashboard_access
  completedAt: timestamp("completed_at").defaultNow(),
  metadata: jsonb("metadata"), // additional context
});

export const insertConversionEventSchema = createInsertSchema(conversionEvents).omit({ id: true, completedAt: true });
export type ConversionEvent = typeof conversionEvents.$inferSelect;
export type InsertConversionEvent = z.infer<typeof insertConversionEventSchema>;

// Daily aggregated stats for dashboard
export const dailyStats = pgTable("daily_stats", {
  id: serial("id").primaryKey(),
  date: varchar("date").notNull().unique(), // YYYY-MM-DD format
  pageViews: integer("page_views").notNull().default(0),
  uniqueVisitors: integer("unique_visitors").notNull().default(0),
  signups: integer("signups").notNull().default(0),
  paymentsStarted: integer("payments_started").notNull().default(0),
  paymentsCompleted: integer("payments_completed").notNull().default(0),
  revenue: integer("revenue").notNull().default(0), // in KES
  jobLinkClicks: integer("job_link_clicks").notNull().default(0),
  serviceOrders: integer("service_orders").notNull().default(0),
  // Conversion rates (stored as percentages * 100 for precision)
  signupRate: integer("signup_rate").notNull().default(0), // visitors to signups
  paymentRate: integer("payment_rate").notNull().default(0), // signups to payments
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDailyStatsSchema = createInsertSchema(dailyStats).omit({ id: true, createdAt: true, updatedAt: true });
export type DailyStats = typeof dailyStats.$inferSelect;
export type InsertDailyStats = z.infer<typeof insertDailyStatsSchema>;

// Funnel step constants
export const FUNNEL_STEPS = {
  LANDING_VIEW: "landing_view",
  SIGNUP: "signup",
  PAYMENT_STARTED: "payment_started",
  PAYMENT_COMPLETED: "payment_completed",
  DASHBOARD_ACCESS: "dashboard_access",
  JOB_LINK_CLICK: "job_link_click",
  SERVICE_ORDER: "service_order",
} as const;

export type FunnelStep = typeof FUNNEL_STEPS[keyof typeof FUNNEL_STEPS];

// Event categories
export const EVENT_CATEGORIES = {
  NAVIGATION: "navigation",
  CONVERSION: "conversion",
  ENGAGEMENT: "engagement",
  ERROR: "error",
} as const;

export type EventCategory = typeof EVENT_CATEGORIES[keyof typeof EVENT_CATEGORIES];

// User Career Profiles for AI Matching
export const userCareerProfiles = pgTable("user_career_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  // Professional Background
  currentJobTitle: varchar("current_job_title"),
  yearsExperience: integer("years_experience"),
  educationLevel: varchar("education_level"), // high_school, diploma, bachelors, masters, phd
  fieldOfStudy: varchar("field_of_study"),
  skills: jsonb("skills").$type<string[]>().default([]),
  certifications: jsonb("certifications").$type<string[]>().default([]),
  languages: jsonb("languages").$type<{ language: string; proficiency: string }[]>().default([]),
  // Preferences
  preferredCountries: jsonb("preferred_countries").$type<string[]>().default([]),
  preferredIndustries: jsonb("preferred_industries").$type<string[]>().default([]),
  salaryExpectation: integer("salary_expectation"), // Monthly in USD
  willingToRelocate: boolean("willing_to_relocate").default(true),
  familySize: integer("family_size").default(1),
  // Immigration readiness
  hasPassport: boolean("has_passport").default(false),
  passportExpiry: timestamp("passport_expiry"),
  hasWorkExperienceAbroad: boolean("has_work_experience_abroad").default(false),
  // Stored CV text — saved after a successful ATS check so subsequent
  // application generation has access to the user's actual CV content.
  parsedCvText:  text("parsed_cv_text"),
  cvLastParsed:  timestamp("cv_last_parsed"),
  // AI Analysis
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  aiRecommendations: jsonb("ai_recommendations").$type<{
    topCountries: { country: string; score: number; reason: string }[];
    topJobs: { title: string; country: string; salaryRange: string; reason: string }[];
    actionItems: string[];
    strengthsAnalysis: string;
    improvementAreas: string[];
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserCareerProfileSchema = createInsertSchema(userCareerProfiles).omit({ id: true, createdAt: true, updatedAt: true, lastAnalyzedAt: true });
export type UserCareerProfile = typeof userCareerProfiles.$inferSelect;
export type InsertUserCareerProfile = z.infer<typeof insertUserCareerProfileSchema>;

// Job Alerts Subscriptions
export const jobAlertSubscriptions = pgTable("job_alert_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  countryCode: varchar("country_code"), // null means all countries
  industry: varchar("industry"), // null means all industries
  keywords: jsonb("keywords").$type<string[]>().default([]),
  frequency: varchar("frequency").notNull().default("weekly"), // daily, weekly, monthly
  isActive: boolean("is_active").default(true),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertJobAlertSubscriptionSchema = createInsertSchema(jobAlertSubscriptions).omit({ id: true, createdAt: true, lastSentAt: true });
export type JobAlertSubscription = typeof jobAlertSubscriptions.$inferSelect;
export type InsertJobAlertSubscription = z.infer<typeof insertJobAlertSubscriptionSchema>;

// Video Testimonials (extending success stories)
export const videoTestimonials = pgTable("video_testimonials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  successStoryId: varchar("success_story_id").references(() => successStories.id),
  videoUrl: varchar("video_url").notNull(), // YouTube/Vimeo URL
  videoType: varchar("video_type").notNull().default("youtube"), // youtube, vimeo, direct
  thumbnailUrl: varchar("thumbnail_url"),
  duration: integer("duration"), // in seconds
  isApproved: boolean("is_approved").default(false),
  viewCount: integer("view_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVideoTestimonialSchema = createInsertSchema(videoTestimonials).omit({ id: true, createdAt: true, viewCount: true });
export type VideoTestimonial = typeof videoTestimonials.$inferSelect;
export type InsertVideoTestimonial = z.infer<typeof insertVideoTestimonialSchema>;

// ============================================
// LICENSE EXPIRY REMINDER SYSTEM
// ============================================

export const REMINDER_TIERS = {
  DAYS_60: "60_days",
  DAYS_30: "30_days",
  DAYS_7: "7_days",
  ON_EXPIRY: "on_expiry",
  DAYS_AFTER_7: "7_days_after",
} as const;

export type ReminderTier = typeof REMINDER_TIERS[keyof typeof REMINDER_TIERS];

export const NOTIFICATION_CHANNELS = {
  SMS: "sms",
  WHATSAPP: "whatsapp",
  EMAIL: "email",
} as const;

export type NotificationChannel = typeof NOTIFICATION_CHANNELS[keyof typeof NOTIFICATION_CHANNELS];

export const licenseRenewalPayments = pgTable("license_renewal_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  licenseNumber: varchar("license_number").notNull(),
  phoneNumber: varchar("phone_number").notNull(),
  amount: integer("amount").notNull(),
  renewalDurationMonths: integer("renewal_duration_months").notNull().default(12),
  mpesaReceiptNumber: varchar("mpesa_receipt_number"),
  checkoutRequestId: varchar("checkout_request_id"),
  merchantRequestId: varchar("merchant_request_id"),
  status: varchar("status").notNull().default("pending"),
  previousExpiryDate: timestamp("previous_expiry_date"),
  newExpiryDate: timestamp("new_expiry_date"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLicenseRenewalPaymentSchema = createInsertSchema(licenseRenewalPayments).omit({ id: true, createdAt: true });
export type LicenseRenewalPayment = typeof licenseRenewalPayments.$inferSelect;
export type InsertLicenseRenewalPayment = z.infer<typeof insertLicenseRenewalPaymentSchema>;

export const agencyNotificationPreferences = pgTable("agency_notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull().unique(),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  contactName: varchar("contact_name"),
  enableSms: boolean("enable_sms").notNull().default(true),
  enableWhatsapp: boolean("enable_whatsapp").notNull().default(false),
  enableEmail: boolean("enable_email").notNull().default(true),
  preferredChannel: varchar("preferred_channel").notNull().default("sms"),
  remindersEnabled: boolean("reminders_enabled").notNull().default(true),
  consentRecordedAt: timestamp("consent_recorded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const licenseReminderLogs = pgTable("license_reminder_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  agencyName: varchar("agency_name").notNull(),
  licenseNumber: varchar("license_number").notNull(),
  reminderTier: varchar("reminder_tier").notNull(),
  channel: varchar("channel").notNull(),
  recipientAddress: varchar("recipient_address").notNull(),
  messageContent: text("message_content").notNull(),
  status: varchar("status").notNull().default("pending"),
  providerSid: varchar("provider_sid"),
  errorMessage: text("error_message"),
  expiryDate: timestamp("expiry_date").notNull(),
  daysRemaining: integer("days_remaining").notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  lastRetryAt: timestamp("last_retry_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgencyNotificationPreferencesSchema = createInsertSchema(agencyNotificationPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLicenseReminderLogSchema = createInsertSchema(licenseReminderLogs).omit({ id: true, createdAt: true });

export type AgencyNotificationPreference = typeof agencyNotificationPreferences.$inferSelect;
export type InsertAgencyNotificationPreference = z.infer<typeof insertAgencyNotificationPreferencesSchema>;
export type LicenseReminderLog = typeof licenseReminderLogs.$inferSelect;
export type InsertLicenseReminderLog = z.infer<typeof insertLicenseReminderLogSchema>;

export const governmentIntegrations = pgTable("government_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  code: varchar("code").notNull().unique(),
  description: text("description"),
  baseUrl: varchar("base_url"),
  authType: varchar("auth_type").notNull().default("api_key"),
  credentialRef: varchar("credential_ref"),
  enabled: boolean("enabled").notNull().default(false),
  supportedActions: text("supported_actions").notNull().default("verify,status"),
  rateLimit: integer("rate_limit").default(100),
  timeoutMs: integer("timeout_ms").default(30000),
  retryAttempts: integer("retry_attempts").default(3),
  lastHealthCheck: timestamp("last_health_check"),
  healthStatus: varchar("health_status").default("unknown"),
  fallbackMode: boolean("fallback_mode").notNull().default(false),
  fallbackReason: text("fallback_reason"),
  fallbackActivatedAt: timestamp("fallback_activated_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGovernmentIntegrationSchema = createInsertSchema(governmentIntegrations).omit({ id: true, createdAt: true, updatedAt: true });
export type GovernmentIntegration = typeof governmentIntegrations.$inferSelect;
export type InsertGovernmentIntegration = z.infer<typeof insertGovernmentIntegrationSchema>;

export const governmentSyncLogs = pgTable("government_sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id").notNull(),
  integrationCode: varchar("integration_code").notNull(),
  action: varchar("action").notNull(),
  licenseNumber: varchar("license_number"),
  agencyId: varchar("agency_id"),
  requestId: varchar("request_id").notNull(),
  status: varchar("status").notNull().default("pending"),
  normalizedStatus: varchar("normalized_status"),
  requestPayload: jsonb("request_payload"),
  responsePayload: jsonb("response_payload"),
  rawGovernmentResponse: jsonb("raw_government_response"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  durationMs: integer("duration_ms"),
  triggeredBy: varchar("triggered_by"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertGovernmentSyncLogSchema = createInsertSchema(governmentSyncLogs).omit({ id: true, startedAt: true, completedAt: true });
export type GovernmentSyncLog = typeof governmentSyncLogs.$inferSelect;
export type InsertGovernmentSyncLog = z.infer<typeof insertGovernmentSyncLogSchema>;

export const governmentFeatureFlags = pgTable("government_feature_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
  integrationCode: varchar("integration_code"),
  rolloutPercentage: integer("rollout_percentage").default(100),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export const insertGovernmentFeatureFlagSchema = createInsertSchema(governmentFeatureFlags).omit({ id: true, createdAt: true, updatedAt: true });
export type GovernmentFeatureFlag = typeof governmentFeatureFlags.$inferSelect;
export type InsertGovernmentFeatureFlag = z.infer<typeof insertGovernmentFeatureFlagSchema>;

export const manualOverrides = pgTable("manual_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationCode: varchar("integration_code").notNull(),
  licenseNumber: varchar("license_number").notNull(),
  agencyId: varchar("agency_id"),
  agencyName: varchar("agency_name"),
  overrideStatus: varchar("override_status").notNull().default("submitted"),
  manualLicenseStatus: varchar("manual_license_status").notNull().default("VALID"),
  reason: text("reason").notNull(),
  evidence: jsonb("evidence").default([]),
  submittedBy: varchar("submitted_by").notNull(),
  reviewedBy: varchar("reviewed_by"),
  reviewNotes: text("review_notes"),
  reviewedAt: timestamp("reviewed_at"),
  approvedAt: timestamp("approved_at"),
  syncRequired: boolean("sync_required").notNull().default(true),
  syncStatus: varchar("sync_status").notNull().default("pending"),
  syncRequestId: varchar("sync_request_id"),
  syncResult: jsonb("sync_result"),
  mismatchNotes: text("mismatch_notes"),
  expiryDateOverride: timestamp("expiry_date_override"),
  manualVerificationExpiry: timestamp("manual_verification_expiry"),
  approvedBy: varchar("approved_by"),
  expiryNotified: boolean("expiry_notified").notNull().default(false),
  disclaimerViewedBy: jsonb("disclaimer_viewed_by").default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertManualOverrideSchema = createInsertSchema(manualOverrides).omit({ id: true, createdAt: true, updatedAt: true, reviewedAt: true, approvedAt: true });
export type ManualOverride = typeof manualOverrides.$inferSelect;
export type InsertManualOverride = z.infer<typeof insertManualOverrideSchema>;

export const complianceAuditLogs = pgTable("compliance_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  userRole: varchar("user_role").notNull().default("admin"),
  action: varchar("action").notNull(),
  recordType: varchar("record_type").notNull(),
  recordId: varchar("record_id"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertComplianceAuditLogSchema = createInsertSchema(complianceAuditLogs).omit({ id: true, createdAt: true });
export type ComplianceAuditLog = typeof complianceAuditLogs.$inferSelect;
export type InsertComplianceAuditLog = z.infer<typeof insertComplianceAuditLogSchema>;

export const governmentDowntimeEvents = pgTable("government_downtime_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationCode: varchar("integration_code").notNull(),
  eventType: varchar("event_type").notNull(),
  reason: text("reason"),
  triggeredBy: varchar("triggered_by"),
  durationMs: integer("duration_ms"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGovernmentDowntimeEventSchema = createInsertSchema(governmentDowntimeEvents).omit({ id: true, createdAt: true });
export type GovernmentDowntimeEvent = typeof governmentDowntimeEvents.$inferSelect;
export type InsertGovernmentDowntimeEvent = z.infer<typeof insertGovernmentDowntimeEventSchema>;

export const auditExports = pgTable("audit_exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  exportedBy: varchar("exported_by").notNull(),
  exportType: varchar("export_type").notNull().default("csv"),
  filters: jsonb("filters"),
  recordCount: integer("record_count").notNull().default(0),
  hashSignature: varchar("hash_signature"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuditExportSchema = createInsertSchema(auditExports).omit({ id: true, createdAt: true });
export type AuditExport = typeof auditExports.$inferSelect;
export type InsertAuditExport = z.infer<typeof insertAuditExportSchema>;

export const agencyLegitimacyScores = pgTable("agency_legitimacy_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  overallScore: integer("overall_score").notNull().default(50),
  licenseStatusScore: integer("license_status_score").notNull().default(0),
  complianceHistoryScore: integer("compliance_history_score").notNull().default(0),
  paymentTransparencyScore: integer("payment_transparency_score").notNull().default(0),
  governmentVerificationScore: integer("government_verification_score").notNull().default(0),
  userFeedbackScore: integer("user_feedback_score").notNull().default(0),
  longevityScore: integer("longevity_score").notNull().default(0),
  tier: varchar("tier").notNull().default("silver"),
  isFrozen: boolean("is_frozen").notNull().default(false),
  frozenBy: varchar("frozen_by"),
  frozenReason: text("frozen_reason"),
  frozenAt: timestamp("frozen_at"),
  lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAgencyLegitimacyScoreSchema = createInsertSchema(agencyLegitimacyScores).omit({ id: true, createdAt: true, updatedAt: true });
export type AgencyLegitimacyScore = typeof agencyLegitimacyScores.$inferSelect;
export type InsertAgencyLegitimacyScore = z.infer<typeof insertAgencyLegitimacyScoreSchema>;

export const agencyScoreHistory = pgTable("agency_score_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  previousScore: integer("previous_score").notNull(),
  newScore: integer("new_score").notNull(),
  previousTier: varchar("previous_tier").notNull(),
  newTier: varchar("new_tier").notNull(),
  changeReason: varchar("change_reason").notNull(),
  triggeredBy: varchar("triggered_by").notNull().default("system"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgencyScoreHistorySchema = createInsertSchema(agencyScoreHistory).omit({ id: true, createdAt: true });
export type AgencyScoreHistoryRecord = typeof agencyScoreHistory.$inferSelect;
export type InsertAgencyScoreHistory = z.infer<typeof insertAgencyScoreHistorySchema>;

export const agencyComplianceEvents = pgTable("agency_compliance_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  eventType: varchar("event_type").notNull(),
  severity: varchar("severity").notNull().default("info"),
  description: text("description"),
  reportedBy: varchar("reported_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgencyComplianceEventSchema = createInsertSchema(agencyComplianceEvents).omit({ id: true, createdAt: true });
export type AgencyComplianceEvent = typeof agencyComplianceEvents.$inferSelect;
export type InsertAgencyComplianceEvent = z.infer<typeof insertAgencyComplianceEventSchema>;

export const agencyScoreWeights = pgTable("agency_score_weights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  factorName: varchar("factor_name").notNull().unique(),
  weight: integer("weight").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  updatedBy: varchar("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAgencyScoreWeightSchema = createInsertSchema(agencyScoreWeights).omit({ id: true, updatedAt: true });
export type AgencyScoreWeight = typeof agencyScoreWeights.$inferSelect;
export type InsertAgencyScoreWeight = z.infer<typeof insertAgencyScoreWeightSchema>;

export const blacklistedEntities = pgTable("blacklisted_entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull(),
  entityType: varchar("entity_type").notNull(),
  reason: text("reason").notNull(),
  reportedBy: varchar("reported_by").notNull(),
  status: varchar("status").notNull().default("active"),
  evidence: jsonb("evidence").default([]),
  dateAdded: timestamp("date_added").defaultNow(),
  clearedAt: timestamp("cleared_at"),
  clearedBy: varchar("cleared_by"),
  clearedReason: text("cleared_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBlacklistedEntitySchema = createInsertSchema(blacklistedEntities).omit({ id: true, createdAt: true, updatedAt: true, dateAdded: true });
export type BlacklistedEntity = typeof blacklistedEntities.$inferSelect;
export type InsertBlacklistedEntity = z.infer<typeof insertBlacklistedEntitySchema>;

export const fraudFlags = pgTable("fraud_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull(),
  entityType: varchar("entity_type").notNull(),
  ruleTriggered: varchar("rule_triggered").notNull(),
  severity: varchar("severity").notNull().default("medium"),
  details: jsonb("details").default({}),
  autoActions: jsonb("auto_actions").default([]),
  status: varchar("status").notNull().default("open"),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFraudFlagSchema = createInsertSchema(fraudFlags).omit({ id: true, createdAt: true });
export type FraudFlag = typeof fraudFlags.$inferSelect;
export type InsertFraudFlag = z.infer<typeof insertFraudFlagSchema>;

export const fraudInvestigationNotes = pgTable("fraud_investigation_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fraudFlagId: varchar("fraud_flag_id"),
  blacklistEntryId: varchar("blacklist_entry_id"),
  note: text("note").notNull(),
  attachedBy: varchar("attached_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFraudInvestigationNoteSchema = createInsertSchema(fraudInvestigationNotes).omit({ id: true, createdAt: true });
export type FraudInvestigationNote = typeof fraudInvestigationNotes.$inferSelect;
export type InsertFraudInvestigationNote = z.infer<typeof insertFraudInvestigationNoteSchema>;

export const fraudDetectionRules = pgTable("fraud_detection_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleName: varchar("rule_name").notNull().unique(),
  description: text("description"),
  ruleType: varchar("rule_type").notNull(),
  threshold: integer("threshold").notNull(),
  timeWindowDays: integer("time_window_days").notNull().default(30),
  severity: varchar("severity").notNull().default("medium"),
  isActive: boolean("is_active").notNull().default(true),
  autoBlacklist: boolean("auto_blacklist").notNull().default(false),
  autoReduceScore: boolean("auto_reduce_score").notNull().default(true),
  scoreReduction: integer("score_reduction").notNull().default(10),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFraudDetectionRuleSchema = createInsertSchema(fraudDetectionRules).omit({ id: true, createdAt: true, updatedAt: true });
export type FraudDetectionRule = typeof fraudDetectionRules.$inferSelect;
export type InsertFraudDetectionRule = z.infer<typeof insertFraudDetectionRuleSchema>;

export const complianceRiskScores = pgTable("compliance_risk_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  agencyName: varchar("agency_name"),
  riskScore: integer("risk_score").notNull().default(0),
  previousScore: integer("previous_score"),
  scoreDelta: integer("score_delta"),
  trend: varchar("trend").notNull().default("stable"),
  factors: jsonb("factors").default([]),
  explanation: text("explanation"),
  calculatedAt: timestamp("calculated_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertComplianceRiskScoreSchema = createInsertSchema(complianceRiskScores).omit({ id: true, calculatedAt: true, updatedAt: true });
export type ComplianceRiskScore = typeof complianceRiskScores.$inferSelect;
export type InsertComplianceRiskScore = z.infer<typeof insertComplianceRiskScoreSchema>;

export const complianceRiskHistory = pgTable("compliance_risk_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  riskScore: integer("risk_score").notNull(),
  factors: jsonb("factors").default([]),
  calculatedAt: timestamp("calculated_at").defaultNow(),
});

export const insertComplianceRiskHistorySchema = createInsertSchema(complianceRiskHistory).omit({ id: true, calculatedAt: true });
export type ComplianceRiskHistory = typeof complianceRiskHistory.$inferSelect;
export type InsertComplianceRiskHistory = z.infer<typeof insertComplianceRiskHistorySchema>;

export const complianceAnomalies = pgTable("compliance_anomalies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  agencyName: varchar("agency_name"),
  anomalyType: varchar("anomaly_type").notNull(),
  severity: varchar("severity").notNull().default("medium"),
  details: jsonb("details").default({}),
  detectedAt: timestamp("detected_at").defaultNow(),
  status: varchar("status").notNull().default("open"),
  reviewedBy: varchar("reviewed_by"),
  reviewNotes: text("review_notes"),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertComplianceAnomalySchema = createInsertSchema(complianceAnomalies).omit({ id: true, detectedAt: true, reviewedAt: true });
export type ComplianceAnomaly = typeof complianceAnomalies.$inferSelect;
export type InsertComplianceAnomaly = z.infer<typeof insertComplianceAnomalySchema>;

export const complianceAlerts = pgTable("compliance_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  agencyName: varchar("agency_name"),
  alertType: varchar("alert_type").notNull(),
  severity: varchar("severity").notNull().default("medium"),
  title: varchar("title").notNull(),
  message: text("message"),
  explanation: text("explanation"),
  status: varchar("status").notNull().default("pending"),
  triggeredAt: timestamp("triggered_at").defaultNow(),
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
});

export const insertComplianceAlertSchema = createInsertSchema(complianceAlerts).omit({ id: true, triggeredAt: true, acknowledgedAt: true, resolvedAt: true });
export type ComplianceAlert = typeof complianceAlerts.$inferSelect;
export type InsertComplianceAlert = z.infer<typeof insertComplianceAlertSchema>;

export const complianceRiskConfig = pgTable("compliance_risk_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configKey: varchar("config_key").notNull().unique(),
  configValue: jsonb("config_value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertComplianceRiskConfigSchema = createInsertSchema(complianceRiskConfig).omit({ id: true, updatedAt: true });
export type ComplianceRiskConfig = typeof complianceRiskConfig.$inferSelect;
export type InsertComplianceRiskConfig = z.infer<typeof insertComplianceRiskConfigSchema>;

export const complianceIndexScores = pgTable("compliance_index_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  agencyName: varchar("agency_name"),
  compositeScore: integer("composite_score").notNull().default(0),
  licenseValidityScore: integer("license_validity_score").default(0),
  govVerificationScore: integer("gov_verification_score").default(0),
  legitimacyScore: integer("legitimacy_score").default(0),
  complianceHistoryScore: integer("compliance_history_score").default(0),
  fraudDetectionScore: integer("fraud_detection_score").default(0),
  userFeedbackScore: integer("user_feedback_score").default(0),
  globalRank: integer("global_rank"),
  countryRank: integer("country_rank"),
  industryRank: integer("industry_rank"),
  cityRank: integer("city_rank"),
  badge: varchar("badge").default("none"),
  country: varchar("country"),
  city: varchar("city"),
  industry: varchar("industry"),
  isExcluded: boolean("is_excluded").default(false),
  excludedBy: varchar("excluded_by"),
  excludedReason: text("excluded_reason"),
  calculatedAt: timestamp("calculated_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertComplianceIndexScoreSchema = createInsertSchema(complianceIndexScores).omit({ id: true, calculatedAt: true, updatedAt: true });
export type ComplianceIndexScore = typeof complianceIndexScores.$inferSelect;
export type InsertComplianceIndexScore = z.infer<typeof insertComplianceIndexScoreSchema>;

export const complianceIndexHistory = pgTable("compliance_index_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),
  compositeScore: integer("composite_score").notNull(),
  globalRank: integer("global_rank"),
  badge: varchar("badge"),
  calculatedAt: timestamp("calculated_at").defaultNow(),
});

export const insertComplianceIndexHistorySchema = createInsertSchema(complianceIndexHistory).omit({ id: true, calculatedAt: true });
export type ComplianceIndexHistory = typeof complianceIndexHistory.$inferSelect;
export type InsertComplianceIndexHistory = z.infer<typeof insertComplianceIndexHistorySchema>;

export const complianceIndexConfig = pgTable("compliance_index_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configKey: varchar("config_key").notNull().unique(),
  configValue: jsonb("config_value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertComplianceIndexConfigSchema = createInsertSchema(complianceIndexConfig).omit({ id: true, updatedAt: true });
export type ComplianceIndexConfig = typeof complianceIndexConfig.$inferSelect;
export type InsertComplianceIndexConfig = z.infer<typeof insertComplianceIndexConfigSchema>;

export const agencyCertificates = pgTable("agency_certificates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificate_id").notNull().unique(),
  agencyId: varchar("agency_id").notNull(),
  agencyName: varchar("agency_name"),
  licenseNumber: varchar("license_number"),
  complianceScore: integer("compliance_score").default(0),
  verificationStatus: varchar("verification_status").default("verified"),
  issuedAt: timestamp("issued_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  verificationHash: varchar("verification_hash").notNull(),
  status: varchar("status").default("active"),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by"),
  revokedReason: text("revoked_reason"),
  regeneratedFrom: varchar("regenerated_from"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAgencyCertificateSchema = createInsertSchema(agencyCertificates).omit({ id: true, createdAt: true, updatedAt: true });
export type AgencyCertificate = typeof agencyCertificates.$inferSelect;
export type InsertAgencyCertificate = z.infer<typeof insertAgencyCertificateSchema>;

export const fraudReports = pgTable("fraud_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reporterId: varchar("reporter_id"),
  suspectedEntity: varchar("suspected_entity").notNull(),
  suspectedAgencyId: varchar("suspected_agency_id"),
  incidentType: varchar("incident_type").notNull(),
  description: text("description").notNull(),
  phoneNumber: varchar("phone_number"),
  paymentReference: varchar("payment_reference"),
  licenseNumber: varchar("license_number"),
  evidenceFiles: jsonb("evidence_files").default([]),
  status: varchar("status").default("pending"),
  assignedTo: varchar("assigned_to"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  resolution: text("resolution"),
  analysisResult: jsonb("analysis_result"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFraudReportSchema = createInsertSchema(fraudReports).omit({ id: true, createdAt: true, updatedAt: true, resolvedAt: true, resolvedBy: true, resolution: true, analysisResult: true });
export type FraudReport = typeof fraudReports.$inferSelect;
export type InsertFraudReport = z.infer<typeof insertFraudReportSchema>;

export const fraudIndicators = pgTable("fraud_indicators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  indicatorType: varchar("indicator_type").notNull(),
  value: varchar("value").notNull(),
  normalizedValue: varchar("normalized_value").notNull(),
  riskLevel: varchar("risk_level").default("low"),
  source: varchar("source").default("user_report"),
  linkedReports: jsonb("linked_reports").default([]),
  reportCount: integer("report_count").default(1),
  firstReportedAt: timestamp("first_reported_at").defaultNow(),
  lastReportedAt: timestamp("last_reported_at").defaultNow(),
  addedBy: varchar("added_by"),
  metadata: jsonb("metadata"),
  status: varchar("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFraudIndicatorSchema = createInsertSchema(fraudIndicators).omit({ id: true, createdAt: true, firstReportedAt: true, lastReportedAt: true });
export type FraudIndicator = typeof fraudIndicators.$inferSelect;
export type InsertFraudIndicator = z.infer<typeof insertFraudIndicatorSchema>;

// Security monitoring — alerts raised by the automated scanner or by real-time hooks
export const securityAlerts = pgTable("security_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertType: varchar("alert_type").notNull(), // 'suspicious_login' | 'payment_fraud' | 'api_abuse' | 'admin_abuse' | 'system_vulnerability' | 'file_upload'
  severity: varchar("severity").notNull().default("medium"), // 'low' | 'medium' | 'high' | 'critical'
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  ipAddress: varchar("ip_address"),
  userId: varchar("user_id"),
  metadata: jsonb("metadata"),
  isResolved: boolean("is_resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSecurityAlertSchema = createInsertSchema(securityAlerts).omit({ id: true, createdAt: true, resolvedAt: true, resolvedBy: true });
export type SecurityAlert = typeof securityAlerts.$inferSelect;
export type InsertSecurityAlert = z.infer<typeof insertSecurityAlertSchema>;

// security_events — lightweight per-event behavior log fed by rate limiter hooks,
// login failure handlers, and admin access tracking. Used for IP spike detection,
// per-user risk scoring, and the security-ai dashboard summary.
export const securityEvents = pgTable("security_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Type of event captured
  eventType: varchar("event_type").notNull(), // 'rate_limit_hit' | 'auth_failure' | 'payment_attempt' | 'file_upload_rejected' | 'restricted_route_access' | 'xss_attempt' | 'admin_access'
  // Risk points added to this IP/user's running score by this event
  riskPoints: integer("risk_points").notNull().default(0),
  ipAddress: varchar("ip_address"),
  userId: varchar("user_id"),
  endpoint: varchar("endpoint"),
  userAgent: varchar("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSecurityEventSchema = createInsertSchema(securityEvents).omit({ id: true, createdAt: true });
export type SecurityEvent = typeof securityEvents.$inferSelect;
export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;

// =============================================================================
// GROWTH TOOLS SUITE
// =============================================================================

// Visa Sponsorship Job Feed
export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 200 }).notNull(),
  company: varchar("company", { length: 200 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  salary: varchar("salary", { length: 100 }),
  jobCategory: varchar("job_category", { length: 100 }),
  visaSponsorship: boolean("visa_sponsorship").notNull().default(true),
  applyLink: text("apply_link"),
  email: varchar("email", { length: 200 }),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true });
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

// Agency Jobs — job listings posted by claimed NEA agencies
export const agencyJobs = pgTable("agency_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull(),           // FK → nea_agencies.id
  title: varchar("title", { length: 200 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  salary: varchar("salary", { length: 100 }),
  jobCategory: varchar("job_category", { length: 100 }),
  description: text("description"),
  requirements: text("requirements"),
  visaSponsorship: boolean("visa_sponsorship").notNull().default(false),
  applicationDeadline: timestamp("application_deadline"),
  applyLink: text("apply_link"),
  applyEmail: varchar("apply_email", { length: 200 }),
  isActive: boolean("is_active").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAgencyJobSchema = createInsertSchema(agencyJobs).omit({
  id: true, createdAt: true, updatedAt: true, viewCount: true,
});
export type AgencyJob = typeof agencyJobs.$inferSelect;
export type InsertAgencyJob = z.infer<typeof insertAgencyJobSchema>;

// Job Click Access Log — records every time a PRO user accesses a job redirect URL
export const jobClickLog = pgTable("job_click_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  jobId: varchar("job_id").notNull(),
  jobType: varchar("job_type", { length: 20 }).notNull(), // 'visa', 'agency', 'portal'
  ipAddress: varchar("ip_address", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tool Usage Tracking
export const toolUsage = pgTable("tool_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  toolName: varchar("tool_name", { length: 100 }).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertToolUsageSchema = createInsertSchema(toolUsage).omit({ id: true, createdAt: true });
export type ToolUsage = typeof toolUsage.$inferSelect;
export type InsertToolUsage = z.infer<typeof insertToolUsageSchema>;

// CV Template Downloads
export const cvTemplateDownloads = pgTable("cv_template_downloads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id", { length: 100 }).notNull(),
  userId: varchar("user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCvTemplateDownloadSchema = createInsertSchema(cvTemplateDownloads).omit({ id: true, createdAt: true });
export type CvTemplateDownload = typeof cvTemplateDownloads.$inferSelect;
export type InsertCvTemplateDownload = z.infer<typeof insertCvTemplateDownloadSchema>;

// Viral Tool Reports — shareable public result pages
export const toolReports = pgTable("tool_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  toolName: varchar("tool_name", { length: 50 }).notNull(), // "ats" | "scam"
  userId: varchar("user_id"),
  reportData: jsonb("report_data").notNull(),
  views: integer("views").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertToolReportSchema = createInsertSchema(toolReports).omit({ id: true, createdAt: true, views: true, shares: true });
export type ToolReport = typeof toolReports.$inferSelect;
export type InsertToolReport = z.infer<typeof insertToolReportSchema>;

// AI Usage Tracking — per-user daily usage for Visa Assistant and other AI tools
export const aiUsage = pgTable("ai_usage", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  toolName: varchar("tool_name", { length: 50 }).notNull().default("visa_assistant"),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  questionsUsed: integer("questions_used").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAiUsageSchema = createInsertSchema(aiUsage).omit({ id: true, createdAt: true, updatedAt: true });
export type AiUsage = typeof aiUsage.$inferSelect;
export type InsertAiUsage = z.infer<typeof insertAiUsageSchema>;

// Scam Reporting & Agency Blacklist — user-submitted agency scam reports with evidence
export const scamReports = pgTable("scam_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyName: varchar("agency_name", { length: 255 }).notNull(),
  country: varchar("country", { length: 100 }),
  description: text("description").notNull(),
  amountLost: integer("amount_lost"), // in KES
  contactInfo: varchar("contact_info", { length: 500 }),
  evidenceImages: text("evidence_images").array().default([]),
  reportedBy: varchar("reported_by", { length: 100 }), // user id (nullable for anonymous)
  reporterEmail: varchar("reporter_email", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | approved | rejected
  adminNote: text("admin_note"),
  likesCount: integer("likes_count").default(0),
  viewsCount: integer("views_count").default(0),
  isFeatured: boolean("is_featured").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertScamReportSchema = createInsertSchema(scamReports).omit({
  id: true, createdAt: true, updatedAt: true, status: true, adminNote: true,
  likesCount: true, viewsCount: true, isFeatured: true,
});
export type ScamReport = typeof scamReports.$inferSelect;
export type InsertScamReport = z.infer<typeof insertScamReportSchema>;

export const scamWallLikes = pgTable("scam_wall_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id", { length: 100 }).notNull(),
  fingerprint: varchar("fingerprint", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scamWallComments = pgTable("scam_wall_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id", { length: 100 }).notNull(),
  content: text("content").notNull(),
  authorName: varchar("author_name", { length: 100 }).default("Anonymous"),
  isApproved: boolean("is_approved").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ScamWallLike = typeof scamWallLikes.$inferSelect;
export type ScamWallComment = typeof scamWallComments.$inferSelect;

// ── Real-time activity events — written on signup and upgrade ─────────────────
// No user-identifying data stored (no name, no email, no userId).
// Only type, optional country name, and timestamp.
export const activityEvents = pgTable("activity_events", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 }).notNull(),      // 'signup' | 'upgrade'
  location: varchar("location", { length: 100 }),        // country name e.g. "Kenya" or null
  createdAt: timestamp("created_at").defaultNow(),
});
export type ActivityEvent = typeof activityEvents.$inferSelect;

// ── M-Pesa pull payment configuration (singleton per short-code) ──────────────
export const mpesaPullConfig = pgTable("mpesa_pull_config", {
  id:           serial("id").primaryKey(),
  shortCode:    varchar("short_code").notNull().unique(),
  registeredAt: timestamp("registered_at").default(sql`CURRENT_TIMESTAMP`),
  lastPullAt:   timestamp("last_pull_at"),
  lastOffset:   integer("last_offset").default(0),
  isActive:     boolean("is_active").default(true),
});
export type MpesaPullConfig = typeof mpesaPullConfig.$inferSelect;

// ── Platform-wide statistics snapshot (singleton row, id=1) ──────────────────
export const platformStats = pgTable("platform_stats", {
  id:            integer("id").primaryKey().default(1),
  totalUsers:    integer("total_users").notNull().default(0),
  paidUsers:     integer("paid_users").notNull().default(0),
  totalRevenue:  numeric("total_revenue").notNull().default("0"),
  revenueToday:  numeric("revenue_today").notNull().default("0"),
  activeNow:     integer("active_now").notNull().default(0),
  signupsToday:  integer("signups_today").notNull().default(0),
  signupsWeek:   integer("signups_week").notNull().default(0),
  signupsMonth:  integer("signups_month").notNull().default(0),
  lastUpdated:   timestamp("last_updated").notNull().default(sql`now()`),
});
export type PlatformStats = typeof platformStats.$inferSelect;

// ── M-Pesa Pull API transaction log (raw pulled transactions before reconciliation) ──
export const mpesaPullTransactions = pgTable("mpesa_pull_transactions", {
  transactionId:       varchar("transaction_id").primaryKey(),
  billRefNumber:       varchar("bill_ref_number"),
  transactionType:     varchar("transaction_type"),
  transAmount:         integer("trans_amount").notNull().default(0),
  businessShortCode:   varchar("business_short_code"),
  msisdn:              varchar("msisdn"),
  firstName:           varchar("first_name"),
  middleName:          varchar("middle_name"),
  lastName:            varchar("last_name"),
  transTime:           timestamp("trans_time"),
  invoiceNumber:       varchar("invoice_number"),
  orgAccountBalance:   integer("org_account_balance").default(0),
  thirdPartyTransId:   varchar("third_party_trans_id"),
  reconciled:          boolean("reconciled").notNull().default(false),
  reconciledAt:        timestamp("reconciled_at"),
  pulledAt:            timestamp("pulled_at").defaultNow(),
});
export type MpesaPullTransaction = typeof mpesaPullTransactions.$inferSelect;

// ── Abuse / scam reports submitted by users (lightweight, no auth required) ──
export const abuseReports = pgTable("abuse_reports", {
  id:           serial("id").primaryKey(),
  type:         varchar("type", { length: 50 }).notNull(),
  description:  text("description").notNull(),
  contactEmail: varchar("contact_email", { length: 255 }),
  ipAddress:    varchar("ip_address", { length: 50 }),
  createdAt:    timestamp("created_at").defaultNow(),
});
export type AbuseReport = typeof abuseReports.$inferSelect;

// ── Verified Job/Visa/Gov Portals with automated health monitoring ────────────
export const verifiedPortals = pgTable("verified_portals", {
  id:             serial("id").primaryKey(),
  name:           varchar("name", { length: 200 }).notNull(),
  url:            varchar("url", { length: 500 }).notNull(),
  category:       varchar("category", { length: 100 }).default("general"),
  country:        varchar("country", { length: 100 }).default("Global"),
  description:    text("description"),
  status:         varchar("status", { length: 20 }).default("unknown"),
  statusCode:     integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  errorMessage:   text("error_message"),
  lastChecked:    timestamp("last_checked"),
  isActive:              boolean("is_active").default(true),
  sponsorshipAvailable:  boolean("sponsorship_available").default(false),
  addedAt:               timestamp("added_at").defaultNow(),
});
export type VerifiedPortal = typeof verifiedPortals.$inferSelect;
export const insertVerifiedPortalSchema = createInsertSchema(verifiedPortals).omit({
  id: true, status: true, statusCode: true, responseTimeMs: true,
  errorMessage: true, lastChecked: true, addedAt: true,
});
export type InsertVerifiedPortal = z.infer<typeof insertVerifiedPortalSchema>;

// ============================================
// CV EMAIL DRIP SEQUENCE QUEUE
// ============================================

export const cvEmailQueue = pgTable("cv_email_queue", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email:       varchar("email", { length: 255 }).notNull(),
  firstName:   varchar("first_name", { length: 100 }),
  jobCount:    integer("job_count"),            // null = unknown (web upload without matching)
  topCountry:  varchar("top_country", { length: 100 }),
  profession:  varchar("profession", { length: 150 }),
  topJobs:     jsonb("top_jobs"),               // [{title, company, country}] — up to 3
  type:        varchar("type", { length: 20 }).notNull(), // email1 | email2 | email3
  sendAfter:   timestamp("send_after").notNull(),
  sent:        boolean("sent").notNull().default(false),
  failed:      boolean("failed").notNull().default(false),
  errorMsg:    text("error_msg"),
  createdAt:   timestamp("created_at").defaultNow(),
  sentAt:      timestamp("sent_at"),
});

// ============================================
// WHATSAPP 24-HOUR CV FOLLOW-UP QUEUE
// ============================================

// ── Generic WhatsApp message queue ──────────────────────────────────────────
// Simple fire-and-forget queue. Rows are enqueued with a send_after timestamp
// and processed every 5 minutes by server/whatsapp-queue.ts.
// Deduplication key: (phone, source) — one message per source per 24 h.
export const whatsappQueue = pgTable("whatsapp_queue", {
  id:         varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone:      varchar("phone", { length: 30 }).notNull(),      // 254XXXXXXXXX
  message:    text("message").notNull(),
  source:     varchar("source", { length: 60 }).notNull().default("manual"),
  // status: pending → sent | failed
  status:     varchar("status", { length: 20 }).notNull().default("pending"),
  sendAfter:  timestamp("send_after").notNull().defaultNow(),
  sentAt:     timestamp("sent_at"),
  retryCount: integer("retry_count").notNull().default(0),
  // kept for backward-compat queries; derived from status
  sent:       boolean("sent").notNull().default(false),
  failed:     boolean("failed").notNull().default(false),
  errorMsg:   text("error_msg"),
  createdAt:  timestamp("created_at").defaultNow(),
});

export const insertWhatsappQueueSchema = createInsertSchema(whatsappQueue).omit({ id: true, createdAt: true });
export type WhatsappQueueRow = typeof whatsappQueue.$inferSelect;

export const waFollowups = pgTable("wa_followups", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone:       varchar("phone", { length: 30 }).notNull(),  // E.164 without whatsapp: prefix
  firstName:   varchar("first_name", { length: 100 }),
  jobCount:    integer("job_count").notNull().default(0),
  topCountry:  varchar("top_country", { length: 100 }),
  type:        varchar("type", { length: 20 }).notNull().default("day1"), // day1 | day3
  profession:  varchar("profession", { length: 150 }),
  sendAfter:   timestamp("send_after").notNull(),           // scheduled send time
  sent:        boolean("sent").notNull().default(false),
  failed:      boolean("failed").notNull().default(false),
  errorMsg:    text("error_msg"),
  createdAt:   timestamp("created_at").defaultNow(),
  sentAt:      timestamp("sent_at"),
});

// ============================================
// DELIVERIES — persists AI-generated content
// ============================================

export const deliveries = pgTable("deliveries", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:    varchar("user_id").notNull(),
  jobType:   varchar("job_type", { length: 20 }).notNull(), // ai_apply | cv_fix | visa
  content:   jsonb("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDeliverySchema = createInsertSchema(deliveries).omit({ id: true, createdAt: true });
export type InsertDelivery = z.infer<typeof insertDeliverySchema>;
export type Delivery = typeof deliveries.$inferSelect;
