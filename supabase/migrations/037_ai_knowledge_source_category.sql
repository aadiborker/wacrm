-- ============================================================
-- 037_ai_knowledge_source_category.sql
--
-- Extends the AI knowledge base documents with:
--   - category   — freeform label for grouping (FAQ, Pricing, …)
--   - source_url — optional originating website URL when imported
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS source_url text;

CREATE INDEX IF NOT EXISTS ai_knowledge_documents_account_category_idx
  ON ai_knowledge_documents (account_id, category);
