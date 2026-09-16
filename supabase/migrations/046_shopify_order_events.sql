-- ============================================================
-- 046_shopify_order_events.sql — Deduplicate Shopify → WhatsApp
--
-- Shopify may deliver orders/create more than once (retries or
-- multiple app webhook subscriptions). Claim each order once
-- before sending WhatsApp.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS shopify_order_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  shop_domain       text NOT NULL,
  shopify_order_id  text NOT NULL,
  topic             text NOT NULL DEFAULT 'orders/create',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopify_order_events_unique UNIQUE (shop_domain, shopify_order_id, topic)
);

CREATE INDEX IF NOT EXISTS shopify_order_events_account_id_idx
  ON shopify_order_events (account_id);

ALTER TABLE shopify_order_events ENABLE ROW LEVEL SECURITY;

-- Service-role webhook path bypasses RLS; members can read for debugging.
DROP POLICY IF EXISTS shopify_order_events_select ON shopify_order_events;
CREATE POLICY shopify_order_events_select ON shopify_order_events FOR SELECT
  USING (is_account_member(account_id));

COMMENT ON TABLE shopify_order_events IS
  'Idempotency log: one WhatsApp send per Shopify order/topic.';
