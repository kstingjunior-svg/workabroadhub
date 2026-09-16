// @ts-nocheck
/**
 * completePayPalCapture — shared "finish this PayPal order" logic.
 *
 * 2026-09 (Tony's "check payment bugs across all services" audit): extracted
 * from the inline body of POST /api/paypal/capture-order so the SAME,
 * fully-featured completion logic (provider verification, plan activation,
 * Supabase/Firebase sync, WhatsApp receipt, referral commission) can be
 * reused by a server-side recovery poller — not just the client's onApprove
 * callback.
 *
 * Why this exists: a production audit found PayPal's live success rate was
 * effectively 0% for two+ months. 39 orders were created (confirmed via
 * "[PayPal] Order created" logs, mode=live) but only ONE request ever
 * reached /api/paypal/capture-order (and it 500'd on a card decline that
 * wasn't handled cleanly). PayPal's own webhook — meant to be the safety
 * net for exactly this "client never called capture" scenario — has never
 * been invoked once either (checked: zero "[PAYPAL WEBHOOK]" log lines in
 * 30 days), which means it isn't subscribed in the PayPal app dashboard.
 * Root cause of the browser-side gap is unconfirmed (most likely: users
 * approving on PayPal's page but the SDK's onApprove callback not
 * completing back on this tab — a known class of issue on some mobile
 * browsers with the popup/redirect handshake). Whatever the browser cause,
 * every affected order is NOT lost money — PayPal still knows about it —
 * so server/paypal-recovery.ts polls stuck "pending" PayPal payments and
 * asks PayPal directly what really happened, using this function to finish
 * the ones that genuinely went through.
 *
 * IMPORTANT: this function now checks the order's CURRENT status via
 * getPayPalOrder() before deciding whether to call capturePayPalOrder().
 * The original inline handler always called capture unconditionally, which
 * is safe the first time (order is freshly APPROVED) but throws PayPal's
 * ORDER_ALREADY_CAPTURED error on any retry of an already-completed order —
 * exactly the case the recovery poller (and a double-submit from the
 * client) needs to handle idempotently.
 */

import { storage } from "../storage";
import { pool } from "../db";
import { getPayPalOrder, capturePayPalOrder } from "../paypal";
import { planExpiry } from "../utils/plans";
import { upgradeUserToPro, syncPaymentToSupabase, syncSubscriptionToSupabase, incrementPromoUsageInSupabase } from "../supabaseClient";
import { reportRejection } from "../lib/sentry";

// Duplicated from server/routes.ts (a local, non-exported helper there) —
// small and self-contained enough that importing back from routes.ts would
// create a circular dependency (routes.ts imports this module's
// completePayPalCapture for the live /api/paypal/capture-order route).
async function redeemAppliedPromo(metadata: string | null | undefined): Promise<void> {
  try {
    if (!metadata) return;
    const meta = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    const code: string | undefined = meta?.appliedPromo;
    if (!code) return;

    const promo = await storage.getPromoCode(code);
    if (!promo) {
      console.warn(`[PromoRedeem] Code not found in local DB: ${code}`);
      return;
    }

    const incremented = await storage.usePromoCode(promo.id, promo.maxUses ?? null);
    if (!incremented) {
      console.warn(`[PromoRedeem] ${code} has hit its max_uses — no increment`);
      return;
    }

    console.info(`[PromoRedeem] Local DB incremented: ${code} (id=${promo.id})`);
    await incrementPromoUsageInSupabase(code);
  } catch (err) {
    console.error("[PromoRedeem] Failed:", err);
  }
}

export interface CompletePayPalCaptureParams {
  paypalOrderId: string;
  paymentId?: string | null;
  userId: string;
  clientIp?: string;
  /** "client" — live onApprove call; "recovery" — server-side poller. Only affects logging. */
  source?: "client" | "recovery";
}

export interface CompletePayPalCaptureResult {
  status: number;
  body: Record<string, any>;
}

export async function completePayPalCapture(
  params: CompletePayPalCaptureParams,
): Promise<CompletePayPalCaptureResult> {
  const { paypalOrderId, paymentId, userId, source = "client" } = params;
  const clientIp = params.clientIp || "server";
  const logTag = source === "recovery" ? "[PayPal][Recovery]" : "[PayPal]";

  if (!paypalOrderId) {
    return { status: 400, body: { message: "paypalOrderId is required." } };
  }

  // ── 1. Resolve the order's CURRENT status before touching the Capture API ──
  // An order can legitimately already be COMPLETED here (webhook beat us to
  // it, or this is a recovery retry) — calling capture again would throw
  // PayPal's ORDER_ALREADY_CAPTURED error. Only call capture when PayPal
  // says the buyer has approved but nothing has captured yet.
  let capture: { id: string; status: string; transactionId: string; payerEmail: string; amountUSD: string };
  try {
    const orderNow = await getPayPalOrder(paypalOrderId);

    if (orderNow.status === "COMPLETED") {
      capture = {
        id: orderNow.id,
        status: "COMPLETED",
        transactionId: orderNow.captureId,
        payerEmail: orderNow.payerEmail,
        amountUSD: orderNow.amountUSD,
      };
    } else if (orderNow.status === "APPROVED") {
      capture = await capturePayPalOrder(paypalOrderId);
    } else {
      // CREATED / PAYER_ACTION_REQUIRED / VOIDED / anything else — buyer
      // hasn't approved (or the order is dead). Not a server error; just
      // not completable right now. Caller (poller) decides whether an old
      // still-CREATED order should be given up on.
      return {
        status: 402,
        body: {
          message: `PayPal payment not completed — status: ${orderNow.status}`,
          status: orderNow.status,
        },
      };
    }
  } catch (err: any) {
    // capturePayPalOrder throws the raw PayPal SDK error on a rejected
    // capture (e.g. INSTRUMENT_DECLINED). Previously this fell through to
    // the outer catch and returned a generic 500 — indistinguishable from
    // a real server bug, and it left the payment row stuck "pending"
    // forever since nothing downgraded its status.
    const paypalIssue: string | undefined = err?.details?.[0]?.issue || err?.issue;
    const redirectLink: string | undefined =
      err?.links?.find?.((l: any) => l.rel === "redirect")?.href;
    console.error(`${logTag} capture-order error:`, err?.message ?? err);

    if (paymentId) {
      await storage.updatePayment(paymentId, {
        status: "failed",
        failReason: paypalIssue ? `paypal_${paypalIssue.toLowerCase()}` : "paypal_capture_error",
      } as any).catch((e) => reportRejection(e, 'services/paypalCapture'));
    }

    if (paypalIssue) {
      // Known PayPal-side rejection (declined card, insufficient funds,
      // etc.) — this is a buyer-facing outcome, not a server failure.
      return {
        status: 402,
        body: {
          message:
            paypalIssue === "INSTRUMENT_DECLINED"
              ? "Your payment method was declined. Please try a different card or funding source."
              : `PayPal declined this payment (${paypalIssue}).`,
          code: "PAYPAL_DECLINED",
          paypalIssue,
          // Per PayPal's own recommended recovery flow for INSTRUMENT_DECLINED:
          // send the buyer back to this link so they can pick another funding
          // source on the SAME order instead of starting over.
          retryUrl: redirectLink || null,
        },
      };
    }
    // Genuinely unexpected — surface as a server error like before.
    return { status: 500, body: { message: err?.message ?? "PayPal capture failed." } };
  }

  if (capture.status !== "COMPLETED") {
    // Defensive — shouldn't reach here given the branch above, but keep the
    // original guard, and now actually record the outcome instead of
    // leaving the row "pending" forever.
    if (paymentId) {
      await storage.updatePayment(paymentId, {
        status: "failed",
        failReason: `paypal_status_${String(capture.status).toLowerCase()}`,
      } as any).catch((e) => reportRejection(e, 'services/paypalCapture'));
    }
    return {
      status: 402,
      body: { message: `PayPal payment not completed — status: ${capture.status}`, status: capture.status },
    };
  }

  const { upgradeUserAccount } = await import("../services/upgradeUserAccount");

  // ── 2. Look up (or create) the payment record so we know serviceId ──────
  let payment: any = null;
  if (paymentId) {
    try {
      payment = await storage.getPaymentById(paymentId);
    } catch (_e) { /* non-fatal */ }
  }

  // Idempotency guard — prevent double-capture and double-upgrade
  if (payment?.processed) {
    console.log(`${logTag} Capture skipped — payment ${payment.id} already processed`);
    return { status: 200, body: { message: "Payment already processed.", alreadyProcessed: true, plan: "pro" } };
  }

  if (!payment) {
    // Fallback: create the record if none exists (legacy flow)
    const amountUSD = parseFloat(capture.amountUSD);
    const kesAmountFallback = Math.round(amountUSD * 130);
    payment = await storage.createPayment({
      userId,
      amount: kesAmountFallback || 0,
      currency: "KES",
      method: "paypal",
      transactionRef: capture.transactionId,
      status: "pending",
      serviceId: "main_subscription",
      metadata: JSON.stringify({
        paypalOrderId,
        payerEmail: capture.payerEmail,
        amountUSD: capture.amountUSD,
        amountUsdNumeric: amountUSD,
        fxUsdToKes: 130,
        chargedCurrency: "USD",
        recordedCurrency: "KES",
      }),
    });
  }

  // ── 3. Provider verification ─────────────────────────────────────────────
  const kesAmount = Number(payment.amount ?? 0);
  if (!kesAmount || kesAmount <= 0) {
    console.error(`${logTag}[Security] Refusing capture — payment ${payment.id} has invalid amount=${payment.amount}. Cannot verify against PayPal capture.`);
    return {
      status: 402,
      body: { message: "Payment amount could not be verified. Please contact support.", code: "PAYPAL_AMOUNT_MISSING" },
    };
  }
  const { verifyPayPalPayment } = await import("../services/verifyPayment");
  const paypalVerify = await verifyPayPalPayment({
    paymentId: payment.id,
    paypalOrderId,
    captureId: capture.transactionId,
    expectedAmountKes: kesAmount,
    ip: clientIp,
  });

  if (!paypalVerify.verified && paypalVerify.status !== "api_unavailable") {
    console.error(
      `${logTag}[Security] Verification BLOCKED paymentId=${payment.id} orderId=${paypalOrderId} status=${paypalVerify.status} note="${paypalVerify.note}"`
    );
    return {
      status: 402,
      body: { message: `Payment verification failed: ${paypalVerify.note}`, verificationStatus: paypalVerify.status },
    };
  }

  if (paypalVerify.status === "api_unavailable") {
    console.warn(`${logTag}[Verify] API unavailable for paymentId=${payment.id} — proceeding with upgrade (non-blocking)`);
  }

  // ── 4. Auto-unlock via centralized upgradeUserAccount ───────────────────
  const svcId = payment.serviceId || "main_subscription";
  const CANONICAL = new Set(["trial", "basic", "monthly", "yearly", "pro", "pro_referral"]);
  const sidLower = String(svcId).toLowerCase();
  const derivedPlan: "trial" | "basic" | "monthly" | "yearly" | "pro" | "pro_referral" =
    (payment.planId && CANONICAL.has(payment.planId)) ? payment.planId :
    (sidLower.startsWith("plan_") && CANONICAL.has(sidLower.replace("plan_", ""))) ? sidLower.replace("plan_", "") as any :
    (CANONICAL.has(sidLower) ? sidLower as any : "pro");
  if (derivedPlan === "pro" && !payment.planId && !sidLower.startsWith("plan_")) {
    console.warn(`${logTag} Could not derive plan from payment ${payment.id} (serviceId="${svcId}", planId="${payment.planId}") — defaulting to yearly pro. Audit this — user may have overpaid or underpaid.`);
  }
  const upgrade = await upgradeUserAccount({
    userId,
    email: capture.payerEmail || (payment as any).email || undefined,
    planType: derivedPlan,
    transactionId: capture.transactionId,
    paymentId: payment.id,
    serviceId: svcId,
    method: "paypal",
    paymentSource: "web",
    amountKes: kesAmount,
    extraMeta: { paypalOrderId, payerEmail: capture.payerEmail, amountUSD: capture.amountUSD, verificationStatus: paypalVerify.status, derivedPlan, source },
  });

  if (upgrade.alreadyProcessed) {
    console.warn(`${logTag} Duplicate capture ignored — txn ${capture.transactionId} already processed.`);
  }

  console.info(
    `[Payment][COMPLETE] PayPal | txn=${capture.transactionId} | paymentId=${payment.id} | userId=${userId} | email=${capture.payerEmail || (payment as any).email || "unknown"} | USD=${capture.amountUSD} | plan=${upgrade.planActivated} | verified=${paypalVerify.status} | success=${upgrade.success} | source=${source}`
  );

  if (upgrade.success) {
    import("../services/activityLogger").then(({ logActivity }) => {
      logActivity({
        event: "payment_success",
        userId,
        email: capture.payerEmail || (payment as any).email || undefined,
        meta: { method: "paypal", transactionId: capture.transactionId, amountUSD: capture.amountUSD, paymentId: payment.id, plan: upgrade.planActivated, source },
        ip: clientIp,
      });
    }).catch((err) => reportRejection(err, 'services/paypalCapture'));

    import("../websocket").then(({ notifyUserPaymentUpdate }) => {
      notifyUserPaymentUpdate(userId, { type: "payment_update", paymentId: payment.id, status: "completed" });
    }).catch((err) => reportRejection(err, 'services/paypalCapture'));

    console.log('CALLING PAYMENT SYNC NOW');
    await syncPaymentToSupabase({
      user_id:       userId,
      phone:         null,
      amount:        kesAmount,
      mpesa_code:    capture.transactionId || null,
      status:        "completed",
      plan_id:       (payment as any).planId || null,
      base_amount:   (payment as any).baseAmount ?? null,
      currency:      "KES",
      discount_data: (payment as any).discountType
        ? { discountType: (payment as any).discountType, discountValue: ((payment as any).baseAmount ?? kesAmount) - kesAmount }
        : null,
    });
    await upgradeUserToPro(userId);
    const ppCaptureExpiry = planExpiry(derivedPlan);
    syncSubscriptionToSupabase({
      user_id: userId,
      plan_id: derivedPlan,
      provider: "paypal",
      status: "active",
      auto_renew: false,
      expires_at: ppCaptureExpiry,
    }).catch((err) => reportRejection(err, 'services/paypalCapture'));
    redeemAppliedPromo(payment.metadata).catch((err) => reportRejection(err, 'services/paypalCapture'));

    (async () => {
      try {
        const capUser = await storage.getUserById(userId).catch(() => null);
        const phone = capUser?.phone?.trim();
        if (!phone) return;
        const { sendWhatsAppPaymentConfirmation } = await import("../sms");
        const { planLabel } = await import("../utils/plans");
        await sendWhatsAppPaymentConfirmation({
          phone,
          serviceLabel: planLabel(derivedPlan),
          amountKes:    kesAmount,
          receipt:      capture.transactionId,
          userId,
          serviceCode:  derivedPlan,
        });
      } catch (waErr: any) {
        console.warn(`${logTag} WhatsApp confirmation send failed for userId=${userId}: ${waErr?.message}`);
      }
    })();
  }

  // ── 5. Referral commission (authoritative DB check, never trusts client) ─
  if (payment.metadata) {
    try {
      const meta = typeof payment.metadata === "string" ? JSON.parse(payment.metadata) : payment.metadata;
      const clientRefCode: string | undefined = meta?.refCode;
      if (clientRefCode && userId) {
        const normCode = String(clientRefCode).trim().toUpperCase();
        const { rows: [payerRow] } = await pool.query<{ referred_by: string | null; referral_code: string | null }>(
          `SELECT referred_by, referral_code FROM users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        const authoritativeCode = String(payerRow?.referred_by ?? "").trim().toUpperCase();
        const payerOwnCode = String(payerRow?.referral_code ?? "").trim().toUpperCase();
        if (!authoritativeCode) {
          console.log(`${logTag}[Referral] Payer ${userId} has no referred_by — commission skipped (client sent "${normCode}")`);
        } else if (normCode === payerOwnCode) {
          console.warn(`${logTag}[Referral][Security] Self-referral blocked for user=${userId} — client sent their own code`);
        } else if (normCode !== authoritativeCode) {
          console.warn(`${logTag}[Referral][Security] refCode mismatch for user=${userId} — client="${normCode}" authoritative="${authoritativeCode}" — using authoritative`);
        }
        const effectiveCode = authoritativeCode;
        if (effectiveCode && effectiveCode !== payerOwnCode) {
          const { rows: [refUser] } = await pool.query<{ id: string }>(
            `SELECT id FROM users WHERE UPPER(referral_code) = $1 LIMIT 1`,
            [effectiveCode],
          );
          if (!refUser) {
            console.warn(`${logTag}[Referral] refCode "${effectiveCode}" doesn't match any user — commission skipped`);
          } else if (refUser.id === userId) {
            console.warn(`${logTag}[Referral][Security] Self-referral (referrer.id === payer.id) blocked for user=${userId}`);
          } else {
            const commission = Math.round(payment.amount * 0.10);
            storage.createReferral({
              refCode: effectiveCode,
              referredPhone: capture.payerEmail || "",
              paymentAmount: payment.amount,
              commission,
              status: "pending",
            }).catch((err) => reportRejection(err, 'services/paypalCapture'));
          }
        }
      }
    } catch (_e) { /* non-fatal */ }
  }

  return {
    status: 200,
    body: {
      success: true,
      transactionId: capture.transactionId,
      payerEmail: capture.payerEmail,
      amountUSD: capture.amountUSD,
      planActivated: upgrade.planActivated,
      expiresAt: upgrade.expiresAt,
      status: capture.status,
    },
  };
}
