/**
 * Startup migration for payment-related columns.
 *
 * Uses `ADD COLUMN IF NOT EXISTS` so it's safe to run on every startup
 * regardless of whether the columns already exist. This ensures the production
 * Neon DB and the dev helium DB stay in sync automatically.
 */

import { pool } from "./db";

export async function ensurePaymentColumns(): Promise<void> {
  const migrations: Array<{ name: string; sql: string }> = [
    { name: "payments.callback_received_at", sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS callback_received_at TIMESTAMP` },
    { name: "payments.status_last_checked",  sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS status_last_checked TIMESTAMP` },
    { name: "payments.query_attempts",       sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS query_attempts INTEGER NOT NULL DEFAULT 0` },
    { name: "payments.mpesa_receipt_number", sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS mpesa_receipt_number TEXT` },
    { name: "payments.auto_upgraded",        sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS auto_upgraded BOOLEAN NOT NULL DEFAULT FALSE` },
    { name: "payments.retry_count",          sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0` },
    { name: "payments.needs_review",         sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE` },
    { name: "payments.refund_requested",     sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_requested BOOLEAN NOT NULL DEFAULT FALSE` },
    { name: "payments.payment_source",       sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_source VARCHAR` },
    { name: "payments.base_amount",          sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS base_amount INTEGER` },
    { name: "payments.discount_type",        sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_type VARCHAR` },
    { name: "payments.processed",            sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed BOOLEAN NOT NULL DEFAULT FALSE` },
    { name: "payments.processed_at",         sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP` },
    { name: "payments.promo_code",           sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS promo_code VARCHAR` },
    { name: "payments.country",              sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS country VARCHAR(5)` },
    { name: "payments.service_name",         sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS service_name VARCHAR` },
    { name: "payments.phone",                sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS phone VARCHAR` },
    { name: "payments.checkout_request_id",  sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_request_id VARCHAR` },
    { name: "payments.mpesa_code",           sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS mpesa_code VARCHAR` },
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
    },
    { name: "payments.delivery_status",      sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS delivery_status VARCHAR` },
  ];

  let applied = 0;
  let skipped = 0;

  for (const m of migrations) {
    try {
      // Use the legacy pg Pool for DDL. Sending these through Drizzle's
      // postgres-js path produced "Failed query: ALTER TABLE ..." warnings
      // because postgres-js prepares every statement; pool.query() runs the
      // DDL as a simple query with no parameter negotiation.
      await pool.query(m.sql);
      applied++;
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes("already exists")) {
        skipped++;
      } else {
        console.warn(`[PaymentMigration] Warning for ${m.name}: ${msg}`);
      }
    }
  }

  console.log(`[PaymentMigration] Payment schema ensured: ${applied} applied, ${skipped} already present`);
}
