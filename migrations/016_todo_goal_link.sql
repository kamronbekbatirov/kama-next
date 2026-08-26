-- A task can name the tracker goal that feeds it.
--
-- Not subtasks: a habit ("50 push-ups a day") has no steps to tick off, and a
-- project measured as "5 days out of 7" is a meaningless number. They are two
-- different shapes and both get worse if merged. What was actually missing is
-- the link between them — the project gets evidence that it is moving, and the
-- habit gets the reason it exists.
--
-- ON DELETE SET NULL: archiving or removing a goal must never take a task with
-- it.
ALTER TABLE todos ADD COLUMN IF NOT EXISTS tracker_goal_id INTEGER
  REFERENCES tracker_goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_todos_goal
  ON todos (tracker_goal_id) WHERE tracker_goal_id IS NOT NULL;
