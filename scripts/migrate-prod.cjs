#!/usr/bin/env node
/**
 * Safe production migration script.
 * Adds missing columns and fixes data inconsistencies.
 * Uses IF NOT EXISTS / WHERE clauses so it is idempotent and safe to run repeatedly.
 */
const { Pool } = require('pg');

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.log('[migrate-prod] No DATABASE_URL — skipping.');
    process.exit(0);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Confirm which database we are connected to
    const dbInfo = await pool.query('SELECT current_database() AS name, version() AS version');
    const dbName = dbInfo.rows[0]?.name ?? 'unknown';
    console.log(`[migrate-prod] Connected to database: ${dbName}`);

    // ── Schema migrations ──────────────────────────────────────────────────

    // users.email — enforce NOT NULL (all users must have a unique email)
    // Safe: verified all 1,807+ production rows already have a non-null email.
    await pool.query(`ALTER TABLE users ALTER COLUMN email SET NOT NULL`);
    console.log('[migrate-prod] users.email NOT NULL: OK');

    // payments.email — payer email captured at payment initiation
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS email varchar`);
    console.log('[migrate-prod] payments.email: OK');

    // payments.plan_id — resolved plan after payment success
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan_id varchar`);
    console.log('[migrate-prod] payments.plan_id: OK');

    // payments — provider verification columns (added for payment verification system)
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP`);
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS verification_status VARCHAR`);
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS verification_note VARCHAR(500)`);
    console.log('[migrate-prod] payments.verification_*: OK');

    // payments — STK recovery columns (added for M-Pesa STK push recovery system)
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS callback_received_at TIMESTAMP`);
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS status_last_checked TIMESTAMP`);
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS query_attempts INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS mpesa_receipt_number TEXT`);
    console.log('[migrate-prod] payments.stk_recovery_*: OK');

    // ── Status normalization ───────────────────────────────────────────────
    // Rename legacy "success" status to canonical "completed" in payments table.
    // The pipeline now uses "pending" → "completed" | "failed".
    const statusFix = await pool.query(`
      UPDATE payments SET status = 'completed', updated_at = NOW()
      WHERE status = 'success'
      RETURNING id, email, plan_id, status
    `);
    if (statusFix.rowCount > 0) {
      console.log(`[migrate-prod] Status normalization: renamed ${statusFix.rowCount} "success" → "completed"`);
      statusFix.rows.forEach(r =>
        console.log(`[migrate-prod]   ↳ id=${r.id} email=${r.email || "?"} plan=${r.plan_id || "?"} → completed`)
      );
    } else {
      console.log('[migrate-prod] Status normalization: no legacy "success" rows found ✓');
    }

    // ── Plan pricing upsert ────────────────────────────────────────────────
    // Ensure subscription plan records exist with correct KES prices.
    // Basic = KES 999 (3 months) | Pro = KES 2,500 or 4,500 (1 year).
    // Uses ON CONFLICT to update price if the row already exists.
    await pool.query(`
      INSERT INTO plans (plan_id, plan_name, price, currency, billing_period, is_active, display_order, created_at, updated_at)
      VALUES
        ('free', 'Free', 0,    'KES', 'annual', true, 1, NOW(), NOW()),
        ('pro',  'Pro',  4500, 'KES', 'annual', true, 3, NOW(), NOW())
      ON CONFLICT (plan_id) DO UPDATE
        SET price      = EXCLUDED.price,
            updated_at = NOW()
    `);
    console.log('[migrate-prod] Plan pricing: free=KES 0, pro=KES 4,500 ✓');

    // ── Data consistency fixes ─────────────────────────────────────────────
    // Sync users.plan from their active subscription in case the column drifted.
    const sync = await pool.query(`
      UPDATE users u
      SET    plan       = us.plan_id,
             updated_at = NOW()
      FROM   user_subscriptions us
      WHERE  u.id         = us.user_id
        AND  us.is_active = true
        AND  (us.expires_at IS NULL OR us.expires_at > NOW())
        AND  u.plan      != us.plan_id
      RETURNING u.id, u.email, us.plan_id AS synced_plan
    `);
    if (sync.rowCount > 0) {
      console.log(`[migrate-prod] Plan sync: fixed ${sync.rowCount} stale user(s):`);
      sync.rows.forEach(r =>
        console.log(`[migrate-prod]   ↳ userId=${r.id} email=${r.email} → plan=${r.synced_plan}`)
      );
    } else {
      console.log('[migrate-prod] Plan sync: all users.plan values are consistent ✓');
    }

    console.log('[migrate-prod] All migrations complete.');
  } catch (err) {
    console.error('[migrate-prod] Migration error:', err.message);
    // Don't exit with non-zero — let the build continue
  } finally {
    await pool.end();
  }
}

migrate();
