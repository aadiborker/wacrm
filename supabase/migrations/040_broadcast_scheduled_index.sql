-- Speed up scheduled broadcast cron lookups.

CREATE INDEX IF NOT EXISTS idx_broadcasts_scheduled_due
  ON broadcasts (scheduled_at)
  WHERE status = 'scheduled';
