"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPayment = checkPayment;
const db_1 = require("../../db");
async function checkPayment(userId) {
    const res = await db_1.pool.query(`SELECT id, service_name, amount, status, created_at
       FROM payments
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1`, [userId]);
    return res.rows[0] ?? null;
}
