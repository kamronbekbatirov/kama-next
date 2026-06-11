-- Optional due date + time for kanban cards. Stored as TIMESTAMPTZ so the
-- instant is unambiguous regardless of where it was set (the UI converts to
-- the viewer's local wall-clock; Claude supplies an ISO 8601 offset).
ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_todos_due_at ON todos (due_at) WHERE due_at IS NOT NULL;

GRANT ALL ON TABLE todos TO kama_app;
