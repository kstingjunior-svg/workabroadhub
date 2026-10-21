-- 0053 — correction to the 0052 backfill (2026-10-21). Idempotent, labels only.
-- Guest payments (user_id NULL) were ranked after their Paybill (C2B) echo, so
-- the real delivered guest payment was labelled 'duplicate' and the echo kept
-- as 'unmatched'. Swap them. Also label echoes whose account reference is the
-- 12-char truncated payment id of an already-confirmed payment.
BEGIN;
WITH pairs AS (
  SELECT g.id gid, o.id oid
    FROM payments g JOIN payments o ON o.receipt_norm = g.receipt_norm AND o.id <> g.id
   WHERE g.reconciliation_status = 'duplicate' AND g.user_id IS NULL AND g.status IN ('success','completed')
     AND o.user_id = 'unknown' AND o.reconciliation_status = 'unmatched'
), o_fix AS (
  UPDATE payments p SET reconciliation_status = 'duplicate', unmatched_reason = 'Paybill echo of guest payment ' || pairs.gid,
         reconciled_at = now(), reconciled_by = 'migration-0052-fix'
    FROM pairs WHERE p.id = pairs.oid RETURNING p.id
)
UPDATE payments p SET reconciliation_status = 'matched', unmatched_reason = NULL, reconciled_at = now(), reconciled_by = 'migration-0052-fix'
  FROM pairs WHERE p.id = pairs.gid AND (SELECT count(*) FROM o_fix) >= 0;

WITH e AS (
  SELECT o.id oid, p.id pid FROM payments o
    JOIN payments p ON p.id::text LIKE (fin_meta(o.metadata)->>'billRefNumber') || '%' AND p.id <> o.id
   WHERE o.reconciliation_status = 'unmatched' AND (fin_meta(o.metadata)->>'billRefNumber') ~ '^[0-9a-f]{8}-[0-9a-f]{3}$'
     AND p.status IN ('success','completed') AND p.amount = o.amount
)
UPDATE payments p SET reconciliation_status = 'duplicate', unmatched_reason = 'Paybill echo of payment ' || e.pid || ' (account ref = payment id)',
       reconciled_at = now(), reconciled_by = 'migration-0052-fix'
  FROM e WHERE p.id = e.oid;

INSERT INTO finance_audit_log (entity, entity_id, action, note)
SELECT 'payment', 'backfill-0052-fix', 'reconciliation_fix',
       'Guest payments (null customer id) were ranked after their Paybill echo; swapped. Echoes whose account ref is the 12-char payment id labelled duplicate.'
 WHERE NOT EXISTS (SELECT 1 FROM finance_audit_log WHERE entity_id = 'backfill-0052-fix');
COMMIT;
