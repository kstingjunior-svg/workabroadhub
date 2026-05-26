-- service_orders — tracks the unified upload → pay → AI → download flow per service.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS service_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  service_slug      VARCHAR(60) NOT NULL,
  service_name      VARCHAR(120) NOT NULL,
  status            VARCHAR(30) NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','processing','completed','failed','cancelled')),
  -- inputs
  cv_text           TEXT,
  job_description   TEXT,
  target_country    VARCHAR(60),
  extra_input       TEXT,
  -- payment linkage (filled in once the M-Pesa/PayPal payment is created)
  payment_id        VARCHAR,
  -- outputs
  output_text       TEXT,
  error_message     TEXT,
  -- timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_orders_user_id    ON service_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_status     ON service_orders (status);
CREATE INDEX IF NOT EXISTS idx_service_orders_created_at ON service_orders (created_at DESC);
