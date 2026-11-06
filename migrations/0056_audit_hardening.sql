-- 0056_audit_hardening.sql (2026-11-06 app audit)
-- Fixed search_path on SECURITY-relevant functions, FK indexes for VerifyX,
-- and removal of exact-duplicate indexes reported by the Supabase advisor.
ALTER FUNCTION public.fin_norm_receipt SET search_path = public, extensions;
ALTER FUNCTION public.fin_meta SET search_path = public, extensions;
ALTER FUNCTION public.fin_payments_bi SET search_path = public, extensions;
ALTER FUNCTION public.merge_duplicate_users SET search_path = public, extensions;
CREATE INDEX IF NOT EXISTS idx_vx_corrections_req ON verifyx_corrections (request_id);
CREATE INDEX IF NOT EXISTS idx_vx_rejected_req ON verifyx_rejected_findings (request_id);
CREATE INDEX IF NOT EXISTS idx_vx_review_req ON verifyx_review_cases (request_id);
DROP INDEX IF EXISTS public.idx_service_orders_created;   -- identical to idx_service_orders_created_at
DROP INDEX IF EXISTS public.idx_users_created;            -- identical to idx_users_created_at
DROP INDEX IF EXISTS public.idx_users_plan;               -- identical to users_plan_idx
