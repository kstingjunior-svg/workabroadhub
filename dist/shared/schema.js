"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobCounts = exports.pushSubscriptions = exports.notificationTemplates = exports.notificationPreferences = exports.userNotifications = exports.serviceDeliverables = exports.serviceOrders = exports.agencyProfiles = exports.agencyClicks = exports.agencyAddOns = exports.adminSettings = exports.agencyNotifications = exports.insertAgencyClaimSchema = exports.agencyClaims = exports.agencyReports = exports.neaAgencies = exports.insertActivityLogSchema = exports.activityLogs = exports.adminLogs = exports.insertCvUploadSchema = exports.cvUploads = exports.insertPayoutSchema = exports.payouts = exports.insertServiceRequestSchema = exports.serviceRequests = exports.insertUserServiceSchema = exports.userServices = exports.userSubscriptions = exports.updatePromoCodeSchema = exports.insertPromoCodeSchema = exports.promoCodes = exports.updatePlanSchema = exports.insertPlanSchema = exports.plans = exports.services = exports.scamAlerts = exports.jobLinks = exports.countryGuides = exports.countries = exports.insertMpesaUserSchema = exports.mpesaUsers = exports.insertRefundRequestSchema = exports.refundRequests = exports.paymentAuditLogs = exports.insertPaymentRetryLogSchema = exports.paymentRetryLogs = exports.payments = exports.PAYMENT_STATUS = exports.messages = exports.conversations = void 0;
exports.userJobApplications = exports.userApplicationPacks = exports.applicationPacks = exports.insertSuccessStorySchema = exports.insertConsultationBookingSchema = exports.insertAdvisorSchema = exports.insertCountryInsightsSchema = exports.successStories = exports.consultationBookings = exports.advisors = exports.countryInsights = exports.insertVisaLinkSchema = exports.insertVisaStepSchema = exports.insertVisaRequirementSchema = exports.insertStudentVisaSchema = exports.insertJobCountSchema = exports.insertScheduledNotificationSchema = exports.insertPushSubscriptionSchema = exports.insertNotificationTemplateSchema = exports.insertNotificationPreferencesSchema = exports.insertUserNotificationSchema = exports.insertServiceDeliverableSchema = exports.insertServiceOrderSchema = exports.insertAgencyProfileSchema = exports.insertAgencyClickSchema = exports.insertAgencyAddOnSchema = exports.insertAgencyNotificationSchema = exports.insertAgencyReportSchema = exports.insertNeaAgencySchema = exports.insertAdminLogSchema = exports.insertUserSubscriptionSchema = exports.insertServiceSchema = exports.insertScamAlertSchema = exports.insertJobLinkSchema = exports.insertCountryGuideSchema = exports.insertCountrySchema = exports.insertPaymentSchema = exports.insertInfluencerSchema = exports.influencers = exports.insertReferralSchema = exports.referrals = exports.scamAlertsRelations = exports.jobLinksRelations = exports.countryGuidesRelations = exports.countriesRelations = exports.visaLinks = exports.visaSteps = exports.visaRequirements = exports.studentVisas = exports.scheduledNotifications = void 0;
exports.insertComplianceAuditLogSchema = exports.complianceAuditLogs = exports.insertManualOverrideSchema = exports.manualOverrides = exports.insertGovernmentFeatureFlagSchema = exports.governmentFeatureFlags = exports.insertGovernmentSyncLogSchema = exports.governmentSyncLogs = exports.insertGovernmentIntegrationSchema = exports.governmentIntegrations = exports.insertLicenseReminderLogSchema = exports.insertAgencyNotificationPreferencesSchema = exports.licenseReminderLogs = exports.agencyNotificationPreferences = exports.insertLicenseRenewalPaymentSchema = exports.licenseRenewalPayments = exports.NOTIFICATION_CHANNELS = exports.REMINDER_TIERS = exports.insertVideoTestimonialSchema = exports.videoTestimonials = exports.insertJobAlertSubscriptionSchema = exports.jobAlertSubscriptions = exports.insertUserCareerProfileSchema = exports.userCareerProfiles = exports.EVENT_CATEGORIES = exports.FUNNEL_STEPS = exports.insertDailyStatsSchema = exports.dailyStats = exports.insertConversionEventSchema = exports.conversionEvents = exports.insertAnalyticsEventSchema = exports.analyticsEvents = exports.insertUserBookmarkSchema = exports.userBookmarks = exports.JOURNEY_STAGES = exports.insertUserCountryJourneySchema = exports.userCountryJourneys = exports.insertTrackedApplicationSchema = exports.TRACKED_APP_STATUSES = exports.trackedApplications = exports.insertWebhookProcessingLockSchema = exports.webhookProcessingLocks = exports.insertAccountLockoutSchema = exports.accountLockouts = exports.APPLICATION_STATUSES = exports.insertApplicationStatusHistorySchema = exports.insertUserJobApplicationSchema = exports.insertUserApplicationPackSchema = exports.insertApplicationPackSchema = exports.applicationStatusHistory = void 0;
exports.insertAgencyJobSchema = exports.agencyJobs = exports.insertJobSchema = exports.jobs = exports.insertSecurityEventSchema = exports.securityEvents = exports.insertSecurityAlertSchema = exports.securityAlerts = exports.insertFraudIndicatorSchema = exports.fraudIndicators = exports.insertFraudReportSchema = exports.fraudReports = exports.insertAgencyCertificateSchema = exports.agencyCertificates = exports.insertComplianceIndexConfigSchema = exports.complianceIndexConfig = exports.insertComplianceIndexHistorySchema = exports.complianceIndexHistory = exports.insertComplianceIndexScoreSchema = exports.complianceIndexScores = exports.insertComplianceRiskConfigSchema = exports.complianceRiskConfig = exports.insertComplianceAlertSchema = exports.complianceAlerts = exports.insertComplianceAnomalySchema = exports.complianceAnomalies = exports.insertComplianceRiskHistorySchema = exports.complianceRiskHistory = exports.insertComplianceRiskScoreSchema = exports.complianceRiskScores = exports.insertFraudDetectionRuleSchema = exports.fraudDetectionRules = exports.insertFraudInvestigationNoteSchema = exports.fraudInvestigationNotes = exports.insertFraudFlagSchema = exports.fraudFlags = exports.insertBlacklistedEntitySchema = exports.blacklistedEntities = exports.insertAgencyScoreWeightSchema = exports.agencyScoreWeights = exports.insertAgencyComplianceEventSchema = exports.agencyComplianceEvents = exports.insertAgencyScoreHistorySchema = exports.agencyScoreHistory = exports.insertAgencyLegitimacyScoreSchema = exports.agencyLegitimacyScores = exports.insertAuditExportSchema = exports.auditExports = exports.insertGovernmentDowntimeEventSchema = exports.governmentDowntimeEvents = void 0;
exports.insertDeliverySchema = exports.deliveries = exports.waFollowups = exports.insertWhatsappQueueSchema = exports.whatsappQueue = exports.cvEmailQueue = exports.insertVerifiedPortalSchema = exports.verifiedPortals = exports.abuseReports = exports.mpesaPullTransactions = exports.platformStats = exports.mpesaPullConfig = exports.activityEvents = exports.scamWallComments = exports.scamWallLikes = exports.insertScamReportSchema = exports.scamReports = exports.insertAiUsageSchema = exports.aiUsage = exports.insertToolReportSchema = exports.toolReports = exports.insertCvTemplateDownloadSchema = exports.cvTemplateDownloads = exports.insertToolUsageSchema = exports.toolUsage = exports.jobClickLog = void 0;
exports.isPaymentSuccess = isPaymentSuccess;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_zod_1 = require("drizzle-zod");
__exportStar(require("./models/auth"), exports);
// Chat conversations (for AI integrations)
exports.conversations = (0, pg_core_1.pgTable)("conversations", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    title: (0, pg_core_1.text)("title").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
});
exports.messages = (0, pg_core_1.pgTable)("messages", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    conversationId: (0, pg_core_1.integer)("conversation_id").notNull(),
    role: (0, pg_core_1.text)("role").notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
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
exports.PAYMENT_STATUS = {
    PENDING: "pending",
    SUCCESS: "success",
    COMPLETED: "completed", // legacy — use SUCCESS for new payments
    FAILED: "failed",
};
/** Returns true for any confirmed-payment status (success or legacy "completed"). */
function isPaymentSuccess(status) {
    return status === "success" || status === "completed";
}
exports.payments = (0, pg_core_1.pgTable)("payments", {
    // ── Required identity fields ──────────────────────────────────────────────
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(), // session user — always present
    email: (0, pg_core_1.varchar)("email"), // payer email — captured at initiation from users.email
    amount: (0, pg_core_1.integer)("amount").notNull(), // KES amount
    currency: (0, pg_core_1.varchar)("currency").notNull().default("KES"),
    // ── Plan / Service identifier ────────────────────────────────────────────
    // Canonical slug for what was purchased — set at initiation, never changes.
    // Subscription plans:  "pro" | "basic" | "standard"
    // Individual services: "ats_cv_optimization" | "visa_consultation" | any service slug
    planId: (0, pg_core_1.varchar)("plan_id"),
    // Discount audit — populated at payment creation from resolveCanonicalPlanPrice().
    // baseAmount = pre-discount DB price; discountType = "referral_20" | null.
    // null on both means no discount applied (or non-plan payment).
    baseAmount: (0, pg_core_1.integer)("base_amount"), // raw plan price before any discount
    discountType: (0, pg_core_1.varchar)("discount_type"), // "referral_20" | null
    // ── Gateway ───────────────────────────────────────────────────────────────
    method: (0, pg_core_1.varchar)("method").notNull(), // "mpesa" | "paypal"
    phone: (0, pg_core_1.varchar)("phone"), // payer phone — E.164 e.g. 254712345678 (M-Pesa); null for PayPal
    paymentSource: (0, pg_core_1.varchar)("payment_source"), // "web" — origin platform; null = web
    transactionRef: (0, pg_core_1.varchar)("transaction_ref"), // legacy: CheckoutRequestID (M-Pesa) or PayPal order ID
    checkoutRequestId: (0, pg_core_1.varchar)("checkout_request_id"), // Safaricom STK CheckoutRequestID — used to match callbacks
    mpesaCode: (0, pg_core_1.varchar)("mpesa_code"), // confirmed M-Pesa receipt/transaction code e.g. "RBN123ABC456"
    mpesaReceiptNumber: (0, pg_core_1.varchar)("mpesa_receipt_number"), // legacy alias for mpesaCode
    // ── Status ────────────────────────────────────────────────────────────────
    status: (0, pg_core_1.varchar)("status").notNull().default("pending"), // see PAYMENT_STATUS above
    // ── Delivery ─────────────────────────────────────────────────────────────
    // Tracks whether the purchased service/plan was actually delivered after payment.
    // Set independently of `status` so a payment can be "success" but "needs_review".
    //   null / "pending"      — payment succeeded; delivery not yet attempted or confirmed
    //   "delivered"           — plan activated or service unlocked successfully
    //   "needs_review"        — could not be matched/delivered automatically; admin action required
    deliveryStatus: (0, pg_core_1.varchar)("delivery_status"),
    // ── Audit ─────────────────────────────────────────────────────────────────
    serviceId: (0, pg_core_1.varchar)("service_id"), // "plan_basic" | "plan_pro" | service UUID
    serviceName: (0, pg_core_1.varchar)("service_name"), // human-readable label, e.g. "ATS CV Optimization" — stored at creation, never requires a JOIN
    metadata: (0, pg_core_1.varchar)("metadata"), // JSON: phone, checkoutRequestId, refCode, etc.
    failReason: (0, pg_core_1.varchar)("fail_reason"), // human-readable failure reason
    isSuspicious: (0, pg_core_1.boolean)("is_suspicious").notNull().default(false),
    fraudReason: (0, pg_core_1.varchar)("fraud_reason"),
    paymentMethod: (0, pg_core_1.varchar)("payment_method").default("mpesa"), // "mpesa" | "paypal"
    reference: (0, pg_core_1.varchar)("reference"), // human-readable reference / receipt alias
    // ── Provider Verification ─────────────────────────────────────────────────
    // Set by verifyPayment.ts after querying the gateway (M-Pesa STK Query / PayPal Get Order)
    verifiedAt: (0, pg_core_1.timestamp)("verified_at"),
    verificationStatus: (0, pg_core_1.varchar)("verification_status"),
    // "verified"        — gateway confirmed payment is COMPLETED and amounts match
    // "suspicious"      — gateway returned non-zero / status mismatch — isSuspicious=true, NO upgrade
    // "mismatch"        — amounts or capture status don't match stored record
    // "api_unavailable" — gateway could not be reached; upgrade proceeds with warning
    // "skipped"         — verification not attempted (e.g. manual payments)
    verificationNote: (0, pg_core_1.varchar)("verification_note", { length: 500 }),
    // ── Retry (M-Pesa only) ───────────────────────────────────────────────────
    retryCount: (0, pg_core_1.integer)("retry_count").notNull().default(0),
    maxRetries: (0, pg_core_1.integer)("max_retries").notNull().default(3),
    lastRetryAt: (0, pg_core_1.timestamp)("last_retry_at"),
    // ── Timing audit ─────────────────────────────────────────────────────────
    callbackReceivedAt: (0, pg_core_1.timestamp)("callback_received_at"), // when Safaricom callback arrived
    statusLastChecked: (0, pg_core_1.timestamp)("status_last_checked"), // last STK Query API call time
    queryAttempts: (0, pg_core_1.integer)("query_attempts").notNull().default(0), // number of STK Query attempts
    // ── Idempotency ───────────────────────────────────────────────────────────
    // Set atomically by markPaymentProcessed() — UPDATE WHERE processed = false RETURNING id.
    // Any callback that loses the race gets false back and returns immediately,
    // preventing duplicate plan activations on Safaricom retries or parallel webhooks.
    processed: (0, pg_core_1.boolean)("processed").notNull().default(false),
    processedAt: (0, pg_core_1.timestamp)("processed_at"),
    // ── Pricing engine audit ─────────────────────────────────────────────────
    // Populated at payment creation from resolvePrice(). Null when not applicable.
    promoCode: (0, pg_core_1.varchar)("promo_code"), // promo code submitted by the user at checkout
    country: (0, pg_core_1.varchar)("country", { length: 5 }), // ISO-3166 country code passed at initiation
    // Flash sale / discount breakdown
    originalPrice: (0, pg_core_1.integer)("original_price"), // base price before flash sale
    paidPrice: (0, pg_core_1.integer)("paid_price"), // actual amount charged (=finalPrice)
    discountApplied: (0, pg_core_1.integer)("discount_applied"), // KES saved (originalPrice - paidPrice)
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Payment Retry Logs — one row per retry attempt
exports.paymentRetryLogs = (0, pg_core_1.pgTable)("payment_retry_logs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    paymentId: (0, pg_core_1.varchar)("payment_id").notNull(),
    attempt: (0, pg_core_1.integer)("attempt").notNull(), // 1-based retry number
    gateway: (0, pg_core_1.varchar)("gateway").notNull(), // "mpesa" | "paypal"
    result: (0, pg_core_1.varchar)("result").notNull(), // "success" | "failed" | "error"
    gatewayRef: (0, pg_core_1.varchar)("gateway_ref"), // CheckoutRequestID or PayPal order ID
    errorMessage: (0, pg_core_1.text)("error_message"), // Error detail when result != success
    metadata: (0, pg_core_1.varchar)("metadata"), // JSON: phone, amount, etc.
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertPaymentRetryLogSchema = (0, drizzle_zod_1.createInsertSchema)(exports.paymentRetryLogs).omit({ id: true, createdAt: true });
// Payment audit log — structured record of every security event in the payment lifecycle.
// Each STK push, callback, validation failure, and query result gets a row here.
exports.paymentAuditLogs = (0, pg_core_1.pgTable)("payment_audit_logs", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    paymentId: (0, pg_core_1.varchar)("payment_id"), // FK to payments.id (nullable for orphan callbacks)
    event: (0, pg_core_1.varchar)("event", { length: 60 }).notNull(), // stk_push_initiated | awaiting_payment | callback_received | suspicious_callback | duplicate_receipt | phone_mismatch | amount_mismatch | stk_query_confirmed | stk_query_failed | payment_confirmed | payment_failed | payment_expired
    ip: (0, pg_core_1.varchar)("ip", { length: 60 }),
    metadata: (0, pg_core_1.varchar)("metadata"), // JSON string — amounts, phones, IDs, result codes
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Refund requests — users submit these when they believe they are owed a refund.
// Admin reviews, approves/rejects, then marks as processed after B2C payout.
exports.refundRequests = (0, pg_core_1.pgTable)("refund_requests", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    paymentId: (0, pg_core_1.varchar)("payment_id").notNull(), // FK to payments.id
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    reason: (0, pg_core_1.text)("reason").notNull(), // User's stated reason
    // Valid states: pending | approved | rejected | processed
    status: (0, pg_core_1.varchar)("status").notNull().default("pending"),
    adminNotes: (0, pg_core_1.text)("admin_notes"), // Admin's internal notes
    reviewedBy: (0, pg_core_1.varchar)("reviewed_by"), // Admin userId who acted
    reviewedAt: (0, pg_core_1.timestamp)("reviewed_at"),
    processedAt: (0, pg_core_1.timestamp)("processed_at"), // When B2C payout was sent
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertRefundRequestSchema = (0, drizzle_zod_1.createInsertSchema)(exports.refundRequests).omit({ id: true, createdAt: true, updatedAt: true });
// M-Pesa transactions tracking
exports.mpesaUsers = (0, pg_core_1.pgTable)("mpesa_users", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    phone: (0, pg_core_1.varchar)("phone", { length: 15 }).notNull(),
    amount: (0, pg_core_1.integer)("amount").notNull(),
    mpesaReceipt: (0, pg_core_1.varchar)("mpesa_receipt", { length: 50 }).unique(), // Prevent duplicate receipts
    transactionDate: (0, pg_core_1.timestamp)("transaction_date"),
    status: (0, pg_core_1.varchar)("status", { length: 20 }).notNull().default("pending"),
});
exports.insertMpesaUserSchema = (0, drizzle_zod_1.createInsertSchema)(exports.mpesaUsers).omit({ id: true });
exports.countries = (0, pg_core_1.pgTable)("countries", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    name: (0, pg_core_1.varchar)("name").notNull(),
    code: (0, pg_core_1.varchar)("code").notNull().unique(),
    flagEmoji: (0, pg_core_1.varchar)("flag_emoji").notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
});
exports.countryGuides = (0, pg_core_1.pgTable)("country_guides", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    countryId: (0, pg_core_1.varchar)("country_id").notNull(),
    section: (0, pg_core_1.varchar)("section").notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
});
exports.jobLinks = (0, pg_core_1.pgTable)("job_links", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    countryId: (0, pg_core_1.varchar)("country_id").notNull(),
    name: (0, pg_core_1.varchar)("name").notNull(),
    url: (0, pg_core_1.varchar)("url").notNull(),
    description: (0, pg_core_1.varchar)("description"), // Brief description of the portal
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    order: (0, pg_core_1.integer)("order").notNull().default(0),
    clickCount: (0, pg_core_1.integer)("click_count").notNull().default(0), // Track popularity
    lastVerified: (0, pg_core_1.timestamp)("last_verified").defaultNow(), // When we last checked this portal
});
exports.scamAlerts = (0, pg_core_1.pgTable)("scam_alerts", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    title: (0, pg_core_1.varchar)("title").notNull(),
    description: (0, pg_core_1.text)("description").notNull(),
    countryId: (0, pg_core_1.varchar)("country_id"),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.services = (0, pg_core_1.pgTable)("services", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    // Human-readable stable identifier used in payment flows (e.g. "ats_cv_optimization").
    // Unique where set; rows inserted before this column existed will have null.
    slug: (0, pg_core_1.varchar)("slug").unique(),
    // Canonical payment code — mirrors slug, used in all price lookups: WHERE code = $1
    code: (0, pg_core_1.varchar)("code").unique(),
    name: (0, pg_core_1.varchar)("name").notNull(),
    description: (0, pg_core_1.text)("description").notNull(),
    price: (0, pg_core_1.integer)("price").notNull(),
    currency: (0, pg_core_1.varchar)("currency").notNull().default("KES"),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    order: (0, pg_core_1.integer)("order").notNull().default(0),
    // Enhanced display fields
    category: (0, pg_core_1.varchar)("category").default("General"), // CV & Documents, Interview & Profile, Legal & Verification, Subscriptions
    badge: (0, pg_core_1.varchar)("badge"), // Popular, New, Best Value, etc.
    features: (0, pg_core_1.jsonb)("features").$type(), // bullet points shown on card
    isSubscription: (0, pg_core_1.boolean)("is_subscription").notNull().default(false),
    subscriptionPeriod: (0, pg_core_1.varchar)("subscription_period"), // monthly, annual
    // Flash sale / discount engine
    flashSale: (0, pg_core_1.boolean)("flash_sale").notNull().default(false),
    discountPercent: (0, pg_core_1.integer)("discount_percent").notNull().default(0), // 1–80
    saleStart: (0, pg_core_1.timestamp)("sale_start", { withTimezone: true }),
    saleEnd: (0, pg_core_1.timestamp)("sale_end", { withTimezone: true }),
});
// Subscription plan tiers
exports.plans = (0, pg_core_1.pgTable)("plans", {
    planId: (0, pg_core_1.varchar)("plan_id").primaryKey(),
    planName: (0, pg_core_1.varchar)("plan_name").notNull(),
    price: (0, pg_core_1.integer)("price").notNull().default(0),
    features: (0, pg_core_1.jsonb)("features").notNull().default([]),
    description: (0, pg_core_1.text)("description"),
    badge: (0, pg_core_1.varchar)("badge"),
    currency: (0, pg_core_1.varchar)("currency").notNull().default("KES"),
    billingPeriod: (0, pg_core_1.varchar)("billing_period").notNull().default("annual"),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    displayOrder: (0, pg_core_1.integer)("display_order").notNull().default(0),
    metadata: (0, pg_core_1.jsonb)("metadata").default({}),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertPlanSchema = (0, drizzle_zod_1.createInsertSchema)(exports.plans).omit({ createdAt: true, updatedAt: true });
exports.updatePlanSchema = exports.insertPlanSchema.partial().omit({ planId: true });
// ─── Promo Codes ────────────────────────────────────────────────────────────
// DB-driven discount codes redeemable at checkout.
// Supports two discount models:
//   "pct"       — percentage off  (discountValue = 0-100, e.g. 15 = 15% off)
//   "fixed_kes" — flat KES deduction (discountValue = amount, e.g. 500 = KES 500 off)
// appliesToPlan null  = code works for any plan
//              non-null = code is plan-specific (e.g. "pro")
exports.promoCodes = (0, pg_core_1.pgTable)("promo_codes", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    code: (0, pg_core_1.varchar)("code", { length: 50 }).notNull().unique(),
    discountType: (0, pg_core_1.varchar)("discount_type", { length: 20 }).notNull(), // "pct" | "fixed_kes"
    discountValue: (0, pg_core_1.integer)("discount_value").notNull(),
    appliesToPlan: (0, pg_core_1.varchar)("applies_to_plan", { length: 100 }), // null = all plans
    maxUses: (0, pg_core_1.integer)("max_uses"), // null = unlimited
    usedCount: (0, pg_core_1.integer)("used_count").notNull().default(0),
    expiresAt: (0, pg_core_1.timestamp)("expires_at"), // null = never expires
    active: (0, pg_core_1.boolean)("active").notNull().default(true),
    createdBy: (0, pg_core_1.varchar)("created_by"), // admin userId who created it
    description: (0, pg_core_1.text)("description"),
    createdAt: (0, pg_core_1.timestamp)("created_at").notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").notNull().defaultNow(),
});
exports.insertPromoCodeSchema = (0, drizzle_zod_1.createInsertSchema)(exports.promoCodes).omit({
    id: true, usedCount: true, createdAt: true, updatedAt: true,
});
exports.updatePromoCodeSchema = exports.insertPromoCodeSchema.partial().omit({ code: true });
exports.userSubscriptions = (0, pg_core_1.pgTable)("user_subscriptions", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    paymentId: (0, pg_core_1.varchar)("payment_id"), // nullable — admin grants have no payment
    plan: (0, pg_core_1.varchar)("plan").notNull().default("free"), // "free" | "basic" | "pro"
    status: (0, pg_core_1.varchar)("status").notNull().default("active"), // "active" | "expired" | "canceled" | "trialing"
    startDate: (0, pg_core_1.timestamp)("start_date").defaultNow(),
    endDate: (0, pg_core_1.timestamp)("end_date"), // null = lifetime / no expiry
    autoRenew: (0, pg_core_1.boolean)("auto_renew").notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Per-service unlock records — one row per service unlocked per user
// serviceId "main_subscription" = core Career Consultation Access (KES 4,500)
exports.userServices = (0, pg_core_1.pgTable)("user_services", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    serviceId: (0, pg_core_1.varchar)("service_id").notNull(), // FK to services.id or "main_subscription"
    paymentId: (0, pg_core_1.varchar)("payment_id").notNull(), // FK to payments.id
    unlockedAt: (0, pg_core_1.timestamp)("unlocked_at").defaultNow(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at"), // null = lifetime access
    metadata: (0, pg_core_1.varchar)("metadata"), // JSON — extra context (receipt, method, etc.)
});
exports.insertUserServiceSchema = (0, drizzle_zod_1.createInsertSchema)(exports.userServices).omit({ id: true, unlockedAt: true });
// Tracks service fulfilment work items raised after a successful payment.
// status: pending → in_progress → completed | cancelled
exports.serviceRequests = (0, pg_core_1.pgTable)("service_requests", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    serviceId: (0, pg_core_1.varchar)("service_id").notNull(),
    paymentId: (0, pg_core_1.varchar)("payment_id"), // traceability back to the payment
    status: (0, pg_core_1.varchar)("status", { length: 20 }).notNull().default("pending"),
    notes: (0, pg_core_1.varchar)("notes"), // admin / fulfilment notes
    inputData: (0, pg_core_1.varchar)("input_data"), // JSON: intake fields from the user
    outputData: (0, pg_core_1.varchar)("output_data"), // JSON: AI-generated result
    errorMsg: (0, pg_core_1.varchar)("error_msg"), // last error message if failed
    retryCount: (0, pg_core_1.integer)("retry_count").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertServiceRequestSchema = (0, drizzle_zod_1.createInsertSchema)(exports.serviceRequests).omit({ id: true, createdAt: true, updatedAt: true });
// Audit log for every B2C send attempt (referral + commission payouts).
// status: sent → confirmed | failed | timed_out
exports.payouts = (0, pg_core_1.pgTable)("payouts", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id"),
    phone: (0, pg_core_1.varchar)("phone").notNull(),
    amount: (0, pg_core_1.integer)("amount").notNull(),
    occasion: (0, pg_core_1.varchar)("occasion"),
    status: (0, pg_core_1.varchar)("status", { length: 20 }).notNull().default("sent"),
    conversationId: (0, pg_core_1.varchar)("conversation_id"),
    originatorConversationId: (0, pg_core_1.varchar)("originator_conversation_id"),
    commissionId: (0, pg_core_1.varchar)("commission_id"),
    referralId: (0, pg_core_1.varchar)("referral_id"),
    resultCode: (0, pg_core_1.integer)("result_code"),
    receipt: (0, pg_core_1.varchar)("receipt"),
    errorMsg: (0, pg_core_1.varchar)("error_msg"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertPayoutSchema = (0, drizzle_zod_1.createInsertSchema)(exports.payouts).omit({ id: true, createdAt: true, updatedAt: true });
// Permanent record of every uploaded CV — links raw text, Storage URL,
// and (once the paid service runs) the AI-improved version + ATS score.
exports.cvUploads = (0, pg_core_1.pgTable)("cv_uploads", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    fileName: (0, pg_core_1.varchar)("file_name"),
    fileUrl: (0, pg_core_1.varchar)("file_url"),
    parsedText: (0, pg_core_1.text)("parsed_text").notNull(),
    improvedCv: (0, pg_core_1.text)("improved_cv"),
    score: (0, pg_core_1.integer)("score"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertCvUploadSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cvUploads).omit({ id: true, createdAt: true, updatedAt: true });
exports.adminLogs = (0, pg_core_1.pgTable)("admin_logs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    adminId: (0, pg_core_1.varchar)("admin_id").notNull(),
    action: (0, pg_core_1.varchar)("action").notNull(),
    target: (0, pg_core_1.varchar)("target"),
    timestamp: (0, pg_core_1.timestamp)("timestamp").defaultNow(),
    ipAddress: (0, pg_core_1.varchar)("ip_address"),
});
exports.activityLogs = (0, pg_core_1.pgTable)("activity_logs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    event: (0, pg_core_1.varchar)("event", { length: 64 }).notNull(),
    userId: (0, pg_core_1.varchar)("user_id"),
    email: (0, pg_core_1.varchar)("email"),
    meta: (0, pg_core_1.jsonb)("meta"),
    ip: (0, pg_core_1.varchar)("ip"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertActivityLogSchema = (0, drizzle_zod_1.createInsertSchema)(exports.activityLogs).omit({ id: true, createdAt: true });
exports.neaAgencies = (0, pg_core_1.pgTable)("nea_agencies", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyName: (0, pg_core_1.varchar)("agency_name").notNull(),
    licenseNumber: (0, pg_core_1.varchar)("license_number").notNull().unique(),
    email: (0, pg_core_1.varchar)("email"),
    website: (0, pg_core_1.varchar)("website"),
    serviceType: (0, pg_core_1.varchar)("service_type"),
    issueDate: (0, pg_core_1.timestamp)("issue_date").notNull(),
    expiryDate: (0, pg_core_1.timestamp)("expiry_date").notNull(),
    statusOverride: (0, pg_core_1.varchar)("status_override"),
    notes: (0, pg_core_1.text)("notes"),
    isPublished: (0, pg_core_1.boolean)("is_published").notNull().default(true),
    lastUpdated: (0, pg_core_1.timestamp)("last_updated").defaultNow(),
    updatedBy: (0, pg_core_1.varchar)("updated_by"),
    lastNotified30Days: (0, pg_core_1.timestamp)("last_notified_30_days"),
    lastNotified7Days: (0, pg_core_1.timestamp)("last_notified_7_days"),
    lastNotifiedExpired: (0, pg_core_1.timestamp)("last_notified_expired"),
    claimedByUserId: (0, pg_core_1.varchar)("claimed_by_user_id"),
    claimedAt: (0, pg_core_1.timestamp)("claimed_at"),
    isVerifiedOwner: (0, pg_core_1.boolean)("is_verified_owner").notNull().default(false),
    verifiedOwnerAt: (0, pg_core_1.timestamp)("verified_owner_at"),
    latitude: (0, pg_core_1.varchar)("latitude"),
    longitude: (0, pg_core_1.varchar)("longitude"),
    country: (0, pg_core_1.varchar)("country"),
    city: (0, pg_core_1.varchar)("city"),
});
exports.agencyReports = (0, pg_core_1.pgTable)("agency_reports", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id"),
    agencyName: (0, pg_core_1.varchar)("agency_name").notNull(),
    reporterEmail: (0, pg_core_1.varchar)("reporter_email"),
    reporterPhone: (0, pg_core_1.varchar)("reporter_phone"),
    description: (0, pg_core_1.text)("description").notNull(),
    status: (0, pg_core_1.varchar)("status").notNull().default("pending"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.agencyClaims = (0, pg_core_1.pgTable)("agency_claims", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    agencyName: (0, pg_core_1.varchar)("agency_name").notNull(),
    licenseNumber: (0, pg_core_1.varchar)("license_number").notNull(),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    contactName: (0, pg_core_1.varchar)("contact_name").notNull(),
    contactEmail: (0, pg_core_1.varchar)("contact_email").notNull(),
    contactPhone: (0, pg_core_1.varchar)("contact_phone"),
    role: (0, pg_core_1.varchar)("role").notNull(), // 'owner', 'director', 'manager', 'authorized_rep'
    status: (0, pg_core_1.varchar)("status").notNull().default("pending"), // pending, approved, rejected
    proofFiles: (0, pg_core_1.jsonb)("proof_files").default([]), // [{filename, path, mimetype, size}]
    proofDescription: (0, pg_core_1.text)("proof_description"),
    reviewedBy: (0, pg_core_1.varchar)("reviewed_by"),
    reviewNotes: (0, pg_core_1.text)("review_notes"),
    reviewedAt: (0, pg_core_1.timestamp)("reviewed_at"),
    submittedAt: (0, pg_core_1.timestamp)("submitted_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertAgencyClaimSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyClaims).omit({ id: true, submittedAt: true, updatedAt: true, reviewedAt: true });
exports.agencyNotifications = (0, pg_core_1.pgTable)("agency_notifications", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    agencyName: (0, pg_core_1.varchar)("agency_name").notNull(),
    licenseNumber: (0, pg_core_1.varchar)("license_number").notNull(),
    type: (0, pg_core_1.varchar)("type").notNull(), // 'expiring_soon' (30 days), 'expiring_very_soon' (7 days), 'expired'
    expiryDate: (0, pg_core_1.timestamp)("expiry_date").notNull(),
    daysLeft: (0, pg_core_1.integer)("days_left").notNull(),
    isRead: (0, pg_core_1.boolean)("is_read").notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.adminSettings = (0, pg_core_1.pgTable)("admin_settings", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    key: (0, pg_core_1.varchar)("key").notNull().unique(),
    value: (0, pg_core_1.text)("value").notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Agency premium add-ons
exports.agencyAddOns = (0, pg_core_1.pgTable)("agency_add_ons", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    addOnType: (0, pg_core_1.varchar)("add_on_type").notNull(), // 'homepage_banner', 'country_exposure', 'verified_badge', 'profile_page', 'click_analytics'
    price: (0, pg_core_1.integer)("price").notNull(),
    countryId: (0, pg_core_1.varchar)("country_id"), // For country-specific exposure
    startDate: (0, pg_core_1.timestamp)("start_date").notNull(),
    endDate: (0, pg_core_1.timestamp)("end_date").notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    paymentRef: (0, pg_core_1.varchar)("payment_ref"),
    notes: (0, pg_core_1.text)("notes"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    createdBy: (0, pg_core_1.varchar)("created_by"),
});
// Agency click tracking for analytics
exports.agencyClicks = (0, pg_core_1.pgTable)("agency_clicks", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    source: (0, pg_core_1.varchar)("source").notNull(), // 'homepage_banner', 'search_result', 'country_page', 'profile_page'
    ipHash: (0, pg_core_1.varchar)("ip_hash"), // Hashed for privacy
    userAgent: (0, pg_core_1.text)("user_agent"),
    referrer: (0, pg_core_1.varchar)("referrer"),
    clickedAt: (0, pg_core_1.timestamp)("clicked_at").defaultNow(),
});
// Agency profile pages for premium subscribers
exports.agencyProfiles = (0, pg_core_1.pgTable)("agency_profiles", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull().unique(),
    description: (0, pg_core_1.text)("description"),
    phone: (0, pg_core_1.varchar)("phone"),
    email: (0, pg_core_1.varchar)("email"),
    website: (0, pg_core_1.varchar)("website"),
    address: (0, pg_core_1.text)("address"),
    services: (0, pg_core_1.text)("services"), // JSON array of services offered
    countries: (0, pg_core_1.text)("countries"), // JSON array of destination countries
    bannerImageUrl: (0, pg_core_1.varchar)("banner_image_url"),
    logoUrl: (0, pg_core_1.varchar)("logo_url"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Service orders for career services
exports.serviceOrders = (0, pg_core_1.pgTable)("service_orders", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    serviceId: (0, pg_core_1.varchar)("service_id").notNull(),
    serviceName: (0, pg_core_1.varchar)("service_name").notNull(),
    amount: (0, pg_core_1.integer)("amount").notNull(),
    currency: (0, pg_core_1.varchar)("currency").notNull().default("KES"),
    status: (0, pg_core_1.varchar)("status").notNull().default("pending"), // pending, paid, intake_required, processing, completed, cancelled
    paymentMethod: (0, pg_core_1.varchar)("payment_method"),
    paymentRef: (0, pg_core_1.varchar)("payment_ref"),
    intakeData: (0, pg_core_1.jsonb)("intake_data"), // JSON with form responses
    adminNotes: (0, pg_core_1.text)("admin_notes"),
    assignedTo: (0, pg_core_1.varchar)("assigned_to"),
    completedAt: (0, pg_core_1.timestamp)("completed_at"),
    userNotifiedAt: (0, pg_core_1.timestamp)("user_notified_at"),
    // AI Processing fields
    aiProcessedAt: (0, pg_core_1.timestamp)("ai_processed_at"),
    aiOutput: (0, pg_core_1.jsonb)("ai_output"), // AI-generated content (CV, cover letter, etc.)
    qualityScore: (0, pg_core_1.integer)("quality_score"), // 0-100 quality score
    qualityPassed: (0, pg_core_1.boolean)("quality_passed"),
    qualityCheckData: (0, pg_core_1.jsonb)("quality_check_data"), // Detailed quality check results
    needsHumanReview: (0, pg_core_1.boolean)("needs_human_review").notNull().default(false),
    humanReviewNotes: (0, pg_core_1.text)("human_review_notes"),
    reviewedBy: (0, pg_core_1.varchar)("reviewed_by"),
    reviewedAt: (0, pg_core_1.timestamp)("reviewed_at"),
    abandonedCartAlertSentAt: (0, pg_core_1.timestamp)("abandoned_cart_alert_sent_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Service order deliverables (completed files for download)
exports.serviceDeliverables = (0, pg_core_1.pgTable)("service_deliverables", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    orderId: (0, pg_core_1.varchar)("order_id").notNull(),
    fileName: (0, pg_core_1.varchar)("file_name").notNull(),
    fileType: (0, pg_core_1.varchar)("file_type").notNull(),
    fileSize: (0, pg_core_1.integer)("file_size"),
    fileUrl: (0, pg_core_1.varchar)("file_url").notNull(), // Base64 or URL to stored file
    description: (0, pg_core_1.text)("description"),
    downloadCount: (0, pg_core_1.integer)("download_count").notNull().default(0),
    uploadedBy: (0, pg_core_1.varchar)("uploaded_by"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// User notifications for order updates
exports.userNotifications = (0, pg_core_1.pgTable)("user_notifications", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    orderId: (0, pg_core_1.varchar)("order_id"),
    title: (0, pg_core_1.varchar)("title").notNull(),
    message: (0, pg_core_1.text)("message").notNull(),
    type: (0, pg_core_1.varchar)("type").notNull().default("info"), // info, success, warning, order_update
    isRead: (0, pg_core_1.boolean)("is_read").notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// User notification preferences
exports.notificationPreferences = (0, pg_core_1.pgTable)("notification_preferences", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull().unique(),
    emailNotifications: (0, pg_core_1.boolean)("email_notifications").notNull().default(true),
    pushNotifications: (0, pg_core_1.boolean)("push_notifications").notNull().default(true),
    applicationUpdates: (0, pg_core_1.boolean)("application_updates").notNull().default(true),
    jobAlerts: (0, pg_core_1.boolean)("job_alerts").notNull().default(true),
    marketingEmails: (0, pg_core_1.boolean)("marketing_emails").notNull().default(false),
    weeklyDigest: (0, pg_core_1.boolean)("weekly_digest").notNull().default(true),
    quietHoursStart: (0, pg_core_1.varchar)("quiet_hours_start").default("22:00"), // Don't send after 10 PM
    quietHoursEnd: (0, pg_core_1.varchar)("quiet_hours_end").default("08:00"), // Until 8 AM
    maxDailyNotifications: (0, pg_core_1.integer)("max_daily_notifications").notNull().default(5),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Notification templates for consistent, non-intrusive copy
exports.notificationTemplates = (0, pg_core_1.pgTable)("notification_templates", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    templateKey: (0, pg_core_1.varchar)("template_key").notNull().unique(), // e.g., "application_submitted", "materials_ready"
    category: (0, pg_core_1.varchar)("category").notNull(), // "application", "job_alert", "reminder", "promotional"
    title: (0, pg_core_1.varchar)("title").notNull(),
    message: (0, pg_core_1.text)("message").notNull(),
    pushTitle: (0, pg_core_1.varchar)("push_title"), // Shorter version for push
    pushMessage: (0, pg_core_1.text)("push_message"), // Shorter version for push
    priority: (0, pg_core_1.varchar)("priority").notNull().default("normal"), // low, normal, high
    cooldownMinutes: (0, pg_core_1.integer)("cooldown_minutes").notNull().default(0), // Min time between same notification type
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
});
// Push notification subscriptions
exports.pushSubscriptions = (0, pg_core_1.pgTable)("push_subscriptions", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    endpoint: (0, pg_core_1.text)("endpoint").notNull(),
    p256dh: (0, pg_core_1.text)("p256dh").notNull(),
    auth: (0, pg_core_1.text)("auth").notNull(),
    userAgent: (0, pg_core_1.text)("user_agent"),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Job counts per country for real-time alerts
exports.jobCounts = (0, pg_core_1.pgTable)("job_counts", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    countryCode: (0, pg_core_1.varchar)("country_code").notNull().unique(),
    countryName: (0, pg_core_1.varchar)("country_name").notNull(),
    jobCount: (0, pg_core_1.integer)("job_count").notNull().default(0),
    previousCount: (0, pg_core_1.integer)("previous_count").default(0),
    lastUpdated: (0, pg_core_1.timestamp)("last_updated").defaultNow(),
    updatedBy: (0, pg_core_1.varchar)("updated_by"),
});
// Scheduled notifications for job postings
exports.scheduledNotifications = (0, pg_core_1.pgTable)("scheduled_notifications", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    title: (0, pg_core_1.varchar)("title").notNull(),
    body: (0, pg_core_1.text)("body").notNull(),
    url: (0, pg_core_1.varchar)("url"),
    countryId: (0, pg_core_1.varchar)("country_id"),
    type: (0, pg_core_1.varchar)("type").notNull().default("job_posting"), // job_posting, deadline, announcement
    scheduledFor: (0, pg_core_1.timestamp)("scheduled_for"),
    sentAt: (0, pg_core_1.timestamp)("sent_at"),
    recipientCount: (0, pg_core_1.integer)("recipient_count").default(0),
    status: (0, pg_core_1.varchar)("status").notNull().default("pending"), // pending, sent, cancelled
    createdBy: (0, pg_core_1.varchar)("created_by"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Student Visa Information
exports.studentVisas = (0, pg_core_1.pgTable)("student_visas", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    countryCode: (0, pg_core_1.varchar)("country_code").notNull(),
    visaType: (0, pg_core_1.varchar)("visa_type").notNull(),
    visaName: (0, pg_core_1.varchar)("visa_name").notNull(),
    description: (0, pg_core_1.text)("description").notNull(),
    processingTime: (0, pg_core_1.varchar)("processing_time"),
    validityPeriod: (0, pg_core_1.varchar)("validity_period"),
    applicationFee: (0, pg_core_1.varchar)("application_fee"),
    ageRequirement: (0, pg_core_1.varchar)("age_requirement"),
    workRights: (0, pg_core_1.varchar)("work_rights"),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    order: (0, pg_core_1.integer)("order").notNull().default(0),
});
// Student Visa Requirements/Documents
exports.visaRequirements = (0, pg_core_1.pgTable)("visa_requirements", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    visaId: (0, pg_core_1.varchar)("visa_id").notNull(),
    category: (0, pg_core_1.varchar)("category").notNull(), // academic, financial, english, health, other
    requirement: (0, pg_core_1.text)("requirement").notNull(),
    isRequired: (0, pg_core_1.boolean)("is_required").notNull().default(true),
    order: (0, pg_core_1.integer)("order").notNull().default(0),
});
// Student Visa Application Steps
exports.visaSteps = (0, pg_core_1.pgTable)("visa_steps", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    visaId: (0, pg_core_1.varchar)("visa_id").notNull(),
    stepNumber: (0, pg_core_1.integer)("step_number").notNull(),
    title: (0, pg_core_1.varchar)("title").notNull(),
    description: (0, pg_core_1.text)("description").notNull(),
    estimatedTime: (0, pg_core_1.varchar)("estimated_time"),
    tips: (0, pg_core_1.text)("tips"),
});
// Useful Links for Student Visas
exports.visaLinks = (0, pg_core_1.pgTable)("visa_links", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    visaId: (0, pg_core_1.varchar)("visa_id"),
    countryCode: (0, pg_core_1.varchar)("country_code"),
    linkType: (0, pg_core_1.varchar)("link_type").notNull(), // official, university, scholarship, embassy
    name: (0, pg_core_1.varchar)("name").notNull(),
    url: (0, pg_core_1.varchar)("url").notNull(),
    description: (0, pg_core_1.text)("description"),
    order: (0, pg_core_1.integer)("order").notNull().default(0),
});
exports.countriesRelations = (0, drizzle_orm_1.relations)(exports.countries, ({ many }) => ({
    guides: many(exports.countryGuides),
    jobLinks: many(exports.jobLinks),
    scamAlerts: many(exports.scamAlerts),
}));
exports.countryGuidesRelations = (0, drizzle_orm_1.relations)(exports.countryGuides, ({ one }) => ({
    country: one(exports.countries, {
        fields: [exports.countryGuides.countryId],
        references: [exports.countries.id],
    }),
}));
exports.jobLinksRelations = (0, drizzle_orm_1.relations)(exports.jobLinks, ({ one }) => ({
    country: one(exports.countries, {
        fields: [exports.jobLinks.countryId],
        references: [exports.countries.id],
    }),
}));
exports.scamAlertsRelations = (0, drizzle_orm_1.relations)(exports.scamAlerts, ({ one }) => ({
    country: one(exports.countries, {
        fields: [exports.scamAlerts.countryId],
        references: [exports.countries.id],
    }),
}));
// Referral tracking
exports.referrals = (0, pg_core_1.pgTable)("referrals", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    refCode: (0, pg_core_1.varchar)("ref_code", { length: 50 }).notNull(),
    referredPhone: (0, pg_core_1.varchar)("referred_phone", { length: 15 }).notNull().unique(), // Prevent duplicate referrals
    paymentAmount: (0, pg_core_1.integer)("payment_amount").notNull().default(4500),
    commission: (0, pg_core_1.integer)("commission").notNull().default(450),
    status: (0, pg_core_1.varchar)("status", { length: 20 }).notNull().default("pending"),
    paidAt: (0, pg_core_1.timestamp)("paid_at"),
    transactionId: (0, pg_core_1.varchar)("transaction_id", { length: 100 }),
    retryCount: (0, pg_core_1.integer)("retry_count").notNull().default(0),
    lastPayoutAttempt: (0, pg_core_1.timestamp)("last_payout_attempt"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertReferralSchema = (0, drizzle_zod_1.createInsertSchema)(exports.referrals).omit({ id: true, createdAt: true, paidAt: true, transactionId: true });
// Influencer program (invite-only)
exports.influencers = (0, pg_core_1.pgTable)("influencers", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.varchar)("user_id", { length: 255 }).notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    phone: (0, pg_core_1.varchar)("phone", { length: 15 }).notNull(),
    email: (0, pg_core_1.varchar)("email", { length: 255 }),
    refCode: (0, pg_core_1.varchar)("ref_code", { length: 50 }).notNull().unique(),
    commissionRate: (0, pg_core_1.integer)("commission_rate").notNull().default(10), // Percentage
    status: (0, pg_core_1.varchar)("status", { length: 20 }).notNull().default("pending"), // pending, approved, rejected, suspended
    inviteCode: (0, pg_core_1.varchar)("invite_code", { length: 50 }),
    totalReferrals: (0, pg_core_1.integer)("total_referrals").notNull().default(0),
    totalEarnings: (0, pg_core_1.integer)("total_earnings").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    approvedAt: (0, pg_core_1.timestamp)("approved_at"),
});
exports.insertInfluencerSchema = (0, drizzle_zod_1.createInsertSchema)(exports.influencers).omit({ id: true, createdAt: true, approvedAt: true, totalReferrals: true, totalEarnings: true });
exports.insertPaymentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.payments).omit({ id: true, createdAt: true });
exports.insertCountrySchema = (0, drizzle_zod_1.createInsertSchema)(exports.countries).omit({ id: true });
exports.insertCountryGuideSchema = (0, drizzle_zod_1.createInsertSchema)(exports.countryGuides).omit({ id: true });
exports.insertJobLinkSchema = (0, drizzle_zod_1.createInsertSchema)(exports.jobLinks).omit({ id: true });
exports.insertScamAlertSchema = (0, drizzle_zod_1.createInsertSchema)(exports.scamAlerts).omit({ id: true, createdAt: true });
exports.insertServiceSchema = (0, drizzle_zod_1.createInsertSchema)(exports.services).omit({ id: true });
exports.insertUserSubscriptionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.userSubscriptions).omit({ id: true, createdAt: true, updatedAt: true, startDate: true });
exports.insertAdminLogSchema = (0, drizzle_zod_1.createInsertSchema)(exports.adminLogs).omit({ id: true, timestamp: true });
exports.insertNeaAgencySchema = (0, drizzle_zod_1.createInsertSchema)(exports.neaAgencies).omit({ id: true, lastUpdated: true });
exports.insertAgencyReportSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyReports).omit({ id: true, createdAt: true });
exports.insertAgencyNotificationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyNotifications).omit({ id: true, createdAt: true });
exports.insertAgencyAddOnSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyAddOns).omit({ id: true, createdAt: true });
exports.insertAgencyClickSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyClicks).omit({ id: true, clickedAt: true });
exports.insertAgencyProfileSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyProfiles).omit({ id: true, createdAt: true, updatedAt: true });
exports.insertServiceOrderSchema = (0, drizzle_zod_1.createInsertSchema)(exports.serviceOrders).omit({ id: true, createdAt: true, updatedAt: true });
exports.insertServiceDeliverableSchema = (0, drizzle_zod_1.createInsertSchema)(exports.serviceDeliverables).omit({ id: true, createdAt: true });
exports.insertUserNotificationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.userNotifications).omit({ id: true, createdAt: true });
exports.insertNotificationPreferencesSchema = (0, drizzle_zod_1.createInsertSchema)(exports.notificationPreferences).omit({ id: true, createdAt: true, updatedAt: true });
exports.insertNotificationTemplateSchema = (0, drizzle_zod_1.createInsertSchema)(exports.notificationTemplates).omit({ id: true });
exports.insertPushSubscriptionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.pushSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
exports.insertScheduledNotificationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.scheduledNotifications).omit({ id: true, createdAt: true });
exports.insertJobCountSchema = (0, drizzle_zod_1.createInsertSchema)(exports.jobCounts).omit({ id: true, lastUpdated: true });
exports.insertStudentVisaSchema = (0, drizzle_zod_1.createInsertSchema)(exports.studentVisas).omit({ id: true });
exports.insertVisaRequirementSchema = (0, drizzle_zod_1.createInsertSchema)(exports.visaRequirements).omit({ id: true });
exports.insertVisaStepSchema = (0, drizzle_zod_1.createInsertSchema)(exports.visaSteps).omit({ id: true });
exports.insertVisaLinkSchema = (0, drizzle_zod_1.createInsertSchema)(exports.visaLinks).omit({ id: true });
// ============================================
// COUNTRY INSIGHTS - Unique Value Data
// ============================================
exports.countryInsights = (0, pg_core_1.pgTable)("country_insights", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    countryCode: (0, pg_core_1.varchar)("country_code").notNull().unique(),
    // Salary data
    avgSalaryUsd: (0, pg_core_1.integer)("avg_salary_usd"), // Average annual salary in USD
    minWageUsd: (0, pg_core_1.integer)("min_wage_usd"), // Minimum wage in USD/month
    topPayingJobs: (0, pg_core_1.jsonb)("top_paying_jobs"), // Array of { job: string, salaryRange: string }
    // Cost of living
    costOfLivingIndex: (0, pg_core_1.integer)("cost_of_living_index"), // Index (100 = baseline)
    rentAvgUsd: (0, pg_core_1.integer)("rent_avg_usd"), // Average monthly rent
    mealCostUsd: (0, pg_core_1.integer)("meal_cost_usd"), // Average meal cost
    // Visa & Work permits
    workVisaTypes: (0, pg_core_1.jsonb)("work_visa_types"), // Array of { name, processingTime, cost, requirements }
    visaDifficulty: (0, pg_core_1.varchar)("visa_difficulty"), // easy, moderate, difficult
    processingTimeWeeks: (0, pg_core_1.integer)("processing_time_weeks"),
    // Job market
    unemploymentRate: (0, pg_core_1.varchar)("unemployment_rate"),
    demandSectors: (0, pg_core_1.jsonb)("demand_sectors"), // Array of high-demand sectors
    growthRate: (0, pg_core_1.varchar)("growth_rate"), // Job market growth
    // Living conditions
    qualityOfLifeScore: (0, pg_core_1.integer)("quality_of_life_score"), // 1-100
    safetyScore: (0, pg_core_1.integer)("safety_score"), // 1-100
    healthcareScore: (0, pg_core_1.integer)("healthcare_score"), // 1-100
    languages: (0, pg_core_1.jsonb)("languages"), // Official/business languages
    timezone: (0, pg_core_1.varchar)("timezone"),
    // Tips
    proTips: (0, pg_core_1.jsonb)("pro_tips"), // Array of insider tips
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// ============================================
// ADVISORS & CONSULTATION BOOKING
// ============================================
exports.advisors = (0, pg_core_1.pgTable)("advisors", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    name: (0, pg_core_1.varchar)("name").notNull(),
    title: (0, pg_core_1.varchar)("title").notNull(), // e.g., "Senior Career Consultant"
    specialization: (0, pg_core_1.varchar)("specialization"), // e.g., "Canada Immigration", "Healthcare Jobs"
    bio: (0, pg_core_1.text)("bio"),
    photoUrl: (0, pg_core_1.varchar)("photo_url"),
    experience: (0, pg_core_1.integer)("experience"), // Years of experience
    successRate: (0, pg_core_1.integer)("success_rate"), // Percentage
    consultationsCompleted: (0, pg_core_1.integer)("consultations_completed").default(0),
    rating: (0, pg_core_1.integer)("rating").default(50), // 1-50 (5.0 stars * 10)
    languages: (0, pg_core_1.jsonb)("languages"), // Array of languages spoken
    availability: (0, pg_core_1.jsonb)("availability"), // Weekly availability schedule
    whatsappNumber: (0, pg_core_1.varchar)("whatsapp_number"),
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.consultationBookings = (0, pg_core_1.pgTable)("consultation_bookings", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    advisorId: (0, pg_core_1.varchar)("advisor_id"),
    userName: (0, pg_core_1.varchar)("user_name"),
    userEmail: (0, pg_core_1.varchar)("user_email"),
    userPhone: (0, pg_core_1.varchar)("user_phone"),
    scheduledDate: (0, pg_core_1.timestamp)("scheduled_date").notNull(),
    duration: (0, pg_core_1.integer)("duration").default(30),
    status: (0, pg_core_1.varchar)("status").default("pending"), // pending, confirmed, completed, cancelled, no_show
    topic: (0, pg_core_1.varchar)("topic"),
    notes: (0, pg_core_1.text)("notes"),
    advisorNotes: (0, pg_core_1.text)("advisor_notes"),
    reminderSent: (0, pg_core_1.boolean)("reminder_sent").default(false),
    whatsappSent: (0, pg_core_1.boolean)("whatsapp_sent").default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// ============================================
// SUCCESS STORIES & TESTIMONIALS
// ============================================
exports.successStories = (0, pg_core_1.pgTable)("success_stories", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    name: (0, pg_core_1.varchar)("name").notNull(),
    location: (0, pg_core_1.varchar)("location"), // e.g., "Nairobi → Toronto"
    countryCode: (0, pg_core_1.varchar)("country_code"), // Destination country
    jobTitle: (0, pg_core_1.varchar)("job_title"),
    company: (0, pg_core_1.varchar)("company"),
    photoUrl: (0, pg_core_1.varchar)("photo_url"),
    story: (0, pg_core_1.text)("story").notNull(),
    quote: (0, pg_core_1.text)("quote"), // Short testimonial quote
    rating: (0, pg_core_1.integer)("rating").default(5), // 1-5 stars
    salaryIncrease: (0, pg_core_1.varchar)("salary_increase"), // e.g., "3x salary increase"
    timeToJob: (0, pg_core_1.varchar)("time_to_job"), // e.g., "Got job in 2 months"
    isVerified: (0, pg_core_1.boolean)("is_verified").default(false),
    isFeatured: (0, pg_core_1.boolean)("is_featured").default(false),
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Insert schemas and types for new tables
exports.insertCountryInsightsSchema = (0, drizzle_zod_1.createInsertSchema)(exports.countryInsights).omit({ id: true, updatedAt: true });
exports.insertAdvisorSchema = (0, drizzle_zod_1.createInsertSchema)(exports.advisors).omit({ id: true, createdAt: true, consultationsCompleted: true });
exports.insertConsultationBookingSchema = (0, drizzle_zod_1.createInsertSchema)(exports.consultationBookings).omit({ id: true, createdAt: true, updatedAt: true });
exports.insertSuccessStorySchema = (0, drizzle_zod_1.createInsertSchema)(exports.successStories).omit({ id: true, createdAt: true });
// ============================================
// ASSISTED APPLY MODE TABLES
// ============================================
// Application Packs - Pricing tiers for assisted application service
exports.applicationPacks = (0, pg_core_1.pgTable)("application_packs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    name: (0, pg_core_1.varchar)("name").notNull(),
    description: (0, pg_core_1.text)("description").notNull(),
    price: (0, pg_core_1.integer)("price").notNull(),
    currency: (0, pg_core_1.varchar)("currency").notNull().default("KES"),
    applicationCount: (0, pg_core_1.integer)("application_count").notNull(), // Number of job applications included
    features: (0, pg_core_1.jsonb)("features").notNull(), // Array of feature strings
    turnaroundDays: (0, pg_core_1.integer)("turnaround_days").notNull().default(3),
    isPopular: (0, pg_core_1.boolean)("is_popular").notNull().default(false),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    order: (0, pg_core_1.integer)("order").notNull().default(0),
    packType: (0, pg_core_1.varchar)("pack_type").notNull().default("job"), // "job" or "student"
    targetAudience: (0, pg_core_1.text)("target_audience"), // Description of who this pack is for
    successRate: (0, pg_core_1.varchar)("success_rate"), // e.g., "85% interview rate"
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// User Application Pack Purchases
exports.userApplicationPacks = (0, pg_core_1.pgTable)("user_application_packs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    packId: (0, pg_core_1.varchar)("pack_id").notNull(),
    packName: (0, pg_core_1.varchar)("pack_name").notNull(),
    totalApplications: (0, pg_core_1.integer)("total_applications").notNull(),
    usedApplications: (0, pg_core_1.integer)("used_applications").notNull().default(0),
    amount: (0, pg_core_1.integer)("amount").notNull(),
    currency: (0, pg_core_1.varchar)("currency").notNull().default("KES"),
    paymentMethod: (0, pg_core_1.varchar)("payment_method"),
    paymentRef: (0, pg_core_1.varchar)("payment_ref"),
    status: (0, pg_core_1.varchar)("status").notNull().default("pending"), // pending, paid, active, exhausted, expired
    expiresAt: (0, pg_core_1.timestamp)("expires_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// User Job Applications - Individual application tracking
exports.userJobApplications = (0, pg_core_1.pgTable)("user_job_applications", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    userPackId: (0, pg_core_1.varchar)("user_pack_id").notNull(), // Links to purchased pack
    // Job details (collected during intake)
    jobTitle: (0, pg_core_1.varchar)("job_title").notNull(),
    companyName: (0, pg_core_1.varchar)("company_name").notNull(),
    jobUrl: (0, pg_core_1.varchar)("job_url").notNull(),
    targetCountry: (0, pg_core_1.varchar)("target_country").notNull(),
    jobDescription: (0, pg_core_1.text)("job_description"),
    applicationDeadline: (0, pg_core_1.timestamp)("application_deadline"),
    // Application materials
    intakeData: (0, pg_core_1.jsonb)("intake_data"), // User's profile info, resume, etc.
    preparedMaterials: (0, pg_core_1.jsonb)("prepared_materials"), // CV, cover letter prepared by team
    // Status tracking
    status: (0, pg_core_1.varchar)("status").notNull().default("submitted"), // submitted, queued, analyzing, generating, preparing, materials_ready, downloaded, failed, user_action_required, applied, confirmed, rejected, interview_scheduled
    statusMessage: (0, pg_core_1.text)("status_message"),
    adminNotes: (0, pg_core_1.text)("admin_notes"),
    assignedTo: (0, pg_core_1.varchar)("assigned_to"),
    // Timestamps
    userAppliedAt: (0, pg_core_1.timestamp)("user_applied_at"), // When user marked as applied
    confirmedAt: (0, pg_core_1.timestamp)("confirmed_at"), // When we confirmed application received
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Application Status History - For notifications and tracking
exports.applicationStatusHistory = (0, pg_core_1.pgTable)("application_status_history", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    applicationId: (0, pg_core_1.varchar)("application_id").notNull(),
    previousStatus: (0, pg_core_1.varchar)("previous_status"),
    newStatus: (0, pg_core_1.varchar)("new_status").notNull(),
    message: (0, pg_core_1.text)("message"),
    changedBy: (0, pg_core_1.varchar)("changed_by"), // admin user id or 'system'
    notificationSent: (0, pg_core_1.boolean)("notification_sent").notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Insert schemas for Assisted Apply Mode
exports.insertApplicationPackSchema = (0, drizzle_zod_1.createInsertSchema)(exports.applicationPacks).omit({ id: true, createdAt: true });
exports.insertUserApplicationPackSchema = (0, drizzle_zod_1.createInsertSchema)(exports.userApplicationPacks).omit({ id: true, createdAt: true, updatedAt: true });
exports.insertUserJobApplicationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.userJobApplications).omit({ id: true, createdAt: true, updatedAt: true });
exports.insertApplicationStatusHistorySchema = (0, drizzle_zod_1.createInsertSchema)(exports.applicationStatusHistory).omit({ id: true, createdAt: true });
// Application status constants
exports.APPLICATION_STATUSES = {
    SUBMITTED: "submitted",
    PREPARING: "preparing",
    MATERIALS_READY: "materials_ready",
    USER_ACTION_REQUIRED: "user_action_required",
    APPLIED: "applied",
    CONFIRMED: "confirmed",
    REJECTED: "rejected",
    INTERVIEW_SCHEDULED: "interview_scheduled",
};
// Security: Account lockout tracking for failed payment attempts
exports.accountLockouts = (0, pg_core_1.pgTable)("account_lockouts", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    identifier: (0, pg_core_1.varchar)("identifier").notNull(), // IP address or user ID
    identifierType: (0, pg_core_1.varchar)("identifier_type").notNull(), // 'ip' or 'user'
    failedAttempts: (0, pg_core_1.integer)("failed_attempts").notNull().default(0),
    lastFailedAt: (0, pg_core_1.timestamp)("last_failed_at"),
    lockedUntil: (0, pg_core_1.timestamp)("locked_until"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertAccountLockoutSchema = (0, drizzle_zod_1.createInsertSchema)(exports.accountLockouts).omit({ id: true, createdAt: true, updatedAt: true });
// Security: Webhook idempotency - prevent duplicate processing
exports.webhookProcessingLocks = (0, pg_core_1.pgTable)("webhook_processing_locks", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    lockKey: (0, pg_core_1.varchar)("lock_key").notNull().unique(), // Unique identifier (e.g., CheckoutRequestID)
    webhookType: (0, pg_core_1.varchar)("webhook_type").notNull(), // 'mpesa_stk', 'mpesa_b2c', etc.
    status: (0, pg_core_1.varchar)("status").notNull().default("processing"), // 'processing', 'completed', 'failed'
    processedAt: (0, pg_core_1.timestamp)("processed_at"),
    expiresAt: (0, pg_core_1.timestamp)("expires_at").notNull(), // Lock expiry for stale locks
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertWebhookProcessingLockSchema = (0, drizzle_zod_1.createInsertSchema)(exports.webhookProcessingLocks).omit({ id: true, createdAt: true });
// Self-tracked applications - Users manually track jobs they apply to
exports.trackedApplications = (0, pg_core_1.pgTable)("tracked_applications", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    // Job details
    jobTitle: (0, pg_core_1.varchar)("job_title").notNull(),
    companyName: (0, pg_core_1.varchar)("company_name").notNull(),
    jobUrl: (0, pg_core_1.varchar)("job_url"),
    targetCountry: (0, pg_core_1.varchar)("target_country").notNull(),
    salary: (0, pg_core_1.varchar)("salary"), // Expected/listed salary
    location: (0, pg_core_1.varchar)("location"), // Specific city/region
    jobType: (0, pg_core_1.varchar)("job_type"), // full-time, part-time, contract
    source: (0, pg_core_1.varchar)("source"), // Where they found it (platform name)
    // Status tracking
    status: (0, pg_core_1.varchar)("status").notNull().default("saved"), // saved, applied, interviewing, offered, accepted, rejected, withdrawn
    appliedAt: (0, pg_core_1.timestamp)("applied_at"),
    // User notes and reminders
    notes: (0, pg_core_1.text)("notes"),
    deadline: (0, pg_core_1.timestamp)("deadline"), // Application/submission deadline set by user
    nextFollowUp: (0, pg_core_1.timestamp)("next_follow_up"),
    reminderSent: (0, pg_core_1.boolean)("reminder_sent").notNull().default(false),
    // Bulk apply enrichment
    coverLetter: (0, pg_core_1.text)("cover_letter"),
    applicationAnswers: (0, pg_core_1.jsonb)("application_answers"), // [{question, answer}]
    // Timestamps
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Tracked application status constants (simpler than Assisted Apply)
exports.TRACKED_APP_STATUSES = {
    SAVED: "saved",
    APPLIED: "applied",
    INTERVIEWING: "interviewing",
    OFFERED: "offered",
    ACCEPTED: "accepted",
    REJECTED: "rejected",
    WITHDRAWN: "withdrawn",
};
exports.insertTrackedApplicationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.trackedApplications).omit({ id: true, createdAt: true, updatedAt: true });
// ==================== COUNTRY JOURNEY CHECKLIST ====================
// 2026-06: per-user, per-country progress through the 10-12 step roadmap
// of landing a job in their target country (passport, visa, KCSE attestation,
// English cert, agency vetting, contract review, departure prep, etc.).
//
// Step definitions live in client/server constants (server/lib/country-journey-steps.ts)
// because they're authored content, not DB data. Each row here records WHICH
// steps a given user has completed for a given country, plus when they
// started + last touched it. Drives the "Continue your journey" home dashboard
// widget and the standalone /journey page.
exports.userCountryJourneys = (0, pg_core_1.pgTable)("user_country_journeys", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    countryCode: (0, pg_core_1.varchar)("country_code", { length: 8 }).notNull(), // ISO-2 (KE, AE, GB, etc.)
    // Array of step keys the user has marked complete (e.g. ["passport", "kcse_attestation"]).
    // Stored as JSON so it's a simple in-place mutation rather than a join table.
    completedSteps: (0, pg_core_1.jsonb)("completed_steps").notNull().default((0, drizzle_orm_1.sql) `'[]'::jsonb`),
    // Stage label the user has self-identified at (preparing / applying / hired / departed)
    stage: (0, pg_core_1.varchar)("stage", { length: 32 }).notNull().default("preparing"),
    startedAt: (0, pg_core_1.timestamp)("started_at").defaultNow(),
    lastTouchedAt: (0, pg_core_1.timestamp)("last_touched_at").defaultNow(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, (t) => ({
    // One row per (user, country). Users CAN target multiple countries — each gets its own row.
    uniqUserCountry: (0, pg_core_1.uniqueIndex)("uniq_user_country_journey").on(t.userId, t.countryCode),
    byUser: (0, pg_core_1.index)("idx_user_country_journey_user").on(t.userId),
}));
exports.insertUserCountryJourneySchema = (0, drizzle_zod_1.createInsertSchema)(exports.userCountryJourneys).omit({ id: true, createdAt: true, updatedAt: true });
exports.JOURNEY_STAGES = {
    PREPARING: "preparing", // gathering docs, CV, etc.
    APPLYING: "applying", // actively sending applications
    INTERVIEW: "interview", // in interview / offer process
    HIRED: "hired", // signed contract, awaiting departure
    DEPARTED: "departed", // already abroad
};
// ==================== USER BOOKMARKS ====================
// 2026-06 retention #5: lets users save any job listing, country portal, or
// service for later viewing. One row per (user, itemType, itemId). Title +
// subtitle + meta are cached at save time so the bookmark still renders even
// if the underlying job/portal gets removed or rotated.
exports.userBookmarks = (0, pg_core_1.pgTable)("user_bookmarks", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // "visa_job" | "agency_job" | "portal" | "service" | "country"
    itemType: (0, pg_core_1.varchar)("item_type", { length: 32 }).notNull(),
    // Stable identifier of the bookmarked item (job ID, portal slug, country code, etc.)
    itemId: (0, pg_core_1.varchar)("item_id", { length: 200 }).notNull(),
    title: (0, pg_core_1.varchar)("title", { length: 300 }).notNull(),
    subtitle: (0, pg_core_1.varchar)("subtitle", { length: 300 }),
    countryCode: (0, pg_core_1.varchar)("country_code", { length: 8 }),
    // Optional pre-computed link the bookmark card uses for navigation.
    href: (0, pg_core_1.varchar)("href", { length: 500 }),
    meta: (0, pg_core_1.jsonb)("meta"), // salary, posted date, category badges, etc.
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, (t) => ({
    uniqUserItem: (0, pg_core_1.uniqueIndex)("uniq_user_bookmark_item").on(t.userId, t.itemType, t.itemId),
    byUser: (0, pg_core_1.index)("idx_user_bookmark_user").on(t.userId),
}));
exports.insertUserBookmarkSchema = (0, drizzle_zod_1.createInsertSchema)(exports.userBookmarks).omit({ id: true, createdAt: true });
// ==================== ANALYTICS ====================
// Analytics events - tracks all user actions
exports.analyticsEvents = (0, pg_core_1.pgTable)("analytics_events", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.varchar)("user_id"), // null for anonymous users
    sessionId: (0, pg_core_1.varchar)("session_id").notNull(), // browser session tracking
    eventType: (0, pg_core_1.varchar)("event_type").notNull(), // page_view, button_click, form_submit, etc.
    eventName: (0, pg_core_1.varchar)("event_name").notNull(), // specific event name
    eventCategory: (0, pg_core_1.varchar)("event_category").notNull(), // navigation, conversion, engagement
    eventData: (0, pg_core_1.jsonb)("event_data"), // additional context as JSON
    page: (0, pg_core_1.varchar)("page"), // current page path
    referrer: (0, pg_core_1.varchar)("referrer"), // where user came from
    userAgent: (0, pg_core_1.varchar)("user_agent"),
    deviceType: (0, pg_core_1.varchar)("device_type"), // mobile, tablet, desktop
    country: (0, pg_core_1.varchar)("country"), // geo location if available
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertAnalyticsEventSchema = (0, drizzle_zod_1.createInsertSchema)(exports.analyticsEvents).omit({ id: true, createdAt: true });
// Conversion funnel tracking
exports.conversionEvents = (0, pg_core_1.pgTable)("conversion_events", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.varchar)("user_id"),
    sessionId: (0, pg_core_1.varchar)("session_id").notNull(),
    funnelStep: (0, pg_core_1.varchar)("funnel_step").notNull(), // landing_view, signup, payment_started, payment_completed, dashboard_access
    completedAt: (0, pg_core_1.timestamp)("completed_at").defaultNow(),
    metadata: (0, pg_core_1.jsonb)("metadata"), // additional context
});
exports.insertConversionEventSchema = (0, drizzle_zod_1.createInsertSchema)(exports.conversionEvents).omit({ id: true, completedAt: true });
// Daily aggregated stats for dashboard
exports.dailyStats = (0, pg_core_1.pgTable)("daily_stats", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    date: (0, pg_core_1.varchar)("date").notNull().unique(), // YYYY-MM-DD format
    pageViews: (0, pg_core_1.integer)("page_views").notNull().default(0),
    uniqueVisitors: (0, pg_core_1.integer)("unique_visitors").notNull().default(0),
    signups: (0, pg_core_1.integer)("signups").notNull().default(0),
    paymentsStarted: (0, pg_core_1.integer)("payments_started").notNull().default(0),
    paymentsCompleted: (0, pg_core_1.integer)("payments_completed").notNull().default(0),
    revenue: (0, pg_core_1.integer)("revenue").notNull().default(0), // in KES
    jobLinkClicks: (0, pg_core_1.integer)("job_link_clicks").notNull().default(0),
    serviceOrders: (0, pg_core_1.integer)("service_orders").notNull().default(0),
    // Conversion rates (stored as percentages * 100 for precision)
    signupRate: (0, pg_core_1.integer)("signup_rate").notNull().default(0), // visitors to signups
    paymentRate: (0, pg_core_1.integer)("payment_rate").notNull().default(0), // signups to payments
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertDailyStatsSchema = (0, drizzle_zod_1.createInsertSchema)(exports.dailyStats).omit({ id: true, createdAt: true, updatedAt: true });
// Funnel step constants
exports.FUNNEL_STEPS = {
    LANDING_VIEW: "landing_view",
    SIGNUP: "signup",
    PAYMENT_STARTED: "payment_started",
    PAYMENT_COMPLETED: "payment_completed",
    DASHBOARD_ACCESS: "dashboard_access",
    JOB_LINK_CLICK: "job_link_click",
    SERVICE_ORDER: "service_order",
};
// Event categories
exports.EVENT_CATEGORIES = {
    NAVIGATION: "navigation",
    CONVERSION: "conversion",
    ENGAGEMENT: "engagement",
    ERROR: "error",
};
// User Career Profiles for AI Matching
exports.userCareerProfiles = (0, pg_core_1.pgTable)("user_career_profiles", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull().unique(),
    // Professional Background
    currentJobTitle: (0, pg_core_1.varchar)("current_job_title"),
    yearsExperience: (0, pg_core_1.integer)("years_experience"),
    educationLevel: (0, pg_core_1.varchar)("education_level"), // high_school, diploma, bachelors, masters, phd
    fieldOfStudy: (0, pg_core_1.varchar)("field_of_study"),
    skills: (0, pg_core_1.jsonb)("skills").$type().default([]),
    certifications: (0, pg_core_1.jsonb)("certifications").$type().default([]),
    languages: (0, pg_core_1.jsonb)("languages").$type().default([]),
    // Preferences
    preferredCountries: (0, pg_core_1.jsonb)("preferred_countries").$type().default([]),
    preferredIndustries: (0, pg_core_1.jsonb)("preferred_industries").$type().default([]),
    salaryExpectation: (0, pg_core_1.integer)("salary_expectation"), // Monthly in USD
    willingToRelocate: (0, pg_core_1.boolean)("willing_to_relocate").default(true),
    familySize: (0, pg_core_1.integer)("family_size").default(1),
    // Immigration readiness
    hasPassport: (0, pg_core_1.boolean)("has_passport").default(false),
    passportExpiry: (0, pg_core_1.timestamp)("passport_expiry"),
    hasWorkExperienceAbroad: (0, pg_core_1.boolean)("has_work_experience_abroad").default(false),
    // Stored CV text — saved after a successful ATS check so subsequent
    // application generation has access to the user's actual CV content.
    parsedCvText: (0, pg_core_1.text)("parsed_cv_text"),
    cvLastParsed: (0, pg_core_1.timestamp)("cv_last_parsed"),
    // AI Analysis
    lastAnalyzedAt: (0, pg_core_1.timestamp)("last_analyzed_at"),
    aiRecommendations: (0, pg_core_1.jsonb)("ai_recommendations").$type(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertUserCareerProfileSchema = (0, drizzle_zod_1.createInsertSchema)(exports.userCareerProfiles).omit({ id: true, createdAt: true, updatedAt: true, lastAnalyzedAt: true });
// Job Alerts Subscriptions
exports.jobAlertSubscriptions = (0, pg_core_1.pgTable)("job_alert_subscriptions", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    countryCode: (0, pg_core_1.varchar)("country_code"), // null means all countries
    industry: (0, pg_core_1.varchar)("industry"), // null means all industries
    keywords: (0, pg_core_1.jsonb)("keywords").$type().default([]),
    frequency: (0, pg_core_1.varchar)("frequency").notNull().default("weekly"), // daily, weekly, monthly
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
    lastSentAt: (0, pg_core_1.timestamp)("last_sent_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertJobAlertSubscriptionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.jobAlertSubscriptions).omit({ id: true, createdAt: true, lastSentAt: true });
// Video Testimonials (extending success stories)
exports.videoTestimonials = (0, pg_core_1.pgTable)("video_testimonials", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    successStoryId: (0, pg_core_1.varchar)("success_story_id").references(() => exports.successStories.id),
    videoUrl: (0, pg_core_1.varchar)("video_url").notNull(), // YouTube/Vimeo URL
    videoType: (0, pg_core_1.varchar)("video_type").notNull().default("youtube"), // youtube, vimeo, direct
    thumbnailUrl: (0, pg_core_1.varchar)("thumbnail_url"),
    duration: (0, pg_core_1.integer)("duration"), // in seconds
    isApproved: (0, pg_core_1.boolean)("is_approved").default(false),
    viewCount: (0, pg_core_1.integer)("view_count").default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertVideoTestimonialSchema = (0, drizzle_zod_1.createInsertSchema)(exports.videoTestimonials).omit({ id: true, createdAt: true, viewCount: true });
// ============================================
// LICENSE EXPIRY REMINDER SYSTEM
// ============================================
exports.REMINDER_TIERS = {
    DAYS_60: "60_days",
    DAYS_30: "30_days",
    DAYS_7: "7_days",
    ON_EXPIRY: "on_expiry",
    DAYS_AFTER_7: "7_days_after",
};
exports.NOTIFICATION_CHANNELS = {
    SMS: "sms",
    WHATSAPP: "whatsapp",
    EMAIL: "email",
};
exports.licenseRenewalPayments = (0, pg_core_1.pgTable)("license_renewal_payments", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    licenseNumber: (0, pg_core_1.varchar)("license_number").notNull(),
    phoneNumber: (0, pg_core_1.varchar)("phone_number").notNull(),
    amount: (0, pg_core_1.integer)("amount").notNull(),
    renewalDurationMonths: (0, pg_core_1.integer)("renewal_duration_months").notNull().default(12),
    mpesaReceiptNumber: (0, pg_core_1.varchar)("mpesa_receipt_number"),
    checkoutRequestId: (0, pg_core_1.varchar)("checkout_request_id"),
    merchantRequestId: (0, pg_core_1.varchar)("merchant_request_id"),
    status: (0, pg_core_1.varchar)("status").notNull().default("pending"),
    previousExpiryDate: (0, pg_core_1.timestamp)("previous_expiry_date"),
    newExpiryDate: (0, pg_core_1.timestamp)("new_expiry_date"),
    processedAt: (0, pg_core_1.timestamp)("processed_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertLicenseRenewalPaymentSchema = (0, drizzle_zod_1.createInsertSchema)(exports.licenseRenewalPayments).omit({ id: true, createdAt: true });
exports.agencyNotificationPreferences = (0, pg_core_1.pgTable)("agency_notification_preferences", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull().unique(),
    contactEmail: (0, pg_core_1.varchar)("contact_email"),
    contactPhone: (0, pg_core_1.varchar)("contact_phone"),
    contactName: (0, pg_core_1.varchar)("contact_name"),
    enableSms: (0, pg_core_1.boolean)("enable_sms").notNull().default(true),
    enableWhatsapp: (0, pg_core_1.boolean)("enable_whatsapp").notNull().default(false),
    enableEmail: (0, pg_core_1.boolean)("enable_email").notNull().default(true),
    preferredChannel: (0, pg_core_1.varchar)("preferred_channel").notNull().default("sms"),
    remindersEnabled: (0, pg_core_1.boolean)("reminders_enabled").notNull().default(true),
    consentRecordedAt: (0, pg_core_1.timestamp)("consent_recorded_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.licenseReminderLogs = (0, pg_core_1.pgTable)("license_reminder_logs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    agencyName: (0, pg_core_1.varchar)("agency_name").notNull(),
    licenseNumber: (0, pg_core_1.varchar)("license_number").notNull(),
    reminderTier: (0, pg_core_1.varchar)("reminder_tier").notNull(),
    channel: (0, pg_core_1.varchar)("channel").notNull(),
    recipientAddress: (0, pg_core_1.varchar)("recipient_address").notNull(),
    messageContent: (0, pg_core_1.text)("message_content").notNull(),
    status: (0, pg_core_1.varchar)("status").notNull().default("pending"),
    providerSid: (0, pg_core_1.varchar)("provider_sid"),
    errorMessage: (0, pg_core_1.text)("error_message"),
    expiryDate: (0, pg_core_1.timestamp)("expiry_date").notNull(),
    daysRemaining: (0, pg_core_1.integer)("days_remaining").notNull(),
    retryCount: (0, pg_core_1.integer)("retry_count").notNull().default(0),
    lastRetryAt: (0, pg_core_1.timestamp)("last_retry_at"),
    sentAt: (0, pg_core_1.timestamp)("sent_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertAgencyNotificationPreferencesSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyNotificationPreferences).omit({ id: true, createdAt: true, updatedAt: true });
exports.insertLicenseReminderLogSchema = (0, drizzle_zod_1.createInsertSchema)(exports.licenseReminderLogs).omit({ id: true, createdAt: true });
exports.governmentIntegrations = (0, pg_core_1.pgTable)("government_integrations", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    name: (0, pg_core_1.varchar)("name").notNull(),
    code: (0, pg_core_1.varchar)("code").notNull().unique(),
    description: (0, pg_core_1.text)("description"),
    baseUrl: (0, pg_core_1.varchar)("base_url"),
    authType: (0, pg_core_1.varchar)("auth_type").notNull().default("api_key"),
    credentialRef: (0, pg_core_1.varchar)("credential_ref"),
    enabled: (0, pg_core_1.boolean)("enabled").notNull().default(false),
    supportedActions: (0, pg_core_1.text)("supported_actions").notNull().default("verify,status"),
    rateLimit: (0, pg_core_1.integer)("rate_limit").default(100),
    timeoutMs: (0, pg_core_1.integer)("timeout_ms").default(30000),
    retryAttempts: (0, pg_core_1.integer)("retry_attempts").default(3),
    lastHealthCheck: (0, pg_core_1.timestamp)("last_health_check"),
    healthStatus: (0, pg_core_1.varchar)("health_status").default("unknown"),
    fallbackMode: (0, pg_core_1.boolean)("fallback_mode").notNull().default(false),
    fallbackReason: (0, pg_core_1.text)("fallback_reason"),
    fallbackActivatedAt: (0, pg_core_1.timestamp)("fallback_activated_at"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertGovernmentIntegrationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.governmentIntegrations).omit({ id: true, createdAt: true, updatedAt: true });
exports.governmentSyncLogs = (0, pg_core_1.pgTable)("government_sync_logs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    integrationId: (0, pg_core_1.varchar)("integration_id").notNull(),
    integrationCode: (0, pg_core_1.varchar)("integration_code").notNull(),
    action: (0, pg_core_1.varchar)("action").notNull(),
    licenseNumber: (0, pg_core_1.varchar)("license_number"),
    agencyId: (0, pg_core_1.varchar)("agency_id"),
    requestId: (0, pg_core_1.varchar)("request_id").notNull(),
    status: (0, pg_core_1.varchar)("status").notNull().default("pending"),
    normalizedStatus: (0, pg_core_1.varchar)("normalized_status"),
    requestPayload: (0, pg_core_1.jsonb)("request_payload"),
    responsePayload: (0, pg_core_1.jsonb)("response_payload"),
    rawGovernmentResponse: (0, pg_core_1.jsonb)("raw_government_response"),
    errorMessage: (0, pg_core_1.text)("error_message"),
    retryCount: (0, pg_core_1.integer)("retry_count").notNull().default(0),
    durationMs: (0, pg_core_1.integer)("duration_ms"),
    triggeredBy: (0, pg_core_1.varchar)("triggered_by"),
    startedAt: (0, pg_core_1.timestamp)("started_at").defaultNow(),
    completedAt: (0, pg_core_1.timestamp)("completed_at"),
});
exports.insertGovernmentSyncLogSchema = (0, drizzle_zod_1.createInsertSchema)(exports.governmentSyncLogs).omit({ id: true, startedAt: true, completedAt: true });
exports.governmentFeatureFlags = (0, pg_core_1.pgTable)("government_feature_flags", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    key: (0, pg_core_1.varchar)("key").notNull().unique(),
    enabled: (0, pg_core_1.boolean)("enabled").notNull().default(false),
    description: (0, pg_core_1.text)("description"),
    integrationCode: (0, pg_core_1.varchar)("integration_code"),
    rolloutPercentage: (0, pg_core_1.integer)("rollout_percentage").default(100),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertGovernmentFeatureFlagSchema = (0, drizzle_zod_1.createInsertSchema)(exports.governmentFeatureFlags).omit({ id: true, createdAt: true, updatedAt: true });
exports.manualOverrides = (0, pg_core_1.pgTable)("manual_overrides", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    integrationCode: (0, pg_core_1.varchar)("integration_code").notNull(),
    licenseNumber: (0, pg_core_1.varchar)("license_number").notNull(),
    agencyId: (0, pg_core_1.varchar)("agency_id"),
    agencyName: (0, pg_core_1.varchar)("agency_name"),
    overrideStatus: (0, pg_core_1.varchar)("override_status").notNull().default("submitted"),
    manualLicenseStatus: (0, pg_core_1.varchar)("manual_license_status").notNull().default("VALID"),
    reason: (0, pg_core_1.text)("reason").notNull(),
    evidence: (0, pg_core_1.jsonb)("evidence").default([]),
    submittedBy: (0, pg_core_1.varchar)("submitted_by").notNull(),
    reviewedBy: (0, pg_core_1.varchar)("reviewed_by"),
    reviewNotes: (0, pg_core_1.text)("review_notes"),
    reviewedAt: (0, pg_core_1.timestamp)("reviewed_at"),
    approvedAt: (0, pg_core_1.timestamp)("approved_at"),
    syncRequired: (0, pg_core_1.boolean)("sync_required").notNull().default(true),
    syncStatus: (0, pg_core_1.varchar)("sync_status").notNull().default("pending"),
    syncRequestId: (0, pg_core_1.varchar)("sync_request_id"),
    syncResult: (0, pg_core_1.jsonb)("sync_result"),
    mismatchNotes: (0, pg_core_1.text)("mismatch_notes"),
    expiryDateOverride: (0, pg_core_1.timestamp)("expiry_date_override"),
    manualVerificationExpiry: (0, pg_core_1.timestamp)("manual_verification_expiry"),
    approvedBy: (0, pg_core_1.varchar)("approved_by"),
    expiryNotified: (0, pg_core_1.boolean)("expiry_notified").notNull().default(false),
    disclaimerViewedBy: (0, pg_core_1.jsonb)("disclaimer_viewed_by").default([]),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertManualOverrideSchema = (0, drizzle_zod_1.createInsertSchema)(exports.manualOverrides).omit({ id: true, createdAt: true, updatedAt: true, reviewedAt: true, approvedAt: true });
exports.complianceAuditLogs = (0, pg_core_1.pgTable)("compliance_audit_logs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    userRole: (0, pg_core_1.varchar)("user_role").notNull().default("admin"),
    action: (0, pg_core_1.varchar)("action").notNull(),
    recordType: (0, pg_core_1.varchar)("record_type").notNull(),
    recordId: (0, pg_core_1.varchar)("record_id"),
    details: (0, pg_core_1.jsonb)("details"),
    ipAddress: (0, pg_core_1.varchar)("ip_address"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertComplianceAuditLogSchema = (0, drizzle_zod_1.createInsertSchema)(exports.complianceAuditLogs).omit({ id: true, createdAt: true });
exports.governmentDowntimeEvents = (0, pg_core_1.pgTable)("government_downtime_events", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    integrationCode: (0, pg_core_1.varchar)("integration_code").notNull(),
    eventType: (0, pg_core_1.varchar)("event_type").notNull(),
    reason: (0, pg_core_1.text)("reason"),
    triggeredBy: (0, pg_core_1.varchar)("triggered_by"),
    durationMs: (0, pg_core_1.integer)("duration_ms"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertGovernmentDowntimeEventSchema = (0, drizzle_zod_1.createInsertSchema)(exports.governmentDowntimeEvents).omit({ id: true, createdAt: true });
exports.auditExports = (0, pg_core_1.pgTable)("audit_exports", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    exportedBy: (0, pg_core_1.varchar)("exported_by").notNull(),
    exportType: (0, pg_core_1.varchar)("export_type").notNull().default("csv"),
    filters: (0, pg_core_1.jsonb)("filters"),
    recordCount: (0, pg_core_1.integer)("record_count").notNull().default(0),
    hashSignature: (0, pg_core_1.varchar)("hash_signature"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertAuditExportSchema = (0, drizzle_zod_1.createInsertSchema)(exports.auditExports).omit({ id: true, createdAt: true });
exports.agencyLegitimacyScores = (0, pg_core_1.pgTable)("agency_legitimacy_scores", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    overallScore: (0, pg_core_1.integer)("overall_score").notNull().default(50),
    licenseStatusScore: (0, pg_core_1.integer)("license_status_score").notNull().default(0),
    complianceHistoryScore: (0, pg_core_1.integer)("compliance_history_score").notNull().default(0),
    paymentTransparencyScore: (0, pg_core_1.integer)("payment_transparency_score").notNull().default(0),
    governmentVerificationScore: (0, pg_core_1.integer)("government_verification_score").notNull().default(0),
    userFeedbackScore: (0, pg_core_1.integer)("user_feedback_score").notNull().default(0),
    longevityScore: (0, pg_core_1.integer)("longevity_score").notNull().default(0),
    tier: (0, pg_core_1.varchar)("tier").notNull().default("silver"),
    isFrozen: (0, pg_core_1.boolean)("is_frozen").notNull().default(false),
    frozenBy: (0, pg_core_1.varchar)("frozen_by"),
    frozenReason: (0, pg_core_1.text)("frozen_reason"),
    frozenAt: (0, pg_core_1.timestamp)("frozen_at"),
    lastCalculatedAt: (0, pg_core_1.timestamp)("last_calculated_at").defaultNow(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertAgencyLegitimacyScoreSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyLegitimacyScores).omit({ id: true, createdAt: true, updatedAt: true });
exports.agencyScoreHistory = (0, pg_core_1.pgTable)("agency_score_history", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    previousScore: (0, pg_core_1.integer)("previous_score").notNull(),
    newScore: (0, pg_core_1.integer)("new_score").notNull(),
    previousTier: (0, pg_core_1.varchar)("previous_tier").notNull(),
    newTier: (0, pg_core_1.varchar)("new_tier").notNull(),
    changeReason: (0, pg_core_1.varchar)("change_reason").notNull(),
    triggeredBy: (0, pg_core_1.varchar)("triggered_by").notNull().default("system"),
    details: (0, pg_core_1.jsonb)("details"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertAgencyScoreHistorySchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyScoreHistory).omit({ id: true, createdAt: true });
exports.agencyComplianceEvents = (0, pg_core_1.pgTable)("agency_compliance_events", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    eventType: (0, pg_core_1.varchar)("event_type").notNull(),
    severity: (0, pg_core_1.varchar)("severity").notNull().default("info"),
    description: (0, pg_core_1.text)("description"),
    reportedBy: (0, pg_core_1.varchar)("reported_by"),
    resolvedAt: (0, pg_core_1.timestamp)("resolved_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertAgencyComplianceEventSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyComplianceEvents).omit({ id: true, createdAt: true });
exports.agencyScoreWeights = (0, pg_core_1.pgTable)("agency_score_weights", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    factorName: (0, pg_core_1.varchar)("factor_name").notNull().unique(),
    weight: (0, pg_core_1.integer)("weight").notNull(),
    description: (0, pg_core_1.text)("description"),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    updatedBy: (0, pg_core_1.varchar)("updated_by"),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertAgencyScoreWeightSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyScoreWeights).omit({ id: true, updatedAt: true });
exports.blacklistedEntities = (0, pg_core_1.pgTable)("blacklisted_entities", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    entityId: (0, pg_core_1.varchar)("entity_id").notNull(),
    entityType: (0, pg_core_1.varchar)("entity_type").notNull(),
    reason: (0, pg_core_1.text)("reason").notNull(),
    reportedBy: (0, pg_core_1.varchar)("reported_by").notNull(),
    status: (0, pg_core_1.varchar)("status").notNull().default("active"),
    evidence: (0, pg_core_1.jsonb)("evidence").default([]),
    dateAdded: (0, pg_core_1.timestamp)("date_added").defaultNow(),
    clearedAt: (0, pg_core_1.timestamp)("cleared_at"),
    clearedBy: (0, pg_core_1.varchar)("cleared_by"),
    clearedReason: (0, pg_core_1.text)("cleared_reason"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertBlacklistedEntitySchema = (0, drizzle_zod_1.createInsertSchema)(exports.blacklistedEntities).omit({ id: true, createdAt: true, updatedAt: true, dateAdded: true });
exports.fraudFlags = (0, pg_core_1.pgTable)("fraud_flags", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    entityId: (0, pg_core_1.varchar)("entity_id").notNull(),
    entityType: (0, pg_core_1.varchar)("entity_type").notNull(),
    ruleTriggered: (0, pg_core_1.varchar)("rule_triggered").notNull(),
    severity: (0, pg_core_1.varchar)("severity").notNull().default("medium"),
    details: (0, pg_core_1.jsonb)("details").default({}),
    autoActions: (0, pg_core_1.jsonb)("auto_actions").default([]),
    status: (0, pg_core_1.varchar)("status").notNull().default("open"),
    resolvedBy: (0, pg_core_1.varchar)("resolved_by"),
    resolvedAt: (0, pg_core_1.timestamp)("resolved_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertFraudFlagSchema = (0, drizzle_zod_1.createInsertSchema)(exports.fraudFlags).omit({ id: true, createdAt: true });
exports.fraudInvestigationNotes = (0, pg_core_1.pgTable)("fraud_investigation_notes", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    fraudFlagId: (0, pg_core_1.varchar)("fraud_flag_id"),
    blacklistEntryId: (0, pg_core_1.varchar)("blacklist_entry_id"),
    note: (0, pg_core_1.text)("note").notNull(),
    attachedBy: (0, pg_core_1.varchar)("attached_by").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertFraudInvestigationNoteSchema = (0, drizzle_zod_1.createInsertSchema)(exports.fraudInvestigationNotes).omit({ id: true, createdAt: true });
exports.fraudDetectionRules = (0, pg_core_1.pgTable)("fraud_detection_rules", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    ruleName: (0, pg_core_1.varchar)("rule_name").notNull().unique(),
    description: (0, pg_core_1.text)("description"),
    ruleType: (0, pg_core_1.varchar)("rule_type").notNull(),
    threshold: (0, pg_core_1.integer)("threshold").notNull(),
    timeWindowDays: (0, pg_core_1.integer)("time_window_days").notNull().default(30),
    severity: (0, pg_core_1.varchar)("severity").notNull().default("medium"),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    autoBlacklist: (0, pg_core_1.boolean)("auto_blacklist").notNull().default(false),
    autoReduceScore: (0, pg_core_1.boolean)("auto_reduce_score").notNull().default(true),
    scoreReduction: (0, pg_core_1.integer)("score_reduction").notNull().default(10),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertFraudDetectionRuleSchema = (0, drizzle_zod_1.createInsertSchema)(exports.fraudDetectionRules).omit({ id: true, createdAt: true, updatedAt: true });
exports.complianceRiskScores = (0, pg_core_1.pgTable)("compliance_risk_scores", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    agencyName: (0, pg_core_1.varchar)("agency_name"),
    riskScore: (0, pg_core_1.integer)("risk_score").notNull().default(0),
    previousScore: (0, pg_core_1.integer)("previous_score"),
    scoreDelta: (0, pg_core_1.integer)("score_delta"),
    trend: (0, pg_core_1.varchar)("trend").notNull().default("stable"),
    factors: (0, pg_core_1.jsonb)("factors").default([]),
    explanation: (0, pg_core_1.text)("explanation"),
    calculatedAt: (0, pg_core_1.timestamp)("calculated_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertComplianceRiskScoreSchema = (0, drizzle_zod_1.createInsertSchema)(exports.complianceRiskScores).omit({ id: true, calculatedAt: true, updatedAt: true });
exports.complianceRiskHistory = (0, pg_core_1.pgTable)("compliance_risk_history", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    riskScore: (0, pg_core_1.integer)("risk_score").notNull(),
    factors: (0, pg_core_1.jsonb)("factors").default([]),
    calculatedAt: (0, pg_core_1.timestamp)("calculated_at").defaultNow(),
});
exports.insertComplianceRiskHistorySchema = (0, drizzle_zod_1.createInsertSchema)(exports.complianceRiskHistory).omit({ id: true, calculatedAt: true });
exports.complianceAnomalies = (0, pg_core_1.pgTable)("compliance_anomalies", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    agencyName: (0, pg_core_1.varchar)("agency_name"),
    anomalyType: (0, pg_core_1.varchar)("anomaly_type").notNull(),
    severity: (0, pg_core_1.varchar)("severity").notNull().default("medium"),
    details: (0, pg_core_1.jsonb)("details").default({}),
    detectedAt: (0, pg_core_1.timestamp)("detected_at").defaultNow(),
    status: (0, pg_core_1.varchar)("status").notNull().default("open"),
    reviewedBy: (0, pg_core_1.varchar)("reviewed_by"),
    reviewNotes: (0, pg_core_1.text)("review_notes"),
    reviewedAt: (0, pg_core_1.timestamp)("reviewed_at"),
});
exports.insertComplianceAnomalySchema = (0, drizzle_zod_1.createInsertSchema)(exports.complianceAnomalies).omit({ id: true, detectedAt: true, reviewedAt: true });
exports.complianceAlerts = (0, pg_core_1.pgTable)("compliance_alerts", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    agencyName: (0, pg_core_1.varchar)("agency_name"),
    alertType: (0, pg_core_1.varchar)("alert_type").notNull(),
    severity: (0, pg_core_1.varchar)("severity").notNull().default("medium"),
    title: (0, pg_core_1.varchar)("title").notNull(),
    message: (0, pg_core_1.text)("message"),
    explanation: (0, pg_core_1.text)("explanation"),
    status: (0, pg_core_1.varchar)("status").notNull().default("pending"),
    triggeredAt: (0, pg_core_1.timestamp)("triggered_at").defaultNow(),
    acknowledgedBy: (0, pg_core_1.varchar)("acknowledged_by"),
    acknowledgedAt: (0, pg_core_1.timestamp)("acknowledged_at"),
    resolvedBy: (0, pg_core_1.varchar)("resolved_by"),
    resolvedAt: (0, pg_core_1.timestamp)("resolved_at"),
});
exports.insertComplianceAlertSchema = (0, drizzle_zod_1.createInsertSchema)(exports.complianceAlerts).omit({ id: true, triggeredAt: true, acknowledgedAt: true, resolvedAt: true });
exports.complianceRiskConfig = (0, pg_core_1.pgTable)("compliance_risk_config", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    configKey: (0, pg_core_1.varchar)("config_key").notNull().unique(),
    configValue: (0, pg_core_1.jsonb)("config_value").notNull(),
    description: (0, pg_core_1.text)("description"),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertComplianceRiskConfigSchema = (0, drizzle_zod_1.createInsertSchema)(exports.complianceRiskConfig).omit({ id: true, updatedAt: true });
exports.complianceIndexScores = (0, pg_core_1.pgTable)("compliance_index_scores", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    agencyName: (0, pg_core_1.varchar)("agency_name"),
    compositeScore: (0, pg_core_1.integer)("composite_score").notNull().default(0),
    licenseValidityScore: (0, pg_core_1.integer)("license_validity_score").default(0),
    govVerificationScore: (0, pg_core_1.integer)("gov_verification_score").default(0),
    legitimacyScore: (0, pg_core_1.integer)("legitimacy_score").default(0),
    complianceHistoryScore: (0, pg_core_1.integer)("compliance_history_score").default(0),
    fraudDetectionScore: (0, pg_core_1.integer)("fraud_detection_score").default(0),
    userFeedbackScore: (0, pg_core_1.integer)("user_feedback_score").default(0),
    globalRank: (0, pg_core_1.integer)("global_rank"),
    countryRank: (0, pg_core_1.integer)("country_rank"),
    industryRank: (0, pg_core_1.integer)("industry_rank"),
    cityRank: (0, pg_core_1.integer)("city_rank"),
    badge: (0, pg_core_1.varchar)("badge").default("none"),
    country: (0, pg_core_1.varchar)("country"),
    city: (0, pg_core_1.varchar)("city"),
    industry: (0, pg_core_1.varchar)("industry"),
    isExcluded: (0, pg_core_1.boolean)("is_excluded").default(false),
    excludedBy: (0, pg_core_1.varchar)("excluded_by"),
    excludedReason: (0, pg_core_1.text)("excluded_reason"),
    calculatedAt: (0, pg_core_1.timestamp)("calculated_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertComplianceIndexScoreSchema = (0, drizzle_zod_1.createInsertSchema)(exports.complianceIndexScores).omit({ id: true, calculatedAt: true, updatedAt: true });
exports.complianceIndexHistory = (0, pg_core_1.pgTable)("compliance_index_history", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    compositeScore: (0, pg_core_1.integer)("composite_score").notNull(),
    globalRank: (0, pg_core_1.integer)("global_rank"),
    badge: (0, pg_core_1.varchar)("badge"),
    calculatedAt: (0, pg_core_1.timestamp)("calculated_at").defaultNow(),
});
exports.insertComplianceIndexHistorySchema = (0, drizzle_zod_1.createInsertSchema)(exports.complianceIndexHistory).omit({ id: true, calculatedAt: true });
exports.complianceIndexConfig = (0, pg_core_1.pgTable)("compliance_index_config", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    configKey: (0, pg_core_1.varchar)("config_key").notNull().unique(),
    configValue: (0, pg_core_1.jsonb)("config_value").notNull(),
    description: (0, pg_core_1.text)("description"),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertComplianceIndexConfigSchema = (0, drizzle_zod_1.createInsertSchema)(exports.complianceIndexConfig).omit({ id: true, updatedAt: true });
exports.agencyCertificates = (0, pg_core_1.pgTable)("agency_certificates", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    certificateId: (0, pg_core_1.varchar)("certificate_id").notNull().unique(),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(),
    agencyName: (0, pg_core_1.varchar)("agency_name"),
    licenseNumber: (0, pg_core_1.varchar)("license_number"),
    complianceScore: (0, pg_core_1.integer)("compliance_score").default(0),
    verificationStatus: (0, pg_core_1.varchar)("verification_status").default("verified"),
    issuedAt: (0, pg_core_1.timestamp)("issued_at").defaultNow(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at").notNull(),
    verificationHash: (0, pg_core_1.varchar)("verification_hash").notNull(),
    status: (0, pg_core_1.varchar)("status").default("active"),
    revokedAt: (0, pg_core_1.timestamp)("revoked_at"),
    revokedBy: (0, pg_core_1.varchar)("revoked_by"),
    revokedReason: (0, pg_core_1.text)("revoked_reason"),
    regeneratedFrom: (0, pg_core_1.varchar)("regenerated_from"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertAgencyCertificateSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyCertificates).omit({ id: true, createdAt: true, updatedAt: true });
exports.fraudReports = (0, pg_core_1.pgTable)("fraud_reports", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    reporterId: (0, pg_core_1.varchar)("reporter_id"),
    suspectedEntity: (0, pg_core_1.varchar)("suspected_entity").notNull(),
    suspectedAgencyId: (0, pg_core_1.varchar)("suspected_agency_id"),
    incidentType: (0, pg_core_1.varchar)("incident_type").notNull(),
    description: (0, pg_core_1.text)("description").notNull(),
    phoneNumber: (0, pg_core_1.varchar)("phone_number"),
    paymentReference: (0, pg_core_1.varchar)("payment_reference"),
    licenseNumber: (0, pg_core_1.varchar)("license_number"),
    evidenceFiles: (0, pg_core_1.jsonb)("evidence_files").default([]),
    status: (0, pg_core_1.varchar)("status").default("pending"),
    assignedTo: (0, pg_core_1.varchar)("assigned_to"),
    resolvedAt: (0, pg_core_1.timestamp)("resolved_at"),
    resolvedBy: (0, pg_core_1.varchar)("resolved_by"),
    resolution: (0, pg_core_1.text)("resolution"),
    analysisResult: (0, pg_core_1.jsonb)("analysis_result"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertFraudReportSchema = (0, drizzle_zod_1.createInsertSchema)(exports.fraudReports).omit({ id: true, createdAt: true, updatedAt: true, resolvedAt: true, resolvedBy: true, resolution: true, analysisResult: true });
exports.fraudIndicators = (0, pg_core_1.pgTable)("fraud_indicators", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    indicatorType: (0, pg_core_1.varchar)("indicator_type").notNull(),
    value: (0, pg_core_1.varchar)("value").notNull(),
    normalizedValue: (0, pg_core_1.varchar)("normalized_value").notNull(),
    riskLevel: (0, pg_core_1.varchar)("risk_level").default("low"),
    source: (0, pg_core_1.varchar)("source").default("user_report"),
    linkedReports: (0, pg_core_1.jsonb)("linked_reports").default([]),
    reportCount: (0, pg_core_1.integer)("report_count").default(1),
    firstReportedAt: (0, pg_core_1.timestamp)("first_reported_at").defaultNow(),
    lastReportedAt: (0, pg_core_1.timestamp)("last_reported_at").defaultNow(),
    addedBy: (0, pg_core_1.varchar)("added_by"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    status: (0, pg_core_1.varchar)("status").default("active"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertFraudIndicatorSchema = (0, drizzle_zod_1.createInsertSchema)(exports.fraudIndicators).omit({ id: true, createdAt: true, firstReportedAt: true, lastReportedAt: true });
// Security monitoring — alerts raised by the automated scanner or by real-time hooks
exports.securityAlerts = (0, pg_core_1.pgTable)("security_alerts", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    alertType: (0, pg_core_1.varchar)("alert_type").notNull(), // 'suspicious_login' | 'payment_fraud' | 'api_abuse' | 'admin_abuse' | 'system_vulnerability' | 'file_upload'
    severity: (0, pg_core_1.varchar)("severity").notNull().default("medium"), // 'low' | 'medium' | 'high' | 'critical'
    title: (0, pg_core_1.varchar)("title").notNull(),
    description: (0, pg_core_1.text)("description").notNull(),
    ipAddress: (0, pg_core_1.varchar)("ip_address"),
    userId: (0, pg_core_1.varchar)("user_id"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    isResolved: (0, pg_core_1.boolean)("is_resolved").notNull().default(false),
    resolvedAt: (0, pg_core_1.timestamp)("resolved_at"),
    resolvedBy: (0, pg_core_1.varchar)("resolved_by"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertSecurityAlertSchema = (0, drizzle_zod_1.createInsertSchema)(exports.securityAlerts).omit({ id: true, createdAt: true, resolvedAt: true, resolvedBy: true });
// security_events — lightweight per-event behavior log fed by rate limiter hooks,
// login failure handlers, and admin access tracking. Used for IP spike detection,
// per-user risk scoring, and the security-ai dashboard summary.
exports.securityEvents = (0, pg_core_1.pgTable)("security_events", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    // Type of event captured
    eventType: (0, pg_core_1.varchar)("event_type").notNull(), // 'rate_limit_hit' | 'auth_failure' | 'payment_attempt' | 'file_upload_rejected' | 'restricted_route_access' | 'xss_attempt' | 'admin_access'
    // Risk points added to this IP/user's running score by this event
    riskPoints: (0, pg_core_1.integer)("risk_points").notNull().default(0),
    ipAddress: (0, pg_core_1.varchar)("ip_address"),
    userId: (0, pg_core_1.varchar)("user_id"),
    endpoint: (0, pg_core_1.varchar)("endpoint"),
    userAgent: (0, pg_core_1.varchar)("user_agent"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertSecurityEventSchema = (0, drizzle_zod_1.createInsertSchema)(exports.securityEvents).omit({ id: true, createdAt: true });
// =============================================================================
// GROWTH TOOLS SUITE
// =============================================================================
// Visa Sponsorship Job Feed
exports.jobs = (0, pg_core_1.pgTable)("jobs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    title: (0, pg_core_1.varchar)("title", { length: 200 }).notNull(),
    company: (0, pg_core_1.varchar)("company", { length: 200 }).notNull(),
    country: (0, pg_core_1.varchar)("country", { length: 100 }).notNull(),
    salary: (0, pg_core_1.varchar)("salary", { length: 100 }),
    jobCategory: (0, pg_core_1.varchar)("job_category", { length: 100 }),
    visaSponsorship: (0, pg_core_1.boolean)("visa_sponsorship").notNull().default(true),
    applyLink: (0, pg_core_1.text)("apply_link"),
    email: (0, pg_core_1.varchar)("email", { length: 200 }),
    description: (0, pg_core_1.text)("description"),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertJobSchema = (0, drizzle_zod_1.createInsertSchema)(exports.jobs).omit({ id: true, createdAt: true });
// Agency Jobs — job listings posted by claimed NEA agencies
exports.agencyJobs = (0, pg_core_1.pgTable)("agency_jobs", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyId: (0, pg_core_1.varchar)("agency_id").notNull(), // FK → nea_agencies.id
    title: (0, pg_core_1.varchar)("title", { length: 200 }).notNull(),
    country: (0, pg_core_1.varchar)("country", { length: 100 }).notNull(),
    salary: (0, pg_core_1.varchar)("salary", { length: 100 }),
    jobCategory: (0, pg_core_1.varchar)("job_category", { length: 100 }),
    description: (0, pg_core_1.text)("description"),
    requirements: (0, pg_core_1.text)("requirements"),
    visaSponsorship: (0, pg_core_1.boolean)("visa_sponsorship").notNull().default(false),
    applicationDeadline: (0, pg_core_1.timestamp)("application_deadline"),
    applyLink: (0, pg_core_1.text)("apply_link"),
    applyEmail: (0, pg_core_1.varchar)("apply_email", { length: 200 }),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    isFeatured: (0, pg_core_1.boolean)("is_featured").notNull().default(false),
    viewCount: (0, pg_core_1.integer)("view_count").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertAgencyJobSchema = (0, drizzle_zod_1.createInsertSchema)(exports.agencyJobs).omit({
    id: true, createdAt: true, updatedAt: true, viewCount: true,
});
// Job Click Access Log — records every time a PRO user accesses a job redirect URL
exports.jobClickLog = (0, pg_core_1.pgTable)("job_click_log", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    jobId: (0, pg_core_1.varchar)("job_id").notNull(),
    jobType: (0, pg_core_1.varchar)("job_type", { length: 20 }).notNull(), // 'visa', 'agency', 'portal'
    ipAddress: (0, pg_core_1.varchar)("ip_address", { length: 64 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Tool Usage Tracking
exports.toolUsage = (0, pg_core_1.pgTable)("tool_usage", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id"),
    toolName: (0, pg_core_1.varchar)("tool_name", { length: 100 }).notNull(),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertToolUsageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.toolUsage).omit({ id: true, createdAt: true });
// CV Template Downloads
exports.cvTemplateDownloads = (0, pg_core_1.pgTable)("cv_template_downloads", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    templateId: (0, pg_core_1.varchar)("template_id", { length: 100 }).notNull(),
    userId: (0, pg_core_1.varchar)("user_id"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertCvTemplateDownloadSchema = (0, drizzle_zod_1.createInsertSchema)(exports.cvTemplateDownloads).omit({ id: true, createdAt: true });
// Viral Tool Reports — shareable public result pages
exports.toolReports = (0, pg_core_1.pgTable)("tool_reports", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    toolName: (0, pg_core_1.varchar)("tool_name", { length: 50 }).notNull(), // "ats" | "scam"
    userId: (0, pg_core_1.varchar)("user_id"),
    reportData: (0, pg_core_1.jsonb)("report_data").notNull(),
    views: (0, pg_core_1.integer)("views").notNull().default(0),
    shares: (0, pg_core_1.integer)("shares").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertToolReportSchema = (0, drizzle_zod_1.createInsertSchema)(exports.toolReports).omit({ id: true, createdAt: true, views: true, shares: true });
// AI Usage Tracking — per-user daily usage for Visa Assistant and other AI tools
exports.aiUsage = (0, pg_core_1.pgTable)("ai_usage", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    toolName: (0, pg_core_1.varchar)("tool_name", { length: 50 }).notNull().default("visa_assistant"),
    date: (0, pg_core_1.varchar)("date", { length: 10 }).notNull(), // YYYY-MM-DD
    questionsUsed: (0, pg_core_1.integer)("questions_used").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertAiUsageSchema = (0, drizzle_zod_1.createInsertSchema)(exports.aiUsage).omit({ id: true, createdAt: true, updatedAt: true });
// Scam Reporting & Agency Blacklist — user-submitted agency scam reports with evidence
exports.scamReports = (0, pg_core_1.pgTable)("scam_reports", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    agencyName: (0, pg_core_1.varchar)("agency_name", { length: 255 }).notNull(),
    country: (0, pg_core_1.varchar)("country", { length: 100 }),
    description: (0, pg_core_1.text)("description").notNull(),
    amountLost: (0, pg_core_1.integer)("amount_lost"), // in KES
    contactInfo: (0, pg_core_1.varchar)("contact_info", { length: 500 }),
    evidenceImages: (0, pg_core_1.text)("evidence_images").array().default([]),
    reportedBy: (0, pg_core_1.varchar)("reported_by", { length: 100 }), // user id (nullable for anonymous)
    reporterEmail: (0, pg_core_1.varchar)("reporter_email", { length: 255 }),
    status: (0, pg_core_1.varchar)("status", { length: 20 }).notNull().default("pending"), // pending | approved | rejected
    adminNote: (0, pg_core_1.text)("admin_note"),
    likesCount: (0, pg_core_1.integer)("likes_count").default(0),
    viewsCount: (0, pg_core_1.integer)("views_count").default(0),
    isFeatured: (0, pg_core_1.boolean)("is_featured").default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.insertScamReportSchema = (0, drizzle_zod_1.createInsertSchema)(exports.scamReports).omit({
    id: true, createdAt: true, updatedAt: true, status: true, adminNote: true,
    likesCount: true, viewsCount: true, isFeatured: true,
});
exports.scamWallLikes = (0, pg_core_1.pgTable)("scam_wall_likes", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    reportId: (0, pg_core_1.varchar)("report_id", { length: 100 }).notNull(),
    fingerprint: (0, pg_core_1.varchar)("fingerprint", { length: 255 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.scamWallComments = (0, pg_core_1.pgTable)("scam_wall_comments", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    reportId: (0, pg_core_1.varchar)("report_id", { length: 100 }).notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    authorName: (0, pg_core_1.varchar)("author_name", { length: 100 }).default("Anonymous"),
    isApproved: (0, pg_core_1.boolean)("is_approved").default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// ── Real-time activity events — written on signup and upgrade ─────────────────
// No user-identifying data stored (no name, no email, no userId).
// Only type, optional country name, and timestamp.
exports.activityEvents = (0, pg_core_1.pgTable)("activity_events", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    type: (0, pg_core_1.varchar)("type", { length: 20 }).notNull(), // 'signup' | 'upgrade'
    location: (0, pg_core_1.varchar)("location", { length: 100 }), // country name e.g. "Kenya" or null
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// ── M-Pesa pull payment configuration (singleton per short-code) ──────────────
exports.mpesaPullConfig = (0, pg_core_1.pgTable)("mpesa_pull_config", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    shortCode: (0, pg_core_1.varchar)("short_code").notNull().unique(),
    registeredAt: (0, pg_core_1.timestamp)("registered_at").default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`),
    lastPullAt: (0, pg_core_1.timestamp)("last_pull_at"),
    lastOffset: (0, pg_core_1.integer)("last_offset").default(0),
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
});
// ── Platform-wide statistics snapshot (singleton row, id=1) ──────────────────
exports.platformStats = (0, pg_core_1.pgTable)("platform_stats", {
    id: (0, pg_core_1.integer)("id").primaryKey().default(1),
    totalUsers: (0, pg_core_1.integer)("total_users").notNull().default(0),
    paidUsers: (0, pg_core_1.integer)("paid_users").notNull().default(0),
    totalRevenue: (0, pg_core_1.numeric)("total_revenue").notNull().default("0"),
    revenueToday: (0, pg_core_1.numeric)("revenue_today").notNull().default("0"),
    activeNow: (0, pg_core_1.integer)("active_now").notNull().default(0),
    signupsToday: (0, pg_core_1.integer)("signups_today").notNull().default(0),
    signupsWeek: (0, pg_core_1.integer)("signups_week").notNull().default(0),
    signupsMonth: (0, pg_core_1.integer)("signups_month").notNull().default(0),
    lastUpdated: (0, pg_core_1.timestamp)("last_updated").notNull().default((0, drizzle_orm_1.sql) `now()`),
});
// ── M-Pesa Pull API transaction log (raw pulled transactions before reconciliation) ──
exports.mpesaPullTransactions = (0, pg_core_1.pgTable)("mpesa_pull_transactions", {
    transactionId: (0, pg_core_1.varchar)("transaction_id").primaryKey(),
    billRefNumber: (0, pg_core_1.varchar)("bill_ref_number"),
    transactionType: (0, pg_core_1.varchar)("transaction_type"),
    transAmount: (0, pg_core_1.integer)("trans_amount").notNull().default(0),
    businessShortCode: (0, pg_core_1.varchar)("business_short_code"),
    msisdn: (0, pg_core_1.varchar)("msisdn"),
    firstName: (0, pg_core_1.varchar)("first_name"),
    middleName: (0, pg_core_1.varchar)("middle_name"),
    lastName: (0, pg_core_1.varchar)("last_name"),
    transTime: (0, pg_core_1.timestamp)("trans_time"),
    invoiceNumber: (0, pg_core_1.varchar)("invoice_number"),
    orgAccountBalance: (0, pg_core_1.integer)("org_account_balance").default(0),
    thirdPartyTransId: (0, pg_core_1.varchar)("third_party_trans_id"),
    reconciled: (0, pg_core_1.boolean)("reconciled").notNull().default(false),
    reconciledAt: (0, pg_core_1.timestamp)("reconciled_at"),
    pulledAt: (0, pg_core_1.timestamp)("pulled_at").defaultNow(),
});
// ── Abuse / scam reports submitted by users (lightweight, no auth required) ──
exports.abuseReports = (0, pg_core_1.pgTable)("abuse_reports", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    type: (0, pg_core_1.varchar)("type", { length: 50 }).notNull(),
    description: (0, pg_core_1.text)("description").notNull(),
    contactEmail: (0, pg_core_1.varchar)("contact_email", { length: 255 }),
    ipAddress: (0, pg_core_1.varchar)("ip_address", { length: 50 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// ── Verified Job/Visa/Gov Portals with automated health monitoring ────────────
exports.verifiedPortals = (0, pg_core_1.pgTable)("verified_portals", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    name: (0, pg_core_1.varchar)("name", { length: 200 }).notNull(),
    url: (0, pg_core_1.varchar)("url", { length: 500 }).notNull(),
    category: (0, pg_core_1.varchar)("category", { length: 100 }).default("general"),
    country: (0, pg_core_1.varchar)("country", { length: 100 }).default("Global"),
    description: (0, pg_core_1.text)("description"),
    status: (0, pg_core_1.varchar)("status", { length: 20 }).default("unknown"),
    statusCode: (0, pg_core_1.integer)("status_code"),
    responseTimeMs: (0, pg_core_1.integer)("response_time_ms"),
    errorMessage: (0, pg_core_1.text)("error_message"),
    lastChecked: (0, pg_core_1.timestamp)("last_checked"),
    isActive: (0, pg_core_1.boolean)("is_active").default(true),
    sponsorshipAvailable: (0, pg_core_1.boolean)("sponsorship_available").default(false),
    addedAt: (0, pg_core_1.timestamp)("added_at").defaultNow(),
});
exports.insertVerifiedPortalSchema = (0, drizzle_zod_1.createInsertSchema)(exports.verifiedPortals).omit({
    id: true, status: true, statusCode: true, responseTimeMs: true,
    errorMessage: true, lastChecked: true, addedAt: true,
});
// ============================================
// CV EMAIL DRIP SEQUENCE QUEUE
// ============================================
exports.cvEmailQueue = (0, pg_core_1.pgTable)("cv_email_queue", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    email: (0, pg_core_1.varchar)("email", { length: 255 }).notNull(),
    firstName: (0, pg_core_1.varchar)("first_name", { length: 100 }),
    jobCount: (0, pg_core_1.integer)("job_count"), // null = unknown (web upload without matching)
    topCountry: (0, pg_core_1.varchar)("top_country", { length: 100 }),
    profession: (0, pg_core_1.varchar)("profession", { length: 150 }),
    topJobs: (0, pg_core_1.jsonb)("top_jobs"), // [{title, company, country}] — up to 3
    type: (0, pg_core_1.varchar)("type", { length: 20 }).notNull(), // email1 | email2 | email3
    sendAfter: (0, pg_core_1.timestamp)("send_after").notNull(),
    sent: (0, pg_core_1.boolean)("sent").notNull().default(false),
    failed: (0, pg_core_1.boolean)("failed").notNull().default(false),
    errorMsg: (0, pg_core_1.text)("error_msg"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    sentAt: (0, pg_core_1.timestamp)("sent_at"),
});
// ============================================
// WHATSAPP 24-HOUR CV FOLLOW-UP QUEUE
// ============================================
// ── Generic WhatsApp message queue ──────────────────────────────────────────
// Simple fire-and-forget queue. Rows are enqueued with a send_after timestamp
// and processed every 5 minutes by server/whatsapp-queue.ts.
// Deduplication key: (phone, source) — one message per source per 24 h.
exports.whatsappQueue = (0, pg_core_1.pgTable)("whatsapp_queue", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    phone: (0, pg_core_1.varchar)("phone", { length: 30 }).notNull(), // 254XXXXXXXXX
    message: (0, pg_core_1.text)("message").notNull(),
    source: (0, pg_core_1.varchar)("source", { length: 60 }).notNull().default("manual"),
    // status: pending → sent | failed
    status: (0, pg_core_1.varchar)("status", { length: 20 }).notNull().default("pending"),
    sendAfter: (0, pg_core_1.timestamp)("send_after").notNull().defaultNow(),
    sentAt: (0, pg_core_1.timestamp)("sent_at"),
    retryCount: (0, pg_core_1.integer)("retry_count").notNull().default(0),
    // kept for backward-compat queries; derived from status
    sent: (0, pg_core_1.boolean)("sent").notNull().default(false),
    failed: (0, pg_core_1.boolean)("failed").notNull().default(false),
    errorMsg: (0, pg_core_1.text)("error_msg"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertWhatsappQueueSchema = (0, drizzle_zod_1.createInsertSchema)(exports.whatsappQueue).omit({ id: true, createdAt: true });
exports.waFollowups = (0, pg_core_1.pgTable)("wa_followups", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    phone: (0, pg_core_1.varchar)("phone", { length: 30 }).notNull(), // E.164 without whatsapp: prefix
    firstName: (0, pg_core_1.varchar)("first_name", { length: 100 }),
    jobCount: (0, pg_core_1.integer)("job_count").notNull().default(0),
    topCountry: (0, pg_core_1.varchar)("top_country", { length: 100 }),
    type: (0, pg_core_1.varchar)("type", { length: 20 }).notNull().default("day1"), // day1 | day3
    profession: (0, pg_core_1.varchar)("profession", { length: 150 }),
    sendAfter: (0, pg_core_1.timestamp)("send_after").notNull(), // scheduled send time
    sent: (0, pg_core_1.boolean)("sent").notNull().default(false),
    failed: (0, pg_core_1.boolean)("failed").notNull().default(false),
    errorMsg: (0, pg_core_1.text)("error_msg"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    sentAt: (0, pg_core_1.timestamp)("sent_at"),
});
// ============================================
// DELIVERIES — persists AI-generated content
// ============================================
exports.deliveries = (0, pg_core_1.pgTable)("deliveries", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.varchar)("user_id").notNull(),
    jobType: (0, pg_core_1.varchar)("job_type", { length: 20 }).notNull(), // ai_apply | cv_fix | visa
    content: (0, pg_core_1.jsonb)("content").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
exports.insertDeliverySchema = (0, drizzle_zod_1.createInsertSchema)(exports.deliveries).omit({ id: true, createdAt: true });
