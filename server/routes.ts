
import { Router } from "express";
import { db } from "./db";
import { payments, subscriptions } from "../shared/schema";
import { eq } from "drizzle-orm";
import { stkPush } from "./mpesa";

const router = Router();
router.get("/ping", (req, res) => {
  res.json({
    success: true,
    message: "pong"
  });
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

  if (!subscription) {
    return false;
  }

  if (subscription.status !== "active") {
    return false;
  }

  if (new Date(subscription.expiresAt) < new Date()) {
    return false;
  }

  return true;
}

/* =========================
   🚀 INITIATE PAYMENT
========================= */
router.post("/api/mpesa/pay", async (req, res) => {
  try {
    let { phone, amount } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({
        error: "Phone and amount required",
      });
    }

    // ✅ FORMAT PHONE
    phone = phone.replace(/^0/, "254");

    // 🔥 TEMP TEST USER
    // Replace with real authenticated user later
    const userId = "00000000-0000-0000-0000-000000000001";

    console.log("📩 Incoming payment:", { phone, amount });

    // 🔥 SEND STK PUSH
    const stkResponse = await stkPush(phone, amount);

    console.log("📡 STK RESPONSE:", stkResponse);

    const checkoutRequestId = stkResponse?.CheckoutRequestID;
    const merchantRequestId = stkResponse?.MerchantRequestID;

    if (!checkoutRequestId) {
      console.log("❌ Missing CheckoutRequestID");

      return res.status(500).json({
        error: "Invalid STK response",
        raw: stkResponse,
      });
    }

    // 🔥 SAVE PAYMENT
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

    return res.json({
      success: true,
      message: "STK push sent",
    });

  } catch (error: any) {
    console.log("🔥 SAFARICOM ERROR RESPONSE:", error?.response?.data);
    console.error("❌ STK ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error?.response?.data || error.message,
    });
  }
});

/* =========================
   🔁 CALLBACK
========================= */
router.post("/api/mpesa/callback", async (req, res) => {
  try {
    console.log("📥 CALLBACK RECEIVED:", JSON.stringify(req.body));

    const stk = req.body?.Body?.stkCallback;

    if (!stk) {
      console.log("❌ Invalid callback structure");

      return res.json({
        ok: true,
      });
    }

    const resultCode = stk.ResultCode;
    const checkoutRequestId = stk.CheckoutRequestID;
    const merchantRequestId = stk.MerchantRequestID;

    if (!checkoutRequestId) {
      console.log("❌ Missing checkoutRequestId");

      return res.json({
        ok: true,
      });
    }

    // 🔍 FIND PAYMENT
    const payment = await db.query.payments.findFirst({
      where: (p, { eq }) =>
        eq(p.checkoutRequestId, checkoutRequestId),
    });

    if (!payment) {
      console.log("❌ Payment not found:", checkoutRequestId);

      return res.json({
        ok: true,
      });
    }

    // 🛑 PREVENT DOUBLE PROCESSING
    if (payment.status === "completed") {
      console.log("⚠️ Already processed:", checkoutRequestId);

      return res.json({
        ok: true,
      });
    }

    // ❌ FAILED PAYMENT
    if (resultCode !== 0) {
      await db.update(payments)
        .set({
          status: "failed",
          merchantRequestId,
          callbackReceivedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      console.log("❌ PAYMENT FAILED:", checkoutRequestId);

      return res.json({
        ok: true,
      });
    }

    // ✅ SUCCESS PAYMENT
    const metadata = stk.CallbackMetadata?.Item || [];

    const mpesaCode =
      metadata.find(
        (i: any) => i.Name === "MpesaReceiptNumber"
      )?.Value || null;

    // 🔥 UPDATE PAYMENT
    await db.update(payments)
      .set({
        status: "completed",
        mpesaCode,
        merchantRequestId,
        callbackReceivedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    console.log("✅ PAYMENT SUCCESS:", mpesaCode);

    /* =========================
       🔥 ACTIVATE SUBSCRIPTION
    ========================= */
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);

    const existingSub =
      await db.query.subscriptions.findFirst({
        where: (s, { eq }) =>
          eq(s.userId, payment.userId),
      });

    if (existingSub) {

      await db.update(subscriptions)
        .set({
          status: "active",
          expiresAt: expires,
          updatedAt: new Date(),
        })
        .where(
          eq(subscriptions.userId, payment.userId)
        );

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

    return res.json({
      ok: true,
    });

  } catch (error) {
    console.error("❌ CALLBACK ERROR:", error);

    return res.json({
      ok: true,
    });
  }
});

/* =========================
   👑 PREMIUM STATUS
========================= */
router.get("/api/premium/status", async (req, res) => {
  try {

    // TEMP TEST USER
    const userId =
      "00000000-0000-0000-0000-000000000001";

    const allowed =
      await hasActiveSubscription(userId);

    return res.json({
      premium: allowed
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error"
    });
  }
});

export default router;