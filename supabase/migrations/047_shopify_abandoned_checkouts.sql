-- ============================================================
-- 047_shopify_abandoned_checkouts.sql
-- Schedule WhatsApp reminders for Shopify abandoned checkouts.
-- Default delay matches Shopify email default (10 hours).
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE shopify_connections
  ADD COLUMN IF NOT EXISTS abandoned_template_name text,
  ADD COLUMN IF NOT EXISTS abandoned_template_language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS abandoned_delay_hours integer NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shopify_connections_abandoned_delay_hours_check'
      AND conrelid = 'shopify_connections'::regclass
  ) THEN
    ALTER TABLE shopify_connections
      ADD CONSTRAINT shopify_connections_abandoned_delay_hours_check
      CHECK (abandoned_delay_hours >= 0 AND abandoned_delay_hours <= 168);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS shopify_abandoned_checkouts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  shop_domain          text NOT NULL,
  shopify_checkout_id  text NOT NULL,
  phone                text,
  customer_name        text,
  checkout_url         text,
  email                text,
  status               text NOT NULL DEFAULT 'pending',
  remind_at            timestamptz NOT NULL,
  sent_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopify_abandoned_checkouts_unique
    UNIQUE (shop_domain, shopify_checkout_id),
  CONSTRAINT shopify_abandoned_checkouts_status_check
    CHECK (status IN ('pending', 'sent', 'cancelled', 'skipped'))
);

CREATE INDEX IF NOT EXISTS shopify_abandoned_checkouts_due_idx
  ON shopify_abandoned_checkouts (status, remind_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS shopify_abandoned_checkouts_account_id_idx
  ON shopify_abandoned_checkouts (account_id);

ALTER TABLE shopify_abandoned_checkouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shopify_abandoned_checkouts_select ON shopify_abandoned_checkouts;
CREATE POLICY shopify_abandoned_checkouts_select ON shopify_abandoned_checkouts
  FOR SELECT USING (is_account_member(account_id));

COMMENT ON TABLE shopify_abandoned_checkouts IS
  'Pending/sent abandoned-checkout WhatsApp reminders for Shopify POC.';
