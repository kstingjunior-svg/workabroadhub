import { Router } from "express";
import { db } from "./db";
import { payments, userSubscriptions } from "../shared/schema";
import { eq } from "drizzle-orm";
import { stkPush } from "./mpesa";

const router = Router();

/* =========================
   🚀 INITIATE PAYMENT
========================= */
router.post("/api/mpesa/pay", async (req, res) => {
  try {
    let { phone, amount } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({ error: "Phone and amount required" });
    }

    // ✅ FORMAT PHONE (VERY IMPORTANT)
    phone = phone.replace(/^0/, "254");

    // ✅ FIXED: use a valid UUID for testing (replace with real auth user ID in production)
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
      return res.json({ ok: true });
    }

    const resultCode = stk.ResultCode;
    const checkoutRequestId = stk.CheckoutRequestID;
    const merchantRequestId = stk.MerchantRequestID;

    if (!checkoutRequestId) {
      console.log("❌ Missing checkoutRequestId");
      return res.json({ ok: true });
    }

    // 🔍 FIND PAYMENT
    const payment = await db.query.payments.findFirst({
      where: (p, { eq }) => eq(p.checkoutRequestId, checkoutRequestId),
    });

    if (!payment) {
      console.log("❌ Payment not found:", checkoutRequestId);
      return res.json({ ok: true });
    }

    // 🛑 PREVENT DOUBLE PROCESSING
    if (payment.status === "completed") {
      console.log("⚠️ Already processed:", checkoutRequestId);
      return res.json({ ok: true });
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
      return res.json({ ok: true });
    }

    // ✅ SUCCESS PAYMENT
    const metadata = stk.CallbackMetadata?.Item || [];

    const mpesaCode =
      metadata.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value || null;

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
       🔥 UPGRADE USER
    ========================= */
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);

    const existingSub = await db.query.userSubscriptions.findFirst({
      where: (s, { eq }) => eq(s.userId, payment.userId),
    });

    if (existingSub) {
      await db.update(userSubscriptions)
        .set({
          status: "active",
          expiresAt: expires,
        })
        .where(eq(userSubscriptions.userId, payment.userId));
    } else {
      await db.insert(userSubscriptions).values({
        userId: payment.userId,
        status: "active",
        expiresAt: expires,
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