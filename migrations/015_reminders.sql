-- Free-form reminders, for the owner and for guests alike.
--
-- Scoped by member_id like everything else in the shared half of the app, so a
-- guest's reminders are theirs and nobody else's. Deliberately separate from
-- tracker_goals.remind_at: a goal reminder quotes that goal's if-then plan and
-- is skipped once the day is logged, while these are plain nudges with none of
-- that logic attached.
CREATE TABLE IF NOT EXISTS reminders (
  id            SERIAL PRIMARY KEY,
  member_id     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  remind_at     TIME NOT NULL,
  -- ISO weekdays 1..7; NULL means every day.
  days          SMALLINT[],
  -- When set, the reminder fires on that date only and then goes inactive.
  once_on       DATE,
  last_fired_on DATE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_due
  ON reminders (remind_at) WHERE active;
CREATE INDEX IF NOT EXISTS idx_reminders_member
  ON reminders (member_id) WHERE active;
