
import { Router } from "express";
import { db } from "./db";
import * as schema from "../shared/schema";
import { eq } from "drizzle-orm";
import { stkPush } from "./mpesa";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const payments = schema.payments;
const subscriptions = schema.subscriptions;

/* =========================
   🔐 SUPABASE AUTH HELPER
========================= */

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserIdFromRequest(
  req: any
): Promise<string | null> {

  try {

    const authHeader =
      req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return null;
    }

    const token =
      authHeader.replace("Bearer ", "");

    const { data, error } =
      await supabase.auth.getUser(token);

    if (error || !data?.user) {

      console.error(
        "AUTH ERROR:",
        error?.message
      );

      return null;
    }

    return data.user.id;

  } catch (err) {

    console.error(
      "getUserIdFromRequest ERROR:",
      err
    );

    return null;
  }
}

/* =========================
   🏓 PING TEST
========================= */

router.get("/ping", (req, res) => {

  return res.json({
    success: true,
    message: "pong",
  });
});

/* =========================
   🔒 CHECK ACTIVE SUBSCRIPTION
========================= */

async function hasActiveSubscription(
  userId: string
): Promise<boolean> {

  try {

    const result = await db
      .select()
      .from(subscriptions)
      .where(
        eq(
          subscriptions.userId,
          userId
        )
      )
      .limit(1);

    console.log(
      "SUBSCRIPTION RESULT:",
      result
    );

    const subscription =
      result[0];

    if (!subscription) {

      console.log(
        "NO SUBSCRIPTION FOUND"
      );

      return false;
    }

    console.log(
      "SUB STATUS:",
      subscription.status
    );

    console.log(
      "EXPIRES:",
      subscription.expiresAt
    );

    const isActive =
      subscription.status === "active";

    const isNotExpired =
      new Date(subscription.expiresAt)
      > new Date();

    return (
      isActive &&
      isNotExpired
    );

  } catch (error) {

    console.error(
      "SUBSCRIPTION CHECK ERROR:",
      error
    );

    return false;
  }
}

/* =========================
   👑 PREMIUM STATUS
========================= */

router.get(
  "/api/premium/status",
  async (req, res) => {

    try {

      const userId =
        await getUserIdFromRequest(req);

      if (!userId) {

        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      const allowed =
        await hasActiveSubscription(userId);

      return res.json({
        premium: allowed,
      });

    } catch (error: any) {

      console.error(
        "PREMIUM STATUS ERROR:",
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          "Server error",
      });
    }
  }
);

/* =========================
   🚀 INITIATE PAYMENT
========================= */

router.post(
  "/api/mpesa/pay",
  async (req, res) => {

    try {

      const userId =
        await getUserIdFromRequest(req);

      if (!userId) {

        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      let {
        phone,
        amount
      } = req.body;

      if (!phone || !amount) {

        return res.status(400).json({
          error:
            "Phone and amount required",
        });
      }

      // Normalize phone
      phone =
        phone.replace(/^0/, "254");

      console.log(
        "📩 Incoming payment:",
        {
          phone,
          amount,
          userId,
        }
      );

      const stkResponse =
        await stkPush(
          phone,
          amount
        );

      console.log(
        "📡 STK RESPONSE:",
        stkResponse
      );

      const checkoutRequestId =
        stkResponse?.CheckoutRequestID;

      const merchantRequestId =
        stkResponse?.MerchantRequestID;

      if (!checkoutRequestId) {

        return res.status(500).json({
          error:
            "Invalid STK response",
          raw: stkResponse,
        });
      }

      await db
        .insert(payments)
        .values({
          userId,
          phone,
          amount,
          status: "pending",
          checkoutRequestId,
          merchantRequestId,
          provider: "mpesa",
          createdAt: new Date(),
        });

      console.log(
        "🚀 STK PUSH SENT SUCCESSFULLY"
      );

      return res.json({
        success: true,
        message: "STK push sent",
      });

    } catch (error: any) {

      console.error(
        "❌ STK ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error?.response?.data ||
          error.message,
      });
    }
  }
);

/* =========================
   🔁 MPESA CALLBACK
========================= */

router.post(
  "/api/mpesa/callback",
  async (req, res) => {

    try {

      console.log(
        "📥 CALLBACK RECEIVED:",
        JSON.stringify(req.body)
      );

      const stk =
        req.body?.Body?.stkCallback;

      if (!stk) {

        return res.json({
          ok: true
        });
      }

      const resultCode =
        stk.ResultCode;

      const checkoutRequestId =
        stk.CheckoutRequestID;

      const merchantRequestId =
        stk.MerchantRequestID;

      if (!checkoutRequestId) {

        return res.json({
          ok: true
        });
      }

      const payment =
        await db.query.payments.findFirst({
          where: (p, { eq }) =>
            eq(
              p.checkoutRequestId,
              checkoutRequestId
            ),
        });

      if (!payment) {

        console.log(
          "❌ Payment not found:",
          checkoutRequestId
        );

        return res.json({
          ok: true
        });
      }

      if (
        payment.status ===
        "completed"
      ) {

        console.log(
          "⚠️ Already processed:",
          checkoutRequestId
        );

        return res.json({
          ok: true
        });
      }

      // PAYMENT FAILED

      if (resultCode !== 0) {

        await db
          .update(payments)
          .set({
            status: "failed",
            merchantRequestId,
            callbackReceivedAt:
              new Date(),
          })
          .where(
            eq(
              payments.id,
              payment.id
            )
          );

        console.log(
          "❌ PAYMENT FAILED:",
          checkoutRequestId
        );

        return res.json({
          ok: true
        });
      }

      // PAYMENT SUCCESS

      const metadata =
        stk.CallbackMetadata?.Item || [];

      const mpesaCode =
        metadata.find(
          (i: any) =>
            i.Name ===
            "MpesaReceiptNumber"
        )?.Value ?? null;

      await db
        .update(payments)
        .set({
          status: "completed",
          mpesaCode,
          merchantRequestId,
          callbackReceivedAt:
            new Date(),
        })
        .where(
          eq(
            payments.id,
            payment.id
          )
        );

      console.log(
        "✅ PAYMENT SUCCESS:",
        mpesaCode
      );

      // SUBSCRIPTION EXPIRES IN 1 YEAR

      const expiresAt =
        new Date();

      expiresAt.setFullYear(
        expiresAt.getFullYear() + 1
      );

      const existingSubResult =
        await db
          .select()
          .from(subscriptions)
          .where(
            eq(
              subscriptions.userId,
              payment.userId
            )
          )
          .limit(1);

      const existingSub =
        existingSubResult[0];

      if (existingSub) {

        await db
          .update(subscriptions)
          .set({
            status: "active",
            expiresAt,
            updatedAt:
              new Date(),
          })
          .where(
            eq(
              subscriptions.userId,
              payment.userId
            )
          );

      } else {

        await db
          .insert(subscriptions)
          .values({
            userId:
              payment.userId,
            status: "active",
            plan: "pro",
            expiresAt,
            createdAt:
              new Date(),
          });
      }

      console.log(
        "🔥 USER UPGRADED:",
        payment.userId
      );

      return res.json({
        ok: true
      });

    } catch (error) {

      console.error(
        "❌ CALLBACK ERROR:",
        error
      );

      return res.json({
        ok: true
      });
    }
  }
);

export default router;