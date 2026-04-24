import { pool } from "../../db";

export interface PaymentSummary {
  id: number;
  service_name: string | null;
  amount: number;
  status: string;
  created_at: Date;
}

export async function checkPayment(userId: number): Promise<PaymentSummary | null> {
  const res = await pool.query<PaymentSummary>(
    `SELECT id, service_name, amount, status, created_at
       FROM payments
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );

  return res.rows[0] ?? null;
}
