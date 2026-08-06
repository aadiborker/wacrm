-- Track how a contact was created so admins can see who/what added them.
-- user_id remains the audit actor (human who clicked, or account owner for
-- system paths like inbound WhatsApp / public API).

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS created_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contacts_created_source_check'
      AND conrelid = 'contacts'::regclass
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_created_source_check
      CHECK (
        created_source IS NULL
        OR created_source IN (
          'manual',
          'import',
          'whatsapp',
          'api',
          'broadcast'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN contacts.created_source IS
  'How the contact was created: manual, import, whatsapp, api, broadcast. NULL = legacy/unknown.';
