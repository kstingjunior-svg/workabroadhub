-- 0052 — Service-level payment tracking, reconciliation & refunds (2026-10)
-- ADDITIVE ONLY: no rows deleted, no amounts/receipts/dates altered.
-- Every historical correction is a label (reconciliation_status) + audit row.

-- ── 1. Receipt normalisation ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fin_norm_receipt(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN s ~ '^[A-Z][A-Z0-9]{9}$' THEN s END
  FROM (SELECT regexp_replace(regexp_replace(upper(coalesce(raw,'')), '[^A-Z0-9]', '', 'g'), 'CONFIRMED$', '') AS s) t
$$;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_norm text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reconciliation_status text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS unmatched_reason text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reconciled_at timestamp;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reconciled_by varchar;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS delivered_at timestamp;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS delivery_evidence text;

-- JSON source helper (some legacy metadata is not valid JSON)
CREATE OR REPLACE FUNCTION fin_meta(m text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN m IS NOT NULL AND pg_input_is_valid(m, 'jsonb') THEN m::jsonb ELSE '{}'::jsonb END
$$;

UPDATE payments SET receipt_norm = coalesce(
  fin_norm_receipt(mpesa_receipt_number), fin_norm_receipt(mpesa_code),
  CASE WHEN fin_meta(metadata)->>'source' IN ('manual_receipt_verification','payment_success_webhook')
       THEN fin_norm_receipt(transaction_ref) END)
WHERE receipt_norm IS NULL;

-- ── 2. Backfill reconciliation status ─────────────────────────────────────
-- 2a. everything not confirmed
UPDATE payments SET reconciliation_status = 'not_confirmed'
 WHERE reconciliation_status IS NULL AND status NOT IN ('success','completed');
-- 2b. admin grants (no money moved)
UPDATE payments SET reconciliation_status = 'admin_grant'
 WHERE reconciliation_status IS NULL AND (fin_meta(metadata)->>'adminGranted') = 'true';
-- 2c. duplicates: per receipt keep ONE canonical row. Preference:
--     linked Safaricom-sent row > linked self-claimed row > unlinked (C2B orphan)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY receipt_norm ORDER BY
           (coalesce(user_id,'') = 'unknown')::int,   -- guests (NULL user) are real, linked payments
           (fin_meta(metadata)->>'source' IN ('manual_receipt_verification','payment_success_webhook'))::int,
           created_at) AS rn
    FROM payments
   WHERE receipt_norm IS NOT NULL AND status IN ('success','completed')
     AND coalesce(reconciliation_status,'') NOT IN ('admin_grant')
)
UPDATE payments p SET reconciliation_status = 'duplicate',
       unmatched_reason = 'Same M-Pesa receipt already recorded on another payment row'
  FROM ranked r WHERE p.id = r.id AND r.rn > 1 AND p.reconciliation_status IS NULL;
-- 2c-bis. Paybill copies of write-from-scratch payments (that flow keeps its own receipts)
UPDATE payments p SET reconciliation_status = 'duplicate',
       unmatched_reason = 'Recorded on write-from-scratch order ' || d.id
  FROM write_from_scratch_drafts d
 WHERE p.reconciliation_status IS NULL AND p.receipt_norm IS NOT NULL
   AND fin_norm_receipt(d.mpesa_receipt) = p.receipt_norm;
-- 2d. customer-typed receipts that Safaricom never sent us
UPDATE payments p SET reconciliation_status = 'unverified_receipt',
       unmatched_reason = CASE WHEN p.receipt_norm IS NULL THEN 'Customer-entered code is not a valid M-Pesa receipt'
                               ELSE 'Customer-entered receipt not found in any Safaricom confirmation' END
 WHERE p.reconciliation_status IS NULL
   AND fin_meta(p.metadata)->>'source' IN ('manual_receipt_verification','payment_success_webhook')
   AND (p.receipt_norm IS NULL OR NOT EXISTS (
         SELECT 1 FROM payments q WHERE q.id <> p.id AND q.receipt_norm = p.receipt_norm
            AND q.status IN ('success','completed')
            AND coalesce(fin_meta(q.metadata)->>'source','') NOT IN ('manual_receipt_verification','payment_success_webhook')));
-- 2e. unlinked Paybill money
UPDATE payments SET reconciliation_status = 'unmatched',
       unmatched_reason = coalesce(unmatched_reason, 'Paybill payment could not be linked to a customer order automatically')
 WHERE reconciliation_status IS NULL AND user_id = 'unknown';
-- 2f. everything else confirmed & linked
UPDATE payments SET reconciliation_status = 'matched' WHERE reconciliation_status IS NULL;

-- ── 3. Keep it correct for new rows (never blocks a write) ────────────────
CREATE OR REPLACE FUNCTION fin_payments_bi() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE other_id varchar; other_user varchar; src text;
BEGIN
  src := fin_meta(NEW.metadata)->>'source';
  NEW.receipt_norm := coalesce(fin_norm_receipt(NEW.mpesa_receipt_number), fin_norm_receipt(NEW.mpesa_code),
                               CASE WHEN src IN ('manual_receipt_verification','payment_success_webhook','receipt_claim')
                                    THEN fin_norm_receipt(NEW.transaction_ref) END);
  IF NEW.status NOT IN ('success','completed') THEN
    IF NEW.reconciliation_status IS NULL OR NEW.reconciliation_status = 'matched' THEN
      NEW.reconciliation_status := 'not_confirmed';
    END IF;
    RETURN NEW;
  END IF;
  -- confirmed row
  IF NEW.reconciliation_status IS NULL OR NEW.reconciliation_status = 'not_confirmed' THEN
    NEW.reconciliation_status := CASE
      WHEN (fin_meta(NEW.metadata)->>'adminGranted') = 'true' THEN 'admin_grant'
      WHEN NEW.user_id = 'unknown' THEN 'unmatched'
      ELSE 'matched' END;
    IF NEW.reconciliation_status = 'unmatched' AND NEW.unmatched_reason IS NULL THEN
      NEW.unmatched_reason := 'Paybill payment could not be linked to a customer order automatically';
    END IF;
  END IF;
  -- Paybill copy of a write-from-scratch payment
  IF NEW.user_id = 'unknown' AND NEW.receipt_norm IS NOT NULL AND EXISTS (
       SELECT 1 FROM write_from_scratch_drafts d WHERE fin_norm_receipt(d.mpesa_receipt) = NEW.receipt_norm) THEN
    NEW.reconciliation_status := 'duplicate';
    NEW.unmatched_reason := 'Recorded on a write-from-scratch order';
    RETURN NEW;
  END IF;
  -- duplicate receipt handling
  IF NEW.receipt_norm IS NOT NULL AND NEW.reconciliation_status IN ('matched','manually_matched','unmatched','unverified_receipt') THEN
    SELECT id, user_id INTO other_id, other_user FROM payments
     WHERE receipt_norm = NEW.receipt_norm AND id <> NEW.id
       AND reconciliation_status IN ('matched','manually_matched','unmatched','unverified_receipt')
     LIMIT 1;
    IF other_id IS NOT NULL THEN
      IF NEW.user_id = 'unknown' THEN
        NEW.reconciliation_status := 'duplicate';
        NEW.unmatched_reason := 'Same M-Pesa receipt already recorded on payment ' || other_id;
      ELSIF other_user = 'unknown' THEN
        UPDATE payments SET reconciliation_status = 'duplicate',
               unmatched_reason = 'Superseded by linked payment ' || NEW.id
         WHERE id = other_id;
      ELSE
        NEW.reconciliation_status := 'duplicate';
        NEW.needs_review := true;
        NEW.unmatched_reason := 'Receipt already credited to payment ' || other_id || ' — review for double credit';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fin_payments_bi ON payments;
CREATE TRIGGER trg_fin_payments_bi BEFORE INSERT OR UPDATE OF status, mpesa_receipt_number, mpesa_code, transaction_ref, user_id, metadata
  ON payments FOR EACH ROW EXECUTE FUNCTION fin_payments_bi();

-- One live ledger row per M-Pesa receipt (duplicates are labelled, not deleted)
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_receipt_live ON payments(receipt_norm)
  WHERE receipt_norm IS NOT NULL AND reconciliation_status IN ('matched','manually_matched','unmatched','unverified_receipt');
CREATE INDEX IF NOT EXISTS idx_payments_recon ON payments(reconciliation_status, created_at DESC);

-- ── 4. Refunds (existing empty table → full workflow) ─────────────────────
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS amount numeric(12,2);
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS currency varchar(3) DEFAULT 'KES';
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS order_ref text;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS requested_by varchar;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS approved_by varchar;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS approved_at timestamp;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS refund_ref text;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS refund_method text;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS evidence text;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS completed_at timestamp;
ALTER TABLE refund_requests ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE refund_requests ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE refund_requests ALTER COLUMN status SET DEFAULT 'requested';
DO $$ BEGIN
  ALTER TABLE refund_requests ADD CONSTRAINT refund_status_chk
    CHECK (status IN ('requested','approved','rejected','processing','completed','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE refund_requests ADD CONSTRAINT refund_amount_chk CHECK (amount IS NULL OR amount > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_ref ON refund_requests(refund_ref) WHERE refund_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refund_payment ON refund_requests(payment_id);

-- ── 5. Admin notifications & audit log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,                 -- payment | subscription | unmatched | refund_request | duplicate | review
  title text NOT NULL,
  body text NOT NULL,
  payment_id varchar, order_ref text, amount numeric(12,2),
  dedupe_key text UNIQUE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_notif_unread ON finance_admin_notifications(is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS finance_audit_log (
  id bigserial PRIMARY KEY,
  entity text NOT NULL,               -- payment | refund | order | wfs
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_id varchar,                   -- null = system
  before jsonb, after jsonb, note text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_audit_entity ON finance_audit_log(entity, entity_id, created_at DESC);

ALTER TABLE finance_admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_admin_notifications, finance_audit_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE finance_audit_log_id_seq FROM anon, authenticated;

-- Record the historical relabel in the audit trail (one row per label class).
INSERT INTO finance_audit_log (entity, entity_id, action, note, after)
SELECT 'payment', 'backfill-0052', 'reconciliation_backfill',
       'Initial reconciliation labels from migration 0052 (no amounts changed)',
       jsonb_object_agg(reconciliation_status, n)
  FROM (SELECT reconciliation_status, count(*) n FROM payments GROUP BY 1) t;

-- ── 6. Unified ledger view (payments + write-from-scratch drafts) ─────────
CREATE OR REPLACE VIEW finance_ledger AS
SELECT
  'payments'::text AS source,
  p.id::text AS payment_id,
  coalesce(nullif(fin_meta(p.metadata)->>'serviceOrderId',''), nullif(fin_meta(p.metadata)->>'orderId',''), p.id::text) AS order_id,
  p.user_id, coalesce(u.email, p.email) AS customer_email,
  nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), '') AS customer_name,
  p.amount::numeric(12,2) AS amount, coalesce(p.currency,'KES') AS currency,
  coalesce(p.method,'mpesa') AS method,
  p.status AS payment_status, p.reconciliation_status, p.unmatched_reason,
  p.receipt_norm AS receipt, p.checkout_request_id,
  p.plan_id, p.service_id, p.service_name,
  fin_meta(p.metadata)->>'source' AS meta_source,
  so.service_slug AS order_slug, so.status AS order_status, so.completed_at::timestamptz AS order_completed_at,
  us.status AS sub_status, us.start_date AS sub_start, us.end_date AS sub_end,
  coalesce(p.delivered_at, so.completed_at)::timestamptz AS delivered_at, p.delivery_status,
  (SELECT coalesce(sum(r.amount) FILTER (WHERE r.status = 'completed'),0) FROM refund_requests r WHERE r.payment_id = p.id::text) AS refunded_amount,
  (SELECT r.status FROM refund_requests r WHERE r.payment_id = p.id::text ORDER BY r.created_at DESC LIMIT 1) AS refund_status,
  p.created_at::timestamptz AS created_at
FROM payments p
LEFT JOIN users u ON u.id::text = p.user_id
LEFT JOIN service_orders so ON so.id::text = coalesce(nullif(fin_meta(p.metadata)->>'serviceOrderId',''), nullif(fin_meta(p.metadata)->>'orderId',''))
LEFT JOIN LATERAL (SELECT status, start_date, end_date FROM user_subscriptions s WHERE s.payment_id = p.id::text ORDER BY s.created_at DESC LIMIT 1) us ON true
UNION ALL
SELECT
  'wfs', d.id::text, d.id::text, d.user_id, u.email,
  nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''),
  coalesce(d.mpesa_amount,0)::numeric(12,2), 'KES', 'mpesa',
  CASE WHEN d.mpesa_receipt IS NOT NULL THEN 'success' ELSE coalesce(d.status,'pending') END,
  CASE WHEN d.mpesa_receipt IS NOT NULL THEN 'matched' ELSE 'not_confirmed' END,
  NULL, fin_norm_receipt(d.mpesa_receipt), d.mpesa_checkout_id,
  NULL, 'write_from_scratch', 'Write from scratch (' || coalesce(d.doc_type,'document') || ')',
  'wfs', 'write_from_scratch', d.status, d.generated_at,
  NULL, NULL, NULL,
  d.generated_at, CASE WHEN d.status = 'generated' THEN 'delivered' END,
  0::numeric, NULL, coalesce(d.paid_at, d.created_at)
FROM write_from_scratch_drafts d
LEFT JOIN users u ON u.id::text = d.user_id
WHERE coalesce(d.mpesa_amount,0) > 0;

REVOKE ALL ON finance_ledger FROM anon, authenticated;
