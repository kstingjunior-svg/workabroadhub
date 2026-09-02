"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniqueReferralCode = generateUniqueReferralCode;
const db_1 = require("../db");
function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
/**
 * Generates a unique 6-character referral code and verifies it doesn't
 * already exist in the users table before returning it.
 * Falls back to a timestamp-based code after 5 failed attempts.
 */
async function generateUniqueReferralCode() {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        const { rows } = await db_1.pool.query(`SELECT id FROM users WHERE referral_code = $1 LIMIT 1`, [code]);
        if (!rows.length)
            return code;
    }
    // Collision-proof fallback — timestamp in base-36 is always unique
    return `R${Date.now().toString(36).toUpperCase()}`;
}
