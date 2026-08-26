-- Optional steps on a tracker goal.
--
-- The goal itself stays what it was: a countable target plus an if-then plan,
-- both required, because that is what makes a habit stick. Steps are the other
-- half some goals have — the milestones on the way to a destination. A goal
-- with no destination simply has none, and nothing about it changes.
--
-- member_id is denormalised the same way tracker_checkins does it, so every
-- statement can scope by the caller without joining back through the goal.
CREATE TABLE IF NOT EXISTS tracker_goal_steps (
  id         SERIAL PRIMARY KEY,
  goal_id    INTEGER NOT NULL REFERENCES tracker_goals(id) ON DELETE CASCADE,
  member_id  TEXT    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  done_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_steps_goal ON tracker_goal_steps (goal_id, position);
