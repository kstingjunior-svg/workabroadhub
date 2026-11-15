# WorkAbroadHub — Registration, Email, Payment & Security Audit

**Date:** 15 November 2026.
**Method:** live production database queries, Render logs, the Resend API, public DNS, the live site (desktop and mobile viewport, signed out), and code review.

**Not done:** no accounts were created and no passwords entered on production. No real-money or sandbox payments were made, because sandbox credentials aren't available to me and I can't make payments. Tests C–F below are code-path and unit-test evidence, not live transactions. No secrets were read or printed.

## Summary

| Area | Status | Key evidence |
|---|---|---|
| Registration | ✅ Working | 15 Nov: 35 signups, 29 verified. Daily signups track traffic (Nov 1–2 campaign spike). The country picker accepts international numbers. |
| Email / OTP | ✅ Working, two deliverability notes | Domain verified, DKIM + SPF pass, DMARC present. 94.3% delivered in 14 days. Bounces are mostly mistyped or nonexistent Gmail addresses. |
| M-Pesa STK | ✅ Working | 228 attempts / 149 succeeded in 14 days. Failures are customer-side (cancel, timeout, wrong PIN, balance). 0 stuck pending. |
| M-Pesa security | ❌ **Critical, fixed** | Success callbacks could be forged by spoofing `X-Forwarded-For`. |
| PayPal | ❌ **0 successful payments in 75 days** | 97 orders from 85 users (33 outside Kenya). All stayed `CREATED`: the buyer never approved. One amount bug fixed. |
| Reconciliation | ✅ Strong | Ledger, unmatched queue, Paybill intents and echo de-duplication. 13 legacy unmatched payments remain. |
| International access | ⚠️ Improved | No country is blocked in normal mode. Foreign numbers now get a clear M-Pesa explanation. |

## 1. Registration

- **Volume:** signups 1–15 Nov were 244 → 35 per day. Verification rate is 84–90%. Sessions fell from 253/day (1 Nov) to about 40/day in the same pattern, so the drop is traffic, not a registration fault.
- **Phone numbers:** registration has a country-code picker that auto-detects country. Last 14 days: 1,138 with a Kenyan number, 135 international. The profile and phone modal accept 60+ dialling codes (`shared/intl-phone.ts`).
- **Duplicates and lockouts:** handled. The `auth_login_events` table records `no_account`, `wrong_password`, `locked` and `unverified`, and these are working. `no_account` runs at 13–58 per day: people try to sign in with an email that has no account, often a typo or a different address.

## 2. Email confirmation codes

**How codes work:** 6-digit code from `crypto.randomInt`, stored as a SHA-256 hash, 10-minute expiry, 5 wrong attempts per code, and resend is rate-limited. Earlier valid codes keep working after a resend, so a delayed email still works.

**Provider:** Resend (Amazon SES, us-east-1). Domain `workabroadhub.tech` is **verified**:

| Record | Status |
|---|---|
| DKIM `resend._domainkey` | Verified |
| SPF on `send.` subdomain (`include:amazonses.com`) | Verified |
| Bounce MX | Verified |
| Root SPF | `include:_spf.mail.hostinger.com` (for Hostinger mailboxes; doesn't affect Resend) |
| DMARC | `v=DMARC1; p=none` |

**Last 14 days:**

| Metric | Count / rate |
|---|---|
| Sent | 3,132 |
| Delivered | 2,953 (94.3%) |
| Bounced | 179 (159 temporary, 20 permanent) |
| Complaints | 0 |
| `delivery_delayed` events | 732 |

- **Bounces:** sampled bounces are to Gmail addresses that don't exist, mostly reminder emails to never-verified accounts.
- **Bounce handling:** permanent bounces automatically suppress the address through a signed Resend webhook (49 so far). The sign-in page tells the user and lets them correct their email.

**Recommendations:**
1. **DMARC reporting:** add `rua=mailto:dmarc@workabroadhub.tech`. After 2–4 weeks of clean reports, move to `p=quarantine`. This is a DNS change for you.
2. **Reminder emails:** stop reminder emails after the first temporary bounce for an address. Delays are mostly Gmail rate-limiting and recover on their own, but they slow codes down.
3. **Recovery path:** already in place. "Wrong email? Change it" on `/account/verify`, codes valid for 10 minutes across resends, and the sign-in code option.

## 3. M-Pesa (Daraja)

**What works:**
- STK push, callback, and the StkRecovery poller (every 30 s, queries Safaricom for anything pending).
- Pull API reconciler.
- C2B Paybill confirmations with payer resolution, Paybill intents, and echo de-duplication.
- An atomic `processed` flag and a receipt de-duplication trigger, so duplicate callbacks are safe.
- 14-day result: 149 of 228 attempts succeeded, 0 stuck pending, and 0 paid plans without access in the last 30 days. The one apparent exception has an active subscription linked differently.

**CRITICAL — fixed: forged success callbacks.**
- **The hole:** `safaricomIpGuard` trusted the *first* `X-Forwarded-For` value, which the caller sets. The callback then trusted `ResultCode: 0` from the request body. Anyone who knew a CheckoutRequestID could have activated a plan without paying.
- **Fix 1:** every "success" callback is now confirmed with Safaricom's **STK Query API** before acting (`server/lib/stk-verify.ts`). If Safaricom contradicts it, the payment is not activated and a high-severity security alert is raised. If Safaricom can't answer yet, the payment stays pending and StkRecovery activates it as soon as Safaricom confirms. This applies to the main, Write-From-Scratch, Scout and licence-renewal callbacks.
- **Fix 2:** the licence-renewal callback had **no IP guard at all**. Added.
- **Fix 3:** a spoof-proof client address (`trustedSourceIp`: the peer address the proxy appends, or Cloudflare's `CF-Connecting-IP` when the peer is a Cloudflare edge) now feeds the DDoS bans and rate limits. Previously an attacker could get a shared Safaricom mobile IP banned for everyone behind it.
- **Still to do (you):** the Safaricom guard records what the strict address check *would* do (`[safaricomIpGuard][shadow]` log lines). After a few days with no such lines on real callbacks, set `MPESA_IP_GUARD_STRICT=1` on Render. Until then, Paybill (C2B) confirmations, which have no query API, still rely on the old header check.

**Kenyans abroad:**
- STK push only reaches Kenyan Safaricom lines. A roaming Safaricom SIM can approve while roaming if the customer's line has roaming enabled; that's a Safaricom network condition, not something the app controls.
- International IPs are **not** blocked. The geo-filter only runs in "under attack" mode and only for CN/RU/KP/IR/SY/NG/GH.
- **Fixed:**
  - Customers with a foreign phone number used to get "Invalid phone number". They now get: *"M-Pesa prompts can only be sent to a Kenyan Safaricom number (07… or 01…). If you're abroad, enter a Kenyan M-Pesa line (your own on roaming, or a relative's), pay by Paybill 4153025 using your email as the account number, or choose PayPal."*
  - 9-digit `1XXXXXXXX` numbers (011x typed without the leading 0) are now normalised to `2541…`.

**Make sure these Render environment variables are not set in production:**
- `LOAD_TEST_MODE`: makes mock STK queries succeed.
- `MPESA_CALLBACK_IP_WHITELIST_DISABLED`: switches the IP guard off.

## 4. PayPal

- **Configuration (checked live):** `/api/paypal/config` returns `mode: live` with a client ID. The live PayPal SDK loads for that client ID. Funding eligibility: `paypal: eligible`, `card: eligible`.
- **Result:**
  - Last 75 days: **97 orders from 85 users, 0 completed.**
  - 33 of those users are outside Kenya (AE, QA, SA, US, ZA, CN and others).
  - Every order stayed `CREATED`: the buyer never approved in PayPal's window. The recovery poller checked each order 30 times and then gave up.
- **Defects fixed:**
  1. **Amount mismatch.** PayPal is always charged the flat full-portal fee (KES 4,500 ≈ $34.62, your 2026-08 rule), but the payment row recorded the item price (KES 1,000 for Monthly, KES 300 for a CV service). After capture, verification compares the two, so any non-Yearly PayPal purchase would have been **charged and then blocked as an "amount mismatch"**. The row now records the amount actually charged and the plan it buys (Yearly/pro), with the original price kept for audit.
  2. **Stale button.** The PayPal button kept the price state from its first render. If PayPal's script loaded before the price, every click failed with "Plan price not yet loaded". The button now uses live values.
- **Why buyers don't approve:** this can't be confirmed without your PayPal dashboard. The most likely causes, in order:
  1. **The PayPal business account can't receive yet.** It may have a limitation, an unconfirmed email, payments held, or USD not accepted.
  2. **Popups are blocked in in-app browsers.** Much of the traffic is Facebook/Instagram in-app browsers, which often block PayPal's popup.
  3. **Price shock.** The page shows "KES 4,500" while PayPal asks for USD 34.62.
- **What you need to do:**
  1. **Account health:** log in to the PayPal business account. Check Notifications and Resolution Center for limitations, confirm the email, and in Payment preferences allow payments in USD.
  2. **Test payment:** make one real $1–2 purchase yourself from a phone browser (not the Facebook app).
  3. **Webhook:** in the PayPal developer dashboard, subscribe the webhook to `PAYMENT.CAPTURE.COMPLETED` and set `PAYPAL_WEBHOOK_ID` on Render. The handler already verifies signatures (`server/utils/verifyPaypalWebhook.ts`).
- **Engineering follow-up (recommended):** add a full-page redirect checkout as a fallback to the popup (using the `approvalUrl` already returned by create-order). This avoids popup blocking in in-app browsers.

## 5. Reconciliation (your KES 4,500 rule)

A paid customer whose callback fails is recovered in four independent ways:
- **STK:** StkRecovery queries Safaricom, and the Pull API reconciler checks too.
- **Paybill:** the C2B confirmation is matched by payer email, phone hash or Paybill intent. If it can't be matched, it lands in Admin → Finance → Unmatched with the payer attached.
- **PayPal:** a recovery poller asks PayPal about each order.
- **Customer-typed receipts:** queued for verification. They are never trusted on their own, and no access is granted from the browser alone.

Every manual link is admin-only and written to `finance_audit_log`.

## 6. Security and configuration

- **Already in place:** CSP and HSTS headers, CSRF on state-changing routes, a rate limit of 2,000 requests per 15 minutes per session or IP, an OTP attempt cap, admin routes behind an `is_admin` check, and RLS on every public table (only "no policy" info-level advisories). Callback webhooks are exempt from CSRF but guarded.
- **Fixed today:** callback verification, the licence-renewal guard, and spoof-proof IP keys for bans and rate limits.
- **Recommended next:**
  1. Turn on `MPESA_IP_GUARD_STRICT=1` after the shadow period.
  2. Add C2B verification against the Pull API transaction list before activating Paybill-only payments.
  3. DMARC reporting.

## 7. Test status

| Test | Result |
|---|---|
| A/B registration (Kenya / abroad) | Covered by production data (~85% verify). Signup form checked on mobile; the country picker works. No new accounts created. |
| C M-Pesa | 14-day production evidence. Unit tests for the spoof-proof IP guard. Callback confirmation code-reviewed. |
| D PayPal | Live configuration and SDK eligibility checked. No transaction possible from here; you need to run one live test. |
| E Failed payment | Production: cancelled, timeout and insufficient-balance attempts produce no access, and customers retried successfully. |
| F Delayed / duplicate | Duplicate receipts are de-duplicated (42 marked duplicate in 14 days). Echo payments are de-duplicated. Delayed callbacks are covered by StkRecovery. |

The suite now has 122 automated tests. Type check and build are clean.
