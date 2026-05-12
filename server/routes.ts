
import { Router } from "express";
import { db } from "./db";
import { payments, subscriptions } from "../shared/schema";
import { eq } from "drizzle-orm";
import { stkPush } from "./mpesa";

const router = Router();

/* =========================
   🏓 PING TEST
========================= */
router.get("/ping", (req, res) => {
  res.json({ success: true, message: "pong" });
});

/* =========================
   🔒 CHECK ACTIVE SUBSCRIPTION
========================= */
async function hasActiveSubscription(userId: string) {
  const result = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const subscription = result[0];
  if (!subscription) return false;
  if (subscription.status !== "active") return false;
  if (new Date(subscription.expiresAt) < new Date()) return false;
  return true;
}

/* =========================
   👑 PREMIUM STATUS
========================= */
router.get("/api/premium/status", async (req, res) => {
  try {
    // TODO: replace with real user from auth session
    const userId = req.query.userId as string || "00000000-0000-0000-0000-000000000001";
    const allowed = await hasActiveSubscription(userId);
    return res.json({ premium: allowed });
  } catch (error: any) {
    console.error("PREMIUM STATUS ERROR:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

/* =========================
   🚀 INITIATE PAYMENT
========================= */
router.post("/api/mpesa/pay", async (req, res) => {
  try {
    let { phone, amount, userId } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({ error: "Phone and amount required" });
    }

    // TODO: replace with real authenticated user
    if (!userId) userId = "00000000-0000-0000-0000-000000000001";

    phone = phone.replace(/^0/, "254");

    console.log("📩 Incoming payment:", { phone, amount });

    const stkResponse = await stkPush(phone, amount);
    console.log("📡 STK RESPONSE:", stkResponse);

    const checkoutRequestId = stkResponse?.CheckoutRequestID;
    const merchantRequestId = stkResponse?.MerchantRequestID;

    if (!checkoutRequestId) {
      return res.status(500).json({ error: "Invalid STK response", raw: stkResponse });
    }

    await db.insert(payments).values({
      userId,
      phone,
      amount,
      status: "pending",
      checkoutRequestId,
      merchantRequestId,
      provider: "mpesa",
      createdAt: new Date(),
    });

    console.log("🚀 STK PUSH SENT SUCCESSFULLY");
    return res.json({ success: true, message: "STK push sent" });

  } catch (error: any) {
    console.error("❌ STK ERROR:", error);
    return res.status(500).json({ success: false, error: error?.response?.data || error.message });
  }
});

/* =========================
   🔁 MPESA CALLBACK
========================= */
router.post("/api/mpesa/callback", async (req, res) => {
  try {
    console.log("📥 CALLBACK RECEIVED:", JSON.stringify(req.body));

    const stk = req.body?.Body?.stkCallback;
    if (!stk) return res.json({ ok: true });

    const resultCode = stk.ResultCode;
    const checkoutRequestId = stk.CheckoutRequestID;
    const merchantRequestId = stk.MerchantRequestID;

    if (!checkoutRequestId) return res.json({ ok: true });

    const payment = await db.query.payments.findFirst({
      where: (p, { eq }) => eq(p.checkoutRequestId, checkoutRequestId),
    });

    if (!payment) {
      console.log("❌ Payment not found:", checkoutRequestId);
      return res.json({ ok: true });
    }

    if (payment.status === "completed") {
      console.log("⚠️ Already processed:", checkoutRequestId);
      return res.json({ ok: true });
    }

    if (resultCode !== 0) {
      await db.update(payments)
        .set({ status: "failed", merchantRequestId, callbackReceivedAt: new Date() })
        .where(eq(payments.id, payment.id));
      console.log("❌ PAYMENT FAILED:", checkoutRequestId);
      return res.json({ ok: true });
    }

    const metadata = stk.CallbackMetadata?.Item || [];
    const mpesaCode = metadata.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value || null;

    await db.update(payments)
      .set({ status: "completed", mpesaCode, merchantRequestId, callbackReceivedAt: new Date() })
      .where(eq(payments.id, payment.id));

    console.log("✅ PAYMENT SUCCESS:", mpesaCode);

    // 🔥 ACTIVATE SUBSCRIPTION
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);

    const existingSubResult = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, payment.userId))
      .limit(1);

    const existingSub = existingSubResult[0];

    if (existingSub) {
      await db.update(subscriptions)
        .set({ status: "active", expiresAt: expires, updatedAt: new Date() })
        .where(eq(subscriptions.userId, payment.userId));
    } else {
      await db.insert(subscriptions).values({
        userId: payment.userId,
        status: "active",
        plan: "pro",
        expiresAt: expires,
        createdAt: new Date(),
      });
    }

    console.log("🔥 USER UPGRADED:", payment.userId);
    return res.json({ ok: true });

  } catch (error) {
    console.error("❌ CALLBACK ERROR:", error);
    return res.json({ ok: true });
  }
});

export default router;