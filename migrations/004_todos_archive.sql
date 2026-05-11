-- Archive: hide tasks from the kanban board without losing them
ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_todos_archived ON todos (archived) WHERE archived = TRUE;
