-- Per-note locking. A locked note's content is gated server-side behind a
-- 4-digit PIN (hash stored in `settings` under key 'note_pin'); the list still
-- shows its title but never sends the body until the PIN is verified.
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;

GRANT ALL ON TABLE notes TO kama_app;
