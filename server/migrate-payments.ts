/**
 * Startup migration for payment-related columns.
 *
 * Uses `ADD COLUMN IF NOT EXISTS` so it's safe to run on every startup
 * regardless of whether the columns already exist. This ensures the production
 * Neon DB and the dev helium DB stay in sync automatically.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensurePaymentColumns(): Promise<void> {
  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: "payments.callback_received_at",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS callback_received_at TIMESTAMP`,
    },
    {
      name: "payments.status_last_checked",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS status_last_checked TIMESTAMP`,
    },
    {
      name: "payments.query_attempts",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS query_attempts INTEGER NOT NULL DEFAULT 0`,
    },
    {
      name: "payments.mpesa_receipt_number",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS mpesa_receipt_number TEXT`,
    },
    {
      name: "payments.auto_upgraded",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS auto_upgraded BOOLEAN NOT NULL DEFAULT FALSE`,
    },
    {
      name: "payments.retry_count",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0`,
    },
    {
      name: "payments.needs_review",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE`,
    },
    {
      name: "payments.refund_requested",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_requested BOOLEAN NOT NULL DEFAULT FALSE`,
    },
    {
      name: "payments.payment_source",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_source VARCHAR`,
      // "web" — origin platform; null means web-initiated (M-Pesa or PayPal).
    },
    {
      name: "payments.base_amount",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS base_amount INTEGER`,
      // Pre-discount plan price from the DB (NULL for non-plan or non-discounted payments).
      // Mirrors resolvedXxx.basePrice from resolveCanonicalPlanPrice().
    },
    {
      name: "payments.discount_type",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_type VARCHAR`,
      // "referral_20" when a 20 % referral discount was applied; NULL otherwise.
      // Mirrors resolvedXxx.discountType from resolveCanonicalPlanPrice().
    },
    {
      name: "payments.processed",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed BOOLEAN NOT NULL DEFAULT FALSE`,
      // Atomic idempotency flag — set via UPDATE WHERE processed = false RETURNING id.
      // Prevents duplicate plan activations on Safaricom retries or parallel webhooks.
    },
    {
      name: "payments.processed_at",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP`,
      // Timestamp of when markPaymentProcessed() claimed ownership of this payment.
    },
    {
      name: "payments.promo_code",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS promo_code VARCHAR`,
      // Promo code submitted by the user at checkout — null when none applied.
      // Populated by resolvePrice() at payment creation for the full audit trail.
    },
    {
      name: "payments.country",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS country VARCHAR(5)`,
      // ISO-3166-1 alpha-2 country code passed at payment initiation.
      // Drives the country PPP multiplier inside resolvePrice().
    },
    {
      name: "payments.service_name",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS service_name VARCHAR`,
      // Human-readable label written at STK push time — e.g. "ATS CV Optimization",
      // "WorkAbroad Pro (360 days)". Avoids JOIN to services table in callbacks,
      // admin views, WhatsApp receipts, and Firebase events.
    },
    {
      name: "payments.phone",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS phone VARCHAR`,
      // Payer phone in E.164 format (e.g. 254712345678) — stored at STK push
      // initiation and confirmed from Safaricom's CallbackMetadata.PhoneNumber.
      // NULL for PayPal payments. Replaces parsing phone out of metadata JSON.
    },
    {
      name: "payments.checkout_request_id",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_request_id VARCHAR`,
      // Safaricom's STK push CheckoutRequestID — stored at push initiation,
      // used to match the Safaricom callback to the correct payment row.
      // Dedicated column; transactionRef kept for backward compat.
    },
    {
      name: "payments.mpesa_code",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS mpesa_code VARCHAR`,
      // Confirmed M-Pesa receipt/transaction code (e.g. "RBN123ABC456") —
      // written by the callback handler on ResultCode=0.
      // Dedicated column; mpesa_receipt_number kept for backward compat.
    },
    {
      name: "promo_codes_table",
      sql: `CREATE TABLE IF NOT EXISTS promo_codes (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) NOT NULL UNIQUE,
        discount_type VARCHAR(20) NOT NULL,
        discount_value INTEGER NOT NULL,
        applies_to_plan VARCHAR(100),
        max_uses INTEGER,
        used_count INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMP,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by VARCHAR,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      // Promo codes table — created here so it is always in sync on both
      // development (heliumdb) and production (Neon) without a separate db:push.
    },
    {
      name: "payments.delivery_status",
      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS delivery_status VARCHAR`,
      // Tracks whether the service/plan was delivered after a successful payment.
      // Values: null/"pending" | "delivered" | "needs_review"
      // Set independently of status — a payment can be "success" + "needs_review".
    },
  ];

  let applied = 0;
  let skipped = 0;

  for (const m of migrations) {
    try {
      // sql.raw() is safe here: m.sql is a hardcoded DDL string from the
      // migrations array above — never derived from user input.
      await db.execute(sql.raw(m.sql));
      applied++;
    } catch (err: any) {
      if (err.message?.includes("already exists")) {
        skipped++;
      } else {
        console.warn(`[PaymentMigration] Warning for ${m.name}: ${err.message}`);
      }
    }
  }

  console.log(`[PaymentMigration] Payment schema ensured: ${applied} applied, ${skipped} already present`);
}
