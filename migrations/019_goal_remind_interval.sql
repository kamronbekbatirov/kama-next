-- Goal reminders get the same patterns free-form reminders already had.
--
-- Weekdays existed in the schema but the card only ever offered a time, so
-- "remind me every other day" had nowhere to go. The anchor is what an interval
-- counts from; without it the phase drifts with whenever the timer runs.
ALTER TABLE tracker_goals ADD COLUMN IF NOT EXISTS remind_interval SMALLINT;
ALTER TABLE tracker_goals ADD COLUMN IF NOT EXISTS remind_anchor   DATE;

ALTER TABLE tracker_goals DROP CONSTRAINT IF EXISTS tracker_goals_remind_interval_chk;
ALTER TABLE tracker_goals ADD CONSTRAINT tracker_goals_remind_interval_chk
  CHECK (remind_interval IS NULL OR remind_interval BETWEEN 2 AND 60);
