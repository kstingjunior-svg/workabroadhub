# Service-level payment tracking — implementation report (21 Oct 2026)

## 1. Problems found in the audit
| # | Problem | Impact |
|---|---|---|
| 1 | `/api/mpesa/verify-receipt` and `/api/payment-success` activated **any plan the customer chose** for any typed "receipt" — Safaricom never consulted | 216 self-activations Jun–Sep; 8 used phone numbers/timestamps as "receipts" |
| 2 | Same M-Pesa receipt recorded on 2+ payment rows (STK row + Paybill echo, repeat callbacks) | 277 rows / **KES 86,198** would be double-counted |
| 3 | Admin manual grants stored as `status=success` with a price | 45 rows / KES 83,881 counted as revenue with no money |
| 4 | `payments.delivery_status = delivered` set at payment time | Failed / awaiting-review orders showed "delivered" |
| 5 | Direct Paybill (C2B) payments not linked: account ref "CONSULT", email, or our 12-char truncated payment id | 3 subscribers without access (fixed 21 Oct); unmatched queue |
| 6 | Paybill matcher (my earlier fix) activated a plan from the amount alone; old 5-min fallback matched by amount only | Risk of wrong service / wrong customer |
| 7 | Write-from-scratch payments live in their own table | Missing from any revenue view |
| 8 | No refund workflow, no admin payment alerts, no reconciliation audit trail | — |

## 2. Files & migrations
**New:** `server/lib/finance-ledger.ts` (rules), `server/lib/receipt-claims.ts`, `server/lib/finance-notify.ts` (alerts + sweep), `server/routes/finance-admin.ts` (API), `client/src/pages/admin/finance.tsx` (dashboard), `migrations/0052_finance_ledger.sql`, `migrations/0053_finance_ledger_fix.sql`, `tests/api/finance-ledger.test.ts`, `docs/finance/manual-reconciliation-2026-10-21.csv`.
**Changed:** `server/routes.ts` (two receipt endpoints), `server/routes/mpesa-c2b.ts` (matching), `server/index.ts` (route + sweep registration), `client/src/pages/payment.tsx` (pending-review response, no "CONSULT"), `client/src/App.tsx`, `client/src/components/admin-layout.tsx`.

Both migrations are **already applied** to Supabase (additive; no rows deleted, no amounts/receipts/dates changed).

## 3. Data model
- `payments` + `receipt_norm`, `reconciliation_status` (matched · manually_matched · unmatched · unverified_receipt · duplicate · admin_grant · test · not_confirmed), `unmatched_reason`, `reconciled_at/by`, `delivered_at`, `delivery_evidence`.
- Trigger `fin_payments_bi` labels every insert/update and resolves duplicate receipts **without ever blocking a write** (Paybill echo → duplicate; if the echo arrived first, it is superseded when the STK callback lands). Partial unique index guarantees one live ledger row per receipt.
- `refund_requests` + amount (numeric), refund_ref (unique), approver, timestamps, evidence, status CHECK.
- `finance_admin_notifications`, `finance_audit_log` (RLS on, no anon/authenticated access).
- View `finance_ledger` = payments ∪ write-from-scratch orders, joined to customer, service order, subscription and refunds.
- **Purpose** = recorded plan/service/order reference. **Never the amount.** Order reference `WA-XXXXXXXX` = first 8 of the payment id (same code shown as the Paybill account number).

## 4. Dashboard & alerts — `/admin/finance`
Overview (gross / refunds / net, today·week·month, awaiting delivery, unmatched, unverified, refunds open, duplicates & grants excluded, revenue by service & plan built from the live catalogue) · Payment register (search customer/receipt/WA-ref/service; filters for service, payment, reconciliation, delivery, refund, dates; CSV export, audited) · Unmatched queue (match to the customer's own unpaid attempt, order, or an explicitly confirmed plan — evidence required) · Refunds · Alerts (unread count; open payment from alert).
Alerts: a 60-second sweep creates one alert per verified payment (de-duplicated), covering STK, Paybill, reconcilers and write-from-scratch. Email copy only if `FINANCE_ALERT_EMAIL` is set (not set → not claimed).

## 5. Delivery & refunds
Delivery is derived from the fulfilment record: service order status, write-from-scratch generation, subscription row, tool use, or admin-recorded delivery with evidence. Refund lifecycle requested → approved → processing → completed/failed (or rejected). "Completed" requires the M-Pesa reversal/B2C reference; totals can't exceed what was paid; one open request per payment; customers can request refunds only on their own payments (`POST /api/refunds/request`) and see their history at `GET /api/me/payments`. No automatic M-Pesa refund is attempted (no B2C integration configured) — money is returned manually and recorded with proof. Access is **not** auto-revoked on refund; admin decides per policy.

## 6. Configuration
Optional `FINANCE_ALERT_EMAIL`. No new secrets. Admin access = `users.is_admin` or role admin/ADMIN/SUPER_ADMIN.

## 7. Tests
- `tests/api/finance-ledger.test.ts` — 24 passed (acceptance items 1–9, 12, 14, 15 at rule level).
- Database rules, run on production inside a rolled-back transaction: STK + Paybill echo → 1 live row; echo-first race → STK row wins; unmatched queue; failed ≠ revenue; refund bad status / negative / duplicate reference rejected; refund visible on the right payment. Zero test rows left behind.
- Revenue-by-service query run against live data (results match the payments table).
- Type-check 0 errors; production build OK; server bundle OK.
- Full suite: 476 passed / 19 failed — the same 19 pre-existing failures (persona guards, Nanjila memory, sync engine, screening tools, flaky timing test); none touch payments.
- Not tested end-to-end: a real M-Pesa payment through the new code (needs deploy), the dashboard against the live API (needs deploy + admin login).

## 8. Historical transactions needing manual reconciliation
See `manual-reconciliation-2026-10-21.csv` (57 rows):
- **42 unverified customer-typed receipts** (KES 16,564). Our Paybill confirmation feed only started **27 Sep 2026**, so 34 of these simply predate it and must be checked against the M-Pesa org statement — they are not evidence of fraud. 8 are certainly not receipts (all expired KES 99 trials → write off). **Priority:** two Yearly plans still active on unconfirmed receipts (jkanyingi572 UH6RO25V4C, roykarongo51 UG4KYADJX0).
- **15 unmatched Paybill payments** (KES 1,873): 7 customers emailed on 21 Oct, Abdirashid's KES 760 overpayment, Rotich's stray KES 100, 2 test payments, 3 with no payer data.

Current ledger (confirmed rows): matched 2,904 (KES 706,703) · manually matched 2 (KES 5,500) · unmatched 15 (KES 1,873) · unverified 42 (KES 16,564, excluded) · duplicate 277 (KES 86,198, excluded) · admin grant 45 (excluded). Plus 44 write-from-scratch orders (KES 13,200).

## 9. Safaricom limitations
- C2B confirmations send the phone number SHA-256-hashed and truncate the account reference (~12–20 chars); matching uses the payment code, email, or hashed phone — never amount alone.
- No C2B data exists before 27 Sep 2026.
- STK "status query" recoveries (`RECOVERED-…`) are Safaricom-verified but carry no receipt number.
- Refunds: no B2C/reversal API is integrated, so refunds are recorded manually with the transaction reference.

## 10. Deployment
1. Migrations 0052/0053 are already live; they're idempotent and safe to re-run.
2. `git push origin main` → Render deploys the code.
3. After deploy: open `/admin/finance`, check the Overview totals match this report, then clear the unmatched queue starting with the two active Yearly plans.
