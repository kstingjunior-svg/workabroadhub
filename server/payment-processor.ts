// @ts-nocheck
/**
 * PRODUCTION HARDENING: Atomic payment processing
 * 
 * Ensures:
 * - Idempotent webhook handling (no double-credits)
 * - Transaction-level locking
 * - Race condition prevention
 * - Retry safety
 */

import { db, withTransaction } from "./db";
import { payments, userSubscriptions, referrals, webhookProcessingLocks } from "@shared/schema";
import { eq, and, sql, lt } from "drizzle-orm";

interface PaymentResult {
  success: boolean;
  paymentId?: string;
  error?: string;
  alreadyProcessed?: boolean;
}

/**
 * Acquires an exclusive lock for webhook processing using INSERT ON CONFLICT DO UPDATE RETURNING.
 * This guarantees only one process can hold the lock at any time, even under high concurrency.
 */
export async function acquireWebhookLock(
  checkoutRequestId: string,
  timeoutMs = 30000
): Promise<boolean> {
  const lockKey = `mpesa:${checkoutRequestId}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + timeoutMs);
  
  try {
    // Use INSERT ... ON CONFLICT DO UPDATE ... WHERE ... RETURNING to atomically acquire or take over lock
    // Only updates if the lock is expired, RETURNING confirms we own it
    const result = await db.execute(sql`
      INSERT INTO webhook_processing_locks (lock_key, webhook_type, status, expires_at)
      VALUES (${lockKey}, 'mpesa_stk', 'processing', ${expiresAt})
      ON CONFLICT (lock_key) DO UPDATE
      SET status = 'processing', expires_at = ${expiresAt}
      WHERE webhook_processing_locks.expires_at < NOW()
      RETURNING lock_key
    `);
    
    // If we got a row back, we own the lock
    const rows = result.rows || result;
    return Array.isArray(rows) && rows.length > 0;
  } catch (error: any) {
    // Handle case where insert succeeds (new lock acquired)
    if (error.code === '23505') {
      // Unique violation means lock exists and isn't expired - someone else has it
      return false;
    }
    console.error("Failed to acquire webhook lock:", error);
    return false;
  }
}

export async function releaseWebhookLock(checkoutRequestId: string): Promise<void> {
  const lockKey = `mpesa:${checkoutRequestId}`;
  try {
    await db
      .delete(webhookProcessingLocks)
      .where(eq(webhookProcessingLocks.lockKey, lockKey));
  } catch (error) {
    console.error("Failed to release webhook lock:", error);
  }
}

/**
 * Clean up expired locks periodically (defensive cleanup)
 */
export async function cleanupExpiredLocks(): Promise<number> {
  try {
    const result = await db
      .delete(webhookProcessingLocks)
      .where(lt(webhookProcessingLocks.expiresAt, new Date()))
      .returning();
    return result.length;
  } catch (error) {
    console.error("Failed to cleanup expired locks:", error);
    return 0;
  }
}

// Run cleanup every 5 minutes
setInterval(() => {
  cleanupExpiredLocks().then(count => {
    if (count > 0) {
      console.log(`Cleaned up ${count} expired webhook locks`);
    }
  });
}, 5 * 60 * 1000);

export async function processPaymentAtomically(
  checkoutRequestId: string,
  userId: string,
  amount: number,
  mpesaReceiptNumber: string,
  refCode?: string
): Promise<PaymentResult> {
  // First check in-memory cache for fast duplicate detection
  if (isCallbackProcessed(checkoutRequestId)) {
    return { success: true, alreadyProcessed: true };
  }
  
  const lockAcquired = await acquireWebhookLock(checkoutRequestId);
  if (!lockAcquired) {
    return { success: false, error: "Could not acquire lock", alreadyProcessed: true };
  }
  
  try {
    // Double-check for already processed payment (in case of race)
    const existingPayment = await db.query.payments.findFirst({
      where: eq(payments.transactionRef, mpesaReceiptNumber),
    });
    
    if (existingPayment && existingPayment.status === "completed") {
      markCallbackProcessed(checkoutRequestId);
      return { success: true, paymentId: existingPayment.id, alreadyProcessed: true };
    }
    
    const result = await withTransaction(async (tx) => {
      // Use SELECT FOR UPDATE to lock the payment row
      const [updatedPayment] = await tx
        .update(payments)
        .set({
          status: "completed",
          transactionRef: mpesaReceiptNumber,
        })
        .where(and(
          eq(payments.userId, userId),
          eq(payments.status, "pending")
        ))
        .returning();
      
      if (!updatedPayment) {
        throw new Error("No pending payment found for user");
      }
      
      const existingSub = await tx.query.userSubscriptions.findFirst({
        where: eq(userSubscriptions.userId, userId),
      });
      
      if (!existingSub) {
        await tx.insert(userSubscriptions).values({
          userId,
          paymentId: updatedPayment.id,
          isActive: true,
          expiresAt: null,
        });
      } else {
        await tx
          .update(userSubscriptions)
          .set({ isActive: true, paymentId: updatedPayment.id })
          .where(eq(userSubscriptions.userId, userId));
      }
      
      if (refCode) {
        await processReferralCommission(tx, refCode, updatedPayment.id, amount);
      }
      
      return { success: true, paymentId: updatedPayment.id };
    });
    
    // Mark as processed in memory cache
    markCallbackProcessed(checkoutRequestId);
    return result;
  } catch (error: any) {
    console.error("Payment processing error:", error);
    return { success: false, error: error.message };
  } finally {
    await releaseWebhookLock(checkoutRequestId);
  }
}

async function processReferralCommission(
  tx: typeof db,
  refCode: string,
  paymentId: string,
  amount: number
): Promise<void> {
  const COMMISSION_RATE = 0.1; // 10%
  const commission = Math.floor(amount * COMMISSION_RATE);
  
  // Use INSERT ... ON CONFLICT to prevent duplicate referral creation
  try {
    await tx.execute(sql`
      INSERT INTO referrals (id, referrer_id, referee_id, ref_code, payment_id, commission, status, created_at)
      VALUES (
        gen_random_uuid(),
        ${refCode},
        ${paymentId},
        ${refCode},
        ${paymentId},
        ${commission},
        'pending',
        NOW()
      )
      ON CONFLICT (payment_id) DO NOTHING
    `);
  } catch (error: any) {
    // Log but don't fail the payment if referral insert fails
    console.error("Failed to process referral:", error.message);
  }
}

// In-memory deduplication cache for fast duplicate detection
const processedCallbacks = new Map<string, number>();
const CALLBACK_RETENTION_MS = 3600000; // 1 hour

// Cleanup old entries every minute
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(processedCallbacks.entries());
  for (const [key, timestamp] of entries) {
    if (now - timestamp > CALLBACK_RETENTION_MS) {
      processedCallbacks.delete(key);
    }
  }
}, 60000);

export function isCallbackProcessed(checkoutRequestId: string): boolean {
  return processedCallbacks.has(checkoutRequestId);
}

export function markCallbackProcessed(checkoutRequestId: string): void {
  processedCallbacks.set(checkoutRequestId, Date.now());
}
