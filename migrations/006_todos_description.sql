-- Long-form description for kanban cards. Kept separate from the short
-- `text` field so the title stays scannable in the column view.
ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS description TEXT;

GRANT ALL ON TABLE todos TO kama_app;
