# WorkAbroadHub — PayPal & M-Pesa Payment System Audit (part 2)

**Date:** 15 November 2026. This builds on the morning audit (`2026-11-15-registration-email-payments-audit.md`).

**Method:** code trace of every payment path, live production database queries, Render logs, and automated tests.

**Not done:** no live or sandbox transactions were made, because sandbox credentials aren't available to me and I can't make payments. Secrets were not read or printed.

## A. Original system status

| Area | Before the audit |
|---|---|
| M-Pesa STK, callbacks, recovery, Paybill | ✅ Working. 149 of 228 attempts succeeded in 14 days, 0 stuck. The forged-callback hole was fixed this morning (STK Query confirmation). |
| PayPal authentication, order creation | ✅ Working. Live mode. The amount is set on the server (flat KES 4,500 ≈ USD 34.62). |
| PayPal approval | ⚠️ Buyers do approve. At least 4 reached capture and **all 4 were declined by the card issuer** (`INSTRUMENT_DECLINED`). Most other orders were abandoned at PayPal. |
| PayPal decline handling | ❌ Broken. The SDK puts PayPal's error inside a JSON string, so the decline code was never read. Buyers got a generic error instead of PayPal's "choose another card". |
| PayPal webhook | ❌ **Critical.** Granted a year of Pro on `CHECKOUT.ORDER.APPROVED`, before any money moved, with no amount check. |
| PayPal full-page checkout | ❌ Broken. No `return_url` was sent, so CV-service, Scout and Write-From-Scratch PayPal payments dead-ended after approval. Fixed this afternoon (commit 6a51079e, live). |
| Subscription engine | ✅ Mostly sound: one shared writer (`activateUserPlan`), replay-safe per payment, renewals add to remaining time. One race condition, described below. |
| Confirmation emails | ❌ Inconsistent. The main M-Pesa callback and all PayPal paths sent no email. Other paths sent a "Pro, 365 days" email even for Monthly, with no amount, method or plan. |
| Admin finance dashboard | ⚠️ Complete for M-Pesa. No per-gateway or USD view. |

## B. Problems identified

1. **Critical — webhook granted access without payment.** Production evidence:
   - 2 Nov (payment `aaa5c76c…`, order `5W302302SJ640512A`) and 12 Nov (payment `9cece922…`, order `5UE539252X816563C`).
   - PayPal sent `CHECKOUT.ORDER.APPROVED`, and the webhook activated a year of Pro.
   - Seconds later the capture failed with `INSTRUMENT_DECLINED`.
   - Both accounts still have active Pro until Nov 2027 with **no money received**.
2. **High — declines misreported.** `INSTRUMENT_DECLINED` returned HTTP 500 and the row was marked `paypal_capture_error`. PayPal's recovery link (pick another card on the same order) was never offered.
3. **High — PayPal holds would be lost.** If PayPal holds a captured payment (`PENDING`), for example while the business account needs to accept USD manually, the payment was blocked as a "mismatch". The poller gave up after 6 hours, so the customer would be charged with no access.
4. **Medium — race between paths.** The browser, the webhook and the poller can capture the same order at the same moment. The loser got `ORDER_ALREADY_CAPTURED` and marked a paid row `failed`.
5. **Medium — no currency check** on PayPal captures.
6. **Medium — refunds, reversals and denials ignored.** These PayPal events were dropped silently.
7. **Medium — renewal race.** `activateUserPlan` read the current expiry *before* taking its per-user lock. If two different payments arrived together for a user with no active plan, the second replaced the first instead of adding to it.
8. **Low — wrong expiry date shown.** In-app notifications showed now + duration, not the real extended expiry, for customers renewing early.
9. **Low — emails** (see A). The template also showed a placeholder WhatsApp number, `+254 700 000 000`.
10. **Low — admin dashboard** had no per-gateway split and no USD figures.

## C. Repairs completed

- **Webhook** (`server/routes.ts`, `/api/payments/paypal/webhook`):
  - Signature verification is unchanged.
  - Approved and capture-completed events now run the same code path as the browser and the poller (`completePayPalCapture`). That path reads the order from PayPal, captures it only if approved, verifies amount and currency, and activates once.
  - `REFUNDED`, `REVERSED`, `DENIED` and `DECLINED` events update the payment row and raise an admin security alert. Access is **not** removed automatically; you decide.
- **Declines** (`server/services/paypalCapture.ts`):
  - `paypalErrorInfo()` parses the SDK's JSON message, so a decline returns `PAYPAL_DECLINED` with PayPal's `retryUrl`.
  - The payment page now reopens PayPal so the buyer can choose another card or their balance: `actions.restart()` in the popup, a redirect on the full-page flow.
- **Duplicate captures:**
  - `ORDER_ALREADY_CAPTURED` is treated as success.
  - Completions for the same order are serialised in-process.
- **Currency:** verification rejects any capture that isn't in USD (`server/services/verifyPayment.ts`).
- **Pending captures:**
  - The row is set to `processing` and the buyer is told not to pay again (HTTP 202, `PAYPAL_CAPTURE_PENDING`).
  - The poller keeps checking for up to 30 days.
  - The `CAPTURE.COMPLETED` webhook activates it when PayPal releases the money.
- **Subscriptions:**
  - `activateUserPlan` takes the per-user lock before reading the current expiry.
  - `upgradeUserAccount` reports the real extended expiry.
- **Receipt emails** (`server/lib/payment-receipt.ts`):
  - One receipt per new activation, sent from `activateUserPlan`, so it covers every gateway and every recovery path.
  - Contents: name, plan, amount and currency (USD plus KES equivalent for PayPal), method, reference, activation date, expiry date and dashboard link.
  - A replayed payment never emails twice.
  - An email failure never affects the subscription.
  - The five old "Pro 365 days" sends were retired, and the placeholder WhatsApp number was removed.
- **Admin dashboard:** Finance → Overview now has a "By payment gateway" table: successful, KES, USD, pending, failed and refunded counts. Currencies are labelled and never added together.

## D. Database changes

None. No migrations, no schema changes, no RLS changes. Only existing columns are used (`status`, `fail_reason`, `checkout_request_id`).

## E. PayPal verification

| Test | Result |
|---|---|
| Authentication / live mode | ✅ Live config and SDK eligibility checked this morning. Live orders are created (production logs). |
| Webhook signature | ✅ `PAYPAL_WEBHOOK_ID` is set. Production logs show `API verification: SUCCESS`. |
| Decline parsing | ✅ Unit test using the exact production error payload. |
| Return / cancel URLs, open-redirect protection | ✅ Unit tests (4). |
| Receipt content | ✅ Unit tests (3). |
| Successful live payment | ❌ **Not tested — no PayPal payment has ever succeeded.** Needs one real payment from you. |
| Pending, refund and duplicate-webhook paths | Code-reviewed only. No sandbox available. |

## F. M-Pesa verification

| Test | Result |
|---|---|
| STK success, failure and cancel | ✅ Production data: 149 of 228 succeeded in 14 days. Failures are customer-side. |
| Callback confirmation via STK Query | ✅ Live since 13:33 today. No errors since deploy, and no M-Pesa payment yet to observe. |
| Duplicate callback / replay | ✅ Atomic `processed` flag plus `activateUserPlan` per-payment idempotency. 0 duplicate completed receipts in the DB. |
| International numbers | ✅ Clear message for foreign numbers. Kenyan numbers work from abroad. |

## G. Subscription verification (production data, last 90 days)

- **Paid plan payments:** 508. All of these customers have access; 0 paid customers are without access.
- **Payments without their own subscription row:** 2. Both customers already had access through another active row.
- **Duplicate active subscriptions:** 0.
- **Active subscriptions past their end date:** 0.
- **Active subscriptions without a verified payment:** 5.
  - 2 are the declined PayPal buyers above.
  - 3 have no payment link (likely admin grants, `payment_id` null).
- Renewals extend from the current expiry. Durations are trial 1 day, monthly 30, yearly 365.

## H. Security

- **Fixed:** access on unpaid PayPal approvals, the currency check, and refund/denial visibility. Earlier today: forged M-Pesa callbacks and the spoof-proof IP check.
- **Remaining:**
  1. The two unpaid Pro accounts above need your decision.
  2. Paybill (C2B) confirmations still rely on the header IP check until `MPESA_IP_GUARD_STRICT=1`.
  3. The in-process capture lock assumes a single Render instance. With several instances, `ORDER_ALREADY_CAPTURED` handling is the fallback.

## I. Deployment requirements

- Push commit `52516f21`: `git push origin main`.
- **PayPal developer dashboard → webhook:** make sure it subscribes to `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED` and `PAYMENT.CAPTURE.REVERSED`, as well as `CHECKOUT.ORDER.APPROVED`.
- **Render:** confirm `LOAD_TEST_MODE` and `MPESA_CALLBACK_IP_WHITELIST_DISABLED` are unset. After the shadow period, set `MPESA_IP_GUARD_STRICT=1`.

## J. Outstanding issues

1. **The two unpaid Pro accounts** (users `3f12e15a…` and `05392194…`). Options:
   - leave them as goodwill;
   - message them to pay;
   - end the subscriptions.

   I haven't changed them.
2. **Card declines are the real PayPal blocker.** All 4 captures were declined by the buyer's bank. Many Kenyan cards block international online payments. The new retry flow lets buyers switch card or use their PayPal balance; you may also want to tell customers to enable online/international payments on their card.
3. **Placeholder WhatsApp number in AI-generated text.** `server/services/ai-processor.ts` tells the AI to give customers "+254 700 000 000" as the support number. Give me the real number and I'll fix it.
4. No sandbox, so the pending, refund and duplicate-webhook paths were not exercised end to end.

## K. Modified files (this part)

- `server/routes.ts`: webhook rewrite; receipt sends retired.
- `server/services/paypalCapture.ts`: error parsing, serialisation, already-captured handling, pending handling.
- `server/services/verifyPayment.ts`: currency check.
- `server/paypal-recovery.ts`: pending captures are never given up on early.
- `server/storage.ts`: lock before expiry read; receipt hook.
- `server/services/upgradeUserAccount.ts`: real expiry.
- `server/lib/payment-receipt.ts`: **new**.
- `server/stk-recovery.ts`, `server/mpesa-reconciler.ts`, `server/email.ts`: old email sends retired; placeholder number removed.
- `server/routes/finance-admin.ts`, `client/src/pages/admin/finance.tsx`: by-gateway table.
- `client/src/pages/payment.tsx`: decline retry; pending and already-paid messages.
- `client/public/sw.js`: cache v19.
- `tests/api/paypal-capture-audit.test.ts`: **new**, 6 tests.

Earlier today: `server/paypal.ts`, `server/routes/scout-jobs.ts`, `server/routes/write-from-scratch.ts`, `tests/api/paypal-return-url.test.ts`.

**Totals:** 132 automated tests pass; server type-check, client build and server bundle are clean.
