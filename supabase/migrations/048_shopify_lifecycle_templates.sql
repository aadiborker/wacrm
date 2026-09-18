-- ============================================================
-- 048_shopify_lifecycle_templates.sql
-- Template names for shipped / delivery / cancelled / payment_failed.
-- Idempotent.
-- ============================================================

ALTER TABLE shopify_connections
  ADD COLUMN IF NOT EXISTS shipped_template_name text,
  ADD COLUMN IF NOT EXISTS out_for_delivery_template_name text,
  ADD COLUMN IF NOT EXISTS delivered_template_name text,
  ADD COLUMN IF NOT EXISTS cancelled_template_name text,
  ADD COLUMN IF NOT EXISTS payment_failed_template_name text;

COMMENT ON COLUMN shopify_connections.shipped_template_name IS
  'WhatsApp template for fulfillments/create (order_shipped)';
COMMENT ON COLUMN shopify_connections.out_for_delivery_template_name IS
  'WhatsApp template for fulfillment_events status out_for_delivery';
COMMENT ON COLUMN shopify_connections.delivered_template_name IS
  'WhatsApp template for fulfillment_events status delivered';
COMMENT ON COLUMN shopify_connections.cancelled_template_name IS
  'WhatsApp template for orders/cancelled';
COMMENT ON COLUMN shopify_connections.payment_failed_template_name IS
  'WhatsApp template for failed order_transactions';
