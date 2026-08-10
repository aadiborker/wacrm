-- Backfill submission time for templates synced from Meta (no ReplyFlow submit).

UPDATE message_templates
SET last_submitted_at = created_at
WHERE last_submitted_at IS NULL
  AND created_at IS NOT NULL;
