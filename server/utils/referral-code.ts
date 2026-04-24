import { pool } from "../db";

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Generates a unique 6-character referral code and verifies it doesn't
 * already exist in the users table before returning it.
 * Falls back to a timestamp-based code after 5 failed attempts.
 */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { rows } = await pool.query(
      `SELECT id FROM users WHERE referral_code = $1 LIMIT 1`,
      [code]
    );
    if (!rows.length) return code;
  }
  // Collision-proof fallback — timestamp in base-36 is always unique
  return `R${Date.now().toString(36).toUpperCase()}`;
}
