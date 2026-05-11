-- Add kanban status + per-column ordering to todos
ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'doing', 'done'));

ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

-- Backfill from legacy done flag
UPDATE todos SET status = 'done' WHERE done = TRUE AND status = 'todo';

-- Initial per-column position by created_at (newest first)
WITH ordered AS (
  SELECT id, status,
         (ROW_NUMBER() OVER (PARTITION BY status ORDER BY created_at DESC) - 1) AS rn
  FROM todos
)
UPDATE todos t SET position = ordered.rn
FROM ordered WHERE ordered.id = t.id;

CREATE INDEX IF NOT EXISTS idx_todos_status_position ON todos (status, position);
