-- Weekly steps, and richer reminder patterns.
--
-- A goal can be long ("English to B1") while what you commit to changes every
-- week. Steps therefore carry the week they were set in: this week's are the
-- ones you are working on, earlier weeks drop out of the way but stay
-- readable — and deletable — rather than vanishing.
--
-- NULL week_start means a permanent milestone that always shows, which is what
-- every step created before this migration was.
ALTER TABLE tracker_goal_steps ADD COLUMN IF NOT EXISTS week_start DATE;

CREATE INDEX IF NOT EXISTS idx_goal_steps_week
  ON tracker_goal_steps (goal_id, week_start);

-- "Every other day", "every third day". The anchor is what the interval counts
-- from; without it an interval has no phase and would drift with the query.
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS interval_days SMALLINT;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS anchor_on     DATE;

ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_interval_chk;
ALTER TABLE reminders ADD CONSTRAINT reminders_interval_chk
  CHECK (interval_days IS NULL OR interval_days BETWEEN 2 AND 60);
