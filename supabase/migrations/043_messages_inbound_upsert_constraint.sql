-- ============================================================
-- 043_messages_inbound_upsert_constraint
--
-- Production inbound was rejected with Postgres 42P10:
--   there is no unique or exclusion constraint matching the ON
--   CONFLICT specification
--
-- The webhook upserts on (conversation_id, message_id). That needs a
-- UNIQUE CONSTRAINT PostgREST can use as the ON CONFLICT arbiter.
-- Migration 037_webhook_broadcast_reliability.sql added a unique
-- INDEX for this, but:
--   1. It shares the 037 prefix with 037_ai_knowledge_source_category
--      so it was easy to skip when applying files by number.
--   2. Some PostgREST versions only infer ON CONFLICT from a table
--      UNIQUE constraint, not a standalone unique index.
--
-- Also (re)creates bump_conversation_on_inbound from 037 so unread
-- and last-message preview update after a successful insert.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- Collapse pre-existing duplicates (keep the earliest row per key)
-- so the unique constraint can be created.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY conversation_id, message_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM messages
  WHERE message_id IS NOT NULL
)
DELETE FROM messages m
USING ranked r
WHERE m.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_conversation_id_message_id_key'
  ) THEN
    NULL;
  ELSIF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'idx_messages_conversation_message_id'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_conversation_id_message_id_key
      UNIQUE USING INDEX idx_messages_conversation_message_id;
  ELSE
    ALTER TABLE messages
      ADD CONSTRAINT messages_conversation_id_message_id_key
      UNIQUE (conversation_id, message_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_message_id
  ON messages (conversation_id, message_id);

CREATE OR REPLACE FUNCTION public.bump_conversation_on_inbound(
  p_conversation_id UUID,
  p_last_message_text TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE conversations
  SET unread_count      = COALESCE(unread_count, 0) + 1,
      last_message_text = p_last_message_text,
      last_message_at   = NOW(),
      updated_at        = NOW()
  WHERE id = p_conversation_id;
$$;

REVOKE ALL ON FUNCTION public.bump_conversation_on_inbound(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_conversation_on_inbound(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.bump_conversation_on_inbound(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bump_conversation_on_inbound(UUID, TEXT) TO service_role;
