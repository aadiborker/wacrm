-- ============================================================
-- 044_broadcast_recipient_tapped_button
--
-- When a customer taps a TEMPLATE QUICK_REPLY, the webhook already
-- marks the matching broadcast_recipients row as `replied`. This
-- column records WHICH button they tapped so the broadcast detail
-- page can count interactions per button.
--
-- PHONE_NUMBER ("Call us") and URL buttons never send a webhook —
-- only QUICK_REPLY taps can be stored here.
--
-- Idempotent.
-- ============================================================

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS tapped_button TEXT;

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_tapped_button
  ON broadcast_recipients (broadcast_id, tapped_button)
  WHERE tapped_button IS NOT NULL;
