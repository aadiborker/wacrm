-- ============================================================
-- 041_template_approved_at.sql
--
-- Stamp when Meta approved a template (webhook or sync). Paired with
-- last_submitted_at so admins can see approval turnaround in Settings.
-- ============================================================

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
