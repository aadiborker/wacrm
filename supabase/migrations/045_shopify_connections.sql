-- ============================================================
-- 045_shopify_connections.sql — Shopify store ↔ ReplyFlow account
--
-- POC: one installed shop domain maps to exactly one account so
-- inbound Shopify webhooks (orders/create) can resolve tenancy and
-- send WhatsApp via that account's whatsapp_config + templates.
--
-- access_token is AES-256-GCM-encrypted (same ENCRYPTION_KEY as
-- whatsapp_config.access_token / webhook_endpoints.secret).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS shopify_connections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  shop_domain              text NOT NULL, -- lowercase *.myshopify.com
  access_token             text NOT NULL, -- AES-256-GCM ciphertext
  scope                    text,
  order_template_name      text,          -- Meta template name for orders/create
  order_template_language  text NOT NULL DEFAULT 'en',
  webhook_id               text,          -- Shopify REST webhook id (if registered)
  installed_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopify_connections_shop_domain_unique UNIQUE (shop_domain),
  CONSTRAINT shopify_connections_account_id_unique UNIQUE (account_id)
);

CREATE INDEX IF NOT EXISTS shopify_connections_account_id_idx
  ON shopify_connections (account_id);

ALTER TABLE shopify_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shopify_connections_select ON shopify_connections;
CREATE POLICY shopify_connections_select ON shopify_connections FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS shopify_connections_insert ON shopify_connections;
CREATE POLICY shopify_connections_insert ON shopify_connections FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS shopify_connections_update ON shopify_connections;
CREATE POLICY shopify_connections_update ON shopify_connections FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS shopify_connections_delete ON shopify_connections;
CREATE POLICY shopify_connections_delete ON shopify_connections FOR DELETE
  USING (is_account_member(account_id, 'admin'));

COMMENT ON TABLE shopify_connections IS
  'Maps a Shopify shop_domain to a ReplyFlow account for order → WhatsApp POC.';
